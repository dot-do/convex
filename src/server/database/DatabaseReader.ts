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
 *
 * @module DatabaseReader
 */

import type { Id } from '../../types'
import { QueryBuilderImpl, type QueryBuilder } from '../queryBuilder'
import type { FilterExpression } from '../queryBuilder'

// ============================================================================
// Constants
// ============================================================================

/**
 * Regular expression pattern for validating ID format.
 * Accepts base64-url safe characters: alphanumeric, underscore, and hyphen.
 */
const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

/**
 * Maximum allowed length for document IDs.
 * This limit ensures reasonable storage and indexing performance.
 */
const MAX_ID_LENGTH = 128

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Represents a document stored in the database with system fields.
 *
 * @typeParam T - The type of the document fields (excluding system fields)
 *
 * @example
 * ```typescript
 * type User = Document<{ name: string; email: string }>;
 * // Result: { _id: string; _creationTime: number; name: string; email: string }
 * ```
 */
export type Document<T extends Record<string, unknown> = Record<string, unknown>> = T & {
  /** Unique identifier for the document */
  _id: string
  /** Unix timestamp (milliseconds) when the document was created */
  _creationTime: number
}

/**
 * Result type for document retrieval operations.
 * Returns null when a document is not found.
 *
 * @typeParam T - The document type
 */
export type DocumentResult<T extends Record<string, unknown>> = T | null

/**
 * Type helper for extracting the document type from a table name.
 * This enables better type inference in query operations.
 *
 * @typeParam TableName - The name of the table being queried
 */
export type TableDocument<TableName extends string> = Document & {
  readonly __tableName?: TableName
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validation result type for structured error handling.
 *
 * @typeParam T - The type of the validated value
 */
type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; reason: string }

/**
 * Validates that the input is a non-empty string.
 *
 * @param input - The value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result with the string value or error reason
 *
 * @internal
 */
function validateString(input: unknown, fieldName: string): ValidationResult<string> {
  if (typeof input !== 'string') {
    return {
      valid: false,
      reason: formatValidationError(fieldName, 'must be a string', typeof input),
    }
  }
  return { valid: true, value: input }
}

/**
 * Validates that a string is not empty or whitespace-only.
 *
 * @param input - The string to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result with the trimmed value or error reason
 *
 * @internal
 */
function validateNonEmpty(input: string, fieldName: string): ValidationResult<string> {
  if (input === '' || input.trim() === '') {
    return {
      valid: false,
      reason: formatValidationError(fieldName, 'cannot be empty'),
    }
  }
  return { valid: true, value: input }
}

/**
 * Validates that a string matches the allowed ID character pattern.
 *
 * @param input - The string to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validation result with the value or error reason
 *
 * @internal
 */
function validateIdFormat(input: string, fieldName: string): ValidationResult<string> {
  if (!VALID_ID_PATTERN.test(input)) {
    return {
      valid: false,
      reason: formatValidationError(
        fieldName,
        'contains invalid characters',
        `only alphanumeric, underscore, and hyphen are allowed`
      ),
    }
  }
  return { valid: true, value: input }
}

/**
 * Validates that a string does not exceed the maximum length.
 *
 * @param input - The string to validate
 * @param maxLength - Maximum allowed length
 * @param fieldName - Name of the field for error messages
 * @returns Validation result with the value or error reason
 *
 * @internal
 */
function validateMaxLength(
  input: string,
  maxLength: number,
  fieldName: string
): ValidationResult<string> {
  if (input.length > maxLength) {
    return {
      valid: false,
      reason: formatValidationError(
        fieldName,
        `exceeds maximum length`,
        `${input.length} > ${maxLength}`
      ),
    }
  }
  return { valid: true, value: input }
}

/**
 * Combines multiple validation results, returning the first failure or the final success.
 *
 * @param validators - Array of functions that return validation results
 * @returns The first failed validation or the final successful validation
 *
 * @internal
 */
function runValidations<T>(
  input: T,
  ...validators: Array<(input: T) => ValidationResult<T>>
): ValidationResult<T> {
  for (const validator of validators) {
    const result = validator(input)
    if (!result.valid) {
      return result
    }
  }
  return { valid: true, value: input }
}

