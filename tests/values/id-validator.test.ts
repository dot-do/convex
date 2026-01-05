/**
 * TDD RED Phase Tests for v.id() - ID Validator
 *
 * These tests define the expected behavior for the ID validator.
 * They are designed to FAIL until the implementation is complete.
 */

import { describe, it, expect, expectTypeOf } from 'vitest'
import { v, Infer, Validator } from '../../src/values/index.js'
import { Id } from '../../src/types/index.js'

// ============================================================================
// Test Helpers - Convex ID Format
// ============================================================================

/**
 * Convex IDs have a specific format:
 * - They are base64url encoded strings
 * - They contain table information and a unique identifier
 * - Format: typically looks like "j571bq2p8d8v0h3k5g1q7z9y3t6j5n8f"
 */

// Valid Convex ID examples (mock format for testing)
const VALID_CONVEX_IDS = {
  users: 'j571bq2p8d8v0h3k5g1q7z9y3t6j5n8f' as Id<'users'>,
  posts: 'k682cs3q9e9w1i4l6h2r8a0z4u7k6o9g' as Id<'posts'>,
  comments: 'm793dt4r0f0x2j5m7i3s9b1a5v8l7p0h' as Id<'comments'>,
  messages: 'n804eu5s1g1y3k6n8j4t0c2b6w9m8q1i' as Id<'messages'>,
}

// Invalid ID formats
const INVALID_IDS = {
  empty: '',
  tooShort: 'abc123',
  withSpaces: 'j571bq2p 8d8v0h3k',
  withSpecialChars: 'j571bq2p!@#$%^&*()',
  withNewlines: 'j571bq2p\n8d8v0h3k',
  sqlInjection: "j571bq2p'; DROP TABLE users;--",
  nullByte: 'j571bq2p\x00test',
  unicode: 'j571bq2p8d8v\u0000\u0001',
  onlyNumbers: '123456789012345678901234567890',
  onlySpecial: '!@#$%^&*()_+{}[]|\\:";\'<>?,./`~',
}

// ============================================================================
// 1. v.id() Basic Functionality
// ============================================================================

