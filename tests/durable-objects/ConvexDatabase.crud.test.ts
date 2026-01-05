/**
 * TDD RED Phase Tests for ConvexDatabase CRUD Operations
 *
 * These tests define the expected behavior for document CRUD operations
 * in the ConvexDatabase Durable Object. The tests are designed to FAIL
 * until the implementation matches the expected Convex API semantics.
 *
 * @see convex-edp - ConvexDatabase DO Document CRUD (RED)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// ============================================================================
// Mock Cloudflare Durable Object SQLite Storage
// ============================================================================

// Mock SqlStorage interface
interface MockSqlCursor {
  toArray(): Record<string, unknown>[]
  rowsRead: number
  rowsWritten: number
}

interface MockSqlStorage {
  exec(query: string, ...params: unknown[]): MockSqlCursor
}

// Create a mock implementation of SqlStorage that actually stores data
function createMockSqlStorage(): MockSqlStorage {
  // Per-table storage: Map<tableName, Map<_id, { _creationTime, data }>>
  const tables = new Map<string, Map<string, { _creationTime: number; data: string }>>()
  // _documents tracking table
  const documentIndex = new Map<string, { _table: string; _creationTime: number }>()
  const metadata = new Map<string, string>()
  const schemaVersions: Array<{ version: number; applied_at: number; schema_hash: string }> = []

  // Transaction support
  let inTransaction = false
  let tablesSnapshot: Map<string, Map<string, { _creationTime: number; data: string }>> | null = null
  let documentIndexSnapshot: Map<string, { _table: string; _creationTime: number }> | null = null

  const getOrCreateTable = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map())
    return tables.get(name)!
  }

  const snapshotData = () => {
    tablesSnapshot = new Map()
    for (const [name, table] of tables) {
      tablesSnapshot.set(name, new Map(table))
    }
    documentIndexSnapshot = new Map(documentIndex)
  }

  const restoreSnapshot = () => {
    if (tablesSnapshot) {
      tables.clear()
      for (const [name, table] of tablesSnapshot) {
        tables.set(name, new Map(table))
      }
    }
    if (documentIndexSnapshot) {
      documentIndex.clear()
      for (const [id, doc] of documentIndexSnapshot) {
        documentIndex.set(id, doc)
      }
    }
    tablesSnapshot = null
    documentIndexSnapshot = null
  }

  return {
    exec(query: string, ...params: unknown[]): MockSqlCursor {
      let rowsRead = 0
      let rowsWritten = 0
      const results: Record<string, unknown>[] = []

      // Transaction support
      if (query === 'BEGIN TRANSACTION') {
        inTransaction = true
        snapshotData()
        return { toArray: () => results, rowsRead: 0, rowsWritten: 0 }
      }
      if (query === 'COMMIT') {
        inTransaction = false
        tablesSnapshot = null
        documentIndexSnapshot = null
        return { toArray: () => results, rowsRead: 0, rowsWritten: 0 }
      }
      if (query === 'ROLLBACK') {
        inTransaction = false
        restoreSnapshot()
        return { toArray: () => results, rowsRead: 0, rowsWritten: 0 }
      }

      // CREATE TABLE - track tables
      if (query.includes('CREATE TABLE')) {
        const match = query.match(/CREATE TABLE IF NOT EXISTS "?(\w+)"?/i)
        if (match) getOrCreateTable(match[1])
      }
      // CREATE INDEX - no-op
      else if (query.includes('CREATE INDEX')) {
        // No-op
      }
      // INSERT INTO _documents (tracking table)
      else if (query.includes('INSERT INTO _documents')) {
        const [_id, _table, _creationTime] = params as [string, string, number]
        documentIndex.set(_id, { _table, _creationTime })
        rowsWritten = 1
      }
      // INSERT INTO "tableName" (actual data)
      else if (query.includes('INSERT INTO')) {
        const match = query.match(/INSERT INTO "?(\w+)"?\s+\(_id,\s*_creationTime,\s*data\)/i)
        if (match) {
          const tableName = match[1]
          const [_id, _creationTime, data] = params as [string, number, string]
          getOrCreateTable(tableName).set(_id, { _creationTime, data })
          rowsWritten = 1
        }
      }
      // INSERT INTO _metadata
      else if (query.includes('INSERT OR REPLACE INTO _metadata') || query.includes('INSERT INTO _metadata')) {
        const [key, value] = params as [string, string]
        metadata.set(key, value)
        rowsWritten = 1
      }
      // INSERT INTO _schema_versions
      else if (query.includes('INSERT INTO _schema_versions')) {
        const [version, applied_at, schema_hash] = params as [number, number, string]
        schemaVersions.push({ version, applied_at, schema_hash })
        rowsWritten = 1
      }
      // SELECT from specific table WHERE _id = ?
      else if (query.includes('SELECT') && query.includes('WHERE _id = ?') && !query.includes('_documents')) {
        const match = query.match(/FROM "?(\w+)"?\s+WHERE/i)
        if (match) {
          const tableName = match[1]
          const [_id] = params as [string]
          const table = tables.get(tableName)
          const doc = table?.get(_id)
          if (doc) {
            results.push({ _id, _creationTime: doc._creationTime, data: doc.data })
            rowsRead = 1
          }
        }
      }
      // SELECT from _documents WHERE _id = ?
      else if (query.includes('SELECT') && query.includes('_documents') && query.includes('_id = ?')) {
        const [_id] = params as [string]
        const doc = documentIndex.get(_id)
        if (doc) {
          results.push({ _id, ...doc })
          rowsRead = 1
        }
      }
      // SELECT from _documents WHERE _table = ? (query all)
      else if (query.includes('SELECT') && query.includes('_documents') && query.includes('_table = ?')) {
        const [_table] = params as [string]
        for (const [_id, doc] of documentIndex) {
          if (doc._table === _table) {
            results.push({ _id, ...doc })
            rowsRead++
          }
        }
      }
      // SELECT from specific table with optional filtering/ordering/limit
      else if (query.includes('SELECT') && query.includes('FROM') && !query.includes('_documents') && !query.includes('_metadata') && !query.includes('_schema_versions') && !query.includes('COUNT')) {
        const match = query.match(/FROM "?(\w+)"?/i)
        if (match && match[1] !== 'sqlite_master') {
          const tableName = match[1]
          const table = tables.get(tableName)
          if (table) {
            // Get all documents
            let docs: Array<{ _id: string; _creationTime: number; data: string; parsed: Record<string, unknown> }> = []
            for (const [_id, doc] of table) {
              docs.push({ _id, _creationTime: doc._creationTime, data: doc.data, parsed: JSON.parse(doc.data) })
            }

            // Apply WHERE filters (json_extract)
            if (query.includes('WHERE')) {
              const filterMatches = query.matchAll(/json_extract\(data,\s*'\$\.(\w+)'\)\s*([!=<>]+)\s*\?/g)
              let paramIndex = 0
              for (const filterMatch of filterMatches) {
                const field = filterMatch[1]
                const operator = filterMatch[2]
                const value = JSON.parse(params[paramIndex++] as string)
                docs = docs.filter(doc => {
                  const docValue = doc.parsed[field]
                  switch (operator) {
                    case '=': return docValue === value
                    case '!=': return docValue !== value
                    case '<': return (docValue as number) < value
                    case '<=': return (docValue as number) <= value
                    case '>': return (docValue as number) > value
                    case '>=': return (docValue as number) >= value
                    default: return true
                  }
                })
              }
            }

            // Apply ORDER BY
            const orderMatch = query.match(/ORDER BY\s+(?:json_extract\(data,\s*'\$\.(\w+)'\)|(\w+))\s+(ASC|DESC)/i)
            if (orderMatch) {
              const orderField = orderMatch[1] || orderMatch[2]
              const direction = orderMatch[3].toUpperCase()
              docs.sort((a, b) => {
                const aVal = orderField === '_creationTime' ? a._creationTime : a.parsed[orderField]
                const bVal = orderField === '_creationTime' ? b._creationTime : b.parsed[orderField]
                if (aVal < bVal) return direction === 'ASC' ? -1 : 1
                if (aVal > bVal) return direction === 'ASC' ? 1 : -1
                return 0
              })
            }

            // Apply LIMIT
            const limitMatch = query.match(/LIMIT\s+(\d+)/i)
            if (limitMatch) {
              docs = docs.slice(0, parseInt(limitMatch[1]))
            }

            for (const doc of docs) {
              results.push({ _id: doc._id, _creationTime: doc._creationTime, data: doc.data })
              rowsRead++
            }
          }
        }
      }
      // SELECT COUNT from _documents WHERE _table = ?
      else if (query.includes('SELECT COUNT') && query.includes('_documents')) {
        const [_table] = params as [string]
        let count = 0
        for (const [, doc] of documentIndex) {
          if (doc._table === _table) count++
        }
        results.push({ count })
        rowsRead = 1
      }
      // SELECT from _metadata WHERE key = ?
      else if (query.includes('SELECT') && query.includes('_metadata')) {
        const [key] = params as [string]
        const value = metadata.get(key)
        if (value !== undefined) {
          results.push({ value })
          rowsRead = 1
        }
      }
      // UPDATE "tableName" SET data = ? WHERE _id = ?
      else if (query.includes('UPDATE') && !query.includes('_documents')) {
        const match = query.match(/UPDATE "?(\w+)"?\s+SET/i)
        if (match) {
          const tableName = match[1]
          const [data, _id] = params as [string, string]
          const table = tables.get(tableName)
          const existing = table?.get(_id)
          if (existing) {
            table!.set(_id, { ...existing, data })
            rowsWritten = 1
          }
        }
      }
      // DELETE FROM "tableName" WHERE _id = ?
      else if (query.includes('DELETE FROM') && !query.includes('_documents')) {
        const match = query.match(/DELETE FROM "?(\w+)"?\s+WHERE/i)
        if (match) {
          const tableName = match[1]
          const [_id] = params as [string]
          const table = tables.get(tableName)
          if (table?.delete(_id)) {
            rowsWritten = 1
          }
        }
      }
      // DELETE FROM _documents WHERE _id = ?
      else if (query.includes('DELETE FROM _documents')) {
        const [_id] = params as [string]
        if (documentIndex.delete(_id)) {
          rowsWritten = 1
        }
      }

      return {
        toArray: () => results,
        rowsRead,
        rowsWritten,
      }
    },
  }
}

// Mock DurableObjectState
interface MockDurableObjectState {
  storage: {
    sql: MockSqlStorage
    get: (key: string) => Promise<unknown>
    put: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<boolean>
    list: () => Promise<Map<string, unknown>>
  }
  blockConcurrencyWhile: <T>(fn: () => Promise<T>) => Promise<T>
}

function createMockDurableObjectState(): MockDurableObjectState {
  const kvStorage = new Map<string, unknown>()
  const mockSql = createMockSqlStorage()

  return {
    storage: {
      sql: mockSql,
      get: async (key: string) => kvStorage.get(key),
      put: async (key: string, value: unknown) => { kvStorage.set(key, value) },
      delete: async (key: string) => kvStorage.delete(key),
      list: async () => kvStorage,
    },
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  }
}

// Import the ConvexDatabase class (this import may fail initially)
// The tests are designed to verify the expected interface
import { ConvexDatabase } from '../../src/durable-objects/ConvexDatabase'

// ============================================================================
// Test Types
// ============================================================================

interface TestDocument {
  _id: string
  _creationTime: number
  [key: string]: unknown
}

interface UserDocument extends TestDocument {
  name: string
  email: string
  age?: number
}

interface TaskDocument extends TestDocument {
  title: string
  completed: boolean
  assignee?: string
}

// ============================================================================
// Create Operations Tests
// ============================================================================

describe('ConvexDatabase CRUD', () => {
  let db: ConvexDatabase
  let mockState: MockDurableObjectState
  let mockEnv: Record<string, unknown>

  beforeEach(() => {
    mockState = createMockDurableObjectState()
    mockEnv = {}
    db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv as unknown as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // 1. Create Operations
  // ==========================================================================

  describe('create operations', () => {
    describe('insert document with auto-generated _id', () => {
      it('should insert document and return the generated _id', async () => {
        // This test verifies that insert returns an ID string
        const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com' })

        expect(id).toBeDefined()
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
      })

      it('should generate unique IDs for multiple inserts', async () => {
        const id1 = await db.insert('users', { name: 'Alice', email: 'alice@example.com' })
        const id2 = await db.insert('users', { name: 'Bob', email: 'bob@example.com' })
        const id3 = await db.insert('users', { name: 'Charlie', email: 'charlie@example.com' })

        expect(id1).not.toBe(id2)
        expect(id2).not.toBe(id3)
        expect(id1).not.toBe(id3)
      })

      it('should generate URL-safe base64 IDs', async () => {
        // Convex IDs are URL-safe base64 encoded
        const id = await db.insert('users', { name: 'Test' })

        // Should not contain characters that need URL encoding
        expect(id).not.toMatch(/[+/=]/)
        // Should be alphanumeric with - and _
        expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
      })

      it('should generate IDs of consistent length', async () => {
        // Convex IDs are typically 22-24 characters (base64 of 16 bytes)
        const ids = await Promise.all([
          db.insert('users', { name: 'User1' }),
          db.insert('users', { name: 'User2' }),
          db.insert('users', { name: 'User3' }),
        ])

        // All IDs should have the same length
        const lengths = ids.map(id => id.length)
        expect(new Set(lengths).size).toBe(1)
        // Standard Convex ID length
        expect(lengths[0]).toBeGreaterThanOrEqual(20)
      })
    })

    describe('insert with all field types', () => {
      it('should insert document with string fields', async () => {
        const id = await db.insert('documents', {
          title: 'Hello World',
          description: 'A test document',
          content: 'Lorem ipsum dolor sit amet',
        })

        const doc = await db.get('documents', id)
        expect(doc?.title).toBe('Hello World')
        expect(doc?.description).toBe('A test document')
        expect(doc?.content).toBe('Lorem ipsum dolor sit amet')
      })

      it('should insert document with number fields', async () => {
        const id = await db.insert('documents', {
          count: 42,
          price: 19.99,
          negativeValue: -100,
          zero: 0,
        })

        const doc = await db.get('documents', id)
        expect(doc?.count).toBe(42)
        expect(doc?.price).toBe(19.99)
        expect(doc?.negativeValue).toBe(-100)
        expect(doc?.zero).toBe(0)
      })

      it('should insert document with boolean fields', async () => {
        const id = await db.insert('documents', {
          active: true,
          deleted: false,
        })

        const doc = await db.get('documents', id)
        expect(doc?.active).toBe(true)
        expect(doc?.deleted).toBe(false)
      })

      it('should insert document with null fields', async () => {
        const id = await db.insert('documents', {
          optionalField: null,
          deletedAt: null,
        })

        const doc = await db.get('documents', id)
        expect(doc?.optionalField).toBeNull()
        expect(doc?.deletedAt).toBeNull()
      })

      it('should insert document with array fields', async () => {
        const tags = ['typescript', 'convex', 'cloudflare']
        const numbers = [1, 2, 3, 4, 5]

        const id = await db.insert('documents', {
          tags,
          numbers,
          emptyArray: [],
        })

        const doc = await db.get('documents', id)
        expect(doc?.tags).toEqual(tags)
        expect(doc?.numbers).toEqual(numbers)
        expect(doc?.emptyArray).toEqual([])
      })

      it('should insert document with nested object fields', async () => {
        const id = await db.insert('documents', {
          metadata: {
            author: 'John Doe',
            version: 1,
            tags: ['important'],
          },
          settings: {
            enabled: true,
            config: {
              timeout: 5000,
            },
          },
        })

        const doc = await db.get('documents', id)
        expect(doc?.metadata).toEqual({
          author: 'John Doe',
          version: 1,
          tags: ['important'],
        })
        expect((doc?.settings as { config: { timeout: number } })?.config?.timeout).toBe(5000)
      })

      it('should insert document with BigInt fields (int64)', async () => {
        // Convex supports int64 values as BigInt
        const id = await db.insert('documents', {
          bigNumber: BigInt('9223372036854775807'),
          negativeBigInt: BigInt('-9223372036854775808'),
        })

        const doc = await db.get('documents', id)
        expect(doc?.bigNumber).toBe(BigInt('9223372036854775807'))
        expect(doc?.negativeBigInt).toBe(BigInt('-9223372036854775808'))
      })

      it('should insert document with binary data (bytes)', async () => {
        // Convex supports binary data as ArrayBuffer
        const data = new Uint8Array([1, 2, 3, 4, 5]).buffer

        const id = await db.insert('documents', {
          binaryData: data,
        })

        const doc = await db.get('documents', id)
        expect(doc?.binaryData).toBeInstanceOf(ArrayBuffer)
        expect(new Uint8Array(doc?.binaryData as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
      })

      it('should insert document with mixed field types', async () => {
        const id = await db.insert('documents', {
          title: 'Mixed Types',
          count: 42,
          active: true,
          optional: null,
          tags: ['a', 'b'],
          metadata: { key: 'value' },
        })

        const doc = await db.get('documents', id)
        expect(doc?.title).toBe('Mixed Types')
        expect(doc?.count).toBe(42)
        expect(doc?.active).toBe(true)
        expect(doc?.optional).toBeNull()
        expect(doc?.tags).toEqual(['a', 'b'])
        expect(doc?.metadata).toEqual({ key: 'value' })
      })
    })

    describe('validate against schema', () => {
      // These tests verify schema validation during insert
      // The current implementation may not have full schema validation

      it('should reject documents with undefined fields', async () => {
        // Convex does not allow undefined values - they should be null or omitted
        await expect(
          db.insert('users', { name: 'Test', invalidField: undefined })
        ).rejects.toThrow()
      })

      it('should reject documents with function values', async () => {
        // Functions cannot be serialized to Convex
        await expect(
          db.insert('users', { name: 'Test', callback: () => {} })
        ).rejects.toThrow()
      })

      it('should reject documents with Symbol values', async () => {
        // Symbols cannot be serialized
        await expect(
          db.insert('users', { name: 'Test', symbol: Symbol('test') })
        ).rejects.toThrow()
      })

      it('should reject documents with circular references', async () => {
        // Circular references cannot be serialized
        const circular: Record<string, unknown> = { name: 'Test' }
        circular.self = circular

        await expect(db.insert('users', circular)).rejects.toThrow()
      })

      it('should reject documents with NaN values', async () => {
        // NaN is not a valid Convex number
        await expect(
          db.insert('users', { name: 'Test', value: NaN })
        ).rejects.toThrow()
      })

      it('should reject documents with Infinity values', async () => {
        // Infinity is not a valid Convex number
        await expect(
          db.insert('users', { name: 'Test', value: Infinity })
        ).rejects.toThrow()
      })
    })

    describe('return created document with system fields', () => {
      it('should be able to retrieve the created document with _id', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const doc = await db.get('users', id)

        expect(doc).toBeDefined()
        expect(doc?._id).toBe(id)
        expect(doc?.name).toBe('Alice')
      })

      it('should set _creationTime as a Unix timestamp in milliseconds', async () => {
        const beforeInsert = Date.now()
        const id = await db.insert('users', { name: 'Alice' })
        const afterInsert = Date.now()

        const doc = await db.get('users', id)

        expect(doc?._creationTime).toBeDefined()
        expect(typeof doc?._creationTime).toBe('number')
        expect(doc?._creationTime).toBeGreaterThanOrEqual(beforeInsert)
        expect(doc?._creationTime).toBeLessThanOrEqual(afterInsert)
      })

      it('should preserve document fields after retrieval', async () => {
        const originalData = {
          name: 'Alice',
          email: 'alice@example.com',
          age: 30,
          active: true,
          tags: ['admin', 'user'],
          profile: { bio: 'Hello', avatar: null },
        }

        const id = await db.insert('users', originalData)
        const doc = await db.get('users', id)

        expect(doc?.name).toBe(originalData.name)
        expect(doc?.email).toBe(originalData.email)
        expect(doc?.age).toBe(originalData.age)
        expect(doc?.active).toBe(originalData.active)
        expect(doc?.tags).toEqual(originalData.tags)
        expect(doc?.profile).toEqual(originalData.profile)
      })
    })
  })

  // ==========================================================================
  // 2. Read Operations
  // ==========================================================================

  describe('read operations', () => {
    describe('get document by _id', () => {
      it('should get document by _id', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com' })
        const doc = await db.get('users', id)

        expect(doc).toBeDefined()
        expect(doc?._id).toBe(id)
        expect(doc?.name).toBe('Alice')
        expect(doc?.email).toBe('alice@example.com')
      })

      it('should return all document fields', async () => {
        const id = await db.insert('users', {
          name: 'Alice',
          email: 'alice@example.com',
          age: 30,
          active: true,
        })

        const doc = await db.get('users', id)

        expect(doc?._id).toBe(id)
        expect(doc?._creationTime).toBeDefined()
        expect(doc?.name).toBe('Alice')
        expect(doc?.email).toBe('alice@example.com')
        expect(doc?.age).toBe(30)
        expect(doc?.active).toBe(true)
      })

      it('should preserve data types in retrieved document', async () => {
        const id = await db.insert('data', {
          string: 'hello',
          number: 42,
          float: 3.14,
          boolean: true,
          nullValue: null,
          array: [1, 2, 3],
          object: { nested: true },
        })

        const doc = await db.get('data', id)

        expect(typeof doc?.string).toBe('string')
        expect(typeof doc?.number).toBe('number')
        expect(typeof doc?.float).toBe('number')
        expect(typeof doc?.boolean).toBe('boolean')
        expect(doc?.nullValue).toBeNull()
        expect(Array.isArray(doc?.array)).toBe(true)
        expect(typeof doc?.object).toBe('object')
      })

      it('should get document from specific table only', async () => {
        const userId = await db.insert('users', { name: 'Alice' })
        const taskId = await db.insert('tasks', { title: 'Task 1' })

        // Should find document in correct table
        const user = await db.get('users', userId)
        expect(user?.name).toBe('Alice')

        // Should not find document in wrong table
        const wrongTableDoc = await db.get('tasks', userId)
        expect(wrongTableDoc).toBeNull()
      })
    })

    describe('get non-existent document returns null', () => {
      it('should return null for non-existent _id', async () => {
        const doc = await db.get('users', 'nonexistent-id-12345678901234567890')
        expect(doc).toBeNull()
      })

      it('should return null for empty table', async () => {
        const doc = await db.get('emptyTable', 'some-id-12345678901234567890')
        expect(doc).toBeNull()
      })

      it('should return null for deleted document', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        await db.delete('users', id)

        const doc = await db.get('users', id)
        expect(doc).toBeNull()
      })

      it('should return null for non-existent table', async () => {
        const doc = await db.get('nonExistentTable', 'some-id-12345678901234567890')
        expect(doc).toBeNull()
      })
    })

    describe('query multiple documents', () => {
      beforeEach(async () => {
        // Set up test data
        await db.insert('users', { name: 'Alice', age: 30, active: true })
        await db.insert('users', { name: 'Bob', age: 25, active: true })
        await db.insert('users', { name: 'Charlie', age: 35, active: false })
        await db.insert('users', { name: 'Diana', age: 28, active: true })
      })

      it('should query all documents in a table', async () => {
        const results = await db.query('users')

        expect(results).toBeDefined()
        expect(Array.isArray(results)).toBe(true)
        expect(results.length).toBe(4)
      })

      it('should query with equality filter', async () => {
        const results = await db.query('users', [
          { field: 'active', operator: 'eq', value: true },
        ])

        expect(results.length).toBe(3)
        expect(results.every(doc => doc.active === true)).toBe(true)
      })

      it('should query with inequality filter', async () => {
        const results = await db.query('users', [
          { field: 'active', operator: 'neq', value: true },
        ])

        expect(results.length).toBe(1)
        expect(results[0]?.name).toBe('Charlie')
      })

      it('should query with less than filter', async () => {
        const results = await db.query('users', [
          { field: 'age', operator: 'lt', value: 30 },
        ])

        expect(results.length).toBe(2)
        expect(results.every(doc => (doc.age as number) < 30)).toBe(true)
      })

      it('should query with less than or equal filter', async () => {
        const results = await db.query('users', [
          { field: 'age', operator: 'lte', value: 30 },
        ])

        expect(results.length).toBe(3)
        expect(results.every(doc => (doc.age as number) <= 30)).toBe(true)
      })

      it('should query with greater than filter', async () => {
        const results = await db.query('users', [
          { field: 'age', operator: 'gt', value: 30 },
        ])

        expect(results.length).toBe(1)
        expect(results[0]?.name).toBe('Charlie')
      })

      it('should query with greater than or equal filter', async () => {
        const results = await db.query('users', [
          { field: 'age', operator: 'gte', value: 30 },
        ])

        expect(results.length).toBe(2)
        expect(results.every(doc => (doc.age as number) >= 30)).toBe(true)
      })

      it('should query with multiple filters (AND)', async () => {
        const results = await db.query('users', [
          { field: 'active', operator: 'eq', value: true },
          { field: 'age', operator: 'gte', value: 28 },
        ])

        expect(results.length).toBe(2)
        expect(results.every(doc => doc.active === true && (doc.age as number) >= 28)).toBe(true)
      })

      it('should query with ordering ascending', async () => {
        const results = await db.query('users', [], {
          order: { field: 'age', direction: 'asc' },
        })

        expect(results.length).toBe(4)
        expect(results[0]?.name).toBe('Bob')    // age 25
        expect(results[1]?.name).toBe('Diana')  // age 28
        expect(results[2]?.name).toBe('Alice')  // age 30
        expect(results[3]?.name).toBe('Charlie') // age 35
      })

      it('should query with ordering descending', async () => {
        const results = await db.query('users', [], {
          order: { field: 'age', direction: 'desc' },
        })

        expect(results.length).toBe(4)
        expect(results[0]?.name).toBe('Charlie') // age 35
        expect(results[3]?.name).toBe('Bob')     // age 25
      })

      it('should query with limit', async () => {
        const results = await db.query('users', [], {
          limit: 2,
        })

        expect(results.length).toBe(2)
      })

      it('should query with order by _creationTime', async () => {
        const results = await db.query('users', [], {
          order: { field: '_creationTime', direction: 'asc' },
        })

        expect(results.length).toBe(4)
        // Documents should be ordered by creation time
        for (let i = 1; i < results.length; i++) {
          expect(results[i]._creationTime).toBeGreaterThanOrEqual(results[i - 1]._creationTime)
        }
      })

      it('should default to ordering by _creationTime ascending', async () => {
        const results = await db.query('users')

        // Should be ordered by _creationTime ASC by default
        for (let i = 1; i < results.length; i++) {
          expect(results[i]._creationTime).toBeGreaterThanOrEqual(results[i - 1]._creationTime)
        }
      })

      it('should return empty array for empty table', async () => {
        const results = await db.query('emptyTable')

        expect(results).toEqual([])
      })

      it('should return empty array when no documents match filter', async () => {
        const results = await db.query('users', [
          { field: 'age', operator: 'gt', value: 100 },
        ])

        expect(results).toEqual([])
      })
    })
  })

  // ==========================================================================
  // 3. Update Operations
  // ==========================================================================

  describe('update operations', () => {
    describe('patch existing document', () => {
      it('should update specific fields using patch', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com', age: 30 })

        await db.patch('users', id, { age: 31 })

        const doc = await db.get('users', id)
        expect(doc?.name).toBe('Alice')
        expect(doc?.email).toBe('alice@example.com')
        expect(doc?.age).toBe(31)
      })

      it('should update multiple fields at once', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'old@example.com', age: 30 })

        await db.patch('users', id, { email: 'new@example.com', age: 31 })

        const doc = await db.get('users', id)
        expect(doc?.name).toBe('Alice')
        expect(doc?.email).toBe('new@example.com')
        expect(doc?.age).toBe(31)
      })

      it('should add new fields to document', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await db.patch('users', id, { email: 'alice@example.com', age: 30 })

        const doc = await db.get('users', id)
        expect(doc?.name).toBe('Alice')
        expect(doc?.email).toBe('alice@example.com')
        expect(doc?.age).toBe(30)
      })

      it('should preserve _id after patch', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await db.patch('users', id, { name: 'Alice Updated' })

        const doc = await db.get('users', id)
        expect(doc?._id).toBe(id)
      })

      it('should preserve _creationTime after patch', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const docBefore = await db.get('users', id)
        const creationTime = docBefore?._creationTime

        // Wait a bit to ensure time difference
        await new Promise(resolve => setTimeout(resolve, 10))

        await db.patch('users', id, { name: 'Alice Updated' })

        const docAfter = await db.get('users', id)
        expect(docAfter?._creationTime).toBe(creationTime)
      })

      it('should throw error when patching non-existent document', async () => {
        await expect(
          db.patch('users', 'nonexistent-id-12345678901234567890', { name: 'Test' })
        ).rejects.toThrow()
      })

      it('should throw error when patching in non-existent table', async () => {
        await expect(
          db.patch('nonExistentTable', 'some-id-12345678901234567890', { name: 'Test' })
        ).rejects.toThrow()
      })

      it('should not allow patching _id field', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        // Attempting to patch _id should either throw or be ignored
        await expect(
          db.patch('users', id, { _id: 'new-id' } as Record<string, unknown>)
        ).rejects.toThrow()
      })

      it('should not allow patching _creationTime field', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        // Attempting to patch _creationTime should either throw or be ignored
        await expect(
          db.patch('users', id, { _creationTime: 0 } as Record<string, unknown>)
        ).rejects.toThrow()
      })
    })

    describe('replace entire document', () => {
      it('should replace document entirely', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com', age: 30 })

        await db.replace('users', id, { name: 'Bob', country: 'USA' })

        const doc = await db.get('users', id)
        expect(doc?.name).toBe('Bob')
        expect(doc?.country).toBe('USA')
        // Old fields should be removed
        expect(doc?.email).toBeUndefined()
        expect(doc?.age).toBeUndefined()
      })

      it('should preserve _id after replace', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await db.replace('users', id, { name: 'Bob' })

        const doc = await db.get('users', id)
        expect(doc?._id).toBe(id)
      })

      it('should preserve _creationTime after replace', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const docBefore = await db.get('users', id)
        const creationTime = docBefore?._creationTime

        await db.replace('users', id, { name: 'Bob' })

        const docAfter = await db.get('users', id)
        expect(docAfter?._creationTime).toBe(creationTime)
      })

      it('should throw error when replacing non-existent document', async () => {
        await expect(
          db.replace('users', 'nonexistent-id-12345678901234567890', { name: 'Test' })
        ).rejects.toThrow()
      })

      it('should throw error when replacing in non-existent table', async () => {
        await expect(
          db.replace('nonExistentTable', 'some-id-12345678901234567890', { name: 'Test' })
        ).rejects.toThrow()
      })

      it('should allow replacing with empty document', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com' })

        await db.replace('users', id, {})

        const doc = await db.get('users', id)
        expect(doc?._id).toBe(id)
        expect(doc?._creationTime).toBeDefined()
        expect(doc?.name).toBeUndefined()
        expect(doc?.email).toBeUndefined()
      })
    })

    describe('update validation', () => {
      it('should reject patch with invalid field types', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.patch('users', id, { callback: () => {} })
        ).rejects.toThrow()
      })

      it('should reject replace with invalid field types', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.replace('users', id, { callback: () => {} })
        ).rejects.toThrow()
      })

      it('should reject patch with NaN values', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.patch('users', id, { age: NaN })
        ).rejects.toThrow()
      })

      it('should reject patch with Infinity values', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.patch('users', id, { value: Infinity })
        ).rejects.toThrow()
      })

      it('should reject patch with undefined values', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await expect(
          db.patch('users', id, { optionalField: undefined })
        ).rejects.toThrow()
      })
    })
  })

  // ==========================================================================
  // 4. Delete Operations
  // ==========================================================================

  describe('delete operations', () => {
    describe('delete by _id', () => {
      it('should delete document by _id', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        // Verify document exists
        const docBefore = await db.get('users', id)
        expect(docBefore).toBeDefined()

        await db.delete('users', id)

        // Verify document is deleted
        const docAfter = await db.get('users', id)
        expect(docAfter).toBeNull()
      })

      it('should only delete the specified document', async () => {
        const id1 = await db.insert('users', { name: 'Alice' })
        const id2 = await db.insert('users', { name: 'Bob' })
        const id3 = await db.insert('users', { name: 'Charlie' })

        await db.delete('users', id2)

        expect(await db.get('users', id1)).toBeDefined()
        expect(await db.get('users', id2)).toBeNull()
        expect(await db.get('users', id3)).toBeDefined()
      })

      it('should remove document from query results', async () => {
        await db.insert('users', { name: 'Alice' })
        const idToDelete = await db.insert('users', { name: 'Bob' })
        await db.insert('users', { name: 'Charlie' })

        await db.delete('users', idToDelete)

        const results = await db.query('users')
        expect(results.length).toBe(2)
        expect(results.find(doc => doc._id === idToDelete)).toBeUndefined()
      })
    })

    describe('delete non-existent document', () => {
      it('should not throw when deleting non-existent document', async () => {
        // Convex delete is idempotent - deleting non-existent document should not throw
        await expect(
          db.delete('users', 'nonexistent-id-12345678901234567890')
        ).resolves.not.toThrow()
      })

      it('should not throw when deleting from non-existent table', async () => {
        await expect(
          db.delete('nonExistentTable', 'some-id-12345678901234567890')
        ).resolves.not.toThrow()
      })

      it('should handle double delete gracefully', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        await db.delete('users', id)
        // Second delete should not throw
        await expect(db.delete('users', id)).resolves.not.toThrow()
      })
    })
  })

  // ==========================================================================
  // 5. System Fields
  // ==========================================================================

  describe('system fields', () => {
    describe('_id is auto-generated', () => {
      it('should generate _id automatically', async () => {
        const id = await db.insert('users', { name: 'Alice' })

        expect(id).toBeDefined()
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
      })

      it('should not accept user-provided _id', async () => {
        // Convex does not allow users to specify _id on insert
        await expect(
          db.insert('users', { _id: 'custom-id', name: 'Alice' } as Record<string, unknown>)
        ).rejects.toThrow()
      })

      it('should generate unique _id for each document', async () => {
        const ids = new Set<string>()

        for (let i = 0; i < 100; i++) {
          const id = await db.insert('users', { name: `User ${i}` })
          expect(ids.has(id)).toBe(false)
          ids.add(id)
        }
      })

      it('should use table name as ID prefix/namespace', async () => {
        // Convex IDs include table information
        const userId = await db.insert('users', { name: 'Alice' })
        const taskId = await db.insert('tasks', { title: 'Task 1' })

        // IDs from different tables should be distinguishable
        // (This might not be strictly required but is good practice)
        expect(userId).not.toBe(taskId)
      })
    })

    describe('_creationTime is set on create', () => {
      it('should set _creationTime on document creation', async () => {
        const beforeInsert = Date.now()
        const id = await db.insert('users', { name: 'Alice' })
        const afterInsert = Date.now()

        const doc = await db.get('users', id)

        expect(doc?._creationTime).toBeDefined()
        expect(doc?._creationTime).toBeGreaterThanOrEqual(beforeInsert)
        expect(doc?._creationTime).toBeLessThanOrEqual(afterInsert)
      })

      it('should set _creationTime as Unix timestamp in milliseconds', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const doc = await db.get('users', id)

        // Should be a reasonable timestamp (after 2020 and before 2100)
        const year2020 = new Date('2020-01-01').getTime()
        const year2100 = new Date('2100-01-01').getTime()

        expect(doc?._creationTime).toBeGreaterThan(year2020)
        expect(doc?._creationTime).toBeLessThan(year2100)
      })

      it('should not allow user-provided _creationTime', async () => {
        await expect(
          db.insert('users', { _creationTime: 0, name: 'Alice' } as Record<string, unknown>)
        ).rejects.toThrow()
      })

      it('should not change _creationTime on patch', async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const docBefore = await db.get('users', id)

        await new Promise(resolve => setTimeout(resolve, 10))

        await db.patch('users', id, { name: 'Alice Updated' })

        const docAfter = await db.get('users', id)
        expect(docAfter?._creationTime).toBe(docBefore?._creationTime)
      })

      it('should not change _creationTime on replace', async () => {
        const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com' })
        const docBefore = await db.get('users', id)

        await new Promise(resolve => setTimeout(resolve, 10))

        await db.replace('users', id, { name: 'Bob' })

        const docAfter = await db.get('users', id)
        expect(docAfter?._creationTime).toBe(docBefore?._creationTime)
      })

      it('should have different _creationTime for documents inserted at different times', async () => {
        const id1 = await db.insert('users', { name: 'First' })

        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10))

        const id2 = await db.insert('users', { name: 'Second' })

        const doc1 = await db.get('users', id1)
        const doc2 = await db.get('users', id2)

        expect(doc2?._creationTime).toBeGreaterThan(doc1?._creationTime as number)
      })
    })
  })

  // ==========================================================================
  // Additional Edge Cases and Error Handling
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty document insert', async () => {
      const id = await db.insert('empty', {})
      const doc = await db.get('empty', id)

      expect(doc?._id).toBe(id)
      expect(doc?._creationTime).toBeDefined()
    })

    it('should handle large documents', async () => {
      const largeArray = new Array(1000).fill(0).map((_, i) => ({
        index: i,
        data: 'x'.repeat(100),
      }))

      const id = await db.insert('large', { items: largeArray })
      const doc = await db.get('large', id)

      expect((doc?.items as unknown[]).length).toBe(1000)
    })

    it('should handle deeply nested documents', async () => {
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'deep',
                },
              },
            },
          },
        },
      }

      const id = await db.insert('nested', deeplyNested)
      const doc = await db.get('nested', id)

      expect((doc as typeof deeplyNested).level1.level2.level3.level4.level5.value).toBe('deep')
    })

    it('should handle special characters in string fields', async () => {
      const id = await db.insert('special', {
        text: 'Hello "World"! \n\t\r Special: \u0000\u001F\u007F',
        emoji: '\uD83D\uDE00\uD83C\uDF89',
        unicode: '\u4E2D\u6587',
      })

      const doc = await db.get('special', id)
      expect(doc?.text).toBe('Hello "World"! \n\t\r Special: \u0000\u001F\u007F')
      expect(doc?.emoji).toBe('\uD83D\uDE00\uD83C\uDF89')
      expect(doc?.unicode).toBe('\u4E2D\u6587')
    })

    it('should handle concurrent inserts', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        db.insert('concurrent', { index: i })
      )

      const ids = await Promise.all(promises)

      // All IDs should be unique
      expect(new Set(ids).size).toBe(10)

      // All documents should exist
      for (const id of ids) {
        const doc = await db.get('concurrent', id)
        expect(doc).toBeDefined()
      }
    })

    it('should handle table names with special characters', async () => {
      // Note: This might be rejected depending on implementation
      // Convex typically allows alphanumeric table names only
      const id = await db.insert('my_table', { name: 'test' })
      const doc = await db.get('my_table', id)
      expect(doc?.name).toBe('test')
    })
  })

  // ==========================================================================
  // Transaction Support Tests
  // ==========================================================================

  describe('transaction support', () => {
    it('should run transaction successfully', async () => {
      const result = await db.runTransaction(async () => {
        const id = await db.insert('users', { name: 'Alice' })
        const doc = await db.get('users', id)
        return doc
      })

      expect(result?.name).toBe('Alice')
    })

    it('should rollback transaction on error', async () => {
      let insertedId: string | null = null

      try {
        await db.runTransaction(async () => {
          insertedId = await db.insert('users', { name: 'Alice' })
          throw new Error('Intentional error')
        })
      } catch {
        // Expected error
      }

      // If transaction rolled back, document should not exist
      if (insertedId) {
        const doc = await db.get('users', insertedId)
        expect(doc).toBeNull()
      }
    })

    it('should return value from transaction', async () => {
      const result = await db.runTransaction(async () => {
        await db.insert('users', { name: 'Alice' })
        await db.insert('users', { name: 'Bob' })
        return 'success'
      })

      expect(result).toBe('success')
    })
  })
})
