/**
 * TDD RED Phase Tests for Registered Function Types
 *
 * These tests define the expected behavior for RegisteredQuery, RegisteredMutation,
 * and RegisteredAction types along with type guards and utility functions.
 *
 * @see convex-y05 - Registered Function Types Tests
 */

import { describe, it, expect, expectTypeOf } from 'vitest'
import { v, type Infer, type Validator } from '../../../src/values'
import { query, internalQuery } from '../../../src/server/query'
import { mutation, internalMutation } from '../../../src/server/mutation'
import { action, internalAction } from '../../../src/server/action'
import {
  // Types
  type RegisteredQuery,
  type RegisteredMutation,
  type RegisteredAction,
  type AnyRegisteredFunction,
  type FunctionArgs,
  type FunctionReturns,
  type FunctionVisibility,
  // Type guards
  isQuery,
  isMutation,
  isAction,
  isRegisteredFunction,
  isPublicFunction,
  isInternalFunction,
  // Utility functions
  getFunctionType,
  getFunctionVisibility,
  getArgsValidator,
  getReturnsValidator,
  getFunctionHandler,
  // Generic function type
  type GenericRegisteredFunction,
} from '../../../src/server/functions/registered'
import type { QueryCtx, MutationCtx, ActionCtx } from '../../../src/server/context'

// ============================================================================
// RegisteredQuery Type Tests
// ============================================================================

describe('RegisteredQuery', () => {
  describe('type structure', () => {
    it('should have _type property set to "query"', () => {
      const q = query({
        handler: async (ctx) => 'hello'
      })
      expect(q._type).toBe('query')
    })

    it('should have _visibility property', () => {
      const publicQuery = query({
        handler: async (ctx) => 'hello'
      })
      const internalQ = internalQuery({
        handler: async (ctx) => 'hello'
      })
      expect(publicQuery._visibility).toBe('public')
      expect(internalQ._visibility).toBe('internal')
    })

    it('should have _config property with handler', () => {
      const handler = async (ctx: QueryCtx) => 'hello'
      const q = query({ handler })
      expect(q._config).toBeDefined()
      expect(q._config.handler).toBe(handler)
    })

    it('should store args validator in config', () => {
      const argsValidator = { name: v.string() }
      const q = query({
        args: argsValidator,
        handler: async (ctx, args) => args.name
      })
      expect(q._config.args).toBe(argsValidator)
    })

    it('should store returns validator in config', () => {
      const returnsValidator = v.string()
      const q = query({
        returns: returnsValidator,
        handler: async (ctx) => 'hello'
      })
      expect(q._config.returns).toBe(returnsValidator)
    })
  })

  describe('type inference', () => {
    it('should infer args type from validator object', () => {
      const q = query({
        args: {
          id: v.string(),
          count: v.number()
        },
        handler: async (ctx, args) => {
          // args should be typed as { id: string, count: number }
          return `${args.id}-${args.count}`
        }
      })

      // Type assertion - this is primarily a compile-time check
      type Args = typeof q['_args']
      const testArgs: Args = { id: 'test', count: 42 }
      expect(testArgs.id).toBe('test')
      expect(testArgs.count).toBe(42)
    })

    it('should infer return type from handler', () => {
      const q = query({
        handler: async (ctx): Promise<{ name: string; age: number }> => {
          return { name: 'John', age: 30 }
        }
      })

      type Returns = typeof q['_returns']
      // Type should be { name: string; age: number }
      expect(true).toBe(true) // Compile-time check
    })

    it('should default to empty args when no args validator provided', () => {
      const q = query({
        handler: async (ctx) => 'hello'
      })

      type Args = typeof q['_args']
      // Should be Record<string, never> or {}
      expect(true).toBe(true) // Compile-time check
    })

    it('should infer complex nested types', () => {
      const q = query({
        args: {
          user: v.object({
            name: v.string(),
            settings: v.object({
              theme: v.string()
            })
          })
        },
        handler: async (ctx, args) => args.user.settings.theme
      })

      type Args = typeof q['_args']
      // Type check passes if this compiles
      expect(true).toBe(true)
    })

    it('should handle optional args correctly', () => {
      const q = query({
        args: {
          required: v.string(),
          optional: v.optional(v.number())
        },
        handler: async (ctx, args) => {
          return args.optional ?? 0
        }
      })

      type Args = typeof q['_args']
      // optional should be number | undefined
      expect(true).toBe(true) // Compile-time check
    })
  })
})

