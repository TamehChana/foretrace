import {
  classifyOpenAiHttpFailure,
  classifyOpenAiThrownError,
  openAiNotConfiguredReason,
} from './openai-attempt';

describe('openai-attempt', () => {
  it('explains missing configuration', () => {
    expect(openAiNotConfiguredReason()).toMatch(/not configured/i);
  });

  it('maps quota and auth failures for PMs', () => {
    expect(classifyOpenAiHttpFailure(429, 'insufficient_quota')).toMatch(
      /billing or quota/i,
    );
    expect(classifyOpenAiHttpFailure(401, 'invalid_api_key')).toMatch(/API key/i);
  });

  it('maps model / parameter failures', () => {
    expect(
      classifyOpenAiHttpFailure(
        400,
        "Unsupported parameter: 'max_tokens' is not supported",
      ),
    ).toMatch(/request format|model/i);
  });

  it('maps abort timeouts', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(classifyOpenAiThrownError(err)).toMatch(/timed out/i);
  });
});
