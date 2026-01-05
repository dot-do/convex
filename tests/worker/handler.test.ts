/**
 * ConvexWorker Handler Tests - Layer 9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConvexWorker, createWorker, type WorkerConfig } from '../../src/worker/handler'
import type { WorkerEnv } from '../../src/worker/types'

// Mock Durable Object stub
const mockDOStub = {
  fetch: vi.fn(),
}

// Mock environment
const mockEnv: WorkerEnv = {
  CONVEX_DATABASE: {
    idFromName: vi.fn().mockReturnValue('mock-id'),
    get: vi.fn().mockReturnValue(mockDOStub),
  } as any,
}

// Mock execution context
const mockCtx: ExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
}

describe('ConvexWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDOStub.fetch.mockResolvedValue(new Response('{}'))
  })

  // ============================================================================
  // Basic Request Handling Tests
  // ============================================================================

  describe('basic request handling', () => {
    it('should return 404 for unmatched routes', async () => {
      const worker = new ConvexWorker()
      const request = new Request('https://api.example.com/unknown')

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body).toEqual({ error: 'Not found' })
    })

    it('should handle /api/query endpoint', async () => {
      const worker = new ConvexWorker()
      mockDOStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({ value: { id: '1', name: 'Test' } }))
      )

      const request = new Request('https://api.example.com/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'users:get', args: { id: '1' } }),
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.ok).toBe(true)
      expect(mockDOStub.fetch).toHaveBeenCalled()
    })

    it('should handle /api/mutation endpoint', async () => {
      const worker = new ConvexWorker()
      mockDOStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({ value: { success: true } }))
      )

      const request = new Request('https://api.example.com/api/mutation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'users:create', args: { name: 'Test' } }),
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.ok).toBe(true)
      expect(mockDOStub.fetch).toHaveBeenCalled()
    })

    it('should handle /api/action endpoint', async () => {
      const worker = new ConvexWorker()
      mockDOStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({ value: { result: 'processed' } }))
      )

      const request = new Request('https://api.example.com/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'email:send', args: { to: 'test@example.com' } }),
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.ok).toBe(true)
      expect(mockDOStub.fetch).toHaveBeenCalled()
    })

    it('should reject non-POST requests to API endpoints', async () => {
      const worker = new ConvexWorker()

      const request = new Request('https://api.example.com/api/query', {
        method: 'GET',
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(405)
    })

    it('should reject invalid JSON body', async () => {
      const worker = new ConvexWorker()

      const request = new Request('https://api.example.com/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBe('Invalid JSON body')
    })
  })

  // ============================================================================
  // WebSocket Tests
  // ============================================================================

  describe('WebSocket handling', () => {
    it('should forward WebSocket upgrade requests to Durable Object', async () => {
      const worker = new ConvexWorker()
      // WebSocket upgrade responses have status 101 but we can't create that with standard Response
      // So we just verify the fetch was called correctly
      mockDOStub.fetch.mockResolvedValue(new Response(null, { status: 200 }))

      const request = new Request('https://api.example.com/sync', {
        headers: { Upgrade: 'websocket' },
      })

      await worker.fetch(request, mockEnv, mockCtx)

      expect(mockDOStub.fetch).toHaveBeenCalledWith(request)
    })
  })

  // ============================================================================
  // Authorization Tests
  // ============================================================================

  describe('authorization', () => {
    it('should forward Authorization header to Durable Object', async () => {
      const worker = new ConvexWorker()
      mockDOStub.fetch.mockResolvedValue(new Response('{}'))

      const request = new Request('https://api.example.com/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ path: 'users:get', args: {} }),
      })

      await worker.fetch(request, mockEnv, mockCtx)

      const calledRequest = mockDOStub.fetch.mock.calls[0][0] as Request
      expect(calledRequest.headers.get('Authorization')).toBe('Bearer test-token')
    })
  })

  // ============================================================================
  // CORS Middleware Tests
  // ============================================================================

  describe('CORS middleware', () => {
    it('should add CORS headers when enabled', async () => {
      const worker = new ConvexWorker({ cors: true })

      const request = new Request('https://api.example.com/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://app.example.com',
        },
        body: JSON.stringify({ path: 'test', args: {} }),
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('should handle OPTIONS preflight with CORS enabled', async () => {
      const worker = new ConvexWorker({ cors: true })

      const request = new Request('https://api.example.com/api/query', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.example.com',
          'Access-Control-Request-Method': 'POST',
        },
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    })

    it('should use custom CORS options', async () => {
      const worker = new ConvexWorker({
        cors: {
          origins: 'https://specific-origin.com',
          credentials: true,
        },
      })

      const request = new Request('https://api.example.com/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://specific-origin.com',
        },
        body: JSON.stringify({ path: 'test', args: {} }),
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://specific-origin.com')
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    })
  })

  // ============================================================================
  // Rate Limiting Tests
  // ============================================================================

  describe('rate limiting', () => {
    it('should apply rate limiting when enabled', async () => {
      const worker = new ConvexWorker({ rateLimit: { limit: 2 } })

      const createRequest = () =>
        new Request('https://api.example.com/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '192.168.1.1',
          },
          body: JSON.stringify({ path: 'test', args: {} }),
        })

      // First two requests should succeed
      const response1 = await worker.fetch(createRequest(), mockEnv, mockCtx)
      const response2 = await worker.fetch(createRequest(), mockEnv, mockCtx)

      expect(response1.headers.get('X-RateLimit-Remaining')).toBe('1')
      expect(response2.headers.get('X-RateLimit-Remaining')).toBe('0')

      // Third request should be blocked
      const response3 = await worker.fetch(createRequest(), mockEnv, mockCtx)

      expect(response3.status).toBe(429)
    })
  })

  // ============================================================================
  // Custom Middleware Tests
  // ============================================================================

  describe('custom middleware', () => {
    it('should execute custom middleware in order', async () => {
      const calls: string[] = []

      const worker = new ConvexWorker({
        middleware: [
          async (req, env, ctx, next) => {
            calls.push('middleware1-before')
            const response = await next()
            calls.push('middleware1-after')
            return response
          },
          async (req, env, ctx, next) => {
            calls.push('middleware2-before')
            const response = await next()
            calls.push('middleware2-after')
            return response
          },
        ],
      })

      const request = new Request('https://api.example.com/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'test', args: {} }),
      })

      await worker.fetch(request, mockEnv, mockCtx)

      expect(calls).toEqual([
        'middleware1-before',
        'middleware2-before',
        'middleware2-after',
        'middleware1-after',
      ])
    })

    it('should allow middleware to modify response', async () => {
      const worker = new ConvexWorker({
        middleware: [
          async (req, env, ctx, next) => {
            const response = await next()
            const newResponse = new Response(response.body, response)
            newResponse.headers.set('X-Custom-Header', 'custom-value')
            return newResponse
          },
        ],
      })

      const request = new Request('https://api.example.com/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'test', args: {} }),
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.headers.get('X-Custom-Header')).toBe('custom-value')
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      const worker = new ConvexWorker()
      mockDOStub.fetch.mockRejectedValue(new Error('Database error'))

      const request = new Request('https://api.example.com/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'test', args: {} }),
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(response.status).toBe(500)
    })

    it('should use custom error handler when middleware throws', async () => {
      const customErrorHandler = vi.fn().mockReturnValue(
        new Response('Custom error', { status: 503 })
      )

      const worker = new ConvexWorker({
        onError: customErrorHandler,
        middleware: [
          async () => {
            throw new Error('Middleware error')
          },
        ],
      })

      const request = new Request('https://api.example.com/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'test', args: {} }),
      })

      const response = await worker.fetch(request, mockEnv, mockCtx)

      expect(customErrorHandler).toHaveBeenCalled()
      expect(response.status).toBe(503)
    })
  })
})

// ============================================================================
// createWorker Factory Tests
// ============================================================================

describe('createWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDOStub.fetch.mockResolvedValue(new Response('{}'))
  })

  it('should create a worker with default config', () => {
    const worker = createWorker()

    expect(worker).toBeDefined()
    expect(typeof worker.fetch).toBe('function')
  })

  it('should create a worker with custom config', () => {
    const worker = createWorker({
      cors: true,
      rateLimit: { limit: 100 },
    })

    expect(worker).toBeDefined()
    expect(typeof worker.fetch).toBe('function')
  })

  it('should handle requests through the created worker', async () => {
    const worker = createWorker()

    const request = new Request('https://api.example.com/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'test', args: {} }),
    })

    const response = await worker.fetch(request, mockEnv, mockCtx)

    expect(response).toBeDefined()
  })
})
