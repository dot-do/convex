/**
 * Request/Response Serialization for Client SDK (Layer 7)
 *
 * Handles serialization and deserialization of data for client-server
 * communication in convex.do. Supports all Convex value types including
 * special types like Int64, Bytes, and Dates.
 *
 * Features:
 * - Function argument serialization
 * - Function result deserialization
 * - WebSocket message serialization/deserialization
 * - Convex value type support (Int64, Bytes, Dates, IDs)
 * - Schema validation during deserialization
 * - Error handling for malformed data
 * - Binary format support
 */

import type { SyncMessage } from '../sync/protocol'

// ============================================================================
// Types
// ============================================================================

/**
 * A Convex value that can be serialized/deserialized.
 */
export type ConvexValue =
  | string
  | number
  | boolean
  | null
  | bigint
  | Date
  | ArrayBuffer
  | Uint8Array
  | ConvexValue[]
  | { [key: string]: ConvexValue }

/**
 * A serialized value that can be sent over the wire.
 */
export type SerializedValue =
  | string
  | number
  | boolean
  | null
  | { $int64: string }
  | { $bytes: string }
  | { $date: number }
  | { $id: { table: string; id: string } }
  | SerializedValue[]
  | { [key: string]: SerializedValue }

/**
 * Options for serialization.
 */
export interface SerializationOptions {
  /** If true, skip undefined values in objects instead of throwing */
  skipUndefined?: boolean
  /** Maximum nesting depth allowed (default: 100) */
  maxDepth?: number
  /** If true, detect circular references (default: true) */
  detectCircular?: boolean
  /** If true, treat value as an ID for the given table */
  treatAsId?: boolean
  /** Table name when treating value as an ID */
  tableName?: string
}

/**
 * Schema types for validation.
 */
export type SchemaType =
  | { type: 'string' }
  | { type: 'number' }
  | { type: 'boolean' }
  | { type: 'null' }
  | { type: 'int64' }
  | { type: 'bytes' }
  | { type: 'date' }
  | { type: 'array'; element: SchemaType }
  | { type: 'object'; fields: Record<string, SchemaType & { optional?: boolean }> }
  | { type: 'union'; variants: SchemaType[] }

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when serialization fails.
 */
export class SerializationError extends Error {
  value?: unknown
  path?: string[]

  constructor(message: string, value?: unknown, path?: string[]) {
    super(message)
    this.name = 'SerializationError'
    this.value = value
    this.path = path
    Object.setPrototypeOf(this, SerializationError.prototype)
  }
}

/**
 * Error thrown when deserialization fails.
 */
export class DeserializationError extends Error {
  rawInput?: string
  path?: string[]

  constructor(message: string, rawInput?: string, path?: string[]) {
    super(message)
    this.name = 'DeserializationError'
    this.rawInput = rawInput
    this.path = path
    Object.setPrototypeOf(this, DeserializationError.prototype)
  }
}

/**
 * Error thrown when schema validation fails during deserialization.
 */
export class SchemaValidationError extends DeserializationError {
  details?: { expected?: string; received?: string }

  constructor(
    message: string,
    details?: { expected?: string; received?: string },
    rawInput?: string,
    path?: string[]
  ) {
    super(message, rawInput, path)
    this.name = 'SchemaValidationError'
    this.details = details
    Object.setPrototypeOf(this, SchemaValidationError.prototype)
  }
}

// ============================================================================
// Int64 Serialization
// ============================================================================

/**
 * Serialize a BigInt to the $int64 wire format.
 */
export function serializeInt64(value: bigint): { $int64: string } {
  return { $int64: value.toString() }
}

/**
 * Deserialize the $int64 wire format to a BigInt.
 */
export function deserializeInt64(value: unknown): bigint {
  if (typeof value !== 'object' || value === null) {
    throw new DeserializationError('Expected object with $int64 property')
  }

  const obj = value as Record<string, unknown>
  if (!('$int64' in obj)) {
    throw new DeserializationError('Expected object with $int64 property')
  }

  const str = obj.$int64
  if (typeof str !== 'string') {
    throw new DeserializationError('$int64 value must be a string')
  }

  try {
    return BigInt(str)
  } catch {
    throw new DeserializationError(`Invalid $int64 value: ${str}`)
  }
}

/**
 * Check if a value is an $int64 marker.
 */
function isInt64Marker(value: unknown): value is { $int64: string } {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return '$int64' in obj && typeof obj.$int64 === 'string' && Object.keys(obj).length === 1
}