describe('v.id() Basic Functionality', () => {
  describe('ID validator creation', () => {
    it('should create an ID validator with a table name', () => {
      const userIdValidator = v.id('users')
      expect(userIdValidator).toBeDefined()
      expect(userIdValidator).toHaveProperty('parse')
      expect(userIdValidator).toHaveProperty('isValid')
    })

    it('should store the table name internally', () => {
      const userIdValidator = v.id('users')
      // The validator should expose or use the table name for validation
      expect(userIdValidator.describe()).toBe('v.id("users")')
    })

    it('should be a Validator instance', () => {
      const userIdValidator = v.id('users')
      expect(userIdValidator).toHaveProperty('isOptional', false)
      expect(userIdValidator).toHaveProperty('optional')
      expect(typeof userIdValidator.optional).toBe('function')
    })
  })

  describe('Valid Convex ID format acceptance', () => {
    it('should accept a valid Convex ID string', () => {
      const userIdValidator = v.id('users')
      const validId = VALID_CONVEX_IDS.users

      expect(() => userIdValidator.parse(validId)).not.toThrow()
      expect(userIdValidator.isValid(validId)).toBe(true)
    })

    it('should return the ID unchanged when valid', () => {
      const userIdValidator = v.id('users')
      const validId = VALID_CONVEX_IDS.users

      const result = userIdValidator.parse(validId)
      expect(result).toBe(validId)
    })

    it('should accept IDs with valid base64url characters', () => {
      const validator = v.id('test')
      // Valid base64url characters: A-Z, a-z, 0-9, -, _
      const validBase64UrlId = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg'
      expect(validator.isValid(validBase64UrlId)).toBe(true)
    })
  })

  describe('Invalid ID format rejection', () => {
    it('should reject an empty string', () => {
      const userIdValidator = v.id('users')
      expect(() => userIdValidator.parse(INVALID_IDS.empty)).toThrow()
      expect(userIdValidator.isValid(INVALID_IDS.empty)).toBe(false)
    })

    it('should reject IDs that are too short', () => {
      const userIdValidator = v.id('users')
      expect(() => userIdValidator.parse(INVALID_IDS.tooShort)).toThrow()
      expect(userIdValidator.isValid(INVALID_IDS.tooShort)).toBe(false)
    })

    it('should reject IDs with spaces', () => {
      const userIdValidator = v.id('users')
      expect(() => userIdValidator.parse(INVALID_IDS.withSpaces)).toThrow()
      expect(userIdValidator.isValid(INVALID_IDS.withSpaces)).toBe(false)
    })

    it('should reject IDs with special characters', () => {
      const userIdValidator = v.id('users')
      expect(() => userIdValidator.parse(INVALID_IDS.withSpecialChars)).toThrow()
      expect(userIdValidator.isValid(INVALID_IDS.withSpecialChars)).toBe(false)
    })

    it('should reject null', () => {
      const userIdValidator = v.id('users')
      expect(() => userIdValidator.parse(null)).toThrow()
      expect(userIdValidator.isValid(null)).toBe(false)
    })

    it('should reject undefined', () => {
      const userIdValidator = v.id('users')
      expect(() => userIdValidator.parse(undefined)).toThrow()
      expect(userIdValidator.isValid(undefined)).toBe(false)
    })

    it('should reject numbers', () => {
      const userIdValidator = v.id('users')
      expect(() => userIdValidator.parse(12345)).toThrow()
      expect(userIdValidator.isValid(12345)).toBe(false)
    })

    it('should reject objects', () => {
      const userIdValidator = v.id('users')
      expect(() => userIdValidator.parse({ id: 'test' })).toThrow()
      expect(userIdValidator.isValid({ id: 'test' })).toBe(false)
    })

    it('should reject arrays', () => {
      const userIdValidator = v.id('users')
      expect(() => userIdValidator.parse(['test'])).toThrow()
      expect(userIdValidator.isValid(['test'])).toBe(false)
    })

    it('should reject booleans', () => {
      const userIdValidator = v.id('users')
      expect(() => userIdValidator.parse(true)).toThrow()
      expect(userIdValidator.isValid(true)).toBe(false)
    })
  })

  describe('Error messages', () => {
    it('should include the table name in error messages', () => {
      const userIdValidator = v.id('users')
      try {
        userIdValidator.parse('invalid')
        expect.fail('Should have thrown')
      } catch (error) {
        expect((error as Error).message).toContain('users')
      }
    })

    it('should describe the expected format in error messages', () => {
      const userIdValidator = v.id('users')
      try {
        userIdValidator.parse('')
        expect.fail('Should have thrown')
      } catch (error) {
        expect((error as Error).message).toMatch(/id|ID|identifier/i)
      }
    })
  })
})

// ============================================================================
// 2. Table Name Type Safety
// ============================================================================

describe('Table Name Type Safety', () => {
  describe('Type parameter preservation', () => {
    it('should preserve table name as literal type', () => {
      const userIdValidator = v.id('users')
      type UserIdType = Infer<typeof userIdValidator>

      // The type should be Id<'users'>, not Id<string>
      expectTypeOf<UserIdType>().toMatchTypeOf<Id<'users'>>()
    })

    it('should differentiate between different table IDs', () => {
      const userIdValidator = v.id('users')
      const postIdValidator = v.id('posts')

      type UserIdType = Infer<typeof userIdValidator>
      type PostIdType = Infer<typeof postIdValidator>

      // These should be different types
      expectTypeOf<UserIdType>().not.toMatchTypeOf<PostIdType>()
      expectTypeOf<PostIdType>().not.toMatchTypeOf<UserIdType>()
    })

    it('should be assignable to Id<TableName>', () => {
      const userIdValidator = v.id('users')
      type UserIdType = Infer<typeof userIdValidator>

      // Should be assignable to the branded Id type
      const assertAssignable = (id: Id<'users'>): void => { void id }
      const testId: UserIdType = VALID_CONVEX_IDS.users
      assertAssignable(testId)
    })
  })

  describe('Validator type inference', () => {
    it('should have correct Validator type with Id generic', () => {
      const userIdValidator = v.id('users')

      // The validator itself should have the correct type
      expectTypeOf(userIdValidator).toMatchTypeOf<Validator<Id<'users'>>>()
    })

    it('should work with generic table names', () => {
      function createIdValidator<T extends string>(tableName: T) {
        return v.id(tableName)
      }

      const dynamicValidator = createIdValidator('dynamic_table')
      type DynamicIdType = Infer<typeof dynamicValidator>

      expectTypeOf<DynamicIdType>().toMatchTypeOf<Id<'dynamic_table'>>()
    })
  })

  describe('Compile-time type checking', () => {
    it('should prevent assigning wrong table IDs at compile time', () => {
      const userIdValidator = v.id('users')
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const postIdValidator = v.id('posts')

      // This test verifies that the type system prevents incorrect assignments
      // The actual compile-time check happens when building
      type UserIdType = Infer<typeof userIdValidator>
      const userId: UserIdType = userIdValidator.parse(VALID_CONVEX_IDS.users)

      // TypeScript should prevent this at compile time (if types are correct):
      // const wrongAssignment: Id<'posts'> = userId  // Should error

      expect(userId).toBeDefined()
    })
  })
})

