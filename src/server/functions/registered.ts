/**
 * Registered Function Types and Utilities
 *
 * This module provides types and utilities for working with registered
 * Convex functions (queries, mutations, and actions).
 *
 * Key features:
 * - Union types for handling any registered function
 * - Type guards for runtime type checking (isQuery, isMutation, isAction)
 * - Visibility checking (isPublicFunction, isInternalFunction)
 * - Utility functions for extracting validators and handlers
 *
 * @module
 *
 * @example
 * ```typescript
 * import {
 *   isQuery,
 *   isMutation,
 *   isAction,
 *   isRegisteredFunction,
 *   getFunctionType,
 *   getFunctionVisibility,
 * } from "convex.do/server/functions/registered";
 *
 * // Type guard usage
 * if (isQuery(fn)) {
 *   console.log("This is a query function");
 *   console.log(fn._visibility); // 'public' | 'internal'
 * }
 *
 * // Get function metadata
 * const type = getFunctionType(fn); // 'query' | 'mutation' | 'action'
 * const visibility = getFunctionVisibility(fn); // 'public' | 'internal'
 * ```
 */

import type { Validator, ArgsValidator, Infer } from '../../values'
import type { RegisteredQuery, QueryConfig } from '../query'
import type { RegisteredMutation, MutationConfig } from '../mutation'
import type { RegisteredAction, ActionConfig } from '../action'
import { type FunctionType, type FunctionVisibility } from './shared'

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
 *
 * Use this type when you need to accept any function type, such as in
 * utilities that work with all function types or in function registries.
 *
 * @example
 * ```typescript
 * function logFunction(fn: AnyRegisteredFunction) {
 *   console.log(`Type: ${fn._type}, Visibility: ${fn._visibility}`);
 * }
 *
 * // Works with any function type
 * logFunction(myQuery);
 * logFunction(myMutation);
 * logFunction(myAction);
 * ```
 */
export type AnyRegisteredFunction =
  | RegisteredQuery<ArgsValidator | undefined, unknown>
  | RegisteredMutation<ArgsValidator | undefined, unknown>
  | RegisteredAction<ArgsValidator | undefined, unknown>

// Re-export from shared for backwards compatibility
export { type FunctionType, type FunctionVisibility }

/**
 * Generic registered function type parameterized by function type.
 *
 * Useful for creating type-safe utilities that work with specific function types.
 *
 * @typeParam T - The function type to constrain to
 *
 * @example
 * ```typescript
 * // Only accept query functions
 * function runQueryFn<F extends GenericRegisteredFunction<'query'>>(fn: F) {
 *   // ...
 * }
 *
 * // Only accept mutations or actions
 * function scheduleFunction<F extends GenericRegisteredFunction<'mutation' | 'action'>>(fn: F) {
 *   // ...
 * }
 * ```
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
 *
 * Works with queries, mutations, and actions.
 *
 * @typeParam F - The registered function type
 *
 * @example
 * ```typescript
 * const myQuery = query({
 *   args: { id: v.string(), limit: v.number() },
 *   handler: async (ctx, args) => []
 * });
 *
 * type Args = FunctionArgs<typeof myQuery>;
 * // Result: { id: string; limit: number }
 * ```
 */
export type FunctionArgs<F extends AnyRegisteredFunction> = F['_args']

/**
 * Extract the return type from a registered function.
 *
 * Works with queries, mutations, and actions.
 *
 * @typeParam F - The registered function type
 *
 * @example
 * ```typescript
 * const myMutation = mutation({
 *   handler: async (ctx) => ({ success: true, id: "123" })
 * });
 *
 * type Returns = FunctionReturns<typeof myMutation>;
 * // Result: { success: boolean; id: string }
 * ```
 */
