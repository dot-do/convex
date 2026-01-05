/**
 * ConvexDatabase Durable Object
 *
 * Core persistence layer using SQLite storage.
 * Provides ACID-compliant document storage with indexes.
 */

import type { Env } from '../env'

// ============================================================================
// Type Definitions
// ============================================================================

interface Document {
  _id: string
  _creationTime: number
  [key: string]: unknown
}

interface QueryFilter {
  field: string
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'
  value: unknown
}

interface QueryOptions {
  order?: {
    field: string
    direction: 'asc' | 'desc'
  }
  limit?: number
  cursor?: string
}

// Exported types for schema management
export interface FieldDefinition {
  type: string
  optional: boolean
  table?: string  // For ID references
  element?: FieldDefinition  // For arrays
  fields?: Record<string, FieldDefinition>  // For objects
  variants?: FieldDefinition[]  // For unions
  value?: unknown  // For literals
}

export interface IndexDefinition {
  name: string
  fields: string[]
  unique: boolean
}

export interface TableSchema {
  name: string
  fields: Record<string, FieldDefinition>
  indexes: IndexDefinition[]
}

export interface SchemaDefinition {
  tables: Record<string, TableSchema>
}

export interface MigrationOperation {
  type: 'addColumn' | 'dropColumn' | 'createTable' | 'dropTable' | 'createIndex' | 'dropIndex'
  table: string
  column?: string
  definition?: FieldDefinition
  index?: IndexDefinition
}

export interface MigrationPlan {
  fromVersion: number
  toVersion: number
  operations: MigrationOperation[]
  expectedSchemaHash?: string
}

export type SQLiteColumnType = 'TEXT' | 'REAL' | 'INTEGER' | 'BLOB'

// Reserved system table names
const RESERVED_TABLES = new Set(['_documents', '_schema_versions', '_metadata'])

