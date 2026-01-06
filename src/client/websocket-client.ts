/**
 * ConvexClient - WebSocket Real-Time Client
 *
 * Provides WebSocket-based real-time subscriptions for Convex.
 *
 * Features:
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

import type { FunctionReference, FunctionType } from '../server/functions/api'

// ============================================================================
// Browser WebSocket Type Declaration
// ============================================================================

/**
 * Browser-style WebSocket interface for client-side usage.
 */
interface BrowserWebSocket {
  readonly readyState: number
  onopen: ((this: BrowserWebSocket, ev: Event) => unknown) | null
  onclose: ((this: BrowserWebSocket, ev: CloseEvent) => unknown) | null
  onmessage: ((this: BrowserWebSocket, ev: MessageEvent) => unknown) | null
  onerror: ((this: BrowserWebSocket, ev: Event) => unknown) | null
  close(code?: number, reason?: string): void
  send(data: string | ArrayBuffer | ArrayBufferView): void
}

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
 * Connection state enum.
 */
export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
}

/**
 * Subscription ID type.
 */
export type SubscriptionId = string

/**
 * Callbacks for subscription updates.
 */
export interface SubscribeCallbacks<T> {
  /** Called when query data is updated */
  onUpdate: (data: T) => void
  /** Called when an error occurs */
  onError?: (error: Error) => void
  /** Called with previous and new data on transitions */
  onTransition?: (previousData: T | undefined, newData: T) => void
}

/**
 * Options for creating a ConvexClient.
 */
export interface ConvexClientOptions {
  /** Skip initial connection check (for testing) */
  skipConnectionCheck?: boolean
  /** Delay in milliseconds before attempting reconnection */
  reconnectDelay?: number
  /** Maximum number of reconnection attempts */
  maxReconnectAttempts?: number
  /** Reconnection backoff strategy */
  reconnectBackoff?: 'linear' | 'exponential'
  /** Enable subscription deduplication */
  deduplicateSubscriptions?: boolean
  /** Callback when connection is established */
  onConnect?: () => void
  /** Callback when connection is lost */
  onDisconnect?: (code?: number, reason?: string) => void
  /** Callback when reconnection succeeds */
  onReconnect?: () => void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
}

/**
 * Internal subscription state.
 */
interface InternalSubscription<T = unknown> {
  id: SubscriptionId
  queryPath: string
  args: unknown
  callbacks: SubscribeCallbacks<T>
  lastData?: T
  dedupeKey?: string
}

/**
 * Pending request for mutation/action.
 */
interface PendingRequest<T = unknown> {
  requestId: string
  type: 'mutation' | 'action'
  path: string
  args: unknown
  resolve: (value: T) => void
  reject: (error: Error) => void
}

/**
 * WebSocket message types.
 */
type WSOutgoingMessage =
  | { type: 'subscribe'; subscriptionId: string; queryPath: string; args: unknown }
  | { type: 'unsubscribe'; subscriptionId: string }
  | { type: 'mutation'; requestId: string; mutationPath: string; args: unknown }
  | { type: 'action'; requestId: string; actionPath: string; args: unknown }
  | { type: 'authenticate'; token: string }
  | { type: 'ping' }

type WSIncomingMessage =
  | { type: 'update'; subscriptionId: string; data: unknown }
  | { type: 'error'; subscriptionId?: string; message: string }
  | { type: 'mutationResult'; requestId: string; result: unknown }
  | { type: 'mutationError'; requestId: string; message: string }
  | { type: 'actionResult'; requestId: string; result: unknown }
  | { type: 'actionError'; requestId: string; message: string }
  | { type: 'subscribed'; subscriptionId: string }
  | { type: 'authenticated' }
  | { type: 'pong' }

// ============================================================================
// ConvexClient Implementation
// ============================================================================

/**
 * WebSocket-based client for Convex with real-time subscriptions.
 *
 * @example
 * ```typescript
 * import { ConvexClient } from "convex.do/client";
 *
 * const client = new ConvexClient("https://your-deployment.convex.cloud");
 *
 * // Subscribe to a query
 * const unsubscribe = client.subscribe(api.messages.list, { channel }, {
 *   onUpdate: (messages) => console.log("Messages:", messages),
 * });
 *
 * // Run a mutation
 * await client.mutation(api.messages.send, { channel, body: "Hello!" });
 *
 * // Clean up
 * unsubscribe();
 * client.close();
 * ```
 */
