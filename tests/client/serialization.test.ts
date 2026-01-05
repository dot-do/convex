/**
 * TDD Tests for Client SDK Request/Response Serialization (Layer 7)
 *
 * These tests define the expected interface and behavior for serializing
 * and deserializing data for client-server communication in convex.do.
 *
 * Handles:
 * - Function argument serialization
 * - Function result deserialization
 * - WebSocket message serialization/deserialization
 * - Convex value type support (Int64, Bytes, Dates, IDs)
 * - Schema validation during deserialization
 * - Error handling for malformed data
 */

import { describe, it, expect, beforeEach } from 'vitest'

import {
  // Core serialization functions
  serializeArgs,
  deserializeResult,
  serializeMessage,
  deserializeMessage,

  // Value converters
  serializeValue,
  deserializeValue,

  // Special type helpers
  serializeInt64,
  deserializeInt64,
  serializeBytes,
  deserializeBytes,
  serializeDate,
  deserializeDate,
  serializeId,
  deserializeId,

  // Binary format support
  serializeToBinary,
  deserializeFromBinary,

  // Schema validation
  validateWithSchema,

  // Error types
  SerializationError,
  DeserializationError,
  SchemaValidationError,

  // Types
  type SerializationOptions,
  type ConvexValue,
  type SerializedValue,
} from '../../src/client/serialization'

import type { SyncMessage } from '../../src/sync/protocol'

// ============================================================================
// Error Types Tests
// ============================================================================

describe('Error Types', () => {
  describe('SerializationError', () => {
    it('should be an instance of Error', () => {
      const error = new SerializationError('Serialization failed')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(SerializationError)
    })

    it('should have name property set to SerializationError', () => {
      const error = new SerializationError('Test')

      expect(error.name).toBe('SerializationError')
    })

    it('should have message property', () => {
      const error = new SerializationError('Custom message')

      expect(error.message).toBe('Custom message')
    })

    it('should include the problematic value', () => {
      const value = { circular: null as unknown }
      value.circular = value

      const error = new SerializationError('Cannot serialize circular reference', value)

      expect(error.value).toBe(value)
    })

    it('should include the path where error occurred', () => {
      const error = new SerializationError('Invalid value', undefined, ['args', 'user', 'data'])

      expect(error.path).toEqual(['args', 'user', 'data'])
    })
  })

  describe('DeserializationError', () => {
    it('should be an instance of Error', () => {
      const error = new DeserializationError('Deserialization failed')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(DeserializationError)
    })

    it('should have name property set to DeserializationError', () => {
      const error = new DeserializationError('Test')

      expect(error.name).toBe('DeserializationError')
    })

    it('should include raw input when available', () => {
      const error = new DeserializationError('Invalid JSON', '{{invalid}')

      expect(error.rawInput).toBe('{{invalid}')
    })

    it('should include the path where error occurred', () => {
      const error = new DeserializationError('Invalid value', 'input', ['result', 'items', '0'])

      expect(error.path).toEqual(['result', 'items', '0'])
    })
  })

  describe('SchemaValidationError', () => {
    it('should be an instance of DeserializationError', () => {
      const error = new SchemaValidationError('Schema mismatch')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(DeserializationError)
      expect(error).toBeInstanceOf(SchemaValidationError)
    })

    it('should have name property set to SchemaValidationError', () => {
      const error = new SchemaValidationError('Test')

      expect(error.name).toBe('SchemaValidationError')
    })

    it('should include expected and received types', () => {
      const error = new SchemaValidationError('Type mismatch', {
        expected: 'string',
        received: 'number',
      })

      expect(error.details?.expected).toBe('string')
      expect(error.details?.received).toBe('number')
    })
  })
})

// ============================================================================
// Primitive Value Serialization Tests
// ============================================================================

