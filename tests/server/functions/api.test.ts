/**
 * Tests for FunctionReference Types and api() Generation
 *
 * This module tests:
 * - FunctionReference<Type, Args, Returns> type
 * - api object generation
 * - Type-safe function references
 * - makeFunctionReference helper
 * - Function path resolution
 * - Nested module references (api.users.get)
 */

import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  FunctionReference,
  GenericFunctionReference,
  makeFunctionReference,
  makeQueryReference,
  makeMutationReference,
  makeActionReference,
  getFunctionName,
  createApi,
  createInternalApi,
  functionName,
  AnyFunctionReference,
  QueryReference,
  MutationReference,
  ActionReference,
  FilterByFunctionType,
  FunctionArgs,
  FunctionReturnType,
  FunctionVisibility,
  OptionalRestArgs,
  ArgsAndOptions,
  FunctionType,
  RegisteredFunction,
  createFunctionHandle,
  parseFunctionPath,
  SchedulableFunctionReference,
} from '../../../src/server/functions/api'

// ============================================================================
// FunctionReference Type Tests
// ============================================================================

describe('FunctionReference Type', () => {
  describe('basic structure', () => {
    it('should have correct type structure', () => {
      const ref: FunctionReference<'query', { id: string }, string | null> = {
        _type: 'query',
        _args: {} as { id: string },
        _returns: null as string | null,
        _path: 'users:get',
        _visibility: 'public',
      }

      expect(ref._type).toBe('query')
      expect(ref._path).toBe('users:get')
      expect(ref._visibility).toBe('public')
    })

    it('should support query type references', () => {
      const ref: FunctionReference<'query', { userId: string }, { name: string }> = {
        _type: 'query',
        _args: {} as { userId: string },
        _returns: {} as { name: string },
        _path: 'users:getById',
        _visibility: 'public',
      }

      expect(ref._type).toBe('query')
    })

    it('should support mutation type references', () => {
      const ref: FunctionReference<'mutation', { name: string }, string> = {
        _type: 'mutation',
        _args: {} as { name: string },
        _returns: '' as string,
        _path: 'users:create',
        _visibility: 'public',
      }

      expect(ref._type).toBe('mutation')
    })

    it('should support action type references', () => {
      const ref: FunctionReference<'action', { to: string; subject: string }, void> = {
        _type: 'action',
        _args: {} as { to: string; subject: string },
        _returns: undefined as void,
        _path: 'email:send',
        _visibility: 'public',
      }

      expect(ref._type).toBe('action')
    })
  })

  describe('visibility', () => {
    it('should support public visibility', () => {
      const ref: FunctionReference<'query', {}, string, 'public'> = {
        _type: 'query',
        _args: {},
        _returns: '' as string,
        _path: 'users:list',
        _visibility: 'public',
      }

      expect(ref._visibility).toBe('public')
    })

    it('should support internal visibility', () => {
      const ref: FunctionReference<'query', {}, string, 'internal'> = {
        _type: 'query',
        _args: {},
        _returns: '' as string,
        _path: 'users:getInternal',
        _visibility: 'internal',
      }

      expect(ref._visibility).toBe('internal')
    })
  })

  describe('generic function reference', () => {
    it('should work with any function type', () => {
      const queryRef: GenericFunctionReference<'query'> = {
        _type: 'query',
        _args: {} as unknown,
        _returns: undefined as unknown,
        _path: 'test:query',
        _visibility: 'public',
      }

      const mutationRef: GenericFunctionReference<'mutation'> = {
        _type: 'mutation',
        _args: {} as unknown,
        _returns: undefined as unknown,
        _path: 'test:mutation',
        _visibility: 'public',
      }

      expect(queryRef._type).toBe('query')
      expect(mutationRef._type).toBe('mutation')
    })
  })
})

// ============================================================================
// makeFunctionReference Helper Tests
// ============================================================================

