/**
 * TDD Tests for MutationCtx Context Object
 *
 * Tests define the expected behavior for the MutationCtx context object
 * that is passed to mutation function handlers.
 *
 * MutationCtx provides:
 * - db: DatabaseWriter (extends DatabaseReader with write operations)
 * - auth: Auth for checking authentication
 * - storage: StorageWriter for file access
 * - scheduler: Scheduler for scheduling functions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { MutationCtx } from '../../../src/server/context'
import type { Id, StorageId, ScheduledFunctionId } from '../../../src/types'
import {
  createMutationCtx,
  validateMutationCtx,
  validateDatabaseWriter,
  validateStorageWriter,
  validateScheduler,
  validateAuth,
  createValidatedMutationCtx,
} from '../../../src/server/context/MutationCtx'

// ============================================================================
// Test Setup
// ============================================================================

describe('MutationCtx', () => {
  let ctx: MutationCtx
  let mockDb: any
  let mockAuth: any
  let mockStorage: any
  let mockScheduler: any

  beforeEach(() => {
    // Create mock DatabaseWriter
    mockDb = {
      // DatabaseReader methods
      get: vi.fn(),
      query: vi.fn(),
      normalizeId: vi.fn(),
      system: {
        get: vi.fn(),
        query: vi.fn(),
      },
      // DatabaseWriter methods
      insert: vi.fn(),
      patch: vi.fn(),
      replace: vi.fn(),
      delete: vi.fn(),
    }

    // Create mock Auth
    mockAuth = {
      getUserIdentity: vi.fn(),
    }

    // Create mock StorageWriter
    mockStorage = {
      // StorageReader methods
      getUrl: vi.fn(),
      getMetadata: vi.fn(),
      // StorageWriter methods
      generateUploadUrl: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
    }

    // Create mock Scheduler
    mockScheduler = {
      runAfter: vi.fn(),
      runAt: vi.fn(),
      cancel: vi.fn(),
    }

    // Create MutationCtx with mocks
    ctx = {
      db: mockDb,
      auth: mockAuth,
      storage: mockStorage,
      scheduler: mockScheduler,
    }
  })

  // ============================================================================
  // Context Structure Tests
  // ============================================================================

  describe('context structure', () => {
    it('should provide db property', () => {
      expect(ctx.db).toBeDefined()
      expect(ctx.db).toBe(mockDb)
    })

    it('should provide auth property', () => {
      expect(ctx.auth).toBeDefined()
      expect(ctx.auth).toBe(mockAuth)
    })

    it('should provide storage property', () => {
      expect(ctx.storage).toBeDefined()
      expect(ctx.storage).toBe(mockStorage)
    })

    it('should provide scheduler property', () => {
      expect(ctx.scheduler).toBeDefined()
      expect(ctx.scheduler).toBe(mockScheduler)
    })

    it('should have all required properties', () => {
      expect(Object.keys(ctx)).toContain('db')
      expect(Object.keys(ctx)).toContain('auth')
      expect(Object.keys(ctx)).toContain('storage')
      expect(Object.keys(ctx)).toContain('scheduler')
    })
  })

  // ============================================================================
  // DatabaseWriter Tests
  // ============================================================================

  describe('db (DatabaseWriter)', () => {
    describe('read operations (inherited from DatabaseReader)', () => {
      it('should support db.get() for reading documents', async () => {
        const userId = 'user_123' as Id<'users'>
        const mockUser = { _id: userId, _creationTime: Date.now(), name: 'John' }
        mockDb.get.mockResolvedValue(mockUser)

        const result = await ctx.db.get(userId)

        expect(mockDb.get).toHaveBeenCalledWith(userId)
        expect(result).toEqual(mockUser)
      })

      it('should support db.query() for building queries', () => {
        const mockQueryBuilder = { collect: vi.fn() }
        mockDb.query.mockReturnValue(mockQueryBuilder)

        const queryBuilder = ctx.db.query('users')

        expect(mockDb.query).toHaveBeenCalledWith('users')
        expect(queryBuilder).toBe(mockQueryBuilder)
      })

      it('should support db.normalizeId() for ID validation', () => {
        const userId = 'user_123' as Id<'users'>
        mockDb.normalizeId.mockReturnValue(userId)

        const result = ctx.db.normalizeId('users', 'user_123')

        expect(mockDb.normalizeId).toHaveBeenCalledWith('users', 'user_123')
        expect(result).toBe(userId)
      })

      it('should support db.system.get() for scheduled functions', async () => {
        const scheduledId = 'scheduled_123' as ScheduledFunctionId
        const mockScheduled = {
          _id: scheduledId,
          _creationTime: Date.now(),
          name: 'myFunction',
          args: [],
          scheduledTime: Date.now() + 1000,
          state: { kind: 'pending' as const },
        }
        mockDb.system.get.mockResolvedValue(mockScheduled)

        const result = await ctx.db.system.get(scheduledId)

        expect(mockDb.system.get).toHaveBeenCalledWith(scheduledId)
        expect(result).toEqual(mockScheduled)
      })
    })

    describe('write operations', () => {
      it('should support db.insert() for creating documents', async () => {
        const newId = 'user_456' as Id<'users'>
        mockDb.insert.mockResolvedValue(newId)

        const result = await ctx.db.insert('users', {
          name: 'Jane',
          email: 'jane@example.com',
        })

        expect(mockDb.insert).toHaveBeenCalledWith('users', {
          name: 'Jane',
          email: 'jane@example.com',
        })
        expect(result).toBe(newId)
      })

      it('should support db.patch() for partial updates', async () => {
        const userId = 'user_123' as Id<'users'>
        mockDb.patch.mockResolvedValue(undefined)

        await ctx.db.patch(userId, { name: 'John Updated' })

        expect(mockDb.patch).toHaveBeenCalledWith(userId, { name: 'John Updated' })
      })

      it('should support db.replace() for full document replacement', async () => {
        const userId = 'user_123' as Id<'users'>
        mockDb.replace.mockResolvedValue(undefined)

        await ctx.db.replace(userId, {
          name: 'John',
          email: 'john@example.com',
        })

        expect(mockDb.replace).toHaveBeenCalledWith(userId, {
          name: 'John',
          email: 'john@example.com',
        })
      })

      it('should support db.delete() for removing documents', async () => {
        const userId = 'user_123' as Id<'users'>
        mockDb.delete.mockResolvedValue(undefined)

        await ctx.db.delete(userId)

        expect(mockDb.delete).toHaveBeenCalledWith(userId)
      })

      it('should handle insert with complex document structure', async () => {
        const newId = 'post_789' as Id<'posts'>
        mockDb.insert.mockResolvedValue(newId)

        const result = await ctx.db.insert('posts', {
          title: 'My Post',
          body: 'Post content',
          tags: ['tech', 'news'],
          metadata: {
            views: 0,
            likes: 0,
          },
        })

        expect(mockDb.insert).toHaveBeenCalledWith('posts', {
          title: 'My Post',
          body: 'Post content',
          tags: ['tech', 'news'],
          metadata: {
            views: 0,
            likes: 0,
          },
        })
        expect(result).toBe(newId)
      })

      it('should handle patch with nested field updates', async () => {
        const postId = 'post_789' as Id<'posts'>
        mockDb.patch.mockResolvedValue(undefined)

        await ctx.db.patch(postId, {
          'metadata.views': 10,
          'metadata.likes': 5,
        })

        expect(mockDb.patch).toHaveBeenCalledWith(postId, {
          'metadata.views': 10,
          'metadata.likes': 5,
        })
      })
    })

    describe('write operation error handling', () => {
      it('should propagate errors from db.insert()', async () => {
        const error = new Error('Insert failed')
        mockDb.insert.mockRejectedValue(error)

        await expect(
          ctx.db.insert('users', { name: 'Test' })
        ).rejects.toThrow('Insert failed')
      })

      it('should propagate errors from db.patch()', async () => {
        const error = new Error('Patch failed')
        mockDb.patch.mockRejectedValue(error)

        await expect(
          ctx.db.patch('user_123' as Id<'users'>, { name: 'Test' })
        ).rejects.toThrow('Patch failed')
      })

      it('should propagate errors from db.replace()', async () => {
        const error = new Error('Replace failed')
        mockDb.replace.mockRejectedValue(error)

        await expect(
          ctx.db.replace('user_123' as Id<'users'>, { name: 'Test' })
        ).rejects.toThrow('Replace failed')
      })

      it('should propagate errors from db.delete()', async () => {
        const error = new Error('Delete failed')
        mockDb.delete.mockRejectedValue(error)

        await expect(
          ctx.db.delete('user_123' as Id<'users'>)
        ).rejects.toThrow('Delete failed')
      })
    })
  })

  // ============================================================================
  // Auth Tests
  // ============================================================================

  describe('auth', () => {
    it('should support auth.getUserIdentity() when authenticated', async () => {
      const mockIdentity = {
        tokenIdentifier: 'oauth|123',
        subject: 'user123',
        issuer: 'https://auth.example.com',
        email: 'user@example.com',
        emailVerified: true,
        name: 'Test User',
      }
      mockAuth.getUserIdentity.mockResolvedValue(mockIdentity)

      const identity = await ctx.auth.getUserIdentity()

      expect(mockAuth.getUserIdentity).toHaveBeenCalled()
      expect(identity).toEqual(mockIdentity)
    })

    it('should return null from auth.getUserIdentity() when not authenticated', async () => {
      mockAuth.getUserIdentity.mockResolvedValue(null)

      const identity = await ctx.auth.getUserIdentity()

      expect(mockAuth.getUserIdentity).toHaveBeenCalled()
      expect(identity).toBe(null)
    })

    it('should support multiple calls to getUserIdentity()', async () => {
      const mockIdentity = {
        tokenIdentifier: 'oauth|123',
        subject: 'user123',
        issuer: 'https://auth.example.com',
      }
      mockAuth.getUserIdentity.mockResolvedValue(mockIdentity)

      const identity1 = await ctx.auth.getUserIdentity()
      const identity2 = await ctx.auth.getUserIdentity()

      expect(mockAuth.getUserIdentity).toHaveBeenCalledTimes(2)
      expect(identity1).toEqual(mockIdentity)
      expect(identity2).toEqual(mockIdentity)
    })
  })

  // ============================================================================
  // Storage Tests
  // ============================================================================

  describe('storage', () => {
    describe('read operations (inherited from StorageReader)', () => {
      it('should support storage.getUrl() for download URLs', async () => {
        const storageId = 'storage_123' as StorageId
        const url = 'https://storage.example.com/file.pdf'
        mockStorage.getUrl.mockResolvedValue(url)

        const result = await ctx.storage.getUrl(storageId)

        expect(mockStorage.getUrl).toHaveBeenCalledWith(storageId)
        expect(result).toBe(url)
      })

      it('should return null from storage.getUrl() for non-existent files', async () => {
        const storageId = 'storage_invalid' as StorageId
        mockStorage.getUrl.mockResolvedValue(null)

        const result = await ctx.storage.getUrl(storageId)

        expect(mockStorage.getUrl).toHaveBeenCalledWith(storageId)
        expect(result).toBe(null)
      })

      it('should support storage.getMetadata() for file metadata', async () => {
        const storageId = 'storage_123' as StorageId
        const metadata = {
          storageId,
          sha256: 'abc123',
          size: 1024,
          contentType: 'application/pdf',
        }
        mockStorage.getMetadata.mockResolvedValue(metadata)

        const result = await ctx.storage.getMetadata(storageId)

        expect(mockStorage.getMetadata).toHaveBeenCalledWith(storageId)
        expect(result).toEqual(metadata)
      })

      it('should return null from storage.getMetadata() for non-existent files', async () => {
        const storageId = 'storage_invalid' as StorageId
        mockStorage.getMetadata.mockResolvedValue(null)

        const result = await ctx.storage.getMetadata(storageId)

        expect(mockStorage.getMetadata).toHaveBeenCalledWith(storageId)
        expect(result).toBe(null)
      })
    })

    describe('write operations', () => {
      it('should support storage.generateUploadUrl() for client uploads', async () => {
        const uploadUrl = 'https://upload.example.com/upload-token'
        mockStorage.generateUploadUrl.mockResolvedValue(uploadUrl)

        const result = await ctx.storage.generateUploadUrl()

        expect(mockStorage.generateUploadUrl).toHaveBeenCalled()
        expect(result).toBe(uploadUrl)
      })

      it('should support storage.store() for direct blob uploads', async () => {
        const storageId = 'storage_456' as StorageId
        const blob = new Blob(['test content'], { type: 'text/plain' })
        mockStorage.store.mockResolvedValue(storageId)

        const result = await ctx.storage.store(blob)

        expect(mockStorage.store).toHaveBeenCalledWith(blob)
        expect(result).toBe(storageId)
      })

      it('should support storage.delete() for removing files', async () => {
        const storageId = 'storage_123' as StorageId
        mockStorage.delete.mockResolvedValue(undefined)

        await ctx.storage.delete(storageId)

        expect(mockStorage.delete).toHaveBeenCalledWith(storageId)
      })

      it('should handle storage.store() with different blob types', async () => {
        const storageId = 'storage_789' as StorageId
        const blob = new Blob(['{"data": "test"}'], { type: 'application/json' })
        mockStorage.store.mockResolvedValue(storageId)

        const result = await ctx.storage.store(blob)

        expect(mockStorage.store).toHaveBeenCalledWith(blob)
        expect(result).toBe(storageId)
      })
    })

    describe('storage error handling', () => {
      it('should propagate errors from storage.generateUploadUrl()', async () => {
        const error = new Error('Upload URL generation failed')
        mockStorage.generateUploadUrl.mockRejectedValue(error)

        await expect(ctx.storage.generateUploadUrl()).rejects.toThrow(
          'Upload URL generation failed'
        )
      })

      it('should propagate errors from storage.store()', async () => {
        const error = new Error('Storage failed')
        mockStorage.store.mockRejectedValue(error)

        await expect(
          ctx.storage.store(new Blob(['test']))
        ).rejects.toThrow('Storage failed')
      })

      it('should propagate errors from storage.delete()', async () => {
        const error = new Error('Delete failed')
        mockStorage.delete.mockRejectedValue(error)

        await expect(
          ctx.storage.delete('storage_123' as StorageId)
        ).rejects.toThrow('Delete failed')
      })
    })
  })

  // ============================================================================
  // Scheduler Tests
  // ============================================================================

  describe('scheduler', () => {
    it('should support scheduler.runAfter() with delay', async () => {
      const scheduledId = 'scheduled_456' as ScheduledFunctionId
      const mockFunctionRef: any = {
        _type: 'mutation',
        _args: { message: 'test' },
      }
      mockScheduler.runAfter.mockResolvedValue(scheduledId)

      const result = await ctx.scheduler.runAfter(
        5000,
        mockFunctionRef,
        { message: 'test' }
      )

      expect(mockScheduler.runAfter).toHaveBeenCalledWith(
        5000,
        mockFunctionRef,
        { message: 'test' }
      )
      expect(result).toBe(scheduledId)
    })

    it('should support scheduler.runAt() with timestamp', async () => {
      const scheduledId = 'scheduled_789' as ScheduledFunctionId
      const timestamp = Date.now() + 10000
      const mockFunctionRef: any = {
        _type: 'action',
        _args: { userId: 'user_123' },
      }
      mockScheduler.runAt.mockResolvedValue(scheduledId)

      const result = await ctx.scheduler.runAt(
        timestamp,
        mockFunctionRef,
        { userId: 'user_123' }
      )

      expect(mockScheduler.runAt).toHaveBeenCalledWith(
        timestamp,
        mockFunctionRef,
        { userId: 'user_123' }
      )
      expect(result).toBe(scheduledId)
    })

    it('should support scheduler.runAt() with Date object', async () => {
      const scheduledId = 'scheduled_101' as ScheduledFunctionId
      const futureDate = new Date(Date.now() + 10000)
      const mockFunctionRef: any = {
        _type: 'mutation',
        _args: {},
      }
      mockScheduler.runAt.mockResolvedValue(scheduledId)

      const result = await ctx.scheduler.runAt(
        futureDate,
        mockFunctionRef,
        {}
      )

      expect(mockScheduler.runAt).toHaveBeenCalledWith(
        futureDate,
        mockFunctionRef,
        {}
      )
      expect(result).toBe(scheduledId)
    })

    it('should support scheduler.cancel() for canceling scheduled functions', async () => {
      const scheduledId = 'scheduled_456' as ScheduledFunctionId
      mockScheduler.cancel.mockResolvedValue(undefined)

      await ctx.scheduler.cancel(scheduledId)

      expect(mockScheduler.cancel).toHaveBeenCalledWith(scheduledId)
    })

    it('should handle multiple scheduled functions', async () => {
      const scheduledId1 = 'scheduled_1' as ScheduledFunctionId
      const scheduledId2 = 'scheduled_2' as ScheduledFunctionId
      const mockFunctionRef: any = { _type: 'mutation', _args: {} }
      mockScheduler.runAfter.mockResolvedValueOnce(scheduledId1)
      mockScheduler.runAfter.mockResolvedValueOnce(scheduledId2)

      const result1 = await ctx.scheduler.runAfter(1000, mockFunctionRef, {})
      const result2 = await ctx.scheduler.runAfter(2000, mockFunctionRef, {})

      expect(mockScheduler.runAfter).toHaveBeenCalledTimes(2)
      expect(result1).toBe(scheduledId1)
      expect(result2).toBe(scheduledId2)
    })

    describe('scheduler error handling', () => {
      it('should propagate errors from scheduler.runAfter()', async () => {
        const error = new Error('Scheduling failed')
        mockScheduler.runAfter.mockRejectedValue(error)

        await expect(
          ctx.scheduler.runAfter(1000, {} as any, {})
        ).rejects.toThrow('Scheduling failed')
      })

      it('should propagate errors from scheduler.runAt()', async () => {
        const error = new Error('Scheduling failed')
        mockScheduler.runAt.mockRejectedValue(error)

        await expect(
          ctx.scheduler.runAt(Date.now(), {} as any, {})
        ).rejects.toThrow('Scheduling failed')
      })

      it('should propagate errors from scheduler.cancel()', async () => {
        const error = new Error('Cancel failed')
        mockScheduler.cancel.mockRejectedValue(error)

        await expect(
          ctx.scheduler.cancel('scheduled_123' as ScheduledFunctionId)
        ).rejects.toThrow('Cancel failed')
      })
    })
  })

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('integration scenarios', () => {
    it('should support typical mutation workflow with db and auth', async () => {
      const userId = 'user_123' as Id<'users'>
      const mockIdentity = {
        tokenIdentifier: 'oauth|123',
        subject: 'user123',
        issuer: 'https://auth.example.com',
      }
      mockAuth.getUserIdentity.mockResolvedValue(mockIdentity)
      mockDb.insert.mockResolvedValue('post_456' as Id<'posts'>)

      // Check authentication
      const identity = await ctx.auth.getUserIdentity()
      expect(identity).toBeTruthy()

      // Create a post
      const postId = await ctx.db.insert('posts', {
        authorId: userId,
        title: 'My Post',
        body: 'Content',
      })

      expect(postId).toBe('post_456')
      expect(mockAuth.getUserIdentity).toHaveBeenCalled()
      expect(mockDb.insert).toHaveBeenCalled()
    })

    it('should support mutation with storage and scheduler', async () => {
      const storageId = 'storage_123' as StorageId
      const scheduledId = 'scheduled_456' as ScheduledFunctionId
      const blob = new Blob(['document content'], { type: 'application/pdf' })

      mockStorage.store.mockResolvedValue(storageId)
      mockScheduler.runAfter.mockResolvedValue(scheduledId)
      mockDb.insert.mockResolvedValue('doc_789' as Id<'documents'>)

      // Store file
      const storedId = await ctx.storage.store(blob)
      expect(storedId).toBe(storageId)

      // Create document record
      const docId = await ctx.db.insert('documents', {
        storageId: storedId,
        name: 'document.pdf',
      })
      expect(docId).toBe('doc_789')

      // Schedule processing
      const scheduled = await ctx.scheduler.runAfter(
        1000,
        {} as any,
        { documentId: docId }
      )
      expect(scheduled).toBe(scheduledId)

      expect(mockStorage.store).toHaveBeenCalled()
      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockScheduler.runAfter).toHaveBeenCalled()
    })

    it('should support complex mutation with all context features', async () => {
      const userId = 'user_123' as Id<'users'>
      const existingUser = {
        _id: userId,
        _creationTime: Date.now(),
        name: 'John',
        postCount: 0,
      }

      mockAuth.getUserIdentity.mockResolvedValue({
        tokenIdentifier: 'oauth|123',
        subject: 'user123',
        issuer: 'https://auth.example.com',
      })
      mockDb.get.mockResolvedValue(existingUser)
      mockDb.insert.mockResolvedValue('post_456' as Id<'posts'>)
      mockDb.patch.mockResolvedValue(undefined)
      mockScheduler.runAfter.mockResolvedValue('scheduled_789' as ScheduledFunctionId)

      // Get identity
      const identity = await ctx.auth.getUserIdentity()
      expect(identity).toBeTruthy()

      // Get user
      const user = await ctx.db.get(userId)
      expect(user).toEqual(existingUser)

      // Create post
      const postId = await ctx.db.insert('posts', {
        authorId: userId,
        title: 'Post',
        body: 'Content',
      })
      expect(postId).toBe('post_456')

      // Update user post count
      await ctx.db.patch(userId, { postCount: 1 })

      // Schedule notification
      await ctx.scheduler.runAfter(5000, {} as any, { postId })

      expect(mockAuth.getUserIdentity).toHaveBeenCalled()
      expect(mockDb.get).toHaveBeenCalled()
      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockDb.patch).toHaveBeenCalled()
      expect(mockScheduler.runAfter).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // Type Safety Tests
  // ============================================================================

  describe('type safety', () => {
    it('should enforce MutationCtx type structure', () => {
      // This is primarily a compile-time check
      const validCtx: MutationCtx = {
        db: mockDb,
        auth: mockAuth,
        storage: mockStorage,
        scheduler: mockScheduler,
      }

      expect(validCtx).toBeDefined()
      expect(validCtx.db).toBeDefined()
      expect(validCtx.auth).toBeDefined()
      expect(validCtx.storage).toBeDefined()
      expect(validCtx.scheduler).toBeDefined()
    })

    it('should allow DatabaseWriter as db property', () => {
      const dbWriter = mockDb
      const validCtx: MutationCtx = {
        db: dbWriter,
        auth: mockAuth,
        storage: mockStorage,
        scheduler: mockScheduler,
      }

      expect(validCtx.db).toBe(dbWriter)
    })

    it('should allow StorageWriter as storage property', () => {
      const storageWriter = mockStorage
      const validCtx: MutationCtx = {
        db: mockDb,
        auth: mockAuth,
        storage: storageWriter,
        scheduler: mockScheduler,
      }

      expect(validCtx.storage).toBe(storageWriter)
    })
  })
})

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createMutationCtx', () => {
  let mockDb: any
  let mockAuth: any
  let mockStorage: any
  let mockScheduler: any

  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      query: vi.fn(),
      normalizeId: vi.fn(),
      system: { get: vi.fn(), query: vi.fn() },
      insert: vi.fn(),
      patch: vi.fn(),
      replace: vi.fn(),
      delete: vi.fn(),
    }

    mockAuth = {
      getUserIdentity: vi.fn(),
    }

    mockStorage = {
      getUrl: vi.fn(),
      getMetadata: vi.fn(),
      generateUploadUrl: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
    }

    mockScheduler = {
      runAfter: vi.fn(),
      runAt: vi.fn(),
      cancel: vi.fn(),
    }
  })

  it('should create a MutationCtx with all required properties', () => {
    const ctx = createMutationCtx(mockDb, mockAuth, mockStorage, mockScheduler)

    expect(ctx).toBeDefined()
    expect(ctx.db).toBe(mockDb)
    expect(ctx.auth).toBe(mockAuth)
    expect(ctx.storage).toBe(mockStorage)
    expect(ctx.scheduler).toBe(mockScheduler)
  })

  it('should create a context that satisfies MutationCtx type', () => {
    const ctx: MutationCtx = createMutationCtx(mockDb, mockAuth, mockStorage, mockScheduler)

    expect(ctx.db).toBeDefined()
    expect(ctx.auth).toBeDefined()
    expect(ctx.storage).toBeDefined()
    expect(ctx.scheduler).toBeDefined()
  })

  it('should preserve references to provided instances', () => {
    const ctx = createMutationCtx(mockDb, mockAuth, mockStorage, mockScheduler)

    expect(ctx.db).toBe(mockDb)
    expect(ctx.auth).toBe(mockAuth)
    expect(ctx.storage).toBe(mockStorage)
    expect(ctx.scheduler).toBe(mockScheduler)
  })
})

// ============================================================================
// Validation Tests
// ============================================================================

describe('validateMutationCtx', () => {
  let validCtx: MutationCtx

  beforeEach(() => {
    validCtx = {
      db: {
        get: vi.fn(),
        query: vi.fn(),
        normalizeId: vi.fn(),
        system: { get: vi.fn(), query: vi.fn() },
        insert: vi.fn(),
        patch: vi.fn(),
        replace: vi.fn(),
        delete: vi.fn(),
      },
      auth: {
        getUserIdentity: vi.fn(),
      },
      storage: {
        getUrl: vi.fn(),
        getMetadata: vi.fn(),
        generateUploadUrl: vi.fn(),
        store: vi.fn(),
        delete: vi.fn(),
      },
      scheduler: {
        runAfter: vi.fn(),
        runAt: vi.fn(),
        cancel: vi.fn(),
      },
    }
  })

  it('should validate a valid MutationCtx', () => {
    expect(() => validateMutationCtx(validCtx)).not.toThrow()
    expect(validateMutationCtx(validCtx)).toBe(true)
  })

  it('should reject null or undefined', () => {
    expect(() => validateMutationCtx(null)).toThrow('MutationCtx must be an object')
    expect(() => validateMutationCtx(undefined)).toThrow('MutationCtx must be an object')
  })

  it('should reject non-object values', () => {
    expect(() => validateMutationCtx('string')).toThrow('MutationCtx must be an object')
    expect(() => validateMutationCtx(123)).toThrow('MutationCtx must be an object')
  })

  it('should reject context missing db property', () => {
    const invalidCtx = { ...validCtx, db: undefined }
    expect(() => validateMutationCtx(invalidCtx)).toThrow('MutationCtx.db is required')
  })

  it('should reject context missing auth property', () => {
    const invalidCtx = { ...validCtx, auth: undefined }
    expect(() => validateMutationCtx(invalidCtx)).toThrow('MutationCtx.auth is required')
  })

  it('should reject context missing storage property', () => {
    const invalidCtx = { ...validCtx, storage: undefined }
    expect(() => validateMutationCtx(invalidCtx)).toThrow('MutationCtx.storage is required')
  })

  it('should reject context missing scheduler property', () => {
    const invalidCtx = { ...validCtx, scheduler: undefined }
    expect(() => validateMutationCtx(invalidCtx)).toThrow('MutationCtx.scheduler is required')
  })
})

describe('validateDatabaseWriter', () => {
  let validDb: any

  beforeEach(() => {
    validDb = {
      get: vi.fn(),
      query: vi.fn(),
      normalizeId: vi.fn(),
      system: { get: vi.fn(), query: vi.fn() },
      insert: vi.fn(),
      patch: vi.fn(),
      replace: vi.fn(),
      delete: vi.fn(),
    }
  })

  it('should validate a valid DatabaseWriter', () => {
    expect(() => validateDatabaseWriter(validDb)).not.toThrow()
    expect(validateDatabaseWriter(validDb)).toBe(true)
  })

  it('should reject non-object values', () => {
    expect(() => validateDatabaseWriter(null)).toThrow('DatabaseWriter must be an object')
  })

  it('should reject object missing get method', () => {
    const invalidDb = { ...validDb, get: undefined }
    expect(() => validateDatabaseWriter(invalidDb)).toThrow('DatabaseWriter.get must be a function')
  })

  it('should reject object missing query method', () => {
    const invalidDb = { ...validDb, query: undefined }
    expect(() => validateDatabaseWriter(invalidDb)).toThrow('DatabaseWriter.query must be a function')
  })

  it('should reject object missing insert method', () => {
    const invalidDb = { ...validDb, insert: undefined }
    expect(() => validateDatabaseWriter(invalidDb)).toThrow('DatabaseWriter.insert must be a function')
  })

  it('should reject object missing patch method', () => {
    const invalidDb = { ...validDb, patch: undefined }
    expect(() => validateDatabaseWriter(invalidDb)).toThrow('DatabaseWriter.patch must be a function')
  })

  it('should reject object missing replace method', () => {
    const invalidDb = { ...validDb, replace: undefined }
    expect(() => validateDatabaseWriter(invalidDb)).toThrow('DatabaseWriter.replace must be a function')
  })

  it('should reject object missing delete method', () => {
    const invalidDb = { ...validDb, delete: undefined }
    expect(() => validateDatabaseWriter(invalidDb)).toThrow('DatabaseWriter.delete must be a function')
  })
})

describe('validateStorageWriter', () => {
  let validStorage: any

  beforeEach(() => {
    validStorage = {
      getUrl: vi.fn(),
      getMetadata: vi.fn(),
      generateUploadUrl: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
    }
  })

  it('should validate a valid StorageWriter', () => {
    expect(() => validateStorageWriter(validStorage)).not.toThrow()
    expect(validateStorageWriter(validStorage)).toBe(true)
  })

  it('should reject non-object values', () => {
    expect(() => validateStorageWriter(null)).toThrow('StorageWriter must be an object')
  })

  it('should reject object missing getUrl method', () => {
    const invalidStorage = { ...validStorage, getUrl: undefined }
    expect(() => validateStorageWriter(invalidStorage)).toThrow('StorageWriter.getUrl must be a function')
  })

  it('should reject object missing getMetadata method', () => {
    const invalidStorage = { ...validStorage, getMetadata: undefined }
    expect(() => validateStorageWriter(invalidStorage)).toThrow('StorageWriter.getMetadata must be a function')
  })

  it('should reject object missing generateUploadUrl method', () => {
    const invalidStorage = { ...validStorage, generateUploadUrl: undefined }
    expect(() => validateStorageWriter(invalidStorage)).toThrow('StorageWriter.generateUploadUrl must be a function')
  })

  it('should reject object missing store method', () => {
    const invalidStorage = { ...validStorage, store: undefined }
    expect(() => validateStorageWriter(invalidStorage)).toThrow('StorageWriter.store must be a function')
  })

  it('should reject object missing delete method', () => {
    const invalidStorage = { ...validStorage, delete: undefined }
    expect(() => validateStorageWriter(invalidStorage)).toThrow('StorageWriter.delete must be a function')
  })
})

describe('validateScheduler', () => {
  let validScheduler: any

  beforeEach(() => {
    validScheduler = {
      runAfter: vi.fn(),
      runAt: vi.fn(),
      cancel: vi.fn(),
    }
  })

  it('should validate a valid Scheduler', () => {
    expect(() => validateScheduler(validScheduler)).not.toThrow()
    expect(validateScheduler(validScheduler)).toBe(true)
  })

  it('should reject non-object values', () => {
    expect(() => validateScheduler(null)).toThrow('Scheduler must be an object')
  })

  it('should reject object missing runAfter method', () => {
    const invalidScheduler = { ...validScheduler, runAfter: undefined }
    expect(() => validateScheduler(invalidScheduler)).toThrow('Scheduler.runAfter must be a function')
  })

  it('should reject object missing runAt method', () => {
    const invalidScheduler = { ...validScheduler, runAt: undefined }
    expect(() => validateScheduler(invalidScheduler)).toThrow('Scheduler.runAt must be a function')
  })

  it('should reject object missing cancel method', () => {
    const invalidScheduler = { ...validScheduler, cancel: undefined }
    expect(() => validateScheduler(invalidScheduler)).toThrow('Scheduler.cancel must be a function')
  })
})

describe('validateAuth', () => {
  let validAuth: any

  beforeEach(() => {
    validAuth = {
      getUserIdentity: vi.fn(),
    }
  })

  it('should validate a valid Auth', () => {
    expect(() => validateAuth(validAuth)).not.toThrow()
    expect(validateAuth(validAuth)).toBe(true)
  })

  it('should reject non-object values', () => {
    expect(() => validateAuth(null)).toThrow('Auth must be an object')
  })

  it('should reject object missing getUserIdentity method', () => {
    const invalidAuth = {}
    expect(() => validateAuth(invalidAuth)).toThrow('Auth.getUserIdentity must be a function')
  })
})

describe('createValidatedMutationCtx', () => {
  let mockDb: any
  let mockAuth: any
  let mockStorage: any
  let mockScheduler: any

  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      query: vi.fn(),
      normalizeId: vi.fn(),
      system: { get: vi.fn(), query: vi.fn() },
      insert: vi.fn(),
      patch: vi.fn(),
      replace: vi.fn(),
      delete: vi.fn(),
    }

    mockAuth = {
      getUserIdentity: vi.fn(),
    }

    mockStorage = {
      getUrl: vi.fn(),
      getMetadata: vi.fn(),
      generateUploadUrl: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
    }

    mockScheduler = {
      runAfter: vi.fn(),
      runAt: vi.fn(),
      cancel: vi.fn(),
    }
  })

  it('should create a valid MutationCtx when all components are valid', () => {
    const ctx = createValidatedMutationCtx(mockDb, mockAuth, mockStorage, mockScheduler)

    expect(ctx).toBeDefined()
    expect(ctx.db).toBe(mockDb)
    expect(ctx.auth).toBe(mockAuth)
    expect(ctx.storage).toBe(mockStorage)
    expect(ctx.scheduler).toBe(mockScheduler)
  })

  it('should throw when DatabaseWriter is invalid', () => {
    const invalidDb = { ...mockDb, insert: undefined }

    expect(() =>
      createValidatedMutationCtx(invalidDb, mockAuth, mockStorage, mockScheduler)
    ).toThrow('DatabaseWriter.insert must be a function')
  })

  it('should throw when Auth is invalid', () => {
    const invalidAuth = {}

    expect(() =>
      createValidatedMutationCtx(mockDb, invalidAuth as any, mockStorage, mockScheduler)
    ).toThrow('Auth.getUserIdentity must be a function')
  })

  it('should throw when StorageWriter is invalid', () => {
    const invalidStorage = { ...mockStorage, store: undefined }

    expect(() =>
      createValidatedMutationCtx(mockDb, mockAuth, invalidStorage, mockScheduler)
    ).toThrow('StorageWriter.store must be a function')
  })

  it('should throw when Scheduler is invalid', () => {
    const invalidScheduler = { ...mockScheduler, runAfter: undefined }

    expect(() =>
      createValidatedMutationCtx(mockDb, mockAuth, mockStorage, invalidScheduler)
    ).toThrow('Scheduler.runAfter must be a function')
  })
})
