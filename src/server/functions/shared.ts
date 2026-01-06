/**
 * Shared Function Builder Utilities
 *
 * This module provides common types, helpers, and utilities used by
 * query(), mutation(), and action() function builders.
 *
 * The shared utilities reduce code duplication and ensure consistent
 * behavior across all function types.
 *
 * @module
 */

import type { Validator, Infer, ArgsValidator } from '../../values'
import { VALIDATOR_BRAND, isValidator } from '../../values'

// ============================================================================
// Shared Types
// ============================================================================

/**
 * Function type literals used throughout the function builder system.
 *
 * - `query`: Read-only, deterministic functions that can read from the database
 * - `mutation`: Read/write functions that run in transactions
 * - `action`: Functions that can perform arbitrary operations including external API calls
 */
export type FunctionType = 'query' | 'mutation' | 'action'

/**
 * Function visibility levels.
 *
 * - `public`: Functions callable from clients via HTTP API
 * - `internal`: Functions only callable from other server-side functions
 */
export type FunctionVisibility = 'public' | 'internal'

/**
 * Helper type for inferring args from a validator.
 *
 * Supports both single Validator and Record<string, Validator> shapes,
 * providing flexibility in how function arguments are defined.
 *
 * @typeParam T - The args validator type (either a Validator or Record<string, Validator>)
 *
 * @example
 * ```typescript
 * // With a single v.object() validator
 * type Args1 = InferArgs<Validator<{ name: string }>>
 * // Result: { name: string }
 *
 * // With a record of validators
 * type Args2 = InferArgs<{ name: Validator<string>, age: Validator<number> }>
 * // Result: { name: string, age: number }
 * ```
 */
export type InferArgs<T extends ArgsValidator> = T extends Validator<infer U>
  ? U
  : T extends Record<string, Validator>
  ? { [K in keyof T]: Infer<T[K]> }
  : never

/**
 * Inferred args type based on whether args validator is defined.
 *
 * When no args validator is provided, returns `Record<string, never>` (empty object type).
 * When an args validator is provided, infers the args type from it.
 *
 * @typeParam Args - The args validator type, or undefined
 */
export type InferredArgs<Args extends ArgsValidator | undefined> =
  Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>

// ============================================================================
// Base Configuration Interface
// ============================================================================

/**
 * Base configuration interface shared by all function types.
 *
 * This interface defines the common configuration options available
 * to query, mutation, and action functions.
 *
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 */
export interface BaseFunctionConfig<
  Args extends ArgsValidator | undefined,
  Returns
> {
  /**
   * Argument validators for the function.
   *
   * Can be either:
   * - A record of field validators: `{ name: v.string(), age: v.number() }`
   * - A single v.object() validator: `v.object({ name: v.string() })`
   *
   * When omitted, the function accepts no arguments.
   *
   * @example
   * ```typescript
   * // Record of validators
   * args: { name: v.string(), age: v.number() }
   *
   * // Single v.object() validator
   * args: v.object({ name: v.string(), age: v.number() })
   * ```
   */
  args?: Args

  /**
   * Return type validator for the function.
   *
   * When provided, the return value can be validated at runtime
   * to ensure type safety across the client-server boundary.
   *
   * @example
   * ```typescript
   * returns: v.object({ id: v.id("users"), name: v.string() })
   * ```
   */
  returns?: Validator<Returns>

  /**
   * Description of the function for documentation purposes.
   *
   * This description is used for code generation, API documentation,
   * and developer tooling.
   *
   * @example
   * ```typescript
   * description: "Retrieves a user by their unique identifier"
   * ```
   */
  description?: string

  /**
   * Whether to reject extra arguments not defined in args.
   *
   * When `true`, the function will throw an error if the caller
   * provides any arguments not specified in the args validator.
   *
   * @default false
   *
   * @example
   * ```typescript
   * // With strictArgs: true, calling with { name: "John", extra: "field" }
   * // will throw an error since "extra" is not defined in args
   * strictArgs: true
   * ```
   */
  strictArgs?: boolean
}

