/**
 * ConvexClient - WebSocket-based reactive client
 *
 * Provides real-time subscriptions and optimistic updates.
 */

import type { FunctionReference } from '../types'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a ConvexClient.
 */
export interface ClientOptions {
  /** Custom fetch implementation */
  fetch?: typeof fetch
  /** Custom WebSocket implementation */
  WebSocket?: typeof WebSocket
  /** Whether to automatically reconnect on disconnect */
  autoReconnect?: boolean
  /** Reconnection delay in milliseconds */
  reconnectDelay?: number
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number
}

/**
 * Options for subscribing to a query.
 */
export interface SubscriptionOptions {
  /** Called when the subscription is first established */
  onConnect?: () => void
  /** Called when the subscription is lost */
  onDisconnect?: () => void
  /** Called when an error occurs */
  onError?: (error: Error) => void
}

/**
 * Callback for subscription updates.
 */
export type SubscriptionCallback<T> = (result: T) => void

/**
 * Handle for managing a subscription.
 */
export interface SubscriptionHandle {
  /** Unsubscribe from the query */
  unsubscribe: () => void
}

/**
 * Internal subscription state.
 */
interface SubscriptionState {
  id: string
  queryPath: string
  args: unknown
  callback: SubscriptionCallback<unknown>
  options?: SubscriptionOptions
  lastResult?: unknown
}

/**
 * WebSocket message types.
 */
type WSMessage =
  | { type: 'subscribe'; subscriptionId: string; queryPath: string; args: unknown }
  | { type: 'unsubscribe'; subscriptionId: string }
  | { type: 'authenticate'; token: string }
  | { type: 'ping' }
  | { type: 'subscribed'; subscriptionId: string }
  | { type: 'update'; subscriptionId: string; data: unknown }
  | { type: 'error'; subscriptionId?: string; message: string }
  | { type: 'pong' }
  | { type: 'authenticated' }

// ============================================================================
// ConvexClient Implementation
// ============================================================================

