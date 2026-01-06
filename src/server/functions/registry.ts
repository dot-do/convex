/**
 * Function Registry for convex.do
 *
 * Provides a singleton registry for storing and looking up registered Convex functions
 * (queries, mutations, actions) and HTTP endpoints.
 *
 * Features:
 * - Singleton pattern for global function registration
 * - Registration of functions with path validation
 * - Lookup of functions by path
 * - Listing functions by type and visibility
 * - HTTP endpoint registration with path parameter matching
 * - Module-based bulk registration
 * - Iteration support for traversing registered functions
 *
 * Bead: convex-2pb - Function Registration and Lookup System
 *
 * @module
 */

import { type FunctionType, type FunctionVisibility } from './shared'

// Re-export for backwards compatibility
export { type FunctionType, type FunctionVisibility }

/**
 * HTTP methods supported by the registry.
 *
 * Supports all standard HTTP methods for REST API endpoints.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'

// ============================================================================
// Core Types - Registered Functions
// ============================================================================

/**
 * A registered function (query, mutation, or action).
 *
 * Contains the function metadata and handler configuration.
 */
export interface RegisteredFunction {
  /** The function type identifier */
  readonly _type: FunctionType
  /** The visibility level */
  readonly _visibility: FunctionVisibility
  /** The function configuration */
  readonly _config: {
    /** The function handler */
    handler: (...args: unknown[]) => unknown | Promise<unknown>
    /** Optional argument validator/type */
    args?: unknown
    /** Optional return type validator */
    returns?: unknown
  }
}

/**
 * A registered HTTP endpoint.
 *
 * Contains the HTTP action configuration including path, method, and handler.
 */
export interface RegisteredHttpEndpoint {
  /** Type identifier for HTTP actions */
  readonly _type: 'httpAction'
  /** The HTTP endpoint configuration */
  readonly _config: {
    /** The HTTP path pattern */
    path: string
    /** The HTTP method */
    method: HttpMethod
    /** The request handler function */
    handler: (ctx: unknown, request: Request) => Promise<Response>
  }
}

// ============================================================================
// Core Types - Registry Entries
// ============================================================================

/**
 * Entry for a registered function in the registry.
 *
 * Combines the function with its registration metadata.
 */
export interface FunctionEntry {
  /** The registration path (e.g., 'users:get') */
  readonly path: string
  /** The function type */
  readonly type: FunctionType
  /** The function visibility */
  readonly visibility: FunctionVisibility
  /** The registered function */
  readonly fn: RegisteredFunction
}

/**
 * Entry for a registered HTTP endpoint in the registry.
 *
 * Combines the endpoint with its path and method information.
 */
export interface HttpEndpointEntry {
  /** The HTTP path pattern (e.g., '/api/users/:id') */
  readonly path: string
  /** The HTTP method */
  readonly method: HttpMethod
  /** The registered endpoint */
  readonly endpoint: RegisteredHttpEndpoint
}

/**
 * Match result for HTTP endpoint with extracted path parameters.
 *
 * Extends HttpEndpointEntry with extracted parameter values from the request path.
 */
export interface HttpEndpointMatch extends HttpEndpointEntry {
  /** Extracted path parameters (e.g., { id: '123' }) */
  readonly params: Record<string, string>
}

/**
 * Options for registration methods.
 *
 * Controls registration behavior such as overwrite handling.
 */
export interface RegistrationOptions {
  /** Force overwrite existing registration (default: false) */
  readonly force?: boolean
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Error class for function registry errors.
 *
 * Provides structured error information with optional error codes
 * for programmatic error handling.
 *
 * @example
 * ```typescript
 * throw new FunctionRegistryError(
 *   'Function already registered at path: "users:get"',
 *   'DUPLICATE_PATH'
 * )
 * ```
 */
export class FunctionRegistryError extends Error {
  /**
   * Optional error code for programmatic handling.
   *
   * Common codes:
   * - `INVALID_PATH` - Path format is invalid
   * - `DUPLICATE_PATH` - Path is already registered
   * - `DUPLICATE_ENDPOINT` - HTTP endpoint is already registered
   */
  public readonly code?: string

