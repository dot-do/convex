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
 *
 * @module client/http
 */

import type {
  FunctionReference,
  FunctionType,
  FunctionVisibility,
} from '../server/functions/api'

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for requests in milliseconds */
const DEFAULT_TIMEOUT = 30000

/** Default initial delay between retries in milliseconds */
const DEFAULT_RETRY_DELAY = 100

/** Default maximum number of queries in a batch */
const DEFAULT_MAX_BATCH_SIZE = 100

/** API endpoints for different function types */
const API_ENDPOINTS = {
  query: '/api/query',
  mutation: '/api/mutation',
  action: '/api/action',
  batchQuery: '/api/query/batch',
} as const

/** HTTP status codes that should trigger a retry */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

// ============================================================================
// Error Types
// ============================================================================

/**
 * Application-level error from a Convex function.
 *
 * Thrown when a function explicitly throws a ConvexError on the server.
 * The `data` property contains the structured error information passed
 * from the server.
 *
 * @typeParam T - The type of the error data payload
 *
 * @example
 * ```typescript
 * try {
 *   await client.query(api.users.get, { id: "invalid" });
 * } catch (error) {
 *   if (error instanceof ConvexError) {
 *     console.log("Error data:", error.data);
 *     // { code: "NOT_FOUND", message: "User not found" }
 *   }
 * }
 * ```
 */
export class ConvexError<T = string> extends Error {
  /** The structured error data from the server */
  readonly data: T

  /**
   * Creates a new ConvexError instance.
   *
   * @param data - The error data payload from the server
   */
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
 * Retry backoff strategy for failed requests.
 *
 * - `'linear'`: Delay increases linearly (100ms, 200ms, 300ms, ...)
 * - `'exponential'`: Delay doubles each attempt (100ms, 200ms, 400ms, ...)
 */
export type RetryBackoff = 'linear' | 'exponential'

/**
 * Configuration options for creating a ConvexHttpClient.
 *
 * @example
 * ```typescript
 * const options: HttpClientOptions = {
 *   timeout: 60000,
 *   retries: 3,
 *   retryBackoff: 'exponential',
 *   authToken: 'your-jwt-token',
 * };
 *
 * const client = new ConvexHttpClient(url, options);
 * ```
 */
export interface HttpClientOptions {
  /**
   * Custom fetch implementation.
   * Useful for environments without native fetch or for adding middleware.
   */
  fetch?: typeof fetch

  /**
   * Default timeout for requests in milliseconds.
   * @default 30000
   */
  timeout?: number

  /** Initial authentication token for requests */
  authToken?: string

  /**
   * Number of retry attempts for retryable errors.
   * Set to 0 to disable retries.
   * @default 0
   */
  retries?: number

  /**
   * Initial delay between retries in milliseconds.
   * @default 100
   */
  retryDelay?: number

  /**
   * Retry backoff strategy.
   * @default 'linear'
   */
  retryBackoff?: RetryBackoff

  /**
   * Delay before batching concurrent queries in milliseconds.
   * Set to 0 to disable batching.
   * @default 0
   */
  batchDelay?: number

  /**
   * Maximum number of queries in a single batch.
   * @default 100
   */
  maxBatchSize?: number
}

/**
 * Internal representation of a batched query item.
 * @internal
 */
interface BatchItem {
  readonly path: string
  readonly args: unknown
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
}

/**
 * Response format for batch query requests.
 * @internal
 */
interface BatchResponse {
  readonly results: ReadonlyArray<{
    value?: unknown
    error?: string
    errorType?: string
    errorData?: unknown
  }>
}

/**
 * Response format for single query/mutation/action requests.
 * @internal
 */
interface QueryResponse {
  value?: unknown
  error?: string
  errorType?: string
  errorMessage?: string
  errorData?: unknown
}

/**
 * Request body format for function calls.
 * @internal
 */
interface RequestBody {
  readonly path: string
  readonly args: unknown
  readonly format: 'json'
}

/**
 * Request body format for batch queries.
 * @internal
 */
interface BatchRequestBody {
  readonly queries: ReadonlyArray<{
    readonly path: string
    readonly args: unknown
  }>
  readonly format: 'json'
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates and normalizes a deployment URL.
 *
 * @param url - The deployment URL to validate
 * @returns The normalized URL (trailing slash removed)
 * @throws Error if the URL is empty or invalid
 *
 * @internal
 */
function validateAndNormalizeUrl(url: string): string {
  if (!url || url.trim() === '') {
    throw new Error('Deployment URL is required')
  }

  try {
    new URL(url)
  } catch {
    throw new Error(`Invalid deployment URL: ${url}`)
  }

  // Remove trailing slash for consistent URL building
  return url.replace(/\/$/, '')
}

/**
 * Checks if an HTTP status code indicates a retryable error.
 *
 * Retryable status codes include:
 * - 429 (Too Many Requests)
 * - 500 (Internal Server Error)
 * - 502 (Bad Gateway)
 * - 503 (Service Unavailable)
 * - 504 (Gateway Timeout)
 *
 * @param status - The HTTP status code to check
 * @returns True if the status code is retryable
 *
 * @internal
 */
function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status)
}

