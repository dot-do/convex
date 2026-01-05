/**
 * TDD Tests for query() Function Builder
 *
 * These tests define the expected behavior for the query() function builder
 * that creates type-safe query handlers with argument validation and context injection.
 *
 * Layer 4: Server Function Builders
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { query, internalQuery, type RegisteredQuery, type QueryConfig } from '../../../src/server/query'
import { v, type Validator, type Infer, type ArgsValidator } from '../../../src/values'
import type { QueryCtx, DatabaseReader, Auth, StorageReader } from '../../../src/server/context'
import type { Id, UserIdentity, StorageId } from '../../../src/types'
import type { QueryBuilder } from '../../../src/server/queryBuilder'

// ============================================================================
// Mock Implementations for Testing
// ============================================================================

/**
 * Create a mock DatabaseReader for testing.
 */
function createMockDatabaseReader(): DatabaseReader {
  return {
    get: vi.fn(async (id: Id<string>) => {
      return { _id: id, _creationTime: Date.now(), name: 'Test Document' }
    }),
    query: vi.fn((tableName: string) => {
      return {
        withIndex: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        collect: vi.fn(async () => []),
        first: vi.fn(async () => null),
        take: vi.fn(async () => []),
      } as unknown as QueryBuilder<string>
    }),
    normalizeId: vi.fn((tableName: string, id: string) => {
      return id as Id<string>
    }),
    system: {
      get: vi.fn(),
      query: vi.fn((tableName: string) => {
        return {
          withIndex: vi.fn().mockReturnThis(),
          filter: vi.fn().mockReturnThis(),
          collect: vi.fn(async () => []),
          first: vi.fn(async () => null),
          take: vi.fn(async () => []),
        } as unknown as QueryBuilder<string>
      }),
    },
  }
}

/**
 * Create a mock Auth for testing.
 */
function createMockAuth(): Auth {
  return {
    getUserIdentity: vi.fn(async () => {
      return {
        subject: 'user|123',
        tokenIdentifier: 'token|123',
        issuer: 'https://example.com',
        name: 'Test User',
        email: 'test@example.com',
      } as UserIdentity
    }),
  }
}

/**
 * Create a mock StorageReader for testing.
 */
function createMockStorageReader(): StorageReader {
  return {
    getUrl: vi.fn(async (storageId: StorageId) => {
      return `https://storage.example.com/${storageId}`
    }),
    getMetadata: vi.fn(async (storageId: StorageId) => {
      return {
        storageId,
        sha256: 'abc123',
        size: 1024,
        contentType: 'image/png',
      }
    }),
  }
}

/**
 * Create a complete mock QueryCtx for testing.
 */
function createMockQueryCtx(): QueryCtx {
  return {
    db: createMockDatabaseReader(),
    auth: createMockAuth(),
    storage: createMockStorageReader(),
  }
}

// ============================================================================
// Query Function Builder Structure Tests
// ============================================================================

