/**
 * Primitive Validators Implementation
 *
 * This file contains the implementation of all primitive validators:
 * - v.string() - Validates strings
 * - v.number() - Validates numbers (finite floats, rejects NaN/Infinity)
 * - v.boolean() - Validates booleans
 * - v.null() - Validates null values
 * - v.int64() - Validates 64-bit integers (BigInt with bounds checking)
 * - v.float64() - Validates 64-bit floats (rejects NaN)
 * - v.bytes() - Validates ArrayBuffer/typed arrays
 *
 * @see convex-q5h - Primitive Validators (GREEN)
 */

// ============================================================================
// Base Validator Interface
// ============================================================================

/**
 * Base interface for all validators.
 * Provides type inference and validation logic.
 */
export interface Validator<T = unknown> {
  /** The inferred TypeScript type */
  readonly _type: T
  /** Whether this validator is optional */
  readonly isOptional: boolean
  /** Parse and validate a value, throwing on invalid input */
  parse(value: unknown): T
  /** Check if a value is valid without throwing */
  isValid(value: unknown): value is T
  /** Make this validator optional */
  optional(): OptionalValidator<T>
  /** Get a description of this validator for error messages */
  describe(): string
}

/**
 * Infer the TypeScript type from a validator.
 */
export type Infer<V extends Validator> = V['_type']

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets a human-readable type name for a value.
 */
function getTypeName(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  if (value instanceof ArrayBuffer) return 'ArrayBuffer'
  if (ArrayBuffer.isView(value)) return value.constructor.name
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN'
  if (typeof value === 'object' && value !== null) {
    // Check for boxed primitives
    if (value instanceof String) return 'String object'
    if (value instanceof Number) return 'Number object'
    if (value instanceof Boolean) return 'Boolean object'
    return 'object'
  }
  return typeof value
}

// ============================================================================
// Base Validator Implementation
// ============================================================================

abstract class BaseValidator<T> implements Validator<T> {
  abstract readonly _type: T
  readonly isOptional = false

  abstract parse(value: unknown): T
  abstract describe(): string

  isValid(value: unknown): value is T {
    try {
      this.parse(value)
      return true
    } catch {
      return false
    }
  }

  optional(): OptionalValidator<T> {
    return new OptionalValidator(this)
  }
}

// ============================================================================
// Optional Validator
// ============================================================================

class OptionalValidator<T> extends BaseValidator<T | undefined> {
  readonly _type!: T | undefined
  override readonly isOptional = true
  private inner: Validator<T>

  constructor(inner: Validator<T>) {
    super()
    this.inner = inner
  }

  parse(value: unknown): T | undefined {
    if (value === undefined) {
      return undefined
    }
    return this.inner.parse(value)
  }

  describe(): string {
    return `${this.inner.describe()} | undefined`
  }

  override optional(): OptionalValidator<T | undefined> {
    return this as unknown as OptionalValidator<T | undefined>
  }
}

// ============================================================================
// String Validator
// ============================================================================

class StringValidator extends BaseValidator<string> {
  readonly _type!: string

  parse(value: unknown): string {
    // Reject boxed String objects
    if (value instanceof String) {
      throw new Error(`Expected string, got String object`)
    }
    if (typeof value !== 'string') {
      throw new Error(`Expected string, got ${getTypeName(value)}`)
    }
    return value
  }

  describe(): string {
    return 'string'
  }
}

// ============================================================================
// Number Validator
// ============================================================================

class NumberValidator extends BaseValidator<number> {
  readonly _type!: number

  parse(value: unknown): number {
    // Reject boxed Number objects
    if (value instanceof Number) {
      throw new Error(`Expected number, got Number object`)
    }
    if (typeof value !== 'number') {
      throw new Error(`Expected number, got ${getTypeName(value)}`)
    }
    // Reject NaN with specific message
    if (Number.isNaN(value)) {
      throw new Error(`Expected number, got NaN`)
    }
    // Reject Infinity and -Infinity
    if (!Number.isFinite(value)) {
      throw new Error(`Expected number, got ${value > 0 ? 'Infinity' : '-Infinity'}`)
    }
    return value
  }

  describe(): string {
    return 'number'
  }
}

// ============================================================================
// Boolean Validator
// ============================================================================

class BooleanValidator extends BaseValidator<boolean> {
  readonly _type!: boolean

  parse(value: unknown): boolean {
    // Reject boxed Boolean objects
    if (value instanceof Boolean) {
      throw new Error(`Expected boolean, got Boolean object`)
    }
    if (typeof value !== 'boolean') {
      throw new Error(`Expected boolean, got ${getTypeName(value)}`)
    }
    return value
  }

  describe(): string {
    return 'boolean'
  }
}

// ============================================================================
// Null Validator
// ============================================================================

class NullValidator extends BaseValidator<null> {
  readonly _type!: null