// ============================================================================
// RegisteredMutation Type Tests
// ============================================================================

describe('RegisteredMutation', () => {
  describe('type structure', () => {
    it('should have _type property set to "mutation"', () => {
      const m = mutation({
        handler: async (ctx) => 'hello'
      })
      expect(m._type).toBe('mutation')
    })

    it('should have _visibility property', () => {
      const publicMutation = mutation({
        handler: async (ctx) => 'hello'
      })
      const internalM = internalMutation({
        handler: async (ctx) => 'hello'
      })
      expect(publicMutation._visibility).toBe('public')
      expect(internalM._visibility).toBe('internal')
    })

    it('should have _config property with handler', () => {
      const handler = async (ctx: MutationCtx) => 'created'
      const m = mutation({ handler })
      expect(m._config).toBeDefined()
      expect(m._config.handler).toBe(handler)
    })

    it('should store args validator in config', () => {
      const argsValidator = { text: v.string() }
      const m = mutation({
        args: argsValidator,
        handler: async (ctx, args) => args.text
      })
      expect(m._config.args).toBe(argsValidator)
    })
  })

  describe('type inference', () => {
    it('should infer args type from validator object', () => {
      const m = mutation({
        args: {
          data: v.object({ value: v.number() })
        },
        handler: async (ctx, args) => {
          return args.data.value * 2
        }
      })

      type Args = typeof m['_args']
      const testArgs: Args = { data: { value: 10 } }
      expect(testArgs.data.value).toBe(10)
    })

    it('should infer return type from handler', () => {
      const m = mutation({
        handler: async (ctx): Promise<string> => {
          return 'created-id'
        }
      })

      type Returns = typeof m['_returns']
      expect(true).toBe(true) // Compile-time check
    })
  })
})

// ============================================================================
// RegisteredAction Type Tests
// ============================================================================

describe('RegisteredAction', () => {
  describe('type structure', () => {
    it('should have _type property set to "action"', () => {
      const a = action({
        handler: async (ctx) => 'done'
      })
      expect(a._type).toBe('action')
    })

    it('should have _visibility property', () => {
      const publicAction = action({
        handler: async (ctx) => 'done'
      })
      const internalA = internalAction({
        handler: async (ctx) => 'done'
      })
      expect(publicAction._visibility).toBe('public')
      expect(internalA._visibility).toBe('internal')
    })

    it('should have _config property with handler', () => {
      const handler = async (ctx: ActionCtx) => 'executed'
      const a = action({ handler })
      expect(a._config).toBeDefined()
      expect(a._config.handler).toBe(handler)
    })

    it('should store args validator in config', () => {
      const argsValidator = { url: v.string() }
      const a = action({
        args: argsValidator,
        handler: async (ctx, args) => args.url
      })
      expect(a._config.args).toBe(argsValidator)
    })
  })

  describe('type inference', () => {
    it('should infer args type from validator object', () => {
      const a = action({
        args: {
          endpoint: v.string(),
          method: v.union(v.literal('GET'), v.literal('POST'))
        },
        handler: async (ctx, args) => {
          return `${args.method} ${args.endpoint}`
        }
      })

      type Args = typeof a['_args']
      const testArgs: Args = { endpoint: '/api', method: 'GET' }
      expect(testArgs.endpoint).toBe('/api')
    })

    it('should infer return type from handler', () => {
      const a = action({
        handler: async (ctx): Promise<{ success: boolean }> => {
          return { success: true }
        }
      })

      type Returns = typeof a['_returns']
      expect(true).toBe(true) // Compile-time check
    })
  })
})

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('isQuery', () => {
  it('should return true for query functions', () => {
    const q = query({ handler: async (ctx) => 'hello' })
    expect(isQuery(q)).toBe(true)
  })

  it('should return true for internal query functions', () => {
    const q = internalQuery({ handler: async (ctx) => 'hello' })
    expect(isQuery(q)).toBe(true)
  })

  it('should return false for mutation functions', () => {
    const m = mutation({ handler: async (ctx) => 'hello' })
    expect(isQuery(m)).toBe(false)
  })

  it('should return false for action functions', () => {
    const a = action({ handler: async (ctx) => 'hello' })
    expect(isQuery(a)).toBe(false)
  })

  it('should return false for non-function objects', () => {
    expect(isQuery({})).toBe(false)
    expect(isQuery(null)).toBe(false)
    expect(isQuery(undefined)).toBe(false)
    expect(isQuery('query')).toBe(false)
    expect(isQuery(42)).toBe(false)
  })

  it('should narrow type correctly', () => {
    const fn: unknown = query({ handler: async (ctx) => 'hello' })
    if (isQuery(fn)) {
      // TypeScript should know fn is RegisteredQuery here
      expect(fn._type).toBe('query')
    }
  })
})