// ============================================================================
// Error Formatting Utilities
// ============================================================================

/**
 * Formats a validation error message with consistent structure.
 *
 * @param field - The name of the field that failed validation
 * @param message - The validation failure message
 * @param details - Optional additional details about the failure
 * @returns Formatted error message string
 *
 * @example
 * ```typescript
 * formatValidationError('id', 'cannot be empty');
 * // Returns: "Validation error: 'id' cannot be empty"
 *
 * formatValidationError('id', 'exceeds maximum length', '150 > 128');
 * // Returns: "Validation error: 'id' exceeds maximum length (150 > 128)"
 * ```
 *
 * @internal
 */
function formatValidationError(field: string, message: string, details?: string): string {
  const base = `Validation error: '${field}' ${message}`
  return details ? `${base} (${details})` : base
}

/**
 * Formats a database operation error message.
 *
 * @param operation - The database operation that failed
 * @param target - The target of the operation (table name, document ID, etc.)
 * @param reason - The reason for the failure
 * @returns Formatted error message string
 *
 * @example
 * ```typescript
 * formatDatabaseError('get', 'users_abc123', 'document not found');
 * // Returns: "Database error in 'get' for 'users_abc123': document not found"
 * ```
 *
 * @internal
 */
function formatDatabaseError(operation: string, target: string, reason: string): string {
  return `Database error in '${operation}' for '${target}': ${reason}`
}

// ============================================================================
// Storage Interface
// ============================================================================

/**
 * Storage backend interface for DatabaseReader.
 *
 * This interface abstracts the actual storage implementation, allowing
 * DatabaseReader to work with different backends (Durable Objects,
 * in-memory storage, remote databases, etc.).
 *
 * @example
 * ```typescript
 * class MyCustomStorage implements StorageBackend {
 *   async getDocument(id: string): Promise<Document | null> {
 *     // Custom implementation
 *   }
 *
 *   async queryDocuments(tableName: string, options?: QueryOptions) {
 *     // Custom implementation
 *   }
 * }
 * ```
 */
export interface StorageBackend {
  /**
   * Retrieves a single document by its unique identifier.
   *
   * @param id - The unique identifier of the document
   * @returns Promise resolving to the document if found, null otherwise
   */
  getDocument(id: string): Promise<Record<string, unknown> | null>

  /**
   * Queries documents from a table with optional filters and ordering.
   *
   * @param tableName - The name of the table to query
   * @param options - Optional query configuration (filters, ordering, limits)
   * @returns Promise resolving to an array of matching documents
   */
  queryDocuments(
    tableName: string,
    options?: QueryOptions
  ): Promise<Array<Document>>
}

/**
 * Configuration options for document queries.
 *
 * These options control how documents are filtered, ordered, and limited
 * when retrieved from storage.
 *
 * @example
 * ```typescript
 * const options: QueryOptions = {
 *   indexName: 'by_email',
 *   indexFilters: [{ field: 'email', op: 'eq', value: 'alice@example.com' }],
 *   order: 'desc',
 *   limit: 10,
 * };
 * ```
 */
export interface QueryOptions {
  /**
   * Name of the index to use for the query.
   * When specified, enables index-based filtering for better performance.
   */
  indexName?: string

  /**
   * Filters to apply using the specified index.
   * Each filter specifies a field, operation, and target value.
   */
  indexFilters?: Array<IndexFilter>

  /**
   * Post-index filters to apply to results.
   * These filters are evaluated after index filtering.
   */
  filters?: FilterExpression[]

  /**
   * Sort order for results based on _creationTime.
   * @default 'asc'
   */
  order?: 'asc' | 'desc'

  /**
   * Maximum number of documents to return.
   * When undefined, all matching documents are returned.
   */
  limit?: number
}

/**
 * Represents a single index filter condition.
 *
 * @internal
 */
