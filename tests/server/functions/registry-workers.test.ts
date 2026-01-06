/**
 * TDD Tests for Function Registry Workers Compatibility (RED Phase)
 *
 * These tests expose problems with the singleton pattern in Cloudflare Workers environments.
 * Workers isolates present unique challenges:
 *
 * 1. Isolate Reuse: Workers isolates can be reused across multiple requests,
 *    causing state to leak between unrelated requests.
 *
 * 2. Multiple Instances: Different requests may be handled by different isolates,
 *    so relying on a shared singleton doesn't work across the system.
 *
 * 3. Per-Request Isolation: Each request should have its own isolated context,
 *    but a global singleton breaks this model.
 *
 * The current singleton pattern:
 * - Uses a static class property to hold the single instance
 * - All code in the same isolate shares the same registry state
 * - State persists across requests within the same isolate
 *
 * Expected behavior for Workers compatibility:
 * - Each "request context" should have isolated registry state
 * - State should not leak between requests
 * - Different Worker instances should be able to have different registrations
 *
 * Bead: convex-c9ys - Function Registry Workers Compatibility (RED)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  FunctionRegistry,
  type RegisteredFunction,
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
// Simulated Worker Isolate Context
// ============================================================================

/**
 * Simulates a Worker isolate context for testing.
 *
 * In a real Cloudflare Workers environment, each isolate has its own
 * JavaScript execution context, but static state persists across requests
 * within the same isolate. This class simulates that behavior for testing.
 */
class SimulatedWorkerIsolate {
  private requestCount = 0
  private isolateId: string

  constructor(isolateId: string) {
    this.isolateId = isolateId
  }

  /**
   * Simulate handling a request within this isolate.
   * Returns the registry state after the request handler runs.
   */
  handleRequest(
    handler: (registry: FunctionRegistry) => void
  ): { isolateId: string; registeredPaths: string[] } {
    this.requestCount++

    // In Workers, each isolate shares the same static singleton instance
    const registry = FunctionRegistry.getInstance()
    handler(registry)

    return {
      isolateId: this.isolateId,
      registeredPaths: Array.from(registry.paths()),
    }
  }

  /**
   * Get the registry state without modifying it.
   */
  getRegistryState(): { size: number; paths: string[] } {
    const registry = FunctionRegistry.getInstance()
    return {
      size: registry.size(),
      paths: Array.from(registry.paths()),
    }
  }

  getRequestCount(): number {
    return this.requestCount
  }
}

/**
 * Factory to create isolated registry instances.
 *
 * This is what we WANT the API to look like for Workers compatibility,
 * where each context can have its own isolated registry.
 */
interface IsolatedRegistryFactory {
  createRegistry(): FunctionRegistry
}

// ============================================================================
// Workers Isolate State Isolation Tests
// ============================================================================

