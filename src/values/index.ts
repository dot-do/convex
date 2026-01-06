/**
 * Validator system for convex.do
 * 100% compatible with Convex v validators
 */

// ============================================================================
// Validator Brand Symbol
// ============================================================================

/**
 * Unique symbol used to identify genuine Validator instances.
 * This prevents duck-typing attacks where objects with a parse() method
 * could be mistaken for real validators.
 */
export const VALIDATOR_BRAND = Symbol.for('convex.validator')

/**
 * Type guard to check if a value is a genuine Validator instance.
 * Uses Symbol-based branding for security against duck-typing attacks.
 */
export function isValidator(value: unknown): value is Validator {
  return (
    value !== null &&
    typeof value === 'object' &&
    VALIDATOR_BRAND in value &&
    (value as Record<symbol, unknown>)[VALIDATOR_BRAND] === true
  )
}

// ============================================================================
// Base Validator Interface
// ============================================================================

/**
 * Base interface for all validators.
 * Provides type inference and validation logic.
 */
export interface Validator<T = unknown, IsOptional extends boolean = boolean> {
  /** Symbol brand to identify genuine validators */
  readonly [VALIDATOR_BRAND]: true
  /** The inferred TypeScript type */
  readonly _type: T
  /** Whether this validator is optional */
  readonly isOptional: IsOptional
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
// Path context for nested validation errors
// ============================================================================

class ValidationContext {
  private path: (string | number)[] = []

  push(segment: string | number): void {
    this.path.push(segment)
  }

  pop(): void {
    this.path.pop()
  }

  getPath(): (string | number)[] {
    return [...this.path]
  }

  formatPath(): string {
    return this.path.join('.')
  }
}

// Thread-local context for validation
let currentContext: ValidationContext | null = null

function withContext<T>(fn: () => T): T {
  const hadContext = currentContext !== null
  if (!hadContext) {
    currentContext = new ValidationContext()
  }
  try {
    return fn()
  } finally {
    if (!hadContext) {
      currentContext = null
    }
  }
}

function pushPath(segment: string | number): void {
  currentContext?.push(segment)
}

function popPath(): void {
  currentContext?.pop()
}

function getPathString(): string {
  return currentContext?.formatPath() ?? ''
}

// ============================================================================
// Base Validator Implementation
// ============================================================================

abstract class BaseValidator<T, IsOptional extends boolean = false> implements Validator<T, IsOptional> {
  /** Symbol brand to identify genuine validators */
  readonly [VALIDATOR_BRAND] = true as const
  abstract readonly _type: T
  readonly isOptional: IsOptional = false as IsOptional

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
// Primitive Validators
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

class BytesValidator extends BaseValidator<ArrayBuffer> {
  readonly _type!: ArrayBuffer

  parse(value: unknown): ArrayBuffer {
    if (value instanceof ArrayBuffer) {
      return value
    }
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
    }
    throw new Error(`Expected bytes/ArrayBuffer, got ${typeof value}`)
  }

  describe(): string {
    return 'bytes'
  }
}

// ============================================================================
// ID Validator
// ============================================================================

/**
 * Minimum valid length for Convex IDs (32 characters standard)
 */
const MIN_ID_LENGTH = 32

/**
 * Maximum valid length for Convex IDs
 */
const MAX_ID_LENGTH = 128

/**
 * Pattern for valid Convex ID characters (alphanumeric only for standard format)
 * Allows uppercase, lowercase letters and digits
 */
const VALID_ID_PATTERN = /^[A-Za-z0-9]+$/

class IdValidator<TableName extends string> extends BaseValidator<string & { __tableName: TableName }> {
  readonly _type!: string & { __tableName: TableName }
  private tableName: TableName

  constructor(tableName: TableName) {
    super()
    if (!tableName || tableName.trim() === '') {
      throw new Error('Table name cannot be empty')
    }
    this.tableName = tableName
  }

  parse(value: unknown): string & { __tableName: TableName } {
    // Must be a string
    if (typeof value !== 'string') {
      throw new Error(`Expected ID for table "${this.tableName}", got ${getTypeName(value)}`)
    }

    // ID cannot be empty
    if (value.length === 0) {
      throw new Error(`ID for table "${this.tableName}" cannot be empty`)
    }

    // ID must meet minimum length (32 characters for Convex IDs)
    if (value.length < MIN_ID_LENGTH) {
      throw new Error(`Invalid ID for table "${this.tableName}": ID is too short (minimum ${MIN_ID_LENGTH} characters)`)
    }

    // ID cannot exceed maximum length
    if (value.length > MAX_ID_LENGTH) {
      throw new Error(`Invalid ID for table "${this.tableName}": ID is too long (maximum ${MAX_ID_LENGTH} characters)`)
    }

    // ID must only contain valid characters (alphanumeric)
    if (!VALID_ID_PATTERN.test(value)) {
      throw new Error(`Invalid ID for table "${this.tableName}": ID contains invalid characters`)
    }

    return value as string & { __tableName: TableName }
  }

