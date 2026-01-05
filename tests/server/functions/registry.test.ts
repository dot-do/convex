/**
 * TDD Tests for Function Registry
 *
 * These tests define the expected behavior for the FunctionRegistry that stores
 * and looks up registered Convex functions (queries, mutations, actions, HTTP endpoints).
 *
 * The registry provides:
 * - Singleton pattern for global function registration
 * - Registration of functions with path validation
 * - Lookup of functions by path
 * - Listing functions by type
 * - Duplicate registration handling
 * - HTTP endpoint registration
 *
 * Bead: convex-2pb - Function Registration and Lookup System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  FunctionRegistry,
  type RegisteredFunction,
  type FunctionType,
  type FunctionVisibility,
  type FunctionEntry,
  type HttpEndpointEntry,
  FunctionRegistryError,
} from '../../../src/server/functions/registry'

// ============================================================================
// Mock Function Factories
// ============================================================================

/**
 * Create a mock query function for testing.
 */
function createMockQuery(name: string): RegisteredFunction {
  return {
    _type: 'query',
    _visibility: 'public',
    _config: {
      handler: async () => ({ name }),
    },
  }
}

/**
 * Create a mock mutation function for testing.
 */
function createMockMutation(name: string): RegisteredFunction {
  return {
    _type: 'mutation',
    _visibility: 'public',
    _config: {
      handler: async () => ({ name }),
    },
  }
}

/**
 * Create a mock action function for testing.
 */
function createMockAction(name: string): RegisteredFunction {
  return {
    _type: 'action',
    _visibility: 'public',
    _config: {
      handler: async () => ({ name }),
    },
  }
}

/**
 * Create a mock internal function for testing.
 */
function createMockInternalFunction(type: FunctionType, name: string): RegisteredFunction {
  return {
    _type: type,
    _visibility: 'internal',
    _config: {
      handler: async () => ({ name }),
    },
  }
}

/**
 * Create a mock HTTP endpoint for testing.
 */
function createMockHttpEndpoint(name: string) {
  return {
    _type: 'httpAction' as const,
    _config: {
      path: '',
      method: 'GET' as const,
      handler: async () => new Response(name),
    },
  }
}

// ============================================================================
// Singleton Pattern Tests
// ============================================================================

