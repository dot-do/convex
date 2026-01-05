/**
 * TDD RED Phase Tests for Core Types
 *
 * Tests for: GenericId, Id, Doc, and DataModel types
 *
 * These tests are designed to FAIL initially because the implementation
 * functions (createId, parseId, isValidId, etc.) don't exist yet.
 */

import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  Id,
  GenericId,
  Doc,
  SystemFields,
  DataModel,
  SchemaDefinition,
  TableDefinition,
  WithoutSystemFields,
} from '../../src/types/index'

// ============================================================================
// Mock implementations that should be created (currently don't exist)
// These imports will cause the tests to fail
// ============================================================================

// Import functions that don't exist yet - this will cause failures
import {
  createId,
  parseId,
  isValidId,
  validateIdFormat,
  extractTableName,
  idsEqual,
  serializeId,
  deserializeId,
  createDoc,
  docFromRaw,
  extractDocFields,
  isSystemField,
  getTableDocument,
  validateDataModel,
} from '../../src/types/id-utils'

// ============================================================================
// GenericId<TableName> Tests
// ============================================================================

describe('GenericId<TableName>', () => {
  describe('ID creation with table name', () => {
    it('should create a valid ID for a given table name', () => {
      const id = createId<'users'>('users')
      expect(id).toBeDefined()
      expect(typeof id).toBe('string')
    })

    it('should create unique IDs on each call', () => {
      const id1 = createId<'users'>('users')
      const id2 = createId<'users'>('users')
      expect(id1).not.toBe(id2)
    })

    it('should create IDs with consistent length', () => {
      const id1 = createId<'users'>('users')
      const id2 = createId<'posts'>('posts')
      expect(id1.length).toBe(id2.length)
    })

    it('should handle table names with special characters', () => {
      const id = createId<'user_profiles'>('user_profiles')
      expect(id).toBeDefined()
    })

    it('should handle empty table name gracefully', () => {
      expect(() => createId<''>('')).toThrow()
    })
  })

  describe('ID string format validation (Convex ID format)', () => {
    it('should create IDs matching Convex ID format pattern', () => {
      const id = createId<'users'>('users')
      // Convex IDs are base64-like strings with specific structure
      const convexIdPattern = /^[a-zA-Z0-9_-]+$/
      expect(id).toMatch(convexIdPattern)
    })

    it('should validate correctly formatted IDs', () => {
      const id = createId<'users'>('users')
      expect(isValidId(id)).toBe(true)
    })

    it('should reject IDs with invalid characters', () => {
      expect(isValidId('invalid!id@here')).toBe(false)
    })

    it('should reject empty string as ID', () => {
      expect(isValidId('')).toBe(false)
    })

    it('should reject null as ID', () => {
      expect(isValidId(null as unknown as string)).toBe(false)
    })

    it('should reject undefined as ID', () => {
      expect(isValidId(undefined as unknown as string)).toBe(false)
    })

    it('should validate ID format strictly', () => {
      expect(validateIdFormat('valid123_ID-string')).toBe(true)
      expect(validateIdFormat('invalid id with spaces')).toBe(false)
      expect(validateIdFormat('invalid\nwith\nnewlines')).toBe(false)
    })

    it('should handle very long IDs appropriately', () => {
      const longId = 'a'.repeat(1000)
      expect(isValidId(longId)).toBe(false)
    })
  })

  describe('Type discrimination between table IDs', () => {
    it('should extract table name from ID', () => {
      const id = createId<'users'>('users')
      expect(extractTableName(id)).toBe('users')
    })

    it('should distinguish IDs from different tables', () => {
      const userId = createId<'users'>('users')
      const postId = createId<'posts'>('posts')

      expect(extractTableName(userId)).toBe('users')
      expect(extractTableName(postId)).toBe('posts')
      expect(extractTableName(userId)).not.toBe(extractTableName(postId))
    })

    it('should preserve table name through serialization', () => {
      const id = createId<'users'>('users')
      const serialized = serializeId(id)
      const deserialized = deserializeId<'users'>(serialized)
      expect(extractTableName(deserialized)).toBe('users')
    })
  })

  describe('ID equality and comparison', () => {
    it('should correctly identify equal IDs', () => {
      const id = createId<'users'>('users')
      expect(idsEqual(id, id)).toBe(true)
    })

    it('should correctly identify different IDs', () => {
      const id1 = createId<'users'>('users')
      const id2 = createId<'users'>('users')
      expect(idsEqual(id1, id2)).toBe(false)
    })

    it('should handle comparison with null', () => {
      const id = createId<'users'>('users')
      expect(idsEqual(id, null as unknown as GenericId<'users'>)).toBe(false)
    })

    it('should handle comparison with undefined', () => {
      const id = createId<'users'>('users')
      expect(idsEqual(id, undefined as unknown as GenericId<'users'>)).toBe(false)
    })

    it('should be case-sensitive', () => {
      // Assuming IDs are case-sensitive
      const idLower = 'abc123xyz' as GenericId<'users'>
      const idUpper = 'ABC123XYZ' as GenericId<'users'>
      expect(idsEqual(idLower, idUpper)).toBe(false)
    })
  })

  describe('Serialization/deserialization', () => {
    it('should serialize ID to string', () => {
      const id = createId<'users'>('users')
      const serialized = serializeId(id)
      expect(typeof serialized).toBe('string')
    })

    it('should deserialize string back to ID', () => {
      const id = createId<'users'>('users')
      const serialized = serializeId(id)
      const deserialized = deserializeId<'users'>(serialized)
      expect(idsEqual(id, deserialized)).toBe(true)
    })

    it('should preserve ID value through round-trip', () => {
      const id = createId<'users'>('users')
      const roundTripped = deserializeId<'users'>(serializeId(id))
      expect(roundTripped).toBe(id)
    })

    it('should throw on invalid serialized data', () => {
      expect(() => deserializeId<'users'>('not-valid-serialized-id')).toThrow()
    })

    it('should handle JSON serialization', () => {
      const id = createId<'users'>('users')
      const jsonString = JSON.stringify({ id })
      const parsed = JSON.parse(jsonString)
      expect(parsed.id).toBe(id)
    })
  })
})

