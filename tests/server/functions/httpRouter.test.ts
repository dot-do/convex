/**
 * TDD Tests for HTTP Router and HTTP Endpoints (Layer 4)
 *
 * Tests the httpRouter() factory function and httpAction() for creating
 * custom HTTP endpoints in Convex. The HTTP router handles webhooks,
 * custom APIs, and other HTTP-based integrations.
 *
 * @see Layer 4 - Server Functions and HTTP Endpoints
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  httpRouter,
  httpAction,
  HttpRouter,
  type HttpMethod,
  type HttpActionCtx,
  type HttpActionHandler,
  type RegisteredHttpAction,
  type RouteDefinition,
} from '../../../src/server/httpRouter'

// ============================================================================
// Mock Implementations
// ============================================================================

/**
 * Create a mock HttpActionCtx for testing
 */
function createMockHttpActionCtx(): HttpActionCtx {
  return {
    runQuery: vi.fn().mockResolvedValue([]),
    runMutation: vi.fn().mockResolvedValue('doc-123'),
    runAction: vi.fn().mockResolvedValue({ success: true }),
    storage: {
      getUrl: vi.fn().mockResolvedValue('https://storage.example.com/file.jpg'),
      generateUploadUrl: vi.fn().mockResolvedValue('https://upload.example.com/upload'),
    },
  }
}

/**
 * Create a mock Request object for testing
 */
function createMockRequest(
  method: string,
  url: string,
  options?: {
    headers?: Record<string, string>
    body?: string
  }
): Request {
  return new Request(url, {
    method,
    headers: options?.headers,
    body: options?.body,
  })
}

// ============================================================================
// httpRouter() Factory Function Tests
// ============================================================================

describe('httpRouter()', () => {
  describe('creation', () => {
    it('should create an HTTP router instance', () => {
      const router = httpRouter()
      expect(router).toBeDefined()
      expect(router).toBeInstanceOf(HttpRouter)
    })

    it('should return a new router each time', () => {
      const router1 = httpRouter()
      const router2 = httpRouter()
      expect(router1).not.toBe(router2)
    })

    it('should create router with no routes initially', () => {
      const router = httpRouter()
      expect(router.getRoutes()).toHaveLength(0)
    })
  })
})

// ============================================================================
// HttpRouter Class Tests
// ============================================================================

