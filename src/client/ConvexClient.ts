/**
 * ConvexClient - WebSocket-based reactive client for Convex
 *
 * Provides real-time subscriptions, queries, mutations, and actions with
 * automatic reconnection and message queuing support.
 *
 * @module client/ConvexClient
 * @packageDocumentation
 */

import type { FunctionReference } from '../types'

// ============================================================================
// Constants
// ============================================================================

/** Default reconnection delay in milliseconds */
const DEFAULT_RECONNECT_DELAY = 1000

/** Default maximum reconnection attempts before giving up */
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10

/** Interval for WebSocket ping/pong keep-alive in milliseconds */
const PING_INTERVAL_MS = 30000

/** Timeout for pong response before triggering reconnect in milliseconds */
const PONG_TIMEOUT_MS = 10000

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for creating a ConvexClient instance.
 *
 * @example
 * ```typescript
 * const options: ClientOptions = {
 *   autoReconnect: true,
 *   reconnectDelay: 2000,
 *   maxReconnectAttempts: 5,
 * };
 * const client = new ConvexClient("https://example.convex.cloud", options);
 * ```
 */
export interface ClientOptions {
  /**
   * Custom fetch implementation for HTTP requests.
   * Useful for testing or environments without global fetch.
   * @defaultValue `globalThis.fetch`
   */
  fetch?: typeof fetch

  /**
   * Custom WebSocket implementation for real-time connections.
   * Useful for testing or environments without global WebSocket.
   * @defaultValue `globalThis.WebSocket`
   */
  WebSocket?: typeof WebSocket

  /**
   * Whether to automatically reconnect when the WebSocket connection is lost.
   * When enabled, the client will attempt to reconnect with exponential backoff.
   * @defaultValue `true`
   */
  autoReconnect?: boolean

  /**
   * Base delay in milliseconds before attempting reconnection.
   * Actual delay increases exponentially with each failed attempt.
   * @defaultValue `1000`
   */
  reconnectDelay?: number

  /**
   * Maximum number of reconnection attempts before giving up.
   * Set to 0 to disable reconnection limit.
   * @defaultValue `10`
   */
  maxReconnectAttempts?: number
}

/**
 * Options for subscribing to a query.
 *
 * @example
 * ```typescript
 * const options: SubscriptionOptions = {
 *   onConnect: () => console.log("Connected!"),
 *   onDisconnect: () => console.log("Disconnected"),
 *   onError: (error) => console.error("Subscription error:", error),
 * };
 * ```
 */
export interface SubscriptionOptions {
  /**
   * Called when the subscription is first established.
   * Useful for updating UI to show connected state.
   */
  onConnect?: () => void

  /**
   * Called when the subscription connection is lost.
   * Useful for updating UI to show disconnected state.
   */
  onDisconnect?: () => void

  /**
   * Called when an error occurs with this specific subscription.
   * @param error - The error that occurred
   */
  onError?: (error: Error) => void
}

/**
 * Callback function invoked when subscription data is updated.
 *
 * @typeParam T - The type of data returned by the subscription
 * @param result - The latest result from the subscribed query
 */
export type SubscriptionCallback<T> = (result: T) => void

/**
 * Handle for managing an active subscription.
 * Use the unsubscribe method to cancel the subscription and stop receiving updates.
 */
export interface SubscriptionHandle {
  /**
   * Unsubscribe from the query and stop receiving updates.
   * Safe to call multiple times.
   */
  unsubscribe: () => void
}

/**
 * Internal state for tracking an active subscription.
 * @internal
 */
interface SubscriptionState {
  /** Unique identifier for this subscription */
  readonly id: string
  /** Path to the query function (e.g., "api.messages.list") */
  readonly queryPath: string
  /** Arguments passed to the query */
  readonly args: unknown
  /** Callback to invoke when data is updated */
  readonly callback: SubscriptionCallback<unknown>
  /** Optional configuration for this subscription */
  readonly options?: SubscriptionOptions
  /** The last received result (used for deduplication) */
  lastResult?: unknown
}

/**
 * Outgoing WebSocket message types (client to server).
 * @internal
 */
type WSOutgoingMessage =
  | { type: 'subscribe'; subscriptionId: string; queryPath: string; args: unknown }
  | { type: 'unsubscribe'; subscriptionId: string }
  | { type: 'authenticate'; token: string }
  | { type: 'ping' }