describe('makeFunctionReference', () => {
  it('should create a query reference', () => {
    const ref = makeFunctionReference<'query', { id: string }, string | null>(
      'users:get'
    )

    expect(ref._type).toBe('query')
    expect(ref._path).toBe('users:get')
    expect(ref._visibility).toBe('public')
  })

  it('should create a mutation reference', () => {
    const ref = makeMutationReference<{ name: string }, string>(
      'users:create'
    )

    expect(ref._type).toBe('mutation')
    expect(ref._path).toBe('users:create')
    expect(ref._visibility).toBe('public')
  })

  it('should create an action reference', () => {
    const ref = makeActionReference<{ to: string }, void>(
      'email:send'
    )

    expect(ref._type).toBe('action')
    expect(ref._path).toBe('email:send')
    expect(ref._visibility).toBe('public')
  })

  it('should create internal references', () => {
    const ref = makeFunctionReference<'query', {}, string, 'internal'>(
      'users:getInternal',
      'internal'
    )

    expect(ref._visibility).toBe('internal')
  })

  it('should handle nested module paths', () => {
    const ref = makeFunctionReference<'query', {}, string[]>(
      'admin/users:list'
    )

    expect(ref._path).toBe('admin/users:list')
  })

  it('should handle deeply nested paths', () => {
    const ref = makeFunctionReference<'mutation', { data: object }, void>(
      'api/v2/admin/settings:update'
    )

    expect(ref._path).toBe('api/v2/admin/settings:update')
  })
})

// ============================================================================
// getFunctionName Tests
// ============================================================================

describe('getFunctionName', () => {
  it('should extract function name from reference', () => {
    const ref = makeFunctionReference<'query', {}, string>('users:get')
    expect(getFunctionName(ref)).toBe('users:get')
  })

  it('should work with nested paths', () => {
    const ref = makeFunctionReference<'mutation', {}, void>('admin/users:create')
    expect(getFunctionName(ref)).toBe('admin/users:create')
  })

  it('should work with any function type', () => {
    const queryRef = makeFunctionReference<'query', {}, void>('test:q')
    const mutationRef = makeFunctionReference<'mutation', {}, void>('test:m')
    const actionRef = makeFunctionReference<'action', {}, void>('test:a')

    expect(getFunctionName(queryRef)).toBe('test:q')
    expect(getFunctionName(mutationRef)).toBe('test:m')
    expect(getFunctionName(actionRef)).toBe('test:a')
  })
})

// ============================================================================
// parseFunctionPath Tests
// ============================================================================

describe('parseFunctionPath', () => {
  it('should parse simple function paths', () => {
    const result = parseFunctionPath('users:get')
    expect(result).toEqual({
      module: 'users',
      functionName: 'get',
      fullPath: 'users:get',
    })
  })

  it('should parse nested module paths', () => {
    const result = parseFunctionPath('admin/users:list')
    expect(result).toEqual({
      module: 'admin/users',
      functionName: 'list',
      fullPath: 'admin/users:list',
    })
  })

  it('should parse deeply nested paths', () => {
    const result = parseFunctionPath('api/v2/settings:update')
    expect(result).toEqual({
      module: 'api/v2/settings',
      functionName: 'update',
      fullPath: 'api/v2/settings:update',
    })
  })

  it('should handle paths with no module', () => {
    const result = parseFunctionPath('myFunction')
    expect(result).toEqual({
      module: '',
      functionName: 'myFunction',
      fullPath: 'myFunction',
    })
  })
})

// ============================================================================
// createApi Tests
// ============================================================================

