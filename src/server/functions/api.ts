/**
 * FunctionReference Types and API Generation
 *
 * This module provides the core infrastructure for type-safe function references
 * and API object generation in the Convex-compatible runtime.
 *
 * Features:
 * - FunctionReference<Type, Args, Returns> - Type-safe references to registered functions
 * - api object generation - Creates nested module structure from registered functions
 * - makeFunctionReference helper - Factory for creating function references
 * - Function path resolution - Utilities for parsing and manipulating function paths
 * - Nested module references - Support for api.users.get style access patterns
 *
 * 100% compatible with Convex's convex/server exports.
 *
 * @module
 */

// ============================================================================
// Core Types - Function Type and Visibility
// ============================================================================

import { type FunctionType, type FunctionVisibility } from './shared'

// Re-export for backwards compatibility
export { type FunctionType, type FunctionVisibility }

// ============================================================================
// Core Types - FunctionReference
// ============================================================================

/**
 * A type-safe reference to a registered Convex function.
 *
 * FunctionReference is the primary type used for calling functions in a type-safe manner.
 * It encodes the function type, argument types, return type, and visibility at the type level.
 *
 * @typeParam Type - The function type ('query' | 'mutation' | 'action')
 * @typeParam Args - The argument type for the function
 * @typeParam Returns - The return type of the function
 * @typeParam Visibility - The visibility level ('public' | 'internal')
 *
 * @example
 * ```typescript
 * // Type-safe reference to a query function
 * const userQuery: FunctionReference<'query', { id: string }, User | null> = api.users.get
 *
 * // Use with ctx.runQuery for type-safe invocation
 * const user = await ctx.runQuery(userQuery, { id: 'user123' })
 * ```
 */
export interface FunctionReference<
  Type extends FunctionType = FunctionType,
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
> {
  /** The function type identifier */
  readonly _type: Type
  /** Phantom type for argument type inference */
  readonly _args: Args
  /** Phantom type for return type inference */
  readonly _returns: Returns
  /** The full path to the function (e.g., 'users:get' or 'admin/users:list') */
  readonly _path: string
  /** The visibility level */
  readonly _visibility: Visibility
}

// ============================================================================
// Type Aliases - Specialized Function References
// ============================================================================

/**
 * A generic function reference with unknown args and returns.
 *
 * Useful when you need to accept any function reference of a specific type
 * without knowing the exact argument and return types.
 *
 * @typeParam Type - The function type to filter by
 * @typeParam Visibility - The visibility level filter
 *
 * @example
 * ```typescript
 * function logQuery(ref: GenericFunctionReference<'query'>): void {
 *   console.log(`Query path: ${ref._path}`)
 * }
 * ```
 */
export type GenericFunctionReference<
  Type extends FunctionType = FunctionType,
  Visibility extends FunctionVisibility = FunctionVisibility
> = FunctionReference<Type, unknown, unknown, Visibility>

/**
 * Any function reference (query, mutation, or action).
 *
 * The most permissive function reference type, accepting any function
 * regardless of type, args, returns, or visibility.
 */
export type AnyFunctionReference = FunctionReference<FunctionType, unknown, unknown, FunctionVisibility>

/**
 * Shorthand for query function references.
 *
 * @typeParam Args - The argument type for the query
 * @typeParam Returns - The return type of the query
 */
export type QueryReference<Args = unknown, Returns = unknown> = FunctionReference<'query', Args, Returns>

/**
 * Shorthand for mutation function references.
 *
 * @typeParam Args - The argument type for the mutation
 * @typeParam Returns - The return type of the mutation
 */
export type MutationReference<Args = unknown, Returns = unknown> = FunctionReference<'mutation', Args, Returns>

/**
 * Shorthand for action function references.
 *
 * @typeParam Args - The argument type for the action
 * @typeParam Returns - The return type of the action
 */
export type ActionReference<Args = unknown, Returns = unknown> = FunctionReference<'action', Args, Returns>

/**
 * A function reference that can be scheduled (mutations and actions only).
 *
 * Queries cannot be scheduled because they are read-only and their results
 * depend on the current database state.
 */
export type SchedulableFunctionReference = FunctionReference<'mutation' | 'action', unknown, unknown, FunctionVisibility>

// ============================================================================
// Type Helpers - Type Extraction
// ============================================================================

