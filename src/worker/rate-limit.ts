/**
 * Rate Limiter for Cloudflare Workers
 *
 * Uses a simple sliding window algorithm with in-memory storage.
 * For production, consider using Cloudflare's Rate Limiting or KV.
 */

import type { MiddlewareHandler, WorkerEnv } from './types'

// ============================================================================
// Types
// ============================================================================

/**
 * Rate limit configuration options.
 */
export interface RateLimitOptions {
  /** Maximum requests per window */
  limit: number
  /** Window size in milliseconds (default: 60000 = 1 minute) */
  window?: number
  /** Key extractor function (default: by IP) */
  keyExtractor?: (request: Request) => string
  /** Custom response for rate limit exceeded */
  onLimitExceeded?: (request: Request, retryAfter: number) => Response
}

// ============================================================================
// Rate Limiter
// ============================================================================

/**
 * Simple in-memory rate limiter using sliding window.
 */
export class RateLimiter {
  private options: Required<Omit<RateLimitOptions, 'onLimitExceeded'>> & {
    onLimitExceeded?: RateLimitOptions['onLimitExceeded']
  }
  private requests: Map<string, number[]> = new Map()

  constructor(options: RateLimitOptions) {
    this.options = {
      limit: options.limit,
      window: options.window ?? 60000,
      keyExtractor: options.keyExtractor ?? this.defaultKeyExtractor,
      onLimitExceeded: options.onLimitExceeded,
    }
  }

  /**
   * Create middleware handler.
   */
  handler(): MiddlewareHandler {
    return async (request, env, ctx, next) => {
      const key = this.options.keyExtractor(request)
      const result = this.checkLimit(key)

      if (!result.allowed) {
        if (this.options.onLimitExceeded) {
          return this.options.onLimitExceeded(request, result.retryAfter)
        }

        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded',
            retryAfter: result.retryAfter,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': Math.ceil(result.retryAfter / 1000).toString(),
              'X-RateLimit-Limit': this.options.limit.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': Math.ceil(
                (Date.now() + result.retryAfter) / 1000
              ).toString(),
            },
          }
        )
      }

      // Add rate limit headers to response
      const response = await next()
      const newResponse = new Response(response.body, response)
      newResponse.headers.set('X-RateLimit-Limit', this.options.limit.toString())
      newResponse.headers.set('X-RateLimit-Remaining', result.remaining.toString())

      return newResponse
    }
  }

  /**
   * Check if request is within rate limit.
   */
  checkLimit(key: string): {
    allowed: boolean
    remaining: number
    retryAfter: number
  } {
    const now = Date.now()
    const windowStart = now - this.options.window

    // Get existing requests for this key
    let timestamps = this.requests.get(key) || []

    // Remove old timestamps outside the window
    timestamps = timestamps.filter((t) => t > windowStart)

    // Check if under limit
    if (timestamps.length < this.options.limit) {
      timestamps.push(now)
      this.requests.set(key, timestamps)

      return {
        allowed: true,
        remaining: this.options.limit - timestamps.length,
        retryAfter: 0,
      }
    }

    // Rate limit exceeded
    const oldestTimestamp = timestamps[0] || now
    const retryAfter = oldestTimestamp + this.options.window - now

    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    }
  }

  /**
   * Reset rate limit for a key.
   */
  reset(key: string): void {
    this.requests.delete(key)
  }

  /**
   * Clear all rate limit data.
   */
  clear(): void {
    this.requests.clear()
  }

  /**
   * Default key extractor using client IP.
   */
  private defaultKeyExtractor(request: Request): string {
    return (
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown'
    )
  }

  /**
   * Create from environment.
   */
  static fromEnv(env: WorkerEnv): RateLimiter | null {
    const limit = env.RATE_LIMIT_PER_MINUTE
    if (!limit) return null

    return new RateLimiter({
      limit: parseInt(limit, 10),
      window: 60000,
    })
  }
}
