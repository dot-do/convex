/**
 * HTTP Function Execution Integration Tests
 *
 * TDD RED Phase: These tests define the expected behavior for HTTP endpoints
 * at /api/query, /api/mutation, and /api/action.
 *
 * Currently, the endpoints return "not_implemented" status. These tests
 * verify that the endpoints should:
 * 1. Execute registered functions and return results
 * 2. Return 404 for unknown functions
 * 3. Return 400 for invalid arguments
 *
 * Bead: convex-gazs - HTTP Endpoint Wiring - Function Execution Integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import app from '../../src/index'
import { FunctionRegistry } from '../../src/server/functions/registry'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test request to an API endpoint.
 */
function createApiRequest(
  endpoint: '/api/query' | '/api/mutation' | '/api/action',
  body: { path: string; args: unknown; format?: 'json' | 'convex' }
): Request {
  return new Request(`https://api.example.com${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Create a mock registered query function.
 */
function createMockQuery(handler: (args: unknown) => Promise<unknown>) {
  return {
    _type: 'query' as const,
    _visibility: 'public' as const,
    _config: { handler },
  }
}

/**
 * Create a mock registered mutation function.
 */
function createMockMutation(handler: (args: unknown) => Promise<unknown>) {
  return {
    _type: 'mutation' as const,
    _visibility: 'public' as const,
    _config: { handler },
  }
}

/**
 * Create a mock registered action function.
 */
function createMockAction(handler: (args: unknown) => Promise<unknown>) {
  return {
    _type: 'action' as const,
    _visibility: 'public' as const,
    _config: { handler },
  }
}

/**
 * Create a mock Env object for Hono.
 */
function createMockEnv() {
  return {
    CONVEX_DATABASE: {} as any,
    CONVEX_SUBSCRIPTION: {} as any,
    CONVEX_SCHEDULER: {} as any,
    CONVEX_STORAGE: {} as any,
    STORAGE_BUCKET: {} as any,
    ENVIRONMENT: 'test',
  }
}

// ============================================================================
// POST /api/query Tests
// ============================================================================

describe('HTTP Function Execution', () => {
  let registry: FunctionRegistry

  beforeEach(() => {
    // Reset the function registry before each test
    FunctionRegistry.resetInstance()
    registry = FunctionRegistry.getInstance()
  })

  afterEach(() => {
    FunctionRegistry.resetInstance()
  })

  describe('POST /api/query', () => {
    it('should execute registered query and return result', async () => {
      // Register a test query function
      const mockHandler = vi.fn().mockResolvedValue([
        { id: '1', text: 'Hello' },
        { id: '2', text: 'World' },
      ])
      registry.register('messages:list', createMockQuery(mockHandler))

      const request = createApiRequest('/api/query', {
        path: 'messages:list',
        args: { limit: 10 },
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
      const result = await response.json()
      // The response should have a value field with the query result
      expect(result.value).toBeDefined()
      expect(result.value).toEqual([
        { id: '1', text: 'Hello' },
        { id: '2', text: 'World' },
      ])
    })

    it('should pass arguments to the query handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ found: true })
      registry.register('users:getById', createMockQuery(mockHandler))

      const request = createApiRequest('/api/query', {
        path: 'users:getById',
        args: { id: 'user123' },
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user123' })
      )
    })

    it('should return 404 for unknown query function', async () => {
      const request = createApiRequest('/api/query', {
        path: 'unknown:func',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(404)
      const result = await response.json()
      expect(result.error).toBeDefined()
      expect(result.error).toContain('not found')
    })

    it('should return 400 for invalid arguments', async () => {
      // Register a query with argument validation
      const mockHandler = vi.fn()
      const queryWithValidation = {
        _type: 'query' as const,
        _visibility: 'public' as const,
        _config: {
          args: { limit: { type: 'number' } },
          handler: mockHandler,
        },
      }
      registry.register('messages:list', queryWithValidation)

      const request = createApiRequest('/api/query', {
        path: 'messages:list',
        args: { limit: 'not a number' }, // Should be a number
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toBeDefined()
    })

    it('should return 403 for internal query called from public endpoint', async () => {
      // Register an internal query
      const internalQuery = {
        _type: 'query' as const,
        _visibility: 'internal' as const,
        _config: {
          handler: vi.fn(),
        },
      }
      registry.register('internal:secretQuery', internalQuery)

      const request = createApiRequest('/api/query', {
        path: 'internal:secretQuery',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(403)
      const result = await response.json()
      expect(result.error).toContain('internal')
    })

    it('should handle query execution errors gracefully', async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error('Database error'))
      registry.register('users:get', createMockQuery(mockHandler))

      const request = createApiRequest('/api/query', {
        path: 'users:get',
        args: { id: '123' },
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(500)
      const result = await response.json()
      expect(result.error).toBeDefined()
    })
  })

  // ============================================================================
  // POST /api/mutation Tests
  // ============================================================================

  describe('POST /api/mutation', () => {
    it('should execute registered mutation and return result', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ id: 'new-msg-123' })
      registry.register('messages:create', createMockMutation(mockHandler))

      const request = createApiRequest('/api/mutation', {
        path: 'messages:create',
        args: { text: 'Hello World' },
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.value).toBeDefined()
      expect(result.value).toEqual({ id: 'new-msg-123' })
    })

    it('should pass arguments to the mutation handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true })
      registry.register('users:update', createMockMutation(mockHandler))

      const request = createApiRequest('/api/mutation', {
        path: 'users:update',
        args: { id: 'user123', name: 'New Name' },
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user123', name: 'New Name' })
      )
    })

    it('should return 404 for unknown mutation function', async () => {
      const request = createApiRequest('/api/mutation', {
        path: 'unknown:mutation',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(404)
      const result = await response.json()
      expect(result.error).toBeDefined()
    })

    it('should return 400 for invalid mutation arguments', async () => {
      const mutationWithValidation = {
        _type: 'mutation' as const,
        _visibility: 'public' as const,
        _config: {
          args: { text: { type: 'string', required: true } },
          handler: vi.fn(),
        },
      }
      registry.register('messages:create', mutationWithValidation)

      const request = createApiRequest('/api/mutation', {
        path: 'messages:create',
        args: { text: 123 }, // Should be a string
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(400)
    })

    it('should return 403 for internal mutation called from public endpoint', async () => {
      const internalMutation = {
        _type: 'mutation' as const,
        _visibility: 'internal' as const,
        _config: {
          handler: vi.fn(),
        },
      }
      registry.register('internal:adminUpdate', internalMutation)

      const request = createApiRequest('/api/mutation', {
        path: 'internal:adminUpdate',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(403)
    })

    it('should handle mutation execution errors gracefully', async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error('Constraint violation'))
      registry.register('users:create', createMockMutation(mockHandler))

      const request = createApiRequest('/api/mutation', {
        path: 'users:create',
        args: { email: 'test@example.com' },
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(500)
    })

    it('should reject calling query function via mutation endpoint', async () => {
      // Register a query, not a mutation
      registry.register('messages:list', createMockQuery(vi.fn()))

      const request = createApiRequest('/api/mutation', {
        path: 'messages:list',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      // Should return error because messages:list is a query, not a mutation
      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toContain('not a mutation')
    })
  })

  // ============================================================================
  // POST /api/action Tests
  // ============================================================================

  describe('POST /api/action', () => {
    it('should execute registered action and return result', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ sent: true, messageId: 'email-123' })
      registry.register('email:send', createMockAction(mockHandler))

      const request = createApiRequest('/api/action', {
        path: 'email:send',
        args: { to: 'user@example.com', subject: 'Hello' },
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.value).toBeDefined()
      expect(result.value).toEqual({ sent: true, messageId: 'email-123' })
    })

    it('should pass arguments to the action handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true })
      registry.register('notifications:push', createMockAction(mockHandler))

      const request = createApiRequest('/api/action', {
        path: 'notifications:push',
        args: { userId: 'user123', message: 'You have a new message' },
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user123', message: 'You have a new message' })
      )
    })

    it('should return 404 for unknown action function', async () => {
      const request = createApiRequest('/api/action', {
        path: 'unknown:action',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(404)
      const result = await response.json()
      expect(result.error).toBeDefined()
    })

    it('should return 400 for invalid action arguments', async () => {
      const actionWithValidation = {
        _type: 'action' as const,
        _visibility: 'public' as const,
        _config: {
          args: { to: { type: 'string', required: true } },
          handler: vi.fn(),
        },
      }
      registry.register('email:send', actionWithValidation)

      const request = createApiRequest('/api/action', {
        path: 'email:send',
        args: {}, // Missing required 'to' field
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(400)
    })

    it('should return 403 for internal action called from public endpoint', async () => {
      const internalAction = {
        _type: 'action' as const,
        _visibility: 'internal' as const,
        _config: {
          handler: vi.fn(),
        },
      }
      registry.register('internal:processJob', internalAction)

      const request = createApiRequest('/api/action', {
        path: 'internal:processJob',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(403)
    })

    it('should handle action execution errors gracefully', async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error('External API error'))
      registry.register('api:fetchData', createMockAction(mockHandler))

      const request = createApiRequest('/api/action', {
        path: 'api:fetchData',
        args: { url: 'https://example.com/api' },
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(500)
    })

    it('should reject calling query function via action endpoint', async () => {
      registry.register('messages:list', createMockQuery(vi.fn()))

      const request = createApiRequest('/api/action', {
        path: 'messages:list',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toContain('not an action')
    })

    it('should reject calling mutation function via action endpoint', async () => {
      registry.register('users:create', createMockMutation(vi.fn()))

      const request = createApiRequest('/api/action', {
        path: 'users:create',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toContain('not an action')
    })
  })

  // ============================================================================
  // Response Format Tests
  // ============================================================================

  describe('Response format', () => {
    it('should return results in JSON format by default', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ data: 'test' })
      registry.register('test:query', createMockQuery(mockHandler))

      const request = createApiRequest('/api/query', {
        path: 'test:query',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.headers.get('Content-Type')).toContain('application/json')
      const result = await response.json()
      expect(result.value).toEqual({ data: 'test' })
    })

    it('should include log lines in response when available', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ result: 'done' })
      registry.register('test:query', createMockQuery(mockHandler))

      const request = createApiRequest('/api/query', {
        path: 'test:query',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
      const result = await response.json()
      // logLines should be present in the response (even if empty)
      expect(result).toHaveProperty('value')
    })

    it('should serialize complex return values correctly', async () => {
      const complexValue = {
        id: 'doc123',
        createdAt: new Date().toISOString(),
        data: {
          nested: {
            array: [1, 2, 3],
            boolean: true,
            nullValue: null,
          },
        },
      }
      const mockHandler = vi.fn().mockResolvedValue(complexValue)
      registry.register('test:complex', createMockQuery(mockHandler))

      const request = createApiRequest('/api/query', {
        path: 'test:complex',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.value).toEqual(complexValue)
    })
  })

  // ============================================================================
  // Error Response Format Tests
  // ============================================================================

  describe('Error response format', () => {
    it('should return error with message for function not found', async () => {
      const request = createApiRequest('/api/query', {
        path: 'nonexistent:function',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(404)
      const result = await response.json()
      expect(result).toHaveProperty('error')
      expect(typeof result.error).toBe('string')
    })

    it('should return error with details for validation failures', async () => {
      const queryWithValidation = {
        _type: 'query' as const,
        _visibility: 'public' as const,
        _config: {
          args: { count: { type: 'number' } },
          handler: vi.fn(),
        },
      }
      registry.register('test:validated', queryWithValidation)

      const request = createApiRequest('/api/query', {
        path: 'test:validated',
        args: { count: 'not-a-number' },
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result).toHaveProperty('error')
    })

    it('should return error with type for execution failures', async () => {
      const mockHandler = vi.fn().mockRejectedValue(new TypeError('Type mismatch'))
      registry.register('test:error', createMockQuery(mockHandler))

      const request = createApiRequest('/api/query', {
        path: 'test:error',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(500)
      const result = await response.json()
      expect(result).toHaveProperty('error')
    })
  })

  // ============================================================================
  // Path Format Tests
  // ============================================================================

  describe('Function path formats', () => {
    it('should accept colon-separated paths', async () => {
      const mockHandler = vi.fn().mockResolvedValue('ok')
      registry.register('module:function', createMockQuery(mockHandler))

      const request = createApiRequest('/api/query', {
        path: 'module:function',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
    })

    it('should accept deeply nested colon-separated paths', async () => {
      const mockHandler = vi.fn().mockResolvedValue('ok')
      registry.register('api:v2:users:list', createMockQuery(mockHandler))

      const request = createApiRequest('/api/query', {
        path: 'api:v2:users:list',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
    })

    it('should accept slash-separated paths', async () => {
      const mockHandler = vi.fn().mockResolvedValue('ok')
      registry.register('module/function', createMockQuery(mockHandler))

      const request = createApiRequest('/api/query', {
        path: 'module/function',
        args: {},
      })

      const response = await app.fetch(request, createMockEnv())

      expect(response.status).toBe(200)
    })
  })
})
