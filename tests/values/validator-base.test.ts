/**
 * TDD RED Phase Tests for Validator Base System
 *
 * These tests define the expected interface and behavior for the validator base system.
 * The implementation does not yet exist, so all tests should FAIL.
 */

import { describe, it, expect } from 'vitest'

// Import from the module that will contain the implementation
// These imports will fail or the types won't match because the implementation doesn't exist
import {
  type Validator,
  type ValidationResult,
  type ValidationError,
  type ValidatorError,
  createValidator,
  isValidationSuccess,
  isValidationFailure,
} from '../../src/values/validator-base'

// ============================================================================
// ValidationResult Type Tests
// ============================================================================

describe('ValidationResult Type', () => {
  describe('Success result structure', () => {
    it('should have success: true for valid values', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.validate('hello')

      expect(result.success).toBe(true)
    })

    it('should include the parsed value in success result', () => {
      const validator = createValidator<number>({
        parse: (value) => {
          if (typeof value !== 'number') throw new Error('Expected number')
          return value * 2
        },
      })

      const result = validator.validate(21)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.value).toBe(42)
      }
    })

    it('should not have error property on success result', () => {
      const validator = createValidator<boolean>({
        parse: (value) => {
          if (typeof value !== 'boolean') throw new Error('Expected boolean')
          return value
        },
      })

      const result = validator.validate(true)

      expect(result.success).toBe(true)
      expect('error' in result).toBe(false)
      expect('errors' in result).toBe(false)
    })
  })

  describe('Failure result with error details', () => {
    it('should have success: false for invalid values', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.validate(123)

      expect(result.success).toBe(false)
    })

    it('should include error message in failure result', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string, got number')
          return value
        },
      })

      const result = validator.validate(123)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('Expected string, got number')
      }
    })

    it('should include error code in failure result when provided', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') {
            const error = new Error('Expected string') as Error & { code: string }
            error.code = 'INVALID_TYPE'
            throw error
          }
          return value
        },
        errorCode: 'INVALID_TYPE',
      })

      const result = validator.validate(123)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_TYPE')
      }
    })

    it('should not have value property on failure result', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.validate(123)

      expect(result.success).toBe(false)
      expect('value' in result).toBe(false)
    })
  })

  describe('Error path tracking', () => {
    it('should include empty path for root-level errors', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.validate(123)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.path).toEqual([])
      }
    })

    it('should include field path for nested object errors', () => {
      interface User {
        name: string
        age: number
      }

      const validator = createValidator<User>({
        parse: (value) => {
          if (typeof value !== 'object' || value === null) {
            throw new Error('Expected object')
          }
          const obj = value as Record<string, unknown>
          if (typeof obj.name !== 'string') {
            const error = new Error('Expected string') as Error & { path: (string | number)[] }
            error.path = ['name']
            throw error
          }
          if (typeof obj.age !== 'number') {
            const error = new Error('Expected number') as Error & { path: (string | number)[] }
            error.path = ['age']
            throw error
          }
          return { name: obj.name, age: obj.age }
        },
      })

      const result = validator.validate({ name: 123, age: 25 })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.path).toEqual(['name'])
      }
    })

    it('should include index path for array element errors', () => {
      const validator = createValidator<string[]>({
        parse: (value) => {
          if (!Array.isArray(value)) throw new Error('Expected array')
          return value.map((item, index) => {
            if (typeof item !== 'string') {
              const error = new Error('Expected string') as Error & { path: (string | number)[] }
              error.path = [index]
              throw error
            }
            return item
          })
        },
      })

      const result = validator.validate(['a', 'b', 123, 'd'])

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.path).toEqual([2])
      }
    })

    it('should include deep nested path for complex structures', () => {
      interface DeepNested {
        users: Array<{ profile: { email: string } }>
      }

      const validator = createValidator<DeepNested>({
        parse: (value) => {
          // Simulate deep validation failure
          const error = new Error('Expected string') as Error & { path: (string | number)[] }
          error.path = ['users', 0, 'profile', 'email']
          throw error
        },
      })

      const result = validator.validate({
        users: [{ profile: { email: 123 } }],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.path).toEqual(['users', 0, 'profile', 'email'])
      }
    })
  })

  describe('Multiple error aggregation', () => {
    it('should collect all errors when validateAll option is used', () => {
      interface User {
        name: string
        email: string
        age: number
      }

      const validator = createValidator<User>({
        parse: (value) => {
          throw new Error('Invalid')
        },
        collectAllErrors: true,
      })

      const result = validator.validate(
        { name: 123, email: true, age: 'not a number' },
        { collectAllErrors: true }
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors).toBeDefined()
        expect(result.errors!.length).toBeGreaterThanOrEqual(3)
      }
    })

    it('should include path for each error in aggregated errors', () => {
      interface FormData {
        username: string
        password: string
      }

      const validator = createValidator<FormData>({
        parse: () => {
          throw new Error('Invalid')
        },
        collectAllErrors: true,
      })

      const result = validator.validate(
        { username: 123, password: null },
        { collectAllErrors: true }
      )

      expect(result.success).toBe(false)
      if (!result.success && result.errors) {
        expect(result.errors.every((e) => Array.isArray(e.path))).toBe(true)
      }
    })

    it('should still have primary error when multiple errors exist', () => {
      const validator = createValidator<{ a: string; b: number }>({
        parse: () => {
          throw new Error('First error')
        },
        collectAllErrors: true,
      })

      const result = validator.validate(
        { a: 1, b: 'x' },
        { collectAllErrors: true }
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeDefined()
        expect(result.error.message).toBeDefined()
      }
    })
  })
})