export class ConvexDatabase implements DurableObject {
  private state: DurableObjectState
  protected env: Env
  private sql: SqlStorage
  private initialized = false
  private tables: Set<string> = new Set()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.sql = state.storage.sql
  }

  /**
   * Initialize the database schema
   */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) return

    await this.state.blockConcurrencyWhile(async () => {
      if (this.initialized) return

      // Set SQLite pragmas for performance
      this.sql.exec('PRAGMA journal_mode=WAL')
      this.sql.exec('PRAGMA foreign_keys=ON')

      // Create metadata table for tracking tables
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS _metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `)

      // Create _documents system table for tracking all documents
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS _documents (
          _id TEXT PRIMARY KEY,
          _table TEXT NOT NULL,
          _creationTime INTEGER NOT NULL
        )
      `)

      // Create _schema_versions system table for migration tracking
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS _schema_versions (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          schema_hash TEXT NOT NULL
        )
      `)

      // Load existing tables
      const tablesResult = this.sql.exec(
        `SELECT value FROM _metadata WHERE key = 'tables'`
      ).toArray()

      if (tablesResult.length > 0 && tablesResult[0]) {
        const tables = JSON.parse(tablesResult[0].value as string) as string[]
        tables.forEach(t => this.tables.add(t))
      }

      this.initialized = true
    })
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Ensure a table exists, creating it if necessary
   */
  private ensureTable(tableName: string): void {
    if (this.tables.has(tableName)) return

    // Create the table with JSON storage
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        _id TEXT PRIMARY KEY,
        _creationTime INTEGER NOT NULL,
        data TEXT NOT NULL
      )
    `)

    // Create index on creation time
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS "${tableName}_creation_time"
      ON "${tableName}" (_creationTime)
    `)

    this.tables.add(tableName)

    // Update metadata
    this.sql.exec(
      `INSERT OR REPLACE INTO _metadata (key, value) VALUES ('tables', ?)`,
      JSON.stringify([...this.tables])
    )
  }

  /**
   * Generate a unique document ID
   */
  private generateId(): string {
    // Generate a URL-safe base64 ID similar to Convex
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  /**
   * Validate a document value for Convex compatibility
   */
  private validateValue(value: unknown, path: string = ''): void {
    if (value === undefined) {
      throw new Error(`Invalid value at ${path || 'root'}: undefined is not allowed (use null instead)`)
    }
    if (typeof value === 'function') {
      throw new Error(`Invalid value at ${path || 'root'}: functions are not serializable`)
    }
    if (typeof value === 'symbol') {
      throw new Error(`Invalid value at ${path || 'root'}: symbols are not serializable`)
    }
    if (typeof value === 'number') {
      if (Number.isNaN(value)) {
        throw new Error(`Invalid value at ${path || 'root'}: NaN is not a valid number`)
      }
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid value at ${path || 'root'}: Infinity is not a valid number`)
      }
    }
    // BigInt is valid for int64 fields
    if (typeof value === 'bigint') {
      // BigInt is allowed - it will be serialized specially
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => this.validateValue(item, `${path}[${index}]`))
    } else if (value !== null && typeof value === 'object' && !(value instanceof ArrayBuffer)) {
      // Check for circular references by trying to stringify
      try {
        JSON.stringify(value)
      } catch (e) {
        if ((e as Error).message.includes('circular')) {
          throw new Error(`Invalid value at ${path || 'root'}: circular references are not allowed`)
        }
      }
      // Recursively validate object properties
      for (const [key, val] of Object.entries(value)) {
        this.validateValue(val, path ? `${path}.${key}` : key)
      }
    }
  }

  /**
   * Validate document for insert/update
   */
  private validateDocument(doc: Record<string, unknown>): void {
    // Check for system field tampering
    if ('_id' in doc) {
      throw new Error('Cannot specify _id on insert - it is auto-generated')
    }
    if ('_creationTime' in doc) {
      throw new Error('Cannot specify _creationTime on insert - it is auto-generated')
    }

    // Validate all values
    this.validateValue(doc)
  }

  /**
   * Serialize a document for storage
   * Handles BigInt and ArrayBuffer special cases
   */
  private serializeDocument(doc: Record<string, unknown>): string {
    return JSON.stringify(doc, (_key, value) => {
      if (typeof value === 'bigint') {
        return { __type: 'bigint', value: value.toString() }
      }
      if (value instanceof ArrayBuffer) {
        return { __type: 'arraybuffer', value: Array.from(new Uint8Array(value)) }
      }
      return value
    })
  }

  /**
   * Deserialize a document from storage
   * Handles BigInt and ArrayBuffer special cases
   */
  private deserializeDocument(data: string): Record<string, unknown> {
    return JSON.parse(data, (_key, value) => {
      if (value && typeof value === 'object' && value.__type === 'bigint') {
        return BigInt(value.value)
      }
      if (value && typeof value === 'object' && value.__type === 'arraybuffer') {
        return new Uint8Array(value.value).buffer
      }
      return value
    })
  }

  /**
   * Insert a new document
   */
  async insert(tableName: string, doc: Omit<Document, '_id' | '_creationTime'>): Promise<string> {
    await this.ensureInitialized()

    // Validate document
    this.validateDocument(doc as Record<string, unknown>)

    this.ensureTable(tableName)

    const id = this.generateId()
    const creationTime = Date.now()

    this.sql.exec(
      `INSERT INTO "${tableName}" (_id, _creationTime, data) VALUES (?, ?, ?)`,
      id,
      creationTime,
      this.serializeDocument(doc as Record<string, unknown>)
    )

    // Also track in _documents
    this.sql.exec(
      `INSERT INTO _documents (_id, _table, _creationTime) VALUES (?, ?, ?)`,
      id,
      tableName,
      creationTime
    )

    return id
  }

  /**
   * Get a document by ID
   */
  async get(tableName: string, id: string): Promise<Document | null> {
    await this.ensureInitialized()

    if (!this.tables.has(tableName)) {
      return null
    }

    const results = this.sql.exec(
      `SELECT _id, _creationTime, data FROM "${tableName}" WHERE _id = ?`,
      id
    ).toArray()

    if (results.length === 0 || !results[0]) {
      return null
    }

    const row = results[0]
    return {
      _id: row._id as string,
      _creationTime: row._creationTime as number,
      ...this.deserializeDocument(row.data as string),
    }
  }

  /**
   * Validate fields for patch/update
   */
  private validatePatchFields(fields: Record<string, unknown>): void {
    // Check for system field tampering
    if ('_id' in fields) {
      throw new Error('Cannot patch _id field - it is immutable')
    }
    if ('_creationTime' in fields) {
      throw new Error('Cannot patch _creationTime field - it is immutable')
    }

    // Validate all values
    this.validateValue(fields)
  }

  /**
   * Patch (partial update) a document
   */
  async patch(tableName: string, id: string, fields: Record<string, unknown>): Promise<void> {
    await this.ensureInitialized()

    // Validate fields
    this.validatePatchFields(fields)

    if (!this.tables.has(tableName)) {
      throw new Error(`Table "${tableName}" does not exist`)
    }

    const existing = await this.get(tableName, id)
    if (!existing) {
      throw new Error(`Document "${id}" not found in table "${tableName}"`)
    }

    const { _id, _creationTime, ...existingData } = existing
    const newData = { ...existingData, ...fields }

    this.sql.exec(
      `UPDATE "${tableName}" SET data = ? WHERE _id = ?`,
      JSON.stringify(newData),
      id
    )
  }

  /**
   * Replace a document entirely
   */
  async replace(tableName: string, id: string, doc: Omit<Document, '_id' | '_creationTime'>): Promise<void> {
    await this.ensureInitialized()

    // Validate doc (no system fields allowed)
    this.validateValue(doc)

    if (!this.tables.has(tableName)) {
      throw new Error(`Table "${tableName}" does not exist`)
    }

    const result = this.sql.exec(
      `UPDATE "${tableName}" SET data = ? WHERE _id = ?`,
      JSON.stringify(doc),
      id
    )

    if (result.rowsWritten === 0) {
      throw new Error(`Document "${id}" not found in table "${tableName}"`)
    }
  }

  /**
   * Delete a document
   */
  async delete(tableName: string, id: string): Promise<void> {
    await this.ensureInitialized()

    if (!this.tables.has(tableName)) {
      return // Nothing to delete
    }

    this.sql.exec(`DELETE FROM "${tableName}" WHERE _id = ?`, id)

    // Also remove from _documents
    this.sql.exec(`DELETE FROM _documents WHERE _id = ?`, id)
  }

  /**
   * Query documents with filters
   */
  async query(
    tableName: string,
    filters: QueryFilter[] = [],
    options: QueryOptions = {}
  ): Promise<Document[]> {
    await this.ensureInitialized()

    if (!this.tables.has(tableName)) {
      return []
    }

    let sql = `SELECT _id, _creationTime, data FROM "${tableName}"`
    const params: unknown[] = []

    // Build WHERE clause from filters
    if (filters.length > 0) {
      const whereClauses = filters.map((filter) => {
        const op = this.translateOperator(filter.operator)
        params.push(JSON.stringify(filter.value))
        // Use json_extract for nested field access
        return `json_extract(data, '$.${filter.field}') ${op} ?`
      })
      sql += ` WHERE ${whereClauses.join(' AND ')}`
    }

    // Add ORDER BY
    if (options.order) {
      const direction = options.order.direction === 'desc' ? 'DESC' : 'ASC'
      if (options.order.field === '_creationTime') {
        sql += ` ORDER BY _creationTime ${direction}`
      } else {
        sql += ` ORDER BY json_extract(data, '$.${options.order.field}') ${direction}`
      }
    } else {
      sql += ` ORDER BY _creationTime ASC`
    }

    // Add LIMIT
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`
    }

    const results = this.sql.exec(sql, ...params).toArray()

    return results.map(row => ({
      _id: row._id as string,
      _creationTime: row._creationTime as number,
      ...this.deserializeDocument(row.data as string),
    }))
  }

  /**
   * Translate filter operator to SQL
   */
  private translateOperator(op: QueryFilter['operator']): string {
    switch (op) {
      case 'eq': return '='
      case 'neq': return '!='
      case 'lt': return '<'
      case 'lte': return '<='
      case 'gt': return '>'
      case 'gte': return '>='
      default: throw new Error(`Unknown operator: ${op}`)
    }
  }

  /**
   * Run a transaction
   */
  async runTransaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureInitialized()

    this.sql.exec('BEGIN TRANSACTION')
    try {
      const result = await fn()
      this.sql.exec('COMMIT')
      return result
    } catch (error) {
      this.sql.exec('ROLLBACK')
      throw error
    }
  }

  // ============================================================================
  // Type Conversion Methods
  // ============================================================================

  /**
   * Convert a JavaScript value to SQLite-compatible format
   */
  toSQLiteValue(value: unknown, fieldConfig: { type: string; optional: boolean }): unknown {
    if (value === undefined || value === null) {
      if (!fieldConfig.optional) {
        throw new Error('Cannot set undefined/null for required field')
      }
      return null
    }

    // Convert based on type
    if (fieldConfig.type === 'boolean') {
      return value ? 1 : 0
    }
    if (fieldConfig.type === 'object' || fieldConfig.type === 'array') {
      return JSON.stringify(value)
    }
    return value
  }

  /**
   * Convert a SQLite value back to JavaScript format
   */
  fromSQLiteValue(value: unknown, fieldConfig: { type: string; optional: boolean }): unknown {
    if (value === null) {
      return fieldConfig.optional ? undefined : null
    }

    // Convert based on type
    if (fieldConfig.type === 'boolean') {
      return value === 1
    }
    if (fieldConfig.type === 'object' || fieldConfig.type === 'array') {
      return typeof value === 'string' ? JSON.parse(value) : value
    }
    return value
  }

  // ============================================================================
  // Type Mapping Methods
  // ============================================================================

  /**
   * Convert a Convex field type to SQLite column type
   */
  convexTypeToSQLite(fieldDef: FieldDefinition): string {
    const { type, optional } = fieldDef
    const nullSuffix = optional ? '' : ' NOT NULL'

    switch (type) {
      case 'string':
        return `TEXT${nullSuffix}`
      case 'number':
      case 'float64':
        return `REAL${nullSuffix}`
      case 'boolean':
        return `INTEGER${nullSuffix}`
      case 'int64':
        return `INTEGER${nullSuffix}`
      case 'bytes':
        return `BLOB${nullSuffix}`
      case 'id':
        return `TEXT${nullSuffix}`
      case 'array':
      case 'object':
      case 'union':
        return `TEXT${nullSuffix}`  // JSON stored as TEXT
      case 'null':
        return 'TEXT DEFAULT NULL'
      case 'literal':
        // Determine type from literal value
        if (typeof fieldDef.value === 'string') return `TEXT${nullSuffix}`
        if (typeof fieldDef.value === 'number') return `REAL${nullSuffix}`
        if (typeof fieldDef.value === 'boolean') return `INTEGER${nullSuffix}`
        return `TEXT${nullSuffix}`
      default:
        throw new Error(`Unsupported type: ${type}`)
    }
  }

  // ============================================================================
  // Schema Management Methods
  // ============================================================================

  /**
   * Validate table name
   */
  private validateTableName(name: string): void {
    if (!name || name.trim() === '') {
      throw new Error('Invalid table name: name cannot be empty')
    }
    if (RESERVED_TABLES.has(name)) {
      throw new Error(`Reserved table name: ${name}`)
    }
    // Check for SQL injection attempts
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid table name: ${name}`)
    }
  }

  /**
   * Validate field name
   */
  private validateFieldName(name: string): void {
    if (name.startsWith('_')) {
      throw new Error(`Invalid field name: ${name} (underscore prefix reserved for system fields)`)
    }
  }

  /**
   * Generate CREATE TABLE SQL from schema
   */
  generateCreateTableSQL(schema: TableSchema): string {
    this.validateTableName(schema.name)

    const columns: string[] = [
      '"_id" TEXT PRIMARY KEY',
      '"_creationTime" INTEGER NOT NULL',
    ]

    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      this.validateFieldName(fieldName)

      // Validate ID fields have table reference
      if (fieldDef.type === 'id' && !fieldDef.table) {
        throw new Error(`ID field "${fieldName}" missing table reference`)
      }

      const sqlType = this.convexTypeToSQLite(fieldDef)
      columns.push(`"${fieldName}" ${sqlType}`)

      // Add CHECK constraint for ID fields
      if (fieldDef.type === 'id') {
        columns.push(`CHECK(typeof("${fieldName}") = 'text' OR "${fieldName}" IS NULL)`)
      }
    }

    return `CREATE TABLE "${schema.name}" (${columns.join(', ')})`
  }

  /**
   * Generate CREATE INDEX SQL
   */
  generateCreateIndexSQL(tableName: string, indexDef: IndexDefinition): string {
    const uniqueKeyword = indexDef.unique ? 'UNIQUE ' : ''
    const indexName = `${tableName}_${indexDef.name}`
    const fields = indexDef.fields.map(f => `"${f}"`).join(', ')

    return `CREATE ${uniqueKeyword}INDEX "${indexName}" ON "${tableName}" (${fields})`
  }

  /**
   * Create a table from schema definition
   */
  async createTable(schema: TableSchema): Promise<void> {
    await this.ensureInitialized()

    // Validate table name
    this.validateTableName(schema.name)

    // Validate all field names
    for (const fieldName of Object.keys(schema.fields)) {
      this.validateFieldName(fieldName)
    }

    // Validate ID fields have table reference
    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      if (fieldDef.type === 'id' && !fieldDef.table) {
        throw new Error(`ID field "${fieldName}" missing table reference`)
      }
    }

    // Validate indexes reference existing fields
    for (const index of schema.indexes) {
      for (const field of index.fields) {
        if (!schema.fields[field] && field !== '_id' && field !== '_creationTime') {
          throw new Error(`Index "${index.name}" references field "${field}" which does not exist`)
        }
      }
    }

    // Generate and execute CREATE TABLE
    const createTableSQL = this.generateCreateTableSQL(schema)
    this.sql.exec(createTableSQL)

    // Create indexes
    for (const index of schema.indexes) {
      const createIndexSQL = this.generateCreateIndexSQL(schema.name, index)
      this.sql.exec(createIndexSQL)
    }

    this.tables.add(schema.name)

    // Update metadata
    this.sql.exec(
      `INSERT OR REPLACE INTO _metadata (key, value) VALUES ('tables', ?)`,
      JSON.stringify([...this.tables])
    )
  }

  /**
   * Get current schema version
   */
  async getCurrentSchemaVersion(): Promise<number> {
    await this.ensureInitialized()

    const result = this.sql.exec(
      'SELECT MAX(version) as version FROM _schema_versions'
    ).toArray()

    const firstRow = result[0]
    if (result.length === 0 || firstRow === undefined || firstRow.version === null) {
      return 0
    }

    return firstRow.version as number
  }

  /**
   * Compute a hash for a schema definition
   */
  private computeSchemaHash(schema: SchemaDefinition): string {
    const str = JSON.stringify(schema)
    // Simple hash function
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return hash.toString(16)
  }

  /**
   * Apply a migration plan
   */
  async applyMigration(migration: MigrationPlan): Promise<void> {
    await this.ensureInitialized()

    // Check current version
    const currentVersion = await this.getCurrentSchemaVersion()

    if (migration.fromVersion !== currentVersion) {
      throw new Error(`Version conflict: expected version ${migration.fromVersion}, current version is ${currentVersion}`)
    }

    // Check schema hash if provided
    if (migration.expectedSchemaHash) {
      const result = this.sql.exec(
        'SELECT schema_hash FROM _schema_versions WHERE version = ?',
        migration.fromVersion
      ).toArray()

      if (result.length > 0 && result[0]?.schema_hash !== migration.expectedSchemaHash) {
        throw new Error(`Schema hash mismatch: expected ${migration.expectedSchemaHash}`)
      }
    }

    // Begin transaction
    this.sql.exec('BEGIN TRANSACTION')

    try {
      // Apply each operation
      for (const op of migration.operations) {
        switch (op.type) {
          case 'addColumn':
            const colType = op.definition ? this.convexTypeToSQLite(op.definition) : 'TEXT'
            this.sql.exec(`ALTER TABLE "${op.table}" ADD COLUMN "${op.column}" ${colType}`)
            break
          case 'dropColumn':
            this.sql.exec(`ALTER TABLE "${op.table}" DROP COLUMN "${op.column}"`)
            break
          case 'createTable':
            // Would need full table schema here
            break
          case 'dropTable':
            this.sql.exec(`DROP TABLE IF EXISTS "${op.table}"`)
            break
          case 'createIndex':
            if (op.index) {
              const indexSQL = this.generateCreateIndexSQL(op.table, op.index)
              this.sql.exec(indexSQL)
            }
            break
          case 'dropIndex':
            if (op.index) {
              this.sql.exec(`DROP INDEX IF EXISTS "${op.table}_${op.index.name}"`)
            }
            break
        }
      }

      // Record the new version
      this.sql.exec(
        'INSERT INTO _schema_versions (version, applied_at, schema_hash) VALUES (?, ?, ?)',
        migration.toVersion,
        Date.now(),
        'migrated'
      )

      this.sql.exec('COMMIT')
    } catch (error) {
      this.sql.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * Apply a full schema definition
   */
  async applySchema(schema: SchemaDefinition): Promise<void> {
    await this.ensureInitialized()

    const schemaHash = this.computeSchemaHash(schema)
    const currentVersion = await this.getCurrentSchemaVersion()
    const newVersion = currentVersion + 1

    // Create all tables
    for (const tableSchema of Object.values(schema.tables)) {
      await this.createTable(tableSchema)
    }

    // Record version
    this.sql.exec(
      'INSERT INTO _schema_versions (version, applied_at, schema_hash) VALUES (?, ?, ?)',
      newVersion,
      Date.now(),
      schemaHash
    )
  }

  // ============================================================================
  // System Table Methods
  // ============================================================================

  /**
   * List all document IDs in a table
   */
  async listDocumentIds(tableName: string): Promise<string[]> {
    await this.ensureInitialized()

    const result = this.sql.exec(
      'SELECT _id FROM _documents WHERE _table = ?',
      tableName
    ).toArray()

    return result.map(row => row._id as string)
  }

  /**
   * Get document count for a table
   */
  async getDocumentCount(tableName: string): Promise<number> {
    await this.ensureInitialized()

    const result = this.sql.exec(
      'SELECT COUNT(*) as count FROM _documents WHERE _table = ?',
      tableName
    ).toArray()

    return (result[0]?.count as number) ?? 0
  }

  /**
   * Handle HTTP requests to this Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    new URL(request.url)  // validate URL

    try {
      await this.ensureInitialized()

      if (request.method === 'POST') {
        const body = await request.json() as {
          operation: string
          table?: string
          id?: string
          doc?: Record<string, unknown>
          fields?: Record<string, unknown>
          filters?: QueryFilter[]
          options?: QueryOptions
        }

        switch (body.operation) {
          case 'insert':
            const insertId = await this.insert(body.table!, body.doc!)
            return Response.json({ id: insertId })

          case 'get':
            const doc = await this.get(body.table!, body.id!)
            return Response.json({ document: doc })

          case 'patch':
            await this.patch(body.table!, body.id!, body.fields!)
            return Response.json({ success: true })

          case 'replace':
            await this.replace(body.table!, body.id!, body.doc!)
            return Response.json({ success: true })

          case 'delete':
            await this.delete(body.table!, body.id!)
            return Response.json({ success: true })

          case 'query':
            const results = await this.query(body.table!, body.filters, body.options)
            return Response.json({ documents: results })

          default:
            return Response.json({ error: 'Unknown operation' }, { status: 400 })
        }
      }

      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: 500 }
      )
    }
  }
}