describe('query() function builder', () => {
  describe('basic structure', () => {
    it('should return a RegisteredQuery object', () => {
      const myQuery = query({
        handler: async (ctx) => {
          return 'hello'
        },
      })

      expect(myQuery).toBeDefined()
      expect(myQuery._type).toBe('query')
    })

    it('should have _type property set to "query"', () => {
      const myQuery = query({
        handler: async (ctx) => null,
      })

      expect(myQuery._type).toBe('query')
    })

    it('should have _visibility property set to "public" for query()', () => {
      const myQuery = query({
        handler: async (ctx) => null,
      })

      expect(myQuery._visibility).toBe('public')
    })

    it('should have _visibility property set to "internal" for internalQuery()', () => {
      const myQuery = internalQuery({
        handler: async (ctx) => null,
      })

      expect(myQuery._visibility).toBe('internal')
    })

    it('should store the config in _config property', () => {
      const handler = async (ctx: QueryCtx) => 'result'
      const myQuery = query({ handler })

      expect(myQuery._config).toBeDefined()
      expect(myQuery._config.handler).toBe(handler)
    })
  })

  // ============================================================================
  // Handler Function Tests
  // ============================================================================

  describe('handler function', () => {
    it('should accept a handler function', () => {
      const myQuery = query({
        handler: async (ctx) => {
          return 'test'
        },
      })

      expect(myQuery._config.handler).toBeDefined()
      expect(typeof myQuery._config.handler).toBe('function')
    })

    it('should allow synchronous handlers', () => {
      const myQuery = query({
        handler: (ctx) => {
          return 'sync result'
        },
      })

      expect(myQuery._config.handler).toBeDefined()
    })

    it('should allow async handlers', () => {
      const myQuery = query({
        handler: async (ctx) => {
          return 'async result'
        },
      })

      expect(myQuery._config.handler).toBeDefined()
    })

    it('should receive QueryCtx as first parameter', async () => {
      let receivedCtx: QueryCtx | null = null
      const myQuery = query({
        handler: async (ctx) => {
          receivedCtx = ctx
          return null
        },
      })

      const mockCtx = createMockQueryCtx()
      await myQuery._config.handler(mockCtx, {})

      expect(receivedCtx).toBe(mockCtx)
    })

    it('should receive args as second parameter', async () => {
      let receivedArgs: unknown = null
      const myQuery = query({
        args: { name: v.string() },
        handler: async (ctx, args) => {
          receivedArgs = args
          return null
        },
      })

      const mockCtx = createMockQueryCtx()
      await myQuery._config.handler(mockCtx, { name: 'test' })

      expect(receivedArgs).toEqual({ name: 'test' })
    })

    it('should return handler result', async () => {
      const myQuery = query({
        handler: async (ctx) => {
          return { status: 'ok', count: 42 }
        },
      })

      const mockCtx = createMockQueryCtx()
      const result = await myQuery._config.handler(mockCtx, {})

      expect(result).toEqual({ status: 'ok', count: 42 })
    })
  })

  // ============================================================================
  // Args Validator Tests
  // ============================================================================

  describe('args validation', () => {
    it('should accept args as object of validators', () => {
      const myQuery = query({
        args: {
          name: v.string(),
          age: v.number(),
        },
        handler: async (ctx, args) => {
          return args
        },
      })

      expect(myQuery._config.args).toBeDefined()
    })

    it('should accept empty args', () => {
      const myQuery = query({
        args: {},
        handler: async (ctx, args) => {
          return null
        },
      })

      expect(myQuery._config.args).toBeDefined()
    })

    it('should work without args specified', () => {
      const myQuery = query({
        handler: async (ctx) => {
          return null
        },
      })

      expect(myQuery._config.args).toBeUndefined()
    })

    it('should accept v.id() validator for table references', () => {
      const myQuery = query({
        args: { userId: v.id('users') },
        handler: async (ctx, args) => {
          return await ctx.db.get(args.userId)
        },
      })

      expect(myQuery._config.args).toBeDefined()
    })

    it('should accept optional validators', () => {
      const myQuery = query({
        args: {
          required: v.string(),
          optional: v.optional(v.string()),
        },
        handler: async (ctx, args) => {
          return { required: args.required, optional: args.optional }
        },
      })

      expect(myQuery._config.args).toBeDefined()
    })

    it('should accept complex nested validators', () => {
      const myQuery = query({
        args: {
          filter: v.object({
            status: v.union(v.literal('active'), v.literal('inactive')),
            tags: v.array(v.string()),
          }),
          pagination: v.optional(
            v.object({
              limit: v.number(),
              cursor: v.optional(v.string()),
            })
          ),
        },
        handler: async (ctx, args) => {
          return args
        },
      })

      expect(myQuery._config.args).toBeDefined()
    })

    it('should accept v.object() as args validator', () => {
      const myQuery = query({
        args: v.object({
          name: v.string(),
          age: v.number(),
        }),
        handler: async (ctx, args) => {
          return args
        },
      })

      expect(myQuery._config.args).toBeDefined()
    })
  })

  // ============================================================================
  // Return Type Validator Tests
  // ============================================================================

  describe('return type validation', () => {
    it('should accept returns validator', () => {
      const myQuery = query({
        args: { id: v.string() },
        returns: v.object({
          name: v.string(),
          email: v.string(),
        }),
        handler: async (ctx, args) => {
          return { name: 'Test', email: 'test@example.com' }
        },
      })

      expect(myQuery._config.returns).toBeDefined()
    })

    it('should work without returns validator', () => {
      const myQuery = query({
        handler: async (ctx) => {
          return { anything: 'goes' }
        },
      })

      expect(myQuery._config.returns).toBeUndefined()
    })

    it('should accept primitive return validators', () => {
      const stringQuery = query({
        returns: v.string(),
        handler: async (ctx) => 'hello',
      })

      const numberQuery = query({
        returns: v.number(),
        handler: async (ctx) => 42,
      })

      const boolQuery = query({
        returns: v.boolean(),
        handler: async (ctx) => true,
      })

      expect(stringQuery._config.returns).toBeDefined()
      expect(numberQuery._config.returns).toBeDefined()
      expect(boolQuery._config.returns).toBeDefined()
    })

    it('should accept array return validators', () => {
      const myQuery = query({
        returns: v.array(
          v.object({
            _id: v.string(),
            name: v.string(),
          })
        ),
        handler: async (ctx) => {
          return []
        },
      })

      expect(myQuery._config.returns).toBeDefined()
    })

    it('should accept nullable return validators', () => {
      const myQuery = query({
        args: { id: v.string() },
        returns: v.nullable(
          v.object({
            name: v.string(),
          })
        ),
        handler: async (ctx, args) => {
          return null
        },
      })

      expect(myQuery._config.returns).toBeDefined()
    })
  })

  // ============================================================================
  // QueryCtx Integration Tests
  // ============================================================================

  describe('QueryCtx integration', () => {
    it('should provide access to ctx.db', async () => {
      let hasDb = false
      const myQuery = query({
        handler: async (ctx) => {
          hasDb = ctx.db !== undefined
          return null
        },
      })

      const mockCtx = createMockQueryCtx()
      await myQuery._config.handler(mockCtx, {})

      expect(hasDb).toBe(true)
    })

    it('should provide access to ctx.auth', async () => {
      let hasAuth = false
      const myQuery = query({
        handler: async (ctx) => {
          hasAuth = ctx.auth !== undefined
          return null
        },
      })

      const mockCtx = createMockQueryCtx()
      await myQuery._config.handler(mockCtx, {})

      expect(hasAuth).toBe(true)
    })

    it('should provide access to ctx.storage', async () => {
      let hasStorage = false
      const myQuery = query({
        handler: async (ctx) => {
          hasStorage = ctx.storage !== undefined
          return null
        },
      })

      const mockCtx = createMockQueryCtx()
      await myQuery._config.handler(mockCtx, {})

      expect(hasStorage).toBe(true)
    })

    it('should allow db.get() in handler', async () => {
      const myQuery = query({
        args: { userId: v.string() },
        handler: async (ctx, args) => {
          return await ctx.db.get(args.userId as Id<'users'>)
        },
      })

      const mockCtx = createMockQueryCtx()
      const result = await myQuery._config.handler(mockCtx, { userId: 'user_123' })

      expect(mockCtx.db.get).toHaveBeenCalledWith('user_123')
      expect(result).toBeDefined()
    })

    it('should allow db.query() in handler', async () => {
      const myQuery = query({
        handler: async (ctx) => {
          return await ctx.db.query('messages').collect()
        },
      })

      const mockCtx = createMockQueryCtx()
      await myQuery._config.handler(mockCtx, {})

      expect(mockCtx.db.query).toHaveBeenCalledWith('messages')
    })

    it('should allow auth.getUserIdentity() in handler', async () => {
      const myQuery = query({
        handler: async (ctx) => {
          return await ctx.auth.getUserIdentity()
        },
      })

      const mockCtx = createMockQueryCtx()
      const result = await myQuery._config.handler(mockCtx, {})

      expect(mockCtx.auth.getUserIdentity).toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it('should allow storage.getUrl() in handler', async () => {
      const myQuery = query({
        args: { storageId: v.string() },
        handler: async (ctx, args) => {
          return await ctx.storage.getUrl(args.storageId as StorageId)
        },
      })

      const mockCtx = createMockQueryCtx()
      await myQuery._config.handler(mockCtx, { storageId: 'storage_123' })

      expect(mockCtx.storage.getUrl).toHaveBeenCalledWith('storage_123')
    })

    it('should not provide write methods on ctx.db', async () => {
      const myQuery = query({
        handler: async (ctx) => {
          // These should not exist on QueryCtx
          expect((ctx.db as unknown as Record<string, unknown>).insert).toBeUndefined()
          expect((ctx.db as unknown as Record<string, unknown>).patch).toBeUndefined()
          expect((ctx.db as unknown as Record<string, unknown>).replace).toBeUndefined()
          expect((ctx.db as unknown as Record<string, unknown>).delete).toBeUndefined()
          return null
        },
      })

      const mockCtx = createMockQueryCtx()
      await myQuery._config.handler(mockCtx, {})
    })

    it('should not provide scheduler on ctx', async () => {
      const myQuery = query({
        handler: async (ctx) => {
          expect((ctx as unknown as Record<string, unknown>).scheduler).toBeUndefined()
          return null
        },
      })

      const mockCtx = createMockQueryCtx()
      await myQuery._config.handler(mockCtx, {})
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should propagate errors from handler', async () => {
      const myQuery = query({
        handler: async (ctx) => {
          throw new Error('Query failed')
        },
      })

      const mockCtx = createMockQueryCtx()

      await expect(myQuery._config.handler(mockCtx, {})).rejects.toThrow('Query failed')
    })

    it('should propagate database errors', async () => {
      const myQuery = query({
        args: { id: v.string() },
        handler: async (ctx, args) => {
          return await ctx.db.get(args.id as Id<'users'>)
        },
      })

      const mockCtx = createMockQueryCtx()
      mockCtx.db.get = vi.fn(async () => {
        throw new Error('Database error')
      })

      await expect(myQuery._config.handler(mockCtx, { id: 'test' })).rejects.toThrow('Database error')
    })

    it('should propagate auth errors', async () => {
      const myQuery = query({
        handler: async (ctx) => {
          return await ctx.auth.getUserIdentity()
        },
      })

      const mockCtx = createMockQueryCtx()
      mockCtx.auth.getUserIdentity = vi.fn(async () => {
        throw new Error('Auth error')
      })

      await expect(myQuery._config.handler(mockCtx, {})).rejects.toThrow('Auth error')
    })

    it('should allow returning null for non-existent documents', async () => {
      const myQuery = query({
        args: { id: v.string() },
        handler: async (ctx, args) => {
          return await ctx.db.get(args.id as Id<'users'>)
        },
      })

      const mockCtx = createMockQueryCtx()
      mockCtx.db.get = vi.fn(async () => null)

      const result = await myQuery._config.handler(mockCtx, { id: 'nonexistent' })

      expect(result).toBeNull()
    })
  })

  // ============================================================================
  // Type Inference Tests
  // ============================================================================

  describe('type inference', () => {
    it('should infer args type from validators', () => {
      const myQuery = query({
        args: {
          name: v.string(),
          age: v.number(),
          active: v.boolean(),
        },
        handler: async (ctx, args) => {
          // Type inference test - args should have correct types
          const name: string = args.name
          const age: number = args.age
          const active: boolean = args.active
          return { name, age, active }
        },
      })

      // Type marker test - verify structure
      expect(myQuery._config.args).toBeDefined()
    })

    it('should infer empty object type when no args', () => {
      const myQuery = query({
        handler: async (ctx, args) => {
          // args should be Record<string, never> or empty object
          return Object.keys(args).length
        },
      })

      expect(myQuery._config.args).toBeUndefined()
    })

    it('should infer return type from handler', () => {
      const myQuery = query({
        handler: async (ctx): Promise<{ status: string; count: number }> => {
          return { status: 'ok', count: 42 }
        },
      })

      // Return type should be inferred from handler
      expect(myQuery._config.handler).toBeDefined()
    })

    it('should preserve optional args in inferred type', () => {
      const myQuery = query({
        args: {
          required: v.string(),
          optional: v.optional(v.number()),
        },
        handler: async (ctx, args) => {
          const required: string = args.required
          const optional: number | undefined = args.optional
          return { required, optional }
        },
      })

      expect(myQuery._config.args).toBeDefined()
    })

    it('should infer v.id() type correctly', () => {
      const myQuery = query({
        args: {
          userId: v.id('users'),
          postId: v.id('posts'),
        },
        handler: async (ctx, args) => {
          // userId and postId should be typed as Id<'users'> and Id<'posts'>
          return { userId: args.userId, postId: args.postId }
        },
      })

      expect(myQuery._config.args).toBeDefined()
    })
  })

  // ============================================================================
  // Real-World Usage Pattern Tests
  // ============================================================================

  describe('realistic usage patterns', () => {
    it('should support a getUser query pattern', async () => {
      const getUser = query({
        args: { userId: v.id('users') },
        handler: async (ctx, args) => {
          return await ctx.db.get(args.userId)
        },
      })

      expect(getUser._type).toBe('query')
      expect(getUser._visibility).toBe('public')

      const mockCtx = createMockQueryCtx()
      const result = await getUser._config.handler(mockCtx, {
        userId: 'user_12345678901234567890123456789012' as Id<'users'>,
      })

      expect(result).toBeDefined()
    })

    it('should support a listMessages query pattern', async () => {
      const listMessages = query({
        args: { channelId: v.id('channels') },
        handler: async (ctx, args) => {
          return await ctx.db
            .query('messages')
            .withIndex('by_channel', (q) => q)
            .collect()
        },
      })

      const mockCtx = createMockQueryCtx()
      const mockQuery = {
        withIndex: vi.fn().mockReturnThis(),
        collect: vi.fn(async () => [
          { _id: 'msg_1', body: 'Hello' },
          { _id: 'msg_2', body: 'World' },
        ]),
      }
      mockCtx.db.query = vi.fn(() => mockQuery as unknown as QueryBuilder<string>)

      const result = await listMessages._config.handler(mockCtx, {
        channelId: 'channel_12345678901234567890123456' as Id<'channels'>,
      })

      expect(result).toBeInstanceOf(Array)
    })

    it('should support an authenticated getCurrentUser query', async () => {
      const getCurrentUser = query({
        handler: async (ctx) => {
          const identity = await ctx.auth.getUserIdentity()
          if (!identity) {
            return null
          }

          const mockQuery = {
            withIndex: vi.fn().mockReturnThis(),
            first: vi.fn(async () => ({
              _id: 'user_123',
              tokenIdentifier: identity.tokenIdentifier,
              name: identity.name,
            })),
          }
          ;(ctx.db as unknown as Record<string, unknown>).query = vi.fn(() => mockQuery)

          return await ctx.db
            .query('users')
            .withIndex('by_token', (q) => q)
            .first()
        },
      })

      const mockCtx = createMockQueryCtx()
      const result = await getCurrentUser._config.handler(mockCtx, {})

      expect(result).toBeDefined()
    })

    it('should support pagination pattern', async () => {
      const listPosts = query({
        args: {
          paginationOpts: v.object({
            numItems: v.number(),
            cursor: v.optional(v.string()),
          }),
        },
        handler: async (ctx, args) => {
          // Simplified pagination logic
          return {
            page: [],
            isDone: true,
            continueCursor: 'cursor_123',
          }
        },
      })

      const mockCtx = createMockQueryCtx()
      const result = await listPosts._config.handler(mockCtx, {
        paginationOpts: { numItems: 10 },
      })

      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('isDone')
      expect(result).toHaveProperty('continueCursor')
    })

    it('should support search query pattern', async () => {
      const searchPosts = query({
        args: {
          query: v.string(),
          limit: v.optional(v.number()),
        },
        handler: async (ctx, args) => {
          // Simplified search logic
          return []
        },
      })

      const mockCtx = createMockQueryCtx()
      const result = await searchPosts._config.handler(mockCtx, {
        query: 'hello',
        limit: 10,
      })

      expect(result).toBeInstanceOf(Array)
    })

    it('should support file URL query pattern', async () => {
      const getFileUrl = query({
        args: { storageId: v.id('_storage') },
        handler: async (ctx, args) => {
          return await ctx.storage.getUrl(args.storageId as unknown as StorageId)
        },
      })

      const mockCtx = createMockQueryCtx()
      const result = await getFileUrl._config.handler(mockCtx, {
        storageId: 'storage_12345678901234567890123456' as Id<'_storage'>,
      })

      expect(result).toContain('https://')
    })
  })

  // ============================================================================
  // Internal Query Tests
  // ============================================================================

  describe('internalQuery()', () => {
    it('should create an internal query', () => {
      const myInternalQuery = internalQuery({
        handler: async (ctx) => 'internal result',
      })

      expect(myInternalQuery._type).toBe('query')
      expect(myInternalQuery._visibility).toBe('internal')
    })

    it('should accept args like regular query', () => {
      const myInternalQuery = internalQuery({
        args: { secret: v.string() },
        handler: async (ctx, args) => {
          return args.secret
        },
      })

      expect(myInternalQuery._config.args).toBeDefined()
    })

    it('should work identically to query() except for visibility', async () => {
      const publicQuery = query({
        args: { name: v.string() },
        handler: async (ctx, args) => args.name,
      })

      const internalQueryDef = internalQuery({
        args: { name: v.string() },
        handler: async (ctx, args) => args.name,
      })

      expect(publicQuery._type).toBe(internalQueryDef._type)
      expect(publicQuery._visibility).not.toBe(internalQueryDef._visibility)

      const mockCtx = createMockQueryCtx()
      const publicResult = await publicQuery._config.handler(mockCtx, { name: 'test' })
      const internalResult = await internalQueryDef._config.handler(mockCtx, { name: 'test' })

      expect(publicResult).toBe(internalResult)
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty return value', async () => {
      const myQuery = query({
        handler: async (ctx) => {
          return undefined
        },
      })

      const mockCtx = createMockQueryCtx()
      const result = await myQuery._config.handler(mockCtx, {})

      expect(result).toBeUndefined()
    })

    it('should handle complex return objects', async () => {
      const myQuery = query({
        handler: async (ctx) => {
          return {
            nested: {
              deeply: {
                value: 42,
              },
            },
            array: [1, 2, 3],
            date: new Date().toISOString(),
          }
        },
      })

      const mockCtx = createMockQueryCtx()
      const result = await myQuery._config.handler(mockCtx, {})

      expect(result.nested.deeply.value).toBe(42)
      expect(result.array).toEqual([1, 2, 3])
    })

    it('should handle array args', () => {
      const myQuery = query({
        args: {
          ids: v.array(v.id('users')),
        },
        handler: async (ctx, args) => {
          return args.ids.length
        },
      })

      expect(myQuery._config.args).toBeDefined()
    })

    it('should handle union type args', () => {
      const myQuery = query({
        args: {
          status: v.union(
            v.literal('draft'),
            v.literal('published'),
            v.literal('archived')
          ),
        },
        handler: async (ctx, args) => {
          return args.status
        },
      })

      expect(myQuery._config.args).toBeDefined()
    })

    it('should handle multiple queries defined in same module', () => {
      const query1 = query({
        handler: async (ctx) => 'query1',
      })

      const query2 = query({
        handler: async (ctx) => 'query2',
      })

      expect(query1).not.toBe(query2)
      expect(query1._config.handler).not.toBe(query2._config.handler)
    })

    it('should allow handler to return promises', async () => {
      const myQuery = query({
        handler: (ctx) => {
          return Promise.resolve('async')
        },
      })

      const mockCtx = createMockQueryCtx()
      const result = await myQuery._config.handler(mockCtx, {})

      expect(result).toBe('async')
    })
  })

  // ============================================================================
  // Type Utility Tests
  // ============================================================================

  describe('type utilities', () => {
    it('should export QueryConfig type', () => {
      // Type test - verify QueryConfig is exported and usable
      const config: QueryConfig<{ name: Validator<string> }, string> = {
        args: { name: v.string() },
        handler: async (ctx, args) => args.name,
      }

      expect(config.args).toBeDefined()
    })

    it('should export RegisteredQuery type', () => {
      // Type test - verify RegisteredQuery is exported
      const myQuery: RegisteredQuery<{ name: Validator<string> }, string> = query({
        args: { name: v.string() },
        handler: async (ctx, args) => args.name,
      })

      expect(myQuery._type).toBe('query')
    })
  })
})