describe('HttpRouter', () => {
  let router: HttpRouter

  beforeEach(() => {
    router = httpRouter()
  })

  // ============================================================================
  // Route Registration Tests
  // ============================================================================

  describe('route() method', () => {
    it('should register a route with path, method, and handler', () => {
      const handler = httpAction(async () => new Response('OK'))

      router.route({
        path: '/api/users',
        method: 'GET',
        handler,
      })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(1)
      expect(routes[0].path).toBe('/api/users')
      expect(routes[0].method).toBe('GET')
    })

    it('should return the router for chaining', () => {
      const handler = httpAction(async () => new Response('OK'))

      const result = router.route({
        path: '/api/test',
        method: 'POST',
        handler,
      })

      expect(result).toBe(router)
    })

    it('should register multiple routes', () => {
      const handler = httpAction(async () => new Response('OK'))

      router
        .route({ path: '/api/users', method: 'GET', handler })
        .route({ path: '/api/users', method: 'POST', handler })
        .route({ path: '/api/items', method: 'GET', handler })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(3)
    })

    it('should allow same path with different methods', () => {
      const handler = httpAction(async () => new Response('OK'))

      router
        .route({ path: '/api/resource', method: 'GET', handler })
        .route({ path: '/api/resource', method: 'POST', handler })
        .route({ path: '/api/resource', method: 'PUT', handler })
        .route({ path: '/api/resource', method: 'DELETE', handler })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(4)
      expect(routes.map(r => r.method)).toContain('GET')
      expect(routes.map(r => r.method)).toContain('POST')
      expect(routes.map(r => r.method)).toContain('PUT')
      expect(routes.map(r => r.method)).toContain('DELETE')
    })
  })

  // ============================================================================
  // HTTP Method Shorthand Tests
  // ============================================================================

  describe('HTTP method shorthands', () => {
    const methods: Array<{ name: keyof HttpRouter; method: HttpMethod }> = [
      { name: 'get', method: 'GET' },
      { name: 'post', method: 'POST' },
      { name: 'put', method: 'PUT' },
      { name: 'patch', method: 'PATCH' },
      { name: 'delete', method: 'DELETE' },
      { name: 'options', method: 'OPTIONS' },
      { name: 'head', method: 'HEAD' },
    ]

    methods.forEach(({ name, method }) => {
      it(`should support ${name}() shorthand for ${method} requests`, () => {
        const handler = httpAction(async () => new Response('OK'))

        // @ts-expect-error - dynamic method call
        router[name]('/api/test', handler)

        const routes = router.getRoutes()
        expect(routes).toHaveLength(1)
        expect(routes[0].method).toBe(method)
        expect(routes[0].path).toBe('/api/test')
      })

      it(`${name}() should return router for chaining`, () => {
        const handler = httpAction(async () => new Response('OK'))

        // @ts-expect-error - dynamic method call
        const result = router[name]('/api/test', handler)

        expect(result).toBe(router)
      })
    })
  })

  // ============================================================================
  // Route Matching Tests
  // ============================================================================

  describe('match() method', () => {
    it('should match exact path and method', () => {
      const handler = httpAction(async () => new Response('OK'))
      router.route({ path: '/api/users', method: 'GET', handler })

      const request = createMockRequest('GET', 'https://example.com/api/users')
      const match = router.match(request)

      expect(match).not.toBeNull()
      expect(match?.path).toBe('/api/users')
      expect(match?.method).toBe('GET')
    })

    it('should return null for non-matching path', () => {
      const handler = httpAction(async () => new Response('OK'))
      router.route({ path: '/api/users', method: 'GET', handler })

      const request = createMockRequest('GET', 'https://example.com/api/items')
      const match = router.match(request)

      expect(match).toBeNull()
    })

    it('should return null for non-matching method', () => {
      const handler = httpAction(async () => new Response('OK'))
      router.route({ path: '/api/users', method: 'GET', handler })

      const request = createMockRequest('POST', 'https://example.com/api/users')
      const match = router.match(request)

      expect(match).toBeNull()
    })

    it('should match with path parameters', () => {
      const handler = httpAction(async () => new Response('OK'))
      router.route({ path: '/api/users/:id', method: 'GET', handler })

      const request = createMockRequest('GET', 'https://example.com/api/users/123')
      const match = router.match(request)

      expect(match).not.toBeNull()
      expect(match?.path).toBe('/api/users/:id')
    })

    it('should match with multiple path parameters', () => {
      const handler = httpAction(async () => new Response('OK'))
      router.route({ path: '/api/users/:userId/posts/:postId', method: 'GET', handler })

      const request = createMockRequest('GET', 'https://example.com/api/users/123/posts/456')
      const match = router.match(request)

      expect(match).not.toBeNull()
      expect(match?.path).toBe('/api/users/:userId/posts/:postId')
    })

    it('should not match when path segment count differs', () => {
      const handler = httpAction(async () => new Response('OK'))
      router.route({ path: '/api/users/:id', method: 'GET', handler })

      const request = createMockRequest('GET', 'https://example.com/api/users/123/extra')
      const match = router.match(request)

      expect(match).toBeNull()
    })

    it('should match first registered route when multiple match', () => {
      const handler1 = httpAction(async () => new Response('First'))
      const handler2 = httpAction(async () => new Response('Second'))

      router.route({ path: '/api/users/:id', method: 'GET', handler: handler1 })
      router.route({ path: '/api/users/123', method: 'GET', handler: handler2 })

      const request = createMockRequest('GET', 'https://example.com/api/users/123')
      const match = router.match(request)

      expect(match?.path).toBe('/api/users/:id')
    })
  })

  // ============================================================================
  // Path Parameter Extraction Tests
  // ============================================================================

  describe('extractParams() method', () => {
    it('should extract single path parameter', () => {
      const params = router.extractParams('/api/users/:id', '/api/users/123')

      expect(params).toEqual({ id: '123' })
    })

    it('should extract multiple path parameters', () => {
      const params = router.extractParams(
        '/api/users/:userId/posts/:postId',
        '/api/users/user-123/posts/post-456'
      )

      expect(params).toEqual({
        userId: 'user-123',
        postId: 'post-456',
      })
    })

    it('should return empty object for no parameters', () => {
      const params = router.extractParams('/api/users', '/api/users')

      expect(params).toEqual({})
    })

    it('should handle parameters at different positions', () => {
      const params = router.extractParams(
        '/:org/projects/:project/files/:file',
        '/acme/projects/website/files/index.html'
      )

      expect(params).toEqual({
        org: 'acme',
        project: 'website',
        file: 'index.html',
      })
    })

    it('should handle URL-encoded parameter values', () => {
      const params = router.extractParams(
        '/api/search/:query',
        '/api/search/hello%20world'
      )

      expect(params).toEqual({ query: 'hello%20world' })
    })
  })

  // ============================================================================
  // getRoutes() Tests
  // ============================================================================

  describe('getRoutes() method', () => {
    it('should return empty array initially', () => {
      const routes = router.getRoutes()
      expect(routes).toEqual([])
    })

    it('should return all registered routes', () => {
      const handler = httpAction(async () => new Response('OK'))

      router
        .route({ path: '/a', method: 'GET', handler })
        .route({ path: '/b', method: 'POST', handler })
        .route({ path: '/c', method: 'PUT', handler })

      const routes = router.getRoutes()
      expect(routes).toHaveLength(3)
    })

    it('should return readonly array', () => {
      const routes = router.getRoutes()
      expect(Array.isArray(routes)).toBe(true)
    })
  })
})

