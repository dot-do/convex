/**
 * TDD Tests for ConvexHttpClient
 *
 * These tests define the expected behavior for the ConvexHttpClient class
 * that provides HTTP-based function calls without real-time subscriptions.
 *
 * Layer 7: Client SDK
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ConvexHttpClient,
  type HttpClientOptions,
  ConvexError,
} from '../../src/client/http'
import type { FunctionReference } from '../../src/server/functions/api'

// ============================================================================
// Mock Fetch Implementation
// ============================================================================

/**
 * Create a mock fetch function for testing.
 */
function createMockFetch(responses: Map<string, () => Response | Promise<Response>>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = url.toString()
    for (const [pattern, responseFactory] of responses) {
      if (urlString.includes(pattern)) {
        return responseFactory()
      }
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  })
}

/**
 * Create a successful JSON response.
 */
function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Create an error response.
 */
function errorResponse(error: string, status = 400): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock function reference for testing.
 */
function createFunctionRef<Type extends 'query' | 'mutation' | 'action', Args, Returns>(
  type: Type,
  path: string
): FunctionReference<Type, Args, Returns> {
  return {
    _type: type,
    _args: undefined as unknown as Args,
    _returns: undefined as unknown as Returns,
    _path: path,
    _visibility: 'public',
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('ConvexHttpClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create a client with a deployment URL', () => {
      const client = new ConvexHttpClient('https://my-app.convex.cloud')
      expect(client).toBeDefined()
    })

    it('should accept URLs with trailing slash', () => {
      const client = new ConvexHttpClient('https://my-app.convex.cloud/')
      expect(client).toBeDefined()
    })

    it('should accept custom fetch implementation', () => {
      const customFetch = vi.fn()
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: customFetch,
      })
      expect(client).toBeDefined()
    })

    it('should accept timeout configuration', () => {
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        timeout: 60000,
      })
      expect(client).toBeDefined()
    })

    it('should accept auth token in constructor', () => {
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        authToken: 'my-token',
      })
      expect(client).toBeDefined()
    })

    it('should throw for empty URL', () => {
      expect(() => new ConvexHttpClient('')).toThrow()
    })

    it('should throw for invalid URL', () => {
      expect(() => new ConvexHttpClient('not-a-url')).toThrow()
    })

    it('should store the URL', () => {
      const client = new ConvexHttpClient('https://my-app.convex.cloud')
      expect(client.url).toBe('https://my-app.convex.cloud')
    })

    it('should normalize URL by removing trailing slash', () => {
      const client = new ConvexHttpClient('https://my-app.convex.cloud/')
      expect(client.url).toBe('https://my-app.convex.cloud')
    })
  })

  // ============================================================================
  // Authentication Tests
  // ============================================================================

  describe('authentication', () => {
    describe('setAuth()', () => {
      it('should set the authentication token', async () => {
        const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ result: 'ok' }))
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        client.setAuth('my-token')

        const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
        await client.query(ref, {})

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer my-token',
            }),
          })
        )
      })

      it('should replace existing token', async () => {
        const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ result: 'ok' }))
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        client.setAuth('old-token')
        client.setAuth('new-token')

        const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
        await client.query(ref, {})

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer new-token',
            }),
          })
        )
      })
    })

    describe('clearAuth()', () => {
      it('should clear the authentication token', async () => {
        const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ result: 'ok' }))
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        client.setAuth('my-token')
        client.clearAuth()

        const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
        await client.query(ref, {})

        const callArgs = mockFetch.mock.calls[0][1] as RequestInit
        expect(callArgs.headers).not.toHaveProperty('Authorization')
      })

      it('should be safe to call when no token is set', () => {
        const client = new ConvexHttpClient('https://my-app.convex.cloud')
        expect(() => client.clearAuth()).not.toThrow()
      })
    })

    describe('constructor auth token', () => {
      it('should use auth token from constructor options', async () => {
        const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ result: 'ok' }))
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
          authToken: 'constructor-token',
        })

        const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
        await client.query(ref, {})

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer constructor-token',
            }),
          })
        )
      })
    })
  })

  // ============================================================================
  // Query Tests
  // ============================================================================

  describe('query()', () => {
    it('should execute a query with FunctionReference', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({ value: { name: 'test' } })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', { id: string }, { name: string }>(
        'query',
        'users:get'
      )
      const result = await client.query(ref, { id: '123' })

      expect(result).toEqual({ name: 'test' })
    })

    it('should execute a query with string function path', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({ value: [{ id: '1' }, { id: '2' }] })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const result = await client.query('users:list' as any, {})
      expect(result).toEqual([{ id: '1' }, { id: '2' }])
    })

    it('should send POST request to /api/query endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: null }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', {}, null>('query', 'test:get')
      await client.query(ref, {})

      expect(mockFetch).toHaveBeenCalledWith(
        'https://my-app.convex.cloud/api/query',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('should send function path and args in request body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: null }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', { id: string }, null>('query', 'users:get')
      await client.query(ref, { id: '123' })

      const callArgs = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(callArgs.body as string)

      expect(body.path).toBe('users:get')
      expect(body.args).toEqual({ id: '123' })
    })

    it('should include Content-Type header', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: null }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', {}, null>('query', 'test:get')
      await client.query(ref, {})

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('should handle query with no arguments', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: [] }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', Record<string, never>, string[]>('query', 'items:list')
      const result = await client.query(ref)

      expect(result).toEqual([])
    })

    it('should return the value from response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({ value: { id: '123', name: 'Test' } })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', { id: string }, { id: string; name: string }>(
        'query',
        'users:get'
      )
      const result = await client.query(ref, { id: '123' })

      expect(result).toEqual({ id: '123', name: 'Test' })
    })
  })

  // ============================================================================
  // Mutation Tests
  // ============================================================================

  describe('mutation()', () => {
    it('should execute a mutation with FunctionReference', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({ value: { id: 'new-id' } })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'mutation', { name: string }, { id: string }>(
        'mutation',
        'users:create'
      )
      const result = await client.mutation(ref, { name: 'Test User' })

      expect(result).toEqual({ id: 'new-id' })
    })

    it('should execute a mutation with string function path', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: true }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const result = await client.mutation('users:delete' as any, { id: '123' })
      expect(result).toBe(true)
    })

    it('should send POST request to /api/mutation endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: null }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'mutation', {}, null>('mutation', 'test:run')
      await client.mutation(ref, {})

      expect(mockFetch).toHaveBeenCalledWith(
        'https://my-app.convex.cloud/api/mutation',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('should send function path and args in request body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: null }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'mutation', { name: string; email: string }, null>(
        'mutation',
        'users:create'
      )
      await client.mutation(ref, { name: 'John', email: 'john@test.com' })

      const callArgs = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(callArgs.body as string)

      expect(body.path).toBe('users:create')
      expect(body.args).toEqual({ name: 'John', email: 'john@test.com' })
    })

    it('should handle mutation returning void', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: null }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'mutation', { id: string }, void>('mutation', 'items:delete')
      const result = await client.mutation(ref, { id: '123' })

      expect(result).toBeNull()
    })
  })

  // ============================================================================
  // Action Tests
  // ============================================================================

  describe('action()', () => {
    it('should execute an action with FunctionReference', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({ value: 'Generated content' })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'action', { prompt: string }, string>(
        'action',
        'ai:generate'
      )
      const result = await client.action(ref, { prompt: 'Hello' })

      expect(result).toBe('Generated content')
    })

    it('should execute an action with string function path', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({ value: { url: 'https://example.com' } })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const result = await client.action('files:upload' as any, { data: 'base64...' })
      expect(result).toEqual({ url: 'https://example.com' })
    })

    it('should send POST request to /api/action endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: null }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'action', {}, null>('action', 'test:run')
      await client.action(ref, {})

      expect(mockFetch).toHaveBeenCalledWith(
        'https://my-app.convex.cloud/api/action',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('should handle action with complex return type', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({
          value: {
            items: [{ id: '1' }, { id: '2' }],
            total: 2,
            metadata: { page: 1 },
          },
        })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<
        'action',
        {},
        { items: { id: string }[]; total: number; metadata: { page: number } }
      >('action', 'search:execute')
      const result = await client.action(ref, {})

      expect(result).toEqual({
        items: [{ id: '1' }, { id: '2' }],
        total: 2,
        metadata: { page: 1 },
      })
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    describe('ConvexError', () => {
      it('should throw ConvexError for application errors', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              errorType: 'ConvexError',
              errorMessage: 'User not found',
              errorData: { code: 'NOT_FOUND', userId: '123' },
            }),
            { status: 400 }
          )
        )
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        const ref = createFunctionRef<'query', { id: string }, null>('query', 'users:get')

        await expect(client.query(ref, { id: '123' })).rejects.toThrow(ConvexError)
      })

      it('should include error data in ConvexError', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              errorType: 'ConvexError',
              errorMessage: 'Validation failed',
              errorData: { field: 'email', reason: 'invalid format' },
            }),
            { status: 400 }
          )
        )
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        const ref = createFunctionRef<'mutation', {}, null>('mutation', 'users:create')

        try {
          await client.mutation(ref, {})
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(ConvexError)
          expect((error as ConvexError<{ field: string; reason: string }>).data).toEqual({
            field: 'email',
            reason: 'invalid format',
          })
        }
      })
    })

    describe('network errors', () => {
      it('should throw on network failure', async () => {
        const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        const ref = createFunctionRef<'query', {}, null>('query', 'test:get')

        await expect(client.query(ref, {})).rejects.toThrow('Network error')
      })

      it('should throw on DNS failure', async () => {
        const mockFetch = vi.fn().mockRejectedValue(
          new Error('getaddrinfo ENOTFOUND my-app.convex.cloud')
        )
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        const ref = createFunctionRef<'query', {}, null>('query', 'test:get')

        await expect(client.query(ref, {})).rejects.toThrow()
      })
    })

    describe('HTTP errors', () => {
      it('should throw on 500 server error', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
          })
        )
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        const ref = createFunctionRef<'query', {}, null>('query', 'test:get')

        await expect(client.query(ref, {})).rejects.toThrow()
      })

      it('should throw on 401 unauthorized', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
          })
        )
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        const ref = createFunctionRef<'query', {}, null>('query', 'test:get')

        await expect(client.query(ref, {})).rejects.toThrow(/Unauthorized/)
      })

      it('should throw on 403 forbidden', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
          })
        )
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        const ref = createFunctionRef<'query', {}, null>('query', 'test:get')

        await expect(client.query(ref, {})).rejects.toThrow(/Forbidden/)
      })

      it('should throw on 404 not found', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Function not found' }), {
            status: 404,
          })
        )
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        const ref = createFunctionRef<'query', {}, null>('query', 'nonexistent:get')

        await expect(client.query(ref, {})).rejects.toThrow(/not found/i)
      })

      it('should include error message from response', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({ error: 'Custom error message from server' }),
            { status: 400 }
          )
        )
        const client = new ConvexHttpClient('https://my-app.convex.cloud', {
          fetch: mockFetch,
        })

        const ref = createFunctionRef<'query', {}, null>('query', 'test:get')

        await expect(client.query(ref, {})).rejects.toThrow(
          'Custom error message from server'
        )
      })
    })
  })

  // ============================================================================
  // Timeout Tests
  // ============================================================================

  describe('timeout', () => {
    it('should timeout after configured duration', async () => {
      // Create a fetch that respects abort signal
      const mockFetch = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((resolve, reject) => {
            const signal = init?.signal
            if (signal) {
              signal.addEventListener('abort', () => {
                const abortError = new Error('The operation was aborted')
                abortError.name = 'AbortError'
                reject(abortError)
              })
            }
            // Never resolves otherwise
          })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        timeout: 5000,
      })

      const ref = createFunctionRef<'query', {}, null>('query', 'test:slow')
      const queryPromise = client.query(ref, {})

      await vi.advanceTimersByTimeAsync(6000)

      await expect(queryPromise).rejects.toThrow(/timeout/i)
    })

    it('should use default timeout of 30 seconds', async () => {
      // Create a fetch that respects abort signal
      const mockFetch = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((resolve, reject) => {
            const signal = init?.signal
            if (signal) {
              signal.addEventListener('abort', () => {
                const abortError = new Error('The operation was aborted')
                abortError.name = 'AbortError'
                reject(abortError)
              })
            }
            // Never resolves otherwise
          })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', {}, null>('query', 'test:slow')
      const queryPromise = client.query(ref, {})

      await vi.advanceTimersByTimeAsync(31000)

      await expect(queryPromise).rejects.toThrow(/timeout/i)
    })

    it('should cancel request on timeout', async () => {
      let abortSignal: AbortSignal | undefined
      const mockFetch = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) => {
          abortSignal = init?.signal
          return new Promise((resolve, reject) => {
            if (init?.signal) {
              init.signal.addEventListener('abort', () => {
                const abortError = new Error('The operation was aborted')
                abortError.name = 'AbortError'
                reject(abortError)
              })
            }
            // Never resolves otherwise
          })
        }
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        timeout: 5000,
      })

      const ref = createFunctionRef<'query', {}, null>('query', 'test:slow')
      const queryPromise = client.query(ref, {})

      await vi.advanceTimersByTimeAsync(6000)

      try {
        await queryPromise
      } catch {
        // Expected
      }

      expect(abortSignal?.aborted).toBe(true)
    })

    it('should not timeout when request completes in time', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(jsonResponse({ value: 'success' }))
      })
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        timeout: 5000,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:fast')
      const result = await client.query(ref, {})

      expect(result).toBe('success')
    })
  })

  // ============================================================================
  // Retry Tests
  // ============================================================================

  describe('retry', () => {
    it('should retry on 503 service unavailable', async () => {
      let callCount = 0
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'Service unavailable' }), {
              status: 503,
            })
          )
        }
        return Promise.resolve(jsonResponse({ value: 'success' }))
      })

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        retries: 3,
        retryDelay: 100,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
      const resultPromise = client.query(ref, {})

      // Advance through retries
      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(200)

      const result = await resultPromise
      expect(result).toBe('success')
      expect(callCount).toBe(3)
    })

    it('should retry on 429 too many requests', async () => {
      let callCount = 0
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 2) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'Too many requests' }), {
              status: 429,
              headers: { 'Retry-After': '1' },
            })
          )
        }
        return Promise.resolve(jsonResponse({ value: 'success' }))
      })

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        retries: 2,
        retryDelay: 100,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
      const resultPromise = client.query(ref, {})

      await vi.advanceTimersByTimeAsync(200)

      const result = await resultPromise
      expect(result).toBe('success')
    })

    it('should use exponential backoff', async () => {
      const delays: number[] = []
      let lastCallTime = Date.now()
      let callCount = 0

      const mockFetch = vi.fn().mockImplementation(() => {
        const now = Date.now()
        if (callCount > 0) {
          delays.push(now - lastCallTime)
        }
        lastCallTime = now
        callCount++

        if (callCount < 4) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'Service unavailable' }), {
              status: 503,
            })
          )
        }
        return Promise.resolve(jsonResponse({ value: 'success' }))
      })

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        retries: 4,
        retryDelay: 100,
        retryBackoff: 'exponential',
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
      const resultPromise = client.query(ref, {})

      // Advance through exponential backoff: 100, 200, 400
      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(200)
      await vi.advanceTimersByTimeAsync(400)

      await resultPromise

      // Delays should be increasing (exponential)
      expect(delays[1]).toBeGreaterThan(delays[0])
      expect(delays[2]).toBeGreaterThan(delays[1])
    })

    it('should throw after max retries exceeded', async () => {
      // Return a new Response for each call (body can only be consumed once)
      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Service unavailable' }), {
            status: 503,
          })
        )
      )

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        retries: 3,
        retryDelay: 100,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
      const resultPromise = client.query(ref, {})

      // Advance through all retries (linear backoff: 100, 200, 300)
      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(200)
      await vi.advanceTimersByTimeAsync(300)

      await expect(resultPromise).rejects.toThrow()
      expect(mockFetch).toHaveBeenCalledTimes(4) // Initial + 3 retries
    })

    it('should not retry on 400 client errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Bad request' }), {
          status: 400,
        })
      )

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        retries: 3,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')

      await expect(client.query(ref, {})).rejects.toThrow()
      expect(mockFetch).toHaveBeenCalledTimes(1) // No retries
    })

    it('should retry on network errors', async () => {
      let callCount = 0
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 2) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve(jsonResponse({ value: 'success' }))
      })

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        retries: 2,
        retryDelay: 100,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
      const resultPromise = client.query(ref, {})

      await vi.advanceTimersByTimeAsync(200)

      const result = await resultPromise
      expect(result).toBe('success')
    })
  })

  // ============================================================================
  // Batching Tests
  // ============================================================================

  describe('batching', () => {
    it('should batch multiple concurrent queries', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { value: { id: '1', name: 'User 1' } },
            { value: { id: '2', name: 'User 2' } },
            { value: [{ id: '1' }, { id: '2' }] },
          ],
        })
      )

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        batchDelay: 10,
      })

      const ref1 = createFunctionRef<'query', { id: string }, { id: string; name: string }>(
        'query',
        'users:get'
      )
      const ref2 = createFunctionRef<'query', { id: string }, { id: string; name: string }>(
        'query',
        'users:get'
      )
      const ref3 = createFunctionRef<'query', {}, { id: string }[]>('query', 'users:list')

      // Start all queries without awaiting
      const promise1 = client.query(ref1, { id: '1' })
      const promise2 = client.query(ref2, { id: '2' })
      const promise3 = client.query(ref3, {})

      // Advance past batch delay
      await vi.advanceTimersByTimeAsync(15)

      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])

      expect(result1).toEqual({ id: '1', name: 'User 1' })
      expect(result2).toEqual({ id: '2', name: 'User 2' })
      expect(result3).toEqual([{ id: '1' }, { id: '2' }])

      // Should have made only one fetch call
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should send batch request to /api/query/batch endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({ results: [{ value: 'a' }, { value: 'b' }] })
      )

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        batchDelay: 10,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')

      const promise1 = client.query(ref, {})
      const promise2 = client.query(ref, {})

      await vi.advanceTimersByTimeAsync(15)
      await Promise.all([promise1, promise2])

      expect(mockFetch).toHaveBeenCalledWith(
        'https://my-app.convex.cloud/api/query/batch',
        expect.any(Object)
      )
    })

    it('should include all queries in batch request body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({ results: [{ value: 'a' }, { value: 'b' }] })
      )

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        batchDelay: 10,
      })

      const ref1 = createFunctionRef<'query', { id: string }, string>('query', 'users:get')
      const ref2 = createFunctionRef<'query', {}, string[]>('query', 'users:list')

      const promise1 = client.query(ref1, { id: '123' })
      const promise2 = client.query(ref2, {})

      await vi.advanceTimersByTimeAsync(15)
      await Promise.all([promise1, promise2])

      const callArgs = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(callArgs.body as string)

      expect(body.queries).toHaveLength(2)
      expect(body.queries[0]).toEqual({ path: 'users:get', args: { id: '123' } })
      expect(body.queries[1]).toEqual({ path: 'users:list', args: {} })
    })

    it('should handle batch with some failed queries', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { value: 'success' },
            { error: 'Not found', errorType: 'ConvexError' },
          ],
        })
      )

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        batchDelay: 10,
      })

      const ref1 = createFunctionRef<'query', {}, string>('query', 'test:success')
      const ref2 = createFunctionRef<'query', {}, string>('query', 'test:fail')

      const promise1 = client.query(ref1, {})
      const promise2 = client.query(ref2, {})

      await vi.advanceTimersByTimeAsync(15)

      // Use Promise.allSettled to wait for both without unhandled rejection
      const results = await Promise.allSettled([promise1, promise2])

      expect(results[0].status).toBe('fulfilled')
      expect((results[0] as PromiseFulfilledResult<string>).value).toBe('success')

      expect(results[1].status).toBe('rejected')
    })

    it('should not batch when batching is disabled', async () => {
      // Return a new Response for each call (body can only be consumed once)
      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve(jsonResponse({ value: 'result' }))
      )

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        batchDelay: 0, // Disabled
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')

      await Promise.all([client.query(ref, {}), client.query(ref, {})])

      // Should have made separate fetch calls
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should flush batch when max size is reached', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({
          results: Array(5)
            .fill(null)
            .map((_, i) => ({ value: `result-${i}` })),
        })
      )

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        batchDelay: 1000, // Long delay
        maxBatchSize: 5,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')

      // Start 5 queries - should trigger immediate batch
      const promises = Array(5)
        .fill(null)
        .map(() => client.query(ref, {}))

      // Should batch immediately without waiting for delay
      await Promise.all(promises)

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  // ============================================================================
  // Custom Fetch Tests
  // ============================================================================

  describe('custom fetch', () => {
    it('should use custom fetch implementation', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        jsonResponse({ value: 'custom result' })
      )

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: customFetch,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
      const result = await client.query(ref, {})

      expect(customFetch).toHaveBeenCalled()
      expect(result).toBe('custom result')
    })

    it('should pass through headers from custom fetch', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: 'result' }), {
          status: 200,
          headers: {
            'X-Custom-Header': 'custom-value',
            'Content-Type': 'application/json',
          },
        })
      )

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: customFetch,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
      await client.query(ref, {})

      expect(customFetch).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // URL Handling Tests
  // ============================================================================

  describe('URL handling', () => {
    it('should handle URLs with paths', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud/api/v1', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
      await client.query(ref, {})

      expect(mockFetch).toHaveBeenCalledWith(
        'https://my-app.convex.cloud/api/v1/api/query',
        expect.any(Object)
      )
    })

    it('should handle localhost URLs', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }))
      const client = new ConvexHttpClient('http://localhost:3000', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
      await client.query(ref, {})

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/query',
        expect.any(Object)
      )
    })

    it('should handle URLs with ports', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud:8080', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')
      await client.query(ref, {})

      expect(mockFetch).toHaveBeenCalledWith(
        'https://my-app.convex.cloud:8080/api/query',
        expect.any(Object)
      )
    })
  })

  // ============================================================================
  // Type Safety Tests
  // ============================================================================

  describe('type safety', () => {
    it('should maintain type safety with FunctionReference', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({ value: { id: '123', name: 'Test', age: 25 } })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      type UserArgs = { id: string }
      type User = { id: string; name: string; age: number }

      const ref = createFunctionRef<'query', UserArgs, User>('query', 'users:get')
      const result = await client.query(ref, { id: '123' })

      // TypeScript should know result is User
      expect(result.id).toBe('123')
      expect(result.name).toBe('Test')
      expect(result.age).toBe(25)
    })

    it('should work with optional args', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: [] }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', Record<string, never>, string[]>('query', 'items:list')
      const result = await client.query(ref)

      expect(result).toEqual([])
    })
  })

  // ============================================================================
  // Concurrent Request Tests
  // ============================================================================

  describe('concurrent requests', () => {
    it('should handle multiple concurrent requests', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/query')) {
          return Promise.resolve(jsonResponse({ value: 'query result' }))
        }
        if (url.includes('/api/mutation')) {
          return Promise.resolve(jsonResponse({ value: 'mutation result' }))
        }
        if (url.includes('/api/action')) {
          return Promise.resolve(jsonResponse({ value: 'action result' }))
        }
        return Promise.resolve(errorResponse('Not found', 404))
      })

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        batchDelay: 0, // Disable batching
      })

      const queryRef = createFunctionRef<'query', {}, string>('query', 'test:query')
      const mutationRef = createFunctionRef<'mutation', {}, string>('mutation', 'test:mutation')
      const actionRef = createFunctionRef<'action', {}, string>('action', 'test:action')

      const [queryResult, mutationResult, actionResult] = await Promise.all([
        client.query(queryRef, {}),
        client.mutation(mutationRef, {}),
        client.action(actionRef, {}),
      ])

      expect(queryResult).toBe('query result')
      expect(mutationResult).toBe('mutation result')
      expect(actionResult).toBe('action result')
    })

    it('should maintain auth token across concurrent requests', async () => {
      const capturedHeaders: Record<string, string>[] = []
      const mockFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        capturedHeaders.push(init?.headers as Record<string, string>)
        return Promise.resolve(jsonResponse({ value: 'ok' }))
      })

      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
        batchDelay: 0,
      })

      client.setAuth('my-token')

      const ref = createFunctionRef<'query', {}, string>('query', 'test:get')

      await Promise.all([
        client.query(ref, {}),
        client.query(ref, {}),
        client.query(ref, {}),
      ])

      capturedHeaders.forEach((headers) => {
        expect(headers.Authorization).toBe('Bearer my-token')
      })
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty response body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('', { status: 200 })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', {}, null>('query', 'test:get')

      await expect(client.query(ref, {})).rejects.toThrow()
    })

    it('should handle malformed JSON response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', {}, null>('query', 'test:get')

      await expect(client.query(ref, {})).rejects.toThrow()
    })

    it('should handle null value in response', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: null }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', {}, null>('query', 'test:get')
      const result = await client.query(ref, {})

      expect(result).toBeNull()
    })

    it('should handle undefined args', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', Record<string, never>, string>('query', 'test:get')
      const result = await client.query(ref, undefined as any)

      expect(result).toBe('ok')
    })

    it('should handle deeply nested function paths', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', {}, string>('query', 'admin/users/roles:list')
      await client.query(ref, {})

      const callArgs = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(callArgs.body as string)

      expect(body.path).toBe('admin/users/roles:list')
    })

    it('should handle special characters in args', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const ref = createFunctionRef<'query', { text: string }, string>('query', 'test:get')
      await client.query(ref, { text: 'Hello "World" <script>alert(1)</script> \n\t' })

      const callArgs = mockFetch.mock.calls[0][1] as RequestInit
      const body = JSON.parse(callArgs.body as string)

      expect(body.args.text).toBe('Hello "World" <script>alert(1)</script> \n\t')
    })

    it('should handle large payloads', async () => {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 'ok' }))
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {
        fetch: mockFetch,
      })

      const largeArray = Array(10000)
        .fill(null)
        .map((_, i) => ({ id: i, data: 'x'.repeat(100) }))

      const ref = createFunctionRef<'mutation', { items: typeof largeArray }, string>(
        'mutation',
        'bulk:insert'
      )
      await client.mutation(ref, { items: largeArray })

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // ConvexError Class Tests
  // ============================================================================

  describe('ConvexError class', () => {
    it('should create ConvexError with string data', () => {
      const error = new ConvexError('Something went wrong')

      expect(error).toBeInstanceOf(ConvexError)
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('ConvexError')
      expect(error.data).toBe('Something went wrong')
      expect(error.message).toBe('Something went wrong')
    })

    it('should create ConvexError with object data', () => {
      const errorData = { code: 'NOT_FOUND', userId: '123' }
      const error = new ConvexError(errorData)

      expect(error.data).toEqual(errorData)
      expect(error.message).toBe(JSON.stringify(errorData))
    })

    it('should preserve stack trace', () => {
      const error = new ConvexError('test')

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('ConvexError')
    })
  })

  // ============================================================================
  // Options Type Tests
  // ============================================================================

  describe('HttpClientOptions', () => {
    it('should accept all option properties', () => {
      const options: HttpClientOptions = {
        fetch: vi.fn(),
        timeout: 60000,
        authToken: 'token',
        retries: 3,
        retryDelay: 100,
        retryBackoff: 'exponential',
        batchDelay: 10,
        maxBatchSize: 10,
      }

      const client = new ConvexHttpClient('https://my-app.convex.cloud', options)
      expect(client).toBeDefined()
    })

    it('should work with minimal options', () => {
      const client = new ConvexHttpClient('https://my-app.convex.cloud', {})
      expect(client).toBeDefined()
    })

    it('should work without options', () => {
      const client = new ConvexHttpClient('https://my-app.convex.cloud')
      expect(client).toBeDefined()
    })
  })
})
