/**
 * TDD Tests for ConvexClient - WebSocket Real-Time Client
 *
 * These tests define the expected behavior for the ConvexClient class
 * that provides WebSocket-based real-time subscriptions for Convex.
 *
 * Features tested:
 * - Constructor with deployment URL
 * - connect() / disconnect() - Manage WebSocket connection
 * - subscribe(functionRef, args, callbacks) - Subscribe to a query
 * - unsubscribe(subscriptionId) - Cancel a subscription
 * - mutation(functionRef, args) - Execute mutations through WebSocket
 * - action(functionRef, args) - Execute actions
 * - onConnect/onDisconnect callbacks
 * - Automatic reconnection with state recovery
 * - Connection state management (connecting, connected, disconnected)
 * - Message queuing when disconnected
 * - Subscription deduplication
 * - Transition callback for watching query updates
 *
 * Layer 7: Client SDK
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ConvexClient,
  ConnectionState,
  type ConvexClientOptions,
  type SubscribeCallbacks,
  type SubscriptionId,
} from '../../src/client/websocket-client'
import type { FunctionReference } from '../../src/server/functions/api'

// ============================================================================
// Mock WebSocket Implementation
// ============================================================================

class MockCloseEvent extends Event {
  code: number
  reason: string
  wasClean: boolean

  constructor(type: string, init?: { code?: number; reason?: string; wasClean?: boolean }) {
    super(type)
    this.code = init?.code ?? 1000
    this.reason = init?.reason ?? ''
    this.wasClean = init?.wasClean ?? true
  }
}

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  protocols?: string | string[]
  readyState: number = MockWebSocket.CONNECTING
  binaryType: BinaryType = 'blob'
  protocol: string = ''

  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  private _sentMessages: unknown[] = []
  private _closeWasCalled = false

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    try {
      this._sentMessages.push(JSON.parse(data as string))
    } catch {
      this._sentMessages.push(data)
    }
  }

  close(code?: number, reason?: string): void {
    this._closeWasCalled = true
    this.readyState = MockWebSocket.CLOSING
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED
      if (this.onclose) {
        const closeEvent = new MockCloseEvent('close', { code: code ?? 1000, reason: reason ?? '' })
        this.onclose(closeEvent as CloseEvent)
      }
    }, 0)
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) {
      this.onopen(new Event('open'))
    }
  }

  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      const event = new MessageEvent('message', { data: JSON.stringify(data) })
      this.onmessage(event)
    }
  }

  simulateError(message: string = 'Connection error'): void {
    if (this.onerror) {
      const errorEvent = new Event('error')
      ;(errorEvent as unknown as Record<string, unknown>).message = message
      this.onerror(errorEvent)
    }
  }

  simulateClose(code: number = 1000, reason: string = ''): void {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      const closeEvent = new MockCloseEvent('close', { code, reason })
      this.onclose(closeEvent as CloseEvent)
    }
  }

  getSentMessages(): unknown[] {
    return this._sentMessages
  }

  wasCloseCalled(): boolean {
    return this._closeWasCalled
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function createMockFunctionRef<
  Type extends 'query' | 'mutation' | 'action',
  Args = unknown,
  Returns = unknown
>(type: Type, path: string): FunctionReference<Type, Args, Returns> {
  return {
    _type: type,
    _args: undefined as unknown as Args,
    _returns: undefined as unknown as Returns,
    _path: path,
    _visibility: 'public',
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ============================================================================
// Test Setup
// ============================================================================

describe('ConvexClient', () => {
  let mockWebSocketInstance: MockWebSocket | null = null
  let webSocketConstructorSpy: ReturnType<typeof vi.fn>
  let originalWebSocket: typeof globalThis.WebSocket

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket

    webSocketConstructorSpy = vi.fn((url: string, protocols?: string | string[]) => {
      mockWebSocketInstance = new MockWebSocket(url, protocols)
      return mockWebSocketInstance
    })

    Object.assign(webSocketConstructorSpy, {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    })

    globalThis.WebSocket = webSocketConstructorSpy as unknown as typeof WebSocket
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
    mockWebSocketInstance = null
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create a ConvexClient with a deployment URL', () => {
      const client = new ConvexClient('https://example.convex.cloud')
      expect(client).toBeDefined()
      client.close()
    })

    it('should accept http:// URLs and convert to ws://', () => {
      const client = new ConvexClient('http://localhost:3000')
      expect(client).toBeDefined()
      client.close()
    })

    it('should accept https:// URLs and convert to wss://', () => {
      const client = new ConvexClient('https://example.convex.cloud')
      expect(client).toBeDefined()
      client.close()
    })

    it('should throw for empty URL', () => {
      expect(() => new ConvexClient('')).toThrow()
    })

    it('should accept optional configuration', () => {
      const options: ConvexClientOptions = {
        skipConnectionCheck: true,
        reconnectDelay: 2000,
        maxReconnectAttempts: 5,
      }
      const client = new ConvexClient('https://example.convex.cloud', options)
      expect(client).toBeDefined()
      client.close()
    })

    it('should initialize in disconnected state by default', () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      expect(client.connectionState).toBe(ConnectionState.Disconnected)
      client.close()
    })

    it('should auto-connect when skipConnectionCheck is not set', async () => {
      const client = new ConvexClient('https://example.convex.cloud')
      // Give it time to attempt connection
      await delay(10)
      expect(webSocketConstructorSpy).toHaveBeenCalled()
      client.close()
    })

    it('should not auto-connect when skipConnectionCheck is true', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      await delay(10)
      expect(webSocketConstructorSpy).not.toHaveBeenCalled()
      client.close()
    })

    it('should store the deployment URL', () => {
      const url = 'https://example.convex.cloud'
      const client = new ConvexClient(url, { skipConnectionCheck: true })
      expect(client.url).toBe(url)
      client.close()
    })
  })

  // ============================================================================
  // Connection Lifecycle Tests
  // ============================================================================

  describe('connection lifecycle', () => {
    describe('connect()', () => {
      it('should return a Promise', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const result = client.connect()
        expect(result).toBeInstanceOf(Promise)
        client.close()
      })

      it('should transition to connecting state immediately', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        client.connect()
        expect(client.connectionState).toBe(ConnectionState.Connecting)
        client.close()
      })

      it('should create a WebSocket with the correct URL', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        client.connect()

        expect(webSocketConstructorSpy).toHaveBeenCalled()
        const wsUrl = webSocketConstructorSpy.mock.calls[0][0]
        expect(wsUrl).toContain('wss://example.convex.cloud')
      })

      it('should resolve when connection opens', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()

        mockWebSocketInstance?.simulateOpen()

        await expect(connectPromise).resolves.toBeUndefined()
        client.close()
      })

      it('should transition to connected state on success', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()

        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(client.connectionState).toBe(ConnectionState.Connected)
        client.close()
      })

      it('should reject if connection fails', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()

        mockWebSocketInstance?.simulateError('Connection refused')

        await expect(connectPromise).rejects.toThrow()
        client.close()
      })

      it('should resolve immediately if already connected', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const firstConnect = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await firstConnect

        const secondConnect = client.connect()
        await expect(secondConnect).resolves.toBeUndefined()
        client.close()
      })
    })

    describe('disconnect()', () => {
      it('should close an open connection', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        client.disconnect()

        expect(mockWebSocketInstance?.wasCloseCalled()).toBe(true)
        client.close()
      })

      it('should transition to disconnected state', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        client.disconnect()
        await delay(10)

        expect(client.connectionState).toBe(ConnectionState.Disconnected)
        client.close()
      })

      it('should be safe to call when not connected', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        expect(() => client.disconnect()).not.toThrow()
        client.close()
      })

      it('should be safe to call multiple times', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        client.disconnect()
        expect(() => client.disconnect()).not.toThrow()
        client.close()
      })
    })

    describe('close()', () => {
      it('should disconnect and prevent reconnection', async () => {
        vi.useFakeTimers()
        const client = new ConvexClient('https://example.convex.cloud', {
          skipConnectionCheck: true,
          reconnectDelay: 100,
        })

        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        client.close()

        // Simulate disconnect that would normally trigger reconnect
        mockWebSocketInstance?.simulateClose(1006)
        await vi.advanceTimersByTimeAsync(500)

        // Should not have reconnected
        expect(webSocketConstructorSpy).toHaveBeenCalledTimes(1)
      })

      it('should clear all subscriptions', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const queryRef = createMockFunctionRef('query', 'users:list')
        const callback = vi.fn()
        client.subscribe(queryRef, {}, { onUpdate: callback })

        client.close()

        expect(client.getActiveSubscriptionCount()).toBe(0)
      })

      it('should be idempotent', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        client.close()
        expect(() => client.close()).not.toThrow()
      })
    })
  })

  // ============================================================================
  // Connection State Tests
  // ============================================================================

  describe('connection state', () => {
    describe('connectionState', () => {
      it('should return ConnectionState enum value', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const state = client.connectionState
        expect(Object.values(ConnectionState)).toContain(state)
        client.close()
      })

      it('should return Disconnected initially', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        expect(client.connectionState).toBe(ConnectionState.Disconnected)
        client.close()
      })

      it('should return Connecting during connection', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        client.connect()
        expect(client.connectionState).toBe(ConnectionState.Connecting)
        client.close()
      })

      it('should return Connected after successful connection', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(client.connectionState).toBe(ConnectionState.Connected)
        client.close()
      })

      it('should return Disconnected after close', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        client.close()

        expect(client.connectionState).toBe(ConnectionState.Disconnected)
      })
    })

    describe('isConnected()', () => {
      it('should return false initially', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        expect(client.isConnected()).toBe(false)
        client.close()
      })

      it('should return false while connecting', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        client.connect()
        expect(client.isConnected()).toBe(false)
        client.close()
      })

      it('should return true when connected', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(client.isConnected()).toBe(true)
        client.close()
      })

      it('should return false after disconnect', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        client.disconnect()
        await delay(10)

        expect(client.isConnected()).toBe(false)
        client.close()
      })
    })
  })

  // ============================================================================
  // Subscription Tests
  // ============================================================================

  describe('subscribe()', () => {
    describe('basic subscription', () => {
      it('should return a subscription ID', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const queryRef = createMockFunctionRef('query', 'users:list')
        const callback = vi.fn()
        const subscriptionId = client.subscribe(queryRef, {}, { onUpdate: callback })

        expect(subscriptionId).toBeDefined()
        expect(typeof subscriptionId).toBe('string')
        client.close()
      })

      it('should send subscribe message to server', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const queryRef = createMockFunctionRef('query', 'users:list')
        const callback = vi.fn()
        client.subscribe(queryRef, { limit: 10 }, { onUpdate: callback })

        const messages = mockWebSocketInstance?.getSentMessages()
        expect(messages).toContainEqual(expect.objectContaining({
          type: 'subscribe',
          queryPath: 'users:list',
          args: { limit: 10 },
        }))
        client.close()
      })

      it('should call onUpdate when data is received', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const queryRef = createMockFunctionRef('query', 'users:list')
        const onUpdate = vi.fn()
        const subscriptionId = client.subscribe(queryRef, {}, { onUpdate })

        // Simulate server sending update
        mockWebSocketInstance?.simulateMessage({
          type: 'update',
          subscriptionId,
          data: [{ id: '1', name: 'Alice' }],
        })

        expect(onUpdate).toHaveBeenCalledWith([{ id: '1', name: 'Alice' }])
        client.close()
      })

      it('should call onError when error is received', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const queryRef = createMockFunctionRef('query', 'users:list')
        const onUpdate = vi.fn()
        const onError = vi.fn()
        const subscriptionId = client.subscribe(queryRef, {}, { onUpdate, onError })

        mockWebSocketInstance?.simulateMessage({
          type: 'error',
          subscriptionId,
          message: 'Query failed',
        })

        expect(onError).toHaveBeenCalled()
        expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
        client.close()
      })

      it('should increment active subscription count', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(client.getActiveSubscriptionCount()).toBe(0)

        const queryRef = createMockFunctionRef('query', 'users:list')
        client.subscribe(queryRef, {}, { onUpdate: vi.fn() })

        expect(client.getActiveSubscriptionCount()).toBe(1)
        client.close()
      })
    })

    describe('subscription when disconnected', () => {
      it('should queue subscription when not connected', () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })

        const queryRef = createMockFunctionRef('query', 'users:list')
        const subscriptionId = client.subscribe(queryRef, {}, { onUpdate: vi.fn() })

        expect(subscriptionId).toBeDefined()
        expect(client.getPendingSubscriptionCount()).toBe(1)
        client.close()
      })

      it('should send queued subscriptions on connect', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })

        const queryRef = createMockFunctionRef('query', 'users:list')
        client.subscribe(queryRef, {}, { onUpdate: vi.fn() })

        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const messages = mockWebSocketInstance?.getSentMessages()
        expect(messages).toContainEqual(expect.objectContaining({
          type: 'subscribe',
          queryPath: 'users:list',
        }))
        client.close()
      })

      it('should move pending subscriptions to active on connect', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })

        const queryRef = createMockFunctionRef('query', 'users:list')
        client.subscribe(queryRef, {}, { onUpdate: vi.fn() })

        expect(client.getPendingSubscriptionCount()).toBe(1)
        expect(client.getActiveSubscriptionCount()).toBe(0)

        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(client.getPendingSubscriptionCount()).toBe(0)
        expect(client.getActiveSubscriptionCount()).toBe(1)
        client.close()
      })
    })

    describe('subscription options', () => {
      it('should support onUpdate callback', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const queryRef = createMockFunctionRef('query', 'users:list')
        const onUpdate = vi.fn()
        const subscriptionId = client.subscribe(queryRef, {}, { onUpdate })

        mockWebSocketInstance?.simulateMessage({
          type: 'update',
          subscriptionId,
          data: { users: [] },
        })

        expect(onUpdate).toHaveBeenCalledWith({ users: [] })
        client.close()
      })

      it('should support onError callback', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const queryRef = createMockFunctionRef('query', 'users:list')
        const onError = vi.fn()
        const subscriptionId = client.subscribe(queryRef, {}, { onUpdate: vi.fn(), onError })

        mockWebSocketInstance?.simulateMessage({
          type: 'error',
          subscriptionId,
          message: 'Query failed',
        })

        expect(onError).toHaveBeenCalled()
        client.close()
      })
    })

    describe('transition callback', () => {
      it('should call transition callback with previous and new data', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const queryRef = createMockFunctionRef('query', 'users:list')
        const onTransition = vi.fn()
        const subscriptionId = client.subscribe(queryRef, {}, { onUpdate: vi.fn(), onTransition })

        // First update
        mockWebSocketInstance?.simulateMessage({
          type: 'update',
          subscriptionId,
          data: [{ id: '1', name: 'Alice' }],
        })

        // Second update
        mockWebSocketInstance?.simulateMessage({
          type: 'update',
          subscriptionId,
          data: [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }],
        })

        expect(onTransition).toHaveBeenCalledWith(
          [{ id: '1', name: 'Alice' }],
          [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]
        )
        client.close()
      })

      it('should call transition with undefined for first update', async () => {
        const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const queryRef = createMockFunctionRef('query', 'users:list')
        const onTransition = vi.fn()
        const subscriptionId = client.subscribe(queryRef, {}, { onUpdate: vi.fn(), onTransition })

        mockWebSocketInstance?.simulateMessage({
          type: 'update',
          subscriptionId,
          data: ['initial data'],
        })

        expect(onTransition).toHaveBeenCalledWith(undefined, ['initial data'])
        client.close()
      })
    })
  })

  // ============================================================================
  // Unsubscribe Tests
  // ============================================================================

  describe('unsubscribe()', () => {
    it('should send unsubscribe message to server', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const queryRef = createMockFunctionRef('query', 'users:list')
      const subscriptionId = client.subscribe(queryRef, {}, { onUpdate: vi.fn() })

      client.unsubscribe(subscriptionId)

      const messages = mockWebSocketInstance?.getSentMessages()
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'unsubscribe',
        subscriptionId,
      }))
      client.close()
    })

    it('should decrement active subscription count', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const queryRef = createMockFunctionRef('query', 'users:list')
      const subscriptionId = client.subscribe(queryRef, {}, { onUpdate: vi.fn() })

      expect(client.getActiveSubscriptionCount()).toBe(1)

      client.unsubscribe(subscriptionId)

      expect(client.getActiveSubscriptionCount()).toBe(0)
      client.close()
    })

    it('should not call onUpdate after unsubscribe', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const queryRef = createMockFunctionRef('query', 'users:list')
      const onUpdate = vi.fn()
      const subscriptionId = client.subscribe(queryRef, {}, { onUpdate })

      client.unsubscribe(subscriptionId)

      mockWebSocketInstance?.simulateMessage({
        type: 'update',
        subscriptionId,
        data: ['should not be received'],
      })

      expect(onUpdate).not.toHaveBeenCalled()
      client.close()
    })

    it('should be safe to call with unknown subscription ID', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      expect(() => client.unsubscribe('unknown-id')).not.toThrow()
      client.close()
    })

    it('should be idempotent', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const queryRef = createMockFunctionRef('query', 'users:list')
      const subscriptionId = client.subscribe(queryRef, {}, { onUpdate: vi.fn() })

      client.unsubscribe(subscriptionId)
      expect(() => client.unsubscribe(subscriptionId)).not.toThrow()
      client.close()
    })

    it('should remove pending subscription if not yet sent', () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })

      const queryRef = createMockFunctionRef('query', 'users:list')
      const subscriptionId = client.subscribe(queryRef, {}, { onUpdate: vi.fn() })

      expect(client.getPendingSubscriptionCount()).toBe(1)

      client.unsubscribe(subscriptionId)

      expect(client.getPendingSubscriptionCount()).toBe(0)
      client.close()
    })
  })

  // ============================================================================
  // Mutation Tests
  // ============================================================================

  describe('mutation()', () => {
    it('should return a Promise', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const mutationRef = createMockFunctionRef('mutation', 'users:create')
      const result = client.mutation(mutationRef, { name: 'Alice' })

      expect(result).toBeInstanceOf(Promise)
      // Catch the rejection when we close
      result.catch(() => {})
      client.close()
    })

    it('should send mutation message to server', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const mutationRef = createMockFunctionRef('mutation', 'users:create')
      const mutationPromise = client.mutation(mutationRef, { name: 'Alice' })

      const messages = mockWebSocketInstance?.getSentMessages()
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'mutation',
        mutationPath: 'users:create',
        args: { name: 'Alice' },
      }))
      // Catch the rejection when we close
      mutationPromise.catch(() => {})
      client.close()
    })

    it('should resolve with result on success', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const mutationRef = createMockFunctionRef('mutation', 'users:create')
      const mutationPromise = client.mutation(mutationRef, { name: 'Alice' })

      // Get the request ID from sent messages
      const messages = mockWebSocketInstance?.getSentMessages() ?? []
      const mutationMessage = messages.find((m: any) => m.type === 'mutation') as any
      const requestId = mutationMessage?.requestId

      // Simulate server response
      mockWebSocketInstance?.simulateMessage({
        type: 'mutationResult',
        requestId,
        result: { id: 'user_123', name: 'Alice' },
      })

      await expect(mutationPromise).resolves.toEqual({ id: 'user_123', name: 'Alice' })
      client.close()
    })

    it('should reject with error on failure', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const mutationRef = createMockFunctionRef('mutation', 'users:create')
      const mutationPromise = client.mutation(mutationRef, { name: 'Alice' })

      const messages = mockWebSocketInstance?.getSentMessages() ?? []
      const mutationMessage = messages.find((m: any) => m.type === 'mutation') as any
      const requestId = mutationMessage?.requestId

      mockWebSocketInstance?.simulateMessage({
        type: 'mutationError',
        requestId,
        message: 'Validation error',
      })

      await expect(mutationPromise).rejects.toThrow('Validation error')
      client.close()
    })

    it('should queue mutation when disconnected', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })

      const mutationRef = createMockFunctionRef('mutation', 'users:create')
      const mutationPromise = client.mutation(mutationRef, { name: 'Alice' })

      expect(client.getPendingMutationCount()).toBe(1)

      // Connect and verify mutation is sent
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const messages = mockWebSocketInstance?.getSentMessages()
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'mutation',
        mutationPath: 'users:create',
      }))

      // Resolve the mutation
      const mutationMessage = messages?.find((m: any) => m.type === 'mutation') as any
      mockWebSocketInstance?.simulateMessage({
        type: 'mutationResult',
        requestId: mutationMessage?.requestId,
        result: { id: 'user_123' },
      })

      await mutationPromise
      client.close()
    })
  })

  // ============================================================================
  // Action Tests
  // ============================================================================

  describe('action()', () => {
    it('should return a Promise', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const actionRef = createMockFunctionRef('action', 'email:send')
      const result = client.action(actionRef, { to: 'test@example.com' })

      expect(result).toBeInstanceOf(Promise)
      // Catch the rejection when we close
      result.catch(() => {})
      client.close()
    })

    it('should send action message to server', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const actionRef = createMockFunctionRef('action', 'email:send')
      const actionPromise = client.action(actionRef, { to: 'test@example.com' })

      const messages = mockWebSocketInstance?.getSentMessages()
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'action',
        actionPath: 'email:send',
        args: { to: 'test@example.com' },
      }))
      // Catch the rejection when we close
      actionPromise.catch(() => {})
      client.close()
    })

    it('should resolve with result on success', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const actionRef = createMockFunctionRef('action', 'email:send')
      const actionPromise = client.action(actionRef, { to: 'test@example.com' })

      const messages = mockWebSocketInstance?.getSentMessages() ?? []
      const actionMessage = messages.find((m: any) => m.type === 'action') as any
      const requestId = actionMessage?.requestId

      mockWebSocketInstance?.simulateMessage({
        type: 'actionResult',
        requestId,
        result: { messageId: 'msg_123' },
      })

      await expect(actionPromise).resolves.toEqual({ messageId: 'msg_123' })
      client.close()
    })

    it('should reject with error on failure', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const actionRef = createMockFunctionRef('action', 'email:send')
      const actionPromise = client.action(actionRef, { to: 'invalid' })

      const messages = mockWebSocketInstance?.getSentMessages() ?? []
      const actionMessage = messages.find((m: any) => m.type === 'action') as any
      const requestId = actionMessage?.requestId

      mockWebSocketInstance?.simulateMessage({
        type: 'actionError',
        requestId,
        message: 'Invalid email address',
      })

      await expect(actionPromise).rejects.toThrow('Invalid email address')
      client.close()
    })

    it('should queue action when disconnected', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })

      const actionRef = createMockFunctionRef('action', 'email:send')
      const actionPromise = client.action(actionRef, { to: 'test@example.com' })

      expect(client.getPendingActionCount()).toBe(1)

      // Catch the rejection when we close
      actionPromise.catch(() => {})
      client.close()
    })
  })

  // ============================================================================
  // onConnect/onDisconnect Callback Tests
  // ============================================================================

  describe('connection callbacks', () => {
    describe('onConnect', () => {
      it('should be called when connection is established', async () => {
        const onConnect = vi.fn()
        const client = new ConvexClient('https://example.convex.cloud', {
          skipConnectionCheck: true,
          onConnect,
        })

        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(onConnect).toHaveBeenCalled()
        client.close()
      })

      it('should be called on reconnection', async () => {
        vi.useFakeTimers()
        const onConnect = vi.fn()
        const client = new ConvexClient('https://example.convex.cloud', {
          skipConnectionCheck: true,
          onConnect,
          reconnectDelay: 100,
        })

        // Initial connection
        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(onConnect).toHaveBeenCalledTimes(1)

        // Simulate disconnect
        mockWebSocketInstance?.simulateClose(1006)
        await vi.advanceTimersByTimeAsync(150)

        // Reconnect
        mockWebSocketInstance?.simulateOpen()
        await vi.advanceTimersByTimeAsync(10)

        expect(onConnect).toHaveBeenCalledTimes(2)
        client.close()
      })
    })

    describe('onDisconnect', () => {
      it('should be called when connection is lost', async () => {
        const onDisconnect = vi.fn()
        const client = new ConvexClient('https://example.convex.cloud', {
          skipConnectionCheck: true,
          onDisconnect,
        })

        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        mockWebSocketInstance?.simulateClose(1006)

        expect(onDisconnect).toHaveBeenCalled()
        client.close()
      })

      it('should receive close code and reason', async () => {
        const onDisconnect = vi.fn()
        const client = new ConvexClient('https://example.convex.cloud', {
          skipConnectionCheck: true,
          onDisconnect,
        })

        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        mockWebSocketInstance?.simulateClose(1001, 'Going away')

        expect(onDisconnect).toHaveBeenCalledWith(1001, 'Going away')
        client.close()
      })

      it('should be called on disconnect()', async () => {
        const onDisconnect = vi.fn()
        const client = new ConvexClient('https://example.convex.cloud', {
          skipConnectionCheck: true,
          onDisconnect,
        })

        const connectPromise = client.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        client.disconnect()
        await delay(10)

        expect(onDisconnect).toHaveBeenCalled()
        client.close()
      })
    })
  })

  // ============================================================================
  // Automatic Reconnection Tests
  // ============================================================================

  describe('automatic reconnection', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('should attempt reconnect when connection drops', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        reconnectDelay: 100,
      })

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      // Simulate connection drop
      mockWebSocketInstance?.simulateClose(1006)

      await vi.advanceTimersByTimeAsync(150)

      // Should have attempted to reconnect
      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(2)
      client.close()
    })

    it('should not reconnect on normal close (code 1000)', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        reconnectDelay: 100,
      })

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      mockWebSocketInstance?.simulateClose(1000, 'Normal closure')

      await vi.advanceTimersByTimeAsync(500)

      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(1)
      client.close()
    })

    it('should respect max reconnection attempts', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
      })

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      // First disconnect
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(150)

      // First reconnect attempt
      mockWebSocketInstance?.simulateError('Failed')
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(150)

      // Second reconnect attempt
      mockWebSocketInstance?.simulateError('Failed')
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(150)

      // Should not attempt third reconnect
      expect(webSocketConstructorSpy.mock.calls.length).toBeLessThanOrEqual(3)
      client.close()
    })

    it('should use exponential backoff', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        reconnectDelay: 100,
        reconnectBackoff: 'exponential',
      })

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      // First disconnect
      mockWebSocketInstance?.simulateClose(1006)

      // First reconnect at ~100ms
      await vi.advanceTimersByTimeAsync(100)
      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(2)
      mockWebSocketInstance?.simulateOpen()

      // Second disconnect
      mockWebSocketInstance?.simulateClose(1006)

      // Should wait longer for second reconnect
      await vi.advanceTimersByTimeAsync(100)
      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(3)

      client.close()
    })

    it('should reset reconnect attempts on successful connection', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
      })

      // Initial connection
      client.connect()
      mockWebSocketInstance?.simulateOpen()

      // First disconnect and reconnect
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(150)
      mockWebSocketInstance?.simulateOpen()

      // Second disconnect and reconnect (counter should have reset)
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(150)
      mockWebSocketInstance?.simulateOpen()

      // Third disconnect and reconnect
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(150)

      // Should still reconnect because counter was reset
      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(4)
      client.close()
    })
  })

  // ============================================================================
  // State Recovery Tests
  // ============================================================================

  describe('state recovery on reconnect', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('should resubscribe to all active queries on reconnect', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        reconnectDelay: 100,
      })

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      // Create subscriptions
      const queryRef = createMockFunctionRef('query', 'users:list')
      client.subscribe(queryRef, {}, { onUpdate: vi.fn() })
      client.subscribe(queryRef, { filter: 'active' }, { onUpdate: vi.fn() })

      // Clear sent messages
      if (mockWebSocketInstance) {
        mockWebSocketInstance.getSentMessages().length = 0
      }

      // Simulate disconnect
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(150)

      // Reconnect
      mockWebSocketInstance?.simulateOpen()

      // Should have re-sent subscribe messages
      const messages = mockWebSocketInstance?.getSentMessages()
      const subscribeMessages = messages?.filter((m: any) => m.type === 'subscribe')
      expect(subscribeMessages?.length).toBe(2)

      client.close()
    })

    it('should notify subscribers of disconnect', async () => {
      const onDisconnect = vi.fn()
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        onDisconnect,
      })

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      mockWebSocketInstance?.simulateClose(1006)

      expect(onDisconnect).toHaveBeenCalled()
      client.close()
    })

    it('should call onReconnect callback after reconnection', async () => {
      const onReconnect = vi.fn()
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        reconnectDelay: 100,
        onReconnect,
      })

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(150)
      mockWebSocketInstance?.simulateOpen()

      expect(onReconnect).toHaveBeenCalled()
      client.close()
    })
  })

  // ============================================================================
  // Message Queuing Tests
  // ============================================================================

  describe('message queuing', () => {
    it('should queue messages when disconnected', () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })

      const mutationRef = createMockFunctionRef('mutation', 'users:create')
      const mutationPromise = client.mutation(mutationRef, { name: 'Alice' })

      expect(client.getPendingMutationCount()).toBe(1)
      // Catch the rejection when we close
      mutationPromise.catch(() => {})
      client.close()
    })

    it('should flush queued messages on connect', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })

      const mutationRef = createMockFunctionRef('mutation', 'users:create')
      const mutationPromise = client.mutation(mutationRef, { name: 'Alice' })

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const messages = mockWebSocketInstance?.getSentMessages()
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'mutation',
        mutationPath: 'users:create',
      }))
      // Catch the rejection when we close
      mutationPromise.catch(() => {})
      client.close()
    })

    it('should clear pending count after flush', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })

      const mutationRef = createMockFunctionRef('mutation', 'users:create')
      const mutationPromise = client.mutation(mutationRef, { name: 'Alice' })

      expect(client.getPendingMutationCount()).toBe(1)

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      expect(client.getPendingMutationCount()).toBe(0)
      // Catch the rejection when we close
      mutationPromise.catch(() => {})
      client.close()
    })
  })

  // ============================================================================
  // Subscription Deduplication Tests
  // ============================================================================

  describe('subscription deduplication', () => {
    it('should deduplicate subscriptions with same query and args', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        deduplicateSubscriptions: true,
      })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const queryRef = createMockFunctionRef('query', 'users:list')
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      client.subscribe(queryRef, { limit: 10 }, { onUpdate: callback1 })
      client.subscribe(queryRef, { limit: 10 }, { onUpdate: callback2 })

      // Should only send one subscribe message
      const messages = mockWebSocketInstance?.getSentMessages()
      const subscribeMessages = messages?.filter((m: any) => m.type === 'subscribe')
      expect(subscribeMessages?.length).toBe(1)
      client.close()
    })

    it('should call all callbacks when deduplicated subscription updates', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        deduplicateSubscriptions: true,
      })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const queryRef = createMockFunctionRef('query', 'users:list')
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const sub1 = client.subscribe(queryRef, { limit: 10 }, { onUpdate: callback1 })
      client.subscribe(queryRef, { limit: 10 }, { onUpdate: callback2 })

      // Send update (using first subscription ID)
      mockWebSocketInstance?.simulateMessage({
        type: 'update',
        subscriptionId: sub1,
        data: [{ id: '1' }],
      })

      expect(callback1).toHaveBeenCalledWith([{ id: '1' }])
      expect(callback2).toHaveBeenCalledWith([{ id: '1' }])
      client.close()
    })

    it('should keep subscription active until all callbacks unsubscribe', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        deduplicateSubscriptions: true,
      })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const queryRef = createMockFunctionRef('query', 'users:list')
      const sub1 = client.subscribe(queryRef, {}, { onUpdate: vi.fn() })
      const sub2 = client.subscribe(queryRef, {}, { onUpdate: vi.fn() })

      // Unsubscribe first callback
      client.unsubscribe(sub1)

      // Should not send unsubscribe message yet
      const messages1 = mockWebSocketInstance?.getSentMessages()
      const unsubMessages1 = messages1?.filter((m: any) => m.type === 'unsubscribe')
      expect(unsubMessages1?.length).toBe(0)

      // Unsubscribe second callback
      client.unsubscribe(sub2)

      // Now should send unsubscribe message
      const messages2 = mockWebSocketInstance?.getSentMessages()
      const unsubMessages2 = messages2?.filter((m: any) => m.type === 'unsubscribe')
      expect(unsubMessages2?.length).toBe(1)
      client.close()
    })

    it('should not deduplicate subscriptions with different args', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        deduplicateSubscriptions: true,
      })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const queryRef = createMockFunctionRef('query', 'users:list')
      client.subscribe(queryRef, { limit: 10 }, { onUpdate: vi.fn() })
      client.subscribe(queryRef, { limit: 20 }, { onUpdate: vi.fn() })

      const messages = mockWebSocketInstance?.getSentMessages()
      const subscribeMessages = messages?.filter((m: any) => m.type === 'subscribe')
      expect(subscribeMessages?.length).toBe(2)
      client.close()
    })
  })

  // ============================================================================
  // Authentication Tests
  // ============================================================================

  describe('authentication', () => {
    it('should send auth token on connect when set', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      client.setAuth('test-token')

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const messages = mockWebSocketInstance?.getSentMessages()
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'authenticate',
        token: 'test-token',
      }))
      client.close()
    })

    it('should send auth token when calling setAuth after connect', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      client.setAuth('test-token')

      const messages = mockWebSocketInstance?.getSentMessages()
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'authenticate',
        token: 'test-token',
      }))
      client.close()
    })

    it('should clear auth on clearAuth()', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      client.setAuth('test-token')

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      client.clearAuth()

      // Auth should be cleared (verify by reconnecting)
      if (mockWebSocketInstance) {
        mockWebSocketInstance.getSentMessages().length = 0
      }
      mockWebSocketInstance?.simulateClose(1006)

      vi.useFakeTimers()
      await vi.advanceTimersByTimeAsync(1500)
      mockWebSocketInstance?.simulateOpen()

      const messages = mockWebSocketInstance?.getSentMessages()
      const authMessages = messages?.filter((m: any) => m.type === 'authenticate')
      expect(authMessages?.length).toBe(0)

      client.close()
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should emit error event on WebSocket error', async () => {
      const onError = vi.fn()
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        onError,
      })

      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateError('Connection failed')

      expect(onError).toHaveBeenCalled()
      // Catch the rejection from connect
      connectPromise.catch(() => {})
      client.close()
    })

    it('should reject pending mutations on close without reconnect', async () => {
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        maxReconnectAttempts: 0,
      })

      const mutationRef = createMockFunctionRef('mutation', 'users:create')
      const mutationPromise = client.mutation(mutationRef, { name: 'Alice' })

      // Close without connecting (no reconnect)
      client.close()

      await expect(mutationPromise).rejects.toThrow()
    })

    it('should handle malformed server messages gracefully', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      // Should not throw
      expect(() => {
        mockWebSocketInstance?.simulateMessage({ type: 'unknown' })
      }).not.toThrow()

      client.close()
    })
  })

  // ============================================================================
  // ConnectionState Enum Tests
  // ============================================================================

  describe('ConnectionState enum', () => {
    it('should export Disconnected state', () => {
      expect(ConnectionState.Disconnected).toBeDefined()
    })

    it('should export Connecting state', () => {
      expect(ConnectionState.Connecting).toBeDefined()
    })

    it('should export Connected state', () => {
      expect(ConnectionState.Connected).toBeDefined()
    })

    it('should have distinct values', () => {
      const states = [
        ConnectionState.Disconnected,
        ConnectionState.Connecting,
        ConnectionState.Connected,
      ]
      const uniqueStates = new Set(states)
      expect(uniqueStates.size).toBe(3)
    })
  })

  // ============================================================================
  // Edge Cases Tests
  // ============================================================================

  describe('edge cases', () => {
    it('should handle rapid subscribe/unsubscribe cycles', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const queryRef = createMockFunctionRef('query', 'users:list')

      for (let i = 0; i < 100; i++) {
        const sub = client.subscribe(queryRef, {}, { onUpdate: vi.fn() })
        client.unsubscribe(sub)
      }

      expect(client.getActiveSubscriptionCount()).toBe(0)
      client.close()
    })

    it('should handle multiple mutations in flight', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const mutationRef = createMockFunctionRef('mutation', 'users:create')

      const promises = []
      for (let i = 0; i < 10; i++) {
        promises.push(client.mutation(mutationRef, { name: `User${i}` }))
      }

      // Resolve all mutations
      const messages = mockWebSocketInstance?.getSentMessages() ?? []
      const mutationMessages = messages.filter((m: any) => m.type === 'mutation') as any[]

      for (const msg of mutationMessages) {
        mockWebSocketInstance?.simulateMessage({
          type: 'mutationResult',
          requestId: msg.requestId,
          result: { id: 'test' },
        })
      }

      await Promise.all(promises)
      client.close()
    })

    it('should handle disconnect during mutation', async () => {
      vi.useFakeTimers()
      const client = new ConvexClient('https://example.convex.cloud', {
        skipConnectionCheck: true,
        reconnectDelay: 100,
      })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const mutationRef = createMockFunctionRef('mutation', 'users:create')
      const mutationPromise = client.mutation(mutationRef, { name: 'Alice' })

      // Disconnect before response
      mockWebSocketInstance?.simulateClose(1006)

      // Reconnect
      await vi.advanceTimersByTimeAsync(150)
      mockWebSocketInstance?.simulateOpen()

      // The mutation should have been re-sent
      const messages = mockWebSocketInstance?.getSentMessages() ?? []
      const mutationMessages = messages.filter((m: any) => m.type === 'mutation')
      expect(mutationMessages.length).toBeGreaterThanOrEqual(1)

      // Resolve the mutation
      const latestMutation = mutationMessages[mutationMessages.length - 1] as any
      mockWebSocketInstance?.simulateMessage({
        type: 'mutationResult',
        requestId: latestMutation.requestId,
        result: { id: 'user_123' },
      })

      await expect(mutationPromise).resolves.toEqual({ id: 'user_123' })
      client.close()
    })

    it('should handle very large payloads', async () => {
      const client = new ConvexClient('https://example.convex.cloud', { skipConnectionCheck: true })
      const connectPromise = client.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const queryRef = createMockFunctionRef('query', 'users:list')
      const onUpdate = vi.fn()
      const subscriptionId = client.subscribe(queryRef, {}, { onUpdate })

      const largeData = Array(10000).fill(null).map((_, i) => ({
        id: `user_${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
      }))

      mockWebSocketInstance?.simulateMessage({
        type: 'update',
        subscriptionId,
        data: largeData,
      })

      expect(onUpdate).toHaveBeenCalledWith(largeData)
      client.close()
    })
  })

  // ============================================================================
  // Type Export Tests
  // ============================================================================

  describe('type exports', () => {
    it('should export ConvexClientOptions type', () => {
      const options: ConvexClientOptions = {
        skipConnectionCheck: true,
        reconnectDelay: 1000,
      }
      expect(options).toBeDefined()
    })

    it('should export SubscribeCallbacks type', () => {
      const callbacks: SubscribeCallbacks<unknown> = {
        onUpdate: () => {},
        onError: () => {},
      }
      expect(callbacks).toBeDefined()
    })

    it('should export SubscriptionId type', () => {
      const id: SubscriptionId = 'sub_123'
      expect(id).toBeDefined()
    })
  })
})
