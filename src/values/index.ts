/**
 * Validator system for convex.do
 * 100% compatible with Convex v validators
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
// Primitive Validators
// ============================================================================

class StringValidator extends BaseValidator<string> {
  readonly _type!: string

  parse(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error(`Expected string, got ${typeof value}`)
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
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`Expected number, got ${typeof value}`)
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
    if (typeof value !== 'boolean') {
      throw new Error(`Expected boolean, got ${typeof value}`)
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
      throw new Error(`Expected null, got ${typeof value}`)
    }
    return value
  }

  describe(): string {
    return 'null'
  }
}

class Int64Validator extends BaseValidator<bigint> {
  readonly _type!: bigint

  parse(value: unknown): bigint {
    if (typeof value === 'bigint') {
      return value
    }
    if (typeof value === 'number' && Number.isInteger(value)) {
      return BigInt(value)
    }
    if (typeof value === 'string') {
      try {
        return BigInt(value)
      } catch {
        throw new Error(`Cannot convert "${value}" to bigint`)
      }
    }
    throw new Error(`Expected int64/bigint, got ${typeof value}`)
  }

  describe(): string {
    return 'int64'
  }
}

class Float64Validator extends BaseValidator<number> {
  readonly _type!: number

  parse(value: unknown): number {
    if (typeof value !== 'number') {
      throw new Error(`Expected float64/number, got ${typeof value}`)
    }
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
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
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

class IdValidator<TableName extends string> extends BaseValidator<string & { __tableName: TableName }> {
  readonly _type!: string & { __tableName: TableName }
  private tableName: TableName

  constructor(tableName: TableName) {
    super()
    this.tableName = tableName
  }

  parse(value: unknown): string & { __tableName: TableName } {
    if (typeof value !== 'string') {
      throw new Error(`Expected ID for table "${this.tableName}", got ${typeof value}`)
    }
    // IDs should be non-empty strings
    if (value.length === 0) {
      throw new Error(`ID for table "${this.tableName}" cannot be empty`)
    }
    return value as string & { __tableName: TableName }
  }

  describe(): string {
    return `Id<"${this.tableName}">`
  }
}

// ============================================================================
// Complex Validators
// ============================================================================

type ObjectShape = Record<string, Validator>
type InferObject<T extends ObjectShape> = {
  [K in keyof T]: Infer<T[K]>
}

class ObjectValidator<T extends ObjectShape> extends BaseValidator<InferObject<T>> {
  readonly _type!: InferObject<T>
  private shape: T

  constructor(shape: T) {
    super()
    this.shape = shape
  }

  parse(value: unknown): InferObject<T> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`Expected object, got ${value === null ? 'null' : typeof value}`)
    }

    const result: Record<string, unknown> = {}
    const obj = value as Record<string, unknown>

    for (const [key, validator] of Object.entries(this.shape)) {
      const fieldValue = obj[key]
      if (fieldValue === undefined && !validator.isOptional) {
        throw new Error(`Missing required field "${key}"`)
      }
      if (fieldValue !== undefined) {
        result[key] = validator.parse(fieldValue)
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
}

class ArrayValidator<T extends Validator> extends BaseValidator<Infer<T>[]> {
  readonly _type!: Infer<T>[]
  private element: T

  constructor(element: T) {
    super()
    this.element = element
  }

  parse(value: unknown): Infer<T>[] {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array, got ${typeof value}`)
    }
    return value.map((item, index) => {
      try {
        return this.element.parse(item)
      } catch (e) {
        throw new Error(`Invalid array element at index ${index}: ${(e as Error).message}`)
      }
    })
  }

  describe(): string {
    return `${this.element.describe()}[]`
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
      throw new Error(`Expected record/object, got ${value === null ? 'null' : typeof value}`)
    }

    const result: Record<string, unknown> = {}
    const obj = value as Record<string, unknown>

    for (const [key, val] of Object.entries(obj)) {
      this.keys.parse(key)
      result[key] = this.values.parse(val)
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
  record: <K extends Validator<string>, V extends Validator>(keys: K, values: V) => new RecordValidator(keys, values),
  any: () => new AnyValidator(),
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

// Re-export types
export type { Validator, Infer }