// ============================================================================
// Bytes Serialization
// ============================================================================

/**
 * Serialize an ArrayBuffer or TypedArray to the $bytes wire format (base64).
 */
export function serializeBytes(value: ArrayBuffer | ArrayBufferView): { $bytes: string } {
  let buffer: ArrayBuffer
  if (value instanceof ArrayBuffer) {
    buffer = value
  } else {
    // TypedArray or DataView - slice returns ArrayBufferLike, cast to ArrayBuffer
    buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
  }

  const bytes = new Uint8Array(buffer)
  const base64 = uint8ArrayToBase64(bytes)
  return { $bytes: base64 }
}

/**
 * Deserialize the $bytes wire format to an ArrayBuffer.
 */
export function deserializeBytes(value: unknown): ArrayBuffer {
  if (typeof value !== 'object' || value === null) {
    throw new DeserializationError('Expected object with $bytes property')
  }

  const obj = value as Record<string, unknown>
  if (!('$bytes' in obj)) {
    throw new DeserializationError('Expected object with $bytes property')
  }

  const base64 = obj.$bytes
  if (typeof base64 !== 'string') {
    throw new DeserializationError('$bytes value must be a string')
  }

  try {
    return base64ToArrayBuffer(base64)
  } catch {
    throw new DeserializationError(`Invalid base64 in $bytes: ${base64}`)
  }
}

/**
 * Check if a value is a $bytes marker.
 */
function isBytesMarker(value: unknown): value is { $bytes: string } {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return '$bytes' in obj && typeof obj.$bytes === 'string' && Object.keys(obj).length === 1
}

/**
 * Convert Uint8Array to base64 string.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''

  // Use native btoa if available (browser/modern Node)
  if (typeof btoa === 'function') {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!)
    }
    return btoa(binary)
  }

  // Fallback for environments without btoa
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  let i = 0

  while (i < bytes.length) {
    const a = bytes[i++]!
    const b = i < bytes.length ? bytes[i++]! : 0
    const c = i < bytes.length ? bytes[i++]! : 0

    const triplet = (a << 16) | (b << 8) | c

    result += chars[(triplet >> 18) & 0x3f]
    result += chars[(triplet >> 12) & 0x3f]
    result += i > bytes.length + 1 ? '=' : chars[(triplet >> 6) & 0x3f]
    result += i > bytes.length ? '=' : chars[triplet & 0x3f]
  }

  return result
}

/**
 * Convert base64 string to ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (base64 === '') return new ArrayBuffer(0)

  // Use native atob if available (browser/modern Node)
  if (typeof atob === 'function') {
    try {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes.buffer
    } catch {
      throw new Error('Invalid base64 string')
    }
  }

  // Fallback for environments without atob
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = new Map<string, number>()
  for (let i = 0; i < chars.length; i++) {
    lookup.set(chars[i]!, i)
  }

  // Remove padding
  let str = base64.replace(/=+$/, '')
  const length = Math.floor((str.length * 3) / 4)
  const bytes = new Uint8Array(length)

  let p = 0
  for (let i = 0; i < str.length; i += 4) {
    const a = lookup.get(str[i]!) ?? 0
    const b = lookup.get(str[i + 1]!) ?? 0
    const c = lookup.get(str[i + 2]!) ?? 0
    const d = lookup.get(str[i + 3]!) ?? 0

    bytes[p++] = (a << 2) | (b >> 4)
    if (p < length) bytes[p++] = ((b & 0x0f) << 4) | (c >> 2)
    if (p < length) bytes[p++] = ((c & 0x03) << 6) | d
  }

  return bytes.buffer
}

// ============================================================================
// Date Serialization
// ============================================================================

/**
 * Serialize a Date to the $date wire format (timestamp).
 */
export function serializeDate(value: Date): { $date: number } {
  return { $date: value.getTime() }
}

/**
 * Deserialize the $date wire format to a Date.
 */
export function deserializeDate(value: unknown): Date {
  if (typeof value !== 'object' || value === null) {
    throw new DeserializationError('Expected object with $date property')
  }

  const obj = value as Record<string, unknown>
  if (!('$date' in obj)) {
    throw new DeserializationError('Expected object with $date property')
  }

  const timestamp = obj.$date
  if (typeof timestamp !== 'number') {
    throw new DeserializationError('$date value must be a number')
  }

  return new Date(timestamp)
}

/**
 * Check if a value is a $date marker.
 */
