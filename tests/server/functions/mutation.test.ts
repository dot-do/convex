/**
 * TDD Tests for mutation() Function Builder
 *
 * Tests define the expected behavior for the mutation() function builder
 * that creates type-safe mutation handlers for Convex-compatible functions.
 *
 * mutation() provides:
 * - Type-safe arguments with validators
 * - MutationCtx injection (db.insert, db.patch, db.replace, db.delete)
 * - Return type inference
 * - Configuration options (description, etc.)
 * - Error handling for invalid arguments
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  mutation,
  internalMutation,
  executeMutation,
  createMutationHandler,
  validateMutationArgs,
  MutationConfig,
  RegisteredMutation,
  MutationArgs,
  MutationReturns,
  MutationHandler,
} from '../../../src/server/functions/mutation'
import { v } from '../../../src/values'
import type { MutationCtx } from '../../../src/server/context'
import type { Id } from '../../../src/types'

// ============================================================================
// Test Setup - Mock MutationCtx
// ============================================================================

function createMockMutationCtx(): MutationCtx {
  return {
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
}

// ============================================================================
// mutation() Function Signature Tests
// ============================================================================

describe('mutation() function signature', () => {
  it('should accept a config with handler only', () => {
    const myMutation = mutation({
      handler: async (ctx) => {
        return 'result'
      },
    })

    expect(myMutation).toBeDefined()
    expect(myMutation._type).toBe('mutation')
    expect(myMutation._visibility).toBe('public')
  })

  it('should accept a config with args and handler', () => {
    const myMutation = mutation({
      args: { name: v.string() },
      handler: async (ctx, args) => {
        return `Hello ${args.name}`
      },
    })

    expect(myMutation).toBeDefined()
    expect(myMutation._type).toBe('mutation')
    expect(myMutation._config.args).toBeDefined()
  })

  it('should accept a config with args, returns, and handler', () => {
    const myMutation = mutation({
      args: { name: v.string() },
      returns: v.string(),
      handler: async (ctx, args) => {
        return `Hello ${args.name}`
      },
    })

    expect(myMutation).toBeDefined()
    expect(myMutation._config.returns).toBeDefined()
  })

  it('should store the config object for later execution', () => {
    const handler = async (ctx: MutationCtx, args: { x: number }) => args.x * 2
    const myMutation = mutation({
      args: { x: v.number() },
      handler,
    })

    expect(myMutation._config.handler).toBe(handler)
    expect(myMutation._config.args).toBeDefined()
  })

  it('should accept optional description config', () => {
    const myMutation = mutation({
      args: { name: v.string() },
      description: 'Creates a new user',
      handler: async (ctx, args) => {
        return await ctx.db.insert('users', { name: args.name })
      },
    })

    expect(myMutation._config.description).toBe('Creates a new user')
  })
})

// ============================================================================
// internalMutation() Tests
// ============================================================================

describe('internalMutation() function signature', () => {
  it('should mark mutation as internal', () => {
    const myMutation = internalMutation({
      handler: async (ctx) => {
        return 'internal result'
      },
    })

    expect(myMutation).toBeDefined()
    expect(myMutation._type).toBe('mutation')
    expect(myMutation._visibility).toBe('internal')
  })

  it('should work the same as public mutation except for visibility', () => {
    const myMutation = internalMutation({
      args: { userId: v.string() },
      handler: async (ctx, args) => {
        return await ctx.db.get(args.userId as Id<'users'>)
      },
    })

    expect(myMutation._type).toBe('mutation')
    expect(myMutation._visibility).toBe('internal')
    expect(myMutation._config.args).toBeDefined()
  })
})

// ============================================================================
// Type-safe Arguments with Validators Tests
// ============================================================================

describe('type-safe arguments with validators', () => {
  it('should accept v.string() validator for string args', () => {
    const myMutation = mutation({
      args: { name: v.string() },
      handler: async (ctx, args) => {
        return args.name.toUpperCase()
      },
    })

    expect(myMutation._config.args).toHaveProperty('name')
  })

  it('should accept v.number() validator for number args', () => {
    const myMutation = mutation({
      args: { count: v.number() },
      handler: async (ctx, args) => {
        return args.count * 2
      },
    })

    expect(myMutation._config.args).toHaveProperty('count')
  })

  it('should accept v.boolean() validator for boolean args', () => {
    const myMutation = mutation({
      args: { active: v.boolean() },
      handler: async (ctx, args) => {
        return !args.active
      },
    })

    expect(myMutation._config.args).toHaveProperty('active')
  })

  it('should accept v.id() validator for ID args', () => {
    const myMutation = mutation({
      args: { userId: v.id('users') },
      handler: async (ctx, args) => {
        return await ctx.db.get(args.userId)
      },
    })

    expect(myMutation._config.args).toHaveProperty('userId')
  })

  it('should accept v.object() validator for object args', () => {
    const myMutation = mutation({
      args: {
        user: v.object({
          name: v.string(),
          email: v.string(),
        }),
      },
      handler: async (ctx, args) => {
        return await ctx.db.insert('users', args.user)
      },
    })

    expect(myMutation._config.args).toHaveProperty('user')
  })

  it('should accept v.array() validator for array args', () => {
    const myMutation = mutation({
      args: { tags: v.array(v.string()) },
      handler: async (ctx, args) => {
        return args.tags.length
      },
    })

    expect(myMutation._config.args).toHaveProperty('tags')
  })

  it('should accept v.optional() validator for optional args', () => {
    const myMutation = mutation({
      args: {
        name: v.string(),
        nickname: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        return args.nickname ?? args.name
      },
    })

    expect(myMutation._config.args).toHaveProperty('nickname')
  })

  it('should accept complex nested validators', () => {
    const myMutation = mutation({
      args: {
        post: v.object({
          title: v.string(),
          body: v.string(),
          tags: v.array(v.string()),
          metadata: v.optional(
            v.object({
              views: v.number(),
              likes: v.number(),
            })
          ),
        }),
      },
      handler: async (ctx, args) => {
        return await ctx.db.insert('posts', args.post)
      },
    })

    expect(myMutation._config.args).toHaveProperty('post')
  })

  it('should accept v.union() validator for union types', () => {
    const myMutation = mutation({
      args: {
        status: v.union(v.literal('active'), v.literal('inactive'), v.literal('pending')),
      },
      handler: async (ctx, args) => {
        return args.status
      },
    })

    expect(myMutation._config.args).toHaveProperty('status')
  })
})

// ============================================================================
// MutationCtx Parameter Injection Tests
// ============================================================================

describe('MutationCtx parameter injection', () => {
  let mockCtx: MutationCtx

  beforeEach(() => {
    mockCtx = createMockMutationCtx()
  })

  it('should inject ctx.db.insert for creating documents', async () => {
    const newId = 'user_123' as Id<'users'>
    ;(mockCtx.db.insert as ReturnType<typeof vi.fn>).mockResolvedValue(newId)

    const myMutation = mutation({
      args: { name: v.string(), email: v.string() },
      handler: async (ctx, args) => {
        return await ctx.db.insert('users', { name: args.name, email: args.email })
      },
    })

    const handler = createMutationHandler(myMutation)
    const result = await handler(mockCtx, { name: 'John', email: 'john@example.com' })

    expect(mockCtx.db.insert).toHaveBeenCalledWith('users', {
      name: 'John',
      email: 'john@example.com',
    })
    expect(result).toBe(newId)
  })

  it('should inject ctx.db.patch for partial updates', async () => {
    ;(mockCtx.db.patch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const myMutation = mutation({
      args: { userId: v.id('users'), name: v.string() },
      handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, { name: args.name })
      },
    })

    const handler = createMutationHandler(myMutation)
    const userId = 'user_123' as Id<'users'>
    await handler(mockCtx, { userId, name: 'Updated Name' })

    expect(mockCtx.db.patch).toHaveBeenCalledWith(userId, { name: 'Updated Name' })
  })

  it('should inject ctx.db.replace for full document replacement', async () => {
    ;(mockCtx.db.replace as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const myMutation = mutation({
      args: {
        userId: v.id('users'),
        user: v.object({ name: v.string(), email: v.string() }),
      },
      handler: async (ctx, args) => {
        await ctx.db.replace(args.userId, args.user)
      },
    })

    const handler = createMutationHandler(myMutation)
    const userId = 'user_123' as Id<'users'>
    await handler(mockCtx, {
      userId,
      user: { name: 'New Name', email: 'new@example.com' },
    })

    expect(mockCtx.db.replace).toHaveBeenCalledWith(userId, {
      name: 'New Name',
      email: 'new@example.com',
    })
  })

  it('should inject ctx.db.delete for removing documents', async () => {
    ;(mockCtx.db.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const myMutation = mutation({
      args: { userId: v.id('users') },
      handler: async (ctx, args) => {
        await ctx.db.delete(args.userId)
      },
    })

    const handler = createMutationHandler(myMutation)
    const userId = 'user_123' as Id<'users'>
    await handler(mockCtx, { userId })

    expect(mockCtx.db.delete).toHaveBeenCalledWith(userId)
  })

  it('should inject ctx.db.get for reading documents', async () => {
    const mockUser = { _id: 'user_123', name: 'John' }
    ;(mockCtx.db.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser)

    const myMutation = mutation({
      args: { userId: v.id('users') },
      handler: async (ctx, args) => {
        return await ctx.db.get(args.userId)
      },
    })

    const handler = createMutationHandler(myMutation)
    const userId = 'user_123' as Id<'users'>
    const result = await handler(mockCtx, { userId })

    expect(mockCtx.db.get).toHaveBeenCalledWith(userId)
    expect(result).toEqual(mockUser)
  })

  it('should inject ctx.auth for authentication', async () => {
    const mockIdentity = {
      tokenIdentifier: 'token_123',
      subject: 'user_sub',
      issuer: 'https://auth.example.com',
    }
    ;(mockCtx.auth.getUserIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(mockIdentity)

    const myMutation = mutation({
      handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity()
        if (!identity) throw new Error('Not authenticated')
        return identity.tokenIdentifier
      },
    })

    const handler = createMutationHandler(myMutation)
    const result = await handler(mockCtx, {})

    expect(mockCtx.auth.getUserIdentity).toHaveBeenCalled()
    expect(result).toBe('token_123')
  })

  it('should inject ctx.storage for file operations', async () => {
    const storageId = 'storage_123'
    ;(mockCtx.storage.store as ReturnType<typeof vi.fn>).mockResolvedValue(storageId)

    const myMutation = mutation({
      handler: async (ctx) => {
        const blob = new Blob(['test content'])
        return await ctx.storage.store(blob)
      },
    })

    const handler = createMutationHandler(myMutation)
    const result = await handler(mockCtx, {})

    expect(mockCtx.storage.store).toHaveBeenCalled()
    expect(result).toBe(storageId)
  })

  it('should inject ctx.scheduler for scheduling functions', async () => {
    const scheduledId = 'scheduled_123'
    ;(mockCtx.scheduler.runAfter as ReturnType<typeof vi.fn>).mockResolvedValue(scheduledId)

    const myMutation = mutation({
      handler: async (ctx) => {
        return await ctx.scheduler.runAfter(5000, {} as any, {})
      },
    })

    const handler = createMutationHandler(myMutation)
    const result = await handler(mockCtx, {})

    expect(mockCtx.scheduler.runAfter).toHaveBeenCalledWith(5000, {}, {})
    expect(result).toBe(scheduledId)
  })
})

// ============================================================================
// Return Type Inference Tests
// ============================================================================

describe('return type inference', () => {
  it('should infer string return type', () => {
    const myMutation = mutation({
      handler: async () => {
        return 'result'
      },
    })

    // Type check - the mutation should be typed to return string
    expect(myMutation._type).toBe('mutation')
  })

  it('should infer number return type', () => {
    const myMutation = mutation({
      handler: async () => {
        return 42
      },
    })

    expect(myMutation._type).toBe('mutation')
  })

  it('should infer object return type', () => {
    const myMutation = mutation({
      handler: async () => {
        return { id: '123', name: 'Test' }
      },
    })

    expect(myMutation._type).toBe('mutation')
  })

  it('should infer array return type', () => {
    const myMutation = mutation({
      handler: async () => {
        return [1, 2, 3]
      },
    })

    expect(myMutation._type).toBe('mutation')
  })

  it('should infer void return type', () => {
    const myMutation = mutation({
      handler: async () => {
        // No return
      },
    })

    expect(myMutation._type).toBe('mutation')
  })

  it('should infer union return type', () => {
    const myMutation = mutation({
      handler: async () => {
        if (Math.random() > 0.5) {
          return { success: true, data: 'ok' }
        }
        return { success: false, error: 'failed' }
      },
    })

    expect(myMutation._type).toBe('mutation')
  })

  it('should support explicit return type validation', async () => {
    const mockCtx = createMockMutationCtx()

    const myMutation = mutation({
      returns: v.string(),
      handler: async () => {
        return 'valid string'
      },
    })

    const handler = createMutationHandler(myMutation)
    const result = await handler(mockCtx, {})

    expect(result).toBe('valid string')
  })
})

// ============================================================================
// Error Handling for Invalid Arguments Tests
// ============================================================================

describe('error handling for invalid arguments', () => {
  let mockCtx: MutationCtx

  beforeEach(() => {
    mockCtx = createMockMutationCtx()
  })

  it('should throw error for missing required argument', async () => {
    const myMutation = mutation({
      args: { name: v.string() },
      handler: async (ctx, args) => {
        return args.name
      },
    })

    await expect(
      executeMutation(myMutation, mockCtx, {})
    ).rejects.toThrow(/Missing required field "name"/)
  })

  it('should throw error for wrong argument type - expected string got number', async () => {
    const myMutation = mutation({
      args: { name: v.string() },
      handler: async (ctx, args) => {
        return args.name
      },
    })

    await expect(
      executeMutation(myMutation, mockCtx, { name: 123 })
    ).rejects.toThrow(/Expected string/)
  })

  it('should throw error for wrong argument type - expected number got string', async () => {
    const myMutation = mutation({
      args: { count: v.number() },
      handler: async (ctx, args) => {
        return args.count
      },
    })

    await expect(
      executeMutation(myMutation, mockCtx, { count: 'not a number' })
    ).rejects.toThrow(/Expected number/)
  })

  it('should throw error for invalid ID format', async () => {
    const myMutation = mutation({
      args: { userId: v.id('users') },
      handler: async (ctx, args) => {
        return args.userId
      },
    })

    await expect(
      executeMutation(myMutation, mockCtx, { userId: 'short' })
    ).rejects.toThrow(/Invalid ID/)
  })

  it('should throw error for invalid nested object', async () => {
    const myMutation = mutation({
      args: {
        user: v.object({
          name: v.string(),
          age: v.number(),
        }),
      },
      handler: async (ctx, args) => {
        return args.user
      },
    })

    await expect(
      executeMutation(myMutation, mockCtx, { user: { name: 'John', age: 'thirty' } })
    ).rejects.toThrow(/Expected number/)
  })

  it('should throw error for invalid array element', async () => {
    const myMutation = mutation({
      args: { tags: v.array(v.string()) },
      handler: async (ctx, args) => {
        return args.tags
      },
    })

    await expect(
      executeMutation(myMutation, mockCtx, { tags: ['valid', 123, 'also valid'] })
    ).rejects.toThrow(/Expected string/)
  })

  it('should accept valid optional argument as undefined', async () => {
    const myMutation = mutation({
      args: {
        name: v.string(),
        nickname: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        return args.nickname ?? 'default'
      },
    })

    const result = await executeMutation(myMutation, mockCtx, { name: 'John' })
    expect(result).toBe('default')
  })

  it('should throw for unexpected extra arguments in strict mode', async () => {
    const myMutation = mutation({
      args: { name: v.string() },
      strictArgs: true,
      handler: async (ctx, args) => {
        return args.name
      },
    })

    await expect(
      executeMutation(myMutation, mockCtx, { name: 'John', extra: 'field' })
    ).rejects.toThrow(/Unexpected/)
  })

  it('should ignore extra arguments in non-strict mode', async () => {
    const myMutation = mutation({
      args: { name: v.string() },
      handler: async (ctx, args) => {
        return args.name
      },
    })

    const result = await executeMutation(myMutation, mockCtx, {
      name: 'John',
      extra: 'ignored',
    })
    expect(result).toBe('John')
  })
})

// ============================================================================
// Mutation Configuration Options Tests
// ============================================================================

describe('mutation configuration options', () => {
  it('should store description in config', () => {
    const myMutation = mutation({
      description: 'Creates a new user in the database',
      args: { name: v.string() },
      handler: async (ctx, args) => {
        return await ctx.db.insert('users', { name: args.name })
      },
    })

    expect(myMutation._config.description).toBe('Creates a new user in the database')
  })

  it('should allow empty description', () => {
    const myMutation = mutation({
      description: '',
      handler: async () => {
        return 'result'
      },
    })

    expect(myMutation._config.description).toBe('')
  })

  it('should work without description', () => {
    const myMutation = mutation({
      handler: async () => {
        return 'result'
      },
    })

    expect(myMutation._config.description).toBeUndefined()
  })

  it('should support strictArgs config option', () => {
    const myMutation = mutation({
      args: { name: v.string() },
      strictArgs: true,
      handler: async (ctx, args) => {
        return args.name
      },
    })

    expect(myMutation._config.strictArgs).toBe(true)
  })

  it('should default strictArgs to false', () => {
    const myMutation = mutation({
      args: { name: v.string() },
      handler: async (ctx, args) => {
        return args.name
      },
    })

    expect(myMutation._config.strictArgs).toBeFalsy()
  })
})

// ============================================================================
// executeMutation() Tests
// ============================================================================

describe('executeMutation()', () => {
  let mockCtx: MutationCtx

  beforeEach(() => {
    mockCtx = createMockMutationCtx()
  })

  it('should execute mutation handler with validated args', async () => {
    const myMutation = mutation({
      args: { x: v.number(), y: v.number() },
      handler: async (ctx, args) => {
        return args.x + args.y
      },
    })

    const result = await executeMutation(myMutation, mockCtx, { x: 5, y: 3 })
    expect(result).toBe(8)
  })

  it('should execute mutation with no args', async () => {
    const myMutation = mutation({
      handler: async () => {
        return 'no args result'
      },
    })

    const result = await executeMutation(myMutation, mockCtx, {})
    expect(result).toBe('no args result')
  })

  it('should execute mutation with complex return value', async () => {
    ;(mockCtx.db.insert as ReturnType<typeof vi.fn>).mockResolvedValue('user_new')

    const myMutation = mutation({
      args: { name: v.string() },
      handler: async (ctx, args) => {
        const id = await ctx.db.insert('users', { name: args.name })
        return { id, name: args.name, created: true }
      },
    })

    const result = await executeMutation(myMutation, mockCtx, { name: 'Alice' })
    expect(result).toEqual({
      id: 'user_new',
      name: 'Alice',
      created: true,
    })
  })

  it('should propagate errors from handler', async () => {
    const myMutation = mutation({
      handler: async () => {
        throw new Error('Handler error')
      },
    })

    await expect(executeMutation(myMutation, mockCtx, {})).rejects.toThrow('Handler error')
  })

  it('should propagate errors from db operations', async () => {
    ;(mockCtx.db.insert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Insert failed')
    )

    const myMutation = mutation({
      args: { name: v.string() },
      handler: async (ctx, args) => {
        return await ctx.db.insert('users', { name: args.name })
      },
    })

    await expect(
      executeMutation(myMutation, mockCtx, { name: 'Test' })
    ).rejects.toThrow('Insert failed')
  })
})

// ============================================================================
// validateMutationArgs() Tests
// ============================================================================

describe('validateMutationArgs()', () => {
  it('should return validated args for valid input', () => {
    const args = { name: v.string(), age: v.number() }
    const input = { name: 'John', age: 30 }

    const result = validateMutationArgs(args, input)
    expect(result).toEqual({ name: 'John', age: 30 })
  })

  it('should throw for missing required field', () => {
    const args = { name: v.string(), age: v.number() }
    const input = { name: 'John' }

    expect(() => validateMutationArgs(args, input)).toThrow(/Missing required field "age"/)
  })

  it('should throw for wrong type', () => {
    const args = { name: v.string() }
    const input = { name: 123 }

    expect(() => validateMutationArgs(args, input)).toThrow(/Expected string/)
  })

  it('should handle optional fields', () => {
    const args = {
      name: v.string(),
      nickname: v.optional(v.string()),
    }
    const input = { name: 'John' }

    const result = validateMutationArgs(args, input)
    expect(result).toEqual({ name: 'John' })
  })

  it('should handle undefined args validator', () => {
    const result = validateMutationArgs(undefined, {})
    expect(result).toEqual({})
  })

  it('should handle empty args validator', () => {
    const result = validateMutationArgs({}, {})
    expect(result).toEqual({})
  })

  it('should strip extra fields by default', () => {
    const args = { name: v.string() }
    const input = { name: 'John', extra: 'value' }

    const result = validateMutationArgs(args, input)
    expect(result).toEqual({ name: 'John' })
    expect(result).not.toHaveProperty('extra')
  })

  it('should validate nested objects', () => {
    const args = {
      user: v.object({
        name: v.string(),
        profile: v.object({
          bio: v.string(),
        }),
      }),
    }
    const input = {
      user: {
        name: 'John',
        profile: {
          bio: 'Hello world',
        },
      },
    }

    const result = validateMutationArgs(args, input)
    expect(result).toEqual(input)
  })

  it('should validate arrays', () => {
    const args = { tags: v.array(v.string()) }
    const input = { tags: ['a', 'b', 'c'] }

    const result = validateMutationArgs(args, input)
    expect(result).toEqual(input)
  })
})

// ============================================================================
// createMutationHandler() Tests
// ============================================================================

describe('createMutationHandler()', () => {
  let mockCtx: MutationCtx

  beforeEach(() => {
    mockCtx = createMockMutationCtx()
  })

  it('should create an executable handler function', () => {
    const myMutation = mutation({
      handler: async () => 'result',
    })

    const handler = createMutationHandler(myMutation)
    expect(typeof handler).toBe('function')
  })

  it('should execute the handler with ctx and args', async () => {
    const myMutation = mutation({
      args: { name: v.string() },
      handler: async (ctx, args) => {
        return `Hello, ${args.name}!`
      },
    })

    const handler = createMutationHandler(myMutation)
    const result = await handler(mockCtx, { name: 'World' })

    expect(result).toBe('Hello, World!')
  })

  it('should pass ctx to the handler', async () => {
    ;(mockCtx.db.insert as ReturnType<typeof vi.fn>).mockResolvedValue('id_123')

    const myMutation = mutation({
      handler: async (ctx) => {
        return await ctx.db.insert('test', { data: 'value' })
      },
    })

    const handler = createMutationHandler(myMutation)
    await handler(mockCtx, {})

    expect(mockCtx.db.insert).toHaveBeenCalledWith('test', { data: 'value' })
  })
})

// ============================================================================
// Type Utility Tests
// ============================================================================

describe('MutationArgs type utility', () => {
  it('should extract args type from mutation', () => {
    const myMutation = mutation({
      args: { name: v.string(), count: v.number() },
      handler: async (ctx, args) => {
        return `${args.name}: ${args.count}`
      },
    })

    // This is a compile-time check
    type Args = MutationArgs<typeof myMutation>
    // Args should be { name: string; count: number }

    expect(myMutation._config.args).toBeDefined()
  })
})

describe('MutationReturns type utility', () => {
  it('should extract return type from mutation', () => {
    const myMutation = mutation({
      handler: async () => {
        return { id: '123', success: true }
      },
    })

    // This is a compile-time check
    type Returns = MutationReturns<typeof myMutation>
    // Returns should be { id: string; success: boolean }

    expect(myMutation._type).toBe('mutation')
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('mutation integration tests', () => {
  let mockCtx: MutationCtx

  beforeEach(() => {
    mockCtx = createMockMutationCtx()
  })

  it('should work with typical user creation flow', async () => {
    const newUserId = 'user_abc123def456ghi789jkl012mno3' as Id<'users'>
    ;(mockCtx.db.insert as ReturnType<typeof vi.fn>).mockResolvedValue(newUserId)

    const createUser = mutation({
      args: {
        name: v.string(),
        email: v.string(),
      },
      handler: async (ctx, args) => {
        return await ctx.db.insert('users', {
          name: args.name,
          email: args.email,
        })
      },
    })

    const result = await executeMutation(createUser, mockCtx, {
      name: 'John Doe',
      email: 'john@example.com',
    })

    expect(result).toBe(newUserId)
    expect(mockCtx.db.insert).toHaveBeenCalledWith('users', {
      name: 'John Doe',
      email: 'john@example.com',
    })
  })

  it('should work with update flow', async () => {
    const userId = 'abc123def456ghi789jkl012mno345ab' as Id<'users'>
    const existingUser = { _id: userId, name: 'Old Name', email: 'old@example.com' }

    ;(mockCtx.db.get as ReturnType<typeof vi.fn>).mockResolvedValue(existingUser)
    ;(mockCtx.db.patch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const updateUser = mutation({
      args: {
        userId: v.id('users'),
        name: v.optional(v.string()),
        email: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        const user = await ctx.db.get(args.userId)
        if (!user) throw new Error('User not found')

        const updates: Record<string, string> = {}
        if (args.name) updates.name = args.name
        if (args.email) updates.email = args.email

        await ctx.db.patch(args.userId, updates)
        return { success: true }
      },
    })

    const result = await executeMutation(updateUser, mockCtx, {
      userId,
      name: 'New Name',
    })

    expect(result).toEqual({ success: true })
    expect(mockCtx.db.patch).toHaveBeenCalledWith(userId, { name: 'New Name' })
  })

  it('should work with delete flow', async () => {
    const userId = 'abc123def456ghi789jkl012mno345ab' as Id<'users'>
    ;(mockCtx.db.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    const deleteUser = mutation({
      args: { userId: v.id('users') },
      handler: async (ctx, args) => {
        await ctx.db.delete(args.userId)
        return { deleted: true }
      },
    })

    const result = await executeMutation(deleteUser, mockCtx, { userId })

    expect(result).toEqual({ deleted: true })
    expect(mockCtx.db.delete).toHaveBeenCalledWith(userId)
  })

  it('should work with authenticated mutation', async () => {
    const mockIdentity = {
      tokenIdentifier: 'auth_token',
      subject: 'user_sub',
      issuer: 'https://auth.example.com',
    }
    ;(mockCtx.auth.getUserIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(mockIdentity)
    ;(mockCtx.db.insert as ReturnType<typeof vi.fn>).mockResolvedValue('post_123')

    const createPost = mutation({
      args: { title: v.string(), body: v.string() },
      handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity()
        if (!identity) throw new Error('Must be logged in')

        return await ctx.db.insert('posts', {
          title: args.title,
          body: args.body,
          authorId: identity.tokenIdentifier,
        })
      },
    })

    const result = await executeMutation(createPost, mockCtx, {
      title: 'My Post',
      body: 'Post content',
    })

    expect(result).toBe('post_123')
    expect(mockCtx.db.insert).toHaveBeenCalledWith('posts', {
      title: 'My Post',
      body: 'Post content',
      authorId: 'auth_token',
    })
  })

  it('should throw when auth required but not authenticated', async () => {
    ;(mockCtx.auth.getUserIdentity as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const createPost = mutation({
      args: { title: v.string() },
      handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity()
        if (!identity) throw new Error('Must be logged in')

        return await ctx.db.insert('posts', { title: args.title })
      },
    })

    await expect(
      executeMutation(createPost, mockCtx, { title: 'My Post' })
    ).rejects.toThrow('Must be logged in')
  })
})

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('edge cases', () => {
  let mockCtx: MutationCtx

  beforeEach(() => {
    mockCtx = createMockMutationCtx()
  })

  it('should handle null return value', async () => {
    const myMutation = mutation({
      handler: async () => {
        return null
      },
    })

    const result = await executeMutation(myMutation, mockCtx, {})
    expect(result).toBeNull()
  })

  it('should handle undefined return value', async () => {
    const myMutation = mutation({
      handler: async () => {
        return undefined
      },
    })

    const result = await executeMutation(myMutation, mockCtx, {})
    expect(result).toBeUndefined()
  })

  it('should handle empty object args', async () => {
    const myMutation = mutation({
      args: {},
      handler: async () => {
        return 'result'
      },
    })

    const result = await executeMutation(myMutation, mockCtx, {})
    expect(result).toBe('result')
  })

  it('should handle async handler that takes time', async () => {
    const myMutation = mutation({
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return 'delayed result'
      },
    })

    const result = await executeMutation(myMutation, mockCtx, {})
    expect(result).toBe('delayed result')
  })

  it('should handle multiple sequential db operations', async () => {
    const userId = 'user_123' as Id<'users'>
    const postId = 'post_456' as Id<'posts'>

    ;(mockCtx.db.insert as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(userId)
      .mockResolvedValueOnce(postId)

    const myMutation = mutation({
      args: { userName: v.string(), postTitle: v.string() },
      handler: async (ctx, args) => {
        const newUserId = await ctx.db.insert('users', { name: args.userName })
        const newPostId = await ctx.db.insert('posts', {
          title: args.postTitle,
          authorId: newUserId,
        })
        return { userId: newUserId, postId: newPostId }
      },
    })

    const result = await executeMutation(myMutation, mockCtx, {
      userName: 'John',
      postTitle: 'My First Post',
    })

    expect(result).toEqual({ userId, postId })
    expect(mockCtx.db.insert).toHaveBeenCalledTimes(2)
  })

  it('should handle args with special characters in values', async () => {
    const myMutation = mutation({
      args: { text: v.string() },
      handler: async (ctx, args) => {
        return args.text
      },
    })

    const specialText = 'Hello <script>alert("xss")</script> & "quotes" \' single'
    const result = await executeMutation(myMutation, mockCtx, { text: specialText })
    expect(result).toBe(specialText)
  })

  it('should handle very long string arguments', async () => {
    const myMutation = mutation({
      args: { text: v.string() },
      handler: async (ctx, args) => {
        return args.text.length
      },
    })

    const longString = 'a'.repeat(10000)
    const result = await executeMutation(myMutation, mockCtx, { text: longString })
    expect(result).toBe(10000)
  })

  it('should handle large numbers', async () => {
    const myMutation = mutation({
      args: { num: v.number() },
      handler: async (ctx, args) => {
        return args.num * 2
      },
    })

    const result = await executeMutation(myMutation, mockCtx, { num: Number.MAX_SAFE_INTEGER })
    expect(result).toBe(Number.MAX_SAFE_INTEGER * 2)
  })

  it('should handle deeply nested objects', async () => {
    const myMutation = mutation({
      args: {
        data: v.object({
          level1: v.object({
            level2: v.object({
              level3: v.object({
                value: v.string(),
              }),
            }),
          }),
        }),
      },
      handler: async (ctx, args) => {
        return args.data.level1.level2.level3.value
      },
    })

    const result = await executeMutation(myMutation, mockCtx, {
      data: {
        level1: {
          level2: {
            level3: {
              value: 'deep value',
            },
          },
        },
      },
    })

    expect(result).toBe('deep value')
  })
})
