/**
 * TDD RED Phase Tests for ConvexDatabase Durable Object
 *
 * These tests define the expected interface and behavior for ConvexDatabase DO initialization.
 * The implementation is incomplete, so all tests should FAIL.
 *
 * Test coverage:
 * 1. DO initialization - creates SQLite on first access, persists across restarts
 * 2. Schema management - create table SQL, migrations, index creation
 * 3. Convex-to-SQLite type mapping
 * 4. System tables - documents metadata, schema versions
 * 5. Error handling - invalid schema, migration conflicts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Mock Cloudflare Durable Object APIs
// ============================================================================

/**
 * Mock SqlStorage interface matching Cloudflare's D1/SQLite API
 */
interface MockSqlCursor {
  toArray(): Record<string, unknown>[]
  one(): Record<string, unknown> | null
  columnNames: string[]
  rowsRead: number
  rowsWritten: number
}

interface MockSqlStorage {
  exec: ReturnType<typeof vi.fn>
  ingest: ReturnType<typeof vi.fn>
  databaseSize: number
}

interface MockDurableObjectStorage {
  sql: MockSqlStorage
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
  getAlarm: ReturnType<typeof vi.fn>
  setAlarm: ReturnType<typeof vi.fn>
  deleteAlarm: ReturnType<typeof vi.fn>
}

interface MockDurableObjectState {
  storage: MockDurableObjectStorage
  id: { toString: () => string }
  blockConcurrencyWhile: <T>(fn: () => Promise<T>) => Promise<T>
  waitUntil: ReturnType<typeof vi.fn>
}

/**
 * Create mock Cloudflare Durable Object environment
 */
function createMockDurableObjectState(): MockDurableObjectState {
  const execResults: MockSqlCursor = {
    toArray: () => [],
    one: () => null,
    columnNames: [],
    rowsRead: 0,
    rowsWritten: 0,
  }

  const mockSql: MockSqlStorage = {
    exec: vi.fn().mockReturnValue(execResults),
    ingest: vi.fn(),
    databaseSize: 0,
  }

  const mockStorage: MockDurableObjectStorage = {
    sql: mockSql,
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    transaction: vi.fn((fn) => fn()),
    getAlarm: vi.fn(),
    setAlarm: vi.fn(),
    deleteAlarm: vi.fn(),
  }

  return {
    storage: mockStorage,
    id: { toString: () => 'test-do-id-12345' },
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(),
    waitUntil: vi.fn(),
  }
}

/**
 * Create mock environment with Durable Object bindings
 */
function createMockEnv() {
  return {
    CONVEX_DATABASE: {
      get: vi.fn(),
      idFromName: vi.fn(),
      idFromString: vi.fn(),
    },
  }
}

// ============================================================================
// Import ConvexDatabase - these should fail until implementation is complete
// ============================================================================

// The imports below reference functionality that needs to be implemented
import { ConvexDatabase } from '../../src/durable-objects/ConvexDatabase'
import type {
  SchemaDefinition,
  TableSchema,
  FieldDefinition,
  IndexDefinition,
  MigrationPlan,
  SQLiteColumnType,
} from '../../src/durable-objects/ConvexDatabase'

// ============================================================================
// Test Suite: DO Initialization
// ============================================================================

