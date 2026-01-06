/**
 * Utility functions for convex.do
 *
 * This file contains implementations for ID generation, hashing,
 * and serialization/deserialization of Convex values.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * URL-safe base64 character set for ID generation
 */
const URL_SAFE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/**
 * Valid table name pattern (valid JavaScript identifier)
 */
const VALID_TABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/**
 * Type markers for serialization
 */
const TYPE_MARKERS = {
  UNDEFINED: '$undefined',
  NAN: '$nan',
  INFINITY: '$infinity',
  NEG_INFINITY: '$negInfinity',
  BIGINT: '$bigint',
  DATE: '$date',
  ID: '$id',
} as const

// ============================================================================
// ID Generation Counter (for uniqueness)
// ============================================================================

let idCounter = 0

// ============================================================================
// generateId() Implementation
// ============================================================================

/**
 * Generates a unique Convex-style ID for the specified table.
 * @param tableName - The name of the table to generate an ID for
 * @returns A unique ID string in Convex format
 * @throws Error if tableName is empty or contains invalid characters
 */
export function generateId(tableName: string): string {
  // Validate table name is not empty
  if (!tableName || tableName.trim() === '') {
    throw new Error('Table name cannot be empty')
  }

  // Validate table name format (must be valid JavaScript identifier)
  if (!VALID_TABLE_NAME_PATTERN.test(tableName)) {
    throw new Error('Invalid table name: must be a valid identifier (letters, numbers, underscores, cannot start with a number)')
  }

  // Generate unique components
  const timestamp = Date.now()
  const counter = idCounter++
  const random = Math.random().toString(36).substring(2, 10)

  // Create a combined seed for the ID
  const seed = `${tableName}:${timestamp}:${counter}:${random}`

  // Convert to URL-safe base64-like format
  let id = ''
  let hashValue = 0

  // Simple hash to spread the bits
  for (let i = 0; i < seed.length; i++) {
    hashValue = ((hashValue << 5) - hashValue + seed.charCodeAt(i)) >>> 0
  }

  // Generate 32 characters for the ID
  for (let i = 0; i < 32; i++) {
    // Mix in position and counter to ensure uniqueness
    const mixedValue = (hashValue + i * 127 + counter * 31 + timestamp) >>> 0
    const charIndex = (mixedValue + Math.floor(Math.random() * 64)) % URL_SAFE_CHARS.length
    id += URL_SAFE_CHARS.charAt(charIndex)
  }

  return id
}

// ============================================================================
// hash() Implementation
// ============================================================================

/**
 * Produces a consistent hash of the input value.
 * Same input will always produce the same output.
 * Object keys are sorted to ensure consistent hashing regardless of insertion order.
 * @param value - The value to hash
 * @returns A hexadecimal hash string
 */
export function hash(value: unknown): string {
  // Convert value to a canonical string representation
  const canonical = canonicalize(value)

  // Use a simple but effective hash function (FNV-1a inspired)
  let h1 = 0x811c9dc5 >>> 0
  let h2 = 0x01000193 >>> 0

  for (let i = 0; i < canonical.length; i++) {
    const char = canonical.charCodeAt(i)
    h1 ^= char
    h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 ^= char
    h2 = Math.imul(h2, 0x1b873593) >>> 0
  }

  // Additional mixing for better distribution
  h1 ^= h1 >>> 16
  h1 = Math.imul(h1, 0x85ebca6b) >>> 0
  h1 ^= h1 >>> 13
  h1 = Math.imul(h1, 0xc2b2ae35) >>> 0
  h1 ^= h1 >>> 16

  h2 ^= h2 >>> 16
  h2 = Math.imul(h2, 0x85ebca6b) >>> 0
  h2 ^= h2 >>> 13
  h2 = Math.imul(h2, 0xc2b2ae35) >>> 0
  h2 ^= h2 >>> 16

  // Ensure unsigned 32-bit values and combine for 64-bit result (16 hex chars)
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0')
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0')

  return hex1 + hex2
}

/**
 * Converts a value to a canonical string representation for hashing.
 * Objects are serialized with sorted keys to ensure consistent output.
 */
function canonicalize(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  const type = typeof value

  if (type === 'string') {
    return `s:${value}`
  }

  if (type === 'number') {
    const num = value as number
    if (Number.isNaN(num)) {
      return 'n:NaN'
    }
    if (!Number.isFinite(num)) {
      return num > 0 ? 'n:Infinity' : 'n:-Infinity'
    }
    return `n:${num}`
  }

  if (type === 'boolean') {
    return `b:${value}`
  }

  if (type === 'bigint') {
    return `bi:${value.toString()}`
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item))
    return `a:[${items.join(',')}]`
  }

  if (value instanceof Date) {
    return `d:${value.getTime()}`
  }

  if (type === 'object') {
    // Sort keys for consistent ordering
    const keys = Object.keys(value as object).sort()
    const pairs = keys.map((key) => {
      const val = (value as Record<string, unknown>)[key]
      return `${key}:${canonicalize(val)}`
    })
    return `o:{${pairs.join(',')}}`
  }

  // Fallback for other types
  return `?:${String(value)}`
}

