/**
 * Request Batching - Layer 7: Client SDK
 *
 * Provides automatic batching of requests to optimize network usage.
 * Supports both HTTP and WebSocket transports.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Types of functions that can be batched.
 */
export type FunctionType = 'query' | 'mutation' | 'action'

/**
 * Transport type for batch execution.
 */
export type TransportType = 'http' | 'websocket'

/**
 * A single request to be batched.
 */
export interface BatchRequest {
  /** Unique request ID */
  id: string
  /** Type of function */
  type: FunctionType
  /** Function path */
  path: string
  /** Function arguments */
  args: Record<string, unknown>
}

/**
 * Result of a single request in a batch.
 */
export interface BatchResult {
  /** Request ID this result corresponds to */
  requestId: string
  /** Whether the request succeeded */
  success: boolean
  /** Result value (if success) */
  value?: unknown
  /** Error message (if failure) */
  error?: string
  /** Error code (if failure) */
  errorCode?: string
  /** Additional error data */
  errorData?: unknown
}

/**
 * Batch execution function.
 */
export type BatchExecutor = (requests: BatchRequest[]) => Promise<BatchResult[]>

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number
  /** Base delay between retries in ms */
  delay: number
  /** Backoff multiplier (default: 1 = no backoff) */
  backoffMultiplier?: number
  /** Function to determine if error is retryable */
  shouldRetry?: (error: Error) => boolean
}

/**
 * Options for creating a RequestBatcher.
 */
export interface BatcherOptions {
  /** Function to execute batched requests */
  executor: BatchExecutor
  /** Delay before flushing batch (0 = next tick) */
  batchDelay?: number
  /** Maximum batch size before automatic flush */
  maxBatchSize?: number
  /** Request timeout in ms */
  timeout?: number
  /** Transport type (for informational purposes) */
  transport?: TransportType
  /** Whether to separate batches by function type */
  separateByType?: boolean
  /** Retry configuration */
  retry?: RetryConfig
  /** Optional name for debugging */
  name?: string
}

/**
 * Options for adding a request to the batch.
 */
export interface AddRequestOptions {
  /** Type of function */
  type: FunctionType
  /** Function path */
  path: string
  /** Function arguments */
  args: Record<string, unknown>
  /** AbortSignal for cancellation */
  signal?: AbortSignal
  /** Whether this is a priority request (bypass batching) */
  priority?: boolean
  /** Request-specific timeout override */
  timeout?: number
}

/**
 * Batch metrics.
 */
export interface BatchMetrics {
  /** Total number of batches executed */
  totalBatches: number
  /** Total number of requests processed */
  totalRequests: number
  /** Average batch size */
  averageBatchSize: number
  /** Average execution time in ms */
  averageExecutionTime: number
  /** Number of errors */
  errorCount: number
  /** Number of cancelled requests */
  cancelledCount: number
}

/**
 * Event types emitted by the batcher.
 */
export interface BatcherEvents {
  batchStart: BatchStartEvent
  batchComplete: BatchCompleteEvent
  batchError: BatchErrorEvent
  requestCancelled: RequestCancelledEvent
}

export interface BatchStartEvent {
  batchId: string
  requestCount: number
}

export interface BatchCompleteEvent {
  batchId: string
  requestCount: number
  duration: number
  successCount: number
  errorCount: number
}

export interface BatchErrorEvent {
  batchId: string
  error: Error
}

export interface RequestCancelledEvent {
  requestId: string
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Base error for batch-related errors.
 */
export class BatchError extends Error {
  code?: string
  data?: unknown

  constructor(message: string, code?: string, data?: unknown) {
    super(message)
    this.name = 'BatchError'
    this.code = code
    this.data = data
    Object.setPrototypeOf(this, BatchError.prototype)
  }
}

/**
 * Error thrown when a request is cancelled.
 */
export class RequestCancelledError extends BatchError {
  constructor(message: string = 'Request was cancelled') {
    super(message, 'CANCELLED')
    this.name = 'RequestCancelledError'
    Object.setPrototypeOf(this, RequestCancelledError.prototype)
  }
}

/**
 * Error thrown when a request times out.
 */
export class BatchTimeoutError extends BatchError {
  constructor(message: string = 'Request timed out') {
    super(message, 'TIMEOUT')
    this.name = 'BatchTimeoutError'
    Object.setPrototypeOf(this, BatchTimeoutError.prototype)
  }
}

// ============================================================================
// Cancellable Promise
// ============================================================================

/**
 * A promise that can be cancelled.
 */
export interface CancellablePromise<T> extends Promise<T> {
  /** Cancel the request */
  cancel(): void
  /** The unique request ID */
  requestId: string
}

/**
 * Create a cancellable promise.
 */
function createCancellablePromise<T>(
  executor: (
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: unknown) => void
  ) => { cancel: () => void; requestId: string }
): CancellablePromise<T> {
  let cancelFn: () => void = () => {}
  let reqId = ''

  const promise = new Promise<T>((resolve, reject) => {
    const result = executor(resolve, reject)
    cancelFn = result.cancel
    reqId = result.requestId
  }) as CancellablePromise<T>

  promise.cancel = cancelFn
  promise.requestId = reqId

  return promise
}