// ============================================================================
// 3. ID Format Validation
// ============================================================================

describe('ID Format Validation', () => {
  describe('Valid Convex ID patterns', () => {
    it('should accept standard length Convex IDs (32 characters)', () => {
      const validator = v.id('test')
      const validId = 'j571bq2p8d8v0h3k5g1q7z9y3t6j5n8f'

      expect(validator.isValid(validId)).toBe(true)
    })

    it('should accept IDs with lowercase letters', () => {
      const validator = v.id('test')
      const validId = 'abcdefghijklmnopqrstuvwxyzabcdef'

      expect(validator.isValid(validId)).toBe(true)
    })

    it('should accept IDs with numbers', () => {
      const validator = v.id('test')
      const validId = '01234567890123456789012345678901'

      expect(validator.isValid(validId)).toBe(true)
    })

    it('should accept IDs with mixed alphanumeric characters', () => {
      const validator = v.id('test')
      const validId = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'

      expect(validator.isValid(validId)).toBe(true)
    })
  })

  describe('ID length validation', () => {
    it('should reject IDs shorter than minimum length', () => {
      const validator = v.id('test')

      // Convex IDs have a minimum length requirement
      expect(validator.isValid('short')).toBe(false)
      expect(validator.isValid('a')).toBe(false)
      expect(validator.isValid('ab')).toBe(false)
    })

    it('should reject IDs longer than maximum length', () => {
      const validator = v.id('test')

      // Test with an excessively long ID
      const tooLongId = 'a'.repeat(1000)
      expect(validator.isValid(tooLongId)).toBe(false)
    })

    it('should accept IDs of exact valid length', () => {
      const validator = v.id('test')

      // Standard Convex ID length is 32 characters
      const exactLengthId = 'a'.repeat(32)
      expect(validator.isValid(exactLengthId)).toBe(true)
    })
  })

  describe('Character set validation', () => {
    it('should reject IDs containing whitespace', () => {
      const validator = v.id('test')

      expect(validator.isValid('test id with spaces')).toBe(false)
      expect(validator.isValid('testid\twith\ttabs')).toBe(false)
      expect(validator.isValid('testid\nwith\nnewlines')).toBe(false)
    })

    it('should reject IDs with invalid special characters', () => {
      const validator = v.id('test')

      expect(validator.isValid('test!id')).toBe(false)
      expect(validator.isValid('test@id')).toBe(false)
      expect(validator.isValid('test#id')).toBe(false)
      expect(validator.isValid('test$id')).toBe(false)
      expect(validator.isValid('test%id')).toBe(false)
    })

    it('should reject IDs with null bytes', () => {
      const validator = v.id('test')

      expect(validator.isValid('test\x00id')).toBe(false)
      expect(validator.isValid(INVALID_IDS.nullByte)).toBe(false)
    })

    it('should reject IDs with unicode characters', () => {
      const validator = v.id('test')

      expect(validator.isValid('test\u0000id')).toBe(false)
      expect(validator.isValid('test\u00e9id')).toBe(false) // accented e
      expect(validator.isValid('testid\u{1F600}')).toBe(false) // emoji
    })

    it('should only allow alphanumeric characters in base64url format', () => {
      const validator = v.id('test')

      // Base64url allows: A-Z, a-z, 0-9, hyphen (-), underscore (_)
      // But Convex IDs typically only use alphanumeric
      const validChars = 'abcdefghijklmnopqrstuvwxyz0123456'
      expect(validator.isValid(validChars)).toBe(true)
    })
  })

  describe('Edge case IDs', () => {
    it('should reject SQL injection attempts', () => {
      const validator = v.id('test')

      expect(validator.isValid(INVALID_IDS.sqlInjection)).toBe(false)
      expect(validator.isValid("' OR '1'='1")).toBe(false)
      expect(validator.isValid('"; DROP TABLE users;--')).toBe(false)
    })

    it('should reject XSS attempts', () => {
      const validator = v.id('test')

      expect(validator.isValid('<script>alert("xss")</script>')).toBe(false)
      expect(validator.isValid('javascript:alert(1)')).toBe(false)
    })

    it('should reject path traversal attempts', () => {
      const validator = v.id('test')

      expect(validator.isValid('../../../etc/passwd')).toBe(false)
      expect(validator.isValid('..\\..\\..\\windows\\system32')).toBe(false)
    })

    it('should handle IDs at boundary lengths', () => {
      const validator = v.id('test')

      // Minimum valid length boundary
      const minBoundary = 'a'.repeat(31) // Just under min
      const atMin = 'a'.repeat(32) // At min
      const overMin = 'a'.repeat(33) // Just over min

      expect(validator.isValid(minBoundary)).toBe(false)
      expect(validator.isValid(atMin)).toBe(true)
      expect(validator.isValid(overMin)).toBe(true)
    })

    it('should reject IDs that are just numbers', () => {
      const validator = v.id('test')

      // Pure numeric IDs that look like database auto-increment IDs
      // These may be valid in some contexts but not standard Convex format
      expect(validator.isValid(INVALID_IDS.onlyNumbers)).toBe(false)
    })
  })
})

