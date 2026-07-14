/**
 * Scene Actions Generation API
 *
 * Generates actions for a scene given its outline and content,
 * then assembles the complete Scene object.
 * This is the second half of the two-step scene generation pipeline.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  generateSceneActions,
  buildCompleteScene,
  buildVisionUserContent,
  type SceneGenerationContext,
  type AgentInfo,
} from '@/lib/generation/generation-pipeline';
import {
  withGenerationRetry,
  type GenerationRetryCategory,
} from '@/lib/generation/generation-retry';
import type { SceneOutline } from '@/lib/types/generation';
import type {
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
} from '@/lib/types/generation';
import type { SpeechAction } from '@/lib/types/action';
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

const log = createLogger('Scene Actions API');

export const maxDuration = 60;
const MAX_RETRIES = 1;
const MAX_ATTEMPTS = MAX_RETRIES + 1;
const MAX_RETRY_DELAY_MS = 2000;

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
  let retryLabel = 'scene-actions';
  let generationAttempt = 0;
  try {
    const body = await req.json();
    const {
      outline,
      allOutlines,
      content,
      stageId,
      agents,
      previousSpeeches: incomingPreviousSpeeches,
      userProfile,
      languageDirective,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      content:
        | GeneratedSlideContent
        | GeneratedQuizContent
        | GeneratedInteractiveContent
        | GeneratedPBLContent;
      stageId: string;
      classroomId?: string;
      agents?: AgentInfo[];
      previousSpeeches?: string[];
      userProfile?: string;
      languageDirective?: string;
    };

    // Validate required fields
    if (!outline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!content) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'content is required');
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    const adaptivePrompt = await loadTeacherAdaptivePrompt({
      classroomId: body.classroomId,
      request: req,
      onError: (error) =>
        log.warn(`Adaptive scene-actions context unavailable for ${body.classroomId}:`, error),
    });

    // ── Model resolution from scene scenario profile, falling back to request headers ──
    auth = await getRequestAuth(req);
    const scenarioResolvedModel = await resolveSceneGenerationScenario({
      auth,
      routeId: 'scene-actions',
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
    outlineTitle = outline?.title;
    resolvedModelString = modelString;

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // AI call function (actions typically don't use vision, but kept for consistency)
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
          'scene-actions',
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
        'scene-actions',
      );
      return result.text;
    };

    // ── Build cross-scene context ──
    const allTitles = allOutlines.map((o) => o.title);
    const pageIndex = allOutlines.findIndex((o) => o.id === outline.id);
    const ctx: SceneGenerationContext = {
      pageIndex: (pageIndex >= 0 ? pageIndex : 0) + 1,
      totalPages: allOutlines.length,
      allTitles,
      previousSpeeches: incomingPreviousSpeeches ?? [],
    };

    // ── Generate actions ──
    log.info(`Generating actions: "${outline.title}" (${outline.type}) [model=${modelString}]`);

    retryLabel = `scene-actions:${outline.type}`;
    const actions = await withGenerationRetry(
      (attempt) => {
        generationAttempt = attempt;
        return generateSceneActions(outline, content, aiCall, {
          ctx,
          agents,
          userProfile,
          languageDirective,
        });
      },
      {
        label: retryLabel,
        maxRetries: MAX_RETRIES,
        baseDelayMs: configuredRetryBaseDelayMs(),
        maxDelayMs: MAX_RETRY_DELAY_MS,
        signal: req.signal,
        onRetry: async ({ attempt, maxAttempts, nextDelayMs, category }) => {
          retryCategory = category;
          await recordGenerationRetryTelemetry({
            auth,
            request: req,
            routeId: 'scene-actions',
            label: retryLabel,
            category,
            attempt,
            maxAttempts,
            nextDelayMs,
            outcome: 'scheduled',
            modelId: modelString,
          });
          log.warn(
            `Retrying scene action generation for "${outline.title}" (${attempt}/${maxAttempts}) in ${nextDelayMs}ms [category=${category}]`,
          );
        },
      },
    );

    if (retryCategory) {
      await recordGenerationRetryTelemetry({
        auth,
        request: req,
        routeId: 'scene-actions',
        label: retryLabel,
        category: retryCategory,
        attempt: generationAttempt,
        maxAttempts: MAX_ATTEMPTS,
        outcome: 'recovered',
        modelId: modelString,
      });
    }
    log.info(`Generated ${actions.length} actions for: "${outline.title}"`);

    // ── Build complete scene ──
    const scene = buildCompleteScene(outline, content, actions, stageId);

    if (!scene) {
      log.error(`Failed to build scene: "${outline.title}"`);
      await recordRequestFailureTelemetry({
        auth,
        request: req,
        routeId: 'scene-actions',
        status: 500,
        errorCode: 'GENERATION_FAILED',
        failureSource: 'scene_assembly',
        modelId: modelString,
        taskBucket: 'scene',
      });

      return apiError('GENERATION_FAILED', 500, `Failed to build scene: ${outline.title}`);
    }

    // ── Extract speeches for cross-scene coherence ──
    const outputPreviousSpeeches = (scene.actions || [])
      .filter((a): a is SpeechAction => a.type === 'speech')
      .map((a) => a.text);

    log.info(
      `Scene assembled successfully: "${outline.title}" — ${scene.actions?.length ?? 0} actions`,
    );

    return apiSuccess({ scene, previousSpeeches: outputPreviousSpeeches });
  } catch (error) {
    if (retryCategory) {
      await recordGenerationRetryTelemetry({
        auth,
        request: req,
        routeId: 'scene-actions',
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
        routeId: 'scene-actions',
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
      `Scene actions generation failed [scene="${outlineTitle ?? 'unknown'}", model=${resolvedModelString ?? 'unknown'}]`,
      {
        errorName: error instanceof Error ? error.name : typeof error,
        retryCategory,
      },
    );
    await recordRequestFailureTelemetry({
      auth,
      request: req,
      routeId: 'scene-actions',
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
