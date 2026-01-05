/**
 * Workflow Core Tests - Layer 10
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseDuration,
  generateId,
  defineWorkflow,
  StepExecutor,
  WorkflowWaitingError,
} from '../../src/workflow/workflow'
import type { WorkflowExecution } from '../../src/workflow/types'

// ============================================================================
// parseDuration Tests
// ============================================================================

describe('parseDuration', () => {
  it('should return number as-is', () => {
    expect(parseDuration(5000)).toBe(5000)
    expect(parseDuration(0)).toBe(0)
    expect(parseDuration(100)).toBe(100)
  })

  it('should parse milliseconds', () => {
    expect(parseDuration('100ms')).toBe(100)
    expect(parseDuration('500ms')).toBe(500)
    expect(parseDuration('1000ms')).toBe(1000)
  })

  it('should parse seconds', () => {
    expect(parseDuration('1s')).toBe(1000)
    expect(parseDuration('5s')).toBe(5000)
    expect(parseDuration('30s')).toBe(30000)
  })

  it('should parse minutes', () => {
    expect(parseDuration('1m')).toBe(60000)
    expect(parseDuration('5m')).toBe(300000)
    expect(parseDuration('30m')).toBe(1800000)
  })

  it('should parse hours', () => {
    expect(parseDuration('1h')).toBe(3600000)
    expect(parseDuration('2h')).toBe(7200000)
    expect(parseDuration('24h')).toBe(86400000)
  })

  it('should parse days', () => {
    expect(parseDuration('1d')).toBe(86400000)
    expect(parseDuration('7d')).toBe(604800000)
  })

  it('should throw for invalid format', () => {
    expect(() => parseDuration('invalid')).toThrow('Invalid duration format')
    expect(() => parseDuration('5x')).toThrow('Invalid duration format')
    expect(() => parseDuration('')).toThrow('Invalid duration format')
    expect(() => parseDuration('s')).toThrow('Invalid duration format')
  })
})

// ============================================================================
// generateId Tests
// ============================================================================

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateId())
    }
    expect(ids.size).toBe(100)
  })

  it('should generate IDs with wf_ prefix', () => {
    const id = generateId()
    expect(id.startsWith('wf_')).toBe(true)
  })

  it('should include timestamp in ID', () => {
    const before = Date.now()
    const id = generateId()
    const after = Date.now()

    const parts = id.split('_')
    const timestamp = parseInt(parts[1], 10)

    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
  })
})

// ============================================================================
// defineWorkflow Tests
// ============================================================================

describe('defineWorkflow', () => {
  it('should create a registered workflow', () => {
    const handler = vi.fn()
    const workflow = defineWorkflow({
      name: 'test-workflow',
      handler,
    })

    expect(workflow._type).toBe('workflow')
    expect(workflow._name).toBe('test-workflow')
    expect(workflow._handler).toBe(handler)
    expect(workflow._config).toEqual({})
  })

  it('should accept config options', () => {
    const workflow = defineWorkflow({
      name: 'test-workflow',
      handler: vi.fn(),
      config: {
        maxRetries: 5,
        timeout: '2h',
        persist: true,
      },
    })

    expect(workflow._config.maxRetries).toBe(5)
    expect(workflow._config.timeout).toBe('2h')
    expect(workflow._config.persist).toBe(true)
  })

  it('should be type-safe with generics', () => {
    interface OrderArgs {
      orderId: string
      items: string[]
    }

    interface OrderResult {
      processed: boolean
      total: number
    }

    const workflow = defineWorkflow<OrderArgs, OrderResult>({
      name: 'process-order',
      handler: async (ctx, args) => {
        return { processed: true, total: args.items.length * 10 }
      },
    })

    expect(workflow._name).toBe('process-order')
  })
})

// ============================================================================
// WorkflowWaitingError Tests
// ============================================================================

describe('WorkflowWaitingError', () => {
  it('should create error for event waiting', () => {
    const error = new WorkflowWaitingError('wait-for-approval', 'event')

    expect(error.name).toBe('WorkflowWaitingError')
    expect(error.stepName).toBe('wait-for-approval')
    expect(error.waitType).toBe('event')
    expect(error.message).toContain('event')
    expect(error.message).toContain('wait-for-approval')
  })

  it('should create error for sleep waiting', () => {
    const error = new WorkflowWaitingError('delay-step', 'sleep')

    expect(error.name).toBe('WorkflowWaitingError')
    expect(error.stepName).toBe('delay-step')
    expect(error.waitType).toBe('sleep')
    expect(error.message).toContain('sleep')
  })

  it('should be instanceof Error', () => {
    const error = new WorkflowWaitingError('test', 'event')
    expect(error instanceof Error).toBe(true)
    expect(error instanceof WorkflowWaitingError).toBe(true)
  })
})

// ============================================================================
// StepExecutor Tests
// ============================================================================

describe('StepExecutor', () => {
  let execution: WorkflowExecution
  let mockRunQuery: ReturnType<typeof vi.fn>
  let mockRunMutation: ReturnType<typeof vi.fn>
  let mockRunAction: ReturnType<typeof vi.fn>
  let mockSaveExecution: ReturnType<typeof vi.fn>
  let executor: StepExecutor

  beforeEach(() => {
    vi.useFakeTimers()

    execution = {
      id: 'wf_test_123',
      name: 'test-workflow',
      status: 'running',
      args: {},
      steps: [],
      startTime: Date.now(),
      retryCount: 0,
      maxRetries: 3,
    }

    mockRunQuery = vi.fn()
    mockRunMutation = vi.fn()
    mockRunAction = vi.fn()
    mockSaveExecution = vi.fn().mockResolvedValue(undefined)

    executor = new StepExecutor(execution, {
      runQuery: mockRunQuery,
      runMutation: mockRunMutation,
      runAction: mockRunAction,
      saveExecution: mockSaveExecution,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --------------------------------------------------------------------------
  // run() Tests
  // --------------------------------------------------------------------------

  describe('run', () => {
    it('should execute a function step', async () => {
      const result = await executor.run('compute', () => 42)

      expect(result).toBe(42)
      expect(execution.steps).toHaveLength(1)
      expect(execution.steps[0].name).toBe('compute')
      expect(execution.steps[0].status).toBe('completed')
      expect(execution.steps[0].output).toBe(42)
    })

    it('should execute an async function step', async () => {
      const result = await executor.run('async-compute', async () => {
        return 'async result'
      })

      expect(result).toBe('async result')
      expect(execution.steps[0].status).toBe('completed')
    })

    it('should return cached result for completed step', async () => {
      // Pre-populate with completed step
      execution.steps.push({
        name: 'cached-step',
        status: 'completed',
        output: 'cached value',
        startTime: Date.now(),
        retryCount: 0,
      })

      const fn = vi.fn().mockReturnValue('new value')
      const result = await executor.run('cached-step', fn)

      expect(result).toBe('cached value')
      expect(fn).not.toHaveBeenCalled()
    })

    it('should save execution after step starts and completes', async () => {
      await executor.run('test-step', () => 'result')

      // Should be called at start (running) and end (completed)
      expect(mockSaveExecution).toHaveBeenCalledTimes(2)
    })

    it('should handle step failure', async () => {
      const error = new Error('Step failed')

      await expect(
        executor.run('failing-step', () => {
          throw error
        }, { retries: 0 })
      ).rejects.toThrow('Step failed')

      expect(execution.steps[0].status).toBe('failed')
      expect(execution.steps[0].error?.message).toBe('Step failed')
    })

    it('should retry failed steps with exponential backoff', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(() => {
        attempts++
        if (attempts < 3) throw new Error('Retry me')
        return 'success'
      })

      const resultPromise = executor.run('retry-step', fn, {
        retries: 3,
        retryDelay: 100,
        exponentialBackoff: true,
      })

      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0)

      // Second attempt after 100ms
      await vi.advanceTimersByTimeAsync(100)

      // Third attempt after 200ms (exponential)
      await vi.advanceTimersByTimeAsync(200)

      const result = await resultPromise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should respect maxRetryDelay', async () => {
      let callCount = 0

      const fn = vi.fn().mockImplementation(() => {
        callCount++
        throw new Error('Keep failing')
      })

      // Create promise and immediately set up rejection handler
      const resultPromise = executor.run('max-delay-step', fn, {
        retries: 4,
        retryDelay: 1000,
        exponentialBackoff: true,
        maxRetryDelay: 2000,
      }).catch((e) => e)

      // Advance through all retries: initial + 4 retries
      // Delays: 0, 1000, 2000, 2000, 2000 (capped at maxRetryDelay)
      await vi.advanceTimersByTimeAsync(10000)

      const error = await resultPromise
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Keep failing')
      expect(callCount).toBe(5) // Initial + 4 retries
    })
  })

  // --------------------------------------------------------------------------
  // runQueryStep() Tests
  // --------------------------------------------------------------------------

  describe('runQueryStep', () => {
    it('should execute a query step', async () => {
      mockRunQuery.mockResolvedValue({ data: 'query result' })

      const result = await executor.runQueryStep('fetch-data', 'users:get', { id: '1' })

      expect(result).toEqual({ data: 'query result' })
      expect(mockRunQuery).toHaveBeenCalledWith('users:get', { id: '1' })
      expect(execution.steps[0].status).toBe('completed')
    })

    it('should cache query results', async () => {
      execution.steps.push({
        name: 'cached-query',
        status: 'completed',
        output: { cached: true },
        startTime: Date.now(),
        retryCount: 0,
      })

      const result = await executor.runQueryStep('cached-query', 'any:query', {})

      expect(result).toEqual({ cached: true })
      expect(mockRunQuery).not.toHaveBeenCalled()
    })
  })

  // --------------------------------------------------------------------------
  // runMutationStep() Tests
  // --------------------------------------------------------------------------

  describe('runMutationStep', () => {
    it('should execute a mutation step', async () => {
      mockRunMutation.mockResolvedValue({ success: true })

      const result = await executor.runMutationStep('create-user', 'users:create', { name: 'Test' })

      expect(result).toEqual({ success: true })
      expect(mockRunMutation).toHaveBeenCalledWith('users:create', { name: 'Test' })
      expect(execution.steps[0].status).toBe('completed')
    })
  })

  // --------------------------------------------------------------------------
  // runActionStep() Tests
  // --------------------------------------------------------------------------

  describe('runActionStep', () => {
    it('should execute an action step', async () => {
      mockRunAction.mockResolvedValue({ sent: true })

      const result = await executor.runActionStep('send-email', 'email:send', { to: 'test@example.com' })

      expect(result).toEqual({ sent: true })
      expect(mockRunAction).toHaveBeenCalledWith('email:send', { to: 'test@example.com' })
      expect(execution.steps[0].status).toBe('completed')
    })
  })

  // --------------------------------------------------------------------------
  // sleep() Tests
  // --------------------------------------------------------------------------

  describe('sleep', () => {
    it('should sleep for specified duration in ms', async () => {
      const sleepPromise = executor.sleep('delay', 1000)

      expect(execution.steps[0].status).toBe('running')
      expect(execution.steps[0].input).toEqual({ duration: 1000 })

      await vi.advanceTimersByTimeAsync(1000)
      await sleepPromise

      expect(execution.steps[0].status).toBe('completed')
    })

    it('should parse duration string', async () => {
      const sleepPromise = executor.sleep('delay', '2s')

      expect(execution.steps[0].input).toEqual({ duration: 2000 })

      await vi.advanceTimersByTimeAsync(2000)
      await sleepPromise

      expect(execution.steps[0].status).toBe('completed')
    })

    it('should skip sleep if already completed', async () => {
      execution.steps.push({
        name: 'cached-sleep',
        status: 'completed',
        startTime: Date.now(),
        endTime: Date.now(),
        retryCount: 0,
      })

      const start = Date.now()
      await executor.sleep('cached-sleep', 10000)
      const elapsed = Date.now() - start

      // Should return immediately without waiting
      expect(elapsed).toBeLessThan(100)
    })
  })

  // --------------------------------------------------------------------------
  // waitForEvent() Tests
  // --------------------------------------------------------------------------

  describe('waitForEvent', () => {
    it('should throw WorkflowWaitingError', async () => {
      await expect(
        executor.waitForEvent('wait-approval')
      ).rejects.toThrow(WorkflowWaitingError)
    })

    it('should record step as running', async () => {
      try {
        await executor.waitForEvent('wait-event', { timeout: 5000 })
      } catch (e) {
        // Expected
      }

      expect(execution.steps[0].status).toBe('running')
      expect(execution.steps[0].input).toEqual({ timeout: 5000 })
    })

    it('should return cached result if completed', async () => {
      execution.steps.push({
        name: 'cached-event',
        status: 'completed',
        output: { type: 'approved', payload: { by: 'admin' } },
        startTime: Date.now(),
        retryCount: 0,
      })

      const result = await executor.waitForEvent('cached-event')

      expect(result).toEqual({ type: 'approved', payload: { by: 'admin' } })
    })
  })

  // --------------------------------------------------------------------------
  // parallel() Tests
  // --------------------------------------------------------------------------

  describe('parallel', () => {
    it('should execute steps in parallel', async () => {
      const step1 = vi.fn().mockResolvedValue('result1')
      const step2 = vi.fn().mockResolvedValue('result2')
      const step3 = vi.fn().mockResolvedValue('result3')

      const results = await executor.parallel('parallel-tasks', [step1, step2, step3])

      expect(results).toEqual(['result1', 'result2', 'result3'])
      expect(step1).toHaveBeenCalled()
      expect(step2).toHaveBeenCalled()
      expect(step3).toHaveBeenCalled()
      expect(execution.steps[0].status).toBe('completed')
    })

    it('should cache parallel results', async () => {
      execution.steps.push({
        name: 'cached-parallel',
        status: 'completed',
        output: ['cached1', 'cached2'],
        startTime: Date.now(),
        retryCount: 0,
      })

      const step1 = vi.fn()
      const step2 = vi.fn()

      const results = await executor.parallel('cached-parallel', [step1, step2])

      expect(results).toEqual(['cached1', 'cached2'])
      expect(step1).not.toHaveBeenCalled()
      expect(step2).not.toHaveBeenCalled()
    })

    it('should fail if any step fails', async () => {
      const step1 = vi.fn().mockResolvedValue('result1')
      const step2 = vi.fn().mockRejectedValue(new Error('Step 2 failed'))

      await expect(
        executor.parallel('failing-parallel', [step1, step2])
      ).rejects.toThrow('Step 2 failed')

      expect(execution.steps[0].status).toBe('failed')
      expect(execution.steps[0].error?.message).toBe('Step 2 failed')
    })
  })
})
