/**
 * Query Builder for database queries
 *
 * Provides a fluent API for building database queries with index support.
 */

import type { Id, PaginationOptions, PaginationResult } from '../types'

// ============================================================================
// Index Range Types
// ============================================================================

/**
 * Builder for index range expressions.
 */
export interface IndexRangeBuilder<IndexFields extends string[]> {
  /**
   * Filter for equality on the current index field.
   */
  eq<F extends IndexFields[number]>(
    field: F,
    value: unknown
  ): IndexRangeBuilder<IndexFields>

  /**
   * Filter for less than on the current index field.
   */
  lt<F extends IndexFields[number]>(
    field: F,
    value: unknown
  ): IndexRangeBuilder<IndexFields>

  /**
   * Filter for less than or equal on the current index field.
   */
  lte<F extends IndexFields[number]>(
    field: F,
    value: unknown
  ): IndexRangeBuilder<IndexFields>

  /**
   * Filter for greater than on the current index field.
   */
  gt<F extends IndexFields[number]>(
    field: F,
    value: unknown
  ): IndexRangeBuilder<IndexFields>

  /**
   * Filter for greater than or equal on the current index field.
   */
  gte<F extends IndexFields[number]>(
    field: F,
    value: unknown
  ): IndexRangeBuilder<IndexFields>
}

/**
 * Index range expression for withIndex.
 */
export type IndexRange<IndexFields extends string[]> =
  | IndexRangeBuilder<IndexFields>
  | ((q: IndexRangeBuilder<IndexFields>) => IndexRangeBuilder<IndexFields>)

// ============================================================================
// Filter Expression Types
// ============================================================================

/**
 * Filter expression builder.
 */
export interface FilterBuilder<Doc> {
  /**
   * Equality filter.
   */
  eq<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Not equal filter.
   */
  neq<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Less than filter.
   */
  lt<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Less than or equal filter.
   */
  lte<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Greater than filter.
   */
  gt<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Greater than or equal filter.
   */
  gte<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression

  /**
   * Logical AND of filters.
   */
  and(...filters: FilterExpression[]): FilterExpression

  /**
   * Logical OR of filters.
   */
  or(...filters: FilterExpression[]): FilterExpression

  /**
   * Logical NOT of a filter.
   */
  not(filter: FilterExpression): FilterExpression
}

/**
 * A filter expression.
 */
export interface FilterExpression {
  readonly _brand: 'FilterExpression'
}

// ============================================================================
// Query Builder
// ============================================================================

/**
 * Initial query state - can use withIndex or proceed to filtering.
 */
export interface QueryInitializer<TableName extends string> {
  /**
   * Use a specific index for the query.
   */
  withIndex<IndexName extends string>(
    indexName: IndexName,
    indexRange?: (q: IndexRangeBuilder<string[]>) => IndexRangeBuilder<string[]>
  ): QueryBuilder<TableName>

  /**
   * Use a search index for full-text search.
   */
  withSearchIndex<IndexName extends string>(
    indexName: IndexName,
    searchFilter: (q: SearchFilterBuilder) => SearchFilterBuilder
  ): QueryBuilder<TableName>

  /**
   * Filter the query results.
   */
  filter(
    predicate: (q: FilterBuilder<Record<string, unknown>>) => FilterExpression
  ): QueryBuilder<TableName>

  /**
   * Order results by _creationTime.
   */
  order(order: 'asc' | 'desc'): QueryBuilder<TableName>

  /**
   * Collect all results.
   */
  collect(): Promise<Array<Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }>>

  /**
   * Get the first result.
   */
  first(): Promise<(Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }) | null>

  /**
   * Get exactly one result (throws if not exactly one).
   */
  unique(): Promise<(Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }) | null>

  /**
   * Take a limited number of results.
   */
  take(n: number): Promise<Array<Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }>>

  /**
   * Paginate results.
   */
  paginate(
    paginationOpts: PaginationOptions
  ): Promise<PaginationResult<Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }>>
}

/**
 * Query builder with all operations available.
 */
export interface QueryBuilder<TableName extends string> extends QueryInitializer<TableName> {
  // Inherits all methods from QueryInitializer
}

// ============================================================================
// Search Filter Types
// ============================================================================

/**
 * Search filter builder for full-text search.
 */
export interface SearchFilterBuilder {
  /**
   * Search for text in the search field.
   */
  search(field: string, query: string): SearchFilterBuilder

  /**
   * Filter by equality on a filter field.
   */
  eq(field: string, value: unknown): SearchFilterBuilder
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Internal implementation of the query builder.
 */
export class QueryBuilderImpl<TableName extends string> implements QueryBuilder<TableName> {
  private tableName: TableName
  private indexName?: string
  private indexFilters: Array<{ field: string; op: string; value: unknown }> = []
  private filterExpressions: FilterExpression[] = []
  private orderDirection: 'asc' | 'desc' = 'asc'
  private limitCount?: number

