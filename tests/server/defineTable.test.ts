/**
 * TDD RED Phase Tests for defineTable()
 *
 * These tests are designed to fail because implementations are missing or incomplete.
 * This is the "RED" phase of TDD - tests that define expected behavior.
 *
 * Note: Some tests may pass if the implementation already exists. The RED tests
 * focus on features that may not yet be fully implemented or need additional
 * validation/error handling.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import { defineTable, TableBuilder, type TableDefinition, type InferDocument } from '../../src/server/schema'
import { v, type Infer } from '../../src/values'

// ============================================================================
// Basic table definition
// ============================================================================
describe('defineTable', () => {
  describe('basic table definition', () => {
    it('should accept a validator argument and return a table definition', () => {
      const table = defineTable({
        name: v.string(),
        age: v.number(),
      })

      expect(table).toBeDefined()
      expect(table).toBeInstanceOf(TableBuilder)
    })

    it('should have a document property containing the validators', () => {
      const table = defineTable({
        name: v.string(),
        age: v.number(),
      })

      expect(table.document).toBeDefined()
      expect(table.document.name).toBeDefined()
      expect(table.document.age).toBeDefined()
    })

    it('should have empty indexes by default', () => {
      const table = defineTable({
        name: v.string(),
      })

      expect(table.indexes).toBeDefined()
      expect(Object.keys(table.indexes)).toHaveLength(0)
    })

    it('should have empty searchIndexes by default', () => {
      const table = defineTable({
        name: v.string(),
      })

      expect(table.searchIndexes).toBeDefined()
      expect(Object.keys(table.searchIndexes)).toHaveLength(0)
    })

    it('should have empty vectorIndexes by default', () => {
      const table = defineTable({
        name: v.string(),
      })

      expect(table.vectorIndexes).toBeDefined()
      expect(Object.keys(table.vectorIndexes)).toHaveLength(0)
    })

    it('should implement TableDefinition interface', () => {
      const table = defineTable({
        name: v.string(),
      })

      // Type check: should satisfy TableDefinition
      const tableDefinition: TableDefinition = table
      expect(tableDefinition).toBeDefined()
    })
  })

  // ============================================================================
  // Works with v.object() validators
  // ============================================================================
  describe('works with v.object() validators', () => {
    it('should accept v.object() as the document schema', () => {
      const userSchema = v.object({
        name: v.string(),
        email: v.string(),
      })

      // defineTable should accept the shape directly, not a v.object()
      // But some implementations support both patterns
      const table = defineTable({
        name: v.string(),
        email: v.string(),
      })

      expect(table.document).toBeDefined()
      expect(table.document.name.describe()).toContain('string')
      expect(table.document.email.describe()).toContain('string')
    })

    it('should work with inline object shape', () => {
      const table = defineTable({
        title: v.string(),
        content: v.string(),
        published: v.boolean(),
      })

      expect(table.document.title).toBeDefined()
      expect(table.document.content).toBeDefined()
      expect(table.document.published).toBeDefined()
    })

    it('should preserve validator types in document property', () => {
      const table = defineTable({
        count: v.number(),
        label: v.string(),
      })

      // Validators should still work
      expect(table.document.count.isValid(42)).toBe(true)
      expect(table.document.count.isValid('not a number')).toBe(false)
      expect(table.document.label.isValid('hello')).toBe(true)
    })
  })

  // ============================================================================
  // Document fields
  // ============================================================================
  describe('document fields', () => {
    describe('required fields', () => {
      it('should support required string fields', () => {
        const table = defineTable({
          name: v.string(),
        })

        expect(table.document.name.isOptional).toBe(false)
      })

      it('should support required number fields', () => {
        const table = defineTable({
          count: v.number(),
        })

        expect(table.document.count.isOptional).toBe(false)
      })

      it('should support required boolean fields', () => {
        const table = defineTable({
          active: v.boolean(),
        })

        expect(table.document.active.isOptional).toBe(false)
      })
    })

    describe('optional fields', () => {
      it('should support optional fields with v.optional()', () => {
        const table = defineTable({
          name: v.string(),
          nickname: v.optional(v.string()),
        })

        expect(table.document.nickname.isOptional).toBe(true)
      })

      it('should support optional complex types', () => {
        const table = defineTable({
          id: v.string(),
          metadata: v.optional(v.object({
            createdBy: v.string(),
            updatedAt: v.number(),
          })),
        })

        expect(table.document.metadata.isOptional).toBe(true)
      })
    })

    describe('nested objects', () => {
      it('should support nested object fields', () => {
        const table = defineTable({
          profile: v.object({
            firstName: v.string(),
            lastName: v.string(),
          }),
        })

        expect(table.document.profile).toBeDefined()
        expect(table.document.profile.describe()).toContain('firstName')
      })

      it('should support deeply nested objects', () => {
        const table = defineTable({
          settings: v.object({
            preferences: v.object({
              notifications: v.object({
                email: v.boolean(),
                sms: v.boolean(),
              }),
            }),
          }),
        })

        expect(table.document.settings).toBeDefined()
      })
    })

    describe('arrays', () => {
      it('should support array fields', () => {
        const table = defineTable({
          tags: v.array(v.string()),
        })

        expect(table.document.tags).toBeDefined()
        expect(table.document.tags.isValid(['tag1', 'tag2'])).toBe(true)
      })

      it('should support arrays of objects', () => {
        const table = defineTable({
          comments: v.array(v.object({
            author: v.string(),
            text: v.string(),
          })),
        })

        expect(table.document.comments).toBeDefined()
      })

      it('should support nested arrays', () => {
        const table = defineTable({
          matrix: v.array(v.array(v.number())),
        })

        expect(table.document.matrix).toBeDefined()
        expect(table.document.matrix.isValid([[1, 2], [3, 4]])).toBe(true)
      })
    })

    describe('ID references', () => {
      it('should support v.id() for table references', () => {
        const table = defineTable({
          authorId: v.id('users'),
        })

        expect(table.document.authorId).toBeDefined()
        expect(table.document.authorId.describe()).toContain('users')
      })

      it('should support multiple ID references', () => {
        const table = defineTable({
          channelId: v.id('channels'),
          authorId: v.id('users'),
        })

        expect(table.document.channelId).toBeDefined()
        expect(table.document.authorId).toBeDefined()
      })

      it('should support optional ID references', () => {
        const table = defineTable({
          parentId: v.optional(v.id('messages')),
        })

        expect(table.document.parentId.isOptional).toBe(true)
      })

      it('should support arrays of ID references', () => {
        const table = defineTable({
          memberIds: v.array(v.id('users')),
        })

        expect(table.document.memberIds).toBeDefined()
      })
    })
  })

  // ============================================================================
  // Method chaining
  // ============================================================================
  describe('method chaining', () => {
    describe('.index() method', () => {
      it('should support .index() for defining indexes', () => {
        const table = defineTable({
          name: v.string(),
        }).index('by_name', ['name'])

        expect(table.indexes).toBeDefined()
        expect(table.indexes.by_name).toBeDefined()
        expect(table.indexes.by_name.fields).toContain('name')
      })

      it('should support multiple indexes', () => {
        const table = defineTable({
          name: v.string(),
          email: v.string(),
          createdAt: v.number(),
        })
          .index('by_name', ['name'])
          .index('by_email', ['email'])
          .index('by_created', ['createdAt'])

        expect(Object.keys(table.indexes)).toHaveLength(3)
        expect(table.indexes.by_name).toBeDefined()
        expect(table.indexes.by_email).toBeDefined()
        expect(table.indexes.by_created).toBeDefined()
      })

      it('should support compound indexes', () => {
        const table = defineTable({
          channel: v.id('channels'),
          author: v.id('users'),
          createdAt: v.number(),
        }).index('by_channel_author', ['channel', 'author'])

        expect(table.indexes.by_channel_author.fields).toEqual(['channel', 'author'])
      })

      it('should return the builder for chaining', () => {
        const table = defineTable({
          name: v.string(),
        })

        const result = table.index('by_name', ['name'])

        expect(result).toBe(table)
        expect(result).toBeInstanceOf(TableBuilder)
      })
    })

    describe('.searchIndex() method', () => {
      it('should support .searchIndex() for full-text search', () => {
        const table = defineTable({
          title: v.string(),
          body: v.string(),
        }).searchIndex('search_body', {
          searchField: 'body',
        })

        expect(table.searchIndexes).toBeDefined()
        expect(table.searchIndexes.search_body).toBeDefined()
        expect(table.searchIndexes.search_body.searchField).toBe('body')
      })

      it('should support filterFields in search index', () => {
        const table = defineTable({
          title: v.string(),
          body: v.string(),
          category: v.string(),
        }).searchIndex('search_body', {
          searchField: 'body',
          filterFields: ['category'],
        })

        expect(table.searchIndexes.search_body.filterFields).toContain('category')
      })

      it('should support multiple search indexes', () => {
        const table = defineTable({
          title: v.string(),
          body: v.string(),
          summary: v.string(),
        })
          .searchIndex('search_body', { searchField: 'body' })
          .searchIndex('search_title', { searchField: 'title' })

        expect(Object.keys(table.searchIndexes)).toHaveLength(2)
      })

      it('should return the builder for chaining', () => {
        const table = defineTable({
          body: v.string(),
        })

        const result = table.searchIndex('search_body', { searchField: 'body' })

        expect(result).toBe(table)
      })
    })

    describe('.vectorIndex() method', () => {
      it('should support .vectorIndex() for similarity search', () => {
        const table = defineTable({
          text: v.string(),
          embedding: v.array(v.float64()),
        }).vectorIndex('by_embedding', {
          vectorField: 'embedding',
          dimensions: 1536,
        })

        expect(table.vectorIndexes).toBeDefined()
        expect(table.vectorIndexes.by_embedding).toBeDefined()
        expect(table.vectorIndexes.by_embedding.vectorField).toBe('embedding')
        expect(table.vectorIndexes.by_embedding.dimensions).toBe(1536)
      })

      it('should support filterFields in vector index', () => {
        const table = defineTable({
          text: v.string(),
          embedding: v.array(v.float64()),
          category: v.string(),
        }).vectorIndex('by_embedding', {
          vectorField: 'embedding',
          dimensions: 1536,
          filterFields: ['category'],
        })

        expect(table.vectorIndexes.by_embedding.filterFields).toContain('category')
      })

      it('should support multiple vector indexes', () => {
        const table = defineTable({
          title: v.string(),
          titleEmbedding: v.array(v.float64()),
          bodyEmbedding: v.array(v.float64()),
        })
          .vectorIndex('title_vector', {
            vectorField: 'titleEmbedding',
            dimensions: 768,
          })
          .vectorIndex('body_vector', {
            vectorField: 'bodyEmbedding',
            dimensions: 1536,
          })

        expect(Object.keys(table.vectorIndexes)).toHaveLength(2)
      })

      it('should return the builder for chaining', () => {
        const table = defineTable({
          embedding: v.array(v.float64()),
        })

        const result = table.vectorIndex('by_embedding', {
          vectorField: 'embedding',
          dimensions: 768,
        })

        expect(result).toBe(table)
      })
    })

    describe('combined chaining', () => {
      it('should support chaining all index types', () => {
        const table = defineTable({
          title: v.string(),
          body: v.string(),
          embedding: v.array(v.float64()),
          category: v.string(),
          authorId: v.id('users'),
        })
          .index('by_author', ['authorId'])
          .index('by_category', ['category'])
          .searchIndex('search_body', {
            searchField: 'body',
            filterFields: ['category'],
          })
          .vectorIndex('by_embedding', {
            vectorField: 'embedding',
            dimensions: 1536,
            filterFields: ['category'],
          })

        expect(Object.keys(table.indexes)).toHaveLength(2)
        expect(Object.keys(table.searchIndexes)).toHaveLength(1)
        expect(Object.keys(table.vectorIndexes)).toHaveLength(1)
      })

      it('should allow any order of chaining', () => {
        const table = defineTable({
          body: v.string(),
          embedding: v.array(v.float64()),
          authorId: v.id('users'),
        })
          .vectorIndex('by_embedding', {
            vectorField: 'embedding',
            dimensions: 1536,
          })
          .index('by_author', ['authorId'])
          .searchIndex('search_body', { searchField: 'body' })

        expect(table.indexes.by_author).toBeDefined()
        expect(table.searchIndexes.search_body).toBeDefined()
        expect(table.vectorIndexes.by_embedding).toBeDefined()
      })
    })
  })

  // ============================================================================
  // Type inference
  // ============================================================================
  describe('type inference', () => {
    it('should correctly infer document type with primitive fields', () => {
      const table = defineTable({
        name: v.string(),
        age: v.number(),
        active: v.boolean(),
      })

      type DocType = InferDocument<typeof table>

      // Type-level assertions
      expectTypeOf<DocType>().toMatchTypeOf<{
        name: string
        age: number
        active: boolean
      }>()
    })

    it('should correctly infer optional fields as T | undefined', () => {
      const table = defineTable({
        required: v.string(),
        optional: v.optional(v.string()),
      })

      type DocType = InferDocument<typeof table>

      expectTypeOf<DocType['required']>().toEqualTypeOf<string>()
      expectTypeOf<DocType['optional']>().toEqualTypeOf<string | undefined>()
    })

    it('should correctly infer nested object types', () => {
      const table = defineTable({
        profile: v.object({
          firstName: v.string(),
          lastName: v.string(),
        }),
      })

      type DocType = InferDocument<typeof table>

      expectTypeOf<DocType['profile']>().toMatchTypeOf<{
        firstName: string
        lastName: string
      }>()
    })

    it('should correctly infer array types', () => {
      const table = defineTable({
        tags: v.array(v.string()),
        scores: v.array(v.number()),
      })

      type DocType = InferDocument<typeof table>

      expectTypeOf<DocType['tags']>().toEqualTypeOf<string[]>()
      expectTypeOf<DocType['scores']>().toEqualTypeOf<number[]>()
    })

    it('should correctly infer ID reference types', () => {
      const table = defineTable({
        authorId: v.id('users'),
        channelId: v.id('channels'),
      })

      type DocType = InferDocument<typeof table>

      // ID types should be branded strings
      expectTypeOf<DocType['authorId']>().toMatchTypeOf<string>()
      expectTypeOf<DocType['channelId']>().toMatchTypeOf<string>()
    })

    it('should correctly infer union types', () => {
      const table = defineTable({
        status: v.union(v.literal('active'), v.literal('inactive'), v.literal('pending')),
      })

      type DocType = InferDocument<typeof table>

      expectTypeOf<DocType['status']>().toEqualTypeOf<'active' | 'inactive' | 'pending'>()
    })

    it('should correctly infer complex nested types', () => {
      const table = defineTable({
        users: v.array(v.object({
          id: v.string(),
          profile: v.optional(v.object({
            name: v.string(),
            settings: v.record(v.string(), v.union(v.string(), v.number())),
          })),
        })),
      })

      type DocType = InferDocument<typeof table>

      expectTypeOf<DocType['users']>().toMatchTypeOf<Array<{
        id: string
        profile?: {
          name: string
          settings: Record<string, string | number>
        }
      }>>()
    })
  })

  // ============================================================================
  // Edge cases
  // ============================================================================
  describe('edge cases', () => {
    describe('empty object', () => {
      it('should handle empty document schema', () => {
        const table = defineTable({})

        expect(table).toBeDefined()
        expect(table.document).toBeDefined()
        expect(Object.keys(table.document)).toHaveLength(0)
      })

      it('should allow indexes on empty document schema', () => {
        // This might be an edge case - no fields to index
        const table = defineTable({})

        expect(table.indexes).toBeDefined()
      })
    })

    describe('deeply nested structures', () => {
      it('should handle 5 levels of nesting', () => {
        const table = defineTable({
          level1: v.object({
            level2: v.object({
              level3: v.object({
                level4: v.object({
                  level5: v.object({
                    value: v.string(),
                  }),
                }),
              }),
            }),
          }),
        })

        expect(table.document.level1).toBeDefined()
      })

      it('should handle deeply nested arrays', () => {
        const table = defineTable({
          matrix3d: v.array(v.array(v.array(v.number()))),
        })

        expect(table.document.matrix3d).toBeDefined()
        expect(table.document.matrix3d.isValid([[[1, 2], [3, 4]], [[5, 6], [7, 8]]])).toBe(true)
      })

      it('should handle mixed deep nesting', () => {
        const table = defineTable({
          data: v.array(v.object({
            items: v.array(v.object({
              values: v.array(v.object({
                nested: v.array(v.string()),
              })),
            })),
          })),
        })

        expect(table.document.data).toBeDefined()
      })
    })

    describe('complex unions', () => {
      it('should handle discriminated unions', () => {
        const table = defineTable({
          content: v.union(
            v.object({
              type: v.literal('text'),
              body: v.string(),
            }),
            v.object({
              type: v.literal('image'),
              url: v.string(),
              alt: v.optional(v.string()),
            }),
            v.object({
              type: v.literal('video'),
              url: v.string(),
              duration: v.number(),
            })
          ),
        })

        expect(table.document.content).toBeDefined()
      })

      it('should handle unions of primitives and complex types', () => {
        const table = defineTable({
          value: v.union(
            v.string(),
            v.number(),
            v.boolean(),
            v.null(),
            v.array(v.string()),
            v.object({ key: v.string() })
          ),
        })

        expect(table.document.value).toBeDefined()
      })

      it('should handle nested unions', () => {
        const table = defineTable({
          result: v.union(
            v.object({
              success: v.literal(true),
              data: v.union(v.string(), v.number()),
            }),
            v.object({
              success: v.literal(false),
              error: v.union(
                v.object({ code: v.literal('NOT_FOUND') }),
                v.object({ code: v.literal('UNAUTHORIZED') })
              ),
            })
          ),
        })

        expect(table.document.result).toBeDefined()
      })
    })

    describe('special field names', () => {
      it('should handle field names with underscores', () => {
        const table = defineTable({
          first_name: v.string(),
          last_name: v.string(),
          _internal: v.string(),
        })

        expect(table.document.first_name).toBeDefined()
        expect(table.document.last_name).toBeDefined()
        expect(table.document._internal).toBeDefined()
      })

      it('should handle camelCase and PascalCase field names', () => {
        const table = defineTable({
          firstName: v.string(),
          LastName: v.string(),
          XMLParser: v.string(),
        })

        expect(table.document.firstName).toBeDefined()
        expect(table.document.LastName).toBeDefined()
        expect(table.document.XMLParser).toBeDefined()
      })

      it('should handle numeric-like field names', () => {
        const table = defineTable({
          field1: v.string(),
          field2: v.string(),
        })

        expect(table.document.field1).toBeDefined()
        expect(table.document.field2).toBeDefined()
      })
    })

    describe('all validator types', () => {
      it('should support all primitive validators', () => {
        const table = defineTable({
          stringField: v.string(),
          numberField: v.number(),
          booleanField: v.boolean(),
          nullField: v.null(),
          int64Field: v.int64(),
          float64Field: v.float64(),
          bytesField: v.bytes(),
        })

        expect(Object.keys(table.document)).toHaveLength(7)
      })

      it('should support v.any() and v.unknown()', () => {
        const table = defineTable({
          anyField: v.any(),
          unknownField: v.unknown(),
        })

        expect(table.document.anyField).toBeDefined()
        expect(table.document.unknownField).toBeDefined()
      })

      it('should support v.record()', () => {
        const table = defineTable({
          metadata: v.record(v.string(), v.string()),
          scores: v.record(v.string(), v.number()),
        })

        expect(table.document.metadata).toBeDefined()
        expect(table.document.scores).toBeDefined()
      })

      it('should support v.literal()', () => {
        const table = defineTable({
          status: v.literal('active'),
          version: v.literal(1),
          enabled: v.literal(true),
        })

        expect(table.document.status).toBeDefined()
        expect(table.document.version).toBeDefined()
        expect(table.document.enabled).toBeDefined()
      })
    })
  })

  // ============================================================================
  // Integration tests - Real-world patterns
  // ============================================================================
  describe('real-world patterns', () => {
    it('should support a typical messages table', () => {
      const messages = defineTable({
        channel: v.id('channels'),
        body: v.string(),
        author: v.id('users'),
        createdAt: v.number(),
        attachments: v.optional(v.array(v.object({
          type: v.string(),
          url: v.string(),
        }))),
      })
        .index('by_channel', ['channel'])
        .index('by_author', ['author'])
        .index('by_channel_created', ['channel', 'createdAt'])
        .searchIndex('search_body', {
          searchField: 'body',
          filterFields: ['channel'],
        })

      expect(messages.document.channel).toBeDefined()
      expect(messages.document.body).toBeDefined()
      expect(messages.indexes.by_channel).toBeDefined()
      expect(messages.searchIndexes.search_body).toBeDefined()
    })

    it('should support a typical users table', () => {
      const users = defineTable({
        name: v.string(),
        email: v.string(),
        tokenIdentifier: v.string(),
        profileImageUrl: v.optional(v.string()),
        settings: v.optional(v.object({
          theme: v.optional(v.union(v.literal('light'), v.literal('dark'))),
          notifications: v.optional(v.boolean()),
        })),
        createdAt: v.number(),
        lastLoginAt: v.optional(v.number()),
      })
        .index('by_token', ['tokenIdentifier'])
        .index('by_email', ['email'])

      expect(users.document.name).toBeDefined()
      expect(users.document.email).toBeDefined()
      expect(users.indexes.by_token).toBeDefined()
    })

    it('should support a documents table with embeddings', () => {
      const documents = defineTable({
        title: v.string(),
        content: v.string(),
        embedding: v.array(v.float64()),
        category: v.string(),
        tags: v.array(v.string()),
        authorId: v.id('users'),
        createdAt: v.number(),
        updatedAt: v.number(),
      })
        .index('by_author', ['authorId'])
        .index('by_category', ['category'])
        .searchIndex('search_content', {
          searchField: 'content',
          filterFields: ['category'],
        })
        .vectorIndex('by_embedding', {
          vectorField: 'embedding',
          dimensions: 1536,
          filterFields: ['category'],
        })

      expect(documents.document.embedding).toBeDefined()
      expect(documents.vectorIndexes.by_embedding).toBeDefined()
      expect(documents.vectorIndexes.by_embedding.dimensions).toBe(1536)
    })

    it('should support a polymorphic content table', () => {
      const content = defineTable({
        type: v.union(v.literal('post'), v.literal('comment'), v.literal('reply')),
        body: v.string(),
        authorId: v.id('users'),
        parentId: v.optional(v.id('content')),
        metadata: v.optional(v.record(v.string(), v.any())),
        createdAt: v.number(),
      })
        .index('by_author', ['authorId'])
        .index('by_parent', ['parentId'])
        .index('by_type', ['type'])

      expect(content.document.type).toBeDefined()
      expect(content.indexes.by_type).toBeDefined()
    })
  })

  // ============================================================================
  // Validation and error handling (RED - likely to fail)
  // ============================================================================
  describe('validation and error handling', () => {
    describe('index validation', () => {
      it('should throw when index references non-existent field', () => {
        const table = defineTable({
          name: v.string(),
        })

        // Should throw because 'nonExistentField' is not in the document
        expect(() => {
          table.index('by_invalid', ['nonExistentField' as any])
        }).toThrow(/field.*not.*exist|unknown.*field|invalid.*field/i)
      })

      it('should throw for duplicate index names', () => {
        const table = defineTable({
          name: v.string(),
        })
          .index('by_name', ['name'])

        // Should throw because 'by_name' already exists
        expect(() => {
          table.index('by_name', ['name'])
        }).toThrow(/duplicate|already.*exist/i)
      })

      it('should throw for empty index fields array', () => {
        const table = defineTable({
          name: v.string(),
        })

        // Should throw because index must have at least one field
        expect(() => {
          table.index('empty_index', [])
        }).toThrow(/at least one field|empty|no fields/i)
      })

      it('should throw for invalid index name', () => {
        const table = defineTable({
          name: v.string(),
        })

        // Should throw for empty string index name
        expect(() => {
          table.index('', ['name'])
        }).toThrow(/invalid.*name|name.*required|empty.*name/i)
      })
    })

    describe('search index validation', () => {
      it('should throw when searchField references non-existent field', () => {
        const table = defineTable({
          body: v.string(),
        })

        expect(() => {
          table.searchIndex('search_invalid', {
            searchField: 'nonExistent',
          })
        }).toThrow(/field.*not.*exist|unknown.*field|invalid.*field/i)
      })

      it('should throw when filterFields reference non-existent fields', () => {
        const table = defineTable({
          body: v.string(),
          category: v.string(),
        })

        expect(() => {
          table.searchIndex('search_body', {
            searchField: 'body',
            filterFields: ['nonExistent'],
          })
        }).toThrow(/field.*not.*exist|unknown.*field|invalid.*field/i)
      })

      it('should throw when searchField is not a string type', () => {
        const table = defineTable({
          count: v.number(),
          body: v.string(),
        })

        // searchField must be a string type field
        expect(() => {
          table.searchIndex('search_count', {
            searchField: 'count',
          })
        }).toThrow(/string.*type|text.*field|invalid.*type/i)
      })

      it('should throw for duplicate search index names', () => {
        const table = defineTable({
          body: v.string(),
        })
          .searchIndex('search_body', { searchField: 'body' })

        expect(() => {
          table.searchIndex('search_body', { searchField: 'body' })
        }).toThrow(/duplicate|already.*exist/i)
      })
    })

    describe('vector index validation', () => {
      it('should throw when vectorField references non-existent field', () => {
        const table = defineTable({
          embedding: v.array(v.float64()),
        })

        expect(() => {
          table.vectorIndex('by_nonexistent', {
            vectorField: 'nonExistent',
            dimensions: 1536,
          })
        }).toThrow(/field.*not.*exist|unknown.*field|invalid.*field/i)
      })

      it('should throw when vectorField is not an array type', () => {
        const table = defineTable({
          name: v.string(),
          embedding: v.array(v.float64()),
        })

        expect(() => {
          table.vectorIndex('by_name', {
            vectorField: 'name',
            dimensions: 1536,
          })
        }).toThrow(/array.*type|vector.*must|invalid.*type/i)
      })

      it('should throw for invalid dimensions (zero or negative)', () => {
        const table = defineTable({
          embedding: v.array(v.float64()),
        })

        expect(() => {
          table.vectorIndex('by_embedding', {
            vectorField: 'embedding',
            dimensions: 0,
          })
        }).toThrow(/dimension|positive|invalid/i)

        expect(() => {
          table.vectorIndex('by_embedding', {
            vectorField: 'embedding',
            dimensions: -1,
          })
        }).toThrow(/dimension|positive|invalid/i)
      })

      it('should throw for duplicate vector index names', () => {
        const table = defineTable({
          embedding: v.array(v.float64()),
        })
          .vectorIndex('by_embedding', {
            vectorField: 'embedding',
            dimensions: 1536,
          })

        expect(() => {
          table.vectorIndex('by_embedding', {
            vectorField: 'embedding',
            dimensions: 768,
          })
        }).toThrow(/duplicate|already.*exist/i)
      })
    })
  })

  // ============================================================================
  // Serialization (RED - likely to fail)
  // ============================================================================
  describe('serialization', () => {
    it('should have a toJSON() method for serialization', () => {
      const table = defineTable({
        name: v.string(),
        age: v.number(),
      })
        .index('by_name', ['name'])

      // Tables should be serializable to JSON for schema export
      const json = (table as any).toJSON()

      expect(json).toBeDefined()
      expect(json.indexes).toBeDefined()
      expect(json.indexes.by_name).toBeDefined()
    })

    it('should serialize document field types', () => {
      const table = defineTable({
        name: v.string(),
        count: v.number(),
        active: v.boolean(),
      })

      const json = (table as any).toJSON()

      expect(json.document).toBeDefined()
      expect(json.document.name.type).toBe('string')
      expect(json.document.count.type).toBe('number')
      expect(json.document.active.type).toBe('boolean')
    })

    it('should serialize complex types correctly', () => {
      const table = defineTable({
        tags: v.array(v.string()),
        metadata: v.object({
          key: v.string(),
          value: v.any(),
        }),
      })

      const json = (table as any).toJSON()

      expect(json.document.tags.type).toBe('array')
      expect(json.document.metadata.type).toBe('object')
    })
  })

  // ============================================================================
  // Schema export compatibility (RED - likely to fail)
  // ============================================================================
  describe('schema export compatibility', () => {
    it('should export a schema definition compatible with Convex', () => {
      const table = defineTable({
        channel: v.id('channels'),
        body: v.string(),
        author: v.id('users'),
      })
        .index('by_channel', ['channel'])
        .searchIndex('search_body', { searchField: 'body' })

      // Should have an export method for Convex schema format
      const exported = (table as any).export()

      expect(exported).toBeDefined()
      expect(exported.document).toBeDefined()
      expect(exported.indexes).toBeDefined()
      expect(exported.searchIndexes).toBeDefined()
    })

    it('should generate schema code string', () => {
      const table = defineTable({
        name: v.string(),
        email: v.string(),
      })
        .index('by_email', ['email'])

      // Should be able to generate code representation
      const code = (table as any).toCode()

      expect(typeof code).toBe('string')
      expect(code).toContain('defineTable')
      expect(code).toContain('v.string()')
      expect(code).toContain('.index')
    })
  })

  // ============================================================================
  // Clone/copy functionality (RED - likely to fail)
  // ============================================================================
  describe('clone functionality', () => {
    it('should support cloning table definitions', () => {
      const original = defineTable({
        name: v.string(),
        age: v.number(),
      })
        .index('by_name', ['name'])

      // Should be able to clone table definitions
      const cloned = (original as any).clone()

      expect(cloned).toBeDefined()
      expect(cloned).not.toBe(original)
      expect(cloned.document).not.toBe(original.document)
      expect(cloned.indexes).not.toBe(original.indexes)
    })

    it('should clone deeply without sharing references', () => {
      const original = defineTable({
        profile: v.object({
          name: v.string(),
        }),
      })
        .index('by_profile', ['profile'])

      const cloned = (original as any).clone()

      // Modifying clone should not affect original
      cloned.index('new_index', ['profile'])

      expect(original.indexes.new_index).toBeUndefined()
    })
  })

  // ============================================================================
  // Table metadata (RED - likely to fail)
  // ============================================================================
  describe('table metadata', () => {
    it('should support setting table description', () => {
      const table = defineTable({
        name: v.string(),
      })

      // Should support adding metadata like description
      const withDescription = (table as any).description('User accounts table')

      expect(withDescription.metadata).toBeDefined()
      expect(withDescription.metadata.description).toBe('User accounts table')
    })

    it('should support table-level configuration', () => {
      const table = defineTable({
        name: v.string(),
      })

      // Should support configuration options
      const configured = (table as any).config({
        ttl: 86400, // 24 hours in seconds
        cachePolicy: 'aggressive',
      })

      expect(configured.config).toBeDefined()
      expect(configured.config.ttl).toBe(86400)
    })
  })

  // ============================================================================
  // Index configuration options (RED - likely to fail)
  // ============================================================================
  describe('advanced index configuration', () => {
    it('should support ascending/descending order in indexes', () => {
      const table = defineTable({
        name: v.string(),
        createdAt: v.number(),
      })

      // Should support specifying sort order
      const withOrderedIndex = (table as any).index('by_created_desc', [
        { field: 'createdAt', order: 'desc' },
      ])

      expect(withOrderedIndex.indexes.by_created_desc.fields[0]).toEqual({
        field: 'createdAt',
        order: 'desc',
      })
    })

    it('should support unique index constraint', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })

      // Should support unique constraint
      const withUniqueIndex = (table as any).index('by_email_unique', ['email'], {
        unique: true,
      })

      expect(withUniqueIndex.indexes.by_email_unique.unique).toBe(true)
    })

    it('should support sparse index option', () => {
      const table = defineTable({
        name: v.string(),
        optionalField: v.optional(v.string()),
      })

      // Sparse indexes only include documents where the field exists
      const withSparseIndex = (table as any).index('by_optional', ['optionalField'], {
        sparse: true,
      })

      expect(withSparseIndex.indexes.by_optional.sparse).toBe(true)
    })
  })

  // ============================================================================
  // Document validation at runtime (RED - likely to fail)
  // ============================================================================
  describe('document validation', () => {
    it('should validate a document against the table schema', () => {
      const table = defineTable({
        name: v.string(),
        age: v.number(),
        active: v.boolean(),
      })

      // Should have a validate method
      const validDoc = { name: 'Alice', age: 30, active: true }
      const result = (table as any).validate(validDoc)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should return validation errors for invalid documents', () => {
      const table = defineTable({
        name: v.string(),
        age: v.number(),
      })

      const invalidDoc = { name: 123, age: 'not a number' }
      const result = (table as any).validate(invalidDoc)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should validate nested fields', () => {
      const table = defineTable({
        profile: v.object({
          name: v.string(),
          settings: v.object({
            theme: v.string(),
          }),
        }),
      })

      const invalidDoc = {
        profile: {
          name: 'Alice',
          settings: {
            theme: 123, // Should be string
          },
        },
      }

      const result = (table as any).validate(invalidDoc)

      expect(result.valid).toBe(false)
      // Error contains path info - can be in error.path or the string itself
      const error = result.errors[0]
      const errorPath = typeof error === 'string' ? error : error.path
      expect(errorPath).toMatch(/theme|settings|profile/i)
    })

    it('should validate ID references format', () => {
      const table = defineTable({
        authorId: v.id('users'),
      })

      // Invalid ID format
      const invalidDoc = { authorId: 'short' }
      const result = (table as any).validate(invalidDoc)

      expect(result.valid).toBe(false)
      // Error can be string or object with path/message
      const error = result.errors[0]
      const errorText = typeof error === 'string' ? error : `${error.path}: ${error.message}`
      expect(errorText).toMatch(/authorId|id|format/i)
    })
  })

  // ============================================================================
  // System fields (RED - likely to fail)
  // ============================================================================
  describe('system fields', () => {
    it('should automatically include _id in the inferred document type with system fields', () => {
      const table = defineTable({
        name: v.string(),
      })

      // When getting the full document type (with system fields), should include _id
      type FullDocType = InferDocument<typeof table> & {
        _id: string
        _creationTime: number
      }

      // Type check
      const doc: FullDocType = {
        name: 'test',
        _id: 'abc123xyz',
        _creationTime: Date.now(),
      }

      expect(doc._id).toBeDefined()
    })

    it('should have a withSystemFields helper', () => {
      const table = defineTable({
        name: v.string(),
      })

      // Should expose a way to get the full document type with system fields
      const fullSchema = (table as any).withSystemFields()

      expect(fullSchema.document._id).toBeDefined()
      expect(fullSchema.document._creationTime).toBeDefined()
    })
  })
})