interface IndexFilter {
  /** The field to filter on */
  field: string
  /** The comparison operator */
  op: string
  /** The value to compare against */
  value: unknown
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Infers the result type for a query operation based on the query method used.
 *
 * @typeParam TableName - The table being queried
 * @typeParam Method - The query termination method ('collect', 'first', 'take')
 *
 * @example
 * ```typescript
 * type CollectResult = QueryResult<'users', 'collect'>; // Document[]
 * type FirstResult = QueryResult<'users', 'first'>;     // Document | null
 * type TakeResult = QueryResult<'users', 'take'>;       // Document[]
 * ```
 */
export type QueryResult<
  TableName extends string,
  Method extends 'collect' | 'first' | 'take'
> = Method extends 'first'
  ? TableDocument<TableName> | null
  : Array<TableDocument<TableName>>

/**
 * Type guard to check if a value is a valid document with system fields.
 *
 * @param value - The value to check
 * @returns True if the value is a valid document
 *
 * @example
 * ```typescript
 * const data: unknown = fetchData();
 * if (isDocument(data)) {
 *   console.log(data._id, data._creationTime);
 * }
 * ```
 */
export function isDocument(value: unknown): value is Document {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_id' in value &&
    '_creationTime' in value &&
    typeof (value as Document)._id === 'string' &&
    typeof (value as Document)._creationTime === 'number'
  )
}

/**
 * Type guard to check if a value is a valid document ID string.
 *
 * @param value - The value to check
 * @returns True if the value is a valid ID format
 *
 * @example
 * ```typescript
 * const maybeId: unknown = getUserInput();
 * if (isValidId(maybeId)) {
 *   const doc = await db.get(maybeId as Id<'users'>);
 * }
 * ```
 */
export function isValidId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value === '' || value.trim() === '') return false
  if (!VALID_ID_PATTERN.test(value)) return false
  if (value.length > MAX_ID_LENGTH) return false
  return true
}

/**
 * Creates a typed ID from a string with runtime validation.
 *
 * @typeParam TableName - The table the ID belongs to
 * @param tableName - The table name (for error messages)
 * @param id - The ID string to validate and type
 * @returns The typed ID or null if validation fails
 *
 * @example
 * ```typescript
 * const userId = createTypedId<'users'>('users', 'users_abc123');
 * if (userId) {
 *   const doc = await db.get(userId);
 * }
 * ```
 */
export function createTypedId<TableName extends string>(
  tableName: TableName,
  id: string
): Id<TableName> | null {
  if (!isValidId(id)) {
    return null
  }
  return id as Id<TableName>
}

// ============================================================================
// DatabaseReader Implementation
// ============================================================================

/**
 * DatabaseReader provides read-only access to the Convex database.
 *
 * This class is the primary interface for reading data from the database
 * in query functions. It supports direct document retrieval by ID and
 * building complex queries with filtering, ordering, and pagination.
 *
 * @example
 * ```typescript
 * // Create a DatabaseReader with a storage backend
 * const storage = new InMemoryStorage();
 * const db = new DatabaseReader(storage);
 *
 * // Get a document by ID
 * const user = await db.get('users_abc123' as Id<'users'>);
 *
 * // Query documents with filters
 * const activeUsers = await db
 *   .query('users')
 *   .filter((q) => q.eq('active', true))
 *   .order('desc')
 *   .collect();
 *
 * // Use index for efficient queries
 * const userByEmail = await db
 *   .query('users')
 *   .withIndex('by_email', (q) => q.eq('email', 'alice@example.com'))
 *   .first();
 * ```
 */
export class DatabaseReader {
  /**
   * The storage backend used for data retrieval.
   * @internal
   */
  private readonly storage: StorageBackend

  /**
   * Creates a new DatabaseReader instance.
   *
   * @param storage - The storage backend to use for data retrieval
   *
   * @example
   * ```typescript
   * const storage = new InMemoryStorage();
   * const db = new DatabaseReader(storage);
   * ```
   */
  constructor(storage: StorageBackend) {
    this.storage = storage
  }

