/**
 * Mutation Function Builder
 *
 * Creates functions that can read and write to the database, running in
 * ACID transactions with automatic conflict detection and retry.
 *
 * Mutations are the primary way to modify data in Convex applications. They:
 * - Can read and write to the database
 * - Run in serializable transactions
 * - Are automatically retried on conflicts (optimistic concurrency control)
 * - Support argument validation with the `v` validators
 * - Can schedule other functions for delayed execution
 *
 * @module
 *
 * @example
 * ```typescript
 * import { mutation } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * // Create a new message
 * export const create = mutation({
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

import type { Validator, ArgsValidator } from '../values'
import type { MutationCtx } from './context'
import {
  type FunctionVisibility,
  type InferredArgs,
  type InferArgs,
  type BaseFunctionConfig,
  createRegisteredFunction,
} from './functions/shared'

// ============================================================================
// Types
// ============================================================================

/**
 * The handler function type for mutations.
 *
 * Receives the MutationCtx as the first parameter and validated arguments
 * as the second parameter.
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
 * Defines the shape and behavior of a mutation, including argument validation,
 * return type validation, and the handler implementation.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 *
 * @example
 * ```typescript
 * const config: MutationConfig<{ name: Validator<string> }, string> = {
 *   args: { name: v.string() },
 *   description: "Creates a new user",
 *   handler: async (ctx, args) => {
 *     return await ctx.db.insert("users", { name: args.name });
 *   },
 * };
 * ```
 */
export interface MutationConfig<
  Args extends ArgsValidator | undefined,
  Returns
> extends BaseFunctionConfig<Args, Returns> {
  /**
   * The mutation handler function.
   *
   * Receives the MutationCtx with read/write database access, authentication,
   * storage, and scheduler contexts.
   *
   * The handler can be synchronous or asynchronous.
   *
   * @param ctx - The mutation context with read/write access
   * @param args - The validated arguments
   * @returns The mutation result (can be a Promise)
   *
   * @example
   * ```typescript
   * handler: async (ctx, args) => {
   *   // Insert a new document
   *   const id = await ctx.db.insert("users", { name: args.name });
   *
   *   // Schedule a follow-up action
   *   await ctx.scheduler.runAfter(5000, api.emails.sendWelcome, { userId: id });
   *
   *   return id;
   * }
   * ```
   */
  handler: MutationHandler<Args, Returns>
}

/**
 * A registered mutation function.
 *
 * This is the object returned by `mutation()` and `internalMutation()`.
 * It contains the function metadata and configuration needed for
 * registration and execution.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 *
 * @example
 * ```typescript
 * const myMutation: RegisteredMutation<{ name: Validator<string> }, string> = mutation({
 *   args: { name: v.string() },
 *   handler: async (ctx, args) => ctx.db.insert("users", { name: args.name }),
 * });
 *
 * // Access metadata
 * console.log(myMutation._type);       // 'mutation'
 * console.log(myMutation._visibility); // 'public'
 * ```
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
  readonly _visibility: FunctionVisibility
  /** The configuration */
  readonly _config: MutationConfig<Args, Returns>
}

// ============================================================================
// Mutation Builder
// ============================================================================

/**
 * Create a public mutation function.
 *
 * Mutations can read and write to the database. They run in serializable
 * transactions and are automatically retried on conflicts.
 *
 * Public mutations can be called from clients via the Convex HTTP API.
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
 * // Mutation with typed arguments
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
 *
 * // Mutation with document updates
 * export const like = mutation({
 *   args: { postId: v.id("posts") },
 *   handler: async (ctx, args) => {
 *     const post = await ctx.db.get(args.postId);
 *     if (!post) throw new Error("Post not found");
 *
 *     await ctx.db.patch(args.postId, {
 *       likes: (post.likes ?? 0) + 1,
 *     });
 *   },
 * });
 * ```
 *
 * @see {@link internalMutation} for mutations only callable from other functions
 * @see {@link https://docs.convex.dev/functions/mutation-functions | Convex Mutation Functions Documentation}
 */
export function mutation<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: MutationConfig<Args, Returns>
): RegisteredMutation<Args, Returns> {
  return createRegisteredFunction('mutation', 'public', config) as RegisteredMutation<Args, Returns>
}

/**
 * Create an internal mutation function.
 *
 * Internal mutations can only be called from other Convex functions
 * (queries, mutations, or actions), not from clients.
 *
 * Use internal mutations for:
 * - Utility functions called by other functions
 * - Mutations that should not be directly exposed to clients
 * - Background processing triggered by actions
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
 * import { v } from "convex.do/values";
 *
 * // Internal mutation for updating user stats
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
 *
 * // Called from an action after processing
 * export const processData = action({
 *   handler: async (ctx) => {
 *     // ... process data ...
 *     await ctx.runMutation(internal.users.updateUserStats, {
 *       userId: "user_123",
 *       increment: 1,
 *     });
 *   },
 * });
 * ```
 *
 * @see {@link mutation} for mutations callable from clients
 */
export function internalMutation<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: MutationConfig<Args, Returns>
): RegisteredMutation<Args, Returns> {
  return createRegisteredFunction('mutation', 'internal', config) as RegisteredMutation<Args, Returns>
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract the args type from a registered mutation.
 *
 * Useful for creating type-safe wrappers or utilities that work
 * with mutation functions.
 *
 * @typeParam M - The registered mutation type
 *
 * @example
 * ```typescript
 * const createUser = mutation({
 *   args: { name: v.string(), email: v.string() },
 *   handler: async (ctx, args) => ctx.db.insert("users", args)
 * });
 *
 * type Args = MutationArgs<typeof createUser>;
 * // Result: { name: string; email: string }
 *
 * function validateUserInput(input: Args) {
 *   // Type-safe input handling
 * }
 * ```
 */
export type MutationArgs<M extends RegisteredMutation<ArgsValidator | undefined, unknown>> =
  M['_args']

/**
 * Extract the return type from a registered mutation.
 *
 * Useful for typing responses and creating type-safe utilities.
 *
 * @typeParam M - The registered mutation type
 *
 * @example
 * ```typescript
 * const createUser = mutation({
 *   args: { name: v.string() },
 *   handler: async (ctx, args) => {
 *     return await ctx.db.insert("users", { name: args.name });
 *   }
 * });
 *
 * type UserId = MutationReturns<typeof createUser>;
 * // Result: Id<"users">
 *
 * function handleCreatedUser(id: UserId) {
 *   // Type-safe result handling
 * }
 * ```
 */
export type MutationReturns<M extends RegisteredMutation<ArgsValidator | undefined, unknown>> =
  M['_returns']