/**
 * Incoming WebSocket message types (server to client).
 * @internal
 */
type WSIncomingMessage =
  | { type: 'subscribed'; subscriptionId: string }
  | { type: 'update'; subscriptionId: string; data: unknown }
  | { type: 'error'; subscriptionId?: string; message: string }
  | { type: 'pong' }
  | { type: 'authenticated' }

/**
 * Union type of all WebSocket message types.
 * @internal
 */
type WSMessage = WSOutgoingMessage | WSIncomingMessage

/**
 * Error response structure from the Convex API.
 * @internal
 */
interface ApiErrorResponse {
  error?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalizes a deployment URL by removing trailing slashes.
 *
 * @param url - The URL to normalize
 * @returns Normalized URL without trailing slash
 * @internal
 */
function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '')
}

/**
 * Converts an HTTP(S) URL to a WebSocket URL with /sync path.
 *
 * @param httpUrl - The HTTP URL to convert
 * @returns WebSocket URL for the sync endpoint
 * @internal
 */
function toWebSocketUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, 'ws') + '/sync'
}

/**
 * Calculates the reconnection delay using exponential backoff.
 *
 * @param baseDelay - Base delay in milliseconds
 * @param attempt - Current attempt number (1-based)
 * @returns Calculated delay in milliseconds
 * @internal
 */
function calculateExponentialBackoff(baseDelay: number, attempt: number): number {
  return baseDelay * Math.pow(2, attempt - 1)
}

/**
 * Checks if a reconnection attempt should be made.
 *
 * @param autoReconnect - Whether auto-reconnect is enabled
 * @param currentAttempts - Current number of attempts made
 * @param maxAttempts - Maximum allowed attempts
 * @returns True if reconnection should be attempted
 * @internal
 */
function shouldAttemptReconnect(
  autoReconnect: boolean,
  currentAttempts: number,
  maxAttempts: number
): boolean {
  return autoReconnect && currentAttempts < maxAttempts
}

/**
 * Creates HTTP headers for API requests.
 *
 * @param authToken - Optional authentication token
 * @returns Headers object with Content-Type and optional Authorization
 * @internal
 */
function createRequestHeaders(authToken: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  return headers
}

/**
 * Creates a request body for Convex function calls.
 *
 * @param path - Function path
 * @param args - Function arguments
 * @returns JSON string body for the request
 * @internal
 */
function createFunctionRequestBody(path: string, args: unknown): string {
  return JSON.stringify({
    path,
    args,
    format: 'json',
  })
}

/**
 * Extracts an error message from an API response or returns a default.
 *
 * @param errorResponse - The parsed error response
 * @param defaultMessage - Default message if none found in response
 * @returns Error message string
 * @internal
 */
function extractErrorMessage(
  errorResponse: ApiErrorResponse,
  defaultMessage: string
): string {
  return errorResponse.error || defaultMessage
}

/**
 * Creates a subscription message for the WebSocket.
 *
 * @param state - Subscription state to create message from
 * @returns Subscribe message object
 * @internal
 */
function createSubscribeMessage(state: SubscriptionState): WSOutgoingMessage {
  return {
    type: 'subscribe',
    subscriptionId: state.id,
    queryPath: state.queryPath,
    args: state.args,
  }
}

// ============================================================================
// ConvexClient Implementation
// ============================================================================

