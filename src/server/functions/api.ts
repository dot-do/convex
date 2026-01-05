/**
 * FunctionReference Types and api() Generation
 *
 * This module provides:
 * - FunctionReference<Type, Args, Returns> type
 * - api object generation
 * - Type-safe function references
 * - makeFunctionReference helper
 * - Function path resolution
 * - Nested module references (api.users.get)
 *
 * 100% compatible with Convex's convex/server exports.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Function types supported by Convex.
 */
export type FunctionType = 'query' | 'mutation' | 'action'

/**
 * Visibility levels for functions.
 */
export type FunctionVisibility = 'public' | 'internal'

/**
 * A reference to a registered function.
 * This is the core type for type-safe function calls.
 *
 * @typeParam Type - The function type ('query' | 'mutation' | 'action')
 * @typeParam Args - The argument type for the function
 * @typeParam Returns - The return type of the function
 * @typeParam Visibility - The visibility level ('public' | 'internal')
 */
export interface FunctionReference<
  Type extends FunctionType = FunctionType,
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
> {
  /** The function type */
  _type: Type
  /** The argument type (phantom type for type inference) */
  _args: Args
  /** The return type (phantom type for type inference) */
  _returns: Returns
  /** The full path to the function (e.g., 'users:get' or 'admin/users:list') */
  _path: string
  /** The visibility level */
  _visibility: Visibility
}

/**
 * A generic function reference with unknown args and returns.
 * Useful when you need to accept any function reference of a specific type.
 */
export type GenericFunctionReference<
  Type extends FunctionType = FunctionType,
  Visibility extends FunctionVisibility = FunctionVisibility
> = FunctionReference<Type, unknown, unknown, Visibility>

/**
 * Any function reference (query, mutation, or action).
 */
export type AnyFunctionReference = FunctionReference<FunctionType, unknown, unknown, FunctionVisibility>

/**
 * Shorthand for query function references.
 */
export type QueryReference<Args = unknown, Returns = unknown> = FunctionReference<'query', Args, Returns>

/**
 * Shorthand for mutation function references.
 */
export type MutationReference<Args = unknown, Returns = unknown> = FunctionReference<'mutation', Args, Returns>

/**
 * Shorthand for action function references.
 */
export type ActionReference<Args = unknown, Returns = unknown> = FunctionReference<'action', Args, Returns>

/**
 * A function reference that can be scheduled (mutations and actions only).
 * Queries cannot be scheduled because they are read-only.
 */
export type SchedulableFunctionReference = FunctionReference<'mutation' | 'action', unknown, unknown, FunctionVisibility>

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Extract the args type from a function reference.
 */
export type FunctionArgs<F extends AnyFunctionReference> = F['_args']

/**
 * Extract the return type from a function reference.
 */
export type FunctionReturnType<F extends AnyFunctionReference> = F['_returns']

/**
 * Filter an API object to only include functions of a specific type.
 */
export type FilterByFunctionType<
  API,
  Type extends FunctionType
> = {
  [K in keyof API]: API[K] extends FunctionReference<Type, infer A, infer R>
    ? FunctionReference<Type, A, R>
    : API[K] extends Record<string, unknown>
    ? FilterByFunctionType<API[K], Type>
    : never
}

/**
 * Optional rest args for functions with empty args.
 * When args is an empty object, the args parameter becomes optional.
 */
export type OptionalRestArgs<F extends AnyFunctionReference> =
  FunctionArgs<F> extends Record<string, never>
    ? [] | [Record<string, never>]
    : [FunctionArgs<F>]

/**
 * Args and options combined for function calls with additional options.
 */
export type ArgsAndOptions<
  F extends AnyFunctionReference,
  Options
> = FunctionArgs<F> extends Record<string, never>
  ? [] | [Record<string, never>] | [Record<string, never>, Options]
  : [FunctionArgs<F>] | [FunctionArgs<F>, Options]

// ============================================================================
// Registered Function Type
// ============================================================================

/**
 * A registered function with metadata.
 * Used internally for building the api and internal objects.
 */
export interface RegisteredFunction {
  _type: FunctionType
  _visibility: FunctionVisibility
  _args?: unknown
  _returns?: unknown
}

// ============================================================================
// Function Path Utilities
// ============================================================================

/**
 * Parsed function path result.
 */
export interface ParsedFunctionPath {
  /** The module path (e.g., 'users' or 'admin/users') */
  module: string
  /** The function name (e.g., 'get' or 'list') */
  functionName: string
  /** The full path (e.g., 'users:get' or 'admin/users:list') */
  fullPath: string
}

