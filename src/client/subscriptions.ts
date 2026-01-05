/**
 * Client SDK Subscription Management (Layer 7)
 *
 * Provides comprehensive subscription management for the convex.do Client SDK
 * with support for deduplication, caching, pause/resume, and lifecycle events.
 *
 * Features:
 * - SubscriptionManager class for managing multiple subscriptions
 * - createSubscription(queryRef, args, options) - Create a new subscription
 * - removeSubscription(id) - Remove and cleanup subscription
 * - updateSubscription(id, args) - Update subscription arguments
 * - getSubscription(id) - Get subscription by ID
 * - getAllSubscriptions() - List all active subscriptions
 * - pauseSubscription(id) / resumeSubscription(id)
 * - Subscription lifecycle (pending, active, paused, error, completed)
 * - Subscription events (onUpdate, onError, onComplete)
 * - Subscription deduplication (same query + args = shared subscription)
 * - Reference counting for shared subscriptions
 * - Automatic cleanup on disconnect
 * - Query result caching
 *
 * @module client/subscriptions
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Query reference type for subscriptions.
 */
export interface QueryRef {
  _path: string
  _type: 'query'
}

/**
 * Subscription status enum.
 */
export enum SubscriptionStatus {
  /** Subscription created but no data received yet */
  Pending = 'pending',
  /** Subscription is active and receiving updates */
  Active = 'active',
  /** Subscription is paused and not receiving updates */
  Paused = 'paused',
  /** Subscription encountered an error */
  Error = 'error',
  /** Subscription has been completed/removed */
  Completed = 'completed',
}

/**
 * Subscription priority levels.
 */
export type SubscriptionPriority = 'low' | 'normal' | 'high'

/**
 * Options for creating a subscription.
 */
export interface SubscriptionOptions {
  /** Skip calling the callback for the initial data */
  skipInitialCallback?: boolean
  /** Priority level for the subscription */
  priority?: SubscriptionPriority
  /** Callback when data is received */
  onUpdate?: (data: unknown) => void | Promise<void>
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Callback when subscription is completed */
  onComplete?: () => void
}

/**
 * Event handlers for subscriptions.
 */
export interface SubscriptionEventHandlers {
  onUpdate?: (data: unknown) => void | Promise<void>
  onError?: (error: Error) => void
  onComplete?: () => void
}

/**
 * Update options for handleUpdate.
 */
export interface UpdateOptions {
  /** Whether this is the initial data update */
  isInitial?: boolean
}

/**
 * Options for filtering subscriptions.
 */
export interface SubscriptionFilter {
  /** Filter by status */
  status?: SubscriptionStatus
  /** Filter by query path */
  queryPath?: string
}

/**
 * Pending resubscription info.
 */
export interface PendingResubscription {
  queryPath: string
  args: unknown
}

/**
 * JSON representation of a subscription.
 */
export interface ClientSubscriptionJSON {
  id: string
  queryPath: string
  args: unknown
  status: SubscriptionStatus
  data: unknown
  createdAt: number
  updatedAt: number | undefined
  updateCount: number
  errorCount: number
  priority: SubscriptionPriority
}

/**
 * JSON representation of the manager state.
 */
export interface ClientSubscriptionManagerJSON {
  subscriptions: ClientSubscriptionJSON[]
  count: number
  cacheSize: number
  isDisposed: boolean
}

/**
 * Options for the ClientSubscriptionManager.
 */