  /**
   * Retrieves a document by its unique identifier.
   *
   * This method performs a direct lookup of a document using its ID.
   * The ID must be a typed `Id<TableName>` to ensure type safety.
   *
   * @typeParam TableName - The name of the table the document belongs to
   * @param id - The typed document ID to retrieve
   * @returns Promise resolving to the document if found, null otherwise
   *
   * @example
   * ```typescript
   * // Get a user by ID
   * const user = await db.get('users_abc123' as Id<'users'>);
   *
   * if (user) {
   *   console.log(`Found user: ${user.name}`);
   * } else {
   *   console.log('User not found');
   * }
   * ```
   *
   * @example
   * ```typescript
   * // With TypeScript type inference
   * const userId: Id<'users'> = 'users_abc123';
   * const user = await db.get(userId);
   * // TypeScript knows user._id is a string
   * ```
   */
  async get<TableName extends string>(
    id: Id<TableName>
  ): Promise<Record<string, unknown> | null> {
    return this.storage.getDocument(id as string)
  }

  /**
   * Creates a query builder for querying documents in a table.
   *
   * The query builder supports chaining methods to build complex queries:
   * - `.filter()` - Add filtering conditions
   * - `.order()` - Specify sort order
   * - `.withIndex()` - Use an index for efficient queries
   * - `.collect()` - Get all matching documents
   * - `.first()` - Get the first matching document
   * - `.take(n)` - Get the first n matching documents
   *
   * @typeParam TableName - The name of the table to query
   * @param tableName - The name of the table to query
   * @returns A QueryBuilder instance for building the query
   *
   * @example
   * ```typescript
   * // Get all documents
   * const allUsers = await db.query('users').collect();
   *
   * // Get first document
   * const firstUser = await db.query('users').first();
   *
   * // Get first 10 documents
   * const topUsers = await db.query('users').take(10);
   * ```
   *
   * @example
   * ```typescript
   * // Complex query with filters and ordering
   * const results = await db
   *   .query('posts')
   *   .filter((q) => q.and(
   *     q.eq('status', 'published'),
   *     q.gt('likes', 100)
   *   ))
   *   .order('desc')
   *   .take(20);
   * ```
   */
  query<TableName extends string>(tableName: TableName): QueryBuilder<TableName> {
    const dbFetch = this.createQueryFetcher(tableName)
    return new QueryBuilderImpl(tableName, dbFetch)
  }

  /**
   * Normalizes a string to a valid typed ID for a table.
   *
   * This method validates that a string conforms to the expected ID format
   * and returns it as a typed `Id<TableName>`. Validation includes:
   * - Type check (must be a string)
   * - Non-empty check
   * - Character validation (alphanumeric, underscore, hyphen only)
   * - Length validation (max 128 characters)
   *
   * @typeParam TableName - The table name to associate with the ID
   * @param _tableName - The table name (currently unused but reserved for future validation)
   * @param id - The string to normalize and validate
   * @returns The typed ID if valid, null if validation fails
   *
   * @example
   * ```typescript
   * // Valid ID
   * const validId = db.normalizeId('users', 'users_abc123');
   * // validId = 'users_abc123' as Id<'users'>
   *
   * // Invalid ID (contains spaces)
   * const invalidId = db.normalizeId('users', 'invalid id');
   * // invalidId = null
   *
   * // Use in application code
   * const maybeId = req.params.id;
   * const normalizedId = db.normalizeId('users', maybeId);
   * if (normalizedId) {
   *   const user = await db.get(normalizedId);
   * } else {
   *   throw new Error('Invalid user ID');
   * }
   * ```
   */
  normalizeId<TableName extends string>(
    _tableName: TableName,
    id: string
  ): Id<TableName> | null {
    // Validate input using composed validators
    const stringResult = validateString(id, 'id')
    if (!stringResult.valid) {
      return null
    }

    const nonEmptyResult = validateNonEmpty(stringResult.value, 'id')
    if (!nonEmptyResult.valid) {
      return null
    }

    const formatResult = validateIdFormat(nonEmptyResult.value, 'id')
    if (!formatResult.valid) {
      return null
    }

    const lengthResult = validateMaxLength(formatResult.value, MAX_ID_LENGTH, 'id')
    if (!lengthResult.valid) {
      return null
    }

    // All validations passed, return typed ID
    return lengthResult.value as Id<TableName>
  }