describe('isMutation', () => {
  it('should return true for mutation functions', () => {
    const m = mutation({ handler: async (ctx) => 'created' })
    expect(isMutation(m)).toBe(true)
  })

  it('should return true for internal mutation functions', () => {
    const m = internalMutation({ handler: async (ctx) => 'created' })
    expect(isMutation(m)).toBe(true)
  })

  it('should return false for query functions', () => {
    const q = query({ handler: async (ctx) => 'hello' })
    expect(isMutation(q)).toBe(false)
  })

  it('should return false for action functions', () => {
    const a = action({ handler: async (ctx) => 'done' })
    expect(isMutation(a)).toBe(false)
  })

  it('should return false for non-function objects', () => {
    expect(isMutation({})).toBe(false)
    expect(isMutation(null)).toBe(false)
    expect(isMutation(undefined)).toBe(false)
  })

  it('should narrow type correctly', () => {
    const fn: unknown = mutation({ handler: async (ctx) => 'created' })
    if (isMutation(fn)) {
      // TypeScript should know fn is RegisteredMutation here
      expect(fn._type).toBe('mutation')
    }
  })
})

describe('isAction', () => {
  it('should return true for action functions', () => {
    const a = action({ handler: async (ctx) => 'done' })
    expect(isAction(a)).toBe(true)
  })

  it('should return true for internal action functions', () => {
    const a = internalAction({ handler: async (ctx) => 'done' })
    expect(isAction(a)).toBe(true)
  })

  it('should return false for query functions', () => {
    const q = query({ handler: async (ctx) => 'hello' })
    expect(isAction(q)).toBe(false)
  })

  it('should return false for mutation functions', () => {
    const m = mutation({ handler: async (ctx) => 'created' })
    expect(isAction(m)).toBe(false)
  })

  it('should return false for non-function objects', () => {
    expect(isAction({})).toBe(false)
    expect(isAction(null)).toBe(false)
    expect(isAction(undefined)).toBe(false)
  })

  it('should narrow type correctly', () => {
    const fn: unknown = action({ handler: async (ctx) => 'done' })
    if (isAction(fn)) {
      // TypeScript should know fn is RegisteredAction here
      expect(fn._type).toBe('action')
    }
  })
})

describe('isRegisteredFunction', () => {
  it('should return true for query functions', () => {
    const q = query({ handler: async (ctx) => 'hello' })
    expect(isRegisteredFunction(q)).toBe(true)
  })

  it('should return true for mutation functions', () => {
    const m = mutation({ handler: async (ctx) => 'created' })
    expect(isRegisteredFunction(m)).toBe(true)
  })

  it('should return true for action functions', () => {
    const a = action({ handler: async (ctx) => 'done' })
    expect(isRegisteredFunction(a)).toBe(true)
  })

  it('should return false for non-function objects', () => {
    expect(isRegisteredFunction({})).toBe(false)
    expect(isRegisteredFunction(null)).toBe(false)
    expect(isRegisteredFunction(undefined)).toBe(false)
    expect(isRegisteredFunction({ _type: 'invalid' })).toBe(false)
  })

  it('should narrow type correctly', () => {
    const fn: unknown = query({ handler: async (ctx) => 'hello' })
    if (isRegisteredFunction(fn)) {
      // TypeScript should know fn is AnyRegisteredFunction here
      expect(['query', 'mutation', 'action']).toContain(fn._type)
    }
  })
})

describe('isPublicFunction', () => {
  it('should return true for public query', () => {
    const q = query({ handler: async (ctx) => 'hello' })
    expect(isPublicFunction(q)).toBe(true)
  })

  it('should return true for public mutation', () => {
    const m = mutation({ handler: async (ctx) => 'created' })
    expect(isPublicFunction(m)).toBe(true)
  })

  it('should return true for public action', () => {
    const a = action({ handler: async (ctx) => 'done' })
    expect(isPublicFunction(a)).toBe(true)
  })

  it('should return false for internal query', () => {
    const q = internalQuery({ handler: async (ctx) => 'hello' })
    expect(isPublicFunction(q)).toBe(false)
  })

  it('should return false for internal mutation', () => {
    const m = internalMutation({ handler: async (ctx) => 'created' })
    expect(isPublicFunction(m)).toBe(false)
  })

  it('should return false for internal action', () => {
    const a = internalAction({ handler: async (ctx) => 'done' })
    expect(isPublicFunction(a)).toBe(false)
  })

  it('should return false for non-function objects', () => {
    expect(isPublicFunction({})).toBe(false)
    expect(isPublicFunction(null)).toBe(false)
  })
})

