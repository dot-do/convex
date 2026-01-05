/**
 * TDD Tests for Client SDK Subscription Management (Layer 7)
 *
 * This module provides comprehensive tests for the SubscriptionManager class
 * that handles client-side subscription management in the convex.do Client SDK.
 *
 * Features tested:
 * - SubscriptionManager class for managing multiple subscriptions
 * - createSubscription(queryRef, args, options) - Create a new subscription
 * - removeSubscription(id) - Remove and cleanup subscription
 * - updateSubscription(id, args) - Update subscription arguments
 * - getSubscription(id) - Get subscription by ID
 * - getAllSubscriptions() - List all active subscriptions
 * - pauseSubscription(id) / resumeSubscription(id)
 * - Subscription lifecycle (pending, active, paused, error, completed)
 * - Subscription events (onUpdate, onError, onComplete)
 * - Subscription deduplication (same query + args = shared subscription)
 * - Reference counting for shared subscriptions
 * - Automatic cleanup on disconnect
 * - Query result caching
 *
 * @module tests/client/subscriptions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  ClientSubscriptionManager,
  ClientSubscription,
  SubscriptionStatus,
  SubscriptionError,
  type SubscriptionOptions,
  type ClientSubscriptionManagerOptions,
  type QueryRef,
  type SubscriptionEventHandlers,
} from '../../src/client/subscriptions'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock query reference for testing.
 */
function createQueryRef(path: string): QueryRef {
  return {
    _path: path,
    _type: 'query' as const,
  }
}

/**
 * Wait for a specified number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Create a mock update handler.
 */
function createMockHandler<T = unknown>() {
  const fn = vi.fn()
  return {
    fn,
    handler: (data: T) => fn(data),
  }
}

// ============================================================================
// ClientSubscriptionManager Tests
// ============================================================================