/**
 * Checks if an error represents a network-level failure.
 *
 * @param error - The error to check
 * @returns True if the error is a network error
 *
 * @internal
 */
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('econnrefused') ||
    message.includes('enotfound')
  )
}

/**
 * Calculates the retry delay based on the attempt number and backoff strategy.
 *
 * @param baseDelay - The initial delay in milliseconds
 * @param attempt - The current attempt number (0-indexed)
 * @param backoff - The backoff strategy to use
 * @returns The delay in milliseconds before the next retry
 *
 * @internal
 */
function calculateRetryDelay(
  baseDelay: number,
  attempt: number,
  backoff: RetryBackoff
): number {
  if (backoff === 'exponential') {
    return baseDelay * Math.pow(2, attempt)
  }
  // Linear backoff: delay increases by baseDelay each attempt
  return baseDelay * (attempt + 1)
}

/**
 * Creates a promise that resolves after a specified duration.
 *
 * @param ms - The duration to sleep in milliseconds
 * @returns A promise that resolves after the specified duration
 *
 * @internal
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Builds the request body for a function call.
 *
 * @param path - The function path
 * @param args - The function arguments
 * @returns The serialized request body
 *
 * @internal
 */
function buildRequestBody(path: string, args: unknown): string {
  const body: RequestBody = {
    path,
    args: args ?? {},
    format: 'json',
  }
  return JSON.stringify(body)
}

/**
 * Builds the request body for a batch query call.
 *
 * @param items - The batch items to include
 * @returns The serialized request body
 *
 * @internal
 */
function buildBatchRequestBody(items: ReadonlyArray<BatchItem>): string {
  const body: BatchRequestBody = {
    queries: items.map((item) => ({
      path: item.path,
      args: item.args,
    })),
    format: 'json',
  }
  return JSON.stringify(body)
}

/**
 * Extracts the function path from a function reference or string.
 *
 * @param fnRef - The function reference or string path
 * @returns The function path string
 *
 * @internal
 */
function extractFunctionPath(
  fnRef: FunctionReference<FunctionType, unknown, unknown, FunctionVisibility> | string
): string {
  return typeof fnRef === 'string' ? fnRef : fnRef._path
}

/**
 * Creates a ConvexError from error response data.
 *
 * @param errorData - The error data from the response
 * @returns A ConvexError instance
 *
 * @internal
 */
function createConvexError(errorData: QueryResponse): ConvexError {
  const data = errorData.errorData ?? errorData.errorMessage ?? 'Unknown error'
  return new ConvexError(data)
}

/**
 * Creates an error from response data.
 *
 * @param errorData - The error data from the response
 * @param status - The HTTP status code
 * @returns An Error instance
 *
 * @internal
 */
function createErrorFromResponse(errorData: QueryResponse, status: number): Error {
  const message = errorData.error ?? errorData.errorMessage ?? `Request failed: ${status}`
  return new Error(message)
}

// ============================================================================
// ConvexHttpClient Implementation
// ============================================================================

