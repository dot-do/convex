/**
 * TDD Tests for WebSocket Upgrade Handler (RED Phase)
 *
 * These tests define the expected behavior for the /sync endpoint WebSocket upgrade.
 * The tests should FAIL because the functionality is not yet implemented.
 *
 * Issue: convex-ws-upgrade-red
 * Phase: RED - Write failing tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================================
// Mock Types for Cloudflare Workers
// ============================================================================

interface MockDurableObjectNamespace {
  idFromName: (name: string) => MockDurableObjectId
  get: (id: MockDurableObjectId) => MockDurableObjectStub
}

interface MockDurableObjectId {
  toString: () => string
}

interface MockDurableObjectStub {
  fetch: (request: Request) => Promise<Response>
}

interface MockWorkerEnv {
  CONVEX_DATABASE: MockDurableObjectNamespace
  CONVEX_SUBSCRIPTION: MockDurableObjectNamespace
}

// ============================================================================
// Mock Implementations
// ============================================================================

function createMockEnv(options: {
  subscriptionFetch?: (request: Request) => Promise<Response>
  databaseFetch?: (request: Request) => Promise<Response>
} = {}): MockWorkerEnv {
  const mockDatabaseId: MockDurableObjectId = {
    toString: () => 'database-id-123',
  }

  const mockSubscriptionId: MockDurableObjectId = {
    toString: () => 'subscription-id-456',
  }

  const mockDatabaseStub: MockDurableObjectStub = {
    fetch: options.databaseFetch ?? (async () => new Response('OK')),
  }

  const mockSubscriptionStub: MockDurableObjectStub = {
    fetch: options.subscriptionFetch ?? (async () => new Response('OK')),
  }

  return {
    CONVEX_DATABASE: {
      idFromName: vi.fn(() => mockDatabaseId),
      get: vi.fn(() => mockDatabaseStub),
    },
    CONVEX_SUBSCRIPTION: {
      idFromName: vi.fn(() => mockSubscriptionId),
      get: vi.fn(() => mockSubscriptionStub),
    },
  }
}

function createWebSocketUpgradeRequest(options: {
  url?: string
  headers?: Record<string, string>
  protocol?: string | string[]
} = {}): Request {
  const url = options.url ?? 'https://api.convex.cloud/sync'
  const headers = new Headers({
    'Upgrade': 'websocket',
    'Connection': 'Upgrade',
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version': '13',
    ...options.headers,
  })

  if (options.protocol) {
    const protocols = Array.isArray(options.protocol)
      ? options.protocol.join(', ')
      : options.protocol
    headers.set('Sec-WebSocket-Protocol', protocols)
  }

  return new Request(url, {
    method: 'GET',
    headers,
  })
}

// ============================================================================
// Import the Handler (will be implemented in GREEN phase)
// ============================================================================

// The sync endpoint handler should be exported from the worker
// This import will fail or the handler won't have the expected behavior
import { handleSyncUpgrade, SyncUpgradeHandler } from '../../src/sync/upgrade'

// ============================================================================
// Tests
// ============================================================================

describe('WebSocket Upgrade Handler (/sync endpoint)', () => {
  let env: MockWorkerEnv

  beforeEach(() => {
    env = createMockEnv()
  })

  // ==========================================================================
  // Test 1: WebSocket upgrade request handling
  // ==========================================================================

  describe('WebSocket upgrade request handling', () => {
    it('should return 101 Switching Protocols for valid upgrade request', async () => {
      const request = createWebSocketUpgradeRequest()
      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(101)
    })

    it('should include webSocket property in response', async () => {
      const request = createWebSocketUpgradeRequest()
      const response = await handleSyncUpgrade(request, env)

      // Cloudflare Workers WebSocket upgrade responses include the webSocket property
      expect((response as Response & { webSocket?: WebSocket }).webSocket).toBeDefined()
    })

    it('should accept upgrade requests at /sync path', async () => {
      const request = createWebSocketUpgradeRequest({
        url: 'https://api.convex.cloud/sync',
      })
      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(101)
    })

    it('should accept upgrade requests at /sync with query parameters', async () => {
      const request = createWebSocketUpgradeRequest({
        url: 'https://api.convex.cloud/sync?clientId=abc123&version=1',
      })
      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(101)
    })

    it('should handle upgrade requests with authentication token in query', async () => {
      const request = createWebSocketUpgradeRequest({
        url: 'https://api.convex.cloud/sync?token=jwt-token-here',
      })
      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(101)
    })

    it('should handle upgrade requests with Authorization header', async () => {
      const request = createWebSocketUpgradeRequest({
        headers: {
          'Authorization': 'Bearer jwt-token-here',
        },
      })
      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(101)
    })
  })

  // ==========================================================================
  // Test 2: Upgrade returns correct protocol headers
  // ==========================================================================

  describe('protocol headers', () => {
    it('should include Upgrade header in response', async () => {
      const request = createWebSocketUpgradeRequest()
      const response = await handleSyncUpgrade(request, env)

      expect(response.headers.get('Upgrade')).toBe('websocket')
    })

    it('should include Connection header in response', async () => {
      const request = createWebSocketUpgradeRequest()
      const response = await handleSyncUpgrade(request, env)

      expect(response.headers.get('Connection')).toBe('Upgrade')
    })

    it('should include Sec-WebSocket-Accept header in response', async () => {
      const request = createWebSocketUpgradeRequest()
      const response = await handleSyncUpgrade(request, env)

      expect(response.headers.get('Sec-WebSocket-Accept')).toBeTruthy()
    })

    it('should calculate correct Sec-WebSocket-Accept value', async () => {
      // The Sec-WebSocket-Accept is computed as:
      // base64(SHA-1(Sec-WebSocket-Key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
      const request = createWebSocketUpgradeRequest({
        headers: {
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        },
      })
      const response = await handleSyncUpgrade(request, env)

      // For key "dGhlIHNhbXBsZSBub25jZQ==", the accept value should be:
      // "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
      expect(response.headers.get('Sec-WebSocket-Accept')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
    })

    it('should echo requested subprotocol if supported', async () => {
      const request = createWebSocketUpgradeRequest({
        protocol: 'convex-sync-v1',
      })
      const response = await handleSyncUpgrade(request, env)

      expect(response.headers.get('Sec-WebSocket-Protocol')).toBe('convex-sync-v1')
    })

    it('should select first supported subprotocol from list', async () => {
      const request = createWebSocketUpgradeRequest({
        protocol: ['convex-sync-v2', 'convex-sync-v1'],
      })
      const response = await handleSyncUpgrade(request, env)

      // Should select the first one that the server supports
      const selectedProtocol = response.headers.get('Sec-WebSocket-Protocol')
      expect(['convex-sync-v1', 'convex-sync-v2']).toContain(selectedProtocol)
    })

    it('should not include Sec-WebSocket-Protocol if no protocols requested', async () => {
      const request = createWebSocketUpgradeRequest()
      const response = await handleSyncUpgrade(request, env)

      // If client didn't request a protocol, server shouldn't send one
      expect(response.headers.get('Sec-WebSocket-Protocol')).toBeNull()
    })
  })

  // ==========================================================================
  // Test 3: Invalid upgrade requests return proper errors
  // ==========================================================================

  describe('invalid upgrade requests', () => {
    it('should return 400 if Upgrade header is missing', async () => {
      const request = new Request('https://api.convex.cloud/sync', {
        method: 'GET',
        headers: {
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
        },
      })

      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(400)
    })

    it('should return 400 if Upgrade header is not websocket', async () => {
      const request = new Request('https://api.convex.cloud/sync', {
        method: 'GET',
        headers: {
          'Upgrade': 'h2c',
          'Connection': 'Upgrade',
        },
      })

      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(400)
    })

    it('should return 400 if Sec-WebSocket-Key is missing', async () => {
      const request = new Request('https://api.convex.cloud/sync', {
        method: 'GET',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Version': '13',
        },
      })

      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(400)
    })

    it('should return 400 if Sec-WebSocket-Key is invalid length', async () => {
      const request = new Request('https://api.convex.cloud/sync', {
        method: 'GET',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'short', // Should be 16 bytes base64 encoded
          'Sec-WebSocket-Version': '13',
        },
      })

      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(400)
    })

    it('should return 426 if WebSocket version is unsupported', async () => {
      const request = new Request('https://api.convex.cloud/sync', {
        method: 'GET',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '8', // Only version 13 is standard
        },
      })

      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(426)
      expect(response.headers.get('Sec-WebSocket-Version')).toBe('13')
    })

    it('should return 405 for non-GET requests', async () => {
      const request = new Request('https://api.convex.cloud/sync', {
        method: 'POST',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
        },
      })

      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(405)
    })

    it('should return error JSON body for invalid requests', async () => {
      const request = new Request('https://api.convex.cloud/sync', {
        method: 'GET',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          // Missing Sec-WebSocket-Key
          'Sec-WebSocket-Version': '13',
        },
      })

      const response = await handleSyncUpgrade(request, env)
      const body = await response.json() as { error: string }

      expect(body.error).toBeDefined()
      expect(typeof body.error).toBe('string')
    })

    it('should return 401 for invalid authentication token', async () => {
      const envWithAuth = createMockEnv({
        subscriptionFetch: async () => {
          return new Response(JSON.stringify({ error: 'Invalid token' }), {
            status: 401,
          })
        },
      })

      const request = createWebSocketUpgradeRequest({
        headers: {
          'Authorization': 'Bearer invalid-token',
        },
      })

      const response = await handleSyncUpgrade(request, envWithAuth)

      expect(response.status).toBe(401)
    })

    it('should return 403 for expired authentication token', async () => {
      const envWithAuth = createMockEnv({
        subscriptionFetch: async () => {
          return new Response(JSON.stringify({ error: 'Token expired' }), {
            status: 403,
          })
        },
      })

      const request = createWebSocketUpgradeRequest({
        headers: {
          'Authorization': 'Bearer expired-token',
        },
      })

      const response = await handleSyncUpgrade(request, envWithAuth)

      expect(response.status).toBe(403)
    })
  })

  // ==========================================================================
  // Test 4: Upgrade connects to the correct Durable Object
  // ==========================================================================

  describe('Durable Object connection', () => {
    it('should connect to ConvexSubscription Durable Object', async () => {
      const subscriptionFetch = vi.fn(async (_request: Request) => {
        // Return a proper WebSocket upgrade response
        const pair = new WebSocketPair()
        return new Response(null, {
          status: 101,
          webSocket: pair[0],
        })
      })

      const envWithMock = createMockEnv({ subscriptionFetch })
      const request = createWebSocketUpgradeRequest()

      await handleSyncUpgrade(request, envWithMock)

      expect(envWithMock.CONVEX_SUBSCRIPTION.get).toHaveBeenCalled()
      expect(subscriptionFetch).toHaveBeenCalled()
    })

    it('should forward WebSocket upgrade to Durable Object', async () => {
      let forwardedRequest: Request | null = null
      const subscriptionFetch = vi.fn(async (request: Request) => {
        forwardedRequest = request
        const pair = new WebSocketPair()
        return new Response(null, {
          status: 101,
          webSocket: pair[0],
        })
      })

      const envWithMock = createMockEnv({ subscriptionFetch })
      const request = createWebSocketUpgradeRequest()

      await handleSyncUpgrade(request, envWithMock)

      expect(forwardedRequest).not.toBeNull()
      expect(forwardedRequest!.headers.get('Upgrade')).toBe('websocket')
    })

    it('should forward authentication headers to Durable Object', async () => {
      let forwardedHeaders: Headers | null = null
      const subscriptionFetch = vi.fn(async (request: Request) => {
        forwardedHeaders = request.headers
        const pair = new WebSocketPair()
        return new Response(null, {
          status: 101,
          webSocket: pair[0],
        })
      })

      const envWithMock = createMockEnv({ subscriptionFetch })
      const request = createWebSocketUpgradeRequest({
        headers: {
          'Authorization': 'Bearer test-token',
        },
      })

      await handleSyncUpgrade(request, envWithMock)

      expect(forwardedHeaders).not.toBeNull()
      expect(forwardedHeaders!.get('Authorization')).toBe('Bearer test-token')
    })

    it('should use clientId from query for Durable Object routing', async () => {
      let usedId: string | null = null
      const envWithMock: MockWorkerEnv = {
        ...createMockEnv(),
        CONVEX_SUBSCRIPTION: {
          idFromName: vi.fn((name: string) => {
            usedId = name
            return { toString: () => name }
          }),
          get: vi.fn(() => ({
            fetch: async () => {
              const pair = new WebSocketPair()
              return new Response(null, {
                status: 101,
                webSocket: pair[0],
              })
            },
          })),
        },
      }

      const request = createWebSocketUpgradeRequest({
        url: 'https://api.convex.cloud/sync?clientId=client-abc-123',
      })

      await handleSyncUpgrade(request, envWithMock)

      // The handler should use the clientId to route to the correct DO
      expect(envWithMock.CONVEX_SUBSCRIPTION.idFromName).toHaveBeenCalled()
      expect(usedId).toContain('client-abc-123')
    })

    it('should generate clientId if not provided', async () => {
      let usedId: string | null = null
      const envWithMock: MockWorkerEnv = {
        ...createMockEnv(),
        CONVEX_SUBSCRIPTION: {
          idFromName: vi.fn((name: string) => {
            usedId = name
            return { toString: () => name }
          }),
          get: vi.fn(() => ({
            fetch: async () => {
              const pair = new WebSocketPair()
              return new Response(null, {
                status: 101,
                webSocket: pair[0],
              })
            },
          })),
        },
      }

      const request = createWebSocketUpgradeRequest({
        url: 'https://api.convex.cloud/sync',
      })

      await handleSyncUpgrade(request, envWithMock)

      expect(envWithMock.CONVEX_SUBSCRIPTION.idFromName).toHaveBeenCalled()
      // Should have generated some ID
      expect(usedId).toBeTruthy()
    })

    it('should handle Durable Object connection failure', async () => {
      const envWithError = createMockEnv({
        subscriptionFetch: async () => {
          throw new Error('Durable Object unavailable')
        },
      })

      const request = createWebSocketUpgradeRequest()
      const response = await handleSyncUpgrade(request, envWithError)

      expect(response.status).toBe(503)
    })

    it('should return 500 for internal Durable Object errors', async () => {
      const envWithError = createMockEnv({
        subscriptionFetch: async () => {
          return new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500,
          })
        },
      })

      const request = createWebSocketUpgradeRequest()
      const response = await handleSyncUpgrade(request, envWithError)

      expect(response.status).toBe(500)
    })
  })

  // ==========================================================================
  // Test 5: SyncUpgradeHandler class tests
  // ==========================================================================

  describe('SyncUpgradeHandler class', () => {
    it('should be instantiable', () => {
      const handler = new SyncUpgradeHandler()
      expect(handler).toBeInstanceOf(SyncUpgradeHandler)
    })

    it('should have a handle method', () => {
      const handler = new SyncUpgradeHandler()
      expect(typeof handler.handle).toBe('function')
    })

    it('should validate upgrade requests', async () => {
      const handler = new SyncUpgradeHandler()
      const request = createWebSocketUpgradeRequest()

      const isValid = handler.isValidUpgradeRequest(request)

      expect(isValid).toBe(true)
    })

    it('should reject non-websocket upgrade requests', async () => {
      const handler = new SyncUpgradeHandler()
      const request = new Request('https://api.convex.cloud/sync', {
        method: 'GET',
        headers: {
          'Upgrade': 'h2c',
        },
      })

      const isValid = handler.isValidUpgradeRequest(request)

      expect(isValid).toBe(false)
    })

    it('should compute WebSocket accept key', () => {
      const handler = new SyncUpgradeHandler()
      const key = 'dGhlIHNhbXBsZSBub25jZQ=='

      const acceptKey = handler.computeAcceptKey(key)

      expect(acceptKey).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=')
    })

    it('should parse subprotocols from header', () => {
      const handler = new SyncUpgradeHandler()

      const protocols = handler.parseProtocols('convex-sync-v1, convex-sync-v2')

      expect(protocols).toEqual(['convex-sync-v1', 'convex-sync-v2'])
    })

    it('should select supported protocol', () => {
      const handler = new SyncUpgradeHandler({
        supportedProtocols: ['convex-sync-v1', 'convex-sync-v2'],
      })

      const selected = handler.selectProtocol(['unsupported', 'convex-sync-v1'])

      expect(selected).toBe('convex-sync-v1')
    })

    it('should return null for unsupported protocols', () => {
      const handler = new SyncUpgradeHandler({
        supportedProtocols: ['convex-sync-v1'],
      })

      const selected = handler.selectProtocol(['unsupported-protocol'])

      expect(selected).toBeNull()
    })

    it('should create WebSocket response headers', () => {
      const handler = new SyncUpgradeHandler()
      const request = createWebSocketUpgradeRequest({
        protocol: 'convex-sync-v1',
      })

      const headers = handler.createResponseHeaders(request)

      expect(headers.get('Upgrade')).toBe('websocket')
      expect(headers.get('Connection')).toBe('Upgrade')
      expect(headers.get('Sec-WebSocket-Accept')).toBeTruthy()
    })
  })

  // ==========================================================================
  // Test 6: Integration with existing sync functionality
  // ==========================================================================

  describe('integration with sync system', () => {
    it('should work with ConvexSubscription Durable Object', async () => {
      // This test verifies the upgrade handler integrates with the
      // existing ConvexSubscription DO
      const request = createWebSocketUpgradeRequest()

      // The handler should successfully upgrade and connect to the DO
      const response = await handleSyncUpgrade(request, env)

      expect(response.status).toBe(101)
    })

    it('should pass session info to Durable Object', async () => {
      let sessionInfo: { clientId?: string; token?: string } | null = null
      const subscriptionFetch = vi.fn(async (request: Request) => {
        const url = new URL(request.url)
        sessionInfo = {
          clientId: url.searchParams.get('clientId') ?? undefined,
          token: request.headers.get('Authorization')?.replace('Bearer ', '') ?? undefined,
        }
        const pair = new WebSocketPair()
        return new Response(null, {
          status: 101,
          webSocket: pair[0],
        })
      })

      const envWithMock = createMockEnv({ subscriptionFetch })
      const request = createWebSocketUpgradeRequest({
        url: 'https://api.convex.cloud/sync?clientId=session-123',
        headers: {
          'Authorization': 'Bearer auth-token',
        },
      })

      await handleSyncUpgrade(request, envWithMock)

      expect(sessionInfo).not.toBeNull()
      expect(sessionInfo!.clientId).toBe('session-123')
      expect(sessionInfo!.token).toBe('auth-token')
    })
  })
})

// WebSocketPair mock for Node.js environment
declare global {
  // eslint-disable-next-line no-var
  var WebSocketPair: new () => [WebSocket, WebSocket]
}

// Mock WebSocketPair if not available
if (typeof globalThis.WebSocketPair === 'undefined') {
  globalThis.WebSocketPair = class MockWebSocketPair {
    constructor() {
      const mockSocket = {
        send: () => {},
        close: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as WebSocket
      return [mockSocket, mockSocket] as [WebSocket, WebSocket]
    }
  } as unknown as new () => [WebSocket, WebSocket]
}