// ============================================================================
// 4. Integration with DataModel
// ============================================================================

describe('Integration with DataModel', () => {
  describe('v.id() with defined table names', () => {
    it('should work with common table name patterns', () => {
      // Standard naming conventions
      const usersValidator = v.id('users')
      const postsValidator = v.id('posts')
      const commentsValidator = v.id('comments')

      expect(usersValidator.describe()).toBe('v.id("users")')
      expect(postsValidator.describe()).toBe('v.id("posts")')
      expect(commentsValidator.describe()).toBe('v.id("comments")')
    })

    it('should work with snake_case table names', () => {
      const validator = v.id('user_profiles')
      expect(validator.describe()).toBe('v.id("user_profiles")')
    })

    it('should work with camelCase table names', () => {
      const validator = v.id('userProfiles')
      expect(validator.describe()).toBe('v.id("userProfiles")')
    })

    it('should work with PascalCase table names', () => {
      const validator = v.id('UserProfiles')
      expect(validator.describe()).toBe('v.id("UserProfiles")')
    })
  })

  describe('ID validator in object schemas', () => {
    it('should work as a field in v.object()', () => {
      const userSchema = v.object({
        userId: v.id('users'),
        name: v.string(),
      })

      const validUser = {
        userId: VALID_CONVEX_IDS.users,
        name: 'John Doe',
      }

      expect(() => userSchema.parse(validUser)).not.toThrow()
    })

    it('should validate ID fields correctly in objects', () => {
      const userSchema = v.object({
        userId: v.id('users'),
        name: v.string(),
      })

      const invalidUser = {
        userId: 'invalid-id',
        name: 'John Doe',
      }

      expect(() => userSchema.parse(invalidUser)).toThrow()
    })

    it('should work as optional ID field', () => {
      const commentSchema = v.object({
        content: v.string(),
        parentId: v.id('comments').optional(),
      })

      const commentWithParent = {
        content: 'Reply',
        parentId: VALID_CONVEX_IDS.comments,
      }

      const commentWithoutParent = {
        content: 'Top-level comment',
      }

      expect(() => commentSchema.parse(commentWithParent)).not.toThrow()
      expect(() => commentSchema.parse(commentWithoutParent)).not.toThrow()
    })

    it('should preserve ID types in nested objects', () => {
      const nestedSchema = v.object({
        user: v.object({
          id: v.id('users'),
          profile: v.object({
            avatarId: v.id('files').optional(),
          }),
        }),
      })

      type NestedType = Infer<typeof nestedSchema>

      expectTypeOf<NestedType['user']['id']>().toMatchTypeOf<Id<'users'>>()
    })
  })

  describe('ID references between tables', () => {
    it('should support foreign key references', () => {
      const postSchema = v.object({
        title: v.string(),
        authorId: v.id('users'),
        categoryId: v.id('categories'),
      })

      const validPost = {
        title: 'My Post',
        authorId: VALID_CONVEX_IDS.users,
        categoryId: 'k682cs3q9e9w1i4l6h2r8a0z4u7k6o9g' as Id<'categories'>,
      }

      expect(() => postSchema.parse(validPost)).not.toThrow()
    })

    it('should support self-referential IDs', () => {
      const commentSchema = v.object({
        content: v.string(),
        authorId: v.id('users'),
        parentCommentId: v.id('comments').optional(),
      })

      const replyComment = {
        content: 'This is a reply',
        authorId: VALID_CONVEX_IDS.users,
        parentCommentId: VALID_CONVEX_IDS.comments,
      }

      expect(() => commentSchema.parse(replyComment)).not.toThrow()
    })

    it('should work in arrays of IDs', () => {
      const groupSchema = v.object({
        name: v.string(),
        memberIds: v.array(v.id('users')),
      })

      const validGroup = {
        name: 'Admin Group',
        memberIds: [
          VALID_CONVEX_IDS.users,
          'k682cs3q9e9w1i4l6h2r8a0z4u7k6o9g' as Id<'users'>,
        ],
      }

      expect(() => groupSchema.parse(validGroup)).not.toThrow()

      type GroupType = Infer<typeof groupSchema>
      expectTypeOf<GroupType['memberIds']>().toMatchTypeOf<Id<'users'>[]>()
    })

    it('should work in union types with other validators', () => {
      const referenceSchema = v.union(
        v.id('users'),
        v.id('teams'),
        v.literal('system')
      )

      expect(() => referenceSchema.parse(VALID_CONVEX_IDS.users)).not.toThrow()
      expect(() => referenceSchema.parse('system')).not.toThrow()
    })
  })

  describe('Type inference with DataModel', () => {
    it('should infer correct types for document with _id field', () => {
      // Simulate a document type with _id
      const documentValidator = v.object({
        _id: v.id('users'),
        _creationTime: v.number(),
        name: v.string(),
        email: v.string(),
      })

      type UserDocument = Infer<typeof documentValidator>

      expectTypeOf<UserDocument['_id']>().toMatchTypeOf<Id<'users'>>()
      expectTypeOf<UserDocument['_creationTime']>().toMatchTypeOf<number>()
    })

    it('should work with record types containing IDs', () => {
      const userRolesSchema = v.record(
        v.string(),
        v.id('roles')
      )

      type UserRolesType = Infer<typeof userRolesSchema>

      expectTypeOf<UserRolesType>().toMatchTypeOf<Record<string, Id<'roles'>>>()
    })
  })
})

