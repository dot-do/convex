/**
 * Action Function Builder
 *
 * Creates functions that can perform arbitrary operations including external
 * API calls, non-deterministic computations, and long-running tasks.
 *
 * Actions are the most flexible function type in Convex. They:
 * - Can call external APIs (fetch, third-party SDKs)
 * - Are not subject to determinism requirements
 * - Cannot directly access the database (must use runQuery/runMutation)
 * - Can schedule other functions for delayed execution
 * - Support argument validation with the `v` validators
 *
 * @module
 *
 * @example
 * ```typescript
 * import { action } from "convex.do/server";
 * import { v } from "convex.do/values";
 * import { api } from "./_generated/api";
 *
 * // Action that calls an external API
 * export const sendEmail = action({
 *   args: {
 *     to: v.string(),
 *     subject: v.string(),
 *     body: v.string(),
 *   },
 *   handler: async (ctx, args) => {
 *     const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
 *       method: "POST",
 *       headers: {
 *         "Content-Type": "application/json",
 *         "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
 *       },
 *       body: JSON.stringify({
 *         to: [{ email: args.to }],
 *         subject: args.subject,
 *         content: [{ type: "text/plain", value: args.body }],
 *       }),
 *     });
 *
 *     if (!response.ok) throw new Error("Failed to send email");
 *
 *     // Record in database via mutation
 *     await ctx.runMutation(api.emails.record, {
 *       to: args.to,
 *       sentAt: Date.now(),
 *     });
 *
 *     return { success: true };
 *   },
 * });
 * ```
 */

import type { Validator, ArgsValidator } from '../values'
import type { ActionCtx } from './context'
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
 * The handler function type for actions.
 *
 * Receives the ActionCtx as the first parameter and validated arguments
 * as the second parameter.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 */
export type ActionHandler<
  Args extends ArgsValidator | undefined,
  Returns
> = (
  ctx: ActionCtx,
  args: InferredArgs<Args>
) => Returns | Promise<Returns>

/**
 * Configuration for an action function.
 *
 * Defines the shape and behavior of an action, including argument validation,
 * return type validation, and the handler implementation.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 *
 * @example
 * ```typescript
 * const config: ActionConfig<{ url: Validator<string> }, Response> = {
 *   args: { url: v.string() },
 *   description: "Fetches data from external API",
 *   handler: async (ctx, args) => {
 *     const response = await fetch(args.url);
 *     return await response.json();
 *   },
 * };
 * ```
 */
export interface ActionConfig<
  Args extends ArgsValidator | undefined,
  Returns
> extends BaseFunctionConfig<Args, Returns> {
  /**
   * The action handler function.
   *
   * Receives the ActionCtx with access to:
   * - `auth`: Authentication context
   * - `storage`: Storage operations
   * - `scheduler`: Function scheduling
   * - `runQuery`: Execute queries
   * - `runMutation`: Execute mutations
   * - `runAction`: Execute other actions
   * - `vectorSearch`: Vector similarity search
   *
   * The handler can be synchronous or asynchronous.
   *
   * @param ctx - The action context
   * @param args - The validated arguments
   * @returns The action result (can be a Promise)
   *
   * @example
   * ```typescript
   * handler: async (ctx, args) => {
   *   // Call external API
   *   const apiResponse = await fetch(`https://api.example.com/${args.id}`);
   *   const data = await apiResponse.json();
   *
   *   // Store result in database
   *   await ctx.runMutation(api.results.store, { data });
   *
   *   // Schedule follow-up
   *   await ctx.scheduler.runAfter(60000, api.jobs.cleanup, { id: args.id });
   *
   *   return data;
   * }
   * ```
   */
  handler: ActionHandler<Args, Returns>
}

/**
 * A registered action function.
 *
 * This is the object returned by `action()` and `internalAction()`.
 * It contains the function metadata and configuration needed for
 * registration and execution.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 *
 * @example
 * ```typescript
 * const myAction: RegisteredAction<{ url: Validator<string> }, object> = action({
 *   args: { url: v.string() },
 *   handler: async (ctx, args) => {
 *     const response = await fetch(args.url);
 *     return response.json();
 *   },
 * });
 *
 * // Access metadata
 * console.log(myAction._type);       // 'action'
 * console.log(myAction._visibility); // 'public'
 * ```
 */
export interface RegisteredAction<
  Args extends ArgsValidator | undefined,
  Returns
> {
  /** Internal marker for action type */
  readonly _type: 'action'
  /** Internal marker for args type */
  readonly _args: Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
  /** Internal marker for return type */
  readonly _returns: Returns
  /** Visibility: public or internal */
  readonly _visibility: FunctionVisibility
  /** The configuration */
  readonly _config: ActionConfig<Args, Returns>
}

// ============================================================================
// Action Builder
// ============================================================================