/**
 * HTTP-only client for Convex backend functions.
 *
 * Use this client when:
 * - Running on the server (Node.js, Edge functions, serverless)
 * - WebSocket connections are not available or not needed
 * - You don't need real-time subscriptions
 *
 * The client supports queries, mutations, and actions with features like:
 * - Automatic retries with configurable backoff
 * - Request batching for improved performance
 * - Authentication token management
 * - Configurable timeouts
 *
 * @example
 * ```typescript
 * import { ConvexHttpClient } from "convex.do/client";
 *
 * // Create a client
 * const client = new ConvexHttpClient("https://your-deployment.convex.cloud");
 *
 * // Optionally set authentication
 * client.setAuth(authToken);
 *
 * // Execute a query
 * const messages = await client.query(api.messages.list, { channel });
 *
 * // Execute a mutation
 * await client.mutation(api.messages.send, { channel, body: "Hello!" });
 *
 * // Execute an action
 * const result = await client.action(api.ai.generate, { prompt: "..." });
 * ```
 *
 * @example
 * ```typescript
 * // Client with retry configuration
 * const client = new ConvexHttpClient(url, {
 *   retries: 3,
 *   retryDelay: 100,
 *   retryBackoff: 'exponential',
 *   timeout: 60000,
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Client with query batching enabled
 * const client = new ConvexHttpClient(url, {
 *   batchDelay: 10,
 *   maxBatchSize: 50,
 * });
 *
 * // Multiple concurrent queries are batched into a single request
 * const [users, posts, comments] = await Promise.all([
 *   client.query(api.users.list, {}),
 *   client.query(api.posts.list, {}),
 *   client.query(api.comments.list, {}),
 * ]);
 * ```
 */
export class ConvexHttpClient {
  /** The normalized deployment URL */
  readonly url: string

  // Configuration (immutable after construction)
  private readonly _fetch: typeof fetch
  private readonly _timeout: number
  private readonly _retries: number
  private readonly _retryDelay: number
  private readonly _retryBackoff: RetryBackoff
  private readonly _batchDelay: number
  private readonly _maxBatchSize: number

  // Mutable state
  private _authToken: string | null = null
  private _batchQueue: BatchItem[] = []
  private _batchTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Creates a new ConvexHttpClient instance.
   *
   * @param deploymentUrl - The URL of your Convex deployment
   *   (e.g., "https://your-app.convex.cloud")
   * @param options - Optional configuration for the client
   *
   * @throws Error if the deployment URL is empty or invalid
   *
   * @example
   * ```typescript
   * // Basic usage
   * const client = new ConvexHttpClient("https://your-app.convex.cloud");
   *
   * // With options
   * const client = new ConvexHttpClient("https://your-app.convex.cloud", {
   *   timeout: 60000,
   *   authToken: "your-jwt-token",
   *   retries: 3,
   * });
   * ```
   */
  constructor(deploymentUrl: string, options: HttpClientOptions = {}) {
    this.url = validateAndNormalizeUrl(deploymentUrl)

    // Initialize configuration with defaults
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this._timeout = options.timeout ?? DEFAULT_TIMEOUT
    this._authToken = options.authToken ?? null
    this._retries = options.retries ?? 0
    this._retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY
    this._retryBackoff = options.retryBackoff ?? 'linear'
    this._batchDelay = options.batchDelay ?? 0
    this._maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE
  }

  // ==========================================================================
  // Authentication Methods
  // ==========================================================================

  /**
   * Sets the authentication token for subsequent requests.
   *
   * The token will be included as a Bearer token in the Authorization header
   * of all requests made by this client.
   *
   * @param token - The JWT authentication token
   *
   * @example
   * ```typescript
   * // Set authentication after sign-in
   * const authResult = await signIn(credentials);
   * client.setAuth(authResult.token);
   *
   * // Now authenticated requests will work
   * const user = await client.query(api.users.me, {});
   * ```
   */
  setAuth(token: string): void {
    this._authToken = token
  }

  /**
   * Clears the authentication token.
   *
   * After calling this method, requests will be made without authentication.
   * This is safe to call even if no token is currently set.
   *
   * @example
   * ```typescript
   * // Clear authentication on sign-out
   * client.clearAuth();
   * ```
   */
  clearAuth(): void {
    this._authToken = null
  }

  // ==========================================================================
  // Function Execution Methods
  // ==========================================================================

  /**
   * Executes a query function on the Convex backend.
   *
   * Queries are read-only functions that access the database. They do not
   * modify any data and can be cached or retried safely.
   *
   * When batching is enabled (`batchDelay > 0`), multiple concurrent queries
   * will be combined into a single HTTP request for better performance.
   *
   * @typeParam Args - The type of the function arguments
   * @typeParam Returns - The type of the function return value
   *
   * @param query - The query function reference (from `api` object) or string path
   * @param args - The arguments to pass to the function (optional for no-arg queries)
   *
   * @returns A promise that resolves to the query result
   *
   * @throws {ConvexError} When the query throws a ConvexError on the server
   * @throws {Error} On network errors, timeouts, or other failures
   *
   * @example
   * ```typescript
   * // Using function reference (recommended)
   * const user = await client.query(api.users.get, { id: userId });
   *
   * // Using string path
   * const messages = await client.query("messages:list", { channel });
   *
   * // Query with no arguments
   * const count = await client.query(api.stats.getTotalUsers);
   * ```
   */
  async query<Args = unknown, Returns = unknown>(
    query: FunctionReference<'query', Args, Returns, FunctionVisibility> | string,
    args?: Args
  ): Promise<Returns> {
    const path = extractFunctionPath(query)

    // Use batching if enabled
    if (this._batchDelay > 0) {
      return this._batchQuery(path, args ?? {}) as Promise<Returns>
    }

    return this._executeRequest<Returns>(API_ENDPOINTS.query, path, args ?? {})
  }

