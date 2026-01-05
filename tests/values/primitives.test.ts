/**
 * TDD RED Phase Tests for Primitive Validators
 *
 * These tests define the expected behavior for all primitive validators.
 * They are designed to FAIL until the implementation is complete.
 *
 * @see convex-i33 - Primitive Validators - Tests (RED)
 */

import { describe, it, expect } from 'vitest'
import { v, type Infer } from '../../src/values/index'

// ============================================================================
// v.string() - String Validator Tests
// ============================================================================

describe('v.string()', () => {
  const validator = v.string()

  describe('valid string acceptance', () => {
    it('should accept a simple string', () => {
      expect(validator.parse('hello')).toBe('hello')
    })

    it('should accept an empty string', () => {
      expect(validator.parse('')).toBe('')
    })

    it('should accept a string with spaces', () => {
      expect(validator.parse('hello world')).toBe('hello world')
    })

    it('should accept unicode strings', () => {
      expect(validator.parse('Hello, \u4e16\u754c')).toBe('Hello, \u4e16\u754c')
    })

    it('should accept emoji strings', () => {
      expect(validator.parse('\ud83d\ude00\ud83c\udf89\ud83c\udf8a')).toBe('\ud83d\ude00\ud83c\udf89\ud83c\udf8a')
    })

    it('should accept strings with special characters', () => {
      expect(validator.parse('!@#$%^&*()_+-=[]{}|;:\'",./<>?')).toBe('!@#$%^&*()_+-=[]{}|;:\'",./<>?')
    })

    it('should accept multiline strings', () => {
      const multiline = 'line1\nline2\nline3'
      expect(validator.parse(multiline)).toBe(multiline)
    })

    it('should accept strings with null characters', () => {
      expect(validator.parse('hello\x00world')).toBe('hello\x00world')
    })

    it('should accept very long strings', () => {
      const longString = 'a'.repeat(100000)
      expect(validator.parse(longString)).toBe(longString)
    })
  })

  describe('non-string rejection', () => {
    it('should reject numbers', () => {
      expect(() => validator.parse(42)).toThrow()
    })

    it('should reject booleans', () => {
      expect(() => validator.parse(true)).toThrow()
    })

    it('should reject null', () => {
      expect(() => validator.parse(null)).toThrow()
    })

    it('should reject undefined', () => {
      expect(() => validator.parse(undefined)).toThrow()
    })

    it('should reject objects', () => {
      expect(() => validator.parse({})).toThrow()
    })

    it('should reject arrays', () => {
      expect(() => validator.parse([])).toThrow()
    })

    it('should reject String objects (boxed primitives)', () => {
      // This is a critical distinction - boxed primitives should be rejected
      expect(() => validator.parse(new String('hello'))).toThrow()
    })

    it('should reject symbols', () => {
      expect(() => validator.parse(Symbol('test'))).toThrow()
    })

    it('should reject functions', () => {
      expect(() => validator.parse(() => {})).toThrow()
    })

    it('should reject BigInt', () => {
      expect(() => validator.parse(BigInt(42))).toThrow()
    })
  })

  describe('isValid method', () => {
    it('should return true for valid strings', () => {
      expect(validator.isValid('hello')).toBe(true)
    })

    it('should return false for non-strings', () => {
      expect(validator.isValid(42)).toBe(false)
    })
  })

  describe('describe method', () => {
    it('should return "string"', () => {
      expect(validator.describe()).toBe('string')
    })
  })

  describe('optional', () => {
    it('should allow undefined when optional', () => {
      const optionalValidator = validator.optional()
      expect(optionalValidator.parse(undefined)).toBeUndefined()
    })

    it('should still accept strings when optional', () => {
      const optionalValidator = validator.optional()
      expect(optionalValidator.parse('hello')).toBe('hello')
    })
  })

  describe('type inference', () => {
    it('should infer string type', () => {
      type StringType = Infer<typeof validator>
      // This is a compile-time check - if it compiles, the type is correct
      const _test: StringType = 'hello'
      expect(typeof _test).toBe('string')
    })
  })
})

// ============================================================================
// v.number() - Number Validator Tests
// ============================================================================

