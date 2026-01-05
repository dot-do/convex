/**
 * Subscription State Management
 *
 * Provides client-side subscription management for real-time queries
 * in a Convex-compatible way.
 *
 * Features:
 * - Subscribe to queries with callbacks
 * - Track subscription lifecycle (pending, active, error, closed)
 * - Handle multiple subscriptions to same query
 * - Reference counting for deduplicated subscriptions
 * - Callback invocation on data changes
 *
 * @module sync/subscription
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Subscription callback function type.
 */
export type SubscriptionCallback<T = unknown> = (data: T) => void | Promise<void>

/**
 * Error callback function type.
 */
export type ErrorCallback = (error: Error) => void

/**
 * Subscription states.
 */
export enum SubscriptionState {
  /** Subscription created but no data received yet */
  Pending = 'pending',
  /** Subscription is active and receiving updates */
  Active = 'active',
  /** Subscription encountered an error */
  Error = 'error',
  /** Subscription has been closed */
  Closed = 'closed',
}

/**
 * Options for creating a subscription.
 */
export interface SubscriptionOptions {
  /** Skip calling the callback for the initial data */
  skipInitialCallback?: boolean
  /** Priority level for the subscription */
  priority?: 'low' | 'normal' | 'high'
  /** Error callback */
  onError?: ErrorCallback
}

/**
 * Options for the SubscriptionManager.
 */
export interface SubscriptionManagerOptions {
  /** Maximum number of subscriptions allowed */
  maxSubscriptions?: number
  /** Enable deduplication of subscriptions with same query and args */
  deduplicateSubscriptions?: boolean
  /** Track data history for subscriptions */
  trackHistory?: boolean
  /** Callback when a subscription is created */
  onSubscribe?: (subscription: Subscription) => void
  /** Callback when a subscription is closed */
  onUnsubscribe?: (subscription: Subscription) => void
  /** Callback when a subscription receives data */
  onUpdate?: (subscription: Subscription, data: unknown) => void
  /** Callback when a subscription encounters an error */
  onSubscriptionError?: (subscription: Subscription, error: Error) => void
}

/**
 * Filter options for getSubscriptions().
 */
export interface SubscriptionFilter {
  /** Filter by query path */
  query?: string
  /** Filter by subscription state */
  state?: SubscriptionState
}

/**
 * Update options for updateSubscription().
 */
export interface UpdateOptions {
  /** Mark this as the initial data update */
  isInitial?: boolean
}

/**
 * JSON representation of a subscription.
 */
export interface SubscriptionJSON {
  id: string
  query: string
  args: unknown
  state: SubscriptionState
  data: unknown
  createdAt: number
  updatedAt: number | undefined
}

/**
 * JSON representation of the manager state.
 */
export interface SubscriptionManagerJSON {
  subscriptions: SubscriptionJSON[]
  count: number
}

// ============================================================================
// SubscriptionError Class
// ============================================================================

/**
 * Error class for subscription-related errors.
 */
export class SubscriptionError extends Error {
  /** Error code */
  code?: string
  /** Associated subscription ID */
  subscriptionId?: string

  constructor(message: string, code?: string, subscriptionId?: string) {
    super(message)
    this.name = 'SubscriptionError'
    this.code = code
    this.subscriptionId = subscriptionId

    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, SubscriptionError.prototype)
  }
}

// ============================================================================
// Subscription Class
// ============================================================================

/**
 * Represents a single subscription to a query.
 */
export class Subscription<T = unknown> {
  /** Unique subscription ID */
  readonly id: string
  /** Query path */
  readonly query: string
  /** Query arguments */
  readonly args: unknown
  /** Subscription options */
  readonly options?: SubscriptionOptions
  /** Creation timestamp */
  readonly createdAt: number

  /** Current subscription state */
  private _state: SubscriptionState = SubscriptionState.Pending
  /** Current data */
  private _data: T | undefined
  /** Current error */
  private _error: Error | undefined
  /** Last update timestamp */
  private _updatedAt: number | undefined
  /** Data history (if tracking enabled) */
  private _history: T[] | undefined
  /** Callback function */
  private _callback: SubscriptionCallback<T>
  /** Reference to the manager */
  private _manager: SubscriptionManager
  /** Whether initial callback has been skipped */
  private _initialSkipped: boolean = false

  constructor(
    id: string,
    query: string,
    args: unknown,
    callback: SubscriptionCallback<T>,
    manager: SubscriptionManager,
    options?: SubscriptionOptions,
    trackHistory?: boolean
  ) {
    this.id = id
    this.query = query
    this.args = args
    this._callback = callback
    this._manager = manager
    this.options = options
    this.createdAt = Date.now()

    if (trackHistory) {
      this._history = []
    }
  }

  // Getters for state

  get state(): SubscriptionState {
    return this._state
  }

