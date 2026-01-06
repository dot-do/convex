/**
 * WebSocket Handler for Real-Time Sync
 *
 * Provides a robust WebSocket handler with connection lifecycle management,
 * message queuing, reconnection, and event handling for Convex real-time sync.
 *
 * Bead: convex-936.4
 */

// ============================================================================
// Browser WebSocket Type Declaration
// ============================================================================

/**
 * Browser-style WebSocket interface for client-side usage.
 * The Cloudflare Workers WebSocket type uses addEventListener, but client code
 * running in browsers uses the traditional onopen/onclose/onmessage/onerror pattern.
 */
interface BrowserWebSocket {
  readonly readyState: number
  readonly protocol: string
  binaryType: BinaryType
  onopen: ((this: BrowserWebSocket, ev: Event) => unknown) | null
  onclose: ((this: BrowserWebSocket, ev: CloseEvent) => unknown) | null
  onmessage: ((this: BrowserWebSocket, ev: MessageEvent) => unknown) | null
  onerror: ((this: BrowserWebSocket, ev: Event) => unknown) | null
  close(code?: number, reason?: string): void
  send(data: string | ArrayBufferLike | ArrayBufferView): void
}

/**
 * Type alias for BinaryType that works in both browser and Cloudflare environments.
 */
type BinaryType = 'blob' | 'arraybuffer'

declare const WebSocket: {
  new(url: string, protocols?: string | string[]): BrowserWebSocket
  readonly CLOSED: number
  readonly CLOSING: number
  readonly CONNECTING: number
  readonly OPEN: number
}

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Connection state enum representing the WebSocket connection lifecycle.
 */
export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
}

/**
 * Message types that can be sent through the WebSocket.
 */
export type WebSocketMessage = string | ArrayBufferLike | ArrayBufferView | object

/**
 * Configuration options for the WebSocket handler.
 */
export interface WebSocketOptions {
  /** WebSocket sub-protocol(s) to use */
  protocols?: string | string[]
  /** Whether to automatically reconnect on disconnection */
  reconnect?: boolean
  /** Delay in milliseconds before attempting reconnection */
  reconnectDelay?: number
  /** Maximum number of reconnection attempts */
  maxReconnectAttempts?: number
  /** Connection timeout in milliseconds */
  connectionTimeout?: number
  /** Binary type for receiving binary data */
  binaryType?: BinaryType
  /** Whether to automatically parse JSON messages */
  parseJson?: boolean
  /** Whether to queue messages when disconnected */
  queueWhenDisconnected?: boolean
  /** Maximum number of messages to queue */
  maxQueueSize?: number
  /** Reconnection backoff strategy */
  reconnectBackoff?: 'linear' | 'exponential'
}

/**
 * Event handler function types.
 */
export interface WebSocketEventHandlers {
  onopen?: () => void
  onclose?: (code?: number, reason?: string) => void
  onmessage?: (data: unknown) => void
  onerror?: (error: Error) => void
}

type WebSocketEventType = 'open' | 'close' | 'message' | 'error'
type EventListener = (...args: unknown[]) => void

// ============================================================================
// WebSocketHandler Class
// ============================================================================

/**
 * WebSocket handler for managing real-time connections.
 *
 * @example
 * ```typescript
 * const handler = new WebSocketHandler('wss://api.convex.cloud/sync')
 *
 * handler.onopen = () => console.log('Connected')
 * handler.onmessage = (data) => console.log('Message:', data)
 * handler.onclose = () => console.log('Disconnected')
 * handler.onerror = (error) => console.log('Error:', error)
 *
 * await handler.connect()
 * handler.send({ type: 'subscribe', query: 'users:list' })
 * handler.close()
 * ```
 */