// ============================================================================
// httpAction() Tests
// ============================================================================

describe('httpAction()', () => {
  describe('creation', () => {
    it('should create a registered HTTP action', () => {
      const handler = httpAction(async () => new Response('OK'))

      expect(handler).toBeDefined()
      expect(handler._type).toBe('httpAction')
    })

    it('should wrap the handler function', () => {
      const handlerFn: HttpActionHandler = async () => new Response('Test')
      const action = httpAction(handlerFn)

      expect(action._config.handler).toBe(handlerFn)
    })

    it('should have default empty path and GET method', () => {
      const action = httpAction(async () => new Response('OK'))

      expect(action._config.path).toBe('')
      expect(action._config.method).toBe('GET')
    })
  })

  describe('handler execution', () => {
    it('should provide ctx with runQuery method', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('GET', 'https://example.com/api/users')

      const action = httpAction(async (ctx, req) => {
        const users = await ctx.runQuery({} as any, {})
        return new Response(JSON.stringify(users))
      })

      const response = await action._config.handler(ctx, request)
      expect(ctx.runQuery).toHaveBeenCalled()
    })

    it('should provide ctx with runMutation method', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('POST', 'https://example.com/api/users', {
        body: JSON.stringify({ name: 'Test User' }),
      })

      const action = httpAction(async (ctx, req) => {
        const body = await req.json()
        const id = await ctx.runMutation({} as any, body)
        return new Response(JSON.stringify({ id }))
      })

      const response = await action._config.handler(ctx, request)
      expect(ctx.runMutation).toHaveBeenCalled()
    })

    it('should provide ctx with runAction method', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('POST', 'https://example.com/api/webhook')

      const action = httpAction(async (ctx, req) => {
        await ctx.runAction({} as any, {})
        return new Response('OK')
      })

      await action._config.handler(ctx, request)
      expect(ctx.runAction).toHaveBeenCalled()
    })

    it('should provide ctx with storage operations', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('GET', 'https://example.com/api/file/123')

      const action = httpAction(async (ctx, req) => {
        const url = await ctx.storage.getUrl('file-123')
        return new Response(url || 'Not found')
      })

      await action._config.handler(ctx, request)
      expect(ctx.storage.getUrl).toHaveBeenCalledWith('file-123')
    })

    it('should provide ctx with generateUploadUrl', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('POST', 'https://example.com/api/upload')

      const action = httpAction(async (ctx, req) => {
        const uploadUrl = await ctx.storage.generateUploadUrl()
        return new Response(JSON.stringify({ uploadUrl }))
      })

      await action._config.handler(ctx, request)
      expect(ctx.storage.generateUploadUrl).toHaveBeenCalled()
    })
  })
})

// ============================================================================
// Request/Response Handling Tests
// ============================================================================