  /**
   * Create a new FunctionRegistryError.
   *
   * @param message - Human-readable error message
   * @param code - Optional error code for programmatic handling
   */
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
// Path Validation - Constants
// ============================================================================

/**
 * Regular expression for validating function paths.
 *
 * Valid patterns:
 * - Alphanumeric characters and underscores
 * - Separated by colons or forward slashes
 * - Must not start or end with separators
 * - No consecutive separators allowed
 *
 * Examples: 'users:get', 'api:users:list', 'users/get'
 *
 * @internal
 */
const FUNCTION_PATH_REGEX = /^[a-zA-Z0-9_]+([:/][a-zA-Z0-9_]+)*$/

/**
 * Regular expression for validating HTTP paths.
 *
 * Valid patterns:
 * - Must start with forward slash
 * - Can contain alphanumeric characters, underscores, colons, dots, and hyphens
 * - Supports path parameters (e.g., :id)
 *
 * Examples: '/api/users', '/api/users/:id', '/webhooks/stripe'
 *
 * @internal
 */
const HTTP_PATH_REGEX = /^\/[a-zA-Z0-9_/:.-]*$/

// ============================================================================
// Path Validation - Functions
// ============================================================================

/**
 * Validate a function path format.
 *
 * Ensures the path follows the required format for function registration.
 *
 * @param path - The function path to validate
 * @throws FunctionRegistryError if the path is invalid
 *
 * @internal
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
 * Validate an HTTP path format.
 *
 * Ensures the path follows the required format for HTTP endpoint registration.
 *
 * @param path - The HTTP path to validate
 * @throws FunctionRegistryError if the path is invalid
 *
 * @internal
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
// Type Guards - Internal Helpers
// ============================================================================

/**
 * Type guard to check if a value is a RegisteredFunction.
 *
 * Validates that the value has the required structure and properties
 * of a registered function.
 *
 * @param value - The value to check
 * @returns True if the value is a RegisteredFunction
 *
 * @internal
 */
function isRegisteredFunction(value: unknown): value is RegisteredFunction {
  if (!value || typeof value !== 'object') {
    return false
  }

  const obj = value as Record<string, unknown>

  // Check function type
  const hasValidType = obj._type === 'query' || obj._type === 'mutation' || obj._type === 'action'

  // Check visibility
  const hasValidVisibility = obj._visibility === 'public' || obj._visibility === 'internal'

  // Check config with handler
  const hasValidConfig = typeof obj._config === 'object' &&
    obj._config !== null &&
    typeof (obj._config as Record<string, unknown>).handler === 'function'

  return hasValidType && hasValidVisibility && hasValidConfig
}

// ============================================================================
// HTTP Endpoint Matching - Internal Helpers
// ============================================================================

/**
 * Generate a storage key for HTTP endpoint lookup.
 *
 * Combines method and path into a unique key for Map storage.
 *
 * @param path - The HTTP path
 * @param method - The HTTP method
 * @returns A unique key string
 *
 * @internal
 */
function createHttpEndpointKey(path: string, method: HttpMethod): string {
  return `${method}:${path}`
}

/**
 * Match a request path against a pattern path and extract parameters.
 *
 * Compares path segments and extracts values for parameter segments
 * (segments starting with ':').
 *
 * @param pattern - The pattern path (e.g., '/api/users/:id')
 * @param requestPath - The actual request path (e.g., '/api/users/123')
 * @returns Extracted parameters or null if no match
 *
 * @example
 * ```typescript
 * matchPathPattern('/api/users/:id', '/api/users/123')
 * // => { id: '123' }
 *
 * matchPathPattern('/api/users/:id', '/api/products/123')
 * // => null
 * ```
 *
 * @internal
 */
function matchPathPattern(pattern: string, requestPath: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const requestParts = requestPath.split('/').filter(Boolean)

  // Different segment counts means no match
  if (patternParts.length !== requestParts.length) {
    return null
  }

  const params: Record<string, string> = {}

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]
    const requestPart = requestParts[i]

