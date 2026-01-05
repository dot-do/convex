/**
 * Function Registry for convex.do
 *
 * Provides a singleton registry for storing and looking up registered Convex functions
 * (queries, mutations, actions) and HTTP endpoints.
 *
 * The registry supports:
 * - Registration of functions with path validation
 * - Lookup of functions by path
 * - Listing functions by type and visibility
 * - HTTP endpoint registration with path parameter matching
 * - Module-based bulk registration
 *
 * Bead: convex-2pb - Function Registration and Lookup System
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Function types supported by the registry.
 */
export type FunctionType = 'query' | 'mutation' | 'action'

/**
 * Function visibility levels.
 */
export type FunctionVisibility = 'public' | 'internal'

/**
 * HTTP methods supported by the registry.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'

/**
 * A registered function (query, mutation, or action).
 */
export interface RegisteredFunction {
  readonly _type: FunctionType
  readonly _visibility: FunctionVisibility
  readonly _config: {
    handler: (...args: unknown[]) => unknown | Promise<unknown>
    args?: unknown
    returns?: unknown
  }
}

/**
 * A registered HTTP endpoint.
 */
export interface RegisteredHttpEndpoint {
  readonly _type: 'httpAction'
  readonly _config: {
    path: string
    method: HttpMethod
    handler: (ctx: unknown, request: Request) => Promise<Response>
  }
}

/**
 * Entry for a registered function in the registry.
 */
export interface FunctionEntry {
  /** The registration path */
  path: string
  /** The function type */
  type: FunctionType
  /** The function visibility */
  visibility: FunctionVisibility
  /** The registered function */
  fn: RegisteredFunction
}

/**
 * Entry for a registered HTTP endpoint in the registry.
 */
export interface HttpEndpointEntry {
  /** The HTTP path pattern */
  path: string
  /** The HTTP method */
  method: HttpMethod
  /** The registered endpoint */
  endpoint: RegisteredHttpEndpoint
}

/**
 * Match result for HTTP endpoint with extracted parameters.
 */
export interface HttpEndpointMatch extends HttpEndpointEntry {
  /** Extracted path parameters */
  params: Record<string, string>
}

/**
 * Options for registration methods.
 */
export interface RegistrationOptions {
  /** Force overwrite existing registration */
  force?: boolean
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Error class for function registry errors.
 */
export class FunctionRegistryError extends Error {
  public readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'FunctionRegistryError'
    this.code = code

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FunctionRegistryError)
    }
  }
}

// ============================================================================
// Path Validation
// ============================================================================

/**
 * Regex for validating function paths.
 * Allows alphanumeric characters, underscores, colons, and slashes.
 * Must not start or end with separators, and no consecutive separators.
 */
const FUNCTION_PATH_REGEX = /^[a-zA-Z0-9_]+([:/][a-zA-Z0-9_]+)*$/

/**
 * Regex for validating HTTP paths.
 * Must start with / and can contain path parameters like :id.
 */
const HTTP_PATH_REGEX = /^\/[a-zA-Z0-9_/:.-]*$/

/**
 * Validate a function path.
 */
function validateFunctionPath(path: string): void {
  if (!path || path.trim() === '') {
    throw new FunctionRegistryError('Function path cannot be empty', 'INVALID_PATH')
  }

  const trimmedPath = path.trim()

  if (!FUNCTION_PATH_REGEX.test(trimmedPath)) {
    throw new FunctionRegistryError(
      `Invalid function path: "${path}". Paths must be alphanumeric with underscores, separated by colons or slashes.`,
      'INVALID_PATH'
    )
  }
}

/**
 * Validate an HTTP path.
 */
function validateHttpPath(path: string): void {
  if (!path || path.trim() === '') {
    throw new FunctionRegistryError('HTTP path cannot be empty', 'INVALID_PATH')
  }

  if (!path.startsWith('/')) {
    throw new FunctionRegistryError(
      `Invalid HTTP path: "${path}". HTTP paths must start with "/".`,
      'INVALID_PATH'
    )
  }

  if (!HTTP_PATH_REGEX.test(path)) {
    throw new FunctionRegistryError(
      `Invalid HTTP path: "${path}". HTTP paths must be valid URL paths.`,
      'INVALID_PATH'
    )
  }
}

// ============================================================================
// Function Registry
// ============================================================================

/**
 * Singleton registry for Convex functions and HTTP endpoints.
 *
 * @example
 * ```typescript
 * const registry = FunctionRegistry.getInstance()
 *
 * // Register functions
 * registry.register('users:get', getUserQuery)
 * registry.register('users:create', createUserMutation)
 *
 * // Lookup functions
 * const fn = registry.getFunction('users:get')
 * const queries = registry.listFunctions('query')
 *
 * // HTTP endpoints
 * registry.registerHttpEndpoint('/api/users', 'GET', listUsersEndpoint)
 * const endpoint = registry.getHttpEndpoint('/api/users', 'GET')
 * ```
 */