  /**
   * Executes a mutation function on the Convex backend.
   *
   * Mutations are functions that can read and write to the database.
   * They run in a transaction and are atomic - either all changes
   * commit or none do.
   *
   * @typeParam Args - The type of the function arguments
   * @typeParam Returns - The type of the function return value
   *
   * @param mutation - The mutation function reference (from `api` object) or string path
   * @param args - The arguments to pass to the function (optional for no-arg mutations)
   *
   * @returns A promise that resolves to the mutation result
   *
   * @throws {ConvexError} When the mutation throws a ConvexError on the server
   * @throws {Error} On network errors, timeouts, or other failures
   *
   * @example
   * ```typescript
   * // Create a new record
   * const userId = await client.mutation(api.users.create, {
   *   name: "John Doe",
   *   email: "john@example.com",
   * });
   *
   * // Update a record
   * await client.mutation(api.users.update, {
   *   id: userId,
   *   name: "Jane Doe",
   * });
   *
   * // Delete a record
   * await client.mutation(api.users.delete, { id: userId });
   * ```
   */
  async mutation<Args = unknown, Returns = unknown>(
    mutation: FunctionReference<'mutation', Args, Returns, FunctionVisibility> | string,
    args?: Args
  ): Promise<Returns> {
    const path = extractFunctionPath(mutation)
    return this._executeRequest<Returns>(API_ENDPOINTS.mutation, path, args ?? {})
  }

  /**
   * Executes an action function on the Convex backend.
   *
   * Actions are functions that can perform side effects like calling
   * external APIs, sending emails, or running non-deterministic code.
   * Unlike mutations, actions do not run in a transaction.
   *
   * @typeParam Args - The type of the function arguments
   * @typeParam Returns - The type of the function return value
   *
   * @param action - The action function reference (from `api` object) or string path
   * @param args - The arguments to pass to the function (optional for no-arg actions)
   *
   * @returns A promise that resolves to the action result
   *
   * @throws {ConvexError} When the action throws a ConvexError on the server
   * @throws {Error} On network errors, timeouts, or other failures
   *
   * @example
   * ```typescript
   * // Call an external API
   * const result = await client.action(api.ai.generate, {
   *   prompt: "Write a haiku about programming",
   * });
   *
   * // Upload a file
   * const uploadUrl = await client.action(api.files.getUploadUrl, {});
   *
   * // Send a notification
   * await client.action(api.notifications.send, {
   *   userId,
   *   message: "You have a new message!",
   * });
   * ```
   */
  async action<Args = unknown, Returns = unknown>(
    action: FunctionReference<'action', Args, Returns, FunctionVisibility> | string,
    args?: Args
  ): Promise<Returns> {
    const path = extractFunctionPath(action)
    return this._executeRequest<Returns>(API_ENDPOINTS.action, path, args ?? {})
  }

  // ==========================================================================
  // Private Request Methods
  // ==========================================================================

