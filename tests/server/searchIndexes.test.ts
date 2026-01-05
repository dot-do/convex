/**
 * TDD RED Phase Tests for Search Indexes (.searchIndex())
 *
 * These tests define the expected behavior for the searchIndex method on tables.
 * They are designed to FAIL until the implementation is complete.
 *
 * @see convex-h5h - Search Indexes (.searchIndex) Tests (RED)
 */

import { describe, it, expect } from 'vitest'
import { defineTable } from '../../src/server/schema'
import { v } from '../../src/values'

// ============================================================================
// Basic Search Index Creation
// ============================================================================

describe('.searchIndex() method', () => {
  describe('basic search index creation', () => {
    it('should create a search index with searchField', () => {
      const table = defineTable({
        title: v.string(),
        content: v.string(),
      }).searchIndex('search_content', {
        searchField: 'content',
      })

      expect(table.searchIndexes).toBeDefined()
      expect(table.searchIndexes['search_content']).toBeDefined()
      expect(table.searchIndexes['search_content'].searchField).toBe('content')
    })

    it('should create a search index with searchField and filterFields', () => {
      const table = defineTable({
        title: v.string(),
        content: v.string(),
        category: v.string(),
      }).searchIndex('search_content', {
        searchField: 'content',
        filterFields: ['title', 'category'],
      })

      expect(table.searchIndexes['search_content']).toBeDefined()
      expect(table.searchIndexes['search_content'].searchField).toBe('content')
      expect(table.searchIndexes['search_content'].filterFields).toEqual(['title', 'category'])
    })

    it('should allow multiple search indexes on same table', () => {
      const table = defineTable({
        title: v.string(),
        description: v.string(),
        body: v.string(),
      })
        .searchIndex('search_title', { searchField: 'title' })
        .searchIndex('search_body', { searchField: 'body' })
        .searchIndex('search_description', { searchField: 'description' })

      expect(Object.keys(table.searchIndexes)).toHaveLength(3)
      expect(table.searchIndexes['search_title']).toBeDefined()
      expect(table.searchIndexes['search_body']).toBeDefined()
      expect(table.searchIndexes['search_description']).toBeDefined()
    })

    it('should return the table builder for chaining', () => {
      const table = defineTable({
        title: v.string(),
        content: v.string(),
      })

      const result = table.searchIndex('search_content', { searchField: 'content' })

      expect(result).toBe(table)
    })
  })

  // ============================================================================
  // searchField Requirement
  // ============================================================================

  describe('searchField requirement', () => {
    it('should require searchField to be present', () => {
      // This test is expected to FAIL - current implementation may not validate
      expect(() => {
        defineTable({ text: v.string() }).searchIndex('search', {} as any)
      }).toThrow()
    })

    it('should require searchField to be non-empty string', () => {
      // This test is expected to FAIL - current implementation may not validate
      expect(() => {
        defineTable({ text: v.string() }).searchIndex('search', { searchField: '' })
      }).toThrow()
    })

    it('should reject searchField that is not in schema', () => {
      // This test is expected to FAIL - current implementation may not validate against schema
      expect(() => {
        defineTable({ text: v.string() }).searchIndex('search', {
          searchField: 'nonExistent',
        })
      }).toThrow(/field.*nonExistent.*(not.*defined|does not exist)|invalid.*field|unknown.*field/i)
    })

    it('should reject undefined searchField', () => {
      // This test is expected to FAIL
      expect(() => {
        defineTable({ text: v.string() }).searchIndex('search', {
          searchField: undefined as any,
        })
      }).toThrow()
    })

    it('should reject null searchField', () => {
      // This test is expected to FAIL
      expect(() => {
        defineTable({ text: v.string() }).searchIndex('search', {
          searchField: null as any,
        })
      }).toThrow()
    })
  })

  // ============================================================================
  // filterFields Behavior
  // ============================================================================

  describe('filterFields behavior', () => {
    it('should allow omitting filterFields entirely', () => {
      const table = defineTable({
        content: v.string(),
      }).searchIndex('search', {
        searchField: 'content',
      })

      expect(table.searchIndexes['search'].filterFields).toBeUndefined()
    })

    it('should allow empty filterFields array', () => {
      const table = defineTable({
        content: v.string(),
      }).searchIndex('search', {
        searchField: 'content',
        filterFields: [],
      })

      expect(table.searchIndexes['search'].filterFields).toEqual([])
    })

    it('should accept single filter field', () => {
      const table = defineTable({
        content: v.string(),
        category: v.string(),
      }).searchIndex('search', {
        searchField: 'content',
        filterFields: ['category'],
      })

      expect(table.searchIndexes['search'].filterFields).toEqual(['category'])
    })

    it('should accept multiple filter fields', () => {
      const table = defineTable({
        content: v.string(),
        category: v.string(),
        status: v.string(),
        author: v.string(),
      }).searchIndex('search', {
        searchField: 'content',
        filterFields: ['category', 'status', 'author'],
      })

      expect(table.searchIndexes['search'].filterFields).toEqual(['category', 'status', 'author'])
    })

    it('should reject filterFields that reference non-existent fields', () => {
      // This test is expected to FAIL - current implementation may not validate against schema
      expect(() => {
        defineTable({
          content: v.string(),
          category: v.string(),
        }).searchIndex('search', {
          searchField: 'content',
          filterFields: ['nonExistent'],
        })
      }).toThrow(/field.*nonExistent.*(not.*defined|does not exist)|invalid.*field|unknown.*field/i)
    })

    it('should reject filterFields when searchField is also in filterFields', () => {
      // This test is expected to FAIL - current implementation may not validate
      expect(() => {
        defineTable({
          content: v.string(),
        }).searchIndex('search', {
          searchField: 'content',
          filterFields: ['content'], // same as searchField - should be rejected
        })
      }).toThrow(/searchField.*cannot.*filterField|duplicate|same/i)
    })
  })

  // ============================================================================
  // Field Type Validation
  // ============================================================================

  describe('field type validation', () => {
    it('should require searchField to reference a string type field', () => {
      // This test is expected to FAIL - current implementation may not validate types
      expect(() => {
        defineTable({
          count: v.number(),
          text: v.string(),
        }).searchIndex('search', {
          searchField: 'count', // number field - should fail
        })
      }).toThrow(/searchField.*must.*string|type.*string|invalid.*type/i)
    })

    it('should reject searchField on boolean type', () => {
      // This test is expected to FAIL
      expect(() => {
        defineTable({
          isActive: v.boolean(),
        }).searchIndex('search', {
          searchField: 'isActive',
        })
      }).toThrow(/searchField.*must.*string|type.*string|invalid.*type/i)
    })

    it('should reject searchField on array type', () => {
      // This test is expected to FAIL
      expect(() => {
        defineTable({
          tags: v.array(v.string()),
        }).searchIndex('search', {
          searchField: 'tags',
        })
      }).toThrow(/searchField.*must.*string|type.*string|invalid.*type/i)
    })

    it('should reject searchField on object type', () => {
      // This test is expected to FAIL
      expect(() => {
        defineTable({
          metadata: v.object({ key: v.string() }),
        }).searchIndex('search', {
          searchField: 'metadata',
        })
      }).toThrow(/searchField.*must.*string|type.*string|invalid.*type/i)
    })

    it('should reject searchField on ID type', () => {
      // This test is expected to FAIL
      expect(() => {
        defineTable({
          authorId: v.id('users'),
        }).searchIndex('search', {
          searchField: 'authorId',
        })
      }).toThrow(/searchField.*must.*string|type.*string|invalid.*type/i)
    })

    it('should reject searchField on optional non-string type', () => {
      // This test is expected to FAIL
      expect(() => {
        defineTable({
          count: v.optional(v.number()),
        }).searchIndex('search', {
          searchField: 'count',
        })
      }).toThrow(/searchField.*must.*string|type.*string|invalid.*type/i)
    })

    it('should accept searchField on optional string type', () => {
      // Optional strings should be valid for search
      const table = defineTable({
        title: v.optional(v.string()),
      }).searchIndex('search', {
        searchField: 'title',
      })

      expect(table.searchIndexes['search'].searchField).toBe('title')
    })
  })

  // ============================================================================
  // Nested Field Paths
  // ============================================================================

  describe('nested field paths', () => {
    it('should support dot notation for nested string fields in searchField', () => {
      // This test is expected to FAIL - current implementation may not support nested paths
      const table = defineTable({
        author: v.object({
          bio: v.string(),
          name: v.string(),
        }),
      }).searchIndex('search_bio', {
        searchField: 'author.bio',
      })

      expect(table.searchIndexes['search_bio'].searchField).toBe('author.bio')
    })

    it('should support nested paths in filterFields', () => {
      // This test is expected to FAIL - current implementation may not support nested paths
      const table = defineTable({
        content: v.string(),
        metadata: v.object({
          category: v.string(),
          tags: v.array(v.string()),
        }),
      }).searchIndex('search', {
        searchField: 'content',
        filterFields: ['metadata.category'],
      })

      expect(table.searchIndexes['search'].filterFields).toContain('metadata.category')
    })

    it('should support deeply nested paths', () => {
      // This test is expected to FAIL
      const table = defineTable({
        data: v.object({
          nested: v.object({
            deep: v.object({
              content: v.string(),
            }),
          }),
        }),
      }).searchIndex('search', {
        searchField: 'data.nested.deep.content',
      })

      expect(table.searchIndexes['search'].searchField).toBe('data.nested.deep.content')
    })

    it('should reject invalid nested paths', () => {
      // This test is expected to FAIL
      expect(() => {
        defineTable({
          author: v.object({
            name: v.string(),
          }),
        }).searchIndex('search', {
          searchField: 'author.nonExistent',
        })
      }).toThrow(/field.*author\.nonExistent.*(not.*defined|does not exist)|invalid.*path|unknown.*field/i)
    })

    it('should reject nested path through non-object field', () => {
      // This test is expected to FAIL
      expect(() => {
        defineTable({
          title: v.string(),
        }).searchIndex('search', {
          searchField: 'title.nested', // title is string, not object
        })
      }).toThrow(/cannot.*access|invalid.*path|not.*object/i)
    })
  })

  // ============================================================================
  // Chaining Behavior
  // ============================================================================

  describe('chaining behavior', () => {
    it('should chain with .index()', () => {
      const table = defineTable({
        title: v.string(),
        content: v.string(),
        category: v.string(),
      })
        .index('by_category', ['category'])
        .searchIndex('search_content', { searchField: 'content' })

      expect(table.indexes['by_category']).toBeDefined()
      expect(table.searchIndexes['search_content']).toBeDefined()
    })

    it('should chain with .vectorIndex()', () => {
      const table = defineTable({
        content: v.string(),
        embedding: v.array(v.float64()),
      })
        .searchIndex('search_content', { searchField: 'content' })
        .vectorIndex('by_embedding', {
          vectorField: 'embedding',
          dimensions: 1536,
        })

      expect(table.searchIndexes['search_content']).toBeDefined()
      expect(table.vectorIndexes['by_embedding']).toBeDefined()
    })

    it('should chain multiple different index types', () => {
      const table = defineTable({
        title: v.string(),
        content: v.string(),
        category: v.string(),
        embedding: v.array(v.float64()),
      })
        .index('by_category', ['category'])
        .searchIndex('search_title', { searchField: 'title' })
        .searchIndex('search_content', { searchField: 'content' })
        .vectorIndex('by_embedding', { vectorField: 'embedding', dimensions: 1536 })

      expect(Object.keys(table.indexes)).toHaveLength(1)
      expect(Object.keys(table.searchIndexes)).toHaveLength(2)
      expect(Object.keys(table.vectorIndexes)).toHaveLength(1)
    })

    it('should maintain immutability of previous index definitions', () => {
      const baseTable = defineTable({
        title: v.string(),
        content: v.string(),
      })

      const tableWithSearch = baseTable.searchIndex('search1', { searchField: 'title' })
      const tableWithTwoSearches = tableWithSearch.searchIndex('search2', {
        searchField: 'content',
      })

      // Same reference expected for builder pattern
      expect(tableWithSearch).toBe(tableWithTwoSearches)
      expect(tableWithTwoSearches.searchIndexes['search1']).toBeDefined()
      expect(tableWithTwoSearches.searchIndexes['search2']).toBeDefined()
    })
  })

  // ============================================================================
  // Index Name Validation
  // ============================================================================

  describe('index name validation', () => {
    it('should require index name to be non-empty', () => {
      // This test is expected to FAIL - current implementation may not validate
      expect(() => {
        defineTable({ content: v.string() }).searchIndex('', { searchField: 'content' })
      }).toThrow(/name.*required|empty.*name|invalid.*name/i)
    })

    it('should reject duplicate search index names', () => {
      // This test is expected to FAIL - current implementation may not validate
      expect(() => {
        defineTable({ content: v.string() })
          .searchIndex('search', { searchField: 'content' })
          .searchIndex('search', { searchField: 'content' }) // duplicate name
      }).toThrow(/duplicate|already.*exists|name.*taken/i)
    })

    it('should allow same name across different index types', () => {
      // searchIndex and regular index can have same name
      const table = defineTable({
        category: v.string(),
        content: v.string(),
      })
        .index('by_content', ['category'])
        .searchIndex('by_content', { searchField: 'content' })

      expect(table.indexes['by_content']).toBeDefined()
      expect(table.searchIndexes['by_content']).toBeDefined()
    })

    it('should reject index names with invalid characters', () => {
      // This test is expected to FAIL - current implementation may not validate
      expect(() => {
        defineTable({ content: v.string() }).searchIndex('search-index!', {
          searchField: 'content',
        })
      }).toThrow(/invalid.*character|name.*format|alphanumeric/i)
    })

    it('should accept valid index names', () => {
      const table = defineTable({ content: v.string() })
        .searchIndex('search_content', { searchField: 'content' })
        .searchIndex('searchContent', { searchField: 'content' })
        .searchIndex('SEARCH_CONTENT', { searchField: 'content' })
        .searchIndex('search123', { searchField: 'content' })

      expect(Object.keys(table.searchIndexes)).toHaveLength(4)
    })
  })

  // ============================================================================
  // Type Inference
  // ============================================================================

  describe('type inference', () => {
    it('should maintain correct table type after adding search index', () => {
      const table = defineTable({
        title: v.string(),
        count: v.number(),
      }).searchIndex('search_title', { searchField: 'title' })

      // TypeScript should infer correct document type
      type DocType = typeof table.document
      const _titleField: DocType['title'] = v.string()
      const _countField: DocType['count'] = v.number()

      expect(table.document.title).toBeDefined()
      expect(table.document.count).toBeDefined()
    })

    it('should preserve index definitions in type', () => {
      const table = defineTable({
        content: v.string(),
        category: v.string(),
      })
        .index('by_category', ['category'])
        .searchIndex('search_content', { searchField: 'content' })

      // Check that both index types are accessible
      expect(typeof table.indexes).toBe('object')
      expect(typeof table.searchIndexes).toBe('object')
    })
  })

  // ============================================================================
  // Real-World Use Cases
  // ============================================================================

  describe('real-world use cases', () => {
    it('should support blog post search schema', () => {
      const posts = defineTable({
        title: v.string(),
        body: v.string(),
        excerpt: v.string(),
        authorId: v.id('users'),
        category: v.string(),
        status: v.string(),
        publishedAt: v.optional(v.number()),
      })
        .index('by_author', ['authorId'])
        .index('by_category', ['category'])
        .index('by_status', ['status'])
        .searchIndex('search_posts', {
          searchField: 'body',
          filterFields: ['category', 'status'],
        })

      expect(posts.searchIndexes['search_posts']).toBeDefined()
      expect(posts.searchIndexes['search_posts'].searchField).toBe('body')
      expect(posts.searchIndexes['search_posts'].filterFields).toEqual(['category', 'status'])
    })

    it('should support e-commerce product search schema', () => {
      const products = defineTable({
        name: v.string(),
        description: v.string(),
        brand: v.string(),
        category: v.string(),
        price: v.number(),
        inStock: v.boolean(),
      })
        .searchIndex('search_name', {
          searchField: 'name',
          filterFields: ['brand', 'category'],
        })
        .searchIndex('search_description', {
          searchField: 'description',
          filterFields: ['brand', 'category'],
        })

      expect(Object.keys(products.searchIndexes)).toHaveLength(2)
    })

    it('should support messaging app schema', () => {
      const messages = defineTable({
        content: v.string(),
        channelId: v.id('channels'),
        authorId: v.id('users'),
        threadId: v.optional(v.id('threads')),
        createdAt: v.number(),
      })
        .index('by_channel', ['channelId', 'createdAt'])
        .index('by_author', ['authorId', 'createdAt'])
        .searchIndex('search_messages', {
          searchField: 'content',
          filterFields: ['channelId', 'authorId'],
        })

      expect(messages.searchIndexes['search_messages']).toBeDefined()
      expect(messages.indexes['by_channel']).toBeDefined()
    })
  })

  // ============================================================================
  // Error Messages Quality
  // ============================================================================

  describe('error message quality', () => {
    it('should provide helpful error when searchField is missing', () => {
      // This test is expected to FAIL - current implementation may not validate
      try {
        defineTable({ text: v.string() }).searchIndex('search', {} as any)
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).message).toMatch(/searchField|required|missing/i)
      }
    })

    it('should provide helpful error for non-existent field', () => {
      // This test is expected to FAIL
      try {
        defineTable({ text: v.string() }).searchIndex('search', {
          searchField: 'nonExistent',
        })
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).message).toMatch(/nonExistent|not.*found|not.*defined/i)
      }
    })

    it('should provide helpful error for wrong field type', () => {
      // This test is expected to FAIL
      try {
        defineTable({ count: v.number() }).searchIndex('search', {
          searchField: 'count',
        })
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).message).toMatch(/string|type|count/i)
      }
    })
  })
})