    if (patternPart.startsWith(':')) {
      // Path parameter - extract the value
      const paramName = patternPart.slice(1)
      params[paramName] = requestPart
    } else if (patternPart !== requestPart) {
      // Static segment doesn't match
      return null
    }
  }

  return params
}

// ============================================================================
// Function Entry Creation - Internal Helper
// ============================================================================

/**
 * Create a FunctionEntry from registration data.
 *
 * Builds a complete function entry object for storage in the registry.
 *
 * @param path - The registration path
 * @param fn - The registered function
 * @returns A complete FunctionEntry object
 *
 * @internal
 */
function createFunctionEntry(path: string, fn: RegisteredFunction): FunctionEntry {
  return {
    path,
    type: fn._type,
    visibility: fn._visibility,
    fn,
  }
}

/**
 * Create an HttpEndpointEntry from registration data.
 *
 * Builds a complete HTTP endpoint entry for storage in the registry.
 *
 * @param path - The HTTP path
 * @param method - The HTTP method
 * @param endpoint - The registered endpoint
 * @returns A complete HttpEndpointEntry object
 *
 * @internal
 */
function createHttpEndpointEntry(
  path: string,
  method: HttpMethod,
  endpoint: RegisteredHttpEndpoint
): HttpEndpointEntry {
  return {
    path,
    method,
    endpoint,
  }
}

// ============================================================================
// Function Registry - Main Class
// ============================================================================

/**
 * Singleton registry for Convex functions and HTTP endpoints.
 *
 * Provides centralized storage and lookup for all registered functions,
 * supporting both standard Convex functions (queries, mutations, actions)
 * and HTTP endpoints.
 *
 * The registry uses the singleton pattern to ensure a single global instance
 * is shared across the application. Use `getInstance()` to access the registry.
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
 *
 * // Iterate over all functions
 * for (const entry of registry) {
 *   console.log(`${entry.path}: ${entry.type}`)
 * }
 * ```
 */
export class FunctionRegistry implements Iterable<FunctionEntry> {
  /**
   * The singleton instance.
   * @internal
   */
  private static instance: FunctionRegistry | null = null

  /**
   * Storage for registered functions.
   * @internal
   */
  private readonly functionMap: Map<string, FunctionEntry> = new Map()

  /**
   * Storage for registered HTTP endpoints.
   * @internal
   */
  private readonly httpEndpoints: Map<string, HttpEndpointEntry> = new Map()

  /**
   * Private constructor to enforce singleton pattern.
   *
   * Use `FunctionRegistry.getInstance()` to access the registry.
   */
  private constructor() {}

  // ==========================================================================
  // Singleton Methods
  // ==========================================================================

  /**
   * Get the singleton instance of the registry.
   *
   * Creates the instance on first call, returns the existing instance thereafter.
   *
   * @returns The singleton FunctionRegistry instance
   *
   * @example
   * ```typescript
   * const registry = FunctionRegistry.getInstance()
   * registry.register('users:get', getUserQuery)
   * ```
   */
  public static getInstance(): FunctionRegistry {
    if (!FunctionRegistry.instance) {
      FunctionRegistry.instance = new FunctionRegistry()
    }
    return FunctionRegistry.instance
  }