/**
 * WebSocket-based client for Convex with real-time subscriptions.
 *
 * The ConvexClient provides a reactive connection to your Convex deployment,
 * enabling real-time subscriptions to queries, as well as one-time query
 * execution, mutations, and actions. It handles connection management,
 * automatic reconnection with exponential backoff, and authentication.
 *
 * ## Features
 *
 * - **Real-time Subscriptions**: Subscribe to queries and receive automatic
 *   updates when data changes.
 * - **One-time Queries**: Execute queries without subscribing for single reads.
 * - **Mutations**: Execute mutations to modify data.
 * - **Actions**: Execute server-side actions.
 * - **Authentication**: Set and clear authentication tokens.
 * - **Auto-reconnection**: Automatically reconnects with exponential backoff.
 * - **Connection Management**: Full control over the WebSocket connection.
 *
 * ## Usage
 *
 * @example Basic usage with subscriptions
 * ```typescript
 * import { ConvexClient } from "convex.do/client";
 * import { api } from "./convex/_generated/api";
 *
 * // Create the client
 * const client = new ConvexClient("https://your-deployment.convex.cloud");
 *
 * // Subscribe to a query with real-time updates
 * const unsubscribe = client.onUpdate(
 *   api.messages.list,
 *   { channel: "general" },
 *   (messages) => {
 *     console.log("Messages updated:", messages);
 *   },
 *   {
 *     onConnect: () => console.log("Subscription connected"),
 *     onDisconnect: () => console.log("Subscription disconnected"),
 *     onError: (error) => console.error("Subscription error:", error),
 *   }
 * );
 *
 * // Later, unsubscribe and close
 * unsubscribe();
 * client.close();
 * ```
 *
 * @example One-time query and mutation
 * ```typescript
 * // Execute a one-time query
 * const users = await client.query(api.users.list, {});
 *
 * // Execute a mutation
 * const userId = await client.mutation(api.users.create, {
 *   name: "Alice",
 *   email: "alice@example.com",
 * });
 *
 * // Execute an action
 * const result = await client.action(api.emails.send, {
 *   to: "alice@example.com",
 *   subject: "Welcome!",
 * });
 * ```
 *
 * @example With authentication
 * ```typescript
 * const client = new ConvexClient("https://your-deployment.convex.cloud");
 *
 * // Set authentication token (e.g., from Auth0, Clerk, etc.)
 * client.setAuth(authToken);
 *
 * // Make authenticated requests
 * const myProfile = await client.query(api.users.me, {});
 *
 * // Clear auth on logout
 * client.clearAuth();
 * ```
 *
 * @example Custom configuration
 * ```typescript
 * const client = new ConvexClient("https://your-deployment.convex.cloud", {
 *   autoReconnect: true,
 *   reconnectDelay: 2000,    // 2 second base delay
 *   maxReconnectAttempts: 5, // Give up after 5 attempts
 * });
 * ```
 */
export class ConvexClient {
  // --------------------------------------------------------------------------
  // Private Properties
  // --------------------------------------------------------------------------

  /** Base URL for HTTP requests */
  private readonly _url: string

  /** WebSocket URL for real-time connections */
  private readonly _wsUrl: string

  /** Resolved client options with defaults applied */
  private readonly _options: Readonly<Required<ClientOptions>>

  /** Active WebSocket connection, null when disconnected */
  private _ws: WebSocket | null = null

  /** Map of active subscriptions by ID */
  private readonly _subscriptions: Map<string, SubscriptionState> = new Map()

  /** Map of subscriptions waiting for connection */
  private readonly _pendingSubscriptions: Map<string, SubscriptionState> = new Map()

  /** Current authentication token, null if not authenticated */
  private _authToken: string | null = null

  /** Whether the WebSocket is currently connected */
  private _isConnected = false

  /** Number of reconnection attempts made */
  private _reconnectAttempts = 0

  /** Timeout handle for scheduled reconnection */
  private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  /** Interval handle for ping keep-alive */
  private _pingInterval: ReturnType<typeof setInterval> | null = null

  /** Timeout handle for pong response */
  private _pongTimeout: ReturnType<typeof setTimeout> | null = null

  /** Whether the client is awaiting a pong response */
  private _awaitingPong = false

  /** Counter for generating unique subscription IDs */
  private _idCounter = 0

  /** Whether auto-reconnect is currently enabled (can be disabled on close) */
  private _autoReconnectEnabled: boolean

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  /**
   * Creates a new ConvexClient instance.
   *
   * The client will automatically attempt to connect to the WebSocket endpoint
   * upon construction. Use the `autoReconnect` option to control reconnection
   * behavior when the connection is lost.
   *
   * @param url - The deployment URL (e.g., "https://your-deployment.convex.cloud")
   * @param options - Optional configuration for the client
   *
   * @example
   * ```typescript
   * // Basic usage
   * const client = new ConvexClient("https://your-deployment.convex.cloud");
   *
   * // With options
   * const client = new ConvexClient("https://your-deployment.convex.cloud", {
   *   autoReconnect: true,
   *   reconnectDelay: 1000,
   *   maxReconnectAttempts: 10,
   * });
   * ```
   */
  constructor(url: string, options: ClientOptions = {}) {
    this._url = normalizeUrl(url)
    this._wsUrl = toWebSocketUrl(this._url)

    this._options = Object.freeze({
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      WebSocket: options.WebSocket ?? globalThis.WebSocket,
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? DEFAULT_RECONNECT_DELAY,
      maxReconnectAttempts: options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
    })

    this._autoReconnectEnabled = this._options.autoReconnect

    this._connect()
  }

