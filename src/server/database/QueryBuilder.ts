/**
 * @module QueryBuilder
 *
 * Query Builder for database queries - Layer 4.
 *
 * Provides a fluent API for building type-safe database queries with comprehensive
 * support for filtering, ordering, pagination, and index-based lookups.
 *
 * The QueryBuilder follows the builder pattern, allowing method chaining to
 * construct complex queries in a readable and type-safe manner.
 *
 * ## Query Flow
 *
 * ```
 * db.query('table')
 *   -> [withIndex]     (optional: use index for efficient lookup)
 *   -> [filter]        (optional: add post-filter conditions)
 *   -> [order]         (optional: set sort direction)
 *   -> collect/first/take/unique/paginate  (execute query)
 * ```
 *
 * ## Index-Based Queries
 *
 * Index queries are the most efficient way to retrieve documents. The `.withIndex()`
 * method allows specifying which index to use and what range conditions to apply.
 *
 * @example
 * ```typescript
 * // Simple index lookup
 * const users = await db
 *   .query('users')
 *   .withIndex('by_email', q => q.eq('email', 'alice@example.com'))
 *   .unique();
 *
 * // Compound index with range
 * const posts = await db
 *   .query('posts')
 *   .withIndex('by_author_date', q =>
 *     q.eq('authorId', 'user_123')
 *      .gte('publishedAt', Date.now() - 86400000)
 *   )
 *   .order('desc')
 *   .take(10);
 * ```
 *
 * @example
 * ```typescript
 * // Filter-based query
 * const activeUsers = await db
 *   .query('users')
 *   .filter(q => q.and(
 *     q.eq('active', true),
 *     q.gt('loginCount', 10)
 *   ))
 *   .order('desc')
 *   .collect();
 * ```
 *
 * @example
 * ```typescript
 * // Pagination
 * const page1 = await db
 *   .query('users')
 *   .order('asc')
 *   .paginate({ numItems: 20 });
 *
 * // Next page using cursor
 * const page2 = await db
 *   .query('users')
 *   .order('asc')
 *   .paginate({ numItems: 20, cursor: page1.continueCursor });
 * ```
 */

import type { Id, PaginationOptions, PaginationResult } from '../../types'

// ============================================================================
// Index Range Types
// ============================================================================

/**
 * Builder for constructing index range expressions.
 *
 * Index range builders are used with `.withIndex()` to specify which documents
 * should be selected from an index. Each method adds a condition and returns
 * the builder for chaining.
 *
 * ## Index Condition Order
 *
 * For compound indexes, conditions must be applied in the order the fields
 * appear in the index definition. Each field (except the last) must use
 * an equality condition.
 *
 * @typeParam IndexFields - The fields available in this index
 *
 * @example
 * ```typescript
 * // Single field index
 * q.eq('email', 'alice@example.com')
 *
 * // Compound index: by_author_status
 * q.eq('authorId', 'user_123').eq('status', 'published')
 *
 * // Range condition on last field
 * q.eq('category', 'tech').gte('publishedAt', startOfDay)
 * ```
 */
export interface IndexRangeBuilder<IndexFields extends string[]> {
  /**
   * Adds an equality condition to the index range.
   *
   * Use this for exact matches on index fields. For compound indexes,
   * equality conditions should be used for all fields except possibly
   * the last one.
   *
   * @typeParam F - The field name from the index
   * @param field - The index field to match
   * @param value - The value to match exactly
   * @returns The builder for chaining
   *
   * @example
   * ```typescript
   * // Match exact email
   * q.eq('email', 'alice@example.com')
   *
   * // Match exact category and status
   * q.eq('category', 'tech').eq('status', 'published')
   * ```
   */
  eq<F extends IndexFields[number]>(
    field: F,
    value: unknown
  ): IndexRangeBuilder<IndexFields>

  /**
   * Adds a less-than condition to the index range.
   *
   * Returns documents where the field value is strictly less than the
   * specified value. Typically used on the last field of an index range.
   *
   * @typeParam F - The field name from the index
   * @param field - The index field to compare
   * @param value - The upper bound (exclusive)
   * @returns The builder for chaining
   *
   * @example
   * ```typescript
   * // Posts created before a specific time
   * q.eq('authorId', 'user_123').lt('createdAt', cutoffTime)
   * ```
   */
  lt<F extends IndexFields[number]>(
    field: F,
    value: unknown
  ): IndexRangeBuilder<IndexFields>