  /**
   * Reset the singleton instance.
   *
   * Clears the current instance, causing the next `getInstance()` call
   * to create a fresh registry. Primarily used for testing.
   *
   * @example
   * ```typescript
   * // In test setup/teardown
   * beforeEach(() => {
   *   FunctionRegistry.resetInstance()
   * })
   * ```
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
   * Adds a function to the registry, making it available for lookup.
   * The path must be unique unless the `force` option is used.
   *
   * @param path - The function path (e.g., 'users:get' or 'users/get')
   * @param fn - The registered function to store
   * @param options - Registration options (e.g., { force: true } to overwrite)
   * @returns The registry instance for method chaining
   * @throws FunctionRegistryError if path is invalid or already registered
   *
   * @example
   * ```typescript
   * registry
   *   .register('users:get', getUserQuery)
   *   .register('users:create', createUserMutation)
   *   .register('users:list', listUsersQuery)
   *
   * // Force overwrite existing registration
   * registry.register('users:get', newGetUserQuery, { force: true })
   * ```
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

    const entry = createFunctionEntry(path, fn)
    this.functionMap.set(path, entry)

    return this
  }

  /**
   * Get a registered function by path.
   *
   * Looks up a function in the registry by its registration path.
   *
   * @param path - The function path to look up
   * @returns The function entry, or undefined if not found
   *
   * @example
   * ```typescript
   * const entry = registry.getFunction('users:get')
   * if (entry) {
   *   console.log(`Type: ${entry.type}, Visibility: ${entry.visibility}`)
   *   const result = await entry.fn._config.handler(ctx, args)
   * }
   * ```
   */
  public getFunction(path: string): FunctionEntry | undefined {
    return this.functionMap.get(path)
  }

  /**
   * Check if a function is registered at the given path.
   *
   * @param path - The function path to check
   * @returns True if a function is registered at the path
   *
   * @example
   * ```typescript
   * if (registry.has('users:get')) {
   *   console.log('User query is registered')
   * }
   * ```
   */
  public has(path: string): boolean {
    return this.functionMap.has(path)
  }

  /**
   * Unregister a function at the given path.
   *
   * Removes a function from the registry. Has no effect if the path
   * is not registered.
   *
   * @param path - The function path to unregister
   * @returns True if a function was removed, false if not found
   *
   * @example
   * ```typescript
   * const wasRemoved = registry.unregister('users:deprecated')
   * ```
   */
  public unregister(path: string): boolean {
    return this.functionMap.delete(path)
  }

  /**
   * List all registered functions with optional filtering.
   *
   * Returns an array of function entries, optionally filtered by
   * type and/or visibility.
   *
   * @param type - Optional function type filter ('query' | 'mutation' | 'action')
   * @param visibility - Optional visibility filter ('public' | 'internal')
   * @returns Array of matching function entries
   *
   * @example
   * ```typescript
   * // Get all functions
   * const all = registry.listFunctions()
   *
   * // Get only queries
   * const queries = registry.listFunctions('query')
   *
   * // Get public mutations
   * const publicMutations = registry.listFunctions('mutation', 'public')
   *
   * // Get internal functions of any type
   * const internal = registry.listFunctions(undefined, 'internal')
   * ```
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
   * Register an HTTP endpoint.
   *
   * Adds an HTTP endpoint to the registry for the specified path and method.
   * Each path+method combination must be unique unless the `force` option is used.
   *
   * @param path - The HTTP path pattern (e.g., '/api/users/:id')
   * @param method - The HTTP method (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD)
   * @param endpoint - The registered HTTP endpoint
   * @param options - Registration options (e.g., { force: true } to overwrite)
   * @returns The registry instance for method chaining
   * @throws FunctionRegistryError if path is invalid or already registered
   *
   * @example
   * ```typescript
   * registry
   *   .registerHttpEndpoint('/api/users', 'GET', listUsersEndpoint)
   *   .registerHttpEndpoint('/api/users', 'POST', createUserEndpoint)
   *   .registerHttpEndpoint('/api/users/:id', 'GET', getUserEndpoint)
   *   .registerHttpEndpoint('/api/users/:id', 'PUT', updateUserEndpoint)
   *   .registerHttpEndpoint('/api/users/:id', 'DELETE', deleteUserEndpoint)
   * ```
   */
  public registerHttpEndpoint(
    path: string,
    method: HttpMethod,
    endpoint: RegisteredHttpEndpoint,
    options: RegistrationOptions = {}
  ): this {
    validateHttpPath(path)

    const key = createHttpEndpointKey(path, method)

    if (this.httpEndpoints.has(key) && !options.force) {
      throw new FunctionRegistryError(
        `HTTP endpoint already registered at ${method} ${path}. Use { force: true } to overwrite.`,
        'DUPLICATE_ENDPOINT'
      )
    }

    const entry = createHttpEndpointEntry(path, method, endpoint)
    this.httpEndpoints.set(key, entry)

    return this
  }

