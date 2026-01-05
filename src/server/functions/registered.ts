/**
 * Registered Function Types and Utilities
 *
 * This module provides types and utilities for working with registered
 * Convex functions (queries, mutations, and actions).
 *
 * @module
 */

import type { Validator, ArgsValidator, Infer } from '../../values'
import type { RegisteredQuery, QueryConfig } from '../query'
import type { RegisteredMutation, MutationConfig } from '../mutation'
import type { RegisteredAction, ActionConfig } from '../action'

// ============================================================================
// Re-export Types from Individual Modules
// ============================================================================

export type { RegisteredQuery } from '../query'
export type { RegisteredMutation } from '../mutation'
export type { RegisteredAction } from '../action'

// ============================================================================
// Union and Generic Types
// ============================================================================

/**
 * A union type representing any registered function (query, mutation, or action).
 */
export type AnyRegisteredFunction =
  | RegisteredQuery<ArgsValidator | undefined, unknown>
  | RegisteredMutation<ArgsValidator | undefined, unknown>
  | RegisteredAction<ArgsValidator | undefined, unknown>

/**
 * Function type literals.
 */
export type FunctionType = 'query' | 'mutation' | 'action'

/**
 * Function visibility literals.
 */
export type FunctionVisibility = 'public' | 'internal'

/**
 * Generic registered function type parameterized by function type.
 */
export type GenericRegisteredFunction<T extends FunctionType = FunctionType> =
  T extends 'query'
    ? RegisteredQuery<ArgsValidator | undefined, unknown>
    : T extends 'mutation'
    ? RegisteredMutation<ArgsValidator | undefined, unknown>
    : T extends 'action'
    ? RegisteredAction<ArgsValidator | undefined, unknown>
    : never

// ============================================================================
// Type Extraction Utilities
// ============================================================================

/**
 * Extract the args type from a registered function.
 */
export type FunctionArgs<F extends AnyRegisteredFunction> = F['_args']

/**
 * Extract the return type from a registered function.
 */
export type FunctionReturns<F extends AnyRegisteredFunction> = F['_returns']

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a RegisteredQuery.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredQuery
 *
 * @example
 * ```typescript
 * const fn = query({ handler: async (ctx) => 'hello' })
 * if (isQuery(fn)) {
 *   // fn is typed as RegisteredQuery
 * }
 * ```
 */
export function isQuery(fn: unknown): fn is RegisteredQuery<ArgsValidator | undefined, unknown> {
  return (
    fn !== null &&
    fn !== undefined &&
    typeof fn === 'object' &&
    '_type' in fn &&
    fn._type === 'query'
  )
}

/**
 * Check if a value is a RegisteredMutation.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredMutation
 *
 * @example
 * ```typescript
 * const fn = mutation({ handler: async (ctx) => 'created' })
 * if (isMutation(fn)) {
 *   // fn is typed as RegisteredMutation
 * }
 * ```
 */
export function isMutation(fn: unknown): fn is RegisteredMutation<ArgsValidator | undefined, unknown> {
  return (
    fn !== null &&
    fn !== undefined &&
    typeof fn === 'object' &&
    '_type' in fn &&
    fn._type === 'mutation'
  )
}

/**
 * Check if a value is a RegisteredAction.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredAction
 *
 * @example
 * ```typescript
 * const fn = action({ handler: async (ctx) => 'done' })
 * if (isAction(fn)) {
 *   // fn is typed as RegisteredAction
 * }
 * ```
 */
export function isAction(fn: unknown): fn is RegisteredAction<ArgsValidator | undefined, unknown> {
  return (
    fn !== null &&
    fn !== undefined &&
    typeof fn === 'object' &&
    '_type' in fn &&
    fn._type === 'action'
  )
}

/**
 * Check if a value is any type of registered function.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredQuery, RegisteredMutation, or RegisteredAction
 *
 * @example
 * ```typescript
 * if (isRegisteredFunction(fn)) {
 *   console.log(fn._type) // 'query' | 'mutation' | 'action'
 * }
 * ```
 */
export function isRegisteredFunction(fn: unknown): fn is AnyRegisteredFunction {
  return isQuery(fn) || isMutation(fn) || isAction(fn)
}

/**
 * Check if a registered function is public (callable from clients).
 *
 * @param fn - The value to check
 * @returns True if the value is a public registered function
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' })
 * console.log(isPublicFunction(q)) // true
 *
 * const internal = internalQuery({ handler: async (ctx) => 'hello' })
 * console.log(isPublicFunction(internal)) // false
 * ```
 */
export function isPublicFunction(fn: unknown): fn is AnyRegisteredFunction {
  return isRegisteredFunction(fn) && fn._visibility === 'public'
}

/**
 * Check if a registered function is internal (only callable from other functions).
 *
 * @param fn - The value to check
 * @returns True if the value is an internal registered function
 *
 * @example
 * ```typescript
 * const q = internalQuery({ handler: async (ctx) => 'hello' })
 * console.log(isInternalFunction(q)) // true
 * ```
 */
export function isInternalFunction(fn: unknown): fn is AnyRegisteredFunction {
  return isRegisteredFunction(fn) && fn._visibility === 'internal'
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the type of a registered function ('query', 'mutation', or 'action').
 *
 * @param fn - The registered function
 * @returns The function type
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' })
 * console.log(getFunctionType(q)) // 'query'
 * ```
 */
export function getFunctionType(fn: AnyRegisteredFunction): FunctionType {
  return fn._type
}

/**
 * Get the visibility of a registered function ('public' or 'internal').
 *
 * @param fn - The registered function
 * @returns The function visibility
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' })
 * console.log(getFunctionVisibility(q)) // 'public'
 *
 * const internal = internalQuery({ handler: async (ctx) => 'hello' })
 * console.log(getFunctionVisibility(internal)) // 'internal'
 * ```
 */
export function getFunctionVisibility(fn: AnyRegisteredFunction): FunctionVisibility {
  return fn._visibility
}

/**
 * Get the args validator from a registered function.
 *
 * @param fn - The registered function
 * @returns The args validator, or undefined if not defined
 *
 * @example
 * ```typescript
 * const q = query({
 *   args: { id: v.string() },
 *   handler: async (ctx, args) => args.id
 * })
 * const validator = getArgsValidator(q) // { id: v.string() }
 * ```
 */
export function getArgsValidator(fn: AnyRegisteredFunction): ArgsValidator | undefined {
  return fn._config.args
}

/**
 * Get the returns validator from a registered function.
 *
 * @param fn - The registered function
 * @returns The returns validator, or undefined if not defined
 *
 * @example
 * ```typescript
 * const q = query({
 *   returns: v.string(),
 *   handler: async (ctx) => 'hello'
 * })
 * const validator = getReturnsValidator(q) // v.string()
 * ```
 */
export function getReturnsValidator(fn: AnyRegisteredFunction): Validator | undefined {
  return fn._config.returns
}

/**
 * Get the handler function from a registered function.
 *
 * @param fn - The registered function
 * @returns The handler function
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' })
 * const handler = getFunctionHandler(q)
 * ```
 */
export function getFunctionHandler<F extends AnyRegisteredFunction>(
  fn: F
): F['_config']['handler'] {
  return fn._config.handler
}
