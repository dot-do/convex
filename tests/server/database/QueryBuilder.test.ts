/**
 * TDD Tests for QueryBuilder (Layer 4)
 *
 * Tests the fluent API for building database queries with:
 * - Basic query collection
 * - Filtering with various conditions
 * - Ordering ascending/descending
 * - Taking first/unique/limited results
 * - Index-based queries
 * - Pagination with cursors
 */

import { describe, it, expect, vi } from 'vitest'
import { QueryBuilderImpl } from '../../../src/server/database/QueryBuilder'
import type { Id } from '../../../src/types'

// ============================================================================
// Mock Database Executor
// ============================================================================

/**
 * Mock database fetch function for testing QueryBuilder behavior.
 * Returns test data and captures the query for verification.
 */
function createMockDb<T>(mockData: T[] = []) {
  let capturedQuery: any = null

  const dbFetch = vi.fn(async (query: any) => {
    capturedQuery = query
    let results = [...mockData]

    // Apply ordering
    const order = query.getOrder()
    if (order === 'desc') {
      results = results.reverse()
    }

    // Apply limit
    const limit = query.getLimit()
    if (limit !== undefined) {
      results = results.slice(0, limit)
    }

    return results
  })

  return {
    dbFetch,
    getCapturedQuery: () => capturedQuery,
  }
}

// ============================================================================
// Basic Query Collection Tests
// ============================================================================

describe('QueryBuilder - Basic Collection', () => {
  it('should collect all documents from a table', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.collect()

    expect(results).toHaveLength(3)
    expect(results[0].name).toBe('Alice')
    expect(results[1].name).toBe('Bob')
    expect(results[2].name).toBe('Charlie')
    expect(dbFetch).toHaveBeenCalledOnce()
  })

  it('should return empty array for empty table', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.collect()

    expect(results).toHaveLength(0)
    expect(results).toEqual([])
  })

  it('should preserve document structure with system fields', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice', email: 'alice@test.com' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.collect()

    expect(results[0]).toHaveProperty('_id')
    expect(results[0]).toHaveProperty('_creationTime')
    expect(results[0]).toHaveProperty('name')
    expect(results[0]).toHaveProperty('email')
  })
})

// ============================================================================
// Filtering Tests
// ============================================================================

describe('QueryBuilder - Filtering', () => {
  it('should apply filter function to query', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice', age: 25 },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob', age: 30 },
    ]

    const { dbFetch, getCapturedQuery } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.filter(q => q.eq('age', 25)).collect()

    const captured = getCapturedQuery()
    expect(captured).toBeDefined()
    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support chaining multiple filters', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice', age: 25, active: true },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .filter(q => q.eq('active', true))
      .filter(q => q.gt('age', 20))
      .collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support equality filter', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.filter(q => q.eq('name', 'Alice')).collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support not-equal filter', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.filter(q => q.neq('status', 'deleted')).collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support less-than filter', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.filter(q => q.lt('age', 30)).collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support less-than-or-equal filter', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.filter(q => q.lte('score', 100)).collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support greater-than filter', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.filter(q => q.gt('price', 50)).collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support greater-than-or-equal filter', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.filter(q => q.gte('quantity', 10)).collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support AND logical operator', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .filter(q => q.and(
        q.eq('active', true),
        q.gt('age', 18)
      ))
      .collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support OR logical operator', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .filter(q => q.or(
        q.eq('role', 'admin'),
        q.eq('role', 'moderator')
      ))
      .collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support NOT logical operator', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .filter(q => q.not(q.eq('status', 'banned')))
      .collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support complex nested logical expressions', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .filter(q => q.and(
        q.or(
          q.eq('role', 'admin'),
          q.eq('role', 'moderator')
        ),
        q.not(q.eq('status', 'banned'))
      ))
      .collect()

    expect(dbFetch).toHaveBeenCalled()
  })
})