  /**
   * Get a registered HTTP endpoint by exact path and method.
   *
   * Performs exact match lookup - does not match path parameters.
   * Use `matchHttpEndpoint` for parameter matching.
   *
   * @param path - The HTTP path
   * @param method - The HTTP method
   * @returns The endpoint entry, or undefined if not found
   *
   * @example
   * ```typescript
   * const entry = registry.getHttpEndpoint('/api/users', 'GET')
   * if (entry) {
   *   const response = await entry.endpoint._config.handler(ctx, request)
   * }
   * ```
   */
  public getHttpEndpoint(path: string, method: HttpMethod): HttpEndpointEntry | undefined {
    const key = createHttpEndpointKey(path, method)
    return this.httpEndpoints.get(key)
  }

  /**
   * Check if an HTTP endpoint is registered at the given path and method.
   *
   * @param path - The HTTP path
   * @param method - The HTTP method
   * @returns True if an endpoint is registered
   *
   * @example
   * ```typescript
   * if (registry.hasHttpEndpoint('/api/users', 'GET')) {
   *   console.log('GET /api/users is registered')
   * }
   * ```
   */
  public hasHttpEndpoint(path: string, method: HttpMethod): boolean {
    const key = createHttpEndpointKey(path, method)
    return this.httpEndpoints.has(key)
  }

  /**
   * Unregister an HTTP endpoint at the given path and method.
   *
   * @param path - The HTTP path
   * @param method - The HTTP method
   * @returns True if an endpoint was removed, false if not found
   *
   * @example
   * ```typescript
   * registry.unregisterHttpEndpoint('/api/deprecated', 'GET')
   * ```
   */
  public unregisterHttpEndpoint(path: string, method: HttpMethod): boolean {
    const key = createHttpEndpointKey(path, method)
    return this.httpEndpoints.delete(key)
  }

  /**
   * List all registered HTTP endpoints with optional method filtering.
   *
   * @param method - Optional HTTP method filter
   * @returns Array of matching HTTP endpoint entries
   *
   * @example
   * ```typescript
   * // Get all endpoints
   * const all = registry.listHttpEndpoints()
   *
   * // Get only GET endpoints
   * const getEndpoints = registry.listHttpEndpoints('GET')
   * ```
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
   *
   * Supports path parameters (e.g., '/api/users/:id' matches '/api/users/123').
   * Prefers exact matches over parameterized matches.
   *
   * @param requestPath - The actual request path
   * @param method - The HTTP method
   * @returns The matched endpoint with extracted parameters, or undefined if no match
   *
   * @example
   * ```typescript
   * // With endpoint registered at '/api/users/:id'
   * const match = registry.matchHttpEndpoint('/api/users/123', 'GET')
   * if (match) {
   *   console.log(match.path)    // '/api/users/:id'
   *   console.log(match.params)  // { id: '123' }
   * }
   * ```
   */
  public matchHttpEndpoint(requestPath: string, method: HttpMethod): HttpEndpointMatch | undefined {
    // First, try exact match
    const exactKey = createHttpEndpointKey(requestPath, method)
    const exactMatch = this.httpEndpoints.get(exactKey)

    if (exactMatch) {
      return {
        ...exactMatch,
        params: {},
      }
    }

    // Then, try pattern matching against all endpoints with this method
    const methodEndpoints = this.listHttpEndpoints(method)

    for (const entry of methodEndpoints) {
      const params = matchPathPattern(entry.path, requestPath)
      if (params !== null) {
        return {
          ...entry,
          params,
        }
      }
    }

    return undefined
  }

