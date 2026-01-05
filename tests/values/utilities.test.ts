/**
 * TDD RED Phase Tests for Utility Functions
 *
 * These tests define the expected behavior of utility functions that don't exist yet.
 * All tests should compile but FAIL because the implementations are missing.
 */

import { describe, it, expect } from 'vitest'
import { generateId, hash, serialize, deserialize } from '../../src/values/utilities'

// ============================================================================
// generateId() Tests
// ============================================================================

describe('generateId', () => {
  describe('basic functionality', () => {
    it('should return a string', () => {
      const id = generateId('users')
      expect(typeof id).toBe('string')
    })

    it('should produce a non-empty string', () => {
      const id = generateId('users')
      expect(id.length).toBeGreaterThan(0)
    })

    it('should accept a table name parameter', () => {
      const id = generateId('documents')
      expect(id).toBeDefined()
    })
  })

  describe('Convex ID format', () => {
    it('should produce a valid Convex ID format (base64-like)', () => {
      const id = generateId('users')
      // Convex IDs are typically URL-safe base64 characters
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/)
    })

    it('should have an appropriate length for Convex IDs', () => {
      const id = generateId('users')
      // Convex IDs are typically 24-32 characters
      expect(id.length).toBeGreaterThanOrEqual(24)
      expect(id.length).toBeLessThanOrEqual(64)
    })

    it('should include table name reference in the ID', () => {
      const usersId = generateId('users')
      const docsId = generateId('documents')
      // IDs from different tables should be distinguishable
      // The exact mechanism depends on implementation
      expect(usersId).not.toBe(docsId)
    })
  })

  describe('uniqueness', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId('users')
      const id2 = generateId('users')
      expect(id1).not.toBe(id2)
    })

    it('should generate 1000 unique IDs with no duplicates', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId('users'))
      }
      expect(ids.size).toBe(1000)
    })

    it('should generate unique IDs across different tables', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateId('users'))
        ids.add(generateId('documents'))
        ids.add(generateId('messages'))
      }
      expect(ids.size).toBe(300)
    })
  })

  describe('character set', () => {
    it('should only contain URL-safe characters', () => {
      for (let i = 0; i < 100; i++) {
        const id = generateId('test')
        // URL-safe base64 characters only
        expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
      }
    })

    it('should not contain special characters that need URL encoding', () => {
      for (let i = 0; i < 100; i++) {
        const id = generateId('test')
        expect(id).not.toMatch(/[+/=]/)
      }
    })
  })

  describe('edge cases', () => {
    it('should handle empty table name', () => {
      expect(() => generateId('')).toThrow()
    })

    it('should handle table names with special characters', () => {
      // Table names should only be valid identifiers
      expect(() => generateId('invalid-table')).toThrow()
    })

    it('should handle very long table names', () => {
      const longTableName = 'a'.repeat(100)
      const id = generateId(longTableName)
      expect(typeof id).toBe('string')
    })
  })
})

// ============================================================================
// hash() Tests
// ============================================================================