  /**
   * Executes an HTTP request with retry support.
   *
   * @param endpoint - The API endpoint to call
   * @param path - The function path
   * @param args - The function arguments
   * @param attempt - The current attempt number (for retries)
   * @returns The response value
   *
   * @internal
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
        headers: this._buildHeaders(),
        body: buildRequestBody(path, args),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return this._handleErrorResponse<T>(response, endpoint, path, args, attempt)
      }

      const data = (await response.json()) as QueryResponse
      return data.value as T
    } catch (error) {
      clearTimeout(timeoutId)
      return this._handleRequestError<T>(error, endpoint, path, args, attempt)
    }
  }

  /**
   * Handles error responses from the server.
   *
   * @param response - The HTTP response
   * @param endpoint - The API endpoint that was called
   * @param path - The function path
   * @param args - The function arguments
   * @param attempt - The current attempt number
   * @returns The response value after retry (if applicable)
   *
   * @internal
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
      errorData = (await response.json()) as QueryResponse
    } catch {
      throw new Error(`Request failed: ${response.status}`)
    }

    // Handle ConvexError from the server
    if (errorData.errorType === 'ConvexError') {
      throw createConvexError(errorData)
    }

    // Attempt retry for retryable status codes
    if (attempt < this._retries && isRetryableStatus(response.status)) {
      const delay = calculateRetryDelay(this._retryDelay, attempt, this._retryBackoff)
      await sleep(delay)
      return this._executeRequest<T>(endpoint, path, args, attempt + 1)
    }

    throw createErrorFromResponse(errorData, response.status)
  }

  /**
   * Handles request-level errors (network failures, timeouts, etc.).
   *
   * @param error - The error that occurred
   * @param endpoint - The API endpoint that was called
   * @param path - The function path
   * @param args - The function arguments
   * @param attempt - The current attempt number
   * @returns The response value after retry (if applicable)
   *
   * @internal
   */
  private async _handleRequestError<T>(
    error: unknown,
    endpoint: string,
    path: string,
    args: unknown,
    attempt: number
  ): Promise<T> {
    // Handle timeout (abort)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout')
    }

    // Attempt retry for network errors
    if (attempt < this._retries && isNetworkError(error)) {
      const delay = calculateRetryDelay(this._retryDelay, attempt, this._retryBackoff)
      await sleep(delay)
      return this._executeRequest<T>(endpoint, path, args, attempt + 1)
    }

    throw error
  }

  /**
   * Builds the request headers including authentication if set.
   *
   * @returns The headers object for the request
   *
   * @internal
   */
  private _buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this._authToken) {
      headers['Authorization'] = `Bearer ${this._authToken}`
    }

    return headers
  }

  // ==========================================================================
  // Batching Methods
  // ==========================================================================

  /**
   * Adds a query to the batch queue and returns a promise for its result.
   *
   * @param path - The function path
   * @param args - The function arguments
   * @returns A promise that resolves to the query result
   *
   * @internal
   */
  private _batchQuery(path: string, args: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this._batchQueue.push({ path, args, resolve, reject })

      // Flush immediately if max batch size is reached
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
   * Flushes the current batch of queries, sending them in a single request.
   *
   * @internal
   */
  private async _flushBatch(): Promise<void> {
    // Clear the timer
    if (this._batchTimer !== null) {
      clearTimeout(this._batchTimer)
      this._batchTimer = null
    }

    // Extract and clear the current batch queue
    const batch = this._batchQueue
    this._batchQueue = []

    if (batch.length === 0) {
      return
    }

    try {
      const response = await this._executeBatchRequest(batch)
      this._resolveBatchResults(batch, response)
    } catch (error) {
      this._rejectBatch(batch, error)
    }
  }

  /**
   * Executes a batch request to the server.
   *
   * @param batch - The batch items to send
   * @returns The batch response from the server
   *
   * @internal
   */
  private async _executeBatchRequest(
    batch: ReadonlyArray<BatchItem>
  ): Promise<BatchResponse> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this._timeout)

    try {
      const response = await this._fetch(`${this.url}${API_ENDPOINTS.batchQuery}`, {
        method: 'POST',
        headers: this._buildHeaders(),
        body: buildBatchRequestBody(batch),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error ?? `Batch request failed: ${response.status}`)
      }

      return (await response.json()) as BatchResponse
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * Resolves batch results to their corresponding promises.
   *
   * @param batch - The batch items
   * @param response - The batch response from the server
   *
   * @internal
   */
  private _resolveBatchResults(
    batch: ReadonlyArray<BatchItem>,
    response: BatchResponse
  ): void {
    batch.forEach((item, index) => {
      const result = response.results[index]

      if (result.error || result.errorType) {
        const error =
          result.errorType === 'ConvexError'
            ? new ConvexError(result.errorData ?? result.error ?? 'Unknown error')
            : new Error(result.error ?? 'Unknown error')
        item.reject(error)
      } else {
        item.resolve(result.value)
      }
    })
  }

  /**
   * Rejects all items in a batch with the given error.
   *
   * @param batch - The batch items to reject
   * @param error - The error to reject with
   *
   * @internal
   */
  private _rejectBatch(batch: ReadonlyArray<BatchItem>, error: unknown): void {
    const rejectError =
      error instanceof Error ? error : new Error('Batch request failed')

    batch.forEach((item) => item.reject(rejectError))
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { FunctionReference }
