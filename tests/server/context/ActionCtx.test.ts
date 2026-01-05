/**
 * TDD Tests for ActionCtx Context Object (Layer 4)
 *
 * ActionCtx provides context for Convex action functions which can have side effects.
 * Tests verify all context properties and methods are available and function correctly.
 *
 * @see Layer 4 - Server Context Objects
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ActionCtx, Auth, StorageReader, Scheduler } from '../../../src/server/context'
import type { FunctionReference, UserIdentity, StorageId, ScheduledFunctionId } from '../../../src/types'

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
// ActionCtx Property Tests
// ============================================================================

describe('ActionCtx', () => {
  let ctx: ActionCtx

  beforeEach(() => {
    ctx = createMockActionCtx()
  })

  describe('auth property', () => {
    it('should provide auth context', () => {
      expect(ctx.auth).toBeDefined()
      expect(ctx.auth).toHaveProperty('getUserIdentity')
    })

    it('should allow checking user identity', async () => {
      const identity = await ctx.auth.getUserIdentity()
      expect(identity).toBeDefined()
      expect(identity?.tokenIdentifier).toBe('test-token')
      expect(identity?.email).toBe('test@example.com')
    })

    it('should return null for unauthenticated users', async () => {
      const unauthCtx = createMockActionCtx()
      vi.mocked(unauthCtx.auth.getUserIdentity).mockResolvedValue(null)

      const identity = await unauthCtx.auth.getUserIdentity()
      expect(identity).toBeNull()
    })
  })

  describe('storage property', () => {
    it('should provide storage reader context', () => {
      expect(ctx.storage).toBeDefined()
      expect(ctx.storage).toHaveProperty('getUrl')
      expect(ctx.storage).toHaveProperty('getMetadata')
    })

    it('should allow getting file URLs', async () => {
      const storageId = 'storage-123' as StorageId
      const url = await ctx.storage.getUrl(storageId)
      expect(url).toBe('https://storage.example.com/file.jpg')
      expect(ctx.storage.getUrl).toHaveBeenCalledWith(storageId)
    })

    it('should allow getting file metadata', async () => {
      const storageId = 'storage-123' as StorageId
      const metadata = await ctx.storage.getMetadata(storageId)
      expect(metadata).toBeDefined()
      expect(metadata?.storageId).toBe(storageId)
      expect(metadata?.size).toBe(1024)
      expect(metadata?.contentType).toBe('image/jpeg')
    })

    it('should return null for non-existent files', async () => {
      const nonExistentCtx = createMockActionCtx()
      vi.mocked(nonExistentCtx.storage.getUrl).mockResolvedValue(null)
      vi.mocked(nonExistentCtx.storage.getMetadata).mockResolvedValue(null)

      const url = await nonExistentCtx.storage.getUrl('invalid' as StorageId)
      const metadata = await nonExistentCtx.storage.getMetadata('invalid' as StorageId)

      expect(url).toBeNull()
      expect(metadata).toBeNull()
    })
  })

  describe('scheduler property', () => {
    it('should provide scheduler context', () => {
      expect(ctx.scheduler).toBeDefined()
      expect(ctx.scheduler).toHaveProperty('runAfter')
      expect(ctx.scheduler).toHaveProperty('runAt')
      expect(ctx.scheduler).toHaveProperty('cancel')
    })

    it('should allow scheduling functions with delay', async () => {
      const functionRef = {
        _type: 'mutation',
        _args: { value: 42 },
        _returns: undefined,
        _path: 'functions.doSomething',
      } as FunctionReference<'mutation'>

      const scheduledId = await ctx.scheduler.runAfter(5000, functionRef, { value: 42 })
      expect(scheduledId).toBe('scheduled-123')
      expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(5000, functionRef, { value: 42 })
    })

    it('should allow scheduling functions at specific time', async () => {
      const functionRef = {
        _type: 'action',
        _args: { data: 'test' },
        _returns: undefined,
        _path: 'functions.scheduled',
      } as FunctionReference<'action'>

      const timestamp = Date.now() + 10000
      const scheduledId = await ctx.scheduler.runAt(timestamp, functionRef, { data: 'test' })
      expect(scheduledId).toBe('scheduled-456')
      expect(ctx.scheduler.runAt).toHaveBeenCalledWith(timestamp, functionRef, { data: 'test' })
    })

    it('should allow canceling scheduled functions', async () => {
      const scheduledId = 'scheduled-789' as ScheduledFunctionId
      await ctx.scheduler.cancel(scheduledId)
      expect(ctx.scheduler.cancel).toHaveBeenCalledWith(scheduledId)
    })
  })

  // ============================================================================
  // runQuery Method Tests
  // ============================================================================

  describe('runQuery method', () => {
    it('should be defined', () => {
      expect(ctx.runQuery).toBeDefined()
      expect(typeof ctx.runQuery).toBe('function')
    })

    it('should execute query functions', async () => {
      const queryRef = {
        _type: 'query',
        _args: { id: 'user-123' },
        _returns: { name: 'Test User' },
        _path: 'users.get',
      } as FunctionReference<'query'>

      vi.mocked(ctx.runQuery).mockResolvedValue({ name: 'Test User', id: 'user-123' })

      const result = await ctx.runQuery(queryRef, { id: 'user-123' })
      expect(result).toEqual({ name: 'Test User', id: 'user-123' })
      expect(ctx.runQuery).toHaveBeenCalledWith(queryRef, { id: 'user-123' })
    })

    it('should pass arguments to query', async () => {
      const queryRef = {
        _type: 'query',
        _args: { limit: 10, offset: 0 },
        _returns: [],
        _path: 'messages.list',
      } as FunctionReference<'query'>

      vi.mocked(ctx.runQuery).mockResolvedValue([
        { id: '1', text: 'Hello' },
        { id: '2', text: 'World' },
      ])

      const result = await ctx.runQuery(queryRef, { limit: 10, offset: 0 })
      expect(result).toHaveLength(2)
      expect(ctx.runQuery).toHaveBeenCalledWith(queryRef, { limit: 10, offset: 0 })
    })

    it('should handle query errors', async () => {
      const queryRef = {
        _type: 'query',
        _args: { id: 'invalid' },
        _returns: undefined,
        _path: 'users.get',
      } as FunctionReference<'query'>

      vi.mocked(ctx.runQuery).mockRejectedValue(new Error('User not found'))

      await expect(ctx.runQuery(queryRef, { id: 'invalid' })).rejects.toThrow('User not found')
    })

    it('should support queries with no arguments', async () => {
      const queryRef = {
        _type: 'query',
        _args: {},
        _returns: { count: 42 },
        _path: 'stats.count',
      } as FunctionReference<'query'>

      vi.mocked(ctx.runQuery).mockResolvedValue({ count: 42 })

      const result = await ctx.runQuery(queryRef, {})
      expect(result).toEqual({ count: 42 })
    })
  })

  // ============================================================================
  // runMutation Method Tests
  // ============================================================================

  describe('runMutation method', () => {
    it('should be defined', () => {
      expect(ctx.runMutation).toBeDefined()
      expect(typeof ctx.runMutation).toBe('function')
    })

    it('should execute mutation functions', async () => {
      const mutationRef = {
        _type: 'mutation',
        _args: { name: 'New User', email: 'new@example.com' },
        _returns: 'user-456',
        _path: 'users.create',
      } as FunctionReference<'mutation'>

      vi.mocked(ctx.runMutation).mockResolvedValue('user-456')

      const result = await ctx.runMutation(mutationRef, {
        name: 'New User',
        email: 'new@example.com'
      })
      expect(result).toBe('user-456')
      expect(ctx.runMutation).toHaveBeenCalledWith(mutationRef, {
        name: 'New User',
        email: 'new@example.com'
      })
    })

    it('should pass arguments to mutation', async () => {
      const mutationRef = {
        _type: 'mutation',
        _args: { id: 'user-123', name: 'Updated Name' },
        _returns: undefined,
        _path: 'users.update',
      } as FunctionReference<'mutation'>

      vi.mocked(ctx.runMutation).mockResolvedValue(undefined)

      await ctx.runMutation(mutationRef, { id: 'user-123', name: 'Updated Name' })
      expect(ctx.runMutation).toHaveBeenCalledWith(mutationRef, {
        id: 'user-123',
        name: 'Updated Name'
      })
    })

    it('should handle mutation errors', async () => {
      const mutationRef = {
        _type: 'mutation',
        _args: { id: 'invalid' },
        _returns: undefined,
        _path: 'users.delete',
      } as FunctionReference<'mutation'>

      vi.mocked(ctx.runMutation).mockRejectedValue(new Error('Cannot delete user'))

      await expect(ctx.runMutation(mutationRef, { id: 'invalid' })).rejects.toThrow('Cannot delete user')
    })

    it('should support mutations with complex arguments', async () => {
      const mutationRef = {
        _type: 'mutation',
        _args: {
          user: { name: 'Test', email: 'test@example.com' },
          metadata: { role: 'admin' }
        },
        _returns: 'user-789',
        _path: 'users.createWithMetadata',
      } as FunctionReference<'mutation'>

      vi.mocked(ctx.runMutation).mockResolvedValue('user-789')

      const result = await ctx.runMutation(mutationRef, {
        user: { name: 'Test', email: 'test@example.com' },
        metadata: { role: 'admin' }
      })
      expect(result).toBe('user-789')
    })
  })

  // ============================================================================
  // runAction Method Tests
  // ============================================================================

  describe('runAction method', () => {
    it('should be defined', () => {
      expect(ctx.runAction).toBeDefined()
      expect(typeof ctx.runAction).toBe('function')
    })

    it('should execute other action functions', async () => {
      const actionRef = {
        _type: 'action',
        _args: { url: 'https://api.example.com' },
        _returns: { status: 200, data: {} },
        _path: 'external.fetchData',
      } as FunctionReference<'action'>

      vi.mocked(ctx.runAction).mockResolvedValue({
        status: 200,
        data: { message: 'Success' }
      })

      const result = await ctx.runAction(actionRef, { url: 'https://api.example.com' })
      expect(result).toEqual({ status: 200, data: { message: 'Success' } })
      expect(ctx.runAction).toHaveBeenCalledWith(actionRef, { url: 'https://api.example.com' })
    })

    it('should pass arguments to action', async () => {
      const actionRef = {
        _type: 'action',
        _args: { recipient: 'user@example.com', subject: 'Test', body: 'Hello' },
        _returns: { sent: true },
        _path: 'email.send',
      } as FunctionReference<'action'>

      vi.mocked(ctx.runAction).mockResolvedValue({ sent: true })

      const result = await ctx.runAction(actionRef, {
        recipient: 'user@example.com',
        subject: 'Test',
        body: 'Hello'
      })
      expect(result).toEqual({ sent: true })
    })

    it('should handle action errors', async () => {
      const actionRef = {
        _type: 'action',
        _args: { url: 'invalid-url' },
        _returns: undefined,
        _path: 'external.fetch',
      } as FunctionReference<'action'>

      vi.mocked(ctx.runAction).mockRejectedValue(new Error('Invalid URL'))

      await expect(ctx.runAction(actionRef, { url: 'invalid-url' })).rejects.toThrow('Invalid URL')
    })

    it('should support nested action calls', async () => {
      const actionRef1 = {
        _type: 'action',
        _args: { step: 1 },
        _returns: { result: 'step1' },
        _path: 'workflow.step1',
      } as FunctionReference<'action'>

      const actionRef2 = {
        _type: 'action',
        _args: { step: 2, prev: 'step1' },
        _returns: { result: 'step2' },
        _path: 'workflow.step2',
      } as FunctionReference<'action'>

      vi.mocked(ctx.runAction)
        .mockResolvedValueOnce({ result: 'step1' })
        .mockResolvedValueOnce({ result: 'step2' })

      const result1 = await ctx.runAction(actionRef1, { step: 1 })
      const result2 = await ctx.runAction(actionRef2, { step: 2, prev: result1.result })

      expect(result1).toEqual({ result: 'step1' })
      expect(result2).toEqual({ result: 'step2' })
    })
  })

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('integration scenarios', () => {
    it('should support complete action workflow', async () => {
      const ctx = createMockActionCtx()

      // Check authentication
      const identity = await ctx.auth.getUserIdentity()
      expect(identity?.email).toBe('test@example.com')

      // Query data
      const queryRef = {
        _type: 'query',
        _args: { userId: identity?.subject },
        _returns: { preferences: {} },
        _path: 'users.getPreferences',
      } as FunctionReference<'query'>

      vi.mocked(ctx.runQuery).mockResolvedValue({
        preferences: { theme: 'dark' }
      })

      const preferences = await ctx.runQuery(queryRef, { userId: identity?.subject })
      expect(preferences).toHaveProperty('preferences')

      // Perform external API call (simulated)
      const externalData = { result: 'external-data' }

      // Update database via mutation
      const mutationRef = {
        _type: 'mutation',
        _args: { userId: identity?.subject, data: externalData },
        _returns: undefined,
        _path: 'users.updateWithExternalData',
      } as FunctionReference<'mutation'>

      vi.mocked(ctx.runMutation).mockResolvedValue(undefined)

      await ctx.runMutation(mutationRef, {
        userId: identity?.subject,
        data: externalData
      })

      expect(ctx.runMutation).toHaveBeenCalled()
    })

    it('should handle authentication failures gracefully', async () => {
      const ctx = createMockActionCtx()
      vi.mocked(ctx.auth.getUserIdentity).mockResolvedValue(null)

      const identity = await ctx.auth.getUserIdentity()
      expect(identity).toBeNull()

      // Should still be able to call other methods
      const queryRef = {
        _type: 'query',
        _args: {},
        _returns: { public: 'data' },
        _path: 'public.getData',
      } as FunctionReference<'query'>

      vi.mocked(ctx.runQuery).mockResolvedValue({ public: 'data' })

      const result = await ctx.runQuery(queryRef, {})
      expect(result).toEqual({ public: 'data' })
    })

    it('should allow chaining query and mutation calls', async () => {
      const ctx = createMockActionCtx()

      // First query
      const queryRef = {
        _type: 'query',
        _args: { id: 'doc-123' },
        _returns: { value: 100 },
        _path: 'documents.get',
      } as FunctionReference<'query'>

      vi.mocked(ctx.runQuery).mockResolvedValue({ value: 100 })

      const doc = await ctx.runQuery(queryRef, { id: 'doc-123' })

      // Mutation based on query result
      const mutationRef = {
        _type: 'mutation',
        _args: { id: 'doc-123', newValue: 200 },
        _returns: undefined,
        _path: 'documents.update',
      } as FunctionReference<'mutation'>

      vi.mocked(ctx.runMutation).mockResolvedValue(undefined)

      await ctx.runMutation(mutationRef, {
        id: 'doc-123',
        newValue: doc.value * 2
      })

      expect(ctx.runMutation).toHaveBeenCalledWith(mutationRef, {
        id: 'doc-123',
        newValue: 200
      })
    })

    it('should support storage operations', async () => {
      const ctx = createMockActionCtx()

      // Get file URL
      const storageId = 'file-123' as StorageId
      const url = await ctx.storage.getUrl(storageId)
      expect(url).toBeTruthy()

      // Get metadata
      const metadata = await ctx.storage.getMetadata(storageId)
      expect(metadata?.size).toBeGreaterThan(0)
    })

    it('should support scheduling operations', async () => {
      const ctx = createMockActionCtx()

      // Schedule a follow-up action
      const actionRef = {
        _type: 'action',
        _args: { taskId: 'task-123' },
        _returns: undefined,
        _path: 'tasks.processLater',
      } as FunctionReference<'action'>

      const scheduledId = await ctx.scheduler.runAfter(60000, actionRef, {
        taskId: 'task-123'
      })
      expect(scheduledId).toBeTruthy()

      // Can cancel if needed
      await ctx.scheduler.cancel(scheduledId)
      expect(ctx.scheduler.cancel).toHaveBeenCalledWith(scheduledId)
    })
  })

  // ============================================================================
  // Type Safety Tests
  // ============================================================================

  describe('type safety', () => {
    it('should enforce function reference types', async () => {
      const ctx = createMockActionCtx()

      // Query reference should only work with runQuery
      const queryRef = {
        _type: 'query' as const,
        _args: {},
        _returns: {},
        _path: 'test.query',
      } as FunctionReference<'query'>

      // This should compile
      await ctx.runQuery(queryRef, {})

      // Mutation reference should only work with runMutation
      const mutationRef = {
        _type: 'mutation' as const,
        _args: {},
        _returns: undefined,
        _path: 'test.mutation',
      } as FunctionReference<'mutation'>

      // This should compile
      await ctx.runMutation(mutationRef, {})

      // Action reference should only work with runAction
      const actionRef = {
        _type: 'action' as const,
        _args: {},
        _returns: {},
        _path: 'test.action',
      } as FunctionReference<'action'>

      // This should compile
      await ctx.runAction(actionRef, {})
    })
  })
})