describe('Primitive Value Serialization', () => {
  describe('serializeValue', () => {
    it('should serialize strings unchanged', () => {
      expect(serializeValue('hello')).toBe('hello')
      expect(serializeValue('')).toBe('')
      expect(serializeValue('unicode: \u0000\u001f\ud83d\ude00')).toBe('unicode: \u0000\u001f\ud83d\ude00')
    })

    it('should serialize numbers unchanged', () => {
      expect(serializeValue(42)).toBe(42)
      expect(serializeValue(0)).toBe(0)
      expect(serializeValue(-123)).toBe(-123)
      expect(serializeValue(3.14159)).toBe(3.14159)
      expect(serializeValue(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
      expect(serializeValue(Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER)
    })

    it('should serialize booleans unchanged', () => {
      expect(serializeValue(true)).toBe(true)
      expect(serializeValue(false)).toBe(false)
    })

    it('should serialize null unchanged', () => {
      expect(serializeValue(null)).toBe(null)
    })

    it('should throw for undefined values', () => {
      expect(() => serializeValue(undefined)).toThrow(SerializationError)
    })

    it('should throw for NaN', () => {
      expect(() => serializeValue(NaN)).toThrow(SerializationError)
    })

    it('should throw for Infinity', () => {
      expect(() => serializeValue(Infinity)).toThrow(SerializationError)
      expect(() => serializeValue(-Infinity)).toThrow(SerializationError)
    })

    it('should throw for functions', () => {
      expect(() => serializeValue(() => {})).toThrow(SerializationError)
    })

    it('should throw for symbols', () => {
      expect(() => serializeValue(Symbol('test'))).toThrow(SerializationError)
    })
  })

  describe('deserializeValue', () => {
    it('should deserialize strings unchanged', () => {
      expect(deserializeValue('hello')).toBe('hello')
    })

    it('should deserialize numbers unchanged', () => {
      expect(deserializeValue(42)).toBe(42)
    })

    it('should deserialize booleans unchanged', () => {
      expect(deserializeValue(true)).toBe(true)
    })

    it('should deserialize null unchanged', () => {
      expect(deserializeValue(null)).toBe(null)
    })
  })
})

// ============================================================================
// Int64 (BigInt) Serialization Tests
// ============================================================================

describe('Int64 Serialization', () => {
  describe('serializeInt64', () => {
    it('should serialize BigInt to object with $int64 marker', () => {
      const result = serializeInt64(BigInt('9007199254740993'))

      expect(result).toEqual({ $int64: '9007199254740993' })
    })

    it('should serialize zero', () => {
      const result = serializeInt64(BigInt(0))

      expect(result).toEqual({ $int64: '0' })
    })

    it('should serialize negative BigInt', () => {
      const result = serializeInt64(BigInt('-9007199254740993'))

      expect(result).toEqual({ $int64: '-9007199254740993' })
    })

    it('should serialize max int64 value', () => {
      const maxInt64 = BigInt('9223372036854775807')
      const result = serializeInt64(maxInt64)

      expect(result).toEqual({ $int64: '9223372036854775807' })
    })

    it('should serialize min int64 value', () => {
      const minInt64 = BigInt('-9223372036854775808')
      const result = serializeInt64(minInt64)

      expect(result).toEqual({ $int64: '-9223372036854775808' })
    })
  })

  describe('deserializeInt64', () => {
    it('should deserialize $int64 marker to BigInt', () => {
      const result = deserializeInt64({ $int64: '9007199254740993' })

      expect(result).toBe(BigInt('9007199254740993'))
    })

    it('should deserialize zero', () => {
      const result = deserializeInt64({ $int64: '0' })

      expect(result).toBe(BigInt(0))
    })

    it('should deserialize negative values', () => {
      const result = deserializeInt64({ $int64: '-9007199254740993' })

      expect(result).toBe(BigInt('-9007199254740993'))
    })

    it('should throw for invalid $int64 format', () => {
      expect(() => deserializeInt64({ $int64: 'not-a-number' })).toThrow(DeserializationError)
    })

    it('should throw for non-object input', () => {
      expect(() => deserializeInt64('invalid')).toThrow(DeserializationError)
    })

    it('should throw for missing $int64 property', () => {
      expect(() => deserializeInt64({ other: '123' })).toThrow(DeserializationError)
    })
  })

  describe('serializeValue with BigInt', () => {
    it('should automatically serialize BigInt using $int64 format', () => {
      const result = serializeValue(BigInt('9007199254740993'))

      expect(result).toEqual({ $int64: '9007199254740993' })
    })
  })

  describe('deserializeValue with $int64', () => {
    it('should automatically deserialize $int64 to BigInt', () => {
      const result = deserializeValue({ $int64: '9007199254740993' })

      expect(result).toBe(BigInt('9007199254740993'))
    })
  })
})

// ============================================================================
// Bytes Serialization Tests
// ============================================================================

describe('Bytes Serialization', () => {
  describe('serializeBytes', () => {
    it('should serialize ArrayBuffer to base64 with $bytes marker', () => {
      const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer // "Hello"
      const result = serializeBytes(buffer)

      expect(result).toEqual({ $bytes: 'SGVsbG8=' })
    })

    it('should serialize empty ArrayBuffer', () => {
      const buffer = new ArrayBuffer(0)
      const result = serializeBytes(buffer)

      expect(result).toEqual({ $bytes: '' })
    })

    it('should serialize Uint8Array', () => {
      const arr = new Uint8Array([1, 2, 3, 4])
      const result = serializeBytes(arr)

      expect(result).toHaveProperty('$bytes')
      expect(typeof result.$bytes).toBe('string')
    })

    it('should handle binary data correctly', () => {
      const arr = new Uint8Array([0, 255, 128, 64])
      const result = serializeBytes(arr)

      expect(result).toHaveProperty('$bytes')
    })
  })

  describe('deserializeBytes', () => {
    it('should deserialize $bytes marker to ArrayBuffer', () => {
      const result = deserializeBytes({ $bytes: 'SGVsbG8=' })

      expect(result).toBeInstanceOf(ArrayBuffer)
      const view = new Uint8Array(result)
      expect(Array.from(view)).toEqual([72, 101, 108, 108, 111])
    })

    it('should deserialize empty base64', () => {
      const result = deserializeBytes({ $bytes: '' })

      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(0)
    })

    it('should throw for invalid base64', () => {
      expect(() => deserializeBytes({ $bytes: '!!invalid!!' })).toThrow(DeserializationError)
    })

    it('should throw for missing $bytes property', () => {
      expect(() => deserializeBytes({ other: 'test' })).toThrow(DeserializationError)
    })
  })

  describe('serializeValue with bytes', () => {
    it('should automatically serialize ArrayBuffer using $bytes format', () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer
      const result = serializeValue(buffer)

      expect(result).toHaveProperty('$bytes')
    })

    it('should automatically serialize Uint8Array using $bytes format', () => {
      const arr = new Uint8Array([1, 2, 3])
      const result = serializeValue(arr)

      expect(result).toHaveProperty('$bytes')
    })
  })

  describe('deserializeValue with $bytes', () => {
    it('should automatically deserialize $bytes to ArrayBuffer', () => {
      const result = deserializeValue({ $bytes: 'AQID' })

      expect(result).toBeInstanceOf(ArrayBuffer)
    })
  })
})

// ============================================================================
// Date Serialization Tests
// ============================================================================

describe('Date Serialization', () => {
  describe('serializeDate', () => {
    it('should serialize Date to timestamp with $date marker', () => {
      const date = new Date('2024-01-01T00:00:00.000Z')
      const result = serializeDate(date)

      expect(result).toEqual({ $date: 1704067200000 })
    })

    it('should serialize epoch date', () => {
      const date = new Date(0)
      const result = serializeDate(date)

      expect(result).toEqual({ $date: 0 })
    })

    it('should serialize negative timestamps', () => {
      const date = new Date('1969-01-01T00:00:00.000Z')
      const result = serializeDate(date)

      expect(result.$date).toBeLessThan(0)
    })

    it('should preserve milliseconds', () => {
      const date = new Date('2024-01-01T12:30:45.123Z')
      const result = serializeDate(date)

      // Verify milliseconds are preserved
      const reconstructed = new Date(result.$date)
      expect(reconstructed.getMilliseconds()).toBe(123)
    })
  })

  describe('deserializeDate', () => {
    it('should deserialize $date marker to Date', () => {
      const result = deserializeDate({ $date: 1704067200000 })

      expect(result).toBeInstanceOf(Date)
      expect(result.toISOString()).toBe('2024-01-01T00:00:00.000Z')
    })

    it('should deserialize epoch', () => {
      const result = deserializeDate({ $date: 0 })

      expect(result).toBeInstanceOf(Date)
      expect(result.getTime()).toBe(0)
    })

    it('should deserialize negative timestamps', () => {
      // -31536000000 ms is one year before epoch = Dec 31, 1968 (not 1969)
      const result = deserializeDate({ $date: -31536000000 })

      expect(result).toBeInstanceOf(Date)
      expect(result.getFullYear()).toBe(1968)
    })

    it('should throw for invalid $date value', () => {
      expect(() => deserializeDate({ $date: 'not-a-number' })).toThrow(DeserializationError)
    })

    it('should throw for missing $date property', () => {
      expect(() => deserializeDate({ other: 123 })).toThrow(DeserializationError)
    })
  })

  describe('serializeValue with Date', () => {
    it('should automatically serialize Date using $date format', () => {
      const date = new Date('2024-01-01T00:00:00.000Z')
      const result = serializeValue(date)

      expect(result).toEqual({ $date: 1704067200000 })
    })
  })

  describe('deserializeValue with $date', () => {
    it('should automatically deserialize $date to Date', () => {
      const result = deserializeValue({ $date: 1704067200000 })

      expect(result).toBeInstanceOf(Date)
    })
  })
})

// ============================================================================
// ID Serialization Tests
// ============================================================================

describe('ID Serialization', () => {
  describe('serializeId', () => {
    it('should serialize ID with table:id format', () => {
      const result = serializeId('users', 'abc123def456')

      expect(result).toEqual({ $id: { table: 'users', id: 'abc123def456' } })
    })

    it('should handle various table names', () => {
      const result = serializeId('messages', 'xyz789')

      expect(result).toEqual({ $id: { table: 'messages', id: 'xyz789' } })
    })

    it('should preserve full ID string', () => {
      const longId = 'a'.repeat(64)
      const result = serializeId('documents', longId)

      expect(result.$id.id).toBe(longId)
    })
  })

  describe('deserializeId', () => {
    it('should deserialize $id marker to ID object', () => {
      const result = deserializeId({ $id: { table: 'users', id: 'abc123' } })

      expect(result).toEqual({ table: 'users', id: 'abc123' })
    })

    it('should throw for invalid $id format', () => {
      expect(() => deserializeId({ $id: 'invalid' })).toThrow(DeserializationError)
    })

    it('should throw for missing table', () => {
      expect(() => deserializeId({ $id: { id: 'abc123' } })).toThrow(DeserializationError)
    })

    it('should throw for missing id', () => {
      expect(() => deserializeId({ $id: { table: 'users' } })).toThrow(DeserializationError)
    })
  })

  describe('serializeValue with ID', () => {
    it('should serialize ID objects with $id marker', () => {
      const id = { __tableName: 'users' as const, value: 'abc123' }
      const result = serializeValue(id, { treatAsId: true, tableName: 'users' })

      expect(result).toHaveProperty('$id')
    })
  })
})

// ============================================================================
// Array and Object Serialization Tests
// ============================================================================

describe('Array Serialization', () => {
  it('should serialize arrays of primitives', () => {
    const arr = [1, 'two', true, null]
    const result = serializeValue(arr)

    expect(result).toEqual([1, 'two', true, null])
  })

  it('should serialize nested arrays', () => {
    const arr = [[1, 2], [3, [4, 5]]]
    const result = serializeValue(arr)

    expect(result).toEqual([[1, 2], [3, [4, 5]]])
  })

  it('should serialize arrays with special types', () => {
    const arr = [BigInt(123), new Date('2024-01-01T00:00:00Z')]
    const result = serializeValue(arr)

    expect(result).toEqual([
      { $int64: '123' },
      { $date: 1704067200000 },
    ])
  })

  it('should serialize empty arrays', () => {
    const result = serializeValue([])

    expect(result).toEqual([])
  })

  it('should throw for arrays with undefined elements', () => {
    expect(() => serializeValue([1, undefined, 3])).toThrow(SerializationError)
  })

  it('should deserialize arrays correctly', () => {
    const serialized = [1, { $int64: '123' }, { $date: 1704067200000 }]
    const result = deserializeValue(serialized) as unknown[]

    expect(result[0]).toBe(1)
    expect(result[1]).toBe(BigInt(123))
    expect(result[2]).toBeInstanceOf(Date)
  })
})

describe('Object Serialization', () => {
  it('should serialize plain objects', () => {
    const obj = { name: 'Alice', age: 30, active: true }
    const result = serializeValue(obj)

    expect(result).toEqual({ name: 'Alice', age: 30, active: true })
  })

  it('should serialize nested objects', () => {
    const obj = {
      user: {
        name: 'Alice',
        address: {
          city: 'SF',
        },
      },
    }
    const result = serializeValue(obj)

    expect(result).toEqual(obj)
  })

  it('should serialize objects with special types', () => {
    const obj = {
      timestamp: BigInt('1704067200000'),
      data: new Uint8Array([1, 2, 3]).buffer,
      created: new Date('2024-01-01T00:00:00Z'),
    }
    const result = serializeValue(obj) as Record<string, unknown>

    expect(result.timestamp).toEqual({ $int64: '1704067200000' })
    expect(result.data).toHaveProperty('$bytes')
    expect(result.created).toEqual({ $date: 1704067200000 })
  })

  it('should serialize empty objects', () => {
    const result = serializeValue({})

    expect(result).toEqual({})
  })

  it('should throw for objects with undefined values', () => {
    expect(() => serializeValue({ a: 1, b: undefined })).toThrow(SerializationError)
  })

  it('should throw for circular references', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj

    expect(() => serializeValue(obj)).toThrow(SerializationError)
  })

  it('should deserialize objects correctly', () => {
    const serialized = {
      count: 1,
      bigValue: { $int64: '9007199254740993' },
      created: { $date: 1704067200000 },
    }
    const result = deserializeValue(serialized) as Record<string, unknown>

    expect(result.count).toBe(1)
    expect(result.bigValue).toBe(BigInt('9007199254740993'))
    expect(result.created).toBeInstanceOf(Date)
  })
})

// ============================================================================
// serializeArgs Tests
// ============================================================================

describe('serializeArgs', () => {
  it('should serialize empty args', () => {
    const result = serializeArgs({})

    expect(result).toEqual({})
  })

  it('should serialize primitive args', () => {
    const args = { name: 'Alice', age: 30, active: true }
    const result = serializeArgs(args)

    expect(result).toEqual(args)
  })

  it('should serialize args with special types', () => {
    const args = {
      userId: BigInt('12345'),
      timestamp: new Date('2024-01-01T00:00:00Z'),
      data: new Uint8Array([1, 2, 3]).buffer,
    }
    const result = serializeArgs(args)

    expect(result.userId).toEqual({ $int64: '12345' })
    expect(result.timestamp).toEqual({ $date: 1704067200000 })
    expect(result.data).toHaveProperty('$bytes')
  })

  it('should serialize nested args', () => {
    const args = {
      user: {
        name: 'Alice',
        metadata: {
          role: 'admin',
          permissions: ['read', 'write'],
        },
      },
    }
    const result = serializeArgs(args)

    expect(result).toEqual(args)
  })

  it('should handle array args', () => {
    const args = {
      ids: [BigInt(1), BigInt(2), BigInt(3)],
      names: ['Alice', 'Bob'],
    }
    const result = serializeArgs(args)

    expect(result.ids).toEqual([{ $int64: '1' }, { $int64: '2' }, { $int64: '3' }])
    expect(result.names).toEqual(['Alice', 'Bob'])
  })

  it('should throw for args with undefined values', () => {
    expect(() => serializeArgs({ name: 'Alice', value: undefined })).toThrow(SerializationError)
  })

  it('should throw for non-object args', () => {
    expect(() => serializeArgs('invalid' as unknown as Record<string, unknown>)).toThrow(SerializationError)
    expect(() => serializeArgs(null as unknown as Record<string, unknown>)).toThrow(SerializationError)
    expect(() => serializeArgs([] as unknown as Record<string, unknown>)).toThrow(SerializationError)
  })
})

// ============================================================================
// deserializeResult Tests
// ============================================================================

describe('deserializeResult', () => {
  it('should deserialize primitive results', () => {
    expect(deserializeResult(42)).toBe(42)
    expect(deserializeResult('hello')).toBe('hello')
    expect(deserializeResult(true)).toBe(true)
    expect(deserializeResult(null)).toBe(null)
  })

  it('should deserialize results with special types', () => {
    const serialized = {
      id: { $int64: '12345' },
      created: { $date: 1704067200000 },
      data: { $bytes: 'AQID' },
    }
    const result = deserializeResult(serialized) as Record<string, unknown>

    expect(result.id).toBe(BigInt('12345'))
    expect(result.created).toBeInstanceOf(Date)
    expect(result.data).toBeInstanceOf(ArrayBuffer)
  })

  it('should deserialize array results', () => {
    const serialized = [
      { name: 'Alice', count: { $int64: '100' } },
      { name: 'Bob', count: { $int64: '200' } },
    ]
    const result = deserializeResult(serialized) as Array<{ name: string; count: bigint }>

    expect(result[0].name).toBe('Alice')
    expect(result[0].count).toBe(BigInt(100))
  })

  it('should deserialize nested results', () => {
    const serialized = {
      user: {
        id: { $int64: '1' },
        profile: {
          created: { $date: 1704067200000 },
        },
      },
    }
    const result = deserializeResult(serialized) as {
      user: { id: bigint; profile: { created: Date } }
    }

    expect(result.user.id).toBe(BigInt(1))
    expect(result.user.profile.created).toBeInstanceOf(Date)
  })

  it('should handle null and undefined result', () => {
    expect(deserializeResult(null)).toBe(null)
    expect(deserializeResult(undefined)).toBe(undefined)
  })
})

// ============================================================================
// WebSocket Message Serialization Tests
// ============================================================================

describe('serializeMessage', () => {
  it('should serialize ping message', () => {
    const message: SyncMessage = { type: 'ping' }
    const result = serializeMessage(message)

    expect(result).toBe('{"type":"ping"}')
  })

  it('should serialize pong message', () => {
    const message: SyncMessage = { type: 'pong' }
    const result = serializeMessage(message)

    expect(result).toBe('{"type":"pong"}')
  })

  it('should serialize mutation request with special types', () => {
    const message: SyncMessage = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'users:create',
      args: {
        name: 'Alice',
        count: BigInt(100),
        created: new Date('2024-01-01T00:00:00Z'),
      } as Record<string, unknown>,
    }
    const result = serializeMessage(message)
    const parsed = JSON.parse(result)

    expect(parsed.type).toBe('mutation')
    expect(parsed.args.count).toEqual({ $int64: '100' })
    expect(parsed.args.created).toEqual({ $date: 1704067200000 })
  })

  it('should serialize query subscription', () => {
    const message: SyncMessage = {
      type: 'subscribe',
      requestId: 'req_1',
      queryId: 'q_1',
      query: 'users:list',
      args: { limit: 10 },
    }
    const result = serializeMessage(message)
    const parsed = JSON.parse(result)

    expect(parsed.type).toBe('subscribe')
    expect(parsed.args).toEqual({ limit: 10 })
  })

  it('should serialize action request', () => {
    const message: SyncMessage = {
      type: 'action',
      requestId: 'req_1',
      action: 'email:send',
      args: { to: 'test@example.com' },
    }
    const result = serializeMessage(message)
    const parsed = JSON.parse(result)

    expect(parsed.type).toBe('action')
    expect(parsed.action).toBe('email:send')
  })

  it('should serialize authenticate message', () => {
    const message: SyncMessage = {
      type: 'authenticate',
      token: 'jwt_token_here',
    }
    const result = serializeMessage(message)
    const parsed = JSON.parse(result)

    expect(parsed.type).toBe('authenticate')
    expect(parsed.token).toBe('jwt_token_here')
  })
})