describe('createApi', () => {
  it('should create an api object from registered functions', () => {
    const registeredFunctions = {
      'users:get': { _type: 'query', _visibility: 'public' },
      'users:create': { _type: 'mutation', _visibility: 'public' },
      'users:delete': { _type: 'mutation', _visibility: 'public' },
    } as Record<string, RegisteredFunction>

    const api = createApi(registeredFunctions)

    expect(api.users).toBeDefined()
    expect(api.users.get).toBeDefined()
    expect(api.users.get._path).toBe('users:get')
    expect(api.users.get._type).toBe('query')
    expect(api.users.create._path).toBe('users:create')
    expect(api.users.delete._path).toBe('users:delete')
  })

  it('should handle nested module paths', () => {
    const registeredFunctions = {
      'admin/users:list': { _type: 'query', _visibility: 'public' },
      'admin/users:ban': { _type: 'mutation', _visibility: 'public' },
    } as Record<string, RegisteredFunction>

    const api = createApi(registeredFunctions)

    expect(api.admin).toBeDefined()
    expect(api.admin.users).toBeDefined()
    expect(api.admin.users.list._path).toBe('admin/users:list')
    expect(api.admin.users.ban._path).toBe('admin/users:ban')
  })

  it('should only include public functions', () => {
    const registeredFunctions = {
      'users:list': { _type: 'query', _visibility: 'public' },
      'users:getSecret': { _type: 'query', _visibility: 'internal' },
    } as Record<string, RegisteredFunction>

    const api = createApi(registeredFunctions)

    expect(api.users.list).toBeDefined()
    expect(api.users.getSecret).toBeUndefined()
  })

  it('should handle empty function registry', () => {
    const api = createApi({})
    expect(api).toEqual({})
  })

  it('should handle mixed module depths', () => {
    const registeredFunctions = {
      'users:get': { _type: 'query', _visibility: 'public' },
      'admin/settings:get': { _type: 'query', _visibility: 'public' },
      'api/v2/admin/users:list': { _type: 'query', _visibility: 'public' },
    } as Record<string, RegisteredFunction>

    const api = createApi(registeredFunctions)

    expect(api.users.get._path).toBe('users:get')
    expect(api.admin.settings.get._path).toBe('admin/settings:get')
    expect(api.api.v2.admin.users.list._path).toBe('api/v2/admin/users:list')
  })
})

// ============================================================================
// createInternalApi Tests
// ============================================================================

describe('createInternalApi', () => {
  it('should create an internal api object from registered functions', () => {
    const registeredFunctions = {
      'users:getInternal': { _type: 'query', _visibility: 'internal' },
      'users:createInternal': { _type: 'mutation', _visibility: 'internal' },
    } as Record<string, RegisteredFunction>

    const internal = createInternalApi(registeredFunctions)

    expect(internal.users).toBeDefined()
    expect(internal.users.getInternal._path).toBe('users:getInternal')
    expect(internal.users.getInternal._visibility).toBe('internal')
  })

  it('should only include internal functions', () => {
    const registeredFunctions = {
      'users:list': { _type: 'query', _visibility: 'public' },
      'users:getSecret': { _type: 'query', _visibility: 'internal' },
    } as Record<string, RegisteredFunction>

    const internal = createInternalApi(registeredFunctions)

    expect(internal.users.list).toBeUndefined()
    expect(internal.users.getSecret).toBeDefined()
  })

  it('should handle nested module paths', () => {
    const registeredFunctions = {
      'admin/secrets:get': { _type: 'query', _visibility: 'internal' },
    } as Record<string, RegisteredFunction>

    const internal = createInternalApi(registeredFunctions)

    expect(internal.admin.secrets.get._path).toBe('admin/secrets:get')
  })
})

// ============================================================================
// functionName Template Literal Tests
// ============================================================================

describe('functionName', () => {
  it('should work as a template literal tag', () => {
    const ref = functionName`users:get`
    expect(ref).toBe('users:get')
  })

  it('should handle interpolation', () => {
    const module = 'users'
    const func = 'create'
    const ref = functionName`${module}:${func}`
    expect(ref).toBe('users:create')
  })

  it('should validate function path format', () => {
    expect(() => functionName`invalid path with spaces`).toThrow()
  })
})

// ============================================================================
// Type Helper Tests
// ============================================================================