// ============================================================================
// Id<TableName> Tests
// ============================================================================

describe('Id<TableName>', () => {
  describe('Table-specific ID constraints', () => {
    it('should create ID for specific table', () => {
      const userId: Id<'users'> = createId<'users'>('users')
      expect(userId).toBeDefined()
    })

    it('should have table name embedded in type', () => {
      const id = createId<'users'>('users')
      // Type-level test - at runtime we verify the table name extraction
      expect(extractTableName(id)).toBe('users')
    })

    it('should reject ID from wrong table at validation', () => {
      const postId = createId<'posts'>('posts')
      // Validation should fail when trying to use a posts ID where users ID is expected
      expect(validateIdFormat(postId, 'users')).toBe(false)
    })
  })

  describe('ID parsing from string', () => {
    it('should parse valid ID string', () => {
      const idString = createId<'users'>('users')
      const parsed = parseId<'users'>(idString, 'users')
      expect(parsed).toBeDefined()
      expect(parsed).toBe(idString)
    })

    it('should parse ID and preserve table type', () => {
      const id = createId<'users'>('users')
      const serialized = serializeId(id)
      const parsed = parseId<'users'>(serialized, 'users')
      expect(extractTableName(parsed)).toBe('users')
    })

    it('should handle parsing with type inference', () => {
      const rawIdString = 'some_valid_id_format_123'
      const parsed = parseId<'users'>(rawIdString, 'users')
      expect(parsed).toBeDefined()
    })

    it('should throw when parsing fails', () => {
      expect(() => parseId<'users'>('', 'users')).toThrow()
    })
  })

  describe('Invalid ID rejection', () => {
    it('should reject empty string', () => {
      expect(() => parseId<'users'>('', 'users')).toThrow('Invalid ID format')
    })

    it('should reject ID with whitespace only', () => {
      expect(() => parseId<'users'>('   ', 'users')).toThrow('Invalid ID format')
    })

    it('should reject ID with newlines', () => {
      expect(() => parseId<'users'>('id\nwith\nnewline', 'users')).toThrow()
    })

    it('should reject ID with special characters', () => {
      expect(() => parseId<'users'>('id@with#special!chars', 'users')).toThrow()
    })

    it('should reject non-string values', () => {
      expect(() => parseId<'users'>(123 as unknown as string, 'users')).toThrow()
      expect(() => parseId<'users'>({} as unknown as string, 'users')).toThrow()
      expect(() => parseId<'users'>([] as unknown as string, 'users')).toThrow()
    })

    it('should reject malformed Convex ID', () => {
      // IDs that don't match expected Convex format
      expect(() => parseId<'users'>('not-a-convex-id', 'users')).toThrow()
    })

    it('should provide helpful error messages', () => {
      try {
        parseId<'users'>('invalid', 'users')
      } catch (error) {
        expect((error as Error).message).toContain('Invalid')
      }
    })
  })
})