export interface ClientSubscriptionManagerOptions {
  /** Maximum number of subscriptions allowed */
  maxSubscriptions?: number
  /** Enable deduplication of subscriptions with same query and args */
  enableDeduplication?: boolean
  /** Enable result caching */
  enableCaching?: boolean
  /** Maximum cache size */
  cacheSize?: number
  /** Queue updates while paused */
  queueUpdatesWhilePaused?: boolean
  /** Callback when a subscription is created */
  onSubscriptionCreated?: (subscription: ClientSubscription) => void
  /** Callback when a subscription is removed */
  onSubscriptionRemoved?: (subscription: ClientSubscription) => void
  /** Callback when a subscription receives data */
  onUpdate?: (subscription: ClientSubscription, data: unknown) => void
  /** Callback when a subscription encounters an error */
  onError?: (subscription: ClientSubscription, error: Error) => void
  /** Callback when subscription args change */
  onSubscriptionArgsChange?: (subscription: ClientSubscription, oldArgs: unknown, newArgs: unknown) => void
  /** Callback when query cleanup occurs (ref count reaches zero) */
  onQueryCleanup?: (queryPath: string, args: unknown) => void
  /** Callback when disconnect occurs */
  onDisconnect?: () => void
  /** Callback when reconnect occurs */
  onReconnect?: () => void
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
// Utility Functions
// ============================================================================

/**
 * Generates a unique subscription ID.
 */
function generateSubscriptionId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `csub_${timestamp}_${random}`
}

/**
 * Creates a stable hash for query + args combination.
 */
function hashQueryArgs(queryPath: string, args: unknown): string {
  // Sort object keys for stable hashing
  const sortedArgs = sortObject(args)
  const str = JSON.stringify({ queryPath, args: sortedArgs })
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `${queryPath}:${hash.toString(36)}`
}

/**
 * Recursively sorts object keys for stable comparison.
 */
function sortObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObject)
  }
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {}
    const keys = Object.keys(obj as Record<string, unknown>).sort()
    for (const key of keys) {
      sorted[key] = sortObject((obj as Record<string, unknown>)[key])
    }
    return sorted
  }
  return obj
}

// ============================================================================
// ClientSubscription Class
// ============================================================================

/**
 * Represents a single client subscription to a query.
 */
export class ClientSubscription<T = unknown> {
  /** Unique subscription ID */
  readonly id: string
  /** Query reference */
  readonly queryRef: QueryRef
  /** Creation timestamp */
  readonly createdAt: number

  /** Current subscription status */
  private _status: SubscriptionStatus = SubscriptionStatus.Pending
  /** Current args */
  private _args: unknown
  /** Current data */
  private _data: T | undefined
  /** Current error */
  private _error: Error | undefined
  /** Last update timestamp */
  private _updatedAt: number | undefined
  /** Update count */
  private _updateCount: number = 0
  /** Error count */
  private _errorCount: number = 0
  /** Priority level */
  private _priority: SubscriptionPriority
  /** Event handlers */
  private _handlers: SubscriptionEventHandlers
  /** Whether initial callback was skipped */
  private _initialSkipped: boolean = false
  /** Skip initial callback option */
  private _skipInitialCallback: boolean
  /** Whether data has been received */
  private _hasReceivedData: boolean = false
  /** Reference to the manager */
  private _manager: ClientSubscriptionManager
  /** Queued updates while paused */
  private _queuedUpdates: T[] = []

  constructor(
    id: string,
    queryRef: QueryRef,
    args: unknown,
    manager: ClientSubscriptionManager,
    options?: SubscriptionOptions
  ) {
    this.id = id
    this.queryRef = queryRef
    this._args = args
    this._manager = manager
    this.createdAt = Date.now()
    this._priority = options?.priority ?? 'normal'
    this._skipInitialCallback = options?.skipInitialCallback ?? false
    this._handlers = {
      onUpdate: options?.onUpdate,
      onError: options?.onError,
      onComplete: options?.onComplete,
    }
  }

  // ============================================================================
  // Getters
  // ============================================================================

  get queryPath(): string {
    return this.queryRef._path
  }

  get args(): unknown {
    return this._args
  }