describe('deserializeMessage', () => {
  it('should deserialize ping message', () => {
    const result = deserializeMessage('{"type":"ping"}')

    expect(result.type).toBe('ping')
  })

  it('should deserialize pong message', () => {
    const result = deserializeMessage('{"type":"pong"}')

    expect(result.type).toBe('pong')
  })

  it('should deserialize query result with special types', () => {
    const json = JSON.stringify({
      type: 'queryResult',
      queryId: 'q_1',
      value: [
        { id: { $int64: '1' }, created: { $date: 1704067200000 } },
      ],
      logLines: [],
    })
    const result = deserializeMessage(json)

    expect(result.type).toBe('queryResult')
    if (result.type === 'queryResult') {
      const items = result.value as Array<{ id: bigint; created: Date }>
      expect(items[0].id).toBe(BigInt(1))
      expect(items[0].created).toBeInstanceOf(Date)
    }
  })

  it('should deserialize mutation result', () => {
    const json = JSON.stringify({
      type: 'mutationResult',
      requestId: 'req_1',
      success: true,
      value: { $int64: '12345' },
      logLines: [],
    })
    const result = deserializeMessage(json)

    expect(result.type).toBe('mutationResult')
    if (result.type === 'mutationResult') {
      expect(result.value).toBe(BigInt(12345))
    }
  })

  it('should deserialize action result', () => {
    const json = JSON.stringify({
      type: 'actionResult',
      requestId: 'req_1',
      success: true,
      value: { sent: true },
      logLines: [],
    })
    const result = deserializeMessage(json)

    expect(result.type).toBe('actionResult')
    if (result.type === 'actionResult') {
      expect(result.value).toEqual({ sent: true })
    }
  })

  it('should deserialize error response', () => {
    const json = JSON.stringify({
      type: 'error',
      error: 'Something went wrong',
      errorCode: 'INTERNAL_ERROR',
    })
    const result = deserializeMessage(json)

    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.error).toBe('Something went wrong')
      expect(result.errorCode).toBe('INTERNAL_ERROR')
    }
  })

  it('should throw DeserializationError for invalid JSON', () => {
    expect(() => deserializeMessage('not valid json')).toThrow(DeserializationError)
  })

  it('should throw DeserializationError for invalid message type', () => {
    expect(() => deserializeMessage('{"type":"unknown"}')).toThrow(DeserializationError)
  })

  it('should throw DeserializationError for missing required fields', () => {
    expect(() => deserializeMessage('{"type":"subscribe"}')).toThrow(DeserializationError)
  })
})

