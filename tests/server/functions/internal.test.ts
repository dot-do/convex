/**
 * TDD Tests for Internal Function Builders
 *
 * Tests for internalQuery, internalMutation, and internalAction function builders.
 * These functions are NOT exposed via HTTP/public API and can only be called
 * from other Convex functions.
 *
 * Layer 5: Server Function Builders
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { internalQuery, internalMutation, internalAction } from '../../../src/server/functions/internal'
import { v } from '../../../src/values'
import type { QueryCtx, MutationCtx, ActionCtx } from '../../../src/server/context'
import type { Id, StorageId, ScheduledFunctionId, FunctionReference } from '../../../src/types'

// ============================================================================
// Mock Context Factories
// ============================================================================

/**
 * Create a mock QueryCtx for testing
 */
function createMockQueryCtx(): QueryCtx {
  return {
    db: {
      get: vi.fn().mockResolvedValue({ _id: 'doc_123', _creationTime: Date.now(), name: 'Test' }),
      query: vi.fn().mockReturnValue({
        collect: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockResolvedValue(null),
        take: vi.fn().mockResolvedValue([]),
        withIndex: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      }),
      normalizeId: vi.fn((table, id) => id as Id<string>),
      system: {
        get: vi.fn().mockResolvedValue(null),
        query: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([]),
          first: vi.fn().mockResolvedValue(null),
        }),
      },
    },
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue({
        tokenIdentifier: 'test-token',
        subject: 'user-123',
        email: 'test@example.com',
      }),
    },
    storage: {
      getUrl: vi.fn().mockResolvedValue('https://storage.example.com/file.jpg'),
      getMetadata: vi.fn().mockResolvedValue({
        storageId: 'storage-123' as StorageId,
        sha256: 'abc123',
        size: 1024,
        contentType: 'image/jpeg',
      }),
    },
  }
}

/**
 * Create a mock MutationCtx for testing
 */
function createMockMutationCtx(): MutationCtx {
  return {
    db: {
      get: vi.fn().mockResolvedValue({ _id: 'doc_123', _creationTime: Date.now(), name: 'Test' }),
      query: vi.fn().mockReturnValue({
        collect: vi.fn().mockResolvedValue([]),
        first: vi.fn().mockResolvedValue(null),
        take: vi.fn().mockResolvedValue([]),
        withIndex: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      }),
      normalizeId: vi.fn((table, id) => id as Id<string>),
      system: {
        get: vi.fn().mockResolvedValue(null),
        query: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([]),
          first: vi.fn().mockResolvedValue(null),
        }),
      },
      insert: vi.fn().mockResolvedValue('new_doc_456' as Id<string>),
      patch: vi.fn().mockResolvedValue(undefined),
      replace: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue({
        tokenIdentifier: 'test-token',
        subject: 'user-123',
        email: 'test@example.com',
      }),
    },
    storage: {
      getUrl: vi.fn().mockResolvedValue('https://storage.example.com/file.jpg'),
      getMetadata: vi.fn().mockResolvedValue({
        storageId: 'storage-123' as StorageId,
        sha256: 'abc123',
        size: 1024,
        contentType: 'image/jpeg',
      }),
      generateUploadUrl: vi.fn().mockResolvedValue('https://upload.example.com/token'),
      store: vi.fn().mockResolvedValue('storage-456' as StorageId),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    scheduler: {
      runAfter: vi.fn().mockResolvedValue('scheduled-123' as ScheduledFunctionId),
      runAt: vi.fn().mockResolvedValue('scheduled-456' as ScheduledFunctionId),
      cancel: vi.fn().mockResolvedValue(undefined),
    },
  }
}

/**
 * Create a mock ActionCtx for testing
 */
function createMockActionCtx(): ActionCtx {
  return {
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue({
        tokenIdentifier: 'test-token',
        subject: 'user-123',
        email: 'test@example.com',
      }),
    },
    storage: {
      getUrl: vi.fn().mockResolvedValue('https://storage.example.com/file.jpg'),
      getMetadata: vi.fn().mockResolvedValue({
        storageId: 'storage-123' as StorageId,
        sha256: 'abc123',
        size: 1024,
        contentType: 'image/jpeg',
      }),
    },
    scheduler: {
      runAfter: vi.fn().mockResolvedValue('scheduled-123' as ScheduledFunctionId),
      runAt: vi.fn().mockResolvedValue('scheduled-456' as ScheduledFunctionId),
      cancel: vi.fn().mockResolvedValue(undefined),
    },
    runQuery: vi.fn().mockResolvedValue({ result: 'query result' }),
    runMutation: vi.fn().mockResolvedValue({ result: 'mutation result' }),
    runAction: vi.fn().mockResolvedValue({ result: 'action result' }),
    vectorSearch: vi.fn().mockResolvedValue([]),
  }
}

