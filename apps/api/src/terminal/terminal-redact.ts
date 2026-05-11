/** Strip obvious secret-like substrings before persistence (best-effort). */

const PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._+\-/]+=*\b/gi,
  /(?:api[_-]?key|apikey|secret|token|password)\s*[=:]\s*\S+/gi,
  /\bsk-[a-zA-Z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]+\b/g,
];

export function redactTerminalLine(line: string): string {
  let out = line;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  return out.slice(0, 8000);
}