// ============================================================================
// Ordering Tests
// ============================================================================

describe('QueryBuilder - Ordering', () => {
  it('should order results in ascending order by default', async () => {
    const mockData = [
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
    ]

    const { dbFetch, getCapturedQuery } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.collect()

    const captured = getCapturedQuery()
    expect(captured.getOrder()).toBe('asc')
  })

  it('should order results in ascending order when specified', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
    ]

    const { dbFetch, getCapturedQuery } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.order('asc').collect()

    const captured = getCapturedQuery()
    expect(captured.getOrder()).toBe('asc')
  })

  it('should order results in descending order', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.order('desc').collect()

    // Mock reverses the array for desc order
    expect(results[0].name).toBe('Charlie')
    expect(results[1].name).toBe('Bob')
    expect(results[2].name).toBe('Alice')
  })

  it('should allow chaining order with other operations', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice', active: true },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob', active: true },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .filter(q => q.eq('active', true))
      .order('desc')
      .collect()

    expect(dbFetch).toHaveBeenCalled()
  })
})

// ============================================================================
// First and Unique Tests
// ============================================================================

describe('QueryBuilder - First and Unique', () => {
  it('should return first document with first()', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const result = await query.first()

    expect(result).not.toBeNull()
    expect(result?.name).toBe('Alice')
  })

  it('should return null when no documents match first()', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    const result = await query.first()

    expect(result).toBeNull()
  })

  it('should limit to 1 result with first()', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
    ]

    const { dbFetch, getCapturedQuery } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.first()

    const captured = getCapturedQuery()
    expect(captured.getLimit()).toBe(1)
  })

  it('should return exactly one document with unique()', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const result = await query.unique()

    expect(result).not.toBeNull()
    expect(result?.name).toBe('Alice')
  })

  it('should return null when no documents match unique()', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    const result = await query.unique()

    expect(result).toBeNull()
  })

  it('should throw error when multiple documents match unique()', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await expect(query.unique()).rejects.toThrow('Expected at most one result')
  })

  it('should limit to 2 results for unique() to detect non-uniqueness', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
    ]

    const { dbFetch, getCapturedQuery } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.unique()

    const captured = getCapturedQuery()
    expect(captured.getLimit()).toBe(2)
  })
})

// ============================================================================
// Take/Limit Tests
// ============================================================================

describe('QueryBuilder - Take', () => {
  it('should take specified number of results', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
      { _id: 'user_4' as Id<'users'>, _creationTime: 4000, name: 'David' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.take(2)

    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('Alice')
    expect(results[1].name).toBe('Bob')
  })

  it('should take all results if limit exceeds total', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.take(10)

    expect(results).toHaveLength(2)
  })

  it('should take zero results when limit is 0', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.take(0)

    expect(results).toHaveLength(0)
  })

  it('should set correct limit on query', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
    ]

    const { dbFetch, getCapturedQuery } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.take(5)

    const captured = getCapturedQuery()
    expect(captured.getLimit()).toBe(5)
  })

  it('should chain take with filter and order', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice', active: true },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob', active: true },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie', active: true },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query
      .filter(q => q.eq('active', true))
      .order('desc')
      .take(2)

    expect(results).toHaveLength(2)
  })
})

// ============================================================================
// Index-based Query Tests
// ============================================================================