// ============================================================================
// Binary Format Support Tests
// ============================================================================

describe('Binary Format Support', () => {
  describe('serializeToBinary', () => {
    it('should serialize message to binary format', () => {
      const message: SyncMessage = { type: 'ping' }
      const result = serializeToBinary(message)

      expect(result).toBeInstanceOf(ArrayBuffer)
    })

    it('should create valid binary representation', () => {
      const message: SyncMessage = {
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'test:mutation',
        args: { value: 42 },
      }
      const result = serializeToBinary(message)

      // Should be able to deserialize back
      const deserialized = deserializeFromBinary(result)
      expect(deserialized.type).toBe('mutation')
    })

    it('should handle special types in binary format', () => {
      const message: SyncMessage = {
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'test:mutation',
        args: {
          bigInt: BigInt(12345),
          date: new Date('2024-01-01T00:00:00Z'),
        } as Record<string, unknown>,
      }
      const result = serializeToBinary(message)

      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBeGreaterThan(0)
    })
  })

  describe('deserializeFromBinary', () => {
    it('should deserialize binary format to message', () => {
      const original: SyncMessage = { type: 'ping' }
      const binary = serializeToBinary(original)
      const result = deserializeFromBinary(binary)

      expect(result.type).toBe('ping')
    })

    it('should deserialize with special types preserved', () => {
      const original: SyncMessage = {
        type: 'queryResult',
        queryId: 'q_1',
        value: {
          id: BigInt(123),
          created: new Date('2024-01-01T00:00:00Z'),
        },
        logLines: [],
      }
      const binary = serializeToBinary(original)
      const result = deserializeFromBinary(binary)

      expect(result.type).toBe('queryResult')
      if (result.type === 'queryResult') {
        const value = result.value as { id: bigint; created: Date }
        expect(value.id).toBe(BigInt(123))
        expect(value.created).toBeInstanceOf(Date)
      }
    })

    it('should throw for invalid binary data', () => {
      const invalidBinary = new Uint8Array([0, 1, 2, 3]).buffer

      expect(() => deserializeFromBinary(invalidBinary)).toThrow(DeserializationError)
    })
  })
})

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('Schema Validation', () => {
  describe('validateWithSchema', () => {
    it('should pass for valid primitive types', () => {
      const schema = { type: 'string' as const }
      const value = 'hello'

      expect(() => validateWithSchema(value, schema)).not.toThrow()
    })

    it('should throw SchemaValidationError for type mismatch', () => {
      const schema = { type: 'string' as const }
      const value = 42

      expect(() => validateWithSchema(value, schema)).toThrow(SchemaValidationError)
    })

    it('should validate number type', () => {
      const schema = { type: 'number' as const }

      expect(() => validateWithSchema(42, schema)).not.toThrow()
      expect(() => validateWithSchema('42', schema)).toThrow(SchemaValidationError)
    })

    it('should validate boolean type', () => {
      const schema = { type: 'boolean' as const }

      expect(() => validateWithSchema(true, schema)).not.toThrow()
      expect(() => validateWithSchema(1, schema)).toThrow(SchemaValidationError)
    })

    it('should validate null type', () => {
      const schema = { type: 'null' as const }

      expect(() => validateWithSchema(null, schema)).not.toThrow()
      expect(() => validateWithSchema(undefined, schema)).toThrow(SchemaValidationError)
    })

    it('should validate int64 type', () => {
      const schema = { type: 'int64' as const }

      expect(() => validateWithSchema(BigInt(123), schema)).not.toThrow()
      expect(() => validateWithSchema(123, schema)).toThrow(SchemaValidationError)
    })

    it('should validate bytes type', () => {
      const schema = { type: 'bytes' as const }

      expect(() => validateWithSchema(new ArrayBuffer(4), schema)).not.toThrow()
      expect(() => validateWithSchema('binary', schema)).toThrow(SchemaValidationError)
    })

    it('should validate date type', () => {
      const schema = { type: 'date' as const }

      expect(() => validateWithSchema(new Date(), schema)).not.toThrow()
      expect(() => validateWithSchema(1704067200000, schema)).toThrow(SchemaValidationError)
    })

    it('should validate array type with element schema', () => {
      const schema = { type: 'array' as const, element: { type: 'string' as const } }

      expect(() => validateWithSchema(['a', 'b'], schema)).not.toThrow()
      expect(() => validateWithSchema(['a', 1], schema)).toThrow(SchemaValidationError)
    })

    it('should validate object type with field schemas', () => {
      const schema = {
        type: 'object' as const,
        fields: {
          name: { type: 'string' as const },
          age: { type: 'number' as const },
        },
      }

      expect(() => validateWithSchema({ name: 'Alice', age: 30 }, schema)).not.toThrow()
      expect(() => validateWithSchema({ name: 'Alice', age: '30' }, schema)).toThrow(SchemaValidationError)
    })

    it('should validate optional fields', () => {
      const schema = {
        type: 'object' as const,
        fields: {
          name: { type: 'string' as const },
          age: { type: 'number' as const, optional: true },
        },
      }

      expect(() => validateWithSchema({ name: 'Alice' }, schema)).not.toThrow()
      expect(() => validateWithSchema({ name: 'Alice', age: 30 }, schema)).not.toThrow()
    })

    it('should throw for missing required fields', () => {
      const schema = {
        type: 'object' as const,
        fields: {
          name: { type: 'string' as const },
          age: { type: 'number' as const },
        },
      }

      expect(() => validateWithSchema({ name: 'Alice' }, schema)).toThrow(SchemaValidationError)
    })

    it('should validate union types', () => {
      const schema = {
        type: 'union' as const,
        variants: [
          { type: 'string' as const },
          { type: 'number' as const },
        ],
      }

      expect(() => validateWithSchema('hello', schema)).not.toThrow()
      expect(() => validateWithSchema(42, schema)).not.toThrow()
      expect(() => validateWithSchema(true, schema)).toThrow(SchemaValidationError)
    })

    it('should validate nested structures', () => {
      const schema = {
        type: 'object' as const,
        fields: {
          users: {
            type: 'array' as const,
            element: {
              type: 'object' as const,
              fields: {
                id: { type: 'int64' as const },
                name: { type: 'string' as const },
              },
            },
          },
        },
      }

      const valid = {
        users: [
          { id: BigInt(1), name: 'Alice' },
          { id: BigInt(2), name: 'Bob' },
        ],
      }
      const invalid = {
        users: [{ id: '1', name: 'Alice' }],
      }

      expect(() => validateWithSchema(valid, schema)).not.toThrow()
      expect(() => validateWithSchema(invalid, schema)).toThrow(SchemaValidationError)
    })
  })
})