  describe(): string {
    return `v.id("${this.tableName}")`
  }
}

// ============================================================================
// Complex Validators
// ============================================================================

type ObjectShape = Record<string, Validator>
type InferObject<T extends ObjectShape> = {
  [K in keyof T]: Infer<T[K]>
}

type ObjectMode = 'strip' | 'strict' | 'passthrough'

class ObjectValidator<T extends ObjectShape> extends BaseValidator<InferObject<T>> {
  readonly _type!: InferObject<T>
  private shape: T
  private mode: ObjectMode

  constructor(shape: T, mode: ObjectMode = 'strip') {
    super()
    this.shape = shape
    this.mode = mode
  }

  parse(value: unknown): InferObject<T> {
    return withContext(() => this.parseInternal(value))
  }

  private parseInternal(value: unknown): InferObject<T> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`Expected object, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`)
    }

    const result: Record<string, unknown> = {}
    const obj = value as Record<string, unknown>
    const schemaKeys = new Set(Object.keys(this.shape))

    // Check for extra fields in strict mode
    if (this.mode === 'strict') {
      for (const key of Object.keys(obj)) {
        if (!schemaKeys.has(key)) {
          throw new Error(`Unexpected field "${key}" in object`)
        }
      }
    }

    // Validate schema fields
    for (const [key, validator] of Object.entries(this.shape)) {
      const fieldValue = obj[key]
      if (fieldValue === undefined && !validator.isOptional) {
        throw new Error(`Missing required field "${key}"`)
      }
      if (fieldValue !== undefined) {
        pushPath(key)
        try {
          result[key] = validator.parse(fieldValue)
        } catch (e) {
          const path = getPathString()
          const innerMsg = (e as Error).message
          throw new Error(path ? `Validation error at ${path}: ${innerMsg}` : innerMsg)
        } finally {
          popPath()
        }
      }
    }

    // In passthrough mode, include extra fields
    if (this.mode === 'passthrough') {
      for (const key of Object.keys(obj)) {
        if (!schemaKeys.has(key)) {
          result[key] = obj[key]
        }
      }
    }

    return result as InferObject<T>
  }

  describe(): string {
    const fields = Object.entries(this.shape)
      .map(([key, v]) => `${key}: ${v.describe()}`)
      .join(', ')
    return `{ ${fields} }`
  }

  /**
   * Returns a new validator that throws on extra fields.
   */
  strict(): ObjectValidator<T> {
    return new ObjectValidator(this.shape, 'strict')
  }

  /**
   * Returns a new validator that passes through extra fields.
   */
  passthrough(): ObjectValidator<T> {
    return new ObjectValidator(this.shape, 'passthrough')
  }

  /**
   * Returns a new validator with additional fields.
   */
  extend<U extends ObjectShape>(additionalShape: U): ObjectValidator<T & U> {
    return new ObjectValidator({ ...this.shape, ...additionalShape } as T & U, this.mode)
  }

  /**
   * Returns a new validator with only the specified fields.
   */
  pick<K extends keyof T>(keys: K[]): ObjectValidator<Pick<T, K>> {
    const newShape: Partial<T> = {}
    for (const key of keys) {
      if (key in this.shape) {
        newShape[key] = this.shape[key]
      }
    }
    return new ObjectValidator(newShape as Pick<T, K>, this.mode)
  }

  /**
   * Returns a new validator without the specified fields.
   */
  omit<K extends keyof T>(keys: K[]): ObjectValidator<Omit<T, K>> {
    const keysToOmit = new Set(keys as (string | number | symbol)[])
    const newShape: Partial<T> = {}
    for (const [key, validator] of Object.entries(this.shape)) {
      if (!keysToOmit.has(key)) {
        (newShape as Record<string, unknown>)[key] = validator
      }
    }
    return new ObjectValidator(newShape as Omit<T, K>, this.mode)
  }
}

interface ArrayConstraints {
  minLength?: number
  maxLength?: number
  exactLength?: number
}

class ArrayValidator<T extends Validator> extends BaseValidator<Infer<T>[]> {
  readonly _type!: Infer<T>[]
  private element: T
  private constraints: ArrayConstraints

  constructor(element: T, constraints: ArrayConstraints = {}) {
    super()
    this.element = element
    this.constraints = constraints
  }

