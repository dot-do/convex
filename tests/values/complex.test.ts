/**
 * TDD RED Phase Tests for Complex/Composite Validators
 *
 * These tests are designed to fail because implementations are missing or incomplete.
 * This is the "RED" phase of TDD - tests that define expected behavior.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import { v, type Infer, type Validator } from '../../src/values'

// ============================================================================
// v.object() - Object schema validator
// ============================================================================
describe('v.object()', () => {
  describe('valid object matching schema', () => {
    it('should parse a valid object with all required fields', () => {
      const userSchema = v.object({
        name: v.string(),
        age: v.number(),
        active: v.boolean(),
      })

      const result = userSchema.parse({
        name: 'Alice',
        age: 30,
        active: true,
      })

      expect(result).toEqual({
        name: 'Alice',
        age: 30,
        active: true,
      })
    })

    it('should return true for isValid() on valid object', () => {
      const schema = v.object({
        id: v.string(),
        count: v.number(),
      })

      expect(schema.isValid({ id: 'abc', count: 42 })).toBe(true)
    })

    it('should describe the object schema correctly', () => {
      const schema = v.object({
        name: v.string(),
        age: v.number(),
      })

      expect(schema.describe()).toContain('name')
      expect(schema.describe()).toContain('string')
      expect(schema.describe()).toContain('age')
      expect(schema.describe()).toContain('number')
    })
  })

  describe('missing required fields', () => {
    it('should throw error when required field is missing', () => {
      const schema = v.object({
        name: v.string(),
        email: v.string(),
      })

      expect(() => schema.parse({ name: 'Alice' })).toThrow()
    })

    it('should include field name in error message for missing field', () => {
      const schema = v.object({
        requiredField: v.string(),
      })

      expect(() => schema.parse({})).toThrow(/requiredField/)
    })

    it('should throw for null instead of object', () => {
      const schema = v.object({ name: v.string() })

      expect(() => schema.parse(null)).toThrow()
    })

    it('should throw for array instead of object', () => {
      const schema = v.object({ name: v.string() })

      expect(() => schema.parse([])).toThrow()
    })

    it('should throw for primitive instead of object', () => {
      const schema = v.object({ name: v.string() })

      expect(() => schema.parse('string')).toThrow()
      expect(() => schema.parse(123)).toThrow()
      expect(() => schema.parse(true)).toThrow()
    })
  })

  describe('extra fields handling', () => {
    it('should strip extra fields by default (strict mode)', () => {
      const schema = v.object({
        name: v.string(),
      })

      const result = schema.parse({
        name: 'Alice',
        extraField: 'should be stripped',
      })

      // This test expects extra fields to be stripped - may fail if passthrough is default
      expect(result).not.toHaveProperty('extraField')
      expect(Object.keys(result)).toEqual(['name'])
    })

    it('should have a strict() method to reject extra fields', () => {
      const schema = v.object({
        name: v.string(),
      })

      // This test expects a strict() method that throws on extra fields
      const strictSchema = (schema as any).strict()

      expect(() => strictSchema.parse({
        name: 'Alice',
        extraField: 'should cause error',
      })).toThrow()
    })

    it('should have a passthrough() method to allow extra fields', () => {
      const schema = v.object({
        name: v.string(),
      })

      // This test expects a passthrough() method
      const passthroughSchema = (schema as any).passthrough()

      const result = passthroughSchema.parse({
        name: 'Alice',
        extraField: 'should be kept',
      })

      expect(result).toHaveProperty('extraField', 'should be kept')
    })
  })

  describe('nested objects', () => {
    it('should validate nested object structures', () => {
      const schema = v.object({
        user: v.object({
          profile: v.object({
            name: v.string(),
            settings: v.object({
              theme: v.string(),
            }),
          }),
        }),
      })

      const result = schema.parse({
        user: {
          profile: {
            name: 'Alice',
            settings: {
              theme: 'dark',
            },
          },
        },
      })

      expect(result.user.profile.name).toBe('Alice')
      expect(result.user.profile.settings.theme).toBe('dark')
    })

    it('should throw with path information for nested validation errors', () => {
      const schema = v.object({
        level1: v.object({
          level2: v.object({
            value: v.number(),
          }),
        }),
      })

      // This test expects the error to include path information
      try {
        schema.parse({
          level1: {
            level2: {
              value: 'not a number',
            },
          },
        })
        expect.fail('Should have thrown')
      } catch (e) {
        // Expect error message to contain path like "level1.level2.value"
        expect((e as Error).message).toMatch(/level1.*level2.*value|path/)
      }
    })
  })

  describe('type inference', () => {
    it('should correctly infer TypeScript types', () => {
      const schema = v.object({
        name: v.string(),
        age: v.number(),
        isActive: v.boolean(),
      })

      type UserType = Infer<typeof schema>

      // Type-level test: this should compile without errors
      const user: UserType = {
        name: 'test',
        age: 25,
        isActive: true,
      }

      expect(user.name).toBe('test')

      // These type assertions verify the inferred types
      expectTypeOf<UserType>().toMatchTypeOf<{
        name: string
        age: number
        isActive: boolean
      }>()
    })

    it('should infer optional fields correctly', () => {
      const schema = v.object({
        required: v.string(),
        optional: v.optional(v.string()),
      })

      type SchemaType = Infer<typeof schema>

      // The optional field should be string | undefined
      expectTypeOf<SchemaType['optional']>().toEqualTypeOf<string | undefined>()
    })
  })

  describe('extend() method', () => {
    it('should have an extend() method to add fields', () => {
      const baseSchema = v.object({
        name: v.string(),
      })

      // This test expects an extend() method
      const extendedSchema = (baseSchema as any).extend({
        age: v.number(),
      })

      const result = extendedSchema.parse({
        name: 'Alice',
        age: 30,
      })

      expect(result.name).toBe('Alice')
      expect(result.age).toBe(30)
    })
  })

  describe('pick() and omit() methods', () => {
    it('should have a pick() method to select fields', () => {
      const schema = v.object({
        name: v.string(),
        age: v.number(),
        email: v.string(),
      })

      // This test expects a pick() method
      const pickedSchema = (schema as any).pick(['name', 'email'])

      const result = pickedSchema.parse({
        name: 'Alice',
        email: 'alice@example.com',
      })

      expect(result).not.toHaveProperty('age')
    })

    it('should have an omit() method to exclude fields', () => {
      const schema = v.object({
        name: v.string(),
        password: v.string(),
        email: v.string(),
      })

      // This test expects an omit() method
      const safeSchema = (schema as any).omit(['password'])

      // Omitted field should not be required
      const result = safeSchema.parse({
        name: 'Alice',
        email: 'alice@example.com',
      })

      expect(result).not.toHaveProperty('password')
    })
  })
})

// ============================================================================
// v.array() - Array validator
// ============================================================================
describe('v.array()', () => {
  describe('valid arrays with element validator', () => {
    it('should parse array of strings', () => {
      const schema = v.array(v.string())

      const result = schema.parse(['a', 'b', 'c'])

      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('should parse array of numbers', () => {
      const schema = v.array(v.number())

      const result = schema.parse([1, 2, 3])

      expect(result).toEqual([1, 2, 3])
    })

    it('should parse array of objects', () => {
      const schema = v.array(v.object({
        id: v.number(),
        name: v.string(),
      }))

      const result = schema.parse([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ])

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('first')
    })

    it('should return true for isValid() on valid array', () => {
      const schema = v.array(v.number())

      expect(schema.isValid([1, 2, 3])).toBe(true)
    })

    it('should describe the array schema correctly', () => {
      const schema = v.array(v.string())

      expect(schema.describe()).toContain('string')
      expect(schema.describe()).toMatch(/\[\]|array/i)
    })
  })

  describe('empty arrays', () => {
    it('should accept empty arrays', () => {
      const schema = v.array(v.string())

      const result = schema.parse([])

      expect(result).toEqual([])
    })

    it('should have a nonempty() method to require at least one element', () => {
      const schema = v.array(v.string())

      // This test expects a nonempty() method
      const nonemptySchema = (schema as any).nonempty()

      expect(() => nonemptySchema.parse([])).toThrow()
      expect(nonemptySchema.parse(['a'])).toEqual(['a'])
    })

    it('should have a min() method for minimum length', () => {
      const schema = v.array(v.string())

      // This test expects a min() method
      const minSchema = (schema as any).min(2)

      expect(() => minSchema.parse(['a'])).toThrow()
      expect(minSchema.parse(['a', 'b'])).toEqual(['a', 'b'])
    })

    it('should have a max() method for maximum length', () => {
      const schema = v.array(v.string())

      // This test expects a max() method
      const maxSchema = (schema as any).max(2)

      expect(() => maxSchema.parse(['a', 'b', 'c'])).toThrow()
      expect(maxSchema.parse(['a', 'b'])).toEqual(['a', 'b'])
    })

    it('should have a length() method for exact length', () => {
      const schema = v.array(v.string())

      // This test expects a length() method
      const exactSchema = (schema as any).length(3)

      expect(() => exactSchema.parse(['a', 'b'])).toThrow()
      expect(() => exactSchema.parse(['a', 'b', 'c', 'd'])).toThrow()
      expect(exactSchema.parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    })
  })

  describe('invalid elements', () => {
    it('should throw for array with invalid element', () => {
      const schema = v.array(v.number())

      expect(() => schema.parse([1, 'two', 3])).toThrow()
    })

    it('should include index in error message', () => {
      const schema = v.array(v.number())

      try {
        schema.parse([1, 2, 'invalid', 4])
      } catch (e) {
        // Expect error to mention index 2
        expect((e as Error).message).toMatch(/2|index/)
      }
    })

    it('should throw for non-array input', () => {
      const schema = v.array(v.string())

      expect(() => schema.parse('not an array')).toThrow()
      expect(() => schema.parse({ 0: 'a', length: 1 })).toThrow()
      expect(() => schema.parse(null)).toThrow()
      expect(() => schema.parse(undefined)).toThrow()
    })
  })

  describe('nested arrays', () => {
    it('should validate nested arrays', () => {
      const schema = v.array(v.array(v.number()))

      const result = schema.parse([[1, 2], [3, 4], [5, 6]])

      expect(result).toEqual([[1, 2], [3, 4], [5, 6]])
    })

    it('should validate deeply nested arrays', () => {
      const schema = v.array(v.array(v.array(v.string())))

      const result = schema.parse([[['a', 'b'], ['c']], [['d']]])

      expect(result[0][0][0]).toBe('a')
    })

    it('should throw with path for nested array validation errors', () => {
      const schema = v.array(v.array(v.number()))

      try {
        schema.parse([[1, 2], [3, 'invalid']])
      } catch (e) {
        // Expect error to indicate the path [1][1]
        expect((e as Error).message).toMatch(/1.*1|index|element/)
      }
    })
  })

  describe('type inference', () => {
    it('should correctly infer array element types', () => {
      const schema = v.array(v.object({
        id: v.number(),
        name: v.string(),
      }))

      type ItemsType = Infer<typeof schema>

      expectTypeOf<ItemsType>().toMatchTypeOf<Array<{ id: number; name: string }>>()
    })
  })
})

// ============================================================================
// v.union() - Union type validator
// ============================================================================
describe('v.union()', () => {
  describe('matching variants', () => {
    it('should parse value matching first variant', () => {
      const schema = v.union(v.string(), v.number())

      const result = schema.parse('hello')

      expect(result).toBe('hello')
    })

    it('should parse value matching second variant', () => {
      const schema = v.union(v.string(), v.number())

      const result = schema.parse(42)

      expect(result).toBe(42)
    })

    it('should work with multiple variants', () => {
      const schema = v.union(
        v.string(),
        v.number(),
        v.boolean(),
        v.null()
      )

      expect(schema.parse('text')).toBe('text')
      expect(schema.parse(123)).toBe(123)
      expect(schema.parse(true)).toBe(true)
      expect(schema.parse(null)).toBe(null)
    })

    it('should return true for isValid() on matching value', () => {
      const schema = v.union(v.string(), v.number())

      expect(schema.isValid('hello')).toBe(true)
      expect(schema.isValid(42)).toBe(true)
    })

    it('should describe the union correctly', () => {
      const schema = v.union(v.string(), v.number())

      expect(schema.describe()).toContain('string')
      expect(schema.describe()).toContain('number')
      expect(schema.describe()).toMatch(/\||or|union/i)
    })
  })

  describe('no match error', () => {
    it('should throw when no variant matches', () => {
      const schema = v.union(v.string(), v.number())

      expect(() => schema.parse(true)).toThrow()
      expect(() => schema.parse(null)).toThrow()
      expect(() => schema.parse({})).toThrow()
      expect(() => schema.parse([])).toThrow()
    })

    it('should return false for isValid() when no variant matches', () => {
      const schema = v.union(v.string(), v.number())

      expect(schema.isValid(true)).toBe(false)
    })

    it('should include all variant errors in error message', () => {
      const schema = v.union(v.string(), v.number())

      try {
        schema.parse(true)
      } catch (e) {
        // Expect error to mention what was expected
        expect((e as Error).message).toMatch(/string|number|variant/)
      }
    })
  })

  describe('discriminated unions', () => {
    it('should validate discriminated union by type field', () => {
      const dogSchema = v.object({
        type: v.literal('dog'),
        bark: v.boolean(),
      })

      const catSchema = v.object({
        type: v.literal('cat'),
        meow: v.boolean(),
      })

      const animalSchema = v.union(dogSchema, catSchema)

      const dog = animalSchema.parse({ type: 'dog', bark: true })
      expect(dog.type).toBe('dog')

      const cat = animalSchema.parse({ type: 'cat', meow: true })
      expect(cat.type).toBe('cat')
    })

    it('should have a discriminatedUnion() method for optimized discriminated unions', () => {
      // This test expects a discriminatedUnion() helper function
      const schema = (v as any).discriminatedUnion('type', [
        v.object({
          type: v.literal('a'),
          valueA: v.string(),
        }),
        v.object({
          type: v.literal('b'),
          valueB: v.number(),
        }),
      ])

      expect(schema.parse({ type: 'a', valueA: 'test' }).type).toBe('a')
      expect(schema.parse({ type: 'b', valueB: 42 }).type).toBe('b')
    })

    it('should throw for invalid discriminator value', () => {
      const schema = v.union(
        v.object({
          type: v.literal('success'),
          data: v.string(),
        }),
        v.object({
          type: v.literal('error'),
          message: v.string(),
        })
      )

      expect(() => schema.parse({ type: 'unknown', data: 'test' })).toThrow()
    })
  })

  describe('type inference', () => {
    it('should correctly infer union types', () => {
      const schema = v.union(v.string(), v.number(), v.boolean())

      type UnionType = Infer<typeof schema>

      expectTypeOf<UnionType>().toEqualTypeOf<string | number | boolean>()
    })

    it('should narrow types in discriminated unions', () => {
      const schema = v.union(
        v.object({
          kind: v.literal('text'),
          content: v.string(),
        }),
        v.object({
          kind: v.literal('number'),
          value: v.number(),
        })
      )

      type ResultType = Infer<typeof schema>

      // The type should be a discriminated union
      expectTypeOf<ResultType>().toMatchTypeOf<
        { kind: 'text'; content: string } | { kind: 'number'; value: number }
      >()
    })
  })
})

// ============================================================================
// v.optional() - Optional wrapper
// ============================================================================
describe('v.optional()', () => {
  describe('undefined acceptance', () => {
    it('should accept undefined', () => {
      const schema = v.optional(v.string())

      const result = schema.parse(undefined)

      expect(result).toBeUndefined()
    })

    it('should return true for isValid() with undefined', () => {
      const schema = v.optional(v.number())

      expect(schema.isValid(undefined)).toBe(true)
    })

    it('should have isOptional property set to true', () => {
      const schema = v.optional(v.string())

      expect(schema.isOptional).toBe(true)
    })
  })

  describe('defined value validation', () => {
    it('should validate defined values against inner validator', () => {
      const schema = v.optional(v.string())

      const result = schema.parse('hello')

      expect(result).toBe('hello')
    })

    it('should throw for invalid defined values', () => {
      const schema = v.optional(v.number())

      expect(() => schema.parse('not a number')).toThrow()
    })

    it('should work with complex inner validators', () => {
      const schema = v.optional(v.object({
        name: v.string(),
        age: v.number(),
      }))

      expect(schema.parse(undefined)).toBeUndefined()
      expect(schema.parse({ name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 })
    })

    it('should not accept null (only undefined)', () => {
      const schema = v.optional(v.string())

      // null should NOT be accepted by optional()
      expect(() => schema.parse(null)).toThrow()
    })
  })

  describe('type inference includes undefined', () => {
    it('should infer type as T | undefined', () => {
      const schema = v.optional(v.string())

      type OptionalString = Infer<typeof schema>

      expectTypeOf<OptionalString>().toEqualTypeOf<string | undefined>()
    })

    it('should work with optional object fields', () => {
      const schema = v.object({
        required: v.string(),
        optional: v.optional(v.number()),
      })

      type SchemaType = Infer<typeof schema>

      expectTypeOf<SchemaType['optional']>().toEqualTypeOf<number | undefined>()
      expectTypeOf<SchemaType['required']>().toEqualTypeOf<string>()
    })
  })

  describe('nullable() variant', () => {
    it('should have a nullable() function that accepts null', () => {
      // This test expects a nullable() function
      const schema = (v as any).nullable(v.string())

      expect(schema.parse(null)).toBeNull()
      expect(schema.parse('hello')).toBe('hello')
      expect(() => schema.parse(undefined)).toThrow()
    })

    it('should have a nullish() function that accepts null or undefined', () => {
      // This test expects a nullish() function
      const schema = (v as any).nullish(v.string())

      expect(schema.parse(null)).toBeNull()
      expect(schema.parse(undefined)).toBeUndefined()
      expect(schema.parse('hello')).toBe('hello')
    })
  })

  describe('default() method', () => {
    it('should have a default() method to provide default values', () => {
      const schema = v.optional(v.string())

      // This test expects a default() method
      const withDefault = (schema as any).default('default value')

      expect(withDefault.parse(undefined)).toBe('default value')
      expect(withDefault.parse('provided')).toBe('provided')
    })
  })

  describe('chaining optional()', () => {
    it('should handle chained optional() calls', () => {
      const schema = v.string().optional()

      expect(schema.parse(undefined)).toBeUndefined()
      expect(schema.parse('hello')).toBe('hello')
    })

    it('should have isOptional true when chained', () => {
      const schema = v.number().optional()

      expect(schema.isOptional).toBe(true)
    })
  })
})

// ============================================================================
// v.literal() - Literal values
// ============================================================================
describe('v.literal()', () => {
  describe('string literals', () => {
    it('should validate exact string match', () => {
      const schema = v.literal('hello')

      const result = schema.parse('hello')

      expect(result).toBe('hello')
    })

    it('should throw for different string', () => {
      const schema = v.literal('hello')

      expect(() => schema.parse('world')).toThrow()
      expect(() => schema.parse('Hello')).toThrow() // case sensitive
    })

    it('should throw for different types', () => {
      const schema = v.literal('123')

      expect(() => schema.parse(123)).toThrow()
    })
  })

  describe('number literals', () => {
    it('should validate exact number match', () => {
      const schema = v.literal(42)

      const result = schema.parse(42)

      expect(result).toBe(42)
    })

    it('should throw for different number', () => {
      const schema = v.literal(42)

      expect(() => schema.parse(43)).toThrow()
      expect(() => schema.parse(42.1)).toThrow()
    })

    it('should handle negative numbers', () => {
      const schema = v.literal(-5)

      expect(schema.parse(-5)).toBe(-5)
      expect(() => schema.parse(5)).toThrow()
    })

    it('should handle zero', () => {
      const schema = v.literal(0)

      expect(schema.parse(0)).toBe(0)
      expect(() => schema.parse(-0)).not.toThrow() // 0 === -0 in JS
    })

    it('should handle floating point numbers', () => {
      const schema = v.literal(3.14159)

      expect(schema.parse(3.14159)).toBe(3.14159)
      expect(() => schema.parse(3.14)).toThrow()
    })
  })

  describe('boolean literals', () => {
    it('should validate true literal', () => {
      const schema = v.literal(true)

      expect(schema.parse(true)).toBe(true)
      expect(() => schema.parse(false)).toThrow()
    })

    it('should validate false literal', () => {
      const schema = v.literal(false)

      expect(schema.parse(false)).toBe(false)
      expect(() => schema.parse(true)).toThrow()
    })

    it('should throw for truthy/falsy values', () => {
      const trueSchema = v.literal(true)
      const falseSchema = v.literal(false)

      expect(() => trueSchema.parse(1)).toThrow()
      expect(() => trueSchema.parse('true')).toThrow()
      expect(() => falseSchema.parse(0)).toThrow()
      expect(() => falseSchema.parse('')).toThrow()
    })
  })

  describe('mismatch errors', () => {
    it('should include expected value in error message', () => {
      const schema = v.literal('expected')

      try {
        schema.parse('actual')
      } catch (e) {
        expect((e as Error).message).toContain('expected')
      }
    })
  })

  describe('type inference', () => {
    it('should infer literal string type', () => {
      const schema = v.literal('specific')

      type LiteralType = Infer<typeof schema>

      expectTypeOf<LiteralType>().toEqualTypeOf<'specific'>()
    })

    it('should infer literal number type', () => {
      const schema = v.literal(42)

      type LiteralType = Infer<typeof schema>

      expectTypeOf<LiteralType>().toEqualTypeOf<42>()
    })

    it('should infer literal boolean type', () => {
      const schema = v.literal(true)

      type LiteralType = Infer<typeof schema>

      expectTypeOf<LiteralType>().toEqualTypeOf<true>()
    })
  })

  describe('describe()', () => {
    it('should describe string literal with quotes', () => {
      const schema = v.literal('hello')

      expect(schema.describe()).toMatch(/"hello"|'hello'/)
    })

    it('should describe number literal', () => {
      const schema = v.literal(42)

      expect(schema.describe()).toContain('42')
    })
  })
})

// ============================================================================
// v.record() - Record type
// ============================================================================
describe('v.record()', () => {
  describe('string keys with value validator', () => {
    it('should validate record with string values', () => {
      const schema = v.record(v.string(), v.string())

      const result = schema.parse({
        key1: 'value1',
        key2: 'value2',
      })

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
      })
    })

    it('should validate record with number values', () => {
      const schema = v.record(v.string(), v.number())

      const result = schema.parse({
        count: 42,
        total: 100,
      })

      expect(result.count).toBe(42)
      expect(result.total).toBe(100)
    })

    it('should validate record with object values', () => {
      const schema = v.record(v.string(), v.object({
        name: v.string(),
        active: v.boolean(),
      }))

      const result = schema.parse({
        user1: { name: 'Alice', active: true },
        user2: { name: 'Bob', active: false },
      })

      expect(result.user1.name).toBe('Alice')
    })

    it('should throw for invalid values', () => {
      const schema = v.record(v.string(), v.number())

      expect(() => schema.parse({
        valid: 42,
        invalid: 'not a number',
      })).toThrow()
    })

    it('should include key in error message for invalid values', () => {
      const schema = v.record(v.string(), v.number())

      try {
        schema.parse({
          goodKey: 42,
          badKey: 'invalid',
        })
      } catch (e) {
        expect((e as Error).message).toMatch(/badKey|key/)
      }
    })
  })

  describe('empty records', () => {
    it('should accept empty objects', () => {
      const schema = v.record(v.string(), v.number())

      const result = schema.parse({})

      expect(result).toEqual({})
    })

    it('should reject non-objects', () => {
      const schema = v.record(v.string(), v.string())

      expect(() => schema.parse(null)).toThrow()
      expect(() => schema.parse([])).toThrow()
      expect(() => schema.parse('string')).toThrow()
      expect(() => schema.parse(123)).toThrow()
    })
  })

  describe('shorthand syntax', () => {
    it('should support shorthand with just value validator', () => {
      // This test expects v.record(valueValidator) shorthand
      // where keys are implicitly v.string()
      const schema = (v as any).record(v.number())

      const result = schema.parse({ a: 1, b: 2 })

      expect(result).toEqual({ a: 1, b: 2 })
    })
  })

  describe('type inference', () => {
    it('should infer Record<string, T> type', () => {
      const schema = v.record(v.string(), v.number())

      type RecordType = Infer<typeof schema>

      expectTypeOf<RecordType>().toMatchTypeOf<Record<string, number>>()
    })

    it('should infer complex value types', () => {
      const schema = v.record(v.string(), v.object({
        id: v.number(),
        name: v.string(),
      }))

      type RecordType = Infer<typeof schema>

      expectTypeOf<RecordType>().toMatchTypeOf<Record<string, { id: number; name: string }>>()
    })
  })

  describe('describe()', () => {
    it('should describe the record schema', () => {
      const schema = v.record(v.string(), v.number())

      expect(schema.describe()).toMatch(/Record|record/i)
      expect(schema.describe()).toContain('string')
      expect(schema.describe()).toContain('number')
    })
  })
})

// ============================================================================
// v.any() - Any value
// ============================================================================
describe('v.any()', () => {
  describe('accepts all values', () => {
    it('should accept strings', () => {
      const schema = v.any()

      expect(schema.parse('hello')).toBe('hello')
    })

    it('should accept numbers', () => {
      const schema = v.any()

      expect(schema.parse(42)).toBe(42)
      expect(schema.parse(3.14)).toBe(3.14)
      expect(schema.parse(-100)).toBe(-100)
    })

    it('should accept booleans', () => {
      const schema = v.any()

      expect(schema.parse(true)).toBe(true)
      expect(schema.parse(false)).toBe(false)
    })

    it('should accept null', () => {
      const schema = v.any()

      expect(schema.parse(null)).toBeNull()
    })

    it('should accept undefined', () => {
      const schema = v.any()

      expect(schema.parse(undefined)).toBeUndefined()
    })

    it('should accept objects', () => {
      const schema = v.any()

      const obj = { key: 'value', nested: { a: 1 } }
      expect(schema.parse(obj)).toEqual(obj)
    })

    it('should accept arrays', () => {
      const schema = v.any()

      expect(schema.parse([1, 2, 3])).toEqual([1, 2, 3])
    })

    it('should accept functions', () => {
      const schema = v.any()

      const fn = () => 'test'
      expect(schema.parse(fn)).toBe(fn)
    })

    it('should accept symbols', () => {
      const schema = v.any()

      const sym = Symbol('test')
      expect(schema.parse(sym)).toBe(sym)
    })

    it('should always return true for isValid()', () => {
      const schema = v.any()

      expect(schema.isValid('anything')).toBe(true)
      expect(schema.isValid(null)).toBe(true)
      expect(schema.isValid(undefined)).toBe(true)
      expect(schema.isValid({})).toBe(true)
    })
  })

  describe("type is 'any'", () => {
    it('should describe as "any"', () => {
      const schema = v.any()

      expect(schema.describe()).toBe('any')
    })

    it('should have isOptional as false by default', () => {
      const schema = v.any()

      expect(schema.isOptional).toBe(false)
    })
  })

  describe('type inference', () => {
    it('should infer unknown type', () => {
      const schema = v.any()

      type AnyType = Infer<typeof schema>

      // v.any() should infer as unknown (safer) or any
      expectTypeOf<AnyType>().toMatchTypeOf<unknown>()
    })
  })

  describe('v.unknown() variant', () => {
    it('should have a v.unknown() that behaves like v.any() but with stricter types', () => {
      // This test expects a v.unknown() function
      const schema = (v as any).unknown()

      expect(schema.parse('anything')).toBe('anything')
      expect(schema.parse(42)).toBe(42)
      expect(schema.parse(null)).toBeNull()
    })
  })
})

// ============================================================================
// Integration tests for complex validators
// ============================================================================
describe('Complex validators integration', () => {
  it('should handle deeply nested complex structures', () => {
    const schema = v.object({
      users: v.array(v.object({
        id: v.string(),
        profile: v.optional(v.object({
          name: v.string(),
          settings: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
        })),
        tags: v.array(v.string()),
        status: v.union(v.literal('active'), v.literal('inactive'), v.literal('pending')),
      })),
      metadata: v.record(v.string(), v.any()),
    })

    const validData = {
      users: [
        {
          id: 'user-1',
          profile: {
            name: 'Alice',
            settings: {
              theme: 'dark',
              fontSize: 14,
              notifications: true,
            },
          },
          tags: ['admin', 'developer'],
          status: 'active',
        },
        {
          id: 'user-2',
          tags: [],
          status: 'inactive',
        },
      ],
      metadata: {
        version: '1.0.0',
        timestamp: 1234567890,
      },
    }

    const result = schema.parse(validData)

    expect(result.users).toHaveLength(2)
    expect(result.users[0].profile?.name).toBe('Alice')
    expect(result.users[0].status).toBe('active')
    expect(result.users[1].profile).toBeUndefined()
  })

  it('should properly chain optional with other validators', () => {
    const schema = v.object({
      data: v.optional(v.array(v.object({
        value: v.union(v.string(), v.number()),
      }))),
    })

    expect(schema.parse({})).toEqual({})
    expect(schema.parse({ data: undefined })).toEqual({})
    expect(schema.parse({ data: [{ value: 'test' }, { value: 42 }] })).toEqual({
      data: [{ value: 'test' }, { value: 42 }],
    })
  })

  it('should validate API response-like structures', () => {
    const apiResponseSchema = v.union(
      v.object({
        success: v.literal(true),
        data: v.object({
          items: v.array(v.object({
            id: v.string(),
            name: v.string(),
          })),
          pagination: v.object({
            page: v.number(),
            totalPages: v.number(),
          }),
        }),
      }),
      v.object({
        success: v.literal(false),
        error: v.object({
          code: v.string(),
          message: v.string(),
        }),
      })
    )

    const successResponse = {
      success: true,
      data: {
        items: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
        ],
        pagination: {
          page: 1,
          totalPages: 5,
        },
      },
    }

    const errorResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
    }

    expect(apiResponseSchema.parse(successResponse).success).toBe(true)
    expect(apiResponseSchema.parse(errorResponse).success).toBe(false)
  })

  it('should handle recursive-like structures with explicit depth', () => {
    // Testing nested structures that resemble trees
    const level3 = v.object({
      name: v.string(),
      value: v.number(),
    })

    const level2 = v.object({
      name: v.string(),
      children: v.array(level3),
    })

    const level1 = v.object({
      name: v.string(),
      children: v.array(level2),
    })

    const tree = {
      name: 'root',
      children: [
        {
          name: 'branch1',
          children: [
            { name: 'leaf1', value: 1 },
            { name: 'leaf2', value: 2 },
          ],
        },
        {
          name: 'branch2',
          children: [
            { name: 'leaf3', value: 3 },
          ],
        },
      ],
    }

    const result = level1.parse(tree)

    expect(result.name).toBe('root')
    expect(result.children[0].children[0].value).toBe(1)
  })
})
