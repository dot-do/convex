/**
 * Reconnection Logic for convex.do
 *
 * Provides automatic reconnection handling with exponential backoff,
 * jitter, subscription restoration, and network state detection.
 *
 * Bead: convex-936.7
 */

// ============================================================================
// Types
// ============================================================================

/**
 * States that the reconnection manager can be in.
 */
export type ReconnectionState =
  | 'disconnected'
  | 'reconnecting'
  | 'connected'
  | 'failed'
  | 'waiting_for_network'

/**
 * Configuration options for the reconnection manager.
 */
export interface ReconnectionConfig {
  /** Initial delay before first reconnection attempt in milliseconds. Default: 1000 */
  initialDelay?: number
  /** Maximum delay between reconnection attempts in milliseconds. Default: 30000 */
  maxDelay?: number
  /** Maximum number of reconnection attempts. 0 for infinite. Default: 10 */
  maxAttempts?: number
  /** Multiplier for exponential backoff. Default: 2 */
  backoffMultiplier?: number
  /** Jitter factor (0-1) for randomizing delays. Default: 0.1 */
  jitter?: number
  /** Custom network detector function */
  networkDetector?: () => boolean
}

/**
 * Internal configuration with all values set.
 */
interface ResolvedConfig {
  initialDelay: number
  maxDelay: number
  maxAttempts: number
  backoffMultiplier: number
  jitter: number
  networkDetector?: () => boolean
}

/**
 * Status information about the reconnection manager.
 */
export interface ReconnectionStatus {
  /** Current state */
  state: ReconnectionState
  /** Current attempt number (0 if not reconnecting) */
  attempt: number
  /** Milliseconds until next reconnection attempt, or null if not scheduled */
  nextAttemptIn: number | null
  /** Remaining attempts before giving up */
  remainingAttempts: number
  /** Last error that occurred during reconnection */
  lastError: Error | null
  /** Timestamp of last successful connection */
  lastConnectedAt: number | null
  /** Duration connected in milliseconds (if connected) */
  connectedDuration: number | null
  /** Duration disconnected in milliseconds (if disconnected) */
  disconnectedDuration: number | null
}

/**
 * Information about a tracked subscription for restoration.
 */
export interface SubscriptionInfo {
  /** Unique subscription identifier */
  id: string
  /** Path to the query function */
  queryPath: string
  /** Arguments for the query */
  args: unknown
}

// ============================================================================
// ReconnectionManager Class
// ============================================================================

/**
 * Manages automatic reconnection with exponential backoff and jitter.
 *
 * @example
 * ```typescript
 * const manager = new ReconnectionManager({
 *   initialDelay: 1000,
 *   maxDelay: 30000,
 *   maxAttempts: 10,
 *   backoffMultiplier: 2,
 *   jitter: 0.1
 * })
 *
 * manager.onReconnecting = (attempt) => console.log(`Reconnecting... attempt ${attempt}`)
 * manager.onReconnected = () => console.log('Reconnected!')
 * manager.onMaxAttemptsReached = () => console.log('Max attempts reached')
 *
 * manager.scheduleReconnect()
 * ```
 */
export class ReconnectionManager {
  private config: ResolvedConfig
  private state: ReconnectionState = 'disconnected'
  private attemptCount = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private scheduledAt: number | null = null
  private scheduledDelay: number | null = null
  private lastError: Error | null = null
  private lastConnectedAt: number | null = null
  private connectedAt: number | null = null
  private disconnectedAt: number | null = null
  private subscriptions: Map<string, SubscriptionInfo> = new Map()
  private networkAvailable = true
  private connectFn: (() => Promise<boolean>) | null = null
  private wasConnected = false
  private disposed = false

  // Callbacks
  onReconnecting: ((attempt: number) => void) | null = null
  onReconnected: (() => void) | null = null
  onMaxAttemptsReached: ((finalAttempt: number) => void) | null = null
  onDisconnected: (() => void) | null = null
  onStateChange: ((newState: ReconnectionState, oldState: ReconnectionState) => void) | null = null
  onRestoreSubscriptions: ((subscriptions: SubscriptionInfo[]) => void) | null = null

