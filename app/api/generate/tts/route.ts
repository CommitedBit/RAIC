/**
 * Single TTS Generation API
 *
 * Generates TTS audio for a single text string and returns base64-encoded audio.
 * Called by the client in parallel for each speech action after a scene is generated.
 *
 * POST /api/generate/tts
 */

import { NextRequest } from 'next/server';
import { generateTTS } from '@/lib/audio/tts-providers';
import { TTS_PROVIDERS } from '@/lib/audio/constants';
import { getRequestAuth } from '@/lib/auth/current-user';
import type { AuthContext } from '@/lib/auth/current-user';
import type { TTSProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import {
  apiErrorWithRequestSession,
  apiSuccessWithRequestSession,
  withRequestWebSession,
} from '@/lib/server/api-response';
import {
  resolveGovernedProviderConfig,
  toGovernedProviderApiErrorResponse,
} from '@/lib/server/ai-governance';
import {
  resolveScenarioManagedProviderRoute,
  type ScenarioProviderCandidateValidationContext,
} from '@/lib/server/provider-scenario-routing';
import { recordRequestFailureTelemetry } from '@/lib/server/request-failure-telemetry';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

const log = createLogger('TTS API');

export const maxDuration = 30;

function createTtsScenarioValidator(ttsVoice: string) {
  return function validateTtsScenarioCandidate({
    provider,
    resolved,
    selectedModelId,
  }: ScenarioProviderCandidateValidationContext): string | null {
    const providerConfig = TTS_PROVIDERS[provider.providerId as keyof typeof TTS_PROVIDERS];
    const voice = providerConfig?.voices.find((candidateVoice) => candidateVoice.id === ttsVoice);
    if (!voice) {
      return `voice "${ttsVoice}" is not available for provider "${provider.providerId}"`;
    }

    if (
      voice.compatibleModels?.length &&
      (!selectedModelId || !voice.compatibleModels.includes(selectedModelId))
    ) {
      return `voice "${ttsVoice}" is not compatible with model "${selectedModelId ?? 'default'}"`;
    }

    if (provider.providerId === 'doubao-tts' && !/^[^:]+:[^:]+$/.test(resolved.apiKey)) {
      return 'Doubao TTS requires API key in format "appId:accessKey"';
    }

    if (
      provider.providerId === 'azure-tts' &&
      (!resolved.baseUrl || resolved.baseUrl.includes('{region}'))
    ) {
      return 'Azure TTS requires a resolved regional base URL';
    }

    return null;
  };
}

export async function POST(req: NextRequest) {
  let auth: AuthContext | null = null;
  let ttsProviderId: string | undefined;
  let ttsModelId: string | undefined;
  let ttsVoice: string | undefined;
  let audioId: string | undefined;
  let scenarioProfileId: string | null = null;
  try {
    const body = await req.json();
    const {
      text,
      ttsModelId: requestedTtsModelId,
      ttsSpeed,
      ttsApiKey,
      ttsBaseUrl,
    } = body as {
      text: string;
      audioId: string;
      ttsProviderId: TTSProviderId;
      ttsModelId?: string;
      ttsVoice: string;
      ttsSpeed?: number;
      ttsApiKey?: string;
      ttsBaseUrl?: string;
    };
    ttsProviderId = body.ttsProviderId;
    ttsModelId = requestedTtsModelId;
    ttsVoice = body.ttsVoice;
    audioId = body.audioId;

    // Validate required fields
    if (!text || !audioId || !ttsProviderId || !ttsVoice) {
      return apiErrorWithRequestSession(
        req,
        'MISSING_REQUIRED_FIELD',
        400,
        'Missing required fields: text, audioId, ttsProviderId, ttsVoice',
      );
    }

    // Reject browser-native TTS — must be handled client-side
    if (ttsProviderId === 'browser-native-tts') {
      return apiErrorWithRequestSession(
        req,
        'INVALID_REQUEST',
        400,
        'browser-native-tts must be handled client-side',
      );
    }

    const clientBaseUrl = ttsBaseUrl || undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiErrorWithRequestSession(req, 'INVALID_URL', 403, ssrfError);
      }
    }

    auth = await getRequestAuth(req);
    const resolved =
      (await resolveScenarioManagedProviderRoute({
        auth,
        routeId: 'generate-tts',
        taskBucket: 'tts',
        family: 'tts',
        requestedProviderId: ttsProviderId,
        requestedModelId: requestedTtsModelId || undefined,
        requestedSecret: ttsApiKey || undefined,
        requestedBaseUrl: clientBaseUrl,
        validateResolvedCandidate: createTtsScenarioValidator(ttsVoice),
      })) ||
      (await resolveGovernedProviderConfig({
        auth,
        family: 'tts',
        providerId: ttsProviderId,
        requestedSecret: ttsApiKey || undefined,
        requestedBaseUrl: clientBaseUrl,
        requestedModel: requestedTtsModelId || undefined,
      }));

    ttsProviderId = resolved.providerId;
    ttsModelId = resolved.modelId || requestedTtsModelId;
    scenarioProfileId = 'scenarioProfileId' in resolved ? resolved.scenarioProfileId : null;

    // Build TTS config
    const config = {
      providerId: resolved.providerId as TTSProviderId,
      modelId: resolved.modelId || requestedTtsModelId,
      voice: ttsVoice,
      speed: ttsSpeed ?? 1.0,
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
    };

    log.info(
      `Generating TTS: provider=${ttsProviderId}, model=${ttsModelId || 'default'}, voice=${ttsVoice}, audioId=${audioId}, textLen=${text.length}`,
    );

    // Generate audio
    const { audio, format } = await generateTTS(config, text);

    // Convert to base64
    const base64 = Buffer.from(audio).toString('base64');

    return apiSuccessWithRequestSession(req, { audioId, base64, format });
  } catch (error) {
    const governanceError = toGovernedProviderApiErrorResponse(error);
    if (governanceError) {
      await recordRequestFailureTelemetry({
        auth,
        request: req,
        routeId: 'generate-tts',
        status: governanceError.status,
        errorCode: 'GOVERNED_PROVIDER_ERROR',
        failureSource: 'provider_governance',
        error,
        providerId: ttsProviderId,
        modelId: ttsModelId,
        taskBucket: 'tts',
        scenarioProfileId,
      });
      return withRequestWebSession(req, governanceError);
    }

    log.error(
      `TTS generation failed [provider=${ttsProviderId ?? 'unknown'}, voice=${ttsVoice ?? 'unknown'}, audioId=${audioId ?? 'unknown'}]:`,
      error,
    );
    await recordRequestFailureTelemetry({
      auth,
      request: req,
      routeId: 'generate-tts',
      status: 500,
      errorCode: 'GENERATION_FAILED',
      failureSource: 'provider_request',
      error,
      providerId: ttsProviderId ?? 'unknown',
      modelId: ttsModelId ?? 'default',
      taskBucket: 'tts',
      scenarioProfileId,
    });
    return apiErrorWithRequestSession(
      req,
      'GENERATION_FAILED',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