function isDateMarker(value: unknown): value is { $date: number } {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return '$date' in obj && typeof obj.$date === 'number' && Object.keys(obj).length === 1
}

// ============================================================================
// ID Serialization
// ============================================================================

/**
 * Serialize an ID to the $id wire format.
 */
export function serializeId(table: string, id: string): { $id: { table: string; id: string } } {
  return { $id: { table, id } }
}

/**
 * Deserialize the $id wire format.
 */
export function deserializeId(value: unknown): { table: string; id: string } {
  if (typeof value !== 'object' || value === null) {
    throw new DeserializationError('Expected object with $id property')
  }

  const obj = value as Record<string, unknown>
  if (!('$id' in obj)) {
    throw new DeserializationError('Expected object with $id property')
  }

  const idObj = obj.$id
  if (typeof idObj !== 'object' || idObj === null) {
    throw new DeserializationError('$id value must be an object')
  }

  const idRecord = idObj as Record<string, unknown>
  if (typeof idRecord.table !== 'string') {
    throw new DeserializationError('$id.table must be a string')
  }
  if (typeof idRecord.id !== 'string') {
    throw new DeserializationError('$id.id must be a string')
  }

  return { table: idRecord.table, id: idRecord.id }
}

/**
 * Check if a value is an $id marker.
 */
function isIdMarker(value: unknown): value is { $id: { table: string; id: string } } {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  if (!('$id' in obj) || Object.keys(obj).length !== 1) return false
  const idObj = obj.$id
  if (typeof idObj !== 'object' || idObj === null) return false
  const idRecord = idObj as Record<string, unknown>
  return typeof idRecord.table === 'string' && typeof idRecord.id === 'string'
}

// ============================================================================
// Value Serialization
// ============================================================================

/**
 * Serialize a Convex value for wire transport.
 */
export function serializeValue(
  value: unknown,
  options: SerializationOptions = {},
  seen: WeakSet<object> = new WeakSet(),
  depth: number = 0
): SerializedValue {
  const maxDepth = options.maxDepth ?? 100
  const detectCircular = options.detectCircular ?? true

  // Check depth
  if (depth > maxDepth) {
    throw new SerializationError(`Maximum nesting depth (${maxDepth}) exceeded`, value)
  }

  // Handle null
  if (value === null) {
    return null
  }

  // Handle undefined
  if (value === undefined) {
    throw new SerializationError('Cannot serialize undefined value', value)
  }

  // Handle primitives
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      throw new SerializationError('Cannot serialize NaN', value)
    }
    if (!Number.isFinite(value)) {
      throw new SerializationError(`Cannot serialize ${value > 0 ? 'Infinity' : '-Infinity'}`, value)
    }
    return value
  }

  if (typeof value === 'boolean') {
    return value
  }

  // Handle BigInt
  if (typeof value === 'bigint') {
    return serializeInt64(value)
  }

  // Handle unsupported primitives
  if (typeof value === 'function') {
    throw new SerializationError('Cannot serialize function', value)
  }

  if (typeof value === 'symbol') {
    throw new SerializationError('Cannot serialize symbol', value)
  }

  // Handle objects
  if (typeof value === 'object') {
    // Check for circular references
    if (detectCircular) {
      if (seen.has(value)) {
        throw new SerializationError('Cannot serialize circular reference', value)
      }
      seen.add(value)
    }

    // Handle Date
    if (value instanceof Date) {
      return serializeDate(value)
    }

    // Handle ArrayBuffer
    if (value instanceof ArrayBuffer) {
      return serializeBytes(value)
    }

    // Handle TypedArrays and DataView
    if (ArrayBuffer.isView(value)) {
      return serializeBytes(value)
    }

    // Handle ID objects (with __tableName marker)
    if (options.treatAsId && options.tableName && typeof (value as Record<string, unknown>).value === 'string') {
      return serializeId(options.tableName, (value as Record<string, unknown>).value as string)
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        if (item === undefined) {
          throw new SerializationError(`Cannot serialize undefined at index ${index}`, value)
        }
        return serializeValue(item, options, seen, depth + 1)
      })
    }

    // Handle plain objects
    const result: Record<string, SerializedValue> = {}
    for (const [key, val] of Object.entries(value)) {
      if (val === undefined) {
        if (options.skipUndefined) {
          continue
        }
        throw new SerializationError(`Cannot serialize undefined at key "${key}"`, value)
      }
      result[key] = serializeValue(val, options, seen, depth + 1)
    }
    return result
  }

  throw new SerializationError(`Cannot serialize value of type ${typeof value}`, value)
}

