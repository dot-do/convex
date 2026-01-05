/**
 * TDD RED Phase Tests for Optimistic Updates
 *
 * These tests define the expected behavior for the OptimisticUpdateManager.
 * They are designed to FAIL until the implementation is complete.
 *
 * Optimistic updates allow the UI to show expected results immediately
 * while the server processes mutations, improving perceived performance.
 *
 * Key features:
 * - Apply optimistic updates with expected results
 * - Confirm updates when server responds successfully
 * - Revert updates on error
 * - Handle multiple pending updates
 * - Maintain update ordering
 * - Cascade rollbacks for dependent updates
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  OptimisticUpdateManager,
  OptimisticUpdate,
  OptimisticUpdateStatus,
  OptimisticUpdateFunction,
  createOptimisticUpdateManager,
} from '../../src/sync/optimistic'

// ============================================================================
// OptimisticUpdateManager Class Tests
// ============================================================================

describe('OptimisticUpdateManager', () => {
  let manager: OptimisticUpdateManager

  beforeEach(() => {
    manager = new OptimisticUpdateManager()
  })

  describe('class instantiation', () => {
    it('should create an instance of OptimisticUpdateManager', () => {
      expect(manager).toBeInstanceOf(OptimisticUpdateManager)
    })

    it('should initialize with no pending updates', () => {
      const pending = manager.getPendingUpdates()
      expect(pending).toEqual([])
    })

    it('should be creatable via factory function', () => {
      const factoryManager = createOptimisticUpdateManager()
      expect(factoryManager).toBeInstanceOf(OptimisticUpdateManager)
    })

    it('should accept optional configuration', () => {
      const configuredManager = new OptimisticUpdateManager({
        maxPendingUpdates: 100,
        enableLogging: false,
      })
      expect(configuredManager).toBeInstanceOf(OptimisticUpdateManager)
    })
  })

  // ==========================================================================
  // applyOptimisticUpdate() Tests
  // ==========================================================================

  describe('applyOptimisticUpdate()', () => {
    describe('basic functionality', () => {
      it('should apply an optimistic update and return an update ID', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1', name: 'New Name' },
          (currentData) => ({ ...currentData, name: 'New Name' })
        )

        expect(updateId).toBeDefined()
        expect(typeof updateId).toBe('string')
        expect(updateId.length).toBeGreaterThan(0)
      })

      it('should generate unique IDs for multiple updates', () => {
        const id1 = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1', name: 'Name 1' },
          (data) => ({ ...data, name: 'Name 1' })
        )
        const id2 = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user2', name: 'Name 2' },
          (data) => ({ ...data, name: 'Name 2' })
        )
        const id3 = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user3', name: 'Name 3' },
          (data) => ({ ...data, name: 'Name 3' })
        )

        expect(id1).not.toBe(id2)
        expect(id2).not.toBe(id3)
        expect(id1).not.toBe(id3)
      })

      it('should add the update to pending updates', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1', name: 'New Name' },
          (data) => ({ ...data, name: 'New Name' })
        )

        const pending = manager.getPendingUpdates()
        expect(pending.length).toBe(1)
        expect(pending[0]?.id).toBe(updateId)
      })

      it('should store mutation name in the update', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1', name: 'New Name' },
          (data) => ({ ...data, name: 'New Name' })
        )

        const pending = manager.getPendingUpdates()
        expect(pending[0]?.mutation).toBe('users:update')
      })

      it('should store args in the update', () => {
        const args = { id: 'user1', name: 'New Name' }
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          args,
          (data) => ({ ...data, name: 'New Name' })
        )

        const pending = manager.getPendingUpdates()
        expect(pending[0]?.args).toEqual(args)
      })

      it('should store the update function', () => {
        const updateFn: OptimisticUpdateFunction<{ name: string }> = (data) => ({
          ...data,
          name: 'Updated',
        })
        manager.applyOptimisticUpdate('users:update', { id: 'user1' }, updateFn)

        const pending = manager.getPendingUpdates()
        expect(pending[0]?.updateFn).toBe(updateFn)
      })

      it('should set initial status to pending', () => {
        manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1' },
          (data) => data
        )

        const pending = manager.getPendingUpdates()
        expect(pending[0]?.status).toBe('pending')
      })

      it('should record timestamp when update is applied', () => {
        const beforeTime = Date.now()
        manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1' },
          (data) => data
        )
        const afterTime = Date.now()

        const pending = manager.getPendingUpdates()
        expect(pending[0]?.appliedAt).toBeGreaterThanOrEqual(beforeTime)
        expect(pending[0]?.appliedAt).toBeLessThanOrEqual(afterTime)
      })
    })

    describe('update function variations', () => {
      it('should accept update function that returns new object', () => {
        const serverData = { users: { user1: { name: 'Old' } } }

        manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1', name: 'New' },
          (data: typeof serverData) => ({
            ...data,
            users: { ...data.users, user1: { name: 'New' } },
          })
        )

        const localData = manager.getOptimisticData(serverData)
        expect(localData.users.user1.name).toBe('New')
      })

      it('should accept update function that adds new data', () => {
        const serverData = { items: [] as { id: string }[] }

        manager.applyOptimisticUpdate(
          'items:create',
          { id: 'item1' },
          (data: typeof serverData) => ({
            ...data,
            items: [...data.items, { id: 'item1' }],
          })
        )

        const localData = manager.getOptimisticData(serverData)
        expect(localData.items.length).toBe(1)
        expect(localData.items[0]?.id).toBe('item1')
      })

      it('should accept update function that removes data', () => {
        const serverData = { items: [{ id: 'item1' }, { id: 'item2' }] }

        manager.applyOptimisticUpdate(
          'items:delete',
          { id: 'item1' },
          (data: typeof serverData) => ({
            ...data,
            items: data.items.filter((item) => item.id !== 'item1'),
          })
        )

        const localData = manager.getOptimisticData(serverData)
        expect(localData.items.length).toBe(1)
        expect(localData.items[0]?.id).toBe('item2')
      })

      it('should accept update function with complex transformations', () => {
        const serverData = {
          users: { user1: { name: 'Alice', points: 100 } },
          leaderboard: ['user2', 'user1'],
        }

        manager.applyOptimisticUpdate(
          'users:addPoints',
          { id: 'user1', points: 50 },
          (data: typeof serverData) => ({
            ...data,
            users: {
              ...data.users,
              user1: {
                ...data.users.user1,
                points: data.users.user1.points + 50,
              },
            },
            leaderboard: ['user1', 'user2'],
          })
        )

        const localData = manager.getOptimisticData(serverData)
        expect(localData.users.user1.points).toBe(150)
        expect(localData.leaderboard[0]).toBe('user1')
      })
    })

    describe('edge cases', () => {
      it('should handle empty args', () => {
        const updateId = manager.applyOptimisticUpdate(
          'system:refresh',
          {},
          (data) => data
        )

        expect(updateId).toBeDefined()
        const pending = manager.getPendingUpdates()
        expect(pending[0]?.args).toEqual({})
      })

      it('should handle null in args', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:clear',
          { value: null },
          (data) => data
        )

        expect(updateId).toBeDefined()
        const pending = manager.getPendingUpdates()
        expect(pending[0]?.args).toEqual({ value: null })
      })

      it('should handle complex nested args', () => {
        const complexArgs = {
          user: {
            profile: {
              settings: {
                notifications: {
                  email: true,
                  push: false,
                },
              },
            },
          },
        }

        const updateId = manager.applyOptimisticUpdate(
          'users:updateSettings',
          complexArgs,
          (data) => data
        )

        expect(updateId).toBeDefined()
        const pending = manager.getPendingUpdates()
        expect(pending[0]?.args).toEqual(complexArgs)
      })

      it('should handle array args', () => {
        const arrayArgs = { ids: ['id1', 'id2', 'id3'] }

        const updateId = manager.applyOptimisticUpdate(
          'items:batchDelete',
          arrayArgs,
          (data) => data
        )

        expect(updateId).toBeDefined()
        const pending = manager.getPendingUpdates()
        expect(pending[0]?.args).toEqual(arrayArgs)
      })
    })
  })

  // ==========================================================================
  // confirmUpdate() Tests
  // ==========================================================================

  describe('confirmUpdate()', () => {
    describe('basic functionality', () => {
      it('should confirm a pending update', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1' },
          (data) => data
        )

        manager.confirmUpdate(updateId)

        const pending = manager.getPendingUpdates()
        expect(pending.length).toBe(0)
      })

      it('should remove confirmed update from pending list', () => {
        const id1 = manager.applyOptimisticUpdate('m1', {}, (d) => d)
        const id2 = manager.applyOptimisticUpdate('m2', {}, (d) => d)
        const id3 = manager.applyOptimisticUpdate('m3', {}, (d) => d)

        manager.confirmUpdate(id2)

        const pending = manager.getPendingUpdates()
        expect(pending.length).toBe(2)
        expect(pending.map((p) => p.id)).not.toContain(id2)
        expect(pending.map((p) => p.id)).toContain(id1)
        expect(pending.map((p) => p.id)).toContain(id3)
      })

      it('should return true when confirming existing update', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1' },
          (data) => data
        )

        const result = manager.confirmUpdate(updateId)
        expect(result).toBe(true)
      })

      it('should return false when confirming non-existent update', () => {
        const result = manager.confirmUpdate('non-existent-id')
        expect(result).toBe(false)
      })

      it('should not throw when confirming already confirmed update', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1' },
          (data) => data
        )

        manager.confirmUpdate(updateId)

        expect(() => manager.confirmUpdate(updateId)).not.toThrow()
      })

      it('should handle confirming same update multiple times gracefully', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1' },
          (data) => data
        )

        const result1 = manager.confirmUpdate(updateId)
        const result2 = manager.confirmUpdate(updateId)

        expect(result1).toBe(true)
        expect(result2).toBe(false)
      })
    })

    describe('with server response', () => {
      it('should accept optional server response data', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:create',
          { name: 'Alice' },
          (data: { users: unknown[] }) => ({
            ...data,
            users: [...data.users, { id: 'temp', name: 'Alice' }],
          })
        )

        const serverResponse = { id: 'user123', name: 'Alice', createdAt: Date.now() }

        expect(() => manager.confirmUpdate(updateId, serverResponse)).not.toThrow()
      })

      it('should emit confirmation event with server response', () => {
        const callback = vi.fn()
        manager.onUpdateConfirmed(callback)

        const updateId = manager.applyOptimisticUpdate(
          'users:create',
          { name: 'Alice' },
          (data) => data
        )

        const serverResponse = { id: 'user123', name: 'Alice' }
        manager.confirmUpdate(updateId, serverResponse)

        expect(callback).toHaveBeenCalledWith({
          updateId,
          mutation: 'users:create',
          args: { name: 'Alice' },
          serverResponse,
        })
      })
    })
  })

  // ==========================================================================
  // revertUpdate() Tests
  // ==========================================================================

  describe('revertUpdate()', () => {
    describe('basic functionality', () => {
      it('should revert a pending update', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1' },
          (data) => data
        )

        manager.revertUpdate(updateId)

        const pending = manager.getPendingUpdates()
        expect(pending.length).toBe(0)
      })

      it('should remove reverted update from pending list', () => {
        const id1 = manager.applyOptimisticUpdate('m1', {}, (d) => d)
        const id2 = manager.applyOptimisticUpdate('m2', {}, (d) => d)
        const id3 = manager.applyOptimisticUpdate('m3', {}, (d) => d)

        manager.revertUpdate(id2)

        const pending = manager.getPendingUpdates()
        expect(pending.length).toBe(2)
        expect(pending.map((p) => p.id)).not.toContain(id2)
      })

      it('should return true when reverting existing update', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1' },
          (data) => data
        )

        const result = manager.revertUpdate(updateId)
        expect(result).toBe(true)
      })

      it('should return false when reverting non-existent update', () => {
        const result = manager.revertUpdate('non-existent-id')
        expect(result).toBe(false)
      })

      it('should not throw when reverting already reverted update', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1' },
          (data) => data
        )

        manager.revertUpdate(updateId)

        expect(() => manager.revertUpdate(updateId)).not.toThrow()
      })

      it('should undo the optimistic data change', () => {
        const serverData = { counter: 0 }

        manager.applyOptimisticUpdate(
          'counter:increment',
          {},
          (data: typeof serverData) => ({ counter: data.counter + 1 })
        )

        // Before revert - optimistic data should show the change
        expect(manager.getOptimisticData(serverData).counter).toBe(1)

        // Revert all updates
        manager.revertAll()

        // After revert - should return to server data
        expect(manager.getOptimisticData(serverData).counter).toBe(0)
      })
    })

    describe('with error information', () => {
      it('should accept optional error when reverting', () => {
        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1' },
          (data) => data
        )

        const error = new Error('Server error')

        expect(() => manager.revertUpdate(updateId, error)).not.toThrow()
      })

      it('should emit revert event with error', () => {
        const callback = vi.fn()
        manager.onUpdateReverted(callback)

        const updateId = manager.applyOptimisticUpdate(
          'users:update',
          { id: 'user1', name: 'New Name' },
          (data) => data
        )

        const error = new Error('Server error')
        manager.revertUpdate(updateId, error)

        expect(callback).toHaveBeenCalledWith({
          updateId,
          mutation: 'users:update',
          args: { id: 'user1', name: 'New Name' },
          error,
        })
      })
    })
  })

  // ==========================================================================
  // getPendingUpdates() Tests
  // ==========================================================================

  describe('getPendingUpdates()', () => {
    it('should return empty array when no pending updates', () => {
      const pending = manager.getPendingUpdates()
      expect(pending).toEqual([])
      expect(Array.isArray(pending)).toBe(true)
    })

    it('should return all pending updates', () => {
      manager.applyOptimisticUpdate('m1', { a: 1 }, (d) => d)
      manager.applyOptimisticUpdate('m2', { b: 2 }, (d) => d)
      manager.applyOptimisticUpdate('m3', { c: 3 }, (d) => d)

      const pending = manager.getPendingUpdates()
      expect(pending.length).toBe(3)
    })

    it('should return updates in order they were applied', () => {
      manager.applyOptimisticUpdate('m1', {}, (d) => d)
      manager.applyOptimisticUpdate('m2', {}, (d) => d)
      manager.applyOptimisticUpdate('m3', {}, (d) => d)

      const pending = manager.getPendingUpdates()
      expect(pending[0]?.mutation).toBe('m1')
      expect(pending[1]?.mutation).toBe('m2')
      expect(pending[2]?.mutation).toBe('m3')
    })

    it('should return OptimisticUpdate objects with correct shape', () => {
      manager.applyOptimisticUpdate(
        'users:update',
        { id: 'user1', name: 'Test' },
        (data) => data
      )

      const pending = manager.getPendingUpdates()
      const update = pending[0]

      expect(update).toHaveProperty('id')
      expect(update).toHaveProperty('mutation')
      expect(update).toHaveProperty('args')
      expect(update).toHaveProperty('updateFn')
      expect(update).toHaveProperty('status')
      expect(update).toHaveProperty('appliedAt')
    })

    it('should return a copy, not the internal array', () => {
      manager.applyOptimisticUpdate('m1', {}, (d) => d)

      const pending1 = manager.getPendingUpdates()
      const pending2 = manager.getPendingUpdates()

      expect(pending1).not.toBe(pending2)
      expect(pending1).toEqual(pending2)
    })

    it('should filter by mutation name when provided', () => {
      manager.applyOptimisticUpdate('users:create', {}, (d) => d)
      manager.applyOptimisticUpdate('items:create', {}, (d) => d)
      manager.applyOptimisticUpdate('users:update', {}, (d) => d)

      const userUpdates = manager.getPendingUpdates({ mutation: 'users:create' })
      expect(userUpdates.length).toBe(1)
      expect(userUpdates[0]?.mutation).toBe('users:create')
    })

    it('should filter by status when provided', () => {
      const id1 = manager.applyOptimisticUpdate('m1', {}, (d) => d)
      manager.applyOptimisticUpdate('m2', {}, (d) => d)

      // Mark first as in-flight (internal method, simulated here)
      manager.markInFlight(id1)

      const pendingOnly = manager.getPendingUpdates({ status: 'pending' })
      expect(pendingOnly.length).toBe(1)
      expect(pendingOnly[0]?.mutation).toBe('m2')

      const inFlightOnly = manager.getPendingUpdates({ status: 'in-flight' })
      expect(inFlightOnly.length).toBe(1)
      expect(inFlightOnly[0]?.mutation).toBe('m1')
    })
  })

  // ==========================================================================
  // getOptimisticData() Tests
  // ==========================================================================

  describe('getOptimisticData()', () => {
    it('should return server data unchanged when no pending updates', () => {
      const serverData = { users: { user1: { name: 'Alice' } } }

      const result = manager.getOptimisticData(serverData)

      expect(result).toEqual(serverData)
    })

    it('should apply single optimistic update to server data', () => {
      const serverData = { users: { user1: { name: 'Alice' } } }

      manager.applyOptimisticUpdate(
        'users:update',
        { id: 'user1', name: 'Bob' },
        (data: typeof serverData) => ({
          ...data,
          users: { ...data.users, user1: { name: 'Bob' } },
        })
      )

      const result = manager.getOptimisticData(serverData)
      expect(result.users.user1.name).toBe('Bob')
    })

    it('should apply multiple optimistic updates in order', () => {
      const serverData = { counter: 0 }

      manager.applyOptimisticUpdate(
        'counter:increment',
        {},
        (data: typeof serverData) => ({ counter: data.counter + 1 })
      )
      manager.applyOptimisticUpdate(
        'counter:increment',
        {},
        (data: typeof serverData) => ({ counter: data.counter + 1 })
      )
      manager.applyOptimisticUpdate(
        'counter:increment',
        {},
        (data: typeof serverData) => ({ counter: data.counter + 1 })
      )

      const result = manager.getOptimisticData(serverData)
      expect(result.counter).toBe(3)
    })

    it('should not mutate original server data', () => {
      const serverData = { users: { user1: { name: 'Alice' } } }
      const originalName = serverData.users.user1.name

      manager.applyOptimisticUpdate(
        'users:update',
        { id: 'user1', name: 'Bob' },
        (data: typeof serverData) => ({
          ...data,
          users: { ...data.users, user1: { name: 'Bob' } },
        })
      )

      manager.getOptimisticData(serverData)

      expect(serverData.users.user1.name).toBe(originalName)
    })

    it('should return new data after updates are confirmed', () => {
      const serverData = { counter: 0 }

      const id1 = manager.applyOptimisticUpdate(
        'counter:increment',
        {},
        (data: typeof serverData) => ({ counter: data.counter + 1 })
      )
      manager.applyOptimisticUpdate(
        'counter:increment',
        {},
        (data: typeof serverData) => ({ counter: data.counter + 1 })
      )

      // Confirm first update
      manager.confirmUpdate(id1)

      // Now server data has been updated
      const newServerData = { counter: 1 }
      const result = manager.getOptimisticData(newServerData)

      // Should only apply remaining optimistic update
      expect(result.counter).toBe(2)
    })

    it('should handle complex nested data structures', () => {
      const serverData = {
        app: {
          users: {
            user1: { name: 'Alice', posts: [{ id: 'p1', title: 'Hello' }] },
          },
          settings: { theme: 'light' },
        },
      }

      manager.applyOptimisticUpdate(
        'posts:create',
        { userId: 'user1', title: 'New Post' },
        (data: typeof serverData) => ({
          ...data,
          app: {
            ...data.app,
            users: {
              ...data.app.users,
              user1: {
                ...data.app.users.user1,
                posts: [
                  ...data.app.users.user1.posts,
                  { id: 'temp-p2', title: 'New Post' },
                ],
              },
            },
          },
        })
      )

      const result = manager.getOptimisticData(serverData)

      expect(result.app.users.user1.posts.length).toBe(2)
      expect(result.app.users.user1.posts[1]?.title).toBe('New Post')
      expect(result.app.settings.theme).toBe('light')
    })

    it('should handle array data', () => {
      const serverData = { items: [{ id: 1 }, { id: 2 }] }

      manager.applyOptimisticUpdate(
        'items:add',
        { id: 3 },
        (data: typeof serverData) => ({
          items: [...data.items, { id: 3 }],
        })
      )

      const result = manager.getOptimisticData(serverData)
      expect(result.items.length).toBe(3)
      expect(result.items[2]?.id).toBe(3)
    })
  })

  // ==========================================================================
  // Automatic Revert on Error Tests
  // ==========================================================================

  describe('automatic revert on error', () => {
    it('should automatically revert when update function throws', () => {
      const serverData = { value: 'original' }

      manager.applyOptimisticUpdate(
        'broken:mutation',
        {},
        () => {
          throw new Error('Update function error')
        }
      )

      // Should fall back to server data when update function throws
      const result = manager.getOptimisticData(serverData)
      expect(result.value).toBe('original')
    })

    it('should continue with other updates if one fails', () => {
      const serverData = { counter: 0 }

      manager.applyOptimisticUpdate(
        'counter:increment',
        {},
        (data: typeof serverData) => ({ counter: data.counter + 1 })
      )

      manager.applyOptimisticUpdate(
        'broken:mutation',
        {},
        () => {
          throw new Error('This will fail')
        }
      )

      manager.applyOptimisticUpdate(
        'counter:increment',
        {},
        (data: typeof serverData) => ({ counter: data.counter + 1 })
      )

      // Should apply first and third updates, skipping the broken one
      const result = manager.getOptimisticData(serverData)
      expect(result.counter).toBe(2)
    })

    it('should emit error event when update function throws', () => {
      const callback = vi.fn()
      manager.onUpdateError(callback)

      const updateId = manager.applyOptimisticUpdate(
        'broken:mutation',
        { foo: 'bar' },
        () => {
          throw new Error('Update function error')
        }
      )

      // Trigger the error by calling getOptimisticData
      manager.getOptimisticData({})

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          updateId,
          mutation: 'broken:mutation',
          args: { foo: 'bar' },
          error: expect.any(Error),
        })
      )
    })

    it('should support revertOnError configuration per update', () => {
      const serverData = { value: 'original' }

      manager.applyOptimisticUpdate(
        'risky:mutation',
        {},
        () => {
          throw new Error('Error')
        },
        { revertOnError: false }
      )

      // With revertOnError: false, the error should propagate
      expect(() => manager.getOptimisticData(serverData, { throwOnError: true })).toThrow()
    })
  })

  // ==========================================================================
  // Multiple Pending Updates Tests
  // ==========================================================================

  describe('multiple pending updates', () => {
    it('should handle many pending updates', () => {
      for (let i = 0; i < 100; i++) {
        manager.applyOptimisticUpdate(
          `mutation:${i}`,
          { index: i },
          (d) => d
        )
      }

      const pending = manager.getPendingUpdates()
      expect(pending.length).toBe(100)
    })

    it('should maintain correct order with interleaved operations', () => {
      const id1 = manager.applyOptimisticUpdate('m1', {}, (d) => d)
      const id2 = manager.applyOptimisticUpdate('m2', {}, (d) => d)
      const id3 = manager.applyOptimisticUpdate('m3', {}, (d) => d)

      manager.confirmUpdate(id2)

      const id4 = manager.applyOptimisticUpdate('m4', {}, (d) => d)

      const pending = manager.getPendingUpdates()
      expect(pending.length).toBe(3)
      expect(pending[0]?.mutation).toBe('m1')
      expect(pending[1]?.mutation).toBe('m3')
      expect(pending[2]?.mutation).toBe('m4')
    })

    it('should correctly apply updates from different mutations', () => {
      const serverData = {
        users: { user1: { name: 'Alice', email: 'alice@example.com' } },
        posts: [] as { id: string; title: string }[],
      }

      // Update user
      manager.applyOptimisticUpdate(
        'users:update',
        { id: 'user1', name: 'Alice Updated' },
        (data: typeof serverData) => ({
          ...data,
          users: { ...data.users, user1: { ...data.users.user1, name: 'Alice Updated' } },
        })
      )

      // Create post
      manager.applyOptimisticUpdate(
        'posts:create',
        { title: 'New Post' },
        (data: typeof serverData) => ({
          ...data,
          posts: [...data.posts, { id: 'temp-1', title: 'New Post' }],
        })
      )

      // Update user email
      manager.applyOptimisticUpdate(
        'users:update',
        { id: 'user1', email: 'newemail@example.com' },
        (data: typeof serverData) => ({
          ...data,
          users: {
            ...data.users,
            user1: { ...data.users.user1, email: 'newemail@example.com' },
          },
        })
      )

      const result = manager.getOptimisticData(serverData)

      expect(result.users.user1.name).toBe('Alice Updated')
      expect(result.users.user1.email).toBe('newemail@example.com')
      expect(result.posts.length).toBe(1)
      expect(result.posts[0]?.title).toBe('New Post')
    })

    it('should handle partial confirmations correctly', () => {
      const serverData = { items: [] as string[] }

      const id1 = manager.applyOptimisticUpdate(
        'items:add',
        { item: 'a' },
        (data: typeof serverData) => ({ items: [...data.items, 'a'] })
      )
      const id2 = manager.applyOptimisticUpdate(
        'items:add',
        { item: 'b' },
        (data: typeof serverData) => ({ items: [...data.items, 'b'] })
      )
      const id3 = manager.applyOptimisticUpdate(
        'items:add',
        { item: 'c' },
        (data: typeof serverData) => ({ items: [...data.items, 'c'] })
      )

      // Confirm only the second one
      manager.confirmUpdate(id2)

      // Server now has 'b'
      const newServerData = { items: ['b'] }
      const result = manager.getOptimisticData(newServerData)

      // Should have b from server + a and c from optimistic
      expect(result.items).toContain('a')
      expect(result.items).toContain('b')
      expect(result.items).toContain('c')
    })
  })

  // ==========================================================================
  // Update Ordering Tests
  // ==========================================================================

  describe('update ordering', () => {
    it('should apply updates in FIFO order', () => {
      const serverData = { log: [] as string[] }

      manager.applyOptimisticUpdate(
        'm1',
        {},
        (data: typeof serverData) => ({ log: [...data.log, 'first'] })
      )
      manager.applyOptimisticUpdate(
        'm2',
        {},
        (data: typeof serverData) => ({ log: [...data.log, 'second'] })
      )
      manager.applyOptimisticUpdate(
        'm3',
        {},
        (data: typeof serverData) => ({ log: [...data.log, 'third'] })
      )

      const result = manager.getOptimisticData(serverData)

      expect(result.log).toEqual(['first', 'second', 'third'])
    })

    it('should preserve order after some updates are confirmed', () => {
      const serverData = { log: [] as string[] }

      const id1 = manager.applyOptimisticUpdate(
        'm1',
        {},
        (data: typeof serverData) => ({ log: [...data.log, 'first'] })
      )
      manager.applyOptimisticUpdate(
        'm2',
        {},
        (data: typeof serverData) => ({ log: [...data.log, 'second'] })
      )
      manager.applyOptimisticUpdate(
        'm3',
        {},
        (data: typeof serverData) => ({ log: [...data.log, 'third'] })
      )

      // Confirm first update
      manager.confirmUpdate(id1)

      // Server now has 'first'
      const newServerData = { log: ['first'] }
      const result = manager.getOptimisticData(newServerData)

      expect(result.log).toEqual(['first', 'second', 'third'])
    })

    it('should handle out-of-order confirmations correctly', () => {
      const serverData = { counter: 0 }

      const id1 = manager.applyOptimisticUpdate(
        'increment',
        { amount: 1 },
        (data: typeof serverData) => ({ counter: data.counter + 1 })
      )
      const id2 = manager.applyOptimisticUpdate(
        'increment',
        { amount: 2 },
        (data: typeof serverData) => ({ counter: data.counter + 2 })
      )
      const id3 = manager.applyOptimisticUpdate(
        'increment',
        { amount: 3 },
        (data: typeof serverData) => ({ counter: data.counter + 3 })
      )

      // Confirm out of order: 2, then 1, then 3
      manager.confirmUpdate(id2)
      const afterFirst = manager.getOptimisticData({ counter: 2 })
      expect(afterFirst.counter).toBe(6) // 2 + 1 + 3

      manager.confirmUpdate(id1)
      const afterSecond = manager.getOptimisticData({ counter: 3 })
      expect(afterSecond.counter).toBe(6) // 3 + 3

      manager.confirmUpdate(id3)
      const afterThird = manager.getOptimisticData({ counter: 6 })
      expect(afterThird.counter).toBe(6) // Just server data
    })

    it('should maintain order information in update objects', () => {
      manager.applyOptimisticUpdate('m1', {}, (d) => d)
      manager.applyOptimisticUpdate('m2', {}, (d) => d)
      manager.applyOptimisticUpdate('m3', {}, (d) => d)

      const pending = manager.getPendingUpdates()

      expect(pending[0]?.order).toBe(0)
      expect(pending[1]?.order).toBe(1)
      expect(pending[2]?.order).toBe(2)
    })
  })

  // ==========================================================================
  // Rollback Cascading Tests
  // ==========================================================================

  describe('rollback cascading', () => {
    it('should cascade rollback to dependent updates', () => {
      // Create a user
      const createUserId = manager.applyOptimisticUpdate(
        'users:create',
        { name: 'Alice' },
        (data: { users: Record<string, { name: string }> }) => ({
          ...data,
          users: { ...data.users, 'temp-user': { name: 'Alice' } },
        }),
        { key: 'create-alice' }
      )

      // Update that depends on the created user
      manager.applyOptimisticUpdate(
        'users:update',
        { id: 'temp-user', email: 'alice@example.com' },
        (data: { users: Record<string, { name: string; email?: string }> }) => ({
          ...data,
          users: {
            ...data.users,
            'temp-user': { ...data.users['temp-user'], email: 'alice@example.com' },
          },
        }),
        { dependsOn: createUserId }
      )

      // Rollback the create
      manager.revertUpdate(createUserId)

      // Both should be reverted
      const pending = manager.getPendingUpdates()
      expect(pending.length).toBe(0)
    })

    it('should cascade multiple levels of dependencies', () => {
      const id1 = manager.applyOptimisticUpdate(
        'm1',
        {},
        (d) => d,
        { key: 'level1' }
      )
      const id2 = manager.applyOptimisticUpdate(
        'm2',
        {},
        (d) => d,
        { dependsOn: id1, key: 'level2' }
      )
      const id3 = manager.applyOptimisticUpdate(
        'm3',
        {},
        (d) => d,
        { dependsOn: id2, key: 'level3' }
      )
      const id4 = manager.applyOptimisticUpdate(
        'm4',
        {},
        (d) => d,
        { dependsOn: id3, key: 'level4' }
      )

      // Rollback the root
      manager.revertUpdate(id1)

      // All should be reverted
      const pending = manager.getPendingUpdates()
      expect(pending.length).toBe(0)
    })

    it('should only cascade to directly dependent updates', () => {
      const id1 = manager.applyOptimisticUpdate('m1', {}, (d) => d)
      const id2 = manager.applyOptimisticUpdate(
        'm2',
        {},
        (d) => d,
        { dependsOn: id1 }
      )
      const id3 = manager.applyOptimisticUpdate('m3', {}, (d) => d)
      const id4 = manager.applyOptimisticUpdate(
        'm4',
        {},
        (d) => d,
        { dependsOn: id3 }
      )

      // Rollback id1
      manager.revertUpdate(id1)

      // id1 and id2 should be reverted, id3 and id4 should remain
      const pending = manager.getPendingUpdates()
      expect(pending.length).toBe(2)
      expect(pending.map((p) => p.id)).toContain(id3)
      expect(pending.map((p) => p.id)).toContain(id4)
    })

    it('should emit cascaded revert events', () => {
      const callback = vi.fn()
      manager.onUpdateReverted(callback)

      const id1 = manager.applyOptimisticUpdate('m1', {}, (d) => d)
      const id2 = manager.applyOptimisticUpdate(
        'm2',
        {},
        (d) => d,
        { dependsOn: id1 }
      )

      manager.revertUpdate(id1)

      // Should be called twice - once for each reverted update
      expect(callback).toHaveBeenCalledTimes(2)
    })

    it('should handle circular dependencies gracefully', () => {
      // This shouldn't happen in practice, but we should handle it
      const id1 = manager.applyOptimisticUpdate('m1', {}, (d) => d)

      // Trying to create circular dependency should be prevented
      expect(() =>
        manager.applyOptimisticUpdate(
          'm2',
          {},
          (d) => d,
          { dependsOn: id1, key: id1 } // Can't depend on yourself essentially
        )
      ).not.toThrow()
    })
  })

  // ==========================================================================
  // Additional Helper Methods Tests
  // ==========================================================================

  describe('helper methods', () => {
    describe('revertAll()', () => {
      it('should revert all pending updates', () => {
        manager.applyOptimisticUpdate('m1', {}, (d) => d)
        manager.applyOptimisticUpdate('m2', {}, (d) => d)
        manager.applyOptimisticUpdate('m3', {}, (d) => d)

        manager.revertAll()

        const pending = manager.getPendingUpdates()
        expect(pending.length).toBe(0)
      })

      it('should return count of reverted updates', () => {
        manager.applyOptimisticUpdate('m1', {}, (d) => d)
        manager.applyOptimisticUpdate('m2', {}, (d) => d)

        const count = manager.revertAll()
        expect(count).toBe(2)
      })

      it('should return 0 when no updates to revert', () => {
        const count = manager.revertAll()
        expect(count).toBe(0)
      })
    })

    describe('hasPendingUpdates()', () => {
      it('should return false when no pending updates', () => {
        expect(manager.hasPendingUpdates()).toBe(false)
      })

      it('should return true when there are pending updates', () => {
        manager.applyOptimisticUpdate('m1', {}, (d) => d)
        expect(manager.hasPendingUpdates()).toBe(true)
      })

      it('should return false after all updates are confirmed', () => {
        const id = manager.applyOptimisticUpdate('m1', {}, (d) => d)
        manager.confirmUpdate(id)
        expect(manager.hasPendingUpdates()).toBe(false)
      })
    })

    describe('getUpdateById()', () => {
      it('should return update by ID', () => {
        const id = manager.applyOptimisticUpdate('m1', { foo: 'bar' }, (d) => d)

        const update = manager.getUpdateById(id)

        expect(update).toBeDefined()
        expect(update?.id).toBe(id)
        expect(update?.mutation).toBe('m1')
        expect(update?.args).toEqual({ foo: 'bar' })
      })

      it('should return undefined for non-existent ID', () => {
        const update = manager.getUpdateById('non-existent')
        expect(update).toBeUndefined()
      })
    })

    describe('markInFlight()', () => {
      it('should change update status to in-flight', () => {
        const id = manager.applyOptimisticUpdate('m1', {}, (d) => d)

        manager.markInFlight(id)

        const update = manager.getUpdateById(id)
        expect(update?.status).toBe('in-flight')
      })

      it('should return true for existing update', () => {
        const id = manager.applyOptimisticUpdate('m1', {}, (d) => d)
        const result = manager.markInFlight(id)
        expect(result).toBe(true)
      })

      it('should return false for non-existent update', () => {
        const result = manager.markInFlight('non-existent')
        expect(result).toBe(false)
      })
    })

    describe('clear()', () => {
      it('should remove all updates without triggering events', () => {
        const callback = vi.fn()
        manager.onUpdateReverted(callback)

        manager.applyOptimisticUpdate('m1', {}, (d) => d)
        manager.applyOptimisticUpdate('m2', {}, (d) => d)

        manager.clear()

        expect(manager.getPendingUpdates().length).toBe(0)
        expect(callback).not.toHaveBeenCalled()
      })
    })
  })

  // ==========================================================================
  // Event System Tests
  // ==========================================================================

  describe('event system', () => {
    describe('onUpdateApplied', () => {
      it('should emit event when update is applied', () => {
        const callback = vi.fn()
        manager.onUpdateApplied(callback)

        manager.applyOptimisticUpdate('users:create', { name: 'Alice' }, (d) => d)

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            mutation: 'users:create',
            args: { name: 'Alice' },
          })
        )
      })

      it('should return unsubscribe function', () => {
        const callback = vi.fn()
        const unsubscribe = manager.onUpdateApplied(callback)

        unsubscribe()

        manager.applyOptimisticUpdate('m1', {}, (d) => d)

        expect(callback).not.toHaveBeenCalled()
      })
    })

    describe('onUpdateConfirmed', () => {
      it('should emit event when update is confirmed', () => {
        const callback = vi.fn()
        manager.onUpdateConfirmed(callback)

        const id = manager.applyOptimisticUpdate('m1', { foo: 'bar' }, (d) => d)
        manager.confirmUpdate(id)

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            updateId: id,
            mutation: 'm1',
            args: { foo: 'bar' },
          })
        )
      })
    })

    describe('onUpdateReverted', () => {
      it('should emit event when update is reverted', () => {
        const callback = vi.fn()
        manager.onUpdateReverted(callback)

        const id = manager.applyOptimisticUpdate('m1', { foo: 'bar' }, (d) => d)
        manager.revertUpdate(id)

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            updateId: id,
            mutation: 'm1',
            args: { foo: 'bar' },
          })
        )
      })
    })

    describe('removeAllListeners', () => {
      it('should remove all event listeners', () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn()
        const callback3 = vi.fn()

        manager.onUpdateApplied(callback1)
        manager.onUpdateConfirmed(callback2)
        manager.onUpdateReverted(callback3)

        manager.removeAllListeners()

        const id = manager.applyOptimisticUpdate('m1', {}, (d) => d)
        manager.confirmUpdate(id)

        expect(callback1).not.toHaveBeenCalled()
        expect(callback2).not.toHaveBeenCalled()
        expect(callback3).not.toHaveBeenCalled()
      })
    })
  })

  // ==========================================================================
  // Type Safety Tests
  // ==========================================================================

  describe('type safety', () => {
    it('should preserve data types through optimistic updates', () => {
      interface UserData {
        users: Record<string, { name: string; age: number }>
      }

      const serverData: UserData = {
        users: { user1: { name: 'Alice', age: 30 } },
      }

      manager.applyOptimisticUpdate<UserData>(
        'users:update',
        { id: 'user1', age: 31 },
        (data) => ({
          ...data,
          users: { ...data.users, user1: { ...data.users.user1, age: 31 } },
        })
      )

      const result = manager.getOptimisticData(serverData)

      // TypeScript should know result has correct shape
      expect(result.users.user1.age).toBe(31)
      expect(typeof result.users.user1.name).toBe('string')
    })

    it('should type args correctly', () => {
      interface CreateUserArgs {
        name: string
        email: string
      }

      manager.applyOptimisticUpdate<object, CreateUserArgs>(
        'users:create',
        { name: 'Alice', email: 'alice@example.com' },
        (data) => data
      )

      const pending = manager.getPendingUpdates()
      const args = pending[0]?.args as CreateUserArgs

      expect(args.name).toBe('Alice')
      expect(args.email).toBe('alice@example.com')
    })
  })

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe('performance', () => {
    it('should handle large number of updates efficiently', () => {
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        manager.applyOptimisticUpdate(`m${i}`, { index: i }, (d) => d)
      }

      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(1000) // Should complete in under 1 second
      expect(manager.getPendingUpdates().length).toBe(1000)
    })

    it('should apply updates to data efficiently', () => {
      const serverData = { counter: 0 }

      for (let i = 0; i < 100; i++) {
        manager.applyOptimisticUpdate(
          'counter:increment',
          {},
          (data: typeof serverData) => ({ counter: data.counter + 1 })
        )
      }

      const start = performance.now()
      const result = manager.getOptimisticData(serverData)
      const elapsed = performance.now() - start

      expect(result.counter).toBe(100)
      expect(elapsed).toBeLessThan(100) // Should complete in under 100ms
    })

    it('should confirm updates efficiently', () => {
      const ids: string[] = []

      for (let i = 0; i < 500; i++) {
        ids.push(manager.applyOptimisticUpdate(`m${i}`, {}, (d) => d))
      }

      const start = performance.now()

      for (const id of ids) {
        manager.confirmUpdate(id)
      }

      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(500) // Should complete in under 500ms
      expect(manager.getPendingUpdates().length).toBe(0)
    })
  })

  // ==========================================================================
  // Serialization Tests
  // ==========================================================================

  describe('serialization', () => {
    it('should serialize pending updates to JSON', () => {
      manager.applyOptimisticUpdate(
        'users:create',
        { name: 'Alice' },
        (d) => d
      )

      const serialized = manager.serialize()

      expect(typeof serialized).toBe('string')
      expect(() => JSON.parse(serialized)).not.toThrow()
    })

    it('should deserialize pending updates from JSON', () => {
      manager.applyOptimisticUpdate(
        'users:create',
        { name: 'Alice' },
        (d) => d
      )

      const serialized = manager.serialize()

      const newManager = new OptimisticUpdateManager()
      newManager.deserialize(serialized)

      const pending = newManager.getPendingUpdates()
      expect(pending.length).toBe(1)
      expect(pending[0]?.mutation).toBe('users:create')
      expect(pending[0]?.args).toEqual({ name: 'Alice' })
    })

    it('should preserve update functions through serialization with restore', () => {
      const updateFn = (data: { name: string }) => ({ name: data.name.toUpperCase() })

      manager.applyOptimisticUpdate(
        'users:update',
        { id: 'user1' },
        updateFn,
        { key: 'update-user1' }
      )

      const serialized = manager.serialize()

      const newManager = new OptimisticUpdateManager()
      // Provide update function factory for restoring
      newManager.deserialize(serialized, {
        'update-user1': updateFn,
      })

      const serverData = { name: 'alice' }
      const result = newManager.getOptimisticData(serverData)

      expect(result.name).toBe('ALICE')
    })
  })
})

// ============================================================================
// OptimisticUpdate Interface Tests
// ============================================================================

describe('OptimisticUpdate interface', () => {
  it('should have required properties', () => {
    const manager = new OptimisticUpdateManager()
    manager.applyOptimisticUpdate('test', { foo: 'bar' }, (d) => d)

    const [update] = manager.getPendingUpdates()

    // Check required properties exist
    expect(update).toHaveProperty('id')
    expect(update).toHaveProperty('mutation')
    expect(update).toHaveProperty('args')
    expect(update).toHaveProperty('updateFn')
    expect(update).toHaveProperty('status')
    expect(update).toHaveProperty('appliedAt')
    expect(update).toHaveProperty('order')
  })

  it('should have correct status type', () => {
    const manager = new OptimisticUpdateManager()
    const id = manager.applyOptimisticUpdate('test', {}, (d) => d)

    const update = manager.getUpdateById(id)

    expect(['pending', 'in-flight', 'confirmed', 'reverted']).toContain(update?.status)
  })
})

// ============================================================================
// OptimisticUpdateStatus Enum Tests
// ============================================================================

describe('OptimisticUpdateStatus', () => {
  it('should export status constants', () => {
    expect(OptimisticUpdateStatus.PENDING).toBe('pending')
    expect(OptimisticUpdateStatus.IN_FLIGHT).toBe('in-flight')
    expect(OptimisticUpdateStatus.CONFIRMED).toBe('confirmed')
    expect(OptimisticUpdateStatus.REVERTED).toBe('reverted')
  })
})

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createOptimisticUpdateManager', () => {
  it('should create manager with default options', () => {
    const manager = createOptimisticUpdateManager()
    expect(manager).toBeInstanceOf(OptimisticUpdateManager)
  })

  it('should create manager with custom options', () => {
    const manager = createOptimisticUpdateManager({
      maxPendingUpdates: 50,
      enableLogging: true,
    })
    expect(manager).toBeInstanceOf(OptimisticUpdateManager)
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('integration scenarios', () => {
  let manager: OptimisticUpdateManager

  beforeEach(() => {
    manager = new OptimisticUpdateManager()
  })

  it('should handle typical user update flow', async () => {
    const serverData = {
      users: {
        user1: { name: 'Alice', email: 'alice@old.com' },
      },
    }

    // User updates their name
    const updateId = manager.applyOptimisticUpdate(
      'users:update',
      { id: 'user1', name: 'Alice Smith' },
      (data: typeof serverData) => ({
        ...data,
        users: {
          ...data.users,
          user1: { ...data.users.user1, name: 'Alice Smith' },
        },
      })
    )

    // UI immediately shows updated name
    let localData = manager.getOptimisticData(serverData)
    expect(localData.users.user1.name).toBe('Alice Smith')

    // Server confirms
    manager.confirmUpdate(updateId)

    // Server returns updated data
    const newServerData = {
      users: {
        user1: { name: 'Alice Smith', email: 'alice@old.com' },
      },
    }

    localData = manager.getOptimisticData(newServerData)
    expect(localData.users.user1.name).toBe('Alice Smith')
    expect(manager.hasPendingUpdates()).toBe(false)
  })

  it('should handle update failure and revert', async () => {
    const serverData = { counter: 10 }

    const updateId = manager.applyOptimisticUpdate(
      'counter:increment',
      { amount: 5 },
      (data: typeof serverData) => ({ counter: data.counter + 5 })
    )

    // UI shows optimistic value
    expect(manager.getOptimisticData(serverData).counter).toBe(15)

    // Server fails
    manager.revertUpdate(updateId, new Error('Server error'))

    // UI reverts to server data
    expect(manager.getOptimisticData(serverData).counter).toBe(10)
  })

  it('should handle rapid sequential updates', () => {
    const serverData = { text: '' }

    // Simulate typing
    for (const char of 'Hello') {
      manager.applyOptimisticUpdate(
        'text:append',
        { char },
        (data: typeof serverData) => ({ text: data.text + char })
      )
    }

    const localData = manager.getOptimisticData(serverData)
    expect(localData.text).toBe('Hello')
  })

  it('should handle concurrent operations on different data', () => {
    const serverData = {
      users: { user1: { name: 'Alice' } },
      posts: [{ id: 'p1', title: 'First Post' }],
      settings: { theme: 'light' },
    }

    // Update user
    manager.applyOptimisticUpdate(
      'users:update',
      { id: 'user1', name: 'Bob' },
      (data: typeof serverData) => ({
        ...data,
        users: { ...data.users, user1: { name: 'Bob' } },
      })
    )

    // Add post
    manager.applyOptimisticUpdate(
      'posts:create',
      { title: 'New Post' },
      (data: typeof serverData) => ({
        ...data,
        posts: [...data.posts, { id: 'temp', title: 'New Post' }],
      })
    )

    // Update settings
    manager.applyOptimisticUpdate(
      'settings:update',
      { theme: 'dark' },
      (data: typeof serverData) => ({
        ...data,
        settings: { theme: 'dark' },
      })
    )

    const localData = manager.getOptimisticData(serverData)

    expect(localData.users.user1.name).toBe('Bob')
    expect(localData.posts.length).toBe(2)
    expect(localData.settings.theme).toBe('dark')
  })
})