  get data(): T | undefined {
    return this._data
  }

  get error(): Error | undefined {
    return this._error
  }

  get updatedAt(): number | undefined {
    return this._updatedAt
  }

  get history(): T[] | undefined {
    return this._history
  }

  get isActive(): boolean {
    return this._state === SubscriptionState.Active
  }

  get isPending(): boolean {
    return this._state === SubscriptionState.Pending
  }

  get isClosed(): boolean {
    return this._state === SubscriptionState.Closed
  }

  get hasError(): boolean {
    return this._state === SubscriptionState.Error
  }

  // Internal methods (called by manager)

  /** @internal */
  _setState(state: SubscriptionState): void {
    this._state = state
  }

  /** @internal */
  _setData(data: T, options?: UpdateOptions): boolean {
    // Check if we should skip initial callback
    if (options?.isInitial && this.options?.skipInitialCallback && !this._initialSkipped) {
      this._initialSkipped = true
      this._data = data
      this._updatedAt = Date.now()
      this._state = SubscriptionState.Active
      this._error = undefined

      if (this._history) {
        this._history.push(data)
      }

      return true
    }

    this._data = data
    this._updatedAt = Date.now()
    this._state = SubscriptionState.Active
    this._error = undefined

    if (this._history) {
      this._history.push(data)
    }

    // Call callback
    try {
      this._callback(data)
    } catch {
      // Swallow callback errors to prevent breaking the update flow
    }

    return true
  }

  /** @internal */
  _setError(error: Error): void {
    this._error = error
    this._state = SubscriptionState.Error

    // Call error callback if provided
    if (this.options?.onError) {
      try {
        this.options.onError(error)
      } catch {
        // Swallow error callback errors
      }
    }
  }

  /** @internal */
  _close(): void {
    this._state = SubscriptionState.Closed
  }

  /**
   * Unsubscribe from this subscription.
   */
  unsubscribe(): void {
    this._manager.unsubscribe(this.id)
  }

  /**
   * Convert subscription to JSON representation.
   */
  toJSON(): SubscriptionJSON {
    return {
      id: this.id,
      query: this.query,
      args: this.args,
      state: this._state,
      data: this._data,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    }
  }
}

// ============================================================================
// SubscriptionManager Class
// ============================================================================

/**
 * Generates a unique hash for query + args combination.
 */
function hashQueryArgs(query: string, args: unknown): string {
  const str = JSON.stringify({ query, args })
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `${query}:${hash.toString(36)}`
}

/**
 * Generates a unique subscription ID.
 */
function generateSubscriptionId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `sub_${timestamp}_${random}`
}

/**
 * Manages subscriptions to real-time queries.
 */
export class SubscriptionManager {
  private _options: SubscriptionManagerOptions
  private _subscriptions: Map<string, Subscription> = new Map()
  private _disposed: boolean = false

  // For deduplication
  private _queryRefCounts: Map<string, number> = new Map()
  private _querySubscriptions: Map<string, Set<string>> = new Map()

  constructor(options: SubscriptionManagerOptions = {}) {
    this._options = options
  }

  /**
   * Subscribe to a query with a callback.
   */
  subscribe<T = unknown>(
    query: string,
    args: unknown,
    callback: SubscriptionCallback<T>,
    options?: SubscriptionOptions
  ): Subscription<T> {
    if (this._disposed) {
      throw new SubscriptionError(
        'Cannot subscribe: SubscriptionManager has been disposed',
        'MANAGER_DISPOSED'
      )
    }

    const id = generateSubscriptionId()
    const subscription = new Subscription<T>(
      id,
      query,
      args,
      callback,
      this,
      options,
      this._options.trackHistory
    )

    this._subscriptions.set(id, subscription as Subscription<unknown>)

    // Handle deduplication tracking
    if (this._options.deduplicateSubscriptions) {
      const queryHash = hashQueryArgs(query, args)

      const currentCount = this._queryRefCounts.get(queryHash) || 0
      this._queryRefCounts.set(queryHash, currentCount + 1)

      if (!this._querySubscriptions.has(queryHash)) {
        this._querySubscriptions.set(queryHash, new Set())
      }
      this._querySubscriptions.get(queryHash)!.add(id)
    }

    // Emit event
    if (this._options.onSubscribe) {
      this._options.onSubscribe(subscription as Subscription<unknown>)
    }

    return subscription
  }