  /**
   * Adds a less-than-or-equal condition to the index range.
   *
   * Returns documents where the field value is less than or equal to
   * the specified value. Typically used on the last field of an index range.
   *
   * @typeParam F - The field name from the index
   * @param field - The index field to compare
   * @param value - The upper bound (inclusive)
   * @returns The builder for chaining
   *
   * @example
   * ```typescript
   * // Products with price at or below budget
   * q.eq('category', 'electronics').lte('price', 1000)
   * ```
   */
  lte<F extends IndexFields[number]>(
    field: F,
    value: unknown
  ): IndexRangeBuilder<IndexFields>

  /**
   * Adds a greater-than condition to the index range.
   *
   * Returns documents where the field value is strictly greater than
   * the specified value. Typically used on the last field of an index range.
   *
   * @typeParam F - The field name from the index
   * @param field - The index field to compare
   * @param value - The lower bound (exclusive)
   * @returns The builder for chaining
   *
   * @example
   * ```typescript
   * // Posts with more than 100 likes
   * q.eq('status', 'published').gt('likes', 100)
   * ```
   */
  gt<F extends IndexFields[number]>(
    field: F,
    value: unknown
  ): IndexRangeBuilder<IndexFields>

  /**
   * Adds a greater-than-or-equal condition to the index range.
   *
   * Returns documents where the field value is greater than or equal to
   * the specified value. Typically used on the last field of an index range.
   *
   * @typeParam F - The field name from the index
   * @param field - The index field to compare
   * @param value - The lower bound (inclusive)
   * @returns The builder for chaining
   *
   * @example
   * ```typescript
   * // Users who joined on or after a date
   * q.eq('role', 'member').gte('joinedAt', startDate)
   * ```
   */
  gte<F extends IndexFields[number]>(
    field: F,
    value: unknown
  ): IndexRangeBuilder<IndexFields>
}

/**
 * Index range expression for `.withIndex()`.
 *
 * Can be either an IndexRangeBuilder directly or a function that
 * receives a builder and returns configured conditions.
 *
 * @typeParam IndexFields - The fields available in the index
 *
 * @example
 * ```typescript
 * // Function form (most common)
 * .withIndex('by_email', q => q.eq('email', 'alice@example.com'))
 *
 * // Direct builder (less common)
 * const builder = createIndexRangeBuilder();
 * builder.eq('email', 'alice@example.com');
 * .withIndex('by_email', builder)
 * ```
 */
export type IndexRange<IndexFields extends string[]> =
  | IndexRangeBuilder<IndexFields>
  | ((q: IndexRangeBuilder<IndexFields>) => IndexRangeBuilder<IndexFields>)

// ============================================================================
// Filter Expression Types
// ============================================================================

/**
 * Builder for constructing filter expressions.
 *
 * Filter expressions are used with `.filter()` to add post-processing
 * conditions to query results. Unlike index conditions, filters are
 * evaluated after documents are retrieved and can use any field.
 *
 * ## Filter vs Index
 *
 * - **Index conditions** (`.withIndex()`): Efficient, uses database indexes
 * - **Filter conditions** (`.filter()`): Flexible, evaluated after retrieval
 *
 * Use indexes for the primary document selection, then filters for
 * additional conditions that don't have an index.
 *
 * @typeParam Doc - The document type being filtered
 *
 * @example
 * ```typescript
 * // Simple equality filter
 * .filter(q => q.eq('status', 'active'))
 *
 * // Compound filter with AND
 * .filter(q => q.and(
 *   q.eq('verified', true),
 *   q.gt('age', 18)
 * ))
 *
 * // Complex nested filter
 * .filter(q => q.or(
 *   q.eq('role', 'admin'),
 *   q.and(
 *     q.eq('role', 'moderator'),
 *     q.not(q.eq('suspended', true))
 *   )
 * ))
 * ```
 */
