/**
 * TDD Tests for validateArgs Duck-Typing Type Safety
 *
 * RED PHASE: These tests define the expected behavior for validateArgs
 * to properly verify that only genuine Validator instances are accepted,
 * not arbitrary objects with a `parse` method.
 *
 * SECURITY CONCERN:
 * The current implementation uses duck-typing that accepts ANY object
 * with a parse method, which could allow:
 * - Prototype pollution attacks
 * - Runtime type confusion
 * - Validator bypass with malicious objects
 */

import { describe, it, expect } from 'vitest'
import { validateArgs } from '../../../src/server/functions/shared'
import { v, type Validator } from '../../../src/values'

describe('validateArgs type safety', () => {
  // ============================================================================
  // Fake Validator Rejection Tests
  // ============================================================================

  describe('should reject objects that look like validators but are not', () => {
    it('should reject a plain object with only a parse method', () => {
      const fakeValidator = {
        parse: (x: unknown) => x, // Looks like a validator
        notAValidator: true
      }

      // Current implementation incorrectly accepts this because it only checks
      // for 'parse' in argsValidator && typeof argsValidator.parse === 'function'
      expect(() => validateArgs(fakeValidator as unknown as Validator, { name: 'test' }))
        .toThrow('Invalid validator')
    })

    it('should reject an object with parse but missing isOptional property', () => {
      const incompleteValidator = {
        parse: (x: unknown) => x,
        // Missing: isOptional, isValid, optional, describe, _type
      }

      expect(() => validateArgs(incompleteValidator as unknown as Validator, { name: 'test' }))
        .toThrow('Invalid validator')
    })

    it('should reject an object that only mimics the parse signature', () => {
      const mimic = {
        parse: function(value: unknown) {
          // Custom "validation" that doesn't follow Validator contract
          return { __injected: true, ...value as object }
        }
      }

      expect(() => validateArgs(mimic as unknown as Validator, { name: 'test' }))
        .toThrow('Invalid validator')
    })

    it('should reject a class instance that has parse but is not a Validator', () => {
      class FakeValidatorClass {
        parse(value: unknown) {
          return value
        }
      }

      const fakeInstance = new FakeValidatorClass()

      expect(() => validateArgs(fakeInstance as unknown as Validator, { name: 'test' }))
        .toThrow('Invalid validator')
    })

    it('should reject objects with parse method from external libraries', () => {
      // Simulating something like a Zod-like object that happens to have .parse()
      const zodLikeObject = {
        parse: (x: unknown) => x,
        safeParse: (x: unknown) => ({ success: true, data: x }),
        _def: { typeName: 'ZodObject' }
      }

      expect(() => validateArgs(zodLikeObject as unknown as Validator, { name: 'test' }))
        .toThrow('Invalid validator')
    })
  })

  // ============================================================================
  // Real Validator Acceptance Tests
  // ============================================================================

  describe('should accept real Validator instances', () => {
    it('should accept v.object() validator', () => {
      const realValidator = v.object({ name: v.string() })

      expect(() => validateArgs(realValidator, { name: 'test' }))
        .not.toThrow()
    })

    it('should accept v.object() with multiple fields', () => {
      const realValidator = v.object({
        name: v.string(),
        age: v.number(),
        active: v.boolean()
      })

      expect(() => validateArgs(realValidator, { name: 'test', age: 30, active: true }))
        .not.toThrow()
    })

    it('should accept v.object() with optional fields', () => {
      const realValidator = v.object({
        name: v.string(),
        nickname: v.optional(v.string())
      })

      expect(() => validateArgs(realValidator, { name: 'test' }))
        .not.toThrow()
    })

    it('should accept v.object() with nested objects', () => {
      const realValidator = v.object({
        user: v.object({
          name: v.string(),
          email: v.string()
        })
      })

      expect(() => validateArgs(realValidator, { user: { name: 'test', email: 'test@test.com' } }))
        .not.toThrow()
    })

    it('should accept v.object() with arrays', () => {
      const realValidator = v.object({
        tags: v.array(v.string())
      })

      expect(() => validateArgs(realValidator, { tags: ['a', 'b', 'c'] }))
        .not.toThrow()
    })

    it('should accept v.object() with union types', () => {
      const realValidator = v.object({
        status: v.union(v.literal('active'), v.literal('inactive'))
      })

      expect(() => validateArgs(realValidator, { status: 'active' }))
        .not.toThrow()
    })

    it('should accept record of validators style', () => {
      const validatorRecord = {
        name: v.string(),
        age: v.number()
      }

      expect(() => validateArgs(validatorRecord, { name: 'test', age: 30 }))
        .not.toThrow()
    })
  })

  // ============================================================================
  // Prototype Pollution Prevention Tests
  // ============================================================================

  describe('should reject prototype pollution attempts', () => {
    it('should reject object created with Object.create that inherits parse', () => {
      const maliciousProto = { parse: (x: unknown) => x }
      const malicious = Object.create(maliciousProto)

      // The object itself doesn't own the parse method - it's inherited
      expect(() => validateArgs(malicious as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })

    it('should reject object with parse from prototype chain', () => {
      // Create a multi-level prototype chain
      const grandParent = { parse: (x: unknown) => x }
      const parent = Object.create(grandParent)
      const child = Object.create(parent)

      expect(() => validateArgs(child as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })

    it('should reject when parse is defined via __proto__', () => {
      const obj: Record<string, unknown> = {}
      // This is a potential prototype pollution vector
      obj['__proto__'] = { parse: (x: unknown) => x }

      expect(() => validateArgs(obj as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })

    it('should reject objects where hasOwnProperty would fail', () => {
      // Create object without prototype
      const nullProto = Object.create(null) as { parse?: (x: unknown) => unknown }
      nullProto.parse = (x: unknown) => x
      // This object has parse as own property but lacks Validator interface

      expect(() => validateArgs(nullProto as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })

    it('should reject Proxy objects that mimic validators', () => {
      const proxy = new Proxy({}, {
        get(target, prop) {
          if (prop === 'parse') {
            return (x: unknown) => x
          }
          return undefined
        },
        has(target, prop) {
          return prop === 'parse'
        }
      })

      expect(() => validateArgs(proxy as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })
  })

  // ============================================================================
  // Edge Cases and Additional Security Tests
  // ============================================================================

  describe('edge cases and additional security', () => {
    it('should reject functions that have been augmented with parse method', () => {
      const fn = function() { return 'hello' }
      ;(fn as unknown as { parse: (x: unknown) => unknown }).parse = (x: unknown) => x

      expect(() => validateArgs(fn as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })

    it('should reject array with parse property', () => {
      const arr: unknown[] & { parse?: (x: unknown) => unknown } = []
      arr.parse = (x: unknown) => x

      expect(() => validateArgs(arr as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })

    it('should reject Date-like objects with parse', () => {
      const dateWithParse = new Date() as Date & { parse: (x: unknown) => unknown }
      dateWithParse.parse = (x: unknown) => x

      expect(() => validateArgs(dateWithParse as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })

    it('should reject Map-like objects with parse', () => {
      const mapWithParse = new Map() as Map<string, unknown> & { parse: (x: unknown) => unknown }
      mapWithParse.parse = (x: unknown) => x

      expect(() => validateArgs(mapWithParse as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })

    it('should properly validate even when attacker tries Symbol keys', () => {
      const parseSymbol = Symbol.for('parse')
      const sneaky: Record<string | symbol, unknown> = {
        [parseSymbol]: (x: unknown) => x,
        // Also add actual parse to try to confuse the implementation
        parse: (x: unknown) => x
      }

      expect(() => validateArgs(sneaky as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })

    it('should reject getter-based parse implementations', () => {
      const withGetter = {} as { parse: (x: unknown) => unknown }
      Object.defineProperty(withGetter, 'parse', {
        get() {
          return (x: unknown) => x
        },
        enumerable: true,
        configurable: true
      })

      expect(() => validateArgs(withGetter as unknown as Validator, {}))
        .toThrow('Invalid validator')
    })
  })

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('integration with actual validation flow', () => {
    it('should still properly validate args with real validators', () => {
      const validator = v.object({
        name: v.string(),
        count: v.number()
      })

      const result = validateArgs(validator, { name: 'test', count: 42 })
      expect(result).toEqual({ name: 'test', count: 42 })
    })

    it('should still throw validation errors for invalid data with real validators', () => {
      const validator = v.object({
        name: v.string(),
        count: v.number()
      })

      expect(() => validateArgs(validator, { name: 123, count: 'not a number' }))
        .toThrow()
    })

    it('should work with undefined validator (no args)', () => {
      const result = validateArgs(undefined, {})
      expect(result).toEqual({})
    })

    it('should work with empty object validator', () => {
      const result = validateArgs({}, {})
      expect(result).toEqual({})
    })
  })
})