/**
 * Extract the argument type from a function reference.
 *
 * @typeParam F - The function reference type
 *
 * @example
 * ```typescript
 * type UserQueryArgs = FunctionArgs<typeof api.users.get>
 * // => { id: string }
 * ```
 */
export type FunctionArgs<F extends AnyFunctionReference> = F['_args']

/**
 * Extract the return type from a function reference.
 *
 * @typeParam F - The function reference type
 *
 * @example
 * ```typescript
 * type UserQueryReturn = FunctionReturnType<typeof api.users.get>
 * // => User | null
 * ```
 */
export type FunctionReturnType<F extends AnyFunctionReference> = F['_returns']

/**
 * Filter an API object to only include functions of a specific type.
 *
 * Recursively traverses the API structure and filters out functions
 * that don't match the specified type.
 *
 * @typeParam API - The API object type to filter
 * @typeParam Type - The function type to filter by
 *
 * @example
 * ```typescript
 * type QueriesOnly = FilterByFunctionType<typeof api, 'query'>
 * // Only includes query functions from the API
 * ```
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

// ============================================================================
// Type Helpers - Function Call Argument Types
// ============================================================================

/**
 * Optional rest args for functions with empty args.
 *
 * When a function's args is an empty object, the args parameter becomes optional.
 * This type helper enables the pattern `runQuery(ref)` for no-arg functions.
 *
 * @typeParam F - The function reference type
 *
 * @example
 * ```typescript
 * // For a function with no args:
 * type Args = OptionalRestArgs<FunctionReference<'query', Record<string, never>, void>>
 * // => [] | [Record<string, never>]
 *
 * // For a function with args:
 * type Args = OptionalRestArgs<FunctionReference<'query', { id: string }, void>>
 * // => [{ id: string }]
 * ```
 */
export type OptionalRestArgs<F extends AnyFunctionReference> =
  FunctionArgs<F> extends Record<string, never>
    ? [] | [Record<string, never>]
    : [FunctionArgs<F>]

/**
 * Args and options combined for function calls with additional options.
 *
 * Supports optional options parameter while maintaining correct arg typing.
 *
 * @typeParam F - The function reference type
 * @typeParam Options - The options type to append
 *
 * @example
 * ```typescript
 * type CallArgs = ArgsAndOptions<typeof ref, { cache?: boolean }>
 * // For ref with { id: string } args: [{ id: string }] | [{ id: string }, { cache?: boolean }]
 * ```
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
 *
 * Used internally for building the api and internal objects from the function registry.
 * This is a simplified type that captures only the essential metadata needed for
 * API generation.
 */
export interface RegisteredFunction {
  /** The function type ('query' | 'mutation' | 'action') */
  readonly _type: FunctionType
  /** The visibility level ('public' | 'internal') */
  readonly _visibility: FunctionVisibility
  /** Optional argument type information */
  readonly _args?: unknown
  /** Optional return type information */
  readonly _returns?: unknown
}

// ============================================================================
// Function Path Types and Parsing
// ============================================================================

/**
 * Parsed function path result.
 *
 * Represents the components of a function path after parsing.
 */
export interface ParsedFunctionPath {
  /** The module path (e.g., 'users' or 'admin/users') */
  readonly module: string
  /** The function name (e.g., 'get' or 'list') */
  readonly functionName: string
  /** The full path (e.g., 'users:get' or 'admin/users:list') */
  readonly fullPath: string
}

/**
 * Regular expression for validating function paths.
 *
 * Valid formats:
 * - module:function (e.g., 'users:get')
 * - module/submodule:function (e.g., 'admin/users:list')
 * - standalone function name (e.g., 'myFunction')
 *
 * @internal
 */
const VALID_PATH_REGEX = /^[a-zA-Z0-9_/]+:[a-zA-Z0-9_]+$|^[a-zA-Z0-9_]+$/

/**
 * Parse a function path into its constituent components.
 *
 * Extracts the module path, function name, and preserves the full path
 * from a Convex function path string.
 *
 * @param path - The function path to parse (e.g., 'users:get' or 'admin/users:list')
 * @returns The parsed path components
 *
 * @example
 * ```typescript
 * // Simple module:function path
 * parseFunctionPath('users:get')
 * // => { module: 'users', functionName: 'get', fullPath: 'users:get' }
 *
 * // Nested module path
 * parseFunctionPath('admin/users:list')
 * // => { module: 'admin/users', functionName: 'list', fullPath: 'admin/users:list' }
 *
 * // Standalone function (no module)
 * parseFunctionPath('myFunction')
 * // => { module: '', functionName: 'myFunction', fullPath: 'myFunction' }
 * ```
 */
