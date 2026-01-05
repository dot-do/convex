/**
 * Action function builder
 *
 * Creates functions that can perform arbitrary operations including external API calls.
 */

import type { Validator, Infer, ArgsValidator } from '../values'
import type { ActionCtx } from './context'

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for an action function.
 */
export interface ActionConfig<
  Args extends ArgsValidator | undefined,
  Returns
> {
  /** Argument validators (optional) */
  args?: Args
  /** Return type validator (optional) */
  returns?: Validator<Returns>
  /** The action handler function */
  handler: (
    ctx: ActionCtx,
    args: Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
  ) => Returns | Promise<Returns>
}

/**
 * A registered action function.
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
  readonly _visibility: 'public' | 'internal'
  /** The configuration */
  readonly _config: ActionConfig<Args, Returns>
}

// Helper type for inferring args from validator
type InferArgs<T extends ArgsValidator> = T extends Validator<infer U>
  ? U
  : T extends Record<string, Validator>
  ? { [K in keyof T]: Infer<T[K]> }
  : never

// ============================================================================
// Action Builder
// ============================================================================

/**
 * Create a public action function.
 *
 * Actions can perform arbitrary operations including:
 * - External API calls (fetch)
 * - Non-deterministic operations
 * - Long-running computations
 *
 * Actions cannot directly access the database but can call queries and mutations.
 *
 * @example
 * ```typescript
 * import { action } from "convex.do/server";
 * import { v } from "convex.do/values";
 * import { api } from "./_generated/api";
 *
 * export const sendEmail = action({
 *   args: {
 *     to: v.string(),
 *     subject: v.string(),
 *     body: v.string(),
 *   },
 *   handler: async (ctx, args) => {
 *     // Call external API
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
 * ```
 */
export function action<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: ActionConfig<Args, Returns>
): RegisteredAction<Args, Returns> {
  return {
    _type: 'action',
    _args: undefined as unknown as Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>,
    _returns: undefined as unknown as Returns,
    _visibility: 'public',
    _config: config,
  }
}

/**
 * Create an internal action function.
 *
 * Internal actions can only be called from other functions, not from clients.
 *
 * @example
 * ```typescript
 * import { internalAction } from "convex.do/server";
 *
 * export const processWebhook = internalAction({
 *   args: { payload: v.any() },
 *   handler: async (ctx, args) => {
 *     // Process webhook payload
 *     const result = await processPayload(args.payload);
 *
 *     // Update database
 *     await ctx.runMutation(api.webhooks.record, {
 *       payload: args.payload,
 *       result,
 *     });
 *
 *     return result;
 *   },
 * });
 * ```
 */
export function internalAction<
  Args extends ArgsValidator | undefined = undefined,
  Returns = unknown
>(
  config: ActionConfig<Args, Returns>
): RegisteredAction<Args, Returns> {
  return {
    _type: 'action',
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
 * Extract the args type from a registered action.
 */
export type ActionArgs<A extends RegisteredAction<ArgsValidator | undefined, unknown>> =
  A['_args']

/**
 * Extract the return type from a registered action.
 */
export type ActionReturns<A extends RegisteredAction<ArgsValidator | undefined, unknown>> =
  A['_returns']