  /**
   * Creates a fetch function for the query builder.
   *
   * This method creates a closure that captures the table name and
   * provides the query builder with a way to execute queries against
   * the storage backend.
   *
   * @typeParam TableName - The name of the table being queried
   * @param tableName - The table name to query
   * @returns A function that executes queries and returns documents
   *
   * @internal
   */
  private createQueryFetcher<TableName extends string>(
    tableName: TableName
  ): (query: QueryBuilderImpl<TableName>) => Promise<Array<Document>> {
    return async (query: QueryBuilderImpl<TableName>) => {
      const options = this.buildQueryOptions(query)
      return this.storage.queryDocuments(tableName, options)
    }
  }

  /**
   * Builds QueryOptions from a QueryBuilder's current state.
   *
   * Extracts all query configuration (index, filters, order, limit)
   * from the query builder and packages it into a QueryOptions object
   * for the storage backend.
   *
   * @typeParam TableName - The name of the table being queried
   * @param query - The query builder to extract options from
   * @returns QueryOptions for the storage backend
   *
   * @internal
   */
  private buildQueryOptions<TableName extends string>(
    query: QueryBuilderImpl<TableName>
  ): QueryOptions {
    const indexName = query.getIndexName()
    const limit = query.getLimit()

    return {
      ...(indexName !== undefined && { indexName }),
      indexFilters: query.getIndexFilters(),
      filters: query.getFilterExpressions(),
      order: query.getOrder(),
      ...(limit !== undefined && { limit }),
    }
  }
}

// ============================================================================
// In-Memory Storage Backend (for testing)
// ============================================================================

/**
 * In-memory storage backend for testing and development.
 *
 * This implementation stores documents in a Map and provides
 * full support for queries, filters, and ordering. It's designed
 * for use in unit tests and local development environments.
 *
 * Note: This implementation is not suitable for production use
 * as it does not persist data between restarts.
 *
 * @example
 * ```typescript
 * const storage = new InMemoryStorage();
 *
 * // Add test documents
 * storage.addDocument('users_1', {
 *   _id: 'users_1',
 *   _creationTime: Date.now(),
 *   name: 'Alice',
 * });
 *
 * // Use with DatabaseReader
 * const db = new DatabaseReader(storage);
 * const user = await db.get('users_1' as Id<'users'>);
 *
 * // Clear for test isolation
 * storage.clear();
 * ```
 */
export class InMemoryStorage implements StorageBackend {
  /**
   * Internal document storage.
   * @internal
   */
  private documents = new Map<string, Document>()

  /**
   * Retrieves a document by ID from in-memory storage.
   *
   * @param id - The document ID to retrieve
   * @returns Promise resolving to the document if found, null otherwise
   */
  async getDocument(id: string): Promise<Record<string, unknown> | null> {
    return this.documents.get(id) || null
  }

  /**
   * Queries documents from a table with optional filtering and ordering.
   *
   * The query is executed in the following order:
   * 1. Filter documents by table prefix (tableName_*)
   * 2. Apply index filters (if specified)
   * 3. Apply post-filters (from .filter() calls)
   * 4. Apply ordering
   * 5. Apply limit
   *
   * @param tableName - The table to query
   * @param options - Query options for filtering, ordering, and limiting
   * @returns Promise resolving to an array of matching documents
   */
  async queryDocuments(
    tableName: string,
    options?: QueryOptions
  ): Promise<Array<Document>> {
    // Step 1: Get all documents for this table
    let results = this.getDocumentsForTable(tableName)

    // Step 2: Apply index filters
    results = this.applyIndexFilters(results, options?.indexFilters)

    // Step 3: Apply post-filters
    results = this.applyFilters(results, options?.filters)

    // Step 4: Apply ordering
    results = this.applyOrdering(results, options?.order)

    // Step 5: Apply limit
    results = this.applyLimit(results, options?.limit)

    return results
  }

