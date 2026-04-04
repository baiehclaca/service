/**
 * Custom error class for SERVICE domain errors.
 * Provides user-friendly messages while preserving stack traces.
 */
export class ServiceError extends Error {
  public readonly code: string;
  public readonly details?: string;

  constructor(message: string, code: string, details?: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Format an error for user-facing output.
 * Never exposes raw stack traces.
 */
export function formatError(error: unknown): string {
  if (error instanceof ServiceError) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
