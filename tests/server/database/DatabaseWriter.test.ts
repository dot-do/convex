/**
 * TDD RED Phase Tests for DatabaseWriter
 *
 * These tests define the expected behavior for the DatabaseWriter interface.
 * DatabaseWriter extends DatabaseReader and provides write operations.
 * They are designed to FAIL until the implementation is complete.
 *
 * Layer 4 - Server Context Types Implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Id } from '../../../src/types'
import { DatabaseWriter } from '../../../src/server/database/DatabaseWriter'
import { DatabaseReader } from '../../../src/server/database/DatabaseReader'

// ============================================================================
// Mock Storage Layer
// ============================================================================

interface MockStorage {
  documents: Map<string, Map<string, Record<string, unknown>>>
  getDocument(table: string, id: string): Record<string, unknown> | null
  getDocumentByTableAndId(table: string, id: string): Record<string, unknown> | null
  saveDocument(table: string, id: string, doc: Record<string, unknown>): void
  deleteDocument(table: string, id: string): void
  queryDocuments(table: string): Record<string, unknown>[]
}

function createMockStorage(): MockStorage {
  const documents = new Map<string, Map<string, Record<string, unknown>>>()

  return {
    documents,
    getDocument(table: string, id: string): Record<string, unknown> | null {
      const tableData = documents.get(table)
      return tableData?.get(id) ?? null
    },
    getDocumentByTableAndId(table: string, id: string): Record<string, unknown> | null {
      const tableData = documents.get(table)
      return tableData?.get(id) ?? null
    },
    saveDocument(table: string, id: string, doc: Record<string, unknown>): void {
      if (!documents.has(table)) {
        documents.set(table, new Map())
      }
      documents.get(table)!.set(id, doc)
    },
    deleteDocument(table: string, id: string): void {
      documents.get(table)?.delete(id)
    },
    queryDocuments(table: string): Record<string, unknown>[] {
      const tableData = documents.get(table)
      return tableData ? Array.from(tableData.values()) : []
    },
  }
}

// ============================================================================
// WritableStorageBackend Interface Tests (RED Phase - TDD)
// ============================================================================

/**
 * These tests define the expected interface contract for WritableStorageBackend.
 * The key method is `getDocumentByTableAndId(table, id)` which is required
 * by DatabaseWriter but not implemented in the mock.
 *
 * TDD Issue: convex-w5zt
 * Problem: MockStorage has `getDocument` but the interface requires `getDocumentByTableAndId`
 */
describe('WritableStorageBackend.getDocumentByTableAndId', () => {
  let storage: MockStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('should return document when exists', () => {
    // Setup: add a document directly to storage
    storage.saveDocument('users', 'users_id123', {
      _id: 'users_id123',
      _creationTime: Date.now(),
      name: 'Test User',
    })

    // The interface requires getDocumentByTableAndId - this should work
    // but MockStorage only has getDocument, not getDocumentByTableAndId
    const doc = (storage as unknown as { getDocumentByTableAndId: (table: string, id: string) => Record<string, unknown> | null })
      .getDocumentByTableAndId('users', 'users_id123')

    expect(doc).toEqual(expect.objectContaining({
      _id: 'users_id123',
      name: 'Test User',
    }))
  })

  it('should return null when document not found', () => {
    // The interface requires getDocumentByTableAndId to return null for missing docs
    const doc = (storage as unknown as { getDocumentByTableAndId: (table: string, id: string) => Record<string, unknown> | null })
      .getDocumentByTableAndId('users', 'nonexistent_id')

    expect(doc).toBeNull()
  })

  it('should return null for non-existent table', () => {
    // The interface requires getDocumentByTableAndId to return null for missing tables
    const doc = (storage as unknown as { getDocumentByTableAndId: (table: string, id: string) => Record<string, unknown> | null })
      .getDocumentByTableAndId('nonexistent_table', 'some_id')

    expect(doc).toBeNull()
  })

  it('should be callable from DatabaseWriter.get()', () => {
    // This test verifies that DatabaseWriter.get() correctly uses getDocumentByTableAndId
    storage.saveDocument('users', 'users_abc123', {
      _id: 'users_abc123',
      _creationTime: Date.now(),
      name: 'Alice',
    })

    const db = new DatabaseWriter(storage)
    // This will fail because MockStorage doesn't have getDocumentByTableAndId
    // DatabaseWriter.get() calls this.writableStorage.getDocumentByTableAndId(tableName, id)
    expect(db.get('users_abc123' as Id<'users'>)).resolves.toEqual(expect.objectContaining({
      _id: 'users_abc123',
      name: 'Alice',
    }))
  })

  it('should be used by DatabaseWriter.patch() to find existing document', async () => {
    storage.saveDocument('users', 'users_patch123', {
      _id: 'users_patch123',
      _creationTime: Date.now(),
      name: 'Bob',
      email: 'bob@example.com',
    })

    const db = new DatabaseWriter(storage)
    // patch() internally calls getDocumentByTableAndId to get the existing doc
    // This will fail because the method doesn't exist on MockStorage
    await expect(db.patch('users_patch123' as Id<'users'>, { email: 'new@example.com' }))
      .resolves.toBeUndefined()
  })

  it('should be used by DatabaseWriter.replace() to preserve system fields', async () => {
    storage.saveDocument('users', 'users_replace123', {
      _id: 'users_replace123',
      _creationTime: 1234567890,
      name: 'Charlie',
    })

    const db = new DatabaseWriter(storage)
    // replace() internally calls getDocumentByTableAndId to get system fields
    // This will fail because the method doesn't exist on MockStorage
    await expect(db.replace('users_replace123' as Id<'users'>, { name: 'Dave' }))
      .resolves.toBeUndefined()
  })
})