describe('hash', () => {
  describe('consistency', () => {
    it('should produce the same hash for the same string input', () => {
      const hash1 = hash('hello')
      const hash2 = hash('hello')
      expect(hash1).toBe(hash2)
    })

    it('should produce the same hash for the same number input', () => {
      const hash1 = hash(42)
      const hash2 = hash(42)
      expect(hash1).toBe(hash2)
    })

    it('should produce the same hash for the same object input', () => {
      const hash1 = hash({ a: 1, b: 2 })
      const hash2 = hash({ a: 1, b: 2 })
      expect(hash1).toBe(hash2)
    })

    it('should produce the same hash for deeply nested objects', () => {
      const obj = { a: { b: { c: { d: [1, 2, 3] } } } }
      const hash1 = hash(obj)
      const hash2 = hash(obj)
      expect(hash1).toBe(hash2)
    })
  })

  describe('different inputs produce different outputs', () => {
    it('should produce different hashes for different strings', () => {
      const hash1 = hash('hello')
      const hash2 = hash('world')
      expect(hash1).not.toBe(hash2)
    })

    it('should produce different hashes for different numbers', () => {
      const hash1 = hash(42)
      const hash2 = hash(43)
      expect(hash1).not.toBe(hash2)
    })

    it('should produce different hashes for different objects', () => {
      const hash1 = hash({ a: 1 })
      const hash2 = hash({ a: 2 })
      expect(hash1).not.toBe(hash2)
    })

    it('should produce different hashes for objects with different keys', () => {
      const hash1 = hash({ a: 1 })
      const hash2 = hash({ b: 1 })
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('input types', () => {
    it('should hash strings', () => {
      const result = hash('test string')
      expect(typeof result).toBe('string')
    })

    it('should hash numbers', () => {
      const result = hash(123.456)
      expect(typeof result).toBe('string')
    })

    it('should hash booleans', () => {
      const trueHash = hash(true)
      const falseHash = hash(false)
      expect(trueHash).not.toBe(falseHash)
    })

    it('should hash null', () => {
      const result = hash(null)
      expect(typeof result).toBe('string')
    })

    it('should hash arrays', () => {
      const result = hash([1, 2, 3])
      expect(typeof result).toBe('string')
    })

    it('should hash objects', () => {
      const result = hash({ key: 'value' })
      expect(typeof result).toBe('string')
    })

    it('should hash nested structures', () => {
      const result = hash({
        users: [{ name: 'Alice' }, { name: 'Bob' }],
        count: 2,
      })
      expect(typeof result).toBe('string')
    })

    it('should handle undefined values in objects', () => {
      const result = hash({ a: undefined })
      expect(typeof result).toBe('string')
    })
  })

  describe('collision resistance', () => {
    it('should produce different hashes for 1000 different inputs', () => {
      const hashes = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        hashes.add(hash(`input-${i}`))
      }
      expect(hashes.size).toBe(1000)
    })

    it('should produce different hashes for similar strings', () => {
      const hash1 = hash('abc')
      const hash2 = hash('abd')
      expect(hash1).not.toBe(hash2)
    })

    it('should produce different hashes for strings that differ only in case', () => {
      const hash1 = hash('Hello')
      const hash2 = hash('hello')
      expect(hash1).not.toBe(hash2)
    })

    it('should produce different hashes for empty string vs empty object', () => {
      const hash1 = hash('')
      const hash2 = hash({})
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('object key ordering', () => {
    it('should produce the same hash regardless of object key order', () => {
      const hash1 = hash({ a: 1, b: 2, c: 3 })
      const hash2 = hash({ c: 3, a: 1, b: 2 })
      expect(hash1).toBe(hash2)
    })

    it('should handle nested objects with different key orders', () => {
      const hash1 = hash({ outer: { a: 1, b: 2 } })
      const hash2 = hash({ outer: { b: 2, a: 1 } })
      expect(hash1).toBe(hash2)
    })
  })

  describe('hash output format', () => {
    it('should return a hexadecimal string', () => {
      const result = hash('test')
      expect(result).toMatch(/^[a-f0-9]+$/)
    })

    it('should return a consistent length hash', () => {
      const hash1 = hash('short')
      const hash2 = hash('a much longer string that has many more characters')
      expect(hash1.length).toBe(hash2.length)
    })
  })
})

// ============================================================================
// serialize() Tests
// ============================================================================

describe('serialize', () => {
  describe('primitive serialization', () => {
    it('should serialize strings', () => {
      const result = serialize('hello')
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })

    it('should serialize numbers', () => {
      const result = serialize(42)
      expect(result).toBeDefined()
    })

    it('should serialize floating point numbers', () => {
      const result = serialize(3.14159)
      expect(result).toBeDefined()
    })

    it('should serialize booleans', () => {
      const trueResult = serialize(true)
      const falseResult = serialize(false)
      expect(trueResult).toBeDefined()
      expect(falseResult).toBeDefined()
    })

    it('should serialize null', () => {
      const result = serialize(null)
      expect(result).toBeDefined()
    })
  })

  describe('object and array serialization', () => {
    it('should serialize empty objects', () => {
      const result = serialize({})
      expect(result).toBeDefined()
    })

    it('should serialize simple objects', () => {
      const result = serialize({ name: 'Alice', age: 30 })
      expect(result).toBeDefined()
    })

    it('should serialize empty arrays', () => {
      const result = serialize([])
      expect(result).toBeDefined()
    })

    it('should serialize arrays with primitives', () => {
      const result = serialize([1, 2, 3])
      expect(result).toBeDefined()
    })

    it('should serialize arrays with mixed types', () => {
      const result = serialize([1, 'two', true, null])
      expect(result).toBeDefined()
    })

    it('should serialize arrays of objects', () => {
      const result = serialize([{ a: 1 }, { b: 2 }])
      expect(result).toBeDefined()
    })
  })

  describe('nested structures', () => {
    it('should serialize deeply nested objects', () => {
      const nested = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      }
      const result = serialize(nested)
      expect(result).toBeDefined()
    })

    it('should serialize objects containing arrays', () => {
      const result = serialize({ items: [1, 2, 3] })
      expect(result).toBeDefined()
    })

    it('should serialize arrays containing objects', () => {
      const result = serialize([{ a: 1 }, { b: 2 }])
      expect(result).toBeDefined()
    })

    it('should serialize complex nested structures', () => {
      const complex = {
        users: [
          { name: 'Alice', tags: ['admin', 'user'] },
          { name: 'Bob', tags: ['user'] },
        ],
        metadata: {
          count: 2,
          active: true,
        },
      }
      const result = serialize(complex)
      expect(result).toBeDefined()
    })
  })

  describe('special values', () => {
    it('should handle undefined values', () => {
      const result = serialize(undefined)
      expect(result).toBeDefined()
    })

    it('should handle NaN', () => {
      const result = serialize(NaN)
      expect(result).toBeDefined()
    })

    it('should handle Infinity', () => {
      const result = serialize(Infinity)
      expect(result).toBeDefined()
    })

    it('should handle negative Infinity', () => {
      const result = serialize(-Infinity)
      expect(result).toBeDefined()
    })

    it('should handle BigInt values', () => {
      const result = serialize(BigInt(9007199254740991))
      expect(result).toBeDefined()
    })

    it('should handle negative BigInt values', () => {
      const result = serialize(BigInt(-9007199254740991))
      expect(result).toBeDefined()
    })

    it('should handle very large BigInt values', () => {
      const result = serialize(BigInt('12345678901234567890123456789'))
      expect(result).toBeDefined()
    })
  })

  describe('Date serialization', () => {
    it('should serialize Date objects', () => {
      const date = new Date('2024-01-15T12:00:00Z')
      const result = serialize(date)
      expect(result).toBeDefined()
    })

    it('should preserve Date precision', () => {
      const date = new Date('2024-01-15T12:30:45.123Z')
      const result = serialize(date)
      expect(result).toContain('2024')
    })

    it('should handle dates at epoch', () => {
      const date = new Date(0)
      const result = serialize(date)
      expect(result).toBeDefined()
    })
  })

  describe('ID serialization', () => {
    it('should serialize Convex-style IDs', () => {
      // Assuming IDs are special tagged strings
      const id = { $id: 'users', value: 'abc123xyz' }
      const result = serialize(id)
      expect(result).toBeDefined()
    })
  })

  describe('circular reference handling', () => {
    it('should throw an error for circular object references', () => {
      const obj: Record<string, unknown> = { a: 1 }
      obj.self = obj
      expect(() => serialize(obj)).toThrow()
    })

    it('should throw an error for circular array references', () => {
      const arr: unknown[] = [1, 2, 3]
      arr.push(arr)
      expect(() => serialize(arr)).toThrow()
    })

    it('should throw an error for deep circular references', () => {
      const obj: Record<string, unknown> = {
        level1: {
          level2: {},
        },
      }
      ;(obj.level1 as Record<string, unknown>).level2 = obj
      expect(() => serialize(obj)).toThrow()
    })

    it('should handle objects that appear multiple times (non-circular)', () => {
      const shared = { value: 42 }
      const obj = { a: shared, b: shared }
      const result = serialize(obj)
      expect(result).toBeDefined()
    })
  })

  describe('output format', () => {
    it('should return a string', () => {
      const result = serialize({ test: 'value' })
      expect(typeof result).toBe('string')
    })

    it('should be parseable by deserialize', () => {
      const original = { name: 'test', value: 42 }
      const serialized = serialize(original)
      const deserialized = deserialize(serialized)
      expect(deserialized).toEqual(original)
    })
  })
})

// ============================================================================
// deserialize() Tests
// ============================================================================

describe('deserialize', () => {
  describe('primitive deserialization', () => {
    it('should deserialize strings', () => {
      const serialized = serialize('hello')
      const result = deserialize(serialized)
      expect(result).toBe('hello')
    })

    it('should deserialize numbers', () => {
      const serialized = serialize(42)
      const result = deserialize(serialized)
      expect(result).toBe(42)
    })

    it('should deserialize floating point numbers with precision', () => {
      const original = 3.141592653589793
      const serialized = serialize(original)
      const result = deserialize(serialized)
      expect(result).toBe(original)
    })

    it('should deserialize booleans', () => {
      expect(deserialize(serialize(true))).toBe(true)
      expect(deserialize(serialize(false))).toBe(false)
    })

    it('should deserialize null', () => {
      const serialized = serialize(null)
      const result = deserialize(serialized)
      expect(result).toBeNull()
    })
  })

  describe('object and array reconstruction', () => {
    it('should deserialize empty objects', () => {
      const serialized = serialize({})
      const result = deserialize(serialized)
      expect(result).toEqual({})
    })

    it('should deserialize objects with properties', () => {
      const original = { name: 'Alice', age: 30 }
      const serialized = serialize(original)
      const result = deserialize(serialized)
      expect(result).toEqual(original)
    })

    it('should deserialize empty arrays', () => {
      const serialized = serialize([])
      const result = deserialize(serialized)
      expect(result).toEqual([])
    })

    it('should deserialize arrays with values', () => {
      const original = [1, 2, 3]
      const serialized = serialize(original)
      const result = deserialize(serialized)
      expect(result).toEqual(original)
    })

    it('should deserialize nested structures', () => {
      const original = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      }
      const serialized = serialize(original)
      const result = deserialize(serialized)
      expect(result).toEqual(original)
    })
  })

  describe('type preservation', () => {
    it('should preserve number type', () => {
      const serialized = serialize(42)
      const result = deserialize(serialized)
      expect(typeof result).toBe('number')
    })

    it('should preserve string type', () => {
      const serialized = serialize('hello')
      const result = deserialize(serialized)
      expect(typeof result).toBe('string')
    })

    it('should preserve boolean type', () => {
      const serialized = serialize(true)
      const result = deserialize(serialized)
      expect(typeof result).toBe('boolean')
    })

    it('should preserve array type', () => {
      const serialized = serialize([1, 2, 3])
      const result = deserialize(serialized)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should preserve object type (not array)', () => {
      const serialized = serialize({ a: 1 })
      const result = deserialize(serialized)
      expect(typeof result).toBe('object')
      expect(Array.isArray(result)).toBe(false)
    })

    it('should preserve BigInt type', () => {
      const original = BigInt('9007199254740991')
      const serialized = serialize(original)
      const result = deserialize(serialized)
      expect(typeof result).toBe('bigint')
      expect(result).toBe(original)
    })

    it('should preserve Date type', () => {
      const original = new Date('2024-01-15T12:00:00Z')
      const serialized = serialize(original)
      const result = deserialize(serialized)
      expect(result instanceof Date).toBe(true)
      expect((result as Date).getTime()).toBe(original.getTime())
    })
  })

  describe('special values deserialization', () => {
    it('should deserialize undefined', () => {
      const serialized = serialize(undefined)
      const result = deserialize(serialized)
      expect(result).toBeUndefined()
    })

    it('should deserialize NaN', () => {
      const serialized = serialize(NaN)
      const result = deserialize(serialized)
      expect(Number.isNaN(result)).toBe(true)
    })

    it('should deserialize Infinity', () => {
      const serialized = serialize(Infinity)
      const result = deserialize(serialized)
      expect(result).toBe(Infinity)
    })

    it('should deserialize negative Infinity', () => {
      const serialized = serialize(-Infinity)
      const result = deserialize(serialized)
      expect(result).toBe(-Infinity)
    })
  })

  describe('error handling', () => {
    it('should throw on invalid serialized data', () => {
      expect(() => deserialize('invalid json {')).toThrow()
    })

    it('should throw on empty string input', () => {
      expect(() => deserialize('')).toThrow()
    })

    it('should throw on null input', () => {
      expect(() => deserialize(null as unknown as string)).toThrow()
    })

    it('should throw on undefined input', () => {
      expect(() => deserialize(undefined as unknown as string)).toThrow()
    })

    it('should throw on truncated data', () => {
      const serialized = serialize({ a: 1, b: 2 })
      const truncated = serialized.slice(0, Math.floor(serialized.length / 2))
      expect(() => deserialize(truncated)).toThrow()
    })

    it('should throw descriptive error for malformed data', () => {
      expect(() => deserialize('not-valid-data')).toThrow(/invalid|malformed|parse/i)
    })
  })

  describe('roundtrip integrity', () => {
    it('should roundtrip complex objects', () => {
      const original = {
        users: [
          { name: 'Alice', age: 30, active: true },
          { name: 'Bob', age: 25, active: false },
        ],
        metadata: {
          count: 2,
          timestamp: new Date('2024-01-15T12:00:00Z'),
        },
        tags: ['admin', 'user'],
      }
      const serialized = serialize(original)
      const result = deserialize(serialized)
      expect((result as typeof original).users).toEqual(original.users)
      expect((result as typeof original).tags).toEqual(original.tags)
      expect((result as typeof original).metadata.count).toBe(2)
    })

    it('should handle multiple roundtrips', () => {
      const original = { value: 'test' }
      let current: unknown = original
      for (let i = 0; i < 10; i++) {
        current = deserialize(serialize(current))
      }
      expect(current).toEqual(original)
    })
  })
})