/**
 * Deserialize a wire value back to a Convex value.
 */
export function deserializeValue(value: SerializedValue): ConvexValue {
  // Handle null
  if (value === null) {
    return null
  }

  // Handle primitives
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'boolean') {
    return value
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => deserializeValue(item))
  }

  // Handle objects with special markers
  if (typeof value === 'object') {
    // Check for $int64 marker
    if (isInt64Marker(value)) {
      return deserializeInt64(value)
    }

    // Check for $bytes marker
    if (isBytesMarker(value)) {
      return deserializeBytes(value)
    }

    // Check for $date marker
    if (isDateMarker(value)) {
      return deserializeDate(value)
    }

    // Check for $id marker
    if (isIdMarker(value)) {
      const id = deserializeId(value)
      return id as unknown as ConvexValue
    }

    // Regular object
    const result: Record<string, ConvexValue> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = deserializeValue(val as SerializedValue)
    }
    return result
  }

  return value as ConvexValue
}

// ============================================================================
// Args Serialization
// ============================================================================

/**
 * Serialize function arguments for transport.
 */
export function serializeArgs(args: Record<string, unknown>): Record<string, SerializedValue> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new SerializationError('Args must be a plain object', args)
  }

  const result: Record<string, SerializedValue> = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) {
      throw new SerializationError(`Cannot serialize undefined arg "${key}"`, args)
    }
    result[key] = serializeValue(value)
  }
  return result
}

/**
 * Deserialize function result from transport.
 */
export function deserializeResult(result: unknown): ConvexValue | undefined {
  if (result === undefined) {
    return undefined
  }
  return deserializeValue(result as SerializedValue)
}

// ============================================================================
// Message Serialization
// ============================================================================

/**
 * Serialize a WebSocket message for transport.
 */
export function serializeMessage(message: SyncMessage): string {
  // Serialize args if present
  const serialized: Record<string, unknown> = { ...message }

  if ('args' in message && message.args) {
    serialized.args = serializeArgs(message.args as Record<string, unknown>)
  }

  if ('value' in message && message.value !== undefined) {
    serialized.value = serializeValue(message.value)
  }

  return JSON.stringify(serialized)
}

/**
 * Deserialize a WebSocket message from transport.
 */
export function deserializeMessage(data: string): SyncMessage {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    throw new DeserializationError('Failed to parse JSON', data)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DeserializationError('Message must be an object', data)
  }

  const obj = parsed as Record<string, unknown>

  // Validate type field
  if (!('type' in obj) || typeof obj.type !== 'string') {
    throw new DeserializationError('Message must have a string "type" field', data)
  }

  const validTypes = new Set([
    'subscribe',
    'unsubscribe',
    'mutation',
    'action',
    'queryResult',
    'mutationResult',
    'actionResult',
    'error',
    'ping',
    'pong',
    'authenticate',
    'authenticated',
    'modifyQuerySet',
    'transition',
  ])

  if (!validTypes.has(obj.type)) {
    throw new DeserializationError(`Unknown message type: ${obj.type}`, data)
  }

  // Validate required fields based on type
  validateMessageFields(obj, data)

  // Deserialize value field if present
  if ('value' in obj && obj.value !== undefined) {
    obj.value = deserializeValue(obj.value as SerializedValue)
  }

  // Deserialize args field if present
  if ('args' in obj && obj.args) {
    obj.args = deserializeValue(obj.args as SerializedValue)
  }

  // Deserialize modifications if present (for transition messages)
  if ('modifications' in obj && Array.isArray(obj.modifications)) {
    obj.modifications = (obj.modifications as unknown[]).map((mod) => {
      if (typeof mod === 'object' && mod !== null && 'value' in mod) {
        return {
          ...mod,
          value: deserializeValue((mod as Record<string, unknown>).value as SerializedValue),
        }
      }
      return mod
    })
  }

  return obj as unknown as SyncMessage
}

/**
 * Validate message fields based on type.
 */