describe('v.number()', () => {
  const validator = v.number()

  describe('valid number acceptance', () => {
    it('should accept positive integers', () => {
      expect(validator.parse(42)).toBe(42)
    })

    it('should accept negative integers', () => {
      expect(validator.parse(-42)).toBe(-42)
    })

    it('should accept zero', () => {
      expect(validator.parse(0)).toBe(0)
    })

    it('should accept negative zero', () => {
      expect(validator.parse(-0)).toBe(-0)
    })

    it('should accept floating point numbers', () => {
      expect(validator.parse(3.14159)).toBe(3.14159)
    })

    it('should accept very small numbers', () => {
      expect(validator.parse(1e-308)).toBe(1e-308)
    })

    it('should accept very large numbers', () => {
      expect(validator.parse(1e308)).toBe(1e308)
    })

    it('should accept Number.MAX_VALUE', () => {
      expect(validator.parse(Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
    })

    it('should accept Number.MIN_VALUE', () => {
      expect(validator.parse(Number.MIN_VALUE)).toBe(Number.MIN_VALUE)
    })

    it('should accept Number.MAX_SAFE_INTEGER', () => {
      expect(validator.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('should accept Number.MIN_SAFE_INTEGER', () => {
      expect(validator.parse(Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER)
    })
  })

  describe('special number handling', () => {
    it('should reject NaN', () => {
      expect(() => validator.parse(NaN)).toThrow()
    })

    it('should reject Infinity', () => {
      // This test is expected to FAIL - current implementation accepts Infinity
      expect(() => validator.parse(Infinity)).toThrow()
    })

    it('should reject -Infinity', () => {
      // This test is expected to FAIL - current implementation accepts -Infinity
      expect(() => validator.parse(-Infinity)).toThrow()
    })

    it('should have specific error message for NaN', () => {
      // This test is expected to FAIL - current error message says "got number"
      expect(() => validator.parse(NaN)).toThrow(/NaN/)
    })
  })

  describe('precision handling', () => {
    it('should preserve floating point precision', () => {
      const value = 0.1 + 0.2
      expect(validator.parse(value)).toBe(value)
    })

    it('should handle IEEE 754 edge cases', () => {
      expect(validator.parse(Number.EPSILON)).toBe(Number.EPSILON)
    })
  })

  describe('non-number rejection', () => {
    it('should reject strings', () => {
      expect(() => validator.parse('42')).toThrow()
    })

    it('should reject numeric strings', () => {
      expect(() => validator.parse('3.14')).toThrow()
    })

    it('should reject booleans', () => {
      expect(() => validator.parse(true)).toThrow()
    })

    it('should reject null', () => {
      expect(() => validator.parse(null)).toThrow()
    })

    it('should reject undefined', () => {
      expect(() => validator.parse(undefined)).toThrow()
    })

    it('should reject objects', () => {
      expect(() => validator.parse({})).toThrow()
    })

    it('should reject Number objects (boxed primitives)', () => {
      // This test is expected to FAIL - boxed primitives might pass typeof check
      expect(() => validator.parse(new Number(42))).toThrow()
    })

    it('should reject BigInt', () => {
      expect(() => validator.parse(BigInt(42))).toThrow()
    })
  })

  describe('describe method', () => {
    it('should return "number"', () => {
      expect(validator.describe()).toBe('number')
    })
  })
})

// ============================================================================
// v.boolean() - Boolean Validator Tests
// ============================================================================

describe('v.boolean()', () => {
  const validator = v.boolean()

  describe('valid boolean acceptance', () => {
    it('should accept true', () => {
      expect(validator.parse(true)).toBe(true)
    })

    it('should accept false', () => {
      expect(validator.parse(false)).toBe(false)
    })
  })

  describe('truthy/falsy rejection', () => {
    it('should reject 1 (truthy)', () => {
      expect(() => validator.parse(1)).toThrow()
    })

    it('should reject 0 (falsy)', () => {
      expect(() => validator.parse(0)).toThrow()
    })

    it('should reject empty string (falsy)', () => {
      expect(() => validator.parse('')).toThrow()
    })

    it('should reject "true" string', () => {
      expect(() => validator.parse('true')).toThrow()
    })

    it('should reject "false" string', () => {
      expect(() => validator.parse('false')).toThrow()
    })

    it('should reject null (falsy)', () => {
      expect(() => validator.parse(null)).toThrow()
    })

    it('should reject undefined (falsy)', () => {
      expect(() => validator.parse(undefined)).toThrow()
    })

    it('should reject objects (truthy)', () => {
      expect(() => validator.parse({})).toThrow()
    })

    it('should reject arrays (truthy)', () => {
      expect(() => validator.parse([])).toThrow()
    })

    it('should reject Boolean objects (boxed primitives)', () => {
      // This test is expected to FAIL - boxed primitives might pass typeof check
      expect(() => validator.parse(new Boolean(true))).toThrow()
    })
  })

  describe('describe method', () => {
    it('should return "boolean"', () => {
      expect(validator.describe()).toBe('boolean')
    })
  })

  describe('type inference', () => {
    it('should infer boolean type', () => {
      type BooleanType = Infer<typeof validator>
      const _test: BooleanType = true
      expect(typeof _test).toBe('boolean')
    })
  })
})

// ============================================================================
// v.null() - Null Validator Tests
// ============================================================================

describe('v.null()', () => {
  const validator = v.null()

  describe('null acceptance', () => {
    it('should accept null', () => {
      expect(validator.parse(null)).toBe(null)
    })
  })

  describe('non-null rejection', () => {
    it('should reject undefined', () => {
      expect(() => validator.parse(undefined)).toThrow()
    })

    it('should have specific error message for undefined', () => {
      // This test is expected to FAIL - current implementation says "got undefined" but should be clearer
      expect(() => validator.parse(undefined)).toThrow(/undefined is not null/)
    })

    it('should reject empty string', () => {
      expect(() => validator.parse('')).toThrow()
    })

    it('should reject zero', () => {
      expect(() => validator.parse(0)).toThrow()
    })

    it('should reject false', () => {
      expect(() => validator.parse(false)).toThrow()
    })

    it('should reject NaN', () => {
      expect(() => validator.parse(NaN)).toThrow()
    })

    it('should reject empty object', () => {
      expect(() => validator.parse({})).toThrow()
    })

    it('should reject empty array', () => {
      expect(() => validator.parse([])).toThrow()
    })

    it('should reject strings', () => {
      expect(() => validator.parse('null')).toThrow()
    })
  })

  describe('describe method', () => {
    it('should return "null"', () => {
      expect(validator.describe()).toBe('null')
    })
  })

  describe('type inference', () => {
    it('should infer null type', () => {
      type NullType = Infer<typeof validator>
      const _test: NullType = null
      expect(_test).toBe(null)
    })
  })
})

// ============================================================================
// v.int64() - 64-bit Integer Validator Tests
// ============================================================================

describe('v.int64()', () => {
  const validator = v.int64()

  describe('BigInt acceptance', () => {
    it('should accept BigInt values', () => {
      expect(validator.parse(BigInt(42))).toBe(BigInt(42))
    })

    it('should accept negative BigInt values', () => {
      expect(validator.parse(BigInt(-42))).toBe(BigInt(-42))
    })

    it('should accept BigInt zero', () => {
      expect(validator.parse(BigInt(0))).toBe(BigInt(0))
    })

    it('should accept very large BigInt values', () => {
      const large = BigInt('9223372036854775807') // Max int64
      expect(validator.parse(large)).toBe(large)
    })

    it('should accept very small BigInt values', () => {
      const small = BigInt('-9223372036854775808') // Min int64
      expect(validator.parse(small)).toBe(small)
    })
  })

  describe('integer boundaries', () => {
    it('should accept max int64 value', () => {
      const maxInt64 = BigInt('9223372036854775807')
      expect(validator.parse(maxInt64)).toBe(maxInt64)
    })

    it('should accept min int64 value', () => {
      const minInt64 = BigInt('-9223372036854775808')
      expect(validator.parse(minInt64)).toBe(minInt64)
    })

    it('should reject values greater than max int64', () => {
      // This test is expected to FAIL - current implementation doesn't check bounds
      const overflow = BigInt('9223372036854775808')
      expect(() => validator.parse(overflow)).toThrow()
    })

    it('should reject values less than min int64', () => {
      // This test is expected to FAIL - current implementation doesn't check bounds
      const underflow = BigInt('-9223372036854775809')
      expect(() => validator.parse(underflow)).toThrow()
    })
  })

  describe('number to BigInt conversion', () => {
    it('should convert integer numbers to BigInt', () => {
      expect(validator.parse(42)).toBe(BigInt(42))
    })

    it('should convert negative integer numbers to BigInt', () => {
      expect(validator.parse(-42)).toBe(BigInt(-42))
    })

    it('should convert zero to BigInt', () => {
      expect(validator.parse(0)).toBe(BigInt(0))
    })
  })

  describe('float rejection', () => {
    it('should reject floating point numbers', () => {
      expect(() => validator.parse(3.14)).toThrow()
    })

    it('should reject numbers with fractional part', () => {
      expect(() => validator.parse(42.5)).toThrow()
    })

    it('should reject Infinity', () => {
      expect(() => validator.parse(Infinity)).toThrow()
    })

    it('should reject -Infinity', () => {
      expect(() => validator.parse(-Infinity)).toThrow()
    })

    it('should reject NaN', () => {
      expect(() => validator.parse(NaN)).toThrow()
    })
  })

  describe('string to BigInt conversion', () => {
    it('should convert valid integer strings to BigInt', () => {
      expect(validator.parse('42')).toBe(BigInt(42))
    })

    it('should convert negative integer strings to BigInt', () => {
      expect(validator.parse('-42')).toBe(BigInt(-42))
    })

    it('should reject float strings', () => {
      // This test is expected to FAIL - current implementation might accept this
      expect(() => validator.parse('3.14')).toThrow()
    })

    it('should reject non-numeric strings', () => {
      expect(() => validator.parse('hello')).toThrow()
    })

    it('should reject empty strings', () => {
      // This test is expected to FAIL - current implementation might throw different error
      expect(() => validator.parse('')).toThrow(/Cannot convert/)
    })
  })

  describe('non-integer rejection', () => {
    it('should reject booleans', () => {
      expect(() => validator.parse(true)).toThrow()
    })

    it('should reject null', () => {
      expect(() => validator.parse(null)).toThrow()
    })

    it('should reject undefined', () => {
      expect(() => validator.parse(undefined)).toThrow()
    })

    it('should reject objects', () => {
      expect(() => validator.parse({})).toThrow()
    })

    it('should reject arrays', () => {
      expect(() => validator.parse([])).toThrow()
    })
  })

  describe('describe method', () => {
    it('should return "int64"', () => {
      expect(validator.describe()).toBe('int64')
    })
  })

  describe('type inference', () => {
    it('should infer bigint type', () => {
      type Int64Type = Infer<typeof validator>
      const _test: Int64Type = BigInt(42)
      expect(typeof _test).toBe('bigint')
    })
  })
})

// ============================================================================
// v.float64() - 64-bit Float Validator Tests
// ============================================================================

describe('v.float64()', () => {
  const validator = v.float64()

  describe('float acceptance', () => {
    it('should accept positive floats', () => {
      expect(validator.parse(3.14159)).toBe(3.14159)
    })

    it('should accept negative floats', () => {
      expect(validator.parse(-3.14159)).toBe(-3.14159)
    })

    it('should accept integers as floats', () => {
      expect(validator.parse(42)).toBe(42)
    })

    it('should accept zero', () => {
      expect(validator.parse(0)).toBe(0)
    })

    it('should accept negative zero', () => {
      expect(validator.parse(-0)).toBe(-0)
    })

    it('should accept very small floats', () => {
      expect(validator.parse(Number.MIN_VALUE)).toBe(Number.MIN_VALUE)
    })

    it('should accept very large floats', () => {
      expect(validator.parse(Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
    })

    it('should accept scientific notation', () => {
      expect(validator.parse(1.23e45)).toBe(1.23e45)
    })
  })

  describe('special value handling', () => {
    it('should accept Infinity', () => {
      // Current implementation accepts Infinity - this might be correct for float64
      expect(validator.parse(Infinity)).toBe(Infinity)
    })

    it('should accept -Infinity', () => {
      // Current implementation accepts -Infinity - this might be correct for float64
      expect(validator.parse(-Infinity)).toBe(-Infinity)
    })

    it('should reject NaN', () => {
      // This test is expected to FAIL - current implementation accepts NaN
      expect(() => validator.parse(NaN)).toThrow()
    })

    it('should have specific error message for NaN', () => {
      // This test is expected to FAIL
      expect(() => validator.parse(NaN)).toThrow(/NaN is not a valid float64/)
    })
  })

  describe('precision handling', () => {
    it('should preserve IEEE 754 double precision', () => {
      const value = 1.7976931348623157e+308
      expect(validator.parse(value)).toBe(value)
    })

    it('should preserve epsilon precision', () => {
      expect(validator.parse(Number.EPSILON)).toBe(Number.EPSILON)
    })

    it('should handle denormalized numbers', () => {
      const denorm = 5e-324
      expect(validator.parse(denorm)).toBe(denorm)
    })
  })

  describe('non-number rejection', () => {
    it('should reject strings', () => {
      expect(() => validator.parse('3.14')).toThrow()
    })

    it('should reject booleans', () => {
      expect(() => validator.parse(true)).toThrow()
    })

    it('should reject null', () => {
      expect(() => validator.parse(null)).toThrow()
    })

    it('should reject undefined', () => {
      expect(() => validator.parse(undefined)).toThrow()
    })

    it('should reject BigInt', () => {
      expect(() => validator.parse(BigInt(42))).toThrow()
    })

    it('should reject objects', () => {
      expect(() => validator.parse({})).toThrow()
    })

    it('should reject Number objects (boxed primitives)', () => {
      // This test is expected to FAIL
      expect(() => validator.parse(new Number(3.14))).toThrow()
    })
  })

  describe('describe method', () => {
    it('should return "float64"', () => {
      expect(validator.describe()).toBe('float64')
    })
  })

  describe('type inference', () => {
    it('should infer number type', () => {
      type Float64Type = Infer<typeof validator>
      const _test: Float64Type = 3.14
      expect(typeof _test).toBe('number')
    })
  })
})

// ============================================================================
// v.bytes() - Binary Data Validator Tests
// ============================================================================

describe('v.bytes()', () => {
  const validator = v.bytes()

  describe('ArrayBuffer acceptance', () => {
    it('should accept ArrayBuffer', () => {
      const buffer = new ArrayBuffer(8)
      const result = validator.parse(buffer)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(8)
    })

    it('should accept empty ArrayBuffer', () => {
      const buffer = new ArrayBuffer(0)
      const result = validator.parse(buffer)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(0)
    })

    it('should accept large ArrayBuffer', () => {
      const buffer = new ArrayBuffer(1024 * 1024) // 1MB
      const result = validator.parse(buffer)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(1024 * 1024)
    })
  })

  describe('TypedArray acceptance', () => {
    it('should accept Uint8Array', () => {
      const array = new Uint8Array([1, 2, 3, 4])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(4)
    })

    it('should accept Uint16Array', () => {
      const array = new Uint16Array([1, 2, 3, 4])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(8) // 4 elements * 2 bytes
    })

    it('should accept Uint32Array', () => {
      const array = new Uint32Array([1, 2, 3, 4])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(16) // 4 elements * 4 bytes
    })

    it('should accept Int8Array', () => {
      const array = new Int8Array([-1, 0, 1, 2])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(4)
    })

    it('should accept Int16Array', () => {
      const array = new Int16Array([-1, 0, 1, 2])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
    })

    it('should accept Int32Array', () => {
      const array = new Int32Array([-1, 0, 1, 2])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
    })

    it('should accept Float32Array', () => {
      const array = new Float32Array([1.5, 2.5, 3.5])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
    })

    it('should accept Float64Array', () => {
      const array = new Float64Array([1.5, 2.5, 3.5])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
    })

    it('should accept BigInt64Array', () => {
      const array = new BigInt64Array([BigInt(1), BigInt(2)])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
    })

    it('should accept BigUint64Array', () => {
      const array = new BigUint64Array([BigInt(1), BigInt(2)])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
    })

    it('should accept empty Uint8Array', () => {
      const array = new Uint8Array([])
      const result = validator.parse(array)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(0)
    })
  })

  describe('DataView acceptance', () => {
    it('should accept DataView', () => {
      const buffer = new ArrayBuffer(8)
      const view = new DataView(buffer)
      const result = validator.parse(view)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(8)
    })

    it('should accept DataView with offset', () => {
      const buffer = new ArrayBuffer(16)
      const view = new DataView(buffer, 4, 8)
      const result = validator.parse(view)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(8)
    })
  })

  describe('TypedArray with offset handling', () => {
    it('should handle Uint8Array with offset correctly', () => {
      const buffer = new ArrayBuffer(16)
      const fullArray = new Uint8Array(buffer)
      fullArray.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])

      // Create a view of only part of the buffer
      const partialArray = new Uint8Array(buffer, 4, 8) // offset 4, length 8

      const result = validator.parse(partialArray)
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(8)

      // Verify the correct bytes were extracted
      const resultArray = new Uint8Array(result)
      expect(resultArray[0]).toBe(5)
      expect(resultArray[7]).toBe(12)
    })
  })

  describe('data preservation', () => {
    it('should preserve data when parsing ArrayBuffer', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5])
      const result = validator.parse(original.buffer)
      const resultArray = new Uint8Array(result)
      expect(Array.from(resultArray)).toEqual([1, 2, 3, 4, 5])
    })

    it('should preserve data when parsing Uint8Array', () => {
      const original = new Uint8Array([255, 128, 64, 32, 16])
      const result = validator.parse(original)
      const resultArray = new Uint8Array(result)
      expect(Array.from(resultArray)).toEqual([255, 128, 64, 32, 16])
    })
  })

  describe('non-bytes rejection', () => {
    it('should reject regular arrays', () => {
      expect(() => validator.parse([1, 2, 3])).toThrow()
    })

    it('should reject strings', () => {
      expect(() => validator.parse('binary data')).toThrow()
    })

    it('should reject numbers', () => {
      expect(() => validator.parse(42)).toThrow()
    })

    it('should reject null', () => {
      expect(() => validator.parse(null)).toThrow()
    })

    it('should reject undefined', () => {
      expect(() => validator.parse(undefined)).toThrow()
    })

    it('should reject plain objects', () => {
      expect(() => validator.parse({})).toThrow()
    })

    it('should reject Blob', () => {
      // This test is expected to FAIL - Blob handling might not be implemented
      // In browser environments, Blob is common for binary data
      if (typeof Blob !== 'undefined') {
        const blob = new Blob(['test'])
        expect(() => validator.parse(blob)).toThrow()
      } else {
        // Skip in Node.js environments without Blob
        expect(true).toBe(true)
      }
    })

    it('should reject Buffer (Node.js)', () => {
      // This test checks Node.js Buffer handling
      // Buffer is a Uint8Array subclass, so it might pass
      // But the behavior should be explicit
      if (typeof Buffer !== 'undefined') {
        const buffer = Buffer.from([1, 2, 3])
        // Buffer extends Uint8Array, so this should work
        const result = validator.parse(buffer)
        expect(result).toBeInstanceOf(ArrayBuffer)
      } else {
        expect(true).toBe(true)
      }
    })
  })

  describe('describe method', () => {
    it('should return "bytes"', () => {
      expect(validator.describe()).toBe('bytes')
    })
  })

  describe('type inference', () => {
    it('should infer ArrayBuffer type', () => {
      type BytesType = Infer<typeof validator>
      const _test: BytesType = new ArrayBuffer(8)
      expect(_test).toBeInstanceOf(ArrayBuffer)
    })
  })
})

// ============================================================================
// Shared Validator Behavior Tests
// ============================================================================

describe('Shared Validator Behavior', () => {
  describe('optional() method', () => {
    it('should work for all primitive validators', () => {
      const validators = [
        v.string().optional(),
        v.number().optional(),
        v.boolean().optional(),
        v.null().optional(),
        v.int64().optional(),
        v.float64().optional(),
        v.bytes().optional(),
      ]

      for (const validator of validators) {
        expect(validator.isOptional).toBe(true)
        expect(validator.parse(undefined)).toBeUndefined()
      }
    })
  })

  describe('isValid() method consistency', () => {
    it('should return true when parse succeeds', () => {
      expect(v.string().isValid('hello')).toBe(true)
      expect(v.number().isValid(42)).toBe(true)
      expect(v.boolean().isValid(true)).toBe(true)
      expect(v.null().isValid(null)).toBe(true)
      expect(v.int64().isValid(BigInt(42))).toBe(true)
      expect(v.float64().isValid(3.14)).toBe(true)
      expect(v.bytes().isValid(new ArrayBuffer(8))).toBe(true)
    })

    it('should return false when parse would throw', () => {
      expect(v.string().isValid(42)).toBe(false)
      expect(v.number().isValid('42')).toBe(false)
      expect(v.boolean().isValid(1)).toBe(false)
      expect(v.null().isValid(undefined)).toBe(false)
      expect(v.int64().isValid(3.14)).toBe(false)
      expect(v.float64().isValid('3.14')).toBe(false)
      expect(v.bytes().isValid([1, 2, 3])).toBe(false)
    })
  })

  describe('error message quality', () => {
    it('should include expected type in error messages', () => {
      expect(() => v.string().parse(42)).toThrow(/string/)
      expect(() => v.number().parse('42')).toThrow(/number/)
      expect(() => v.boolean().parse('true')).toThrow(/boolean/)
      expect(() => v.null().parse(undefined)).toThrow(/null/)
      expect(() => v.int64().parse({})).toThrow(/int64|bigint/)
      expect(() => v.float64().parse('3.14')).toThrow(/float64|number/)
      expect(() => v.bytes().parse('data')).toThrow(/bytes|ArrayBuffer/)
    })

    it('should include actual type in error messages', () => {
      expect(() => v.string().parse(42)).toThrow(/number/)
      expect(() => v.number().parse('42')).toThrow(/string/)
      expect(() => v.boolean().parse('true')).toThrow(/string/)
    })
  })
})
