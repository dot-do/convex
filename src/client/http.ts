/**
 * ConvexHttpClient - HTTP-only client for Convex
 *
 * Layer 7: Client SDK
 *
 * Provides HTTP-based function calls without real-time subscriptions.
 * For server-side or environments where WebSocket is not available.
 *
 * Features:
 * - Query, mutation, and action execution
 * - Authentication token management
 * - Request timeout configuration
 * - Retry with exponential backoff
 * - Function batching for multiple concurrent calls
 * - Custom fetch implementation support
 * - ConvexError handling
 */

import type {
  FunctionReference,
  FunctionType,
  FunctionVisibility,
} from '../server/functions/api'

// ============================================================================
// Error Types
// ============================================================================

/**
 * Application-level error from a Convex function.
 * Thrown when a function explicitly throws a ConvexError.
 */
export class ConvexError<T = string> extends Error {
  data: T

  constructor(data: T) {
    super(typeof data === 'string' ? data : JSON.stringify(data))
    this.name = 'ConvexError'
    this.data = data
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Retry backoff strategy.
 */
export type RetryBackoff = 'linear' | 'exponential'

/**
 * Options for creating a ConvexHttpClient.
 */
export interface HttpClientOptions {
  /** Custom fetch implementation */
  fetch?: typeof fetch
  /** Default timeout for requests in milliseconds (default: 30000) */
  timeout?: number
  /** Initial authentication token */
  authToken?: string
  /** Number of retry attempts for retryable errors (default: 0) */
  retries?: number
  /** Initial delay between retries in milliseconds (default: 100) */
  retryDelay?: number
  /** Retry backoff strategy (default: 'linear') */
  retryBackoff?: RetryBackoff
  /** Delay before batching concurrent queries in milliseconds (0 = disabled) */
  batchDelay?: number
  /** Maximum number of queries in a batch (default: 100) */
  maxBatchSize?: number
}

/**
 * Internal batch request item.
 */
interface BatchItem {
  path: string
  args: unknown
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

/**
 * Batch response from server.
 */
interface BatchResponse {
  results: Array<{
    value?: unknown
    error?: string
    errorType?: string
    errorData?: unknown
  }>
}

/**
 * Single query response from server.
 */
interface QueryResponse {
  value?: unknown
  error?: string
  errorType?: string
  errorMessage?: string
  errorData?: unknown
}

// ============================================================================
// HTTP Status Code Helpers
// ============================================================================

/**
 * Status codes that should trigger a retry.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

/**
 * Check if an HTTP status code is retryable.
 */
function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status)
}

// ============================================================================
// ConvexHttpClient Implementation
// ============================================================================

/**
 * HTTP-only client for Convex.
 *
 * Use this client when:
 * - Running on the server (Node.js, Edge functions)
 * - WebSocket is not available
 * - You don't need real-time subscriptions
 *
 * @example
 * ```typescript
 * import { ConvexHttpClient } from "convex.do/client";
 *
 * const client = new ConvexHttpClient("https://your-deployment.convex.cloud");
 *
 * // Run a query
 * const messages = await client.query(api.messages.list, { channel });
 *
 * // Run a mutation
 * await client.mutation(api.messages.send, { channel, body: "Hello!" });
 *
 * // Run an action
 * const result = await client.action(api.ai.generate, { prompt: "..." });
 * ```
 */
export class ConvexHttpClient {
  /** The deployment URL */
  readonly url: string

  private readonly _fetch: typeof fetch
  private readonly _timeout: number
  private readonly _retries: number
  private readonly _retryDelay: number
  private readonly _retryBackoff: RetryBackoff
  private readonly _batchDelay: number
  private readonly _maxBatchSize: number

  private _authToken: string | null = null
  private _batchQueue: BatchItem[] = []
  private _batchTimer: ReturnType<typeof setTimeout> | null = null