describe('Type Helpers', () => {
  describe('QueryReference', () => {
    it('should be a shorthand for query FunctionReference', () => {
      const ref: QueryReference<{ id: string }, string> = {
        _type: 'query',
        _args: {} as { id: string },
        _returns: '' as string,
        _path: 'test:query',
        _visibility: 'public',
      }

      expect(ref._type).toBe('query')
    })
  })

  describe('MutationReference', () => {
    it('should be a shorthand for mutation FunctionReference', () => {
      const ref: MutationReference<{ name: string }, string> = {
        _type: 'mutation',
        _args: {} as { name: string },
        _returns: '' as string,
        _path: 'test:mutation',
        _visibility: 'public',
      }

      expect(ref._type).toBe('mutation')
    })
  })

  describe('ActionReference', () => {
    it('should be a shorthand for action FunctionReference', () => {
      const ref: ActionReference<{ data: object }, void> = {
        _type: 'action',
        _args: {} as { data: object },
        _returns: undefined as void,
        _path: 'test:action',
        _visibility: 'public',
      }

      expect(ref._type).toBe('action')
    })
  })

  describe('AnyFunctionReference', () => {
    it('should accept any function reference type', () => {
      const queryRef: AnyFunctionReference = makeQueryReference<{}, void>('test:q')
      const mutationRef: AnyFunctionReference = makeMutationReference<{}, void>('test:m')
      const actionRef: AnyFunctionReference = makeActionReference<{}, void>('test:a')

      expect(queryRef._type).toBe('query')
      expect(mutationRef._type).toBe('mutation')
      expect(actionRef._type).toBe('action')
    })
  })

  describe('FilterByFunctionType', () => {
    it('should filter references by type', () => {
      type API = {
        users: {
          get: FunctionReference<'query', { id: string }, object>
          create: FunctionReference<'mutation', { name: string }, string>
          sendWelcome: FunctionReference<'action', { userId: string }, void>
        }
      }

      type Queries = FilterByFunctionType<API, 'query'>
      type Mutations = FilterByFunctionType<API, 'mutation'>
      type Actions = FilterByFunctionType<API, 'action'>

      // Type-level tests would be checked by TypeScript compiler
      const queryCheck: Queries = {} as Queries
      const mutationCheck: Mutations = {} as Mutations
      const actionCheck: Actions = {} as Actions

      expect(queryCheck).toBeDefined()
      expect(mutationCheck).toBeDefined()
      expect(actionCheck).toBeDefined()
    })
  })

  describe('FunctionArgs', () => {
    it('should extract args type from reference', () => {
      type Ref = FunctionReference<'query', { id: string; name: string }, object>
      type Args = FunctionArgs<Ref>

      const args: Args = { id: 'test', name: 'test' }
      expect(args.id).toBe('test')
      expect(args.name).toBe('test')
    })
  })

  describe('FunctionReturnType', () => {
    it('should extract return type from reference', () => {
      type Ref = FunctionReference<'query', {}, { id: string; name: string }>
      type Returns = FunctionReturnType<Ref>

      const result: Returns = { id: 'test', name: 'test' }
      expect(result.id).toBe('test')
    })
  })
})

// ============================================================================
// OptionalRestArgs Tests
// ============================================================================

describe('OptionalRestArgs', () => {
  it('should make args optional when they are empty object', () => {
    type EmptyRef = FunctionReference<'query', Record<string, never>, void>
    type RestArgs = OptionalRestArgs<EmptyRef>

    // When args are empty, rest args should be optional (empty tuple or single empty object)
    const emptyArgs: RestArgs = []
    const withEmptyObj: RestArgs = [{}]

    expect(emptyArgs.length).toBe(0)
    expect(withEmptyObj.length).toBe(1)
  })

  it('should require args when they exist', () => {
    type RefWithArgs = FunctionReference<'query', { id: string }, void>
    type RestArgs = OptionalRestArgs<RefWithArgs>

    // When args exist, they must be provided
    const args: RestArgs = [{ id: 'test' }]
    expect(args[0].id).toBe('test')
  })
})

// ============================================================================
// ArgsAndOptions Tests
// ============================================================================

describe('ArgsAndOptions', () => {
  it('should combine args with options', () => {
    type Ref = FunctionReference<'query', { id: string }, void>
    type Options = { cache?: boolean }
    type Combined = ArgsAndOptions<Ref, Options>

    const combined: Combined = [{ id: 'test' }, { cache: true }]
    expect(combined[0].id).toBe('test')
    expect(combined[1]?.cache).toBe(true)
  })

  it('should allow omitting options', () => {
    type Ref = FunctionReference<'query', { id: string }, void>
    type Options = { cache?: boolean }
    type Combined = ArgsAndOptions<Ref, Options>

    const withoutOptions: Combined = [{ id: 'test' }]
    expect(withoutOptions.length).toBe(1)
  })
})

// ============================================================================
// createFunctionHandle Tests
// ============================================================================