/**
 * Parse a function path into its components.
 *
 * @param path - The function path (e.g., 'users:get' or 'admin/users:list')
 * @returns The parsed path components
 *
 * @example
 * ```typescript
 * parseFunctionPath('users:get')
 * // => { module: 'users', functionName: 'get', fullPath: 'users:get' }
 *
 * parseFunctionPath('admin/users:list')
 * // => { module: 'admin/users', functionName: 'list', fullPath: 'admin/users:list' }
 * ```
 */
export function parseFunctionPath(path: string): ParsedFunctionPath {
  const colonIndex = path.lastIndexOf(':')

  if (colonIndex === -1) {
    // No colon, treat the whole path as function name
    return {
      module: '',
      functionName: path,
      fullPath: path,
    }
  }

  return {
    module: path.substring(0, colonIndex),
    functionName: path.substring(colonIndex + 1),
    fullPath: path,
  }
}

// ============================================================================
// makeFunctionReference Helper
// ============================================================================

/**
 * Internal helper to create function references with explicit type.
 */
function createFunctionRef<
  Type extends FunctionType,
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
>(
  type: Type,
  path: string,
  visibility: Visibility
): FunctionReference<Type, Args, Returns, Visibility> {
  return {
    _type: type,
    _args: undefined as unknown as Args,
    _returns: undefined as unknown as Returns,
    _path: path,
    _visibility: visibility,
  }
}

/**
 * Create a function reference from a path.
 *
 * This function uses TypeScript's generic type parameter to determine the function type.
 * Since generics are erased at runtime, this function uses a mapping approach where
 * the first type parameter determines the runtime type.
 *
 * @typeParam Type - The function type
 * @typeParam Args - The argument type
 * @typeParam Returns - The return type
 * @typeParam Visibility - The visibility level
 *
 * @param path - The function path (e.g., 'users:get')
 * @param visibility - The visibility level (default: 'public')
 * @returns A typed function reference
 *
 * @example
 * ```typescript
 * const ref = makeFunctionReference<'query', { id: string }, User | null>(
 *   'users:get'
 * )
 * // Use with ctx.runQuery(ref, { id: userId })
 * ```
 */
export function makeFunctionReference<
  Type extends FunctionType,
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
>(
  path: string,
  visibility?: Visibility
): FunctionReference<Type, Args, Returns, Visibility>

// Overloads for better type inference with explicit types
export function makeFunctionReference<
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
>(
  path: string,
  visibility?: Visibility
): FunctionReference<'query', Args, Returns, Visibility>

export function makeFunctionReference<
  Type extends FunctionType = 'query',
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
>(
  path: string,
  visibility: Visibility = 'public' as Visibility
): FunctionReference<Type, Args, Returns, Visibility> {
  // Since TypeScript generics are erased at runtime, we need to determine
  // the function type from context. The createApi/createInternalApi functions
  // provide the runtime type when creating references from registered functions.
  //
  // For makeFunctionReference, the type is primarily for compile-time safety.
  // The runtime type defaults to 'query' but is overridden when used with
  // the specialized factory functions below.
  return createFunctionRef('query' as Type, path, visibility)
}

/**
 * Create a query function reference.
 */
export function makeQueryReference<
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
>(
  path: string,
  visibility: Visibility = 'public' as Visibility
): FunctionReference<'query', Args, Returns, Visibility> {
  return createFunctionRef('query', path, visibility)
}

/**
 * Create a mutation function reference.
 */
export function makeMutationReference<
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
>(
  path: string,
  visibility: Visibility = 'public' as Visibility
): FunctionReference<'mutation', Args, Returns, Visibility> {
  return createFunctionRef('mutation', path, visibility)
}

/**
 * Create an action function reference.
 */
export function makeActionReference<
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
>(
  path: string,
  visibility: Visibility = 'public' as Visibility
): FunctionReference<'action', Args, Returns, Visibility> {
  return createFunctionRef('action', path, visibility)
}

// ============================================================================
// getFunctionName Helper
// ============================================================================

/**
 * Get the function name/path from a function reference.
 *
 * @param ref - The function reference
 * @returns The function path string
 *
 * @example
 * ```typescript
 * const ref = makeFunctionReference<'query', {}, void>('users:get')
 * getFunctionName(ref) // => 'users:get'
 * ```
 */
export function getFunctionName(ref: AnyFunctionReference): string {
  return ref._path
}

// ============================================================================
// functionName Template Literal
// ============================================================================

/**
 * Regular expression for valid function paths.
 * Allows: module:function, module/submodule:function, etc.
 */
const VALID_PATH_REGEX = /^[a-zA-Z0-9_/]+:[a-zA-Z0-9_]+$|^[a-zA-Z0-9_]+$/

/**
 * Template literal tag for creating function name strings.
 * Validates the path format and returns a string.
 *
 * @example
 * ```typescript
 * const name = functionName`users:get`
 * // => 'users:get'
 *
 * const module = 'users'
 * const func = 'create'
 * const name2 = functionName`${module}:${func}`
 * // => 'users:create'
 * ```
 */