// ============================================================================
// 5. Optional and Nullable ID Validators
// ============================================================================

describe('Optional and Nullable ID Validators', () => {
  describe('Optional IDs', () => {
    it('should create optional ID validator', () => {
      const optionalIdValidator = v.id('users').optional()

      expect(optionalIdValidator.isOptional).toBe(true)
    })

    it('should accept undefined for optional ID', () => {
      const optionalIdValidator = v.id('users').optional()

      expect(() => optionalIdValidator.parse(undefined)).not.toThrow()
      expect(optionalIdValidator.isValid(undefined)).toBe(true)
    })

    it('should accept valid ID for optional ID', () => {
      const optionalIdValidator = v.id('users').optional()

      expect(() => optionalIdValidator.parse(VALID_CONVEX_IDS.users)).not.toThrow()
      expect(optionalIdValidator.isValid(VALID_CONVEX_IDS.users)).toBe(true)
    })

    it('should reject invalid ID for optional ID', () => {
      const optionalIdValidator = v.id('users').optional()

      expect(() => optionalIdValidator.parse('invalid')).toThrow()
      expect(optionalIdValidator.isValid('invalid')).toBe(false)
    })

    it('should have correct type for optional ID', () => {
      const optionalIdValidator = v.id('users').optional()

      type OptionalUserId = Infer<typeof optionalIdValidator>

      expectTypeOf<OptionalUserId>().toMatchTypeOf<Id<'users'> | undefined>()
    })
  })

  describe('Nullable IDs with union', () => {
    it('should work in union with null', () => {
      const nullableIdValidator = v.union(v.id('users'), v.null())

      expect(() => nullableIdValidator.parse(null)).not.toThrow()
      expect(() => nullableIdValidator.parse(VALID_CONVEX_IDS.users)).not.toThrow()
    })

    it('should have correct type for nullable ID', () => {
      const nullableIdValidator = v.union(v.id('users'), v.null())

      type NullableUserId = Infer<typeof nullableIdValidator>

      expectTypeOf<NullableUserId>().toMatchTypeOf<Id<'users'> | null>()
    })
  })
})