// ============================================================================
// Registered Function Interface
// ============================================================================

/**
 * Base interface for all registered function types.
 *
 * This interface defines the shape of a registered function object,
 * which contains metadata and configuration for execution.
 *
 * @typeParam Type - The function type literal ('query' | 'mutation' | 'action')
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 * @typeParam Config - The specific configuration type for this function type
 */
export interface RegisteredFunctionBase<
  Type extends FunctionType,
  Args extends ArgsValidator | undefined,
  Returns,
  Config extends BaseFunctionConfig<Args, Returns>
> {
  /**
   * Internal marker indicating the function type.
   *
   * Used for type guards and runtime type checking.
   */
  readonly _type: Type

  /**
   * Internal marker for args type inference.
   *
   * This phantom type is used for compile-time type checking
   * and does not contain actual values at runtime.
   */
  readonly _args: InferredArgs<Args>

  /**
   * Internal marker for return type inference.
   *
   * This phantom type is used for compile-time type checking
   * and does not contain actual values at runtime.
   */
  readonly _returns: Returns

  /**
   * Function visibility level (public or internal).
   *
   * Determines whether the function can be called from clients
   * or only from other server-side functions.
   */
  readonly _visibility: FunctionVisibility

  /**
   * The function configuration including handler and validators.
   */
  readonly _config: Config
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a placeholder value for phantom type markers.
 *
 * This utility casts `undefined` to the desired type for use as
 * phantom type markers in registered function objects.
 *
 * @typeParam T - The type to create a phantom value for
 * @returns An undefined value cast to type T
 *
 * @internal
 */
export function phantomType<T>(): T {
  return undefined as unknown as T
}

/**
 * Creates a registered function object with the given configuration.
 *
 * This factory function constructs the registered function object
 * with all required metadata and configuration properties.
 *
 * @typeParam Type - The function type literal
 * @typeParam Args - The argument validator type
 * @typeParam Returns - The return value type
 * @typeParam Config - The configuration type
 *
 * @param type - The function type ('query' | 'mutation' | 'action')
 * @param visibility - The function visibility ('public' | 'internal')
 * @param config - The function configuration including handler
 * @returns A registered function object ready for use
 *
 * @internal
 */
export function createRegisteredFunction<
  Type extends FunctionType,
  Args extends ArgsValidator | undefined,
  Returns,
  Config extends BaseFunctionConfig<Args, Returns>
>(
  type: Type,
  visibility: FunctionVisibility,
  config: Config
): RegisteredFunctionBase<Type, Args, Returns, Config> {
  return {
    _type: type,
    _args: phantomType<InferredArgs<Args>>(),
    _returns: phantomType<Returns>(),
    _visibility: visibility,
    _config: config,
  }
}

// ============================================================================
// Argument Validation
// ============================================================================

/**
 * Validates function arguments against the provided validator(s).
 *
 * This function handles both single Validator and Record<string, Validator>
 * argument formats, providing consistent validation behavior across all
 * function types.
 *
 * @typeParam Args - The argument validator type
 *
 * @param argsValidator - The argument validators, or undefined for no validation
 * @param input - The raw input to validate
 * @param strict - Whether to reject extra fields not in the validator
 * @returns The validated and parsed arguments
 * @throws Error if validation fails with descriptive error messages
 *
 * @example
 * ```typescript
 * // Validate with record of validators
 * const args = validateArgs(
 *   { name: v.string(), age: v.number() },
 *   { name: "John", age: 30 },
 *   false
 * )
 *
 * // Validate with single v.object() validator
 * const args = validateArgs(
 *   v.object({ name: v.string() }),
 *   { name: "John" },
 *   false
 * )
 *
 * // With strict mode, extra fields throw errors
 * validateArgs({ name: v.string() }, { name: "John", extra: "value" }, true)
 * // Throws: Unexpected field "extra" in arguments
 * ```
 */
export function validateArgs<Args extends ArgsValidator | undefined>(
  argsValidator: Args,
  input: unknown,
  strict: boolean = false
): InferredArgs<Args> {
  // If no args validator, return empty object
  if (argsValidator === undefined) {
    return {} as InferredArgs<Args>
  }

  // Handle empty validator object
  // But first, check it's not trying to be a fake validator with parse
  if (typeof argsValidator === 'object' && Object.keys(argsValidator).length === 0) {
    // Check for duck-typed fakes that have parse but no enumerable keys (e.g., Proxies)
    if ('parse' in argsValidator) {
      throw new Error('Invalid validator: object has parse method but is not a genuine Validator instance')
    }
    return {} as InferredArgs<Args>
  }

  // Ensure input is an object
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Arguments must be an object')
  }

  const inputObj = input as Record<string, unknown>
  const result: Record<string, unknown> = {}

  // If argsValidator is a Validator (v.object()), use it directly
  // Use Symbol-based branding to verify it's a genuine validator, not a duck-typed fake
  if (isValidator(argsValidator)) {
    return argsValidator.parse(input) as InferredArgs<Args>
  }

  // Check if it looks like a validator but isn't (security check)
  if ('parse' in argsValidator && typeof (argsValidator as { parse?: unknown }).parse === 'function') {
    throw new Error('Invalid validator: object has parse method but is not a genuine Validator instance')
  }

  // argsValidator is a Record<string, Validator>
  const validators = argsValidator as Record<string, Validator>
  const validatorKeys = new Set(Object.keys(validators))

  // Validate that all field validators are genuine Validators
  for (const [key, validator] of Object.entries(validators)) {
    if (!isValidator(validator)) {
      throw new Error(`Invalid validator for field "${key}": not a genuine Validator instance`)
    }
  }

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

  return result as InferredArgs<Args>
}