  parse(value: unknown): Infer<T>[] {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array, got ${value === null ? 'null' : typeof value}`)
    }

    // Check length constraints
    if (this.constraints.minLength !== undefined && value.length < this.constraints.minLength) {
      throw new Error(`Array must have at least ${this.constraints.minLength} element(s), got ${value.length}`)
    }
    if (this.constraints.maxLength !== undefined && value.length > this.constraints.maxLength) {
      throw new Error(`Array must have at most ${this.constraints.maxLength} element(s), got ${value.length}`)
    }
    if (this.constraints.exactLength !== undefined && value.length !== this.constraints.exactLength) {
      throw new Error(`Array must have exactly ${this.constraints.exactLength} element(s), got ${value.length}`)
    }

    return value.map((item, index) => {
      pushPath(index)
      try {
        return this.element.parse(item)
      } catch (e) {
        const path = getPathString()
        const innerMsg = (e as Error).message
        throw new Error(path ? `Invalid element at index ${index}: ${innerMsg}` : `Invalid array element at index ${index}: ${innerMsg}`)
      } finally {
        popPath()
      }
    })
  }

  describe(): string {
    return `${this.element.describe()}[]`
  }

  /**
   * Returns a new validator that requires at least one element.
   */
  nonempty(): ArrayValidator<T> {
    return new ArrayValidator(this.element, { ...this.constraints, minLength: 1 })
  }

  /**
   * Returns a new validator with a minimum length constraint.
   */
  min(minLength: number): ArrayValidator<T> {
    return new ArrayValidator(this.element, { ...this.constraints, minLength })
  }

  /**
   * Returns a new validator with a maximum length constraint.
   */
  max(maxLength: number): ArrayValidator<T> {
    return new ArrayValidator(this.element, { ...this.constraints, maxLength })
  }

  /**
   * Returns a new validator with an exact length constraint.
   */
  length(exactLength: number): ArrayValidator<T> {
    return new ArrayValidator(this.element, { ...this.constraints, exactLength })
  }
}

type InferUnion<T extends Validator[]> = T[number] extends Validator<infer U> ? U : never

class UnionValidator<T extends Validator[]> extends BaseValidator<InferUnion<T>> {
  readonly _type!: InferUnion<T>
  private validators: T

  constructor(validators: T) {
    super()
    this.validators = validators
  }

  parse(value: unknown): InferUnion<T> {
    const errors: string[] = []

    for (const validator of this.validators) {
      try {
        return validator.parse(value) as InferUnion<T>
      } catch (e) {
        errors.push((e as Error).message)
      }
    }

    throw new Error(`Value doesn't match any variant: ${errors.join('; ')}`)
  }

  describe(): string {
    return this.validators.map(v => v.describe()).join(' | ')
  }
}

class OptionalValidator<T> extends BaseValidator<T | undefined, true> {
  readonly _type!: T | undefined
  override readonly isOptional: true = true
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

  /**
   * Returns a new validator that provides a default value when undefined.
   */
  default(defaultValue: T): DefaultValidator<T> {
    return new DefaultValidator(this.inner, defaultValue)
  }
}

class DefaultValidator<T> extends BaseValidator<T, true> {
  readonly _type!: T
  override readonly isOptional: true = true
  private inner: Validator<T>
  private defaultValue: T

  constructor(inner: Validator<T>, defaultValue: T) {
    super()
    this.inner = inner
    this.defaultValue = defaultValue
  }

  parse(value: unknown): T {
    if (value === undefined) {
      return this.defaultValue
    }
    return this.inner.parse(value)
  }

  describe(): string {
    return `${this.inner.describe()} (default: ${JSON.stringify(this.defaultValue)})`
  }
}

class LiteralValidator<T extends string | number | boolean> extends BaseValidator<T> {
  readonly _type!: T
  private literal: T

  constructor(literal: T) {
    super()
    this.literal = literal
  }

  parse(value: unknown): T {
    if (value !== this.literal) {
      throw new Error(`Expected literal ${JSON.stringify(this.literal)}, got ${JSON.stringify(value)}`)
    }
    return value as T
  }

  describe(): string {
    return JSON.stringify(this.literal)
  }
}

class RecordValidator<K extends Validator<string>, V extends Validator> extends BaseValidator<Record<Infer<K>, Infer<V>>> {
  readonly _type!: Record<Infer<K>, Infer<V>>
  private keys: K
  private values: V

  constructor(keys: K, values: V) {
    super()
    this.keys = keys
    this.values = values
  }

  parse(value: unknown): Record<Infer<K>, Infer<V>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`Expected record/object, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`)
    }

    const result: Record<string, unknown> = {}
    const obj = value as Record<string, unknown>

    for (const [key, val] of Object.entries(obj)) {
      try {
        this.keys.parse(key)
      } catch (e) {
        throw new Error(`Invalid key "${key}": ${(e as Error).message}`)
      }
      try {
        result[key] = this.values.parse(val)
      } catch (e) {
        throw new Error(`Invalid value for key "${key}": ${(e as Error).message}`)
      }
    }

    return result as Record<Infer<K>, Infer<V>>
  }

  describe(): string {
    return `Record<${this.keys.describe()}, ${this.values.describe()}>`
  }
}

