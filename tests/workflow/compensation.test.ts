/**
 * Compensation Handlers Tests - Layer 10
 * Issue: convex-04c
 *
 * TDD RED Phase: These tests are expected to fail until implementation is complete.
 *
 * The Compensation Handlers module provides saga-pattern rollback capabilities
 * for workflow steps, enabling transactional consistency across distributed operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CompensationRegistry,
  CompensationHandler,
  CompensationContext,
  createCompensationRegistry,
  registerCompensation,
  executeCompensations,
  CompensationExecutionResult,
  CompensationError,
  CompensationPolicy,
  CompensationStrategy,
  CompensationScope,
  withCompensation,
  createCompensableStep,
} from '../../src/workflow/compensation'

// ============================================================================
// Compensation Registration Tests
// ============================================================================

describe('Compensation Registration', () => {
  let registry: CompensationRegistry

  beforeEach(() => {
    registry = createCompensationRegistry()
  })

  describe('createCompensationRegistry', () => {
    it('should create an empty registry', () => {
      expect(registry).toBeDefined()
      expect(registry.size()).toBe(0)
    })

    it('should have unique ID', () => {
      const registry1 = createCompensationRegistry()
      const registry2 = createCompensationRegistry()

      expect(registry1.id).toBeDefined()
      expect(registry2.id).toBeDefined()
      expect(registry1.id).not.toBe(registry2.id)
    })

    it('should accept workflow context', () => {
      const registry = createCompensationRegistry({
        workflowId: 'wf_123',
        workflowName: 'order-processing',
      })

      expect(registry.workflowId).toBe('wf_123')
      expect(registry.workflowName).toBe('order-processing')
    })
  })

  describe('registerCompensation', () => {
    it('should register a compensation handler', () => {
      const handler: CompensationHandler = vi.fn()

      registerCompensation(registry, 'step-1', handler)

      expect(registry.size()).toBe(1)
      expect(registry.has('step-1')).toBe(true)
    })

    it('should register multiple compensation handlers', () => {
      registerCompensation(registry, 'step-1', vi.fn())
      registerCompensation(registry, 'step-2', vi.fn())
      registerCompensation(registry, 'step-3', vi.fn())

      expect(registry.size()).toBe(3)
    })

    it('should preserve registration order', () => {
      registerCompensation(registry, 'step-a', vi.fn())
      registerCompensation(registry, 'step-b', vi.fn())
      registerCompensation(registry, 'step-c', vi.fn())

      const order = registry.getRegistrationOrder()

      expect(order).toEqual(['step-a', 'step-b', 'step-c'])
    })

    it('should store step result with compensation', () => {
      const handler: CompensationHandler = vi.fn()
      const stepResult = { orderId: '123', amount: 100 }

      registerCompensation(registry, 'charge-payment', handler, {
        stepResult,
      })

      const entry = registry.get('charge-payment')
      expect(entry?.stepResult).toEqual(stepResult)
    })

    it('should store step input with compensation', () => {
      const handler: CompensationHandler = vi.fn()
      const stepInput = { userId: 'u1', items: ['a', 'b'] }

      registerCompensation(registry, 'reserve-inventory', handler, {
        stepInput,
      })

      const entry = registry.get('reserve-inventory')
      expect(entry?.stepInput).toEqual(stepInput)
    })

    it('should allow metadata attachment', () => {
      const handler: CompensationHandler = vi.fn()

      registerCompensation(registry, 'external-api-call', handler, {
        metadata: {
          externalId: 'ext-456',
          timestamp: Date.now(),
        },
      })

      const entry = registry.get('external-api-call')
      expect(entry?.metadata?.externalId).toBe('ext-456')
    })

    it('should throw when registering duplicate step without override', () => {
      registerCompensation(registry, 'step-1', vi.fn())

      expect(() => {
        registerCompensation(registry, 'step-1', vi.fn())
      }).toThrow(/already registered/i)
    })

    it('should allow override with explicit flag', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      registerCompensation(registry, 'step-1', handler1)
      registerCompensation(registry, 'step-1', handler2, { override: true })

      const entry = registry.get('step-1')
      expect(entry?.handler).toBe(handler2)
    })
  })

  describe('registry management', () => {
    it('should remove a compensation', () => {
      registerCompensation(registry, 'step-1', vi.fn())
      expect(registry.has('step-1')).toBe(true)

      registry.remove('step-1')
      expect(registry.has('step-1')).toBe(false)
    })

    it('should clear all compensations', () => {
      registerCompensation(registry, 'step-1', vi.fn())
      registerCompensation(registry, 'step-2', vi.fn())

      registry.clear()

      expect(registry.size()).toBe(0)
    })

    it('should return list of registered steps', () => {
      registerCompensation(registry, 'step-1', vi.fn())
      registerCompensation(registry, 'step-2', vi.fn())

      const steps = registry.getSteps()

      expect(steps).toContain('step-1')
      expect(steps).toContain('step-2')
    })
  })
})

// ============================================================================
// Compensation Execution Tests
// ============================================================================

describe('Compensation Execution', () => {
  let registry: CompensationRegistry

  beforeEach(() => {
    vi.useFakeTimers()
    registry = createCompensationRegistry()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('executeCompensations', () => {
    it('should execute single compensation', async () => {
      const handler = vi.fn().mockResolvedValue(undefined)
      registerCompensation(registry, 'step-1', handler, {
        stepResult: { data: 'test' },
      })

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(handler).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
      expect(result.executedCount).toBe(1)
    })

    it('should provide context to compensation handler', async () => {
      const handler = vi.fn().mockResolvedValue(undefined)
      const stepResult = { orderId: '123' }
      const stepInput = { amount: 100 }

      registerCompensation(registry, 'charge', handler, {
        stepResult,
        stepInput,
      })

      await executeCompensations(registry)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          stepName: 'charge',
          stepResult,
          stepInput,
        })
      )
    })

    it('should execute all compensations on success', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined)
      const handler2 = vi.fn().mockResolvedValue(undefined)
      const handler3 = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'step-1', handler1)
      registerCompensation(registry, 'step-2', handler2)
      registerCompensation(registry, 'step-3', handler3)

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
      expect(handler3).toHaveBeenCalledTimes(1)
      expect(result.executedCount).toBe(3)
    })

    it('should return detailed execution result', async () => {
      registerCompensation(registry, 'step-1', vi.fn().mockResolvedValue('comp-result-1'))
      registerCompensation(registry, 'step-2', vi.fn().mockResolvedValue('comp-result-2'))

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(result.results['step-1'].success).toBe(true)
      expect(result.results['step-1'].result).toBe('comp-result-1')
      expect(result.results['step-2'].success).toBe(true)
    })

    it('should track execution time', async () => {
      registerCompensation(registry, 'step-1', vi.fn().mockResolvedValue(undefined))

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0)
      expect(result.results['step-1'].timeMs).toBeGreaterThanOrEqual(0)
    })

    it('should handle async compensation handlers', async () => {
      const handler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return 'async-result'
      })

      registerCompensation(registry, 'async-step', handler)

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(200)
      const result = await resultPromise

      expect(result.success).toBe(true)
      expect(result.results['async-step'].result).toBe('async-result')
    })
  })

  describe('compensation failure handling', () => {
    it('should handle compensation failure', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Compensation failed'))
      registerCompensation(registry, 'failing-step', handler)

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.failedCount).toBe(1)
      expect(result.results['failing-step'].success).toBe(false)
      expect(result.results['failing-step'].error?.message).toBe('Compensation failed')
    })

    it('should continue execution after failure by default', async () => {
      const handler1 = vi.fn().mockRejectedValue(new Error('Failed'))
      const handler2 = vi.fn().mockResolvedValue(undefined)
      const handler3 = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'step-1', handler1)
      registerCompensation(registry, 'step-2', handler2)
      registerCompensation(registry, 'step-3', handler3)

      const resultPromise = executeCompensations(registry, {
        continueOnError: true,
      })
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
      expect(handler3).toHaveBeenCalled()
      expect(result.executedCount).toBe(3)
      expect(result.failedCount).toBe(1)
    })

    it('should stop on first failure when configured', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined)
      const handler2 = vi.fn().mockRejectedValue(new Error('Failed'))
      const handler3 = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'step-1', handler1)
      registerCompensation(registry, 'step-2', handler2)
      registerCompensation(registry, 'step-3', handler3)

      const resultPromise = executeCompensations(registry, {
        stopOnError: true,
      })
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
      expect(handler3).not.toHaveBeenCalled()
      expect(result.executedCount).toBe(2)
    })

    it('should retry failed compensations', async () => {
      let attempts = 0
      const handler = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 3) throw new Error('Retry me')
        return 'success'
      })

      registerCompensation(registry, 'retry-step', handler)

      const resultPromise = executeCompensations(registry, {
        retryPolicy: { maxAttempts: 5, baseDelay: 100 },
      })
      await vi.advanceTimersByTimeAsync(10000)
      const result = await resultPromise

      expect(handler).toHaveBeenCalledTimes(3)
      expect(result.success).toBe(true)
    })
  })
})

// ============================================================================
// Rollback Order Tests
// ============================================================================

describe('Rollback Order', () => {
  let registry: CompensationRegistry
  let executionOrder: string[]

  beforeEach(() => {
    vi.useFakeTimers()
    registry = createCompensationRegistry()
    executionOrder = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('reverse order execution (default)', () => {
    it('should execute compensations in reverse registration order', async () => {
      registerCompensation(registry, 'step-1', async () => {
        executionOrder.push('step-1')
      })
      registerCompensation(registry, 'step-2', async () => {
        executionOrder.push('step-2')
      })
      registerCompensation(registry, 'step-3', async () => {
        executionOrder.push('step-3')
      })

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(executionOrder).toEqual(['step-3', 'step-2', 'step-1'])
    })

    it('should maintain LIFO order for saga pattern', async () => {
      // Simulate a typical saga: reserve -> charge -> ship
      registerCompensation(registry, 'reserve-inventory', async () => {
        executionOrder.push('unreserve-inventory')
      })
      registerCompensation(registry, 'charge-payment', async () => {
        executionOrder.push('refund-payment')
      })
      registerCompensation(registry, 'create-shipment', async () => {
        executionOrder.push('cancel-shipment')
      })

      await executeCompensations(registry)

      // Should rollback in reverse: cancel-shipment -> refund -> unreserve
      expect(executionOrder).toEqual([
        'cancel-shipment',
        'refund-payment',
        'unreserve-inventory',
      ])
    })
  })

  describe('custom order execution', () => {
    it('should execute in forward order when specified', async () => {
      registerCompensation(registry, 'step-1', async () => {
        executionOrder.push('step-1')
      })
      registerCompensation(registry, 'step-2', async () => {
        executionOrder.push('step-2')
      })
      registerCompensation(registry, 'step-3', async () => {
        executionOrder.push('step-3')
      })

      const resultPromise = executeCompensations(registry, {
        order: 'forward',
      })
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(executionOrder).toEqual(['step-1', 'step-2', 'step-3'])
    })

    it('should execute in explicit custom order', async () => {
      registerCompensation(registry, 'step-a', async () => {
        executionOrder.push('step-a')
      })
      registerCompensation(registry, 'step-b', async () => {
        executionOrder.push('step-b')
      })
      registerCompensation(registry, 'step-c', async () => {
        executionOrder.push('step-c')
      })

      const resultPromise = executeCompensations(registry, {
        order: ['step-b', 'step-c', 'step-a'],
      })
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(executionOrder).toEqual(['step-b', 'step-c', 'step-a'])
    })

    it('should execute steps with dependencies in correct order', async () => {
      registerCompensation(registry, 'step-1', async () => {
        executionOrder.push('step-1')
      }, { dependencies: [] })

      registerCompensation(registry, 'step-2', async () => {
        executionOrder.push('step-2')
      }, { dependencies: ['step-1'] })

      registerCompensation(registry, 'step-3', async () => {
        executionOrder.push('step-3')
      }, { dependencies: ['step-2'] })

      const resultPromise = executeCompensations(registry, {
        order: 'dependency-aware',
      })
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      // Step-3 depends on step-2, which depends on step-1
      // So compensation should be: step-1 first (nothing depends on it for compensation)
      // Actually in reverse compensation, step-3's compensation runs first
      expect(executionOrder[0]).toBe('step-3')
    })
  })

  describe('parallel compensation execution', () => {
    it('should execute independent compensations in parallel', async () => {
      const startTimes: Record<string, number> = {}

      registerCompensation(registry, 'step-1', async () => {
        startTimes['step-1'] = Date.now()
        await new Promise((resolve) => setTimeout(resolve, 100))
        executionOrder.push('step-1')
      })
      registerCompensation(registry, 'step-2', async () => {
        startTimes['step-2'] = Date.now()
        await new Promise((resolve) => setTimeout(resolve, 100))
        executionOrder.push('step-2')
      })
      registerCompensation(registry, 'step-3', async () => {
        startTimes['step-3'] = Date.now()
        await new Promise((resolve) => setTimeout(resolve, 100))
        executionOrder.push('step-3')
      })

      const resultPromise = executeCompensations(registry, {
        parallel: true,
      })
      await vi.advanceTimersByTimeAsync(200)
      await resultPromise

      // All should start at roughly the same time
      const times = Object.values(startTimes)
      const maxDiff = Math.max(...times) - Math.min(...times)
      expect(maxDiff).toBeLessThan(50) // Started within 50ms of each other
    })

    it('should limit parallel compensation concurrency', async () => {
      let concurrent = 0
      let maxConcurrent = 0

      for (let i = 0; i < 10; i++) {
        registerCompensation(registry, `step-${i}`, async () => {
          concurrent++
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          await new Promise((resolve) => setTimeout(resolve, 100))
          concurrent--
          executionOrder.push(`step-${i}`)
        })
      }

      const resultPromise = executeCompensations(registry, {
        parallel: true,
        maxConcurrency: 3,
      })
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(maxConcurrent).toBeLessThanOrEqual(3)
      expect(executionOrder).toHaveLength(10)
    })
  })
})

// ============================================================================
// Partial Compensation Tests
// ============================================================================

describe('Partial Compensation', () => {
  let registry: CompensationRegistry

  beforeEach(() => {
    vi.useFakeTimers()
    registry = createCompensationRegistry()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('selective compensation', () => {
    it('should execute compensation only for specified steps', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined)
      const handler2 = vi.fn().mockResolvedValue(undefined)
      const handler3 = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'step-1', handler1)
      registerCompensation(registry, 'step-2', handler2)
      registerCompensation(registry, 'step-3', handler3)

      const resultPromise = executeCompensations(registry, {
        only: ['step-1', 'step-3'],
      })
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(handler1).toHaveBeenCalled()
      expect(handler2).not.toHaveBeenCalled()
      expect(handler3).toHaveBeenCalled()
    })

    it('should exclude specified steps from compensation', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined)
      const handler2 = vi.fn().mockResolvedValue(undefined)
      const handler3 = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'step-1', handler1)
      registerCompensation(registry, 'step-2', handler2)
      registerCompensation(registry, 'step-3', handler3)

      const resultPromise = executeCompensations(registry, {
        exclude: ['step-2'],
      })
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(handler1).toHaveBeenCalled()
      expect(handler2).not.toHaveBeenCalled()
      expect(handler3).toHaveBeenCalled()
    })
  })

  describe('compensation from failure point', () => {
    it('should compensate only steps executed before failure', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined)
      const handler2 = vi.fn().mockResolvedValue(undefined)
      const handler3 = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'step-1', handler1)
      registerCompensation(registry, 'step-2', handler2)
      registerCompensation(registry, 'step-3', handler3)

      // Simulate failure at step-2, so only step-1 should be compensated
      const resultPromise = executeCompensations(registry, {
        fromStep: 'step-2', // compensate steps before this (exclusive)
      })
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(handler1).toHaveBeenCalled()
      expect(handler2).not.toHaveBeenCalled()
      expect(handler3).not.toHaveBeenCalled()
    })

    it('should compensate up to and including failure step when configured', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined)
      const handler2 = vi.fn().mockResolvedValue(undefined)
      const handler3 = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'step-1', handler1)
      registerCompensation(registry, 'step-2', handler2)
      registerCompensation(registry, 'step-3', handler3)

      const resultPromise = executeCompensations(registry, {
        fromStep: 'step-2',
        includeFromStep: true,
      })
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
      expect(handler3).not.toHaveBeenCalled()
    })
  })

  describe('conditional compensation', () => {
    it('should skip compensation based on condition', async () => {
      const handler = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'conditional-step', handler, {
        condition: (ctx) => ctx.stepResult?.needsCompensation === true,
        stepResult: { needsCompensation: false },
      })

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(handler).not.toHaveBeenCalled()
      expect(result.results['conditional-step'].skipped).toBe(true)
    })

    it('should execute compensation when condition is met', async () => {
      const handler = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'conditional-step', handler, {
        condition: (ctx) => ctx.stepResult?.needsCompensation === true,
        stepResult: { needsCompensation: true },
      })

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(handler).toHaveBeenCalled()
    })

    it('should support async conditions', async () => {
      const handler = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'async-condition-step', handler, {
        condition: async (ctx) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return ctx.stepResult?.shouldRollback === true
        },
        stepResult: { shouldRollback: true },
      })

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(handler).toHaveBeenCalled()
    })
  })
})

// ============================================================================
// Compensation Scope Tests
// ============================================================================

describe('Compensation Scope', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('CompensationScope', () => {
    it('should create nested scopes', async () => {
      const scope = new CompensationScope('root')

      const childScope1 = scope.createChild('child-1')
      const childScope2 = scope.createChild('child-2')

      expect(scope.getChildren()).toContain(childScope1)
      expect(scope.getChildren()).toContain(childScope2)
    })

    it('should register compensation in scope', async () => {
      const scope = new CompensationScope('test-scope')
      const handler = vi.fn()

      scope.register('step-1', handler)

      expect(scope.has('step-1')).toBe(true)
    })

    it('should execute compensations in scope', async () => {
      const scope = new CompensationScope('test-scope')
      const handler = vi.fn().mockResolvedValue(undefined)

      scope.register('step-1', handler)

      const resultPromise = scope.compensate()
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(handler).toHaveBeenCalled()
    })

    it('should compensate child scopes before parent', async () => {
      const executionOrder: string[] = []
      const scope = new CompensationScope('parent')

      scope.register('parent-step', async () => {
        executionOrder.push('parent-step')
      })

      const childScope = scope.createChild('child')
      childScope.register('child-step', async () => {
        executionOrder.push('child-step')
      })

      const resultPromise = scope.compensate()
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(executionOrder).toEqual(['child-step', 'parent-step'])
    })

    it('should handle deeply nested scopes', async () => {
      const executionOrder: string[] = []
      const rootScope = new CompensationScope('root')

      rootScope.register('root-step', async () => {
        executionOrder.push('root-step')
      })

      const level1 = rootScope.createChild('level1')
      level1.register('level1-step', async () => {
        executionOrder.push('level1-step')
      })

      const level2 = level1.createChild('level2')
      level2.register('level2-step', async () => {
        executionOrder.push('level2-step')
      })

      const resultPromise = rootScope.compensate()
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(executionOrder).toEqual(['level2-step', 'level1-step', 'root-step'])
    })
  })
})

// ============================================================================
// Compensation Policy Tests
// ============================================================================

describe('Compensation Policy', () => {
  let registry: CompensationRegistry

  beforeEach(() => {
    vi.useFakeTimers()
    registry = createCompensationRegistry()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('CompensationPolicy', () => {
    it('should apply default policy', async () => {
      const policy: CompensationPolicy = {
        retryPolicy: { maxAttempts: 3, baseDelay: 1000 },
        timeout: 30000,
        continueOnError: true,
      }

      let attempts = 0
      const handler = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 3) throw new Error('Retry')
        return 'success'
      })

      registerCompensation(registry, 'step-1', handler)

      const resultPromise = executeCompensations(registry, { policy })
      await vi.advanceTimersByTimeAsync(30000)
      const result = await resultPromise

      expect(result.success).toBe(true)
    })

    it('should timeout compensation execution', async () => {
      const handler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60000))
      })

      registerCompensation(registry, 'slow-step', handler)

      const resultPromise = executeCompensations(registry, {
        policy: { timeout: 5000 },
      })
      await vi.advanceTimersByTimeAsync(10000)
      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.results['slow-step'].error?.message).toMatch(/timeout/i)
    })

    it('should apply per-step policy override', async () => {
      let step1Attempts = 0
      let step2Attempts = 0

      const handler1 = vi.fn().mockImplementation(async () => {
        step1Attempts++
        if (step1Attempts < 2) throw new Error('Retry')
      })
      const handler2 = vi.fn().mockImplementation(async () => {
        step2Attempts++
        if (step2Attempts < 5) throw new Error('Retry')
      })

      registerCompensation(registry, 'step-1', handler1, {
        policy: { retryPolicy: { maxAttempts: 3 } },
      })
      registerCompensation(registry, 'step-2', handler2, {
        policy: { retryPolicy: { maxAttempts: 2 } },
      })

      const resultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(30000)
      const result = await resultPromise

      expect(result.results['step-1'].success).toBe(true)
      expect(result.results['step-2'].success).toBe(false) // Only 2 attempts allowed
    })
  })

  describe('CompensationStrategy', () => {
    it('should support fail-fast strategy', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined)
      const handler2 = vi.fn().mockRejectedValue(new Error('Failed'))
      const handler3 = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'step-1', handler1)
      registerCompensation(registry, 'step-2', handler2)
      registerCompensation(registry, 'step-3', handler3)

      const resultPromise = executeCompensations(registry, {
        strategy: CompensationStrategy.FailFast,
      })
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(handler3).not.toHaveBeenCalled()
    })

    it('should support best-effort strategy', async () => {
      const handler1 = vi.fn().mockRejectedValue(new Error('Failed 1'))
      const handler2 = vi.fn().mockRejectedValue(new Error('Failed 2'))
      const handler3 = vi.fn().mockResolvedValue(undefined)

      registerCompensation(registry, 'step-1', handler1)
      registerCompensation(registry, 'step-2', handler2)
      registerCompensation(registry, 'step-3', handler3)

      const resultPromise = executeCompensations(registry, {
        strategy: CompensationStrategy.BestEffort,
      })
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
      expect(handler3).toHaveBeenCalled()
      expect(result.successCount).toBe(1)
      expect(result.failedCount).toBe(2)
    })

    it('should support all-or-nothing strategy with rollback', async () => {
      // This strategy attempts to undo partial compensations if any fail
      const undoHandler = vi.fn().mockResolvedValue(undefined)
      const handler1 = vi.fn().mockResolvedValue({ compensated: true })
      const handler2 = vi.fn().mockRejectedValue(new Error('Failed'))

      registerCompensation(registry, 'step-1', handler1, {
        undoCompensation: undoHandler,
      })
      registerCompensation(registry, 'step-2', handler2)

      const resultPromise = executeCompensations(registry, {
        strategy: CompensationStrategy.AllOrNothing,
      })
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      // Since step-2 failed, step-1's compensation should be undone
      expect(undoHandler).toHaveBeenCalled()
    })
  })
})

// ============================================================================
// withCompensation Helper Tests
// ============================================================================

describe('withCompensation Helper', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('withCompensation', () => {
    it('should wrap step execution with automatic compensation registration', async () => {
      const registry = createCompensationRegistry()
      const step = vi.fn().mockResolvedValue({ orderId: '123' })
      const compensation = vi.fn().mockResolvedValue(undefined)

      const resultPromise = withCompensation(
        registry,
        'create-order',
        step,
        compensation
      )
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(result).toEqual({ orderId: '123' })
      expect(registry.has('create-order')).toBe(true)
    })

    it('should pass step result to compensation', async () => {
      const registry = createCompensationRegistry()
      const step = vi.fn().mockResolvedValue({ orderId: '123', amount: 100 })
      const compensation = vi.fn().mockResolvedValue(undefined)

      await withCompensation(registry, 'charge', step, compensation)
      await executeCompensations(registry)

      expect(compensation).toHaveBeenCalledWith(
        expect.objectContaining({
          stepResult: { orderId: '123', amount: 100 },
        })
      )
    })

    it('should not register compensation if step fails', async () => {
      const registry = createCompensationRegistry()
      const step = vi.fn().mockRejectedValue(new Error('Step failed'))
      const compensation = vi.fn()

      const resultPromise = withCompensation(
        registry,
        'failing-step',
        step,
        compensation
      ).catch((e) => e)
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(registry.has('failing-step')).toBe(false)
    })

    it('should support compensation options', async () => {
      const registry = createCompensationRegistry()
      const step = vi.fn().mockResolvedValue('result')
      const compensation = vi.fn()

      await withCompensation(registry, 'step', step, compensation, {
        metadata: { important: true },
      })

      const entry = registry.get('step')
      expect(entry?.metadata?.important).toBe(true)
    })
  })

  describe('createCompensableStep', () => {
    it('should create a reusable compensable step', async () => {
      const compensableStep = createCompensableStep({
        name: 'reserve-inventory',
        execute: async (input: { sku: string; quantity: number }) => {
          return { reservationId: 'res-123', ...input }
        },
        compensate: async (ctx) => {
          // Cancel reservation
          return { cancelled: ctx.stepResult.reservationId }
        },
      })

      const registry = createCompensationRegistry()
      const resultPromise = compensableStep.run(registry, { sku: 'ITEM-1', quantity: 5 })
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(result.reservationId).toBe('res-123')
      expect(registry.has('reserve-inventory')).toBe(true)

      // Execute compensation
      const compResultPromise = executeCompensations(registry)
      await vi.advanceTimersByTimeAsync(1000)
      const compResult = await compResultPromise

      expect(compResult.results['reserve-inventory'].result).toEqual({
        cancelled: 'res-123',
      })
    })
  })
})

// ============================================================================
// CompensationError Tests
// ============================================================================

describe('CompensationError', () => {
  it('should be instanceof Error', () => {
    const error = new CompensationError('step-1', 'Compensation failed')
    expect(error instanceof Error).toBe(true)
    expect(error instanceof CompensationError).toBe(true)
  })

  it('should include step name', () => {
    const error = new CompensationError('charge-payment', 'Refund failed')
    expect(error.stepName).toBe('charge-payment')
  })

  it('should include original error', () => {
    const originalError = new Error('Network timeout')
    const error = new CompensationError('api-call', 'Compensation failed', {
      cause: originalError,
    })

    expect(error.cause).toBe(originalError)
  })

  it('should aggregate multiple compensation errors', () => {
    const errors = [
      new CompensationError('step-1', 'Failed 1'),
      new CompensationError('step-2', 'Failed 2'),
    ]

    const aggregateError = CompensationError.aggregate(errors)

    expect(aggregateError.message).toContain('Multiple compensation failures')
    expect(aggregateError.errors).toHaveLength(2)
  })
})
