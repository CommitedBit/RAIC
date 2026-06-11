import { NextRequest } from 'next/server';
import { generateText } from 'ai';
import { getRequestAuth } from '@/lib/auth/current-user';
import type { AuthContext } from '@/lib/auth/current-user';
import { createLogger } from '@/lib/logger';
import {
  apiErrorWithRequestSession,
  apiSuccessWithRequestSession,
  withRequestWebSession,
} from '@/lib/server/api-response';
import { toGovernedProviderApiErrorResponse } from '@/lib/server/ai-governance';
import { remapModelVerificationError } from '@/lib/server/model-verification-errors';
import { resolveVerificationModelScenario } from '@/lib/server/provider-scenario-routing';
import { recordRequestFailureTelemetry } from '@/lib/server/request-failure-telemetry';
import { resolveModel } from '@/lib/server/resolve-model';
const log = createLogger('Verify Model');

export async function POST(req: NextRequest) {
  let auth: AuthContext | null = null;
  let model: string | undefined;
  let testedModel: string | undefined;
  let requestedBaseUrl: string | undefined;
  try {
    const body = await req.json();
    const { apiKey, baseUrl, providerType } = body;
    model = body.model;
    testedModel = model;
    requestedBaseUrl = baseUrl || undefined;
    auth = await getRequestAuth(req);
    const usesLegacyLocalConfig = Boolean(apiKey || baseUrl);

    if (!model) {
      return apiErrorWithRequestSession(
        req,
        'MISSING_REQUIRED_FIELD',
        400,
        'Model name is required',
      );
    }

    // Parse model string and resolve server-side fallback
    let languageModel;
    try {
      const result =
        (await resolveVerificationModelScenario({
          auth,
          routeId: 'verify-model',
          taskBucket: 'scene',
          requestedModelString: model,
          apiKey: apiKey || '',
          baseUrl: baseUrl || undefined,
          providerType,
          strictUnmatchedCandidate: !usesLegacyLocalConfig,
        })) ||
        (await resolveModel({
          modelString: model,
          apiKey: apiKey || '',
          baseUrl: baseUrl || undefined,
          providerType,
          auth,
        }));
      languageModel = result.model;
      testedModel = result.modelString;
    } catch (error) {
      const remappedError = remapModelVerificationError({
        modelString: testedModel || model,
        baseUrl: requestedBaseUrl,
        requestHostname: req.nextUrl.hostname,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      return await (async () => {
        const governanceError = toGovernedProviderApiErrorResponse(error);
        if (governanceError) {
          await recordRequestFailureTelemetry({
            auth,
            request: req,
            routeId: 'verify-model',
            status: governanceError.status,
            errorCode: 'GOVERNED_PROVIDER_ERROR',
            failureSource: 'provider_governance',
            error,
            modelId: testedModel || model,
            taskBucket: 'scene',
          });
          return withRequestWebSession(req, governanceError);
        }

        await recordRequestFailureTelemetry({
          auth,
          request: req,
          routeId: 'verify-model',
          status: 401,
          errorCode: 'INVALID_REQUEST',
          failureSource: 'model_resolution',
          error,
          modelId: testedModel || model,
          taskBucket: 'scene',
        });
        return apiErrorWithRequestSession(
          req,
          'INVALID_REQUEST',
          401,
          remappedError || (error instanceof Error ? error.message : String(error)),
        );
      })();
    }

    // Send a minimal test message
    const { text } = await generateText({
      model: languageModel,
      prompt: 'Say "OK" if you can hear me.',
    });

    return apiSuccessWithRequestSession(req, {
      message: 'Connection successful',
      response: text,
    });
  } catch (error) {
    log.error(`Model verification failed [model="${model ?? 'unknown'}"]:`, error);

    let errorMessage = 'Connection failed';
    const resolvedModel = testedModel || model || 'unknown';
    if (error instanceof Error) {
      const remappedError = remapModelVerificationError({
        modelString: resolvedModel,
        baseUrl: requestedBaseUrl,
        requestHostname: req.nextUrl.hostname,
        errorMessage: error.message,
      });

      if (remappedError) {
        errorMessage = remappedError;
      } else {
        // Parse common error messages
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          errorMessage = `API key is invalid or expired for model "${resolvedModel}"`;
        } else if (
          error.message.includes('403') ||
          error.message.toLowerCase().includes('permission') ||
          error.message.toLowerCase().includes('access denied') ||
          error.message.toLowerCase().includes('forbidden')
        ) {
          errorMessage = `Your API key does not have access to model "${resolvedModel}"`;
        } else if (error.message.includes('404') || error.message.includes('not found')) {
          errorMessage = `Model "${resolvedModel}" was not found or the API endpoint rejected it`;
        } else if (error.message.includes('429')) {
          errorMessage = 'API rate limit exceeded, please try again later';
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          errorMessage = 'Cannot connect to API server, please check the Base URL';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Connection timed out, please check your network';
        } else {
          errorMessage = `Connection failed for model "${resolvedModel}": ${error.message}`;
        }
      }
    }

    await recordRequestFailureTelemetry({
      auth,
      request: req,
      routeId: 'verify-model',
      status: 500,
      errorCode: 'INTERNAL_ERROR',
      failureSource: 'provider_request',
      error,
      modelId: testedModel || model || 'unknown',
      taskBucket: 'scene',
    });
    return apiErrorWithRequestSession(req, 'INTERNAL_ERROR', 500, errorMessage);
  }
}
