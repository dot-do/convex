/**
 * Query function builder
 *
 * Creates read-only, deterministic query functions.
 */

import type { Validator, Infer, ArgsValidator } from '../values'
import type { QueryCtx } from './context'

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for a query function.
 */
export interface QueryConfig<
  Args extends ArgsValidator | undefined,
  Returns
> {
  /** Argument validators (optional) */
  args?: Args
  /** Return type validator (optional) */
  returns?: Validator<Returns>
  /** The query handler function */
  handler: (
    ctx: QueryCtx,
    args: Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
  ) => Returns | Promise<Returns>
}

/**
 * A registered query function.
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
  readonly _visibility: 'public' | 'internal'
  /** The configuration */
  readonly _config: QueryConfig<Args, Returns>
}

// Helper type for inferring args from validator
type InferArgs<T extends ArgsValidator> = T extends Validator<infer U>
  ? U
  : T extends Record<string, Validator>
  ? { [K in keyof T]: Infer<T[K]> }
  : never

// ============================================================================
// Query Builder
// ============================================================================

/**
 * Create a public query function.
 *
 * Queries are read-only, deterministic functions that can read from the database.
 * They automatically participate in real-time subscriptions.
 *
 * @example
 * ```typescript
 * import { query } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * export const listMessages = query({
 *   args: { channel: v.id("channels") },
 *   handler: async (ctx, args) => {
 *     return await ctx.db
 *       .query("messages")
 *       .withIndex("by_channel", (q) => q.eq("channel", args.channel))
 *       .collect();
 *   },
 * });
 * ```
 */
export function query<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: QueryConfig<Args, Returns>
): RegisteredQuery<Args, Returns> {
  return {
    _type: 'query',
    _args: undefined as unknown as Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>,
    _returns: undefined as unknown as Returns,
    _visibility: 'public',
    _config: config,
  }
}

/**
 * Create an internal query function.
 *
 * Internal queries can only be called from other functions, not from clients.
 *
 * @example
 * ```typescript
 * import { internalQuery } from "convex.do/server";
 *
 * export const getUser = internalQuery({
 *   args: { userId: v.id("users") },
 *   handler: async (ctx, args) => {
 *     return await ctx.db.get(args.userId);
 *   },
 * });
 * ```
 */
export function internalQuery<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: QueryConfig<Args, Returns>
): RegisteredQuery<Args, Returns> {
  return {
    _type: 'query',
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
 * Extract the args type from a registered query.
 */
export type QueryArgs<Q extends RegisteredQuery<ArgsValidator | undefined, unknown>> =
  Q['_args']

/**
 * Extract the return type from a registered query.
 */
export type QueryReturns<Q extends RegisteredQuery<ArgsValidator | undefined, unknown>> =
  Q['_returns']