// ============================================================================
// Insert Operation Tests
// ============================================================================

describe('DatabaseWriter', () => {
  let storage: MockStorage
  let db: DatabaseWriter

  beforeEach(() => {
    storage = createMockStorage()
    db = new DatabaseWriter(storage)
  })

  describe('extends DatabaseReader', () => {
    it('should be an instance of DatabaseReader', () => {
      expect(db).toBeInstanceOf(DatabaseReader)
    })

    it('should have all DatabaseReader methods', () => {
      expect(db.get).toBeDefined()
      expect(db.query).toBeDefined()
      expect(db.normalizeId).toBeDefined()
    })

    it('should inherit get() functionality', async () => {
      // Insert directly to storage with proper ID format (tableName_randomPart)
      const id = 'users_id123' as Id<'users'>
      storage.saveDocument('users', id, {
        _id: id,
        _creationTime: Date.now(),
        name: 'Alice',
      })

      const doc = await db.get(id)
      expect(doc).toBeDefined()
      expect(doc?.name).toBe('Alice')
    })
  })

  describe('insert() operation', () => {
    describe('basic insert functionality', () => {
      it('should insert a document and return an Id', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com' })

        expect(id).toBeDefined()
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
      })

      it('should generate unique IDs for multiple inserts', async () => {
        const id1 = await db.insert('users', { name: 'Alice' })
        const id2 = await db.insert('users', { name: 'Bob' })
        const id3 = await db.insert('users', { name: 'Charlie' })

        expect(id1).not.toBe(id2)
        expect(id2).not.toBe(id3)
        expect(id1).not.toBe(id3)
      })

      it('should store the document so it can be retrieved with get()', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com' })
        const doc = await db.get(id)

        expect(doc).toBeDefined()
        expect(doc?._id).toBe(id)
        expect(doc?.name).toBe('Alice')
        expect(doc?.email).toBe('alice@example.com')
      })

      it('should return an Id typed with the table name', async () => {
        const id: Id<'users'> = await db.insert('users', { name: 'Alice' })
        expect(id).toBeDefined()
      })
    })

    describe('system fields handling', () => {
      it('should automatically add _id field', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const doc = await db.get(id)

        expect(doc?._id).toBe(id)
      })

      it('should automatically add _creationTime field', async () => {
        const beforeInsert = Date.now()
        const id = await db.insert('users', { name: 'Alice' })
        const afterInsert = Date.now()

        const doc = await db.get(id)

        expect(doc?._creationTime).toBeDefined()
        expect(typeof doc?._creationTime).toBe('number')
        expect(doc?._creationTime).toBeGreaterThanOrEqual(beforeInsert)
        expect(doc?._creationTime).toBeLessThanOrEqual(afterInsert)
      })

      it('should reject documents with user-provided _id', async () => {
        await expect(
          db.insert('users', { _id: 'custom_id', name: 'Alice' } as Record<string, unknown>)
        ).rejects.toThrow(/system field/i)
      })

      it('should reject documents with user-provided _creationTime', async () => {
        await expect(
          db.insert('users', { _creationTime: 12345, name: 'Alice' } as Record<string, unknown>)
        ).rejects.toThrow(/system field/i)
      })
    })

    describe('field type validation', () => {
      it('should accept string fields', async () => {
        const id = await db.insert('docs', { title: 'Test', content: 'Hello' })
        const doc = await db.get(id)

        expect(doc?.title).toBe('Test')
        expect(doc?.content).toBe('Hello')
      })

      it('should accept number fields', async () => {
        const id = await db.insert('docs', { count: 42, price: 19.99 })
        const doc = await db.get(id)

        expect(doc?.count).toBe(42)
        expect(doc?.price).toBe(19.99)
      })

      it('should accept boolean fields', async () => {
        const id = await db.insert('docs', { active: true, deleted: false })
        const doc = await db.get(id)

        expect(doc?.active).toBe(true)
        expect(doc?.deleted).toBe(false)
      })

      it('should accept null fields', async () => {
        const id = await db.insert('docs', { optional: null })
        const doc = await db.get(id)

        expect(doc?.optional).toBeNull()
      })

      it('should accept array fields', async () => {
        const id = await db.insert('docs', { tags: ['a', 'b', 'c'] })
        const doc = await db.get(id)

        expect(doc?.tags).toEqual(['a', 'b', 'c'])
      })

      it('should accept object fields', async () => {
        const id = await db.insert('docs', { metadata: { author: 'Alice', version: 1 } })
        const doc = await db.get(id)

        expect(doc?.metadata).toEqual({ author: 'Alice', version: 1 })
      })

      it('should accept BigInt fields', async () => {
        const id = await db.insert('docs', { bigNum: BigInt('123456789012345') })
        const doc = await db.get(id)

        expect(doc?.bigNum).toBe(BigInt('123456789012345'))
      })

      it('should reject undefined fields', async () => {
        await expect(
          db.insert('docs', { name: 'Test', invalid: undefined })
        ).rejects.toThrow(/undefined.*not allowed/i)
      })

      it('should reject NaN fields', async () => {
        await expect(
          db.insert('docs', { name: 'Test', value: NaN })
        ).rejects.toThrow(/NaN.*not allowed/i)
      })

      it('should reject Infinity fields', async () => {
        await expect(
          db.insert('docs', { name: 'Test', value: Infinity })
        ).rejects.toThrow(/Infinity.*not allowed/i)
      })

      it('should reject function fields', async () => {
        await expect(
          db.insert('docs', { name: 'Test', callback: () => {} })
        ).rejects.toThrow(/function.*not allowed/i)
      })

      it('should reject Symbol fields', async () => {
        await expect(
          db.insert('docs', { name: 'Test', symbol: Symbol('test') })
        ).rejects.toThrow(/symbol.*not allowed/i)
      })
    })

    describe('empty and edge cases', () => {
      it('should accept empty document', async () => {
        const id = await db.insert('docs', {})
        const doc = await db.get(id)

        expect(doc?._id).toBe(id)
        expect(doc?._creationTime).toBeDefined()
      })

      it('should handle nested objects', async () => {
        const id = await db.insert('docs', {
          level1: { level2: { level3: { value: 'deep' } } },
        })
        const doc = await db.get(id) as { level1: { level2: { level3: { value: string } } } }

        expect(doc.level1.level2.level3.value).toBe('deep')
      })

      it('should handle arrays of objects', async () => {
        const id = await db.insert('docs', {
          items: [{ id: 1 }, { id: 2 }],
        })
        const doc = await db.get(id)

        expect(doc?.items).toEqual([{ id: 1 }, { id: 2 }])
      })
    })
  })

  // ==========================================================================
  // Patch Operation Tests
  // ==========================================================================

  describe('patch() operation', () => {
    describe('basic patch functionality', () => {
      it('should update specific fields of a document', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'old@example.com', age: 30 })

        await db.patch(id, { email: 'new@example.com' })

        const doc = await db.get(id)
        expect(doc?.name).toBe('Alice')
        expect(doc?.email).toBe('new@example.com')
        expect(doc?.age).toBe(30)
      })

      it('should update multiple fields at once', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'old@example.com', age: 30 })

        await db.patch(id, { email: 'new@example.com', age: 31 })

        const doc = await db.get(id)
        expect(doc?.email).toBe('new@example.com')
        expect(doc?.age).toBe(31)
      })

      it('should add new fields to existing document', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await db.patch(id, { email: 'alice@example.com', age: 30 })

        const doc = await db.get(id)
        expect(doc?.name).toBe('Alice')
        expect(doc?.email).toBe('alice@example.com')
        expect(doc?.age).toBe(30)
      })

      it('should preserve unmodified fields', async () => {
        const id = await db.insert('users', {
          name: 'Alice',
          email: 'alice@example.com',
          age: 30,
          active: true,
        })

        await db.patch(id, { age: 31 })

        const doc = await db.get(id)
        expect(doc?.name).toBe('Alice')
        expect(doc?.email).toBe('alice@example.com')
        expect(doc?.active).toBe(true)
      })

      it('should return void (Promise<void>)', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const result = await db.patch(id, { name: 'Bob' })

        expect(result).toBeUndefined()
      })
    })

    describe('system fields protection', () => {
      it('should preserve _id after patch', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await db.patch(id, { name: 'Bob' })

        const doc = await db.get(id)
        expect(doc?._id).toBe(id)
      })

      it('should preserve _creationTime after patch', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const docBefore = await db.get(id)
        const creationTime = docBefore?._creationTime

        await new Promise(resolve => setTimeout(resolve, 10))
        await db.patch(id, { name: 'Bob' })

        const docAfter = await db.get(id)
        expect(docAfter?._creationTime).toBe(creationTime)
      })

      it('should reject attempts to modify _id', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.patch(id, { _id: 'new_id' } as Record<string, unknown>)
        ).rejects.toThrow(/system field.*cannot be modified/i)
      })

      it('should reject attempts to modify _creationTime', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.patch(id, { _creationTime: 0 } as Record<string, unknown>)
        ).rejects.toThrow(/system field.*cannot be modified/i)
      })
    })

    describe('validation', () => {
      it('should validate field types', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.patch(id, { callback: () => {} })
        ).rejects.toThrow(/function.*not allowed/i)
      })

      it('should reject undefined values', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.patch(id, { optional: undefined })
        ).rejects.toThrow(/undefined.*not allowed/i)
      })

      it('should reject NaN values', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.patch(id, { age: NaN })
        ).rejects.toThrow(/NaN.*not allowed/i)
      })
    })

    describe('error cases', () => {
      it('should throw when patching non-existent document', async () => {
        const fakeId = 'nonexistent_id123' as Id<'users'>

        await expect(
          db.patch(fakeId, { name: 'Test' })
        ).rejects.toThrow(/document.*not found/i)
      })

      it('should throw when patching with empty fields object', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.patch(id, {})
        ).rejects.toThrow(/at least one field/i)
      })
    })
  })

  // ==========================================================================
  // Replace Operation Tests
  // ==========================================================================

  describe('replace() operation', () => {
    describe('basic replace functionality', () => {
      it('should replace entire document', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com', age: 30 })

        await db.replace(id, { name: 'Bob', country: 'USA' })

        const doc = await db.get(id)
        expect(doc?.name).toBe('Bob')
        expect(doc?.country).toBe('USA')
        expect(doc?.email).toBeUndefined()
        expect(doc?.age).toBeUndefined()
      })

      it('should remove all old fields except system fields', async () => {
        const id = await db.insert('users', {
          name: 'Alice',
          email: 'alice@example.com',
          age: 30,
          active: true,
        })

        await db.replace(id, { name: 'Bob' })

        const doc = await db.get(id)
        expect(doc?.name).toBe('Bob')
        expect(doc?.email).toBeUndefined()
        expect(doc?.age).toBeUndefined()
        expect(doc?.active).toBeUndefined()
      })

      it('should allow replacing with empty document', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com' })

        await db.replace(id, {})

        const doc = await db.get(id)
        expect(doc?._id).toBe(id)
        expect(doc?._creationTime).toBeDefined()
        expect(doc?.name).toBeUndefined()
        expect(doc?.email).toBeUndefined()
      })

      it('should return void (Promise<void>)', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const result = await db.replace(id, { name: 'Bob' })

        expect(result).toBeUndefined()
      })
    })

    describe('system fields protection', () => {
      it('should preserve _id after replace', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await db.replace(id, { name: 'Bob' })

        const doc = await db.get(id)
        expect(doc?._id).toBe(id)
      })

      it('should preserve _creationTime after replace', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const docBefore = await db.get(id)
        const creationTime = docBefore?._creationTime

        await new Promise(resolve => setTimeout(resolve, 10))
        await db.replace(id, { name: 'Bob' })

        const docAfter = await db.get(id)
        expect(docAfter?._creationTime).toBe(creationTime)
      })

      it('should reject attempts to replace _id', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.replace(id, { _id: 'new_id', name: 'Bob' } as Record<string, unknown>)
        ).rejects.toThrow(/system field.*cannot be modified/i)
      })

      it('should reject attempts to replace _creationTime', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.replace(id, { _creationTime: 0, name: 'Bob' } as Record<string, unknown>)
        ).rejects.toThrow(/system field.*cannot be modified/i)
      })
    })

    describe('validation', () => {
      it('should validate field types', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.replace(id, { callback: () => {} })
        ).rejects.toThrow(/function.*not allowed/i)
      })

      it('should reject undefined values', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.replace(id, { optional: undefined })
        ).rejects.toThrow(/undefined.*not allowed/i)
      })
    })

    describe('error cases', () => {
      it('should throw when replacing non-existent document', async () => {
        const fakeId = 'nonexistent_id123' as Id<'users'>

        await expect(
          db.replace(fakeId, { name: 'Test' })
        ).rejects.toThrow(/document.*not found/i)
      })
    })
  })

  // ==========================================================================
  // Delete Operation Tests
  // ==========================================================================

  describe('delete() operation', () => {
    describe('basic delete functionality', () => {
      it('should delete a document by ID', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await db.delete(id)

        const doc = await db.get(id)
        expect(doc).toBeNull()
      })

      it('should only delete the specified document', async () => {
        const id1 = await db.insert('users', { name: 'Alice' })
        const id2 = await db.insert('users', { name: 'Bob' })
        const id3 = await db.insert('users', { name: 'Charlie' })

        await db.delete(id2)

        expect(await db.get(id1)).toBeDefined()
        expect(await db.get(id2)).toBeNull()
        expect(await db.get(id3)).toBeDefined()
      })

      it('should return void (Promise<void>)', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const result = await db.delete(id)

        expect(result).toBeUndefined()
      })
    })

    describe('idempotency', () => {
      it('should not throw when deleting non-existent document', async () => {
        const fakeId = 'nonexistent_id123' as Id<'users'>

        await expect(db.delete(fakeId)).resolves.toBeUndefined()
      })

      it('should handle double delete gracefully', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await db.delete(id)
        await expect(db.delete(id)).resolves.toBeUndefined()
      })
    })
  })

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('integration scenarios', () => {
    it('should handle full CRUD lifecycle', async () => {
      // Create
      const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com' })
      expect(id).toBeDefined()

      // Read
      let doc = await db.get(id)
      expect(doc?.name).toBe('Alice')

      // Update (patch)
      await db.patch(id, { email: 'newemail@example.com' })
      doc = await db.get(id)
      expect(doc?.email).toBe('newemail@example.com')

      // Update (replace)
      await db.replace(id, { name: 'Alice Updated', age: 30 })
      doc = await db.get(id)
      expect(doc?.name).toBe('Alice Updated')
      expect(doc?.email).toBeUndefined()

      // Delete
      await db.delete(id)
      doc = await db.get(id)
      expect(doc).toBeNull()
    })

    it('should handle multiple concurrent operations', async () => {
      const ids = await Promise.all([
        db.insert('users', { name: 'User1' }),
        db.insert('users', { name: 'User2' }),
        db.insert('users', { name: 'User3' }),
      ])

      await Promise.all([
        db.patch(ids[0], { age: 25 }),
        db.patch(ids[1], { age: 30 }),
        db.replace(ids[2], { name: 'User3 Updated' }),
      ])

      const docs = await Promise.all(ids.map(id => db.get(id)))

      expect(docs[0]?.age).toBe(25)
      expect(docs[1]?.age).toBe(30)
      expect(docs[2]?.name).toBe('User3 Updated')
    })

    it('should maintain data integrity across operations', async () => {
      const id = await db.insert('users', { name: 'Alice', counter: 0 })

      // Multiple patches
      for (let i = 1; i <= 5; i++) {
        await db.patch(id, { counter: i })
      }

      const doc = await db.get(id)
      expect(doc?.counter).toBe(5)
      expect(doc?.name).toBe('Alice')
    })
  })

  // ==========================================================================
  // Type Safety Tests
  // ==========================================================================

  describe('type safety', () => {
    it('should return correctly typed Id from insert', async () => {
      const userId: Id<'users'> = await db.insert('users', { name: 'Alice' })
      const taskId: Id<'tasks'> = await db.insert('tasks', { title: 'Task 1' })

      expect(typeof userId).toBe('string')
      expect(typeof taskId).toBe('string')
    })

    it('should accept Id parameter in patch', async () => {
      const id: Id<'users'> = await db.insert('users', { name: 'Alice' })
      await expect(db.patch(id, { name: 'Bob' })).resolves.toBeUndefined()
    })

    it('should accept Id parameter in replace', async () => {
      const id: Id<'users'> = await db.insert('users', { name: 'Alice' })
      await expect(db.replace(id, { name: 'Bob' })).resolves.toBeUndefined()
    })

    it('should accept Id parameter in delete', async () => {
      const id: Id<'users'> = await db.insert('users', { name: 'Alice' })
      await expect(db.delete(id)).resolves.toBeUndefined()
    })
  })
})