export class FunctionRegistry implements Iterable<FunctionEntry> {
  private static instance: FunctionRegistry | null = null

  private readonly functionMap: Map<string, FunctionEntry> = new Map()
  private readonly httpEndpoints: Map<string, HttpEndpointEntry> = new Map()

  /**
   * Private constructor to enforce singleton pattern.
   */
  private constructor() {}

  /**
   * Get the singleton instance of the registry.
   */
  public static getInstance(): FunctionRegistry {
    if (!FunctionRegistry.instance) {
      FunctionRegistry.instance = new FunctionRegistry()
    }
    return FunctionRegistry.instance
  }

  /**
   * Reset the singleton instance (for testing purposes).
   */
  public static resetInstance(): void {
    FunctionRegistry.instance = null
  }

  // ==========================================================================
  // Function Registration
  // ==========================================================================

  /**
   * Register a function with the given path.
   *
   * @param path - The function path (e.g., "users:get" or "users/get")
   * @param fn - The registered function
   * @param options - Registration options
   * @returns The registry instance for chaining
   * @throws FunctionRegistryError if path is invalid or already registered
   */
  public register(
    path: string,
    fn: RegisteredFunction,
    options: RegistrationOptions = {}
  ): this {
    validateFunctionPath(path)

    if (this.functionMap.has(path) && !options.force) {
      throw new FunctionRegistryError(
        `Function already registered at path: "${path}". Use { force: true } to overwrite.`,
        'DUPLICATE_PATH'
      )
    }

    const entry: FunctionEntry = {
      path,
      type: fn._type,
      visibility: fn._visibility,
      fn,
    }

    this.functionMap.set(path, entry)
    return this
  }

  /**
   * Get a registered function by path.
   *
   * @param path - The function path
   * @returns The function entry or undefined if not found
   */
  public getFunction(path: string): FunctionEntry | undefined {
    return this.functionMap.get(path)
  }

  /**
   * Check if a function is registered at the given path.
   *
   * @param path - The function path
   * @returns True if a function is registered at the path
   */
  public has(path: string): boolean {
    return this.functionMap.has(path)
  }

  /**
   * Unregister a function at the given path.
   *
   * @param path - The function path
   * @returns True if a function was removed, false if not found
   */
  public unregister(path: string): boolean {
    return this.functionMap.delete(path)
  }

  /**
   * List all registered functions, optionally filtered by type and/or visibility.
   *
   * @param type - Optional function type filter
   * @param visibility - Optional visibility filter
   * @returns Array of function entries
   */
  public listFunctions(type?: FunctionType, visibility?: FunctionVisibility): FunctionEntry[] {
    const entries = Array.from(this.functionMap.values())

    return entries.filter(entry => {
      if (type !== undefined && entry.type !== type) {
        return false
      }
      if (visibility !== undefined && entry.visibility !== visibility) {
        return false
      }
      return true
    })
  }

  // ==========================================================================
  // HTTP Endpoint Registration
  // ==========================================================================

  /**
   * Generate a key for HTTP endpoint storage.
   */
  private httpEndpointKey(path: string, method: HttpMethod): string {
    return `${method}:${path}`
  }

  /**
   * Register an HTTP endpoint.
   *
   * @param path - The HTTP path pattern (e.g., "/api/users/:id")
   * @param method - The HTTP method
   * @param endpoint - The registered HTTP endpoint
   * @param options - Registration options
   * @returns The registry instance for chaining
   * @throws FunctionRegistryError if path is invalid or already registered
   */
  public registerHttpEndpoint(
    path: string,
    method: HttpMethod,
    endpoint: RegisteredHttpEndpoint,
    options: RegistrationOptions = {}
  ): this {
    validateHttpPath(path)

    const key = this.httpEndpointKey(path, method)

    if (this.httpEndpoints.has(key) && !options.force) {
      throw new FunctionRegistryError(
        `HTTP endpoint already registered at ${method} ${path}. Use { force: true } to overwrite.`,
        'DUPLICATE_ENDPOINT'
      )
    }

    const entry: HttpEndpointEntry = {
      path,
      method,
      endpoint,
    }

    this.httpEndpoints.set(key, entry)
    return this
  }

  /**
   * Get a registered HTTP endpoint by exact path and method.
   *
   * @param path - The HTTP path
   * @param method - The HTTP method
   * @returns The endpoint entry or undefined if not found
   */
  public getHttpEndpoint(path: string, method: HttpMethod): HttpEndpointEntry | undefined {
    const key = this.httpEndpointKey(path, method)
    return this.httpEndpoints.get(key)
  }

  /**
   * Check if an HTTP endpoint is registered at the given path and method.
   *
   * @param path - The HTTP path
   * @param method - The HTTP method
   * @returns True if an endpoint is registered
   */
  public hasHttpEndpoint(path: string, method: HttpMethod): boolean {
    const key = this.httpEndpointKey(path, method)
    return this.httpEndpoints.has(key)
  }

