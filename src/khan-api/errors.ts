export type KhanApiErrorReason = "network" | "timeout" | "http" | "rate_limited";

/**
 * Transport-level failure talking to Khan Academy (or YouTube).
 * Client methods throw this when the service could not be reached or answered
 * with a server error — as opposed to returning null, which means the service
 * responded but the requested content does not exist.
 */
export class KhanApiError extends Error {
  readonly reason: KhanApiErrorReason;
  readonly status?: number;

  constructor(
    message: string,
    reason: KhanApiErrorReason,
    options?: { status?: number; cause?: unknown }
  ) {
    super(message, { cause: options?.cause });
    this.name = "KhanApiError";
    this.reason = reason;
    this.status = options?.status;
  }
}
