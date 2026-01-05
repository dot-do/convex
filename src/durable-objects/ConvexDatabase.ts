/**
 * ConvexDatabase Durable Object
 *
 * Core persistence layer using SQLite storage.
 * Provides ACID-compliant document storage with indexes.
 */

import type { Env } from '../env'

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

export class ConvexDatabase implements DurableObject {
  private state: DurableObjectState
  private env: Env
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
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return

    await this.state.blockConcurrencyWhile(async () => {
      if (this.initialized) return

      // Create metadata table for tracking tables
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS _metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
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
   * Insert a new document
   */
  async insert(tableName: string, doc: Omit<Document, '_id' | '_creationTime'>): Promise<string> {
    await this.ensureInitialized()
    this.ensureTable(tableName)

    const id = this.generateId()
    const creationTime = Date.now()

    this.sql.exec(
      `INSERT INTO "${tableName}" (_id, _creationTime, data) VALUES (?, ?, ?)`,
      id,
      creationTime,
      JSON.stringify(doc)
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
      ...(JSON.parse(row.data as string) as Record<string, unknown>),
    }
  }

  /**
   * Patch (partial update) a document
   */
  async patch(tableName: string, id: string, fields: Record<string, unknown>): Promise<void> {
    await this.ensureInitialized()

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
      const whereClauses = filters.map((filter, i) => {
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
      ...(JSON.parse(row.data as string) as Record<string, unknown>),
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

  /**
   * Handle HTTP requests to this Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

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