export class WebSocketHandler {
  private _url: string
  private _options: Omit<Required<WebSocketOptions>, 'protocols'> & { protocols: string | string[] | undefined }
  private _state: ConnectionState = ConnectionState.Disconnected
  private _ws: BrowserWebSocket | null = null
  private _messageQueue: Array<string | ArrayBuffer | ArrayBufferView> = []
  private _reconnectAttempts: number = 0
  private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private _connectionTimeout: ReturnType<typeof setTimeout> | null = null
  private _disposed: boolean = false
  private _pendingConnect: {
    resolve: () => void
    reject: (error: Error) => void
  } | null = null
  private _eventListeners: Map<WebSocketEventType, Set<EventListener>> = new Map()

  // Event handlers
  private _onopen: (() => void) | null = null
  private _onclose: ((code?: number, reason?: string) => void) | null = null
  private _onmessage: ((data: unknown) => void) | null = null
  private _onerror: ((error: Error) => void) | null = null

  /**
   * Creates a new WebSocketHandler.
   *
   * @param url - The WebSocket URL to connect to (must use ws:// or wss://)
   * @param options - Configuration options
   * @throws Error if the URL is invalid or uses an unsupported scheme
   */
  constructor(url: string, options: WebSocketOptions = {}) {
    // Validate URL
    if (!url) {
      throw new Error('WebSocket URL is required')
    }

    try {
      const parsedUrl = new URL(url)
      if (parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
        throw new Error(`Invalid WebSocket URL scheme: ${parsedUrl.protocol}. Must be ws:// or wss://`)
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(`Invalid WebSocket URL: ${url}`)
      }
      throw e
    }

    this._url = url
    this._options = {
      protocols: options.protocols ?? undefined,
      reconnect: options.reconnect ?? false,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      connectionTimeout: options.connectionTimeout ?? 30000,
      binaryType: options.binaryType ?? 'blob',
      parseJson: options.parseJson ?? false,
      queueWhenDisconnected: options.queueWhenDisconnected ?? false,
      maxQueueSize: options.maxQueueSize ?? 100,
      reconnectBackoff: options.reconnectBackoff ?? 'linear',
    }

    // Initialize event listener maps
    this._eventListeners.set('open', new Set())
    this._eventListeners.set('close', new Set())
    this._eventListeners.set('message', new Set())
    this._eventListeners.set('error', new Set())
  }

  // ============================================================================
  // Public Properties
  // ============================================================================

  /** The WebSocket URL */
  get url(): string {
    return this._url
  }

  /** The negotiated sub-protocol (empty string if none) */
  get protocol(): string {
    return this._ws?.protocol ?? ''
  }

  // Event handler properties
  get onopen(): (() => void) | null {
    return this._onopen
  }
  set onopen(handler: (() => void) | null) {
    this._onopen = handler
  }

  get onclose(): ((code?: number, reason?: string) => void) | null {
    return this._onclose
  }
  set onclose(handler: ((code?: number, reason?: string) => void) | null) {
    this._onclose = handler
  }

  get onmessage(): ((data: unknown) => void) | null {
    return this._onmessage
  }
  set onmessage(handler: ((data: unknown) => void) | null) {
    this._onmessage = handler
  }

  get onerror(): ((error: Error) => void) | null {
    return this._onerror
  }
  set onerror(handler: ((error: Error) => void) | null) {
    this._onerror = handler
  }

  // ============================================================================
  // Connection Methods
  // ============================================================================