export type FunctionReturns<F extends AnyRegisteredFunction> = F['_returns']

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a RegisteredQuery.
 *
 * This is a runtime type guard that narrows the type to RegisteredQuery.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredQuery
 *
 * @example
 * ```typescript
 * const fn = query({ handler: async (ctx) => 'hello' });
 *
 * if (isQuery(fn)) {
 *   // fn is now typed as RegisteredQuery
 *   console.log(fn._type); // 'query'
 * }
 *
 * // Also works with unknown values
 * function handleFunction(fn: unknown) {
 *   if (isQuery(fn)) {
 *     // Safe to access query properties
 *     const config = fn._config;
 *   }
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
 * This is a runtime type guard that narrows the type to RegisteredMutation.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredMutation
 *
 * @example
 * ```typescript
 * const fn = mutation({ handler: async (ctx) => 'created' });
 *
 * if (isMutation(fn)) {
 *   // fn is now typed as RegisteredMutation
 *   console.log(fn._type); // 'mutation'
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
 * This is a runtime type guard that narrows the type to RegisteredAction.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredAction
 *
 * @example
 * ```typescript
 * const fn = action({ handler: async (ctx) => 'done' });
 *
 * if (isAction(fn)) {
 *   // fn is now typed as RegisteredAction
 *   console.log(fn._type); // 'action'
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
 * This is useful when you need to verify that a value is a valid
 * Convex function before further processing.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredQuery, RegisteredMutation, or RegisteredAction
 *
 * @example
 * ```typescript
 * function processFunction(fn: unknown) {
 *   if (isRegisteredFunction(fn)) {
 *     console.log(fn._type); // 'query' | 'mutation' | 'action'
 *     console.log(fn._visibility); // 'public' | 'internal'
 *   }
 * }
 * ```
 */
export function isRegisteredFunction(fn: unknown): fn is AnyRegisteredFunction {
  return isQuery(fn) || isMutation(fn) || isAction(fn)
}

/**
 * Check if a registered function is public (callable from clients).
 *
 * Public functions are exposed via the Convex HTTP API and can be
 * called from client applications.
 *
 * @param fn - The value to check
 * @returns True if the value is a public registered function
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' });
 * console.log(isPublicFunction(q)); // true
 *
 * const internal = internalQuery({ handler: async (ctx) => 'hello' });
 * console.log(isPublicFunction(internal)); // false
 *
 * // Use for filtering
 * const publicFunctions = functions.filter(isPublicFunction);
 * ```
 */
export function isPublicFunction(fn: unknown): fn is AnyRegisteredFunction {
  return isRegisteredFunction(fn) && fn._visibility === 'public'
}

/**
 * Check if a registered function is internal (only callable from other functions).
 *
 * Internal functions are not exposed to clients and can only be called
 * from other server-side Convex functions.
 *
 * @param fn - The value to check
 * @returns True if the value is an internal registered function
 *
 * @example
 * ```typescript
 * const q = internalQuery({ handler: async (ctx) => 'hello' });
 * console.log(isInternalFunction(q)); // true
 *
 * const public = query({ handler: async (ctx) => 'hello' });
 * console.log(isInternalFunction(public)); // false
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
 * @returns The function type literal
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' });
 * console.log(getFunctionType(q)); // 'query'
 *
 * const m = mutation({ handler: async (ctx) => 'done' });
 * console.log(getFunctionType(m)); // 'mutation'
 *
 * const a = action({ handler: async (ctx) => 'processed' });
 * console.log(getFunctionType(a)); // 'action'
 * ```
 */
export function getFunctionType(fn: AnyRegisteredFunction): FunctionType {
  return fn._type
}

/**
 * Get the visibility of a registered function ('public' or 'internal').
 *
 * @param fn - The registered function
 * @returns The function visibility literal
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' });
 * console.log(getFunctionVisibility(q)); // 'public'
 *
 * const internal = internalQuery({ handler: async (ctx) => 'hello' });
 * console.log(getFunctionVisibility(internal)); // 'internal'
 * ```
 */
export function getFunctionVisibility(fn: AnyRegisteredFunction): FunctionVisibility {
  return fn._visibility
}

/**
 * Get the args validator from a registered function.
 *
 * Returns the argument validators defined in the function configuration,
 * or undefined if no validators were specified.
 *
 * @param fn - The registered function
 * @returns The args validator, or undefined if not defined
 *
 * @example
 * ```typescript
 * const q = query({
 *   args: { id: v.string() },
 *   handler: async (ctx, args) => args.id
 * });
 *
 * const validator = getArgsValidator(q);
 * // validator is { id: v.string() }
 *
 * const noArgs = query({ handler: async (ctx) => 'hello' });
 * const validator2 = getArgsValidator(noArgs);
 * // validator2 is undefined
 * ```
 */
export function getArgsValidator(fn: AnyRegisteredFunction): ArgsValidator | undefined {
  return fn._config.args
}

/**
 * Get the returns validator from a registered function.
 *
 * Returns the return type validator defined in the function configuration,
 * or undefined if no validator was specified.
 *
 * @param fn - The registered function
 * @returns The returns validator, or undefined if not defined
 *
 * @example
 * ```typescript
 * const q = query({
 *   returns: v.string(),
 *   handler: async (ctx) => 'hello'
 * });
 *
 * const validator = getReturnsValidator(q);
 * // validator is v.string()
 *
 * const noReturns = query({ handler: async (ctx) => 'hello' });
 * const validator2 = getReturnsValidator(noReturns);
 * // validator2 is undefined
 * ```
 */
export function getReturnsValidator(fn: AnyRegisteredFunction): Validator | undefined {
  return fn._config.returns
}

/**
 * Get the handler function from a registered function.
 *
 * Returns the actual handler implementation that will be executed
 * when the function is called.
 *
 * @typeParam F - The registered function type
 *
 * @param fn - The registered function
 * @returns The handler function
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' });
 *
 * const handler = getFunctionHandler(q);
 * // handler is the async (ctx) => 'hello' function
 *
 * // Can be used to invoke directly (bypassing validation)
 * const result = await handler(ctx, {});
 * ```
 */
export function getFunctionHandler<F extends AnyRegisteredFunction>(
  fn: F
): F['_config']['handler'] {
  return fn._config.handler
}