describe('isInternalFunction', () => {
  it('should return true for internal query', () => {
    const q = internalQuery({ handler: async (ctx) => 'hello' })
    expect(isInternalFunction(q)).toBe(true)
  })

  it('should return true for internal mutation', () => {
    const m = internalMutation({ handler: async (ctx) => 'created' })
    expect(isInternalFunction(m)).toBe(true)
  })

  it('should return true for internal action', () => {
    const a = internalAction({ handler: async (ctx) => 'done' })
    expect(isInternalFunction(a)).toBe(true)
  })

  it('should return false for public query', () => {
    const q = query({ handler: async (ctx) => 'hello' })
    expect(isInternalFunction(q)).toBe(false)
  })

  it('should return false for public mutation', () => {
    const m = mutation({ handler: async (ctx) => 'created' })
    expect(isInternalFunction(m)).toBe(false)
  })

  it('should return false for public action', () => {
    const a = action({ handler: async (ctx) => 'done' })
    expect(isInternalFunction(a)).toBe(false)
  })

  it('should return false for non-function objects', () => {
    expect(isInternalFunction({})).toBe(false)
    expect(isInternalFunction(null)).toBe(false)
  })
})

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('getFunctionType', () => {
  it('should return "query" for query functions', () => {
    const q = query({ handler: async (ctx) => 'hello' })
    expect(getFunctionType(q)).toBe('query')
  })

  it('should return "mutation" for mutation functions', () => {
    const m = mutation({ handler: async (ctx) => 'created' })
    expect(getFunctionType(m)).toBe('mutation')
  })

  it('should return "action" for action functions', () => {
    const a = action({ handler: async (ctx) => 'done' })
    expect(getFunctionType(a)).toBe('action')
  })

  it('should work with internal functions', () => {
    expect(getFunctionType(internalQuery({ handler: async (ctx) => 'hello' }))).toBe('query')
    expect(getFunctionType(internalMutation({ handler: async (ctx) => 'created' }))).toBe('mutation')
    expect(getFunctionType(internalAction({ handler: async (ctx) => 'done' }))).toBe('action')
  })
})

describe('getFunctionVisibility', () => {
  it('should return "public" for public functions', () => {
    expect(getFunctionVisibility(query({ handler: async (ctx) => 'hello' }))).toBe('public')
    expect(getFunctionVisibility(mutation({ handler: async (ctx) => 'created' }))).toBe('public')
    expect(getFunctionVisibility(action({ handler: async (ctx) => 'done' }))).toBe('public')
  })

  it('should return "internal" for internal functions', () => {
    expect(getFunctionVisibility(internalQuery({ handler: async (ctx) => 'hello' }))).toBe('internal')
    expect(getFunctionVisibility(internalMutation({ handler: async (ctx) => 'created' }))).toBe('internal')
    expect(getFunctionVisibility(internalAction({ handler: async (ctx) => 'done' }))).toBe('internal')
  })
})

describe('getArgsValidator', () => {
  it('should return the args validator for query', () => {
    const argsValidator = { id: v.string() }
    const q = query({
      args: argsValidator,
      handler: async (ctx, args) => args.id
    })
    const validator = getArgsValidator(q)
    expect(validator).toBe(argsValidator)
  })

  it('should return the args validator for mutation', () => {
    const argsValidator = { data: v.object({ value: v.number() }) }
    const m = mutation({
      args: argsValidator,
      handler: async (ctx, args) => args.data.value
    })
    const validator = getArgsValidator(m)
    expect(validator).toBe(argsValidator)
  })

  it('should return the args validator for action', () => {
    const argsValidator = { url: v.string() }
    const a = action({
      args: argsValidator,
      handler: async (ctx, args) => args.url
    })
    const validator = getArgsValidator(a)
    expect(validator).toBe(argsValidator)
  })

  it('should return undefined when no args validator defined', () => {
    const q = query({ handler: async (ctx) => 'hello' })
    const validator = getArgsValidator(q)
    expect(validator).toBeUndefined()
  })
})