function validateMessageFields(obj: Record<string, unknown>, data: string): void {
  const requiredFields: Record<string, string[]> = {
    subscribe: ['requestId', 'queryId', 'query', 'args'],
    unsubscribe: ['queryId'],
    mutation: ['requestId', 'mutation', 'args'],
    action: ['requestId', 'action', 'args'],
    queryResult: ['queryId', 'value', 'logLines'],
    mutationResult: ['requestId', 'success', 'value', 'logLines'],
    actionResult: ['requestId', 'success', 'value', 'logLines'],
    error: ['error', 'errorCode'],
    ping: [],
    pong: [],
    authenticate: ['token'],
    authenticated: [],
    modifyQuerySet: ['baseVersion', 'newVersion', 'modifications'],
    transition: ['startVersion', 'endVersion', 'modifications'],
  }

  const type = obj.type as string
  const required = requiredFields[type] ?? []

  for (const field of required) {
    if (!(field in obj)) {
      throw new DeserializationError(`Missing required field "${field}" for message type "${type}"`, data)
    }
  }
}

// ============================================================================
// Binary Format Support
// ============================================================================

/**
 * Serialize a message to binary format.
 */
export function serializeToBinary(message: SyncMessage): ArrayBuffer {
  const json = serializeMessage(message)
  const encoder = new TextEncoder()
  return encoder.encode(json).buffer as ArrayBuffer
}

/**
 * Deserialize a message from binary format.
 */
export function deserializeFromBinary(data: ArrayBuffer): SyncMessage {
  const decoder = new TextDecoder()
  const json = decoder.decode(data)
  try {
    return deserializeMessage(json)
  } catch (e) {
    if (e instanceof DeserializationError) {
      throw e
    }
    throw new DeserializationError('Failed to deserialize binary data', json)
  }
}

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Validate a value against a schema.
 */
export function validateWithSchema(value: unknown, schema: SchemaType): void {
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') {
        throw new SchemaValidationError('Type mismatch', {
          expected: 'string',
          received: typeof value,
        })
      }
      break

    case 'number':
      if (typeof value !== 'number') {
        throw new SchemaValidationError('Type mismatch', {
          expected: 'number',
          received: typeof value,
        })
      }
      break

    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new SchemaValidationError('Type mismatch', {
          expected: 'boolean',
          received: typeof value,
        })
      }
      break

    case 'null':
      if (value !== null) {
        throw new SchemaValidationError('Type mismatch', {
          expected: 'null',
          received: value === undefined ? 'undefined' : typeof value,
        })
      }
      break

    case 'int64':
      if (typeof value !== 'bigint') {
        throw new SchemaValidationError('Type mismatch', {
          expected: 'int64/bigint',
          received: typeof value,
        })
      }
      break

    case 'bytes':
      if (!(value instanceof ArrayBuffer)) {
        throw new SchemaValidationError('Type mismatch', {
          expected: 'bytes/ArrayBuffer',
          received: typeof value,
        })
      }
      break

    case 'date':
      if (!(value instanceof Date)) {
        throw new SchemaValidationError('Type mismatch', {
          expected: 'Date',
          received: typeof value,
        })
      }
      break

    case 'array': {
      if (!Array.isArray(value)) {
        throw new SchemaValidationError('Type mismatch', {
          expected: 'array',
          received: typeof value,
        })
      }
      for (let i = 0; i < value.length; i++) {
        try {
          validateWithSchema(value[i], schema.element)
        } catch (e) {
          if (e instanceof SchemaValidationError) {
            throw new SchemaValidationError(
              `Invalid element at index ${i}: ${e.message}`,
              e.details
            )
          }
          throw e
        }
      }
      break
    }

    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new SchemaValidationError('Type mismatch', {
          expected: 'object',
          received: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
        })
      }
      const obj = value as Record<string, unknown>
      for (const [field, fieldSchema] of Object.entries(schema.fields)) {
        const fieldValue = obj[field]
        if (fieldValue === undefined) {
          if (!fieldSchema.optional) {
            throw new SchemaValidationError(`Missing required field "${field}"`)
          }
        } else {
          try {
            validateWithSchema(fieldValue, fieldSchema)
          } catch (e) {
            if (e instanceof SchemaValidationError) {
              throw new SchemaValidationError(
                `Invalid value for field "${field}": ${e.message}`,
                e.details
              )
            }
            throw e
          }
        }
      }
      break
    }

    case 'union': {
      let matched = false
      for (const variant of schema.variants) {
        try {
          validateWithSchema(value, variant)
          matched = true
          break
        } catch {
          // Try next variant
        }
      }
      if (!matched) {
        throw new SchemaValidationError('Value does not match any union variant', {
          expected: schema.variants.map((v) => v.type).join(' | '),
          received: typeof value,
        })
      }
      break
    }
  }
}