/**
 * WebSocket-based client for convex.do with real-time subscriptions.
 *
 * @example
 * ```typescript
 * import { ConvexClient } from "convex.do/client";
 *
 * const client = new ConvexClient("https://your-worker.workers.dev");
 *
 * // Subscribe to a query
 * const unsubscribe = client.onUpdate(api.messages.list, { channel }, (messages) => {
 *   console.log("Messages:", messages);
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
  private url: string
  private wsUrl: string
  private options: Required<ClientOptions>
  private ws: WebSocket | null = null
  private subscriptions: Map<string, SubscriptionState> = new Map()
  private pendingSubscriptions: Map<string, SubscriptionState> = new Map()
  private authToken: string | null = null
  private isConnected = false
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private idCounter = 0

  constructor(url: string, options: ClientOptions = {}) {
    this.url = url.replace(/\/$/, '')
    this.wsUrl = this.url.replace(/^http/, 'ws') + '/sync'

    this.options = {
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      WebSocket: options.WebSocket ?? globalThis.WebSocket,
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
    }

    this.connect()
  }

  /**
   * Set the authentication token.
   */
  setAuth(token: string): void {
    this.authToken = token
    if (this.ws && this.isConnected) {
      this.send({ type: 'authenticate', token })
    }
  }

  /**
   * Clear the authentication token.
   */
  clearAuth(): void {
    this.authToken = null
  }

  /**
   * Subscribe to a query with real-time updates.
   */
  onUpdate<T>(
    query: FunctionReference<'query', unknown, T>,
    args: unknown,
    callback: SubscriptionCallback<T>,
    options?: SubscriptionOptions
  ): () => void {
    const id = this.generateId()
    const state: SubscriptionState = {
      id,
      queryPath: query._path,
      args,
      callback: callback as SubscriptionCallback<unknown>,
      options,
    }

    if (this.isConnected) {
      this.subscriptions.set(id, state)
      this.send({
        type: 'subscribe',
        subscriptionId: id,
        queryPath: query._path,
        args,
      })
    } else {
      this.pendingSubscriptions.set(id, state)
    }

    return () => this.unsubscribe(id)
  }

  /**
   * Run a query (one-time, non-reactive).
   */
  async query<T>(
    query: FunctionReference<'query', unknown, T>,
    args: unknown
  ): Promise<T> {
    const response = await this.options.fetch(`${this.url}/api/query`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        path: query._path,
        args,
        format: 'json',
      }),
    })

    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error || 'Query failed')
    }

    return response.json() as Promise<T>
  }

  /**
   * Run a mutation.
   */
  async mutation<T>(
    mutation: FunctionReference<'mutation', unknown, T>,
    args: unknown
  ): Promise<T> {
    const response = await this.options.fetch(`${this.url}/api/mutation`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        path: mutation._path,
        args,
        format: 'json',
      }),
    })

    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error || 'Mutation failed')
    }

    return response.json() as Promise<T>
  }

  /**
   * Run an action.
   */
  async action<T>(
    action: FunctionReference<'action', unknown, T>,
    args: unknown
  ): Promise<T> {
    const response = await this.options.fetch(`${this.url}/api/action`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        path: action._path,
        args,
        format: 'json',
      }),
    })

    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error || 'Action failed')
    }

    return response.json() as Promise<T>
  }

  /**
   * Close the client connection.
   */
  close(): void {
    this.options.autoReconnect = false

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.subscriptions.clear()
    this.pendingSubscriptions.clear()
    this.isConnected = false
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private connect(): void {
    try {
      this.ws = new this.options.WebSocket(this.wsUrl)

      this.ws.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0

        // Authenticate if we have a token
        if (this.authToken) {
          this.send({ type: 'authenticate', token: this.authToken })
        }

        // Resubscribe to all subscriptions
        for (const state of this.subscriptions.values()) {
          this.send({
            type: 'subscribe',
            subscriptionId: state.id,
            queryPath: state.queryPath,
            args: state.args,
          })
          state.options?.onConnect?.()
        }

        // Subscribe pending subscriptions
        for (const [id, state] of this.pendingSubscriptions) {
          this.subscriptions.set(id, state)
          this.send({
            type: 'subscribe',
            subscriptionId: state.id,
            queryPath: state.queryPath,
            args: state.args,
          })
          state.options?.onConnect?.()
        }
        this.pendingSubscriptions.clear()

        // Start ping interval
        this.pingInterval = setInterval(() => {
          if (this.isConnected) {
            this.send({ type: 'ping' })
          }
        }, 30000)
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string)
      }

      this.ws.onclose = () => {
        this.isConnected = false

        if (this.pingInterval) {
          clearInterval(this.pingInterval)
          this.pingInterval = null
        }

        // Notify subscriptions of disconnect
        for (const state of this.subscriptions.values()) {
          state.options?.onDisconnect?.()
        }

        // Attempt reconnection
        if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.reconnectAttempts++
          const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
          this.reconnectTimeout = setTimeout(() => this.connect(), delay)
        }
      }

      this.ws.onerror = (event) => {
        console.error('WebSocket error:', event)
      }
    } catch (error) {
      console.error('Failed to connect:', error)
      if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
        this.reconnectAttempts++
        const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
        this.reconnectTimeout = setTimeout(() => this.connect(), delay)
      }
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WSMessage

      switch (message.type) {
        case 'update': {
          const state = this.subscriptions.get(message.subscriptionId)
          if (state) {
            state.lastResult = message.data
            state.callback(message.data)
          }
          break
        }

        case 'error': {
          if (message.subscriptionId) {
            const state = this.subscriptions.get(message.subscriptionId)
            if (state) {
              state.options?.onError?.(new Error(message.message))
            }
          } else {
            console.error('Server error:', message.message)
          }
          break
        }

        case 'subscribed':
        case 'authenticated':
        case 'pong':
          // Acknowledgment messages
          break

        default:
          console.warn('Unknown message type:', message)
      }
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }

  private send(message: WSMessage): void {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private unsubscribe(id: string): void {
    const state = this.subscriptions.get(id)
    if (state) {
      this.subscriptions.delete(id)
      if (this.isConnected) {
        this.send({ type: 'unsubscribe', subscriptionId: id })
      }
    }

    this.pendingSubscriptions.delete(id)
  }

  private generateId(): string {
    return `sub_${++this.idCounter}_${Date.now()}`
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }

    return headers
  }
}