export class ConvexClient {
  private _url: string
  private _wsUrl: string
  private _options: Required<Omit<ConvexClientOptions, 'onConnect' | 'onDisconnect' | 'onReconnect' | 'onError'>> & {
    onConnect?: () => void
    onDisconnect?: (code?: number, reason?: string) => void
    onReconnect?: () => void
    onError?: (error: Error) => void
  }
  private _state: ConnectionState = ConnectionState.Disconnected
  private _ws: BrowserWebSocket | null = null
  private _closed: boolean = false
  private _authToken: string | null = null
  private _isReconnecting: boolean = false

  // Subscriptions
  private _subscriptions: Map<SubscriptionId, InternalSubscription> = new Map()
  private _pendingSubscriptions: Map<SubscriptionId, InternalSubscription> = new Map()
  private _dedupeMap: Map<string, { serverSubId: SubscriptionId; callbacks: Set<SubscriptionId> }> = new Map()

  // Pending requests (mutations/actions)
  private _pendingRequests: Map<string, PendingRequest> = new Map()
  private _queuedMutations: PendingRequest[] = []
  private _queuedActions: PendingRequest[] = []

  // Reconnection
  private _reconnectAttempts: number = 0
  private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private _connectionPromise: {
    resolve: () => void
    reject: (error: Error) => void
  } | null = null

  // Counters
  private _idCounter: number = 0

  /**
   * Creates a new ConvexClient.
   *
   * @param url - The deployment URL (http/https will be converted to ws/wss)
   * @param options - Client configuration options
   */
  constructor(url: string, options: ConvexClientOptions = {}) {
    if (!url) {
      throw new Error('Deployment URL is required')
    }

    this._url = url.replace(/\/$/, '')
    this._wsUrl = this._url.replace(/^http/, 'ws') + '/sync'

    this._options = {
      skipConnectionCheck: options.skipConnectionCheck ?? false,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      reconnectBackoff: options.reconnectBackoff ?? 'exponential',
      deduplicateSubscriptions: options.deduplicateSubscriptions ?? false,
      onConnect: options.onConnect,
      onDisconnect: options.onDisconnect,
      onReconnect: options.onReconnect,
      onError: options.onError,
    }

    // Auto-connect unless skipConnectionCheck is set
    if (!this._options.skipConnectionCheck) {
      this.connect().catch(() => {
        // Error handled by event handlers
      })
    }
  }

  // ============================================================================
  // Public Properties
  // ============================================================================

  /** The deployment URL */
  get url(): string {
    return this._url
  }

  /** Current connection state */
  get connectionState(): ConnectionState {
    return this._state
  }

  // ============================================================================
  // Connection Methods
  // ============================================================================

  /**
   * Connects to the Convex deployment.
   *
   * @returns A promise that resolves when connected
   */
  async connect(): Promise<void> {
    if (this._closed) {
      return Promise.reject(new Error('Client has been closed'))
    }

    if (this._state === ConnectionState.Connected) {
      return Promise.resolve()
    }

    if (this._state === ConnectionState.Connecting && this._connectionPromise) {
      return new Promise((resolve, reject) => {
        const existingResolve = this._connectionPromise!.resolve
        const existingReject = this._connectionPromise!.reject
        this._connectionPromise = {
          resolve: () => {
            existingResolve()
            resolve()
          },
          reject: (error: Error) => {
            existingReject(error)
            reject(error)
          },
        }
      })
    }

    return new Promise<void>((resolve, reject) => {
      this._connectionPromise = { resolve, reject }
      this._state = ConnectionState.Connecting

      try {
        this._ws = new WebSocket(this._wsUrl)
        this._setupWebSocket()
      } catch (error) {
        this._state = ConnectionState.Disconnected
        this._connectionPromise = null
        reject(error)
      }
    })
  }

  /**
   * Disconnects from the Convex deployment.
   */
  disconnect(): void {
    this._clearReconnectTimeout()

    const wasConnected = this._state === ConnectionState.Connected

    if (this._ws && this._ws.readyState !== WebSocket.CLOSED) {
      // Note: the close event will also call onDisconnect, but we call it here
      // for immediate feedback. The actual WebSocket close is async.
      this._ws.close(1000, 'Client disconnect')
    }

    this._state = ConnectionState.Disconnected

    // Call disconnect callback immediately for explicit disconnect
    if (wasConnected) {
      this._options.onDisconnect?.(1000, 'Client disconnect')
    }
  }