class AnyValidator extends BaseValidator<unknown> {
  readonly _type!: unknown

  parse(value: unknown): unknown {
    return value
  }

  describe(): string {
    return 'any'
  }
}

class UnknownValidator extends BaseValidator<unknown> {
  readonly _type!: unknown

  parse(value: unknown): unknown {
    return value
  }

  describe(): string {
    return 'unknown'
  }
}

class NullableValidator<T> extends BaseValidator<T | null> {
  readonly _type!: T | null
  private inner: Validator<T>

  constructor(inner: Validator<T>) {
    super()
    this.inner = inner
  }

  parse(value: unknown): T | null {
    if (value === null) {
      return null
    }
    return this.inner.parse(value)
  }

  describe(): string {
    return `${this.inner.describe()} | null`
  }
}

class NullishValidator<T> extends BaseValidator<T | null | undefined, true> {
  readonly _type!: T | null | undefined
  override readonly isOptional: true = true
  private inner: Validator<T>

  constructor(inner: Validator<T>) {
    super()
    this.inner = inner
  }

  parse(value: unknown): T | null | undefined {
    if (value === null) {
      return null
    }
    if (value === undefined) {
      return undefined
    }
    return this.inner.parse(value)
  }

  describe(): string {
    return `${this.inner.describe()} | null | undefined`
  }
}

class DiscriminatedUnionValidator<T extends Validator[]> extends BaseValidator<InferUnion<T>> {
  readonly _type!: InferUnion<T>
  private discriminator: string
  private validators: T

  constructor(discriminator: string, validators: T) {
    super()
    this.discriminator = discriminator
    this.validators = validators
  }

  parse(value: unknown): InferUnion<T> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`Expected object with discriminator "${this.discriminator}", got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`)
    }

    // Try each validator
    const errors: string[] = []
    for (const validator of this.validators) {
      try {
        return validator.parse(value) as InferUnion<T>
      } catch (e) {
        errors.push((e as Error).message)
      }
    }

    throw new Error(`Value doesn't match any variant for discriminator "${this.discriminator}": ${errors.join('; ')}`)
  }

  describe(): string {
    return this.validators.map(v => v.describe()).join(' | ')
  }
}

// ============================================================================
// Validator Factory (v namespace)
// ============================================================================

/**
 * The v namespace provides factory functions for creating validators.
 * This is 100% compatible with Convex's v validators.
 */
export const v = {
  // Primitives
  string: () => new StringValidator(),
  number: () => new NumberValidator(),
  boolean: () => new BooleanValidator(),
  null: () => new NullValidator(),
  int64: () => new Int64Validator(),
  float64: () => new Float64Validator(),
  bytes: () => new BytesValidator(),

  // ID type
  id: <T extends string>(tableName: T) => new IdValidator(tableName),

  // Complex types
  object: <T extends ObjectShape>(shape: T) => new ObjectValidator(shape),
  array: <T extends Validator>(element: T) => new ArrayValidator(element),
  union: <T extends Validator[]>(...validators: T) => new UnionValidator(validators),
  optional: <T extends Validator>(validator: T) => new OptionalValidator(validator as Validator<Infer<T>>),
  literal: <T extends string | number | boolean>(value: T) => new LiteralValidator(value),
  record: <K extends Validator<string>, V extends Validator>(keys: K | V, values?: V) => {
    // Support both v.record(keyValidator, valueValidator) and v.record(valueValidator) syntaxes
    if (values === undefined) {
      // Shorthand: v.record(valueValidator) - keys are implicitly strings
      return new RecordValidator(new StringValidator(), keys as V)
    }
    return new RecordValidator(keys as K, values)
  },
  any: () => new AnyValidator(),
  unknown: () => new UnknownValidator(),
  nullable: <T extends Validator>(validator: T) => new NullableValidator(validator as Validator<Infer<T>>),
  nullish: <T extends Validator>(validator: T) => new NullishValidator(validator as Validator<Infer<T>>),
  discriminatedUnion: <T extends Validator[]>(discriminator: string, validators: T) => new DiscriminatedUnionValidator(discriminator, validators),
} as const

// ============================================================================
// Type utilities
// ============================================================================

/**
 * Args validator type for function definitions.
 */
export type ArgsValidator = Validator<Record<string, unknown>> | Record<string, Validator>

/**
 * Infer args type from an args validator.
 */
export type InferArgs<T extends ArgsValidator> = T extends Validator<infer U>
  ? U
  : T extends Record<string, Validator>
  ? { [K in keyof T]: Infer<T[K]> }
  : never