describe('FunctionRegistry', () => {
  let registry: FunctionRegistry

  beforeEach(() => {
    // Reset the singleton before each test
    FunctionRegistry.resetInstance()
    registry = FunctionRegistry.getInstance()
  })

  afterEach(() => {
    FunctionRegistry.resetInstance()
  })

  describe('singleton pattern', () => {
    it('should return the same instance when calling getInstance()', () => {
      const instance1 = FunctionRegistry.getInstance()
      const instance2 = FunctionRegistry.getInstance()
      expect(instance1).toBe(instance2)
    })

    it('should create only one instance across multiple calls', () => {
      const instances = Array(5).fill(null).map(() => FunctionRegistry.getInstance())
      const uniqueInstances = new Set(instances)
      expect(uniqueInstances.size).toBe(1)
    })

    it('should allow resetting the singleton for testing', () => {
      const instance1 = FunctionRegistry.getInstance()
      instance1.register('test:fn', createMockQuery('test'))

      FunctionRegistry.resetInstance()

      const instance2 = FunctionRegistry.getInstance()
      expect(instance2.has('test:fn')).toBe(false)
    })

    it('should preserve registrations within the same instance', () => {
      registry.register('users:get', createMockQuery('getUser'))

      const sameRegistry = FunctionRegistry.getInstance()
      expect(sameRegistry.has('users:get')).toBe(true)
    })
  })

  // ============================================================================
  // Register Function Tests
  // ============================================================================

  describe('register()', () => {
    describe('basic registration', () => {
      it('should register a query function', () => {
        const fn = createMockQuery('getUser')
        registry.register('users:get', fn)
        expect(registry.has('users:get')).toBe(true)
      })

      it('should register a mutation function', () => {
        const fn = createMockMutation('createUser')
        registry.register('users:create', fn)
        expect(registry.has('users:create')).toBe(true)
      })

      it('should register an action function', () => {
        const fn = createMockAction('sendEmail')
        registry.register('email:send', fn)
        expect(registry.has('email:send')).toBe(true)
      })

      it('should return the registry for chaining', () => {
        const result = registry.register('users:get', createMockQuery('test'))
        expect(result).toBe(registry)
      })

      it('should register multiple functions', () => {
        registry.register('users:get', createMockQuery('getUser'))
        registry.register('users:create', createMockMutation('createUser'))
        registry.register('users:list', createMockQuery('listUsers'))

        expect(registry.has('users:get')).toBe(true)
        expect(registry.has('users:create')).toBe(true)
        expect(registry.has('users:list')).toBe(true)
      })

      it('should register internal functions', () => {
        const fn = createMockInternalFunction('query', 'internalFn')
        registry.register('internal:helper', fn)
        expect(registry.has('internal:helper')).toBe(true)
      })
    })

    describe('path validation', () => {
      it('should accept valid colon-separated paths', () => {
        expect(() => registry.register('users:get', createMockQuery('test'))).not.toThrow()
        expect(() => registry.register('api:users:list', createMockQuery('test'))).not.toThrow()
        expect(() => registry.register('module:submodule:fn', createMockQuery('test'))).not.toThrow()
      })

      it('should accept valid slash-separated paths', () => {
        expect(() => registry.register('users/get', createMockQuery('test'))).not.toThrow()
        expect(() => registry.register('api/users/list', createMockQuery('test'))).not.toThrow()
      })

      it('should reject empty paths', () => {
        expect(() => registry.register('', createMockQuery('test')))
          .toThrow(FunctionRegistryError)
      })

      it('should reject paths with only whitespace', () => {
        expect(() => registry.register('   ', createMockQuery('test')))
          .toThrow(FunctionRegistryError)
      })

      it('should reject paths starting with colon', () => {
        expect(() => registry.register(':invalid', createMockQuery('test')))
          .toThrow(FunctionRegistryError)
      })

      it('should reject paths ending with colon', () => {
        expect(() => registry.register('invalid:', createMockQuery('test')))
          .toThrow(FunctionRegistryError)
      })

      it('should reject paths with consecutive colons', () => {
        expect(() => registry.register('invalid::path', createMockQuery('test')))
          .toThrow(FunctionRegistryError)
      })

      it('should reject paths with invalid characters', () => {
        expect(() => registry.register('path with spaces', createMockQuery('test')))
          .toThrow(FunctionRegistryError)
        expect(() => registry.register('path@invalid', createMockQuery('test')))
          .toThrow(FunctionRegistryError)
        expect(() => registry.register('path#invalid', createMockQuery('test')))
          .toThrow(FunctionRegistryError)
      })

      it('should accept paths with underscores', () => {
        expect(() => registry.register('user_profiles:get_by_id', createMockQuery('test')))
          .not.toThrow()
      })

      it('should accept paths with numbers', () => {
        expect(() => registry.register('v2:users:get', createMockQuery('test')))
          .not.toThrow()
        expect(() => registry.register('api123:test', createMockQuery('test')))
          .not.toThrow()
      })

      it('should accept camelCase paths', () => {
        expect(() => registry.register('userProfiles:getById', createMockQuery('test')))
          .not.toThrow()
      })

      it('should normalize paths to standard format', () => {
        // Both colon and slash separators should work
        registry.register('users/get', createMockQuery('test1'))
        registry.register('users:list', createMockQuery('test2'))

        expect(registry.has('users/get')).toBe(true)
        expect(registry.has('users:list')).toBe(true)
      })
    })

    describe('duplicate registration handling', () => {
      it('should throw error when registering duplicate path', () => {
        registry.register('users:get', createMockQuery('first'))

        expect(() => registry.register('users:get', createMockQuery('second')))
          .toThrow(FunctionRegistryError)
      })

      it('should include path in duplicate error message', () => {
        registry.register('users:get', createMockQuery('first'))

        expect(() => registry.register('users:get', createMockQuery('second')))
          .toThrow(/users:get/)
      })

      it('should allow overwrite when force option is true', () => {
        registry.register('users:get', createMockQuery('first'))
        registry.register('users:get', createMockQuery('second'), { force: true })

        const fn = registry.getFunction('users:get')
        expect(fn).toBeDefined()
      })

      it('should not throw on overwrite with force option', () => {
        registry.register('users:get', createMockQuery('first'))

        expect(() => registry.register('users:get', createMockQuery('second'), { force: true }))
          .not.toThrow()
      })
    })
  })

  // ============================================================================
  // Get Function Tests
  // ============================================================================

  describe('getFunction()', () => {
    it('should return registered function by path', () => {
      const fn = createMockQuery('getUser')
      registry.register('users:get', fn)

      const result = registry.getFunction('users:get')
      expect(result).toBeDefined()
      expect(result?.fn).toBe(fn)
    })

    it('should return undefined for non-existent path', () => {
      const result = registry.getFunction('nonexistent:path')
      expect(result).toBeUndefined()
    })

    it('should return function entry with correct type', () => {
      registry.register('users:get', createMockQuery('getUser'))

      const result = registry.getFunction('users:get')
      expect(result?.type).toBe('query')
    })

    it('should return function entry with correct visibility', () => {
      registry.register('users:get', createMockInternalFunction('query', 'internal'))

      const result = registry.getFunction('users:get')
      expect(result?.visibility).toBe('internal')
    })

    it('should return function entry with path', () => {
      registry.register('users:get', createMockQuery('getUser'))

      const result = registry.getFunction('users:get')
      expect(result?.path).toBe('users:get')
    })

    it('should return correct function after multiple registrations', () => {
      registry.register('users:get', createMockQuery('getUser'))
      registry.register('users:create', createMockMutation('createUser'))
      registry.register('users:delete', createMockMutation('deleteUser'))

      const result = registry.getFunction('users:create')
      expect(result?.type).toBe('mutation')
    })

    it('should be case-sensitive', () => {
      registry.register('users:Get', createMockQuery('getUser'))

      expect(registry.getFunction('users:Get')).toBeDefined()
      expect(registry.getFunction('users:get')).toBeUndefined()
    })
  })

  // ============================================================================
  // Has Function Tests
  // ============================================================================

  describe('has()', () => {
    it('should return true for registered function', () => {
      registry.register('users:get', createMockQuery('getUser'))
      expect(registry.has('users:get')).toBe(true)
    })

    it('should return false for non-existent function', () => {
      expect(registry.has('nonexistent:path')).toBe(false)
    })

    it('should return false after reset', () => {
      registry.register('users:get', createMockQuery('getUser'))
      FunctionRegistry.resetInstance()

      const newRegistry = FunctionRegistry.getInstance()
      expect(newRegistry.has('users:get')).toBe(false)
    })

    it('should be case-sensitive', () => {
      registry.register('Users:Get', createMockQuery('test'))

      expect(registry.has('Users:Get')).toBe(true)
      expect(registry.has('users:get')).toBe(false)
    })
  })

  // ============================================================================
  // List Functions Tests
  // ============================================================================

  describe('listFunctions()', () => {
    beforeEach(() => {
      // Register a variety of functions
      registry.register('users:get', createMockQuery('getUser'))
      registry.register('users:list', createMockQuery('listUsers'))
      registry.register('users:create', createMockMutation('createUser'))
      registry.register('users:update', createMockMutation('updateUser'))
      registry.register('email:send', createMockAction('sendEmail'))
      registry.register('internal:helper', createMockInternalFunction('query', 'helper'))
    })

    describe('without type filter', () => {
      it('should return all registered functions', () => {
        const functions = registry.listFunctions()
        expect(functions.length).toBe(6)
      })

      it('should return array of FunctionEntry objects', () => {
        const functions = registry.listFunctions()
        functions.forEach(entry => {
          expect(entry).toHaveProperty('path')
          expect(entry).toHaveProperty('type')
          expect(entry).toHaveProperty('visibility')
          expect(entry).toHaveProperty('fn')
        })
      })

      it('should return empty array when no functions registered', () => {
        FunctionRegistry.resetInstance()
        const emptyRegistry = FunctionRegistry.getInstance()

        const functions = emptyRegistry.listFunctions()
        expect(functions).toEqual([])
      })
    })

    describe('with type filter', () => {
      it('should filter by query type', () => {
        const queries = registry.listFunctions('query')
        expect(queries.length).toBe(3) // users:get, users:list, internal:helper
        queries.forEach(entry => {
          expect(entry.type).toBe('query')
        })
      })

      it('should filter by mutation type', () => {
        const mutations = registry.listFunctions('mutation')
        expect(mutations.length).toBe(2) // users:create, users:update
        mutations.forEach(entry => {
          expect(entry.type).toBe('mutation')
        })
      })

      it('should filter by action type', () => {
        const actions = registry.listFunctions('action')
        expect(actions.length).toBe(1) // email:send
        actions.forEach(entry => {
          expect(entry.type).toBe('action')
        })
      })

      it('should return empty array when no functions match type', () => {
        FunctionRegistry.resetInstance()
        const newRegistry = FunctionRegistry.getInstance()
        newRegistry.register('users:get', createMockQuery('test'))

        const actions = newRegistry.listFunctions('action')
        expect(actions).toEqual([])
      })
    })

    describe('with visibility filter', () => {
      it('should filter by public visibility', () => {
        const publicFns = registry.listFunctions(undefined, 'public')
        expect(publicFns.length).toBe(5)
        publicFns.forEach(entry => {
          expect(entry.visibility).toBe('public')
        })
      })

      it('should filter by internal visibility', () => {
        const internalFns = registry.listFunctions(undefined, 'internal')
        expect(internalFns.length).toBe(1)
        internalFns.forEach(entry => {
          expect(entry.visibility).toBe('internal')
        })
      })

      it('should combine type and visibility filters', () => {
        const publicQueries = registry.listFunctions('query', 'public')
        expect(publicQueries.length).toBe(2) // users:get, users:list
        publicQueries.forEach(entry => {
          expect(entry.type).toBe('query')
          expect(entry.visibility).toBe('public')
        })
      })
    })
  })

  // ============================================================================
  // HTTP Endpoint Registration Tests
  // ============================================================================

  describe('HTTP endpoint registration', () => {
    describe('registerHttpEndpoint()', () => {
      it('should register an HTTP GET endpoint', () => {
        const endpoint = createMockHttpEndpoint('getHandler')
        registry.registerHttpEndpoint('/api/users', 'GET', endpoint)

        expect(registry.hasHttpEndpoint('/api/users', 'GET')).toBe(true)
      })

      it('should register an HTTP POST endpoint', () => {
        const endpoint = createMockHttpEndpoint('postHandler')
        registry.registerHttpEndpoint('/api/users', 'POST', endpoint)

        expect(registry.hasHttpEndpoint('/api/users', 'POST')).toBe(true)
      })

      it('should register endpoints for different methods on same path', () => {
        registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('get'))
        registry.registerHttpEndpoint('/api/users', 'POST', createMockHttpEndpoint('post'))
        registry.registerHttpEndpoint('/api/users', 'PUT', createMockHttpEndpoint('put'))
        registry.registerHttpEndpoint('/api/users', 'DELETE', createMockHttpEndpoint('delete'))

        expect(registry.hasHttpEndpoint('/api/users', 'GET')).toBe(true)
        expect(registry.hasHttpEndpoint('/api/users', 'POST')).toBe(true)
        expect(registry.hasHttpEndpoint('/api/users', 'PUT')).toBe(true)
        expect(registry.hasHttpEndpoint('/api/users', 'DELETE')).toBe(true)
      })

      it('should return the registry for chaining', () => {
        const result = registry.registerHttpEndpoint('/api/test', 'GET', createMockHttpEndpoint('test'))
        expect(result).toBe(registry)
      })

      it('should accept all HTTP methods', () => {
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const
        methods.forEach(method => {
          expect(() => {
            registry.registerHttpEndpoint(`/api/${method.toLowerCase()}`, method, createMockHttpEndpoint(method))
          }).not.toThrow()
        })
      })
    })

    describe('HTTP path validation', () => {
      it('should accept paths starting with /', () => {
        expect(() => registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('test')))
          .not.toThrow()
      })

      it('should reject paths not starting with /', () => {
        expect(() => registry.registerHttpEndpoint('api/users', 'GET', createMockHttpEndpoint('test')))
          .toThrow(FunctionRegistryError)
      })

      it('should accept paths with path parameters', () => {
        expect(() => registry.registerHttpEndpoint('/api/users/:id', 'GET', createMockHttpEndpoint('test')))
          .not.toThrow()
        expect(() => registry.registerHttpEndpoint('/api/:resource/:id/action', 'POST', createMockHttpEndpoint('test')))
          .not.toThrow()
      })

      it('should reject empty paths', () => {
        expect(() => registry.registerHttpEndpoint('', 'GET', createMockHttpEndpoint('test')))
          .toThrow(FunctionRegistryError)
      })

      it('should accept paths with query-like patterns', () => {
        expect(() => registry.registerHttpEndpoint('/api/search', 'GET', createMockHttpEndpoint('test')))
          .not.toThrow()
      })
    })

    describe('getHttpEndpoint()', () => {
      it('should return registered HTTP endpoint', () => {
        const endpoint = createMockHttpEndpoint('handler')
        registry.registerHttpEndpoint('/api/users', 'GET', endpoint)

        const result = registry.getHttpEndpoint('/api/users', 'GET')
        expect(result).toBeDefined()
        expect(result?.endpoint).toBe(endpoint)
      })

      it('should return undefined for non-existent endpoint', () => {
        const result = registry.getHttpEndpoint('/nonexistent', 'GET')
        expect(result).toBeUndefined()
      })

      it('should return undefined for wrong method', () => {
        registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('test'))

        const result = registry.getHttpEndpoint('/api/users', 'POST')
        expect(result).toBeUndefined()
      })

      it('should return entry with correct path and method', () => {
        registry.registerHttpEndpoint('/api/users', 'POST', createMockHttpEndpoint('test'))

        const result = registry.getHttpEndpoint('/api/users', 'POST')
        expect(result?.path).toBe('/api/users')
        expect(result?.method).toBe('POST')
      })
    })

    describe('listHttpEndpoints()', () => {
      beforeEach(() => {
        registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('listUsers'))
        registry.registerHttpEndpoint('/api/users', 'POST', createMockHttpEndpoint('createUser'))
        registry.registerHttpEndpoint('/api/users/:id', 'GET', createMockHttpEndpoint('getUser'))
        registry.registerHttpEndpoint('/api/users/:id', 'PUT', createMockHttpEndpoint('updateUser'))
        registry.registerHttpEndpoint('/webhooks/stripe', 'POST', createMockHttpEndpoint('stripeWebhook'))
      })

      it('should return all registered HTTP endpoints', () => {
        const endpoints = registry.listHttpEndpoints()
        expect(endpoints.length).toBe(5)
      })

      it('should filter by HTTP method', () => {
        const getEndpoints = registry.listHttpEndpoints('GET')
        expect(getEndpoints.length).toBe(2)

        const postEndpoints = registry.listHttpEndpoints('POST')
        expect(postEndpoints.length).toBe(2)
      })

      it('should return empty array when no endpoints match', () => {
        const deleteEndpoints = registry.listHttpEndpoints('DELETE')
        expect(deleteEndpoints).toEqual([])
      })

      it('should return HttpEndpointEntry objects', () => {
        const endpoints = registry.listHttpEndpoints()
        endpoints.forEach(entry => {
          expect(entry).toHaveProperty('path')
          expect(entry).toHaveProperty('method')
          expect(entry).toHaveProperty('endpoint')
        })
      })
    })

    describe('duplicate HTTP endpoint handling', () => {
      it('should throw error when registering duplicate path+method', () => {
        registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('first'))

        expect(() => registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('second')))
          .toThrow(FunctionRegistryError)
      })

      it('should allow same path with different methods', () => {
        registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('get'))

        expect(() => registry.registerHttpEndpoint('/api/users', 'POST', createMockHttpEndpoint('post')))
          .not.toThrow()
      })

      it('should allow overwrite with force option', () => {
        registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('first'))

        expect(() => {
          registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('second'), { force: true })
        }).not.toThrow()
      })
    })
  })

  // ============================================================================
  // Unregister Tests
  // ============================================================================

  describe('unregister()', () => {
    it('should remove a registered function', () => {
      registry.register('users:get', createMockQuery('test'))
      expect(registry.has('users:get')).toBe(true)

      registry.unregister('users:get')
      expect(registry.has('users:get')).toBe(false)
    })

    it('should return true when function was removed', () => {
      registry.register('users:get', createMockQuery('test'))
      const result = registry.unregister('users:get')
      expect(result).toBe(true)
    })

    it('should return false when function did not exist', () => {
      const result = registry.unregister('nonexistent:path')
      expect(result).toBe(false)
    })

    it('should not affect other registered functions', () => {
      registry.register('users:get', createMockQuery('test1'))
      registry.register('users:create', createMockMutation('test2'))

      registry.unregister('users:get')

      expect(registry.has('users:get')).toBe(false)
      expect(registry.has('users:create')).toBe(true)
    })
  })

  describe('unregisterHttpEndpoint()', () => {
    it('should remove a registered HTTP endpoint', () => {
      registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('test'))
      expect(registry.hasHttpEndpoint('/api/users', 'GET')).toBe(true)

      registry.unregisterHttpEndpoint('/api/users', 'GET')
      expect(registry.hasHttpEndpoint('/api/users', 'GET')).toBe(false)
    })

    it('should return true when endpoint was removed', () => {
      registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('test'))
      const result = registry.unregisterHttpEndpoint('/api/users', 'GET')
      expect(result).toBe(true)
    })

    it('should return false when endpoint did not exist', () => {
      const result = registry.unregisterHttpEndpoint('/nonexistent', 'GET')
      expect(result).toBe(false)
    })

    it('should only remove specific method, not other methods on same path', () => {
      registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('get'))
      registry.registerHttpEndpoint('/api/users', 'POST', createMockHttpEndpoint('post'))

      registry.unregisterHttpEndpoint('/api/users', 'GET')

      expect(registry.hasHttpEndpoint('/api/users', 'GET')).toBe(false)
      expect(registry.hasHttpEndpoint('/api/users', 'POST')).toBe(true)
    })
  })

  // ============================================================================
  // Clear Tests
  // ============================================================================

  describe('clear()', () => {
    it('should remove all registered functions', () => {
      registry.register('users:get', createMockQuery('test1'))
      registry.register('users:create', createMockMutation('test2'))
      registry.register('email:send', createMockAction('test3'))

      registry.clear()

      expect(registry.listFunctions()).toEqual([])
    })

    it('should remove all HTTP endpoints', () => {
      registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('test1'))
      registry.registerHttpEndpoint('/api/users', 'POST', createMockHttpEndpoint('test2'))

      registry.clear()

      expect(registry.listHttpEndpoints()).toEqual([])
    })

    it('should allow registering new functions after clear', () => {
      registry.register('users:get', createMockQuery('test'))
      registry.clear()

      registry.register('users:get', createMockQuery('new'))
      expect(registry.has('users:get')).toBe(true)
    })
  })

  // ============================================================================
  // Size and Count Tests
  // ============================================================================

  describe('size()', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.size()).toBe(0)
    })

    it('should return correct count of registered functions', () => {
      registry.register('users:get', createMockQuery('test1'))
      registry.register('users:create', createMockMutation('test2'))
      registry.register('email:send', createMockAction('test3'))

      expect(registry.size()).toBe(3)
    })

    it('should not count HTTP endpoints', () => {
      registry.register('users:get', createMockQuery('test'))
      registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('test'))

      expect(registry.size()).toBe(1)
    })

    it('should decrease after unregister', () => {
      registry.register('users:get', createMockQuery('test1'))
      registry.register('users:create', createMockMutation('test2'))

      expect(registry.size()).toBe(2)

      registry.unregister('users:get')
      expect(registry.size()).toBe(1)
    })
  })

  describe('httpEndpointCount()', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.httpEndpointCount()).toBe(0)
    })

    it('should return correct count of HTTP endpoints', () => {
      registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('test1'))
      registry.registerHttpEndpoint('/api/users', 'POST', createMockHttpEndpoint('test2'))
      registry.registerHttpEndpoint('/webhooks/stripe', 'POST', createMockHttpEndpoint('test3'))

      expect(registry.httpEndpointCount()).toBe(3)
    })

    it('should not count regular functions', () => {
      registry.register('users:get', createMockQuery('test'))
      registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('test'))

      expect(registry.httpEndpointCount()).toBe(1)
    })
  })

  // ============================================================================
  // Path Matching Tests
  // ============================================================================

  describe('matchHttpEndpoint()', () => {
    beforeEach(() => {
      registry.registerHttpEndpoint('/api/users', 'GET', createMockHttpEndpoint('listUsers'))
      registry.registerHttpEndpoint('/api/users/:id', 'GET', createMockHttpEndpoint('getUser'))
      registry.registerHttpEndpoint('/api/users/:id/posts', 'GET', createMockHttpEndpoint('getUserPosts'))
      registry.registerHttpEndpoint('/api/users/:userId/posts/:postId', 'GET', createMockHttpEndpoint('getPost'))
    })

    it('should match exact paths', () => {
      const result = registry.matchHttpEndpoint('/api/users', 'GET')
      expect(result).toBeDefined()
      expect(result?.path).toBe('/api/users')
    })

    it('should match paths with single parameter', () => {
      const result = registry.matchHttpEndpoint('/api/users/123', 'GET')
      expect(result).toBeDefined()
      expect(result?.path).toBe('/api/users/:id')
      expect(result?.params).toEqual({ id: '123' })
    })

    it('should match paths with multiple parameters', () => {
      const result = registry.matchHttpEndpoint('/api/users/123/posts/456', 'GET')
      expect(result).toBeDefined()
      expect(result?.path).toBe('/api/users/:userId/posts/:postId')
      expect(result?.params).toEqual({ userId: '123', postId: '456' })
    })

    it('should return undefined for non-matching paths', () => {
      const result = registry.matchHttpEndpoint('/api/products', 'GET')
      expect(result).toBeUndefined()
    })

    it('should return undefined for wrong method', () => {
      const result = registry.matchHttpEndpoint('/api/users', 'POST')
      expect(result).toBeUndefined()
    })

    it('should prefer exact matches over parameterized matches', () => {
      const result = registry.matchHttpEndpoint('/api/users', 'GET')
      expect(result?.path).toBe('/api/users')
      expect(result?.params).toEqual({})
    })
  })

  // ============================================================================
  // Module Registration Tests
  // ============================================================================

  describe('registerModule()', () => {
    it('should register multiple functions from a module object', () => {
      const module = {
        getUser: createMockQuery('getUser'),
        createUser: createMockMutation('createUser'),
        sendEmail: createMockAction('sendEmail'),
      }

      registry.registerModule('api', module)

      expect(registry.has('api:getUser')).toBe(true)
      expect(registry.has('api:createUser')).toBe(true)
      expect(registry.has('api:sendEmail')).toBe(true)
    })

    it('should skip non-function exports', () => {
      const module = {
        getUser: createMockQuery('getUser'),
        VERSION: '1.0.0', // Not a function
        config: { timeout: 5000 }, // Not a function
      }

      registry.registerModule('api', module as any)

      expect(registry.has('api:getUser')).toBe(true)
      expect(registry.has('api:VERSION')).toBe(false)
      expect(registry.has('api:config')).toBe(false)
    })

    it('should return the registry for chaining', () => {
      const result = registry.registerModule('api', {
        getUser: createMockQuery('test'),
      })
      expect(result).toBe(registry)
    })

    it('should accept nested module paths', () => {
      const module = {
        get: createMockQuery('get'),
        list: createMockQuery('list'),
      }

      registry.registerModule('api:users', module)

      expect(registry.has('api:users:get')).toBe(true)
      expect(registry.has('api:users:list')).toBe(true)
    })
  })

  // ============================================================================
  // Error Class Tests
  // ============================================================================

  describe('FunctionRegistryError', () => {
    it('should be an instance of Error', () => {
      const error = new FunctionRegistryError('test message')
      expect(error).toBeInstanceOf(Error)
    })

    it('should have correct name', () => {
      const error = new FunctionRegistryError('test message')
      expect(error.name).toBe('FunctionRegistryError')
    })

    it('should preserve message', () => {
      const error = new FunctionRegistryError('test message')
      expect(error.message).toBe('test message')
    })

    it('should have optional code property', () => {
      const error = new FunctionRegistryError('test', 'DUPLICATE_PATH')
      expect(error.code).toBe('DUPLICATE_PATH')
    })
  })

  // ============================================================================
  // Iteration Tests
  // ============================================================================

  describe('iteration', () => {
    it('should be iterable with for...of', () => {
      registry.register('users:get', createMockQuery('test1'))
      registry.register('users:create', createMockMutation('test2'))

      const paths: string[] = []
      for (const entry of registry) {
        paths.push(entry.path)
      }

      expect(paths).toContain('users:get')
      expect(paths).toContain('users:create')
    })

    it('should support entries() method', () => {
      registry.register('users:get', createMockQuery('test'))

      const entries = Array.from(registry.entries())
      expect(entries.length).toBe(1)
      expect(entries[0][0]).toBe('users:get')
    })

    it('should support paths() method', () => {
      registry.register('users:get', createMockQuery('test1'))
      registry.register('users:create', createMockMutation('test2'))

      const paths = Array.from(registry.paths())
      expect(paths).toContain('users:get')
      expect(paths).toContain('users:create')
    })

    it('should support functions() method', () => {
      registry.register('users:get', createMockQuery('test'))

      const functions = Array.from(registry.functions())
      expect(functions.length).toBe(1)
      expect(functions[0]._type).toBe('query')
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle very long paths', () => {
      const longPath = 'a:b:c:d:e:f:g:h:i:j:k:l:m:n:o:p:q:r:s:t:u:v:w:x:y:z'
      registry.register(longPath, createMockQuery('test'))
      expect(registry.has(longPath)).toBe(true)
    })

    it('should handle unicode in function names (camelCase)', () => {
      // Valid: camelCase with standard ASCII
      registry.register('users:getById', createMockQuery('test'))
      expect(registry.has('users:getById')).toBe(true)
    })

    it('should handle registering same path after unregistering', () => {
      registry.register('users:get', createMockQuery('first'))
      registry.unregister('users:get')
      registry.register('users:get', createMockQuery('second'))

      expect(registry.has('users:get')).toBe(true)
    })

    it('should handle concurrent access patterns', async () => {
      const promises = Array(100).fill(null).map((_, i) => {
        return Promise.resolve().then(() => {
          registry.register(`test:fn${i}`, createMockQuery(`test${i}`))
        })
      })

      await Promise.all(promises)

      expect(registry.size()).toBe(100)
    })
  })

  // ============================================================================
  // Type Safety Tests (Compile-time checks)
  // ============================================================================

  describe('type safety', () => {
    it('should enforce RegisteredFunction type', () => {
      const query = createMockQuery('test')
      const mutation = createMockMutation('test')
      const action = createMockAction('test')

      // These should all work
      registry.register('test:query', query)
      registry.register('test:mutation', mutation)
      registry.register('test:action', action)

      expect(registry.size()).toBe(3)
    })

    it('should return correctly typed FunctionEntry', () => {
      registry.register('users:get', createMockQuery('test'))

      const entry = registry.getFunction('users:get')
      if (entry) {
        const { path, type, visibility, fn } = entry
        expect(typeof path).toBe('string')
        expect(['query', 'mutation', 'action']).toContain(type)
        expect(['public', 'internal']).toContain(visibility)
        expect(fn).toBeDefined()
      }
    })

    it('should accept FunctionType union', () => {
      const types: FunctionType[] = ['query', 'mutation', 'action']
      types.forEach(type => {
        const filtered = registry.listFunctions(type)
        expect(Array.isArray(filtered)).toBe(true)
      })
    })

    it('should accept FunctionVisibility union', () => {
      const visibilities: FunctionVisibility[] = ['public', 'internal']
      visibilities.forEach(visibility => {
        const filtered = registry.listFunctions(undefined, visibility)
        expect(Array.isArray(filtered)).toBe(true)
      })
    })
  })
})