// ============================================================================
// Doc<TableName> Tests
// ============================================================================

describe('Doc<TableName>', () => {
  // Sample document types for testing
  interface UserDocument {
    name: string
    email: string
    age: number
  }

  interface PostDocument {
    title: string
    content: string
    authorId: Id<'users'>
    tags: string[]
  }

  interface NestedDocument {
    profile: {
      bio: string
      social: {
        twitter?: string
        github?: string
      }
    }
    settings: {
      notifications: boolean
      theme: 'light' | 'dark'
    }
  }

  describe('_id and _creationTime fields', () => {
    it('should include _id field in document', () => {
      const doc = createDoc<'users', UserDocument>('users', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      })
      expect(doc._id).toBeDefined()
      expect(typeof doc._id).toBe('string')
    })

    it('should include _creationTime field in document', () => {
      const doc = createDoc<'users', UserDocument>('users', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      })
      expect(doc._creationTime).toBeDefined()
      expect(typeof doc._creationTime).toBe('number')
    })

    it('should have _creationTime as Unix timestamp in milliseconds', () => {
      const before = Date.now()
      const doc = createDoc<'users', UserDocument>('users', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      })
      const after = Date.now()

      expect(doc._creationTime).toBeGreaterThanOrEqual(before)
      expect(doc._creationTime).toBeLessThanOrEqual(after)
    })

    it('should have unique _id for each document', () => {
      const doc1 = createDoc<'users', UserDocument>('users', {
        name: 'User 1',
        email: 'user1@example.com',
        age: 25,
      })
      const doc2 = createDoc<'users', UserDocument>('users', {
        name: 'User 2',
        email: 'user2@example.com',
        age: 30,
      })

      expect(doc1._id).not.toBe(doc2._id)
    })

    it('should correctly identify system fields', () => {
      expect(isSystemField('_id')).toBe(true)
      expect(isSystemField('_creationTime')).toBe(true)
      expect(isSystemField('name')).toBe(false)
      expect(isSystemField('email')).toBe(false)
    })
  })

  describe('Document field access', () => {
    it('should preserve all user-defined fields', () => {
      const doc = createDoc<'users', UserDocument>('users', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      })

      expect(doc.name).toBe('John Doe')
      expect(doc.email).toBe('john@example.com')
      expect(doc.age).toBe(30)
    })

    it('should handle string fields correctly', () => {
      const doc = createDoc<'posts', PostDocument>('posts', {
        title: 'My Post',
        content: 'This is the content',
        authorId: 'user123' as Id<'users'>,
        tags: ['tech', 'news'],
      })

      expect(doc.title).toBe('My Post')
      expect(doc.content).toBe('This is the content')
    })

    it('should handle array fields correctly', () => {
      const doc = createDoc<'posts', PostDocument>('posts', {
        title: 'Tagged Post',
        content: 'Content here',
        authorId: 'user123' as Id<'users'>,
        tags: ['javascript', 'typescript', 'testing'],
      })

      expect(doc.tags).toHaveLength(3)
      expect(doc.tags).toContain('javascript')
      expect(doc.tags).toContain('typescript')
      expect(doc.tags).toContain('testing')
    })

    it('should handle numeric fields correctly', () => {
      const doc = createDoc<'users', UserDocument>('users', {
        name: 'Test User',
        email: 'test@example.com',
        age: 42,
      })

      expect(doc.age).toBe(42)
      expect(typeof doc.age).toBe('number')
    })

    it('should handle ID references to other tables', () => {
      const userId = createId<'users'>('users')
      const doc = createDoc<'posts', PostDocument>('posts', {
        title: 'Post with Author',
        content: 'Content',
        authorId: userId,
        tags: [],
      })

      expect(doc.authorId).toBe(userId)
      expect(extractTableName(doc.authorId)).toBe('users')
    })

    it('should extract user fields without system fields', () => {
      const doc = createDoc<'users', UserDocument>('users', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      })

      const userFields = extractDocFields(doc)
      expect(userFields.name).toBe('John Doe')
      expect(userFields.email).toBe('john@example.com')
      expect(userFields.age).toBe(30)
      expect('_id' in userFields).toBe(false)
      expect('_creationTime' in userFields).toBe(false)
    })
  })

  describe('Nested document structures', () => {
    it('should handle nested objects', () => {
      const doc = createDoc<'profiles', NestedDocument>('profiles', {
        profile: {
          bio: 'A developer',
          social: {
            twitter: '@dev',
            github: 'dev',
          },
        },
        settings: {
          notifications: true,
          theme: 'dark',
        },
      })

      expect(doc.profile.bio).toBe('A developer')
      expect(doc.profile.social.twitter).toBe('@dev')
      expect(doc.profile.social.github).toBe('dev')
    })

    it('should handle optional nested fields', () => {
      const doc = createDoc<'profiles', NestedDocument>('profiles', {
        profile: {
          bio: 'Minimal profile',
          social: {},
        },
        settings: {
          notifications: false,
          theme: 'light',
        },
      })

      expect(doc.profile.social.twitter).toBeUndefined()
      expect(doc.profile.social.github).toBeUndefined()
    })

    it('should preserve nested structure through serialization', () => {
      const doc = createDoc<'profiles', NestedDocument>('profiles', {
        profile: {
          bio: 'Test bio',
          social: {
            twitter: '@test',
          },
        },
        settings: {
          notifications: true,
          theme: 'dark',
        },
      })

      const serialized = JSON.stringify(doc)
      const deserialized = JSON.parse(serialized)

      expect(deserialized.profile.bio).toBe('Test bio')
      expect(deserialized.profile.social.twitter).toBe('@test')
    })

    it('should handle deeply nested updates correctly', () => {
      const doc = createDoc<'profiles', NestedDocument>('profiles', {
        profile: {
          bio: 'Original bio',
          social: {
            github: 'original',
          },
        },
        settings: {
          notifications: true,
          theme: 'light',
        },
      })

      // Verify deep access works
      expect(doc.profile.social.github).toBe('original')
    })
  })

  describe('Document creation from raw data', () => {
    it('should create document from raw object', () => {
      const raw = {
        _id: 'test_id_123' as Id<'users'>,
        _creationTime: Date.now(),
        name: 'Raw User',
        email: 'raw@example.com',
        age: 25,
      }

      const doc = docFromRaw<'users', UserDocument>('users', raw)
      expect(doc._id).toBe(raw._id)
      expect(doc.name).toBe('Raw User')
    })

    it('should validate required system fields on raw data', () => {
      const invalidRaw = {
        name: 'Missing System Fields',
        email: 'missing@example.com',
        age: 30,
      }

      expect(() => docFromRaw<'users', UserDocument>('users', invalidRaw as any)).toThrow()
    })

    it('should handle optional fields in raw data', () => {
      interface UserWithOptional {
        name: string
        email?: string
        age?: number
      }

      const raw = {
        _id: 'test_id_456' as Id<'users'>,
        _creationTime: Date.now(),
        name: 'Minimal User',
      }

      const doc = docFromRaw<'users', UserWithOptional>('users', raw)
      expect(doc.name).toBe('Minimal User')
      expect(doc.email).toBeUndefined()
    })
  })
})

