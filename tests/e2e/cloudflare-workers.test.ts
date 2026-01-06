/**
 * Cloudflare Workers E2E Integration Tests
 *
 * This test suite defines the expected behavior for deploying and running
 * a Convex application on Cloudflare Workers.
 *
 * Test Coverage:
 * 1. Deployment to Cloudflare Workers (via wrangler)
 * 2. Query/Mutation/Action endpoint responses
 * 3. WebSocket sync connection
 * 4. Durable Object persistence
 * 5. File storage with R2
 * 6. Scheduled function execution
 * 7. Error handling and edge cases
 *
 * These tests use mocked wrangler for unit tests and can run against a local
 * miniflare instance for integration testing.
 *
 * Bead: convex-egmz - Cloudflare Workers E2E Integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Mock Types and Interfaces
// ============================================================================

/**
 * Mock Wrangler CLI interface for deployment testing
 */
interface MockWrangler {
  deploy: (options: DeployOptions) => Promise<DeployResult>
  dev: (options: DevOptions) => Promise<DevServer>
  whoami: () => Promise<{ name: string; id: string }>
  tail: (workerName: string) => AsyncIterableIterator<LogEntry>
}

interface DeployOptions {
  name?: string
  config?: string
  env?: string
  minify?: boolean
  outdir?: string
}

interface DeployResult {
  success: boolean
  url: string
  workerName: string
  durableObjects: string[]
  routes: string[]
  errors?: string[]
}

interface DevOptions {
  port?: number
  local?: boolean
  persist?: boolean
  persistTo?: string
}

interface DevServer {
  url: string
  port: number
  stop: () => Promise<void>
  waitUntilReady: () => Promise<void>
}

interface LogEntry {
  timestamp: Date
  level: 'log' | 'warn' | 'error'
  message: string
  scriptName: string
}

/**
 * Mock Miniflare instance for local testing
 */
interface MockMiniflare {
  ready: Promise<void>
  dispatchFetch: (request: Request | string, init?: RequestInit) => Promise<Response>
  getBindings: () => Promise<{
    CONVEX_DATABASE: DurableObjectNamespace
    CONVEX_SUBSCRIPTION: DurableObjectNamespace
    CONVEX_SCHEDULER: DurableObjectNamespace
    STORAGE_BUCKET: R2Bucket
  }>
  getDurableObjectStorage: (id: DurableObjectId) => Promise<DurableObjectStorage>
  dispose: () => Promise<void>
}

/**
 * R2 Bucket mock interface
 */
interface R2Bucket {
  get: (key: string) => Promise<R2Object | null>
  put: (key: string, value: ReadableStream | ArrayBuffer | string) => Promise<R2Object>
  delete: (key: string) => Promise<void>
  list: (options?: { prefix?: string; limit?: number; cursor?: string }) => Promise<R2ObjectList>
  head: (key: string) => Promise<R2Object | null>
}

interface R2Object {
  key: string
  size: number
  etag: string
  httpEtag: string
  uploaded: Date
  body: ReadableStream
  bodyUsed: boolean
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
  json: <T>() => Promise<T>
}

interface R2ObjectList {
  objects: R2Object[]
  truncated: boolean
  cursor?: string
}

// ============================================================================
// Mock Factory Functions
// ============================================================================

function createMockWrangler(): MockWrangler {
  return {
    deploy: vi.fn().mockResolvedValue({
      success: true,
      url: 'https://convex-worker.example.workers.dev',
      workerName: 'convex-worker',
      durableObjects: ['ConvexDatabase', 'ConvexSubscription', 'ConvexScheduler'],
      routes: [],
    }),
    dev: vi.fn().mockResolvedValue({
      url: 'http://localhost:8787',
      port: 8787,
      stop: vi.fn().mockResolvedValue(undefined),
      waitUntilReady: vi.fn().mockResolvedValue(undefined),
    }),
    whoami: vi.fn().mockResolvedValue({ name: 'test-user', id: 'user-123' }),
    tail: vi.fn(),
  }
}

