/**
 * DatabaseReader Implementation - Layer 4
 *
 * Provides read-only database access for Convex queries.
 * Implements the DatabaseReader interface defined in context.ts
 *
 * Features:
 * - get(id): Get a document by ID
 * - query(table): Start a query builder for a table
 * - normalizeId(table, id): Normalize an ID to canonical form
 */

import type { Id } from '../../types'
import { QueryBuilderImpl, type QueryBuilder } from '../queryBuilder'
import type { FilterExpression } from '../queryBuilder'

// ============================================================================
// Storage Interface
// ============================================================================

/**
 * Storage backend interface for DatabaseReader
 * This abstracts the actual storage implementation (could be Durable Object, etc.)
 */
export interface StorageBackend {
  /**
   * Get a single document by ID
   */
  getDocument(id: string): Promise<Record<string, unknown> | null>

  /**
   * Query documents from a table with optional filters
   */
  queryDocuments(
    tableName: string,
    options?: QueryOptions
  ): Promise<Array<Record<string, unknown> & { _id: string; _creationTime: number }>>
}

/**
 * Query options for storage backend
 */
export interface QueryOptions {
  indexName?: string
  indexFilters?: Array<{ field: string; op: string; value: unknown }>
  filters?: FilterExpression[]
  order?: 'asc' | 'desc'
  limit?: number
}

// ============================================================================
// DatabaseReader Implementation
// ============================================================================

/**
 * DatabaseReader provides read-only access to the database
 */
export class DatabaseReader {
  private storage: StorageBackend

  constructor(storage: StorageBackend) {
    this.storage = storage
  }

  /**
   * Get a document by ID
   */
  async get<TableName extends string>(
    id: Id<TableName>
  ): Promise<Record<string, unknown> | null> {
    return this.storage.getDocument(id as string)
  }

  /**
   * Start building a query for a table
   */
  query<TableName extends string>(tableName: TableName): QueryBuilder<TableName> {
    // Create a query builder with a fetch function that uses our storage
    const dbFetch = async (query: QueryBuilderImpl<TableName>) => {
      const options: QueryOptions = {
        indexName: query.getIndexName(),
        indexFilters: query.getIndexFilters(),
        filters: query.getFilterExpressions(),
        order: query.getOrder(),
        limit: query.getLimit(),
      }

      return this.storage.queryDocuments(tableName, options)
    }

    return new QueryBuilderImpl(tableName, dbFetch)
  }

  /**
   * Normalize a string to a valid ID for a table
   * Returns null if the string is not a valid ID format
   */
  normalizeId<TableName extends string>(
    tableName: TableName,
    id: string
  ): Id<TableName> | null {
    // Validate input type
    if (typeof id !== 'string') {
      return null
    }

    // Empty string is not valid
    if (id === '' || id.trim() === '') {
      return null
    }

    // Check for valid characters (base64-url safe: alphanumeric, underscore, hyphen)
    const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
    if (!VALID_ID_PATTERN.test(id)) {
      return null
    }

    // Check for maximum length (128 characters is reasonable for Convex IDs)
    const MAX_ID_LENGTH = 128
    if (id.length > MAX_ID_LENGTH) {
      return null
    }

    // Return as typed ID
    return id as Id<TableName>
  }
}

// ============================================================================
// In-Memory Storage Backend (for testing)
// ============================================================================

/**
 * In-memory storage backend for testing and development
 */
export class InMemoryStorage implements StorageBackend {
  private documents = new Map<string, Record<string, unknown> & { _id: string; _creationTime: number }>()

  async getDocument(id: string): Promise<Record<string, unknown> | null> {
    return this.documents.get(id) || null
  }

  async queryDocuments(
    tableName: string,
    options?: QueryOptions
  ): Promise<Array<Record<string, unknown> & { _id: string; _creationTime: number }>> {
    // Get all documents for this table
    let results: Array<Record<string, unknown> & { _id: string; _creationTime: number }> = []

    for (const [id, doc] of this.documents) {
      if (id.startsWith(`${tableName}_`)) {
        results.push(doc)
      }
    }

    // Apply index filters
    if (options?.indexFilters && options.indexFilters.length > 0) {
      results = results.filter((doc) => {
        return options.indexFilters!.every((filter) => {
          const value = doc[filter.field]
          return this.evaluateFilter(value, filter.op, filter.value)
        })
      })
    }

    // Apply filters (from .filter() calls)
    if (options?.filters && options.filters.length > 0) {
      for (const filter of options.filters) {
        results = results.filter((doc) => this.evaluateFilterExpression(doc, filter))
      }
    }

    // Apply ordering
    const order = options?.order || 'asc'
    results.sort((a, b) => {
      if (order === 'asc') {
        return a._creationTime - b._creationTime
      } else {
        return b._creationTime - a._creationTime
      }
    })

    // Apply limit
    if (options?.limit !== undefined) {
      results = results.slice(0, options.limit)
    }

    return results
  }

  /**
   * Evaluate a filter operation
   */
  private evaluateFilter(value: unknown, op: string, target: unknown): boolean {
    switch (op) {
      case 'eq':
        return value === target
      case 'neq':
        return value !== target
      case 'lt':
        return (value as number) < (target as number)
      case 'lte':
        return (value as number) <= (target as number)
      case 'gt':
        return (value as number) > (target as number)
      case 'gte':
        return (value as number) >= (target as number)
      default:
        return false
    }
  }

  /**
   * Evaluate a filter expression
   */
  private evaluateFilterExpression(doc: Record<string, unknown>, filter: FilterExpression): boolean {
    const filterObj = filter as unknown as {
      type: string
      field?: string
      value?: unknown
      filters?: FilterExpression[]
      filter?: FilterExpression
    }

    switch (filterObj.type) {
      case 'eq':
        return doc[filterObj.field!] === filterObj.value
      case 'neq':
        return doc[filterObj.field!] !== filterObj.value
      case 'lt':
        return (doc[filterObj.field!] as number) < (filterObj.value as number)
      case 'lte':
        return (doc[filterObj.field!] as number) <= (filterObj.value as number)
      case 'gt':
        return (doc[filterObj.field!] as number) > (filterObj.value as number)
      case 'gte':
        return (doc[filterObj.field!] as number) >= (filterObj.value as number)
      case 'and':
        return filterObj.filters!.every((f) => this.evaluateFilterExpression(doc, f))
      case 'or':
        return filterObj.filters!.some((f) => this.evaluateFilterExpression(doc, f))
      case 'not':
        return !this.evaluateFilterExpression(doc, filterObj.filter!)
      default:
        return true
    }
  }

  /**
   * Add a document to storage (for testing)
   */
  addDocument(id: string, doc: Record<string, unknown> & { _id: string; _creationTime: number }) {
    this.documents.set(id, doc)
  }

  /**
   * Clear all documents (for testing)
   */
  clear() {
    this.documents.clear()
  }
}