  // --------------------------------------------------------------------------
  // Public API - Authentication
  // --------------------------------------------------------------------------

  /**
   * Sets the authentication token for the client.
   *
   * The token will be sent immediately if already connected, and will be
   * automatically sent on future connections. This token is included in
   * the Authorization header for HTTP requests and sent via WebSocket
   * for real-time subscriptions.
   *
   * @param token - The authentication token (typically a JWT)
   *
   * @example
   * ```typescript
   * // Set token after login
   * const { token } = await authenticateUser(email, password);
   * client.setAuth(token);
   *
   * // Token is automatically used for all subsequent requests
   * const profile = await client.query(api.users.me, {});
   * ```
   */
  setAuth(token: string): void {
    this._authToken = token
    if (this._ws && this._isConnected) {
      this._send({ type: 'authenticate', token })
    }
  }

  /**
   * Clears the authentication token.
   *
   * After calling this method, subsequent requests will be unauthenticated.
   * Note that existing subscriptions are not automatically invalidated.
   *
   * @example
   * ```typescript
   * // Clear auth on logout
   * client.clearAuth();
   * // Optionally close and recreate client for fresh state
   * client.close();
   * ```
   */
  clearAuth(): void {
    this._authToken = null
  }

  // --------------------------------------------------------------------------
  // Public API - Subscriptions
  // --------------------------------------------------------------------------

  /**
   * Subscribes to a query with real-time updates.
   *
   * Creates a subscription that will call the provided callback whenever the
   * query result changes. The subscription is automatically maintained across
   * reconnections.
   *
   * @typeParam T - The return type of the query
   * @param query - The query function reference from your API
   * @param args - Arguments to pass to the query
   * @param callback - Function called whenever the query result updates
   * @param options - Optional subscription lifecycle callbacks
   * @returns A function that unsubscribes from the query when called
   *
   * @example
   * ```typescript
   * // Subscribe to messages in a channel
   * const unsubscribe = client.onUpdate(
   *   api.messages.list,
   *   { channel: "general", limit: 50 },
   *   (messages) => {
   *     setMessages(messages);
   *   },
   *   {
   *     onError: (error) => {
   *       showError("Failed to load messages");
   *     },
   *   }
   * );
   *
   * // Clean up when component unmounts
   * useEffect(() => {
   *   return () => unsubscribe();
   * }, []);
   * ```
   */
  onUpdate<T>(
    query: FunctionReference<'query', unknown, T>,
    args: unknown,
    callback: SubscriptionCallback<T>,
    options?: SubscriptionOptions
  ): () => void {
    const id = this._generateId()
    const state: SubscriptionState = {
      id,
      queryPath: query._path,
      args,
      callback: callback as SubscriptionCallback<unknown>,
      ...(options !== undefined && { options }),
    }

    if (this._isConnected) {
      this._activateSubscription(id, state)
    } else {
      this._pendingSubscriptions.set(id, state)
    }

    return () => this._unsubscribe(id)
  }

  // --------------------------------------------------------------------------
  // Public API - One-time Operations
  // --------------------------------------------------------------------------

  /**
   * Executes a query once without subscribing.
   *
   * Use this method when you need to fetch data once without real-time updates.
   * For reactive data that should update automatically, use `onUpdate` instead.
   *
   * @typeParam T - The return type of the query
   * @param query - The query function reference from your API
   * @param args - Arguments to pass to the query
   * @returns Promise resolving to the query result
   * @throws Error if the query fails or the server returns an error
   *
   * @example
   * ```typescript
   * // Fetch user profile once
   * const profile = await client.query(api.users.get, { id: userId });
   * console.log("User:", profile.name);
   *
   * // With error handling
   * try {
   *   const data = await client.query(api.data.get, { key: "config" });
   * } catch (error) {
   *   console.error("Query failed:", error.message);
   * }
   * ```
   */
  async query<T>(
    query: FunctionReference<'query', unknown, T>,
    args: unknown
  ): Promise<T> {
    return this._executeFunction('query', query._path, args, 'Query failed')
  }