describe('Request/Response handling', () => {
  describe('Request object access', () => {
    it('should provide access to request URL', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('GET', 'https://example.com/api/test?foo=bar')

      let capturedUrl: string | undefined
      const action = httpAction(async (ctx, req) => {
        capturedUrl = req.url
        return new Response('OK')
      })

      await action._config.handler(ctx, request)
      expect(capturedUrl).toBe('https://example.com/api/test?foo=bar')
    })

    it('should provide access to request method', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('POST', 'https://example.com/api/test')

      let capturedMethod: string | undefined
      const action = httpAction(async (ctx, req) => {
        capturedMethod = req.method
        return new Response('OK')
      })

      await action._config.handler(ctx, request)
      expect(capturedMethod).toBe('POST')
    })

    it('should provide access to request headers', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('GET', 'https://example.com/api/test', {
        headers: {
          'Authorization': 'Bearer token123',
          'X-Custom-Header': 'custom-value',
        },
      })

      let authHeader: string | null = null
      let customHeader: string | null = null
      const action = httpAction(async (ctx, req) => {
        authHeader = req.headers.get('Authorization')
        customHeader = req.headers.get('X-Custom-Header')
        return new Response('OK')
      })

      await action._config.handler(ctx, request)
      expect(authHeader).toBe('Bearer token123')
      expect(customHeader).toBe('custom-value')
    })

    it('should provide access to request body', async () => {
      const ctx = createMockHttpActionCtx()
      const body = JSON.stringify({ name: 'Test', value: 42 })
      const request = createMockRequest('POST', 'https://example.com/api/test', {
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      let capturedBody: any
      const action = httpAction(async (ctx, req) => {
        capturedBody = await req.json()
        return new Response('OK')
      })

      await action._config.handler(ctx, request)
      expect(capturedBody).toEqual({ name: 'Test', value: 42 })
    })

    it('should provide access to text body', async () => {
      const ctx = createMockHttpActionCtx()
      const body = 'Plain text body'
      const request = createMockRequest('POST', 'https://example.com/api/test', {
        headers: { 'Content-Type': 'text/plain' },
        body,
      })

      let capturedBody: string | undefined
      const action = httpAction(async (ctx, req) => {
        capturedBody = await req.text()
        return new Response('OK')
      })

      await action._config.handler(ctx, request)
      expect(capturedBody).toBe('Plain text body')
    })

    it('should provide access to query parameters via URL', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('GET', 'https://example.com/api/search?q=test&limit=10')

      let searchQuery: string | null = null
      let limit: string | null = null
      const action = httpAction(async (ctx, req) => {
        const url = new URL(req.url)
        searchQuery = url.searchParams.get('q')
        limit = url.searchParams.get('limit')
        return new Response('OK')
      })

      await action._config.handler(ctx, request)
      expect(searchQuery).toBe('test')
      expect(limit).toBe('10')
    })
  })

  describe('Response creation', () => {
    it('should support returning JSON response', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('GET', 'https://example.com/api/test')

      const action = httpAction(async () => {
        return new Response(JSON.stringify({ message: 'Success' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const response = await action._config.handler(ctx, request)
      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(await response.json()).toEqual({ message: 'Success' })
    })

    it('should support returning plain text response', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('GET', 'https://example.com/api/test')

      const action = httpAction(async () => {
        return new Response('Hello, World!', {
          headers: { 'Content-Type': 'text/plain' },
        })
      })

      const response = await action._config.handler(ctx, request)
      expect(await response.text()).toBe('Hello, World!')
    })

    it('should support returning HTML response', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('GET', 'https://example.com/page')

      const action = httpAction(async () => {
        return new Response('<html><body>Hello</body></html>', {
          headers: { 'Content-Type': 'text/html' },
        })
      })

      const response = await action._config.handler(ctx, request)
      expect(response.headers.get('Content-Type')).toBe('text/html')
    })

    it('should support setting custom status codes', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('POST', 'https://example.com/api/test')

      const action = httpAction(async () => {
        return new Response(JSON.stringify({ id: '123' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const response = await action._config.handler(ctx, request)
      expect(response.status).toBe(201)
    })

    it('should support setting multiple headers', async () => {
      const ctx = createMockHttpActionCtx()
      const request = createMockRequest('GET', 'https://example.com/api/test')

      const action = httpAction(async () => {
        return new Response('OK', {
          headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'max-age=3600',
            'X-Custom-Header': 'custom-value',
          },
        })
      })

      const response = await action._config.handler(ctx, request)
      expect(response.headers.get('Cache-Control')).toBe('max-age=3600')
      expect(response.headers.get('X-Custom-Header')).toBe('custom-value')
    })
  })
})

// ============================================================================
// CORS Headers Tests
// ============================================================================

describe('CORS headers', () => {
  it('should allow setting Access-Control-Allow-Origin', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/test')

    const action = httpAction(async () => {
      return new Response('OK', {
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('should allow setting specific origin', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/test')

    const action = httpAction(async () => {
      return new Response('OK', {
        headers: {
          'Access-Control-Allow-Origin': 'https://app.example.com',
        },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
  })

  it('should allow setting allowed methods', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('OPTIONS', 'https://example.com/api/test')

    const action = httpAction(async () => {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE')
  })

  it('should allow setting allowed headers', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('OPTIONS', 'https://example.com/api/test')

    const action = httpAction(async () => {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization')
  })

  it('should support preflight OPTIONS handling', async () => {
    const router = httpRouter()
    const preflight = httpAction(async () => {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      })
    })

    router.options('/api/test', preflight)

    const routes = router.getRoutes()
    expect(routes).toHaveLength(1)
    expect(routes[0].method).toBe('OPTIONS')
  })

  it('should allow credentials header', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/test')

    const action = httpAction(async () => {
      return new Response('OK', {
        headers: {
          'Access-Control-Allow-Origin': 'https://app.example.com',
          'Access-Control-Allow-Credentials': 'true',
        },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })
})

// ============================================================================
// Error Response Tests
// ============================================================================

describe('Error responses', () => {
  it('should support returning 400 Bad Request', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('POST', 'https://example.com/api/test')

    const action = httpAction(async () => {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid request' })
  })

  it('should support returning 401 Unauthorized', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/protected')

    const action = httpAction(async () => {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(response.status).toBe(401)
  })

  it('should support returning 403 Forbidden', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/admin')

    const action = httpAction(async () => {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(response.status).toBe(403)
  })

  it('should support returning 404 Not Found', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/users/999')

    const action = httpAction(async () => {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'User not found' })
  })

  it('should support returning 500 Internal Server Error', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/test')

    const action = httpAction(async () => {
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(response.status).toBe(500)
  })

  it('should handle thrown errors gracefully', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/test')

    const action = httpAction(async () => {
      throw new Error('Something went wrong')
    })

    await expect(action._config.handler(ctx, request)).rejects.toThrow('Something went wrong')
  })
})

// ============================================================================
// HTTP Method Handling Tests
// ============================================================================

describe('HTTP method handling', () => {
  describe('GET requests', () => {
    it('should handle GET request for listing resources', async () => {
      const ctx = createMockHttpActionCtx()
      vi.mocked(ctx.runQuery).mockResolvedValue([
        { id: '1', name: 'User 1' },
        { id: '2', name: 'User 2' },
      ])
      const request = createMockRequest('GET', 'https://example.com/api/users')

      const action = httpAction(async (ctx, req) => {
        const users = await ctx.runQuery({} as any, {})
        return new Response(JSON.stringify(users), {
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const response = await action._config.handler(ctx, request)
      const data = await response.json()
      expect(data).toHaveLength(2)
    })

    it('should handle GET request for single resource', async () => {
      const ctx = createMockHttpActionCtx()
      vi.mocked(ctx.runQuery).mockResolvedValue({ id: '123', name: 'Test User' })
      const request = createMockRequest('GET', 'https://example.com/api/users/123')

      const action = httpAction(async (ctx, req) => {
        const user = await ctx.runQuery({} as any, { id: '123' })
        return new Response(JSON.stringify(user), {
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const response = await action._config.handler(ctx, request)
      const data = await response.json()
      expect(data.id).toBe('123')
    })
  })

  describe('POST requests', () => {
    it('should handle POST request for creating resource', async () => {
      const ctx = createMockHttpActionCtx()
      vi.mocked(ctx.runMutation).mockResolvedValue('new-user-id')
      const request = createMockRequest('POST', 'https://example.com/api/users', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New User', email: 'new@example.com' }),
      })

      const action = httpAction(async (ctx, req) => {
        const body = await req.json()
        const id = await ctx.runMutation({} as any, body)
        return new Response(JSON.stringify({ id }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const response = await action._config.handler(ctx, request)
      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.id).toBe('new-user-id')
    })
  })

  describe('PUT requests', () => {
    it('should handle PUT request for replacing resource', async () => {
      const ctx = createMockHttpActionCtx()
      vi.mocked(ctx.runMutation).mockResolvedValue(undefined)
      const request = createMockRequest('PUT', 'https://example.com/api/users/123', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated User', email: 'updated@example.com' }),
      })

      const action = httpAction(async (ctx, req) => {
        const body = await req.json()
        await ctx.runMutation({} as any, { id: '123', ...body })
        return new Response(null, { status: 204 })
      })

      const response = await action._config.handler(ctx, request)
      expect(response.status).toBe(204)
    })
  })

  describe('PATCH requests', () => {
    it('should handle PATCH request for partial update', async () => {
      const ctx = createMockHttpActionCtx()
      vi.mocked(ctx.runMutation).mockResolvedValue({ id: '123', name: 'Updated Name', email: 'old@example.com' })
      const request = createMockRequest('PATCH', 'https://example.com/api/users/123', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' }),
      })

      const action = httpAction(async (ctx, req) => {
        const body = await req.json()
        const updated = await ctx.runMutation({} as any, { id: '123', ...body })
        return new Response(JSON.stringify(updated), {
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const response = await action._config.handler(ctx, request)
      const data = await response.json()
      expect(data.name).toBe('Updated Name')
    })
  })

  describe('DELETE requests', () => {
    it('should handle DELETE request for removing resource', async () => {
      const ctx = createMockHttpActionCtx()
      vi.mocked(ctx.runMutation).mockResolvedValue(undefined)
      const request = createMockRequest('DELETE', 'https://example.com/api/users/123')

      const action = httpAction(async (ctx, req) => {
        await ctx.runMutation({} as any, { id: '123' })
        return new Response(null, { status: 204 })
      })

      const response = await action._config.handler(ctx, request)
      expect(response.status).toBe(204)
    })
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('integration scenarios', () => {
  it('should handle complete REST API workflow', async () => {
    const router = httpRouter()
    const ctx = createMockHttpActionCtx()

    // List users
    const listHandler = httpAction(async (ctx) => {
      const users = await ctx.runQuery({} as any, {})
      return new Response(JSON.stringify(users), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    // Get single user
    const getHandler = httpAction(async (ctx, req) => {
      const url = new URL(req.url)
      const id = url.pathname.split('/').pop()
      const user = await ctx.runQuery({} as any, { id })
      return new Response(JSON.stringify(user), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    // Create user
    const createHandler = httpAction(async (ctx, req) => {
      const body = await req.json()
      const id = await ctx.runMutation({} as any, body)
      return new Response(JSON.stringify({ id }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    // Update user
    const updateHandler = httpAction(async (ctx, req) => {
      const body = await req.json()
      await ctx.runMutation({} as any, body)
      return new Response(null, { status: 204 })
    })

    // Delete user
    const deleteHandler = httpAction(async (ctx, req) => {
      await ctx.runMutation({} as any, {})
      return new Response(null, { status: 204 })
    })

    router
      .route({ path: '/api/users', method: 'GET', handler: listHandler })
      .route({ path: '/api/users/:id', method: 'GET', handler: getHandler })
      .route({ path: '/api/users', method: 'POST', handler: createHandler })
      .route({ path: '/api/users/:id', method: 'PUT', handler: updateHandler })
      .route({ path: '/api/users/:id', method: 'DELETE', handler: deleteHandler })

    expect(router.getRoutes()).toHaveLength(5)

    // Test matching
    const getRequest = createMockRequest('GET', 'https://example.com/api/users/123')
    const match = router.match(getRequest)
    expect(match).not.toBeNull()
    expect(match?.path).toBe('/api/users/:id')
    expect(match?.method).toBe('GET')
  })

  it('should handle webhook processing', async () => {
    const ctx = createMockHttpActionCtx()
    const webhookPayload = {
      event: 'payment.completed',
      data: {
        id: 'payment-123',
        amount: 9999,
        currency: 'usd',
      },
    }
    const request = createMockRequest('POST', 'https://example.com/webhooks/stripe', {
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': 'sig_test_123',
      },
      body: JSON.stringify(webhookPayload),
    })

    const webhookHandler = httpAction(async (ctx, req) => {
      const signature = req.headers.get('Stripe-Signature')
      const body = await req.json()

      // Verify signature (mocked)
      if (!signature) {
        return new Response(JSON.stringify({ error: 'Missing signature' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Process webhook
      await ctx.runMutation({} as any, {
        event: body.event,
        paymentId: body.data.id,
        amount: body.data.amount,
      })

      return new Response(JSON.stringify({ received: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const response = await webhookHandler._config.handler(ctx, request)
    expect(response.status).toBe(200)
    expect(ctx.runMutation).toHaveBeenCalled()
  })

  it('should handle file upload URL generation', async () => {
    const ctx = createMockHttpActionCtx()
    vi.mocked(ctx.storage.generateUploadUrl).mockResolvedValue('https://upload.example.com/unique-id')
    const request = createMockRequest('POST', 'https://example.com/api/upload')

    const uploadHandler = httpAction(async (ctx, req) => {
      const uploadUrl = await ctx.storage.generateUploadUrl()
      return new Response(JSON.stringify({ uploadUrl }), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const response = await uploadHandler._config.handler(ctx, request)
    const data = await response.json()
    expect(data.uploadUrl).toBe('https://upload.example.com/unique-id')
  })

  it('should handle authentication check in endpoint', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/protected', {
      headers: {
        'Authorization': 'Bearer valid-token',
      },
    })

    const protectedHandler = httpAction(async (ctx, req) => {
      const authHeader = req.headers.get('Authorization')

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const token = authHeader.replace('Bearer ', '')
      // Validate token (mocked)
      if (token !== 'valid-token') {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const data = await ctx.runQuery({} as any, {})
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const response = await protectedHandler._config.handler(ctx, request)
    expect(response.status).toBe(200)
  })

  it('should handle streaming response', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/stream')

    const streamHandler = httpAction(async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"event": "start"}\n\n'))
          controller.enqueue(encoder.encode('data: {"event": "data", "value": 1}\n\n'))
          controller.enqueue(encoder.encode('data: {"event": "end"}\n\n'))
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    })

    const response = await streamHandler._config.handler(ctx, request)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.body).toBeInstanceOf(ReadableStream)
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('should handle empty request body', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('POST', 'https://example.com/api/test')

    const action = httpAction(async (ctx, req) => {
      const text = await req.text()
      return new Response(text || 'empty', {
        headers: { 'Content-Type': 'text/plain' },
      })
    })

    const response = await action._config.handler(ctx, request)
    expect(await response.text()).toBe('empty')
  })

  it('should handle special characters in path', () => {
    const router = httpRouter()
    const handler = httpAction(async () => new Response('OK'))

    router.route({
      path: '/api/files/:filename',
      method: 'GET',
      handler,
    })

    const request = createMockRequest('GET', 'https://example.com/api/files/my-file.txt')
    const match = router.match(request)
    expect(match).not.toBeNull()
  })

  it('should handle root path', () => {
    const router = httpRouter()
    const handler = httpAction(async () => new Response('Root'))

    router.route({
      path: '/',
      method: 'GET',
      handler,
    })

    const request = createMockRequest('GET', 'https://example.com/')
    const match = router.match(request)
    expect(match).not.toBeNull()
    expect(match?.path).toBe('/')
  })

  it('should handle trailing slash', () => {
    const router = httpRouter()
    const handler = httpAction(async () => new Response('OK'))

    router.route({
      path: '/api/users/',
      method: 'GET',
      handler,
    })

    // Request without trailing slash should not match (exact matching)
    const request = createMockRequest('GET', 'https://example.com/api/users')
    const match = router.match(request)

    // By default, exact matching is used
    expect(match).toBeNull()
  })

  it('should handle very long paths', () => {
    const router = httpRouter()
    const handler = httpAction(async () => new Response('OK'))

    const longPath = '/api/' + 'nested/'.repeat(20) + 'resource'
    router.route({
      path: longPath,
      method: 'GET',
      handler,
    })

    const request = createMockRequest('GET', 'https://example.com' + longPath)
    const match = router.match(request)
    expect(match).not.toBeNull()
  })

  it('should handle concurrent requests to same route', async () => {
    const ctx = createMockHttpActionCtx()
    let counter = 0

    const action = httpAction(async () => {
      counter++
      const current = counter
      await new Promise(resolve => setTimeout(resolve, 10))
      return new Response(JSON.stringify({ count: current }), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const requests = Array.from({ length: 5 }, () =>
      createMockRequest('GET', 'https://example.com/api/test')
    )

    const responses = await Promise.all(
      requests.map(req => action._config.handler(ctx, req))
    )

    expect(responses).toHaveLength(5)
    for (const response of responses) {
      expect(response.status).toBe(200)
    }
  })
})

// ============================================================================
// Type Safety Tests
// ============================================================================

describe('type safety', () => {
  it('should enforce HttpActionHandler return type', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/test')

    // This should compile - returns Response
    const validAction = httpAction(async () => new Response('OK'))
    const response = await validAction._config.handler(ctx, request)
    expect(response).toBeInstanceOf(Response)
  })

  it('should provide typed context methods', async () => {
    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/test')

    const action = httpAction(async (ctx) => {
      // These should all be available
      expect(typeof ctx.runQuery).toBe('function')
      expect(typeof ctx.runMutation).toBe('function')
      expect(typeof ctx.runAction).toBe('function')
      expect(typeof ctx.storage.getUrl).toBe('function')
      expect(typeof ctx.storage.generateUploadUrl).toBe('function')
      return new Response('OK')
    })

    await action._config.handler(ctx, request)
  })

  it('should enforce valid HTTP methods', () => {
    const router = httpRouter()
    const handler = httpAction(async () => new Response('OK'))

    // Valid methods
    const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']

    validMethods.forEach((method, index) => {
      router.route({
        path: `/api/test${index}`,
        method,
        handler,
      })
    })

    expect(router.getRoutes()).toHaveLength(7)
  })
})

// ============================================================================
// handle() Method Tests
// ============================================================================

describe('handle() method', () => {
  let router: HttpRouter

  beforeEach(() => {
    router = httpRouter()
  })

  it('should execute matched route handler and return response', async () => {
    const handler = httpAction(async () => {
      return new Response(JSON.stringify({ message: 'Hello' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    router.route({ path: '/api/test', method: 'GET', handler })

    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/test')

    const response = await router.handle(ctx, request)
    expect(response).not.toBeNull()
    expect(response?.status).toBe(200)
    const data = await response?.json()
    expect(data.message).toBe('Hello')
  })

  it('should return null for unmatched routes', async () => {
    const handler = httpAction(async () => new Response('OK'))
    router.route({ path: '/api/users', method: 'GET', handler })

    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/items')

    const response = await router.handle(ctx, request)
    expect(response).toBeNull()
  })

  it('should pass context and request to handler', async () => {
    const ctx = createMockHttpActionCtx()
    vi.mocked(ctx.runQuery).mockResolvedValue([{ id: '1' }])

    const handler = httpAction(async (ctx, req) => {
      const data = await ctx.runQuery({} as any, {})
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    router.route({ path: '/api/data', method: 'GET', handler })

    const request = createMockRequest('GET', 'https://example.com/api/data')
    await router.handle(ctx, request)

    expect(ctx.runQuery).toHaveBeenCalled()
  })

  it('should provide path params in request', async () => {
    let capturedParams: Record<string, string> | undefined

    const handler = httpAction(async (ctx, req: any) => {
      capturedParams = req.params
      return new Response('OK')
    })

    router.route({ path: '/api/users/:userId/posts/:postId', method: 'GET', handler })

    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/users/123/posts/456')

    await router.handle(ctx, request)

    expect(capturedParams).toEqual({
      userId: '123',
      postId: '456',
    })
  })

  it('should handle POST request with body', async () => {
    let capturedBody: any

    const handler = httpAction(async (ctx, req) => {
      capturedBody = await req.json()
      return new Response(JSON.stringify({ received: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    router.route({ path: '/api/users', method: 'POST', handler })

    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('POST', 'https://example.com/api/users', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User' }),
    })

    const response = await router.handle(ctx, request)
    expect(response?.status).toBe(201)
    expect(capturedBody).toEqual({ name: 'Test User' })
  })

  it('should handle errors thrown in handler', async () => {
    const handler = httpAction(async () => {
      throw new Error('Handler error')
    })

    router.route({ path: '/api/error', method: 'GET', handler })

    const ctx = createMockHttpActionCtx()
    const request = createMockRequest('GET', 'https://example.com/api/error')

    await expect(router.handle(ctx, request)).rejects.toThrow('Handler error')
  })
})

// ============================================================================
// createRequest Helper Tests
// ============================================================================

describe('createRequest helper', () => {
  it('should create request with path params attached', () => {
    const router = httpRouter()
    const originalRequest = createMockRequest('GET', 'https://example.com/api/users/123')

    const enhancedRequest = router.createRequest(originalRequest, '/api/users/:id')

    expect((enhancedRequest as any).params).toEqual({ id: '123' })
  })

  it('should preserve original request properties', () => {
    const router = httpRouter()
    const originalRequest = createMockRequest('POST', 'https://example.com/api/users/123', {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' },
      body: JSON.stringify({ name: 'Test' }),
    })

    const enhancedRequest = router.createRequest(originalRequest, '/api/users/:id')

    expect(enhancedRequest.method).toBe('POST')
    expect(enhancedRequest.url).toBe('https://example.com/api/users/123')
    expect(enhancedRequest.headers.get('Content-Type')).toBe('application/json')
    expect(enhancedRequest.headers.get('Authorization')).toBe('Bearer token')
  })

  it('should return empty params for static routes', () => {
    const router = httpRouter()
    const originalRequest = createMockRequest('GET', 'https://example.com/api/users')

    const enhancedRequest = router.createRequest(originalRequest, '/api/users')

    expect((enhancedRequest as any).params).toEqual({})
  })
})

// ============================================================================
// Wildcard and Catch-all Route Tests
// ============================================================================

describe('wildcard routes', () => {
  let router: HttpRouter

  beforeEach(() => {
    router = httpRouter()
  })

  it('should support catch-all routes with *', () => {
    const handler = httpAction(async () => new Response('Catch all'))
    router.route({ path: '/api/*', method: 'GET', handler })

    const request = createMockRequest('GET', 'https://example.com/api/any/path/here')
    const match = router.match(request)

    expect(match).not.toBeNull()
  })

  it('should match single-segment wildcard', () => {
    const handler = httpAction(async () => new Response('OK'))
    router.route({ path: '/files/*', method: 'GET', handler })

    const request = createMockRequest('GET', 'https://example.com/files/document.pdf')
    const match = router.match(request)

    expect(match).not.toBeNull()
  })

  it('should capture wildcard path in params', () => {
    const router = httpRouter()
    const params = router.extractParams('/api/*path', '/api/users/123/posts')

    expect(params.path).toBe('users/123/posts')
  })
})

// ============================================================================
// Route Priority and Specificity Tests
// ============================================================================

describe('route priority', () => {
  let router: HttpRouter

  beforeEach(() => {
    router = httpRouter()
  })

  it('should match more specific routes first when registered first', () => {
    const specificHandler = httpAction(async () => new Response('Specific'))
    const genericHandler = httpAction(async () => new Response('Generic'))

    // Register specific route first
    router.route({ path: '/api/users/me', method: 'GET', handler: specificHandler })
    router.route({ path: '/api/users/:id', method: 'GET', handler: genericHandler })

    const request = createMockRequest('GET', 'https://example.com/api/users/me')
    const match = router.match(request)

    expect(match?.path).toBe('/api/users/me')
  })

  it('should respect registration order for overlapping routes', () => {
    const handler1 = httpAction(async () => new Response('First'))
    const handler2 = httpAction(async () => new Response('Second'))

    router.route({ path: '/api/:resource/:id', method: 'GET', handler: handler1 })
    router.route({ path: '/api/users/:userId', method: 'GET', handler: handler2 })

    const request = createMockRequest('GET', 'https://example.com/api/users/123')
    const match = router.match(request)

    // First registered route should match
    expect(match?.path).toBe('/api/:resource/:id')
  })
})

// ============================================================================
// Export Default Tests
// ============================================================================

describe('export as default', () => {
  it('should support exporting router as default', () => {
    const http = httpRouter()
    const handler = httpAction(async () => new Response('OK'))

    http.route({ path: '/test', method: 'GET', handler })

    // Simulating: export default http
    const exportedRouter = http
    expect(exportedRouter.getRoutes()).toHaveLength(1)
  })

  it('should maintain route state when passed around', () => {
    const createRouter = () => {
      const http = httpRouter()
      const handler = httpAction(async () => new Response('OK'))

      http
        .route({ path: '/a', method: 'GET', handler })
        .route({ path: '/b', method: 'POST', handler })

      return http
    }

    const router = createRouter()
    expect(router.getRoutes()).toHaveLength(2)
  })
})