describe('FunctionRegistry Workers Compatibility', () => {
  beforeEach(() => {
    FunctionRegistry.resetInstance()
  })

  afterEach(() => {
    FunctionRegistry.resetInstance()
  })

  describe('isolate state leakage (expected to FAIL)', () => {
    /**
     * This test demonstrates that state leaks between requests in the same isolate.
     *
     * In a Workers environment, when one request registers functions, they remain
     * registered for subsequent requests in the same isolate. This is problematic
     * because:
     * 1. Different users' requests might see different state depending on which
     *    isolate handles them
     * 2. Functions from one tenant could be visible to another in multi-tenant apps
     * 3. Testing and debugging become unpredictable
     *
     * EXPECTED: This test should FAIL with current implementation because
     * the singleton persists state across simulated requests.
     */
    it('should provide isolated state per request (singleton leaks state)', () => {
      const isolate = new SimulatedWorkerIsolate('isolate-1')

      // First request registers some functions
      const result1 = isolate.handleRequest((registry) => {
        registry.register('request1:query', createMockQuery('request1'))
        registry.register('request1:mutation', createMockMutation('request1'))
      })

      expect(result1.registeredPaths).toContain('request1:query')
      expect(result1.registeredPaths).toContain('request1:mutation')

      // Second request should have a clean slate (isolated state)
      // But with singleton pattern, it sees the previous request's registrations
      const result2 = isolate.handleRequest((registry) => {
        registry.register('request2:query', createMockQuery('request2'))
      })

      // EXPECTATION: request2 should only see its own registrations
      // REALITY: request2 sees both its registrations AND request1's registrations
      expect(result2.registeredPaths).toHaveLength(1) // Should be just request2:query
      expect(result2.registeredPaths).not.toContain('request1:query') // Should not see request1's functions
      expect(result2.registeredPaths).not.toContain('request1:mutation')
    })

    /**
     * Test that different "requests" in the same isolate don't share HTTP endpoints.
     */
    it('should isolate HTTP endpoints between requests (singleton leaks endpoints)', () => {
      const isolate = new SimulatedWorkerIsolate('isolate-1')

      // First request registers HTTP endpoints
      isolate.handleRequest((registry) => {
        registry.registerHttpEndpoint('/api/tenant1/users', 'GET', createMockHttpEndpoint('tenant1'))
      })

      // Second request should not see first request's endpoints
      const state = isolate.handleRequest((registry) => {
        const endpoint = registry.getHttpEndpoint('/api/tenant1/users', 'GET')
        // EXPECTATION: This should be undefined for an isolated request
        // REALITY: It exists because singleton shares state
        expect(endpoint).toBeUndefined()
      })
    })
  })

  describe('multiple isolate instances (expected to FAIL)', () => {
    /**
     * This test demonstrates the problem with having independent isolates
     * that need different registrations.
     *
     * In a Workers environment, you might want different Workers or Durable Objects
     * to have different function sets registered. The singleton pattern makes this
     * impossible because getInstance() always returns the same instance.
     *
     * EXPECTED: This test should FAIL because we cannot create truly independent
     * registry instances with the current singleton implementation.
     */
    it('should allow multiple independent registry instances', () => {
      // In a real Workers scenario, we'd want to create separate registries
      // for different purposes (e.g., different tenants, different DO instances)

      // With singleton, both references point to the same instance
      const registry1 = FunctionRegistry.getInstance()
      const registry2 = FunctionRegistry.getInstance()

      registry1.register('module1:fn', createMockQuery('module1'))

      // EXPECTATION: registry2 should be independent and not see registry1's functions
      // REALITY: They're the same instance, so registry2 sees everything
      expect(registry2.has('module1:fn')).toBe(false)

      // Verify they should be different instances
      expect(registry1).not.toBe(registry2) // This will fail - they ARE the same instance
    })

    /**
     * Test that demonstrates we need a factory pattern or dependency injection
     * instead of singleton for Workers compatibility.
     */
    it('should support creating isolated registry instances for each context', () => {
      // What we WANT: A way to create independent registries
      // What we HAVE: A singleton that always returns the same instance

      // Simulate two different Worker/DO contexts that need independent state
      const contextA = {
        registry: FunctionRegistry.getInstance(),
        name: 'context-a',
      }

      const contextB = {
        // In a proper implementation, this would create a NEW registry
        registry: FunctionRegistry.getInstance(),
        name: 'context-b',
      }

      // Register different functions in each context
      contextA.registry.register('contextA:fn', createMockQuery('a'))
      contextB.registry.register('contextB:fn', createMockQuery('b'))

      // EXPECTATION: Each context should only see its own registrations
      // REALITY: Both see all registrations because it's a singleton
      const contextAFunctions = contextA.registry.listFunctions()
      const contextBFunctions = contextB.registry.listFunctions()

      expect(contextAFunctions.length).toBe(1)
      expect(contextAFunctions[0].path).toBe('contextA:fn')

      expect(contextBFunctions.length).toBe(1)
      expect(contextBFunctions[0].path).toBe('contextB:fn')
    })
  })

  describe('per-request cleanup requirement (expected to FAIL)', () => {
    /**
     * This test demonstrates that manual cleanup is required but unreliable.
     *
     * The current pattern requires calling resetInstance() or clear() to
     * clean up between requests. This is error-prone because:
     * 1. Developers might forget to clean up
     * 2. If an error occurs, cleanup might be skipped
     * 3. It adds boilerplate to every request handler
     *
     * EXPECTED: This test should FAIL because automatic per-request isolation
     * is not supported.
     */
    it('should automatically isolate registry state without manual cleanup', () => {
      const isolate = new SimulatedWorkerIsolate('isolate-1')

      // Simulate first request that crashes after registering
      try {
        isolate.handleRequest((registry) => {
          registry.register('leaked:function', createMockQuery('leaked'))
          throw new Error('Simulated crash')
        })
      } catch {
        // Request crashed, but didn't clean up
      }

      // Second request should have clean state even though first crashed
      // without calling cleanup
      const state = isolate.getRegistryState()

      // EXPECTATION: Registry should be empty for new request
      // REALITY: leaked:function is still registered
      expect(state.size).toBe(0)
      expect(state.paths).not.toContain('leaked:function')
    })

    /**
     * Test that demonstrates the need for scoped/contextual registries.
     */
    it('should support scoped registries tied to request lifecycle', async () => {
      // Simulate multiple concurrent requests that each need isolated state
      const requests = [
        { id: 'req-1', functions: ['users:get', 'users:list'] },
        { id: 'req-2', functions: ['orders:create', 'orders:delete'] },
        { id: 'req-3', functions: ['products:search'] },
      ]

      // Handle all requests "concurrently" (simulated)
      const results = await Promise.all(
        requests.map(async (req) => {
          // Each request should get its own scoped registry
          const registry = FunctionRegistry.getInstance()

          // Register this request's functions
          for (const fn of req.functions) {
            registry.register(fn, createMockQuery(fn), { force: true })
          }

          // Return what this request sees
          return {
            requestId: req.id,
            expectedCount: req.functions.length,
            actualCount: registry.size(),
            paths: Array.from(registry.paths()),
          }
        })
      )

      // EXPECTATION: Each request should only see its own functions
      // REALITY: All requests see the accumulated functions from all requests
      for (const result of results) {
        expect(result.actualCount).toBe(result.expectedCount)
      }
    })
  })

  describe('Durable Objects isolation pattern (expected to FAIL)', () => {
    /**
     * Durable Objects in Workers have persistent state per object instance.
     * Each DO should be able to have its own registry without affecting others.
     *
     * EXPECTED: This test should FAIL because DO-style isolation isn't possible
     * with a global singleton.
     */
    it('should support Durable Object style per-instance isolation', () => {
      // Simulate two Durable Object instances for different users/tenants
      const doUserA = {
        id: 'user-a',
        registry: FunctionRegistry.getInstance(),
      }

      const doUserB = {
        id: 'user-b',
        registry: FunctionRegistry.getInstance(),
      }

      // User A's DO registers user-specific functions
      doUserA.registry.register('workflow:processPayment', createMockQuery('userA'))
      doUserA.registry.registerHttpEndpoint('/api/userA/webhook', 'POST', createMockHttpEndpoint('userA'))

      // User B's DO should NOT see User A's registrations
      // EXPECTATION: User B's registry is independent
      // REALITY: Both DOs share the same singleton

      expect(doUserB.registry.has('workflow:processPayment')).toBe(false)
      expect(doUserB.registry.hasHttpEndpoint('/api/userA/webhook', 'POST')).toBe(false)

      // User B registers their own functions
      doUserB.registry.register('workflow:refund', createMockQuery('userB'))

      // User A should NOT see User B's registrations
      expect(doUserA.registry.has('workflow:refund')).toBe(false)

      // Each DO should have exactly their own functions
      expect(doUserA.registry.size()).toBe(1)
      expect(doUserB.registry.size()).toBe(1)
    })

    /**
     * Test factory pattern that would be needed for proper DO isolation.
     */
    it('should provide a factory for creating isolated registry instances', () => {
      // The registry should support creating independent instances
      // rather than always returning the singleton

      // EXPECTATION: There should be a createInstance() or similar method
      // that returns a new, independent registry
      // REALITY: Only getInstance() exists, which returns the singleton

      // @ts-expect-error - This method doesn't exist but should
      const independentRegistry1 = FunctionRegistry.createInstance?.()
      // @ts-expect-error - This method doesn't exist but should
      const independentRegistry2 = FunctionRegistry.createInstance?.()

      // For now, test fails because createInstance doesn't exist
      expect(typeof FunctionRegistry.createInstance).toBe('function')
    })
  })

  describe('thread-safety and race conditions (expected to FAIL)', () => {
    /**
     * In Workers, multiple requests can be handled concurrently within
     * the same isolate. The singleton pattern can lead to race conditions
     * where one request's cleanup affects another request's state.
     *
     * EXPECTED: This test should FAIL because the singleton doesn't provide
     * any isolation between concurrent operations.
     */
    it('should handle concurrent requests without interference', async () => {
      const results: Array<{ requestId: string; finalSize: number }> = []

      // Simulate concurrent requests that each:
      // 1. Register their function
      // 2. Do some async work
      // 3. Clear the registry (simulating cleanup)
      // 4. Report the final size

      const makeRequest = async (requestId: string, delayMs: number) => {
        const registry = FunctionRegistry.getInstance()

        // Register
        registry.register(`${requestId}:fn`, createMockQuery(requestId), { force: true })

        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, delayMs))

        // Cleanup (this is where the race condition occurs)
        registry.clear()

        // Report final state
        return {
          requestId,
          finalSize: registry.size(),
        }
      }

      // Start multiple requests with different delays
      const promises = [
        makeRequest('fast', 10),
        makeRequest('medium', 50),
        makeRequest('slow', 100),
      ]

      const allResults = await Promise.all(promises)

      // EXPECTATION: Each request should complete its lifecycle independently
      // and report finalSize of 0 (after their cleanup)
      // REALITY: Race conditions cause unpredictable behavior because
      // one request's clear() affects all other requests

      // The fast request clears before medium/slow are done registering
      // This leads to inconsistent state
      for (const result of allResults) {
        expect(result.finalSize).toBe(0)
      }
    })

    /**
     * Test that demonstrates registration conflicts during concurrent operations.
     */
    it('should not have registration conflicts between concurrent contexts', async () => {
      const concurrentOps = 10
      const errors: Error[] = []

      // Multiple concurrent operations trying to register the same path
      // should each get their own isolated context
      const operations = Array.from({ length: concurrentOps }, async (_, i) => {
        try {
          const registry = FunctionRegistry.getInstance()
          // Without { force: true }, this would throw on second registration
          // With a proper isolated registry per context, each would succeed
          registry.register('shared:path', createMockQuery(`op-${i}`))
        } catch (e) {
          errors.push(e as Error)
        }
      })

      await Promise.all(operations)

      // EXPECTATION: With proper isolation, all operations succeed without force
      // REALITY: Only first succeeds, rest throw DUPLICATE_PATH errors
      expect(errors.length).toBe(0)
    })
  })

  describe('API requirements for Workers compatibility', () => {
    /**
     * Documents what the API should look like for proper Workers support.
     */
    it('should support context-scoped registry creation', () => {
      // The registry should support these patterns for Workers:

      // 1. Create an isolated instance for a request/context
      // @ts-expect-error - Method doesn't exist
      const requestScopedRegistry = FunctionRegistry.forContext?.('request-123')

      // 2. Create an instance for a Durable Object
      // @ts-expect-error - Method doesn't exist
      const doRegistry = FunctionRegistry.forDurableObject?.('user-abc')

      // 3. Clone an existing registry
      // @ts-expect-error - Method doesn't exist
      const cloned = FunctionRegistry.getInstance().clone?.()

      // Verify the API exists (these will all fail)
      expect(typeof FunctionRegistry.forContext).toBe('function')
      expect(typeof FunctionRegistry.forDurableObject).toBe('function')
      expect(typeof FunctionRegistry.getInstance().clone).toBe('function')
    })

    /**
     * Test for async context tracking (like AsyncLocalStorage in Node.js).
     */
    it('should support async context tracking for automatic isolation', async () => {
      // Workers support AsyncLocalStorage-like patterns
      // The registry should integrate with this for automatic isolation

      // @ts-expect-error - Method doesn't exist
      const runInIsolatedContext = FunctionRegistry.runInContext

      expect(typeof runInIsolatedContext).toBe('function')

      // Usage would be:
      // await FunctionRegistry.runInContext(async (registry) => {
      //   registry.register('isolated:fn', fn)
      //   // Other requests can't see this
      // })
    })
  })
})