  /**
   * Connects to the WebSocket server.
   *
   * @returns A promise that resolves when connected
   * @throws Error if already connected or connecting
   */
  async connect(): Promise<void> {
    if (this._disposed) {
      throw new Error('WebSocketHandler has been disposed')
    }

    if (this._state === ConnectionState.Connected) {
      throw new Error('WebSocket is already connected')
    }

    if (this._state === ConnectionState.Connecting) {
      throw new Error('WebSocket is already connecting')
    }

    return new Promise<void>((resolve, reject) => {
      this._pendingConnect = { resolve, reject }
      this._state = ConnectionState.Connecting

      // Create WebSocket
      try {
        this._ws = new WebSocket(this._url, this._options.protocols as string | string[] | undefined)
        this._ws.binaryType = this._options.binaryType
      } catch (error) {
        this._state = ConnectionState.Disconnected
        this._pendingConnect = null
        reject(error)
        return
      }

      // Set up connection timeout
      this._connectionTimeout = setTimeout(() => {
        if (this._state === ConnectionState.Connecting) {
          this._ws?.close()
          this._state = ConnectionState.Disconnected
          const timeoutError = new Error('WebSocket connection timeout')
          this._pendingConnect?.reject(timeoutError)
          this._pendingConnect = null
        }
      }, this._options.connectionTimeout)

      // Set up event handlers
      this._ws.onopen = () => {
        this._clearConnectionTimeout()
        this._state = ConnectionState.Connected
        this._reconnectAttempts = 0

        // Flush message queue
        this._flushMessageQueue()

        // Call handlers
        this._onopen?.()
        this._emitEvent('open')

        this._pendingConnect?.resolve()
        this._pendingConnect = null
      }

      this._ws.onclose = (event) => {
        this._clearConnectionTimeout()
        const wasConnected = this._state === ConnectionState.Connected
        this._state = ConnectionState.Disconnected

        // Call handlers
        this._onclose?.(event.code, event.reason)
        this._emitEvent('close', event.code, event.reason)

        // Handle reconnection
        if (
          wasConnected &&
          this._options.reconnect &&
          !this._disposed &&
          event.code !== 1000 // Don't reconnect on normal close
        ) {
          this._scheduleReconnect()
        }
      }

      this._ws.onmessage = (event) => {
        let data: unknown = event.data

        // Parse JSON if enabled and data is a string
        if (this._options.parseJson && typeof data === 'string') {
          try {
            data = JSON.parse(data)
          } catch {
            // Keep as string if JSON parsing fails
          }
        }

        // Call handlers
        this._onmessage?.(data)
        this._emitEvent('message', data)
      }

      this._ws.onerror = (event) => {
        const error = new Error((event as unknown as { message?: string }).message ?? 'WebSocket error')

        // Call handlers
        this._onerror?.(error)
        this._emitEvent('error', error)

        // Reject pending connect promise if still connecting
        if (this._state === ConnectionState.Connecting) {
          this._clearConnectionTimeout()
          this._state = ConnectionState.Disconnected
          this._pendingConnect?.reject(error)
          this._pendingConnect = null
        }
      }
    })
  }

  /**
   * Closes the WebSocket connection.
   *
   * @param code - The close code (default: 1000)
   * @param reason - The close reason
   */
  close(code?: number, reason?: string): void {
    this._clearReconnectTimeout()
    this._clearConnectionTimeout()

    if (this._ws && this._ws.readyState !== WebSocket.CLOSED) {
      this._ws.close(code ?? 1000, reason)
    }

    this._state = ConnectionState.Disconnected
  }

  // ============================================================================
  // Message Methods
  // ============================================================================

  /**
   * Sends a message through the WebSocket.
   *
   * @param message - The message to send
   * @throws Error if not connected and queuing is disabled
   */
  send(message: WebSocketMessage): void {
    const serialized = this._serializeMessage(message)

    if (this._state !== ConnectionState.Connected || !this._ws || this._ws.readyState !== WebSocket.OPEN) {
      if (this._options.queueWhenDisconnected) {
        this._enqueueMessage(serialized)
        return
      }
      throw new Error('WebSocket is not connected')
    }

    this._ws.send(serialized)
  }

  /**
   * Sends a message and returns a promise.
   *
   * @param message - The message to send
   * @returns A promise that resolves when the message is sent
   */
  async sendAsync(message: WebSocketMessage): Promise<void> {
    this.send(message)
  }

  // ============================================================================
  // State Methods
  // ============================================================================

  /**
   * Gets the current connection state.
   *
   * @returns The current ConnectionState
   */
  getState(): ConnectionState {
    return this._state
  }