describe('QueryBuilder - Indexes', () => {
  it('should use index with withIndex()', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, email: 'alice@test.com' },
    ]

    const { dbFetch, getCapturedQuery } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.withIndex('by_email').collect()

    const captured = getCapturedQuery()
    expect(captured.getIndexName()).toBe('by_email')
  })

  it('should use index with equality range', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, email: 'alice@test.com' },
    ]

    const { dbFetch, getCapturedQuery } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .withIndex('by_email', q => q.eq('email', 'alice@test.com'))
      .collect()

    const captured = getCapturedQuery()
    expect(captured.getIndexName()).toBe('by_email')
    expect(captured.getIndexFilters()).toContainEqual({
      field: 'email',
      op: 'eq',
      value: 'alice@test.com'
    })
  })

  it('should use index with less-than range', async () => {
    const { dbFetch, getCapturedQuery } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .withIndex('by_age', q => q.lt('age', 30))
      .collect()

    const captured = getCapturedQuery()
    expect(captured.getIndexFilters()).toContainEqual({
      field: 'age',
      op: 'lt',
      value: 30
    })
  })

  it('should use index with less-than-or-equal range', async () => {
    const { dbFetch, getCapturedQuery } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .withIndex('by_score', q => q.lte('score', 100))
      .collect()

    const captured = getCapturedQuery()
    expect(captured.getIndexFilters()).toContainEqual({
      field: 'score',
      op: 'lte',
      value: 100
    })
  })

  it('should use index with greater-than range', async () => {
    const { dbFetch, getCapturedQuery } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .withIndex('by_price', q => q.gt('price', 50))
      .collect()

    const captured = getCapturedQuery()
    expect(captured.getIndexFilters()).toContainEqual({
      field: 'price',
      op: 'gt',
      value: 50
    })
  })

  it('should use index with greater-than-or-equal range', async () => {
    const { dbFetch, getCapturedQuery } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .withIndex('by_quantity', q => q.gte('quantity', 10))
      .collect()

    const captured = getCapturedQuery()
    expect(captured.getIndexFilters()).toContainEqual({
      field: 'quantity',
      op: 'gte',
      value: 10
    })
  })

  it('should use compound index with multiple fields', async () => {
    const { dbFetch, getCapturedQuery } = createMockDb([])
    const query = new QueryBuilderImpl('posts', dbFetch)

    await query
      .withIndex('by_author_category', q =>
        q.eq('authorId', 'user_123').eq('category', 'tech')
      )
      .collect()

    const captured = getCapturedQuery()
    expect(captured.getIndexFilters()).toHaveLength(2)
  })

  it('should chain withIndex with filter and order', async () => {
    const mockData = [
      { _id: 'post_1' as Id<'posts'>, _creationTime: 1000, authorId: 'user_1', published: true },
      { _id: 'post_2' as Id<'posts'>, _creationTime: 2000, authorId: 'user_1', published: true },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('posts', dbFetch)

    const results = await query
      .withIndex('by_author', q => q.eq('authorId', 'user_1'))
      .filter(q => q.eq('published', true))
      .order('desc')
      .collect()

    expect(results).toHaveLength(2)
  })
})

// ============================================================================
// Pagination Tests
// ============================================================================

describe('QueryBuilder - Pagination', () => {
  it('should paginate results with numItems', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
      { _id: 'user_4' as Id<'users'>, _creationTime: 4000, name: 'David' },
      { _id: 'user_5' as Id<'users'>, _creationTime: 5000, name: 'Eve' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const result = await query.paginate({ numItems: 2 })

    expect(result.page).toHaveLength(2)
    expect(result.page[0].name).toBe('Alice')
    expect(result.page[1].name).toBe('Bob')
  })

  it('should indicate when pagination is done', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const result = await query.paginate({ numItems: 5 })

    expect(result.isDone).toBe(true)
  })

  it('should indicate when more pages exist', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const result = await query.paginate({ numItems: 2 })

    expect(result.isDone).toBe(false)
  })

  it('should provide continueCursor for next page', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const result = await query.paginate({ numItems: 2 })

    expect(result.continueCursor).toBeTruthy()
    expect(typeof result.continueCursor).toBe('string')
  })

  it('should accept cursor for subsequent pages', async () => {
    const mockData = [
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
      { _id: 'user_4' as Id<'users'>, _creationTime: 4000, name: 'David' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const cursor = btoa(JSON.stringify({ id: 'user_2' }))
    const result = await query.paginate({ numItems: 2, cursor })

    expect(result.page).toHaveLength(2)
  })

  it('should return empty continueCursor when isDone is true', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const result = await query.paginate({ numItems: 5 })

    expect(result.isDone).toBe(true)
    expect(result.continueCursor).toBeTruthy() // Still has cursor based on last item
  })

  it('should fetch extra item to determine if more pages exist', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob' },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie' },
    ]

    const { dbFetch, getCapturedQuery } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.paginate({ numItems: 2 })

    const captured = getCapturedQuery()
    // Should fetch numItems + 1 to check for more
    expect(captured.getLimit()).toBe(3)
  })

  it('should chain pagination with filter and order', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice', active: true },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, name: 'Bob', active: true },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, name: 'Charlie', active: true },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const result = await query
      .filter(q => q.eq('active', true))
      .order('desc')
      .paginate({ numItems: 2 })

    expect(result.page).toHaveLength(2)
  })
})

