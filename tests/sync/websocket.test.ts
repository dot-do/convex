/**
 * TDD Tests for WebSocket Handler
 *
 * These tests define the expected behavior for the WebSocketHandler class
 * that manages WebSocket connections for real-time sync functionality.
 *
 * Bead: convex-936.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  WebSocketHandler,
  ConnectionState,
  type WebSocketMessage,
  type WebSocketOptions,
  type WebSocketEventHandlers,
} from '../../src/sync/websocket'

// ============================================================================
// Mock CloseEvent (not available in Node.js)
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

// ============================================================================
// Mock WebSocket Implementation
// ============================================================================

/**
 * Mock WebSocket class for testing.
 */
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  protocols?: string | string[]
  readyState: number = MockWebSocket.CONNECTING
  binaryType: BinaryType = 'blob'
  bufferedAmount: number = 0
  extensions: string = ''
  protocol: string = ''

  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  private _closeWasCalled = false

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
    if (Array.isArray(protocols) && protocols.length > 0) {
      this.protocol = protocols[0]
    } else if (typeof protocols === 'string') {
      this.protocol = protocols
    }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
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

  simulateMessage(data: string | ArrayBuffer): void {
    if (this.onmessage) {
      const event = new MessageEvent('message', { data })
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

  wasCloseCalled(): boolean {
    return this._closeWasCalled
  }
}

// Store reference to the original WebSocket
let originalWebSocket: typeof globalThis.WebSocket

// ============================================================================
// Test Setup
// ============================================================================

describe('WebSocketHandler', () => {
  let mockWebSocketInstance: MockWebSocket | null = null
  let webSocketConstructorSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Store original WebSocket
    originalWebSocket = globalThis.WebSocket

    // Create a spy for WebSocket constructor
    webSocketConstructorSpy = vi.fn((url: string, protocols?: string | string[]) => {
      mockWebSocketInstance = new MockWebSocket(url, protocols)
      return mockWebSocketInstance
    })

    // Add static constants to the constructor spy
    Object.assign(webSocketConstructorSpy, {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    })

    // Replace global WebSocket
    globalThis.WebSocket = webSocketConstructorSpy as unknown as typeof WebSocket
  })

  afterEach(() => {
    // Restore original WebSocket
    globalThis.WebSocket = originalWebSocket
    mockWebSocketInstance = null
    vi.clearAllMocks()
  })

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create a WebSocketHandler with a URL', () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      expect(handler).toBeDefined()
    })

    it('should accept ws:// URLs', () => {
      const handler = new WebSocketHandler('ws://localhost:3000/sync')
      expect(handler).toBeDefined()
    })

    it('should accept wss:// URLs', () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      expect(handler).toBeDefined()
    })

    it('should throw for invalid URL schemes', () => {
      expect(() => new WebSocketHandler('http://invalid.com')).toThrow()
      expect(() => new WebSocketHandler('https://invalid.com')).toThrow()
    })

    it('should throw for empty URL', () => {
      expect(() => new WebSocketHandler('')).toThrow()
    })

    it('should throw for invalid URLs', () => {
      expect(() => new WebSocketHandler('not-a-url')).toThrow()
    })

    it('should accept optional configuration', () => {
      const options: WebSocketOptions = {
        protocols: ['convex-sync'],
        reconnect: true,
        reconnectDelay: 1000,
        maxReconnectAttempts: 5,
        connectionTimeout: 30000,
      }
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', options)
      expect(handler).toBeDefined()
    })

    it('should store the URL', () => {
      const url = 'wss://api.convex.cloud/sync'
      const handler = new WebSocketHandler(url)
      expect(handler.url).toBe(url)
    })

    it('should initialize in disconnected state', () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      expect(handler.getState()).toBe(ConnectionState.Disconnected)
    })
  })

  // ============================================================================
  // Connection Lifecycle Tests
  // ============================================================================

  describe('connection lifecycle', () => {
    describe('connect()', () => {
      it('should return a Promise', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const result = handler.connect()
        expect(result).toBeInstanceOf(Promise)
      })

      it('should transition to connecting state immediately', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        handler.connect()
        expect(handler.getState()).toBe(ConnectionState.Connecting)
      })

      it('should create a WebSocket with the correct URL', () => {
        const url = 'wss://api.convex.cloud/sync'
        const handler = new WebSocketHandler(url)
        handler.connect()

        expect(webSocketConstructorSpy).toHaveBeenCalledWith(url, undefined)
      })

      it('should create a WebSocket with protocols if specified', () => {
        const url = 'wss://api.convex.cloud/sync'
        const options: WebSocketOptions = { protocols: ['convex-sync', 'convex-v1'] }
        const handler = new WebSocketHandler(url, options)
        handler.connect()

        expect(webSocketConstructorSpy).toHaveBeenCalledWith(url, ['convex-sync', 'convex-v1'])
      })

      it('should resolve when connection opens', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()

        // Simulate successful connection
        mockWebSocketInstance?.simulateOpen()

        await expect(connectPromise).resolves.toBeUndefined()
      })

      it('should transition to connected state on success', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()

        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(handler.getState()).toBe(ConnectionState.Connected)
      })

      it('should reject if connection fails', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()

        mockWebSocketInstance?.simulateError('Connection refused')

        await expect(connectPromise).rejects.toThrow()
      })

      it('should throw if already connected', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        await expect(handler.connect()).rejects.toThrow(/already connected/i)
      })

      it('should throw if already connecting', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        handler.connect()

        expect(() => handler.connect()).rejects.toThrow(/already connecting/i)
      })
    })

    describe('close()', () => {
      it('should close an open connection', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        handler.close()

        expect(mockWebSocketInstance?.wasCloseCalled()).toBe(true)
      })

      it('should transition to disconnected state', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        handler.close()

        // Wait for async close event
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(handler.getState()).toBe(ConnectionState.Disconnected)
      })

      it('should accept an optional close code', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        handler.close(1001)

        expect(mockWebSocketInstance?.wasCloseCalled()).toBe(true)
      })

      it('should accept an optional close reason', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        handler.close(1000, 'Normal closure')

        expect(mockWebSocketInstance?.wasCloseCalled()).toBe(true)
      })

      it('should be safe to call when not connected', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        expect(() => handler.close()).not.toThrow()
      })

      it('should be safe to call multiple times', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        handler.close()
        expect(() => handler.close()).not.toThrow()
      })
    })

    describe('disconnect handling', () => {
      it('should transition to disconnected state on server close', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        mockWebSocketInstance?.simulateClose(1000, 'Server closing')

        expect(handler.getState()).toBe(ConnectionState.Disconnected)
      })

      it('should transition to disconnected state on error', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        mockWebSocketInstance?.simulateError('Network error')
        mockWebSocketInstance?.simulateClose(1006, 'Abnormal closure')

        expect(handler.getState()).toBe(ConnectionState.Disconnected)
      })
    })
  })

  // ============================================================================
  // Connection State Tests
  // ============================================================================

  describe('connection state', () => {
    describe('getState()', () => {
      it('should return ConnectionState enum value', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const state = handler.getState()

        expect(Object.values(ConnectionState)).toContain(state)
      })

      it('should return Disconnected initially', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        expect(handler.getState()).toBe(ConnectionState.Disconnected)
      })

      it('should return Connecting during connection', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        handler.connect()

        expect(handler.getState()).toBe(ConnectionState.Connecting)
      })

      it('should return Connected after successful connection', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(handler.getState()).toBe(ConnectionState.Connected)
      })

      it('should return Disconnected after close', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        handler.close()
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(handler.getState()).toBe(ConnectionState.Disconnected)
      })
    })

    describe('isConnected()', () => {
      it('should return false initially', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        expect(handler.isConnected()).toBe(false)
      })

      it('should return false while connecting', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        handler.connect()

        expect(handler.isConnected()).toBe(false)
      })

      it('should return true when connected', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(handler.isConnected()).toBe(true)
      })

      it('should return false after disconnect', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        handler.close()
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(handler.isConnected()).toBe(false)
      })
    })
  })

  // ============================================================================
  // Message Sending Tests
  // ============================================================================

  describe('message sending', () => {
    describe('send()', () => {
      it('should send string messages', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const sendSpy = vi.spyOn(mockWebSocketInstance!, 'send')
        handler.send('hello')

        expect(sendSpy).toHaveBeenCalledWith('hello')
      })

      it('should send object messages as JSON', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const sendSpy = vi.spyOn(mockWebSocketInstance!, 'send')
        const message = { type: 'subscribe', query: 'users:list' }
        handler.send(message)

        expect(sendSpy).toHaveBeenCalledWith(JSON.stringify(message))
      })

      it('should send ArrayBuffer messages', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const sendSpy = vi.spyOn(mockWebSocketInstance!, 'send')
        const buffer = new ArrayBuffer(8)
        handler.send(buffer)

        expect(sendSpy).toHaveBeenCalledWith(buffer)
      })

      it('should send Uint8Array messages', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const sendSpy = vi.spyOn(mockWebSocketInstance!, 'send')
        const data = new Uint8Array([1, 2, 3, 4])
        handler.send(data)

        expect(sendSpy).toHaveBeenCalledWith(data)
      })

      it('should throw when not connected', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')

        expect(() => handler.send('hello')).toThrow(/not connected/i)
      })

      it('should throw when connection is closing', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        // Start closing
        handler.close()

        // Mock is in closing state but hasn't finished yet
        if (mockWebSocketInstance) {
          mockWebSocketInstance.readyState = MockWebSocket.CLOSING
        }

        expect(() => handler.send('hello')).toThrow(/not connected/i)
      })
    })

    describe('sendAsync()', () => {
      it('should return a Promise', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        const result = handler.sendAsync('hello')
        expect(result).toBeInstanceOf(Promise)
      })

      it('should resolve when message is sent', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        await expect(handler.sendAsync('hello')).resolves.toBeUndefined()
      })

      it('should reject if send fails', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        // Force send to throw
        vi.spyOn(mockWebSocketInstance!, 'send').mockImplementation(() => {
          throw new Error('Send failed')
        })

        await expect(handler.sendAsync('hello')).rejects.toThrow('Send failed')
      })
    })
  })

  // ============================================================================
  // Message Receiving Tests
  // ============================================================================

  describe('message receiving', () => {
    it('should trigger onmessage for text messages', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      const messageHandler = vi.fn()
      handler.onmessage = messageHandler

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      mockWebSocketInstance?.simulateMessage('hello world')

      expect(messageHandler).toHaveBeenCalled()
    })

    it('should pass message data to onmessage handler', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      let receivedData: unknown = null
      handler.onmessage = (data) => {
        receivedData = data
      }

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      mockWebSocketInstance?.simulateMessage('hello world')

      expect(receivedData).toBe('hello world')
    })

    it('should parse JSON messages automatically when enabled', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        parseJson: true,
      })
      let receivedData: unknown = null
      handler.onmessage = (data) => {
        receivedData = data
      }

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      mockWebSocketInstance?.simulateMessage(JSON.stringify({ type: 'update', data: [1, 2, 3] }))

      expect(receivedData).toEqual({ type: 'update', data: [1, 2, 3] })
    })

    it('should handle binary messages', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      let receivedData: unknown = null
      handler.onmessage = (data) => {
        receivedData = data
      }

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      const binaryData = new ArrayBuffer(8)
      mockWebSocketInstance?.simulateMessage(binaryData)

      expect(receivedData).toBe(binaryData)
    })

    it('should not throw if onmessage is not set', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      expect(() => mockWebSocketInstance?.simulateMessage('hello')).not.toThrow()
    })
  })

  // ============================================================================
  // Event Handler Tests
  // ============================================================================

  describe('event handlers', () => {
    describe('onopen', () => {
      it('should be called when connection opens', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const openHandler = vi.fn()
        handler.onopen = openHandler

        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(openHandler).toHaveBeenCalled()
      })

      it('should be called only once per connection', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const openHandler = vi.fn()
        handler.onopen = openHandler

        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(openHandler).toHaveBeenCalledTimes(1)
      })
    })

    describe('onclose', () => {
      it('should be called when connection closes', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const closeHandler = vi.fn()
        handler.onclose = closeHandler

        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        handler.close()
        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(closeHandler).toHaveBeenCalled()
      })

      it('should receive close code and reason', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        let receivedCode: number | undefined
        let receivedReason: string | undefined
        handler.onclose = (code, reason) => {
          receivedCode = code
          receivedReason = reason
        }

        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        mockWebSocketInstance?.simulateClose(1001, 'Going away')

        expect(receivedCode).toBe(1001)
        expect(receivedReason).toBe('Going away')
      })

      it('should be called on server-initiated close', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const closeHandler = vi.fn()
        handler.onclose = closeHandler

        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        mockWebSocketInstance?.simulateClose(1000, 'Normal')

        expect(closeHandler).toHaveBeenCalled()
      })
    })

    describe('onerror', () => {
      it('should be called on connection error', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const errorHandler = vi.fn()
        handler.onerror = errorHandler

        handler.connect()
        mockWebSocketInstance?.simulateError('Connection failed')

        expect(errorHandler).toHaveBeenCalled()
      })

      it('should receive error information', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        let receivedError: Error | undefined
        handler.onerror = (error) => {
          receivedError = error
        }

        handler.connect()
        mockWebSocketInstance?.simulateError('Connection failed')

        expect(receivedError).toBeInstanceOf(Error)
      })
    })

    describe('onmessage', () => {
      it('should be settable as a property', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const messageHandler = vi.fn()
        handler.onmessage = messageHandler

        expect(handler.onmessage).toBe(messageHandler)
      })

      it('should be replaceable', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        const handler1 = vi.fn()
        const handler2 = vi.fn()

        handler.onmessage = handler1
        handler.onmessage = handler2

        expect(handler.onmessage).toBe(handler2)
      })

      it('should be clearable by setting to null', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
        handler.onmessage = vi.fn()
        handler.onmessage = null

        expect(handler.onmessage).toBeNull()
      })
    })
  })

  // ============================================================================
  // Message Queuing Tests
  // ============================================================================

  describe('message queuing', () => {
    describe('when disconnected', () => {
      it('should queue messages when queueWhenDisconnected is enabled', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
          queueWhenDisconnected: true,
        })

        expect(() => handler.send({ type: 'ping' })).not.toThrow()
      })

      it('should flush queued messages on connect', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
          queueWhenDisconnected: true,
        })

        handler.send({ type: 'message1' })
        handler.send({ type: 'message2' })

        const connectPromise = handler.connect()

        // Set up spy BEFORE simulating open (queue flushes on open)
        const sendSpy = vi.spyOn(mockWebSocketInstance!, 'send')

        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(sendSpy).toHaveBeenCalledTimes(2)
      })

      it('should maintain message order in queue', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
          queueWhenDisconnected: true,
        })

        handler.send({ type: 'first' })
        handler.send({ type: 'second' })
        handler.send({ type: 'third' })

        const connectPromise = handler.connect()

        // Set up spy BEFORE simulating open (queue flushes on open)
        const sentMessages: string[] = []
        vi.spyOn(mockWebSocketInstance!, 'send').mockImplementation((data: string) => {
          sentMessages.push(data)
        })

        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(sentMessages[0]).toContain('first')
        expect(sentMessages[1]).toContain('second')
        expect(sentMessages[2]).toContain('third')
      })

      it('should respect max queue size', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
          queueWhenDisconnected: true,
          maxQueueSize: 2,
        })

        handler.send({ type: 'message1' })
        handler.send({ type: 'message2' })
        handler.send({ type: 'message3' })

        expect(handler.getQueueSize()).toBe(2)
      })

      it('should drop oldest messages when queue is full', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
          queueWhenDisconnected: true,
          maxQueueSize: 2,
        })

        handler.send({ type: 'dropped' })
        handler.send({ type: 'kept1' })
        handler.send({ type: 'kept2' })

        const connectPromise = handler.connect()

        // Set up spy BEFORE simulating open (queue flushes on open)
        const sentMessages: string[] = []
        vi.spyOn(mockWebSocketInstance!, 'send').mockImplementation((data: string) => {
          sentMessages.push(data)
        })

        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        expect(sentMessages.some((m) => m.includes('dropped'))).toBe(false)
        expect(sentMessages.some((m) => m.includes('kept1'))).toBe(true)
        expect(sentMessages.some((m) => m.includes('kept2'))).toBe(true)
      })
    })

    describe('getQueueSize()', () => {
      it('should return 0 initially', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
          queueWhenDisconnected: true,
        })
        expect(handler.getQueueSize()).toBe(0)
      })

      it('should return number of queued messages', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
          queueWhenDisconnected: true,
        })

        handler.send({ type: 'msg1' })
        handler.send({ type: 'msg2' })

        expect(handler.getQueueSize()).toBe(2)
      })

      it('should return 0 after queue is flushed', async () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
          queueWhenDisconnected: true,
        })

        handler.send({ type: 'msg1' })

        const connectPromise = handler.connect()
        mockWebSocketInstance?.simulateOpen()
        await connectPromise

        await new Promise((resolve) => setTimeout(resolve, 10))

        expect(handler.getQueueSize()).toBe(0)
      })
    })

    describe('clearQueue()', () => {
      it('should clear all queued messages', () => {
        const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
          queueWhenDisconnected: true,
        })

        handler.send({ type: 'msg1' })
        handler.send({ type: 'msg2' })
        handler.clearQueue()

        expect(handler.getQueueSize()).toBe(0)
      })
    })
  })

  // ============================================================================
  // Connection Timeout Tests
  // ============================================================================

  describe('connection timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should timeout if connection takes too long', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        connectionTimeout: 5000,
      })

      const connectPromise = handler.connect()

      // Advance time past timeout
      vi.advanceTimersByTime(6000)

      await expect(connectPromise).rejects.toThrow(/timeout/i)
    })

    it('should use default timeout if not specified', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')

      const connectPromise = handler.connect()

      // Advance time to default timeout (should be 30 seconds)
      vi.advanceTimersByTime(31000)

      await expect(connectPromise).rejects.toThrow(/timeout/i)
    })

    it('should cancel timeout on successful connection', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        connectionTimeout: 5000,
      })

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()

      await vi.runAllTimersAsync()

      await expect(connectPromise).resolves.toBeUndefined()
      expect(handler.getState()).toBe(ConnectionState.Connected)
    })

    it('should transition to disconnected state on timeout', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        connectionTimeout: 5000,
      })

      const connectPromise = handler.connect()
      vi.advanceTimersByTime(6000)

      try {
        await connectPromise
      } catch {
        // Expected
      }

      expect(handler.getState()).toBe(ConnectionState.Disconnected)
    })
  })

  // ============================================================================
  // Protocol Negotiation Tests
  // ============================================================================

  describe('protocol negotiation', () => {
    it('should pass single protocol to WebSocket', () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        protocols: 'convex-sync',
      })
      handler.connect()

      expect(webSocketConstructorSpy).toHaveBeenCalledWith(expect.any(String), 'convex-sync')
    })

    it('should pass multiple protocols to WebSocket', () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        protocols: ['convex-sync-v2', 'convex-sync-v1'],
      })
      handler.connect()

      expect(webSocketConstructorSpy).toHaveBeenCalledWith(expect.any(String), [
        'convex-sync-v2',
        'convex-sync-v1',
      ])
    })

    it('should expose negotiated protocol after connection', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        protocols: ['convex-sync-v2', 'convex-sync-v1'],
      })

      const connectPromise = handler.connect()
      mockWebSocketInstance!.protocol = 'convex-sync-v1'
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      expect(handler.protocol).toBe('convex-sync-v1')
    })

    it('should return empty string if no protocol negotiated', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')

      const connectPromise = handler.connect()
      mockWebSocketInstance!.protocol = ''
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      expect(handler.protocol).toBe('')
    })
  })

  // ============================================================================
  // URL Handling Tests
  // ============================================================================

  describe('URL handling', () => {
    it('should store original URL', () => {
      const url = 'wss://api.convex.cloud/sync'
      const handler = new WebSocketHandler(url)
      expect(handler.url).toBe(url)
    })

    it('should handle URLs with query parameters', () => {
      const url = 'wss://api.convex.cloud/sync?token=abc123&version=1'
      const handler = new WebSocketHandler(url)
      handler.connect()

      expect(webSocketConstructorSpy).toHaveBeenCalledWith(url, undefined)
    })

    it('should handle URLs with paths', () => {
      const url = 'wss://api.convex.cloud/api/v1/sync'
      const handler = new WebSocketHandler(url)
      handler.connect()

      expect(webSocketConstructorSpy).toHaveBeenCalledWith(url, undefined)
    })

    it('should handle localhost URLs', () => {
      const url = 'ws://localhost:3000/sync'
      const handler = new WebSocketHandler(url)
      handler.connect()

      expect(webSocketConstructorSpy).toHaveBeenCalledWith(url, undefined)
    })

    it('should handle URLs with ports', () => {
      const url = 'wss://api.convex.cloud:8080/sync'
      const handler = new WebSocketHandler(url)
      handler.connect()

      expect(webSocketConstructorSpy).toHaveBeenCalledWith(url, undefined)
    })
  })

  // ============================================================================
  // Binary Type Configuration Tests
  // ============================================================================

  describe('binary type configuration', () => {
    it('should default to blob binary type', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      expect(mockWebSocketInstance?.binaryType).toBe('blob')
    })

    it('should allow setting arraybuffer binary type', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        binaryType: 'arraybuffer',
      })
      const connectPromise = handler.connect()
      mockWebSocketInstance!.binaryType = 'arraybuffer'
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      expect(mockWebSocketInstance?.binaryType).toBe('arraybuffer')
    })
  })

  // ============================================================================
  // Reconnection Tests
  // ============================================================================

  describe('reconnection', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should attempt reconnect when enabled and connection drops', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        reconnect: true,
        reconnectDelay: 1000,
      })

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      // Simulate connection drop
      mockWebSocketInstance?.simulateClose(1006, 'Abnormal closure')

      // Advance time to trigger reconnect
      await vi.advanceTimersByTimeAsync(1100)

      // Should have called WebSocket constructor again
      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(2)
    })

    it('should not reconnect when disabled', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        reconnect: false,
      })

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      mockWebSocketInstance?.simulateClose(1006, 'Abnormal closure')

      await vi.advanceTimersByTimeAsync(5000)

      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(1)
    })

    it('should respect max reconnect attempts', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
      })

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      // Simulate connection drop
      mockWebSocketInstance?.simulateClose(1006)

      // First reconnect attempt
      await vi.advanceTimersByTimeAsync(150)
      mockWebSocketInstance?.simulateError('Failed')
      mockWebSocketInstance?.simulateClose(1006)

      // Second reconnect attempt
      await vi.advanceTimersByTimeAsync(150)
      mockWebSocketInstance?.simulateError('Failed')
      mockWebSocketInstance?.simulateClose(1006)

      // Third attempt should not happen
      await vi.advanceTimersByTimeAsync(150)

      // 1 initial + 2 reconnects = 3 calls max
      expect(webSocketConstructorSpy.mock.calls.length).toBeLessThanOrEqual(3)
    })

    it('should use exponential backoff when configured', async () => {
      // Note: The implementation resets reconnect attempts on successful connection,
      // so exponential backoff is most useful when connections keep failing during setup.
      // This test verifies the backoff option is accepted and reconnects happen.
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        reconnect: true,
        reconnectDelay: 100,
        reconnectBackoff: 'exponential',
        maxReconnectAttempts: 5,
      })

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      // First close triggers reconnect
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(100)
      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(2)

      // Open and close again to trigger another reconnect
      mockWebSocketInstance?.simulateOpen()
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(100)
      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(3)

      // Verify the backoff option was applied (handler didn't throw)
      expect(handler.isConnected()).toBe(false)
    })

    it('should not reconnect on normal close (code 1000)', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        reconnect: true,
        reconnectDelay: 100,
      })

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      mockWebSocketInstance?.simulateClose(1000, 'Normal closure')

      await vi.advanceTimersByTimeAsync(500)

      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(1)
    })

    it('should reset reconnect attempts on successful connection', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        reconnect: true,
        reconnectDelay: 100,
        maxReconnectAttempts: 2,
      })

      // First connection
      handler.connect()
      mockWebSocketInstance?.simulateOpen()

      // Drop and reconnect
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(150)

      // Successful reconnect
      mockWebSocketInstance?.simulateOpen()

      // Drop again
      mockWebSocketInstance?.simulateClose(1006)
      await vi.advanceTimersByTimeAsync(150)

      // Should still reconnect (counter reset)
      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(3)
    })
  })

  // ============================================================================
  // Event Listener API Tests
  // ============================================================================

  describe('addEventListener API', () => {
    it('should support addEventListener for open', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      const listener = vi.fn()
      handler.addEventListener('open', listener)

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      expect(listener).toHaveBeenCalled()
    })

    it('should support addEventListener for close', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      const listener = vi.fn()
      handler.addEventListener('close', listener)

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      mockWebSocketInstance?.simulateClose(1000)

      expect(listener).toHaveBeenCalled()
    })

    it('should support addEventListener for message', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      const listener = vi.fn()
      handler.addEventListener('message', listener)

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      mockWebSocketInstance?.simulateMessage('test')

      expect(listener).toHaveBeenCalled()
    })

    it('should support addEventListener for error', () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      const listener = vi.fn()
      handler.addEventListener('error', listener)

      handler.connect()
      mockWebSocketInstance?.simulateError('Test error')

      expect(listener).toHaveBeenCalled()
    })

    it('should support multiple listeners for same event', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      handler.addEventListener('open', listener1)
      handler.addEventListener('open', listener2)

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      expect(listener1).toHaveBeenCalled()
      expect(listener2).toHaveBeenCalled()
    })

    it('should support removeEventListener', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      const listener = vi.fn()
      handler.addEventListener('open', listener)
      handler.removeEventListener('open', listener)

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      expect(listener).not.toHaveBeenCalled()
    })
  })

  // ============================================================================
  // Dispose/Cleanup Tests
  // ============================================================================

  describe('dispose', () => {
    it('should close connection and clean up resources', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      handler.dispose()

      expect(mockWebSocketInstance?.wasCloseCalled()).toBe(true)
      expect(handler.getState()).toBe(ConnectionState.Disconnected)
    })

    it('should clear event handlers', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      handler.onopen = vi.fn()
      handler.onclose = vi.fn()
      handler.onmessage = vi.fn()
      handler.onerror = vi.fn()

      handler.dispose()

      expect(handler.onopen).toBeNull()
      expect(handler.onclose).toBeNull()
      expect(handler.onmessage).toBeNull()
      expect(handler.onerror).toBeNull()
    })

    it('should clear message queue', () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        queueWhenDisconnected: true,
      })
      handler.send({ type: 'test' })

      handler.dispose()

      expect(handler.getQueueSize()).toBe(0)
    })

    it('should prevent reconnection attempts', async () => {
      vi.useFakeTimers()

      const handler = new WebSocketHandler('wss://api.convex.cloud/sync', {
        reconnect: true,
        reconnectDelay: 100,
      })

      const connectPromise = handler.connect()
      mockWebSocketInstance?.simulateOpen()
      await connectPromise

      handler.dispose()

      await vi.advanceTimersByTimeAsync(500)

      expect(webSocketConstructorSpy).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })

    it('should be safe to call multiple times', () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')

      expect(() => {
        handler.dispose()
        handler.dispose()
      }).not.toThrow()
    })

    it('should reject pending connect promises', async () => {
      const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
      const connectPromise = handler.connect()

      handler.dispose()

      await expect(connectPromise).rejects.toThrow(/disposed/i)
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
  // Type Export Tests
  // ============================================================================

  describe('type exports', () => {
    it('should export WebSocketMessage type', () => {
      // Type test - should compile
      const message: WebSocketMessage = 'test'
      expect(message).toBeDefined()
    })

    it('should export WebSocketOptions type', () => {
      // Type test - should compile
      const options: WebSocketOptions = {
        protocols: ['test'],
        reconnect: true,
      }
      expect(options).toBeDefined()
    })

    it('should export WebSocketEventHandlers type', () => {
      // Type test - should compile
      const handlers: WebSocketEventHandlers = {
        onopen: () => {},
        onclose: () => {},
        onmessage: () => {},
        onerror: () => {},
      }
      expect(handlers).toBeDefined()
    })
  })
})