  /**
   * Checks if the WebSocket is currently connected.
   *
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean {
    return this._state === ConnectionState.Connected
  }

  // ============================================================================
  // Queue Methods
  // ============================================================================

  /**
   * Gets the number of messages in the queue.
   *
   * @returns The queue size
   */
  getQueueSize(): number {
    return this._messageQueue.length
  }

  /**
   * Clears all queued messages.
   */
  clearQueue(): void {
    this._messageQueue = []
  }

  // ============================================================================
  // Event Listener Methods
  // ============================================================================

  /**
   * Adds an event listener.
   *
   * @param type - The event type
   * @param listener - The listener function
   */
  addEventListener(type: WebSocketEventType, listener: EventListener): void {
    this._eventListeners.get(type)?.add(listener)
  }

  /**
   * Removes an event listener.
   *
   * @param type - The event type
   * @param listener - The listener function
   */
  removeEventListener(type: WebSocketEventType, listener: EventListener): void {
    this._eventListeners.get(type)?.delete(listener)
  }

  // ============================================================================
  // Cleanup Methods
  // ============================================================================

  /**
   * Disposes of the WebSocket handler, closing connections and cleaning up resources.
   */
  dispose(): void {
    if (this._disposed) {
      return
    }

    this._disposed = true

    // Reject pending promises
    this._pendingConnect?.reject(new Error('WebSocketHandler disposed'))
    this._pendingConnect = null

    // Clear timeouts
    this._clearReconnectTimeout()
    this._clearConnectionTimeout()

    // Close connection
    if (this._ws) {
      this._ws.close()
      this._ws = null
    }

    // Clear state
    this._state = ConnectionState.Disconnected
    this._messageQueue = []

    // Clear handlers
    this._onopen = null
    this._onclose = null
    this._onmessage = null
    this._onerror = null

    // Clear event listeners
    this._eventListeners.forEach((listeners) => listeners.clear())
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private _serializeMessage(message: WebSocketMessage): string | ArrayBuffer | ArrayBufferView {
    if (typeof message === 'string') {
      return message
    }

    if (message instanceof ArrayBuffer) {
      return message
    }

    if (ArrayBuffer.isView(message)) {
      return message
    }

    // Serialize objects to JSON
    return JSON.stringify(message)
  }

  private _enqueueMessage(message: string | ArrayBuffer | ArrayBufferView): void {
    this._messageQueue.push(message)

    // Enforce max queue size (drop oldest messages)
    while (this._messageQueue.length > this._options.maxQueueSize) {
      this._messageQueue.shift()
    }
  }

  private _flushMessageQueue(): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      return
    }

    const queue = this._messageQueue
    this._messageQueue = []

    for (const message of queue) {
      try {
        this._ws.send(message)
      } catch {
        // Re-queue failed messages
        this._messageQueue.push(message)
      }
    }
  }

  private _scheduleReconnect(): void {
    if (this._disposed || this._reconnectAttempts >= this._options.maxReconnectAttempts) {
      return
    }

    const delay = this._calculateReconnectDelay()
    this._reconnectAttempts++

    this._reconnectTimeout = setTimeout(() => {
      if (!this._disposed) {
        this.connect().catch(() => {
          // Error handled by event handlers
        })
      }
    }, delay)
  }

  private _calculateReconnectDelay(): number {
    const baseDelay = this._options.reconnectDelay

    if (this._options.reconnectBackoff === 'exponential') {
      return baseDelay * Math.pow(2, this._reconnectAttempts)
    }

    return baseDelay
  }

  private _clearReconnectTimeout(): void {
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout)
      this._reconnectTimeout = null
    }
  }

  private _clearConnectionTimeout(): void {
    if (this._connectionTimeout) {
      clearTimeout(this._connectionTimeout)
      this._connectionTimeout = null
    }
  }

  private _emitEvent(type: WebSocketEventType, ...args: unknown[]): void {
    const listeners = this._eventListeners.get(type)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(...args)
        } catch {
          // Ignore listener errors
        }
      }
    }
  }
}