// ============================================================================
// Round-trip Tests
// ============================================================================

describe('Round-trip Serialization', () => {
  it('should preserve primitives through round-trip', () => {
    const values = ['hello', 42, 3.14, true, false, null]

    for (const value of values) {
      const serialized = serializeValue(value)
      const deserialized = deserializeValue(serialized)
      expect(deserialized).toEqual(value)
    }
  })

  it('should preserve BigInt through round-trip', () => {
    const values = [
      BigInt(0),
      BigInt(123),
      BigInt(-456),
      BigInt('9007199254740993'),
      BigInt('-9007199254740993'),
      BigInt('9223372036854775807'),
      BigInt('-9223372036854775808'),
    ]

    for (const value of values) {
      const serialized = serializeValue(value)
      const deserialized = deserializeValue(serialized)
      expect(deserialized).toBe(value)
    }
  })

  it('should preserve Date through round-trip', () => {
    const dates = [
      new Date('2024-01-01T00:00:00.000Z'),
      new Date(0),
      new Date('1969-01-01T00:00:00.000Z'),
      new Date('2024-06-15T12:30:45.123Z'),
    ]

    for (const date of dates) {
      const serialized = serializeValue(date)
      const deserialized = deserializeValue(serialized) as Date
      expect(deserialized.getTime()).toBe(date.getTime())
    }
  })

  it('should preserve ArrayBuffer through round-trip', () => {
    const buffers = [
      new Uint8Array([]).buffer,
      new Uint8Array([1, 2, 3, 4]).buffer,
      new Uint8Array([0, 255, 128, 64, 32]).buffer,
      new Uint8Array(1024).buffer, // Larger buffer
    ]

    for (const buffer of buffers) {
      const serialized = serializeValue(buffer)
      const deserialized = deserializeValue(serialized) as ArrayBuffer
      expect(deserialized.byteLength).toBe(buffer.byteLength)
      expect(Array.from(new Uint8Array(deserialized))).toEqual(Array.from(new Uint8Array(buffer)))
    }
  })

  it('should preserve complex objects through round-trip', () => {
    const original = {
      id: BigInt(12345),
      name: 'Test',
      created: new Date('2024-01-01T00:00:00Z'),
      data: new Uint8Array([1, 2, 3]).buffer,
      nested: {
        count: BigInt(100),
        items: [BigInt(1), BigInt(2), BigInt(3)],
      },
      tags: ['a', 'b', 'c'],
    }

    const serialized = serializeValue(original)
    const deserialized = deserializeValue(serialized) as typeof original

    expect(deserialized.id).toBe(original.id)
    expect(deserialized.name).toBe(original.name)
    expect(deserialized.created.getTime()).toBe(original.created.getTime())
    expect(new Uint8Array(deserialized.data)).toEqual(new Uint8Array(original.data))
    expect(deserialized.nested.count).toBe(original.nested.count)
    expect(deserialized.nested.items).toEqual(original.nested.items)
    expect(deserialized.tags).toEqual(original.tags)
  })

  it('should preserve args through round-trip', () => {
    const original = {
      userId: BigInt(123),
      filter: {
        minDate: new Date('2024-01-01T00:00:00Z'),
        tags: ['important', 'urgent'],
      },
      limit: 10,
    }

    const serialized = serializeArgs(original)
    const deserialized = deserializeResult(serialized) as typeof original

    expect(deserialized.userId).toBe(original.userId)
    expect(deserialized.filter.minDate.getTime()).toBe(original.filter.minDate.getTime())
    expect(deserialized.filter.tags).toEqual(original.filter.tags)
    expect(deserialized.limit).toBe(original.limit)
  })

  it('should preserve messages through round-trip', () => {
    const original: SyncMessage = {
      type: 'mutation',
      requestId: 'req_123',
      mutation: 'users:create',
      args: {
        name: 'Alice',
        count: BigInt(100),
        created: new Date('2024-01-01T00:00:00Z'),
      } as Record<string, unknown>,
    }

    const serialized = serializeMessage(original)
    const deserialized = deserializeMessage(serialized)

    expect(deserialized.type).toBe(original.type)
    if (deserialized.type === 'mutation') {
      expect(deserialized.requestId).toBe(original.requestId)
      expect(deserialized.mutation).toBe(original.mutation)
      const args = deserialized.args as { name: string; count: bigint; created: Date }
      expect(args.name).toBe('Alice')
      expect(args.count).toBe(BigInt(100))
      expect(args.created.getTime()).toBe(new Date('2024-01-01T00:00:00Z').getTime())
    }
  })
})

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty strings', () => {
    const serialized = serializeValue('')
    const deserialized = deserializeValue(serialized)

    expect(deserialized).toBe('')
  })

  it('should handle very long strings', () => {
    const longString = 'a'.repeat(100000)
    const serialized = serializeValue(longString)
    const deserialized = deserializeValue(serialized)

    expect(deserialized).toBe(longString)
  })

  it('should handle unicode characters', () => {
    const unicode = 'Hello World \u0000 \ud83d\ude00 \u4e2d\u6587'
    const serialized = serializeValue(unicode)
    const deserialized = deserializeValue(serialized)

    expect(deserialized).toBe(unicode)
  })

  it('should handle max safe integer boundaries', () => {
    const maxSafe = Number.MAX_SAFE_INTEGER
    const serialized = serializeValue(maxSafe)
    const deserialized = deserializeValue(serialized)

    expect(deserialized).toBe(maxSafe)
  })

  it('should handle deeply nested structures', () => {
    const deep = {
      a: { b: { c: { d: { e: { f: { g: { h: { value: 'deep' } } } } } } } },
    }
    const serialized = serializeValue(deep)
    const deserialized = deserializeValue(serialized) as typeof deep

    expect(deserialized.a.b.c.d.e.f.g.h.value).toBe('deep')
  })

  it('should handle large arrays', () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => i)
    const serialized = serializeValue(largeArray)
    const deserialized = deserializeValue(serialized) as number[]

    expect(deserialized.length).toBe(10000)
    expect(deserialized[9999]).toBe(9999)
  })

  it('should handle objects with many keys', () => {
    const manyKeys: Record<string, number> = {}
    for (let i = 0; i < 1000; i++) {
      manyKeys[`key_${i}`] = i
    }
    const serialized = serializeValue(manyKeys)
    const deserialized = deserializeValue(serialized) as typeof manyKeys

    expect(Object.keys(deserialized).length).toBe(1000)
    expect(deserialized.key_999).toBe(999)
  })

  it('should handle mixed special types in arrays', () => {
    const mixed = [
      BigInt(1),
      new Date('2024-01-01T00:00:00Z'),
      new Uint8Array([1, 2, 3]).buffer,
      'string',
      42,
      null,
    ]
    const serialized = serializeValue(mixed)
    const deserialized = deserializeValue(serialized) as unknown[]

    expect(deserialized[0]).toBe(BigInt(1))
    expect((deserialized[1] as Date).getTime()).toBe(new Date('2024-01-01T00:00:00Z').getTime())
    expect(deserialized[2]).toBeInstanceOf(ArrayBuffer)
    expect(deserialized[3]).toBe('string')
    expect(deserialized[4]).toBe(42)
    expect(deserialized[5]).toBe(null)
  })

  it('should distinguish between $int64, $bytes, $date markers and regular objects', () => {
    // Regular objects that look like markers but aren't
    const notAMarker = { $int64: 'not-valid', otherField: true }
    const serialized = serializeValue(notAMarker)
    const deserialized = deserializeValue(serialized) as typeof notAMarker

    // Should remain as object since it has extra fields
    expect(deserialized.$int64).toBe('not-valid')
    expect(deserialized.otherField).toBe(true)
  })

  it('should handle negative zero', () => {
    const serialized = serializeValue(-0)
    const deserialized = deserializeValue(serialized)

    // JavaScript preserves -0 through serialization (no conversion to 0)
    // We verify the value is numeric zero (comparing with == gives true)
    expect(deserialized == 0).toBe(true)
    expect(typeof deserialized).toBe('number')
  })

  it('should handle scientific notation numbers', () => {
    const values = [1e10, 1e-10, 2.5e20]

    for (const value of values) {
      const serialized = serializeValue(value)
      const deserialized = deserializeValue(serialized)
      expect(deserialized).toBe(value)
    }
  })
})

