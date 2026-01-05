/**
 * Mutation Function Builder - Full Implementation
 *
 * Creates type-safe mutation handlers for Convex-compatible functions.
 * Mutations can read and write to the database, and run in transactions.
 *
 * Features:
 * - Type-safe arguments with validators
 * - MutationCtx injection (db.insert, db.patch, db.replace, db.delete)
 * - Return type inference
 * - Configuration options (description, strictArgs, etc.)
 * - Argument validation and error handling
 */

import type { Validator, Infer, ArgsValidator } from '../../values'
import type { MutationCtx } from '../context'

// ============================================================================
// Types
// ============================================================================

/**
 * Helper type for inferring args from validator.
 * Supports both single Validator and Record<string, Validator> shapes.
 */
export type InferArgs<T extends ArgsValidator> = T extends Validator<infer U>
  ? U
  : T extends Record<string, Validator>
  ? { [K in keyof T]: Infer<T[K]> }
  : never

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
  /** Description of the mutation (for documentation) */
  description?: string
  /** Whether to reject extra arguments not defined in args (default: false) */
  strictArgs?: boolean
  /** The mutation handler function */
  handler: MutationHandler<Args, Returns>
}

/**
 * The mutation handler function type.
 */
export type MutationHandler<
  Args extends ArgsValidator | undefined,
  Returns
> = (
  ctx: MutationCtx,
  args: Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
) => Returns | Promise<Returns>

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

// ============================================================================
// Argument Validation
// ============================================================================

/**
 * Validate mutation arguments against the defined validators.
 *
 * @param argsValidator - The argument validators or undefined
 * @param input - The raw input to validate
 * @param strict - Whether to reject extra fields (default: false)
 * @returns The validated and parsed arguments
 * @throws Error if validation fails
 */
export function validateMutationArgs<Args extends ArgsValidator | undefined>(
  argsValidator: Args,
  input: unknown,
  strict: boolean = false
): Args extends ArgsValidator ? InferArgs<Args> : Record<string, never> {
  // If no args validator, return empty object
  if (argsValidator === undefined) {
    return {} as Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
  }

  // Handle empty validator object
  if (typeof argsValidator === 'object' && Object.keys(argsValidator).length === 0) {
    return {} as Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
  }

  // Ensure input is an object
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Arguments must be an object')
  }

  const inputObj = input as Record<string, unknown>
  const result: Record<string, unknown> = {}

  // If argsValidator is a Validator (v.object()), use it directly
  if ('parse' in argsValidator && typeof argsValidator.parse === 'function') {
    const validator = argsValidator as Validator
    return validator.parse(input) as Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
  }

  // argsValidator is a Record<string, Validator>
  const validators = argsValidator as Record<string, Validator>
  const validatorKeys = new Set(Object.keys(validators))

  // Check for extra fields in strict mode
  if (strict) {
    for (const key of Object.keys(inputObj)) {
      if (!validatorKeys.has(key)) {
        throw new Error(`Unexpected field "${key}" in arguments`)
      }
    }
  }

  // Validate each defined field
  for (const [key, validator] of Object.entries(validators)) {
    const value = inputObj[key]

    // Check for missing required fields
    if (value === undefined) {
      if (!validator.isOptional) {
        throw new Error(`Missing required field "${key}"`)
      }
      // Optional field that's undefined - skip it
      continue
    }

    // Parse and validate the value
    try {
      result[key] = validator.parse(value)
    } catch (error) {
      // Re-throw with field context if not already included
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes(`"${key}"`) || message.includes(`at ${key}`)) {
        throw error
      }
      throw new Error(`Invalid value for field "${key}": ${message}`)
    }
  }

  return result as Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
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
// Execution Functions
// ============================================================================

/**
 * Create a handler function from a registered mutation.
 *
 * This extracts the handler from the mutation config and returns it
 * ready to be executed with a context and arguments.
 *
 * @param mutation - The registered mutation
 * @returns A function that takes ctx and args and returns the result
 */
export function createMutationHandler<
  Args extends ArgsValidator | undefined,
  Returns
>(
  mutation: RegisteredMutation<Args, Returns>
): (
  ctx: MutationCtx,
  args: Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>
) => Promise<Returns> {
  return async (ctx, args) => {
    return await mutation._config.handler(ctx, args)
  }
}

/**
 * Execute a mutation with full validation.
 *
 * This validates the arguments against the mutation's validators,
 * then executes the handler with the validated arguments.
 *
 * @param mutation - The registered mutation to execute
 * @param ctx - The mutation context
 * @param rawArgs - The raw arguments to validate and pass
 * @returns The result of the mutation handler
 * @throws Error if argument validation fails
 * @throws Error if the handler throws
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
  const validatedArgs = validateMutationArgs(
    mutation._config.args,
    rawArgs,
    mutation._config.strictArgs ?? false
  )

  // Execute the handler
  const result = await mutation._config.handler(ctx, validatedArgs)

  // Optionally validate return value
  if (mutation._config.returns) {
    try {
      mutation._config.returns.parse(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Return value validation failed: ${message}`)
    }
  }

  return result
}