export function functionName(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  // Combine template literal parts
  let result = strings[0]
  for (let i = 0; i < values.length; i++) {
    result += String(values[i]) + strings[i + 1]
  }

  // Validate the path format
  if (!VALID_PATH_REGEX.test(result)) {
    throw new Error(
      `Invalid function path format: "${result}". Expected format: "module:function" or "module/submodule:function"`
    )
  }

  return result
}

// ============================================================================
// createFunctionHandle Helper
// ============================================================================

/**
 * Create a serializable function handle from a function reference.
 * Function handles can be stored in the database and used later.
 *
 * @param ref - The function reference
 * @returns A string handle that can be serialized
 *
 * @example
 * ```typescript
 * const ref = makeFunctionReference<'mutation', {}, void>('tasks:process')
 * const handle = createFunctionHandle(ref)
 * // Store handle in database, use later with scheduler
 * ```
 */
export function createFunctionHandle(ref: AnyFunctionReference): string {
  return ref._path
}

// ============================================================================
// API Object Generation
// ============================================================================

/**
 * Nested API structure type.
 * Represents the nested module structure of the api object.
 */
export type NestedApi = {
  [key: string]: FunctionReference<FunctionType, unknown, unknown, FunctionVisibility> | NestedApi
}

/**
 * Set a value in a nested object by path.
 * Creates intermediate objects as needed.
 */
function setNestedValue(obj: NestedApi, path: string[], value: AnyFunctionReference): void {
  let current = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!(key in current)) {
      current[key] = {}
    }
    current = current[key] as NestedApi
  }
  current[path[path.length - 1]] = value
}

/**
 * Build the path array from a function path string.
 * Converts 'admin/users:list' to ['admin', 'users', 'list']
 */
function buildPathArray(functionPath: string): string[] {
  const parsed = parseFunctionPath(functionPath)
  const moduleParts = parsed.module ? parsed.module.split('/') : []
  return [...moduleParts, parsed.functionName]
}

/**
 * Create an api object from registered functions.
 * Only includes public functions.
 *
 * @param registeredFunctions - Map of function paths to registered functions
 * @returns An api object with nested module structure
 *
 * @example
 * ```typescript
 * const registeredFunctions = {
 *   'users:get': { _type: 'query', _visibility: 'public' },
 *   'users:create': { _type: 'mutation', _visibility: 'public' },
 *   'admin/users:list': { _type: 'query', _visibility: 'public' },
 * }
 *
 * const api = createApi(registeredFunctions)
 * // api.users.get._path === 'users:get'
 * // api.admin.users.list._path === 'admin/users:list'
 * ```
 */
export function createApi(
  registeredFunctions: Record<string, RegisteredFunction>
): NestedApi {
  const api: NestedApi = {}

  for (const [path, func] of Object.entries(registeredFunctions)) {
    // Only include public functions in the api object
    if (func._visibility !== 'public') {
      continue
    }

    const pathArray = buildPathArray(path)
    const ref: AnyFunctionReference = {
      _type: func._type,
      _args: func._args,
      _returns: func._returns,
      _path: path,
      _visibility: 'public',
    }

    setNestedValue(api, pathArray, ref)
  }

  return api
}

/**
 * Create an internal api object from registered functions.
 * Only includes internal functions.
 *
 * @param registeredFunctions - Map of function paths to registered functions
 * @returns An internal api object with nested module structure
 *
 * @example
 * ```typescript
 * const registeredFunctions = {
 *   'users:getSecret': { _type: 'query', _visibility: 'internal' },
 *   'admin/secrets:get': { _type: 'query', _visibility: 'internal' },
 * }
 *
 * const internal = createInternalApi(registeredFunctions)
 * // internal.users.getSecret._path === 'users:getSecret'
 * // internal.admin.secrets.get._path === 'admin/secrets:get'
 * ```
 */
export function createInternalApi(
  registeredFunctions: Record<string, RegisteredFunction>
): NestedApi {
  const internal: NestedApi = {}

  for (const [path, func] of Object.entries(registeredFunctions)) {
    // Only include internal functions in the internal object
    if (func._visibility !== 'internal') {
      continue
    }

    const pathArray = buildPathArray(path)
    const ref: AnyFunctionReference = {
      _type: func._type,
      _args: func._args,
      _returns: func._returns,
      _path: path,
      _visibility: 'internal',
    }

    setNestedValue(internal, pathArray, ref)
  }

  return internal
}

// ============================================================================
// Exports
// ============================================================================

// Re-export all types and functions for convenient access
export type {
  FunctionReference as FunctionRef,
}