  /**
   * Closes the client and prevents reconnection.
   */
  close(): void {
    this._closed = true
    this._clearReconnectTimeout()

    // Reject all pending requests
    for (const request of this._pendingRequests.values()) {
      request.reject(new Error('Client closed'))
    }
    this._pendingRequests.clear()

    for (const request of this._queuedMutations) {
      request.reject(new Error('Client closed'))
    }
    this._queuedMutations = []

    for (const request of this._queuedActions) {
      request.reject(new Error('Client closed'))
    }
    this._queuedActions = []

    // Clear subscriptions
    this._subscriptions.clear()
    this._pendingSubscriptions.clear()
    this._dedupeMap.clear()

    // Close WebSocket
    if (this._ws) {
      this._ws.close(1000, 'Client closed')
      this._ws = null
    }

    this._state = ConnectionState.Disconnected
  }

  /**
   * Checks if the client is connected.
   */
  isConnected(): boolean {
    return this._state === ConnectionState.Connected
  }

  // ============================================================================
  // Subscription Methods
  // ============================================================================

  /**
   * Subscribes to a query with real-time updates.
   *
   * @param functionRef - The query function reference
   * @param args - Arguments for the query
   * @param callbacks - Callbacks for updates and errors
   * @returns Subscription ID
   */
  subscribe<Args, Returns>(
    functionRef: FunctionReference<'query', Args, Returns>,
    args: Args,
    callbacks: SubscribeCallbacks<Returns>
  ): SubscriptionId {
    const subscriptionId = this._generateId('sub')
    const queryPath = functionRef._path

    const subscription: InternalSubscription<Returns> = {
      id: subscriptionId,
      queryPath,
      args,
      callbacks,
    }

    // Handle deduplication
    if (this._options.deduplicateSubscriptions) {
      const dedupeKey = this._createDedupeKey(queryPath, args)
      subscription.dedupeKey = dedupeKey

      const existing = this._dedupeMap.get(dedupeKey)
      if (existing) {
        // Add this callback to existing subscription
        existing.callbacks.add(subscriptionId)
        this._subscriptions.set(subscriptionId, subscription as InternalSubscription)
        return subscriptionId
      }

      // Create new dedupe entry
      this._dedupeMap.set(dedupeKey, {
        serverSubId: subscriptionId,
        callbacks: new Set([subscriptionId]),
      })
    }

    if (this._state === ConnectionState.Connected) {
      this._subscriptions.set(subscriptionId, subscription as InternalSubscription<unknown>)
      this._sendSubscribe(subscription as InternalSubscription<unknown>)
    } else {
      this._pendingSubscriptions.set(subscriptionId, subscription as InternalSubscription<unknown>)
    }

    return subscriptionId
  }

  /**
   * Unsubscribes from a subscription.
   *
   * @param subscriptionId - The subscription ID to cancel
   */
  unsubscribe(subscriptionId: SubscriptionId): void {
    const subscription = this._subscriptions.get(subscriptionId) ?? this._pendingSubscriptions.get(subscriptionId)

    if (!subscription) {
      return
    }

    // Handle deduplication
    if (this._options.deduplicateSubscriptions && subscription.dedupeKey) {
      const existing = this._dedupeMap.get(subscription.dedupeKey)
      if (existing) {
        existing.callbacks.delete(subscriptionId)

        // If there are still other callbacks, just remove this one
        if (existing.callbacks.size > 0) {
          this._subscriptions.delete(subscriptionId)
          this._pendingSubscriptions.delete(subscriptionId)
          return
        }

        // No more callbacks, unsubscribe from server
        this._dedupeMap.delete(subscription.dedupeKey)
      }
    }

    if (this._subscriptions.has(subscriptionId)) {
      this._subscriptions.delete(subscriptionId)
      if (this._state === ConnectionState.Connected) {
        this._send({ type: 'unsubscribe', subscriptionId })
      }
    }

    this._pendingSubscriptions.delete(subscriptionId)
  }

  // ============================================================================
  // Mutation/Action Methods
  // ============================================================================

  /**
   * Executes a mutation.
   *
   * @param functionRef - The mutation function reference
   * @param args - Arguments for the mutation
   * @returns A promise that resolves with the result
   */
  mutation<Args, Returns>(
    functionRef: FunctionReference<'mutation', Args, Returns>,
    args: Args
  ): Promise<Returns> {
    return new Promise((resolve, reject) => {
      const requestId = this._generateId('mut')
      const mutationPath = functionRef._path

      const request: PendingRequest<Returns> = {
        requestId,
        type: 'mutation',
        path: mutationPath,
        args,
        resolve: resolve as (value: unknown) => void,
        reject,
      }

      if (this._state === ConnectionState.Connected) {
        this._pendingRequests.set(requestId, request as PendingRequest)
        this._send({
          type: 'mutation',
          requestId,
          mutationPath,
          args,
        })
      } else {
        this._queuedMutations.push(request as PendingRequest)
      }
    })
  }