  parse(value: unknown): null {
    if (value !== null) {
      // Provide specific error message for undefined
      if (value === undefined) {
        throw new Error(`undefined is not null`)
      }
      throw new Error(`Expected null, got ${getTypeName(value)}`)
    }
    return value
  }

  describe(): string {
    return 'null'
  }
}

// ============================================================================
// Int64 Validator
// ============================================================================

const INT64_MAX = BigInt('9223372036854775807')
const INT64_MIN = BigInt('-9223372036854775808')

class Int64Validator extends BaseValidator<bigint> {
  readonly _type!: bigint

  parse(value: unknown): bigint {
    let result: bigint

    if (typeof value === 'bigint') {
      result = value
    } else if (typeof value === 'number') {
      // Reject NaN, Infinity, -Infinity
      if (Number.isNaN(value)) {
        throw new Error(`Expected int64/bigint, got NaN`)
      }
      if (!Number.isFinite(value)) {
        throw new Error(`Expected int64/bigint, got ${value > 0 ? 'Infinity' : '-Infinity'}`)
      }
      // Reject non-integer numbers
      if (!Number.isInteger(value)) {
        throw new Error(`Expected int64/bigint, got float (${value})`)
      }
      result = BigInt(value)
    } else if (typeof value === 'string') {
      // Reject empty strings with specific message
      if (value === '') {
        throw new Error(`Cannot convert empty string to int64`)
      }
      // Reject float strings
      if (value.includes('.')) {
        throw new Error(`Expected int64/bigint, got float string ("${value}")`)
      }
      try {
        result = BigInt(value)
      } catch {
        throw new Error(`Cannot convert "${value}" to int64`)
      }
    } else {
      throw new Error(`Expected int64/bigint, got ${getTypeName(value)}`)
    }

    // Check int64 bounds
    if (result > INT64_MAX) {
      throw new Error(`Value ${result} exceeds maximum int64 value (${INT64_MAX})`)
    }
    if (result < INT64_MIN) {
      throw new Error(`Value ${result} is less than minimum int64 value (${INT64_MIN})`)
    }

    return result
  }

  describe(): string {
    return 'int64'
  }
}

// ============================================================================
// Float64 Validator
// ============================================================================

class Float64Validator extends BaseValidator<number> {
  readonly _type!: number

  parse(value: unknown): number {
    // Reject boxed Number objects
    if (value instanceof Number) {
      throw new Error(`Expected float64/number, got Number object`)
    }
    if (typeof value !== 'number') {
      throw new Error(`Expected float64/number, got ${getTypeName(value)}`)
    }
    // Reject NaN with specific message
    if (Number.isNaN(value)) {
      throw new Error(`NaN is not a valid float64`)
    }
    // Note: float64 accepts Infinity and -Infinity (they are valid IEEE 754 values)
    return value
  }

  describe(): string {
    return 'float64'
  }
}

// ============================================================================
// Bytes Validator
// ============================================================================

class BytesValidator extends BaseValidator<ArrayBuffer> {
  readonly _type!: ArrayBuffer

  parse(value: unknown): ArrayBuffer {
    if (value instanceof ArrayBuffer) {
      return value
    }
    if (ArrayBuffer.isView(value)) {
      // Handle TypedArrays and DataView
      // Create a new ArrayBuffer with only the relevant portion
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
    }
    throw new Error(`Expected bytes/ArrayBuffer, got ${getTypeName(value)}`)
  }

  describe(): string {
    return 'bytes'
  }
}

// ============================================================================
// Validator Factory Functions
// ============================================================================

/**
 * Creates a string validator.
 */
export function string(): StringValidator {
  return new StringValidator()
}

/**
 * Creates a number validator.
 * Rejects NaN, Infinity, and -Infinity.
 */
export function number(): NumberValidator {
  return new NumberValidator()
}

/**
 * Creates a boolean validator.
 */
export function boolean(): BooleanValidator {
  return new BooleanValidator()
}

/**
 * Creates a null validator.
 */
function nullValidator(): NullValidator {
  return new NullValidator()
}

// Export as 'null' (using a function name that's valid)
export { nullValidator as null }

/**
 * Creates a 64-bit integer validator.
 * Accepts BigInt values, integers, and integer strings.
 * Enforces int64 bounds.
 */
export function int64(): Int64Validator {
  return new Int64Validator()
}

/**
 * Creates a 64-bit float validator.
 * Accepts all finite numbers plus Infinity/-Infinity.
 * Rejects NaN.
 */
export function float64(): Float64Validator {
  return new Float64Validator()
}

/**
 * Creates a bytes validator.
 * Accepts ArrayBuffer and TypedArrays.
 */
export function bytes(): BytesValidator {
  return new BytesValidator()
}

// ============================================================================
// Re-export Types
// ============================================================================

export type { OptionalValidator }