  constructor(config: ReconnectionConfig = {}) {
    this.config = this.resolveConfig(config)
    this.validateConfig(this.config)
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Get the current configuration.
   */
  getConfig(): ResolvedConfig {
    return { ...this.config }
  }

  /**
   * Get the current status of the reconnection manager.
   */
  getStatus(): ReconnectionStatus {
    const now = Date.now()

    let nextAttemptIn: number | null = null
    if (this.scheduledAt !== null && this.scheduledDelay !== null) {
      const elapsed = now - this.scheduledAt
      nextAttemptIn = Math.max(0, this.scheduledDelay - elapsed)
    }

    let connectedDuration: number | null = null
    if (this.state === 'connected' && this.connectedAt !== null) {
      connectedDuration = now - this.connectedAt
    }

    let disconnectedDuration: number | null = null
    if (
      (this.state === 'disconnected' || this.state === 'reconnecting' || this.state === 'waiting_for_network') &&
      this.disconnectedAt !== null
    ) {
      disconnectedDuration = now - this.disconnectedAt
    }

    const remainingAttempts =
      this.config.maxAttempts === 0
        ? Infinity
        : Math.max(0, this.config.maxAttempts - this.attemptCount)

    return {
      state: this.state,
      attempt: this.attemptCount,
      nextAttemptIn,
      remainingAttempts,
      lastError: this.lastError,
      lastConnectedAt: this.lastConnectedAt,
      connectedDuration,
      disconnectedDuration,
    }
  }

  /**
   * Check if currently reconnecting.
   */
  isReconnecting(): boolean {
    return this.state === 'reconnecting'
  }

  /**
   * Check if network is available.
   */
  isNetworkAvailable(): boolean {
    if (this.config.networkDetector) {
      return this.config.networkDetector()
    }
    return this.networkAvailable
  }

  /**
   * Set network availability state.
   */
  setNetworkState(available: boolean): void {
    const wasAvailable = this.networkAvailable
    this.networkAvailable = available

    if (!wasAvailable && available && this.state === 'waiting_for_network') {
      // Network came back, resume reconnection
      this.scheduleReconnect()
    }
  }

  /**
   * Calculate the delay for a given attempt number.
   */
  calculateDelay(attempt: number): number {
    const baseDelay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt - 1)
    const cappedDelay = Math.min(baseDelay, this.config.maxDelay)

    if (this.config.jitter === 0) {
      return cappedDelay
    }

    // Apply jitter: delay * (1 - jitter + random * 2 * jitter)
    const jitterRange = this.config.jitter * cappedDelay
    const jitter = (Math.random() * 2 - 1) * jitterRange
    return Math.round(cappedDelay + jitter)
  }

  /**
   * Schedule a reconnection attempt.
   */
  scheduleReconnect(): void {
    if (this.disposed) return

    // Don't schedule if already scheduled or connected
    if (this.reconnectTimer !== null || this.state === 'connected') {
      return
    }

    // Check if max attempts reached
    if (this.config.maxAttempts > 0 && this.attemptCount >= this.config.maxAttempts) {
      this.setState('failed')
      return
    }

    // Check network availability
    if (!this.isNetworkAvailable()) {
      this.setState('waiting_for_network')
      return
    }

    this.setState('reconnecting')

    const nextAttempt = this.attemptCount + 1
    const delay = this.calculateDelay(nextAttempt)

    this.scheduledAt = Date.now()
    this.scheduledDelay = delay

    this.reconnectTimer = setTimeout(() => {
      if (this.disposed) return

      this.reconnectTimer = null
      this.scheduledAt = null
      this.scheduledDelay = null

      this.attemptCount = nextAttempt

      this.safeCallback(() => this.onReconnecting?.(nextAttempt))
    }, delay)
  }

  /**
   * Cancel a pending reconnection.
   */
  cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.scheduledAt = null
    this.scheduledDelay = null