  /**
   * Executes an action.
   *
   * @param functionRef - The action function reference
   * @param args - Arguments for the action
   * @returns A promise that resolves with the result
   */
  action<Args, Returns>(
    functionRef: FunctionReference<'action', Args, Returns>,
    args: Args
  ): Promise<Returns> {
    return new Promise((resolve, reject) => {
      const requestId = this._generateId('act')
      const actionPath = functionRef._path

      const request: PendingRequest<Returns> = {
        requestId,
        type: 'action',
        path: actionPath,
        args,
        resolve: resolve as (value: unknown) => void,
        reject,
      }

      if (this._state === ConnectionState.Connected) {
        this._pendingRequests.set(requestId, request as PendingRequest)
        this._send({
          type: 'action',
          requestId,
          actionPath,
          args,
        })
      } else {
        this._queuedActions.push(request as PendingRequest)
      }
    })
  }

  // ============================================================================
  // Authentication Methods
  // ============================================================================

  /**
   * Sets the authentication token.
   *
   * @param token - The auth token
   */
  setAuth(token: string): void {
    this._authToken = token
    if (this._state === ConnectionState.Connected) {
      this._send({ type: 'authenticate', token })
    }
  }

  /**
   * Clears the authentication token.
   */
  clearAuth(): void {
    this._authToken = null
  }

  // ============================================================================
  // Status Methods
  // ============================================================================

  /**
   * Gets the number of active subscriptions.
   */
  getActiveSubscriptionCount(): number {
    return this._subscriptions.size
  }

  /**
   * Gets the number of pending subscriptions.
   */
  getPendingSubscriptionCount(): number {
    return this._pendingSubscriptions.size
  }

  /**
   * Gets the number of pending mutations.
   */
  getPendingMutationCount(): number {
    return this._queuedMutations.length
  }

