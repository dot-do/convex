/**
 * Mutation Function Builder - Full Implementation
 *
 * Creates type-safe mutation handlers for Convex-compatible functions.
 * Mutations can read and write to the database, and run in transactions.
 *
 * This module provides the complete mutation implementation including:
 * - Type-safe argument validation
 * - MutationCtx injection (db.insert, db.patch, db.replace, db.delete)
 * - Return type validation
 * - Configuration options (description, strictArgs)
 * - Execution helpers for runtime validation
 *
 * @module
 *
 * @example
 * ```typescript
 * import { mutation, executeMutation } from "convex.do/server/functions/mutation";
 * import { v } from "convex.do/values";
 *
 * const createUser = mutation({
 *   args: { name: v.string(), email: v.string() },
 *   returns: v.id("users"),
 *   handler: async (ctx, args) => {
 *     return await ctx.db.insert("users", args);
 *   },
 * });
 *
 * // Execute with validation
 * const userId = await executeMutation(createUser, ctx, { name: "John", email: "john@example.com" });
 * ```
 */

import type { ArgsValidator } from '../../values'
import type { MutationCtx } from '../context'
import {
  type FunctionVisibility,
  type InferredArgs,
  type InferArgs,
  type BaseFunctionConfig,
  createRegisteredFunction,
  validateArgs,
  validateReturns,
} from './shared'

// ============================================================================
// Types
// ============================================================================

// Re-export InferArgs for backwards compatibility
export type { InferArgs }

/**
 * The mutation handler function type.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 */
export type MutationHandler<
  Args extends ArgsValidator | undefined,
  Returns
> = (
  ctx: MutationCtx,
  args: InferredArgs<Args>
) => Returns | Promise<Returns>

/**
 * Configuration for a mutation function.
 *
 * Extends BaseFunctionConfig with the mutation-specific handler type.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 */
export interface MutationConfig<
  Args extends ArgsValidator | undefined,
  Returns
> extends BaseFunctionConfig<Args, Returns> {
  /**
   * The mutation handler function.
   *
   * Receives MutationCtx with full read/write database access.
   */
  handler: MutationHandler<Args, Returns>
}

/**
 * A registered mutation function.
 *
 * Contains all metadata and configuration needed for registration and execution.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 */
export interface RegisteredMutation<
  Args extends ArgsValidator | undefined,
  Returns
> {
  /** Internal marker for mutation type */
  readonly _type: 'mutation'
  /** Internal marker for args type */
  readonly _args: InferredArgs<Args>
  /** Internal marker for return type */
  readonly _returns: Returns
  /** Visibility: public or internal */
  readonly _visibility: FunctionVisibility
  /** The configuration */
  readonly _config: MutationConfig<Args, Returns>
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract the args type from a registered mutation.
 *
 * @typeParam M - The registered mutation type
 */
export type MutationArgs<M extends RegisteredMutation<ArgsValidator | undefined, unknown>> =
  M['_args']

/**
 * Extract the return type from a registered mutation.
 *
 * @typeParam M - The registered mutation type
 */
export type MutationReturns<M extends RegisteredMutation<ArgsValidator | undefined, unknown>> =
  M['_returns']

// ============================================================================
// Argument Validation (Deprecated - Use shared.validateArgs)
// ============================================================================

/**
 * Validate mutation arguments against the defined validators.
 *
 * This is a compatibility export that delegates to the shared validateArgs function.
 * Prefer using validateArgs from './shared' for new code.
 *
 * @param argsValidator - The argument validators or undefined
 * @param input - The raw input to validate
 * @param strict - Whether to reject extra fields (default: false)
 * @returns The validated and parsed arguments
 * @throws Error if validation fails
 *
 * @deprecated Use validateArgs from './shared' instead
 */
export function validateMutationArgs<Args extends ArgsValidator | undefined>(
  argsValidator: Args,
  input: unknown,
  strict: boolean = false
): InferredArgs<Args> {
  return validateArgs(argsValidator, input, strict)
}

// ============================================================================
// Mutation Builder Functions
// ============================================================================

/**
 * Create a public mutation function.
 *
 * Mutations can read and write to the database. They run in a transaction
 * and are automatically retried on conflicts.
 *
 * @typeParam Args - The argument validator type (inferred from config.args)
 * @typeParam Returns - The return value type (inferred from handler)
 *
 * @param config - The mutation configuration
 * @returns A registered mutation function
 *
 * @example
 * ```typescript
 * import { mutation } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * export const sendMessage = mutation({
 *   args: {
 *     channel: v.id("channels"),
 *     body: v.string(),
 *   },
 *   handler: async (ctx, args) => {
 *     const identity = await ctx.auth.getUserIdentity();
 *     if (!identity) throw new Error("Not authenticated");
 *
 *     return await ctx.db.insert("messages", {
 *       channel: args.channel,
 *       body: args.body,
 *       author: identity.tokenIdentifier,
 *     });
 *   },
 * });
 * ```
 */
export function mutation<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: MutationConfig<Args, Returns>
): RegisteredMutation<Args, Returns> {
  return createRegisteredFunction('mutation', 'public', config) as unknown as RegisteredMutation<Args, Returns>
}

