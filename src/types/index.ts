/**
 * Core type definitions for convex.do
 * 100% compatible with Convex TypeScript SDK types
 */

// ============================================================================
// Document and ID Types
// ============================================================================

/**
 * A unique identifier for a document in a table.
 * Generic over the table name for type safety.
 */
export type Id<TableName extends string> = string & { __tableName: TableName }

/**
 * A generic ID that can reference any table.
 */
export type GenericId<TableName extends string> = Id<TableName>

/**
 * System-generated fields present on all documents.
 */
export interface SystemFields {
  _id: Id<string>
  _creationTime: number
}

/**
 * A document in the database, combining user fields with system fields.
 */
export type Doc<TableName extends string, DocumentType = Record<string, unknown>> =
  DocumentType & SystemFields & { __tableName: TableName }

/**
 * Type for documents without system fields (for insertion).
 */
export type WithoutSystemFields<T> = Omit<T, '_id' | '_creationTime' | '__tableName'>

// ============================================================================
// Data Model Types
// ============================================================================

/**
 * A table definition with document type.
 */
export interface TableDefinition<DocumentType = Record<string, unknown>> {
  document: DocumentType
  indexes: Record<string, IndexDefinition>
  searchIndexes: Record<string, SearchIndexDefinition>
  vectorIndexes: Record<string, VectorIndexDefinition>
}

/**
 * An index definition for a table.
 */
export interface IndexDefinition {
  fields: string[]
}

/**
 * A search index definition for full-text search.
 */
export interface SearchIndexDefinition {
  searchField: string
  filterFields?: string[]
}

/**
 * A vector index definition for vector similarity search.
 */
export interface VectorIndexDefinition {
  vectorField: string
  dimensions: number
  filterFields?: string[]
}

/**
 * A schema definition mapping table names to table definitions.
 */
export interface SchemaDefinition {
  [tableName: string]: TableDefinition
}

/**
 * The data model type derived from a schema.
 */
export type DataModel<Schema extends SchemaDefinition> = {
  [K in keyof Schema]: Schema[K]['document']
}

// ============================================================================
// Function Types
// ============================================================================

/**
 * Function types supported by Convex.
 */
export type FunctionType = 'query' | 'mutation' | 'action'

/**
 * Visibility levels for functions.
 */
export type FunctionVisibility = 'public' | 'internal'

/**
 * A reference to a registered function.
 */
export interface FunctionReference<
  Type extends FunctionType = FunctionType,
  Args = unknown,
  Returns = unknown
> {
  _type: Type
  _args: Args
  _returns: Returns
  _path: string
}

/**
 * API type for generated function references.
 */
export type API = {
  [module: string]: {
    [functionName: string]: FunctionReference
  }
}

// ============================================================================
// Value Types (Convex Value System)
// ============================================================================

/**
 * Primitive value types supported by Convex.
 */
export type ConvexPrimitive =
  | null
  | boolean
  | number
  | bigint
  | string
  | ArrayBuffer

/**
 * All value types supported by Convex.
 */
export type ConvexValue =
  | ConvexPrimitive
  | ConvexValue[]
  | { [key: string]: ConvexValue }

/**
 * JSON-serializable value types.
 */
export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue }

// ============================================================================
// Query and Filter Types
// ============================================================================

/**
 * Operators for query filters.
 */
export type FilterOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'

/**
 * A filter expression for queries.
 */
export interface FilterExpression {
  field: string
  operator: FilterOperator
  value: ConvexValue
}

/**
 * Sort order for queries.
 */
export type SortOrder = 'asc' | 'desc'

/**
 * Query options for database operations.
 */
export interface QueryOptions {
  order?: {
    field: string
    direction: SortOrder
  }
  limit?: number
  cursor?: string
}

// ============================================================================
// Pagination Types
// ============================================================================

/**
 * Options for paginated queries.
 */
export interface PaginationOptions {
  numItems: number
  cursor?: string | null
}

/**
 * Result of a paginated query.
 */
export interface PaginationResult<T> {
  page: T[]
  isDone: boolean
  continueCursor: string
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Application-level error from a Convex function.
 */
export class ConvexError<T = string> extends Error {
  data: T

  constructor(data: T) {
    super(typeof data === 'string' ? data : JSON.stringify(data))
    this.name = 'ConvexError'
    this.data = data
  }
}

// ============================================================================
// Auth Types
// ============================================================================

/**
 * User identity information from authentication.
 */
export interface UserIdentity {
  tokenIdentifier: string
  subject: string
  issuer: string
  name?: string
  email?: string
  pictureUrl?: string
  nickname?: string
  givenName?: string
  familyName?: string
  emailVerified?: boolean
  phoneNumber?: string
  phoneNumberVerified?: boolean
  updatedAt?: string
}

// ============================================================================
// Scheduled Function Types
// ============================================================================

/**
 * ID for a scheduled function execution.
 */
export type ScheduledFunctionId = string & { __scheduled: true }

/**
 * Status of a scheduled function.
 */
export type ScheduledFunctionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'

// ============================================================================
// Storage Types
// ============================================================================

/**
 * ID for a stored file.
 */
export type StorageId = string & { __storage: true }

/**
 * Metadata for a stored file.
 */
export interface StorageMetadata {
  storageId: StorageId
  sha256: string
  size: number
  contentType?: string
}

// ============================================================================
// Export all types
// ============================================================================

export type {
  Id as GenericIdType,
}