/**
 * Create a public action function.
 *
 * Actions can perform arbitrary operations including:
 * - External API calls (fetch, third-party SDKs)
 * - Non-deterministic operations (random, time-based)
 * - Long-running computations
 *
 * Actions cannot directly access the database but can call queries and mutations.
 *
 * Public actions can be called from clients via the Convex HTTP API.
 *
 * @typeParam Args - The argument validator type (inferred from config.args)
 * @typeParam Returns - The return value type (inferred from handler)
 *
 * @param config - The action configuration
 * @returns A registered action function
 *
 * @example
 * ```typescript
 * import { action } from "convex.do/server";
 * import { v } from "convex.do/values";
 * import { api } from "./_generated/api";
 *
 * // Action that calls external API
 * export const sendEmail = action({
 *   args: {
 *     to: v.string(),
 *     subject: v.string(),
 *     body: v.string(),
 *   },
 *   handler: async (ctx, args) => {
 *     const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
 *       method: "POST",
 *       headers: {
 *         "Content-Type": "application/json",
 *         "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
 *       },
 *       body: JSON.stringify({
 *         personalizations: [{ to: [{ email: args.to }] }],
 *         from: { email: "noreply@example.com" },
 *         subject: args.subject,
 *         content: [{ type: "text/plain", value: args.body }],
 *       }),
 *     });
 *
 *     if (!response.ok) {
 *       throw new Error(`Failed to send email: ${response.statusText}`);
 *     }
 *
 *     // Record the email in the database
 *     await ctx.runMutation(api.emails.record, {
 *       to: args.to,
 *       subject: args.subject,
 *       sentAt: Date.now(),
 *     });
 *
 *     return { success: true };
 *   },
 * });
 *
 * // Action with vector search
 * export const searchSimilar = action({
 *   args: { query: v.string() },
 *   handler: async (ctx, args) => {
 *     // Generate embedding via external API
 *     const embedding = await generateEmbedding(args.query);
 *
 *     // Search for similar documents
 *     return await ctx.vectorSearch("documents", "by_embedding", {
 *       vector: embedding,
 *       limit: 10,
 *     });
 *   },
 * });
 * ```
 *
 * @see {@link internalAction} for actions only callable from other functions
 * @see {@link https://docs.convex.dev/functions/actions | Convex Actions Documentation}
 */
export function action<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: ActionConfig<Args, Returns>
): RegisteredAction<Args, Returns> {
  return createRegisteredFunction('action', 'public', config) as RegisteredAction<Args, Returns>
}

/**
 * Create an internal action function.
 *
 * Internal actions can only be called from other Convex functions
 * (queries, mutations, or actions), not from clients.
 *
 * Use internal actions for:
 * - Background processing and webhooks
 * - Utility functions called by other functions
 * - Actions that should not be directly exposed to clients
 * - Scheduled/cron job handlers
 *
 * @typeParam Args - The argument validator type (inferred from config.args)
 * @typeParam Returns - The return value type (inferred from handler)
 *
 * @param config - The action configuration
 * @returns A registered internal action function
 *
 * @example
 * ```typescript
 * import { internalAction } from "convex.do/server";
 * import { v } from "convex.do/values";
 * import { internal } from "./_generated/api";
 *
 * // Internal action for webhook processing
 * export const processWebhook = internalAction({
 *   args: { payload: v.any() },
 *   handler: async (ctx, args) => {
 *     // Process webhook payload
 *     const result = await processPayload(args.payload);
 *
 *     // Update database
 *     await ctx.runMutation(internal.webhooks.record, {
 *       payload: args.payload,
 *       result,
 *     });
 *
 *     return result;
 *   },
 * });
 *
 * // Internal action for scheduled cleanup
 * export const cleanupOldRecords = internalAction({
 *   handler: async (ctx) => {
 *     const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
 *     const oldRecords = await ctx.runQuery(internal.records.getOld, { cutoff });
 *
 *     for (const record of oldRecords) {
 *       await ctx.runMutation(internal.records.delete, { id: record._id });
 *     }
 *
 *     // Schedule next cleanup
 *     await ctx.scheduler.runAfter(24 * 60 * 60 * 1000, internal.jobs.cleanupOldRecords, {});
 *
 *     return { deleted: oldRecords.length };
 *   },
 * });
 * ```
 *
 * @see {@link action} for actions callable from clients
 */
export function internalAction<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: ActionConfig<Args, Returns>
): RegisteredAction<Args, Returns> {
  return createRegisteredFunction('action', 'internal', config) as RegisteredAction<Args, Returns>
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract the args type from a registered action.
 *
 * Useful for creating type-safe wrappers or utilities that work
 * with action functions.
 *
 * @typeParam A - The registered action type
 *
 * @example
 * ```typescript
 * const sendEmail = action({
 *   args: { to: v.string(), subject: v.string(), body: v.string() },
 *   handler: async (ctx, args) => ({ sent: true })
 * });
 *
 * type Args = ActionArgs<typeof sendEmail>;
 * // Result: { to: string; subject: string; body: string }
 *
 * function validateEmailInput(input: Args) {
 *   // Type-safe input handling
 * }
 * ```
 */
export type ActionArgs<A extends RegisteredAction<ArgsValidator | undefined, unknown>> =
  A['_args']

/**
 * Extract the return type from a registered action.
 *
 * Useful for typing responses and creating type-safe utilities.
 *
 * @typeParam A - The registered action type
 *
 * @example
 * ```typescript
 * const processData = action({
 *   args: { data: v.any() },
 *   handler: async (ctx, args) => {
 *     return { processed: true, count: 42 };
 *   }
 * });
 *
 * type Result = ActionReturns<typeof processData>;
 * // Result: { processed: boolean; count: number }
 *
 * function handleResult(result: Result) {
 *   // Type-safe result handling
 * }
 * ```
 */
export type ActionReturns<A extends RegisteredAction<ArgsValidator | undefined, unknown>> =
  A['_returns']
