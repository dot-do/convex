/**
 * Query Function Builder
 *
 * Creates read-only, deterministic query functions that can read from the database
 * and automatically participate in real-time subscriptions.
 *
 * Queries are the primary way to fetch data in Convex applications. They:
 * - Are read-only (no writes to database)
 * - Must be deterministic (same inputs produce same outputs)
 * - Automatically trigger re-renders when underlying data changes
 * - Support argument validation with the `v` validators
 *
 * @module
 *
 * @example
 * ```typescript
 * import { query } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * // Simple query with no arguments
 * export const list = query({
 *   handler: async (ctx) => {
 *     return await ctx.db.query("messages").collect();
 *   },
 * });
 *
 * // Query with typed arguments
 * export const getById = query({
 *   args: { id: v.id("messages") },
 *   handler: async (ctx, args) => {
 *     return await ctx.db.get(args.id);
 *   },
 * });
 * ```
 */

import type { Validator, ArgsValidator } from '../values'
import type { QueryCtx } from './context'
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
 * The handler function type for queries.
 *
 * Receives the QueryCtx as the first parameter and validated arguments
 * as the second parameter.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 */
export type QueryHandler<
  Args extends ArgsValidator | undefined,
  Returns
> = (
  ctx: QueryCtx,
  args: InferredArgs<Args>
) => Returns | Promise<Returns>

/**
 * Configuration for a query function.
 *
 * Defines the shape and behavior of a query, including argument validation,
 * return type validation, and the handler implementation.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 *
 * @example
 * ```typescript
 * const config: QueryConfig<{ id: Validator<string> }, User | null> = {
 *   args: { id: v.string() },
 *   returns: v.nullable(v.object({ name: v.string() })),
 *   handler: async (ctx, args) => {
 *     return await ctx.db.get(args.id);
 *   },
 * };
 * ```
 */
export interface QueryConfig<
  Args extends ArgsValidator | undefined,
  Returns
> extends BaseFunctionConfig<Args, Returns> {
  /**
   * The query handler function.
   *
   * Receives the QueryCtx with read-only database access, authentication,
   * and storage contexts.
   *
   * The handler can be synchronous or asynchronous.
   *
   * @param ctx - The query context with read-only access
   * @param args - The validated arguments
   * @returns The query result (can be a Promise)
   *
   * @example
   * ```typescript
   * handler: async (ctx, args) => {
   *   const user = await ctx.db.get(args.userId);
   *   return user;
   * }
   * ```
   */
  handler: QueryHandler<Args, Returns>
}

/**
 * A registered query function.
 *
 * This is the object returned by `query()` and `internalQuery()`.
 * It contains the function metadata and configuration needed for
 * registration and execution.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 *
 * @example
 * ```typescript
 * const myQuery: RegisteredQuery<{ id: Validator<string> }, User | null> = query({
 *   args: { id: v.string() },
 *   handler: async (ctx, args) => ctx.db.get(args.id),
 * });
 *
 * // Access metadata
 * console.log(myQuery._type);       // 'query'
 * console.log(myQuery._visibility); // 'public'
 * ```
 */
export interface RegisteredQuery<
  Args extends ArgsValidator | undefined,
  Returns
> {
  /** Internal marker for query type */
  readonly _type: 'query'
  /** Internal marker for args type */
  readonly _args: Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
  /** Internal marker for return type */
  readonly _returns: Returns
  /** Visibility: public or internal */
  readonly _visibility: FunctionVisibility
  /** The configuration */
  readonly _config: QueryConfig<Args, Returns>
}

// ============================================================================
// Query Builder
// ============================================================================