  /**
   * Gets the number of pending actions.
   */
  getPendingActionCount(): number {
    return this._queuedActions.length
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private _setupWebSocket(): void {
    if (!this._ws) return

    this._ws.onopen = () => {
      this._state = ConnectionState.Connected
      this._reconnectAttempts = 0

      // Send auth if set
      if (this._authToken) {
        this._send({ type: 'authenticate', token: this._authToken })
      }

      // Resubscribe to all active subscriptions (for reconnection)
      for (const subscription of this._subscriptions.values()) {
        this._sendSubscribe(subscription)
      }

      // Activate pending subscriptions
      for (const [id, subscription] of this._pendingSubscriptions) {
        this._subscriptions.set(id, subscription)
        this._sendSubscribe(subscription)
      }
      this._pendingSubscriptions.clear()

      // Flush queued mutations
      for (const mutation of this._queuedMutations) {
        this._pendingRequests.set(mutation.requestId, mutation)
        this._send({
          type: 'mutation',
          requestId: mutation.requestId,
          mutationPath: mutation.path,
          args: mutation.args,
        })
      }
      this._queuedMutations = []

      // Flush queued actions
      for (const action of this._queuedActions) {
        this._pendingRequests.set(action.requestId, action)
        this._send({
          type: 'action',
          requestId: action.requestId,
          actionPath: action.path,
          args: action.args,
        })
      }
      this._queuedActions = []

      // Call callbacks
      if (this._isReconnecting) {
        this._isReconnecting = false
        this._options.onReconnect?.()
      }
      this._options.onConnect?.()

      // Resolve connection promise
      this._connectionPromise?.resolve()
      this._connectionPromise = null
    }

    this._ws.onclose = (event) => {
      const wasConnected = this._state === ConnectionState.Connected
      this._state = ConnectionState.Disconnected

      // Move pending requests back to queue for retry on reconnection
      if (wasConnected && !this._closed && event.code !== 1000) {
        for (const request of this._pendingRequests.values()) {
          if (request.type === 'mutation') {
            this._queuedMutations.push(request)
          } else {
            this._queuedActions.push(request)
          }
        }
        this._pendingRequests.clear()
      }

      // Call disconnect callback
      if (wasConnected) {
        this._options.onDisconnect?.(event.code, event.reason)
      }

      // Handle reconnection
      if (
        !this._closed &&
        wasConnected &&
        event.code !== 1000 && // Don't reconnect on normal close
        this._reconnectAttempts < this._options.maxReconnectAttempts
      ) {
        this._scheduleReconnect()
      }
    }

    this._ws.onmessage = (event) => {
      this._handleMessage(event.data as string)
    }

    this._ws.onerror = (event) => {
      const error = new Error((event as unknown as { message?: string }).message ?? 'WebSocket error')
      this._options.onError?.(error)

      // Reject connection promise if still connecting
      if (this._state === ConnectionState.Connecting) {
        this._state = ConnectionState.Disconnected
        this._connectionPromise?.reject(error)
        this._connectionPromise = null
      }
    }
  }

  private _handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WSIncomingMessage

      switch (message.type) {
        case 'update':
          this._handleUpdate(message.subscriptionId, message.data)
          break

        case 'error':
          if (message.subscriptionId) {
            this._handleSubscriptionError(message.subscriptionId, message.message)
          }
          break

        case 'mutationResult':
          this._handleRequestResult(message.requestId, message.result)
          break

        case 'mutationError':
          this._handleRequestError(message.requestId, message.message)
          break

        case 'actionResult':
          this._handleRequestResult(message.requestId, message.result)
          break

        case 'actionError':
          this._handleRequestError(message.requestId, message.message)
          break

        case 'subscribed':
        case 'authenticated':
        case 'pong':
          // Acknowledgment messages
          break

        default:
          // Unknown message type, ignore
          break
      }
    } catch {
      // Parse error, ignore
    }
  }

  private _handleUpdate(subscriptionId: string, data: unknown): void {
    // Handle deduplication - forward to all callbacks
    if (this._options.deduplicateSubscriptions) {
      const subscription = this._subscriptions.get(subscriptionId)
      if (subscription?.dedupeKey) {
        const dedupe = this._dedupeMap.get(subscription.dedupeKey)
        if (dedupe) {
          for (const callbackId of dedupe.callbacks) {
            const sub = this._subscriptions.get(callbackId)
            if (sub) {
              this._notifySubscription(sub, data)
            }
          }
          return
        }
      }
    }

    // Normal update
    const subscription = this._subscriptions.get(subscriptionId)
    if (subscription) {
      this._notifySubscription(subscription, data)
    }
  }

  private _notifySubscription(subscription: InternalSubscription, data: unknown): void {
    const previousData = subscription.lastData
    subscription.lastData = data

    // Call transition callback
    if (subscription.callbacks.onTransition) {
      subscription.callbacks.onTransition(previousData, data)
    }

    // Call update callback
    subscription.callbacks.onUpdate(data)
  }

  private _handleSubscriptionError(subscriptionId: string, message: string): void {
    const subscription = this._subscriptions.get(subscriptionId)
    if (subscription?.callbacks.onError) {
      subscription.callbacks.onError(new Error(message))
    }
  }

  private _handleRequestResult(requestId: string, result: unknown): void {
    const request = this._pendingRequests.get(requestId)
    if (request) {
      this._pendingRequests.delete(requestId)
      request.resolve(result)
    }
  }

  private _handleRequestError(requestId: string, message: string): void {
    const request = this._pendingRequests.get(requestId)
    if (request) {
      this._pendingRequests.delete(requestId)
      request.reject(new Error(message))
    }
  }

  private _sendSubscribe(subscription: InternalSubscription): void {
    this._send({
      type: 'subscribe',
      subscriptionId: subscription.id,
      queryPath: subscription.queryPath,
      args: subscription.args,
    })
  }

  private _send(message: WSOutgoingMessage): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(message))
    }
  }

  private _scheduleReconnect(): void {
    if (this._closed || this._reconnectTimeout) return

    this._isReconnecting = true
    this._reconnectAttempts++

    const delay = this._calculateReconnectDelay()

    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTimeout = null
      if (!this._closed) {
        this.connect().catch(() => {
          // Error handled by event handlers
        })
      }
    }, delay)
  }

  private _calculateReconnectDelay(): number {
    const baseDelay = this._options.reconnectDelay

    if (this._options.reconnectBackoff === 'exponential') {
      return baseDelay * Math.pow(2, this._reconnectAttempts - 1)
    }

    return baseDelay
  }

  private _clearReconnectTimeout(): void {
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout)
      this._reconnectTimeout = null
    }
  }

  private _generateId(prefix: string): string {
    return `${prefix}_${++this._idCounter}_${Date.now()}`
  }

  private _createDedupeKey(queryPath: string, args: unknown): string {
    return JSON.stringify({ queryPath, args })
  }
}