// ============================================================================
// Validator Interface Tests
// ============================================================================

describe('Validator Interface', () => {
  describe('Basic structure', () => {
    it('should have parse method', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      expect(typeof validator.parse).toBe('function')
    })

    it('should have validate method', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      expect(typeof validator.validate).toBe('function')
    })

    it('should have isOptional property', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      expect(typeof validator.isOptional).toBe('boolean')
    })

    it('should have isOptional as false by default', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      expect(validator.isOptional).toBe(false)
    })
  })

  describe('Type inference', () => {
    it('should correctly infer string type', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result: string = validator.parse('hello')
      expect(result).toBe('hello')
    })

    it('should correctly infer number type', () => {
      const validator = createValidator<number>({
        parse: (value) => {
          if (typeof value !== 'number') throw new Error('Expected number')
          return value
        },
      })

      const result: number = validator.parse(42)
      expect(result).toBe(42)
    })

    it('should correctly infer complex object type', () => {
      interface User {
        id: string
        name: string
        age: number
      }

      const validator = createValidator<User>({
        parse: (value) => {
          const obj = value as User
          return { id: obj.id, name: obj.name, age: obj.age }
        },
      })

      const result: User = validator.parse({ id: '1', name: 'John', age: 30 })
      expect(result.name).toBe('John')
    })
  })

  describe('Optional validators', () => {
    it('should have isOptional as true for optional validators', () => {
      const validator = createValidator<string | undefined>({
        parse: (value) => {
          if (value === undefined) return undefined
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
        isOptional: true,
      })

      expect(validator.isOptional).toBe(true)
    })

    it('should accept undefined for optional validators', () => {
      const validator = createValidator<string | undefined>({
        parse: (value) => {
          if (value === undefined) return undefined
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
        isOptional: true,
      })

      const result = validator.parse(undefined)
      expect(result).toBeUndefined()
    })

    it('should still validate non-undefined values for optional validators', () => {
      const validator = createValidator<string | undefined>({
        parse: (value) => {
          if (value === undefined) return undefined
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
        isOptional: true,
      })

      expect(() => validator.parse(123)).toThrow()
    })
  })
})

// ============================================================================
// Parse Logic Tests
// ============================================================================

describe('Parse Logic', () => {
  describe('Successful parsing', () => {
    it('should return typed value on successful parse', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.parse('test')
      expect(result).toBe('test')
    })

    it('should transform value during parse if needed', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value.toUpperCase()
        },
      })

      const result = validator.parse('hello')
      expect(result).toBe('HELLO')
    })

    it('should handle null values when expected', () => {
      const validator = createValidator<null>({
        parse: (value) => {
          if (value !== null) throw new Error('Expected null')
          return value
        },
      })

      const result = validator.parse(null)
      expect(result).toBeNull()
    })
  })

  describe('Failed parsing throws ValidatorError', () => {
    it('should throw ValidatorError on invalid input', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      expect(() => validator.parse(123)).toThrow()
    })

    it('should throw error with correct message', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') {
            throw new Error(`Expected string, got ${typeof value}`)
          }
          return value
        },
      })

      expect(() => validator.parse(123)).toThrow('Expected string, got number')
    })

    it('should throw ValidatorError type specifically', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      let thrownError: unknown
      try {
        validator.parse(123)
      } catch (e) {
        thrownError = e
      }

      // Check that it's a ValidatorError (this will fail until implementation exists)
      expect(thrownError).toBeInstanceOf(Error)
      expect((thrownError as Error).name).toBe('ValidatorError')
    })

    it('should include value that failed validation in error', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      let thrownError: unknown
      try {
        validator.parse(123)
      } catch (e) {
        thrownError = e
      }

      expect((thrownError as ValidatorError).value).toBe(123)
    })
  })

  describe('Nested value parsing', () => {
    it('should parse nested objects correctly', () => {
      interface Address {
        street: string
        city: string
      }
      interface User {
        name: string
        address: Address
      }

      const validator = createValidator<User>({
        parse: (value) => {
          const obj = value as Record<string, unknown>
          if (typeof obj.name !== 'string') throw new Error('Expected name to be string')
          const addr = obj.address as Record<string, unknown>
          if (typeof addr?.street !== 'string') throw new Error('Expected address.street to be string')
          if (typeof addr?.city !== 'string') throw new Error('Expected address.city to be string')
          return {
            name: obj.name,
            address: { street: addr.street, city: addr.city },
          }
        },
      })

      const result = validator.parse({
        name: 'John',
        address: { street: '123 Main St', city: 'NYC' },
      })

      expect(result.address.city).toBe('NYC')
    })

    it('should parse nested arrays correctly', () => {
      const validator = createValidator<string[][]>({
        parse: (value) => {
          if (!Array.isArray(value)) throw new Error('Expected array')
          return value.map((inner, i) => {
            if (!Array.isArray(inner)) throw new Error(`Expected array at index ${i}`)
            return inner.map((item, j) => {
              if (typeof item !== 'string') throw new Error(`Expected string at [${i}][${j}]`)
              return item
            })
          })
        },
      })

      const result = validator.parse([['a', 'b'], ['c', 'd']])
      expect(result[1][0]).toBe('c')
    })

    it('should handle deeply nested structures', () => {
      interface DeepNested {
        level1: {
          level2: {
            level3: {
              value: string
            }
          }
        }
      }

      const validator = createValidator<DeepNested>({
        parse: (value) => {
          const v = value as DeepNested
          return v
        },
      })

      const input = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      }

      const result = validator.parse(input)
      expect(result.level1.level2.level3.value).toBe('deep')
    })
  })

  describe('Path context in errors', () => {
    it('should include path in error for nested failures', () => {
      interface User {
        profile: {
          email: string
        }
      }

      const validator = createValidator<User>({
        parse: (value) => {
          const obj = value as Record<string, Record<string, unknown>>
          if (typeof obj.profile?.email !== 'string') {
            const error = new Error('Expected string') as Error & { path: string[] }
            error.path = ['profile', 'email']
            throw error
          }
          return value as User
        },
      })

      let thrownError: unknown
      try {
        validator.parse({ profile: { email: 123 } })
      } catch (e) {
        thrownError = e
      }

      expect((thrownError as ValidatorError).path).toEqual(['profile', 'email'])
    })

    it('should format path as readable string in error message', () => {
      const validator = createValidator<{ items: string[] }>({
        parse: (value) => {
          const error = new Error('Expected string at items[2]') as Error & { path: (string | number)[] }
          error.path = ['items', 2]
          throw error
        },
      })

      expect(() => validator.parse({ items: ['a', 'b', 123] })).toThrow(/items\[2\]|items\.2/)
    })
  })
})