// ============================================================================
// serialize() Implementation
// ============================================================================

/**
 * Serializes a value to a string representation.
 * Handles special Convex types like IDs, Dates, BigInts, etc.
 * @param value - The value to serialize
 * @returns A serialized string representation
 * @throws Error if circular reference is detected
 */
export function serialize(value: unknown): string {
  const seen = new WeakSet<object>()
  const result = serializeValue(value, seen)
  return JSON.stringify(result)
}

/**
 * Internal serialization with circular reference detection
 */
function serializeValue(value: unknown, seen: WeakSet<object>): unknown {
  // Handle null
  if (value === null) {
    return null
  }

  // Handle undefined
  if (value === undefined) {
    return { [TYPE_MARKERS.UNDEFINED]: true }
  }

  const type = typeof value

  // Handle primitives
  if (type === 'string' || type === 'boolean') {
    return value
  }

  if (type === 'number') {
    const num = value as number
    if (Number.isNaN(num)) {
      return { [TYPE_MARKERS.NAN]: true }
    }
    if (!Number.isFinite(num)) {
      return num > 0
        ? { [TYPE_MARKERS.INFINITY]: true }
        : { [TYPE_MARKERS.NEG_INFINITY]: true }
    }
    return num
  }

  if (type === 'bigint') {
    return { [TYPE_MARKERS.BIGINT]: (value as bigint).toString() }
  }

  // Handle Date
  if (value instanceof Date) {
    return { [TYPE_MARKERS.DATE]: value.toISOString() }
  }

  // Handle arrays
  if (Array.isArray(value)) {
    // Check for circular reference
    if (seen.has(value)) {
      throw new Error('Circular reference detected during serialization')
    }
    seen.add(value)

    const result = value.map((item) => serializeValue(item, seen))
    seen.delete(value)
    return result
  }

  // Handle objects
  if (type === 'object') {
    const obj = value as Record<string, unknown>

    // Check for circular reference
    if (seen.has(obj)) {
      throw new Error('Circular reference detected during serialization')
    }
    seen.add(obj)

    // Check for special ID object
    if ('$id' in obj && 'value' in obj) {
      const result = {
        [TYPE_MARKERS.ID]: {
          table: obj.$id,
          value: obj.value,
        },
      }
      seen.delete(obj)
      return result
    }

    // Regular object serialization
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      result[key] = serializeValue(obj[key], seen)
    }

    seen.delete(obj)
    return result
  }

  // Fallback - try to convert to string
  return String(value)
}

// ============================================================================
// deserialize() Implementation
// ============================================================================

/**
 * Deserializes a string back to its original value.
 * Reconstructs special Convex types from their serialized form.
 * @param data - The serialized string to deserialize
 * @returns The original value
 * @throws Error if data is invalid or cannot be parsed
 */
export function deserialize(data: string): unknown {
  // Validate input
  if (data === null || data === undefined) {
    throw new Error('Invalid input: deserialize requires a string, got null or undefined')
  }

  if (typeof data !== 'string') {
    throw new Error(`Invalid input: deserialize requires a string, got ${typeof data}`)
  }

  if (data === '') {
    throw new Error('Invalid input: cannot deserialize empty string')
  }

  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch (e) {
    throw new Error(`Invalid or malformed serialized data: ${(e as Error).message}`)
  }

  // Reconstruct special types
  return deserializeValue(parsed)
}

/**
 * Internal deserialization that reconstructs special types
 */
function deserializeValue(value: unknown): unknown {
  // Handle null
  if (value === null) {
    return null
  }

  const type = typeof value

  // Handle primitives
  if (type === 'string' || type === 'boolean' || type === 'number') {
    return value
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => deserializeValue(item))
  }

  // Handle objects
  if (type === 'object') {
    const obj = value as Record<string, unknown>

    // Check for special type markers
    if (TYPE_MARKERS.UNDEFINED in obj) {
      return undefined
    }

    if (TYPE_MARKERS.NAN in obj) {
      return NaN
    }

    if (TYPE_MARKERS.INFINITY in obj) {
      return Infinity
    }

    if (TYPE_MARKERS.NEG_INFINITY in obj) {
      return -Infinity
    }

    if (TYPE_MARKERS.BIGINT in obj) {
      return BigInt(obj[TYPE_MARKERS.BIGINT] as string)
    }

    if (TYPE_MARKERS.DATE in obj) {
      return new Date(obj[TYPE_MARKERS.DATE] as string)
    }

    if (TYPE_MARKERS.ID in obj) {
      const idData = obj[TYPE_MARKERS.ID] as { table: string; value: string }
      return { $id: idData.table, value: idData.value }
    }

    // Regular object deserialization
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      result[key] = deserializeValue(obj[key])
    }
    return result
  }

  return value
}
