import { beforeEach, describe, expect, it, vi } from 'vitest';

const getModelMock = vi.fn();
const resolveLLMGovernedConfigMock = vi.fn();
const validateUrlForSSRFMock = vi.fn();

vi.mock('@/lib/ai/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/providers')>();
  return {
    ...actual,
    getModel: getModelMock,
  };
});

vi.mock('@/lib/server/ai-governance', () => ({
  resolveLLMGovernedConfig: resolveLLMGovernedConfigMock,
}));

vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: validateUrlForSSRFMock,
}));

describe('resolveModel', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    getModelMock.mockReset();
    resolveLLMGovernedConfigMock.mockReset();
    validateUrlForSSRFMock.mockReset();

    getModelMock.mockReturnValue({
      model: 'resolved-model',
      modelInfo: null,
    });

    resolveLLMGovernedConfigMock.mockImplementation(async (params) => ({
      providerId: params.providerId,
      modelId: params.modelId,
      apiKey: 'sk-server',
      baseUrl: undefined,
      proxy: undefined,
      providerType: 'openai',
    }));
    validateUrlForSSRFMock.mockResolvedValue(null);
  });

  it('falls back to gpt-5.4-mini when no explicit model is provided', async () => {
    const { resolveModel } = await import('@/lib/server/resolve-model');
    const result = await resolveModel({});

    expect(resolveLLMGovernedConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'openai',
        modelId: 'gpt-5.4-mini',
      }),
    );
    expect(result.modelString).toBe('openai:gpt-5.4-mini');
  });

  it('prefers DEFAULT_MODEL over the built-in OpenAI fallback', async () => {
    vi.stubEnv('DEFAULT_MODEL', 'openai:gpt-4.1-mini');

    const { resolveModel } = await import('@/lib/server/resolve-model');
    const result = await resolveModel({});

    expect(resolveLLMGovernedConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'openai',
        modelId: 'gpt-4.1-mini',
      }),
    );
    expect(result.modelString).toBe('openai:gpt-4.1-mini');
  });

  it('rejects unsafe request-supplied provider base URLs in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    validateUrlForSSRFMock.mockResolvedValue(
      'Local/private network URLs are not allowed. Set ALLOW_LOCAL_NETWORKS=true only for trusted self-hosted deployments.',
    );

    const { resolveModel } = await import('@/lib/server/resolve-model');

    await expect(
      resolveModel({
        modelString: 'openai:gpt-4.1-mini',
        baseUrl: 'http://127.0.0.1:11434/v1?token=secret#fragment',
      }),
    ).rejects.toThrow('Local/private network URLs are not allowed');

    expect(validateUrlForSSRFMock).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/v1?token=secret#fragment',
    );
    expect(resolveLLMGovernedConfigMock).not.toHaveBeenCalled();
  });

  it('forwards validated request-supplied provider base URLs in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { resolveModel } = await import('@/lib/server/resolve-model');
    await resolveModel({
      modelString: 'openai:gpt-4.1-mini',
      baseUrl: 'https://provider.example.com/v1',
    });

    expect(validateUrlForSSRFMock).toHaveBeenCalledWith('https://provider.example.com/v1');
    expect(resolveLLMGovernedConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBaseUrl: 'https://provider.example.com/v1',
      }),
    );
  });
});