  /**
   * Adds a document to storage (for testing purposes).
   *
   * @param id - The document ID (should match doc._id)
   * @param doc - The document to store
   *
   * @example
   * ```typescript
   * storage.addDocument('users_abc123', {
   *   _id: 'users_abc123',
   *   _creationTime: Date.now(),
   *   name: 'Test User',
   *   email: 'test@example.com',
   * });
   * ```
   */
  addDocument(id: string, doc: Document): void {
    this.documents.set(id, doc)
  }

  /**
   * Clears all documents from storage (for testing purposes).
   *
   * Call this method in test setup/teardown to ensure test isolation.
   *
   * @example
   * ```typescript
   * beforeEach(() => {
   *   storage.clear();
   * });
   * ```
   */
  clear(): void {
    this.documents.clear()
  }

  // ==========================================================================
  // Private Query Helper Methods
  // ==========================================================================

  /**
   * Gets all documents belonging to a specific table.
   *
   * Documents are matched by their ID prefix (tableName_*).
   *
   * @param tableName - The table name to filter by
   * @returns Array of documents belonging to the table
   *
   * @internal
   */
  private getDocumentsForTable(tableName: string): Array<Document> {
    const results: Array<Document> = []
    const prefix = `${tableName}_`

    for (const [id, doc] of this.documents) {
      if (id.startsWith(prefix)) {
        results.push(doc)
      }
    }

    return results
  }

  /**
   * Applies index filters to a document array.
   *
   * @param documents - The documents to filter
   * @param indexFilters - The index filters to apply
   * @returns Filtered document array
   *
   * @internal
   */
  private applyIndexFilters(
    documents: Array<Document>,
    indexFilters?: Array<IndexFilter>
  ): Array<Document> {
    if (!indexFilters || indexFilters.length === 0) {
      return documents
    }

    return documents.filter((doc) =>
      indexFilters.every((filter) =>
        this.evaluateFilter(doc[filter.field], filter.op, filter.value)
      )
    )
  }

  /**
   * Applies post-index filters to a document array.
   *
   * @param documents - The documents to filter
   * @param filters - The filter expressions to apply
   * @returns Filtered document array
   *
   * @internal
   */
  private applyFilters(
    documents: Array<Document>,
    filters?: FilterExpression[]
  ): Array<Document> {
    if (!filters || filters.length === 0) {
      return documents
    }

    let results = documents
    for (const filter of filters) {
      results = results.filter((doc) => this.evaluateFilterExpression(doc, filter))
    }

    return results
  }

  /**
   * Applies ordering to a document array.
   *
   * @param documents - The documents to order
   * @param order - The sort order ('asc' or 'desc')
   * @returns Ordered document array
   *
   * @internal
   */
  private applyOrdering(
    documents: Array<Document>,
    order?: 'asc' | 'desc'
  ): Array<Document> {
    const sortOrder = order || 'asc'
    const sortedDocs = [...documents]

    sortedDocs.sort((a, b) => {
      const comparison = a._creationTime - b._creationTime
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return sortedDocs
  }

  /**
   * Applies a limit to a document array.
   *
   * @param documents - The documents to limit
   * @param limit - The maximum number of documents to return
   * @returns Limited document array
   *
   * @internal
   */
  private applyLimit(
    documents: Array<Document>,
    limit?: number
  ): Array<Document> {
    if (limit === undefined) {
      return documents
    }
    return documents.slice(0, limit)
  }

  /**
   * Evaluates a filter operation against a document field value.
   *
   * Supported operations: eq, neq, lt, lte, gt, gte
   *
   * @param value - The document field value
   * @param op - The comparison operation
   * @param target - The target value to compare against
   * @returns True if the filter matches
   *
   * @internal
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
   * Evaluates a filter expression against a document.
   *
   * Supports both simple comparisons and complex logical expressions
   * (and, or, not).
   *
   * @param doc - The document to evaluate
   * @param filter - The filter expression to evaluate
   * @returns True if the filter matches the document
   *
   * @internal
   */
  private evaluateFilterExpression(
    doc: Record<string, unknown>,
    filter: FilterExpression
  ): boolean {
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
}
