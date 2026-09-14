export type MetaErrorCategory =
  | "oauth"
  | "permission"
  | "rate_limit"
  | "invalid_parameter"
  | "unsupported"
  | "transient"
  | "unknown";

export interface RawMetaError {
  message?: string;
  code?: number;
  error_subcode?: number;
  type?: string;
  error_data?: unknown;
  status?: number;
}

export interface NormalizedMetaError {
  provider: "meta";
  product?: string;
  apiVersion?: string;
  errorCode?: number;
  errorSubcode?: number;
  category: MetaErrorCategory;
  retryable: boolean;
  userActionRequired: boolean;
  probableCause: string;
  recommendedFix: string;
  headline: string;
  detail: string;
}

/** Normalize raw Meta errors into a stable structure. Never show raw errors as primary UX. */
export function normalizeMetaError(raw: RawMetaError, ctx?: { product?: string; apiVersion?: string }): NormalizedMetaError {
  const code = raw.code;
  const subcode = raw.error_subcode;
  const message = (raw.message ?? "").toLowerCase();

  let category: MetaErrorCategory = "unknown";
  let retryable = false;
  let userActionRequired = true;
  let headline = "Meta request failed";
  let probableCause = "Meta rejected the request. See technical details.";
  let recommendedFix = "Retry the action. If it persists, inspect the connection health.";

  if (code === 190 || message.includes("token") || message.includes("session")) {
    category = "oauth";
    headline = "Meta connection needs attention";
    probableCause = "The Meta access token is invalid or expired.";
    recommendedFix = "Reconnect the Meta account to issue a fresh token.";
  } else if (code === 200 || code === 10 || message.includes("permission")) {
    category = "permission";
    headline = "Missing Meta permission";
    probableCause = "The connected account has not granted a required permission, or Meta revoked it.";
    recommendedFix = "Reconnect and grant the requested permissions. Some permissions need Meta App Review.";
  } else if (code === 4 || code === 17 || code === 32 || raw.status === 429 || message.includes("rate")) {
    category = "rate_limit";
    retryable = true;
    headline = "Meta rate limit reached";
    probableCause = "The app exceeded Meta's rate limits.";
    recommendedFix = "Wait and retry with backoff. MetaFlux throttles automatically.";
  } else if (code === 100 || message.includes("invalid parameter") || message.includes("param")) {
    category = "invalid_parameter";
    headline = "Invalid request to Meta";
    probableCause = "A parameter sent to Meta was missing or malformed.";
    recommendedFix = "Check the action configuration, then retry.";
  } else if (message.includes("unsupported") || code === 3) {
    category = "unsupported";
    headline = "Unsupported Meta operation";
    probableCause = "This operation is not supported for the connected asset type or API version.";
    recommendedFix = "Verify the asset type and API version. Some capabilities require Meta approval.";
  } else if (raw.status !== undefined && raw.status >= 500) {
    category = "transient";
    retryable = true;
    userActionRequired = false;
    headline = "Meta is having issues";
    probableCause = "Meta's API returned a server error.";
    recommendedFix = "MetaFlux will retry automatically with backoff.";
  }

  return {
    provider: "meta",
    product: ctx?.product,
    apiVersion: ctx?.apiVersion,
    errorCode: code,
    errorSubcode: subcode,
    category,
    retryable,
    userActionRequired,
    probableCause,
    recommendedFix,
    headline,
    detail: raw.message ?? "Unknown Meta error",
  };
}