describe('createFunctionHandle', () => {
  it('should create a serializable function handle', () => {
    const ref = makeFunctionReference<'query', { id: string }, object>('users:get')
    const handle = createFunctionHandle(ref)

    expect(typeof handle).toBe('string')
    expect(handle).toBe('users:get')
  })

  it('should create handles for any function type', () => {
    const queryHandle = createFunctionHandle(
      makeFunctionReference<'query', {}, void>('test:q')
    )
    const mutationHandle = createFunctionHandle(
      makeFunctionReference<'mutation', {}, void>('test:m')
    )
    const actionHandle = createFunctionHandle(
      makeFunctionReference<'action', {}, void>('test:a')
    )

    expect(queryHandle).toBe('test:q')
    expect(mutationHandle).toBe('test:m')
    expect(actionHandle).toBe('test:a')
  })
})

// ============================================================================
// SchedulableFunctionReference Tests
// ============================================================================

describe('SchedulableFunctionReference', () => {
  it('should only allow mutations and actions', () => {
    // Mutations are schedulable
    const mutationRef: SchedulableFunctionReference = {
      _type: 'mutation',
      _args: {},
      _returns: undefined,
      _path: 'test:mutation',
      _visibility: 'public',
    }

    // Actions are schedulable
    const actionRef: SchedulableFunctionReference = {
      _type: 'action',
      _args: {},
      _returns: undefined,
      _path: 'test:action',
      _visibility: 'public',
    }

    expect(mutationRef._type).toBe('mutation')
    expect(actionRef._type).toBe('action')
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration Tests', () => {
  it('should work with a realistic api structure', () => {
    const registeredFunctions = {
      'users:list': { _type: 'query', _visibility: 'public' },
      'users:get': { _type: 'query', _visibility: 'public' },
      'users:create': { _type: 'mutation', _visibility: 'public' },
      'users:update': { _type: 'mutation', _visibility: 'public' },
      'users:delete': { _type: 'mutation', _visibility: 'public' },
      'messages:list': { _type: 'query', _visibility: 'public' },
      'messages:send': { _type: 'mutation', _visibility: 'public' },
      'email:send': { _type: 'action', _visibility: 'public' },
      'admin/analytics:getStats': { _type: 'query', _visibility: 'internal' },
    } as Record<string, RegisteredFunction>

    const api = createApi(registeredFunctions)
    const internal = createInternalApi(registeredFunctions)

    // Public API structure
    expect(api.users.list._type).toBe('query')
    expect(api.users.get._type).toBe('query')
    expect(api.users.create._type).toBe('mutation')
    expect(api.users.update._type).toBe('mutation')
    expect(api.users.delete._type).toBe('mutation')
    expect(api.messages.list._type).toBe('query')
    expect(api.messages.send._type).toBe('mutation')
    expect(api.email.send._type).toBe('action')

    // Internal functions should not be in public api
    expect(api.admin).toBeUndefined()

    // Internal API structure
    expect(internal.admin.analytics.getStats._type).toBe('query')
    expect(internal.admin.analytics.getStats._visibility).toBe('internal')
  })

  it('should provide type-safe references for ctx.runQuery', async () => {
    // Simulating how references would be used with runQuery
    const ref = makeFunctionReference<'query', { userId: string }, { name: string } | null>(
      'users:get'
    )

    // Mock runQuery function
    async function runQuery<
      F extends FunctionReference<'query', unknown, unknown>
    >(
      functionRef: F,
      args: FunctionArgs<F>
    ): Promise<FunctionReturnType<F>> {
      expect(functionRef._path).toBe('users:get')
      expect(args).toEqual({ userId: 'user123' })
      return { name: 'Alice' } as FunctionReturnType<F>
    }

    // This should type-check correctly
    const result = await runQuery(ref, { userId: 'user123' })
    expect(result).toEqual({ name: 'Alice' })
  })

  it('should provide type-safe references for ctx.runMutation', async () => {
    const ref = makeMutationReference<{ name: string }, string>(
      'users:create'
    )

    async function runMutation<
      F extends FunctionReference<'mutation', unknown, unknown>
    >(
      functionRef: F,
      args: FunctionArgs<F>
    ): Promise<FunctionReturnType<F>> {
      expect(functionRef._path).toBe('users:create')
      expect(args).toEqual({ name: 'Alice' })
      return 'user123' as FunctionReturnType<F>
    }

    const result = await runMutation(ref, { name: 'Alice' })
    expect(result).toBe('user123')
  })

  it('should provide type-safe references for ctx.runAction', async () => {
    const ref = makeActionReference<{ to: string; subject: string }, void>(
      'email:send'
    )

    async function runAction<
      F extends FunctionReference<'action', unknown, unknown>
    >(
      functionRef: F,
      args: FunctionArgs<F>
    ): Promise<FunctionReturnType<F>> {
      expect(functionRef._path).toBe('email:send')
      expect(args).toEqual({ to: 'alice@example.com', subject: 'Hello' })
      return undefined as FunctionReturnType<F>
    }

    const result = await runAction(ref, { to: 'alice@example.com', subject: 'Hello' })
    expect(result).toBeUndefined()
  })

  it('should work with scheduler.runAfter', async () => {
    const ref = makeMutationReference<{ data: object }, void>(
      'tasks:process'
    )

    // Mock scheduler
    const scheduler = {
      runAfter: async <F extends SchedulableFunctionReference>(
        delayMs: number,
        functionRef: F,
        args: FunctionArgs<F>
      ) => {
        expect(delayMs).toBe(5000)
        expect(functionRef._path).toBe('tasks:process')
        expect(args).toEqual({ data: { key: 'value' } })
        return 'scheduled-id-123'
      },
    }

    const result = await scheduler.runAfter(5000, ref, { data: { key: 'value' } })
    expect(result).toBe('scheduled-id-123')
  })
})

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases', () => {
  it('should handle function names with underscores', () => {
    const ref = makeFunctionReference<'query', {}, void>('users:get_by_id')
    expect(ref._path).toBe('users:get_by_id')
  })

  it('should handle single-letter module names', () => {
    const ref = makeFunctionReference<'query', {}, void>('a:b')
    expect(ref._path).toBe('a:b')
  })

  it('should handle numeric characters in paths', () => {
    const ref = makeFunctionReference<'query', {}, void>('v2/users:get')
    expect(ref._path).toBe('v2/users:get')
  })

  it('should handle complex arg types', () => {
    type ComplexArgs = {
      user: {
        id: string
        profile: {
          name: string
          age: number
        }
      }
      options?: {
        includeDeleted: boolean
      }
    }

    const ref = makeFunctionReference<'query', ComplexArgs, object>('users:getComplex')
    expect(ref._path).toBe('users:getComplex')
  })

  it('should handle array return types', () => {
    type ArrayReturn = { id: string; name: string }[]

    const ref = makeFunctionReference<'query', {}, ArrayReturn>('users:list')
    expect(ref._type).toBe('query')
  })

  it('should handle union return types', () => {
    type UnionReturn = { success: true; data: object } | { success: false; error: string }

    const ref = makeFunctionReference<'query', {}, UnionReturn>('api:result')
    expect(ref._type).toBe('query')
  })
})

