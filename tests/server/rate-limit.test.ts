/**
 * TDD Tests for Server-Side Rate Limiting (Layer 4)
 *
 * Tests for rate limiting capabilities in server functions, including:
 * - Per-IP rate limiting
 * - Per-user rate limiting
 * - Endpoint-specific limits
 * - Burst handling
 * - 429 responses with Retry-After headers
 *
 * RED PHASE: These tests are expected to FAIL as the implementation doesn't exist yet.
 *
 * @see Layer 4 - Server Functions Rate Limiting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// These imports will fail because the implementation doesn't exist yet
// This is the RED phase of TDD
import {
  RateLimiter,
  createRateLimiter,
  rateLimit,
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitError,
  type RateLimitBucket,
} from '../../src/server/rate-limit'

// ============================================================================
// Mock Implementations
// ============================================================================

/**
 * Create a mock request for testing
 */
function createMockRequest(options: {
  ip?: string
  userId?: string
  endpoint?: string
  method?: string
  headers?: Record<string, string>
}): Request {
  const headers: Record<string, string> = {
    'CF-Connecting-IP': options.ip || '127.0.0.1',
    ...(options.userId ? { 'X-User-Id': options.userId } : {}),
    ...(options.headers || {}),
  }

  return new Request(`https://api.example.com${options.endpoint || '/api/test'}`, {
    method: options.method || 'GET',
    headers,
  })
}

/**
 * Create a mock context for testing
 */
function createMockContext(options?: { userId?: string }) {
  return {
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(
        options?.userId
          ? { subject: options.userId, email: `${options.userId}@example.com` }
          : null
      ),
    },
  }
}