// ============================================================================
// Internal Types
// ============================================================================

interface PendingRequest {
  id: string
  type: FunctionType
  path: string
  args: Record<string, unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  signal?: AbortSignal
  timeout?: number
  cancelled: boolean
  abortHandler?: () => void
  inFlight?: boolean
}

type EventHandler<T> = (event: T) => void

// ============================================================================
// RequestBatcher Implementation
// ============================================================================

/**
 * Batches multiple requests together for efficient execution.
 *
 * @example
 * ```typescript
 * const batcher = new RequestBatcher({
 *   executor: async (requests) => {
 *     const response = await fetch('/batch', {
 *       method: 'POST',
 *       body: JSON.stringify(requests),
 *     });
 *     return response.json();
 *   },
 * });
 *
 * // These will be batched together
 * const result1 = await batcher.add({ type: 'query', path: 'users:get', args: { id: 1 } });
 * const result2 = await batcher.add({ type: 'query', path: 'users:get', args: { id: 2 } });
 * ```
 */
export class RequestBatcher {
  private executor: BatchExecutor
  private batchDelay: number
  private maxBatchSize: number
  private timeout: number
  private separateByType: boolean
  private retry?: RetryConfig
  private name?: string

  private pendingRequests: Map<string, PendingRequest> = new Map()
  private inFlightRequests: Map<string, PendingRequest> = new Map()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private idCounter = 0
  private batchIdCounter = 0

  // Metrics
  private metrics: BatchMetrics = {
    totalBatches: 0,
    totalRequests: 0,
    averageBatchSize: 0,
    averageExecutionTime: 0,
    errorCount: 0,
    cancelledCount: 0,
  }
  private totalExecutionTime = 0

  // Event handlers
  private eventHandlers: {
    [K in keyof BatcherEvents]?: Set<EventHandler<BatcherEvents[K]>>
  } = {}

  constructor(options: BatcherOptions) {
    this.executor = options.executor
    this.batchDelay = options.batchDelay ?? 0
    this.maxBatchSize = options.maxBatchSize ?? 100
    this.timeout = options.timeout ?? 30000
    this.separateByType = options.separateByType ?? false
    this.retry = options.retry
    this.name = options.name
  }

  // ============================================================================
  // Configuration Methods
  // ============================================================================

  /**
   * Set the batch delay.
   */
  setBatchDelay(ms: number): void {
    if (ms < 0) {
      throw new Error('Batch delay cannot be negative')
    }
    this.batchDelay = ms
  }

  /**
   * Get the current batch delay.
   */
  getBatchDelay(): number {
    return this.batchDelay
  }

  /**
   * Set the maximum batch size.
   */
  setBatchSize(size: number): void {
    if (size < 1) {
      throw new Error('Batch size must be at least 1')
    }
    this.maxBatchSize = size

    // Check if we need to flush
    if (this.pendingRequests.size >= size) {
      this.scheduleFlush(true)
    }
  }

  /**
   * Get the current maximum batch size.
   */
  getMaxBatchSize(): number {
    return this.maxBatchSize
  }

  /**
   * Set a new executor.
   */
  setExecutor(executor: BatchExecutor): void {
    this.executor = executor
  }

  // ============================================================================
  // Request Methods
  // ============================================================================

  /**
   * Add a request to the batch.
   */
  add(options: AddRequestOptions): CancellablePromise<unknown> {
    if (this.destroyed) {
      return createCancellablePromise((_, reject) => {
        const id = this.generateRequestId()
        reject(new BatchError('Batcher has been destroyed'))
        return { cancel: () => {}, requestId: id }
      })
    }

    return createCancellablePromise((resolve, reject) => {
      const id = this.generateRequestId()

      const pending: PendingRequest = {
        id,
        type: options.type,
        path: options.path,
        args: options.args,
        resolve,
        reject,
        signal: options.signal,
        timeout: options.timeout,
        cancelled: false,
      }

      // Handle abort signal
      if (options.signal) {
        if (options.signal.aborted) {
          this.metrics.cancelledCount++
          this.emit('requestCancelled', { requestId: id })
          reject(new RequestCancelledError())
          return { cancel: () => {}, requestId: id }
        }

        const abortHandler = () => {
          this.cancelRequest(id)
        }
        options.signal.addEventListener('abort', abortHandler)
        pending.abortHandler = abortHandler
      }

      this.pendingRequests.set(id, pending)

      // Priority requests bypass batching
      if (options.priority) {
        this.executeBatch([pending])
      } else {
        // Check if batch is full
        if (this.pendingRequests.size >= this.maxBatchSize) {
          this.scheduleFlush(true)
        } else {
          this.scheduleFlush()
        }
      }

      return {
        cancel: () => this.cancelRequest(id),
        requestId: id,
      }
    })
  }