export function parseFunctionPath(path: string): ParsedFunctionPath {
  const colonIndex = path.lastIndexOf(':')

  if (colonIndex === -1) {
    // No colon found - treat the whole path as function name
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

/**
 * Build a path array from a function path string.
 *
 * Converts a function path like 'admin/users:list' into an array of path segments
 * suitable for building nested API structures: ['admin', 'users', 'list'].
 *
 * @param functionPath - The function path to convert
 * @returns Array of path segments
 *
 * @internal
 */
function buildPathArray(functionPath: string): string[] {
  const parsed = parseFunctionPath(functionPath)
  const moduleParts = parsed.module ? parsed.module.split('/') : []
  return [...moduleParts, parsed.functionName]
}

// ============================================================================
// Function Reference Factory - Internal Helper
// ============================================================================

/**
 * Internal helper to create function references with explicit type.
 *
 * Creates a properly structured FunctionReference object with all required fields.
 *
 * @param type - The function type
 * @param path - The function path
 * @param visibility - The visibility level
 * @returns A new FunctionReference object
 *
 * @internal
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

// ============================================================================
// Function Reference Factory - Public API
// ============================================================================

/**
 * Create a function reference from a path.
 *
 * This function uses TypeScript's generic type parameter to determine the function type.
 * Since generics are erased at runtime, this function defaults to 'query' type.
 * For explicit runtime types, use the specialized factory functions:
 * - {@link makeQueryReference} for queries
 * - {@link makeMutationReference} for mutations
 * - {@link makeActionReference} for actions
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
 * // Create a typed query reference
 * const ref = makeFunctionReference<'query', { id: string }, User | null>(
 *   'users:get'
 * )
 *
 * // Use with ctx.runQuery for type-safe invocation
 * const user = await ctx.runQuery(ref, { id: userId })
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

/**
 * Overload for better type inference when Type is not explicitly specified.
 * Defaults to 'query' type.
 */
export function makeFunctionReference<
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
>(
  path: string,
  visibility?: Visibility
): FunctionReference<'query', Args, Returns, Visibility>

/**
 * Implementation of makeFunctionReference.
 */
export function makeFunctionReference<
  Type extends FunctionType = 'query',
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
>(
  path: string,
  visibility: Visibility = 'public' as Visibility
): FunctionReference<Type, Args, Returns, Visibility> {
  // Note: TypeScript generics are erased at runtime, so we default to 'query'.
  // The createApi/createInternalApi functions provide the correct runtime type
  // when creating references from registered functions.
  return createFunctionRef('query' as Type, path, visibility)
}

/**
 * Create a query function reference.
 *
 * Creates a FunctionReference with the correct 'query' type at runtime.
 * Use this when you need the runtime type to be 'query'.
 *
 * @typeParam Args - The argument type for the query
 * @typeParam Returns - The return type of the query
 * @typeParam Visibility - The visibility level
 *
 * @param path - The function path (e.g., 'users:get')
 * @param visibility - The visibility level (default: 'public')
 * @returns A typed query reference
 *
 * @example
 * ```typescript
 * const userQuery = makeQueryReference<{ id: string }, User | null>('users:get')
 * console.log(userQuery._type) // 'query'
 * ```
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
 *
 * Creates a FunctionReference with the correct 'mutation' type at runtime.
 * Use this when you need the runtime type to be 'mutation'.
 *
 * @typeParam Args - The argument type for the mutation
 * @typeParam Returns - The return type of the mutation
 * @typeParam Visibility - The visibility level
 *
 * @param path - The function path (e.g., 'users:create')
 * @param visibility - The visibility level (default: 'public')
 * @returns A typed mutation reference
 *
 * @example
 * ```typescript
 * const createUser = makeMutationReference<{ name: string }, string>('users:create')
 * console.log(createUser._type) // 'mutation'
 * ```
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
 *
 * Creates a FunctionReference with the correct 'action' type at runtime.
 * Use this when you need the runtime type to be 'action'.
 *
 * @typeParam Args - The argument type for the action
 * @typeParam Returns - The return type of the action
 * @typeParam Visibility - The visibility level
 *
 * @param path - The function path (e.g., 'email:send')
 * @param visibility - The visibility level (default: 'public')
 * @returns A typed action reference
 *
 * @example
 * ```typescript
 * const sendEmail = makeActionReference<{ to: string }, void>('email:send')
 * console.log(sendEmail._type) // 'action'
 * ```
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
// Function Reference Utilities
// ============================================================================

/**
 * Get the function name/path from a function reference.
 *
 * Extracts the path string from a FunctionReference object.
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

/**
 * Create a serializable function handle from a function reference.
 *
 * Function handles are string representations of function references that
 * can be stored in the database and used later with the scheduler or
 * for deferred execution.
 *
 * @param ref - The function reference
 * @returns A string handle that can be serialized
 *
 * @example
 * ```typescript
 * const ref = makeFunctionReference<'mutation', {}, void>('tasks:process')
 * const handle = createFunctionHandle(ref)
 *
 * // Store handle in database
 * await ctx.db.insert('scheduledTasks', { functionHandle: handle })
 *
 * // Later: use handle with scheduler
 * await ctx.scheduler.runAfter(5000, handle, {})
 * ```
 */
export function createFunctionHandle(ref: AnyFunctionReference): string {
  return ref._path
}

// ============================================================================
// Function Name Template Literal
// ============================================================================

/**
 * Template literal tag for creating validated function name strings.
 *
 * Validates the path format at runtime and returns a string. Use this
 * when you need to construct function paths dynamically while ensuring
 * they follow the correct format.
 *
 * @param strings - The template literal string parts
 * @param values - The interpolated values
 * @returns The validated function path string
 * @throws Error if the path format is invalid
 *
 * @example
 * ```typescript
 * // Static path
 * const name = functionName`users:get`
 * // => 'users:get'
 *
 * // Dynamic path construction
 * const module = 'users'
 * const func = 'create'
 * const name2 = functionName`${module}:${func}`
 * // => 'users:create'
 *
 * // Invalid path throws error
 * functionName`invalid path with spaces`
 * // => Error: Invalid function path format
 * ```
 */
export function functionName(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  // Combine template literal parts with interpolated values
  let result = strings[0]
  for (let i = 0; i < values.length; i++) {
    result += String(values[i]) + strings[i + 1]
  }

  // Validate the constructed path format
  if (!VALID_PATH_REGEX.test(result)) {
    throw new Error(
      `Invalid function path format: "${result}". Expected format: "module:function" or "module/submodule:function"`
    )
  }

  return result
}

// ============================================================================
// API Object Generation - Types
// ============================================================================

/**
 * Nested API structure type.
 *
 * Represents the recursive module structure of the api object.
 * Each key can be either a FunctionReference or another nested module.
 */
export type NestedApi = {
  [key: string]: FunctionReference<FunctionType, unknown, unknown, FunctionVisibility> | NestedApi
}

// ============================================================================
// API Object Generation - Internal Helpers
// ============================================================================

/**
 * Set a value in a nested object by path array.
 *
 * Creates intermediate objects as needed when traversing the path.
 * This enables building the nested api.module.submodule.function structure.
 *
 * @param obj - The root object to modify
 * @param pathArray - Array of path segments to traverse
 * @param value - The function reference to set at the final path
 *
 * @internal
 */
function setNestedValue(obj: NestedApi, pathArray: string[], value: AnyFunctionReference): void {
  let current = obj

  // Traverse/create intermediate path segments
  for (let i = 0; i < pathArray.length - 1; i++) {
    const key = pathArray[i]
    if (!(key in current)) {
      current[key] = {}
    }
    current = current[key] as NestedApi
  }

  // Set the final value
  current[pathArray[pathArray.length - 1]] = value
}

/**
 * Create a function reference from registered function metadata.
 *
 * Builds a complete FunctionReference object from a RegisteredFunction
 * and its registration path.
 *
 * @param path - The function registration path
 * @param func - The registered function metadata
 * @param visibility - The visibility level to assign
 * @returns A complete FunctionReference object
 *
 * @internal
 */
function createRefFromRegistered(
  path: string,
  func: RegisteredFunction,
  visibility: FunctionVisibility
): AnyFunctionReference {
  return {
    _type: func._type,
    _args: func._args,
    _returns: func._returns,
    _path: path,
    _visibility: visibility,
  }
}

/**
 * Filter and transform registered functions into an API structure.
 *
 * Core logic shared between createApi and createInternalApi.
 * Filters functions by visibility and builds the nested structure.
 *
 * @param registeredFunctions - Map of function paths to registered functions
 * @param targetVisibility - The visibility level to filter by
 * @returns A nested API object containing matching functions
 *
 * @internal
 */
function buildApiFromFunctions(
  registeredFunctions: Record<string, RegisteredFunction>,
  targetVisibility: FunctionVisibility
): NestedApi {
  const api: NestedApi = {}

  for (const [path, func] of Object.entries(registeredFunctions)) {
    // Filter by visibility
    if (func._visibility !== targetVisibility) {
      continue
    }

    // Build path array and create reference
    const pathArray = buildPathArray(path)
    const ref = createRefFromRegistered(path, func, targetVisibility)

    // Insert into nested structure
    setNestedValue(api, pathArray, ref)
  }

  return api
}

// ============================================================================
// API Object Generation - Public API
// ============================================================================

/**
 * Create a public API object from registered functions.
 *
 * Builds a nested object structure containing function references for all
 * public functions. The structure mirrors the module organization:
 * - 'users:get' becomes api.users.get
 * - 'admin/users:list' becomes api.admin.users.list
 *
 * Only functions with 'public' visibility are included.
 *
 * @param registeredFunctions - Map of function paths to registered functions
 * @returns A nested API object with function references
 *
 * @example
 * ```typescript
 * const registeredFunctions = {
 *   'users:get': { _type: 'query', _visibility: 'public' },
 *   'users:create': { _type: 'mutation', _visibility: 'public' },
 *   'admin/users:list': { _type: 'query', _visibility: 'public' },
 *   'users:getSecret': { _type: 'query', _visibility: 'internal' }, // Not included
 * }
 *
 * const api = createApi(registeredFunctions)
 *
 * // Access structure:
 * api.users.get._path      // 'users:get'
 * api.users.get._type      // 'query'
 * api.users.create._path   // 'users:create'
 * api.admin.users.list     // nested module access
 *
 * // Internal functions are NOT in the public api
 * api.users.getSecret      // undefined
 * ```
 */
export function createApi(
  registeredFunctions: Record<string, RegisteredFunction>
): NestedApi {
  return buildApiFromFunctions(registeredFunctions, 'public')
}

/**
 * Create an internal API object from registered functions.
 *
 * Builds a nested object structure containing function references for all
 * internal functions. The structure mirrors the module organization,
 * identical to createApi but filtering for 'internal' visibility.
 *
 * Only functions with 'internal' visibility are included.
 *
 * @param registeredFunctions - Map of function paths to registered functions
 * @returns A nested internal API object with function references
 *
 * @example
 * ```typescript
 * const registeredFunctions = {
 *   'users:list': { _type: 'query', _visibility: 'public' },        // Not included
 *   'users:getSecret': { _type: 'query', _visibility: 'internal' },
 *   'admin/secrets:get': { _type: 'query', _visibility: 'internal' },
 * }
 *
 * const internal = createInternalApi(registeredFunctions)
 *
 * // Access structure:
 * internal.users.getSecret._path         // 'users:getSecret'
 * internal.users.getSecret._visibility   // 'internal'
 * internal.admin.secrets.get._path       // 'admin/secrets:get'
 *
 * // Public functions are NOT in the internal api
 * internal.users.list                    // undefined
 * ```
 */
export function createInternalApi(
  registeredFunctions: Record<string, RegisteredFunction>
): NestedApi {
  return buildApiFromFunctions(registeredFunctions, 'internal')
}

// ============================================================================
// Type Aliases for Backward Compatibility
// ============================================================================

/**
 * Alias for FunctionReference (deprecated naming).
 * @deprecated Use FunctionReference instead
 */
export type FunctionRef<
  Type extends FunctionType = FunctionType,
  Args = unknown,
  Returns = unknown,
  Visibility extends FunctionVisibility = 'public'
> = FunctionReference<Type, Args, Returns, Visibility>