// ============================================================================
// Type Safety Tests (compile-time checks)
// ============================================================================

describe('Type Safety', () => {
  it('should preserve type information through the chain', () => {
    type UserArgs = { id: string }
    type UserReturn = { id: string; name: string; email: string }

    const ref: FunctionReference<'query', UserArgs, UserReturn> = makeFunctionReference<
      'query',
      UserArgs,
      UserReturn
    >('users:get')

    // Type extraction should work
    type ExtractedArgs = FunctionArgs<typeof ref>
    type ExtractedReturn = FunctionReturnType<typeof ref>

    const args: ExtractedArgs = { id: 'test' }
    expect(args.id).toBe('test')

    const result: ExtractedReturn = { id: 'test', name: 'Test', email: 'test@test.com' }
    expect(result.name).toBe('Test')
  })

  it('should enforce correct function types', () => {
    // This test ensures the type system is working correctly
    // Using specialized factory functions for runtime type checking

    const queryRef = makeQueryReference<{}, void>('test:q')
    const mutationRef = makeMutationReference<{}, void>('test:m')
    const actionRef = makeActionReference<{}, void>('test:a')

    // Type guards or checks
    expect(queryRef._type).toBe('query')
    expect(mutationRef._type).toBe('mutation')
    expect(actionRef._type).toBe('action')
  })
})