// ============================================================================
// RateLimiter Class Tests
// ============================================================================

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ============================================================================
  // Creation Tests
  // ============================================================================

  describe('creation', () => {
    it('should create a rate limiter with default config', () => {
      rateLimiter = new RateLimiter()
      expect(rateLimiter).toBeDefined()
      expect(rateLimiter).toBeInstanceOf(RateLimiter)
    })

    it('should create a rate limiter with custom config', () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 100,
        defaultWindow: 60000,
      })
      expect(rateLimiter).toBeDefined()
    })

    it('should accept endpoint-specific limits', () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 100,
        endpoints: {
          '/api/auth/login': { limit: 5, window: 60000 },
          '/api/users': { limit: 50, window: 60000 },
        },
      })
      expect(rateLimiter).toBeDefined()
    })
  })

  // ============================================================================
  // Per-IP Rate Limiting Tests
  // ============================================================================

  describe('per-IP rate limiting', () => {
    it('should track requests by IP address', async () => {
      rateLimiter = new RateLimiter({ defaultLimit: 3 })

      const request = createMockRequest({ ip: '192.168.1.1' })

      // Should allow first 3 requests
      expect((await rateLimiter.check(request)).allowed).toBe(true)
      expect((await rateLimiter.check(request)).allowed).toBe(true)
      expect((await rateLimiter.check(request)).allowed).toBe(true)

      // Should block 4th request
      expect((await rateLimiter.check(request)).allowed).toBe(false)
    })

    it('should separate rate limits for different IPs', async () => {
      rateLimiter = new RateLimiter({ defaultLimit: 2 })

      const request1 = createMockRequest({ ip: '192.168.1.1' })
      const request2 = createMockRequest({ ip: '192.168.1.2' })

      // Use up limit for IP 1
      await rateLimiter.check(request1)
      await rateLimiter.check(request1)

      // IP 1 should be blocked
      expect((await rateLimiter.check(request1)).allowed).toBe(false)

      // IP 2 should still be allowed
      expect((await rateLimiter.check(request2)).allowed).toBe(true)
    })

    it('should extract IP from CF-Connecting-IP header', async () => {
      rateLimiter = new RateLimiter({ defaultLimit: 1 })

      const request = createMockRequest({
        headers: { 'CF-Connecting-IP': '10.0.0.1' },
      })

      await rateLimiter.check(request)
      const result = await rateLimiter.check(request)

      expect(result.allowed).toBe(false)
      expect(result.key).toContain('10.0.0.1')
    })

    it('should fallback to X-Forwarded-For header', async () => {
      rateLimiter = new RateLimiter({ defaultLimit: 1 })

      const request = new Request('https://api.example.com/test', {
        headers: { 'X-Forwarded-For': '10.0.0.2, 10.0.0.3' },
      })

      await rateLimiter.check(request)
      const result = await rateLimiter.check(request)

      expect(result.allowed).toBe(false)
      expect(result.key).toContain('10.0.0.2') // First IP in chain
    })

    it('should fallback to X-Real-IP header', async () => {
      rateLimiter = new RateLimiter({ defaultLimit: 1 })

      const request = new Request('https://api.example.com/test', {
        headers: { 'X-Real-IP': '10.0.0.4' },
      })

      await rateLimiter.check(request)
      const result = await rateLimiter.check(request)

      expect(result.allowed).toBe(false)
      expect(result.key).toContain('10.0.0.4')
    })
  })

  // ============================================================================
  // Per-User Rate Limiting Tests
  // ============================================================================

  describe('per-user rate limiting', () => {
    it('should track requests by user ID when configured', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 3,
        keyStrategy: 'user',
      })

      const ctx = createMockContext({ userId: 'user-123' })

      // Should allow first 3 requests
      expect((await rateLimiter.checkWithContext(ctx)).allowed).toBe(true)
      expect((await rateLimiter.checkWithContext(ctx)).allowed).toBe(true)
      expect((await rateLimiter.checkWithContext(ctx)).allowed).toBe(true)

      // Should block 4th request
      expect((await rateLimiter.checkWithContext(ctx)).allowed).toBe(false)
    })

    it('should separate rate limits for different users', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 2,
        keyStrategy: 'user',
      })

      const ctx1 = createMockContext({ userId: 'user-1' })
      const ctx2 = createMockContext({ userId: 'user-2' })

      // Use up limit for user 1
      await rateLimiter.checkWithContext(ctx1)
      await rateLimiter.checkWithContext(ctx1)

      // User 1 should be blocked
      expect((await rateLimiter.checkWithContext(ctx1)).allowed).toBe(false)

      // User 2 should still be allowed
      expect((await rateLimiter.checkWithContext(ctx2)).allowed).toBe(true)
    })

    it('should fallback to IP for unauthenticated requests', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 2,
        keyStrategy: 'user',
        fallbackToIp: true,
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      // Use up limit
      await rateLimiter.check(request)
      await rateLimiter.check(request)

      // Should be blocked by IP
      expect((await rateLimiter.check(request)).allowed).toBe(false)
    })

    it('should support combined user+IP rate limiting', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 5,
        keyStrategy: 'user+ip',
      })

      const request = createMockRequest({
        ip: '192.168.1.1',
        userId: 'user-123',
      })

      // Use up limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.check(request)
      }

      // Same user from same IP should be blocked
      expect((await rateLimiter.check(request)).allowed).toBe(false)

      // Same user from different IP should be allowed
      const requestDifferentIp = createMockRequest({
        ip: '192.168.1.2',
        userId: 'user-123',
      })
      expect((await rateLimiter.check(requestDifferentIp)).allowed).toBe(true)
    })
  })

  // ============================================================================
  // Endpoint-Specific Limits Tests
  // ============================================================================

  describe('endpoint-specific limits', () => {
    it('should apply different limits to different endpoints', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 100,
        endpoints: {
          '/api/auth/login': { limit: 3 },
          '/api/users': { limit: 10 },
        },
      })

      const loginRequest = createMockRequest({
        ip: '192.168.1.1',
        endpoint: '/api/auth/login',
      })

      // Login endpoint has limit of 3
      await rateLimiter.check(loginRequest)
      await rateLimiter.check(loginRequest)
      await rateLimiter.check(loginRequest)
      expect((await rateLimiter.check(loginRequest)).allowed).toBe(false)

      // Users endpoint should still be allowed (has separate limit)
      const usersRequest = createMockRequest({
        ip: '192.168.1.1',
        endpoint: '/api/users',
      })
      expect((await rateLimiter.check(usersRequest)).allowed).toBe(true)
    })

    it('should use default limit for unspecified endpoints', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 5,
        endpoints: {
          '/api/special': { limit: 2 },
        },
      })

      const request = createMockRequest({
        ip: '192.168.1.1',
        endpoint: '/api/other',
      })

      // Should use default limit of 5
      for (let i = 0; i < 5; i++) {
        expect((await rateLimiter.check(request)).allowed).toBe(true)
      }
      expect((await rateLimiter.check(request)).allowed).toBe(false)
    })

    it('should support pattern matching for endpoints', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 100,
        endpoints: {
          '/api/auth/*': { limit: 5 },
          '/api/admin/**': { limit: 20 },
        },
      })

      const loginRequest = createMockRequest({
        ip: '192.168.1.1',
        endpoint: '/api/auth/login',
      })

      const adminRequest = createMockRequest({
        ip: '192.168.1.1',
        endpoint: '/api/admin/users/123',
      })

      // Auth endpoints have limit of 5
      for (let i = 0; i < 5; i++) {
        await rateLimiter.check(loginRequest)
      }
      expect((await rateLimiter.check(loginRequest)).allowed).toBe(false)

      // Admin endpoints have separate limit of 20
      expect((await rateLimiter.check(adminRequest)).allowed).toBe(true)
    })

    it('should support different windows per endpoint', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 100,
        defaultWindow: 60000,
        endpoints: {
          '/api/auth/login': { limit: 5, window: 300000 }, // 5 per 5 minutes
          '/api/data': { limit: 1000, window: 3600000 }, // 1000 per hour
        },
      })

      const loginRequest = createMockRequest({
        ip: '192.168.1.1',
        endpoint: '/api/auth/login',
      })

      // Use up login limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.check(loginRequest)
      }
      expect((await rateLimiter.check(loginRequest)).allowed).toBe(false)

      // Advance time by 1 minute (should still be blocked for login)
      vi.advanceTimersByTime(60000)
      expect((await rateLimiter.check(loginRequest)).allowed).toBe(false)

      // Advance time to 5 minutes (should be allowed again)
      vi.advanceTimersByTime(240001)
      expect((await rateLimiter.check(loginRequest)).allowed).toBe(true)
    })
  })

  // ============================================================================
  // Burst Handling Tests
  // ============================================================================

  describe('burst handling', () => {
    it('should allow burst requests up to burst limit', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 10,
        defaultWindow: 60000,
        burstLimit: 20, // Allow burst of 20 in short time
        burstWindow: 1000, // 1 second burst window
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      // Should allow burst of 20 requests
      for (let i = 0; i < 20; i++) {
        expect((await rateLimiter.check(request)).allowed).toBe(true)
      }

      // 21st request should be blocked
      expect((await rateLimiter.check(request)).allowed).toBe(false)
    })

    it('should refill tokens at configured rate', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 10,
        defaultWindow: 10000,
        algorithm: 'token-bucket',
        refillRate: 1, // 1 token per second
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      // Use up all tokens
      for (let i = 0; i < 10; i++) {
        await rateLimiter.check(request)
      }

      // Should be blocked
      expect((await rateLimiter.check(request)).allowed).toBe(false)

      // After 1 second, should have 1 token
      vi.advanceTimersByTime(1000)
      expect((await rateLimiter.check(request)).allowed).toBe(true)

      // Should be blocked again
      expect((await rateLimiter.check(request)).allowed).toBe(false)
    })

    it('should cap tokens at max bucket size', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 5,
        algorithm: 'token-bucket',
        refillRate: 2, // 2 tokens per second
        maxTokens: 5,
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      // Wait for tokens to accumulate (should cap at 5)
      vi.advanceTimersByTime(10000) // Would be 20 tokens but capped at 5

      // Use all 5 tokens
      for (let i = 0; i < 5; i++) {
        expect((await rateLimiter.check(request)).allowed).toBe(true)
      }

      // Should be blocked (no more tokens)
      expect((await rateLimiter.check(request)).allowed).toBe(false)
    })

    it('should handle burst separately from sustained rate', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 100, // 100 per minute sustained
        defaultWindow: 60000,
        burstLimit: 10, // 10 per second burst
        burstWindow: 1000,
        enableBurstProtection: true,
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      // Rapid burst of 10 requests should be allowed
      for (let i = 0; i < 10; i++) {
        expect((await rateLimiter.check(request)).allowed).toBe(true)
      }

      // 11th request in same second should be blocked (burst exceeded)
      expect((await rateLimiter.check(request)).allowed).toBe(false)

      // After 1 second, burst limit resets
      vi.advanceTimersByTime(1001)
      expect((await rateLimiter.check(request)).allowed).toBe(true)
    })
  })

  // ============================================================================
  // 429 Response Tests
  // ============================================================================

  describe('429 responses with Retry-After headers', () => {
    it('should return rate limit result with retry-after time', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 1,
        defaultWindow: 60000,
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      // Use up limit
      await rateLimiter.check(request)

      // Check that result includes retry-after
      const result = await rateLimiter.check(request)

      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeDefined()
      expect(result.retryAfter).toBeGreaterThan(0)
      expect(result.retryAfter).toBeLessThanOrEqual(60)
    })

    it('should create proper 429 Response', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 1,
        defaultWindow: 60000,
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      await rateLimiter.check(request)
      const result = await rateLimiter.check(request)
      const response = rateLimiter.createErrorResponse(result)

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBeDefined()
      expect(parseInt(response.headers.get('Retry-After')!)).toBeGreaterThan(0)
    })

    it('should include X-RateLimit-* headers in error response', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 10,
        defaultWindow: 60000,
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      // Use up limit
      for (let i = 0; i < 10; i++) {
        await rateLimiter.check(request)
      }

      const result = await rateLimiter.check(request)
      const response = rateLimiter.createErrorResponse(result)

      expect(response.headers.get('X-RateLimit-Limit')).toBe('10')
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined()
    })

    it('should include remaining count in successful responses', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 10,
        defaultWindow: 60000,
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      const result = await rateLimiter.check(request)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
      expect(result.limit).toBe(10)
    })

    it('should return proper JSON error body', async () => {
      rateLimiter = new RateLimiter({ defaultLimit: 1 })

      const request = createMockRequest({ ip: '192.168.1.1' })

      await rateLimiter.check(request)
      const result = await rateLimiter.check(request)
      const response = rateLimiter.createErrorResponse(result)

      const body = await response.json()

      expect(body).toHaveProperty('error')
      expect(body.error).toContain('rate limit')
      expect(body).toHaveProperty('retryAfter')
      expect(body.retryAfter).toBeGreaterThan(0)
    })
  })

  // ============================================================================
  // Sliding Window Algorithm Tests
  // ============================================================================

  describe('sliding window algorithm', () => {
    it('should use sliding window by default', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 3,
        defaultWindow: 10000,
        algorithm: 'sliding-window',
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      // Make 3 requests
      await rateLimiter.check(request) // t=0
      vi.advanceTimersByTime(3000)
      await rateLimiter.check(request) // t=3000
      vi.advanceTimersByTime(3000)
      await rateLimiter.check(request) // t=6000

      // Should be blocked
      expect((await rateLimiter.check(request)).allowed).toBe(false)

      // After 4001ms (t=10001), first request expires
      vi.advanceTimersByTime(4001)
      expect((await rateLimiter.check(request)).allowed).toBe(true)
    })

    it('should expire requests gradually in sliding window', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 2,
        defaultWindow: 5000,
        algorithm: 'sliding-window',
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      await rateLimiter.check(request) // t=0
      vi.advanceTimersByTime(2500)
      await rateLimiter.check(request) // t=2500

      // Should be blocked
      expect((await rateLimiter.check(request)).allowed).toBe(false)

      // After 2501ms (t=5001), first request expires
      vi.advanceTimersByTime(2501)
      expect((await rateLimiter.check(request)).allowed).toBe(true)

      // Second request still in window, so blocked again
      expect((await rateLimiter.check(request)).allowed).toBe(false)
    })
  })

  // ============================================================================
  // Fixed Window Algorithm Tests
  // ============================================================================

  describe('fixed window algorithm', () => {
    it('should reset at window boundaries', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 2,
        defaultWindow: 5000,
        algorithm: 'fixed-window',
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      await rateLimiter.check(request)
      await rateLimiter.check(request)

      // Should be blocked
      expect((await rateLimiter.check(request)).allowed).toBe(false)

      // Advance to next window
      vi.advanceTimersByTime(5001)

      // Should be allowed (new window)
      expect((await rateLimiter.check(request)).allowed).toBe(true)
      expect((await rateLimiter.check(request)).allowed).toBe(true)
      expect((await rateLimiter.check(request)).allowed).toBe(false)
    })
  })

  // ============================================================================
  // Reset and Clear Tests
  // ============================================================================

  describe('reset and clear', () => {
    it('should reset limit for specific key', async () => {
      rateLimiter = new RateLimiter({ defaultLimit: 2 })

      const request = createMockRequest({ ip: '192.168.1.1' })

      await rateLimiter.check(request)
      await rateLimiter.check(request)
      expect((await rateLimiter.check(request)).allowed).toBe(false)

      // Reset
      rateLimiter.reset('ip:192.168.1.1')

      // Should be allowed again
      expect((await rateLimiter.check(request)).allowed).toBe(true)
    })

    it('should clear all rate limit data', async () => {
      rateLimiter = new RateLimiter({ defaultLimit: 1 })

      const request1 = createMockRequest({ ip: '192.168.1.1' })
      const request2 = createMockRequest({ ip: '192.168.1.2' })

      await rateLimiter.check(request1)
      await rateLimiter.check(request2)

      expect((await rateLimiter.check(request1)).allowed).toBe(false)
      expect((await rateLimiter.check(request2)).allowed).toBe(false)

      rateLimiter.clear()

      expect((await rateLimiter.check(request1)).allowed).toBe(true)
      expect((await rateLimiter.check(request2)).allowed).toBe(true)
    })

    it('should get current bucket state', async () => {
      rateLimiter = new RateLimiter({
        defaultLimit: 5,
        defaultWindow: 60000,
      })

      const request = createMockRequest({ ip: '192.168.1.1' })

      await rateLimiter.check(request)
      await rateLimiter.check(request)

      const bucket = rateLimiter.getBucket('ip:192.168.1.1')

      expect(bucket).toBeDefined()
      expect(bucket?.count).toBe(2)
      expect(bucket?.remaining).toBe(3)
      expect(bucket?.limit).toBe(5)
      expect(bucket?.resetAt).toBeDefined()
    })
  })
})