/**
 * Create an internal mutation function.
 *
 * Internal mutations can only be called from other functions, not from clients.
 *
 * @typeParam Args - The argument validator type (inferred from config.args)
 * @typeParam Returns - The return value type (inferred from handler)
 *
 * @param config - The mutation configuration
 * @returns A registered internal mutation function
 *
 * @example
 * ```typescript
 * import { internalMutation } from "convex.do/server";
 *
 * export const updateUserStats = internalMutation({
 *   args: { userId: v.id("users"), increment: v.number() },
 *   handler: async (ctx, args) => {
 *     const user = await ctx.db.get(args.userId);
 *     if (!user) throw new Error("User not found");
 *
 *     await ctx.db.patch(args.userId, {
 *       messageCount: (user.messageCount ?? 0) + args.increment,
 *     });
 *   },
 * });
 * ```
 */
export function internalMutation<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: MutationConfig<Args, Returns>
): RegisteredMutation<Args, Returns> {
  return createRegisteredFunction('mutation', 'internal', config) as unknown as RegisteredMutation<Args, Returns>
}

// ============================================================================
// Execution Functions
// ============================================================================

/**
 * Create a handler function from a registered mutation.
 *
 * This extracts the handler from the mutation config and returns it
 * ready to be executed with a context and arguments.
 *
 * Note: This does NOT perform argument validation. Use executeMutation
 * for full validation support.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 *
 * @param mutation - The registered mutation
 * @returns A function that takes ctx and args and returns the result
 *
 * @example
 * ```typescript
 * const myMutation = mutation({
 *   args: { name: v.string() },
 *   handler: async (ctx, args) => args.name,
 * });
 *
 * const handler = createMutationHandler(myMutation);
 * const result = await handler(ctx, { name: "test" });
 * ```
 */
export function createMutationHandler<
  Args extends ArgsValidator | undefined,
  Returns
>(
  mutation: RegisteredMutation<Args, Returns>
): (
  ctx: MutationCtx,
  args: InferredArgs<Args>
) => Promise<Returns> {
  return async (ctx, args) => {
    return await mutation._config.handler(ctx, args)
  }
}

/**
 * Execute a mutation with full validation.
 *
 * This validates the arguments against the mutation's validators,
 * executes the handler with the validated arguments, and optionally
 * validates the return value.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 *
 * @param mutation - The registered mutation to execute
 * @param ctx - The mutation context
 * @param rawArgs - The raw arguments to validate and pass
 * @returns The result of the mutation handler
 * @throws Error if argument validation fails
 * @throws Error if return value validation fails
 * @throws Error if the handler throws
 *
 * @example
 * ```typescript
 * const createUser = mutation({
 *   args: { name: v.string(), email: v.string() },
 *   returns: v.id("users"),
 *   handler: async (ctx, args) => ctx.db.insert("users", args),
 * });
 *
 * // Execute with validation
 * const userId = await executeMutation(createUser, ctx, {
 *   name: "John",
 *   email: "john@example.com",
 * });
 *
 * // Throws if validation fails
 * await executeMutation(createUser, ctx, { name: 123 }); // Error: Expected string
 * ```
 */
export async function executeMutation<
  Args extends ArgsValidator | undefined,
  Returns
>(
  mutation: RegisteredMutation<Args, Returns>,
  ctx: MutationCtx,
  rawArgs: unknown
): Promise<Returns> {
  // Validate arguments
  const validatedArgs = validateArgs(
    mutation._config.args,
    rawArgs,
    mutation._config.strictArgs ?? false
  )

  // Execute the handler
  const result = await mutation._config.handler(ctx, validatedArgs as InferredArgs<Args>)

  // Optionally validate return value
  validateReturns(mutation._config.returns, result)

  return result
}
