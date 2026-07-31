/**
 * Tauri rejects failed `invoke` calls with a string, while browser APIs and
 * application code commonly reject with Error objects. Normalize both forms
 * before displaying an error so native failures are not hidden by a generic
 * fallback message.
 */
export function getErrorMessage(error: unknown, fallback: string, maxLength = 280): string {
  let message: string | null = null;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else if (typeof error === "object" && error !== null && "message" in error) {
    const candidate = error.message;
    if (typeof candidate === "string") {
      message = candidate;
    }
  }

  const normalized = message?.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}