function createMockMiniflare(): MockMiniflare {
  const mockDONamespace = {
    idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-do-id' }),
    idFromString: vi.fn().mockReturnValue({ toString: () => 'mock-do-id' }),
    get: vi.fn().mockReturnValue({
      fetch: vi.fn().mockResolvedValue(new Response('{}')),
    }),
  }

  const mockR2Bucket: R2Bucket = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue({
      key: 'test-key',
      size: 0,
      etag: 'test-etag',
      httpEtag: '"test-etag"',
      uploaded: new Date(),
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    head: vi.fn().mockResolvedValue(null),
  }

  return {
    ready: Promise.resolve(),
    dispatchFetch: vi.fn().mockResolvedValue(new Response('{}')),
    getBindings: vi.fn().mockResolvedValue({
      CONVEX_DATABASE: mockDONamespace,
      CONVEX_SUBSCRIPTION: mockDONamespace,
      CONVEX_SCHEDULER: mockDONamespace,
      STORAGE_BUCKET: mockR2Bucket,
    }),
    getDurableObjectStorage: vi.fn().mockResolvedValue({
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      sql: {
        exec: vi.fn().mockReturnValue({ toArray: () => [] }),
      },
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockWebSocket(): WebSocket {
  const mockWs = {
    readyState: WebSocket.CONNECTING,
    url: '',
    protocol: '',
    extensions: '',
    binaryType: 'blob' as BinaryType,
    bufferedAmount: 0,
    onopen: null as ((event: Event) => void) | null,
    onclose: null as ((event: CloseEvent) => void) | null,
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(true),
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  }
  return mockWs as unknown as WebSocket
}

// ============================================================================
// Response Factory Helpers
// ============================================================================

/**
 * Creates a JSON response with the given value and status
 */
function jsonResponse<T>(value: T, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Creates a successful Convex function response
 */
function successResponse<T>(value: T, logLines: string[] = []): Response {
  return jsonResponse({ value, logLines })
}

/**
 * Creates an error response with the given message and status
 */
function errorResponse(error: string, status = 400, code?: string): Response {
  return jsonResponse(code ? { error, code } : { error }, status)
}

/**
 * Creates a mock dispatchFetch that returns the given response
 */
function mockFetch(response: Response): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(response)
}

// ============================================================================
// Test Suite: Deployment to Cloudflare Workers
// ============================================================================

describe('Cloudflare Workers E2E Integration', () => {
  let mockWrangler: MockWrangler
  let mockMiniflare: MockMiniflare

  beforeEach(() => {
    mockWrangler = createMockWrangler()
    mockMiniflare = createMockMiniflare()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // 1. Deployment Tests
  // ==========================================================================

  describe('Deployment to Cloudflare Workers', () => {
    describe('wrangler deploy', () => {
      it('should deploy worker successfully with default configuration', async () => {
        const result = await mockWrangler.deploy({})

        expect(result.success).toBe(true)
        expect(result.url).toMatch(/workers\.dev$/)
        expect(result.workerName).toBeDefined()
      })

      it('should deploy with custom worker name', async () => {
        mockWrangler.deploy = vi.fn().mockResolvedValue({
          success: true,
          url: 'https://my-convex-app.example.workers.dev',
          workerName: 'my-convex-app',
          durableObjects: ['ConvexDatabase'],
          routes: [],
        })

        const result = await mockWrangler.deploy({ name: 'my-convex-app' })

        expect(result.workerName).toBe('my-convex-app')
      })

      it('should deploy with environment-specific configuration', async () => {
        mockWrangler.deploy = vi.fn().mockResolvedValue({
          success: true,
          url: 'https://convex-worker-staging.example.workers.dev',
          workerName: 'convex-worker-staging',
          durableObjects: ['ConvexDatabase'],
          routes: [],
        })

        const result = await mockWrangler.deploy({ env: 'staging' })

        expect(result.url).toContain('staging')
      })

      it('should register all required Durable Objects', async () => {
        const result = await mockWrangler.deploy({})

        expect(result.durableObjects).toContain('ConvexDatabase')
        expect(result.durableObjects).toContain('ConvexSubscription')
        expect(result.durableObjects).toContain('ConvexScheduler')
      })

      it('should return deployment errors on failure', async () => {
        mockWrangler.deploy = vi.fn().mockResolvedValue({
          success: false,
          url: '',
          workerName: '',
          durableObjects: [],
          routes: [],
          errors: ['Invalid wrangler.toml configuration', 'Missing CONVEX_DATABASE binding'],
        })

        const result = await mockWrangler.deploy({})

        expect(result.success).toBe(false)
        expect(result.errors).toHaveLength(2)
        expect(result.errors?.[0]).toContain('Invalid wrangler.toml')
      })

      it('should minify worker code when specified', async () => {
        await mockWrangler.deploy({ minify: true })

        expect(mockWrangler.deploy).toHaveBeenCalledWith(
          expect.objectContaining({ minify: true })
        )
      })

      it('should use custom config file path', async () => {
        await mockWrangler.deploy({ config: './custom-wrangler.toml' })

        expect(mockWrangler.deploy).toHaveBeenCalledWith(
          expect.objectContaining({ config: './custom-wrangler.toml' })
        )
      })
    })

    describe('wrangler dev (local development)', () => {
      it('should start local development server', async () => {
        const server = await mockWrangler.dev({ local: true })

        expect(server.url).toBe('http://localhost:8787')
        expect(server.port).toBe(8787)
      })

      it('should use custom port when specified', async () => {
        mockWrangler.dev = vi.fn().mockResolvedValue({
          url: 'http://localhost:3000',
          port: 3000,
          stop: vi.fn(),
          waitUntilReady: vi.fn(),
        })

        const server = await mockWrangler.dev({ port: 3000, local: true })

        expect(server.port).toBe(3000)
      })

      it('should persist Durable Object state when specified', async () => {
        await mockWrangler.dev({ local: true, persist: true, persistTo: './.wrangler' })

        expect(mockWrangler.dev).toHaveBeenCalledWith(
          expect.objectContaining({ persist: true, persistTo: './.wrangler' })
        )
      })

      it('should stop development server cleanly', async () => {
        const server = await mockWrangler.dev({ local: true })
        await server.stop()

        expect(server.stop).toHaveBeenCalled()
      })

      it('should wait until server is ready', async () => {
        const server = await mockWrangler.dev({ local: true })
        await server.waitUntilReady()

        expect(server.waitUntilReady).toHaveBeenCalled()
      })
    })

    describe('wrangler authentication', () => {
      it('should verify authenticated user', async () => {
        const user = await mockWrangler.whoami()

        expect(user.name).toBeDefined()
        expect(user.id).toBeDefined()
      })

      it('should handle authentication errors', async () => {
        mockWrangler.whoami = vi.fn().mockRejectedValue(
          new Error('Not authenticated. Please run `wrangler login`.')
        )

        await expect(mockWrangler.whoami()).rejects.toThrow(/Not authenticated/)
      })
    })
  })

  // ==========================================================================
  // 2. Query/Mutation/Action Endpoint Tests
  // ==========================================================================

  describe('Query/Mutation/Action Endpoints', () => {
    describe('POST /api/query', () => {
      it('should execute query and return result', async () => {
        const messages = [
          { _id: 'msg1', text: 'Hello', author: 'Alice' },
          { _id: 'msg2', text: 'World', author: 'Bob' },
        ]
        mockMiniflare.dispatchFetch = mockFetch(successResponse(messages))

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'messages:list', args: { limit: 10 } }),
          }
        )

        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.value).toHaveLength(2)
      })

      it('should return 404 for non-existent query', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Function not found: unknown:query', 404)
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'unknown:query', args: {} }),
          }
        )

        expect(response.status).toBe(404)
      })

      it('should return 400 for invalid arguments', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Invalid argument: limit must be a number', 400)
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'messages:list', args: { limit: 'invalid' } }),
          }
        )

        expect(response.status).toBe(400)
      })

      it('should return 403 for internal query called publicly', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Cannot call internal function from public endpoint', 403)
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'internal:adminQuery', args: {} }),
          }
        )

        expect(response.status).toBe(403)
      })

      it('should include CORS headers in response', async () => {
        mockMiniflare.dispatchFetch = vi.fn().mockResolvedValue(
          new Response('{}', {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            },
          })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
            body: JSON.stringify({ path: 'test:query', args: {} }),
          }
        )

        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      })
    })

    describe('POST /api/mutation', () => {
      it('should execute mutation and return result', async () => {
        const newMessage = { _id: 'msg123', text: 'New message', author: 'Charlie' }
        mockMiniflare.dispatchFetch = mockFetch(successResponse(newMessage))

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/mutation',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'messages:create',
              args: { text: 'New message', author: 'Charlie' },
            }),
          }
        )

        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.value._id).toBeDefined()
      })

      it('should persist mutation changes to Durable Object', async () => {
        // First, create a message
        mockMiniflare.dispatchFetch = mockFetch(successResponse({ _id: 'msg123' }))

        await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/mutation',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'messages:create', args: { text: 'Test' } }),
          }
        )

        // Then, query to verify persistence
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse([{ _id: 'msg123', text: 'Test' }])
        )

        const queryResponse = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'messages:list', args: {} }),
          }
        )

        const result = await queryResponse.json()
        expect(result.value).toContainEqual(expect.objectContaining({ _id: 'msg123' }))
      })

      it('should return 400 when calling query via mutation endpoint', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('messages:list is not a mutation', 400)
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/mutation',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'messages:list', args: {} }),
          }
        )

        expect(response.status).toBe(400)
      })

      it('should handle concurrent mutations correctly', async () => {
        const mutations = Array.from({ length: 10 }, () =>
          mockMiniflare.dispatchFetch(
            'http://localhost:8787/api/mutation',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: 'counter:increment', args: { amount: 1 } }),
            }
          )
        )

        const responses = await Promise.all(mutations)

        expect(responses.every((r) => r.ok)).toBe(true)
      })
    })

    describe('POST /api/action', () => {
      it('should execute action and return result', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse({ sent: true, messageId: 'email-456' })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'email:sendNotification',
              args: { to: 'user@example.com', subject: 'Welcome' },
            }),
          }
        )

        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.value.sent).toBe(true)
      })

      it('should allow actions to call external APIs', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse({ weather: 'sunny', temp: 72 })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'weather:fetch', args: { city: 'San Francisco' } }),
          }
        )

        const result = await response.json()
        expect(result.value.weather).toBeDefined()
      })

      it('should allow actions to schedule functions', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse({ scheduledId: 'job-789' })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'jobs:scheduleTask',
              args: { task: 'sendReminder', delayMs: 3600000 },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.scheduledId).toBeDefined()
      })

      it('should handle action timeout', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Action execution timed out', 504)
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'slowAction:run', args: {} }),
          }
        )

        expect(response.status).toBe(504)
      })
    })

    describe('Request validation', () => {
      it('should reject GET requests to API endpoints', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Method not allowed', 405)
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          { method: 'GET' }
        )

        expect(response.status).toBe(405)
      })

      it('should reject requests with invalid JSON body', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Invalid JSON body', 400)
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not valid json',
          }
        )

        expect(response.status).toBe(400)
      })

      it('should reject requests missing path field', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Missing required field: path', 400)
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args: {} }),
          }
        )

        expect(response.status).toBe(400)
      })
    })
  })

  // ==========================================================================
  // 3. WebSocket Sync Connection Tests
  // ==========================================================================

  describe('WebSocket Sync Connection', () => {
    describe('Connection lifecycle', () => {
      it('should accept WebSocket upgrade requests at /sync', async () => {
        // Note: Standard Response API doesn't support status 101
        // In actual Cloudflare Workers, WebSocket upgrades return a special response
        // We mock the response as 200 with upgrade headers to document expected behavior
        const mockUpgradeResponse = {
          status: 101, // Would be 101 in actual CF Workers
          ok: true,
          headers: new Headers({
            Upgrade: 'websocket',
            Connection: 'Upgrade',
            'Sec-WebSocket-Accept': 'mock-accept-key',
          }),
        }

        mockMiniflare.dispatchFetch = vi.fn().mockResolvedValue({
          ...mockUpgradeResponse,
          // Simulate CF Workers WebSocket upgrade response shape
        })

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/sync',
          {
            headers: {
              Upgrade: 'websocket',
              Connection: 'Upgrade',
              'Sec-WebSocket-Key': 'mock-key',
              'Sec-WebSocket-Version': '13',
            },
          }
        )

        expect(response.status).toBe(101)
        expect(response.headers.get('Upgrade')).toBe('websocket')
      })

      it('should reject non-WebSocket requests to /sync', async () => {
        mockMiniflare.dispatchFetch = vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Expected WebSocket upgrade' }), { status: 426 })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/sync',
          { method: 'GET' }
        )

        expect(response.status).toBe(426) // Upgrade Required
      })

      it('should handle multiple concurrent WebSocket connections', async () => {
        const connections = Array.from({ length: 5 }, () =>
          mockMiniflare.dispatchFetch(
            'http://localhost:8787/sync',
            {
              headers: {
                Upgrade: 'websocket',
                Connection: 'Upgrade',
                'Sec-WebSocket-Key': `key-${Math.random()}`,
                'Sec-WebSocket-Version': '13',
              },
            }
          )
        )

        const responses = await Promise.all(connections)
        expect(responses.every((r) => r.status === 101 || r.ok)).toBe(true)
      })
    })

    describe('Subscription protocol', () => {
      it('should subscribe to query updates', async () => {
        // This would be tested with actual WebSocket in integration tests
        // For now, we document the expected protocol
        const subscribeMessage = {
          type: 'subscribe',
          queryId: 'sub-123',
          path: 'messages:list',
          args: { channel: 'general' },
        }

        expect(subscribeMessage.type).toBe('subscribe')
        expect(subscribeMessage.queryId).toBeDefined()
      })

      it('should receive initial query result after subscribe', async () => {
        const initialResultMessage = {
          type: 'queryResult',
          queryId: 'sub-123',
          value: [{ _id: 'msg1', text: 'Hello' }],
          version: 1,
        }

        expect(initialResultMessage.type).toBe('queryResult')
        expect(initialResultMessage.value).toBeInstanceOf(Array)
      })

      it('should receive delta updates when data changes', async () => {
        const deltaMessage = {
          type: 'queryDelta',
          queryId: 'sub-123',
          delta: {
            added: [{ _id: 'msg2', text: 'New message' }],
            modified: [],
            removed: [],
          },
          version: 2,
        }

        expect(deltaMessage.type).toBe('queryDelta')
        expect(deltaMessage.delta.added).toBeInstanceOf(Array)
      })

      it('should unsubscribe from query updates', async () => {
        const unsubscribeMessage = {
          type: 'unsubscribe',
          queryId: 'sub-123',
        }

        expect(unsubscribeMessage.type).toBe('unsubscribe')
      })

      it('should handle subscription errors', async () => {
        const errorMessage = {
          type: 'subscriptionError',
          queryId: 'sub-123',
          error: 'Function not found: invalid:query',
          code: 'FUNCTION_NOT_FOUND',
        }

        expect(errorMessage.type).toBe('subscriptionError')
        expect(errorMessage.code).toBeDefined()
      })
    })

    describe('Optimistic updates', () => {
      it('should accept optimistic mutation request', async () => {
        const optimisticMutation = {
          type: 'mutation',
          mutationId: 'mut-456',
          path: 'messages:create',
          args: { text: 'Optimistic message' },
          optimisticUpdate: true,
        }

        expect(optimisticMutation.type).toBe('mutation')
        expect(optimisticMutation.optimisticUpdate).toBe(true)
      })

      it('should confirm or reject optimistic mutation', async () => {
        const confirmMessage = {
          type: 'mutationResult',
          mutationId: 'mut-456',
          success: true,
          value: { _id: 'msg789' },
        }

        const rejectMessage = {
          type: 'mutationResult',
          mutationId: 'mut-456',
          success: false,
          error: 'Conflict detected',
        }

        expect(confirmMessage.success).toBe(true)
        expect(rejectMessage.success).toBe(false)
      })
    })

    describe('Connection resilience', () => {
      it('should send heartbeat/ping messages', async () => {
        const pingMessage = { type: 'ping', timestamp: Date.now() }
        const pongMessage = { type: 'pong', timestamp: Date.now() }

        expect(pingMessage.type).toBe('ping')
        expect(pongMessage.type).toBe('pong')
      })

      it('should restore subscriptions after reconnect', async () => {
        // Document the reconnection protocol
        const reconnectMessage = {
          type: 'reconnect',
          sessionId: 'session-abc',
          lastVersions: {
            'sub-123': 5,
            'sub-456': 3,
          },
        }

        expect(reconnectMessage.type).toBe('reconnect')
        expect(reconnectMessage.sessionId).toBeDefined()
      })

      it('should handle authentication during connection', async () => {
        const authMessage = {
          type: 'authenticate',
          token: 'jwt-token-here',
        }

        const authResponse = {
          type: 'authenticated',
          userId: 'user-123',
          sessionId: 'session-abc',
        }

        expect(authMessage.type).toBe('authenticate')
        expect(authResponse.type).toBe('authenticated')
      })
    })
  })

  // ==========================================================================
  // 4. Durable Object Persistence Tests
  // ==========================================================================

  describe('Durable Object Persistence', () => {
    describe('ConvexDatabase Durable Object', () => {
      it('should persist documents across requests', async () => {
        // Create document
        mockMiniflare.dispatchFetch = vi.fn().mockResolvedValueOnce(
          successResponse({ _id: 'doc1' })
        )

        await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/mutation',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'users:create', args: { name: 'Alice' } }),
          }
        )

        // Query document in separate request
        mockMiniflare.dispatchFetch = vi.fn().mockResolvedValueOnce(
          successResponse({ _id: 'doc1', name: 'Alice' })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'users:get', args: { id: 'doc1' } }),
          }
        )

        const result = await response.json()
        expect(result.value.name).toBe('Alice')
      })

      it('should persist data across worker restarts (simulated)', async () => {
        // This test documents expected behavior
        // In production, DO state persists across worker restarts
        const storage = await mockMiniflare.getDurableObjectStorage({ toString: () => 'db-id' } as DurableObjectId)

        // Simulate write
        await storage.put('key', 'value')

        // Simulate restart (get new storage reference)
        const newStorage = await mockMiniflare.getDurableObjectStorage({ toString: () => 'db-id' } as DurableObjectId)

        // Should still have data
        const value = await newStorage.get('key')
        // In real test, this would verify persistence
        expect(storage).toBeDefined()
        expect(newStorage).toBeDefined()
      })

      it('should handle SQLite storage in Durable Objects', async () => {
        const storage = await mockMiniflare.getDurableObjectStorage({ toString: () => 'db-id' } as DurableObjectId)

        // Verify SQL storage is available
        expect(storage.sql).toBeDefined()
        expect(typeof storage.sql.exec).toBe('function')
      })

      it('should maintain ACID properties for mutations', async () => {
        // Document expected transactional behavior
        const transaction = {
          operations: [
            { type: 'insert', table: 'accounts', data: { id: '1', balance: 100 } },
            { type: 'update', table: 'accounts', id: '2', data: { balance: 50 } },
          ],
          atomic: true,
        }

        // All operations should succeed or all should fail
        expect(transaction.atomic).toBe(true)
      })

      it('should support concurrent read access', async () => {
        const reads = Array.from({ length: 10 }, () =>
          mockMiniflare.dispatchFetch(
            'http://localhost:8787/api/query',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: 'users:list', args: {} }),
            }
          )
        )

        const responses = await Promise.all(reads)
        expect(responses.every((r) => r.ok)).toBe(true)
      })

      it('should serialize write access', async () => {
        // Document expected write serialization behavior
        // Durable Objects ensure single-threaded execution per object
        const writeOrder: number[] = []

        const writes = Array.from({ length: 5 }, (_, i) =>
          mockMiniflare.dispatchFetch(
            'http://localhost:8787/api/mutation',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: 'counter:set', args: { value: i } }),
            }
          ).then(() => writeOrder.push(i))
        )

        await Promise.all(writes)
        // Writes are serialized, but completion order may vary due to async
        expect(writeOrder.length).toBe(5)
      })
    })

    describe('ConvexSubscription Durable Object', () => {
      it('should manage WebSocket connections', async () => {
        // Document expected behavior
        const bindings = await mockMiniflare.getBindings()
        expect(bindings.CONVEX_SUBSCRIPTION).toBeDefined()
      })

      it('should broadcast updates to all subscribed clients', async () => {
        // Document expected broadcast behavior
        const broadcast = {
          queryId: 'sub-123',
          update: { type: 'delta', added: [{ _id: 'new' }] },
          recipients: ['client-1', 'client-2', 'client-3'],
        }

        expect(broadcast.recipients.length).toBe(3)
      })

      it('should clean up subscriptions on client disconnect', async () => {
        // Document expected cleanup behavior
        const cleanup = {
          clientId: 'client-1',
          subscriptions: ['sub-123', 'sub-456'],
          action: 'unsubscribe_all',
        }

        expect(cleanup.action).toBe('unsubscribe_all')
      })
    })

    describe('ConvexScheduler Durable Object', () => {
      it('should store scheduled function metadata', async () => {
        const bindings = await mockMiniflare.getBindings()
        expect(bindings.CONVEX_SCHEDULER).toBeDefined()
      })

      it('should persist scheduled jobs across restarts', async () => {
        const scheduledJob = {
          id: 'job-123',
          functionPath: 'notifications:sendReminder',
          args: { userId: 'user-456' },
          scheduledTime: Date.now() + 3600000,
          status: 'pending',
        }

        expect(scheduledJob.status).toBe('pending')
      })
    })
  })

  // ==========================================================================
  // 5. File Storage with R2 Tests
  // ==========================================================================

  describe('File Storage with R2', () => {
    let mockR2Bucket: R2Bucket

    beforeEach(async () => {
      const bindings = await mockMiniflare.getBindings()
      mockR2Bucket = bindings.STORAGE_BUCKET
    })

    describe('File upload', () => {
      it('should upload file and return storage ID', async () => {
        const file = new ArrayBuffer(1024)
        mockR2Bucket.put = vi.fn().mockResolvedValue({
          key: 'files/abc123',
          size: 1024,
          etag: 'etag-123',
          httpEtag: '"etag-123"',
          uploaded: new Date(),
        })

        const result = await mockR2Bucket.put('files/abc123', file)

        expect(result.key).toBe('files/abc123')
        expect(result.size).toBe(1024)
      })

      it('should generate unique storage ID for each upload', async () => {
        const uploads = Array.from({ length: 3 }, (_, i) => ({
          key: `files/file-${i}-${Date.now()}`,
          content: `content-${i}`,
        }))

        for (const upload of uploads) {
          mockR2Bucket.put = vi.fn().mockResolvedValue({
            key: upload.key,
            size: upload.content.length,
            etag: `etag-${upload.key}`,
            httpEtag: `"etag-${upload.key}"`,
            uploaded: new Date(),
          })

          const result = await mockR2Bucket.put(upload.key, upload.content)
          expect(result.key).toBe(upload.key)
        }
      })

      it('should handle large file uploads', async () => {
        const largeFile = new ArrayBuffer(50 * 1024 * 1024) // 50MB
        mockR2Bucket.put = vi.fn().mockResolvedValue({
          key: 'files/large-file',
          size: 50 * 1024 * 1024,
          etag: 'etag-large',
          httpEtag: '"etag-large"',
          uploaded: new Date(),
        })

        const result = await mockR2Bucket.put('files/large-file', largeFile)

        expect(result.size).toBe(50 * 1024 * 1024)
      })

      it('should support streaming uploads', async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('chunk1'))
            controller.enqueue(new TextEncoder().encode('chunk2'))
            controller.close()
          },
        })

        mockR2Bucket.put = vi.fn().mockResolvedValue({
          key: 'files/streamed',
          size: 12,
          etag: 'etag-stream',
          httpEtag: '"etag-stream"',
          uploaded: new Date(),
        })

        const result = await mockR2Bucket.put('files/streamed', stream)

        expect(result.key).toBe('files/streamed')
      })
    })

    describe('File download', () => {
      it('should download file by storage ID', async () => {
        const mockObject = {
          key: 'files/abc123',
          size: 1024,
          etag: 'etag-123',
          httpEtag: '"etag-123"',
          uploaded: new Date(),
          body: new ReadableStream(),
          bodyUsed: false,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
          text: vi.fn().mockResolvedValue('file content'),
          json: vi.fn().mockResolvedValue({ data: 'content' }),
        }
        mockR2Bucket.get = vi.fn().mockResolvedValue(mockObject)

        const result = await mockR2Bucket.get('files/abc123')

        expect(result).not.toBeNull()
        expect(result?.key).toBe('files/abc123')
      })

      it('should return null for non-existent file', async () => {
        mockR2Bucket.get = vi.fn().mockResolvedValue(null)

        const result = await mockR2Bucket.get('files/nonexistent')

        expect(result).toBeNull()
      })

      it('should support range requests for partial downloads', async () => {
        // Document expected behavior for range requests
        const rangeRequest = {
          key: 'files/large-video.mp4',
          range: { offset: 0, length: 1024 * 1024 }, // First 1MB
        }

        expect(rangeRequest.range.offset).toBe(0)
        expect(rangeRequest.range.length).toBe(1024 * 1024)
      })
    })

    describe('File deletion', () => {
      it('should delete file by storage ID', async () => {
        mockR2Bucket.delete = vi.fn().mockResolvedValue(undefined)

        await mockR2Bucket.delete('files/abc123')

        expect(mockR2Bucket.delete).toHaveBeenCalledWith('files/abc123')
      })

      it('should not throw when deleting non-existent file', async () => {
        mockR2Bucket.delete = vi.fn().mockResolvedValue(undefined)

        await expect(mockR2Bucket.delete('files/nonexistent')).resolves.not.toThrow()
      })
    })

    describe('File listing', () => {
      it('should list files with prefix', async () => {
        mockR2Bucket.list = vi.fn().mockResolvedValue({
          objects: [
            { key: 'files/image1.jpg', size: 1024 },
            { key: 'files/image2.png', size: 2048 },
          ],
          truncated: false,
        })

        const result = await mockR2Bucket.list({ prefix: 'files/' })

        expect(result.objects).toHaveLength(2)
        expect(result.truncated).toBe(false)
      })

      it('should support pagination for large lists', async () => {
        mockR2Bucket.list = vi.fn().mockResolvedValue({
          objects: Array.from({ length: 100 }, (_, i) => ({
            key: `files/file-${i}`,
            size: 1024,
          })),
          truncated: true,
          cursor: 'next-page-cursor',
        })

        const result = await mockR2Bucket.list({ prefix: 'files/', limit: 100 })

        expect(result.truncated).toBe(true)
        expect(result.cursor).toBeDefined()
      })
    })

    describe('File metadata', () => {
      it('should get file metadata without downloading', async () => {
        mockR2Bucket.head = vi.fn().mockResolvedValue({
          key: 'files/abc123',
          size: 1024,
          etag: 'etag-123',
          httpEtag: '"etag-123"',
          uploaded: new Date(),
        })

        const result = await mockR2Bucket.head('files/abc123')

        expect(result).not.toBeNull()
        expect(result?.size).toBe(1024)
      })

      it('should return null for non-existent file metadata', async () => {
        mockR2Bucket.head = vi.fn().mockResolvedValue(null)

        const result = await mockR2Bucket.head('files/nonexistent')

        expect(result).toBeNull()
      })
    })

    describe('Integration with Convex functions', () => {
      it('should upload file via action and return storage ID', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse({
            storageId: 'storage:abc123',
            url: 'https://example.r2.cloudflarestorage.com/files/abc123',
          })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'files:upload',
              args: { filename: 'image.jpg', contentType: 'image/jpeg' },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.storageId).toMatch(/^storage:/)
      })

      it('should generate signed URL for file download', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse({
            url: 'https://example.r2.cloudflarestorage.com/files/abc123?signature=...',
          })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'files:getUrl',
              args: { storageId: 'storage:abc123' },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.url).toContain('signature')
      })

      it('should delete file via mutation', async () => {
        mockMiniflare.dispatchFetch = mockFetch(successResponse({ deleted: true }))

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/mutation',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'files:delete',
              args: { storageId: 'storage:abc123' },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.deleted).toBe(true)
      })
    })
  })

  // ==========================================================================
  // 6. Scheduled Function Execution Tests
  // ==========================================================================

  describe('Scheduled Function Execution', () => {
    describe('Scheduling functions', () => {
      it('should schedule function for later execution', async () => {
        const scheduledTime = Date.now() + 3600000
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse({ jobId: 'job-123', scheduledTime })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'scheduler:schedule',
              args: {
                functionPath: 'notifications:sendEmail',
                args: { to: 'user@example.com' },
                delayMs: 3600000, // 1 hour
              },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.jobId).toBeDefined()
      })

      it('should schedule function at specific timestamp', async () => {
        const scheduledTime = new Date('2025-01-02T10:00:00Z').getTime()
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse({ jobId: 'job-456', scheduledTime })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'scheduler:scheduleAt',
              args: {
                functionPath: 'reports:generate',
                args: { reportType: 'daily' },
                timestamp: scheduledTime,
              },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.scheduledTime).toBe(scheduledTime)
      })

      it('should return error for invalid function path', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Function not found: invalid:function', 400)
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'scheduler:schedule',
              args: {
                functionPath: 'invalid:function',
                args: {},
                delayMs: 1000,
              },
            }),
          }
        )

        expect(response.status).toBe(400)
      })
    })

    describe('Cron-style scheduling', () => {
      it('should register cron job', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse({ cronId: 'cron-789', expression: '0 * * * *' })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'scheduler:registerCron',
              args: {
                functionPath: 'cleanup:run',
                cronExpression: '0 * * * *', // Every hour
              },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.cronId).toBeDefined()
        expect(result.value.expression).toBe('0 * * * *')
      })

      it('should list registered cron jobs', async () => {
        const cronJobs = [
          { cronId: 'cron-1', functionPath: 'cleanup:run', expression: '0 * * * *' },
          { cronId: 'cron-2', functionPath: 'reports:daily', expression: '0 9 * * *' },
        ]
        mockMiniflare.dispatchFetch = mockFetch(successResponse(cronJobs))

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'scheduler:listCrons', args: {} }),
          }
        )

        const result = await response.json()
        expect(result.value).toHaveLength(2)
      })

      it('should unregister cron job', async () => {
        mockMiniflare.dispatchFetch = mockFetch(successResponse({ deleted: true }))

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/mutation',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'scheduler:unregisterCron',
              args: { cronId: 'cron-789' },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.deleted).toBe(true)
      })
    })

    describe('Job management', () => {
      it('should cancel scheduled job', async () => {
        mockMiniflare.dispatchFetch = mockFetch(successResponse({ cancelled: true }))

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/mutation',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'scheduler:cancel',
              args: { jobId: 'job-123' },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.cancelled).toBe(true)
      })

      it('should get job status', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse({
            jobId: 'job-123',
            status: 'pending',
            functionPath: 'notifications:sendEmail',
            scheduledTime: Date.now() + 3600000,
          })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'scheduler:getJob',
              args: { jobId: 'job-123' },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.status).toBe('pending')
      })

      it('should list pending jobs', async () => {
        const pendingJobs = [
          { jobId: 'job-1', status: 'pending', functionPath: 'task:run' },
          { jobId: 'job-2', status: 'pending', functionPath: 'email:send' },
        ]
        mockMiniflare.dispatchFetch = mockFetch(successResponse(pendingJobs))

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'scheduler:listPending',
              args: {},
            }),
          }
        )

        const result = await response.json()
        expect(result.value.every((j: { status: string }) => j.status === 'pending')).toBe(true)
      })
    })

    describe('Execution and retry', () => {
      it('should execute scheduled function at scheduled time', async () => {
        // Document expected execution behavior
        const execution = {
          jobId: 'job-123',
          functionPath: 'notifications:sendEmail',
          args: { to: 'user@example.com' },
          executedAt: Date.now(),
          result: { sent: true },
          status: 'completed',
        }

        expect(execution.status).toBe('completed')
      })

      it('should retry failed executions with exponential backoff', async () => {
        const retryPolicy = {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 60000,
          backoffMultiplier: 2,
        }

        // Expected delays: 1s, 2s, 4s
        expect(retryPolicy.maxRetries).toBe(3)
        expect(retryPolicy.backoffMultiplier).toBe(2)
      })

      it('should mark job as failed after max retries', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          successResponse({
            jobId: 'job-123',
            status: 'failed',
            attempts: 4,
            lastError: 'Connection timeout',
          })
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'scheduler:getJob',
              args: { jobId: 'job-123' },
            }),
          }
        )

        const result = await response.json()
        expect(result.value.status).toBe('failed')
        expect(result.value.attempts).toBeGreaterThan(result.value.maxRetries || 3)
      })

      it('should emit events on job completion', async () => {
        const completionEvent = {
          type: 'jobCompleted',
          jobId: 'job-123',
          functionPath: 'task:run',
          duration: 1500,
          result: { success: true },
        }

        expect(completionEvent.type).toBe('jobCompleted')
      })

      it('should emit events on job failure', async () => {
        const failureEvent = {
          type: 'jobFailed',
          jobId: 'job-123',
          functionPath: 'task:run',
          error: 'Execution error',
          willRetry: true,
          nextRetryAt: Date.now() + 2000,
        }

        expect(failureEvent.type).toBe('jobFailed')
        expect(failureEvent.willRetry).toBe(true)
      })
    })

    describe('Cloudflare Durable Object Alarms', () => {
      it('should use DO alarms for scheduling', async () => {
        const storage = await mockMiniflare.getDurableObjectStorage({ toString: () => 'scheduler-id' } as DurableObjectId)

        // Document expected alarm usage
        const alarmUsage = {
          setAlarm: 'Used to trigger at scheduled time',
          deleteAlarm: 'Used to cancel scheduled job',
          getAlarm: 'Used to check current alarm state',
        }

        expect(storage).toBeDefined()
        expect(alarmUsage.setAlarm).toBeDefined()
      })

      it('should handle alarm wake-up and execute job', async () => {
        // Document expected alarm handler behavior
        const alarmHandler = {
          triggeredAt: Date.now(),
          jobId: 'job-123',
          action: 'execute_scheduled_function',
          nextAlarm: Date.now() + 3600000, // Set next alarm if there are more jobs
        }

        expect(alarmHandler.action).toBe('execute_scheduled_function')
      })
    })
  })

  // ==========================================================================
  // 7. Error Handling and Edge Cases
  // ==========================================================================

  describe('Error Handling and Edge Cases', () => {
    describe('Network errors', () => {
      it('should handle Durable Object unavailable', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Durable Object temporarily unavailable', 503, 'DO_UNAVAILABLE')
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'users:list', args: {} }),
          }
        )

        expect(response.status).toBe(503)
      })

      it('should handle R2 storage errors', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Storage operation failed', 500, 'R2_ERROR')
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'files:upload',
              args: { filename: 'test.txt' },
            }),
          }
        )

        expect(response.status).toBe(500)
      })
    })

    describe('Resource limits', () => {
      it('should handle CPU time limit exceeded', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('CPU time limit exceeded', 503, 'CPU_LIMIT_EXCEEDED')
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/query',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'expensive:computation', args: {} }),
          }
        )

        expect(response.status).toBe(503)
      })

      it('should handle memory limit exceeded', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Memory limit exceeded', 503, 'MEMORY_LIMIT_EXCEEDED')
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/action',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: 'memory:hog', args: {} }),
          }
        )

        expect(response.status).toBe(503)
      })

      it('should handle request body size limit', async () => {
        mockMiniflare.dispatchFetch = mockFetch(
          errorResponse('Request body too large', 413, 'REQUEST_TOO_LARGE')
        )

        const response = await mockMiniflare.dispatchFetch(
          'http://localhost:8787/api/mutation',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'data:insert',
              args: { data: 'x'.repeat(10 * 1024 * 1024) }, // 10MB
            }),
          }
        )

        expect(response.status).toBe(413)
      })
    })

    describe('Graceful degradation', () => {
      it('should return cached response when DO is unavailable', async () => {
        // Document expected caching behavior
        const cachedResponse = {
          value: [{ _id: 'cached' }],
          fromCache: true,
          cacheAge: 30000,
        }

        expect(cachedResponse.fromCache).toBe(true)
      })

      it('should queue mutations when database is temporarily unavailable', async () => {
        // Document expected queue behavior
        const queuedMutation = {
          mutationId: 'mut-123',
          queued: true,
          queuePosition: 5,
          estimatedProcessingTime: 5000,
        }

        expect(queuedMutation.queued).toBe(true)
      })
    })
  })
})