  /**
   * Executes a mutation to modify data.
   *
   * Mutations are transactional operations that can read and write data.
   * They run with ACID guarantees and will trigger updates to any
   * subscribed queries that depend on the modified data.
   *
   * @typeParam T - The return type of the mutation
   * @param mutation - The mutation function reference from your API
   * @param args - Arguments to pass to the mutation
   * @returns Promise resolving to the mutation result
   * @throws Error if the mutation fails or the server returns an error
   *
   * @example
   * ```typescript
   * // Create a new message
   * const messageId = await client.mutation(api.messages.send, {
   *   channel: "general",
   *   body: "Hello, world!",
   * });
   *
   * // Update a user
   * await client.mutation(api.users.update, {
   *   id: userId,
   *   name: "New Name",
   * });
   * ```
   */
  async mutation<T>(
    mutation: FunctionReference<'mutation', unknown, T>,
    args: unknown
  ): Promise<T> {
    return this._executeFunction('mutation', mutation._path, args, 'Mutation failed')
  }

  /**
   * Executes an action.
   *
   * Actions are server-side functions that can have side effects like calling
   * external APIs, but do not have transactional guarantees like mutations.
   * Use actions for operations that need to interact with external services.
   *
   * @typeParam T - The return type of the action
   * @param action - The action function reference from your API
   * @param args - Arguments to pass to the action
   * @returns Promise resolving to the action result
   * @throws Error if the action fails or the server returns an error
   *
   * @example
   * ```typescript
   * // Send an email via an external service
   * const result = await client.action(api.emails.send, {
   *   to: "user@example.com",
   *   subject: "Welcome!",
   *   body: "Thanks for signing up.",
   * });
   *
   * // Process a payment
   * const payment = await client.action(api.payments.process, {
   *   amount: 9999,
   *   currency: "usd",
   * });
   * ```
   */
  async action<T>(
    action: FunctionReference<'action', unknown, T>,
    args: unknown
  ): Promise<T> {
    return this._executeFunction('action', action._path, args, 'Action failed')
  }

  // --------------------------------------------------------------------------
  // Public API - Connection Management
  // --------------------------------------------------------------------------

  /**
   * Closes the client connection and releases all resources.
   *
   * After calling close:
   * - The WebSocket connection is terminated
   * - All subscriptions are cancelled
   * - Automatic reconnection is disabled
   * - Pending timers are cleared
   *
   * The client cannot be reused after closing. Create a new instance if needed.
   *
   * @example
   * ```typescript
   * // Clean shutdown
   * client.close();
   *
   * // In React component
   * useEffect(() => {
   *   const client = new ConvexClient(url);
   *   return () => client.close();
   * }, []);
   * ```
   */
  close(): void {
    this._autoReconnectEnabled = false

    this._clearReconnectTimeout()
    this._clearPingInterval()
    this._clearPongTimeout()

    if (this._ws) {
      this._ws.close()
      this._ws = null
    }

    this._subscriptions.clear()
    this._pendingSubscriptions.clear()
    this._isConnected = false
  }

  // --------------------------------------------------------------------------
  // Private Methods - Connection
  // --------------------------------------------------------------------------

  /**
   * Initiates WebSocket connection and sets up event handlers.
   * @internal
   */
  private _connect(): void {
    try {
      this._ws = new this._options.WebSocket(this._wsUrl)
      this._setupWebSocketHandlers()
    } catch (error) {
      console.error('Failed to connect:', error)
      this._scheduleReconnect()
    }
  }

  /**
   * Sets up all WebSocket event handlers.
   * @internal
   */
  private _setupWebSocketHandlers(): void {
    if (!this._ws) return

    this._ws.addEventListener('open', this._handleOpen.bind(this))
    this._ws.addEventListener('message', this._handleMessage.bind(this))
    this._ws.addEventListener('close', this._handleClose.bind(this))
    this._ws.addEventListener('error', this._handleError.bind(this))
  }