  get status(): SubscriptionStatus {
    return this._status
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

  get updateCount(): number {
    return this._updateCount
  }

  get errorCount(): number {
    return this._errorCount
  }

  get priority(): SubscriptionPriority {
    return this._priority
  }

  get isActive(): boolean {
    return this._status === SubscriptionStatus.Active
  }

  get isPending(): boolean {
    return this._status === SubscriptionStatus.Pending
  }

  get isPaused(): boolean {
    return this._status === SubscriptionStatus.Paused
  }

  get isCompleted(): boolean {
    return this._status === SubscriptionStatus.Completed
  }

  get hasError(): boolean {
    return this._status === SubscriptionStatus.Error
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Remove this subscription.
   */
  remove(): void {
    this._manager.removeSubscription(this.id)
  }

  /**
   * Pause this subscription.
   */
  pause(): boolean {
    return this._manager.pauseSubscription(this.id)
  }

  /**
   * Resume this subscription.
   */
  resume(): boolean {
    return this._manager.resumeSubscription(this.id)
  }

  /**
   * Convert subscription to JSON representation.
   */
  toJSON(): ClientSubscriptionJSON {
    return {
      id: this.id,
      queryPath: this.queryPath,
      args: this._args,
      status: this._status,
      data: this._data,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
      updateCount: this._updateCount,
      errorCount: this._errorCount,
      priority: this._priority,
    }
  }

  // ============================================================================
  // Internal Methods (called by manager)
  // ============================================================================

  /** @internal */
  _setStatus(status: SubscriptionStatus): void {
    this._status = status
  }

  /** @internal */
  _setArgs(args: unknown): void {
    this._args = args
  }

  /** @internal */
  _setData(data: T, options?: UpdateOptions): boolean {
    // Check if we should skip initial callback
    if (options?.isInitial && this._skipInitialCallback && !this._initialSkipped) {
      this._initialSkipped = true
      this._data = data
      this._updatedAt = Date.now()
      this._status = SubscriptionStatus.Active
      this._error = undefined
      this._hasReceivedData = true
      this._updateCount++
      return true
    }

    this._data = data
    this._updatedAt = Date.now()
    this._status = SubscriptionStatus.Active
    this._error = undefined
    this._errorCount = 0
    this._hasReceivedData = true
    this._updateCount++

    // Call callback
    if (this._handlers.onUpdate) {
      try {
        this._handlers.onUpdate(data)
      } catch {
        // Swallow callback errors to prevent breaking the update flow
      }
    }

    return true
  }

  /** @internal */
  _setError(error: Error): void {
    this._error = error
    this._status = SubscriptionStatus.Error
    this._errorCount++

    // Call error callback if provided
    if (this._handlers.onError) {
      try {
        this._handlers.onError(error)
      } catch {
        // Swallow error callback errors
      }
    }
  }

  /** @internal */
  _complete(): void {
    this._status = SubscriptionStatus.Completed

    // Call complete callback if provided
    if (this._handlers.onComplete) {
      try {
        this._handlers.onComplete()
      } catch {
        // Swallow complete callback errors
      }
    }
  }

  /** @internal */
  _pause(): boolean {
    if (this._status === SubscriptionStatus.Paused ||
        this._status === SubscriptionStatus.Completed) {
      return false
    }
    this._status = SubscriptionStatus.Paused
    return true
  }

  /** @internal */
  _resume(): boolean {
    if (this._status !== SubscriptionStatus.Paused) {
      return false
    }
    this._status = this._hasReceivedData ? SubscriptionStatus.Active : SubscriptionStatus.Pending
    return true
  }

  /** @internal */
  _clearData(): void {
    this._data = undefined
    this._hasReceivedData = false
    this._initialSkipped = false
  }

  /** @internal */
  _queueUpdate(data: T): void {
    this._queuedUpdates.push(data)
  }

  /** @internal */
  _flushQueuedUpdates(): void {
    for (const data of this._queuedUpdates) {
      this._setData(data)
    }
    this._queuedUpdates = []
  }

  /** @internal */
  _resetToPending(): void {
    this._status = SubscriptionStatus.Pending
  }

  /** @internal */
  get _hasData(): boolean {
    return this._hasReceivedData
  }
}

// ============================================================================
// ClientSubscriptionManager Class
// ============================================================================

/**
 * Manages client subscriptions with deduplication, caching, and lifecycle support.
 */
export class ClientSubscriptionManager {
  private _options: Required<Omit<ClientSubscriptionManagerOptions,
    'onSubscriptionCreated' | 'onSubscriptionRemoved' | 'onUpdate' | 'onError' |
    'onSubscriptionArgsChange' | 'onQueryCleanup' | 'onDisconnect' | 'onReconnect'>> & {
    onSubscriptionCreated?: (subscription: ClientSubscription) => void
    onSubscriptionRemoved?: (subscription: ClientSubscription) => void
    onUpdate?: (subscription: ClientSubscription, data: unknown) => void
    onError?: (subscription: ClientSubscription, error: Error) => void
    onSubscriptionArgsChange?: (subscription: ClientSubscription, oldArgs: unknown, newArgs: unknown) => void
    onQueryCleanup?: (queryPath: string, args: unknown) => void
    onDisconnect?: () => void
    onReconnect?: () => void
  }
  private _subscriptions: Map<string, ClientSubscription> = new Map()
  private _disposed: boolean = false

  // For deduplication
  private _queryRefCounts: Map<string, number> = new Map()
  private _querySubscriptions: Map<string, Set<string>> = new Map()

  // For caching
  private _cache: Map<string, unknown> = new Map()
  private _cacheOrder: string[] = []

  constructor(options: ClientSubscriptionManagerOptions = {}) {
    this._options = {
      maxSubscriptions: options.maxSubscriptions ?? Infinity,
      enableDeduplication: options.enableDeduplication ?? true,
      enableCaching: options.enableCaching ?? true,
      cacheSize: options.cacheSize ?? 1000,
      queueUpdatesWhilePaused: options.queueUpdatesWhilePaused ?? false,
      onSubscriptionCreated: options.onSubscriptionCreated,
      onSubscriptionRemoved: options.onSubscriptionRemoved,
      onUpdate: options.onUpdate,
      onError: options.onError,
      onSubscriptionArgsChange: options.onSubscriptionArgsChange,
      onQueryCleanup: options.onQueryCleanup,
      onDisconnect: options.onDisconnect,
      onReconnect: options.onReconnect,
    }
  }

  // ============================================================================
  // Configuration Getters
  // ============================================================================

  /**
   * Check if deduplication is enabled.
   */
  isDeduplicationEnabled(): boolean {
    return this._options.enableDeduplication
  }

  /**
   * Check if caching is enabled.
   */
  isCachingEnabled(): boolean {
    return this._options.enableCaching
  }

  // ============================================================================
  // Subscription Management
  // ============================================================================

  /**
   * Create a new subscription.
   */
  createSubscription<T = unknown>(
    queryRef: QueryRef,
    args: unknown,
    options?: SubscriptionOptions
  ): ClientSubscription<T> {
    if (this._disposed) {
      throw new SubscriptionError(
        'Cannot create subscription: ClientSubscriptionManager has been disposed',
        'MANAGER_DISPOSED'
      )
    }

    // Check max subscriptions
    if (this._subscriptions.size >= this._options.maxSubscriptions) {
      throw new SubscriptionError(
        `Cannot create subscription: Maximum subscriptions (${this._options.maxSubscriptions}) exceeded`,
        'MAX_SUBSCRIPTIONS_EXCEEDED'
      )
    }

    const id = generateSubscriptionId()
    const subscription = new ClientSubscription<T>(
      id,
      queryRef,
      args,
      this,
      options
    )

    this._subscriptions.set(id, subscription as ClientSubscription<unknown>)

    // Handle deduplication tracking
    if (this._options.enableDeduplication) {
      const queryHash = hashQueryArgs(queryRef._path, args)

      const currentCount = this._queryRefCounts.get(queryHash) || 0
      this._queryRefCounts.set(queryHash, currentCount + 1)

      if (!this._querySubscriptions.has(queryHash)) {
        this._querySubscriptions.set(queryHash, new Set())
      }
      this._querySubscriptions.get(queryHash)!.add(id)

      // If cache has data for this query, serve it immediately
      if (this._options.enableCaching && this._cache.has(queryHash)) {
        const cachedData = this._cache.get(queryHash) as T
        subscription._setData(cachedData, { isInitial: true })
      }
    }

    // Emit event
    if (this._options.onSubscriptionCreated) {
      this._options.onSubscriptionCreated(subscription as ClientSubscription<unknown>)
    }

    return subscription
  }

  /**
   * Remove a subscription by ID.
   */
  removeSubscription(subscriptionId: string): boolean {
    const subscription = this._subscriptions.get(subscriptionId)
    if (!subscription || subscription.status === SubscriptionStatus.Completed) {
      return false
    }

    // Complete the subscription
    subscription._complete()

    // Remove from main map
    this._subscriptions.delete(subscriptionId)

    // Handle deduplication tracking
    if (this._options.enableDeduplication) {
      const queryHash = hashQueryArgs(subscription.queryPath, subscription.args)

      const currentCount = this._queryRefCounts.get(queryHash) || 0
      if (currentCount > 1) {
        this._queryRefCounts.set(queryHash, currentCount - 1)
      } else {
        this._queryRefCounts.delete(queryHash)
        // Clear cache when last subscription is removed
        if (this._options.enableCaching) {
          this._cache.delete(queryHash)
          const index = this._cacheOrder.indexOf(queryHash)
          if (index !== -1) {
            this._cacheOrder.splice(index, 1)
          }
        }
        // Emit cleanup event
        if (this._options.onQueryCleanup) {
          this._options.onQueryCleanup(subscription.queryPath, subscription.args)
        }
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
    if (this._options.onSubscriptionRemoved) {
      this._options.onSubscriptionRemoved(subscription)
    }

    return true
  }

  /**
   * Update subscription arguments.
   */
  updateSubscription(subscriptionId: string, newArgs: unknown): boolean {
    const subscription = this._subscriptions.get(subscriptionId)
    if (!subscription || subscription.status === SubscriptionStatus.Completed) {
      return false
    }

    const oldArgs = subscription.args
    const oldQueryHash = hashQueryArgs(subscription.queryPath, oldArgs)
    const newQueryHash = hashQueryArgs(subscription.queryPath, newArgs)

    // Update deduplication tracking if args changed
    if (this._options.enableDeduplication && oldQueryHash !== newQueryHash) {
      // Decrement old ref count
      const oldCount = this._queryRefCounts.get(oldQueryHash) || 0
      if (oldCount > 1) {
        this._queryRefCounts.set(oldQueryHash, oldCount - 1)
      } else {
        this._queryRefCounts.delete(oldQueryHash)
      }
      const oldSubs = this._querySubscriptions.get(oldQueryHash)
      if (oldSubs) {
        oldSubs.delete(subscriptionId)
        if (oldSubs.size === 0) {
          this._querySubscriptions.delete(oldQueryHash)
        }
      }

      // Increment new ref count
      const newCount = this._queryRefCounts.get(newQueryHash) || 0
      this._queryRefCounts.set(newQueryHash, newCount + 1)
      if (!this._querySubscriptions.has(newQueryHash)) {
        this._querySubscriptions.set(newQueryHash, new Set())
      }
      this._querySubscriptions.get(newQueryHash)!.add(subscriptionId)
    }

    // Update the subscription
    subscription._setArgs(newArgs)
    subscription._clearData()
    subscription._resetToPending()

    // Emit event
    if (this._options.onSubscriptionArgsChange) {
      this._options.onSubscriptionArgsChange(subscription, oldArgs, newArgs)
    }

    return true
  }

  /**
   * Get a subscription by ID.
   */
  getSubscription(subscriptionId: string): ClientSubscription | undefined {
    const subscription = this._subscriptions.get(subscriptionId)
    if (subscription && subscription.status === SubscriptionStatus.Completed) {
      return undefined
    }
    return subscription
  }

  /**
   * Get all subscriptions, optionally filtered.
   */
  getAllSubscriptions(filter?: SubscriptionFilter): ClientSubscription[] {
    let subscriptions = Array.from(this._subscriptions.values())

    // Filter out completed subscriptions
    subscriptions = subscriptions.filter(s => s.status !== SubscriptionStatus.Completed)

    if (filter?.status) {
      subscriptions = subscriptions.filter(s => s.status === filter.status)
    }

    if (filter?.queryPath) {
      subscriptions = subscriptions.filter(s => s.queryPath === filter.queryPath)
    }

    return subscriptions
  }

  /**
   * Get subscription count.
   */
  getSubscriptionCount(): number {
    return this.getAllSubscriptions().length
  }

  // ============================================================================
  // Pause/Resume
  // ============================================================================

  /**
   * Pause a subscription.
   */
  pauseSubscription(subscriptionId: string): boolean {
    const subscription = this._subscriptions.get(subscriptionId)
    if (!subscription) {
      return false
    }
    return subscription._pause()
  }

  /**
   * Resume a subscription.
   */
  resumeSubscription(subscriptionId: string): boolean {
    const subscription = this._subscriptions.get(subscriptionId)
    if (!subscription) {
      return false
    }
    const result = subscription._resume()
    if (result && this._options.queueUpdatesWhilePaused) {
      subscription._flushQueuedUpdates()
    }
    return result
  }

  // ============================================================================
  // Data Updates
  // ============================================================================

  /**
   * Handle data update for a specific subscription.
   */
  handleUpdate(subscriptionId: string, data: unknown, options?: UpdateOptions): boolean {
    const subscription = this._subscriptions.get(subscriptionId)
    if (!subscription || subscription.status === SubscriptionStatus.Completed) {
      return false
    }

    // Handle paused subscriptions
    if (subscription.status === SubscriptionStatus.Paused) {
      if (this._options.queueUpdatesWhilePaused) {
        subscription._queueUpdate(data)
      }
      return true
    }

    subscription._setData(data, options)

    // Update cache
    if (this._options.enableCaching) {
      const queryHash = hashQueryArgs(subscription.queryPath, subscription.args)
      this._updateCache(queryHash, data)
    }

    // Emit event
    if (this._options.onUpdate) {
      this._options.onUpdate(subscription, data)
    }

    return true
  }

  /**
   * Handle data update for all subscriptions with matching query + args.
   */
  handleQueryUpdate(queryPath: string, args: unknown, data: unknown, options?: UpdateOptions): number {
    if (!this._options.enableDeduplication) {
      return 0
    }

    const queryHash = hashQueryArgs(queryPath, args)
    const subIds = this._querySubscriptions.get(queryHash)

    if (!subIds) {
      return 0
    }

    // Update cache
    if (this._options.enableCaching) {
      this._updateCache(queryHash, data)
    }

    let updated = 0
    for (const id of subIds) {
      const subscription = this._subscriptions.get(id)
      if (subscription && subscription.status !== SubscriptionStatus.Completed) {
        if (subscription.status === SubscriptionStatus.Paused) {
          if (this._options.queueUpdatesWhilePaused) {
            subscription._queueUpdate(data)
          }
        } else {
          subscription._setData(data, options)
          // Emit event
          if (this._options.onUpdate) {
            this._options.onUpdate(subscription, data)
          }
        }
        updated++
      }
    }

    return updated
  }

  /**
   * Handle error for a specific subscription.
   */
  handleError(subscriptionId: string, error: Error): boolean {
    const subscription = this._subscriptions.get(subscriptionId)
    if (!subscription || subscription.status === SubscriptionStatus.Completed) {
      return false
    }

    subscription._setError(error)

    // Emit event
    if (this._options.onError) {
      this._options.onError(subscription, error)
    }

    return true
  }

  // ============================================================================
  // Connection Events
  // ============================================================================

  /**
   * Handle disconnect event.
   */
  handleDisconnect(): void {
    for (const subscription of this._subscriptions.values()) {
      if (subscription.status === SubscriptionStatus.Active ||
          subscription.status === SubscriptionStatus.Error) {
        // Call error handler for active subscriptions
        const error = new SubscriptionError('Connection lost', 'CONNECTION_LOST', subscription.id)
        if (subscription._hasData) {
          subscription._setError(error)
        }
        subscription._resetToPending()
      }
    }

    // Emit disconnect event
    if (this._options.onDisconnect) {
      this._options.onDisconnect()
    }
  }

  /**
   * Handle reconnect event.
   */
  handleReconnect(): void {
    // Emit reconnect event
    if (this._options.onReconnect) {
      this._options.onReconnect()
    }
  }

  /**
   * Get pending resubscriptions for reconnection.
   */
  getPendingResubscriptions(): PendingResubscription[] {
    const pending: PendingResubscription[] = []
    const seen = new Set<string>()

    for (const subscription of this._subscriptions.values()) {
      if (subscription.status === SubscriptionStatus.Completed) {
        continue
      }

      const queryHash = hashQueryArgs(subscription.queryPath, subscription.args)
      if (!seen.has(queryHash)) {
        seen.add(queryHash)
        pending.push({
          queryPath: subscription.queryPath,
          args: subscription.args,
        })
      }
    }

    return pending
  }

  // ============================================================================
  // Reference Counting
  // ============================================================================

  /**
   * Get reference count for a query + args combination.
   */
  getRefCount(queryPath: string, args: unknown): number {
    const queryHash = hashQueryArgs(queryPath, args)
    return this._queryRefCounts.get(queryHash) || 0
  }

  /**
   * Check if a query is still active (has subscriptions).
   */
  hasActiveQuery(queryPath: string, args: unknown): boolean {
    return this.getRefCount(queryPath, args) > 0
  }

  // ============================================================================
  // Caching
  // ============================================================================

  /**
   * Get cached result for a query + args combination.
   */
  getCachedResult(queryPath: string, args: unknown): unknown | undefined {
    if (!this._options.enableCaching) {
      return undefined
    }
    const queryHash = hashQueryArgs(queryPath, args)
    return this._cache.get(queryHash)
  }

  /**
   * Get current cache size.
   */
  getCacheSize(): number {
    return this._cache.size
  }

  /**
   * Clear all cached results.
   */
  clearCache(): void {
    this._cache.clear()
    this._cacheOrder = []
  }

  /**
   * Update cache with new data.
   */
  private _updateCache(queryHash: string, data: unknown): void {
    // Update existing entry
    if (this._cache.has(queryHash)) {
      this._cache.set(queryHash, data)
      // Move to end of order (LRU)
      const index = this._cacheOrder.indexOf(queryHash)
      if (index !== -1) {
        this._cacheOrder.splice(index, 1)
        this._cacheOrder.push(queryHash)
      }
      return
    }

    // Evict if at capacity
    while (this._cache.size >= this._options.cacheSize && this._cacheOrder.length > 0) {
      const oldest = this._cacheOrder.shift()!
      this._cache.delete(oldest)
    }

    // Add new entry
    this._cache.set(queryHash, data)
    this._cacheOrder.push(queryHash)
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Remove all subscriptions.
   */
  removeAllSubscriptions(): void {
    for (const subscription of this._subscriptions.values()) {
      if (subscription.status !== SubscriptionStatus.Completed) {
        subscription._complete()
        if (this._options.onSubscriptionRemoved) {
          this._options.onSubscriptionRemoved(subscription)
        }
      }
    }

    this._subscriptions.clear()
    this._queryRefCounts.clear()
    this._querySubscriptions.clear()
  }

  /**
   * Remove all subscriptions for a specific query path.
   */
  removeByQueryPath(queryPath: string): number {
    const toRemove: string[] = []

    for (const [id, subscription] of this._subscriptions) {
      if (subscription.queryPath === queryPath &&
          subscription.status !== SubscriptionStatus.Completed) {
        toRemove.push(id)
      }
    }

    for (const id of toRemove) {
      this.removeSubscription(id)
    }

    return toRemove.length
  }

  /**
   * Dispose the manager and clean up resources.
   */
  dispose(): void {
    if (this._disposed) {
      return
    }

    this.removeAllSubscriptions()
    this.clearCache()
    this._disposed = true
  }

  /**
   * Convert manager state to JSON.
   */
  toJSON(): ClientSubscriptionManagerJSON {
    const subscriptions = this.getAllSubscriptions().map(s => s.toJSON())
    return {
      subscriptions,
      count: subscriptions.length,
      cacheSize: this._cache.size,
      isDisposed: this._disposed,
    }
  }
}