// ============================================================================
// createRateLimiter Factory Tests
// ============================================================================

describe('createRateLimiter', () => {
  it('should create a rate limiter with config', () => {
    const limiter = createRateLimiter({
      defaultLimit: 100,
      defaultWindow: 60000,
    })

    expect(limiter).toBeInstanceOf(RateLimiter)
  })

  it('should support preset configurations', () => {
    const strictLimiter = createRateLimiter('strict')
    const relaxedLimiter = createRateLimiter('relaxed')
    const apiLimiter = createRateLimiter('api')

    expect(strictLimiter).toBeInstanceOf(RateLimiter)
    expect(relaxedLimiter).toBeInstanceOf(RateLimiter)
    expect(apiLimiter).toBeInstanceOf(RateLimiter)
  })
})

// ============================================================================
// rateLimit Decorator Tests
// ============================================================================

describe('rateLimit decorator', () => {
  it('should wrap a function with rate limiting', async () => {
    const handler = vi.fn().mockResolvedValue({ success: true })

    const rateLimitedHandler = rateLimit(handler, {
      limit: 2,
      window: 60000,
    })

    const ctx = createMockContext()
    const request = createMockRequest({ ip: '192.168.1.1' })

    // Should execute handler
    await rateLimitedHandler(ctx, request)
    await rateLimitedHandler(ctx, request)

    expect(handler).toHaveBeenCalledTimes(2)

    // Should throw rate limit error
    await expect(rateLimitedHandler(ctx, request)).rejects.toThrow()
  })

  it('should throw RateLimitError when exceeded', async () => {
    const handler = vi.fn().mockResolvedValue({ success: true })

    const rateLimitedHandler = rateLimit(handler, {
      limit: 1,
      window: 60000,
    })

    const ctx = createMockContext()
    const request = createMockRequest({ ip: '192.168.1.1' })

    await rateLimitedHandler(ctx, request)

    try {
      await rateLimitedHandler(ctx, request)
      expect.fail('Should have thrown')
    } catch (error) {
      expect((error as RateLimitError).code).toBe('RATE_LIMIT_EXCEEDED')
      expect((error as RateLimitError).retryAfter).toBeGreaterThan(0)
    }
  })

  it('should support custom key extractor', async () => {
    const handler = vi.fn().mockResolvedValue({ success: true })

    const rateLimitedHandler = rateLimit(handler, {
      limit: 1,
      keyExtractor: (ctx) => ctx.auth?.getUserIdentity()?.subject || 'anon',
    })

    const ctx1 = createMockContext({ userId: 'user-1' })
    const ctx2 = createMockContext({ userId: 'user-2' })
    const request = createMockRequest({ ip: '192.168.1.1' })

    // Both should be allowed (different users)
    await rateLimitedHandler(ctx1, request)
    await rateLimitedHandler(ctx2, request)

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('should add rate limit headers to successful responses', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('OK'))

    const rateLimitedHandler = rateLimit(handler, {
      limit: 10,
      window: 60000,
      addHeaders: true,
    })

    const ctx = createMockContext()
    const request = createMockRequest({ ip: '192.168.1.1' })

    const response = await rateLimitedHandler(ctx, request)

    expect(response.headers.get('X-RateLimit-Limit')).toBe('10')
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('9')
    expect(response.headers.get('X-RateLimit-Reset')).toBeDefined()
  })
})