// ============================================================================
// Validate Logic Tests
// ============================================================================

describe('Validate Logic', () => {
  describe('Returns result object (does not throw)', () => {
    it('should not throw on invalid input', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      // This should NOT throw
      expect(() => validator.validate(123)).not.toThrow()
    })

    it('should return success result for valid input', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.validate('hello')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.value).toBe('hello')
      }
    })

    it('should return failure result for invalid input', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.validate(123)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeDefined()
      }
    })

    it('should be usable with type guards for narrowing', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.validate('test')

      if (isValidationSuccess(result)) {
        // TypeScript should know result.value is string here
        const value: string = result.value
        expect(value).toBe('test')
      }

      const failResult = validator.validate(123)
      if (isValidationFailure(failResult)) {
        // TypeScript should know failResult.error exists here
        expect(failResult.error.message).toBeDefined()
      }
    })
  })

  describe('Validation error messages', () => {
    it('should include descriptive error message', () => {
      const validator = createValidator<number>({
        parse: (value) => {
          if (typeof value !== 'number') {
            throw new Error('Expected a number value')
          }
          return value
        },
      })

      const result = validator.validate('not a number')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain('number')
      }
    })

    it('should include expected type in error', () => {
      const validator = createValidator<boolean>({
        parse: (value) => {
          if (typeof value !== 'boolean') {
            throw new Error('Expected boolean')
          }
          return value
        },
        expectedType: 'boolean',
      })

      const result = validator.validate('true')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.expected).toBe('boolean')
      }
    })

    it('should include received type in error', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.validate(42)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.received).toBe('number')
      }
    })

    it('should handle null received type correctly', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.validate(null)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.received).toBe('null')
      }
    })

    it('should handle undefined received type correctly', () => {
      const validator = createValidator<string>({
        parse: (value) => {
          if (typeof value !== 'string') throw new Error('Expected string')
          return value
        },
      })

      const result = validator.validate(undefined)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.received).toBe('undefined')
      }
    })
  })

  describe('Path context in validation', () => {
    it('should include path in validation error', () => {
      interface Data {
        items: number[]
      }

      const validator = createValidator<Data>({
        parse: (value) => {
          const obj = value as { items: unknown[] }
          if (!Array.isArray(obj.items)) throw new Error('Expected array')
          obj.items.forEach((item, index) => {
            if (typeof item !== 'number') {
              const error = new Error('Expected number') as Error & { path: (string | number)[] }
              error.path = ['items', index]
              throw error
            }
          })
          return value as Data
        },
      })

      const result = validator.validate({ items: [1, 2, 'three'] })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.path).toEqual(['items', 2])
      }
    })

    it('should format path for display', () => {
      const validator = createValidator<{ a: { b: { c: string } } }>({
        parse: (value) => {
          const error = new Error('Invalid') as Error & { path: string[] }
          error.path = ['a', 'b', 'c']
          throw error
        },
      })

      const result = validator.validate({ a: { b: { c: 123 } } })

      expect(result.success).toBe(false)
      if (!result.success) {
        // Should have a formatted path string like "a.b.c"
        expect(result.error.pathString).toBe('a.b.c')
      }
    })

    it('should handle array indices in path formatting', () => {
      const validator = createValidator<{ list: string[] }>({
        parse: (value) => {
          const error = new Error('Invalid') as Error & { path: (string | number)[] }
          error.path = ['list', 0]
          throw error
        },
      })

      const result = validator.validate({ list: [123] })

      expect(result.success).toBe(false)
      if (!result.success) {
        // Should format as "list[0]" or "list.0"
        expect(result.error.pathString).toMatch(/list\[0\]|list\.0/)
      }
    })
  })
})