  /**
   * Manually flush the pending batch.
   */
  flush(): Promise<void> {
    this.clearFlushTimer()
    return this.executeAllPending()
  }

  // ============================================================================
  // Status Methods
  // ============================================================================

  /**
   * Check if there are pending requests.
   */
  hasPendingRequests(): boolean {
    return this.pendingRequests.size > 0
  }

  /**
   * Get the number of pending requests.
   */
  getPendingCount(): number {
    return this.pendingRequests.size
  }

  // ============================================================================
  // Metrics Methods
  // ============================================================================

  /**
   * Get current metrics.
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics }
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = {
      totalBatches: 0,
      totalRequests: 0,
      averageBatchSize: 0,
      averageExecutionTime: 0,
      errorCount: 0,
      cancelledCount: 0,
    }
    this.totalExecutionTime = 0
  }

  // ============================================================================
  // Event Methods
  // ============================================================================

  /**
   * Add an event listener.
   */
  on<K extends keyof BatcherEvents>(
    event: K,
    handler: EventHandler<BatcherEvents[K]>
  ): void {
    if (!this.eventHandlers[event]) {
      // Use type assertion through unknown to avoid distributive conditional type issues
      ;(this.eventHandlers as Record<K, Set<EventHandler<BatcherEvents[K]>>>)[event] = new Set()
    }
    ;(this.eventHandlers[event] as Set<EventHandler<BatcherEvents[K]>>).add(handler)
  }

