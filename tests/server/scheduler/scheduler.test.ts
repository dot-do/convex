/**
 * TDD Tests for Scheduler API (RED Phase)
 *
 * Tests for the scheduler interface that enables delayed function execution.
 * These tests exercise ctx.scheduler.runAfter(), ctx.scheduler.runAt(),
 * and ctx.scheduler.cancel() functionality.
 *
 * The scheduler is available in both MutationCtx and ActionCtx.
 *
 * RED PHASE: These tests should FAIL because the createScheduler factory
 * and SchedulerImpl do not exist yet.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { Scheduler } from '../../../src/server/context'
import type { FunctionReference, ScheduledFunctionId } from '../../../src/types'

// ============================================================================
// Import the scheduler factory that doesn't exist yet (RED phase)
// ============================================================================

// This import should fail - createScheduler doesn't exist
// @ts-expect-error - This import is expected to fail in RED phase
import { createScheduler, SchedulerImpl } from '../../../src/server/scheduler'

// ============================================================================
// Mock Types for Testing
// ============================================================================

interface MockMutationRef extends FunctionReference<'mutation'> {
  _type: 'mutation'
  _args: { message: string }
  _returns: void
  _path: string
}

interface MockActionRef extends FunctionReference<'action'> {
  _type: 'action'
  _args: { userId: string }
  _returns: { success: boolean }
  _path: string
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Scheduler', () => {
  let scheduler: Scheduler

  // Mock function references
  const mockMutationRef: MockMutationRef = {
    _type: 'mutation',
    _args: { message: '' },
    _returns: undefined,
    _path: 'myModule:sendNotification',
  }

  const mockActionRef: MockActionRef = {
    _type: 'action',
    _args: { userId: '' },
    _returns: { success: false },
    _path: 'myModule:processUser',
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

    // This should fail in RED phase - createScheduler doesn't exist
    scheduler = createScheduler()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ============================================================================
  // Factory Tests (RED - createScheduler doesn't exist)
  // ============================================================================

  describe('createScheduler factory', () => {
    it('should export createScheduler factory function', () => {
      expect(createScheduler).toBeDefined()
      expect(typeof createScheduler).toBe('function')
    })

    it('should create a Scheduler instance', () => {
      const scheduler = createScheduler()
      expect(scheduler).toBeDefined()
      expect(typeof scheduler.runAfter).toBe('function')
      expect(typeof scheduler.runAt).toBe('function')
      expect(typeof scheduler.cancel).toBe('function')
    })

    it('should export SchedulerImpl class', () => {
      expect(SchedulerImpl).toBeDefined()
    })
  })

  // ============================================================================
  // runAfter Tests
  // ============================================================================

  describe('runAfter', () => {
    describe('basic scheduling', () => {
      it('should schedule a mutation to run after a delay', async () => {
        const scheduledId = await scheduler.runAfter(
          5000,
          mockMutationRef,
          { message: 'Hello' }
        )

        expect(scheduledId).toBeDefined()
        expect(typeof scheduledId).toBe('string')
        expect(scheduledId.length).toBeGreaterThan(0)
      })

      it('should schedule an action to run after a delay', async () => {
        const scheduledId = await scheduler.runAfter(
          10000,
          mockActionRef,
          { userId: 'user_123' }
        )

        expect(scheduledId).toBeDefined()
        expect(typeof scheduledId).toBe('string')
      })

      it('should return unique IDs for each scheduled function', async () => {
        const id1 = await scheduler.runAfter(1000, mockMutationRef, { message: 'First' })
        const id2 = await scheduler.runAfter(2000, mockMutationRef, { message: 'Second' })
        const id3 = await scheduler.runAfter(3000, mockActionRef, { userId: 'user_1' })

        expect(id1).not.toBe(id2)
        expect(id2).not.toBe(id3)
        expect(id1).not.toBe(id3)
      })

      it('should return a ScheduledFunctionId type', async () => {
        const scheduledId = await scheduler.runAfter(
          1000,
          mockMutationRef,
          { message: 'Test' }
        )

        // The ID should be a branded string type
        const idAsString: string = scheduledId
        expect(idAsString).toBeDefined()
      })
    })

    describe('various delay values', () => {
      it('should schedule with zero delay (immediate execution)', async () => {
        const scheduledId = await scheduler.runAfter(
          0,
          mockMutationRef,
          { message: 'Immediate' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should schedule with small delay (100ms)', async () => {
        const scheduledId = await scheduler.runAfter(
          100,
          mockMutationRef,
          { message: 'Quick' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should schedule with 1 second delay', async () => {
        const scheduledId = await scheduler.runAfter(
          1000,
          mockMutationRef,
          { message: 'One second' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should schedule with 1 minute delay', async () => {
        const scheduledId = await scheduler.runAfter(
          60000,
          mockMutationRef,
          { message: 'One minute' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should schedule with 1 hour delay', async () => {
        const scheduledId = await scheduler.runAfter(
          3600000,
          mockMutationRef,
          { message: 'One hour' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should schedule with 24 hour delay', async () => {
        const scheduledId = await scheduler.runAfter(
          86400000,
          mockMutationRef,
          { message: '24 hours' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should schedule with 7 day delay', async () => {
        const scheduledId = await scheduler.runAfter(
          604800000,
          mockMutationRef,
          { message: 'One week' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should reject negative delay values', async () => {
        await expect(
          scheduler.runAfter(-1000, mockMutationRef, { message: 'Negative' })
        ).rejects.toThrow(/negative|invalid|delay/i)
      })

      it('should reject NaN delay values', async () => {
        await expect(
          scheduler.runAfter(NaN, mockMutationRef, { message: 'NaN' })
        ).rejects.toThrow(/invalid|NaN|delay/i)
      })

      it('should reject Infinity delay values', async () => {
        await expect(
          scheduler.runAfter(Infinity, mockMutationRef, { message: 'Infinity' })
        ).rejects.toThrow(/invalid|infinity|delay/i)
      })
    })

    describe('arguments handling', () => {
      it('should accept simple string arguments', async () => {
        const scheduledId = await scheduler.runAfter(
          1000,
          mockMutationRef,
          { message: 'Hello World' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should accept complex object arguments', async () => {
        const complexActionRef: FunctionReference<'action'> = {
          _type: 'action',
          _args: {},
          _returns: undefined,
          _path: 'complex:action',
        }

        const complexArgs = {
          userId: 'user_123',
          data: {
            nested: {
              value: 42,
              array: [1, 2, 3],
            },
          },
          tags: ['important', 'urgent'],
        }

        const scheduledId = await scheduler.runAfter(1000, complexActionRef, complexArgs)
        expect(scheduledId).toBeDefined()
      })

      it('should accept empty arguments object', async () => {
        const emptyArgsRef: FunctionReference<'mutation'> = {
          _type: 'mutation',
          _args: {},
          _returns: undefined,
          _path: 'empty:mutation',
        }

        const scheduledId = await scheduler.runAfter(1000, emptyArgsRef, {})
        expect(scheduledId).toBeDefined()
      })

      it('should accept arguments with null values', async () => {
        const nullableRef: FunctionReference<'mutation'> = {
          _type: 'mutation',
          _args: { optionalField: null },
          _returns: undefined,
          _path: 'nullable:mutation',
        }

        const scheduledId = await scheduler.runAfter(
          1000,
          nullableRef,
          { optionalField: null }
        )
        expect(scheduledId).toBeDefined()
      })

      it('should accept arguments with array values', async () => {
        const arrayRef: FunctionReference<'action'> = {
          _type: 'action',
          _args: { items: [] },
          _returns: undefined,
          _path: 'array:action',
        }

        const scheduledId = await scheduler.runAfter(
          1000,
          arrayRef,
          { items: ['a', 'b', 'c'] }
        )
        expect(scheduledId).toBeDefined()
      })
    })
  })

  // ============================================================================
  // runAt Tests
  // ============================================================================

  describe('runAt', () => {
    describe('with timestamp number', () => {
      it('should schedule a mutation to run at specific timestamp', async () => {
        const targetTime = Date.now() + 10000

        const scheduledId = await scheduler.runAt(
          targetTime,
          mockMutationRef,
          { message: 'At timestamp' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should schedule an action to run at specific timestamp', async () => {
        const targetTime = Date.now() + 60000

        const scheduledId = await scheduler.runAt(
          targetTime,
          mockActionRef,
          { userId: 'user_456' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should reject scheduling for timestamp in the past', async () => {
        const pastTime = Date.now() - 1000

        await expect(
          scheduler.runAt(pastTime, mockMutationRef, { message: 'Past' })
        ).rejects.toThrow(/past|invalid|timestamp/i)
      })

      it('should allow scheduling at current time (immediate)', async () => {
        const scheduledId = await scheduler.runAt(
          Date.now(),
          mockMutationRef,
          { message: 'Now' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should schedule for far future timestamp', async () => {
        const farFuture = Date.now() + (365 * 24 * 60 * 60 * 1000) // 1 year

        const scheduledId = await scheduler.runAt(
          farFuture,
          mockMutationRef,
          { message: 'Next year' }
        )

        expect(scheduledId).toBeDefined()
      })
    })

    describe('with Date object', () => {
      it('should schedule using Date object', async () => {
        const targetDate = new Date(Date.now() + 30000)

        const scheduledId = await scheduler.runAt(
          targetDate,
          mockMutationRef,
          { message: 'With Date' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should handle Date at midnight', async () => {
        const midnight = new Date()
        midnight.setHours(0, 0, 0, 0)
        midnight.setDate(midnight.getDate() + 1) // Next midnight

        const scheduledId = await scheduler.runAt(
          midnight,
          mockMutationRef,
          { message: 'Midnight' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should handle Date with specific time', async () => {
        const specificTime = new Date('2024-06-15T14:30:00.000Z')

        const scheduledId = await scheduler.runAt(
          specificTime,
          mockMutationRef,
          { message: 'Specific time' }
        )

        expect(scheduledId).toBeDefined()
      })

      it('should reject invalid Date objects', async () => {
        const invalidDate = new Date('invalid')

        await expect(
          scheduler.runAt(invalidDate, mockMutationRef, { message: 'Invalid' })
        ).rejects.toThrow(/invalid|date/i)
      })
    })

    describe('timestamp validation', () => {
      it('should reject NaN timestamp', async () => {
        await expect(
          scheduler.runAt(NaN, mockMutationRef, { message: 'NaN' })
        ).rejects.toThrow(/invalid|NaN|timestamp/i)
      })

      it('should reject Infinity timestamp', async () => {
        await expect(
          scheduler.runAt(Infinity, mockMutationRef, { message: 'Infinity' })
        ).rejects.toThrow(/invalid|infinity|timestamp/i)
      })

      it('should reject negative timestamp', async () => {
        await expect(
          scheduler.runAt(-1, mockMutationRef, { message: 'Negative' })
        ).rejects.toThrow(/invalid|negative|timestamp/i)
      })
    })
  })

  // ============================================================================
  // Scheduling Mutations vs Actions
  // ============================================================================

  describe('scheduling mutations', () => {
    it('should successfully schedule a mutation', async () => {
      const scheduledId = await scheduler.runAfter(
        1000,
        mockMutationRef,
        { message: 'Test' }
      )

      expect(scheduledId).toBeDefined()
    })

    it('should schedule multiple mutations in sequence', async () => {
      const id1 = await scheduler.runAfter(1000, mockMutationRef, { message: 'First' })
      const id2 = await scheduler.runAfter(2000, mockMutationRef, { message: 'Second' })
      const id3 = await scheduler.runAfter(3000, mockMutationRef, { message: 'Third' })

      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id3).toBeDefined()

      // All IDs should be unique
      const ids = new Set([id1, id2, id3])
      expect(ids.size).toBe(3)
    })
  })

  describe('scheduling actions', () => {
    it('should successfully schedule an action', async () => {
      const scheduledId = await scheduler.runAfter(
        1000,
        mockActionRef,
        { userId: 'user_123' }
      )

      expect(scheduledId).toBeDefined()
    })

    it('should schedule multiple actions in sequence', async () => {
      const id1 = await scheduler.runAfter(1000, mockActionRef, { userId: 'user_1' })
      const id2 = await scheduler.runAfter(2000, mockActionRef, { userId: 'user_2' })
      const id3 = await scheduler.runAfter(3000, mockActionRef, { userId: 'user_3' })

      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id3).toBeDefined()
    })
  })

  describe('mixed scheduling', () => {
    it('should handle mixed mutations and actions', async () => {
      const mutationId = await scheduler.runAfter(
        1000,
        mockMutationRef,
        { message: 'Mutation' }
      )
      const actionId = await scheduler.runAfter(
        2000,
        mockActionRef,
        { userId: 'user_123' }
      )

      expect(mutationId).toBeDefined()
      expect(actionId).toBeDefined()
      expect(mutationId).not.toBe(actionId)
    })
  })

  // ============================================================================
  // Cancel Tests
  // ============================================================================

  describe('cancel', () => {
    describe('basic cancellation', () => {
      it('should cancel a pending scheduled function', async () => {
        const scheduledId = await scheduler.runAfter(
          10000,
          mockMutationRef,
          { message: 'To cancel' }
        )

        await expect(scheduler.cancel(scheduledId)).resolves.not.toThrow()
      })

      it('should return void on successful cancellation', async () => {
        const scheduledId = await scheduler.runAfter(
          10000,
          mockMutationRef,
          { message: 'To cancel' }
        )

        const result = await scheduler.cancel(scheduledId)
        expect(result).toBeUndefined()
      })

      it('should throw when canceling non-existent function', async () => {
        const fakeId = 'non_existent_id' as ScheduledFunctionId

        await expect(scheduler.cancel(fakeId)).rejects.toThrow(/not found|does not exist/i)
      })
    })

    describe('cancellation timing', () => {
      it('should allow cancellation immediately after scheduling', async () => {
        const scheduledId = await scheduler.runAfter(
          10000,
          mockMutationRef,
          { message: 'Test' }
        )

        // Cancel immediately
        await expect(scheduler.cancel(scheduledId)).resolves.not.toThrow()
      })

      it('should allow cancellation shortly before execution time', async () => {
        const scheduledId = await scheduler.runAfter(
          10000,
          mockMutationRef,
          { message: 'Test' }
        )

        // Advance time but not past execution
        vi.advanceTimersByTime(9999)

        await expect(scheduler.cancel(scheduledId)).resolves.not.toThrow()
      })

      it('should throw when canceling already executed function', async () => {
        const scheduledId = await scheduler.runAfter(
          1000,
          mockMutationRef,
          { message: 'Test' }
        )

        // Advance time past execution
        vi.advanceTimersByTime(2000)

        // Function should have executed - canceling should fail
        await expect(scheduler.cancel(scheduledId)).rejects.toThrow(/already|executed|completed/i)
      })

      it('should throw when canceling already canceled function', async () => {
        const scheduledId = await scheduler.runAfter(
          10000,
          mockMutationRef,
          { message: 'Test' }
        )

        await scheduler.cancel(scheduledId)

        // Try to cancel again
        await expect(scheduler.cancel(scheduledId)).rejects.toThrow(/already.*cancel/i)
      })
    })

    describe('multiple cancellations', () => {
      it('should cancel specific function while others remain scheduled', async () => {
        const id1 = await scheduler.runAfter(1000, mockMutationRef, { message: 'Keep 1' })
        const id2 = await scheduler.runAfter(2000, mockMutationRef, { message: 'Cancel' })
        const id3 = await scheduler.runAfter(3000, mockMutationRef, { message: 'Keep 2' })

        await scheduler.cancel(id2)

        // id1 and id3 should still be valid for cancellation
        await expect(scheduler.cancel(id1)).resolves.not.toThrow()
        await expect(scheduler.cancel(id3)).resolves.not.toThrow()
      })

      it('should allow canceling multiple functions', async () => {
        const id1 = await scheduler.runAfter(1000, mockMutationRef, { message: 'Cancel 1' })
        const id2 = await scheduler.runAfter(2000, mockMutationRef, { message: 'Cancel 2' })
        const id3 = await scheduler.runAfter(3000, mockMutationRef, { message: 'Cancel 3' })

        await expect(scheduler.cancel(id1)).resolves.not.toThrow()
        await expect(scheduler.cancel(id2)).resolves.not.toThrow()
        await expect(scheduler.cancel(id3)).resolves.not.toThrow()
      })
    })
  })

  // ============================================================================
  // Integration Scenarios
  // ============================================================================

  describe('integration scenarios', () => {
    it('should handle scheduling workflow with multiple functions', async () => {
      // Schedule multiple functions
      const id1 = await scheduler.runAfter(1000, mockMutationRef, { message: 'First' })
      const id2 = await scheduler.runAfter(2000, mockMutationRef, { message: 'Second' })
      const id3 = await scheduler.runAfter(3000, mockMutationRef, { message: 'Third' })

      // All should be scheduled
      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id3).toBeDefined()

      // Cancel second before it executes
      await scheduler.cancel(id2)

      // Should be able to cancel remaining
      await scheduler.cancel(id1)
      await scheduler.cancel(id3)
    })

    it('should handle scheduling with same target time', async () => {
      const targetTime = Date.now() + 5000

      const id1 = await scheduler.runAt(targetTime, mockMutationRef, { message: 'Same time 1' })
      const id2 = await scheduler.runAt(targetTime, mockMutationRef, { message: 'Same time 2' })
      const id3 = await scheduler.runAt(targetTime, mockActionRef, { userId: 'same_time' })

      // All should have unique IDs even with same time
      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).not.toBe(id3)
    })

    it('should handle rapid successive scheduling', async () => {
      const ids: ScheduledFunctionId[] = []

      // Schedule 100 functions rapidly
      for (let i = 0; i < 100; i++) {
        const id = await scheduler.runAfter(
          i * 10,
          mockMutationRef,
          { message: `Rapid ${i}` }
        )
        ids.push(id)
      }

      // All IDs should be unique
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(100)
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw for undefined function reference', async () => {
      await expect(
        scheduler.runAfter(1000, undefined as unknown as FunctionReference<'mutation'>, {})
      ).rejects.toThrow(/function.*reference|undefined/i)
    })

    it('should throw for null function reference', async () => {
      await expect(
        scheduler.runAfter(1000, null as unknown as FunctionReference<'mutation'>, {})
      ).rejects.toThrow(/function.*reference|null/i)
    })

    it('should throw for function reference missing _path', async () => {
      const invalidRef = {
        _type: 'mutation',
        _args: {},
        _returns: undefined,
        // Missing _path
      } as unknown as FunctionReference<'mutation'>

      await expect(
        scheduler.runAfter(1000, invalidRef, {})
      ).rejects.toThrow(/path|invalid|function/i)
    })

    it('should throw for function reference with invalid _type', async () => {
      const invalidRef = {
        _type: 'query', // queries can't be scheduled
        _args: {},
        _returns: undefined,
        _path: 'invalid:query',
      } as unknown as FunctionReference<'mutation'>

      await expect(
        scheduler.runAfter(1000, invalidRef, {})
      ).rejects.toThrow(/query|type|schedule/i)
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle very large delay values', async () => {
      // 30 days is typically the max for Convex
      const thirtyDays = 30 * 24 * 60 * 60 * 1000

      const scheduledId = await scheduler.runAfter(
        thirtyDays,
        mockMutationRef,
        { message: 'Far future' }
      )

      expect(scheduledId).toBeDefined()
    })

    it('should reject delay values exceeding maximum', async () => {
      // More than 30 days should be rejected
      const overThirtyDays = 31 * 24 * 60 * 60 * 1000

      await expect(
        scheduler.runAfter(overThirtyDays, mockMutationRef, { message: 'Too far' })
      ).rejects.toThrow(/maximum|exceed|delay/i)
    })

    it('should handle empty string in function path', async () => {
      const emptyPathRef: FunctionReference<'mutation'> = {
        _type: 'mutation',
        _args: {},
        _returns: undefined,
        _path: '',
      }

      await expect(
        scheduler.runAfter(1000, emptyPathRef, {})
      ).rejects.toThrow(/path|empty|invalid/i)
    })

    it('should handle very long function paths', async () => {
      const longPath = 'a'.repeat(1000) + ':mutation'
      const longPathRef: FunctionReference<'mutation'> = {
        _type: 'mutation',
        _args: {},
        _returns: undefined,
        _path: longPath,
      }

      // Should either accept or reject with meaningful error
      const result = scheduler.runAfter(1000, longPathRef, {})
      await expect(result).rejects.toThrow()
    })
  })
})