// ============================================================================
// DataModel Types Tests
// ============================================================================

describe('DataModel Types', () => {
  // Define test schema
  interface TestSchema extends SchemaDefinition {
    users: TableDefinition<{
      name: string
      email: string
      age: number
    }>
    posts: TableDefinition<{
      title: string
      content: string
      authorId: Id<'users'>
    }>
    comments: TableDefinition<{
      text: string
      postId: Id<'posts'>
      authorId: Id<'users'>
    }>
  }

  describe('GenericDataModel interface', () => {
    it('should define valid data model from schema', () => {
      type TestDataModel = DataModel<TestSchema>

      // Type-level tests - at runtime we verify structure
      const isValid = validateDataModel<TestSchema>({
        users: { document: {} as any, indexes: {}, searchIndexes: {}, vectorIndexes: {} },
        posts: { document: {} as any, indexes: {}, searchIndexes: {}, vectorIndexes: {} },
        comments: { document: {} as any, indexes: {}, searchIndexes: {}, vectorIndexes: {} },
      })

      expect(isValid).toBe(true)
    })

    it('should allow accessing table names', () => {
      const tableNames = ['users', 'posts', 'comments'] as const

      tableNames.forEach(tableName => {
        const tableDoc = getTableDocument<TestSchema>(tableName)
        expect(tableDoc).toBeDefined()
      })
    })

    it('should validate schema structure', () => {
      const invalidSchema = {
        users: null, // Invalid - should be TableDefinition
      }

      expect(validateDataModel(invalidSchema as any)).toBe(false)
    })
  })

  describe('Table definition mapping', () => {
    it('should map table name to correct document type', () => {
      const userDoc = getTableDocument<TestSchema>('users')
      expect(userDoc).toBeDefined()
    })

    it('should handle multiple tables in schema', () => {
      const usersDoc = getTableDocument<TestSchema>('users')
      const postsDoc = getTableDocument<TestSchema>('posts')
      const commentsDoc = getTableDocument<TestSchema>('comments')

      expect(usersDoc).toBeDefined()
      expect(postsDoc).toBeDefined()
      expect(commentsDoc).toBeDefined()
    })

    it('should reject invalid table names', () => {
      expect(() => {
        getTableDocument<TestSchema>('nonexistent' as any)
      }).toThrow('Table not found')
    })

    it('should support nested table references', () => {
      // Posts reference users, comments reference both
      const postsDoc = getTableDocument<TestSchema>('posts')
      const commentsDoc = getTableDocument<TestSchema>('comments')

      expect(postsDoc).toBeDefined()
      expect(commentsDoc).toBeDefined()
    })
  })

  describe('Document type extraction', () => {
    it('should extract document type from table definition', () => {
      type UserDoc = TestSchema['users']['document']

      // Runtime verification
      const mockUser: UserDoc = {
        name: 'Test User',
        email: 'test@example.com',
        age: 30,
      }

      expect(mockUser.name).toBe('Test User')
    })

    it('should preserve type safety across extraction', () => {
      type PostDoc = TestSchema['posts']['document']

      const mockPost: PostDoc = {
        title: 'Test Post',
        content: 'Content here',
        authorId: 'user_123' as Id<'users'>,
      }

      expect(mockPost.authorId).toBeDefined()
    })

    it('should handle WithoutSystemFields correctly', () => {
      interface FullDoc extends SystemFields {
        name: string
        email: string
      }

      type InsertDoc = WithoutSystemFields<FullDoc>

      const insertData: InsertDoc = {
        name: 'New User',
        email: 'new@example.com',
      }

      expect(insertData.name).toBe('New User')
      expect('_id' in insertData).toBe(false)
      expect('_creationTime' in insertData).toBe(false)
    })

    it('should extract index definitions', () => {
      interface SchemaWithIndexes extends SchemaDefinition {
        users: TableDefinition<{ name: string; email: string }> & {
          indexes: {
            by_email: { fields: ['email'] }
            by_name: { fields: ['name'] }
          }
        }
      }

      const schema: SchemaWithIndexes = {
        users: {
          document: {} as any,
          indexes: {
            by_email: { fields: ['email'] },
            by_name: { fields: ['name'] },
          },
          searchIndexes: {},
          vectorIndexes: {},
        },
      }

      expect(schema.users.indexes.by_email.fields).toContain('email')
      expect(schema.users.indexes.by_name.fields).toContain('name')
    })
  })

  describe('Type compatibility', () => {
    it('should allow assigning compatible document types', () => {
      type UserDoc = TestSchema['users']['document']

      const user: UserDoc = {
        name: 'Compatible User',
        email: 'compatible@example.com',
        age: 25,
      }

      expect(user).toBeDefined()
    })

    it('should work with generic functions', () => {
      function getDocument<T extends keyof TestSchema>(
        _tableName: T
      ): TestSchema[T]['document'] {
        return {} as TestSchema[T]['document']
      }

      const userDoc = getDocument('users')
      const postDoc = getDocument('posts')

      expect(userDoc).toBeDefined()
      expect(postDoc).toBeDefined()
    })

    it('should support extending base schema', () => {
      interface ExtendedSchema extends TestSchema {
        products: TableDefinition<{
          name: string
          price: number
        }>
      }

      const productDoc: ExtendedSchema['products']['document'] = {
        name: 'Product',
        price: 99.99,
      }

      expect(productDoc.name).toBe('Product')
      expect(productDoc.price).toBe(99.99)
    })
  })
})