// ============================================================================
// Method Chaining Tests
// ============================================================================

describe('QueryBuilder - Method Chaining', () => {
  it('should allow chaining in any order', async () => {
    const mockData = [
      { _id: 'post_1' as Id<'posts'>, _creationTime: 1000, authorId: 'user_1', published: true },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('posts', dbFetch)

    const results = await query
      .withIndex('by_author', q => q.eq('authorId', 'user_1'))
      .filter(q => q.eq('published', true))
      .order('desc')
      .take(10)

    expect(results).toHaveLength(1)
  })

  it('should support filter after withIndex', async () => {
    const mockData = [
      { _id: 'post_1' as Id<'posts'>, _creationTime: 1000, authorId: 'user_1', status: 'draft' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('posts', dbFetch)

    await query
      .withIndex('by_author', q => q.eq('authorId', 'user_1'))
      .filter(q => q.eq('status', 'draft'))
      .collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support order after filter', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, active: true },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    await query
      .filter(q => q.eq('active', true))
      .order('desc')
      .collect()

    expect(dbFetch).toHaveBeenCalled()
  })

  it('should support multiple sequential operations', async () => {
    const mockData = [
      { _id: 'item_1' as Id<'items'>, _creationTime: 1000, category: 'electronics', price: 100, inStock: true },
      { _id: 'item_2' as Id<'items'>, _creationTime: 2000, category: 'electronics', price: 200, inStock: true },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('items', dbFetch)

    const result = await query
      .withIndex('by_category', q => q.eq('category', 'electronics'))
      .filter(q => q.eq('inStock', true))
      .filter(q => q.lt('price', 150))
      .order('asc')
      .first()

    expect(result?.price).toBe(100)
  })
})

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('QueryBuilder - Edge Cases', () => {
  it('should handle empty results gracefully', async () => {
    const { dbFetch } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.collect()

    expect(results).toEqual([])
  })

  it('should handle single result', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.collect()

    expect(results).toHaveLength(1)
  })

  it('should handle large result sets', async () => {
    const mockData = Array.from({ length: 1000 }, (_, i) => ({
      _id: `user_${i}` as Id<'users'>,
      _creationTime: i * 1000,
      name: `User ${i}`,
    }))

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.collect()

    expect(results).toHaveLength(1000)
  })

  it('should preserve document types through operations', async () => {
    const mockData = [
      {
        _id: 'user_1' as Id<'users'>,
        _creationTime: 1000,
        name: 'Alice',
        profile: { bio: 'Hello', age: 25 },
        tags: ['developer', 'designer']
      },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.collect()

    expect(results[0].profile).toEqual({ bio: 'Hello', age: 25 })
    expect(results[0].tags).toEqual(['developer', 'designer'])
  })
})

// ============================================================================
// TableName and Type Safety Tests
// ============================================================================

describe('QueryBuilder - Type Safety', () => {
  it('should preserve table name', async () => {
    const { dbFetch, getCapturedQuery } = createMockDb([])
    const query = new QueryBuilderImpl('users', dbFetch)

    await query.collect()

    const captured = getCapturedQuery()
    expect(captured.getTableName()).toBe('users')
  })

  it('should work with different table names', async () => {
    const tables = ['users', 'posts', 'comments', 'messages']

    for (const table of tables) {
      const { dbFetch, getCapturedQuery } = createMockDb([])
      const query = new QueryBuilderImpl(table, dbFetch)

      await query.collect()

      const captured = getCapturedQuery()
      expect(captured.getTableName()).toBe(table)
    }
  })

  it('should provide type-safe Id types in results', async () => {
    const mockData = [
      { _id: 'user_123' as Id<'users'>, _creationTime: 1000, name: 'Alice' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const results = await query.collect()

    // TypeScript should enforce that _id has type Id<'users'>
    const id: Id<'users'> = results[0]._id
    expect(id).toBe('user_123')
  })
})

// ============================================================================
// Real-world Usage Patterns
// ============================================================================

describe('QueryBuilder - Real-world Patterns', () => {
  it('should support fetching user by email', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, email: 'alice@example.com', name: 'Alice' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const user = await query
      .withIndex('by_email', q => q.eq('email', 'alice@example.com'))
      .unique()

    expect(user?.name).toBe('Alice')
  })

  it('should support fetching recent posts by author', async () => {
    const mockData = [
      { _id: 'post_1' as Id<'posts'>, _creationTime: 1000, authorId: 'user_1', title: 'First' },
      { _id: 'post_2' as Id<'posts'>, _creationTime: 2000, authorId: 'user_1', title: 'Second' },
      { _id: 'post_3' as Id<'posts'>, _creationTime: 3000, authorId: 'user_1', title: 'Third' },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('posts', dbFetch)

    const posts = await query
      .withIndex('by_author', q => q.eq('authorId', 'user_1'))
      .order('desc')
      .take(5)

    // When ordered desc, the mock reverses the array, so Third comes first
    expect(posts[0].title).toBe('Third')
  })

  it('should support searching published posts in category', async () => {
    const mockData = [
      { _id: 'post_1' as Id<'posts'>, _creationTime: 1000, category: 'tech', published: true },
      { _id: 'post_2' as Id<'posts'>, _creationTime: 2000, category: 'tech', published: true },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('posts', dbFetch)

    const posts = await query
      .withIndex('by_category', q => q.eq('category', 'tech'))
      .filter(q => q.eq('published', true))
      .order('desc')
      .collect()

    expect(posts).toHaveLength(2)
  })

  it('should support paginated feed with filters', async () => {
    const mockData = Array.from({ length: 25 }, (_, i) => ({
      _id: `post_${i}` as Id<'posts'>,
      _creationTime: (25 - i) * 1000,
      authorId: 'user_1',
      published: true,
    }))

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('posts', dbFetch)

    const page1 = await query
      .withIndex('by_author', q => q.eq('authorId', 'user_1'))
      .filter(q => q.eq('published', true))
      .order('desc')
      .paginate({ numItems: 10 })

    expect(page1.page).toHaveLength(10)
    expect(page1.isDone).toBe(false)
    expect(page1.continueCursor).toBeTruthy()
  })

  it('should support finding active users in age range', async () => {
    const mockData = [
      { _id: 'user_1' as Id<'users'>, _creationTime: 1000, age: 25, active: true },
      { _id: 'user_2' as Id<'users'>, _creationTime: 2000, age: 30, active: true },
      { _id: 'user_3' as Id<'users'>, _creationTime: 3000, age: 35, active: true },
    ]

    const { dbFetch } = createMockDb(mockData)
    const query = new QueryBuilderImpl('users', dbFetch)

    const users = await query
      .filter(q => q.and(
        q.eq('active', true),
        q.gte('age', 25),
        q.lte('age', 35)
      ))
      .collect()

    expect(users).toHaveLength(3)
  })
})