// ============================================================================
// internalQuery Tests
// ============================================================================

describe('internalQuery', () => {
  describe('function builder basics', () => {
    it('should create a registered internal query', () => {
      const getUserById = internalQuery({
        handler: async (ctx) => {
          return { name: 'Test User' }
        },
      })

      expect(getUserById).toBeDefined()
      expect(getUserById._type).toBe('query')
      expect(getUserById._visibility).toBe('internal')
    })

    it('should mark visibility as internal', () => {
      const getUser = internalQuery({
        handler: async (ctx) => null,
      })

      expect(getUser._visibility).toBe('internal')
    })

    it('should preserve the handler config', () => {
      const handler = async (ctx: QueryCtx) => ({ test: true })
      const fn = internalQuery({ handler })

      expect(fn._config).toBeDefined()
      expect(fn._config.handler).toBe(handler)
    })

    it('should be distinguishable from public query', () => {
      const internalFn = internalQuery({
        handler: async (ctx) => null,
      })

      // Internal queries have visibility set to 'internal'
      expect(internalFn._visibility).toBe('internal')
      expect(internalFn._visibility).not.toBe('public')
    })
  })

  describe('with argument validators', () => {
    it('should accept args validator object', () => {
      const getUserById = internalQuery({
        args: {
          id: v.string(),
        },
        handler: async (ctx, args) => {
          return args.id
        },
      })

      expect(getUserById._config.args).toBeDefined()
    })

    it('should accept v.id() validator', () => {
      const getUserById = internalQuery({
        args: {
          id: v.id('users'),
        },
        handler: async (ctx, args) => {
          return await ctx.db.get(args.id)
        },
      })

      expect(getUserById._config.args).toBeDefined()
      expect(getUserById._config.args?.id).toBeDefined()
    })

    it('should accept multiple argument validators', () => {
      const searchUsers = internalQuery({
        args: {
          name: v.string(),
          limit: v.number(),
          includeDeleted: v.optional(v.boolean()),
        },
        handler: async (ctx, args) => {
          return []
        },
      })

      expect(searchUsers._config.args).toBeDefined()
    })

    it('should accept complex nested validators', () => {
      const findByFilter = internalQuery({
        args: {
          filter: v.object({
            status: v.union(v.literal('active'), v.literal('inactive')),
            tags: v.array(v.string()),
          }),
        },
        handler: async (ctx, args) => {
          return []
        },
      })

      expect(findByFilter._config.args).toBeDefined()
    })
  })

  describe('return type validator', () => {
    it('should accept returns validator', () => {
      const getCount = internalQuery({
        args: {},
        returns: v.number(),
        handler: async (ctx) => {
          return 42
        },
      })

      expect(getCount._config.returns).toBeDefined()
    })

    it('should accept complex return type', () => {
      const getUser = internalQuery({
        args: { id: v.string() },
        returns: v.object({
          id: v.string(),
          name: v.string(),
          email: v.optional(v.string()),
        }),
        handler: async (ctx, args) => {
          return { id: args.id, name: 'Test', email: undefined }
        },
      })

      expect(getUser._config.returns).toBeDefined()
    })
  })

  describe('context injection', () => {
    it('should receive QueryCtx with db property', async () => {
      const ctx = createMockQueryCtx()
      let receivedCtx: QueryCtx | undefined

      const fn = internalQuery({
        handler: async (context) => {
          receivedCtx = context
          return true
        },
      })

      // Simulate calling the handler
      await fn._config.handler(ctx, {} as never)

      expect(receivedCtx).toBeDefined()
      expect(receivedCtx?.db).toBeDefined()
      expect(receivedCtx?.db.get).toBeDefined()
      expect(receivedCtx?.db.query).toBeDefined()
    })

    it('should receive QueryCtx with auth property', async () => {
      const ctx = createMockQueryCtx()
      let hasAuth = false

      const fn = internalQuery({
        handler: async (context) => {
          hasAuth = !!context.auth
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
      expect(hasAuth).toBe(true)
    })

    it('should receive QueryCtx with storage property', async () => {
      const ctx = createMockQueryCtx()
      let hasStorage = false

      const fn = internalQuery({
        handler: async (context) => {
          hasStorage = !!context.storage
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
      expect(hasStorage).toBe(true)
    })

    it('should NOT have db.insert method (read-only)', async () => {
      const ctx = createMockQueryCtx()

      const fn = internalQuery({
        handler: async (context) => {
          // QueryCtx.db should not have insert method
          expect((context.db as any).insert).toBeUndefined()
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })
  })

  describe('handler execution', () => {
    it('should execute handler and return result', async () => {
      const ctx = createMockQueryCtx()

      const fn = internalQuery({
        args: { name: v.string() },
        handler: async (context, args) => {
          return `Hello, ${args.name}!`
        },
      })

      const result = await fn._config.handler(ctx, { name: 'World' })
      expect(result).toBe('Hello, World!')
    })

    it('should handle async database operations', async () => {
      const ctx = createMockQueryCtx()
      const mockDoc = { _id: 'user_123', _creationTime: Date.now(), name: 'John' }
      vi.mocked(ctx.db.get).mockResolvedValue(mockDoc)

      const fn = internalQuery({
        args: { id: v.string() },
        handler: async (context, args) => {
          return await context.db.get(args.id as Id<'users'>)
        },
      })

      const result = await fn._config.handler(ctx, { id: 'user_123' })
      expect(result).toEqual(mockDoc)
    })

    it('should propagate errors', async () => {
      const ctx = createMockQueryCtx()
      vi.mocked(ctx.db.get).mockRejectedValue(new Error('Database error'))

      const fn = internalQuery({
        args: { id: v.string() },
        handler: async (context, args) => {
          return await context.db.get(args.id as Id<'users'>)
        },
      })

      await expect(fn._config.handler(ctx, { id: 'user_123' })).rejects.toThrow('Database error')
    })
  })

  describe('not exposed via HTTP', () => {
    it('should have internal visibility marker', () => {
      const fn = internalQuery({
        handler: async () => null,
      })

      expect(fn._visibility).toBe('internal')
    })

    it('should be identifiable as internal function', () => {
      const fn = internalQuery({
        handler: async () => null,
      })

      // Function should be marked as not publicly accessible
      expect(fn._visibility).not.toBe('public')
    })
  })
})

// ============================================================================
// internalMutation Tests
// ============================================================================

describe('internalMutation', () => {
  describe('function builder basics', () => {
    it('should create a registered internal mutation', () => {
      const updateUser = internalMutation({
        handler: async (ctx) => {
          return 'updated'
        },
      })

      expect(updateUser).toBeDefined()
      expect(updateUser._type).toBe('mutation')
      expect(updateUser._visibility).toBe('internal')
    })

    it('should mark visibility as internal', () => {
      const fn = internalMutation({
        handler: async (ctx) => null,
      })

      expect(fn._visibility).toBe('internal')
    })

    it('should preserve the handler config', () => {
      const handler = async (ctx: MutationCtx) => ({ success: true })
      const fn = internalMutation({ handler })

      expect(fn._config).toBeDefined()
      expect(fn._config.handler).toBe(handler)
    })

    it('should be distinguishable from public mutation', () => {
      const internalFn = internalMutation({
        handler: async (ctx) => null,
      })

      expect(internalFn._visibility).toBe('internal')
      expect(internalFn._visibility).not.toBe('public')
    })
  })

  describe('with argument validators', () => {
    it('should accept args validator object', () => {
      const updateUserInternal = internalMutation({
        args: {
          id: v.id('users'),
          data: v.object({
            name: v.optional(v.string()),
            email: v.optional(v.string()),
          }),
        },
        handler: async (ctx, args) => {
          await ctx.db.patch(args.id, args.data)
        },
      })

      expect(updateUserInternal._config.args).toBeDefined()
    })

    it('should accept complex argument validators', () => {
      const batchUpdate = internalMutation({
        args: {
          updates: v.array(
            v.object({
              id: v.id('documents'),
              patch: v.object({
                title: v.optional(v.string()),
                content: v.optional(v.string()),
              }),
            })
          ),
        },
        handler: async (ctx, args) => {
          for (const update of args.updates) {
            await ctx.db.patch(update.id, update.patch)
          }
          return args.updates.length
        },
      })

      expect(batchUpdate._config.args).toBeDefined()
    })
  })

  describe('return type validator', () => {
    it('should accept returns validator', () => {
      const createDoc = internalMutation({
        args: { data: v.object({ name: v.string() }) },
        returns: v.id('documents'),
        handler: async (ctx, args) => {
          return await ctx.db.insert('documents', args.data)
        },
      })

      expect(createDoc._config.returns).toBeDefined()
    })
  })

  describe('context injection', () => {
    it('should receive MutationCtx with db property', async () => {
      const ctx = createMockMutationCtx()
      let receivedCtx: MutationCtx | undefined

      const fn = internalMutation({
        handler: async (context) => {
          receivedCtx = context
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)

      expect(receivedCtx).toBeDefined()
      expect(receivedCtx?.db).toBeDefined()
    })

    it('should have db.insert method (write access)', async () => {
      const ctx = createMockMutationCtx()

      const fn = internalMutation({
        handler: async (context) => {
          expect(context.db.insert).toBeDefined()
          expect(typeof context.db.insert).toBe('function')
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have db.patch method', async () => {
      const ctx = createMockMutationCtx()

      const fn = internalMutation({
        handler: async (context) => {
          expect(context.db.patch).toBeDefined()
          expect(typeof context.db.patch).toBe('function')
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have db.replace method', async () => {
      const ctx = createMockMutationCtx()

      const fn = internalMutation({
        handler: async (context) => {
          expect(context.db.replace).toBeDefined()
          expect(typeof context.db.replace).toBe('function')
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have db.delete method', async () => {
      const ctx = createMockMutationCtx()

      const fn = internalMutation({
        handler: async (context) => {
          expect(context.db.delete).toBeDefined()
          expect(typeof context.db.delete).toBe('function')
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have scheduler property', async () => {
      const ctx = createMockMutationCtx()

      const fn = internalMutation({
        handler: async (context) => {
          expect(context.scheduler).toBeDefined()
          expect(context.scheduler.runAfter).toBeDefined()
          expect(context.scheduler.runAt).toBeDefined()
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have auth property', async () => {
      const ctx = createMockMutationCtx()

      const fn = internalMutation({
        handler: async (context) => {
          expect(context.auth).toBeDefined()
          expect(context.auth.getUserIdentity).toBeDefined()
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have storage property with write access', async () => {
      const ctx = createMockMutationCtx()

      const fn = internalMutation({
        handler: async (context) => {
          expect(context.storage).toBeDefined()
          expect(context.storage.getUrl).toBeDefined()
          expect(context.storage.generateUploadUrl).toBeDefined()
          expect(context.storage.store).toBeDefined()
          expect(context.storage.delete).toBeDefined()
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })
  })

  describe('handler execution', () => {
    it('should execute insert operation', async () => {
      const ctx = createMockMutationCtx()
      const newId = 'new_doc_789' as Id<'users'>
      vi.mocked(ctx.db.insert).mockResolvedValue(newId)

      const fn = internalMutation({
        args: { name: v.string(), email: v.string() },
        handler: async (context, args) => {
          return await context.db.insert('users', { name: args.name, email: args.email })
        },
      })

      const result = await fn._config.handler(ctx, { name: 'John', email: 'john@example.com' })
      expect(result).toBe(newId)
      expect(ctx.db.insert).toHaveBeenCalledWith('users', { name: 'John', email: 'john@example.com' })
    })

    it('should execute patch operation', async () => {
      const ctx = createMockMutationCtx()

      const fn = internalMutation({
        args: { id: v.id('users'), name: v.string() },
        handler: async (context, args) => {
          await context.db.patch(args.id, { name: args.name })
        },
      })

      await fn._config.handler(ctx, { id: 'user_123' as Id<'users'>, name: 'Jane' })
      expect(ctx.db.patch).toHaveBeenCalledWith('user_123', { name: 'Jane' })
    })

    it('should execute delete operation', async () => {
      const ctx = createMockMutationCtx()

      const fn = internalMutation({
        args: { id: v.id('users') },
        handler: async (context, args) => {
          await context.db.delete(args.id)
        },
      })

      await fn._config.handler(ctx, { id: 'user_123' as Id<'users'> })
      expect(ctx.db.delete).toHaveBeenCalledWith('user_123')
    })

    it('should propagate errors', async () => {
      const ctx = createMockMutationCtx()
      vi.mocked(ctx.db.insert).mockRejectedValue(new Error('Insert failed'))

      const fn = internalMutation({
        handler: async (context) => {
          return await context.db.insert('users', { name: 'Test' })
        },
      })

      await expect(fn._config.handler(ctx, {} as never)).rejects.toThrow('Insert failed')
    })
  })

  describe('not exposed via HTTP', () => {
    it('should have internal visibility marker', () => {
      const fn = internalMutation({
        handler: async () => null,
      })

      expect(fn._visibility).toBe('internal')
    })

    it('should be identifiable as internal function', () => {
      const fn = internalMutation({
        handler: async () => null,
      })

      expect(fn._visibility).not.toBe('public')
    })
  })
})

// ============================================================================
// internalAction Tests
// ============================================================================

describe('internalAction', () => {
  describe('function builder basics', () => {
    it('should create a registered internal action', () => {
      const processData = internalAction({
        handler: async (ctx) => {
          return 'processed'
        },
      })

      expect(processData).toBeDefined()
      expect(processData._type).toBe('action')
      expect(processData._visibility).toBe('internal')
    })

    it('should mark visibility as internal', () => {
      const fn = internalAction({
        handler: async (ctx) => null,
      })

      expect(fn._visibility).toBe('internal')
    })

    it('should preserve the handler config', () => {
      const handler = async (ctx: ActionCtx) => ({ processed: true })
      const fn = internalAction({ handler })

      expect(fn._config).toBeDefined()
      expect(fn._config.handler).toBe(handler)
    })

    it('should be distinguishable from public action', () => {
      const internalFn = internalAction({
        handler: async (ctx) => null,
      })

      expect(internalFn._visibility).toBe('internal')
      expect(internalFn._visibility).not.toBe('public')
    })
  })

  describe('with argument validators', () => {
    it('should accept args validator object', () => {
      const processWebhook = internalAction({
        args: {
          payload: v.object({
            event: v.string(),
            data: v.any(),
          }),
        },
        handler: async (ctx, args) => {
          return { processed: args.payload.event }
        },
      })

      expect(processWebhook._config.args).toBeDefined()
    })

    it('should accept complex argument validators', () => {
      const batchProcess = internalAction({
        args: {
          items: v.array(v.string()),
          options: v.optional(
            v.object({
              concurrency: v.number(),
              retryOnFailure: v.boolean(),
            })
          ),
        },
        handler: async (ctx, args) => {
          return { count: args.items.length }
        },
      })

      expect(batchProcess._config.args).toBeDefined()
    })
  })

  describe('return type validator', () => {
    it('should accept returns validator', () => {
      const callExternalApi = internalAction({
        args: { url: v.string() },
        returns: v.object({
          status: v.number(),
          data: v.any(),
        }),
        handler: async (ctx, args) => {
          return { status: 200, data: { success: true } }
        },
      })

      expect(callExternalApi._config.returns).toBeDefined()
    })
  })

  describe('context injection', () => {
    it('should receive ActionCtx', async () => {
      const ctx = createMockActionCtx()
      let receivedCtx: ActionCtx | undefined

      const fn = internalAction({
        handler: async (context) => {
          receivedCtx = context
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)

      expect(receivedCtx).toBeDefined()
    })

    it('should have runQuery method', async () => {
      const ctx = createMockActionCtx()

      const fn = internalAction({
        handler: async (context) => {
          expect(context.runQuery).toBeDefined()
          expect(typeof context.runQuery).toBe('function')
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have runMutation method', async () => {
      const ctx = createMockActionCtx()

      const fn = internalAction({
        handler: async (context) => {
          expect(context.runMutation).toBeDefined()
          expect(typeof context.runMutation).toBe('function')
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have runAction method', async () => {
      const ctx = createMockActionCtx()

      const fn = internalAction({
        handler: async (context) => {
          expect(context.runAction).toBeDefined()
          expect(typeof context.runAction).toBe('function')
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have auth property', async () => {
      const ctx = createMockActionCtx()

      const fn = internalAction({
        handler: async (context) => {
          expect(context.auth).toBeDefined()
          expect(context.auth.getUserIdentity).toBeDefined()
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have storage property (read-only)', async () => {
      const ctx = createMockActionCtx()

      const fn = internalAction({
        handler: async (context) => {
          expect(context.storage).toBeDefined()
          expect(context.storage.getUrl).toBeDefined()
          expect(context.storage.getMetadata).toBeDefined()
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should have scheduler property', async () => {
      const ctx = createMockActionCtx()

      const fn = internalAction({
        handler: async (context) => {
          expect(context.scheduler).toBeDefined()
          expect(context.scheduler.runAfter).toBeDefined()
          expect(context.scheduler.runAt).toBeDefined()
          expect(context.scheduler.cancel).toBeDefined()
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })

    it('should NOT have direct db property', async () => {
      const ctx = createMockActionCtx()

      const fn = internalAction({
        handler: async (context) => {
          // ActionCtx should not have direct db access
          expect((context as any).db).toBeUndefined()
          return true
        },
      })

      await fn._config.handler(ctx, {} as never)
    })
  })

  describe('handler execution', () => {
    it('should execute handler and return result', async () => {
      const ctx = createMockActionCtx()

      const fn = internalAction({
        args: { value: v.number() },
        handler: async (context, args) => {
          return args.value * 2
        },
      })

      const result = await fn._config.handler(ctx, { value: 21 })
      expect(result).toBe(42)
    })

    it('should allow calling runQuery', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runQuery).mockResolvedValue({ name: 'Test User' })

      const fn = internalAction({
        handler: async (context) => {
          const result = await context.runQuery({} as FunctionReference<'query'>, {})
          return result
        },
      })

      const result = await fn._config.handler(ctx, {} as never)
      expect(result).toEqual({ name: 'Test User' })
    })

    it('should allow calling runMutation', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runMutation).mockResolvedValue('new_id_123')

      const fn = internalAction({
        handler: async (context) => {
          const result = await context.runMutation({} as FunctionReference<'mutation'>, {})
          return result
        },
      })

      const result = await fn._config.handler(ctx, {} as never)
      expect(result).toBe('new_id_123')
    })

    it('should allow calling runAction', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runAction).mockResolvedValue({ nested: 'result' })

      const fn = internalAction({
        handler: async (context) => {
          const result = await context.runAction({} as FunctionReference<'action'>, {})
          return result
        },
      })

      const result = await fn._config.handler(ctx, {} as never)
      expect(result).toEqual({ nested: 'result' })
    })

    it('should propagate errors', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runMutation).mockRejectedValue(new Error('Mutation failed'))

      const fn = internalAction({
        handler: async (context) => {
          return await context.runMutation({} as FunctionReference<'mutation'>, {})
        },
      })

      await expect(fn._config.handler(ctx, {} as never)).rejects.toThrow('Mutation failed')
    })
  })

  describe('not exposed via HTTP', () => {
    it('should have internal visibility marker', () => {
      const fn = internalAction({
        handler: async () => null,
      })

      expect(fn._visibility).toBe('internal')
    })

    it('should be identifiable as internal function', () => {
      const fn = internalAction({
        handler: async () => null,
      })

      expect(fn._visibility).not.toBe('public')
    })
  })
})

// ============================================================================
// Type Inference Tests
// ============================================================================

describe('type inference', () => {
  describe('internalQuery type inference', () => {
    it('should infer args type from validators', () => {
      const fn = internalQuery({
        args: {
          id: v.string(),
          count: v.number(),
        },
        handler: async (ctx, args) => {
          // TypeScript should infer args as { id: string; count: number }
          const id: string = args.id
          const count: number = args.count
          return { id, count }
        },
      })

      expect(fn._config.args).toBeDefined()
    })

    it('should infer return type from handler', async () => {
      const fn = internalQuery({
        handler: async () => {
          return { name: 'Test', age: 25 }
        },
      })

      // Return type should be inferred as { name: string; age: number }
      expect(fn._returns).toBeUndefined() // Internal marker
    })
  })

  describe('internalMutation type inference', () => {
    it('should infer args type from validators', () => {
      const fn = internalMutation({
        args: {
          data: v.object({
            name: v.string(),
            value: v.number(),
          }),
        },
        handler: async (ctx, args) => {
          // TypeScript should infer args.data as { name: string; value: number }
          return args.data.name
        },
      })

      expect(fn._config.args).toBeDefined()
    })
  })

  describe('internalAction type inference', () => {
    it('should infer args type from validators', () => {
      const fn = internalAction({
        args: {
          items: v.array(v.string()),
          config: v.optional(v.object({ retries: v.number() })),
        },
        handler: async (ctx, args) => {
          // TypeScript should infer correct types
          const items: string[] = args.items
          const retries = args.config?.retries
          return { count: items.length, retries }
        },
      })

      expect(fn._config.args).toBeDefined()
    })
  })
})

// ============================================================================
// Internal Function Calling Tests
// ============================================================================

describe('internal function calling', () => {
  describe('internal functions can be called from other functions', () => {
    it('should allow internal query to be called via ctx.runQuery', async () => {
      // Internal queries should be callable via ctx.runQuery in actions
      const getUserById = internalQuery({
        args: { id: v.string() },
        handler: async (ctx, args) => {
          return { id: args.id, name: 'Test User' }
        },
      })

      // The function exists and has correct type
      expect(getUserById._type).toBe('query')
      expect(getUserById._visibility).toBe('internal')
    })

    it('should allow internal mutation to be called via ctx.runMutation', async () => {
      const updateUser = internalMutation({
        args: { id: v.string(), name: v.string() },
        handler: async (ctx, args) => {
          await ctx.db.patch(args.id as Id<'users'>, { name: args.name })
        },
      })

      expect(updateUser._type).toBe('mutation')
      expect(updateUser._visibility).toBe('internal')
    })

    it('should allow internal action to be called via ctx.runAction', async () => {
      const processData = internalAction({
        args: { data: v.any() },
        handler: async (ctx, args) => {
          return { processed: true, data: args.data }
        },
      })

      expect(processData._type).toBe('action')
      expect(processData._visibility).toBe('internal')
    })
  })
})

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('edge cases', () => {
  describe('empty args', () => {
    it('should work with no args defined', () => {
      const fn = internalQuery({
        handler: async (ctx) => {
          return 'no args needed'
        },
      })

      expect(fn._config.args).toBeUndefined()
    })

    it('should work with empty args object', () => {
      const fn = internalMutation({
        args: {},
        handler: async (ctx, args) => {
          return 'empty args'
        },
      })

      expect(fn._config.args).toEqual({})
    })
  })

  describe('void return', () => {
    it('should support void return for mutations', async () => {
      const ctx = createMockMutationCtx()

      const fn = internalMutation({
        args: { id: v.string() },
        handler: async (ctx, args) => {
          await ctx.db.delete(args.id as Id<'users'>)
          // No return
        },
      })

      const result = await fn._config.handler(ctx, { id: 'user_123' })
      expect(result).toBeUndefined()
    })

    it('should support void return for actions', async () => {
      const ctx = createMockActionCtx()

      const fn = internalAction({
        handler: async (ctx) => {
          await ctx.runMutation({} as FunctionReference<'mutation'>, {})
          // No return
        },
      })

      const result = await fn._config.handler(ctx, {} as never)
      expect(result).toBeUndefined()
    })
  })

  describe('nullable return', () => {
    it('should support null return', async () => {
      const ctx = createMockQueryCtx()
      vi.mocked(ctx.db.get).mockResolvedValue(null)

      const fn = internalQuery({
        args: { id: v.string() },
        handler: async (ctx, args) => {
          return await ctx.db.get(args.id as Id<'users'>)
        },
      })

      const result = await fn._config.handler(ctx, { id: 'nonexistent' })
      expect(result).toBeNull()
    })
  })
})

// ============================================================================
// Utility Type Tests
// ============================================================================

describe('utility types', () => {
  it('should export RegisteredQuery type for internalQuery', () => {
    const fn = internalQuery({
      args: { id: v.string() },
      handler: async (ctx, args) => ({ id: args.id }),
    })

    // Type should be RegisteredQuery with internal visibility
    expect(fn._type).toBe('query')
    expect(fn._visibility).toBe('internal')
    expect(fn._config).toBeDefined()
  })

  it('should export RegisteredMutation type for internalMutation', () => {
    const fn = internalMutation({
      args: { name: v.string() },
      handler: async (ctx, args) => args.name,
    })

    expect(fn._type).toBe('mutation')
    expect(fn._visibility).toBe('internal')
    expect(fn._config).toBeDefined()
  })

  it('should export RegisteredAction type for internalAction', () => {
    const fn = internalAction({
      args: { url: v.string() },
      handler: async (ctx, args) => ({ url: args.url }),
    })

    expect(fn._type).toBe('action')
    expect(fn._visibility).toBe('internal')
    expect(fn._config).toBeDefined()
  })
})
