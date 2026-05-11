import { TerminalIncidentCategory } from '@prisma/client';

/** Map noisy log line to coarse category (best-effort). */
export function classifyTerminalLine(line: string): TerminalIncidentCategory {
  const s = line.toLowerCase();
  if (
    /\b(tsc|typescript|webpack|vite|esbuild|rustc|cmake|msbuild)\b/.test(s) ||
    /\berror ts\d{4}\b/.test(s) ||
    /\[\s*error\s*\]/.test(s)
  ) {
    return TerminalIncidentCategory.BUILD;
  }
  if (
    /\b(jest|vitest|mocha|cypress|playwright|pytest|running tests)\b/.test(s) ||
    /\btests failed\b/.test(s)
  ) {
    return TerminalIncidentCategory.TEST;
  }
  if (
    /\b(podman|docker\s+(build|compose))\b/.test(s) ||
    /cannot pull image/.test(s)
  ) {
    return TerminalIncidentCategory.DOCKER;
  }
  if (/\b(prisma|postgres|sequelize|typeorm|mongodb)\b/.test(s)) {
    return TerminalIncidentCategory.DB;
  }
  if (/econnrefused|fetch failed|axioserror|502 bad gateway|504 gateway/.test(s)) {
    return TerminalIncidentCategory.API;
  }
  if (/npm err|pnpm err|yarn error|unmet peer|peer dep/.test(s)) {
    return TerminalIncidentCategory.DEPENDENCY;
  }
  if (
    /\b(uncaughtexception|unhandledrejection|fatal|panic)\b/.test(s) ||
    /node:internal\/errors/.test(s)
  ) {
    return TerminalIncidentCategory.RUNTIME;
  }
  return TerminalIncidentCategory.UNKNOWN;
}

/** Whether a line is worth turning into a TerminalIncident fingerprint. */
export function isLikelySignalLine(line: string): boolean {
  if (line.trim().length < 6) {
    return false;
  }
  return /\b(error|fail|fatal|exception|panic|warn|cannot|missing|denied)\b|^err:/im.test(
    line,
  );
}

export function normalizeForFingerprint(line: string): string {
  return line.trim().replace(/\s+/g, ' ').slice(0, 640);
}
