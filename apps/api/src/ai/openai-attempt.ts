/**
 * Shared OpenAI chat attempt results for Trace Analyst / risk narratives.
 * Reasons are PM-safe (no secrets, no raw stack traces).
 */

export type OpenAiAttemptResult =
  | { status: 'ok'; text: string }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; reason: string };

export function openAiNotConfiguredReason(): string {
  return 'OpenAI is not configured on the API, so Foretrace used the built-in signal template.';
}

export function classifyOpenAiHttpFailure(
  status: number,
  bodySnippet: string,
): string {
  const lower = bodySnippet.toLowerCase();
  if (status === 401 || status === 403) {
    return 'OpenAI rejected the API key. Check OPENAI_API_KEY on the API host, then retry.';
  }
  if (status === 429 || lower.includes('insufficient_quota')) {
    return 'OpenAI billing or quota blocked the request. Add credit in the OpenAI account, then retry.';
  }
  if (status === 404 || lower.includes('model')) {
    return 'OpenAI could not use the configured model. Check OPENAI_RISK_MODEL / OPENAI_IMPACT_MODEL, then retry.';
  }
  if (
    lower.includes('max_tokens') ||
    lower.includes('max_completion_tokens') ||
    lower.includes('unsupported_parameter')
  ) {
    return 'OpenAI rejected the request format for this model. Update the API and retry.';
  }
  return `OpenAI request failed (HTTP ${status}). Showing the built-in signal template instead.`;
}

export function classifyOpenAiThrownError(err: unknown): string {
  if (err instanceof Error && err.name === 'AbortError') {
    return 'OpenAI timed out. Try Trace Analyst again in a moment.';
  }
  return 'OpenAI call failed unexpectedly. Showing the built-in signal template instead.';
}
