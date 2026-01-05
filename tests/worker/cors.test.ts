/**
 * CORS Middleware Tests - Layer 9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CorsMiddleware, type CorsOptions } from '../../src/worker/cors'

describe('CorsMiddleware', () => {
  // ============================================================================
  // Basic Configuration Tests
  // ============================================================================

  describe('configuration', () => {
    it('should use default options when none provided', () => {
      const cors = new CorsMiddleware()
      expect(cors).toBeDefined()
    })

    it('should accept custom origins string', () => {
      const cors = new CorsMiddleware({ origins: 'https://example.com' })
      expect(cors).toBeDefined()
    })

    it('should accept custom origins array', () => {
      const cors = new CorsMiddleware({
        origins: ['https://example.com', 'https://app.example.com'],
      })
      expect(cors).toBeDefined()
    })

    it('should accept all custom options', () => {
      const options: CorsOptions = {
        origins: ['https://example.com'],
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'X-Custom-Header'],
        exposedHeaders: ['X-Request-Id'],
        credentials: true,
        maxAge: 3600,
      }
      const cors = new CorsMiddleware(options)
      expect(cors).toBeDefined()
    })
  })

  // ============================================================================
  // Preflight Tests
  // ============================================================================

  describe('handlePreflight', () => {
    it('should return 204 for valid preflight request', () => {
      const cors = new CorsMiddleware()
      const request = new Request('https://api.example.com/test', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
        },
      })

      const response = cors.handlePreflight(request)

      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    })

    it('should return 403 for disallowed origin', () => {
      const cors = new CorsMiddleware({ origins: 'https://allowed.com' })
      const request = new Request('https://api.example.com/test', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://disallowed.com',
          'Access-Control-Request-Method': 'POST',
        },
      })

      const response = cors.handlePreflight(request)

      expect(response.status).toBe(403)
    })

    it('should set max-age header', () => {
      const cors = new CorsMiddleware({ maxAge: 7200 })
      const request = new Request('https://api.example.com/test', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
        },
      })

      const response = cors.handlePreflight(request)

      expect(response.headers.get('Access-Control-Max-Age')).toBe('7200')
    })

    it('should include requested headers in response', () => {
      const cors = new CorsMiddleware({
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
      const request = new Request('https://api.example.com/test', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      })

      const response = cors.handlePreflight(request)

      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
    })
  })

  // ============================================================================
  // CORS Headers Tests
  // ============================================================================

  describe('addCorsHeaders', () => {
    it('should add CORS headers to response', () => {
      const cors = new CorsMiddleware()
      const request = new Request('https://api.example.com/test', {
        headers: { Origin: 'https://example.com' },
      })
      const response = new Response('OK')

      const corsResponse = cors.addCorsHeaders(request, response)

      expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('should set specific origin when configured', () => {
      const cors = new CorsMiddleware({ origins: 'https://example.com' })
      const request = new Request('https://api.example.com/test', {
        headers: { Origin: 'https://example.com' },
      })
      const response = new Response('OK')

      const corsResponse = cors.addCorsHeaders(request, response)

      expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
    })

    it('should add credentials header when enabled', () => {
      const cors = new CorsMiddleware({ credentials: true })
      const request = new Request('https://api.example.com/test', {
        headers: { Origin: 'https://example.com' },
      })
      const response = new Response('OK')

      const corsResponse = cors.addCorsHeaders(request, response)

      expect(corsResponse.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    })

    it('should add exposed headers when configured', () => {
      const cors = new CorsMiddleware({ exposedHeaders: ['X-Request-Id', 'X-Total-Count'] })
      const request = new Request('https://api.example.com/test', {
        headers: { Origin: 'https://example.com' },
      })
      const response = new Response('OK')

      const corsResponse = cors.addCorsHeaders(request, response)

      expect(corsResponse.headers.get('Access-Control-Expose-Headers')).toContain('X-Request-Id')
    })

    it('should not add headers for disallowed origin', () => {
      const cors = new CorsMiddleware({ origins: 'https://allowed.com' })
      const request = new Request('https://api.example.com/test', {
        headers: { Origin: 'https://disallowed.com' },
      })
      const response = new Response('OK')

      const corsResponse = cors.addCorsHeaders(request, response)

      expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBeNull()
    })
  })

  // ============================================================================
  // Middleware Handler Tests
  // ============================================================================

  describe('handler', () => {
    it('should handle OPTIONS preflight', async () => {
      const cors = new CorsMiddleware()
      const handler = cors.handler()

      const request = new Request('https://api.example.com/test', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
        },
      })

      const response = await handler(request, {} as any, {} as any, async () => new Response('OK'))

      expect(response.status).toBe(204)
    })

    it('should add CORS headers to non-OPTIONS requests', async () => {
      const cors = new CorsMiddleware()
      const handler = cors.handler()

      const request = new Request('https://api.example.com/test', {
        method: 'POST',
        headers: { Origin: 'https://example.com' },
      })

      const response = await handler(request, {} as any, {} as any, async () => new Response('OK'))

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('should call next handler for non-OPTIONS requests', async () => {
      const cors = new CorsMiddleware()
      const handler = cors.handler()
      const next = vi.fn().mockResolvedValue(new Response('Next called'))

      const request = new Request('https://api.example.com/test', {
        method: 'POST',
        headers: { Origin: 'https://example.com' },
      })

      const response = await handler(request, {} as any, {} as any, next)

      expect(next).toHaveBeenCalled()
      expect(await response.text()).toBe('Next called')
    })
  })

  // ============================================================================
  // Origin Validation Tests
  // ============================================================================

  describe('origin validation', () => {
    it('should allow all origins with wildcard', () => {
      const cors = new CorsMiddleware({ origins: '*' })
      const request = new Request('https://api.example.com/test', {
        headers: { Origin: 'https://any-origin.com' },
      })
      const response = new Response('OK')

      const corsResponse = cors.addCorsHeaders(request, response)

      expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('should allow matching origin from array', () => {
      const cors = new CorsMiddleware({
        origins: ['https://app1.example.com', 'https://app2.example.com'],
      })
      const request = new Request('https://api.example.com/test', {
        headers: { Origin: 'https://app2.example.com' },
      })
      const response = new Response('OK')

      const corsResponse = cors.addCorsHeaders(request, response)

      expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://app2.example.com')
    })

    it('should handle requests without Origin header', () => {
      const cors = new CorsMiddleware({ origins: 'https://example.com' })
      const request = new Request('https://api.example.com/test')
      const response = new Response('OK')

      const corsResponse = cors.addCorsHeaders(request, response)

      // Same-origin requests don't have Origin header, should pass through
      expect(corsResponse).toBeDefined()
    })
  })
})
