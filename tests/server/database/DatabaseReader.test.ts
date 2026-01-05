/**
 * TDD RED Phase Tests for DatabaseReader Interface
 *
 * Layer 4: Server-side database read operations
 *
 * Tests define the expected interface and behavior for DatabaseReader:
 * - get(id): Get a document by ID
 * - query(table): Start a query builder for a table
 * - normalizeId(table, id): Normalize an ID to canonical form
 *
 * Query builder should support:
 * - .filter() for filtering documents
 * - .order() for ordering results
 * - .first() to get first result
 * - .collect() to get all results
 * - .take(n) to get first n results
 * - .withIndex(indexName, range) for index queries
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseReader, InMemoryStorage } from '../../../src/server/database/DatabaseReader'
import type { Id } from '../../../src/types'

// ============================================================================
// Test Suite: DatabaseReader Interface
// ============================================================================

describe('DatabaseReader', () => {
  let storage: InMemoryStorage
  let db: DatabaseReader

  beforeEach(() => {
    storage = new InMemoryStorage()
    db = new DatabaseReader(storage)
  })

  // ==========================================================================
  // 1. Basic get() Operations
  // ==========================================================================

  describe('get() - retrieve document by ID', () => {
    it('should get a document by ID', async () => {
      // Setup test document
      const userId = 'users_abc123' as Id<'users'>
      const user = {
        _id: userId,
        _creationTime: Date.now(),
        name: 'Alice',
        email: 'alice@example.com',
      }
      storage.addDocument(userId, user)

      // Get document
      const result = await db.get(userId)

      expect(result).toEqual(user)
    })

    it('should return null for non-existent document', async () => {
      const result = await db.get('users_nonexistent' as Id<'users'>)

      expect(result).toBeNull()
    })

    it('should preserve all document fields', async () => {
      const postId = 'posts_xyz789' as Id<'posts'>
      const post = {
        _id: postId,
        _creationTime: Date.now(),
        title: 'Test Post',
        content: 'This is a test post',
        authorId: 'users_abc123',
        tags: ['test', 'example'],
        metadata: { views: 42, likes: 7 },
        published: true,
      }
      storage.addDocument(postId, post)

      const result = await db.get(postId)

      expect(result).toEqual(post)
      expect(result?.tags).toEqual(['test', 'example'])
      expect(result?.metadata).toEqual({ views: 42, likes: 7 })
    })

    it('should handle documents with optional fields', async () => {
      const userId = 'users_opt123' as Id<'users'>
      const user = {
        _id: userId,
        _creationTime: Date.now(),
        name: 'Bob',
        email: 'bob@example.com',
        bio: undefined, // optional field
      }
      storage.addDocument(userId, user)

      const result = await db.get(userId)

      expect(result).toBeDefined()
      expect(result?._id).toBe(userId)
      expect(result?.name).toBe('Bob')
    })

    it('should type-check ID parameter correctly', async () => {
      const userId = 'users_type123' as Id<'users'>
      storage.addDocument(userId, {
        _id: userId,
        _creationTime: Date.now(),
        name: 'Charlie',
      })

      // TypeScript should enforce Id<'users'> type
      const result = await db.get<'users'>(userId)

      expect(result).toBeDefined()
      expect(result?._id).toBe(userId)
    })
  })

  // ==========================================================================
  // 2. Basic query() Operations
  // ==========================================================================

  describe('query() - create query builder', () => {
    it('should create a query builder for a table', () => {
      const query = db.query('users')

      expect(query).toBeDefined()
      expect(query).toHaveProperty('filter')
      expect(query).toHaveProperty('order')
      expect(query).toHaveProperty('collect')
      expect(query).toHaveProperty('first')
      expect(query).toHaveProperty('take')
      expect(query).toHaveProperty('withIndex')
    })

    it('should collect all documents from a table', async () => {
      // Setup test documents
      const user1 = {
        _id: 'users_1' as Id<'users'>,
        _creationTime: 1000,
        name: 'Alice',
      }
      const user2 = {
        _id: 'users_2' as Id<'users'>,
        _creationTime: 2000,
        name: 'Bob',
      }
      storage.addDocument('users_1', user1)
      storage.addDocument('users_2', user2)

      const results = await db.query('users').collect()

      expect(results).toHaveLength(2)
      expect(results).toContainEqual(user1)
      expect(results).toContainEqual(user2)
    })

    it('should return empty array for table with no documents', async () => {
      const results = await db.query('empty_table').collect()

      expect(results).toEqual([])
    })

    it('should return documents with correct type', async () => {
      const user = {
        _id: 'users_type' as Id<'users'>,
        _creationTime: Date.now(),
        name: 'TypeCheck',
        email: 'type@example.com',
      }
      storage.addDocument('users_type', user)

      const results = await db.query<'users'>('users').collect()

      expect(results).toHaveLength(1)
      expect(results[0]._id).toBe('users_type')
      expect(results[0].name).toBe('TypeCheck')
    })
  })

  // ==========================================================================
  // 3. Query Builder - filter() Operations
  // ==========================================================================

  describe('query().filter() - filter documents', () => {
    beforeEach(() => {
      // Setup test documents for filtering
      storage.addDocument('users_1', {
        _id: 'users_1' as Id<'users'>,
        _creationTime: 1000,
        name: 'Alice',
        age: 30,
        active: true,
      })
      storage.addDocument('users_2', {
        _id: 'users_2' as Id<'users'>,
        _creationTime: 2000,
        name: 'Bob',
        age: 25,
        active: true,
      })
      storage.addDocument('users_3', {
        _id: 'users_3' as Id<'users'>,
        _creationTime: 3000,
        name: 'Charlie',
        age: 35,
        active: false,
      })
    })

    it('should filter documents by equality', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.eq('name', 'Alice'))
        .collect()

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Alice')
    })

    it('should filter documents by greater than', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.gt('age', 25))
        .collect()

      expect(results).toHaveLength(2)
      expect(results.every((r) => (r.age as number) > 25)).toBe(true)
    })

    it('should filter documents by less than', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.lt('age', 30))
        .collect()

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Bob')
    })

    it('should filter documents by greater than or equal', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.gte('age', 30))
        .collect()

      expect(results).toHaveLength(2)
      expect(results.every((r) => (r.age as number) >= 30)).toBe(true)
    })

    it('should filter documents by less than or equal', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.lte('age', 30))
        .collect()

      expect(results).toHaveLength(2)
      expect(results.every((r) => (r.age as number) <= 30)).toBe(true)
    })

    it('should filter documents by not equal', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.neq('name', 'Alice'))
        .collect()

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.name !== 'Alice')).toBe(true)
    })

    it('should support AND filters', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.and(q.gt('age', 25), q.eq('active', true)))
        .collect()

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Alice')
    })

    it('should support OR filters', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.or(q.eq('name', 'Alice'), q.eq('name', 'Bob')))
        .collect()

      expect(results).toHaveLength(2)
    })

    it('should support NOT filters', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.not(q.eq('active', true)))
        .collect()

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Charlie')
    })

    it('should support complex nested filters', async () => {
      const results = await db
        .query('users')
        .filter((q) =>
          q.and(
            q.or(q.eq('name', 'Alice'), q.eq('name', 'Bob')),
            q.gte('age', 25)
          )
        )
        .collect()

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.name === 'Alice' || r.name === 'Bob')).toBe(true)
    })

    it('should chain multiple filter calls', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.eq('active', true))
        .filter((q) => q.gt('age', 25))
        .collect()

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Alice')
    })
  })

  // ==========================================================================
  // 4. Query Builder - order() Operations
  // ==========================================================================

  describe('query().order() - order results', () => {
    beforeEach(() => {
      storage.addDocument('users_1', {
        _id: 'users_1' as Id<'users'>,
        _creationTime: 3000,
        name: 'Charlie',
      })
      storage.addDocument('users_2', {
        _id: 'users_2' as Id<'users'>,
        _creationTime: 1000,
        name: 'Alice',
      })
      storage.addDocument('users_3', {
        _id: 'users_3' as Id<'users'>,
        _creationTime: 2000,
        name: 'Bob',
      })
    })

    it('should order results by _creationTime ascending', async () => {
      const results = await db.query('users').order('asc').collect()

      expect(results).toHaveLength(3)
      expect(results[0].name).toBe('Alice')
      expect(results[1].name).toBe('Bob')
      expect(results[2].name).toBe('Charlie')
    })

    it('should order results by _creationTime descending', async () => {
      const results = await db.query('users').order('desc').collect()

      expect(results).toHaveLength(3)
      expect(results[0].name).toBe('Charlie')
      expect(results[1].name).toBe('Bob')
      expect(results[2].name).toBe('Alice')
    })

    it('should default to ascending order', async () => {
      const ascResults = await db.query('users').order('asc').collect()
      const defaultResults = await db.query('users').collect()

      expect(defaultResults).toEqual(ascResults)
    })

    it('should combine order with filter', async () => {
      storage.addDocument('users_4', {
        _id: 'users_4' as Id<'users'>,
        _creationTime: 4000,
        name: 'David',
        active: false,
      })

      const results = await db
        .query('users')
        .filter((q) => q.neq('name', 'David'))
        .order('desc')
        .collect()

      expect(results).toHaveLength(3)
      expect(results[0].name).toBe('Charlie')
    })
  })

  // ==========================================================================
  // 5. Query Builder - first() Operations
  // ==========================================================================

  describe('query().first() - get first result', () => {
    beforeEach(() => {
      storage.addDocument('users_1', {
        _id: 'users_1' as Id<'users'>,
        _creationTime: 1000,
        name: 'Alice',
      })
      storage.addDocument('users_2', {
        _id: 'users_2' as Id<'users'>,
        _creationTime: 2000,
        name: 'Bob',
      })
    })

    it('should return first document from query', async () => {
      const result = await db.query('users').first()

      expect(result).toBeDefined()
      expect(result?._id).toBe('users_1')
      expect(result?.name).toBe('Alice')
    })

    it('should return null for empty query', async () => {
      const result = await db.query('empty_table').first()

      expect(result).toBeNull()
    })

    it('should respect filter when getting first', async () => {
      const result = await db
        .query('users')
        .filter((q) => q.eq('name', 'Bob'))
        .first()

      expect(result).toBeDefined()
      expect(result?.name).toBe('Bob')
    })

    it('should respect order when getting first', async () => {
      const result = await db.query('users').order('desc').first()

      expect(result).toBeDefined()
      expect(result?.name).toBe('Bob') // Latest by _creationTime
    })

    it('should return only one document', async () => {
      const result = await db.query('users').first()

      expect(result).not.toBeInstanceOf(Array)
      expect(result).toHaveProperty('_id')
    })
  })

  // ==========================================================================
  // 6. Query Builder - take() Operations
  // ==========================================================================

  describe('query().take() - get first n results', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        storage.addDocument(`users_${i}`, {
          _id: `users_${i}` as Id<'users'>,
          _creationTime: i * 1000,
          name: `User${i}`,
        })
      }
    })

    it('should take specified number of results', async () => {
      const results = await db.query('users').take(3)

      expect(results).toHaveLength(3)
    })

    it('should take from beginning when ordered ascending', async () => {
      const results = await db.query('users').order('asc').take(2)

      expect(results).toHaveLength(2)
      expect(results[0].name).toBe('User1')
      expect(results[1].name).toBe('User2')
    })

    it('should take from beginning when ordered descending', async () => {
      const results = await db.query('users').order('desc').take(2)

      expect(results).toHaveLength(2)
      expect(results[0].name).toBe('User5')
      expect(results[1].name).toBe('User4')
    })

    it('should handle take(0)', async () => {
      const results = await db.query('users').take(0)

      expect(results).toEqual([])
    })

    it('should handle take larger than result set', async () => {
      const results = await db.query('users').take(100)

      expect(results).toHaveLength(5)
    })

    it('should combine take with filter', async () => {
      const results = await db
        .query('users')
        .filter((q) => q.gt('_creationTime', 2000))
        .take(2)

      expect(results).toHaveLength(2)
      expect(results.every((r) => r._creationTime > 2000)).toBe(true)
    })
  })

  // ==========================================================================
  // 7. Query Builder - withIndex() Operations
  // ==========================================================================

  describe('query().withIndex() - use indexes', () => {
    beforeEach(() => {
      storage.addDocument('users_1', {
        _id: 'users_1' as Id<'users'>,
        _creationTime: 1000,
        email: 'alice@example.com',
        name: 'Alice',
      })
      storage.addDocument('users_2', {
        _id: 'users_2' as Id<'users'>,
        _creationTime: 2000,
        email: 'bob@example.com',
        name: 'Bob',
      })
      storage.addDocument('users_3', {
        _id: 'users_3' as Id<'users'>,
        _creationTime: 3000,
        email: 'charlie@example.com',
        name: 'Charlie',
      })
    })

    it('should query with index name only', async () => {
      const results = await db.query('users').withIndex('by_email').collect()

      expect(results).toHaveLength(3)
    })

    it('should query with index and equality range', async () => {
      const results = await db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', 'alice@example.com'))
        .collect()

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Alice')
    })

    it('should query with index and gt range', async () => {
      const results = await db
        .query('users')
        .withIndex('by_creation', (q) => q.gt('_creationTime', 1500))
        .collect()

      expect(results).toHaveLength(2)
      expect(results.every((r) => r._creationTime > 1500)).toBe(true)
    })

    it('should query with index and gte range', async () => {
      const results = await db
        .query('users')
        .withIndex('by_creation', (q) => q.gte('_creationTime', 2000))
        .collect()

      expect(results).toHaveLength(2)
      expect(results.every((r) => r._creationTime >= 2000)).toBe(true)
    })

    it('should query with index and lt range', async () => {
      const results = await db
        .query('users')
        .withIndex('by_creation', (q) => q.lt('_creationTime', 2500))
        .collect()

      expect(results).toHaveLength(2)
      expect(results.every((r) => r._creationTime < 2500)).toBe(true)
    })

    it('should query with index and lte range', async () => {
      const results = await db
        .query('users')
        .withIndex('by_creation', (q) => q.lte('_creationTime', 2000))
        .collect()

      expect(results).toHaveLength(2)
      expect(results.every((r) => r._creationTime <= 2000)).toBe(true)
    })

    it('should support compound index ranges', async () => {
      storage.addDocument('posts_1', {
        _id: 'posts_1' as Id<'posts'>,
        _creationTime: 1000,
        authorId: 'users_1',
        status: 'published',
      })
      storage.addDocument('posts_2', {
        _id: 'posts_2' as Id<'posts'>,
        _creationTime: 2000,
        authorId: 'users_1',
        status: 'draft',
      })

      const results = await db
        .query('posts')
        .withIndex('by_author_status', (q) =>
          q.eq('authorId', 'users_1').eq('status', 'published')
        )
        .collect()

      expect(results).toHaveLength(1)
      expect(results[0]._id).toBe('posts_1')
    })

    it('should combine withIndex with filter', async () => {
      const results = await db
        .query('users')
        .withIndex('by_email', (q) => q.gt('email', 'a'))
        .filter((q) => q.eq('name', 'Bob'))
        .collect()

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Bob')
    })

    it('should combine withIndex with order', async () => {
      const results = await db
        .query('users')
        .withIndex('by_email')
        .order('desc')
        .collect()

      expect(results).toHaveLength(3)
      expect(results[0].name).toBe('Charlie')
    })
  })

  // ==========================================================================
  // 8. normalizeId() Operations
  // ==========================================================================

  describe('normalizeId() - normalize ID strings', () => {
    it('should normalize valid ID string to typed ID', () => {
      const normalized = db.normalizeId('users', 'users_abc123')

      expect(normalized).toBe('users_abc123')
    })

    it('should return null for invalid ID format', () => {
      const normalized = db.normalizeId('users', 'invalid id with spaces')

      expect(normalized).toBeNull()
    })

    it('should return null for empty string', () => {
      const normalized = db.normalizeId('users', '')

      expect(normalized).toBeNull()
    })

    it('should return null for non-string input', () => {
      const normalized = db.normalizeId('users', 123 as any)

      expect(normalized).toBeNull()
    })

    it('should validate ID belongs to correct table', () => {
      // This is a table name mismatch scenario
      const normalized = db.normalizeId('posts', 'users_abc123')

      // Should return null if strict table validation is enabled
      // Or return the ID if only format validation is done
      // Implementation choice - we'll validate format only
      expect(normalized).toBe('users_abc123')
    })

    it('should handle IDs with underscores', () => {
      const normalized = db.normalizeId('users', 'users_abc_def_123')

      expect(normalized).toBe('users_abc_def_123')
    })

    it('should handle IDs with hyphens', () => {
      const normalized = db.normalizeId('users', 'users_abc-def-123')

      expect(normalized).toBe('users_abc-def-123')
    })

    it('should reject IDs with invalid characters', () => {
      const normalized = db.normalizeId('users', 'users_@#$%')

      expect(normalized).toBeNull()
    })

    it('should handle very long IDs', () => {
      const longId = 'users_' + 'a'.repeat(200)
      const normalized = db.normalizeId('users', longId)

      // IDs over MAX_ID_LENGTH should be rejected
      expect(normalized).toBeNull()
    })
  })

  // ==========================================================================
  // 9. Edge Cases and Error Handling
  // ==========================================================================

  describe('edge cases and error handling', () => {
    it('should handle concurrent get requests', async () => {
      const userId = 'users_concurrent' as Id<'users'>
      storage.addDocument(userId, {
        _id: userId,
        _creationTime: Date.now(),
        name: 'Concurrent User',
      })

      const promises = Array.from({ length: 10 }, () => db.get(userId))
      const results = await Promise.all(promises)

      expect(results).toHaveLength(10)
      expect(results.every((r) => r?._id === userId)).toBe(true)
    })

    it('should handle concurrent query requests', async () => {
      storage.addDocument('users_1', {
        _id: 'users_1' as Id<'users'>,
        _creationTime: 1000,
        name: 'User1',
      })

      const promises = Array.from({ length: 10 }, () =>
        db.query('users').collect()
      )
      const results = await Promise.all(promises)

      expect(results).toHaveLength(10)
      expect(results.every((r) => r.length === 1)).toBe(true)
    })

    it('should handle empty filter results gracefully', async () => {
      storage.addDocument('users_1', {
        _id: 'users_1' as Id<'users'>,
        _creationTime: 1000,
        name: 'Alice',
      })

      const results = await db
        .query('users')
        .filter((q) => q.eq('name', 'NonExistent'))
        .collect()

      expect(results).toEqual([])
    })

    it('should handle null/undefined field values in filters', async () => {
      storage.addDocument('users_1', {
        _id: 'users_1' as Id<'users'>,
        _creationTime: 1000,
        name: 'Alice',
        bio: undefined,
      })

      const results = await db
        .query('users')
        .filter((q) => q.eq('bio', undefined))
        .collect()

      expect(results).toHaveLength(1)
    })

    it('should handle documents with complex nested objects', async () => {
      const userId = 'users_complex' as Id<'users'>
      storage.addDocument(userId, {
        _id: userId,
        _creationTime: Date.now(),
        name: 'Complex',
        metadata: {
          nested: {
            deeply: {
              value: 42,
            },
          },
          array: [1, 2, 3],
        },
      })

      const result = await db.get(userId)

      expect(result?.metadata).toBeDefined()
      expect((result?.metadata as any).nested.deeply.value).toBe(42)
    })

    it('should handle special characters in field values', async () => {
      const userId = 'users_special' as Id<'users'>
      storage.addDocument(userId, {
        _id: userId,
        _creationTime: Date.now(),
        name: "O'Brien",
        bio: 'Contains "quotes" and special chars: @#$%',
      })

      const result = await db.get(userId)

      expect(result?.name).toBe("O'Brien")
      expect(result?.bio).toContain('"quotes"')
    })

    it('should handle very large result sets efficiently', async () => {
      // Add 1000 documents
      for (let i = 0; i < 1000; i++) {
        storage.addDocument(`users_${i}`, {
          _id: `users_${i}` as Id<'users'>,
          _creationTime: i * 1000,
          name: `User${i}`,
        })
      }

      const results = await db.query('users').collect()

      expect(results.length).toBeGreaterThan(0)
    })

    it('should maintain result ordering consistency', async () => {
      for (let i = 1; i <= 10; i++) {
        storage.addDocument(`users_${i}`, {
          _id: `users_${i}` as Id<'users'>,
          _creationTime: i * 1000,
          name: `User${i}`,
        })
      }

      const results1 = await db.query('users').order('asc').collect()
      const results2 = await db.query('users').order('asc').collect()

      expect(results1).toEqual(results2)
    })
  })

  // ==========================================================================
  // 10. Type Safety Tests
  // ==========================================================================

  describe('type safety', () => {
    it('should enforce table name types in queries', async () => {
      // TypeScript should enforce correct table names
      const query = db.query<'users'>('users')
      const results = await query.collect()

      // Results should have correct type
      expect(Array.isArray(results)).toBe(true)
    })

    it('should preserve document types through query chain', async () => {
      storage.addDocument('users_1', {
        _id: 'users_1' as Id<'users'>,
        _creationTime: 1000,
        name: 'Alice',
        email: 'alice@example.com',
      })

      const result = await db
        .query<'users'>('users')
        .filter((q) => q.eq('name', 'Alice'))
        .first()

      // TypeScript should know result has name and email fields
      expect(result?.name).toBe('Alice')
      expect(result?.email).toBe('alice@example.com')
    })

    it('should type-check filter predicates', async () => {
      // TypeScript should enforce correct field names in filters
      const query = db.query('users').filter((q) => q.eq('name', 'Alice'))

      expect(query).toBeDefined()
    })
  })
})