  // Database reference for execution
  private dbFetch: (query: QueryBuilderImpl<TableName>) => Promise<unknown[]>

  constructor(
    tableName: TableName,
    dbFetch: (query: QueryBuilderImpl<TableName>) => Promise<unknown[]>
  ) {
    this.tableName = tableName
    this.dbFetch = dbFetch
  }

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

  withSearchIndex<IndexName extends string>(
    _indexName: IndexName,
    _searchFilter: (q: SearchFilterBuilder) => SearchFilterBuilder
  ): QueryBuilder<TableName> {
    // TODO: Implement search index support
    throw new Error('Search indexes not yet implemented')
  }

  filter(
    predicate: (q: FilterBuilder<Record<string, unknown>>) => FilterExpression
  ): QueryBuilder<TableName> {
    const builder = new FilterBuilderImpl()
    const expression = predicate(builder)
    this.filterExpressions.push(expression)
    return this
  }

  order(order: 'asc' | 'desc'): QueryBuilder<TableName> {
    this.orderDirection = order
    return this
  }

  async collect(): Promise<Array<Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }>> {
    const results = await this.dbFetch(this)
    return results as Array<Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }>
  }

  async first(): Promise<(Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }) | null> {
    this.limitCount = 1
    const results = await this.collect()
    return results[0] || null
  }

  async unique(): Promise<(Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }) | null> {
    this.limitCount = 2
    const results = await this.collect()

    if (results.length > 1) {
      throw new Error(`Expected at most one result, got ${results.length}`)
    }

    return results[0] || null
  }

  async take(n: number): Promise<Array<Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }>> {
    this.limitCount = n
    return this.collect()
  }

  async paginate(
    paginationOpts: PaginationOptions
  ): Promise<PaginationResult<Record<string, unknown> & { _id: Id<TableName>; _creationTime: number }>> {
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

  // Internal getters for execution
  getTableName(): TableName {
    return this.tableName
  }

  getIndexName(): string | undefined {
    return this.indexName
  }

  getIndexFilters(): Array<{ field: string; op: string; value: unknown }> {
    return this.indexFilters
  }

  getOrder(): 'asc' | 'desc' {
    return this.orderDirection
  }

  getLimit(): number | undefined {
    return this.limitCount
  }
}

/**
 * Index range builder implementation.
 */
class IndexRangeBuilderImpl implements IndexRangeBuilder<string[]> {
  private filters: Array<{ field: string; op: string; value: unknown }> = []

  eq<F extends string>(field: F, value: unknown): IndexRangeBuilder<string[]> {
    this.filters.push({ field, op: 'eq', value })
    return this
  }

  lt<F extends string>(field: F, value: unknown): IndexRangeBuilder<string[]> {
    this.filters.push({ field, op: 'lt', value })
    return this
  }

  lte<F extends string>(field: F, value: unknown): IndexRangeBuilder<string[]> {
    this.filters.push({ field, op: 'lte', value })
    return this
  }

  gt<F extends string>(field: F, value: unknown): IndexRangeBuilder<string[]> {
    this.filters.push({ field, op: 'gt', value })
    return this
  }

  gte<F extends string>(field: F, value: unknown): IndexRangeBuilder<string[]> {
    this.filters.push({ field, op: 'gte', value })
    return this
  }

  getFilters(): Array<{ field: string; op: string; value: unknown }> {
    return this.filters
  }
}

/**
 * Filter builder implementation.
 */
class FilterBuilderImpl implements FilterBuilder<Record<string, unknown>> {
  eq<K extends string>(field: K, value: unknown): FilterExpression {
    return { _brand: 'FilterExpression', type: 'eq', field, value } as unknown as FilterExpression
  }

  neq<K extends string>(field: K, value: unknown): FilterExpression {
    return { _brand: 'FilterExpression', type: 'neq', field, value } as unknown as FilterExpression
  }

  lt<K extends string>(field: K, value: unknown): FilterExpression {
    return { _brand: 'FilterExpression', type: 'lt', field, value } as unknown as FilterExpression
  }

  lte<K extends string>(field: K, value: unknown): FilterExpression {
    return { _brand: 'FilterExpression', type: 'lte', field, value } as unknown as FilterExpression
  }

  gt<K extends string>(field: K, value: unknown): FilterExpression {
    return { _brand: 'FilterExpression', type: 'gt', field, value } as unknown as FilterExpression
  }

  gte<K extends string>(field: K, value: unknown): FilterExpression {
    return { _brand: 'FilterExpression', type: 'gte', field, value } as unknown as FilterExpression
  }

  and(...filters: FilterExpression[]): FilterExpression {
    return { _brand: 'FilterExpression', type: 'and', filters } as unknown as FilterExpression
  }

  or(...filters: FilterExpression[]): FilterExpression {
    return { _brand: 'FilterExpression', type: 'or', filters } as unknown as FilterExpression
  }

  not(filter: FilterExpression): FilterExpression {
    return { _brand: 'FilterExpression', type: 'not', filter } as unknown as FilterExpression
  }
}