// ============================================================================
// Type Safety Tests
// ============================================================================

describe('type safety', () => {
  it('should enforce RateLimitConfig type', () => {
    const config: RateLimitConfig = {
      defaultLimit: 100,
      defaultWindow: 60000,
      keyStrategy: 'ip',
      algorithm: 'sliding-window',
    }

    const rateLimiter = new RateLimiter(config)
    expect(rateLimiter).toBeDefined()
  })

  it('should return typed RateLimitResult', async () => {
    const rateLimiter = new RateLimiter({ defaultLimit: 10 })
    const request = createMockRequest({ ip: '192.168.1.1' })

    const result: RateLimitResult = await rateLimiter.check(request)

    expect(result.allowed).toBeDefined()
    expect(result.remaining).toBeDefined()
    expect(result.limit).toBeDefined()
    expect(result.resetAt).toBeDefined()
  })

  it('should export RateLimitBucket type', () => {
    const bucket: RateLimitBucket = {
      key: 'ip:192.168.1.1',
      count: 5,
      remaining: 5,
      limit: 10,
      window: 60000,
      resetAt: Date.now() + 60000,
    }

    expect(bucket).toBeDefined()
    expect(bucket.key).toBe('ip:192.168.1.1')
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('integration scenarios', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should handle complete rate limiting workflow', async () => {
    rateLimiter = new RateLimiter({
      defaultLimit: 5,
      defaultWindow: 60000,
      endpoints: {
        '/api/auth/login': { limit: 3, window: 300000 },
      },
    })

    const ip = '192.168.1.1'

    // Regular API requests
    const apiRequest = createMockRequest({ ip, endpoint: '/api/data' })
    for (let i = 0; i < 5; i++) {
      const result = await rateLimiter.check(apiRequest)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4 - i)
    }

    // Should be blocked
    const blockedResult = await rateLimiter.check(apiRequest)
    expect(blockedResult.allowed).toBe(false)
    expect(blockedResult.retryAfter).toBeGreaterThan(0)

    // Login endpoint has separate limit
    const loginRequest = createMockRequest({ ip, endpoint: '/api/auth/login' })
    const loginResult = await rateLimiter.check(loginRequest)
    expect(loginResult.allowed).toBe(true)
    expect(loginResult.limit).toBe(3)
  })

  it('should handle concurrent requests', async () => {
    rateLimiter = new RateLimiter({ defaultLimit: 10 })

    const request = createMockRequest({ ip: '192.168.1.1' })

    // Simulate concurrent requests
    const results = await Promise.all([
      rateLimiter.check(request),
      rateLimiter.check(request),
      rateLimiter.check(request),
      rateLimiter.check(request),
      rateLimiter.check(request),
    ])

    // All should be allowed (5 < 10)
    expect(results.every((r) => r.allowed)).toBe(true)

    // Total remaining should be consistent
    const lastResult = results[results.length - 1]
    expect(lastResult.remaining).toBe(5)
  })

  it('should work with Durable Objects', async () => {
    // This test ensures the rate limiter can work with DO storage
    rateLimiter = new RateLimiter({
      defaultLimit: 10,
      storage: 'durable-object', // Would use DO storage in production
    })

    const request = createMockRequest({ ip: '192.168.1.1' })
    const result = await rateLimiter.check(request)

    expect(result.allowed).toBe(true)
  })

  it('should support webhook rate limiting', async () => {
    rateLimiter = new RateLimiter({
      defaultLimit: 1000,
      defaultWindow: 3600000, // 1 hour
      endpoints: {
        '/webhooks/*': { limit: 100, window: 60000 },
      },
      keyStrategy: 'ip+endpoint',
    })

    const stripeWebhook = createMockRequest({
      ip: '13.225.144.0', // Stripe IP
      endpoint: '/webhooks/stripe',
    })

    // Should allow many webhook calls
    for (let i = 0; i < 100; i++) {
      expect((await rateLimiter.check(stripeWebhook)).allowed).toBe(true)
    }

    // 101st should be blocked
    expect((await rateLimiter.check(stripeWebhook)).allowed).toBe(false)
  })
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('error handling', () => {
  it('should handle invalid config gracefully', () => {
    expect(() => {
      new RateLimiter({
        defaultLimit: -1, // Invalid
      })
    }).toThrow()
  })

  it('should handle missing IP gracefully', async () => {
    const rateLimiter = new RateLimiter({ defaultLimit: 10 })

    const request = new Request('https://api.example.com/test')
    const result = await rateLimiter.check(request)

    // Should use fallback key
    expect(result.allowed).toBe(true)
    expect(result.key).toBe('unknown')
  })

  it('should handle storage errors', async () => {
    const rateLimiter = new RateLimiter({
      defaultLimit: 10,
      onError: 'allow', // Allow on error
    })

    // Simulate storage error by mocking
    vi.spyOn(rateLimiter as any, 'getStoredCount').mockRejectedValue(
      new Error('Storage error')
    )

    const request = createMockRequest({ ip: '192.168.1.1' })
    const result = await rateLimiter.check(request)

    // Should allow when storage fails (fail-open)
    expect(result.allowed).toBe(true)
  })

  it('should support fail-closed mode', async () => {
    const rateLimiter = new RateLimiter({
      defaultLimit: 10,
      onError: 'deny', // Deny on error
    })

    // Simulate storage error
    vi.spyOn(rateLimiter as any, 'getStoredCount').mockRejectedValue(
      new Error('Storage error')
    )

    const request = createMockRequest({ ip: '192.168.1.1' })
    const result = await rateLimiter.check(request)

    // Should deny when storage fails (fail-closed)
    expect(result.allowed).toBe(false)
  })
})