export interface FilterBuilder<Doc> {
  /**
   * Creates an equality filter expression.
   *
   * Matches documents where the field equals the specified value.
   * Uses strict equality (`===`).
   *
   * @typeParam K - The field name
   * @param field - The field to compare
   * @param value - The value to match
   * @returns A filter expression
   *
   * @example
   * ```typescript
   * q.eq('status', 'active')
   * q.eq('verified', true)
   * q.eq('category', null)
   * ```
   */
  eq<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Creates a not-equal filter expression.
   *
   * Matches documents where the field does not equal the specified value.
   * Uses strict inequality (`!==`).
   *
   * @typeParam K - The field name
   * @param field - The field to compare
   * @param value - The value to exclude
   * @returns A filter expression
   *
   * @example
   * ```typescript
   * q.neq('status', 'deleted')
   * q.neq('banned', true)
   * ```
   */
  neq<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Creates a less-than filter expression.
   *
   * Matches documents where the field value is strictly less than
   * the specified value. Works with numbers, strings, and dates.
   *
   * @typeParam K - The field name
   * @param field - The field to compare
   * @param value - The upper bound (exclusive)
   * @returns A filter expression
   *
   * @example
   * ```typescript
   * q.lt('age', 18)
   * q.lt('price', 100)
   * q.lt('createdAt', Date.now())
   * ```
   */
  lt<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Creates a less-than-or-equal filter expression.
   *
   * Matches documents where the field value is less than or equal
   * to the specified value.
   *
   * @typeParam K - The field name
   * @param field - The field to compare
   * @param value - The upper bound (inclusive)
   * @returns A filter expression
   *
   * @example
   * ```typescript
   * q.lte('score', 100)
   * q.lte('attempts', maxAttempts)
   * ```
   */
  lte<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Creates a greater-than filter expression.
   *
   * Matches documents where the field value is strictly greater than
   * the specified value. Works with numbers, strings, and dates.
   *
   * @typeParam K - The field name
   * @param field - The field to compare
   * @param value - The lower bound (exclusive)
   * @returns A filter expression
   *
   * @example
   * ```typescript
   * q.gt('likes', 100)
   * q.gt('temperature', 0)
   * ```
   */
  gt<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Creates a greater-than-or-equal filter expression.
   *
   * Matches documents where the field value is greater than or equal
   * to the specified value.
   *
   * @typeParam K - The field name
   * @param field - The field to compare
   * @param value - The lower bound (inclusive)
   * @returns A filter expression
   *
   * @example
   * ```typescript
   * q.gte('age', 18)
   * q.gte('balance', minBalance)
   * ```
   */
  gte<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Creates a logical AND filter expression.
   *
   * Matches documents that satisfy ALL of the provided filter conditions.
   * Short-circuits on the first false condition.
   *
   * @param filters - The filter expressions to combine
   * @returns A filter expression that is true when all inputs are true
   *
   * @example
   * ```typescript
   * // All conditions must be true
   * q.and(
   *   q.eq('active', true),
   *   q.gte('age', 18),
   *   q.lt('age', 65)
   * )
   * ```
   */
  and(...filters: FilterExpression[]): FilterExpression

  /**
   * Creates a logical OR filter expression.
   *
   * Matches documents that satisfy ANY of the provided filter conditions.
   * Short-circuits on the first true condition.
   *
   * @param filters - The filter expressions to combine
   * @returns A filter expression that is true when any input is true
   *
   * @example
   * ```typescript
   * // Any condition can be true
   * q.or(
   *   q.eq('role', 'admin'),
   *   q.eq('role', 'moderator'),
   *   q.eq('role', 'owner')
   * )
   * ```
   */
  or(...filters: FilterExpression[]): FilterExpression

  /**
   * Creates a logical NOT filter expression.
   *
   * Matches documents where the provided condition is NOT true.
   * Inverts the result of the input expression.
   *
   * @param filter - The filter expression to negate
   * @returns A filter expression that is true when the input is false
   *
   * @example
   * ```typescript
   * // Exclude deleted documents
   * q.not(q.eq('deleted', true))
   *
   * // Exclude specific status values
   * q.not(q.or(
   *   q.eq('status', 'banned'),
   *   q.eq('status', 'suspended')
   * ))
   * ```
   */
  not(filter: FilterExpression): FilterExpression
}

/**
 * Opaque type representing a compiled filter expression.
 *
 * Filter expressions are created using the FilterBuilder and cannot
 * be constructed directly. They are passed to the database engine
 * for evaluation.
 *
 * @internal
 */
export interface FilterExpression {
  readonly _brand: 'FilterExpression'
}

