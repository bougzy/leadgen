/**
 * Simple in-memory rate limiter.
 *
 * Each key (typically an IP address) is tracked in a Map with a list of
 * request timestamps.  Expired entries are cleaned up automatically on
 * every call so the Map does not grow without bound.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

/**
 * Check whether a request identified by `key` is within the allowed rate.
 *
 * @param key       - Unique identifier (e.g. IP address).
 * @param limit     - Maximum number of requests allowed in the window.
 * @param windowMs  - Length of the sliding window in milliseconds.
 * @returns `{ success, remaining }` — `success` is false when the limit
 *          has been exceeded.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { success: boolean; remaining: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  // --- Cleanup expired entries on every call (cheap for typical sizes) ---
  for (const [k, entry] of store) {
    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
    if (entry.timestamps.length === 0) {
      store.delete(k);
    }
  }

  // --- Evaluate current key ---
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Trim old timestamps for this key (may already be done above, but be safe)
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= limit) {
    return { success: false, remaining: 0 };
  }

  entry.timestamps.push(now);
  return { success: true, remaining: limit - entry.timestamps.length };
}

/**
 * Extract the client IP from a Next.js request.  Falls back to
 * "unknown" if no header is present.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for may contain a comma-separated list; take the first.
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}