// ============================================================================
// Options Tests
// ============================================================================

describe('Serialization Options', () => {
  it('should respect skipUndefined option', () => {
    const options: SerializationOptions = { skipUndefined: true }
    const obj = { a: 1, b: undefined, c: 3 }

    const result = serializeValue(obj, options) as Record<string, unknown>

    expect(result).toEqual({ a: 1, c: 3 })
    expect('b' in result).toBe(false)
  })

  it('should respect maxDepth option', () => {
    const options: SerializationOptions = { maxDepth: 3 }
    const deep = { a: { b: { c: { d: { e: 'too deep' } } } } }

    expect(() => serializeValue(deep, options)).toThrow(SerializationError)
  })

  it('should respect detectCircular option', () => {
    const options: SerializationOptions = { detectCircular: true }
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular

    expect(() => serializeValue(circular, options)).toThrow(SerializationError)
  })
})

// ============================================================================
// Type Safety Tests
// ============================================================================

describe('Type Safety', () => {
  it('should properly type serialized values', () => {
    const value: ConvexValue = BigInt(123)
    const serialized: SerializedValue = serializeValue(value)

    // TypeScript should recognize this as a valid serialized value
    expect(serialized).toEqual({ $int64: '123' })
  })

  it('should properly type deserialized values', () => {
    const serialized: SerializedValue = { $int64: '123' }
    const value: ConvexValue = deserializeValue(serialized)

    expect(value).toBe(BigInt(123))
  })
})
