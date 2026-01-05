/**
 * TDD RED Phase Tests for defineSchema()
 *
 * These tests define the expected behavior for the schema definition system.
 * They are designed to FAIL until the implementation is complete.
 *
 * @see convex-vg3 - defineSchema() Tests (RED)
 */

import { describe, it, expect } from 'vitest'
import { defineSchema, defineTable, type Schema, type DataModel, type Doc, type TableDefinition } from '../../src/server/schema'
import { v, type Infer } from '../../src/values'

// ============================================================================
// Basic Schema Definition Tests
// ============================================================================

describe('defineSchema', () => {
  describe('basic schema definition', () => {
    it('should accept an object of table definitions', () => {
      const schema = defineSchema({
        users: defineTable({ name: v.string() })
      })
      expect(schema).toBeDefined()
      expect(schema.tables).toBeDefined()
      expect(schema.tables.users).toBeDefined()
    })

    it('should return a schema object with tables property', () => {
      const schema = defineSchema({
        users: defineTable({ name: v.string() }),
        posts: defineTable({ title: v.string(), body: v.string() })
      })
      expect(schema.tables).toHaveProperty('users')
      expect(schema.tables).toHaveProperty('posts')
    })

    it('should preserve table definition structure', () => {
      const userTable = defineTable({ name: v.string(), email: v.string() })
      const schema = defineSchema({ users: userTable })
      expect(schema.tables.users).toBe(userTable)
    })
  })

  // ============================================================================
  // Empty Schema Tests
  // ============================================================================

  describe('empty schema', () => {
    it('should accept an empty schema', () => {
      const schema = defineSchema({})
      expect(schema).toBeDefined()
      expect(schema.tables).toBeDefined()
    })

    it('should have empty tables object for empty schema', () => {
      const schema = defineSchema({})
      expect(Object.keys(schema.tables)).toHaveLength(0)
    })

    it('should be valid to use in type contexts', () => {
      const schema = defineSchema({})
      type Model = DataModel<typeof schema>
      // Type check - should compile without table names
      const model: Model = {}
      expect(model).toEqual({})
    })
  })

  // ============================================================================
  // Single and Multiple Tables
  // ============================================================================

  describe('single table', () => {
    it('should work with a single table', () => {
      const schema = defineSchema({
        users: defineTable({
          name: v.string(),
          email: v.string(),
          age: v.number()
        })
      })
      expect(schema.tables.users).toBeDefined()
      expect(schema.tables.users.document).toBeDefined()
    })

    it('should preserve field validators in single table', () => {
      const schema = defineSchema({
        users: defineTable({
          name: v.string(),
          age: v.number()
        })
      })
      expect(schema.tables.users.document.name).toBeDefined()
      expect(schema.tables.users.document.age).toBeDefined()
    })
  })

  describe('multiple tables', () => {
    it('should work with multiple tables', () => {
      const schema = defineSchema({
        users: defineTable({ name: v.string() }),
        posts: defineTable({ title: v.string(), body: v.string() }),
        comments: defineTable({ content: v.string(), authorId: v.string() })
      })
      expect(Object.keys(schema.tables)).toHaveLength(3)
      expect(schema.tables.users).toBeDefined()
      expect(schema.tables.posts).toBeDefined()
      expect(schema.tables.comments).toBeDefined()
    })

    it('should allow tables with different field structures', () => {
      const schema = defineSchema({
        simpleTable: defineTable({ name: v.string() }),
        complexTable: defineTable({
          field1: v.string(),
          field2: v.number(),
          field3: v.boolean(),
          field4: v.optional(v.string()),
          nested: v.object({ inner: v.string() })
        })
      })
      expect(schema.tables.simpleTable.document.name).toBeDefined()
      expect(schema.tables.complexTable.document.field1).toBeDefined()
      expect(schema.tables.complexTable.document.nested).toBeDefined()
    })

    it('should support tables with cross-references via v.id()', () => {
      const schema = defineSchema({
        users: defineTable({ name: v.string() }),
        posts: defineTable({
          title: v.string(),
          authorId: v.id('users')
        }),
        comments: defineTable({
          body: v.string(),
          postId: v.id('posts'),
          authorId: v.id('users')
        })
      })
      expect(schema.tables.posts.document.authorId).toBeDefined()
      expect(schema.tables.comments.document.postId).toBeDefined()
      expect(schema.tables.comments.document.authorId).toBeDefined()
    })
  })

  // ============================================================================
  // Schema Options Tests
  // ============================================================================

  describe('schema options', () => {
    describe('schemaValidation option', () => {
      it('should accept schemaValidation: true', () => {
        const schema = defineSchema(
          { users: defineTable({ name: v.string() }) },
          { schemaValidation: true }
        )
        expect(schema).toBeDefined()
        // Schema should have a property indicating validation is enabled
        expect(schema.schemaValidation).toBe(true)
      })

      it('should accept schemaValidation: false', () => {
        const schema = defineSchema(
          { users: defineTable({ name: v.string() }) },
          { schemaValidation: false }
        )
        expect(schema).toBeDefined()
        expect(schema.schemaValidation).toBe(false)
      })

      it('should default schemaValidation to true when not specified', () => {
        const schema = defineSchema({
          users: defineTable({ name: v.string() })
        })
        expect(schema.schemaValidation).toBe(true)
      })
    })

    describe('strictTableNameTypes option', () => {
      it('should accept strictTableNameTypes: true', () => {
        const schema = defineSchema(
          { users: defineTable({ name: v.string() }) },
          { strictTableNameTypes: true }
        )
        expect(schema).toBeDefined()
        expect(schema.strictTableNameTypes).toBe(true)
      })

      it('should accept strictTableNameTypes: false', () => {
        const schema = defineSchema(
          { users: defineTable({ name: v.string() }) },
          { strictTableNameTypes: false }
        )
        expect(schema).toBeDefined()
        expect(schema.strictTableNameTypes).toBe(false)
      })

      it('should default strictTableNameTypes to true when not specified', () => {
        const schema = defineSchema({
          users: defineTable({ name: v.string() })
        })
        expect(schema.strictTableNameTypes).toBe(true)
      })
    })

    describe('combined options', () => {
      it('should accept both options together', () => {
        const schema = defineSchema(
          { users: defineTable({ name: v.string() }) },
          { schemaValidation: false, strictTableNameTypes: false }
        )
        expect(schema.schemaValidation).toBe(false)
        expect(schema.strictTableNameTypes).toBe(false)
      })

      it('should allow partial options', () => {
        const schema1 = defineSchema(
          { users: defineTable({ name: v.string() }) },
          { schemaValidation: false }
        )
        expect(schema1.schemaValidation).toBe(false)
        expect(schema1.strictTableNameTypes).toBe(true) // default

        const schema2 = defineSchema(
          { users: defineTable({ name: v.string() }) },
          { strictTableNameTypes: false }
        )
        expect(schema2.schemaValidation).toBe(true) // default
        expect(schema2.strictTableNameTypes).toBe(false)
      })
    })

    describe('strict mode (legacy option)', () => {
      it('should support strict option for backward compatibility', () => {
        const schema = defineSchema(
          { users: defineTable({ name: v.string() }) },
          { strict: false }
        )
        expect(schema.strictMode).toBe(false)
      })
    })
  })

  // ============================================================================
  // Type Safety Tests
  // ============================================================================

  describe('type safety', () => {
    describe('schema type inference', () => {
      it('should infer correct table types', () => {
        const schema = defineSchema({
          users: defineTable({
            name: v.string(),
            age: v.number(),
            active: v.boolean()
          })
        })

        type UserDoc = DataModel<typeof schema>['users']
        // Type assertions - these should compile without errors
        const user: UserDoc = {
          name: 'John',
          age: 30,
          active: true
        }
        expect(user.name).toBe('John')
        expect(user.age).toBe(30)
        expect(user.active).toBe(true)
      })

      it('should infer optional fields correctly', () => {
        const schema = defineSchema({
          users: defineTable({
            name: v.string(),
            nickname: v.optional(v.string())
          })
        })

        type UserDoc = DataModel<typeof schema>['users']
        // Should allow optional field to be undefined
        const user1: UserDoc = { name: 'John' }
        const user2: UserDoc = { name: 'John', nickname: 'Johnny' }
        expect(user1.name).toBe('John')
        expect(user2.nickname).toBe('Johnny')
      })

      it('should infer nested object types', () => {
        const schema = defineSchema({
          profiles: defineTable({
            user: v.object({
              name: v.string(),
              settings: v.object({
                theme: v.string(),
                notifications: v.boolean()
              })
            })
          })
        })

        type ProfileDoc = DataModel<typeof schema>['profiles']
        const profile: ProfileDoc = {
          user: {
            name: 'John',
            settings: {
              theme: 'dark',
              notifications: true
            }
          }
        }
        expect(profile.user.name).toBe('John')
        expect(profile.user.settings.theme).toBe('dark')
      })

      it('should infer array types correctly', () => {
        const schema = defineSchema({
          articles: defineTable({
            tags: v.array(v.string()),
            comments: v.array(v.object({
              author: v.string(),
              content: v.string()
            }))
          })
        })

        type ArticleDoc = DataModel<typeof schema>['articles']
        const article: ArticleDoc = {
          tags: ['tech', 'news'],
          comments: [
            { author: 'John', content: 'Great article!' }
          ]
        }
        expect(article.tags).toHaveLength(2)
        expect(article.comments[0].author).toBe('John')
      })

      it('should infer union types correctly', () => {
        const schema = defineSchema({
          items: defineTable({
            status: v.union(
              v.literal('pending'),
              v.literal('approved'),
              v.literal('rejected')
            )
          })
        })

        type ItemDoc = DataModel<typeof schema>['items']
        const item: ItemDoc = { status: 'pending' }
        expect(item.status).toBe('pending')
      })
    })

    describe('table name types', () => {
      it('should infer table name union type', () => {
        const schema = defineSchema({
          users: defineTable({ name: v.string() }),
          posts: defineTable({ title: v.string() }),
          comments: defineTable({ body: v.string() })
        })

        // Table names should be a union type
        type TableNames = keyof typeof schema.tables
        const validTableName: TableNames = 'users'
        expect(['users', 'posts', 'comments']).toContain(validTableName)
      })

      it('should provide type-safe table access', () => {
        const schema = defineSchema({
          users: defineTable({ name: v.string() }),
          posts: defineTable({ title: v.string() })
        })

        // This should be type-safe
        const usersTable = schema.tables.users
        const postsTable = schema.tables.posts
        expect(usersTable).toBeDefined()
        expect(postsTable).toBeDefined()
      })
    })

    describe('Doc type helper', () => {
      it('should provide correct document type with system fields', () => {
        const schema = defineSchema({
          users: defineTable({
            name: v.string(),
            email: v.string()
          })
        })

        type UserDoc = Doc<typeof schema, 'users'>
        // Doc type should include _id and _creationTime
        const user: UserDoc = {
          _id: 'user_id_123' as any,
          _creationTime: Date.now(),
          name: 'John',
          email: 'john@example.com'
        }
        expect(user._id).toBeDefined()
        expect(user._creationTime).toBeDefined()
        expect(user.name).toBe('John')
      })
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    describe('invalid definitions', () => {
      it('should reject non-object table definitions', () => {
        // This should throw or be a type error
        expect(() => {
          defineSchema({
            users: 'not a table definition' as any
          })
        }).toThrow()
      })

      it('should reject null table definitions', () => {
        expect(() => {
          defineSchema({
            users: null as any
          })
        }).toThrow()
      })

      it('should reject undefined table definitions', () => {
        expect(() => {
          defineSchema({
            users: undefined as any
          })
        }).toThrow()
      })

      it('should reject primitive values as table definitions', () => {
        expect(() => {
          defineSchema({
            users: 42 as any
          })
        }).toThrow()
      })

      it('should reject arrays as table definitions', () => {
        expect(() => {
          defineSchema({
            users: [] as any
          })
        }).toThrow()
      })
    })

    describe('invalid table names', () => {
      it('should reject empty string table names', () => {
        // Empty table name should be invalid
        expect(() => {
          defineSchema({
            '': defineTable({ name: v.string() })
          })
        }).toThrow()
      })

      it('should reject table names starting with underscore', () => {
        // System table prefix - should be reserved
        expect(() => {
          defineSchema({
            _system: defineTable({ name: v.string() })
          })
        }).toThrow()
      })

      it('should reject table names with invalid characters', () => {
        expect(() => {
          defineSchema({
            'user-table': defineTable({ name: v.string() })
          })
        }).toThrow()
      })

      it('should reject table names starting with numbers', () => {
        expect(() => {
          defineSchema({
            '123users': defineTable({ name: v.string() })
          })
        }).toThrow()
      })
    })

    describe('invalid options', () => {
      it('should reject invalid schemaValidation value', () => {
        expect(() => {
          defineSchema(
            { users: defineTable({ name: v.string() }) },
            { schemaValidation: 'true' as any }
          )
        }).toThrow()
      })

      it('should reject invalid strictTableNameTypes value', () => {
        expect(() => {
          defineSchema(
            { users: defineTable({ name: v.string() }) },
            { strictTableNameTypes: 1 as any }
          )
        }).toThrow()
      })
    })
  })

  // ============================================================================
  // Integration with defineTable
  // ============================================================================

  describe('integration with defineTable', () => {
    describe('table with indexes', () => {
      it('should preserve index definitions', () => {
        const schema = defineSchema({
          users: defineTable({
            name: v.string(),
            email: v.string()
          }).index('by_email', ['email'])
        })
        expect(schema.tables.users.indexes).toBeDefined()
        expect(schema.tables.users.indexes.by_email).toBeDefined()
        expect(schema.tables.users.indexes.by_email.fields).toContain('email')
      })

      it('should preserve multiple indexes', () => {
        const schema = defineSchema({
          posts: defineTable({
            title: v.string(),
            authorId: v.string(),
            category: v.string(),
            createdAt: v.number()
          })
            .index('by_author', ['authorId'])
            .index('by_category', ['category'])
            .index('by_author_category', ['authorId', 'category'])
        })
        expect(Object.keys(schema.tables.posts.indexes)).toHaveLength(3)
        expect(schema.tables.posts.indexes.by_author).toBeDefined()
        expect(schema.tables.posts.indexes.by_category).toBeDefined()
        expect(schema.tables.posts.indexes.by_author_category).toBeDefined()
      })
    })

    describe('table with search indexes', () => {
      it('should preserve search index definitions', () => {
        const schema = defineSchema({
          articles: defineTable({
            title: v.string(),
            body: v.string(),
            category: v.string()
          }).searchIndex('search_body', {
            searchField: 'body',
            filterFields: ['category']
          })
        })
        expect(schema.tables.articles.searchIndexes).toBeDefined()
        expect(schema.tables.articles.searchIndexes.search_body).toBeDefined()
        expect(schema.tables.articles.searchIndexes.search_body.searchField).toBe('body')
        expect(schema.tables.articles.searchIndexes.search_body.filterFields).toContain('category')
      })
    })

    describe('table with vector indexes', () => {
      it('should preserve vector index definitions', () => {
        const schema = defineSchema({
          documents: defineTable({
            text: v.string(),
            embedding: v.array(v.float64()),
            category: v.string()
          }).vectorIndex('by_embedding', {
            vectorField: 'embedding',
            dimensions: 1536,
            filterFields: ['category']
          })
        })
        expect(schema.tables.documents.vectorIndexes).toBeDefined()
        expect(schema.tables.documents.vectorIndexes.by_embedding).toBeDefined()
        expect(schema.tables.documents.vectorIndexes.by_embedding.vectorField).toBe('embedding')
        expect(schema.tables.documents.vectorIndexes.by_embedding.dimensions).toBe(1536)
      })
    })

    describe('table with mixed indexes', () => {
      it('should preserve all index types together', () => {
        const schema = defineSchema({
          documents: defineTable({
            title: v.string(),
            body: v.string(),
            authorId: v.id('users'),
            embedding: v.array(v.float64()),
            category: v.string()
          })
            .index('by_author', ['authorId'])
            .searchIndex('search_content', {
              searchField: 'body',
              filterFields: ['category']
            })
            .vectorIndex('by_embedding', {
              vectorField: 'embedding',
              dimensions: 1536
            })
        })

        expect(Object.keys(schema.tables.documents.indexes)).toHaveLength(1)
        expect(Object.keys(schema.tables.documents.searchIndexes)).toHaveLength(1)
        expect(Object.keys(schema.tables.documents.vectorIndexes)).toHaveLength(1)
      })
    })
  })

  // ============================================================================
  // Complex Schema Tests
  // ============================================================================

  describe('complex schema scenarios', () => {
    it('should handle a realistic chat application schema', () => {
      const schema = defineSchema({
        users: defineTable({
          name: v.string(),
          email: v.string(),
          tokenIdentifier: v.string(),
          avatarUrl: v.optional(v.string())
        }).index('by_token', ['tokenIdentifier']),

        channels: defineTable({
          name: v.string(),
          description: v.optional(v.string()),
          isPrivate: v.boolean(),
          createdBy: v.id('users')
        }),

        messages: defineTable({
          channelId: v.id('channels'),
          authorId: v.id('users'),
          body: v.string(),
          editedAt: v.optional(v.number())
        })
          .index('by_channel', ['channelId'])
          .index('by_author', ['authorId'])
      })

      expect(schema.tables.users).toBeDefined()
      expect(schema.tables.channels).toBeDefined()
      expect(schema.tables.messages).toBeDefined()
      expect(schema.tables.messages.indexes.by_channel).toBeDefined()
    })

    it('should handle a schema with complex nested structures', () => {
      const schema = defineSchema({
        settings: defineTable({
          userId: v.id('users'),
          preferences: v.object({
            theme: v.union(v.literal('light'), v.literal('dark')),
            notifications: v.object({
              email: v.boolean(),
              push: v.boolean(),
              frequency: v.union(
                v.literal('instant'),
                v.literal('daily'),
                v.literal('weekly')
              )
            }),
            privacy: v.object({
              profileVisible: v.boolean(),
              showOnlineStatus: v.boolean()
            })
          })
        }).index('by_user', ['userId'])
      })

      expect(schema.tables.settings).toBeDefined()
      expect(schema.tables.settings.document.preferences).toBeDefined()
    })

    it('should handle a schema with nullable and optional fields', () => {
      const schema = defineSchema({
        profiles: defineTable({
          userId: v.id('users'),
          bio: v.optional(v.string()),
          website: v.optional(v.string()),
          birthdate: v.optional(v.number()),
          location: v.optional(v.object({
            city: v.string(),
            country: v.string()
          })),
          socialLinks: v.optional(v.array(v.object({
            platform: v.string(),
            url: v.string()
          })))
        })
      })

      expect(schema.tables.profiles).toBeDefined()
      expect(schema.tables.profiles.document.bio.isOptional).toBe(true)
    })
  })

  // ============================================================================
  // Schema Immutability Tests
  // ============================================================================

  describe('schema immutability', () => {
    it('should return frozen/readonly schema object', () => {
      const schema = defineSchema({
        users: defineTable({ name: v.string() })
      })

      // Attempting to modify should either throw or have no effect
      expect(() => {
        (schema as any).tables.newTable = defineTable({ name: v.string() })
      }).toThrow()
    })

    it('should not allow modification of table definitions', () => {
      const schema = defineSchema({
        users: defineTable({ name: v.string() })
      })

      expect(() => {
        (schema.tables.users as any).document.email = v.string()
      }).toThrow()
    })
  })

  // ============================================================================
  // Schema Serialization Tests
  // ============================================================================

  describe('schema serialization', () => {
    it('should be serializable to JSON representation', () => {
      const schema = defineSchema({
        users: defineTable({
          name: v.string(),
          age: v.number()
        }).index('by_name', ['name'])
      })

      // Schema should have a toJSON or similar method
      const json = schema.toJSON?.() ?? JSON.stringify(schema)
      expect(json).toBeDefined()
    })

    it('should preserve structure when serialized', () => {
      const schema = defineSchema({
        users: defineTable({
          name: v.string()
        })
      })

      const serialized = JSON.parse(JSON.stringify(schema))
      expect(serialized.tables).toBeDefined()
      expect(serialized.tables.users).toBeDefined()
    })
  })
})

// ============================================================================
// Integration Tests with defineTable
// ============================================================================

describe('defineTable', () => {
  describe('basic table definition', () => {
    it('should create a table definition with document schema', () => {
      const table = defineTable({
        name: v.string(),
        email: v.string()
      })
      expect(table.document).toBeDefined()
      expect(table.document.name).toBeDefined()
      expect(table.document.email).toBeDefined()
    })

    it('should initialize empty index collections', () => {
      const table = defineTable({ name: v.string() })
      expect(table.indexes).toBeDefined()
      expect(table.searchIndexes).toBeDefined()
      expect(table.vectorIndexes).toBeDefined()
      expect(Object.keys(table.indexes)).toHaveLength(0)
    })
  })

  describe('fluent index API', () => {
    it('should allow chaining index definitions', () => {
      const table = defineTable({
        field1: v.string(),
        field2: v.string(),
        field3: v.string()
      })
        .index('by_field1', ['field1'])
        .index('by_field2', ['field2'])
        .index('by_both', ['field1', 'field2'])

      expect(Object.keys(table.indexes)).toHaveLength(3)
    })

    it('should return same table instance for chaining', () => {
      const table = defineTable({ name: v.string() })
      const withIndex = table.index('by_name', ['name'])
      expect(withIndex).toBe(table)
    })
  })
})

// ============================================================================
// Export Type Tests (compile-time only)
// ============================================================================

describe('export types', () => {
  it('should export Schema type', () => {
    const schema = defineSchema({ users: defineTable({ name: v.string() }) })
    const _schemaType: Schema = schema
    expect(_schemaType).toBeDefined()
  })

  it('should export DataModel type', () => {
    const schema = defineSchema({ users: defineTable({ name: v.string() }) })
    type Model = DataModel<typeof schema>
    const model: Model = { users: { name: 'test' } }
    expect(model).toBeDefined()
  })

  it('should export Doc type', () => {
    const schema = defineSchema({ users: defineTable({ name: v.string() }) })
    type UserDoc = Doc<typeof schema, 'users'>
    // This is primarily a compile-time check
    expect(true).toBe(true)
  })

  it('should export TableDefinition type', () => {
    const table = defineTable({ name: v.string() })
    const _tableType: TableDefinition = table
    expect(_tableType).toBeDefined()
  })
})