  constructor(deploymentUrl: string, options: HttpClientOptions = {}) {
    // Validate URL
    if (!deploymentUrl || deploymentUrl.trim() === '') {
      throw new Error('Deployment URL is required')
    }

    // Try to parse URL to validate it
    try {
      new URL(deploymentUrl)
    } catch {
      throw new Error(`Invalid deployment URL: ${deploymentUrl}`)
    }

    // Normalize URL by removing trailing slash
    this.url = deploymentUrl.replace(/\/$/, '')

    // Set options with defaults
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this._timeout = options.timeout ?? 30000
    this._authToken = options.authToken ?? null
    this._retries = options.retries ?? 0
    this._retryDelay = options.retryDelay ?? 100
    this._retryBackoff = options.retryBackoff ?? 'linear'
    this._batchDelay = options.batchDelay ?? 0
    this._maxBatchSize = options.maxBatchSize ?? 100
  }

  // ============================================================================
  // Authentication Methods
  // ============================================================================

  /**
   * Set the authentication token.
   *
   * @param token - The JWT token for authentication
   */
  setAuth(token: string): void {
    this._authToken = token
  }

  /**
   * Clear the authentication token.
   */
  clearAuth(): void {
    this._authToken = null
  }

  // ============================================================================
  // Function Execution Methods
  // ============================================================================

  /**
   * Execute a query function.
   *
   * @param query - The query function reference or string path
   * @param args - The arguments to pass to the function
   * @returns The query result
   *
   * @example
   * ```typescript
   * const user = await client.query(api.users.get, { id: userId });
   * ```
   */
  async query<
    Args = unknown,
    Returns = unknown,
  >(
    query: FunctionReference<'query', Args, Returns, FunctionVisibility> | string,
    args?: Args
  ): Promise<Returns> {
    const path = typeof query === 'string' ? query : query._path

    // Use batching if enabled
    if (this._batchDelay > 0) {
      return this._batchQuery(path, args ?? {}) as Promise<Returns>
    }

    return this._executeRequest<Returns>('/api/query', path, args ?? {})
  }

  /**
   * Execute a mutation function.
   *
   * @param mutation - The mutation function reference or string path
   * @param args - The arguments to pass to the function
   * @returns The mutation result
   *
   * @example
   * ```typescript
   * const result = await client.mutation(api.users.create, { name: "John" });
   * ```
   */
  async mutation<
    Args = unknown,
    Returns = unknown,
  >(
    mutation: FunctionReference<'mutation', Args, Returns, FunctionVisibility> | string,
    args?: Args
  ): Promise<Returns> {
    const path = typeof mutation === 'string' ? mutation : mutation._path
    return this._executeRequest<Returns>('/api/mutation', path, args ?? {})
  }

  /**
   * Execute an action function.
   *
   * @param action - The action function reference or string path
   * @param args - The arguments to pass to the function
   * @returns The action result
   *
   * @example
   * ```typescript
   * const result = await client.action(api.ai.generate, { prompt: "Hello" });
   * ```
   */
  async action<
    Args = unknown,
    Returns = unknown,
  >(
    action: FunctionReference<'action', Args, Returns, FunctionVisibility> | string,
    args?: Args
  ): Promise<Returns> {
    const path = typeof action === 'string' ? action : action._path
    return this._executeRequest<Returns>('/api/action', path, args ?? {})
  }

  // ============================================================================
  // Private Request Methods
  // ============================================================================

  /**
   * Execute a request with retry support.
   */
  private async _executeRequest<T>(
    endpoint: string,
    path: string,
    args: unknown,
    attempt = 0
  ): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this._timeout)

    try {
      const response = await this._fetch(`${this.url}${endpoint}`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify({
          path,
          args: args ?? {},
          format: 'json',
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return this._handleErrorResponse<T>(response, endpoint, path, args, attempt)
      }

      const data = await response.json() as QueryResponse

      // Extract value from response
      return data.value as T
    } catch (error) {
      clearTimeout(timeoutId)

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout')
      }

      // Check if we should retry network errors
      if (attempt < this._retries && this._isNetworkError(error)) {
        const delay = this._calculateRetryDelay(attempt)
        await this._sleep(delay)
        return this._executeRequest<T>(endpoint, path, args, attempt + 1)
      }

      throw error
    }
  }