// ============================================================================
// Type-Level Tests (Compile-Time Verification)
// ============================================================================

describe('Type-Level Tests', () => {
  it('should have correct Id type structure', () => {
    type UserId = Id<'users'>
    type PostId = Id<'posts'>

    // These are type-level assertions
    const userId = 'test' as UserId
    const postId = 'test' as PostId

    // Runtime check that types are strings
    expect(typeof userId).toBe('string')
    expect(typeof postId).toBe('string')
  })

  it('should have correct GenericId type structure', () => {
    type AnyId = GenericId<string>

    const anyId = 'test' as AnyId
    expect(typeof anyId).toBe('string')
  })

  it('should have correct Doc type structure', () => {
    interface TestFields {
      field1: string
      field2: number
    }

    type TestDoc = Doc<'test', TestFields>

    // Verify Doc includes system fields
    const doc = {
      _id: 'id' as Id<'test'>,
      _creationTime: Date.now(),
      field1: 'value',
      field2: 42,
      __tableName: 'test' as const,
    } as TestDoc

    expect(doc._id).toBeDefined()
    expect(doc._creationTime).toBeDefined()
    expect(doc.field1).toBe('value')
    expect(doc.field2).toBe(42)
  })

  it('should correctly type SystemFields', () => {
    const sysFields: SystemFields = {
      _id: 'test' as Id<string>,
      _creationTime: Date.now(),
    }

    expect(sysFields._id).toBeDefined()
    expect(typeof sysFields._creationTime).toBe('number')
  })
})

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases and Error Handling', () => {
  describe('ID edge cases', () => {
    it('should handle maximum length table names', () => {
      const longTableName = 'a'.repeat(100)
      const id = createId(longTableName)
      expect(id).toBeDefined()
    })

    it('should handle unicode in table names', () => {
      expect(() => createId('table_with_unicode_\u00e9')).not.toThrow()
    })

    it('should handle numeric-like table names', () => {
      const id = createId('123table')
      expect(id).toBeDefined()
    })
  })

  describe('Document edge cases', () => {
    it('should handle documents with no user fields', () => {
      interface EmptyDoc {}

      const doc = createDoc<'empty', EmptyDoc>('empty', {})
      expect(doc._id).toBeDefined()
      expect(doc._creationTime).toBeDefined()
    })

    it('should handle documents with nullable fields', () => {
      interface NullableDoc {
        name: string | null
        data: Record<string, unknown> | null
      }

      const doc = createDoc<'nullable', NullableDoc>('nullable', {
        name: null,
        data: null,
      })

      expect(doc.name).toBeNull()
      expect(doc.data).toBeNull()
    })

    it('should handle documents with array of objects', () => {
      interface ArrayDoc {
        items: Array<{ id: number; value: string }>
      }

      const doc = createDoc<'array', ArrayDoc>('array', {
        items: [
          { id: 1, value: 'first' },
          { id: 2, value: 'second' },
        ],
      })

      expect(doc.items).toHaveLength(2)
      expect(doc.items[0]?.id).toBe(1)
    })

    it('should handle circular reference detection', () => {
      interface CircularDoc {
        self?: CircularDoc
        name: string
      }

      // This should work without infinite recursion
      const doc = createDoc<'circular', CircularDoc>('circular', {
        name: 'root',
      })

      expect(doc.name).toBe('root')
    })
  })

  describe('DataModel edge cases', () => {
    it('should handle empty schema', () => {
      interface EmptySchema extends SchemaDefinition {}

      expect(validateDataModel<EmptySchema>({})).toBe(true)
    })

    it('should handle schema with many tables', () => {
      // Dynamically generate a large schema
      const tableCount = 50
      const largeSchema: Record<string, TableDefinition> = {}

      for (let i = 0; i < tableCount; i++) {
        largeSchema[`table_${i}`] = {
          document: { field: 'value' },
          indexes: {},
          searchIndexes: {},
          vectorIndexes: {},
        }
      }

      expect(validateDataModel(largeSchema as SchemaDefinition)).toBe(true)
    })
  })
})