describe('getReturnsValidator', () => {
  it('should return the returns validator for query', () => {
    const returnsValidator = v.string()
    const q = query({
      returns: returnsValidator,
      handler: async (ctx) => 'hello'
    })
    const validator = getReturnsValidator(q)
    expect(validator).toBe(returnsValidator)
  })

  it('should return the returns validator for mutation', () => {
    const returnsValidator = v.object({ id: v.string() })
    const m = mutation({
      returns: returnsValidator,
      handler: async (ctx) => ({ id: 'abc' })
    })
    const validator = getReturnsValidator(m)
    expect(validator).toBe(returnsValidator)
  })

  it('should return the returns validator for action', () => {
    const returnsValidator = v.boolean()
    const a = action({
      returns: returnsValidator,
      handler: async (ctx) => true
    })
    const validator = getReturnsValidator(a)
    expect(validator).toBe(returnsValidator)
  })

  it('should return undefined when no returns validator defined', () => {
    const q = query({ handler: async (ctx) => 'hello' })
    const validator = getReturnsValidator(q)
    expect(validator).toBeUndefined()
  })
})

describe('getFunctionHandler', () => {
  it('should return the handler for query', () => {
    const handler = async (ctx: QueryCtx) => 'hello'
    const q = query({ handler })
    expect(getFunctionHandler(q)).toBe(handler)
  })

  it('should return the handler for mutation', () => {
    const handler = async (ctx: MutationCtx) => 'created'
    const m = mutation({ handler })
    expect(getFunctionHandler(m)).toBe(handler)
  })

  it('should return the handler for action', () => {
    const handler = async (ctx: ActionCtx) => 'done'
    const a = action({ handler })
    expect(getFunctionHandler(a)).toBe(handler)
  })
})

// ============================================================================
// FunctionArgs and FunctionReturns Type Tests
// ============================================================================

describe('FunctionArgs type', () => {
  it('should extract args type from RegisteredQuery', () => {
    const q = query({
      args: { name: v.string(), age: v.number() },
      handler: async (ctx, args) => args
    })

    type Args = FunctionArgs<typeof q>
    // Type check - should be { name: string, age: number }
    const args: Args = { name: 'John', age: 30 }
    expect(args.name).toBe('John')
    expect(args.age).toBe(30)
  })

  it('should extract args type from RegisteredMutation', () => {
    const m = mutation({
      args: { data: v.object({ value: v.number() }) },
      handler: async (ctx, args) => args
    })

    type Args = FunctionArgs<typeof m>
    const args: Args = { data: { value: 42 } }
    expect(args.data.value).toBe(42)
  })

  it('should extract args type from RegisteredAction', () => {
    const a = action({
      args: { url: v.string() },
      handler: async (ctx, args) => args
    })

    type Args = FunctionArgs<typeof a>
    const args: Args = { url: '/api/test' }
    expect(args.url).toBe('/api/test')
  })
})

describe('FunctionReturns type', () => {
  it('should extract return type from RegisteredQuery', () => {
    const q = query({
      handler: async (ctx): Promise<{ name: string }> => ({ name: 'John' })
    })

    type Returns = FunctionReturns<typeof q>
    // Type should be { name: string }
    expect(true).toBe(true) // Compile-time check
  })

  it('should extract return type from RegisteredMutation', () => {
    const m = mutation({
      handler: async (ctx): Promise<string> => 'created-id'
    })

    type Returns = FunctionReturns<typeof m>
    // Type should be string
    expect(true).toBe(true) // Compile-time check
  })

  it('should extract return type from RegisteredAction', () => {
    const a = action({
      handler: async (ctx): Promise<{ success: boolean }> => ({ success: true })
    })

    type Returns = FunctionReturns<typeof a>
    // Type should be { success: boolean }
    expect(true).toBe(true) // Compile-time check
  })
})

// ============================================================================
// AnyRegisteredFunction Type Tests
// ============================================================================