  // ==========================================================================
  // Module Registration
  // ==========================================================================

  /**
   * Register multiple functions from a module object.
   *
   * Iterates over the module's exports and registers all valid
   * RegisteredFunction values with paths prefixed by the given prefix.
   *
   * Non-function exports (strings, numbers, objects, etc.) are ignored.
   *
   * @param prefix - The path prefix for all functions in the module
   * @param module - An object containing registered functions
   * @returns The registry instance for method chaining
   *
   * @example
   * ```typescript
   * // users.ts
   * export const getUser = query({ handler: ... })
   * export const createUser = mutation({ handler: ... })
   * export const VERSION = '1.0.0' // Ignored - not a function
   *
   * // Registration
   * import * as usersModule from './users'
   * registry.registerModule('users', usersModule)
   *
   * // Results in:
   * // 'users:getUser' -> getUser query
   * // 'users:createUser' -> createUser mutation
   * ```
   */
  public registerModule(
    prefix: string,
    module: Record<string, unknown>
  ): this {
    for (const [name, value] of Object.entries(module)) {
      if (isRegisteredFunction(value)) {
        const path = `${prefix}:${name}`
        this.register(path, value)
      }
    }
    return this
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get the number of registered functions.
   *
   * Does not include HTTP endpoints in the count.
   *
   * @returns The number of registered functions
   *
   * @example
   * ```typescript
   * console.log(`${registry.size()} functions registered`)
   * ```
   */
  public size(): number {
    return this.functionMap.size
  }

  /**
   * Get the number of registered HTTP endpoints.
   *
   * @returns The number of registered HTTP endpoints
   *
   * @example
   * ```typescript
   * console.log(`${registry.httpEndpointCount()} HTTP endpoints registered`)
   * ```
   */
  public httpEndpointCount(): number {
    return this.httpEndpoints.size
  }

  /**
   * Clear all registered functions and HTTP endpoints.
   *
   * Removes all registrations from the registry. The singleton instance
   * is preserved - use `resetInstance()` to fully reset.
   *
   * @example
   * ```typescript
   * registry.clear()
   * console.log(registry.size()) // 0
   * ```
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
   *
   * Enables use of the registry with for...of loops.
   *
   * @returns An iterator over function entries
   *
   * @example
   * ```typescript
   * for (const entry of registry) {
   *   console.log(`${entry.path}: ${entry.type} (${entry.visibility})`)
   * }
   * ```
   */
  public [Symbol.iterator](): Iterator<FunctionEntry> {
    return this.functionMap.values()
  }

  /**
   * Get entries as [path, entry] pairs.
   *
   * Returns an iterator that yields [path, FunctionEntry] tuples.
   *
   * @returns An iterator over [path, entry] pairs
   *
   * @example
   * ```typescript
   * for (const [path, entry] of registry.entries()) {
   *   console.log(`${path} => ${entry.type}`)
   * }
   * ```
   */
  public entries(): IterableIterator<[string, FunctionEntry]> {
    return this.functionMap.entries()
  }

  /**
   * Get all registered paths.
   *
   * Returns an iterator over all registered function paths.
   *
   * @returns An iterator over paths
   *
   * @example
   * ```typescript
   * const paths = Array.from(registry.paths())
   * console.log(`Registered paths: ${paths.join(', ')}`)
   * ```
   */
  public paths(): IterableIterator<string> {
    return this.functionMap.keys()
  }

  /**
   * Get all registered functions (without path information).
   *
   * Returns an iterator over just the RegisteredFunction objects.
   *
   * @returns An iterator over registered functions
   *
   * @example
   * ```typescript
   * for (const fn of registry.functions()) {
   *   console.log(`Function type: ${fn._type}`)
   * }
   * ```
   */
  public *functions(): IterableIterator<RegisteredFunction> {
    for (const entry of this.functionMap.values()) {
      yield entry.fn
    }
  }
}
