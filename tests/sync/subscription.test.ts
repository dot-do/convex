/**
 * TDD Tests for Subscription State Management
 *
 * These tests define the expected behavior for the SubscriptionManager that
 * handles real-time query subscriptions in a Convex-compatible way.
 *
 * The SubscriptionManager provides:
 * - Subscribe to queries with callbacks
 * - Unsubscribe from queries
 * - Update subscription data from server
 * - Track subscription lifecycle (pending, active, error, closed)
 * - Handle multiple subscriptions to same query
 * - Reference counting for shared subscriptions
 * - Callback invocation on data changes
 *
 * Bead: convex-936.2 - Subscription State Management
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  SubscriptionManager,
  Subscription,
  SubscriptionState,
  SubscriptionError,
  type SubscriptionCallback,
  type SubscriptionOptions,
} from '../../src/sync/subscription'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock callback for testing.
 */
function createMockCallback(): SubscriptionCallback<unknown> & { mock: ReturnType<typeof vi.fn> } {
  const fn = vi.fn()
  const callback = ((data: unknown) => fn(data)) as SubscriptionCallback<unknown> & { mock: ReturnType<typeof vi.fn> }
  callback.mock = fn
  return callback
}

/**
 * Wait for a specified number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// SubscriptionManager Class Tests
// ============================================================================

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager

  beforeEach(() => {
    manager = new SubscriptionManager()
  })

  afterEach(() => {
    manager.dispose()
  })

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create a new SubscriptionManager instance', () => {
      expect(manager).toBeInstanceOf(SubscriptionManager)
    })

    it('should start with no subscriptions', () => {
      const subscriptions = manager.getSubscriptions()
      expect(subscriptions).toEqual([])
    })

    it('should accept optional configuration', () => {
      const configuredManager = new SubscriptionManager({
        maxSubscriptions: 100,
        deduplicateSubscriptions: true,
      })
      expect(configuredManager).toBeInstanceOf(SubscriptionManager)
      configuredManager.dispose()
    })
  })

  // ============================================================================
  // subscribe() Method Tests
  // ============================================================================

  describe('subscribe()', () => {
    describe('basic subscription', () => {
      it('should create a subscription and return a Subscription object', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        expect(sub).toBeInstanceOf(Subscription)
      })

      it('should assign a unique ID to each subscription', () => {
        const callback1 = createMockCallback()
        const callback2 = createMockCallback()

        const sub1 = manager.subscribe('users:list', {}, callback1)
        const sub2 = manager.subscribe('users:list', {}, callback2)

        expect(sub1.id).toBeDefined()
        expect(sub2.id).toBeDefined()
        expect(sub1.id).not.toBe(sub2.id)
      })

      it('should store the query path in the subscription', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        expect(sub.query).toBe('users:list')
      })

      it('should store the args in the subscription', () => {
        const callback = createMockCallback()
        const args = { limit: 10, offset: 0 }
        const sub = manager.subscribe('users:list', args, callback)

        expect(sub.args).toEqual(args)
      })

      it('should start subscription in pending state', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        expect(sub.state).toBe(SubscriptionState.Pending)
      })

      it('should track subscription in manager', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        const subscriptions = manager.getSubscriptions()
        expect(subscriptions).toContainEqual(expect.objectContaining({ id: sub.id }))
      })
    })

    describe('subscription arguments', () => {
      it('should handle empty args object', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        expect(sub.args).toEqual({})
      })

      it('should handle complex args object', () => {
        const callback = createMockCallback()
        const args = {
          filters: { status: 'active', role: 'admin' },
          pagination: { limit: 10, cursor: 'abc123' },
          sort: { field: 'createdAt', order: 'desc' },
        }
        const sub = manager.subscribe('users:list', args, callback)

        expect(sub.args).toEqual(args)
      })

      it('should handle null args', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:get', null, callback)

        expect(sub.args).toBeNull()
      })

      it('should handle undefined args', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:get', undefined, callback)

        expect(sub.args).toBeUndefined()
      })

      it('should handle args with arrays', () => {
        const callback = createMockCallback()
        const args = { ids: ['id1', 'id2', 'id3'] }
        const sub = manager.subscribe('users:getByIds', args, callback)

        expect(sub.args).toEqual(args)
      })
    })

    describe('subscription options', () => {
      it('should accept subscription options', () => {
        const callback = createMockCallback()
        const options: SubscriptionOptions = { skipInitialCallback: true }
        const sub = manager.subscribe('users:list', {}, callback, options)

        expect(sub).toBeDefined()
      })

      it('should respect skipInitialCallback option', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback, { skipInitialCallback: true })

        // When data arrives, callback should not be called if skip is true and data is initial
        manager.updateSubscription(sub.id, { users: [] }, { isInitial: true })

        expect(callback.mock).not.toHaveBeenCalled()
      })

      it('should call callback on subsequent updates even with skipInitialCallback', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback, { skipInitialCallback: true })

        // First (initial) update
        manager.updateSubscription(sub.id, { users: [] }, { isInitial: true })
        // Second update
        manager.updateSubscription(sub.id, { users: ['user1'] })

        expect(callback.mock).toHaveBeenCalledTimes(1)
        expect(callback.mock).toHaveBeenCalledWith({ users: ['user1'] })
      })

      it('should accept priority option', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback, { priority: 'high' })

        expect(sub.options?.priority).toBe('high')
      })
    })

    describe('multiple subscriptions', () => {
      it('should allow multiple subscriptions to the same query', () => {
        const callback1 = createMockCallback()
        const callback2 = createMockCallback()

        const sub1 = manager.subscribe('users:list', {}, callback1)
        const sub2 = manager.subscribe('users:list', {}, callback2)

        expect(manager.getSubscriptions().length).toBe(2)
      })

      it('should allow multiple subscriptions to different queries', () => {
        const callback1 = createMockCallback()
        const callback2 = createMockCallback()

        manager.subscribe('users:list', {}, callback1)
        manager.subscribe('messages:list', {}, callback2)

        expect(manager.getSubscriptions().length).toBe(2)
      })

      it('should allow 100 concurrent subscriptions', () => {
        const callbacks = Array(100).fill(null).map(() => createMockCallback())

        callbacks.forEach((cb, i) => {
          manager.subscribe(`query:${i}`, { index: i }, cb)
        })

        expect(manager.getSubscriptions().length).toBe(100)
      })
    })
  })

  // ============================================================================
  // unsubscribe() Method Tests
  // ============================================================================

  describe('unsubscribe()', () => {
    it('should remove subscription by ID', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      manager.unsubscribe(sub.id)

      const subscriptions = manager.getSubscriptions()
      expect(subscriptions.find(s => s.id === sub.id)).toBeUndefined()
    })

    it('should change subscription state to closed', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      manager.unsubscribe(sub.id)

      expect(sub.state).toBe(SubscriptionState.Closed)
    })

    it('should return true when subscription was found and removed', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      const result = manager.unsubscribe(sub.id)

      expect(result).toBe(true)
    })

    it('should return false when subscription ID does not exist', () => {
      const result = manager.unsubscribe('nonexistent-id')

      expect(result).toBe(false)
    })

    it('should not affect other subscriptions', () => {
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      const sub1 = manager.subscribe('users:list', {}, callback1)
      const sub2 = manager.subscribe('messages:list', {}, callback2)

      manager.unsubscribe(sub1.id)

      const subscriptions = manager.getSubscriptions()
      expect(subscriptions.length).toBe(1)
      expect(subscriptions[0].id).toBe(sub2.id)
    })

    it('should not call callback after unsubscribe', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      manager.unsubscribe(sub.id)
      manager.updateSubscription(sub.id, { users: ['new'] })

      expect(callback.mock).not.toHaveBeenCalled()
    })

    it('should be idempotent for same subscription ID', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      const result1 = manager.unsubscribe(sub.id)
      const result2 = manager.unsubscribe(sub.id)

      expect(result1).toBe(true)
      expect(result2).toBe(false)
    })
  })

  // ============================================================================
  // updateSubscription() Method Tests
  // ============================================================================

  describe('updateSubscription()', () => {
    it('should update subscription data', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)
      const newData = { users: [{ id: '1', name: 'Alice' }] }

      manager.updateSubscription(sub.id, newData)

      expect(sub.data).toEqual(newData)
    })

    it('should call subscription callback with new data', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)
      const newData = { users: [{ id: '1', name: 'Alice' }] }

      manager.updateSubscription(sub.id, newData)

      expect(callback.mock).toHaveBeenCalledWith(newData)
    })

    it('should change state from pending to active on first update', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      expect(sub.state).toBe(SubscriptionState.Pending)

      manager.updateSubscription(sub.id, { users: [] })

      expect(sub.state).toBe(SubscriptionState.Active)
    })

    it('should return true when subscription was updated', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      const result = manager.updateSubscription(sub.id, { data: 'new' })

      expect(result).toBe(true)
    })

    it('should return false when subscription ID does not exist', () => {
      const result = manager.updateSubscription('nonexistent-id', { data: 'new' })

      expect(result).toBe(false)
    })

    it('should handle null data', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:get', { id: '123' }, callback)

      manager.updateSubscription(sub.id, null)

      expect(sub.data).toBeNull()
      expect(callback.mock).toHaveBeenCalledWith(null)
    })

    it('should handle undefined data', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:get', { id: '123' }, callback)

      manager.updateSubscription(sub.id, undefined)

      expect(sub.data).toBeUndefined()
    })

    it('should handle array data', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)
      const arrayData = [{ id: '1' }, { id: '2' }]

      manager.updateSubscription(sub.id, arrayData)

      expect(sub.data).toEqual(arrayData)
    })

    it('should call callback multiple times for multiple updates', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      manager.updateSubscription(sub.id, { count: 1 })
      manager.updateSubscription(sub.id, { count: 2 })
      manager.updateSubscription(sub.id, { count: 3 })

      expect(callback.mock).toHaveBeenCalledTimes(3)
    })

    it('should preserve data history when tracking enabled', () => {
      const manager = new SubscriptionManager({ trackHistory: true })
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      manager.updateSubscription(sub.id, { v: 1 })
      manager.updateSubscription(sub.id, { v: 2 })
      manager.updateSubscription(sub.id, { v: 3 })

      expect(sub.history).toHaveLength(3)
      expect(sub.history![0]).toEqual({ v: 1 })
      expect(sub.history![2]).toEqual({ v: 3 })

      manager.dispose()
    })
  })

  // ============================================================================
  // getSubscriptions() Method Tests
  // ============================================================================

  describe('getSubscriptions()', () => {
    it('should return empty array when no subscriptions', () => {
      const subscriptions = manager.getSubscriptions()
      expect(subscriptions).toEqual([])
    })

    it('should return all active subscriptions', () => {
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      manager.subscribe('users:list', {}, callback1)
      manager.subscribe('messages:list', {}, callback2)

      const subscriptions = manager.getSubscriptions()
      expect(subscriptions.length).toBe(2)
    })

    it('should not include closed subscriptions', () => {
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      const sub1 = manager.subscribe('users:list', {}, callback1)
      manager.subscribe('messages:list', {}, callback2)

      manager.unsubscribe(sub1.id)

      const subscriptions = manager.getSubscriptions()
      expect(subscriptions.length).toBe(1)
    })

    it('should return Subscription objects', () => {
      const callback = createMockCallback()
      manager.subscribe('users:list', {}, callback)

      const subscriptions = manager.getSubscriptions()
      expect(subscriptions[0]).toBeInstanceOf(Subscription)
    })

    it('should filter by query when provided', () => {
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()
      const callback3 = createMockCallback()

      manager.subscribe('users:list', {}, callback1)
      manager.subscribe('users:list', { filter: 'active' }, callback2)
      manager.subscribe('messages:list', {}, callback3)

      const userSubs = manager.getSubscriptions({ query: 'users:list' })
      expect(userSubs.length).toBe(2)
    })

    it('should filter by state when provided', () => {
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      const sub1 = manager.subscribe('users:list', {}, callback1)
      manager.subscribe('messages:list', {}, callback2)

      manager.updateSubscription(sub1.id, { users: [] })

      const activeSubs = manager.getSubscriptions({ state: SubscriptionState.Active })
      expect(activeSubs.length).toBe(1)

      const pendingSubs = manager.getSubscriptions({ state: SubscriptionState.Pending })
      expect(pendingSubs.length).toBe(1)
    })
  })

  // ============================================================================
  // Subscription Lifecycle Tests
  // ============================================================================

  describe('subscription lifecycle', () => {
    describe('state transitions', () => {
      it('should start in Pending state', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        expect(sub.state).toBe(SubscriptionState.Pending)
      })

      it('should transition to Active on first successful update', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        manager.updateSubscription(sub.id, { users: [] })

        expect(sub.state).toBe(SubscriptionState.Active)
      })

      it('should transition to Error on error', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        manager.setSubscriptionError(sub.id, new Error('Query failed'))

        expect(sub.state).toBe(SubscriptionState.Error)
      })

      it('should transition to Closed on unsubscribe', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        manager.unsubscribe(sub.id)

        expect(sub.state).toBe(SubscriptionState.Closed)
      })

      it('should transition from Active to Error on error', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        manager.updateSubscription(sub.id, { users: [] })
        expect(sub.state).toBe(SubscriptionState.Active)

        manager.setSubscriptionError(sub.id, new Error('Connection lost'))
        expect(sub.state).toBe(SubscriptionState.Error)
      })

      it('should transition from Error to Active on recovery', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        manager.setSubscriptionError(sub.id, new Error('Temporary error'))
        expect(sub.state).toBe(SubscriptionState.Error)

        manager.updateSubscription(sub.id, { users: [] })
        expect(sub.state).toBe(SubscriptionState.Active)
      })
    })

    describe('error handling', () => {
      it('should store error on subscription', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)
        const error = new Error('Query failed')

        manager.setSubscriptionError(sub.id, error)

        expect(sub.error).toBe(error)
      })

      it('should clear error on successful update', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        manager.setSubscriptionError(sub.id, new Error('Temporary error'))
        expect(sub.error).toBeDefined()

        manager.updateSubscription(sub.id, { users: [] })
        expect(sub.error).toBeUndefined()
      })

      it('should support error callback option', () => {
        const dataCallback = createMockCallback()
        const errorCallback = vi.fn()
        const sub = manager.subscribe('users:list', {}, dataCallback, {
          onError: errorCallback,
        })

        const error = new Error('Query failed')
        manager.setSubscriptionError(sub.id, error)

        expect(errorCallback).toHaveBeenCalledWith(error)
      })

      it('should not call data callback on error', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        manager.setSubscriptionError(sub.id, new Error('Query failed'))

        expect(callback.mock).not.toHaveBeenCalled()
      })
    })

    describe('timestamps', () => {
      it('should track creation time', () => {
        const before = Date.now()
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)
        const after = Date.now()

        expect(sub.createdAt).toBeGreaterThanOrEqual(before)
        expect(sub.createdAt).toBeLessThanOrEqual(after)
      })

      it('should track last update time', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        const before = Date.now()
        manager.updateSubscription(sub.id, { users: [] })
        const after = Date.now()

        expect(sub.updatedAt).toBeGreaterThanOrEqual(before)
        expect(sub.updatedAt).toBeLessThanOrEqual(after)
      })

      it('should update timestamp on each update', async () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        manager.updateSubscription(sub.id, { v: 1 })
        const firstUpdate = sub.updatedAt

        await delay(10)

        manager.updateSubscription(sub.id, { v: 2 })
        const secondUpdate = sub.updatedAt

        expect(secondUpdate).toBeGreaterThan(firstUpdate!)
      })
    })
  })

  // ============================================================================
  // Multiple Subscriptions to Same Query Tests
  // ============================================================================

  describe('multiple subscriptions to same query', () => {
    it('should call all callbacks when data updates', () => {
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()
      const callback3 = createMockCallback()

      const sub1 = manager.subscribe('users:list', {}, callback1)
      const sub2 = manager.subscribe('users:list', {}, callback2)
      const sub3 = manager.subscribe('users:list', {}, callback3)

      const data = { users: ['Alice', 'Bob'] }

      // Update all subscriptions with same query
      manager.updateSubscription(sub1.id, data)
      manager.updateSubscription(sub2.id, data)
      manager.updateSubscription(sub3.id, data)

      expect(callback1.mock).toHaveBeenCalledWith(data)
      expect(callback2.mock).toHaveBeenCalledWith(data)
      expect(callback3.mock).toHaveBeenCalledWith(data)
    })

    it('should update subscriptions independently', () => {
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      const sub1 = manager.subscribe('users:list', { filter: 'active' }, callback1)
      const sub2 = manager.subscribe('users:list', { filter: 'inactive' }, callback2)

      manager.updateSubscription(sub1.id, { users: ['active-user'] })
      manager.updateSubscription(sub2.id, { users: ['inactive-user'] })

      expect(callback1.mock).toHaveBeenCalledWith({ users: ['active-user'] })
      expect(callback2.mock).toHaveBeenCalledWith({ users: ['inactive-user'] })
    })

    it('should allow unsubscribing one without affecting others', () => {
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      const sub1 = manager.subscribe('users:list', {}, callback1)
      const sub2 = manager.subscribe('users:list', {}, callback2)

      manager.unsubscribe(sub1.id)

      manager.updateSubscription(sub2.id, { users: ['data'] })

      expect(callback1.mock).not.toHaveBeenCalled()
      expect(callback2.mock).toHaveBeenCalledWith({ users: ['data'] })
    })

    it('should track each subscription state independently', () => {
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      const sub1 = manager.subscribe('users:list', {}, callback1)
      const sub2 = manager.subscribe('users:list', {}, callback2)

      manager.updateSubscription(sub1.id, { users: [] })
      manager.setSubscriptionError(sub2.id, new Error('Error'))

      expect(sub1.state).toBe(SubscriptionState.Active)
      expect(sub2.state).toBe(SubscriptionState.Error)
    })
  })

  // ============================================================================
  // Subscription Reference Counting Tests
  // ============================================================================

  describe('subscription reference counting', () => {
    it('should track reference count for deduplicated subscriptions', () => {
      const dedupeManager = new SubscriptionManager({ deduplicateSubscriptions: true })
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      const sub1 = dedupeManager.subscribe('users:list', { limit: 10 }, callback1)
      const sub2 = dedupeManager.subscribe('users:list', { limit: 10 }, callback2)

      // With deduplication, both callbacks share the same underlying query
      expect(dedupeManager.getQueryRefCount('users:list', { limit: 10 })).toBe(2)

      dedupeManager.dispose()
    })

    it('should decrement ref count on unsubscribe', () => {
      const dedupeManager = new SubscriptionManager({ deduplicateSubscriptions: true })
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      const sub1 = dedupeManager.subscribe('users:list', { limit: 10 }, callback1)
      const sub2 = dedupeManager.subscribe('users:list', { limit: 10 }, callback2)

      dedupeManager.unsubscribe(sub1.id)

      expect(dedupeManager.getQueryRefCount('users:list', { limit: 10 })).toBe(1)

      dedupeManager.dispose()
    })

    it('should only remove query subscription when ref count reaches zero', () => {
      const dedupeManager = new SubscriptionManager({ deduplicateSubscriptions: true })
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      const sub1 = dedupeManager.subscribe('users:list', { limit: 10 }, callback1)
      const sub2 = dedupeManager.subscribe('users:list', { limit: 10 }, callback2)

      dedupeManager.unsubscribe(sub1.id)
      // Query should still be tracked
      expect(dedupeManager.hasActiveQuery('users:list', { limit: 10 })).toBe(true)

      dedupeManager.unsubscribe(sub2.id)
      // Now query should be removed
      expect(dedupeManager.hasActiveQuery('users:list', { limit: 10 })).toBe(false)

      dedupeManager.dispose()
    })

    it('should call all callbacks when deduplicated subscription updates', () => {
      const dedupeManager = new SubscriptionManager({ deduplicateSubscriptions: true })
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      const sub1 = dedupeManager.subscribe('users:list', { limit: 10 }, callback1)
      const sub2 = dedupeManager.subscribe('users:list', { limit: 10 }, callback2)

      const data = { users: ['Alice'] }
      dedupeManager.updateByQuery('users:list', { limit: 10 }, data)

      expect(callback1.mock).toHaveBeenCalledWith(data)
      expect(callback2.mock).toHaveBeenCalledWith(data)

      dedupeManager.dispose()
    })

    it('should treat different args as separate queries', () => {
      const dedupeManager = new SubscriptionManager({ deduplicateSubscriptions: true })
      const callback1 = createMockCallback()
      const callback2 = createMockCallback()

      dedupeManager.subscribe('users:list', { limit: 10 }, callback1)
      dedupeManager.subscribe('users:list', { limit: 20 }, callback2)

      expect(dedupeManager.getQueryRefCount('users:list', { limit: 10 })).toBe(1)
      expect(dedupeManager.getQueryRefCount('users:list', { limit: 20 })).toBe(1)

      dedupeManager.dispose()
    })
  })

  // ============================================================================
  // Callback Invocation Tests
  // ============================================================================

  describe('subscription callbacks', () => {
    it('should invoke callback synchronously on update', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      manager.updateSubscription(sub.id, { data: 'test' })

      expect(callback.mock).toHaveBeenCalledTimes(1)
    })

    it('should pass correct data to callback', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)
      const expectedData = { users: [{ id: '1', name: 'Alice' }], total: 1 }

      manager.updateSubscription(sub.id, expectedData)

      expect(callback.mock).toHaveBeenCalledWith(expectedData)
    })

    it('should handle callback that throws error', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error')
      })
      const sub = manager.subscribe('users:list', {}, errorCallback)

      // Should not throw
      expect(() => manager.updateSubscription(sub.id, { data: 'test' })).not.toThrow()
    })

    it('should continue calling other callbacks when one throws', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error')
      })
      const successCallback = createMockCallback()

      const sub1 = manager.subscribe('users:list', {}, errorCallback)
      const sub2 = manager.subscribe('users:list', {}, successCallback)

      manager.updateSubscription(sub1.id, { data: 'test' })
      manager.updateSubscription(sub2.id, { data: 'test' })

      expect(successCallback.mock).toHaveBeenCalled()
    })

    it('should support async callbacks', async () => {
      let resolved = false
      const asyncCallback = vi.fn(async (data: unknown) => {
        await delay(10)
        resolved = true
      })

      const sub = manager.subscribe('users:list', {}, asyncCallback)
      manager.updateSubscription(sub.id, { data: 'test' })

      expect(asyncCallback).toHaveBeenCalled()

      await delay(20)
      expect(resolved).toBe(true)
    })
  })

  // ============================================================================
  // Subscription Object Tests
  // ============================================================================

  describe('Subscription object', () => {
    it('should have readonly id property', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      expect(sub.id).toBeDefined()
      expect(typeof sub.id).toBe('string')
    })

    it('should have query property', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      expect(sub.query).toBe('users:list')
    })

    it('should have args property', () => {
      const callback = createMockCallback()
      const args = { limit: 10 }
      const sub = manager.subscribe('users:list', args, callback)

      expect(sub.args).toEqual(args)
    })

    it('should have state property', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      expect(sub.state).toBe(SubscriptionState.Pending)
    })

    it('should have data property after update', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)
      const data = { users: [] }

      manager.updateSubscription(sub.id, data)

      expect(sub.data).toEqual(data)
    })

    it('should have error property when in error state', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)
      const error = new Error('Test error')

      manager.setSubscriptionError(sub.id, error)

      expect(sub.error).toBe(error)
    })

    it('should have unsubscribe method', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      expect(typeof sub.unsubscribe).toBe('function')

      sub.unsubscribe()

      expect(sub.state).toBe(SubscriptionState.Closed)
    })

    it('should have isActive getter', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      expect(sub.isActive).toBe(false)

      manager.updateSubscription(sub.id, { data: 'test' })

      expect(sub.isActive).toBe(true)
    })

    it('should have isPending getter', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      expect(sub.isPending).toBe(true)

      manager.updateSubscription(sub.id, { data: 'test' })

      expect(sub.isPending).toBe(false)
    })

    it('should have isClosed getter', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      expect(sub.isClosed).toBe(false)

      manager.unsubscribe(sub.id)

      expect(sub.isClosed).toBe(true)
    })

    it('should have hasError getter', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      expect(sub.hasError).toBe(false)

      manager.setSubscriptionError(sub.id, new Error('Test'))

      expect(sub.hasError).toBe(true)
    })
  })

  // ============================================================================
  // SubscriptionManager Utility Methods
  // ============================================================================

  describe('utility methods', () => {
    describe('getSubscriptionById()', () => {
      it('should return subscription by ID', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        const found = manager.getSubscriptionById(sub.id)

        expect(found).toBe(sub)
      })

      it('should return undefined for unknown ID', () => {
        const found = manager.getSubscriptionById('unknown-id')

        expect(found).toBeUndefined()
      })
    })

    describe('hasSubscription()', () => {
      it('should return true for existing subscription', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        expect(manager.hasSubscription(sub.id)).toBe(true)
      })

      it('should return false for non-existent subscription', () => {
        expect(manager.hasSubscription('unknown-id')).toBe(false)
      })

      it('should return false after unsubscribe', () => {
        const callback = createMockCallback()
        const sub = manager.subscribe('users:list', {}, callback)

        manager.unsubscribe(sub.id)

        expect(manager.hasSubscription(sub.id)).toBe(false)
      })
    })

    describe('getSubscriptionCount()', () => {
      it('should return 0 for empty manager', () => {
        expect(manager.getSubscriptionCount()).toBe(0)
      })

      it('should return correct count', () => {
        const callback = createMockCallback()

        manager.subscribe('users:list', {}, callback)
        manager.subscribe('messages:list', {}, callback)
        manager.subscribe('posts:list', {}, callback)

        expect(manager.getSubscriptionCount()).toBe(3)
      })

      it('should decrement on unsubscribe', () => {
        const callback = createMockCallback()

        const sub = manager.subscribe('users:list', {}, callback)
        manager.subscribe('messages:list', {}, callback)

        expect(manager.getSubscriptionCount()).toBe(2)

        manager.unsubscribe(sub.id)

        expect(manager.getSubscriptionCount()).toBe(1)
      })
    })

    describe('unsubscribeAll()', () => {
      it('should remove all subscriptions', () => {
        const callback = createMockCallback()

        manager.subscribe('users:list', {}, callback)
        manager.subscribe('messages:list', {}, callback)
        manager.subscribe('posts:list', {}, callback)

        manager.unsubscribeAll()

        expect(manager.getSubscriptionCount()).toBe(0)
      })

      it('should set all subscriptions to closed state', () => {
        const callback = createMockCallback()

        const sub1 = manager.subscribe('users:list', {}, callback)
        const sub2 = manager.subscribe('messages:list', {}, callback)

        manager.unsubscribeAll()

        expect(sub1.state).toBe(SubscriptionState.Closed)
        expect(sub2.state).toBe(SubscriptionState.Closed)
      })
    })

    describe('unsubscribeByQuery()', () => {
      it('should remove all subscriptions for a specific query', () => {
        const callback = createMockCallback()

        manager.subscribe('users:list', {}, callback)
        manager.subscribe('users:list', { filter: 'active' }, callback)
        manager.subscribe('messages:list', {}, callback)

        const removed = manager.unsubscribeByQuery('users:list')

        expect(removed).toBe(2)
        expect(manager.getSubscriptionCount()).toBe(1)
      })

      it('should return 0 when no matching subscriptions', () => {
        const callback = createMockCallback()

        manager.subscribe('messages:list', {}, callback)

        const removed = manager.unsubscribeByQuery('users:list')

        expect(removed).toBe(0)
      })
    });

    describe('dispose()', () => {
      it('should unsubscribe all and clean up resources', () => {
        const callback = createMockCallback()

        manager.subscribe('users:list', {}, callback)
        manager.subscribe('messages:list', {}, callback)

        manager.dispose()

        expect(manager.getSubscriptionCount()).toBe(0)
      })

      it('should prevent new subscriptions after dispose', () => {
        manager.dispose()

        const callback = createMockCallback()

        expect(() => manager.subscribe('users:list', {}, callback))
          .toThrow(SubscriptionError)
      })

      it('should be idempotent', () => {
        manager.dispose()

        expect(() => manager.dispose()).not.toThrow()
      })
    })
  })

  // ============================================================================
  // SubscriptionError Tests
  // ============================================================================

  describe('SubscriptionError', () => {
    it('should be an instance of Error', () => {
      const error = new SubscriptionError('test message')
      expect(error).toBeInstanceOf(Error)
    })

    it('should have correct name', () => {
      const error = new SubscriptionError('test message')
      expect(error.name).toBe('SubscriptionError')
    })

    it('should preserve message', () => {
      const error = new SubscriptionError('test message')
      expect(error.message).toBe('test message')
    })

    it('should have optional code property', () => {
      const error = new SubscriptionError('test', 'SUBSCRIPTION_CLOSED')
      expect(error.code).toBe('SUBSCRIPTION_CLOSED')
    })

    it('should have optional subscriptionId property', () => {
      const error = new SubscriptionError('test', 'ERROR', 'sub-123')
      expect(error.subscriptionId).toBe('sub-123')
    })
  })

  // ============================================================================
  // SubscriptionState Enum Tests
  // ============================================================================

  describe('SubscriptionState', () => {
    it('should have Pending state', () => {
      expect(SubscriptionState.Pending).toBeDefined()
    })

    it('should have Active state', () => {
      expect(SubscriptionState.Active).toBeDefined()
    })

    it('should have Error state', () => {
      expect(SubscriptionState.Error).toBeDefined()
    })

    it('should have Closed state', () => {
      expect(SubscriptionState.Closed).toBeDefined()
    })

    it('should have distinct values for each state', () => {
      const states = [
        SubscriptionState.Pending,
        SubscriptionState.Active,
        SubscriptionState.Error,
        SubscriptionState.Closed,
      ]
      const uniqueStates = new Set(states)
      expect(uniqueStates.size).toBe(4)
    })
  })

  // ============================================================================
  // Edge Cases and Stress Tests
  // ============================================================================

  describe('edge cases', () => {
    it('should handle rapid subscribe/unsubscribe cycles', () => {
      const callback = createMockCallback()

      for (let i = 0; i < 100; i++) {
        const sub = manager.subscribe('users:list', {}, callback)
        manager.unsubscribe(sub.id)
      }

      expect(manager.getSubscriptionCount()).toBe(0)
    })

    it('should handle updates to already closed subscription', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      manager.unsubscribe(sub.id)

      const result = manager.updateSubscription(sub.id, { data: 'new' })

      expect(result).toBe(false)
      expect(callback.mock).not.toHaveBeenCalled()
    })

    it('should handle very large data updates', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', {}, callback)

      const largeData = {
        users: Array(10000).fill(null).map((_, i) => ({
          id: `user-${i}`,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          metadata: { index: i, tags: ['tag1', 'tag2', 'tag3'] },
        })),
      }

      manager.updateSubscription(sub.id, largeData)

      expect(callback.mock).toHaveBeenCalledWith(largeData)
    })

    it('should handle special characters in query paths', () => {
      const callback = createMockCallback()

      const sub = manager.subscribe('api/v2/users:list', {}, callback)

      expect(sub.query).toBe('api/v2/users:list')
    })

    it('should handle complex nested args', () => {
      const callback = createMockCallback()
      const complexArgs = {
        filters: {
          and: [
            { field: 'status', op: 'eq', value: 'active' },
            {
              or: [
                { field: 'role', op: 'eq', value: 'admin' },
                { field: 'role', op: 'eq', value: 'superuser' },
              ],
            },
          ],
        },
        pagination: {
          cursor: { id: 'abc123', createdAt: new Date().toISOString() },
          limit: 50,
        },
      }

      const sub = manager.subscribe('users:search', complexArgs, callback)

      expect(sub.args).toEqual(complexArgs)
    })

    it('should maintain subscription order', () => {
      const callbacks = Array(10).fill(null).map(() => createMockCallback())
      const subs: Subscription[] = []

      callbacks.forEach((cb, i) => {
        subs.push(manager.subscribe(`query:${i}`, {}, cb))
      })

      const subscriptions = manager.getSubscriptions()

      subs.forEach((sub, i) => {
        expect(subscriptions[i].id).toBe(sub.id)
      })
    })
  })

  // ============================================================================
  // Events and Hooks Tests
  // ============================================================================

  describe('events and hooks', () => {
    it('should emit event on subscription created', () => {
      const onSubscribe = vi.fn()
      const eventManager = new SubscriptionManager({ onSubscribe })
      const callback = createMockCallback()

      const sub = eventManager.subscribe('users:list', {}, callback)

      expect(onSubscribe).toHaveBeenCalledWith(sub)

      eventManager.dispose()
    })

    it('should emit event on subscription closed', () => {
      const onUnsubscribe = vi.fn()
      const eventManager = new SubscriptionManager({ onUnsubscribe })
      const callback = createMockCallback()

      const sub = eventManager.subscribe('users:list', {}, callback)
      eventManager.unsubscribe(sub.id)

      expect(onUnsubscribe).toHaveBeenCalledWith(sub)

      eventManager.dispose()
    })

    it('should emit event on data update', () => {
      const onUpdate = vi.fn()
      const eventManager = new SubscriptionManager({ onUpdate })
      const callback = createMockCallback()

      const sub = eventManager.subscribe('users:list', {}, callback)
      const data = { users: [] }
      eventManager.updateSubscription(sub.id, data)

      expect(onUpdate).toHaveBeenCalledWith(sub, data)

      eventManager.dispose()
    })

    it('should emit event on error', () => {
      const onSubscriptionError = vi.fn()
      const eventManager = new SubscriptionManager({ onSubscriptionError })
      const callback = createMockCallback()

      const sub = eventManager.subscribe('users:list', {}, callback)
      const error = new Error('Test error')
      eventManager.setSubscriptionError(sub.id, error)

      expect(onSubscriptionError).toHaveBeenCalledWith(sub, error)

      eventManager.dispose()
    })
  })

  // ============================================================================
  // Serialization Tests
  // ============================================================================

  describe('serialization', () => {
    it('should serialize subscription to JSON', () => {
      const callback = createMockCallback()
      const sub = manager.subscribe('users:list', { limit: 10 }, callback)

      manager.updateSubscription(sub.id, { users: [] })

      const json = sub.toJSON()

      expect(json).toEqual({
        id: sub.id,
        query: 'users:list',
        args: { limit: 10 },
        state: SubscriptionState.Active,
        data: { users: [] },
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      })
    })

    it('should serialize manager state', () => {
      const callback = createMockCallback()

      manager.subscribe('users:list', {}, callback)
      manager.subscribe('messages:list', {}, callback)

      const state = manager.toJSON()

      expect(state).toEqual({
        subscriptions: expect.any(Array),
        count: 2,
      })
      expect(state.subscriptions.length).toBe(2)
    })
  })
})