/**
 * Validates the return value of a function against its return type validator.
 *
 * This function is called after the handler executes to ensure the return
 * value matches the expected type.
 *
 * @typeParam Returns - The expected return type
 *
 * @param returnsValidator - The return type validator, or undefined for no validation
 * @param result - The actual return value to validate
 * @throws Error if validation fails
 *
 * @example
 * ```typescript
 * // Validate return value
 * validateReturns(v.object({ id: v.string() }), { id: "123" })
 * // Returns successfully
 *
 * // Invalid return value
 * validateReturns(v.object({ id: v.string() }), { id: 123 })
 * // Throws: Return value validation failed: Expected string, got number
 * ```
 */
export function validateReturns<Returns>(
  returnsValidator: Validator<Returns> | undefined,
  result: Returns
): void {
  if (returnsValidator) {
    try {
      returnsValidator.parse(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Return value validation failed: ${message}`)
    }
  }
}

// ============================================================================
// Type Extraction Utilities
// ============================================================================

/**
 * Extract the args type from any registered function.
 *
 * @typeParam F - The registered function type
 *
 * @example
 * ```typescript
 * const myQuery = query({
 *   args: { id: v.string() },
 *   handler: async (ctx, args) => args.id
 * })
 *
 * type Args = ExtractArgs<typeof myQuery>
 * // Result: { id: string }
 * ```
 */
export type ExtractArgs<F extends { _args: unknown }> = F['_args']

/**
 * Extract the return type from any registered function.
 *
 * @typeParam F - The registered function type
 *
 * @example
 * ```typescript
 * const myQuery = query({
 *   handler: async (ctx) => ({ name: "Test" })
 * })
 *
 * type Returns = ExtractReturns<typeof myQuery>
 * // Result: { name: string }
 * ```
 */
export type ExtractReturns<F extends { _returns: unknown }> = F['_returns']