// ============================================================================
// 6. describe() Method
// ============================================================================

describe('describe() Method', () => {
  it('should return Convex-compatible format', () => {
    const validator = v.id('users')
    expect(validator.describe()).toBe('v.id("users")')
  })

  it('should include table name in description', () => {
    const validator = v.id('my_custom_table')
    expect(validator.describe()).toBe('v.id("my_custom_table")')
  })

  it('should match Convex SDK format exactly', () => {
    // Convex SDK uses the format: v.id("tableName")
    const validator = v.id('users')
    const description = validator.describe()

    expect(description).toMatch(/^v\.id\(".*"\)$/)
    expect(description).toBe('v.id("users")')
  })
})

// ============================================================================
// 7. Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases and Error Handling', () => {
  describe('Table name edge cases', () => {
    it('should handle empty table name', () => {
      // Empty table name should probably throw at creation time
      expect(() => v.id('')).toThrow()
    })

    it('should handle very long table names', () => {
      const longTableName = 'a'.repeat(256)
      const validator = v.id(longTableName)
      expect(validator).toBeDefined()
    })

    it('should handle table names with special characters', () => {
      // Table names in Convex are typically alphanumeric with underscores
      const validator = v.id('user_profiles_v2')
      expect(validator.describe()).toBe('v.id("user_profiles_v2")')
    })
  })

  describe('Concurrent validation', () => {
    it('should be safe for concurrent validation calls', async () => {
      const validator = v.id('users')

      const validations = Array.from({ length: 100 }, () =>
        Promise.resolve(validator.isValid(VALID_CONVEX_IDS.users))
      )

      const results = await Promise.all(validations)
      expect(results.every(r => r === true)).toBe(true)
    })
  })

  describe('Memory safety', () => {
    it('should not leak memory with many validator creations', () => {
      // Create many validators to ensure no memory issues
      const validators = Array.from({ length: 1000 }, (_, i) =>
        v.id(`table_${i}`)
      )

      expect(validators.length).toBe(1000)
      expect(validators[0].describe()).toBe('v.id("table_0")')
      expect(validators[999].describe()).toBe('v.id("table_999")')
    })
  })

  describe('Immutability', () => {
    it('should return a new validator for optional()', () => {
      const original = v.id('users')
      const optional = original.optional()

      expect(original).not.toBe(optional)
      expect(original.isOptional).toBe(false)
      expect(optional.isOptional).toBe(true)
    })
  })
})