// ============================================================================
// Type Guard Helper Tests
// ============================================================================

describe('Type Guard Helpers', () => {
  it('isValidationSuccess should return true for success results', () => {
    const successResult: ValidationResult<string> = {
      success: true,
      value: 'test',
    }

    expect(isValidationSuccess(successResult)).toBe(true)
  })

  it('isValidationSuccess should return false for failure results', () => {
    const failureResult: ValidationResult<string> = {
      success: false,
      error: {
        message: 'Invalid',
        path: [],
        pathString: '',
      },
    }

    expect(isValidationSuccess(failureResult)).toBe(false)
  })

  it('isValidationFailure should return true for failure results', () => {
    const failureResult: ValidationResult<string> = {
      success: false,
      error: {
        message: 'Invalid',
        path: [],
        pathString: '',
      },
    }

    expect(isValidationFailure(failureResult)).toBe(true)
  })

  it('isValidationFailure should return false for success results', () => {
    const successResult: ValidationResult<string> = {
      success: true,
      value: 'test',
    }

    expect(isValidationFailure(successResult)).toBe(false)
  })
})

// ============================================================================
// Edge Cases and Special Scenarios
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty string validation', () => {
    const validator = createValidator<string>({
      parse: (value) => {
        if (typeof value !== 'string') throw new Error('Expected string')
        return value
      },
    })

    const result = validator.validate('')
    expect(result.success).toBe(true)
  })

  it('should handle zero number validation', () => {
    const validator = createValidator<number>({
      parse: (value) => {
        if (typeof value !== 'number') throw new Error('Expected number')
        return value
      },
    })

    const result = validator.validate(0)
    expect(result.success).toBe(true)
  })

  it('should handle false boolean validation', () => {
    const validator = createValidator<boolean>({
      parse: (value) => {
        if (typeof value !== 'boolean') throw new Error('Expected boolean')
        return value
      },
    })

    const result = validator.validate(false)
    expect(result.success).toBe(true)
  })

  it('should handle NaN as invalid number', () => {
    const validator = createValidator<number>({
      parse: (value) => {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          throw new Error('Expected valid number')
        }
        return value
      },
    })

    const result = validator.validate(NaN)
    expect(result.success).toBe(false)
  })

  it('should handle Infinity as number', () => {
    const validator = createValidator<number>({
      parse: (value) => {
        if (typeof value !== 'number') throw new Error('Expected number')
        return value
      },
    })

    const result = validator.validate(Infinity)
    expect(result.success).toBe(true)
  })

  it('should handle symbols as invalid', () => {
    const validator = createValidator<string>({
      parse: (value) => {
        if (typeof value !== 'string') throw new Error('Expected string')
        return value
      },
    })

    const result = validator.validate(Symbol('test'))
    expect(result.success).toBe(false)
  })

  it('should handle functions as invalid', () => {
    const validator = createValidator<object>({
      parse: (value) => {
        if (typeof value !== 'object' || value === null) {
          throw new Error('Expected object')
        }
        return value
      },
    })

    const result = validator.validate(() => {})
    expect(result.success).toBe(false)
  })

  it('should handle circular references gracefully', () => {
    const validator = createValidator<object>({
      parse: (value) => {
        if (typeof value !== 'object' || value === null) {
          throw new Error('Expected object')
        }
        return value
      },
    })

    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular

    // Should not throw or hang
    expect(() => validator.validate(circular)).not.toThrow()
  })
})