    if (this.state === 'reconnecting' || this.state === 'waiting_for_network') {
      this.setState('disconnected')
    }
  }

  /**
   * Handle a failed reconnection attempt.
   */
  handleReconnectFailed(error?: Error): void {
    if (error) {
      this.lastError = error
    }

    // Check if max attempts reached
    if (this.config.maxAttempts > 0 && this.attemptCount >= this.config.maxAttempts) {
      this.setState('failed')
      this.safeCallback(() => this.onMaxAttemptsReached?.(this.attemptCount))
    } else {
      this.setState('disconnected')
    }
  }

  /**
   * Mark the connection as established.
   */
  markConnected(): void {
    // Check if we were in reconnecting state before canceling
    const wasReconnecting = this.state === 'reconnecting'

    // Clear timer without changing state
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.scheduledAt = null
    this.scheduledDelay = null

    const now = Date.now()
    this.lastConnectedAt = now
    this.connectedAt = now
    this.disconnectedAt = null
    this.attemptCount = 0
    this.lastError = null

    this.setState('connected')

    // Only call onReconnected if we were actually in reconnecting state
    if (wasReconnecting) {
      this.safeCallback(() => this.onReconnected?.())

      // Restore subscriptions
      const subs = this.getTrackedSubscriptions()
      if (subs.length > 0) {
        this.safeCallback(() => this.onRestoreSubscriptions?.(subs))
      }
    }

    this.wasConnected = true
  }

  /**
   * Mark the connection as lost.
   */
  markDisconnected(): void {
    if (this.state === 'disconnected') return

    this.connectedAt = null
    this.disconnectedAt = Date.now()

    this.setState('disconnected')
    this.safeCallback(() => this.onDisconnected?.())
  }

  /**
   * Manually trigger a reconnection.
   */
  async reconnect(): Promise<boolean> {
    this.cancelReconnect()
    this.attemptCount++

    this.safeCallback(() => this.onReconnecting?.(this.attemptCount))

    if (this.connectFn) {
      try {
        const result = await this.connectFn()
        if (result) {
          this.markConnected()
        }
        return result
      } catch (error) {
        this.handleReconnectFailed(error instanceof Error ? error : new Error(String(error)))
        throw error
      }
    }

    return true
  }

  /**
   * Reset the attempt counter.
   */
  resetAttempts(): void {
    this.attemptCount = 0
    if (this.state === 'failed') {
      this.setState('disconnected')
    }
  }

  /**
   * Set the connect function for manual reconnection.
   */
  setConnectFunction(fn: () => Promise<boolean>): void {
    this.connectFn = fn
  }

  /**
   * Track a subscription for restoration after reconnect.
   */
  trackSubscription(subscription: SubscriptionInfo): void {
    this.subscriptions.set(subscription.id, subscription)
  }

  /**
   * Remove a subscription from tracking.
   */
  untrackSubscription(id: string): void {
    this.subscriptions.delete(id)
  }

  /**
   * Get all tracked subscriptions.
   */
  getTrackedSubscriptions(): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values())
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.disposed = true
    this.cancelReconnect()
    this.subscriptions.clear()
    this.onReconnecting = null
    this.onReconnected = null
    this.onMaxAttemptsReached = null
    this.onDisconnected = null
    this.onStateChange = null
    this.onRestoreSubscriptions = null
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private resolveConfig(config: ReconnectionConfig): ResolvedConfig {
    return {
      initialDelay: config.initialDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      maxAttempts: config.maxAttempts ?? 10,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      jitter: config.jitter ?? 0.1,
      networkDetector: config.networkDetector,
    }
  }

  private validateConfig(config: ResolvedConfig): void {
    if (config.initialDelay < 0) {
      throw new Error('initialDelay must be non-negative')
    }
    if (config.maxDelay < 0) {
      throw new Error('maxDelay must be non-negative')
    }
    if (config.maxAttempts < 0) {
      throw new Error('maxAttempts must be non-negative')
    }
    if (config.backoffMultiplier < 1) {
      throw new Error('backoffMultiplier must be at least 1')
    }
    if (config.jitter < 0) {
      throw new Error('jitter must be non-negative')
    }
    if (config.jitter > 1) {
      throw new Error('jitter must not exceed 1')
    }
    if (config.maxDelay < config.initialDelay) {
      throw new Error('maxDelay must be at least initialDelay')
    }
  }

  private setState(newState: ReconnectionState): void {
    if (this.state !== newState) {
      const oldState = this.state
      this.state = newState
      this.safeCallback(() => this.onStateChange?.(newState, oldState))
    }
  }

  private safeCallback(fn: () => void): void {
    try {
      fn()
    } catch (error) {
      // Swallow callback errors to prevent breaking reconnection logic
      console.error('Callback error:', error)
    }
  }
}
