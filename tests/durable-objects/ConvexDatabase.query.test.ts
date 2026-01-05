/**
 * TDD RED Phase Tests for ConvexDatabase Query Translation
 *
 * These tests define the expected behavior of query-to-SQL translation.
 * All tests should compile but FAIL because the implementation does not exist yet.
 *
 * The translateQuery function should convert Convex-style queries into
 * SQLite-compatible SQL statements for use with Cloudflare Durable Objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  translateQuery,
  translateFilter,
  translateOrdering,
  translateLimit,
  buildWhereClause,
  type QueryDefinition,
  type QueryFilter,
  type FilterOperator,
  type LogicalFilter,
  type OrderSpec,
  type IndexQueryDefinition,
  type TranslatedQuery,
} from '../../src/durable-objects/query-translator'

// ============================================================================
// Basic Query Tests
// ============================================================================

describe('Query Translation', () => {
  describe('basic queries', () => {
    it('should translate simple table query to SELECT', () => {
      const result = translateQuery({
        table: 'users',
        filters: [],
      })
      expect(result.sql).toBe('SELECT _id, _creationTime, data FROM "users" ORDER BY _creationTime ASC')
      expect(result.params).toEqual([])
    })

    it('should translate query with different table name', () => {
      const result = translateQuery({
        table: 'documents',
        filters: [],
      })
      expect(result.sql).toContain('FROM "documents"')
    })

    it('should handle table names with underscores', () => {
      const result = translateQuery({
        table: 'user_profiles',
        filters: [],
      })
      expect(result.sql).toContain('FROM "user_profiles"')
    })

    it('should escape table names to prevent SQL injection', () => {
      const result = translateQuery({
        table: 'users"; DROP TABLE users;--',
        filters: [],
      })
      // Should properly escape the malicious table name
      expect(result.sql).not.toContain('DROP TABLE')
    })

    it('should return structured query result with sql and params', () => {
      const result = translateQuery({
        table: 'users',
        filters: [],
      })
      expect(result).toHaveProperty('sql')
      expect(result).toHaveProperty('params')
      expect(typeof result.sql).toBe('string')
      expect(Array.isArray(result.params)).toBe(true)
    })
  })

  // ============================================================================
  // Single Filter Tests
  // ============================================================================

  describe('single filter queries', () => {
    it('should translate equality filter', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'name', op: 'eq', value: 'Alice' }],
      })
      expect(result.sql).toContain('WHERE')
      expect(result.sql).toContain("json_extract(data, '$.name')")
      expect(result.sql).toContain('= ?')
      expect(result.params).toContain('"Alice"')
    })

    it('should translate string equality filter with special characters', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'email', op: 'eq', value: "test'@example.com" }],
      })
      expect(result.params).toBeDefined()
      // Should use parameterized queries, not string interpolation
      expect(result.sql).toContain('?')
    })

    it('should translate numeric equality filter', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'age', op: 'eq', value: 25 }],
      })
      expect(result.sql).toContain("json_extract(data, '$.age')")
      expect(result.params).toContain('25')
    })

    it('should translate boolean equality filter', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'active', op: 'eq', value: true }],
      })
      expect(result.sql).toContain("json_extract(data, '$.active')")
      expect(result.params).toContain('true')
    })

    it('should translate null equality filter', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'deletedAt', op: 'eq', value: null }],
      })
      expect(result.sql).toContain("json_extract(data, '$.deletedAt')")
      expect(result.sql).toContain('IS NULL')
    })

    it('should translate filter on nested field', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'address.city', op: 'eq', value: 'Seattle' }],
      })
      expect(result.sql).toContain("json_extract(data, '$.address.city')")
    })

    it('should translate filter on deeply nested field', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'profile.settings.theme', op: 'eq', value: 'dark' }],
      })
      expect(result.sql).toContain("json_extract(data, '$.profile.settings.theme')")
    })
  })

  // ============================================================================
  // Multiple Filter Tests
  // ============================================================================

  describe('multiple filter queries', () => {
    it('should combine multiple filters with AND by default', () => {
      const result = translateQuery({
        table: 'users',
        filters: [
          { field: 'name', op: 'eq', value: 'Alice' },
          { field: 'age', op: 'gte', value: 18 },
        ],
      })
      expect(result.sql).toContain('AND')
      expect(result.sql).toContain("json_extract(data, '$.name')")
      expect(result.sql).toContain("json_extract(data, '$.age')")
    })

    it('should handle three filters', () => {
      const result = translateQuery({
        table: 'users',
        filters: [
          { field: 'active', op: 'eq', value: true },
          { field: 'age', op: 'gte', value: 18 },
          { field: 'role', op: 'eq', value: 'admin' },
        ],
      })
      // Should have two ANDs for three conditions
      const andCount = (result.sql.match(/AND/g) || []).length
      expect(andCount).toBe(2)
    })

    it('should preserve filter order in params', () => {
      const result = translateQuery({
        table: 'users',
        filters: [
          { field: 'name', op: 'eq', value: 'Alice' },
          { field: 'age', op: 'eq', value: 30 },
        ],
      })
      expect(result.params[0]).toBe('"Alice"')
      expect(result.params[1]).toBe('30')
    })

    it('should handle filters on same field', () => {
      const result = translateQuery({
        table: 'products',
        filters: [
          { field: 'price', op: 'gte', value: 10 },
          { field: 'price', op: 'lte', value: 100 },
        ],
      })
      // Both conditions on price should be present
      const priceCount = (result.sql.match(/json_extract\(data, '\$\.price'\)/g) || []).length
      expect(priceCount).toBe(2)
    })
  })

  // ============================================================================
  // Filter Operator Tests
  // ============================================================================

  describe('filter operators', () => {
    describe('eq (equals)', () => {
      it('should translate eq operator for strings', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'status', op: 'eq', value: 'active' }],
        })
        expect(result.sql).toContain('= ?')
      })

      it('should translate eq operator for numbers', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'count', op: 'eq', value: 42 }],
        })
        expect(result.sql).toContain('= ?')
        expect(result.params).toContain('42')
      })

      it('should translate eq operator for zero', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'count', op: 'eq', value: 0 }],
        })
        expect(result.params).toContain('0')
      })

      it('should translate eq operator for negative numbers', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'balance', op: 'eq', value: -100 }],
        })
        expect(result.params).toContain('-100')
      })

      it('should translate eq operator for floating point', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'price', op: 'eq', value: 19.99 }],
        })
        expect(result.params).toContain('19.99')
      })
    })

    describe('neq (not equals)', () => {
      it('should translate neq operator', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'status', op: 'neq', value: 'deleted' }],
        })
        expect(result.sql).toContain('!= ?')
      })

      it('should translate neq operator for numbers', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'count', op: 'neq', value: 0 }],
        })
        expect(result.sql).toContain('!= ?')
      })

      it('should translate neq operator for null', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'deletedAt', op: 'neq', value: null }],
        })
        expect(result.sql).toContain('IS NOT NULL')
      })

      it('should translate neq operator for boolean', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'active', op: 'neq', value: false }],
        })
        expect(result.sql).toContain('!= ?')
        expect(result.params).toContain('false')
      })
    })

    describe('lt (less than)', () => {
      it('should translate lt operator', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'price', op: 'lt', value: 100 }],
        })
        expect(result.sql).toContain('< ?')
        expect(result.params).toContain('100')
      })

      it('should translate lt operator for floating point', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'rating', op: 'lt', value: 4.5 }],
        })
        expect(result.sql).toContain('< ?')
        expect(result.params).toContain('4.5')
      })

      it('should translate lt operator for negative numbers', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'temperature', op: 'lt', value: -10 }],
        })
        expect(result.params).toContain('-10')
      })

      it('should translate lt operator for timestamps', () => {
        const timestamp = Date.now()
        const result = translateQuery({
          table: 'items',
          filters: [{ field: '_creationTime', op: 'lt', value: timestamp }],
        })
        expect(result.sql).toContain('< ?')
      })
    })

    describe('lte (less than or equal)', () => {
      it('should translate lte operator', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'price', op: 'lte', value: 100 }],
        })
        expect(result.sql).toContain('<= ?')
      })

      it('should translate lte operator for dates', () => {
        const result = translateQuery({
          table: 'events',
          filters: [{ field: 'endDate', op: 'lte', value: 1704067200000 }],
        })
        expect(result.sql).toContain('<= ?')
      })
    })

    describe('gt (greater than)', () => {
      it('should translate gt operator', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'price', op: 'gt', value: 50 }],
        })
        expect(result.sql).toContain('> ?')
        expect(result.params).toContain('50')
      })

      it('should translate gt operator for zero', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'quantity', op: 'gt', value: 0 }],
        })
        expect(result.sql).toContain('> ?')
        expect(result.params).toContain('0')
      })
    })

    describe('gte (greater than or equal)', () => {
      it('should translate gte operator', () => {
        const result = translateQuery({
          table: 'items',
          filters: [{ field: 'price', op: 'gte', value: 50 }],
        })
        expect(result.sql).toContain('>= ?')
        expect(result.params).toContain('50')
      })

      it('should translate gte operator for age restriction', () => {
        const result = translateQuery({
          table: 'users',
          filters: [{ field: 'age', op: 'gte', value: 18 }],
        })
        expect(result.sql).toContain('>= ?')
      })
    })

    describe('translateFilter helper', () => {
      it('should translate a single filter to SQL fragment', () => {
        const result = translateFilter({ field: 'name', op: 'eq', value: 'test' })
        expect(result.sql).toContain("json_extract(data, '$.name')")
        expect(result.sql).toContain('= ?')
        expect(result.params).toEqual(['"test"'])
      })

      it('should handle all operator types', () => {
        const operators: FilterOperator[] = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte']
        const sqlOps = ['=', '!=', '<', '<=', '>', '>=']

        operators.forEach((op, index) => {
          const result = translateFilter({ field: 'value', op, value: 10 })
          expect(result.sql).toContain(sqlOps[index])
        })
      })
    })
  })

  // ============================================================================
  // Ordering Tests
  // ============================================================================

  describe('ordering', () => {
    describe('ascending order', () => {
      it('should translate ascending order', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          order: { field: 'name', direction: 'asc' },
        })
        expect(result.sql).toContain('ORDER BY')
        expect(result.sql).toContain("json_extract(data, '$.name')")
        expect(result.sql).toContain('ASC')
      })

      it('should order by _creationTime ascending', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          order: { field: '_creationTime', direction: 'asc' },
        })
        expect(result.sql).toContain('ORDER BY _creationTime ASC')
      })

      it('should order by _id ascending', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          order: { field: '_id', direction: 'asc' },
        })
        expect(result.sql).toContain('ORDER BY _id ASC')
      })
    })

    describe('descending order', () => {
      it('should translate descending order', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          order: { field: 'createdAt', direction: 'desc' },
        })
        expect(result.sql).toContain('ORDER BY')
        expect(result.sql).toContain('DESC')
      })

      it('should order by _creationTime descending', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          order: { field: '_creationTime', direction: 'desc' },
        })
        expect(result.sql).toContain('ORDER BY _creationTime DESC')
      })

      it('should order by numeric field descending', () => {
        const result = translateQuery({
          table: 'products',
          filters: [],
          order: { field: 'price', direction: 'desc' },
        })
        expect(result.sql).toContain("json_extract(data, '$.price')")
        expect(result.sql).toContain('DESC')
      })
    })

    describe('default ordering', () => {
      it('should default to _creationTime ASC when no order specified', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
        })
        expect(result.sql).toContain('ORDER BY _creationTime ASC')
      })
    })

    describe('ordering with nested fields', () => {
      it('should order by nested field', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          order: { field: 'profile.score', direction: 'desc' },
        })
        expect(result.sql).toContain("json_extract(data, '$.profile.score')")
        expect(result.sql).toContain('DESC')
      })
    })

    describe('translateOrdering helper', () => {
      it('should translate order spec to SQL fragment', () => {
        const result = translateOrdering({ field: 'name', direction: 'asc' })
        expect(result).toContain('ORDER BY')
        expect(result).toContain('ASC')
      })

      it('should handle system fields without json_extract', () => {
        const result = translateOrdering({ field: '_creationTime', direction: 'desc' })
        expect(result).toBe('ORDER BY _creationTime DESC')
        expect(result).not.toContain('json_extract')
      })
    })
  })

  // ============================================================================
  // Limit Tests
  // ============================================================================

  describe('limit', () => {
    it('should translate limit clause', () => {
      const result = translateQuery({
        table: 'users',
        filters: [],
        limit: 10,
      })
      expect(result.sql).toContain('LIMIT 10')
    })

    it('should translate limit of 1', () => {
      const result = translateQuery({
        table: 'users',
        filters: [],
        limit: 1,
      })
      expect(result.sql).toContain('LIMIT 1')
    })

    it('should translate large limit', () => {
      const result = translateQuery({
        table: 'users',
        filters: [],
        limit: 10000,
      })
      expect(result.sql).toContain('LIMIT 10000')
    })

    it('should not include LIMIT when not specified', () => {
      const result = translateQuery({
        table: 'users',
        filters: [],
      })
      expect(result.sql).not.toContain('LIMIT')
    })

    it('should handle limit of 0', () => {
      const result = translateQuery({
        table: 'users',
        filters: [],
        limit: 0,
      })
      // Limit 0 should either return empty or be handled specially
      expect(result.sql).toContain('LIMIT 0')
    })

    it('should place LIMIT after ORDER BY', () => {
      const result = translateQuery({
        table: 'users',
        filters: [],
        order: { field: 'name', direction: 'asc' },
        limit: 10,
      })
      const orderIndex = result.sql.indexOf('ORDER BY')
      const limitIndex = result.sql.indexOf('LIMIT')
      expect(limitIndex).toBeGreaterThan(orderIndex)
    })

    describe('translateLimit helper', () => {
      it('should translate limit to SQL fragment', () => {
        const result = translateLimit(25)
        expect(result).toBe('LIMIT 25')
      })

      it('should return empty string for undefined limit', () => {
        const result = translateLimit(undefined)
        expect(result).toBe('')
      })
    })
  })

  // ============================================================================
  // Logical Operator Tests (AND / OR / Nested)
  // ============================================================================

  describe('logical operators', () => {
    describe('AND operator', () => {
      it('should support explicit AND filter', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          logicalFilter: {
            type: 'and',
            filters: [
              { field: 'active', op: 'eq', value: true },
              { field: 'age', op: 'gte', value: 18 },
            ],
          },
        })
        expect(result.sql).toContain('AND')
        expect(result.sql).toContain("json_extract(data, '$.active')")
        expect(result.sql).toContain("json_extract(data, '$.age')")
      })

      it('should handle AND with three conditions', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          logicalFilter: {
            type: 'and',
            filters: [
              { field: 'a', op: 'eq', value: 1 },
              { field: 'b', op: 'eq', value: 2 },
              { field: 'c', op: 'eq', value: 3 },
            ],
          },
        })
        const andCount = (result.sql.match(/AND/g) || []).length
        expect(andCount).toBe(2)
      })

      it('should wrap AND conditions in parentheses', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          logicalFilter: {
            type: 'and',
            filters: [
              { field: 'a', op: 'eq', value: 1 },
              { field: 'b', op: 'eq', value: 2 },
            ],
          },
        })
        expect(result.sql).toContain('(')
        expect(result.sql).toContain(')')
      })
    })

    describe('OR operator', () => {
      it('should support OR filter', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          logicalFilter: {
            type: 'or',
            filters: [
              { field: 'role', op: 'eq', value: 'admin' },
              { field: 'role', op: 'eq', value: 'superadmin' },
            ],
          },
        })
        expect(result.sql).toContain('OR')
      })

      it('should handle OR with different fields', () => {
        const result = translateQuery({
          table: 'items',
          filters: [],
          logicalFilter: {
            type: 'or',
            filters: [
              { field: 'status', op: 'eq', value: 'pending' },
              { field: 'priority', op: 'eq', value: 'high' },
            ],
          },
        })
        expect(result.sql).toContain('OR')
        expect(result.sql).toContain("json_extract(data, '$.status')")
        expect(result.sql).toContain("json_extract(data, '$.priority')")
      })

      it('should wrap OR conditions in parentheses', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          logicalFilter: {
            type: 'or',
            filters: [
              { field: 'a', op: 'eq', value: 1 },
              { field: 'b', op: 'eq', value: 2 },
            ],
          },
        })
        // Check that OR conditions are wrapped in parentheses
        // The WHERE clause should contain (... OR ...)
        expect(result.sql).toContain('OR')
        expect(result.sql).toMatch(/\(.+OR.+\)/)
      })

      it('should handle OR with three conditions', () => {
        const result = translateQuery({
          table: 'tasks',
          filters: [],
          logicalFilter: {
            type: 'or',
            filters: [
              { field: 'status', op: 'eq', value: 'todo' },
              { field: 'status', op: 'eq', value: 'in_progress' },
              { field: 'status', op: 'eq', value: 'review' },
            ],
          },
        })
        // Count only the OR logical operators (not ORDER BY)
        const orCount = (result.sql.match(/ OR /g) || []).length
        expect(orCount).toBe(2)
      })
    })

    describe('nested logical operators', () => {
      it('should support nested AND within OR', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          logicalFilter: {
            type: 'or',
            filters: [
              {
                type: 'and',
                filters: [
                  { field: 'role', op: 'eq', value: 'admin' },
                  { field: 'active', op: 'eq', value: true },
                ],
              },
              { field: 'superuser', op: 'eq', value: true },
            ],
          },
        })
        expect(result.sql).toContain('OR')
        expect(result.sql).toContain('AND')
      })

      it('should support nested OR within AND', () => {
        const result = translateQuery({
          table: 'products',
          filters: [],
          logicalFilter: {
            type: 'and',
            filters: [
              { field: 'inStock', op: 'eq', value: true },
              {
                type: 'or',
                filters: [
                  { field: 'category', op: 'eq', value: 'electronics' },
                  { field: 'category', op: 'eq', value: 'computers' },
                ],
              },
            ],
          },
        })
        expect(result.sql).toContain('AND')
        expect(result.sql).toContain('OR')
      })

      it('should handle deeply nested logical operators', () => {
        const result = translateQuery({
          table: 'items',
          filters: [],
          logicalFilter: {
            type: 'and',
            filters: [
              {
                type: 'or',
                filters: [
                  {
                    type: 'and',
                    filters: [
                      { field: 'a', op: 'eq', value: 1 },
                      { field: 'b', op: 'eq', value: 2 },
                    ],
                  },
                  { field: 'c', op: 'eq', value: 3 },
                ],
              },
              { field: 'd', op: 'eq', value: 4 },
            ],
          },
        })
        // Should have proper nesting with parentheses
        expect(result.sql).toContain('AND')
        expect(result.sql).toContain('OR')
      })

      it('should properly parenthesize complex nested conditions', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          logicalFilter: {
            type: 'or',
            filters: [
              {
                type: 'and',
                filters: [
                  { field: 'a', op: 'eq', value: 1 },
                  { field: 'b', op: 'eq', value: 2 },
                ],
              },
              {
                type: 'and',
                filters: [
                  { field: 'c', op: 'eq', value: 3 },
                  { field: 'd', op: 'eq', value: 4 },
                ],
              },
            ],
          },
        })
        // Structure should be: ((a AND b) OR (c AND d))
        const sql = result.sql
        const openParens = (sql.match(/\(/g) || []).length
        const closeParens = (sql.match(/\)/g) || []).length
        expect(openParens).toBe(closeParens)
        expect(openParens).toBeGreaterThanOrEqual(3) // At least 3 levels of parens
      })
    })

    describe('combining filters array with logicalFilter', () => {
      it('should combine basic filters with logicalFilter using AND', () => {
        const result = translateQuery({
          table: 'users',
          filters: [{ field: 'deleted', op: 'eq', value: false }],
          logicalFilter: {
            type: 'or',
            filters: [
              { field: 'role', op: 'eq', value: 'admin' },
              { field: 'role', op: 'eq', value: 'moderator' },
            ],
          },
        })
        // Should be: deleted = false AND (role = 'admin' OR role = 'moderator')
        expect(result.sql).toContain("json_extract(data, '$.deleted')")
        expect(result.sql).toContain('AND')
        expect(result.sql).toContain('OR')
      })
    })

    describe('buildWhereClause helper', () => {
      it('should build WHERE clause from filters', () => {
        const result = buildWhereClause([
          { field: 'name', op: 'eq', value: 'test' },
        ])
        expect(result.sql).toContain('WHERE')
        expect(result.sql).toContain("json_extract(data, '$.name')")
      })

      it('should return empty for no filters', () => {
        const result = buildWhereClause([])
        expect(result.sql).toBe('')
        expect(result.params).toEqual([])
      })

      it('should build WHERE clause with logical filter', () => {
        const result = buildWhereClause([], {
          type: 'or',
          filters: [
            { field: 'a', op: 'eq', value: 1 },
            { field: 'b', op: 'eq', value: 2 },
          ],
        })
        expect(result.sql).toContain('WHERE')
        expect(result.sql).toContain('OR')
      })
    })
  })

  // ============================================================================
  // Index Query Tests
  // ============================================================================

  describe('index queries', () => {
    describe('basic index queries', () => {
      it('should translate query using index', () => {
        const result = translateQuery({
          table: 'users',
          filters: [],
          index: {
            name: 'by_email',
            fields: ['email'],
          },
        })
        // Should hint at using the index
        expect(result.sql).toBeDefined()
      })

      it('should translate query with index and equality filter', () => {
        const result = translateQuery({
          table: 'users',
          filters: [{ field: 'email', op: 'eq', value: 'alice@example.com' }],
          index: {
            name: 'by_email',
            fields: ['email'],
          },
        })
        expect(result.sql).toContain("json_extract(data, '$.email')")
      })

      it('should translate compound index query', () => {
        const result = translateQuery({
          table: 'messages',
          filters: [
            { field: 'channelId', op: 'eq', value: 'channel_123' },
            { field: 'timestamp', op: 'gte', value: 1704067200000 },
          ],
          index: {
            name: 'by_channel_time',
            fields: ['channelId', 'timestamp'],
          },
        })
        expect(result.sql).toContain("json_extract(data, '$.channelId')")
        expect(result.sql).toContain("json_extract(data, '$.timestamp')")
      })
    })

    describe('index with range queries', () => {
      it('should support index with range on last field', () => {
        const result = translateQuery({
          table: 'events',
          filters: [
            { field: 'userId', op: 'eq', value: 'user_123' },
            { field: 'timestamp', op: 'gt', value: 1704067200000 },
            { field: 'timestamp', op: 'lt', value: 1704153600000 },
          ],
          index: {
            name: 'by_user_time',
            fields: ['userId', 'timestamp'],
          },
        })
        expect(result.sql).toContain('>')
        expect(result.sql).toContain('<')
      })
    })

    describe('index ordering', () => {
      it('should order by index field', () => {
        const result = translateQuery({
          table: 'posts',
          filters: [{ field: 'authorId', op: 'eq', value: 'author_123' }],
          index: {
            name: 'by_author_created',
            fields: ['authorId', '_creationTime'],
          },
          order: { field: '_creationTime', direction: 'desc' },
        })
        expect(result.sql).toContain('ORDER BY')
        expect(result.sql).toContain('DESC')
      })
    })

    describe('index query validation', () => {
      it('should validate that filter fields match index prefix', () => {
        // This should work - filtering on first field of compound index
        const validQuery = translateQuery({
          table: 'messages',
          filters: [{ field: 'channelId', op: 'eq', value: 'ch_123' }],
          index: {
            name: 'by_channel_time',
            fields: ['channelId', 'timestamp'],
          },
        })
        expect(validQuery.sql).toBeDefined()
      })
    })
  })

  // ============================================================================
  // System Fields Tests
  // ============================================================================

  describe('system fields', () => {
    it('should filter by _id', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: '_id', op: 'eq', value: 'abc123xyz' }],
      })
      expect(result.sql).toContain('_id = ?')
      expect(result.sql).not.toContain('json_extract')
    })

    it('should filter by _creationTime', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: '_creationTime', op: 'gt', value: 1704067200000 }],
      })
      expect(result.sql).toContain('_creationTime > ?')
      expect(result.sql).not.toContain('json_extract')
    })

    it('should combine system field with data field filters', () => {
      const result = translateQuery({
        table: 'users',
        filters: [
          { field: '_creationTime', op: 'gt', value: 1704067200000 },
          { field: 'active', op: 'eq', value: true },
        ],
      })
      expect(result.sql).toContain('_creationTime > ?')
      expect(result.sql).toContain("json_extract(data, '$.active')")
    })
  })

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty string values', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'name', op: 'eq', value: '' }],
      })
      expect(result.params).toContain('""')
    })

    it('should handle very long string values', () => {
      const longString = 'a'.repeat(10000)
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'bio', op: 'eq', value: longString }],
      })
      expect(result.params[0]).toContain(longString)
    })

    it('should handle special characters in field names', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'user-name', op: 'eq', value: 'test' }],
      })
      // Should properly escape or handle field names with special chars
      expect(result.sql).toBeDefined()
    })

    it('should handle array values (for potential IN queries)', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'tags', op: 'eq', value: ['admin', 'user'] }],
      })
      expect(result.sql).toBeDefined()
    })

    it('should handle object values', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'metadata', op: 'eq', value: { key: 'value' } }],
      })
      expect(result.params).toBeDefined()
    })

    it('should handle undefined filter value gracefully', () => {
      expect(() =>
        translateQuery({
          table: 'users',
          filters: [{ field: 'name', op: 'eq', value: undefined }],
        })
      ).toThrow()
    })

    it('should handle NaN filter value', () => {
      expect(() =>
        translateQuery({
          table: 'users',
          filters: [{ field: 'score', op: 'eq', value: NaN }],
        })
      ).toThrow()
    })

    it('should handle Infinity filter value', () => {
      expect(() =>
        translateQuery({
          table: 'users',
          filters: [{ field: 'score', op: 'lt', value: Infinity }],
        })
      ).toThrow()
    })
  })

  // ============================================================================
  // SQL Injection Prevention Tests
  // ============================================================================

  describe('SQL injection prevention', () => {
    it('should use parameterized queries for string values', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'name', op: 'eq', value: "'; DROP TABLE users;--" }],
      })
      // Should not contain the malicious SQL directly
      expect(result.sql).not.toContain('DROP TABLE')
      // Should use parameterization
      expect(result.sql).toContain('?')
    })

    it('should escape field names with quotes', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'field"; DROP TABLE users;--', op: 'eq', value: 'test' }],
      })
      expect(result.sql).not.toContain('DROP TABLE')
    })

    it('should properly quote table names', () => {
      const result = translateQuery({
        table: 'users',
        filters: [],
      })
      expect(result.sql).toContain('"users"')
    })
  })

  // ============================================================================
  // Complex Query Composition Tests
  // ============================================================================

  describe('complex query composition', () => {
    it('should compose filter + order + limit', () => {
      const result = translateQuery({
        table: 'products',
        filters: [
          { field: 'category', op: 'eq', value: 'electronics' },
          { field: 'price', op: 'lte', value: 1000 },
        ],
        order: { field: 'price', direction: 'asc' },
        limit: 10,
      })
      expect(result.sql).toContain('WHERE')
      expect(result.sql).toContain('ORDER BY')
      expect(result.sql).toContain('LIMIT 10')
    })

    it('should compose logical filter + order + limit', () => {
      const result = translateQuery({
        table: 'users',
        filters: [],
        logicalFilter: {
          type: 'or',
          filters: [
            { field: 'role', op: 'eq', value: 'admin' },
            { field: 'role', op: 'eq', value: 'moderator' },
          ],
        },
        order: { field: 'name', direction: 'asc' },
        limit: 50,
      })
      expect(result.sql).toContain('OR')
      expect(result.sql).toContain('ORDER BY')
      expect(result.sql).toContain('LIMIT 50')
    })

    it('should compose index query + filter + order + limit', () => {
      const result = translateQuery({
        table: 'messages',
        filters: [
          { field: 'channelId', op: 'eq', value: 'ch_123' },
          { field: 'timestamp', op: 'gte', value: 1704067200000 },
        ],
        index: {
          name: 'by_channel_time',
          fields: ['channelId', 'timestamp'],
        },
        order: { field: 'timestamp', direction: 'desc' },
        limit: 100,
      })
      expect(result.sql).toContain('WHERE')
      expect(result.sql).toContain('AND')
      expect(result.sql).toContain('ORDER BY')
      expect(result.sql).toContain('DESC')
      expect(result.sql).toContain('LIMIT 100')
    })

    it('should maintain correct SQL clause order', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'active', op: 'eq', value: true }],
        order: { field: 'name', direction: 'asc' },
        limit: 10,
      })

      const whereIndex = result.sql.indexOf('WHERE')
      const orderIndex = result.sql.indexOf('ORDER BY')
      const limitIndex = result.sql.indexOf('LIMIT')

      expect(whereIndex).toBeLessThan(orderIndex)
      expect(orderIndex).toBeLessThan(limitIndex)
    })
  })

  // ============================================================================
  // Performance and Optimization Hints
  // ============================================================================

  describe('query optimization hints', () => {
    it('should return index hint when index is specified', () => {
      const result = translateQuery({
        table: 'users',
        filters: [{ field: 'email', op: 'eq', value: 'test@example.com' }],
        index: {
          name: 'by_email',
          fields: ['email'],
        },
      })
      // Result should include optimization hints
      expect(result).toHaveProperty('indexHint')
      expect((result as TranslatedQuery & { indexHint?: string }).indexHint).toBe('by_email')
    })
  })
})