// ============================================================================
// Query Builder Interfaces
// ============================================================================

/**
 * Initial query state - provides all query building operations.
 *
 * This interface represents a query that has not yet been executed.
 * It provides methods for:
 * - Index selection (`.withIndex()`, `.withSearchIndex()`)
 * - Filtering (`.filter()`)
 * - Ordering (`.order()`)
 * - Execution (`.collect()`, `.first()`, `.unique()`, `.take()`, `.paginate()`)
 *
 * @typeParam TableName - The name of the table being queried
 *
 * @example
 * ```typescript
 * const query = db.query('users');  // QueryInitializer<'users'>
 *
 * // Can chain any combination of methods
 * const results = await query
 *   .withIndex('by_status', q => q.eq('status', 'active'))
 *   .filter(q => q.gt('loginCount', 5))
 *   .order('desc')
 *   .take(10);
 * ```
 */
export interface QueryInitializer<TableName extends string> {
  /**
   * Uses a specific index for efficient document lookup.
   *
   * Index queries are the most efficient way to retrieve documents.
   * The index must be defined in your schema. When using a compound
   * index, conditions are applied in field order.
   *
   * ## Performance
   *
   * - Index lookups are O(log n) instead of O(n) for full scans
   * - Always prefer index queries for large tables
   * - Combine with `.filter()` for additional conditions not in the index
   *
   * @typeParam IndexName - The name of the index to use
   * @param indexName - The name of the index (as defined in schema)
   * @param indexRange - Optional function to specify index range conditions
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // Use index without conditions (returns all documents in index order)
   * .withIndex('by_createdAt')
   *
   * // Use index with equality condition
   * .withIndex('by_email', q => q.eq('email', 'alice@example.com'))
   *
   * // Use compound index
   * .withIndex('by_author_status', q =>
   *   q.eq('authorId', 'user_123')
   *    .eq('status', 'published')
   * )
   *
   * // Use index with range condition
   * .withIndex('by_createdAt', q =>
   *   q.gte('createdAt', startOfDay)
   *    .lt('createdAt', endOfDay)
   * )
   * ```
   */
  withIndex<IndexName extends string>(
    indexName: IndexName,
    indexRange?: (q: IndexRangeBuilder<string[]>) => IndexRangeBuilder<string[]>
  ): QueryBuilder<TableName>

  /**
   * Uses a search index for full-text search queries.
   *
   * Search indexes enable efficient text search across document fields.
   * The search index must be defined in your schema with the appropriate
   * search configuration.
   *
   * @typeParam IndexName - The name of the search index to use
   * @param indexName - The name of the search index
   * @param searchFilter - Function to specify search conditions
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // Full-text search
   * .withSearchIndex('search_posts', q =>
   *   q.search('content', 'react typescript')
   *    .eq('status', 'published')
   * )
   * ```
   */
  withSearchIndex<IndexName extends string>(
    indexName: IndexName,
    searchFilter: (q: SearchFilterBuilder) => SearchFilterBuilder
  ): QueryBuilder<TableName>

  /**
   * Adds a filter condition to the query results.
   *
   * Filters are evaluated after documents are retrieved from the database.
   * Multiple `.filter()` calls are combined with AND logic.
   *
   * ## Best Practices
   *
   * - Use indexes for primary selection, filters for additional conditions
   * - Filters scan documents, so prefer indexed lookups for large datasets
   * - Combine related conditions in a single filter for readability
   *
   * @param predicate - Function that builds the filter expression
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // Simple filter
   * .filter(q => q.eq('active', true))
   *
   * // Multiple conditions
   * .filter(q => q.and(
   *   q.gte('age', 18),
   *   q.eq('verified', true)
   * ))
   *
   * // Chained filters (equivalent to AND)
   * .filter(q => q.eq('active', true))
   * .filter(q => q.gt('score', 50))
   * ```
   */
  filter(
    predicate: (q: FilterBuilder<Record<string, unknown>>) => FilterExpression
  ): QueryBuilder<TableName>