  /**
   * Unsubscribe from a subscription by ID.
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this._subscriptions.get(subscriptionId)
    if (!subscription) {
      return false
    }

    // Close the subscription
    subscription._close()

    // Remove from main map
    this._subscriptions.delete(subscriptionId)

    // Handle deduplication tracking
    if (this._options.deduplicateSubscriptions) {
      const queryHash = hashQueryArgs(subscription.query, subscription.args)

      const currentCount = this._queryRefCounts.get(queryHash) || 0
      if (currentCount > 1) {
        this._queryRefCounts.set(queryHash, currentCount - 1)
      } else {
        this._queryRefCounts.delete(queryHash)
      }

      const subs = this._querySubscriptions.get(queryHash)
      if (subs) {
        subs.delete(subscriptionId)
        if (subs.size === 0) {
          this._querySubscriptions.delete(queryHash)
        }
      }
    }

    // Emit event
    if (this._options.onUnsubscribe) {
      this._options.onUnsubscribe(subscription)
    }

    return true
  }

  /**
   * Update subscription data.
   */
  updateSubscription(subscriptionId: string, data: unknown, options?: UpdateOptions): boolean {
    const subscription = this._subscriptions.get(subscriptionId)
    if (!subscription || subscription.state === SubscriptionState.Closed) {
      return false
    }

    subscription._setData(data, options)

    // Emit event
    if (this._options.onUpdate) {
      this._options.onUpdate(subscription, data)
    }

    return true
  }

  /**
   * Set subscription error.
   */
  setSubscriptionError(subscriptionId: string, error: Error): boolean {
    const subscription = this._subscriptions.get(subscriptionId)
    if (!subscription || subscription.state === SubscriptionState.Closed) {
      return false
    }

    subscription._setError(error)

    // Emit event
    if (this._options.onSubscriptionError) {
      this._options.onSubscriptionError(subscription, error)
    }

    return true
  }

  /**
   * Get all subscriptions, optionally filtered.
   */
  getSubscriptions(filter?: SubscriptionFilter): Subscription[] {
    let subscriptions = Array.from(this._subscriptions.values())

    // Filter out closed subscriptions by default
    subscriptions = subscriptions.filter(s => s.state !== SubscriptionState.Closed)

    if (filter?.query) {
      subscriptions = subscriptions.filter(s => s.query === filter.query)
    }

    if (filter?.state) {
      subscriptions = subscriptions.filter(s => s.state === filter.state)
    }

    return subscriptions
  }

  /**
   * Get subscription by ID.
   */
  getSubscriptionById(subscriptionId: string): Subscription | undefined {
    return this._subscriptions.get(subscriptionId)
  }

  /**
   * Check if a subscription exists.
   */
  hasSubscription(subscriptionId: string): boolean {
    const sub = this._subscriptions.get(subscriptionId)
    return sub !== undefined && sub.state !== SubscriptionState.Closed
  }

  /**
   * Get the count of active subscriptions.
   */
  getSubscriptionCount(): number {
    return this.getSubscriptions().length
  }

  /**
   * Unsubscribe all subscriptions.
   */
  unsubscribeAll(): void {
    for (const subscription of this._subscriptions.values()) {
      subscription._close()

      if (this._options.onUnsubscribe) {
        this._options.onUnsubscribe(subscription)
      }
    }

    this._subscriptions.clear()
    this._queryRefCounts.clear()
    this._querySubscriptions.clear()
  }

  /**
   * Unsubscribe all subscriptions for a specific query.
   */
  unsubscribeByQuery(query: string): number {
    let removed = 0
    const toRemove: string[] = []

    for (const [id, subscription] of this._subscriptions) {
      if (subscription.query === query && subscription.state !== SubscriptionState.Closed) {
        toRemove.push(id)
      }
    }

    for (const id of toRemove) {
      if (this.unsubscribe(id)) {
        removed++
      }
    }

    return removed
  }

  /**
   * Get the reference count for a query (for deduplication).
   */
  getQueryRefCount(query: string, args: unknown): number {
    const queryHash = hashQueryArgs(query, args)
    return this._queryRefCounts.get(queryHash) || 0
  }

  /**
   * Check if a query is still active (has subscriptions).
   */
  hasActiveQuery(query: string, args: unknown): boolean {
    const queryHash = hashQueryArgs(query, args)
    return (this._queryRefCounts.get(queryHash) || 0) > 0
  }

  /**
   * Update all subscriptions for a specific query (for deduplication).
   */
  updateByQuery(query: string, args: unknown, data: unknown): number {
    const queryHash = hashQueryArgs(query, args)
    const subIds = this._querySubscriptions.get(queryHash)

    if (!subIds) {
      return 0
    }

    let updated = 0
    for (const id of subIds) {
      if (this.updateSubscription(id, data)) {
        updated++
      }
    }

    return updated
  }

  /**
   * Dispose the manager and clean up resources.
   */
  dispose(): void {
    if (this._disposed) {
      return
    }

    this.unsubscribeAll()
    this._disposed = true
  }

  /**
   * Convert manager state to JSON.
   */
  toJSON(): SubscriptionManagerJSON {
    const subscriptions = this.getSubscriptions().map(s => s.toJSON())
    return {
      subscriptions,
      count: subscriptions.length,
    }
  }
}
