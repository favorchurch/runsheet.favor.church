import 'server-only';

import { redisCommand, isRedisEnabled } from './redisClient';
import { NextRequest } from 'next/server';

/**
 * Extract client IP from request headers.
 * Tries x-forwarded-for (first hop) then x-real-ip.
 */
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs; use the first one (client's original IP)
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  // Fallback to unknown
  return 'unknown';
}

/**
 * Rate limit check for signup endpoint.
 * Per-IP limit: 10 requests per 60 seconds (lenient, allows retries).
 * FAIL OPEN: if Redis is unavailable, allows the request.
 *
 * @param request Next.js request object
 * @returns { allowed: boolean, retryAfter?: number } - retryAfter is in seconds
 */
export async function checkSignupRateLimit(request: NextRequest): Promise<{
  allowed: boolean;
  retryAfter?: number;
}> {
  // Fail open if Redis is not enabled
  if (!isRedisEnabled()) {
    return { allowed: true };
  }

  const clientIp = getClientIp(request);
  const key = `ratelimit:signup:${clientIp}`;
  const limit = 10;
  const windowSeconds = 60;

  try {
    const count = await redisCommand<number>(['INCR', key]);
    if (count === null) {
      // Redis command failed; fail open
      return { allowed: true };
    }

    // Set expiration on first increment (fixed window)
    if (count === 1) {
      await redisCommand(['EXPIRE', key, windowSeconds]);
    }

    if (count > limit) {
      // Rate limit exceeded; calculate seconds until window reset
      const ttl = await redisCommand<number>(['TTL', key]);
      const retryAfter = ttl && ttl > 0 ? ttl : windowSeconds;
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  } catch (error) {
    // Fail open on unexpected errors
    console.warn('[rateLimit] unexpected error:', error);
    return { allowed: true };
  }
}