  /**
   * Sets the sort order for query results.
   *
   * Results are ordered by `_creationTime`. Use 'asc' for oldest-first
   * (chronological) or 'desc' for newest-first (reverse chronological).
   *
   * @param order - The sort direction: 'asc' (ascending) or 'desc' (descending)
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // Oldest first (default behavior)
   * .order('asc')
   *
   * // Newest first
   * .order('desc')
   *
   * // Common pattern: recent items first
   * .withIndex('by_author', q => q.eq('authorId', userId))
   * .order('desc')
   * .take(10)
   * ```
   */
  order(order: 'asc' | 'desc'): QueryBuilder<TableName>

  /**
   * Executes the query and returns all matching documents.
   *
   * Use this when you need all results. For large result sets,
   * consider using `.paginate()` or `.take()` to limit memory usage.
   *
   * @returns Promise resolving to an array of all matching documents
   *
   * @example
   * ```typescript
   * const allPosts = await db
   *   .query('posts')
   *   .filter(q => q.eq('published', true))
   *   .collect();
   *
   * console.log(`Found ${allPosts.length} published posts`);
   * ```
   */
  collect(): Promise<Array<Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }>>

  /**
   * Executes the query and returns the first matching document.
   *
   * Returns `null` if no documents match the query conditions.
   * This is more efficient than `.collect()` when you only need one result.
   *
   * @returns Promise resolving to the first document or null
   *
   * @example
   * ```typescript
   * const latestPost = await db
   *   .query('posts')
   *   .filter(q => q.eq('authorId', userId))
   *   .order('desc')
   *   .first();
   *
   * if (latestPost) {
   *   console.log(`Latest post: ${latestPost.title}`);
   * }
   * ```
   */
  first(): Promise<(Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }) | null>

  /**
   * Executes the query expecting exactly zero or one result.
   *
   * Returns `null` if no documents match. Throws an error if more
   * than one document matches. Use this for queries where uniqueness
   * is guaranteed (e.g., by a unique index).
   *
   * @returns Promise resolving to the single document or null
   * @throws {Error} If more than one document matches
   *
   * @example
   * ```typescript
   * // Lookup by unique email
   * const user = await db
   *   .query('users')
   *   .withIndex('by_email', q => q.eq('email', 'alice@example.com'))
   *   .unique();
   *
   * // Throws if email is not unique
   * if (user) {
   *   console.log(`Found user: ${user.name}`);
   * }
   * ```
   */
  unique(): Promise<(Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }) | null>

  /**
   * Executes the query and returns up to `n` matching documents.
   *
   * Use this when you need a limited number of results. More efficient
   * than `.collect()` when you don't need all matches.
   *
   * @param n - Maximum number of documents to return
   * @returns Promise resolving to an array of up to n documents
   *
   * @example
   * ```typescript
   * // Get top 5 recent posts
   * const recentPosts = await db
   *   .query('posts')
   *   .filter(q => q.eq('published', true))
   *   .order('desc')
   *   .take(5);
   *
   * // Take(0) returns empty array
   * const none = await db.query('users').take(0);  // []
   * ```
   */
  take(n: number): Promise<Array<Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }>>

  /**
   * Executes the query with pagination support.
   *
   * Returns a page of results along with metadata for fetching
   * subsequent pages. Use the `continueCursor` to fetch the next page.
   *
   * ## Pagination Flow
   *
   * 1. First page: Call with `{ numItems: N }`
   * 2. Check `isDone` - if false, more pages exist
   * 3. Next page: Call with `{ numItems: N, cursor: result.continueCursor }`
   * 4. Repeat until `isDone` is true
   *
   * @param paginationOpts - Pagination configuration
   * @param paginationOpts.numItems - Number of items per page
   * @param paginationOpts.cursor - Cursor from previous page (optional)
   * @returns Promise resolving to paginated result with page, isDone, and continueCursor
   *
   * @example
   * ```typescript
   * // First page
   * const page1 = await db
   *   .query('posts')
   *   .order('desc')
   *   .paginate({ numItems: 20 });
   *
   * console.log(`Page 1: ${page1.page.length} items`);
   * console.log(`More pages: ${!page1.isDone}`);
   *
   * // Second page (if exists)
   * if (!page1.isDone) {
   *   const page2 = await db
   *     .query('posts')
   *     .order('desc')
   *     .paginate({ numItems: 20, cursor: page1.continueCursor });
   * }
   * ```
   */
  paginate(
    paginationOpts: PaginationOptions
  ): Promise<PaginationResult<Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }>>
}