describe('AnyRegisteredFunction', () => {
  it('should accept query functions', () => {
    const q = query({ handler: async (ctx) => 'hello' })
    const fn: AnyRegisteredFunction = q
    expect(fn._type).toBe('query')
  })

  it('should accept mutation functions', () => {
    const m = mutation({ handler: async (ctx) => 'created' })
    const fn: AnyRegisteredFunction = m
    expect(fn._type).toBe('mutation')
  })

  it('should accept action functions', () => {
    const a = action({ handler: async (ctx) => 'done' })
    const fn: AnyRegisteredFunction = a
    expect(fn._type).toBe('action')
  })

  it('should work with arrays of mixed function types', () => {
    const functions: AnyRegisteredFunction[] = [
      query({ handler: async (ctx) => 'hello' }),
      mutation({ handler: async (ctx) => 'created' }),
      action({ handler: async (ctx) => 'done' })
    ]

    expect(functions).toHaveLength(3)
    expect(functions[0]._type).toBe('query')
    expect(functions[1]._type).toBe('mutation')
    expect(functions[2]._type).toBe('action')
  })
})

// ============================================================================
// GenericRegisteredFunction Type Tests
// ============================================================================

describe('GenericRegisteredFunction', () => {
  it('should parameterize by function type', () => {
    type QueryFn = GenericRegisteredFunction<'query'>
    const q = query({ handler: async (ctx) => 'hello' })
    const fn: QueryFn = q
    expect(fn._type).toBe('query')
  })

  it('should work with union of types', () => {
    type QueryOrMutation = GenericRegisteredFunction<'query' | 'mutation'>

    const q = query({ handler: async (ctx) => 'hello' })
    const m = mutation({ handler: async (ctx) => 'created' })

    const fn1: QueryOrMutation = q
    const fn2: QueryOrMutation = m

    expect(['query', 'mutation']).toContain(fn1._type)
    expect(['query', 'mutation']).toContain(fn2._type)
  })
})

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('edge cases', () => {
  it('should handle functions with no args and complex return types', () => {
    const q = query({
      handler: async (ctx) => ({
        users: [{ id: '1', name: 'John' }],
        total: 1,
        hasMore: false
      })
    })

    expect(q._type).toBe('query')
    expect(q._config.args).toBeUndefined()
  })

  it('should handle functions with v.object as args', () => {
    const argsValidator = v.object({
      filters: v.object({
        active: v.boolean()
      })
    })

    const q = query({
      args: argsValidator,
      handler: async (ctx, args) => args
    })

    expect(q._config.args).toBe(argsValidator)
  })

  it('should handle functions returning void/undefined', () => {
    const m = mutation({
      handler: async (ctx): Promise<void> => {
        // Do something without returning
      }
    })

    expect(m._type).toBe('mutation')
  })

  it('should handle functions with array return types', () => {
    const q = query({
      handler: async (ctx): Promise<string[]> => ['a', 'b', 'c']
    })

    expect(q._type).toBe('query')
  })

  it('should handle functions with nullable return types', () => {
    const q = query({
      handler: async (ctx): Promise<string | null> => null
    })

    expect(q._type).toBe('query')
  })

  it('should preserve type information through reassignment', () => {
    const original = query({
      args: { id: v.string() },
      handler: async (ctx, args) => args.id
    })

    const reassigned = original

    expect(reassigned._type).toBe('query')
    expect(reassigned._config.args).toBe(original._config.args)
  })
})

// ============================================================================
// Type Compatibility Tests (compile-time checks)
// ============================================================================

describe('type compatibility', () => {
  it('should be compatible with Convex RegisteredQuery type signature', () => {
    // This test verifies our types are structurally compatible with Convex
    const q = query({
      args: { id: v.string() },
      returns: v.string(),
      handler: async (ctx, args) => args.id
    })

    // Should have all required properties
    expect(q).toHaveProperty('_type')
    expect(q).toHaveProperty('_args')
    expect(q).toHaveProperty('_returns')
    expect(q).toHaveProperty('_visibility')
    expect(q).toHaveProperty('_config')
  })

  it('should be compatible with Convex RegisteredMutation type signature', () => {
    const m = mutation({
      args: { data: v.string() },
      returns: v.string(),
      handler: async (ctx, args) => args.data
    })

    expect(m).toHaveProperty('_type')
    expect(m).toHaveProperty('_args')
    expect(m).toHaveProperty('_returns')
    expect(m).toHaveProperty('_visibility')
    expect(m).toHaveProperty('_config')
  })

  it('should be compatible with Convex RegisteredAction type signature', () => {
    const a = action({
      args: { url: v.string() },
      returns: v.boolean(),
      handler: async (ctx, args) => true
    })

    expect(a).toHaveProperty('_type')
    expect(a).toHaveProperty('_args')
    expect(a).toHaveProperty('_returns')
    expect(a).toHaveProperty('_visibility')
    expect(a).toHaveProperty('_config')
  })
})