  /**
   * Remove an event listener.
   */
  off<K extends keyof BatcherEvents>(
    event: K,
    handler: EventHandler<BatcherEvents[K]>
  ): void {
    ;(this.eventHandlers[event] as Set<EventHandler<BatcherEvents[K]>> | undefined)?.delete(handler)
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Destroy the batcher and cancel all pending requests.
   */
  destroy(): void {
    this.destroyed = true
    this.clearFlushTimer()

    // Cancel all pending requests
    for (const pending of this.pendingRequests.values()) {
      if (!pending.cancelled) {
        pending.cancelled = true
        pending.reject(new RequestCancelledError('Batcher has been destroyed'))
      }
    }
    this.pendingRequests.clear()
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateRequestId(): string {
    return `req_${++this.idCounter}_${Date.now()}`
  }

  private generateBatchId(): string {
    return `batch_${++this.batchIdCounter}_${Date.now()}`
  }

  private cancelRequest(id: string): void {
    const pending = this.pendingRequests.get(id) || this.inFlightRequests.get(id)
    if (pending && !pending.cancelled) {
      pending.cancelled = true
      this.pendingRequests.delete(id)
      this.inFlightRequests.delete(id)

      // Remove abort listener
      if (pending.signal && pending.abortHandler) {
        pending.signal.removeEventListener('abort', pending.abortHandler)
      }

      this.metrics.cancelledCount++
      this.emit('requestCancelled', { requestId: id })
      pending.reject(new RequestCancelledError())
    }
  }

  private scheduleFlush(immediate = false): void {
    if (this.flushTimer) {
      return
    }

    const delay = immediate ? 0 : this.batchDelay
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.executeAllPending()
    }, delay)
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  private async executeAllPending(): Promise<void> {
    const pending = Array.from(this.pendingRequests.values()).filter(
      (p) => !p.cancelled
    )

    if (pending.length === 0) {
      return
    }

    // Remove from pending map
    for (const p of pending) {
      this.pendingRequests.delete(p.id)
    }

    if (this.separateByType) {
      // Group by type
      const byType = new Map<FunctionType, PendingRequest[]>()
      for (const p of pending) {
        const list = byType.get(p.type) || []
        list.push(p)
        byType.set(p.type, list)
      }

      // Execute each type separately
      await Promise.all(
        Array.from(byType.values()).map((requests) => this.executeBatch(requests))
      )
    } else {
      // Execute all together (respecting max batch size)
      const batches: PendingRequest[][] = []
      for (let i = 0; i < pending.length; i += this.maxBatchSize) {
        batches.push(pending.slice(i, i + this.maxBatchSize))
      }

      await Promise.all(batches.map((batch) => this.executeBatch(batch)))
    }
  }

  private async executeBatch(requests: PendingRequest[]): Promise<void> {
    // Filter out cancelled requests
    const activeRequests = requests.filter((r) => !r.cancelled)
    if (activeRequests.length === 0) {
      return
    }

    // Track in-flight requests
    for (const req of activeRequests) {
      req.inFlight = true
      this.inFlightRequests.set(req.id, req)
    }

    const batchId = this.generateBatchId()
    const startTime = Date.now()

    // Emit batch start
    this.emit('batchStart', {
      batchId,
      requestCount: activeRequests.length,
    })

    // Build batch request objects
    const batchRequests: BatchRequest[] = activeRequests.map((r) => ({
      id: r.id,
      type: r.type,
      path: r.path,
      args: r.args,
    }))

    // Set up timeouts
    const timeoutControllers = new Map<string, AbortController>()
    const timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>()

    for (const req of activeRequests) {
      const timeout = req.timeout ?? this.timeout
      const controller = new AbortController()
      timeoutControllers.set(req.id, controller)

      const timer = setTimeout(() => {
        controller.abort()
        // Also reject immediately on timeout
        if (!req.cancelled) {
          req.cancelled = true
          this.inFlightRequests.delete(req.id)
          req.reject(new BatchTimeoutError())
        }
      }, timeout)
      timeoutTimers.set(req.id, timer)
    }

    let successCount = 0
    let errorCount = 0

    try {
      const results = await this.executeWithRetry(batchRequests)

      // Map results to requests
      const resultMap = new Map<string, BatchResult>()
      for (const result of results) {
        resultMap.set(result.requestId, result)
      }

      // Resolve/reject each request
      for (const req of activeRequests) {
        // Clear timeout
        const timer = timeoutTimers.get(req.id)
        if (timer) {
          clearTimeout(timer)
        }

        // Remove from in-flight
        this.inFlightRequests.delete(req.id)

        // Check if cancelled during execution (including timeout)
        if (req.cancelled) {
          continue
        }

        // Check if timed out
        const controller = timeoutControllers.get(req.id)
        if (controller?.signal.aborted) {
          errorCount++
          req.reject(new BatchTimeoutError())
          continue
        }

        const result = resultMap.get(req.id)
        if (!result) {
          errorCount++
          req.reject(new BatchError('Result not found for request'))
          continue
        }

        if (result.success) {
          successCount++
          req.resolve(result.value)
        } else {
          errorCount++
          req.reject(
            new BatchError(result.error || 'Request failed', result.errorCode, result.errorData)
          )
        }
      }

      // Update metrics
      const duration = Date.now() - startTime
      this.updateMetrics(activeRequests.length, duration, false)

      // Emit batch complete
      this.emit('batchComplete', {
        batchId,
        requestCount: activeRequests.length,
        duration,
        successCount,
        errorCount,
      })
    } catch (error) {
      // Clear all timeouts
      for (const timer of timeoutTimers.values()) {
        clearTimeout(timer)
      }

      // Remove all from in-flight
      for (const req of activeRequests) {
        this.inFlightRequests.delete(req.id)
      }

      // Update metrics
      const duration = Date.now() - startTime
      this.updateMetrics(activeRequests.length, duration, true)

      // Emit batch error
      this.emit('batchError', {
        batchId,
        error: error instanceof Error ? error : new Error(String(error)),
      })

      // Reject all requests
      const batchError =
        error instanceof Error
          ? new BatchError(error.message)
          : new BatchError(String(error))

      for (const req of activeRequests) {
        if (!req.cancelled) {
          req.reject(batchError)
        }
      }
    }
  }

  private async executeWithRetry(requests: BatchRequest[]): Promise<BatchResult[]> {
    if (!this.retry) {
      return this.executor(requests)
    }

    const { maxAttempts, delay, backoffMultiplier = 1, shouldRetry } = this.retry
    let lastError: Error | undefined
    let currentDelay = delay

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.executor(requests)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Check if we should retry
        if (shouldRetry && !shouldRetry(lastError)) {
          throw lastError
        }

        // If this was the last attempt, throw
        if (attempt === maxAttempts) {
          throw lastError
        }

        // Wait before retrying
        await this.wait(currentDelay)
        currentDelay *= backoffMultiplier
      }
    }

    throw lastError
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private updateMetrics(batchSize: number, duration: number, isError: boolean): void {
    this.metrics.totalBatches++
    this.metrics.totalRequests += batchSize

    // Update average batch size
    this.metrics.averageBatchSize =
      this.metrics.totalRequests / this.metrics.totalBatches

    // Update average execution time
    this.totalExecutionTime += duration
    this.metrics.averageExecutionTime =
      this.totalExecutionTime / this.metrics.totalBatches

    if (isError) {
      this.metrics.errorCount++
    }
  }

  private emit<K extends keyof BatcherEvents>(event: K, data: BatcherEvents[K]): void {
    const handlers = this.eventHandlers[event]
    if (handlers) {
      for (const handler of handlers) {
        try {
          (handler as EventHandler<BatcherEvents[K]>)(data)
        } catch {
          // Ignore handler errors
        }
      }
    }
  }
}
