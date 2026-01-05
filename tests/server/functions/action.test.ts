/**
 * TDD Tests for action() Function Builder (Layer 4)
 *
 * Tests the action() function builder that creates type-safe action handlers.
 * Actions can perform arbitrary operations including external API calls.
 *
 * @see Layer 4 - Server Function Builders
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { action, internalAction } from '../../../src/server/action'
import type { ActionConfig, RegisteredAction, ActionArgs, ActionReturns } from '../../../src/server/action'
import type { ActionCtx, Auth, StorageReader, Scheduler } from '../../../src/server/context'
import type { FunctionReference, UserIdentity, StorageId, ScheduledFunctionId } from '../../../src/types'
import { v } from '../../../src/values'

// ============================================================================
// Mock Implementations
// ============================================================================

/**
 * Create a mock Auth implementation for testing
 */
function createMockAuth(): Auth {
  return {
    getUserIdentity: vi.fn().mockResolvedValue({
      tokenIdentifier: 'test-token',
      subject: 'user-123',
      issuer: 'test-issuer',
      email: 'test@example.com',
      name: 'Test User',
    } as UserIdentity),
  }
}

/**
 * Create a mock StorageReader implementation for testing
 */
function createMockStorage(): StorageReader {
  return {
    getUrl: vi.fn().mockResolvedValue('https://storage.example.com/file.jpg'),
    getMetadata: vi.fn().mockResolvedValue({
      storageId: 'storage-123' as StorageId,
      sha256: 'abc123',
      size: 1024,
      contentType: 'image/jpeg',
    }),
  }
}

/**
 * Create a mock Scheduler implementation for testing
 */
function createMockScheduler(): Scheduler {
  return {
    runAfter: vi.fn().mockResolvedValue('scheduled-123' as ScheduledFunctionId),
    runAt: vi.fn().mockResolvedValue('scheduled-456' as ScheduledFunctionId),
    cancel: vi.fn().mockResolvedValue(undefined),
  }
}

/**
 * Create a mock ActionCtx for testing
 */
function createMockActionCtx(): ActionCtx {
  return {
    auth: createMockAuth(),
    storage: createMockStorage(),
    scheduler: createMockScheduler(),
    runQuery: vi.fn().mockResolvedValue({ result: 'query result' }),
    runMutation: vi.fn().mockResolvedValue({ result: 'mutation result' }),
    runAction: vi.fn().mockResolvedValue({ result: 'action result' }),
    vectorSearch: vi.fn().mockResolvedValue([]),
  }
}

// ============================================================================
// action() Function Signature Tests
// ============================================================================

