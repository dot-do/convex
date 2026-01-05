/**
 * Context types for Convex functions
 *
 * These define the ctx object passed to query, mutation, and action handlers.
 */

import type { Id, UserIdentity, PaginationOptions, PaginationResult, ScheduledFunctionId, StorageId } from '../types'
import type { QueryBuilder } from './queryBuilder'
import type { FunctionReference } from '../types'

// ============================================================================
// Auth Context
// ============================================================================

/**
 * Authentication context available to all function types.
 */
export interface Auth {
  /**
   * Get the identity of the authenticated user.
   * Returns null if not authenticated.
   */
  getUserIdentity(): Promise<UserIdentity | null>
}

// ============================================================================
// Storage Context
// ============================================================================

/**
 * Read-only storage operations.
 */
export interface StorageReader {
  /**
   * Get a URL for downloading a file.
   */
  getUrl(storageId: StorageId): Promise<string | null>

  /**
   * Get metadata for a stored file.
   */
  getMetadata(storageId: StorageId): Promise<{
    storageId: StorageId
    sha256: string
    size: number
    contentType?: string
  } | null>
}

/**
 * Read/write storage operations.
 */
export interface StorageWriter extends StorageReader {
  /**
   * Generate an upload URL for client-side uploads.
   */
  generateUploadUrl(): Promise<string>

  /**
   * Store a blob directly.
   */
  store(blob: Blob): Promise<StorageId>

  /**
   * Delete a stored file.
   */
  delete(storageId: StorageId): Promise<void>
}

// ============================================================================
// Scheduler Context
// ============================================================================

/**
 * Scheduler for delayed function execution.
 */
export interface Scheduler {
  /**
   * Schedule a function to run after a delay.
   */
  runAfter<F extends FunctionReference<'mutation' | 'action'>>(
    delayMs: number,
    functionReference: F,
    args: F['_args']
  ): Promise<ScheduledFunctionId>

  /**
   * Schedule a function to run at a specific time.
   */
  runAt<F extends FunctionReference<'mutation' | 'action'>>(
    timestamp: number | Date,
    functionReference: F,
    args: F['_args']
  ): Promise<ScheduledFunctionId>

  /**
   * Cancel a scheduled function.
   */
  cancel(scheduledFunctionId: ScheduledFunctionId): Promise<void>
}

// ============================================================================
// Database Context
// ============================================================================

/**
 * Read-only database operations.
 */
export interface DatabaseReader {
  /**
   * Get a document by ID.
   */
  get<TableName extends string>(
    id: Id<TableName>
  ): Promise<Record<string, unknown> | null>

  /**
   * Start building a query for a table.
   */
  query<TableName extends string>(
    tableName: TableName
  ): QueryBuilder<TableName>

  /**
   * Normalize a string to a valid ID for a table.
   * Returns null if the string is not a valid ID.
   */
  normalizeId<TableName extends string>(
    tableName: TableName,
    id: string
  ): Id<TableName> | null

  /**
   * Get the system table for querying scheduled functions.
   */
  system: {
    get(id: ScheduledFunctionId): Promise<{
      _id: ScheduledFunctionId
      _creationTime: number
      name: string
      args: unknown[]
      scheduledTime: number
      state: { kind: 'pending' } | { kind: 'inProgress' } | { kind: 'success' } | { kind: 'failed'; error: string } | { kind: 'canceled' }
    } | null>
    query(tableName: '_scheduled_functions'): QueryBuilder<'_scheduled_functions'>
  }
}

/**
 * Read/write database operations.
 */
export interface DatabaseWriter extends DatabaseReader {
  /**
   * Insert a new document.
   */
  insert<TableName extends string>(
    tableName: TableName,
    document: Record<string, unknown>
  ): Promise<Id<TableName>>

  /**
   * Update specific fields of a document.
   */
  patch<TableName extends string>(
    id: Id<TableName>,
    fields: Partial<Record<string, unknown>>
  ): Promise<void>

  /**
   * Replace a document entirely.
   */
  replace<TableName extends string>(
    id: Id<TableName>,
    document: Record<string, unknown>
  ): Promise<void>

  /**
   * Delete a document.
   */
  delete(id: Id<string>): Promise<void>
}

// ============================================================================
// Function Contexts
// ============================================================================

/**
 * Context for query functions.
 * Queries are read-only and must be deterministic.
 */
export interface QueryCtx {
  /** Read-only database access */
  db: DatabaseReader
  /** Authentication context */
  auth: Auth
  /** Read-only storage access */
  storage: StorageReader
}

/**
 * Context for mutation functions.
 * Mutations can read and write data.
 */
export interface MutationCtx {
  /** Read/write database access */
  db: DatabaseWriter
  /** Authentication context */
  auth: Auth
  /** Read/write storage access */
  storage: StorageWriter
  /** Scheduler for delayed execution */
  scheduler: Scheduler
}

/**
 * Context for action functions.
 * Actions can perform arbitrary operations including external API calls.
 */
export interface ActionCtx {
  /** Authentication context */
  auth: Auth
  /** Read-only storage access */
  storage: StorageReader
  /** Scheduler for delayed execution */
  scheduler: Scheduler

  /**
   * Run a query from within an action.
   */
  runQuery<F extends FunctionReference<'query'>>(
    query: F,
    args: F['_args']
  ): Promise<F['_returns']>

  /**
   * Run a mutation from within an action.
   */
  runMutation<F extends FunctionReference<'mutation'>>(
    mutation: F,
    args: F['_args']
  ): Promise<F['_returns']>

  /**
   * Run another action from within an action.
   */
  runAction<F extends FunctionReference<'action'>>(
    action: F,
    args: F['_args']
  ): Promise<F['_returns']>

  /**
   * Perform a vector search.
   */
  vectorSearch<TableName extends string>(
    tableName: TableName,
    indexName: string,
    query: {
      vector: number[]
      limit?: number
      filter?: (q: unknown) => unknown
    }
  ): Promise<Array<{ _id: Id<TableName>; _score: number }>>
}
