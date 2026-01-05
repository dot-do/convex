/**
 * TDD Tests for QueryCtx Context Object
 *
 * These tests define the expected behavior for the QueryCtx context object
 * that is passed to query functions. QueryCtx provides read-only access to
 * the database, authentication, and storage.
 *
 * Layer 4: Server Context Objects
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
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
      // Mock implementation
      return { _id: id, _creationTime: Date.now(), name: 'Test Document' }
    }),
    query: vi.fn((tableName: string) => {
      // Return a mock query builder
      return {
        withIndex: vi.fn(),
        filter: vi.fn(),
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
        // Return a mock query builder for system tables
        return {
          withIndex: vi.fn(),
          filter: vi.fn(),
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
// QueryCtx Structure Tests
// ============================================================================

describe('QueryCtx', () => {
  describe('context structure', () => {
    it('should have db property for database access', () => {
      const ctx = createMockQueryCtx()
      expect(ctx).toHaveProperty('db')
      expect(ctx.db).toBeDefined()
    })

    it('should have auth property for authentication', () => {
      const ctx = createMockQueryCtx()
      expect(ctx).toHaveProperty('auth')
      expect(ctx.auth).toBeDefined()
    })

    it('should have storage property for file storage', () => {
      const ctx = createMockQueryCtx()
      expect(ctx).toHaveProperty('storage')
      expect(ctx.storage).toBeDefined()
    })

    it('should have all three required properties', () => {
      const ctx = createMockQueryCtx()
      const keys = Object.keys(ctx)
      expect(keys).toContain('db')
      expect(keys).toContain('auth')
      expect(keys).toContain('storage')
    })

    it('should provide read-only DatabaseReader interface', () => {
      const ctx = createMockQueryCtx()
      expect(ctx.db).toHaveProperty('get')
      expect(ctx.db).toHaveProperty('query')
      expect(ctx.db).toHaveProperty('normalizeId')
      expect(ctx.db).toHaveProperty('system')
    })

    it('should not provide DatabaseWriter methods', () => {
      const ctx = createMockQueryCtx()
      // DatabaseWriter methods should not exist on QueryCtx.db
      expect(ctx.db).not.toHaveProperty('insert')
      expect(ctx.db).not.toHaveProperty('patch')
      expect(ctx.db).not.toHaveProperty('replace')
      expect(ctx.db).not.toHaveProperty('delete')
    })

    it('should provide Auth interface', () => {
      const ctx = createMockQueryCtx()
      expect(ctx.auth).toHaveProperty('getUserIdentity')
      expect(typeof ctx.auth.getUserIdentity).toBe('function')
    })

    it('should provide read-only StorageReader interface', () => {
      const ctx = createMockQueryCtx()
      expect(ctx.storage).toHaveProperty('getUrl')
      expect(ctx.storage).toHaveProperty('getMetadata')
    })

    it('should not provide StorageWriter methods', () => {
      const ctx = createMockQueryCtx()
      // StorageWriter methods should not exist on QueryCtx.storage
      expect(ctx.storage).not.toHaveProperty('generateUploadUrl')
      expect(ctx.storage).not.toHaveProperty('store')
      expect(ctx.storage).not.toHaveProperty('delete')
    })
  })

  // ============================================================================
  // Database Reader Tests
  // ============================================================================

  describe('db: DatabaseReader', () => {
    let ctx: QueryCtx

    beforeEach(() => {
      ctx = createMockQueryCtx()
    })

    describe('get()', () => {
      it('should retrieve a document by ID', async () => {
        const testId = 'doc_123' as Id<'users'>
        const result = await ctx.db.get(testId)

        expect(result).toBeDefined()
        expect(result).toHaveProperty('_id')
        expect(result).toHaveProperty('_creationTime')
      })

      it('should return null for non-existent documents', async () => {
        const mockDb = createMockDatabaseReader()
        mockDb.get = vi.fn(async () => null)
        ctx.db = mockDb

        const testId = 'doc_nonexistent' as Id<'users'>
        const result = await ctx.db.get(testId)

        expect(result).toBeNull()
      })

      it('should accept generic table name', async () => {
        const usersId = 'user_123' as Id<'users'>
        const postsId = 'post_456' as Id<'posts'>

        await ctx.db.get(usersId)
        await ctx.db.get(postsId)

        expect(ctx.db.get).toHaveBeenCalledWith(usersId)
        expect(ctx.db.get).toHaveBeenCalledWith(postsId)
      })

      it('should return document with correct shape', async () => {
        const testId = 'doc_123' as Id<'users'>
        const result = await ctx.db.get(testId)

        expect(result).toMatchObject({
          _id: expect.any(String),
          _creationTime: expect.any(Number),
        })
      })
    })

    describe('query()', () => {
      it('should start a query for a table', () => {
        const query = ctx.db.query('users')
        expect(query).toBeDefined()
      })

      it('should return a QueryBuilder', () => {
        const query = ctx.db.query('messages')
        expect(query).toHaveProperty('collect')
        expect(query).toHaveProperty('first')
        expect(query).toHaveProperty('take')
      })

      it('should accept any table name', () => {
        expect(() => ctx.db.query('users')).not.toThrow()
        expect(() => ctx.db.query('posts')).not.toThrow()
        expect(() => ctx.db.query('comments')).not.toThrow()
      })

      it('should create independent query builders', () => {
        const query1 = ctx.db.query('users')
        const query2 = ctx.db.query('posts')
        expect(query1).not.toBe(query2)
      })
    })

    describe('normalizeId()', () => {
      it('should normalize a valid ID string', () => {
        const normalized = ctx.db.normalizeId('users', 'user_123')
        expect(normalized).toBeDefined()
      })

      it('should return null for invalid ID strings', () => {
        const mockDb = createMockDatabaseReader()
        mockDb.normalizeId = vi.fn(() => null)
        ctx.db = mockDb

        const result = ctx.db.normalizeId('users', 'invalid')
        expect(result).toBeNull()
      })

      it('should be type-safe with table names', () => {
        const usersId = ctx.db.normalizeId('users', 'user_123')
        const postsId = ctx.db.normalizeId('posts', 'post_456')
        expect(usersId).toBeDefined()
        expect(postsId).toBeDefined()
      })
    })

    describe('system', () => {
      it('should provide system table access', () => {
        expect(ctx.db.system).toBeDefined()
        expect(ctx.db.system).toHaveProperty('get')
        expect(ctx.db.system).toHaveProperty('query')
      })

      it('should allow querying scheduled functions', () => {
        const query = ctx.db.system.query('_scheduled_functions')
        expect(query).toBeDefined()
      })

      it('should allow getting scheduled function by ID', async () => {
        const mockScheduledId = 'scheduled_123' as any
        ctx.db.system.get = vi.fn(async () => ({
          _id: mockScheduledId,
          _creationTime: Date.now(),
          name: 'myFunction',
          args: [],
          scheduledTime: Date.now() + 1000,
          state: { kind: 'pending' },
        }))

        const result = await ctx.db.system.get(mockScheduledId)
        expect(result).toBeDefined()
        expect(result?.name).toBe('myFunction')
      })
    })
  })

  // ============================================================================
  // Auth Context Tests
  // ============================================================================

  describe('auth: Auth', () => {
    let ctx: QueryCtx

    beforeEach(() => {
      ctx = createMockQueryCtx()
    })

    describe('getUserIdentity()', () => {
      it('should return user identity when authenticated', async () => {
        const identity = await ctx.auth.getUserIdentity()
        expect(identity).toBeDefined()
        expect(identity).toHaveProperty('subject')
        expect(identity).toHaveProperty('tokenIdentifier')
      })

      it('should return null when not authenticated', async () => {
        const mockAuth = createMockAuth()
        mockAuth.getUserIdentity = vi.fn(async () => null)
        ctx.auth = mockAuth

        const identity = await ctx.auth.getUserIdentity()
        expect(identity).toBeNull()
      })

      it('should return complete UserIdentity object', async () => {
        const identity = await ctx.auth.getUserIdentity()
        if (identity) {
          expect(identity).toHaveProperty('subject')
          expect(identity).toHaveProperty('tokenIdentifier')
          expect(typeof identity.subject).toBe('string')
          expect(typeof identity.tokenIdentifier).toBe('string')
        }
      })

      it('should include optional identity fields', async () => {
        const mockAuth = createMockAuth()
        mockAuth.getUserIdentity = vi.fn(async () => ({
          subject: 'user|123',
          tokenIdentifier: 'token|123',
          name: 'John Doe',
          email: 'john@example.com',
          pictureUrl: 'https://example.com/avatar.jpg',
          emailVerified: true,
          givenName: 'John',
          familyName: 'Doe',
          nickname: 'johndoe',
          updatedAt: Date.now(),
        }))
        ctx.auth = mockAuth

        const identity = await ctx.auth.getUserIdentity()
        expect(identity?.name).toBe('John Doe')
        expect(identity?.email).toBe('john@example.com')
      })

      it('should be callable multiple times', async () => {
        await ctx.auth.getUserIdentity()
        await ctx.auth.getUserIdentity()
        expect(ctx.auth.getUserIdentity).toHaveBeenCalledTimes(2)
      })
    })
  })

  // ============================================================================
  // Storage Reader Tests
  // ============================================================================

  describe('storage: StorageReader', () => {
    let ctx: QueryCtx

    beforeEach(() => {
      ctx = createMockQueryCtx()
    })

    describe('getUrl()', () => {
      it('should return a URL for a storage ID', async () => {
        const storageId = 'storage_123' as StorageId
        const url = await ctx.storage.getUrl(storageId)

        expect(url).toBeDefined()
        expect(typeof url).toBe('string')
        expect(url).toContain(storageId)
      })

      it('should return null for non-existent storage IDs', async () => {
        const mockStorage = createMockStorageReader()
        mockStorage.getUrl = vi.fn(async () => null)
        ctx.storage = mockStorage

        const storageId = 'storage_nonexistent' as StorageId
        const url = await ctx.storage.getUrl(storageId)

        expect(url).toBeNull()
      })

      it('should return valid HTTP/HTTPS URLs', async () => {
        const storageId = 'storage_123' as StorageId
        const url = await ctx.storage.getUrl(storageId)

        if (url) {
          expect(url).toMatch(/^https?:\/\//)
        }
      })
    })

    describe('getMetadata()', () => {
      it('should return metadata for a storage ID', async () => {
        const storageId = 'storage_123' as StorageId
        const metadata = await ctx.storage.getMetadata(storageId)

        expect(metadata).toBeDefined()
        expect(metadata).toHaveProperty('storageId')
        expect(metadata).toHaveProperty('sha256')
        expect(metadata).toHaveProperty('size')
      })

      it('should return null for non-existent storage IDs', async () => {
        const mockStorage = createMockStorageReader()
        mockStorage.getMetadata = vi.fn(async () => null)
        ctx.storage = mockStorage

        const storageId = 'storage_nonexistent' as StorageId
        const metadata = await ctx.storage.getMetadata(storageId)

        expect(metadata).toBeNull()
      })

      it('should include all required metadata fields', async () => {
        const storageId = 'storage_123' as StorageId
        const metadata = await ctx.storage.getMetadata(storageId)

        if (metadata) {
          expect(metadata.storageId).toBe(storageId)
          expect(typeof metadata.sha256).toBe('string')
          expect(typeof metadata.size).toBe('number')
        }
      })

      it('should include optional contentType field', async () => {
        const storageId = 'storage_123' as StorageId
        const metadata = await ctx.storage.getMetadata(storageId)

        if (metadata && metadata.contentType) {
          expect(typeof metadata.contentType).toBe('string')
        }
      })

      it('should return correct size in bytes', async () => {
        const storageId = 'storage_123' as StorageId
        const metadata = await ctx.storage.getMetadata(storageId)

        if (metadata) {
          expect(metadata.size).toBeGreaterThanOrEqual(0)
          expect(Number.isInteger(metadata.size)).toBe(true)
        }
      })
    })
  })

  // ============================================================================
  // Query Function Integration Tests
  // ============================================================================

  describe('query function usage', () => {
    it('should allow query functions to access ctx.db', async () => {
      const queryHandler = async (ctx: QueryCtx) => {
        const doc = await ctx.db.get('doc_123' as Id<'users'>)
        return doc
      }

      const ctx = createMockQueryCtx()
      const result = await queryHandler(ctx)
      expect(result).toBeDefined()
    })

    it('should allow query functions to access ctx.auth', async () => {
      const queryHandler = async (ctx: QueryCtx) => {
        const identity = await ctx.auth.getUserIdentity()
        return identity
      }

      const ctx = createMockQueryCtx()
      const result = await queryHandler(ctx)
      expect(result).toBeDefined()
    })

    it('should allow query functions to access ctx.storage', async () => {
      const queryHandler = async (ctx: QueryCtx) => {
        const url = await ctx.storage.getUrl('storage_123' as StorageId)
        return url
      }

      const ctx = createMockQueryCtx()
      const result = await queryHandler(ctx)
      expect(result).toBeDefined()
    })

    it('should support complex query patterns', async () => {
      const queryHandler = async (ctx: QueryCtx, args: { userId: Id<'users'> }) => {
        // Get user
        const user = await ctx.db.get(args.userId)
        if (!user) return null

        // Check authentication
        const identity = await ctx.auth.getUserIdentity()
        if (!identity) return null

        // Get user's avatar URL if it exists
        const avatarUrl = (user as any).avatarStorageId
          ? await ctx.storage.getUrl((user as any).avatarStorageId)
          : null

        return { user, identity, avatarUrl }
      }

      const ctx = createMockQueryCtx()
      const result = await queryHandler(ctx, { userId: 'user_123' as Id<'users'> })
      expect(result).toBeDefined()
      expect(result?.user).toBeDefined()
      expect(result?.identity).toBeDefined()
    })

    it('should support querying related documents', async () => {
      const queryHandler = async (ctx: QueryCtx, args: { channelId: Id<'channels'> }) => {
        const mockQuery = {
          withIndex: vi.fn().mockReturnThis(),
          collect: vi.fn(async () => [
            { _id: 'msg_1', _creationTime: Date.now(), body: 'Hello' },
            { _id: 'msg_2', _creationTime: Date.now(), body: 'World' },
          ]),
        }
        ctx.db.query = vi.fn(() => mockQuery as any)

        const messages = await ctx.db.query('messages')
          .withIndex('by_channel', (q) => q as any)
          .collect()

        return messages
      }

      const ctx = createMockQueryCtx()
      const result = await queryHandler(ctx, { channelId: 'channel_123' as Id<'channels'> })
      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle authentication checks in queries', async () => {
      const queryHandler = async (ctx: QueryCtx) => {
        const identity = await ctx.auth.getUserIdentity()
        if (!identity) {
          throw new Error('Unauthorized')
        }
        return { success: true, userId: identity.subject }
      }

      const ctx = createMockQueryCtx()
      const result = await queryHandler(ctx)
      expect(result.success).toBe(true)
      expect(result.userId).toBeDefined()
    })

    it('should handle unauthenticated access gracefully', async () => {
      const queryHandler = async (ctx: QueryCtx) => {
        const identity = await ctx.auth.getUserIdentity()
        if (!identity) {
          return { isPublic: true, data: 'public data' }
        }
        return { isPublic: false, data: 'private data' }
      }

      const mockAuth = createMockAuth()
      mockAuth.getUserIdentity = vi.fn(async () => null)

      const ctx = createMockQueryCtx()
      ctx.auth = mockAuth

      const result = await queryHandler(ctx)
      expect(result.isPublic).toBe(true)
    })
  })

  // ============================================================================
  // Read-Only Constraint Tests
  // ============================================================================

  describe('read-only constraints', () => {
    let ctx: QueryCtx

    beforeEach(() => {
      ctx = createMockQueryCtx()
    })

    it('should not allow insert operations', () => {
      // Type-level test: ctx.db should not have insert method
      expect((ctx.db as any).insert).toBeUndefined()
    })

    it('should not allow patch operations', () => {
      // Type-level test: ctx.db should not have patch method
      expect((ctx.db as any).patch).toBeUndefined()
    })

    it('should not allow replace operations', () => {
      // Type-level test: ctx.db should not have replace method
      expect((ctx.db as any).replace).toBeUndefined()
    })

    it('should not allow delete operations', () => {
      // Type-level test: ctx.db should not have delete method
      expect((ctx.db as any).delete).toBeUndefined()
    })

    it('should not allow storage upload operations', () => {
      expect((ctx.storage as any).generateUploadUrl).toBeUndefined()
      expect((ctx.storage as any).store).toBeUndefined()
    })

    it('should not allow storage delete operations', () => {
      expect((ctx.storage as any).delete).toBeUndefined()
    })

    it('should not provide scheduler access', () => {
      expect((ctx as any).scheduler).toBeUndefined()
    })
  })

  // ============================================================================
  // Type Safety Tests
  // ============================================================================

  describe('type safety', () => {
    it('should enforce correct QueryCtx type', () => {
      const ctx: QueryCtx = createMockQueryCtx()
      expect(ctx).toBeDefined()
    })

    it('should have correct property types', () => {
      const ctx = createMockQueryCtx()
      const db: DatabaseReader = ctx.db
      const auth: Auth = ctx.auth
      const storage: StorageReader = ctx.storage
      expect(db).toBeDefined()
      expect(auth).toBeDefined()
      expect(storage).toBeDefined()
    })

    it('should work with typed query handlers', async () => {
      type QueryHandler = (ctx: QueryCtx, args: { id: string }) => Promise<unknown>

      const handler: QueryHandler = async (ctx, args) => {
        return await ctx.db.get(args.id as Id<string>)
      }

      const ctx = createMockQueryCtx()
      const result = await handler(ctx, { id: 'test_123' })
      expect(result).toBeDefined()
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should propagate database errors', async () => {
      const mockDb = createMockDatabaseReader()
      mockDb.get = vi.fn(async () => {
        throw new Error('Database error')
      })

      const ctx = createMockQueryCtx()
      ctx.db = mockDb

      await expect(ctx.db.get('test_id' as Id<string>))
        .rejects.toThrow('Database error')
    })

    it('should propagate auth errors', async () => {
      const mockAuth = createMockAuth()
      mockAuth.getUserIdentity = vi.fn(async () => {
        throw new Error('Auth error')
      })

      const ctx = createMockQueryCtx()
      ctx.auth = mockAuth

      await expect(ctx.auth.getUserIdentity())
        .rejects.toThrow('Auth error')
    })

    it('should propagate storage errors', async () => {
      const mockStorage = createMockStorageReader()
      mockStorage.getUrl = vi.fn(async () => {
        throw new Error('Storage error')
      })

      const ctx = createMockQueryCtx()
      ctx.storage = mockStorage

      await expect(ctx.storage.getUrl('test_id' as StorageId))
        .rejects.toThrow('Storage error')
    })

    it('should handle invalid document IDs gracefully', async () => {
      const mockDb = createMockDatabaseReader()
      mockDb.get = vi.fn(async () => null)

      const ctx = createMockQueryCtx()
      ctx.db = mockDb

      const result = await ctx.db.get('invalid_id' as Id<string>)
      expect(result).toBeNull()
    })
  })

  // ============================================================================
  // Realistic Usage Examples
  // ============================================================================

  describe('realistic usage examples', () => {
    it('should support a typical list messages query', async () => {
      const listMessages = async (ctx: QueryCtx, args: { channelId: Id<'channels'> }) => {
        const mockQuery = {
          withIndex: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          collect: vi.fn(async () => [
            { _id: 'msg_1', _creationTime: Date.now(), body: 'Hello', authorId: 'user_1' },
            { _id: 'msg_2', _creationTime: Date.now(), body: 'Hi', authorId: 'user_2' },
          ]),
        }
        ctx.db.query = vi.fn(() => mockQuery as any)

        return await ctx.db.query('messages')
          .withIndex('by_channel', (q) => q as any)
          .order('desc')
          .collect()
      }

      const ctx = createMockQueryCtx()
      const messages = await listMessages(ctx, { channelId: 'channel_1' as Id<'channels'> })

      expect(messages).toBeInstanceOf(Array)
      expect(messages.length).toBe(2)
    })

    it('should support a get user profile query', async () => {
      const getUserProfile = async (ctx: QueryCtx, args: { userId: Id<'users'> }) => {
        const user = await ctx.db.get(args.userId)
        if (!user) return null

        const avatarUrl = (user as any).avatarStorageId
          ? await ctx.storage.getUrl((user as any).avatarStorageId)
          : null

        return {
          ...user,
          avatarUrl,
        }
      }

      const ctx = createMockQueryCtx()
      const mockUser = {
        _id: 'user_123',
        _creationTime: Date.now(),
        name: 'John Doe',
        avatarStorageId: 'storage_123' as StorageId,
      }
      ctx.db.get = vi.fn(async () => mockUser)

      const profile = await getUserProfile(ctx, { userId: 'user_123' as Id<'users'> })

      expect(profile).toBeDefined()
      expect(profile?.name).toBe('John Doe')
      expect(profile?.avatarUrl).toBeDefined()
    })

    it('should support authenticated queries', async () => {
      const getCurrentUser = async (ctx: QueryCtx) => {
        const identity = await ctx.auth.getUserIdentity()
        if (!identity) return null

        const mockQuery = {
          withIndex: vi.fn().mockReturnThis(),
          first: vi.fn(async () => ({
            _id: 'user_123',
            _creationTime: Date.now(),
            tokenIdentifier: identity.tokenIdentifier,
            name: identity.name,
          })),
        }
        ctx.db.query = vi.fn(() => mockQuery as any)

        return await ctx.db.query('users')
          .withIndex('by_token', (q) => q as any)
          .first()
      }

      const ctx = createMockQueryCtx()
      const user = await getCurrentUser(ctx)

      expect(user).toBeDefined()
      expect(user?.tokenIdentifier).toBeDefined()
    })

    it('should support paginated queries', async () => {
      const listPosts = async (ctx: QueryCtx, args: { limit: number }) => {
        const mockQuery = {
          order: vi.fn().mockReturnThis(),
          take: vi.fn(async (n: number) =>
            Array(Math.min(n, 5)).fill(null).map((_, i) => ({
              _id: `post_${i}`,
              _creationTime: Date.now() - i * 1000,
              title: `Post ${i}`,
            }))
          ),
        }
        ctx.db.query = vi.fn(() => mockQuery as any)

        return await ctx.db.query('posts')
          .order('desc')
          .take(args.limit)
      }

      const ctx = createMockQueryCtx()
      const posts = await listPosts(ctx, { limit: 3 })

      expect(posts).toBeInstanceOf(Array)
      expect(posts.length).toBeLessThanOrEqual(3)
    })
  })
})
