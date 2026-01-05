/**
 * Mutation function builder
 *
 * Creates functions that can read and write to the database.
 */

import type { Validator, Infer, ArgsValidator } from '../values'
import type { MutationCtx } from './context'

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for a mutation function.
 */
export interface MutationConfig<
  Args extends ArgsValidator | undefined,
  Returns
> {
  /** Argument validators (optional) */
  args?: Args
  /** Return type validator (optional) */
  returns?: Validator<Returns>
  /** The mutation handler function */
  handler: (
    ctx: MutationCtx,
    args: Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
  ) => Returns | Promise<Returns>
}

/**
 * A registered mutation function.
 */
export interface RegisteredMutation<
  Args extends ArgsValidator | undefined,
  Returns
> {
  /** Internal marker for mutation type */
  readonly _type: 'mutation'
  /** Internal marker for args type */
  readonly _args: Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
  /** Internal marker for return type */
  readonly _returns: Returns
  /** Visibility: public or internal */
  readonly _visibility: 'public' | 'internal'
  /** The configuration */
  readonly _config: MutationConfig<Args, Returns>
}

// Helper type for inferring args from validator
type InferArgs<T extends ArgsValidator> = T extends Validator<infer U>
  ? U
  : T extends Record<string, Validator>
  ? { [K in keyof T]: Infer<T[K]> }
  : never

// ============================================================================
// Mutation Builder
// ============================================================================

/**
 * Create a public mutation function.
 *
 * Mutations can read and write to the database. They run in a transaction
 * and are automatically retried on conflicts.
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
  return {
    _type: 'mutation',
    _args: undefined as unknown as Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>,
    _returns: undefined as unknown as Returns,
    _visibility: 'public',
    _config: config,
  }
}

/**
 * Create an internal mutation function.
 *
 * Internal mutations can only be called from other functions, not from clients.
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
  return {
    _type: 'mutation',
    _args: undefined as unknown as Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>,
    _returns: undefined as unknown as Returns,
    _visibility: 'internal',
    _config: config,
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract the args type from a registered mutation.
 */
export type MutationArgs<M extends RegisteredMutation<ArgsValidator | undefined, unknown>> =
  M['_args']

/**
 * Extract the return type from a registered mutation.
 */
export type MutationReturns<M extends RegisteredMutation<ArgsValidator | undefined, unknown>> =
  M['_returns']