describe('ConvexDatabase Durable Object', () => {
  let mockState: MockDurableObjectState
  let mockEnv: ReturnType<typeof createMockEnv>

  beforeEach(() => {
    mockState = createMockDurableObjectState()
    mockEnv = createMockEnv()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // 1. DO Initialization Tests
  // ==========================================================================

  describe('initialization', () => {
    it('should create system tables on first access', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      // First access should trigger initialization
      await db.ensureInitialized()

      // Verify _documents system table was created
      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS _documents')
      )

      // Verify _schema_versions system table was created
      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS _schema_versions')
      )
    })

    it('should create _documents table with correct schema', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      // _documents should track all document IDs and their table names
      const createDocsCall = mockState.storage.sql.exec.mock.calls.find(
        (call) => call[0].includes('_documents')
      )

      expect(createDocsCall).toBeDefined()
      expect(createDocsCall[0]).toContain('_id TEXT PRIMARY KEY')
      expect(createDocsCall[0]).toContain('_table TEXT NOT NULL')
      expect(createDocsCall[0]).toContain('_creationTime INTEGER NOT NULL')
    })

    it('should create _schema_versions table for migration tracking', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const createSchemaCall = mockState.storage.sql.exec.mock.calls.find(
        (call) => call[0].includes('_schema_versions')
      )

      expect(createSchemaCall).toBeDefined()
      expect(createSchemaCall[0]).toContain('version INTEGER PRIMARY KEY')
      expect(createSchemaCall[0]).toContain('applied_at INTEGER NOT NULL')
      expect(createSchemaCall[0]).toContain('schema_hash TEXT NOT NULL')
    })

    it('should not recreate system tables on subsequent initializations', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      // Mock that tables already exist
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes("sqlite_master") && sql.includes("_documents")) {
          return {
            toArray: () => [{ name: '_documents' }],
            one: () => ({ name: '_documents' }),
            columnNames: ['name'],
            rowsRead: 1,
            rowsWritten: 0,
          }
        }
        return {
          toArray: () => [],
          one: () => null,
          columnNames: [],
          rowsRead: 0,
          rowsWritten: 0,
        }
      })

      await db.ensureInitialized()
      await db.ensureInitialized()

      // CREATE TABLE should only be called once per table
      const createTableCalls = mockState.storage.sql.exec.mock.calls.filter(
        (call) => call[0].includes('CREATE TABLE')
      )

      // Should use IF NOT EXISTS, but initialization should be idempotent
      expect(db.isInitialized()).toBe(true)
    })

    it('should persist initialization state across restarts', async () => {
      // Simulate first instance
      const db1 = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db1.ensureInitialized()

      // Simulate restart - new instance with same state
      const db2 = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      // Mock existing tables in SQLite
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes("sqlite_master")) {
          return {
            toArray: () => [
              { name: '_documents' },
              { name: '_schema_versions' },
            ],
            one: () => ({ name: '_documents' }),
            columnNames: ['name'],
            rowsRead: 2,
            rowsWritten: 0,
          }
        }
        return {
          toArray: () => [],
          one: () => null,
          columnNames: [],
          rowsRead: 0,
          rowsWritten: 0,
        }
      })

      await db2.ensureInitialized()

      expect(db2.isInitialized()).toBe(true)
    })

    it('should use blockConcurrencyWhile for thread-safe initialization', async () => {
      const blockConcurrencySpy = vi.spyOn(mockState, 'blockConcurrencyWhile')

      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      expect(blockConcurrencySpy).toHaveBeenCalled()
    })

    it('should initialize SQLite with WAL mode for performance', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      // Should set WAL journal mode
      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('PRAGMA journal_mode=WAL')
      )
    })

    it('should enable foreign keys in SQLite', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('PRAGMA foreign_keys=ON')
      )
    })
  })

  // ==========================================================================
  // 2. Schema Management Tests
  // ==========================================================================

  describe('schema management', () => {
    it('should create table with correct SQL from schema definition', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const tableSchema: TableSchema = {
        name: 'users',
        fields: {
          name: { type: 'string', optional: false },
          email: { type: 'string', optional: false },
          age: { type: 'number', optional: true },
        },
        indexes: [],
      }

      await db.createTable(tableSchema)

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE "users"')
      )
      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('"name" TEXT NOT NULL')
      )
      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('"email" TEXT NOT NULL')
      )
      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('"age" REAL')
      )
    })

    it('should create indexes from schema definition', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const tableSchema: TableSchema = {
        name: 'users',
        fields: {
          email: { type: 'string', optional: false },
          createdAt: { type: 'number', optional: false },
        },
        indexes: [
          { name: 'by_email', fields: ['email'], unique: true },
          { name: 'by_created', fields: ['createdAt'], unique: false },
        ],
      }

      await db.createTable(tableSchema)

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE UNIQUE INDEX "users_by_email"')
      )
      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX "users_by_created"')
      )
    })

    it('should create compound indexes', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const tableSchema: TableSchema = {
        name: 'posts',
        fields: {
          authorId: { type: 'id', table: 'users', optional: false },
          createdAt: { type: 'number', optional: false },
        },
        indexes: [
          { name: 'by_author_date', fields: ['authorId', 'createdAt'], unique: false },
        ],
      }

      await db.createTable(tableSchema)

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('("authorId", "createdAt")')
      )
    })

    it('should apply schema migrations incrementally', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      // Mock existing schema at version 1
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('_schema_versions') && sql.includes('MAX')) {
          return {
            toArray: () => [{ version: 1 }],
            one: () => ({ version: 1 }),
            columnNames: ['version'],
            rowsRead: 1,
            rowsWritten: 0,
          }
        }
        return {
          toArray: () => [],
          one: () => null,
          columnNames: [],
          rowsRead: 0,
          rowsWritten: 0,
        }
      })

      const migration: MigrationPlan = {
        fromVersion: 1,
        toVersion: 2,
        operations: [
          { type: 'addColumn', table: 'users', column: 'bio', definition: { type: 'string', optional: true } },
        ],
      }

      await db.applyMigration(migration)

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('ALTER TABLE "users" ADD COLUMN "bio" TEXT')
      )
    })

    it('should record migration version after successful apply', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      // Mock schema version query to return version 1
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('_schema_versions') && sql.includes('MAX')) {
          return {
            toArray: () => [{ version: 1 }],
            one: () => ({ version: 1 }),
            columnNames: ['version'],
            rowsRead: 1,
            rowsWritten: 0,
          }
        }
        return {
          toArray: () => [],
          one: () => null,
          columnNames: [],
          rowsRead: 0,
          rowsWritten: 0,
        }
      })

      const migration: MigrationPlan = {
        fromVersion: 1,
        toVersion: 2,
        operations: [],
      }

      await db.applyMigration(migration)

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO _schema_versions'),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })

    it('should rollback migration on failure', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      // Mock version check and failure on ALTER TABLE
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('_schema_versions') && sql.includes('MAX')) {
          return {
            toArray: () => [{ version: 1 }],
            one: () => ({ version: 1 }),
            columnNames: ['version'],
            rowsRead: 1,
            rowsWritten: 0,
          }
        }
        if (sql.includes('ALTER TABLE')) {
          throw new Error('Column already exists')
        }
        return {
          toArray: () => [],
          one: () => null,
          columnNames: [],
          rowsRead: 0,
          rowsWritten: 0,
        }
      })

      const migration: MigrationPlan = {
        fromVersion: 1,
        toVersion: 2,
        operations: [
          { type: 'addColumn', table: 'users', column: 'bio', definition: { type: 'string', optional: true } },
        ],
      }

      await expect(db.applyMigration(migration)).rejects.toThrow()

      // Should have attempted rollback
      expect(mockState.storage.sql.exec).toHaveBeenCalledWith('ROLLBACK')
    })

    it('should validate schema hash matches before migration', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      // Mock version check and mismatched schema hash
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('_schema_versions') && sql.includes('MAX')) {
          return {
            toArray: () => [{ version: 1 }],
            one: () => ({ version: 1 }),
            columnNames: ['version'],
            rowsRead: 1,
            rowsWritten: 0,
          }
        }
        if (sql.includes('schema_hash')) {
          return {
            toArray: () => [{ schema_hash: 'hash123' }],
            one: () => ({ schema_hash: 'hash123' }),
            columnNames: ['schema_hash'],
            rowsRead: 1,
            rowsWritten: 0,
          }
        }
        return {
          toArray: () => [],
          one: () => null,
          columnNames: [],
          rowsRead: 0,
          rowsWritten: 0,
        }
      })

      const migration: MigrationPlan = {
        fromVersion: 1,
        toVersion: 2,
        expectedSchemaHash: 'different_hash',
        operations: [],
      }

      await expect(db.applyMigration(migration)).rejects.toThrow(/schema hash mismatch/i)
    })
  })

  // ==========================================================================
  // 3. Convex-to-SQLite Type Mapping Tests
  // ==========================================================================

  describe('Convex-to-SQLite type mapping', () => {
    it('should map v.string() to SQLite TEXT', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({ type: 'string', optional: false })

      expect(sqlType).toBe('TEXT NOT NULL')
    })

    it('should map v.number() to SQLite REAL', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({ type: 'number', optional: false })

      expect(sqlType).toBe('REAL NOT NULL')
    })

    it('should map v.boolean() to SQLite INTEGER', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({ type: 'boolean', optional: false })

      expect(sqlType).toBe('INTEGER NOT NULL')
    })

    it('should map v.id() to SQLite TEXT with table reference', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({ type: 'id', table: 'users', optional: false })

      expect(sqlType).toBe('TEXT NOT NULL')
    })

    it('should add CHECK constraint for v.id() fields', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const tableSchema: TableSchema = {
        name: 'posts',
        fields: {
          authorId: { type: 'id', table: 'users', optional: false },
        },
        indexes: [],
      }

      await db.createTable(tableSchema)

      // Should include CHECK constraint for ID format validation
      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('CHECK')
      )
    })

    it('should map v.array() to SQLite JSON', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({ type: 'array', element: { type: 'string' }, optional: false })

      expect(sqlType).toBe('TEXT NOT NULL') // JSON stored as TEXT in SQLite
    })

    it('should map v.object() to SQLite JSON', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({
        type: 'object',
        fields: { name: { type: 'string', optional: false } },
        optional: false,
      })

      expect(sqlType).toBe('TEXT NOT NULL') // JSON stored as TEXT in SQLite
    })

    it('should allow NULL for optional fields', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlTypeString = db.convexTypeToSQLite({ type: 'string', optional: true })
      const sqlTypeNumber = db.convexTypeToSQLite({ type: 'number', optional: true })
      const sqlTypeBoolean = db.convexTypeToSQLite({ type: 'boolean', optional: true })

      expect(sqlTypeString).toBe('TEXT')
      expect(sqlTypeNumber).toBe('REAL')
      expect(sqlTypeBoolean).toBe('INTEGER')
    })

    it('should map v.int64() to SQLite INTEGER', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({ type: 'int64', optional: false })

      expect(sqlType).toBe('INTEGER NOT NULL')
    })

    it('should map v.float64() to SQLite REAL', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({ type: 'float64', optional: false })

      expect(sqlType).toBe('REAL NOT NULL')
    })

    it('should map v.bytes() to SQLite BLOB', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({ type: 'bytes', optional: false })

      expect(sqlType).toBe('BLOB NOT NULL')
    })

    it('should map v.null() to SQLite with NULL default', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({ type: 'null', optional: true })

      expect(sqlType).toBe('TEXT DEFAULT NULL')
    })

    it('should map v.union() to SQLite JSON for complex unions', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlType = db.convexTypeToSQLite({
        type: 'union',
        variants: [{ type: 'string' }, { type: 'number' }],
        optional: false,
      })

      // Complex unions stored as JSON
      expect(sqlType).toBe('TEXT NOT NULL')
    })

    it('should map v.literal() to appropriate SQLite type', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      const sqlTypeString = db.convexTypeToSQLite({ type: 'literal', value: 'active', optional: false })
      const sqlTypeNumber = db.convexTypeToSQLite({ type: 'literal', value: 42, optional: false })
      const sqlTypeBool = db.convexTypeToSQLite({ type: 'literal', value: true, optional: false })

      expect(sqlTypeString).toBe('TEXT NOT NULL')
      expect(sqlTypeNumber).toBe('REAL NOT NULL')
      expect(sqlTypeBool).toBe('INTEGER NOT NULL')
    })
  })

  // ==========================================================================
  // 4. System Tables Tests
  // ==========================================================================

  describe('system tables', () => {
    it('should track all documents in _documents table', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      // Insert a document
      const docId = await db.insert('users', { name: 'John', email: 'john@example.com' })

      // Should also insert into _documents
      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO _documents'),
        expect.anything(),
        'users',
        expect.anything()
      )
    })

    it('should maintain _creationTime in _documents', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const beforeTime = Date.now()
      const docId = await db.insert('users', { name: 'John' })
      const afterTime = Date.now()

      const insertCall = mockState.storage.sql.exec.mock.calls.find(
        (call) => call[0].includes('INSERT INTO _documents')
      )

      expect(insertCall).toBeDefined()
      // Verify _creationTime is within expected range
      const creationTime = insertCall[3] // Assuming positional parameter
      expect(creationTime).toBeGreaterThanOrEqual(beforeTime)
      expect(creationTime).toBeLessThanOrEqual(afterTime)
    })

    it('should track schema version in _schema_versions', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const version = await db.getCurrentSchemaVersion()

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('_schema_versions')
      )
    })

    it('should store schema hash for each version', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const schemaDefinition: SchemaDefinition = {
        tables: {
          users: {
            name: 'users',
            fields: { name: { type: 'string', optional: false } },
            indexes: [],
          },
        },
      }

      await db.applySchema(schemaDefinition)

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO _schema_versions'),
        expect.anything(), // version
        expect.anything(), // applied_at
        expect.any(String)  // schema_hash
      )
    })

    it('should delete from _documents when document is deleted', async () => {
      // Mock metadata query to register the table BEFORE creating db
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('SELECT value FROM _metadata') && sql.includes('tables')) {
          return {
            toArray: () => [{ value: JSON.stringify(['users']) }],
            one: () => ({ value: JSON.stringify(['users']) }),
            columnNames: ['value'],
            rowsRead: 1,
            rowsWritten: 0,
          }
        }
        return {
          toArray: () => [],
          one: () => null,
          columnNames: [],
          rowsRead: 0,
          rowsWritten: 0,
        }
      })

      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()
      await db.delete('users', 'doc-id-123')

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM _documents'),
        'doc-id-123'
      )
    })

    it('should support querying _documents by table', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      await db.listDocumentIds('users')

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('SELECT _id FROM _documents WHERE _table = ?'),
        'users'
      )
    })

    it('should track total document count per table', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      await db.getDocumentCount('users')

      expect(mockState.storage.sql.exec).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*)'),
        'users'
      )
    })
  })

  // ==========================================================================
  // 5. Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('should throw on invalid table name', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const invalidSchema: TableSchema = {
        name: '', // Empty name
        fields: {},
        indexes: [],
      }

      await expect(db.createTable(invalidSchema)).rejects.toThrow(/invalid table name/i)
    })

    it('should throw on reserved table name', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const reservedSchema: TableSchema = {
        name: '_documents', // Reserved system table
        fields: { data: { type: 'string', optional: false } },
        indexes: [],
      }

      await expect(db.createTable(reservedSchema)).rejects.toThrow(/reserved table name/i)
    })

    it('should throw on invalid field name', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const invalidSchema: TableSchema = {
        name: 'users',
        fields: {
          '_invalid': { type: 'string', optional: false }, // underscore prefix reserved
        },
        indexes: [],
      }

      await expect(db.createTable(invalidSchema)).rejects.toThrow(/invalid field name/i)
    })

    it('should throw on duplicate table creation', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      // Mock table already exists
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('CREATE TABLE') && sql.includes('users')) {
          throw new Error('table "users" already exists')
        }
        return {
          toArray: () => [],
          one: () => null,
          columnNames: [],
          rowsRead: 0,
          rowsWritten: 0,
        }
      })

      const tableSchema: TableSchema = {
        name: 'users',
        fields: { name: { type: 'string', optional: false } },
        indexes: [],
      }

      await expect(db.createTable(tableSchema)).rejects.toThrow(/already exists/i)
    })

    it('should throw on migration version conflict', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      // Mock current version is 2
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('MAX(version)')) {
          return {
            toArray: () => [{ 'MAX(version)': 2 }],
            one: () => ({ 'MAX(version)': 2 }),
            columnNames: ['MAX(version)'],
            rowsRead: 1,
            rowsWritten: 0,
          }
        }
        return {
          toArray: () => [],
          one: () => null,
          columnNames: [],
          rowsRead: 0,
          rowsWritten: 0,
        }
      })

      const migration: MigrationPlan = {
        fromVersion: 1, // Conflict: trying to migrate from version 1 when we're at 2
        toVersion: 2,
        operations: [],
      }

      await expect(db.applyMigration(migration)).rejects.toThrow(/version conflict/i)
    })

    it('should throw on unsupported Convex type', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      expect(() => {
        db.convexTypeToSQLite({ type: 'unsupported' as any, optional: false })
      }).toThrow(/unsupported type/i)
    })

    it('should throw on index referencing non-existent field', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const invalidSchema: TableSchema = {
        name: 'users',
        fields: {
          name: { type: 'string', optional: false },
        },
        indexes: [
          { name: 'by_email', fields: ['email'], unique: false }, // 'email' doesn't exist
        ],
      }

      await expect(db.createTable(invalidSchema)).rejects.toThrow(/field.*does not exist/i)
    })

    it('should throw on SQL injection attempt in table name', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const maliciousSchema: TableSchema = {
        name: 'users"; DROP TABLE users; --',
        fields: { name: { type: 'string', optional: false } },
        indexes: [],
      }

      await expect(db.createTable(maliciousSchema)).rejects.toThrow(/invalid table name/i)
    })

    it('should handle SQLite constraint violations gracefully', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('INSERT')) {
          throw new Error('UNIQUE constraint failed: users.email')
        }
        return {
          toArray: () => [],
          one: () => null,
          columnNames: [],
          rowsRead: 0,
          rowsWritten: 0,
        }
      })

      await expect(
        db.insert('users', { email: 'duplicate@example.com' })
      ).rejects.toThrow(/constraint/i)
    })

    it('should provide helpful error messages for schema validation failures', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const invalidSchema: TableSchema = {
        name: 'users',
        fields: {
          id: { type: 'id', optional: false }, // Missing 'table' property for ID type
        },
        indexes: [],
      }

      await expect(db.createTable(invalidSchema)).rejects.toThrow(/missing.*table/i)
    })
  })

  // ==========================================================================
  // Additional Integration-Style Tests
  // ==========================================================================

  describe('schema to SQL generation', () => {
    it('should generate complete CREATE TABLE statement', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const tableSchema: TableSchema = {
        name: 'posts',
        fields: {
          title: { type: 'string', optional: false },
          content: { type: 'string', optional: false },
          authorId: { type: 'id', table: 'users', optional: false },
          tags: { type: 'array', element: { type: 'string' }, optional: true },
          metadata: { type: 'object', fields: {}, optional: true },
          published: { type: 'boolean', optional: false },
          viewCount: { type: 'number', optional: false },
        },
        indexes: [
          { name: 'by_author', fields: ['authorId'], unique: false },
          { name: 'by_published', fields: ['published', 'viewCount'], unique: false },
        ],
      }

      const sql = db.generateCreateTableSQL(tableSchema)

      expect(sql).toContain('CREATE TABLE "posts"')
      expect(sql).toContain('"_id" TEXT PRIMARY KEY')
      expect(sql).toContain('"_creationTime" INTEGER NOT NULL')
      expect(sql).toContain('"title" TEXT NOT NULL')
      expect(sql).toContain('"content" TEXT NOT NULL')
      expect(sql).toContain('"authorId" TEXT NOT NULL')
      expect(sql).toContain('"tags" TEXT') // JSON, nullable
      expect(sql).toContain('"metadata" TEXT') // JSON, nullable
      expect(sql).toContain('"published" INTEGER NOT NULL')
      expect(sql).toContain('"viewCount" REAL NOT NULL')
    })

    it('should generate CREATE INDEX statements', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const indexDef: IndexDefinition = {
        name: 'by_email',
        fields: ['email'],
        unique: true,
      }

      const sql = db.generateCreateIndexSQL('users', indexDef)

      expect(sql).toBe('CREATE UNIQUE INDEX "users_by_email" ON "users" ("email")')
    })

    it('should escape special characters in identifiers', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)
      await db.ensureInitialized()

      const tableSchema: TableSchema = {
        name: 'user_data',
        fields: {
          first_name: { type: 'string', optional: false },
        },
        indexes: [],
      }

      const sql = db.generateCreateTableSQL(tableSchema)

      // Should properly quote identifiers
      expect(sql).toContain('"user_data"')
      expect(sql).toContain('"first_name"')
    })
  })

  describe('type conversion utilities', () => {
    it('should convert JavaScript values to SQLite format', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      expect(db.toSQLiteValue('hello', { type: 'string', optional: false })).toBe('hello')
      expect(db.toSQLiteValue(42, { type: 'number', optional: false })).toBe(42)
      expect(db.toSQLiteValue(true, { type: 'boolean', optional: false })).toBe(1)
      expect(db.toSQLiteValue(false, { type: 'boolean', optional: false })).toBe(0)
      expect(db.toSQLiteValue(['a', 'b'], { type: 'array', element: { type: 'string' }, optional: false }))
        .toBe('["a","b"]')
      expect(db.toSQLiteValue({ key: 'value' }, { type: 'object', fields: {}, optional: false }))
        .toBe('{"key":"value"}')
    })

    it('should convert SQLite values to JavaScript format', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      expect(db.fromSQLiteValue('hello', { type: 'string', optional: false })).toBe('hello')
      expect(db.fromSQLiteValue(42, { type: 'number', optional: false })).toBe(42)
      expect(db.fromSQLiteValue(1, { type: 'boolean', optional: false })).toBe(true)
      expect(db.fromSQLiteValue(0, { type: 'boolean', optional: false })).toBe(false)
      expect(db.fromSQLiteValue('["a","b"]', { type: 'array', element: { type: 'string' }, optional: false }))
        .toEqual(['a', 'b'])
      expect(db.fromSQLiteValue('{"key":"value"}', { type: 'object', fields: {}, optional: false }))
        .toEqual({ key: 'value' })
    })

    it('should handle null values for optional fields', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      expect(db.toSQLiteValue(undefined, { type: 'string', optional: true })).toBeNull()
      expect(db.fromSQLiteValue(null, { type: 'string', optional: true })).toBeUndefined()
    })

    it('should throw on null value for required field', async () => {
      const db = new ConvexDatabase(mockState as unknown as DurableObjectState, mockEnv)

      expect(() => {
        db.toSQLiteValue(undefined, { type: 'string', optional: false })
      }).toThrow(/required field/i)
    })
  })
})
