/**
 * Internal Function Builders
 *
 * Creates internal query, mutation, and action functions that are NOT
 * exposed via HTTP/public API and can only be called from other Convex functions.
 *
 * Internal functions provide a way to:
 * - Share common logic between functions without exposing it to clients
 * - Implement background processing handlers
 * - Create utility functions for database operations
 * - Handle webhooks and scheduled jobs securely
 *
 * These are re-exported from the existing implementations in query.ts,
 * mutation.ts, and action.ts for convenience.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { internalQuery, internalMutation, internalAction } from "convex.do/server/functions/internal";
 * import { v } from "convex.do/values";
 *
 * // Internal query - only callable from other functions
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
 * // Internal mutation - for background processing
 * export const updateStats = internalMutation({
 *   args: { userId: v.id("users") },
 *   handler: async (ctx, args) => {
 *     const user = await ctx.db.get(args.userId);
 *     await ctx.db.patch(args.userId, { lastSeen: Date.now() });
 *   },
 * });
 *
 * // Internal action - for webhooks and external API calls
 * export const processWebhook = internalAction({
 *   args: { payload: v.any() },
 *   handler: async (ctx, args) => {
 *     // Process webhook, call external APIs, etc.
 *   },
 * });
 * ```
 */

// Re-export internal function builders from their respective modules
export { internalQuery } from '../query'
export { internalMutation } from '../mutation'
export { internalAction } from '../action'

// Re-export types for convenience
export type { RegisteredQuery, QueryConfig, QueryArgs, QueryReturns } from '../query'
export type { RegisteredMutation, MutationConfig, MutationArgs, MutationReturns } from '../mutation'
export type { RegisteredAction, ActionConfig, ActionArgs, ActionReturns } from '../action'

// Re-export shared utilities
export {
  type FunctionType,
  type FunctionVisibility,
  type InferredArgs,
  type BaseFunctionConfig,
} from './shared'
