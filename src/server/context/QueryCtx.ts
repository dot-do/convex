/**
 * QueryCtx Implementation
 *
 * Provides the context object for Convex query functions with read-only access
 * to database, authentication, and storage.
 *
 * Layer 4: Server Context Objects
 */

import type { QueryCtx, DatabaseReader, Auth, StorageReader } from '../context'
import type { Id, UserIdentity, StorageId, ScheduledFunctionId } from '../../types'
import { QueryBuilderImpl, type QueryBuilder } from '../queryBuilder'

// ============================================================================
// DatabaseReader Implementation
// ============================================================================

/**
 * Implementation of read-only database operations.
 */
export class DatabaseReaderImpl implements DatabaseReader {
  /**
   * Get a document by ID.
   */
  async get<TableName extends string>(
    id: Id<TableName>
  ): Promise<Record<string, unknown> | null> {
    // In a real implementation, this would fetch from the database
    // For now, this is a placeholder that should be overridden
    throw new Error('DatabaseReader.get() must be implemented by runtime')
  }

  /**
   * Start building a query for a table.
   */
  query<TableName extends string>(
    tableName: TableName
  ): QueryBuilder<TableName> {
    // Create a query builder with a fetch function
    // In a real implementation, the fetch function would be provided by the runtime
    return new QueryBuilderImpl(tableName, async (query) => {
      throw new Error('Query execution must be implemented by runtime')
    })
  }

  /**
   * Normalize a string to a valid ID for a table.
   * Returns null if the string is not a valid ID.
   */
  normalizeId<TableName extends string>(
    tableName: TableName,
    id: string
  ): Id<TableName> | null {
    // In a real implementation, this would validate and normalize the ID
    // For now, this is a placeholder
    throw new Error('DatabaseReader.normalizeId() must be implemented by runtime')
  }

  /**
   * System table access for scheduled functions.
   */
  system = {
    get: async (id: ScheduledFunctionId): Promise<{
      _id: ScheduledFunctionId
      _creationTime: number
      name: string
      args: unknown[]
      scheduledTime: number
      state: { kind: 'pending' } | { kind: 'inProgress' } | { kind: 'success' } | { kind: 'failed'; error: string } | { kind: 'canceled' }
    } | null> => {
      throw new Error('DatabaseReader.system.get() must be implemented by runtime')
    },
    query: (tableName: '_scheduled_functions'): QueryBuilder<'_scheduled_functions'> => {
      return new QueryBuilderImpl(tableName, async (query) => {
        throw new Error('Query execution must be implemented by runtime')
      })
    },
  }
}

// ============================================================================
// Auth Implementation
// ============================================================================

/**
 * Implementation of authentication context.
 */
export class AuthImpl implements Auth {
  /**
   * Get the identity of the authenticated user.
   * Returns null if not authenticated.
   */
  async getUserIdentity(): Promise<UserIdentity | null> {
    // In a real implementation, this would fetch from the auth provider
    // For now, this is a placeholder that should be overridden
    throw new Error('Auth.getUserIdentity() must be implemented by runtime')
  }
}

// ============================================================================
// StorageReader Implementation
// ============================================================================

/**
 * Implementation of read-only storage operations.
 */
export class StorageReaderImpl implements StorageReader {
  /**
   * Get a URL for downloading a file.
   */
  async getUrl(storageId: StorageId): Promise<string | null> {
    // In a real implementation, this would generate a signed URL
    // For now, this is a placeholder that should be overridden
    throw new Error('StorageReader.getUrl() must be implemented by runtime')
  }

  /**
   * Get metadata for a stored file.
   */
  async getMetadata(storageId: StorageId): Promise<{
    storageId: StorageId
    sha256: string
    size: number
    contentType?: string
  } | null> {
    // In a real implementation, this would fetch metadata from storage
    // For now, this is a placeholder that should be overridden
    throw new Error('StorageReader.getMetadata() must be implemented by runtime')
  }
}

// ============================================================================
// QueryCtx Implementation
// ============================================================================

/**
 * Implementation of the QueryCtx context object.
 */
export class QueryCtxImpl implements QueryCtx {
  /** Read-only database access */
  db: DatabaseReader

  /** Authentication context */
  auth: Auth

  /** Read-only storage access */
  storage: StorageReader

  constructor(
    db?: DatabaseReader,
    auth?: Auth,
    storage?: StorageReader
  ) {
    this.db = db || new DatabaseReaderImpl()
    this.auth = auth || new AuthImpl()
    this.storage = storage || new StorageReaderImpl()
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new QueryCtx with the provided implementations.
 * This is typically called by the Convex runtime.
 */
export function createQueryCtx(
  db: DatabaseReader,
  auth: Auth,
  storage: StorageReader
): QueryCtx {
  return new QueryCtxImpl(db, auth, storage)
}

/**
 * Create a default QueryCtx (for testing or development).
 * The runtime should override the methods before use.
 */
export function createDefaultQueryCtx(): QueryCtx {
  return new QueryCtxImpl()
}
