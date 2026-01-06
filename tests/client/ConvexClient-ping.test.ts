/**
 * TDD Tests for ConvexClient Ping/Pong Timeout Handling
 *
 * RED PHASE: These tests define the expected behavior for ping/pong
 * timeout handling in ConvexClient. Currently, the client sends pings
 * but has no timeout handling if pong isn't received, leading to
 * "zombie" connections where the client thinks it's connected but
 * the server has dropped it.
 *
 * Expected behavior:
 * - Pings are sent at regular intervals (PING_INTERVAL_MS)
 * - If pong is not received within PONG_TIMEOUT_MS, trigger reconnect
 * - If pong is received in time, clear the timeout
 * - On disconnect, clear any pending pong timeout
 *
 * TDD Issue: convex-0rfj
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConvexClient } from '../../src/client/ConvexClient'

// ============================================================================
// Constants (expected to be exported from ConvexClient in GREEN phase)
// ============================================================================

/** Interval for WebSocket ping/pong keep-alive in milliseconds */
const PING_INTERVAL_MS = 30000

/** Timeout for pong response before triggering reconnect */
const PONG_TIMEOUT_MS = 10000

// ============================================================================
// Mock WebSocket Implementation
// ============================================================================

/**
 * Mock CloseEvent for Node.js environment
 */
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
  readyState: number = MockWebSocket.CONNECTING

  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  private _eventListeners: Map<string, Set<EventListener>> = new Map()
  private _sentMessages: unknown[] = []
  private _closeWasCalled = false

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this._eventListeners.has(type)) {
      this._eventListeners.set(type, new Set())
    }
    this._eventListeners.get(type)!.add(listener)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this._eventListeners.get(type)?.delete(listener)
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    try {
      this._sentMessages.push(JSON.parse(data))
    } catch {
      this._sentMessages.push(data)
    }
  }

  close(): void {
    this._closeWasCalled = true
    this.readyState = MockWebSocket.CLOSING
    // Trigger close event asynchronously
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED
      this._dispatchEvent('close', new Event('close'))
    }, 0)
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    this._dispatchEvent('open', new Event('open'))
  }

  simulateMessage(data: unknown): void {
    const event = new MessageEvent('message', { data: JSON.stringify(data) })
    this._dispatchEvent('message', event)
  }

  simulateClose(code: number = 1000): void {
    this.readyState = MockWebSocket.CLOSED
    const event = new MockCloseEvent('close', { code }) as CloseEvent
    this._dispatchEvent('close', event)
  }

  getSentMessages(): unknown[] {
    return this._sentMessages
  }

  clearSentMessages(): void {
    this._sentMessages = []
  }

  wasCloseCalled(): boolean {
    return this._closeWasCalled
  }

  private _dispatchEvent(type: string, event: Event): void {
    const listeners = this._eventListeners.get(type)
    if (listeners) {
      for (const listener of listeners) {
        listener(event)
      }
    }
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('ConvexClient ping/pong handling', () => {
  let mockWebSocketInstance: MockWebSocket | null = null
  let webSocketConstructorSpy: ReturnType<typeof vi.fn>
  let originalWebSocket: typeof globalThis.WebSocket

  beforeEach(() => {
    vi.useFakeTimers()

    originalWebSocket = globalThis.WebSocket

    webSocketConstructorSpy = vi.fn((url: string) => {
      mockWebSocketInstance = new MockWebSocket(url)
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
    vi.useRealTimers()
    globalThis.WebSocket = originalWebSocket
    mockWebSocketInstance = null
    vi.clearAllMocks()
  })

  // --------------------------------------------------------------------------
  // Test: Should send ping at regular intervals
  // --------------------------------------------------------------------------
  it('should send ping at regular intervals', async () => {
    const client = new ConvexClient('https://example.convex.cloud')

    // Simulate WebSocket open
    mockWebSocketInstance?.simulateOpen()

    // Clear any initial messages
    mockWebSocketInstance?.clearSentMessages()

    // Advance time to trigger first ping
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    const messages = mockWebSocketInstance?.getSentMessages() ?? []
    const pingMessages = messages.filter((m: any) => m.type === 'ping')

    expect(pingMessages.length).toBeGreaterThanOrEqual(1)
    expect(pingMessages[0]).toEqual({ type: 'ping' })

    // Simulate receiving pong response (required before next ping can be sent)
    mockWebSocketInstance?.simulateMessage({ type: 'pong' })

    // Advance time to trigger second ping
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    const messagesAfter = mockWebSocketInstance?.getSentMessages() ?? []
    const pingMessagesAfter = messagesAfter.filter((m: any) => m.type === 'ping')

    expect(pingMessagesAfter.length).toBeGreaterThanOrEqual(2)

    client.close()
  })

  // --------------------------------------------------------------------------
  // Test: Should trigger reconnect if pong not received within timeout
  // --------------------------------------------------------------------------
  it('should trigger reconnect if pong not received within timeout', async () => {
    const client = new ConvexClient('https://example.convex.cloud')

    // Simulate WebSocket open
    mockWebSocketInstance?.simulateOpen()

    // Record initial WebSocket creation count
    const initialWsCount = webSocketConstructorSpy.mock.calls.length

    // Advance time to trigger ping
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    // Verify ping was sent
    const messages = mockWebSocketInstance?.getSentMessages() ?? []
    const pingMessages = messages.filter((m: any) => m.type === 'ping')
    expect(pingMessages.length).toBe(1)

    // Advance past pong timeout WITHOUT receiving pong
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS)

    // Should have triggered a reconnect (created a new WebSocket)
    // The implementation should close the current WebSocket and create a new one
    expect(webSocketConstructorSpy.mock.calls.length).toBeGreaterThan(initialWsCount)

    client.close()
  })

  // --------------------------------------------------------------------------
  // Test: Should not reconnect if pong received in time
  // --------------------------------------------------------------------------
  it('should not reconnect if pong received in time', async () => {
    const client = new ConvexClient('https://example.convex.cloud')

    // Simulate WebSocket open
    mockWebSocketInstance?.simulateOpen()

    // Record initial WebSocket creation count
    const initialWsCount = webSocketConstructorSpy.mock.calls.length

    // Advance time to trigger ping
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    // Verify ping was sent
    const messages = mockWebSocketInstance?.getSentMessages() ?? []
    const pingMessages = messages.filter((m: any) => m.type === 'ping')
    expect(pingMessages.length).toBe(1)

    // Simulate receiving pong before timeout
    mockWebSocketInstance?.simulateMessage({ type: 'pong' })

    // Advance past the pong timeout
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS)

    // Should NOT have triggered a reconnect
    expect(webSocketConstructorSpy.mock.calls.length).toBe(initialWsCount)

    client.close()
  })

  // --------------------------------------------------------------------------
  // Test: Should clear pong timeout on disconnect
  // --------------------------------------------------------------------------
  it('should clear pong timeout on disconnect', async () => {
    const client = new ConvexClient('https://example.convex.cloud')

    // Simulate WebSocket open
    mockWebSocketInstance?.simulateOpen()

    // Advance time to trigger ping (starts pong timeout)
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    // Close client before pong timeout expires
    client.close()

    // Record WebSocket creation count after close
    const wsCountAfterClose = webSocketConstructorSpy.mock.calls.length

    // Advance past the pong timeout
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS * 2)

    // Should NOT have triggered a reconnect (timeout should have been cleared)
    // The close() method should clear all timers including pong timeout
    expect(webSocketConstructorSpy.mock.calls.length).toBe(wsCountAfterClose)
  })

  // --------------------------------------------------------------------------
  // Test: Should reset pong timeout on each ping
  // --------------------------------------------------------------------------
  it('should reset pong timeout on each ping', async () => {
    const client = new ConvexClient('https://example.convex.cloud')

    // Simulate WebSocket open
    mockWebSocketInstance?.simulateOpen()

    const initialWsCount = webSocketConstructorSpy.mock.calls.length

    // First ping interval
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    // Receive pong
    mockWebSocketInstance?.simulateMessage({ type: 'pong' })

    // Second ping interval
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    // Don't receive pong this time - wait for timeout
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS)

    // Should have triggered reconnect due to missing second pong
    expect(webSocketConstructorSpy.mock.calls.length).toBeGreaterThan(initialWsCount)

    client.close()
  })

  // --------------------------------------------------------------------------
  // Test: Should handle pong received after timeout started but before expiry
  // --------------------------------------------------------------------------
  it('should handle late pong received before timeout expires', async () => {
    const client = new ConvexClient('https://example.convex.cloud')

    // Simulate WebSocket open
    mockWebSocketInstance?.simulateOpen()

    const initialWsCount = webSocketConstructorSpy.mock.calls.length

    // Trigger ping
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    // Wait half the timeout period
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS / 2)

    // Receive pong late but still within timeout
    mockWebSocketInstance?.simulateMessage({ type: 'pong' })

    // Advance past the original timeout window
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS)

    // Should NOT have reconnected because pong was received in time
    expect(webSocketConstructorSpy.mock.calls.length).toBe(initialWsCount)

    client.close()
  })

  // --------------------------------------------------------------------------
  // Test: Should not start pong timeout when not connected
  // --------------------------------------------------------------------------
  it('should not start pong timeout when not connected', async () => {
    const client = new ConvexClient('https://example.convex.cloud')

    // Don't simulate open - stay in connecting state

    const initialWsCount = webSocketConstructorSpy.mock.calls.length

    // Advance time past ping interval
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    // Advance past pong timeout
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS)

    // Should not have created additional WebSocket connections
    // since ping should not be sent when not connected
    expect(webSocketConstructorSpy.mock.calls.length).toBe(initialWsCount)

    client.close()
  })

  // --------------------------------------------------------------------------
  // Test: Pong timeout should be cleared on WebSocket close event
  // --------------------------------------------------------------------------
  it('should clear pong timeout on WebSocket close event', async () => {
    const client = new ConvexClient('https://example.convex.cloud', {
      autoReconnect: false, // Disable auto-reconnect for this test
    })

    // Simulate WebSocket open
    mockWebSocketInstance?.simulateOpen()

    // Trigger ping
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)

    // Simulate WebSocket close (e.g., server closed connection)
    mockWebSocketInstance?.simulateClose(1000)

    const wsCountAfterClose = webSocketConstructorSpy.mock.calls.length

    // Advance past pong timeout
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS * 2)

    // Should not have attempted reconnect from pong timeout
    // (any reconnect would be from the close handler, not pong timeout)
    expect(webSocketConstructorSpy.mock.calls.length).toBe(wsCountAfterClose)

    client.close()
  })
})