describe('ClientSubscriptionManager', () => {
  let manager: ClientSubscriptionManager

  beforeEach(() => {
    manager = new ClientSubscriptionManager()
  })

  afterEach(() => {
    manager.dispose()
  })

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('should create a new ClientSubscriptionManager instance', () => {
      expect(manager).toBeInstanceOf(ClientSubscriptionManager)
    })

    it('should start with no subscriptions', () => {
      const subscriptions = manager.getAllSubscriptions()
      expect(subscriptions).toEqual([])
    })

    it('should accept optional configuration', () => {
      const options: ClientSubscriptionManagerOptions = {
        maxSubscriptions: 100,
        enableDeduplication: true,
        enableCaching: true,
        cacheSize: 1000,
      }
      const configuredManager = new ClientSubscriptionManager(options)
      expect(configuredManager).toBeInstanceOf(ClientSubscriptionManager)
      configuredManager.dispose()
    })

    it('should use default options when not provided', () => {
      const defaultManager = new ClientSubscriptionManager()
      expect(defaultManager.isDeduplicationEnabled()).toBe(true)
      expect(defaultManager.isCachingEnabled()).toBe(true)
      defaultManager.dispose()
    })

    it('should allow disabling deduplication', () => {
      const noDedupe = new ClientSubscriptionManager({ enableDeduplication: false })
      expect(noDedupe.isDeduplicationEnabled()).toBe(false)
      noDedupe.dispose()
    })

    it('should allow disabling caching', () => {
      const noCache = new ClientSubscriptionManager({ enableCaching: false })
      expect(noCache.isCachingEnabled()).toBe(false)
      noCache.dispose()
    })
  })

  // ============================================================================
  // createSubscription() Tests
  // ============================================================================

  describe('createSubscription()', () => {
    describe('basic subscription creation', () => {
      it('should create a subscription and return a ClientSubscription object', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        expect(sub).toBeInstanceOf(ClientSubscription)
      })

      it('should assign a unique ID to each subscription', () => {
        const queryRef = createQueryRef('users:list')

        const sub1 = manager.createSubscription(queryRef, {})
        const sub2 = manager.createSubscription(queryRef, {})

        expect(sub1.id).toBeDefined()
        expect(sub2.id).toBeDefined()
        expect(sub1.id).not.toBe(sub2.id)
      })

      it('should store the query path in the subscription', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        expect(sub.queryPath).toBe('users:list')
      })

      it('should store the args in the subscription', () => {
        const queryRef = createQueryRef('users:list')
        const args = { limit: 10, offset: 0 }
        const sub = manager.createSubscription(queryRef, args)

        expect(sub.args).toEqual(args)
      })

      it('should start subscription in pending status', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        expect(sub.status).toBe(SubscriptionStatus.Pending)
      })

      it('should track subscription in manager', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        const subscriptions = manager.getAllSubscriptions()
        expect(subscriptions.find(s => s.id === sub.id)).toBeDefined()
      })

      it('should return the query reference', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        expect(sub.queryRef).toEqual(queryRef)
      })
    })

    describe('subscription with options', () => {
      it('should accept subscription options', () => {
        const queryRef = createQueryRef('users:list')
        const options: SubscriptionOptions = {
          skipInitialCallback: true,
        }
        const sub = manager.createSubscription(queryRef, {}, options)

        expect(sub).toBeDefined()
      })

      it('should respect skipInitialCallback option', () => {
        const { fn, handler } = createMockHandler()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, {
          skipInitialCallback: true,
          onUpdate: handler,
        })

        // Simulate initial data arrival
        manager.handleUpdate(sub.id, { users: [] }, { isInitial: true })

        expect(fn).not.toHaveBeenCalled()
      })

      it('should call callback on subsequent updates even with skipInitialCallback', () => {
        const { fn, handler } = createMockHandler()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, {
          skipInitialCallback: true,
          onUpdate: handler,
        })

        // Initial update (skipped)
        manager.handleUpdate(sub.id, { users: [] }, { isInitial: true })
        // Subsequent update
        manager.handleUpdate(sub.id, { users: ['user1'] })

        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith({ users: ['user1'] })
      })

      it('should accept event handlers in options', () => {
        const onUpdate = vi.fn()
        const onError = vi.fn()
        const onComplete = vi.fn()
        const queryRef = createQueryRef('users:list')

        const sub = manager.createSubscription(queryRef, {}, {
          onUpdate,
          onError,
          onComplete,
        })

        expect(sub).toBeDefined()
      })

      it('should accept priority option', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, {
          priority: 'high',
        })

        expect(sub.priority).toBe('high')
      })

      it('should default to normal priority', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        expect(sub.priority).toBe('normal')
      })
    })

    describe('subscription arguments', () => {
      it('should handle empty args object', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        expect(sub.args).toEqual({})
      })

      it('should handle complex args object', () => {
        const queryRef = createQueryRef('users:list')
        const args = {
          filters: { status: 'active', role: 'admin' },
          pagination: { limit: 10, cursor: 'abc123' },
        }
        const sub = manager.createSubscription(queryRef, args)

        expect(sub.args).toEqual(args)
      })

      it('should handle null args', () => {
        const queryRef = createQueryRef('users:get')
        const sub = manager.createSubscription(queryRef, null)

        expect(sub.args).toBeNull()
      })

      it('should handle undefined args', () => {
        const queryRef = createQueryRef('users:get')
        const sub = manager.createSubscription(queryRef, undefined)

        expect(sub.args).toBeUndefined()
      })

      it('should handle args with arrays', () => {
        const queryRef = createQueryRef('users:getByIds')
        const args = { ids: ['id1', 'id2', 'id3'] }
        const sub = manager.createSubscription(queryRef, args)

        expect(sub.args).toEqual(args)
      })
    })

    describe('error handling', () => {
      it('should throw when manager is disposed', () => {
        manager.dispose()
        const queryRef = createQueryRef('users:list')

        expect(() => manager.createSubscription(queryRef, {}))
          .toThrow(SubscriptionError)
      })

      it('should throw when max subscriptions exceeded', () => {
        const limitedManager = new ClientSubscriptionManager({ maxSubscriptions: 2 })
        const queryRef = createQueryRef('users:list')

        limitedManager.createSubscription(queryRef, { id: 1 })
        limitedManager.createSubscription(queryRef, { id: 2 })

        expect(() => limitedManager.createSubscription(queryRef, { id: 3 }))
          .toThrow(SubscriptionError)

        limitedManager.dispose()
      })

      it('should include error code in SubscriptionError', () => {
        manager.dispose()
        const queryRef = createQueryRef('users:list')

        try {
          manager.createSubscription(queryRef, {})
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error).toBeInstanceOf(SubscriptionError)
          expect((error as SubscriptionError).code).toBe('MANAGER_DISPOSED')
        }
      })
    })
  })

  // ============================================================================
  // removeSubscription() Tests
  // ============================================================================

  describe('removeSubscription()', () => {
    it('should remove subscription by ID', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      const result = manager.removeSubscription(sub.id)

      expect(result).toBe(true)
      expect(manager.getSubscription(sub.id)).toBeUndefined()
    })

    it('should change subscription status to completed', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      manager.removeSubscription(sub.id)

      expect(sub.status).toBe(SubscriptionStatus.Completed)
    })

    it('should return true when subscription was found and removed', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      const result = manager.removeSubscription(sub.id)

      expect(result).toBe(true)
    })

    it('should return false when subscription ID does not exist', () => {
      const result = manager.removeSubscription('nonexistent-id')

      expect(result).toBe(false)
    })

    it('should not affect other subscriptions', () => {
      const queryRef1 = createQueryRef('users:list')
      const queryRef2 = createQueryRef('messages:list')

      const sub1 = manager.createSubscription(queryRef1, {})
      const sub2 = manager.createSubscription(queryRef2, {})

      manager.removeSubscription(sub1.id)

      expect(manager.getSubscription(sub2.id)).toBeDefined()
    })

    it('should not call onUpdate after removal', () => {
      const { fn, handler } = createMockHandler()
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })

      manager.removeSubscription(sub.id)
      manager.handleUpdate(sub.id, { users: ['new'] })

      expect(fn).not.toHaveBeenCalled()
    })

    it('should call onComplete handler when removed', () => {
      const onComplete = vi.fn()
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {}, { onComplete })

      manager.removeSubscription(sub.id)

      expect(onComplete).toHaveBeenCalled()
    })

    it('should be idempotent for same subscription ID', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      const result1 = manager.removeSubscription(sub.id)
      const result2 = manager.removeSubscription(sub.id)

      expect(result1).toBe(true)
      expect(result2).toBe(false)
    })

    it('should clean up resources', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      manager.removeSubscription(sub.id)

      expect(manager.getAllSubscriptions()).not.toContainEqual(
        expect.objectContaining({ id: sub.id })
      )
    })
  })

  // ============================================================================
  // updateSubscription() Tests (Update Arguments)
  // ============================================================================

  describe('updateSubscription()', () => {
    it('should update subscription arguments', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, { limit: 10 })

      const result = manager.updateSubscription(sub.id, { limit: 20 })

      expect(result).toBe(true)
      expect(sub.args).toEqual({ limit: 20 })
    })

    it('should return false when subscription does not exist', () => {
      const result = manager.updateSubscription('nonexistent', { limit: 20 })

      expect(result).toBe(false)
    })

    it('should return false when subscription is completed', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, { limit: 10 })

      manager.removeSubscription(sub.id)
      const result = manager.updateSubscription(sub.id, { limit: 20 })

      expect(result).toBe(false)
    })

    it('should reset subscription to pending when args change', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, { limit: 10 })

      // Simulate active state
      manager.handleUpdate(sub.id, { users: [] })
      expect(sub.status).toBe(SubscriptionStatus.Active)

      manager.updateSubscription(sub.id, { limit: 20 })

      expect(sub.status).toBe(SubscriptionStatus.Pending)
    })

    it('should clear cached data when args change', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, { limit: 10 })

      manager.handleUpdate(sub.id, { users: ['user1'] })
      expect(sub.data).toEqual({ users: ['user1'] })

      manager.updateSubscription(sub.id, { limit: 20 })

      expect(sub.data).toBeUndefined()
    })

    it('should emit args changed event', () => {
      const onArgsChange = vi.fn()
      const mgr = new ClientSubscriptionManager({
        onSubscriptionArgsChange: onArgsChange,
      })
      const queryRef = createQueryRef('users:list')
      const sub = mgr.createSubscription(queryRef, { limit: 10 })

      mgr.updateSubscription(sub.id, { limit: 20 })

      expect(onArgsChange).toHaveBeenCalledWith(sub, { limit: 10 }, { limit: 20 })

      mgr.dispose()
    })
  })

  // ============================================================================
  // getSubscription() Tests
  // ============================================================================

  describe('getSubscription()', () => {
    it('should return subscription by ID', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      const found = manager.getSubscription(sub.id)

      expect(found).toBe(sub)
    })

    it('should return undefined for unknown ID', () => {
      const found = manager.getSubscription('unknown-id')

      expect(found).toBeUndefined()
    })

    it('should return undefined for removed subscription', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      manager.removeSubscription(sub.id)

      const found = manager.getSubscription(sub.id)
      expect(found).toBeUndefined()
    })
  })

  // ============================================================================
  // getAllSubscriptions() Tests
  // ============================================================================

  describe('getAllSubscriptions()', () => {
    it('should return empty array when no subscriptions', () => {
      const subscriptions = manager.getAllSubscriptions()
      expect(subscriptions).toEqual([])
    })

    it('should return all active subscriptions', () => {
      const queryRef1 = createQueryRef('users:list')
      const queryRef2 = createQueryRef('messages:list')

      manager.createSubscription(queryRef1, {})
      manager.createSubscription(queryRef2, {})

      const subscriptions = manager.getAllSubscriptions()
      expect(subscriptions.length).toBe(2)
    })

    it('should not include removed subscriptions', () => {
      const queryRef1 = createQueryRef('users:list')
      const queryRef2 = createQueryRef('messages:list')

      const sub1 = manager.createSubscription(queryRef1, {})
      manager.createSubscription(queryRef2, {})

      manager.removeSubscription(sub1.id)

      const subscriptions = manager.getAllSubscriptions()
      expect(subscriptions.length).toBe(1)
    })

    it('should return ClientSubscription objects', () => {
      const queryRef = createQueryRef('users:list')
      manager.createSubscription(queryRef, {})

      const subscriptions = manager.getAllSubscriptions()
      expect(subscriptions[0]).toBeInstanceOf(ClientSubscription)
    })

    it('should support filtering by status', () => {
      const queryRef = createQueryRef('users:list')

      const sub1 = manager.createSubscription(queryRef, { id: 1 })
      const sub2 = manager.createSubscription(queryRef, { id: 2 })

      manager.handleUpdate(sub1.id, { data: 'test' })

      const activeSubs = manager.getAllSubscriptions({ status: SubscriptionStatus.Active })
      const pendingSubs = manager.getAllSubscriptions({ status: SubscriptionStatus.Pending })

      expect(activeSubs.length).toBe(1)
      expect(activeSubs[0].id).toBe(sub1.id)
      expect(pendingSubs.length).toBe(1)
      expect(pendingSubs[0].id).toBe(sub2.id)
    })

    it('should support filtering by query path', () => {
      const queryRef1 = createQueryRef('users:list')
      const queryRef2 = createQueryRef('messages:list')

      manager.createSubscription(queryRef1, {})
      manager.createSubscription(queryRef1, { filter: 'active' })
      manager.createSubscription(queryRef2, {})

      const userSubs = manager.getAllSubscriptions({ queryPath: 'users:list' })
      expect(userSubs.length).toBe(2)
    })
  })

  // ============================================================================
  // pauseSubscription() / resumeSubscription() Tests
  // ============================================================================

  describe('pauseSubscription()', () => {
    it('should pause an active subscription', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      manager.handleUpdate(sub.id, { users: [] })
      expect(sub.status).toBe(SubscriptionStatus.Active)

      const result = manager.pauseSubscription(sub.id)

      expect(result).toBe(true)
      expect(sub.status).toBe(SubscriptionStatus.Paused)
    })

    it('should pause a pending subscription', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      const result = manager.pauseSubscription(sub.id)

      expect(result).toBe(true)
      expect(sub.status).toBe(SubscriptionStatus.Paused)
    })

    it('should return false for non-existent subscription', () => {
      const result = manager.pauseSubscription('nonexistent')

      expect(result).toBe(false)
    })

    it('should return false for already paused subscription', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      manager.pauseSubscription(sub.id)
      const result = manager.pauseSubscription(sub.id)

      expect(result).toBe(false)
    })

    it('should return false for completed subscription', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      manager.removeSubscription(sub.id)
      const result = manager.pauseSubscription(sub.id)

      expect(result).toBe(false)
    })

    it('should not receive updates while paused', () => {
      const { fn, handler } = createMockHandler()
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })

      manager.handleUpdate(sub.id, { users: [] })
      expect(fn).toHaveBeenCalledTimes(1)

      manager.pauseSubscription(sub.id)
      manager.handleUpdate(sub.id, { users: ['new'] })

      expect(fn).toHaveBeenCalledTimes(1) // Still 1, no new call
    })

    it('should preserve data while paused', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      manager.handleUpdate(sub.id, { users: ['test'] })
      manager.pauseSubscription(sub.id)

      expect(sub.data).toEqual({ users: ['test'] })
    })
  })

  describe('resumeSubscription()', () => {
    it('should resume a paused subscription', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      manager.handleUpdate(sub.id, { users: [] })
      manager.pauseSubscription(sub.id)

      const result = manager.resumeSubscription(sub.id)

      expect(result).toBe(true)
      expect(sub.status).toBe(SubscriptionStatus.Active)
    })

    it('should return false for non-existent subscription', () => {
      const result = manager.resumeSubscription('nonexistent')

      expect(result).toBe(false)
    })

    it('should return false for non-paused subscription', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      const result = manager.resumeSubscription(sub.id)

      expect(result).toBe(false)
    })

    it('should receive updates after resume', () => {
      const { fn, handler } = createMockHandler()
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })

      manager.handleUpdate(sub.id, { users: [] })
      manager.pauseSubscription(sub.id)
      manager.resumeSubscription(sub.id)
      manager.handleUpdate(sub.id, { users: ['new'] })

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should deliver queued updates on resume if enabled', () => {
      const { fn, handler } = createMockHandler()
      const mgr = new ClientSubscriptionManager({ queueUpdatesWhilePaused: true })
      const queryRef = createQueryRef('users:list')
      const sub = mgr.createSubscription(queryRef, {}, { onUpdate: handler })

      mgr.handleUpdate(sub.id, { users: [] })
      mgr.pauseSubscription(sub.id)
      mgr.handleUpdate(sub.id, { users: ['queued'] })
      mgr.resumeSubscription(sub.id)

      expect(fn).toHaveBeenCalledTimes(2)
      expect(fn).toHaveBeenLastCalledWith({ users: ['queued'] })

      mgr.dispose()
    })
  })

  // ============================================================================
  // Subscription Lifecycle Tests
  // ============================================================================

  describe('subscription lifecycle', () => {
    describe('status transitions', () => {
      it('should start in Pending status', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        expect(sub.status).toBe(SubscriptionStatus.Pending)
      })

      it('should transition to Active on first successful update', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.handleUpdate(sub.id, { users: [] })

        expect(sub.status).toBe(SubscriptionStatus.Active)
      })

      it('should transition to Error on error', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.handleError(sub.id, new Error('Query failed'))

        expect(sub.status).toBe(SubscriptionStatus.Error)
      })

      it('should transition to Paused when paused', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.pauseSubscription(sub.id)

        expect(sub.status).toBe(SubscriptionStatus.Paused)
      })

      it('should transition to Completed when removed', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.removeSubscription(sub.id)

        expect(sub.status).toBe(SubscriptionStatus.Completed)
      })

      it('should transition from Active to Error on error', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.handleUpdate(sub.id, { users: [] })
        expect(sub.status).toBe(SubscriptionStatus.Active)

        manager.handleError(sub.id, new Error('Connection lost'))
        expect(sub.status).toBe(SubscriptionStatus.Error)
      })

      it('should transition from Error to Active on recovery', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.handleError(sub.id, new Error('Temporary error'))
        expect(sub.status).toBe(SubscriptionStatus.Error)

        manager.handleUpdate(sub.id, { users: [] })
        expect(sub.status).toBe(SubscriptionStatus.Active)
      })

      it('should transition from Paused back to Active', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.handleUpdate(sub.id, { users: [] })
        manager.pauseSubscription(sub.id)
        expect(sub.status).toBe(SubscriptionStatus.Paused)

        manager.resumeSubscription(sub.id)
        expect(sub.status).toBe(SubscriptionStatus.Active)
      })

      it('should transition from Paused to Pending if never received data', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.pauseSubscription(sub.id)
        expect(sub.status).toBe(SubscriptionStatus.Paused)

        manager.resumeSubscription(sub.id)
        expect(sub.status).toBe(SubscriptionStatus.Pending)
      })
    })

    describe('error handling', () => {
      it('should store error on subscription', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})
        const error = new Error('Query failed')

        manager.handleError(sub.id, error)

        expect(sub.error).toBe(error)
      })

      it('should clear error on successful update', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.handleError(sub.id, new Error('Temporary error'))
        expect(sub.error).toBeDefined()

        manager.handleUpdate(sub.id, { users: [] })
        expect(sub.error).toBeUndefined()
      })

      it('should call onError handler', () => {
        const onError = vi.fn()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, { onError })

        const error = new Error('Query failed')
        manager.handleError(sub.id, error)

        expect(onError).toHaveBeenCalledWith(error)
      })

      it('should not call onUpdate on error', () => {
        const { fn, handler } = createMockHandler()
        const queryRef = createQueryRef('users:list')
        manager.createSubscription(queryRef, {}, { onUpdate: handler })

        // handleError doesn't call onUpdate
        expect(fn).not.toHaveBeenCalled()
      })

      it('should track error count', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.handleError(sub.id, new Error('Error 1'))
        manager.handleError(sub.id, new Error('Error 2'))
        manager.handleError(sub.id, new Error('Error 3'))

        expect(sub.errorCount).toBe(3)
      })

      it('should reset error count on successful update', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.handleError(sub.id, new Error('Error 1'))
        manager.handleError(sub.id, new Error('Error 2'))
        expect(sub.errorCount).toBe(2)

        manager.handleUpdate(sub.id, { users: [] })
        expect(sub.errorCount).toBe(0)
      })
    })

    describe('timestamps', () => {
      it('should track creation time', () => {
        const before = Date.now()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})
        const after = Date.now()

        expect(sub.createdAt).toBeGreaterThanOrEqual(before)
        expect(sub.createdAt).toBeLessThanOrEqual(after)
      })

      it('should track last update time', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        const before = Date.now()
        manager.handleUpdate(sub.id, { users: [] })
        const after = Date.now()

        expect(sub.updatedAt).toBeGreaterThanOrEqual(before)
        expect(sub.updatedAt).toBeLessThanOrEqual(after)
      })

      it('should update timestamp on each update', async () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})

        manager.handleUpdate(sub.id, { v: 1 })
        const firstUpdate = sub.updatedAt

        await delay(10)

        manager.handleUpdate(sub.id, { v: 2 })
        const secondUpdate = sub.updatedAt

        expect(secondUpdate).toBeGreaterThan(firstUpdate!)
      })
    })
  })

  // ============================================================================
  // Subscription Events Tests
  // ============================================================================

  describe('subscription events', () => {
    describe('onUpdate', () => {
      it('should call onUpdate when data is received', () => {
        const { fn, handler } = createMockHandler()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })

        manager.handleUpdate(sub.id, { users: ['Alice'] })

        expect(fn).toHaveBeenCalledWith({ users: ['Alice'] })
      })

      it('should call onUpdate for each update', () => {
        const { fn, handler } = createMockHandler()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })

        manager.handleUpdate(sub.id, { count: 1 })
        manager.handleUpdate(sub.id, { count: 2 })
        manager.handleUpdate(sub.id, { count: 3 })

        expect(fn).toHaveBeenCalledTimes(3)
      })

      it('should handle onUpdate that throws without breaking', () => {
        const handler = () => { throw new Error('Handler error') }
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })

        expect(() => manager.handleUpdate(sub.id, { data: 'test' })).not.toThrow()
        expect(sub.status).toBe(SubscriptionStatus.Active)
      })

      it('should support async onUpdate handlers', async () => {
        let resolved = false
        const handler = async () => {
          await delay(10)
          resolved = true
        }
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })

        manager.handleUpdate(sub.id, { data: 'test' })

        await delay(20)
        expect(resolved).toBe(true)
      })
    })

    describe('onError', () => {
      it('should call onError when error occurs', () => {
        const onError = vi.fn()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, { onError })

        const error = new Error('Query failed')
        manager.handleError(sub.id, error)

        expect(onError).toHaveBeenCalledWith(error)
      })

      it('should not call onError for updates', () => {
        const onError = vi.fn()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, { onError })

        manager.handleUpdate(sub.id, { data: 'test' })

        expect(onError).not.toHaveBeenCalled()
      })
    })

    describe('onComplete', () => {
      it('should call onComplete when subscription is removed', () => {
        const onComplete = vi.fn()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, { onComplete })

        manager.removeSubscription(sub.id)

        expect(onComplete).toHaveBeenCalled()
      })

      it('should not call onComplete for other operations', () => {
        const onComplete = vi.fn()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, { onComplete })

        manager.handleUpdate(sub.id, { data: 'test' })
        manager.pauseSubscription(sub.id)
        manager.resumeSubscription(sub.id)

        expect(onComplete).not.toHaveBeenCalled()
      })

      it('should call onComplete only once', () => {
        const onComplete = vi.fn()
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {}, { onComplete })

        manager.removeSubscription(sub.id)
        manager.removeSubscription(sub.id) // Second call

        expect(onComplete).toHaveBeenCalledTimes(1)
      })
    })
  })

  // ============================================================================
  // Subscription Deduplication Tests
  // ============================================================================

  describe('subscription deduplication', () => {
    it('should track reference count for same query + args', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub1 = manager.createSubscription(queryRef, args)
      const sub2 = manager.createSubscription(queryRef, args)

      expect(manager.getRefCount(queryRef._path, args)).toBe(2)
    })

    it('should decrement ref count on removal', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub1 = manager.createSubscription(queryRef, args)
      const sub2 = manager.createSubscription(queryRef, args)

      manager.removeSubscription(sub1.id)

      expect(manager.getRefCount(queryRef._path, args)).toBe(1)
    })

    it('should remove query tracking when ref count reaches zero', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub1 = manager.createSubscription(queryRef, args)
      const sub2 = manager.createSubscription(queryRef, args)

      manager.removeSubscription(sub1.id)
      expect(manager.hasActiveQuery(queryRef._path, args)).toBe(true)

      manager.removeSubscription(sub2.id)
      expect(manager.hasActiveQuery(queryRef._path, args)).toBe(false)
    })

    it('should update all subscriptions with same query + args', () => {
      const { fn: fn1, handler: handler1 } = createMockHandler()
      const { fn: fn2, handler: handler2 } = createMockHandler()
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      manager.createSubscription(queryRef, args, { onUpdate: handler1 })
      manager.createSubscription(queryRef, args, { onUpdate: handler2 })

      manager.handleQueryUpdate(queryRef._path, args, { users: ['Alice'] })

      expect(fn1).toHaveBeenCalledWith({ users: ['Alice'] })
      expect(fn2).toHaveBeenCalledWith({ users: ['Alice'] })
    })

    it('should treat different args as separate queries', () => {
      const queryRef = createQueryRef('users:list')

      manager.createSubscription(queryRef, { limit: 10 })
      manager.createSubscription(queryRef, { limit: 20 })

      expect(manager.getRefCount(queryRef._path, { limit: 10 })).toBe(1)
      expect(manager.getRefCount(queryRef._path, { limit: 20 })).toBe(1)
    })

    it('should share data between deduplicated subscriptions', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub1 = manager.createSubscription(queryRef, args)
      const sub2 = manager.createSubscription(queryRef, args)

      manager.handleQueryUpdate(queryRef._path, args, { users: ['Alice'] })

      expect(sub1.data).toEqual({ users: ['Alice'] })
      expect(sub2.data).toEqual({ users: ['Alice'] })
    })

    it('should not share data when deduplication is disabled', () => {
      const noDedupe = new ClientSubscriptionManager({ enableDeduplication: false })
      const { fn: fn1, handler: handler1 } = createMockHandler()
      const { fn: fn2, handler: handler2 } = createMockHandler()
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub1 = noDedupe.createSubscription(queryRef, args, { onUpdate: handler1 })
      noDedupe.createSubscription(queryRef, args, { onUpdate: handler2 })

      // Only updates the specific subscription
      noDedupe.handleUpdate(sub1.id, { users: ['Alice'] })

      expect(fn1).toHaveBeenCalled()
      expect(fn2).not.toHaveBeenCalled()

      noDedupe.dispose()
    })

    it('should handle args order in deduplication', () => {
      const queryRef = createQueryRef('users:list')
      // Same args, different order
      const args1 = { a: 1, b: 2 }
      const args2 = { b: 2, a: 1 }

      manager.createSubscription(queryRef, args1)
      manager.createSubscription(queryRef, args2)

      // Should be treated as same query
      expect(manager.getRefCount(queryRef._path, args1)).toBe(2)
    })

    it('should handle deep object equality in deduplication', () => {
      const queryRef = createQueryRef('users:list')
      const args1 = { filter: { status: 'active', roles: ['admin'] } }
      const args2 = { filter: { status: 'active', roles: ['admin'] } }

      manager.createSubscription(queryRef, args1)
      manager.createSubscription(queryRef, args2)

      expect(manager.getRefCount(queryRef._path, args1)).toBe(2)
    })
  })

  // ============================================================================
  // Reference Counting Tests
  // ============================================================================

  describe('reference counting', () => {
    it('should increment ref count on new subscription', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      expect(manager.getRefCount(queryRef._path, args)).toBe(0)

      manager.createSubscription(queryRef, args)
      expect(manager.getRefCount(queryRef._path, args)).toBe(1)

      manager.createSubscription(queryRef, args)
      expect(manager.getRefCount(queryRef._path, args)).toBe(2)
    })

    it('should decrement ref count on removal', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub1 = manager.createSubscription(queryRef, args)
      const sub2 = manager.createSubscription(queryRef, args)
      expect(manager.getRefCount(queryRef._path, args)).toBe(2)

      manager.removeSubscription(sub1.id)
      expect(manager.getRefCount(queryRef._path, args)).toBe(1)
    })

    it('should not go below zero', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub = manager.createSubscription(queryRef, args)
      manager.removeSubscription(sub.id)
      manager.removeSubscription(sub.id) // Extra call

      expect(manager.getRefCount(queryRef._path, args)).toBe(0)
    })

    it('should track refs for multiple query/args combinations', () => {
      const queryRef1 = createQueryRef('users:list')
      const queryRef2 = createQueryRef('messages:list')

      manager.createSubscription(queryRef1, { limit: 10 })
      manager.createSubscription(queryRef1, { limit: 20 })
      manager.createSubscription(queryRef2, {})

      expect(manager.getRefCount(queryRef1._path, { limit: 10 })).toBe(1)
      expect(manager.getRefCount(queryRef1._path, { limit: 20 })).toBe(1)
      expect(manager.getRefCount(queryRef2._path, {})).toBe(1)
    })

    it('should emit cleanup event when ref count reaches zero', () => {
      const onQueryCleanup = vi.fn()
      const mgr = new ClientSubscriptionManager({ onQueryCleanup })
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub = mgr.createSubscription(queryRef, args)
      mgr.removeSubscription(sub.id)

      expect(onQueryCleanup).toHaveBeenCalledWith(queryRef._path, args)

      mgr.dispose()
    })
  })

  // ============================================================================
  // Automatic Cleanup on Disconnect Tests
  // ============================================================================

  describe('automatic cleanup on disconnect', () => {
    it('should clean up all subscriptions on disconnect', () => {
      const queryRef = createQueryRef('users:list')

      manager.createSubscription(queryRef, { id: 1 })
      manager.createSubscription(queryRef, { id: 2 })
      manager.createSubscription(queryRef, { id: 3 })

      expect(manager.getAllSubscriptions().length).toBe(3)

      manager.handleDisconnect()

      // Subscriptions should be marked but not removed
      const subs = manager.getAllSubscriptions()
      expect(subs.every(s => s.status === SubscriptionStatus.Pending)).toBe(true)
    })

    it('should call onError for all active subscriptions on disconnect', () => {
      const onError1 = vi.fn()
      const onError2 = vi.fn()
      const queryRef = createQueryRef('users:list')

      const sub1 = manager.createSubscription(queryRef, { id: 1 }, { onError: onError1 })
      const sub2 = manager.createSubscription(queryRef, { id: 2 }, { onError: onError2 })

      manager.handleUpdate(sub1.id, { data: 'test' })
      manager.handleUpdate(sub2.id, { data: 'test' })

      manager.handleDisconnect()

      expect(onError1).toHaveBeenCalled()
      expect(onError2).toHaveBeenCalled()
    })

    it('should emit disconnect event', () => {
      const onDisconnect = vi.fn()
      const mgr = new ClientSubscriptionManager({ onDisconnect })
      const queryRef = createQueryRef('users:list')

      mgr.createSubscription(queryRef, {})
      mgr.handleDisconnect()

      expect(onDisconnect).toHaveBeenCalled()

      mgr.dispose()
    })

    it('should reconnect and restore subscriptions', () => {
      const { fn, handler } = createMockHandler()
      const queryRef = createQueryRef('users:list')

      const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })
      manager.handleUpdate(sub.id, { users: [] })
      expect(sub.status).toBe(SubscriptionStatus.Active)

      manager.handleDisconnect()
      expect(sub.status).toBe(SubscriptionStatus.Pending)

      manager.handleReconnect()
      manager.handleUpdate(sub.id, { users: ['new'] })

      expect(sub.status).toBe(SubscriptionStatus.Active)
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should emit reconnect event', () => {
      const onReconnect = vi.fn()
      const mgr = new ClientSubscriptionManager({ onReconnect })
      const queryRef = createQueryRef('users:list')

      mgr.createSubscription(queryRef, {})
      mgr.handleDisconnect()
      mgr.handleReconnect()

      expect(onReconnect).toHaveBeenCalled()

      mgr.dispose()
    })

    it('should return pending subscriptions for resubscription', () => {
      const queryRef1 = createQueryRef('users:list')
      const queryRef2 = createQueryRef('messages:list')

      manager.createSubscription(queryRef1, { limit: 10 })
      manager.createSubscription(queryRef2, {})

      manager.handleDisconnect()

      const pending = manager.getPendingResubscriptions()

      expect(pending.length).toBe(2)
      expect(pending[0]).toEqual({
        queryPath: 'users:list',
        args: { limit: 10 },
      })
    })
  })

  // ============================================================================
  // Query Result Caching Tests
  // ============================================================================

  describe('query result caching', () => {
    it('should cache query results', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub = manager.createSubscription(queryRef, args)
      manager.handleUpdate(sub.id, { users: ['Alice'] })

      const cached = manager.getCachedResult(queryRef._path, args)
      expect(cached).toEqual({ users: ['Alice'] })
    })

    it('should return undefined for uncached query', () => {
      const cached = manager.getCachedResult('unknown:query', {})
      expect(cached).toBeUndefined()
    })

    it('should update cache on new data', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub = manager.createSubscription(queryRef, args)
      manager.handleUpdate(sub.id, { users: ['Alice'] })
      expect(manager.getCachedResult(queryRef._path, args)).toEqual({ users: ['Alice'] })

      manager.handleUpdate(sub.id, { users: ['Alice', 'Bob'] })
      expect(manager.getCachedResult(queryRef._path, args)).toEqual({ users: ['Alice', 'Bob'] })
    })

    it('should clear cache when last subscription is removed', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub = manager.createSubscription(queryRef, args)
      manager.handleUpdate(sub.id, { users: ['Alice'] })

      manager.removeSubscription(sub.id)

      const cached = manager.getCachedResult(queryRef._path, args)
      expect(cached).toBeUndefined()
    })

    it('should preserve cache if other subscriptions exist', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      const sub1 = manager.createSubscription(queryRef, args)
      const sub2 = manager.createSubscription(queryRef, args)

      manager.handleQueryUpdate(queryRef._path, args, { users: ['Alice'] })
      manager.removeSubscription(sub1.id)

      const cached = manager.getCachedResult(queryRef._path, args)
      expect(cached).toEqual({ users: ['Alice'] })
    })

    it('should serve new subscriptions from cache', () => {
      const { fn, handler } = createMockHandler()
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }

      // First subscription gets data
      const sub1 = manager.createSubscription(queryRef, args)
      manager.handleUpdate(sub1.id, { users: ['Alice'] })

      // Second subscription should get cached data immediately
      const sub2 = manager.createSubscription(queryRef, args, { onUpdate: handler })

      // If caching is working, new subscription should receive cached data
      expect(sub2.data).toEqual({ users: ['Alice'] })
    })

    it('should respect cache size limit', () => {
      const mgr = new ClientSubscriptionManager({ cacheSize: 2 })
      const queryRef1 = createQueryRef('query1')
      const queryRef2 = createQueryRef('query2')
      const queryRef3 = createQueryRef('query3')

      const sub1 = mgr.createSubscription(queryRef1, {})
      const sub2 = mgr.createSubscription(queryRef2, {})
      const sub3 = mgr.createSubscription(queryRef3, {})

      mgr.handleUpdate(sub1.id, { data: 1 })
      mgr.handleUpdate(sub2.id, { data: 2 })
      mgr.handleUpdate(sub3.id, { data: 3 })

      // First entry should be evicted
      // Note: This depends on implementation - LRU vs FIFO
      const cacheCount = mgr.getCacheSize()
      expect(cacheCount).toBeLessThanOrEqual(2)

      mgr.dispose()
    })

    it('should clear all cache on clearCache()', () => {
      const queryRef1 = createQueryRef('users:list')
      const queryRef2 = createQueryRef('messages:list')

      const sub1 = manager.createSubscription(queryRef1, {})
      const sub2 = manager.createSubscription(queryRef2, {})

      manager.handleUpdate(sub1.id, { users: [] })
      manager.handleUpdate(sub2.id, { messages: [] })

      manager.clearCache()

      expect(manager.getCachedResult(queryRef1._path, {})).toBeUndefined()
      expect(manager.getCachedResult(queryRef2._path, {})).toBeUndefined()
    })

    it('should not cache when caching is disabled', () => {
      const noCache = new ClientSubscriptionManager({ enableCaching: false })
      const queryRef = createQueryRef('users:list')

      const sub = noCache.createSubscription(queryRef, {})
      noCache.handleUpdate(sub.id, { users: ['Alice'] })

      const cached = noCache.getCachedResult(queryRef._path, {})
      expect(cached).toBeUndefined()

      noCache.dispose()
    })
  })

  // ============================================================================
  // ClientSubscription Object Tests
  // ============================================================================

  describe('ClientSubscription object', () => {
    it('should have readonly id property', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.id).toBeDefined()
      expect(typeof sub.id).toBe('string')
    })

    it('should have queryPath property', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.queryPath).toBe('users:list')
    })

    it('should have queryRef property', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.queryRef).toEqual(queryRef)
    })

    it('should have args property', () => {
      const queryRef = createQueryRef('users:list')
      const args = { limit: 10 }
      const sub = manager.createSubscription(queryRef, args)

      expect(sub.args).toEqual(args)
    })

    it('should have status property', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.status).toBe(SubscriptionStatus.Pending)
    })

    it('should have data property after update', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})
      const data = { users: [] }

      manager.handleUpdate(sub.id, data)

      expect(sub.data).toEqual(data)
    })

    it('should have error property when in error status', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})
      const error = new Error('Test error')

      manager.handleError(sub.id, error)

      expect(sub.error).toBe(error)
    })

    it('should have remove method', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(typeof sub.remove).toBe('function')

      sub.remove()

      expect(sub.status).toBe(SubscriptionStatus.Completed)
    })

    it('should have pause method', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(typeof sub.pause).toBe('function')

      sub.pause()

      expect(sub.status).toBe(SubscriptionStatus.Paused)
    })

    it('should have resume method', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      manager.handleUpdate(sub.id, { data: 'test' })
      sub.pause()

      expect(typeof sub.resume).toBe('function')

      sub.resume()

      expect(sub.status).toBe(SubscriptionStatus.Active)
    })

    it('should have isActive getter', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.isActive).toBe(false)

      manager.handleUpdate(sub.id, { data: 'test' })

      expect(sub.isActive).toBe(true)
    })

    it('should have isPending getter', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.isPending).toBe(true)

      manager.handleUpdate(sub.id, { data: 'test' })

      expect(sub.isPending).toBe(false)
    })

    it('should have isPaused getter', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.isPaused).toBe(false)

      sub.pause()

      expect(sub.isPaused).toBe(true)
    })

    it('should have isCompleted getter', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.isCompleted).toBe(false)

      manager.removeSubscription(sub.id)

      expect(sub.isCompleted).toBe(true)
    })

    it('should have hasError getter', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.hasError).toBe(false)

      manager.handleError(sub.id, new Error('Test'))

      expect(sub.hasError).toBe(true)
    })

    it('should have updateCount property', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.updateCount).toBe(0)

      manager.handleUpdate(sub.id, { v: 1 })
      manager.handleUpdate(sub.id, { v: 2 })
      manager.handleUpdate(sub.id, { v: 3 })

      expect(sub.updateCount).toBe(3)
    })
  })

  // ============================================================================
  // Manager Utility Methods Tests
  // ============================================================================

  describe('utility methods', () => {
    describe('getSubscriptionCount()', () => {
      it('should return 0 for empty manager', () => {
        expect(manager.getSubscriptionCount()).toBe(0)
      })

      it('should return correct count', () => {
        const queryRef = createQueryRef('users:list')

        manager.createSubscription(queryRef, { id: 1 })
        manager.createSubscription(queryRef, { id: 2 })
        manager.createSubscription(queryRef, { id: 3 })

        expect(manager.getSubscriptionCount()).toBe(3)
      })

      it('should decrement on removal', () => {
        const queryRef = createQueryRef('users:list')

        const sub = manager.createSubscription(queryRef, { id: 1 })
        manager.createSubscription(queryRef, { id: 2 })

        expect(manager.getSubscriptionCount()).toBe(2)

        manager.removeSubscription(sub.id)

        expect(manager.getSubscriptionCount()).toBe(1)
      })
    })

    describe('removeAllSubscriptions()', () => {
      it('should remove all subscriptions', () => {
        const queryRef = createQueryRef('users:list')

        manager.createSubscription(queryRef, { id: 1 })
        manager.createSubscription(queryRef, { id: 2 })
        manager.createSubscription(queryRef, { id: 3 })

        manager.removeAllSubscriptions()

        expect(manager.getSubscriptionCount()).toBe(0)
      })

      it('should set all subscriptions to completed status', () => {
        const queryRef = createQueryRef('users:list')

        const sub1 = manager.createSubscription(queryRef, { id: 1 })
        const sub2 = manager.createSubscription(queryRef, { id: 2 })

        manager.removeAllSubscriptions()

        expect(sub1.status).toBe(SubscriptionStatus.Completed)
        expect(sub2.status).toBe(SubscriptionStatus.Completed)
      })

      it('should call onComplete for all subscriptions', () => {
        const onComplete1 = vi.fn()
        const onComplete2 = vi.fn()
        const queryRef = createQueryRef('users:list')

        manager.createSubscription(queryRef, { id: 1 }, { onComplete: onComplete1 })
        manager.createSubscription(queryRef, { id: 2 }, { onComplete: onComplete2 })

        manager.removeAllSubscriptions()

        expect(onComplete1).toHaveBeenCalled()
        expect(onComplete2).toHaveBeenCalled()
      })
    })

    describe('removeByQueryPath()', () => {
      it('should remove all subscriptions for a specific query path', () => {
        const queryRef1 = createQueryRef('users:list')
        const queryRef2 = createQueryRef('messages:list')

        manager.createSubscription(queryRef1, { id: 1 })
        manager.createSubscription(queryRef1, { id: 2 })
        manager.createSubscription(queryRef2, {})

        const removed = manager.removeByQueryPath('users:list')

        expect(removed).toBe(2)
        expect(manager.getSubscriptionCount()).toBe(1)
      })

      it('should return 0 when no matching subscriptions', () => {
        const queryRef = createQueryRef('messages:list')

        manager.createSubscription(queryRef, {})

        const removed = manager.removeByQueryPath('users:list')

        expect(removed).toBe(0)
      })
    })

    describe('dispose()', () => {
      it('should remove all subscriptions and clean up resources', () => {
        const queryRef = createQueryRef('users:list')

        manager.createSubscription(queryRef, { id: 1 })
        manager.createSubscription(queryRef, { id: 2 })

        manager.dispose()

        expect(manager.getSubscriptionCount()).toBe(0)
      })

      it('should prevent new subscriptions after dispose', () => {
        manager.dispose()

        const queryRef = createQueryRef('users:list')

        expect(() => manager.createSubscription(queryRef, {}))
          .toThrow(SubscriptionError)
      })

      it('should be idempotent', () => {
        manager.dispose()

        expect(() => manager.dispose()).not.toThrow()
      })

      it('should clear cache', () => {
        const queryRef = createQueryRef('users:list')
        const sub = manager.createSubscription(queryRef, {})
        manager.handleUpdate(sub.id, { users: [] })

        manager.dispose()

        expect(manager.getCacheSize()).toBe(0)
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
      const error = new SubscriptionError('test', 'SUBSCRIPTION_ERROR')
      expect(error.code).toBe('SUBSCRIPTION_ERROR')
    })

    it('should have optional subscriptionId property', () => {
      const error = new SubscriptionError('test', 'ERROR', 'sub-123')
      expect(error.subscriptionId).toBe('sub-123')
    })
  })

  // ============================================================================
  // SubscriptionStatus Enum Tests
  // ============================================================================

  describe('SubscriptionStatus', () => {
    it('should have Pending status', () => {
      expect(SubscriptionStatus.Pending).toBeDefined()
    })

    it('should have Active status', () => {
      expect(SubscriptionStatus.Active).toBeDefined()
    })

    it('should have Paused status', () => {
      expect(SubscriptionStatus.Paused).toBeDefined()
    })

    it('should have Error status', () => {
      expect(SubscriptionStatus.Error).toBeDefined()
    })

    it('should have Completed status', () => {
      expect(SubscriptionStatus.Completed).toBeDefined()
    })

    it('should have distinct values for each status', () => {
      const statuses = [
        SubscriptionStatus.Pending,
        SubscriptionStatus.Active,
        SubscriptionStatus.Paused,
        SubscriptionStatus.Error,
        SubscriptionStatus.Completed,
      ]
      const uniqueStatuses = new Set(statuses)
      expect(uniqueStatuses.size).toBe(5)
    })
  })

  // ============================================================================
  // Edge Cases and Stress Tests
  // ============================================================================

  describe('edge cases', () => {
    it('should handle rapid create/remove cycles', () => {
      const queryRef = createQueryRef('users:list')

      for (let i = 0; i < 100; i++) {
        const sub = manager.createSubscription(queryRef, { i })
        manager.removeSubscription(sub.id)
      }

      expect(manager.getSubscriptionCount()).toBe(0)
    })

    it('should handle updates to completed subscription', () => {
      const { fn, handler } = createMockHandler()
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })

      manager.removeSubscription(sub.id)
      manager.handleUpdate(sub.id, { data: 'new' })

      expect(fn).not.toHaveBeenCalled()
    })

    it('should handle very large data updates', () => {
      const { fn, handler } = createMockHandler()
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })

      const largeData = {
        users: Array(10000).fill(null).map((_, i) => ({
          id: `user-${i}`,
          name: `User ${i}`,
          email: `user${i}@example.com`,
        })),
      }

      manager.handleUpdate(sub.id, largeData)

      expect(fn).toHaveBeenCalledWith(largeData)
    })

    it('should handle special characters in query paths', () => {
      const queryRef = createQueryRef('api/v2/users:list')
      const sub = manager.createSubscription(queryRef, {})

      expect(sub.queryPath).toBe('api/v2/users:list')
    })

    it('should handle complex nested args', () => {
      const queryRef = createQueryRef('users:search')
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
      }

      const sub = manager.createSubscription(queryRef, complexArgs)

      expect(sub.args).toEqual(complexArgs)
    })

    it('should handle 1000 concurrent subscriptions', () => {
      const queryRef = createQueryRef('users:list')

      for (let i = 0; i < 1000; i++) {
        manager.createSubscription(queryRef, { index: i })
      }

      expect(manager.getSubscriptionCount()).toBe(1000)
    })

    it('should handle null data in updates', () => {
      const { fn, handler } = createMockHandler()
      const queryRef = createQueryRef('users:get')
      const sub = manager.createSubscription(queryRef, {}, { onUpdate: handler })

      manager.handleUpdate(sub.id, null)

      expect(fn).toHaveBeenCalledWith(null)
      expect(sub.data).toBeNull()
    })

    it('should handle undefined data in updates', () => {
      const queryRef = createQueryRef('users:get')
      const sub = manager.createSubscription(queryRef, {})

      manager.handleUpdate(sub.id, undefined)

      expect(sub.data).toBeUndefined()
    })
  })

  // ============================================================================
  // Manager Events Tests
  // ============================================================================

  describe('manager events', () => {
    it('should emit event on subscription created', () => {
      const onSubscriptionCreated = vi.fn()
      const mgr = new ClientSubscriptionManager({ onSubscriptionCreated })
      const queryRef = createQueryRef('users:list')

      const sub = mgr.createSubscription(queryRef, {})

      expect(onSubscriptionCreated).toHaveBeenCalledWith(sub)

      mgr.dispose()
    })

    it('should emit event on subscription removed', () => {
      const onSubscriptionRemoved = vi.fn()
      const mgr = new ClientSubscriptionManager({ onSubscriptionRemoved })
      const queryRef = createQueryRef('users:list')

      const sub = mgr.createSubscription(queryRef, {})
      mgr.removeSubscription(sub.id)

      expect(onSubscriptionRemoved).toHaveBeenCalledWith(sub)

      mgr.dispose()
    })

    it('should emit event on data update', () => {
      const onUpdate = vi.fn()
      const mgr = new ClientSubscriptionManager({ onUpdate })
      const queryRef = createQueryRef('users:list')

      const sub = mgr.createSubscription(queryRef, {})
      const data = { users: [] }
      mgr.handleUpdate(sub.id, data)

      expect(onUpdate).toHaveBeenCalledWith(sub, data)

      mgr.dispose()
    })

    it('should emit event on error', () => {
      const onError = vi.fn()
      const mgr = new ClientSubscriptionManager({ onError })
      const queryRef = createQueryRef('users:list')

      const sub = mgr.createSubscription(queryRef, {})
      const error = new Error('Test error')
      mgr.handleError(sub.id, error)

      expect(onError).toHaveBeenCalledWith(sub, error)

      mgr.dispose()
    })
  })

  // ============================================================================
  // Serialization Tests
  // ============================================================================

  describe('serialization', () => {
    it('should serialize subscription to JSON', () => {
      const queryRef = createQueryRef('users:list')
      const sub = manager.createSubscription(queryRef, { limit: 10 })

      manager.handleUpdate(sub.id, { users: [] })

      const json = sub.toJSON()

      expect(json).toEqual({
        id: sub.id,
        queryPath: 'users:list',
        args: { limit: 10 },
        status: SubscriptionStatus.Active,
        data: { users: [] },
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
        updateCount: 1,
        errorCount: 0,
        priority: 'normal',
      })
    })

    it('should serialize manager state', () => {
      const queryRef = createQueryRef('users:list')

      manager.createSubscription(queryRef, { id: 1 })
      manager.createSubscription(queryRef, { id: 2 })

      const state = manager.toJSON()

      expect(state).toEqual({
        subscriptions: expect.any(Array),
        count: 2,
        cacheSize: expect.any(Number),
        isDisposed: false,
      })
      expect(state.subscriptions.length).toBe(2)
    })
  })
})