  /**
   * Handles WebSocket open event.
   * @internal
   */
  private _handleOpen(): void {
    this._isConnected = true
    this._reconnectAttempts = 0

    this._sendAuthenticationIfNeeded()
    this._resubscribeAll()
    this._activatePendingSubscriptions()
    this._startPingInterval()
  }

  /**
   * Handles WebSocket close event.
   * @internal
   */
  private _handleClose(): void {
    this._isConnected = false

    this._clearPingInterval()
    this._clearPongTimeout()
    this._notifySubscriptionsOfDisconnect()
    this._scheduleReconnect()
  }

  /**
   * Handles WebSocket error event.
   * @internal
   */
  private _handleError(event: Event): void {
    console.error('WebSocket error:', event)
  }

  /**
   * Handles incoming WebSocket message event.
   * @internal
   */
  private _handleMessage(event: MessageEvent): void {
    this._processMessage(event.data as string)
  }

  // --------------------------------------------------------------------------
  // Private Methods - Message Processing
  // --------------------------------------------------------------------------

  /**
   * Parses and processes an incoming WebSocket message.
   * @internal
   */
  private _processMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WSIncomingMessage
      this._dispatchMessage(message)
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }

  /**
   * Dispatches a parsed message to the appropriate handler.
   * @internal
   */
  private _dispatchMessage(message: WSIncomingMessage): void {
    switch (message.type) {
      case 'update':
        this._handleUpdateMessage(message.subscriptionId, message.data)
        break

      case 'error':
        this._handleErrorMessage(message.subscriptionId, message.message)
        break

      case 'subscribed':
      case 'authenticated':
        // Acknowledgment messages - no action needed
        break

      case 'pong':
        this._handlePongMessage()
        break

      default:
        // Type guard for exhaustive switch - helps catch missing cases
        console.warn('Unknown message type:', (message as { type: string }).type)
    }
  }

  /**
   * Handles a subscription update message.
   * @internal
   */
  private _handleUpdateMessage(subscriptionId: string, data: unknown): void {
    const state = this._subscriptions.get(subscriptionId)
    if (state) {
      state.lastResult = data
      state.callback(data)
    }
  }

  /**
   * Handles an error message from the server.
   * @internal
   */
  private _handleErrorMessage(subscriptionId: string | undefined, errorMessage: string): void {
    if (subscriptionId) {
      const state = this._subscriptions.get(subscriptionId)
      if (state?.options?.onError) {
        state.options.onError(new Error(errorMessage))
      }
    } else {
      console.error('Server error:', errorMessage)
    }
  }

  /**
   * Handles a pong message from the server.
   * Clears the pong timeout to prevent unnecessary reconnection.
   * @internal
   */
  private _handlePongMessage(): void {
    this._clearPongTimeout()
  }

  // --------------------------------------------------------------------------
  // Private Methods - Subscription Management
  // --------------------------------------------------------------------------

  /**
   * Activates a subscription and sends the subscribe message.
   * @internal
   */
  private _activateSubscription(id: string, state: SubscriptionState): void {
    this._subscriptions.set(id, state)
    this._send(createSubscribeMessage(state))
  }

  /**
   * Resubscribes to all active subscriptions (used on reconnect).
   * @internal
   */
  private _resubscribeAll(): void {
    for (const state of this._subscriptions.values()) {
      this._send(createSubscribeMessage(state))
      state.options?.onConnect?.()
    }
  }

  /**
   * Activates all pending subscriptions that were waiting for connection.
   * @internal
   */
  private _activatePendingSubscriptions(): void {
    for (const [id, state] of this._pendingSubscriptions) {
      this._subscriptions.set(id, state)
      this._send(createSubscribeMessage(state))
      state.options?.onConnect?.()
    }
    this._pendingSubscriptions.clear()
  }

  /**
   * Notifies all subscriptions of a disconnect event.
   * @internal
   */
  private _notifySubscriptionsOfDisconnect(): void {
    for (const state of this._subscriptions.values()) {
      state.options?.onDisconnect?.()
    }
  }

  /**
   * Unsubscribes from a subscription by ID.
   * @internal
   */
  private _unsubscribe(id: string): void {
    const wasActive = this._subscriptions.has(id)

    this._subscriptions.delete(id)
    this._pendingSubscriptions.delete(id)

    if (wasActive && this._isConnected) {
      this._send({ type: 'unsubscribe', subscriptionId: id })
    }
  }

  // --------------------------------------------------------------------------
  // Private Methods - HTTP Operations
  // --------------------------------------------------------------------------

  /**
   * Executes a Convex function via HTTP.
   * @internal
   */
  private async _executeFunction<T>(
    type: 'query' | 'mutation' | 'action',
    path: string,
    args: unknown,
    defaultErrorMessage: string
  ): Promise<T> {
    const response = await this._options.fetch(`${this._url}/api/${type}`, {
      method: 'POST',
      headers: createRequestHeaders(this._authToken),
      body: createFunctionRequestBody(path, args),
    })

    if (!response.ok) {
      const errorResponse = await response.json() as ApiErrorResponse
      throw new Error(extractErrorMessage(errorResponse, defaultErrorMessage))
    }

    return response.json() as Promise<T>
  }

  // --------------------------------------------------------------------------
  // Private Methods - WebSocket Communication
  // --------------------------------------------------------------------------

  /**
   * Sends authentication token if one is set.
   * @internal
   */
  private _sendAuthenticationIfNeeded(): void {
    if (this._authToken) {
      this._send({ type: 'authenticate', token: this._authToken })
    }
  }

  /**
   * Sends a message over the WebSocket connection.
   * @internal
   */
  private _send(message: WSOutgoingMessage): void {
    if (this._ws && this._isConnected) {
      this._ws.send(JSON.stringify(message))
    }
  }

  // --------------------------------------------------------------------------
  // Private Methods - Timers and Reconnection
  // --------------------------------------------------------------------------

  /**
   * Starts the ping interval for keep-alive.
   * @internal
   */
  private _startPingInterval(): void {
    this._pingInterval = setInterval(() => {
      if (this._isConnected && !this._awaitingPong) {
        this._send({ type: 'ping' })
        this._awaitingPong = true

        // Set timeout for pong response
        this._pongTimeout = setTimeout(() => {
          if (this._awaitingPong) {
            console.warn('Pong timeout - connection may be dead, reconnecting...')
            this._reconnect()
          }
        }, PONG_TIMEOUT_MS)
      }
    }, PING_INTERVAL_MS)
  }

  /**
   * Clears the ping interval.
   * @internal
   */
  private _clearPingInterval(): void {
    if (this._pingInterval) {
      clearInterval(this._pingInterval)
      this._pingInterval = null
    }
  }

  /**
   * Clears the pong timeout.
   * @internal
   */
  private _clearPongTimeout(): void {
    if (this._pongTimeout) {
      clearTimeout(this._pongTimeout)
      this._pongTimeout = null
    }
    this._awaitingPong = false
  }

  /**
   * Clears any scheduled reconnection timeout.
   * @internal
   */
  private _clearReconnectTimeout(): void {
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout)
      this._reconnectTimeout = null
    }
  }

  /**
   * Schedules a reconnection attempt if allowed.
   * @internal
   */
  private _scheduleReconnect(): void {
    if (!shouldAttemptReconnect(
      this._autoReconnectEnabled,
      this._reconnectAttempts,
      this._options.maxReconnectAttempts
    )) {
      return
    }

    this._reconnectAttempts++
    const delay = calculateExponentialBackoff(
      this._options.reconnectDelay,
      this._reconnectAttempts
    )
    this._reconnectTimeout = setTimeout(() => this._connect(), delay)
  }

  /**
   * Forces a reconnection by closing the current connection and creating a new one.
   * Used when pong timeout is detected to handle zombie connections.
   * @internal
   */
  private _reconnect(): void {
    this._isConnected = false
    this._clearPingInterval()
    this._clearPongTimeout()

    if (this._ws) {
      this._ws.close()
      this._ws = null
    }

    // Reset attempts and connect immediately
    this._reconnectAttempts = 0
    this._connect()
  }

  // --------------------------------------------------------------------------
  // Private Methods - Utility
  // --------------------------------------------------------------------------

  /**
   * Generates a unique subscription ID.
   * @internal
   */
  private _generateId(): string {
    return `sub_${++this._idCounter}_${Date.now()}`
  }
}