/**
 * Query builder with all operations available.
 *
 * This interface extends QueryInitializer, providing the same operations.
 * It represents a query in progress that can be further refined or executed.
 *
 * @typeParam TableName - The name of the table being queried
 */
export interface QueryBuilder<TableName extends string> extends QueryInitializer<TableName> {
  // Inherits all methods from QueryInitializer
}

// ============================================================================
// Search Filter Types
// ============================================================================

/**
 * Search filter builder for full-text search queries.
 *
 * Used with `.withSearchIndex()` to construct full-text search queries.
 * Supports text search and equality filters for efficient document retrieval.
 *
 * @example
 * ```typescript
 * .withSearchIndex('search_posts', q =>
 *   q.search('body', 'react hooks')
 *    .eq('status', 'published')
 * )
 * ```
 */
export interface SearchFilterBuilder {
  /**
   * Adds a full-text search condition.
   *
   * Searches for the query text in the specified search field.
   * The field must be configured as a search field in the index.
   *
   * @param field - The search field to query
   * @param query - The search text
   * @returns The builder for chaining
   *
   * @example
   * ```typescript
   * q.search('content', 'typescript tutorial')
   * q.search('title', 'getting started')
   * ```
   */
  search(field: string, query: string): SearchFilterBuilder

  /**
   * Adds an equality filter condition.
   *
   * Filters search results to documents where the field equals
   * the specified value. The field must be a filter field in the index.
   *
   * @param field - The filter field to match
   * @param value - The value to match exactly
   * @returns The builder for chaining
   *
   * @example
   * ```typescript
   * q.search('content', 'react').eq('category', 'frontend')
   * q.search('body', 'hooks').eq('authorId', userId)
   * ```
   */
  eq(field: string, value: unknown): SearchFilterBuilder
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Internal representation of an index filter condition.
 *
 * @internal
 */
interface IndexFilterCondition {
  /** The field being filtered */
  field: string
  /** The comparison operator */
  op: 'eq' | 'lt' | 'lte' | 'gt' | 'gte'
  /** The value to compare against */
  value: unknown
}

/**
 * Document type with required system fields.
 *
 * @internal
 */
type DocumentWithSystemFields<TableName extends string> = Record<string, unknown> & {
  _id: Id<TableName>
  _creationTime: number
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Internal implementation of the QueryBuilder.
 *
 * This class implements the fluent query builder API, accumulating
 * query configuration until an execution method is called.
 *
 * @typeParam TableName - The name of the table being queried
 *
 * @internal
 */
export class QueryBuilderImpl<TableName extends string> implements QueryBuilder<TableName> {
  /** The name of the table being queried */
  private readonly tableName: TableName

  /** The selected index name, if any */
  private indexName?: string

  /** Index filter conditions */
  private indexFilters: IndexFilterCondition[] = []

  /** Post-retrieval filter expressions */
  private filterExpressions: FilterExpression[] = []

  /** Sort direction (ascending or descending) */
  private orderDirection: 'asc' | 'desc' = 'asc'

  /** Maximum number of documents to return */
  private limitCount?: number

  /** Database fetch function for query execution */
  private readonly dbFetch: (query: QueryBuilderImpl<TableName>) => Promise<unknown[]>

  /**
   * Creates a new QueryBuilderImpl.
   *
   * @param tableName - The name of the table to query
   * @param dbFetch - Function to execute the query against the database
   *
   * @internal
   */
  constructor(
    tableName: TableName,
    dbFetch: (query: QueryBuilderImpl<TableName>) => Promise<unknown[]>
  ) {
    this.tableName = tableName
    this.dbFetch = dbFetch
  }

  /**
   * Configures the query to use a specific index.
   *
   * @param indexName - The name of the index to use
   * @param indexRange - Optional function to specify index conditions
   * @returns This query builder for chaining
   */
  withIndex<IndexName extends string>(
    indexName: IndexName,
    indexRange?: (q: IndexRangeBuilder<string[]>) => IndexRangeBuilder<string[]>
  ): QueryBuilder<TableName> {
    this.indexName = indexName

    if (indexRange) {
      const builder = new IndexRangeBuilderImpl()
      indexRange(builder)
      this.indexFilters = builder.getFilters()
    }

    return this
  }

  /**
   * Configures the query to use a search index.
   *
   * @param _indexName - The name of the search index
   * @param _searchFilter - Function to specify search conditions
   * @throws {Error} Search indexes are not yet implemented
   */
  withSearchIndex<IndexName extends string>(
    _indexName: IndexName,
    _searchFilter: (q: SearchFilterBuilder) => SearchFilterBuilder
  ): QueryBuilder<TableName> {
    throw new Error('Search indexes not yet implemented')
  }

  /**
   * Adds a filter condition to the query.
   *
   * @param predicate - Function that builds the filter expression
   * @returns This query builder for chaining
   */
  filter(
    predicate: (q: FilterBuilder<Record<string, unknown>>) => FilterExpression
  ): QueryBuilder<TableName> {
    const builder = new FilterBuilderImpl()
    const expression = predicate(builder)
    this.filterExpressions.push(expression)
    return this
  }

  /**
   * Sets the sort order for results.
   *
   * @param order - The sort direction
   * @returns This query builder for chaining
   */
  order(order: 'asc' | 'desc'): QueryBuilder<TableName> {
    this.orderDirection = order
    return this
  }

  /**
   * Executes the query and returns all matching documents.
   *
   * @returns Promise resolving to all matching documents
   */
  async collect(): Promise<Array<DocumentWithSystemFields<TableName>>> {
    const results = await this.dbFetch(this)
    return results as Array<DocumentWithSystemFields<TableName>>
  }

  /**
   * Executes the query and returns the first matching document.
   *
   * @returns Promise resolving to the first document or null
   */
  async first(): Promise<DocumentWithSystemFields<TableName> | null> {
    this.limitCount = 1
    const results = await this.collect()
    return results[0] || null
  }

  /**
   * Executes the query expecting at most one result.
   *
   * @returns Promise resolving to the unique document or null
   * @throws {Error} If more than one document matches
   */
  async unique(): Promise<DocumentWithSystemFields<TableName> | null> {
    this.limitCount = 2
    const results = await this.collect()

    if (results.length > 1) {
      throw new Error(`Expected at most one result, got ${results.length}`)
    }

    return results[0] || null
  }

  /**
   * Executes the query and returns up to n documents.
   *
   * @param n - Maximum number of documents to return
   * @returns Promise resolving to up to n documents
   */
  async take(n: number): Promise<Array<DocumentWithSystemFields<TableName>>> {
    this.limitCount = n
    return this.collect()
  }

  /**
   * Executes the query with pagination.
   *
   * Fetches one extra document to determine if more pages exist.
   *
   * @param paginationOpts - Pagination configuration
   * @returns Promise resolving to paginated result
   */
  async paginate(
    paginationOpts: PaginationOptions
  ): Promise<PaginationResult<DocumentWithSystemFields<TableName>>> {
    // Fetch one extra to determine if there are more pages
    this.limitCount = paginationOpts.numItems + 1
    const results = await this.collect()

    const isDone = results.length <= paginationOpts.numItems
    const page = results.slice(0, paginationOpts.numItems)
    const lastItem = page[page.length - 1]
    const continueCursor = lastItem ? btoa(JSON.stringify({ id: lastItem._id })) : ''

    return {
      page,
      isDone,
      continueCursor,
    }
  }

  // ============================================================================
  // Internal Getters (for query execution)
  // ============================================================================

  /**
   * Returns the table name for this query.
   * @internal
   */
  getTableName(): TableName {
    return this.tableName
  }

  /**
   * Returns the selected index name, if any.
   * @internal
   */
  getIndexName(): string | undefined {
    return this.indexName
  }

  /**
   * Returns the index filter conditions.
   * @internal
   */
  getIndexFilters(): IndexFilterCondition[] {
    return this.indexFilters
  }

  /**
   * Returns the post-retrieval filter expressions.
   * @internal
   */
  getFilterExpressions(): FilterExpression[] {
    return this.filterExpressions
  }

  /**
   * Returns the sort order.
   * @internal
   */
  getOrder(): 'asc' | 'desc' {
    return this.orderDirection
  }

  /**
   * Returns the result limit, if set.
   * @internal
   */
  getLimit(): number | undefined {
    return this.limitCount
  }
}

// ============================================================================
// Index Range Builder Implementation
// ============================================================================

/**
 * Implementation of IndexRangeBuilder.
 *
 * Accumulates index filter conditions for query execution.
 *
 * @internal
 */
class IndexRangeBuilderImpl implements IndexRangeBuilder<string[]> {
  /** Accumulated filter conditions */
  private filters: IndexFilterCondition[] = []

  /**
   * Adds an equality condition.
   */
  eq<F extends string>(field: F, value: unknown): IndexRangeBuilder<string[]> {
    this.filters.push({ field, op: 'eq', value })
    return this
  }

  /**
   * Adds a less-than condition.
   */
  lt<F extends string>(field: F, value: unknown): IndexRangeBuilder<string[]> {
    this.filters.push({ field, op: 'lt', value })
    return this
  }

  /**
   * Adds a less-than-or-equal condition.
   */
  lte<F extends string>(field: F, value: unknown): IndexRangeBuilder<string[]> {
    this.filters.push({ field, op: 'lte', value })
    return this
  }

  /**
   * Adds a greater-than condition.
   */
  gt<F extends string>(field: F, value: unknown): IndexRangeBuilder<string[]> {
    this.filters.push({ field, op: 'gt', value })
    return this
  }

  /**
   * Adds a greater-than-or-equal condition.
   */
  gte<F extends string>(field: F, value: unknown): IndexRangeBuilder<string[]> {
    this.filters.push({ field, op: 'gte', value })
    return this
  }

  /**
   * Returns the accumulated filter conditions.
   * @internal
   */
  getFilters(): IndexFilterCondition[] {
    return this.filters
  }
}

// ============================================================================
// Filter Builder Implementation
// ============================================================================

/**
 * Internal filter expression representation.
 *
 * @internal
 */
interface InternalFilterExpression extends FilterExpression {
  type: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'and' | 'or' | 'not'
  field?: string
  value?: unknown
  filters?: FilterExpression[]
  filter?: FilterExpression
}

/**
 * Implementation of FilterBuilder.
 *
 * Creates filter expression objects for query evaluation.
 *
 * @internal
 */
class FilterBuilderImpl implements FilterBuilder<Record<string, unknown>> {
  /**
   * Creates an equality filter.
   */
  eq<K extends string>(field: K, value: unknown): FilterExpression {
    return {
      _brand: 'FilterExpression',
      type: 'eq',
      field,
      value,
    } as unknown as FilterExpression
  }

  /**
   * Creates a not-equal filter.
   */
  neq<K extends string>(field: K, value: unknown): FilterExpression {
    return {
      _brand: 'FilterExpression',
      type: 'neq',
      field,
      value,
    } as unknown as FilterExpression
  }

  /**
   * Creates a less-than filter.
   */
  lt<K extends string>(field: K, value: unknown): FilterExpression {
    return {
      _brand: 'FilterExpression',
      type: 'lt',
      field,
      value,
    } as unknown as FilterExpression
  }

  /**
   * Creates a less-than-or-equal filter.
   */
  lte<K extends string>(field: K, value: unknown): FilterExpression {
    return {
      _brand: 'FilterExpression',
      type: 'lte',
      field,
      value,
    } as unknown as FilterExpression
  }

  /**
   * Creates a greater-than filter.
   */
  gt<K extends string>(field: K, value: unknown): FilterExpression {
    return {
      _brand: 'FilterExpression',
      type: 'gt',
      field,
      value,
    } as unknown as FilterExpression
  }

  /**
   * Creates a greater-than-or-equal filter.
   */
  gte<K extends string>(field: K, value: unknown): FilterExpression {
    return {
      _brand: 'FilterExpression',
      type: 'gte',
      field,
      value,
    } as unknown as FilterExpression
  }

  /**
   * Creates a logical AND filter.
   */
  and(...filters: FilterExpression[]): FilterExpression {
    return {
      _brand: 'FilterExpression',
      type: 'and',
      filters,
    } as unknown as FilterExpression
  }

  /**
   * Creates a logical OR filter.
   */
  or(...filters: FilterExpression[]): FilterExpression {
    return {
      _brand: 'FilterExpression',
      type: 'or',
      filters,
    } as unknown as FilterExpression
  }

  /**
   * Creates a logical NOT filter.
   */
  not(filter: FilterExpression): FilterExpression {
    return {
      _brand: 'FilterExpression',
      type: 'not',
      filter,
    } as unknown as FilterExpression
  }
}