  /**
   * Unregister an HTTP endpoint at the given path and method.
   *
   * @param path - The HTTP path
   * @param method - The HTTP method
   * @returns True if an endpoint was removed, false if not found
   */
  public unregisterHttpEndpoint(path: string, method: HttpMethod): boolean {
    const key = this.httpEndpointKey(path, method)
    return this.httpEndpoints.delete(key)
  }

  /**
   * List all registered HTTP endpoints, optionally filtered by method.
   *
   * @param method - Optional HTTP method filter
   * @returns Array of HTTP endpoint entries
   */
  public listHttpEndpoints(method?: HttpMethod): HttpEndpointEntry[] {
    const entries = Array.from(this.httpEndpoints.values())

    if (method === undefined) {
      return entries
    }

    return entries.filter(entry => entry.method === method)
  }

  /**
   * Match an HTTP request path and method to a registered endpoint.
   * Supports path parameters (e.g., "/api/users/:id" matches "/api/users/123").
   *
   * @param requestPath - The actual request path
   * @param method - The HTTP method
   * @returns The matched endpoint with extracted parameters, or undefined if no match
   */
  public matchHttpEndpoint(requestPath: string, method: HttpMethod): HttpEndpointMatch | undefined {
    // First, try exact match
    const exactKey = this.httpEndpointKey(requestPath, method)
    const exactMatch = this.httpEndpoints.get(exactKey)
    if (exactMatch) {
      return {
        ...exactMatch,
        params: {},
      }
    }

    // Then, try pattern matching
    const methodEndpoints = this.listHttpEndpoints(method)

    for (const entry of methodEndpoints) {
      const params = this.matchPath(entry.path, requestPath)
      if (params !== null) {
        return {
          ...entry,
          params,
        }
      }
    }

    return undefined
  }

  /**
   * Match a request path against a pattern path, extracting parameters.
   *
   * @param pattern - The pattern path (e.g., "/api/users/:id")
   * @param requestPath - The actual request path (e.g., "/api/users/123")
   * @returns Extracted parameters or null if no match
   */
  private matchPath(pattern: string, requestPath: string): Record<string, string> | null {
    const patternParts = pattern.split('/').filter(Boolean)
    const requestParts = requestPath.split('/').filter(Boolean)

    if (patternParts.length !== requestParts.length) {
      return null
    }

    const params: Record<string, string> = {}

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]
      const requestPart = requestParts[i]

      if (patternPart.startsWith(':')) {
        // Path parameter
        const paramName = patternPart.slice(1)
        params[paramName] = requestPart
      } else if (patternPart !== requestPart) {
        // Static part doesn't match
        return null
      }
    }

    return params
  }

  // ==========================================================================
  // Module Registration
  // ==========================================================================

  /**
   * Register multiple functions from a module object.
   *
   * @param prefix - The path prefix for all functions in the module
   * @param module - An object containing registered functions
   * @returns The registry instance for chaining
   */
  public registerModule(
    prefix: string,
    module: Record<string, unknown>
  ): this {
    for (const [name, value] of Object.entries(module)) {
      // Check if value is a registered function
      if (this.isRegisteredFunction(value)) {
        const path = `${prefix}:${name}`
        this.register(path, value)
      }
    }
    return this
  }

  /**
   * Check if a value is a registered function.
   */
  private isRegisteredFunction(value: unknown): value is RegisteredFunction {
    if (!value || typeof value !== 'object') {
      return false
    }

    const obj = value as Record<string, unknown>
    return (
      obj._type === 'query' ||
      obj._type === 'mutation' ||
      obj._type === 'action'
    ) && (
      obj._visibility === 'public' ||
      obj._visibility === 'internal'
    ) && (
      typeof obj._config === 'object' &&
      obj._config !== null &&
      typeof (obj._config as Record<string, unknown>).handler === 'function'
    )
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get the number of registered functions.
   */
  public size(): number {
    return this.functionMap.size
  }

  /**
   * Get the number of registered HTTP endpoints.
   */
  public httpEndpointCount(): number {
    return this.httpEndpoints.size
  }

  /**
   * Clear all registered functions and HTTP endpoints.
   */
  public clear(): void {
    this.functionMap.clear()
    this.httpEndpoints.clear()
  }

  // ==========================================================================
  // Iteration Support
  // ==========================================================================

  /**
   * Iterate over all registered functions.
   */
  public [Symbol.iterator](): Iterator<FunctionEntry> {
    return this.functionMap.values()
  }

  /**
   * Get entries as [path, entry] pairs.
   */
  public entries(): IterableIterator<[string, FunctionEntry]> {
    return this.functionMap.entries()
  }

  /**
   * Get all registered paths.
   */
  public paths(): IterableIterator<string> {
    return this.functionMap.keys()
  }

  /**
   * Get all registered functions (without path information).
   */
  public *functions(): IterableIterator<RegisteredFunction> {
    for (const entry of this.functionMap.values()) {
      yield entry.fn
    }
  }
}
