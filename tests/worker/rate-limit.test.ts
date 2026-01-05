/**
 * Rate Limiter Tests - Layer 9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter, type RateLimitOptions } from '../../src/worker/rate-limit'

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('configuration', () => {
    it('should create with required options', () => {
      rateLimiter = new RateLimiter({ limit: 100 })
      expect(rateLimiter).toBeDefined()
    })

    it('should accept custom window size', () => {
      rateLimiter = new RateLimiter({ limit: 100, window: 30000 })
      expect(rateLimiter).toBeDefined()
    })

    it('should accept custom key extractor', () => {
      const keyExtractor = (req: Request) => req.headers.get('X-User-Id') || 'anonymous'
      rateLimiter = new RateLimiter({ limit: 100, keyExtractor })
      expect(rateLimiter).toBeDefined()
    })

    it('should accept custom onLimitExceeded handler', () => {
      const onLimitExceeded = () => new Response('Rate limited', { status: 429 })
      rateLimiter = new RateLimiter({ limit: 100, onLimitExceeded })
      expect(rateLimiter).toBeDefined()
    })
  })

  // ============================================================================
  // Rate Limit Logic Tests
  // ============================================================================

  describe('checkLimit', () => {
    it('should allow requests under limit', () => {
      rateLimiter = new RateLimiter({ limit: 5 })

      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.checkLimit('user-1')
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(4 - i)
      }
    })

    it('should block requests over limit', () => {
      rateLimiter = new RateLimiter({ limit: 3 })

      // Use up the limit
      rateLimiter.checkLimit('user-1')
      rateLimiter.checkLimit('user-1')
      rateLimiter.checkLimit('user-1')

      // Fourth request should be blocked
      const result = rateLimiter.checkLimit('user-1')
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should track different keys independently', () => {
      rateLimiter = new RateLimiter({ limit: 2 })

      // User 1 uses their limit
      rateLimiter.checkLimit('user-1')
      rateLimiter.checkLimit('user-1')

      // User 2 should still be allowed
      const result = rateLimiter.checkLimit('user-2')
      expect(result.allowed).toBe(true)
    })

    it('should reset after window expires', () => {
      rateLimiter = new RateLimiter({ limit: 2, window: 1000 })

      // Use up the limit
      rateLimiter.checkLimit('user-1')
      rateLimiter.checkLimit('user-1')

      let result = rateLimiter.checkLimit('user-1')
      expect(result.allowed).toBe(false)

      // Advance time past window
      vi.advanceTimersByTime(1001)

      // Should be allowed again
      result = rateLimiter.checkLimit('user-1')
      expect(result.allowed).toBe(true)
    })

    it('should return correct retryAfter', () => {
      rateLimiter = new RateLimiter({ limit: 1, window: 10000 })

      rateLimiter.checkLimit('user-1')

      vi.advanceTimersByTime(3000)

      const result = rateLimiter.checkLimit('user-1')
      expect(result.allowed).toBe(false)
      // Should be about 7000ms remaining
      expect(result.retryAfter).toBeGreaterThan(6000)
      expect(result.retryAfter).toBeLessThanOrEqual(7000)
    })

    it('should use sliding window correctly', () => {
      rateLimiter = new RateLimiter({ limit: 3, window: 10000 })

      // Make 3 requests
      rateLimiter.checkLimit('user-1') // t=0
      vi.advanceTimersByTime(3000)
      rateLimiter.checkLimit('user-1') // t=3000
      vi.advanceTimersByTime(3000)
      rateLimiter.checkLimit('user-1') // t=6000

      // Should be blocked
      let result = rateLimiter.checkLimit('user-1')
      expect(result.allowed).toBe(false)

      // Advance past first request's expiry (t=0 + 10000 = 10000)
      vi.advanceTimersByTime(4001) // Now at t=10001

      // First request should have expired, so one slot available
      result = rateLimiter.checkLimit('user-1')
      expect(result.allowed).toBe(true)
    })
  })

  // ============================================================================
  // Reset Tests
  // ============================================================================

  describe('reset', () => {
    it('should reset limit for specific key', () => {
      rateLimiter = new RateLimiter({ limit: 2 })

      // Use up the limit
      rateLimiter.checkLimit('user-1')
      rateLimiter.checkLimit('user-1')

      let result = rateLimiter.checkLimit('user-1')
      expect(result.allowed).toBe(false)

      // Reset
      rateLimiter.reset('user-1')

      // Should be allowed again
      result = rateLimiter.checkLimit('user-1')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(1)
    })

    it('should not affect other keys on reset', () => {
      rateLimiter = new RateLimiter({ limit: 2 })

      rateLimiter.checkLimit('user-1')
      rateLimiter.checkLimit('user-2')

      rateLimiter.reset('user-1')

      // User 1 should be reset
      const result1 = rateLimiter.checkLimit('user-1')
      expect(result1.remaining).toBe(1)

      // User 2 should still have their count
      const result2 = rateLimiter.checkLimit('user-2')
      expect(result2.remaining).toBe(0)
    })
  })

  // ============================================================================
  // Clear Tests
  // ============================================================================

  describe('clear', () => {
    it('should clear all rate limit data', () => {
      rateLimiter = new RateLimiter({ limit: 2 })

      rateLimiter.checkLimit('user-1')
      rateLimiter.checkLimit('user-2')

      rateLimiter.clear()

      const result1 = rateLimiter.checkLimit('user-1')
      const result2 = rateLimiter.checkLimit('user-2')

      expect(result1.remaining).toBe(1)
      expect(result2.remaining).toBe(1)
    })
  })

  // ============================================================================
  // Middleware Handler Tests
  // ============================================================================

  describe('handler', () => {
    it('should allow requests under limit', async () => {
      rateLimiter = new RateLimiter({ limit: 10 })
      const handler = rateLimiter.handler()
      const next = vi.fn().mockResolvedValue(new Response('OK'))

      const request = new Request('https://api.example.com/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' },
      })

      const response = await handler(request, {} as any, {} as any, next)

      expect(next).toHaveBeenCalled()
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10')
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('9')
    })

    it('should block requests over limit', async () => {
      rateLimiter = new RateLimiter({ limit: 1 })
      const handler = rateLimiter.handler()
      const next = vi.fn().mockResolvedValue(new Response('OK'))

      const request = new Request('https://api.example.com/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' },
      })

      // First request
      await handler(request, {} as any, {} as any, next)

      // Second request should be blocked
      const response = await handler(request, {} as any, {} as any, next)

      expect(response.status).toBe(429)
      expect(next).toHaveBeenCalledTimes(1) // Only first request
    })

    it('should return 429 with proper headers when blocked', async () => {
      rateLimiter = new RateLimiter({ limit: 1, window: 60000 })
      const handler = rateLimiter.handler()
      const next = vi.fn().mockResolvedValue(new Response('OK'))

      const request = new Request('https://api.example.com/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' },
      })

      await handler(request, {} as any, {} as any, next)
      const response = await handler(request, {} as any, {} as any, next)

      expect(response.status).toBe(429)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(response.headers.get('Retry-After')).toBeDefined()
      expect(response.headers.get('X-RateLimit-Limit')).toBe('1')
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
    })

    it('should use custom onLimitExceeded handler', async () => {
      const customResponse = new Response('Custom rate limit message', { status: 429 })
      rateLimiter = new RateLimiter({
        limit: 1,
        onLimitExceeded: () => customResponse,
      })
      const handler = rateLimiter.handler()
      const next = vi.fn().mockResolvedValue(new Response('OK'))

      const request = new Request('https://api.example.com/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1' },
      })

      await handler(request, {} as any, {} as any, next)
      const response = await handler(request, {} as any, {} as any, next)

      expect(response).toBe(customResponse)
    })

    it('should use custom key extractor', async () => {
      rateLimiter = new RateLimiter({
        limit: 2,
        keyExtractor: (req) => req.headers.get('X-User-Id') || 'anonymous',
      })
      const handler = rateLimiter.handler()
      const next = vi.fn().mockResolvedValue(new Response('OK'))

      // Same IP but different user IDs
      const request1 = new Request('https://api.example.com/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1', 'X-User-Id': 'user-1' },
      })
      const request2 = new Request('https://api.example.com/test', {
        headers: { 'CF-Connecting-IP': '192.168.1.1', 'X-User-Id': 'user-2' },
      })

      // Each user gets their own limit
      await handler(request1, {} as any, {} as any, next)
      await handler(request1, {} as any, {} as any, next)
      await handler(request2, {} as any, {} as any, next)
      await handler(request2, {} as any, {} as any, next)

      // All should have been allowed (4 requests, 2 per user)
      expect(next).toHaveBeenCalledTimes(4)
    })
  })

  // ============================================================================
  // Default Key Extractor Tests
  // ============================================================================

  describe('default key extractor', () => {
    it('should use CF-Connecting-IP header', async () => {
      rateLimiter = new RateLimiter({ limit: 1 })
      const handler = rateLimiter.handler()
      const next = vi.fn().mockResolvedValue(new Response('OK'))

      const request1 = new Request('https://api.example.com/test', {
        headers: { 'CF-Connecting-IP': '1.1.1.1' },
      })
      const request2 = new Request('https://api.example.com/test', {
        headers: { 'CF-Connecting-IP': '2.2.2.2' },
      })

      await handler(request1, {} as any, {} as any, next)
      await handler(request2, {} as any, {} as any, next)

      // Both should be allowed (different IPs)
      expect(next).toHaveBeenCalledTimes(2)
    })

    it('should fallback to X-Forwarded-For', async () => {
      rateLimiter = new RateLimiter({ limit: 1 })
      const handler = rateLimiter.handler()
      const next = vi.fn().mockResolvedValue(new Response('OK'))

      const request1 = new Request('https://api.example.com/test', {
        headers: { 'X-Forwarded-For': '1.1.1.1, 2.2.2.2' },
      })
      const request2 = new Request('https://api.example.com/test', {
        headers: { 'X-Forwarded-For': '3.3.3.3' },
      })

      await handler(request1, {} as any, {} as any, next)
      await handler(request2, {} as any, {} as any, next)

      // Both should be allowed (different IPs)
      expect(next).toHaveBeenCalledTimes(2)
    })
  })
})