  /**
   * Handle error responses from the server.
   */
  private async _handleErrorResponse<T>(
    response: Response,
    endpoint: string,
    path: string,
    args: unknown,
    attempt: number
  ): Promise<T> {
    let errorData: QueryResponse

    try {
      errorData = await response.json() as QueryResponse
    } catch {
      throw new Error(`Request failed: ${response.status}`)
    }

    // Check for ConvexError
    if (errorData.errorType === 'ConvexError') {
      throw new ConvexError(errorData.errorData ?? errorData.errorMessage ?? 'Unknown error')
    }

    // Check if we should retry
    if (attempt < this._retries && isRetryableStatus(response.status)) {
      const delay = this._calculateRetryDelay(attempt)
      await this._sleep(delay)
      return this._executeRequest<T>(endpoint, path, args, attempt + 1)
    }

    // Throw appropriate error
    const errorMessage = errorData.error ?? errorData.errorMessage ?? `Request failed: ${response.status}`
    throw new Error(errorMessage)
  }

  /**
   * Check if an error is a network error.
   */
  private _isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    const message = error.message.toLowerCase()
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    )
  }

  /**
   * Calculate retry delay based on attempt and backoff strategy.
   */
  private _calculateRetryDelay(attempt: number): number {
    if (this._retryBackoff === 'exponential') {
      return this._retryDelay * Math.pow(2, attempt)
    }
    return this._retryDelay * (attempt + 1)
  }

  /**
   * Sleep for a given duration.
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get request headers including auth token if set.
   */
  private _getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this._authToken) {
      headers['Authorization'] = `Bearer ${this._authToken}`
    }

    return headers
  }

  // ============================================================================
  // Batching Methods
  // ============================================================================

  /**
   * Add a query to the batch queue.
   */
  private _batchQuery(path: string, args: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this._batchQueue.push({ path, args, resolve, reject })

      // Check if we should flush immediately (max size reached)
      if (this._batchQueue.length >= this._maxBatchSize) {
        this._flushBatch()
        return
      }

      // Schedule batch flush if not already scheduled
      if (this._batchTimer === null) {
        this._batchTimer = setTimeout(() => this._flushBatch(), this._batchDelay)
      }
    })
  }

  /**
   * Flush the current batch of queries.
   */
  private async _flushBatch(): Promise<void> {
    // Clear timer
    if (this._batchTimer !== null) {
      clearTimeout(this._batchTimer)
      this._batchTimer = null
    }

    // Get current batch and clear queue
    const batch = this._batchQueue
    this._batchQueue = []

    if (batch.length === 0) {
      return
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this._timeout)

      const response = await this._fetch(`${this.url}/api/query/batch`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify({
          queries: batch.map((item) => ({
            path: item.path,
            args: item.args,
          })),
          format: 'json',
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json() as { error?: string }
        const error = new Error(errorData.error ?? `Batch request failed: ${response.status}`)
        batch.forEach((item) => item.reject(error))
        return
      }

      const data = await response.json() as BatchResponse

      // Resolve or reject each item based on response
      batch.forEach((item, index) => {
        const result = data.results[index]
        if (result.error || result.errorType) {
          if (result.errorType === 'ConvexError') {
            item.reject(new ConvexError(result.errorData ?? result.error ?? 'Unknown error'))
          } else {
            item.reject(new Error(result.error ?? 'Unknown error'))
          }
        } else {
          item.resolve(result.value)
        }
      })
    } catch (error) {
      // Reject all pending items on failure
      const rejectError = error instanceof Error ? error : new Error('Batch request failed')
      batch.forEach((item) => item.reject(rejectError))
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { FunctionReference }
