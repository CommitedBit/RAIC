/**
 * Scene Content Generation API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * This is the first half of the two-step scene generation pipeline.
 * Does NOT generate actions — use /api/generate/scene-actions for that.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent,
  buildVisionUserContent,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import {
  withGenerationRetry,
  type GenerationRetryCategory,
} from '@/lib/generation/generation-retry';
import type { SceneOutline, PdfImage, ImageMapping } from '@/lib/types/generation';
import type { ProviderType } from '@/lib/types/provider';
import { getRequestAuth, type AuthContext } from '@/lib/auth/current-user';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { loadTeacherAdaptivePrompt } from '@/lib/server/adaptive-runtime-prompt';
import { toGovernedProviderApiErrorResponse } from '@/lib/server/ai-governance';
import { resolveSceneGenerationScenario } from '@/lib/server/provider-scenario-routing';
import {
  recordGenerationRetryTelemetry,
  recordRequestFailureTelemetry,
} from '@/lib/server/request-failure-telemetry';
import { resolveModelFromHeadersWithScope } from '@/lib/server/resolve-model';

const log = createLogger('Scene Content API');

export const maxDuration = 300;
const MAX_RETRIES = 2;
const MAX_ATTEMPTS = MAX_RETRIES + 1;
const MAX_RETRY_DELAY_MS = 4000;

function configuredRetryBaseDelayMs(): number | undefined {
  const raw = process.env.GENERATION_RETRY_BASE_DELAY_MS;
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function POST(req: NextRequest) {
  let auth: AuthContext | null = null;
  let outlineTitle: string | undefined;
  let resolvedModelString: string | undefined;
  let retryCategory: GenerationRetryCategory | null = null;
  let retryLabel = 'scene-content';
  let generationAttempt = 0;
  try {
    const body = await req.json();
    const {
      outline: rawOutline,
      allOutlines,
      pdfImages,
      imageMapping,
      stageInfo,
      stageId,
      agents,
      languageDirective,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo: {
        name: string;
        description?: string;
        language?: string;
        languageDirective?: string;
        style?: string;
      };
      stageId: string;
      classroomId?: string;
      agents?: AgentInfo[];
      languageDirective?: string;
    };

    // Validate required fields
    if (!rawOutline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    const adaptivePrompt = await loadTeacherAdaptivePrompt({
      classroomId: body.classroomId,
      request: req,
      onError: (error) =>
        log.warn(`Adaptive scene-content context unavailable for ${body.classroomId}:`, error),
    });

    // Ensure outline has language from stageInfo (fallback for older outlines)
    const outline: SceneOutline = {
      ...rawOutline,
      language: rawOutline.language || (stageInfo?.language as 'zh-CN' | 'en-US') || 'zh-CN',
    };

    // ── Model resolution from scene scenario profile, falling back to request headers ──
    auth = await getRequestAuth(req);
    const scenarioResolvedModel = await resolveSceneGenerationScenario({
      auth,
      routeId: 'scene-content',
      requestedModelString: req.headers.get('x-model') || undefined,
      apiKey: req.headers.get('x-api-key') || undefined,
      baseUrl: req.headers.get('x-base-url') || undefined,
      providerType: (req.headers.get('x-provider-type') || undefined) as ProviderType | undefined,
    });
    const {
      model: languageModel,
      modelInfo,
      modelString,
    } = scenarioResolvedModel ?? (await resolveModelFromHeadersWithScope(req, { auth }));
    outlineTitle = rawOutline?.title;
    resolvedModelString = modelString;

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Vision-aware AI call function
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      const effectiveSystemPrompt = adaptivePrompt
        ? `${systemPrompt}\n\n${adaptivePrompt}`
        : systemPrompt;
      if (images?.length && hasVision) {
        const result = await callLLM(
          {
            model: languageModel,
            system: effectiveSystemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
            maxOutputTokens: modelInfo?.outputWindow,
          },
          'scene-content',
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: effectiveSystemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'scene-content',
      );
      return result.text;
    };

    // ── Apply fallbacks ──
    const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel);

    // ── Filter images assigned to this outline ──
    let assignedImages: PdfImage[] | undefined;
    if (
      pdfImages &&
      pdfImages.length > 0 &&
      effectiveOutline.suggestedImageIds &&
      effectiveOutline.suggestedImageIds.length > 0
    ) {
      const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
      assignedImages = pdfImages.filter((img) => suggestedIds.has(img.id));
    }

    // ── Media generation is handled client-side in parallel (media-orchestrator.ts) ──
    // The content generator receives placeholder IDs (gen_img_1, gen_vid_1) as-is.
    // resolveImageIds() in generation-pipeline.ts will keep these placeholders in elements.
    const generatedMediaMapping: ImageMapping = {};

    // ── Generate content ──
    log.info(
      `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
    );

    retryLabel = `scene-content:${effectiveOutline.type}`;
    const content = await withGenerationRetry(
      (attempt) => {
        generationAttempt = attempt;
        return generateSceneContent(effectiveOutline, aiCall, {
          assignedImages,
          imageMapping,
          languageModel: effectiveOutline.type === 'pbl' ? languageModel : undefined,
          visionEnabled: hasVision,
          generatedMediaMapping,
          agents,
          adaptivePrompt,
          languageDirective: languageDirective || stageInfo?.languageDirective,
        });
      },
      {
        label: retryLabel,
        maxRetries: MAX_RETRIES,
        baseDelayMs: configuredRetryBaseDelayMs(),
        maxDelayMs: MAX_RETRY_DELAY_MS,
        signal: req.signal,
        shouldRetryResult: (nextContent) => !nextContent,
        onRetry: async ({ attempt, maxAttempts, nextDelayMs, category }) => {
          retryCategory = category;
          await recordGenerationRetryTelemetry({
            auth,
            request: req,
            routeId: 'scene-content',
            label: retryLabel,
            category,
            attempt,
            maxAttempts,
            nextDelayMs,
            outcome: 'scheduled',
            modelId: modelString,
          });
          log.warn(
            `Retrying scene content generation for "${effectiveOutline.title}" (${attempt}/${maxAttempts}) in ${nextDelayMs}ms [category=${category}]`,
          );
        },
      },
    );

    if (!content) {
      log.error(`Failed to generate content for: "${effectiveOutline.title}"`);
      if (retryCategory) {
        await recordGenerationRetryTelemetry({
          auth,
          request: req,
          routeId: 'scene-content',
          label: retryLabel,
          category: retryCategory,
          attempt: generationAttempt,
          maxAttempts: MAX_ATTEMPTS,
          outcome: 'failed',
          modelId: modelString,
        });
      }
      await recordRequestFailureTelemetry({
        auth,
        request: req,
        routeId: 'scene-content',
        status: 500,
        errorCode: 'GENERATION_FAILED',
        failureSource: 'empty_result',
        modelId: modelString,
        taskBucket: 'scene',
      });

      return apiError(
        'GENERATION_FAILED',
        500,
        `Failed to generate content: ${effectiveOutline.title}`,
      );
    }

    if (retryCategory) {
      await recordGenerationRetryTelemetry({
        auth,
        request: req,
        routeId: 'scene-content',
        label: retryLabel,
        category: retryCategory,
        attempt: generationAttempt,
        maxAttempts: MAX_ATTEMPTS,
        outcome: 'recovered',
        modelId: modelString,
      });
    }
    log.info(`Content generated successfully: "${effectiveOutline.title}"`);

    return apiSuccess({ content, effectiveOutline });
  } catch (error) {
    if (retryCategory) {
      await recordGenerationRetryTelemetry({
        auth,
        request: req,
        routeId: 'scene-content',
        label: retryLabel,
        category: retryCategory,
        attempt: generationAttempt,
        maxAttempts: MAX_ATTEMPTS,
        outcome: 'failed',
        modelId: resolvedModelString,
      });
    }
    const governanceError = toGovernedProviderApiErrorResponse(error);
    if (governanceError) {
      await recordRequestFailureTelemetry({
        auth,
        request: req,
        routeId: 'scene-content',
        status: governanceError.status,
        errorCode: 'GOVERNED_PROVIDER_ERROR',
        failureSource: 'provider_governance',
        error,
        modelId: resolvedModelString,
        taskBucket: 'scene',
      });
      return governanceError;
    }

    log.error(
      `Scene content generation failed [scene="${outlineTitle ?? 'unknown'}", model=${resolvedModelString ?? 'unknown'}]`,
      {
        errorName: error instanceof Error ? error.name : typeof error,
        retryCategory,
      },
    );
    await recordRequestFailureTelemetry({
      auth,
      request: req,
      routeId: 'scene-content',
      status: 500,
      errorCode: 'INTERNAL_ERROR',
      failureSource: retryCategory ? 'retry_exhausted' : 'generation',
      error,
      modelId: resolvedModelString,
      taskBucket: 'scene',
    });
    return apiError('INTERNAL_ERROR', 500, error instanceof Error ? error.message : String(error));
  }
}