/**
 * Create a public query function.
 *
 * Queries are read-only, deterministic functions that can read from the database.
 * They automatically participate in real-time subscriptions, meaning any component
 * using a query will re-render when the underlying data changes.
 *
 * Public queries can be called from clients via the Convex HTTP API.
 *
 * @typeParam Args - The argument validator type (inferred from config.args)
 * @typeParam Returns - The return value type (inferred from handler)
 *
 * @param config - The query configuration
 * @returns A registered query function
 *
 * @example
 * ```typescript
 * import { query } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * // Query with typed arguments and return validation
 * export const listMessages = query({
 *   args: { channel: v.id("channels") },
 *   returns: v.array(v.object({
 *     _id: v.id("messages"),
 *     body: v.string(),
 *   })),
 *   handler: async (ctx, args) => {
 *     return await ctx.db
 *       .query("messages")
 *       .withIndex("by_channel", (q) => q.eq("channel", args.channel))
 *       .collect();
 *   },
 * });
 *
 * // Simple query without arguments
 * export const count = query({
 *   handler: async (ctx) => {
 *     const messages = await ctx.db.query("messages").collect();
 *     return messages.length;
 *   },
 * });
 * ```
 *
 * @see {@link internalQuery} for queries only callable from other functions
 * @see {@link https://docs.convex.dev/functions/query-functions | Convex Query Functions Documentation}
 */
export function query<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: QueryConfig<Args, Returns>
): RegisteredQuery<Args, Returns> {
  return createRegisteredFunction('query', 'public', config) as RegisteredQuery<Args, Returns>
}

/**
 * Create an internal query function.
 *
 * Internal queries can only be called from other Convex functions
 * (queries, mutations, or actions), not from clients.
 *
 * Use internal queries for:
 * - Utility functions called by other functions
 * - Queries that access sensitive data
 * - Reusable data fetching logic
 *
 * @typeParam Args - The argument validator type (inferred from config.args)
 * @typeParam Returns - The return value type (inferred from handler)
 *
 * @param config - The query configuration
 * @returns A registered internal query function
 *
 * @example
 * ```typescript
 * import { internalQuery } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * // Internal query for fetching user by token
 * export const getUserByToken = internalQuery({
 *   args: { tokenIdentifier: v.string() },
 *   handler: async (ctx, args) => {
 *     return await ctx.db
 *       .query("users")
 *       .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
 *       .first();
 *   },
 * });
 *
 * // Called from another function
 * export const getProfile = query({
 *   handler: async (ctx) => {
 *     const identity = await ctx.auth.getUserIdentity();
 *     if (!identity) return null;
 *     // Call the internal query
 *     return await ctx.runQuery(internal.users.getUserByToken, {
 *       tokenIdentifier: identity.tokenIdentifier,
 *     });
 *   },
 * });
 * ```
 *
 * @see {@link query} for queries callable from clients
 */
export function internalQuery<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: QueryConfig<Args, Returns>
): RegisteredQuery<Args, Returns> {
  return createRegisteredFunction('query', 'internal', config) as RegisteredQuery<Args, Returns>
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract the args type from a registered query.
 *
 * Useful for creating type-safe wrappers or utilities that work
 * with query functions.
 *
 * @typeParam Q - The registered query type
 *
 * @example
 * ```typescript
 * const myQuery = query({
 *   args: { id: v.string(), limit: v.optional(v.number()) },
 *   handler: async (ctx, args) => []
 * });
 *
 * type Args = QueryArgs<typeof myQuery>;
 * // Result: { id: string; limit?: number }
 *
 * function callQuery(args: Args) {
 *   // Type-safe argument handling
 * }
 * ```
 */
export type QueryArgs<Q extends RegisteredQuery<ArgsValidator | undefined, unknown>> =
  Q['_args']

/**
 * Extract the return type from a registered query.
 *
 * Useful for typing responses and creating type-safe utilities.
 *
 * @typeParam Q - The registered query type
 *
 * @example
 * ```typescript
 * const getUser = query({
 *   args: { id: v.id("users") },
 *   handler: async (ctx, args) => {
 *     return await ctx.db.get(args.id);
 *   }
 * });
 *
 * type UserResult = QueryReturns<typeof getUser>;
 * // Result: the return type of the handler
 *
 * function processResult(result: UserResult) {
 *   // Type-safe result handling
 * }
 * ```
 */
export type QueryReturns<Q extends RegisteredQuery<ArgsValidator | undefined, unknown>> =
  Q['_returns']