describe('action() function builder', () => {
  describe('function signature', () => {
    it('should create an action with handler only', () => {
      const myAction = action({
        handler: async (ctx) => {
          return { success: true }
        },
      })

      expect(myAction).toBeDefined()
      expect(myAction._type).toBe('action')
    })

    it('should create an action with args and handler', () => {
      const myAction = action({
        args: { name: v.string() },
        handler: async (ctx, args) => {
          return { greeting: `Hello, ${args.name}!` }
        },
      })

      expect(myAction).toBeDefined()
      expect(myAction._type).toBe('action')
    })

    it('should create an action with args, returns, and handler', () => {
      const myAction = action({
        args: { count: v.number() },
        returns: v.object({ doubled: v.number() }),
        handler: async (ctx, args) => {
          return { doubled: args.count * 2 }
        },
      })

      expect(myAction).toBeDefined()
      expect(myAction._type).toBe('action')
    })

    it('should mark action as public visibility', () => {
      const myAction = action({
        handler: async () => 'result',
      })

      expect(myAction._visibility).toBe('public')
    })

    it('should store the config object', () => {
      const config = {
        args: { value: v.string() },
        handler: async (ctx: ActionCtx, args: { value: string }) => args.value,
      }

      const myAction = action(config)

      expect(myAction._config).toBeDefined()
      expect(myAction._config.handler).toBe(config.handler)
    })
  })

  // ============================================================================
  // Type-Safe Arguments with Validators Tests
  // ============================================================================

  describe('type-safe arguments with validators', () => {
    it('should support string argument validators', () => {
      const myAction = action({
        args: { name: v.string() },
        handler: async (ctx, args) => {
          // args.name should be typed as string
          return args.name.toUpperCase()
        },
      })

      expect(myAction._config.args).toBeDefined()
    })

    it('should support number argument validators', () => {
      const myAction = action({
        args: { count: v.number() },
        handler: async (ctx, args) => {
          // args.count should be typed as number
          return args.count * 2
        },
      })

      expect(myAction._config.args).toBeDefined()
    })

    it('should support boolean argument validators', () => {
      const myAction = action({
        args: { active: v.boolean() },
        handler: async (ctx, args) => {
          return !args.active
        },
      })

      expect(myAction._config.args).toBeDefined()
    })

    it('should support object argument validators', () => {
      const myAction = action({
        args: {
          user: v.object({
            name: v.string(),
            age: v.number(),
          }),
        },
        handler: async (ctx, args) => {
          return `${args.user.name} is ${args.user.age} years old`
        },
      })

      expect(myAction._config.args).toBeDefined()
    })

    it('should support array argument validators', () => {
      const myAction = action({
        args: { items: v.array(v.string()) },
        handler: async (ctx, args) => {
          return args.items.length
        },
      })

      expect(myAction._config.args).toBeDefined()
    })

    it('should support optional argument validators', () => {
      const myAction = action({
        args: {
          required: v.string(),
          optional: v.optional(v.number()),
        },
        handler: async (ctx, args) => {
          return args.optional ?? 0
        },
      })

      expect(myAction._config.args).toBeDefined()
    })

    it('should support ID argument validators', () => {
      const myAction = action({
        args: { userId: v.id('users') },
        handler: async (ctx, args) => {
          return `User ID: ${args.userId}`
        },
      })

      expect(myAction._config.args).toBeDefined()
    })

    it('should support union argument validators', () => {
      const myAction = action({
        args: {
          value: v.union(v.string(), v.number()),
        },
        handler: async (ctx, args) => {
          return typeof args.value
        },
      })

      expect(myAction._config.args).toBeDefined()
    })

    it('should support multiple argument fields', () => {
      const myAction = action({
        args: {
          to: v.string(),
          subject: v.string(),
          body: v.string(),
          priority: v.optional(v.number()),
        },
        handler: async (ctx, args) => {
          return { sent: true, to: args.to }
        },
      })

      expect(myAction._config.args).toBeDefined()
      expect(Object.keys(myAction._config.args || {})).toHaveLength(4)
    })
  })

  // ============================================================================
  // ActionCtx Parameter Injection Tests
  // ============================================================================

  describe('ActionCtx parameter injection', () => {
    it('should provide auth context to handler', async () => {
      const ctx = createMockActionCtx()
      let receivedCtx: ActionCtx | null = null

      const myAction = action({
        handler: async (ctx) => {
          receivedCtx = ctx
          return await ctx.auth.getUserIdentity()
        },
      })

      // Simulate invoking the action
      const result = await myAction._config.handler(ctx, {})

      expect(receivedCtx).toBe(ctx)
      expect(result).toBeDefined()
      expect(result?.email).toBe('test@example.com')
    })

    it('should provide storage context to handler', async () => {
      const ctx = createMockActionCtx()

      const myAction = action({
        args: { storageId: v.string() },
        handler: async (ctx, args) => {
          const url = await ctx.storage.getUrl(args.storageId as StorageId)
          return { url }
        },
      })

      const result = await myAction._config.handler(ctx, { storageId: 'storage-123' })

      expect(result.url).toBe('https://storage.example.com/file.jpg')
      expect(ctx.storage.getUrl).toHaveBeenCalledWith('storage-123')
    })

    it('should provide scheduler context to handler', async () => {
      const ctx = createMockActionCtx()

      const myAction = action({
        handler: async (ctx) => {
          const functionRef = {
            _type: 'action' as const,
            _args: {},
            _returns: undefined,
            _path: 'test.action',
          } as FunctionReference<'action'>

          return await ctx.scheduler.runAfter(5000, functionRef, {})
        },
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result).toBe('scheduled-123')
      expect(ctx.scheduler.runAfter).toHaveBeenCalled()
    })

    it('should provide runQuery method to handler', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runQuery).mockResolvedValue({ data: 'from query' })

      const myAction = action({
        handler: async (ctx) => {
          const queryRef = {
            _type: 'query' as const,
            _args: {},
            _returns: { data: '' },
            _path: 'test.query',
          } as FunctionReference<'query'>

          return await ctx.runQuery(queryRef, {})
        },
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result).toEqual({ data: 'from query' })
      expect(ctx.runQuery).toHaveBeenCalled()
    })

    it('should provide runMutation method to handler', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runMutation).mockResolvedValue('mutation-id-123')

      const myAction = action({
        handler: async (ctx) => {
          const mutationRef = {
            _type: 'mutation' as const,
            _args: { name: 'test' },
            _returns: '',
            _path: 'test.create',
          } as FunctionReference<'mutation'>

          return await ctx.runMutation(mutationRef, { name: 'test' })
        },
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result).toBe('mutation-id-123')
      expect(ctx.runMutation).toHaveBeenCalled()
    })

    it('should provide runAction method to handler', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runAction).mockResolvedValue({ processed: true })

      const myAction = action({
        handler: async (ctx) => {
          const actionRef = {
            _type: 'action' as const,
            _args: { data: 'input' },
            _returns: { processed: false },
            _path: 'test.process',
          } as FunctionReference<'action'>

          return await ctx.runAction(actionRef, { data: 'input' })
        },
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result).toEqual({ processed: true })
      expect(ctx.runAction).toHaveBeenCalled()
    })

    it('should provide vectorSearch method to handler', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.vectorSearch).mockResolvedValue([
        { _id: 'doc-1' as any, _score: 0.95 },
        { _id: 'doc-2' as any, _score: 0.85 },
      ])

      const myAction = action({
        args: { embedding: v.array(v.number()) },
        handler: async (ctx, args) => {
          return await ctx.vectorSearch('documents', 'by_embedding', {
            vector: args.embedding,
            limit: 10,
          })
        },
      })

      const result = await myAction._config.handler(ctx, { embedding: [0.1, 0.2, 0.3] })

      expect(result).toHaveLength(2)
      expect(result[0]._score).toBe(0.95)
      expect(ctx.vectorSearch).toHaveBeenCalledWith('documents', 'by_embedding', {
        vector: [0.1, 0.2, 0.3],
        limit: 10,
      })
    })
  })

  // ============================================================================
  // Return Type Inference Tests
  // ============================================================================

  describe('return type inference', () => {
    it('should infer void return type', () => {
      const myAction = action({
        handler: async () => {
          // No return
        },
      })

      expect(myAction._type).toBe('action')
    })

    it('should infer primitive return types', () => {
      const stringAction = action({
        handler: async () => 'hello',
      })

      const numberAction = action({
        handler: async () => 42,
      })

      const booleanAction = action({
        handler: async () => true,
      })

      expect(stringAction._type).toBe('action')
      expect(numberAction._type).toBe('action')
      expect(booleanAction._type).toBe('action')
    })

    it('should infer object return types', () => {
      const myAction = action({
        handler: async () => ({
          success: true,
          data: { id: '123', name: 'Test' },
        }),
      })

      expect(myAction._type).toBe('action')
    })

    it('should infer array return types', () => {
      const myAction = action({
        handler: async () => [1, 2, 3],
      })

      expect(myAction._type).toBe('action')
    })

    it('should support explicit return type validator', () => {
      const myAction = action({
        returns: v.object({
          sent: v.boolean(),
          messageId: v.string(),
        }),
        handler: async () => ({
          sent: true,
          messageId: 'msg-123',
        }),
      })

      expect(myAction._config.returns).toBeDefined()
    })

    it('should handle Promise return types', async () => {
      const ctx = createMockActionCtx()

      const myAction = action({
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return { delayed: true }
        },
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result).toEqual({ delayed: true })
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should propagate errors from handler', async () => {
      const ctx = createMockActionCtx()

      const myAction = action({
        handler: async () => {
          throw new Error('Action failed')
        },
      })

      await expect(myAction._config.handler(ctx, {})).rejects.toThrow('Action failed')
    })

    it('should propagate errors from runQuery', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runQuery).mockRejectedValue(new Error('Query failed'))

      const myAction = action({
        handler: async (ctx) => {
          const queryRef = {
            _type: 'query' as const,
            _args: {},
            _returns: {},
            _path: 'test.query',
          } as FunctionReference<'query'>

          return await ctx.runQuery(queryRef, {})
        },
      })

      await expect(myAction._config.handler(ctx, {})).rejects.toThrow('Query failed')
    })

    it('should propagate errors from runMutation', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runMutation).mockRejectedValue(new Error('Mutation failed'))

      const myAction = action({
        handler: async (ctx) => {
          const mutationRef = {
            _type: 'mutation' as const,
            _args: {},
            _returns: undefined,
            _path: 'test.mutation',
          } as FunctionReference<'mutation'>

          return await ctx.runMutation(mutationRef, {})
        },
      })

      await expect(myAction._config.handler(ctx, {})).rejects.toThrow('Mutation failed')
    })

    it('should propagate errors from runAction', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runAction).mockRejectedValue(new Error('Nested action failed'))

      const myAction = action({
        handler: async (ctx) => {
          const actionRef = {
            _type: 'action' as const,
            _args: {},
            _returns: {},
            _path: 'test.nestedAction',
          } as FunctionReference<'action'>

          return await ctx.runAction(actionRef, {})
        },
      })

      await expect(myAction._config.handler(ctx, {})).rejects.toThrow('Nested action failed')
    })

    it('should handle authentication errors', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.auth.getUserIdentity).mockResolvedValue(null)

      const myAction = action({
        handler: async (ctx) => {
          const identity = await ctx.auth.getUserIdentity()
          if (!identity) {
            throw new Error('Not authenticated')
          }
          return identity
        },
      })

      await expect(myAction._config.handler(ctx, {})).rejects.toThrow('Not authenticated')
    })

    it('should handle external API errors gracefully', async () => {
      const ctx = createMockActionCtx()

      const myAction = action({
        args: { url: v.string() },
        handler: async (ctx, args) => {
          // Simulate external API call failure
          throw new Error(`Failed to fetch ${args.url}: Network error`)
        },
      })

      await expect(
        myAction._config.handler(ctx, { url: 'https://api.example.com' })
      ).rejects.toThrow('Failed to fetch https://api.example.com: Network error')
    })
  })

  // ============================================================================
  // Action Configuration Options Tests
  // ============================================================================

  describe('action configuration options', () => {
    it('should support description in config', () => {
      // Note: description might be stored in _config or a separate field
      const config = {
        args: { value: v.string() },
        handler: async (ctx: ActionCtx, args: { value: string }) => args.value,
      }

      const myAction = action(config)

      expect(myAction._config).toBeDefined()
    })

    it('should support empty args object', () => {
      const myAction = action({
        args: {},
        handler: async () => 'no args needed',
      })

      expect(myAction._config.args).toEqual({})
    })

    it('should support handler as the only config', () => {
      const myAction = action({
        handler: async () => 'minimal action',
      })

      expect(myAction._config.handler).toBeDefined()
      expect(myAction._config.args).toBeUndefined()
    })
  })

  // ============================================================================
  // internalAction() Tests
  // ============================================================================

  describe('internalAction() function builder', () => {
    it('should create an internal action', () => {
      const myAction = internalAction({
        handler: async () => 'internal result',
      })

      expect(myAction).toBeDefined()
      expect(myAction._type).toBe('action')
    })

    it('should mark action as internal visibility', () => {
      const myAction = internalAction({
        handler: async () => 'internal only',
      })

      expect(myAction._visibility).toBe('internal')
    })

    it('should support args with internal actions', () => {
      const myAction = internalAction({
        args: {
          secret: v.string(),
          data: v.object({ key: v.string() }),
        },
        handler: async (ctx, args) => {
          return { processed: args.secret, key: args.data.key }
        },
      })

      expect(myAction._config.args).toBeDefined()
      expect(myAction._visibility).toBe('internal')
    })

    it('should provide full ActionCtx to internal actions', async () => {
      const ctx = createMockActionCtx()

      const myAction = internalAction({
        handler: async (ctx) => {
          // Internal actions have full context access
          const identity = await ctx.auth.getUserIdentity()

          const queryRef = {
            _type: 'query' as const,
            _args: {},
            _returns: {},
            _path: 'internal.query',
          } as FunctionReference<'query'>

          await ctx.runQuery(queryRef, {})

          return { user: identity?.email }
        },
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result.user).toBe('test@example.com')
      expect(ctx.runQuery).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // Type Utility Tests
  // ============================================================================

  describe('type utilities', () => {
    it('should correctly type ActionArgs', () => {
      const myAction = action({
        args: {
          name: v.string(),
          count: v.number(),
        },
        handler: async (ctx, args) => {
          return `${args.name}: ${args.count}`
        },
      })

      // Type test: ActionArgs should extract the args type
      type Args = ActionArgs<typeof myAction>
      // This is a compile-time check - the test passes if it compiles

      expect(myAction._config.args).toBeDefined()
    })

    it('should correctly type ActionReturns', () => {
      const myAction = action({
        handler: async () => ({ success: true, count: 42 }),
      })

      // Type test: ActionReturns should extract the return type
      type Returns = ActionReturns<typeof myAction>
      // This is a compile-time check - the test passes if it compiles

      expect(myAction._type).toBe('action')
    })
  })

  // ============================================================================
  // Real-World Use Case Tests
  // ============================================================================

  describe('real-world use cases', () => {
    it('should handle email sending action pattern', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runMutation).mockResolvedValue('email-record-id')

      const sendEmail = action({
        args: {
          to: v.string(),
          subject: v.string(),
          body: v.string(),
        },
        handler: async (ctx, args) => {
          // Simulate external API call
          const emailSent = true // Would be: await fetch('https://api.email.com/send', ...)

          // Record in database
          const mutationRef = {
            _type: 'mutation' as const,
            _args: { to: args.to, subject: args.subject, sentAt: 0 },
            _returns: '',
            _path: 'emails.record',
          } as FunctionReference<'mutation'>

          await ctx.runMutation(mutationRef, {
            to: args.to,
            subject: args.subject,
            sentAt: Date.now(),
          })

          return { sent: emailSent }
        },
      })

      const result = await sendEmail._config.handler(ctx, {
        to: 'user@example.com',
        subject: 'Hello',
        body: 'World',
      })

      expect(result.sent).toBe(true)
      expect(ctx.runMutation).toHaveBeenCalled()
    })

    it('should handle webhook processing action pattern', async () => {
      const ctx = createMockActionCtx()

      const processWebhook = internalAction({
        args: {
          payload: v.object({
            event: v.string(),
            data: v.object({
              id: v.string(),
              timestamp: v.number(),
            }),
          }),
        },
        handler: async (ctx, args) => {
          const { event, data } = args.payload

          // Process different event types
          if (event === 'user.created') {
            const mutationRef = {
              _type: 'mutation' as const,
              _args: { userId: data.id, createdAt: data.timestamp },
              _returns: undefined,
              _path: 'users.recordCreation',
            } as FunctionReference<'mutation'>

            await ctx.runMutation(mutationRef, {
              userId: data.id,
              createdAt: data.timestamp,
            })
          }

          return { processed: true, event }
        },
      })

      const result = await processWebhook._config.handler(ctx, {
        payload: {
          event: 'user.created',
          data: { id: 'user-123', timestamp: Date.now() },
        },
      })

      expect(result.processed).toBe(true)
      expect(result.event).toBe('user.created')
    })

    it('should handle file upload processing action pattern', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.storage.getMetadata).mockResolvedValue({
        storageId: 'file-123' as StorageId,
        sha256: 'abc123',
        size: 2048,
        contentType: 'image/png',
      })

      const processUpload = action({
        args: {
          storageId: v.string(),
        },
        handler: async (ctx, args) => {
          // Get file metadata
          const metadata = await ctx.storage.getMetadata(args.storageId as StorageId)

          if (!metadata) {
            throw new Error('File not found')
          }

          // Validate file
          if (metadata.size > 10 * 1024 * 1024) {
            throw new Error('File too large')
          }

          // Process file (e.g., generate thumbnail, extract text, etc.)
          const processed = {
            id: metadata.storageId,
            size: metadata.size,
            type: metadata.contentType,
          }

          // Record processing result
          const mutationRef = {
            _type: 'mutation' as const,
            _args: { fileId: '', size: 0, type: '' },
            _returns: '',
            _path: 'files.recordProcessed',
          } as FunctionReference<'mutation'>

          await ctx.runMutation(mutationRef, processed)

          return processed
        },
      })

      const result = await processUpload._config.handler(ctx, {
        storageId: 'file-123',
      })

      expect(result.size).toBe(2048)
      expect(result.type).toBe('image/png')
    })

    it('should handle scheduled job action pattern', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runQuery).mockResolvedValue([
        { _id: 'task-1', status: 'pending' },
        { _id: 'task-2', status: 'pending' },
      ])

      const processQueue = internalAction({
        handler: async (ctx) => {
          // Get pending tasks
          const queryRef = {
            _type: 'query' as const,
            _args: { status: 'pending' },
            _returns: [],
            _path: 'tasks.getPending',
          } as FunctionReference<'query'>

          const tasks = await ctx.runQuery(queryRef, { status: 'pending' })

          // Process each task
          let processed = 0
          for (const task of tasks) {
            try {
              // Process task (simulate work)
              processed++

              // Update task status
              const mutationRef = {
                _type: 'mutation' as const,
                _args: { taskId: '', status: '' },
                _returns: undefined,
                _path: 'tasks.updateStatus',
              } as FunctionReference<'mutation'>

              await ctx.runMutation(mutationRef, {
                taskId: task._id,
                status: 'completed',
              })
            } catch (error) {
              // Handle individual task failure
            }
          }

          // Schedule next run
          const selfRef = {
            _type: 'action' as const,
            _args: {},
            _returns: undefined,
            _path: 'tasks.processQueue',
          } as FunctionReference<'action'>

          await ctx.scheduler.runAfter(60000, selfRef, {})

          return { processed, total: tasks.length }
        },
      })

      const result = await processQueue._config.handler(ctx, {})

      expect(result.processed).toBe(2)
      expect(result.total).toBe(2)
      expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(60000, expect.anything(), {})
    })

    it('should handle AI inference action pattern', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.vectorSearch).mockResolvedValue([
        { _id: 'doc-1' as any, _score: 0.95 },
        { _id: 'doc-2' as any, _score: 0.87 },
      ])

      const searchSimilar = action({
        args: {
          query: v.string(),
          limit: v.optional(v.number()),
        },
        handler: async (ctx, args) => {
          // In real implementation, would call embedding API
          const embedding = [0.1, 0.2, 0.3, 0.4, 0.5]

          // Search for similar documents
          const results = await ctx.vectorSearch('documents', 'by_embedding', {
            vector: embedding,
            limit: args.limit ?? 10,
          })

          return {
            query: args.query,
            results: results.map((r) => ({
              id: r._id,
              score: r._score,
            })),
          }
        },
      })

      const result = await searchSimilar._config.handler(ctx, {
        query: 'What is Convex?',
        limit: 5,
      })

      expect(result.query).toBe('What is Convex?')
      expect(result.results).toHaveLength(2)
      expect(result.results[0].score).toBe(0.95)
    })
  })

  // ============================================================================
  // Edge Cases Tests
  // ============================================================================

  describe('edge cases', () => {
    it('should handle null return value', async () => {
      const ctx = createMockActionCtx()

      const myAction = action({
        handler: async () => null,
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result).toBeNull()
    })

    it('should handle undefined return value', async () => {
      const ctx = createMockActionCtx()

      const myAction = action({
        handler: async () => undefined,
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result).toBeUndefined()
    })

    it('should handle very large return objects', async () => {
      const ctx = createMockActionCtx()

      const myAction = action({
        handler: async () => {
          const largeArray = Array.from({ length: 10000 }, (_, i) => ({
            id: i,
            data: `item-${i}`,
          }))
          return { items: largeArray }
        },
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result.items).toHaveLength(10000)
    })

    it('should handle concurrent context operations', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.runQuery).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { data: 'query result' }
      })
      vi.mocked(ctx.runMutation).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return 'mutation-id'
      })

      const myAction = action({
        handler: async (ctx) => {
          const queryRef = {
            _type: 'query' as const,
            _args: {},
            _returns: {},
            _path: 'test.query',
          } as FunctionReference<'query'>

          const mutationRef = {
            _type: 'mutation' as const,
            _args: {},
            _returns: '',
            _path: 'test.mutation',
          } as FunctionReference<'mutation'>

          // Run operations concurrently
          const [queryResult, mutationResult] = await Promise.all([
            ctx.runQuery(queryRef, {}),
            ctx.runMutation(mutationRef, {}),
          ])

          return { queryResult, mutationResult }
        },
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result.queryResult).toEqual({ data: 'query result' })
      expect(result.mutationResult).toBe('mutation-id')
    })

    it('should handle deeply nested args', () => {
      const myAction = action({
        args: {
          level1: v.object({
            level2: v.object({
              level3: v.object({
                value: v.string(),
              }),
            }),
          }),
        },
        handler: async (ctx, args) => {
          return args.level1.level2.level3.value
        },
      })

      expect(myAction._config.args).toBeDefined()
    })

    it('should handle empty handler execution', async () => {
      const ctx = createMockActionCtx()

      const myAction = action({
        handler: async () => {
          // Empty handler
        },
      })

      const result = await myAction._config.handler(ctx, {})

      expect(result).toBeUndefined()
    })
  })
})
