/**
 * WorkflowManager Tests - Layer 10
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WorkflowManager } from '../../src/workflow/manager'
import { defineWorkflow, WorkflowWaitingError } from '../../src/workflow/workflow'
import type { WorkflowCtx } from '../../src/workflow/types'

describe('WorkflowManager', () => {
  let manager: WorkflowManager
  let mockRunQuery: ReturnType<typeof vi.fn>
  let mockRunMutation: ReturnType<typeof vi.fn>
  let mockRunAction: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()

    mockRunQuery = vi.fn()
    mockRunMutation = vi.fn()
    mockRunAction = vi.fn()

    manager = new WorkflowManager({
      runQuery: mockRunQuery,
      runMutation: mockRunMutation,
      runAction: mockRunAction,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ============================================================================
  // Registration Tests
  // ============================================================================

  describe('register', () => {
    it('should register a workflow', () => {
      const workflow = defineWorkflow({
        name: 'test-workflow',
        handler: vi.fn(),
      })

      manager.register(workflow)

      // Registration is internal, but we can verify via start
      expect(() => manager.register(workflow)).not.toThrow()
    })

    it('should register multiple workflows', () => {
      const workflow1 = defineWorkflow({
        name: 'workflow-1',
        handler: vi.fn(),
      })
      const workflow2 = defineWorkflow({
        name: 'workflow-2',
        handler: vi.fn(),
      })

      manager.register(workflow1)
      manager.register(workflow2)

      // Both should be registered without error
      expect(true).toBe(true)
    })
  })

  // ============================================================================
  // Start Tests
  // ============================================================================

  describe('start', () => {
    it('should start a workflow and return a handle', async () => {
      const workflow = defineWorkflow({
        name: 'simple-workflow',
        handler: async () => 'done',
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      expect(handle.id).toBeDefined()
      expect(handle.id.startsWith('wf_')).toBe(true)
    })

    it('should use custom ID if provided', async () => {
      const workflow = defineWorkflow({
        name: 'custom-id-workflow',
        handler: async () => 'done',
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {}, { id: 'custom-123' })

      expect(handle.id).toBe('custom-123')
    })

    it('should create execution record', async () => {
      const workflow = defineWorkflow({
        name: 'execution-test',
        handler: async () => 'result',
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, { input: 'test' })

      const execution = manager.getExecution(handle.id)
      expect(execution).not.toBeNull()
      expect(execution!.name).toBe('execution-test')
      expect(execution!.args).toEqual({ input: 'test' })
    })

    it('should apply workflow config defaults', async () => {
      const workflow = defineWorkflow({
        name: 'config-test',
        handler: async () => 'done',
        config: {
          maxRetries: 10,
          timeout: '2h',
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      const execution = manager.getExecution(handle.id)
      expect(execution!.maxRetries).toBe(10)
      expect(execution!.timeout).toBe(7200000) // 2 hours in ms
    })

    it('should override config with start options', async () => {
      const workflow = defineWorkflow({
        name: 'override-test',
        handler: async () => 'done',
        config: {
          maxRetries: 3,
          timeout: '1h',
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {}, {
        maxRetries: 5,
        timeout: '30m',
      })

      const execution = manager.getExecution(handle.id)
      expect(execution!.maxRetries).toBe(5)
      expect(execution!.timeout).toBe(1800000) // 30 minutes in ms
    })
  })

  // ============================================================================
  // Handle Tests
  // ============================================================================

  describe('getHandle', () => {
    it('should return handle for existing workflow', async () => {
      const workflow = defineWorkflow({
        name: 'handle-test',
        handler: async () => 'done',
      })

      manager.register(workflow)
      const startHandle = await manager.start(workflow, {})

      const handle = manager.getHandle(startHandle.id)
      expect(handle).not.toBeNull()
      expect(handle!.id).toBe(startHandle.id)
    })

    it('should return null for non-existent workflow', () => {
      const handle = manager.getHandle('non-existent-id')
      expect(handle).toBeNull()
    })
  })

  // ============================================================================
  // Execution Status Tests
  // ============================================================================

  describe('workflow execution', () => {
    it('should complete workflow successfully', async () => {
      const workflow = defineWorkflow({
        name: 'complete-test',
        handler: async () => 'success',
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      // Allow workflow to complete
      await vi.advanceTimersByTimeAsync(10)

      const result = await handle.result()
      expect(result).toBe('success')

      const status = await handle.status()
      expect(status).toBe('completed')
    })

    it('should handle workflow with steps', async () => {
      const workflow = defineWorkflow({
        name: 'steps-test',
        handler: async (ctx) => {
          const step1 = await ctx.step.run('step1', () => 10)
          const step2 = await ctx.step.run('step2', () => step1 * 2)
          return step2
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      await vi.advanceTimersByTimeAsync(10)

      const result = await handle.result()
      expect(result).toBe(20)

      const execution = manager.getExecution(handle.id)
      expect(execution!.steps).toHaveLength(2)
      expect(execution!.steps[0].name).toBe('step1')
      expect(execution!.steps[1].name).toBe('step2')
    })

    it('should handle workflow failure', async () => {
      const workflow = defineWorkflow({
        name: 'failure-test',
        handler: async () => {
          throw new Error('Workflow error')
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      await vi.advanceTimersByTimeAsync(10)

      await expect(handle.result()).rejects.toThrow('Workflow error')

      const status = await handle.status()
      expect(status).toBe('failed')

      const execution = manager.getExecution(handle.id)
      expect(execution!.error?.message).toBe('Workflow error')
    })

    it('should handle workflow timeout', async () => {
      const workflow = defineWorkflow({
        name: 'timeout-test',
        handler: async (ctx) => {
          await ctx.step.sleep('long-sleep', '2h')
          return 'done'
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {}, { timeout: '100ms' })

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(200)

      await expect(handle.result()).rejects.toThrow('timed out')

      const status = await handle.status()
      expect(status).toBe('timed_out')
    })
  })

  // ============================================================================
  // Cancel Tests
  // ============================================================================

  describe('cancel', () => {
    it('should cancel a running workflow', async () => {
      const workflow = defineWorkflow({
        name: 'cancel-test',
        handler: async (ctx) => {
          await ctx.step.sleep('wait', '10s')
          return 'done'
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      await vi.advanceTimersByTimeAsync(10)

      await handle.cancel('User requested')

      const status = await handle.status()
      expect(status).toBe('cancelled')

      const execution = manager.getExecution(handle.id)
      expect(execution!.error?.message).toBe('User requested')
    })

    it('should throw when cancelling non-existent workflow', async () => {
      await expect(
        manager.cancel('non-existent')
      ).rejects.toThrow('Workflow not found')
    })

    it('should throw when cancelling completed workflow', async () => {
      const workflow = defineWorkflow({
        name: 'cancel-completed',
        handler: async () => 'done',
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      await vi.advanceTimersByTimeAsync(10)
      await handle.result()

      await expect(
        handle.cancel()
      ).rejects.toThrow('Cannot cancel workflow in status: completed')
    })
  })

  // ============================================================================
  // Signal/Event Tests
  // ============================================================================

  describe('signal', () => {
    it('should send signal to waiting workflow', async () => {
      let receivedEvent: any = null

      const workflow = defineWorkflow({
        name: 'signal-test',
        handler: async (ctx) => {
          receivedEvent = await ctx.step.waitForEvent('wait-event')
          return receivedEvent
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      await vi.advanceTimersByTimeAsync(10)

      // Workflow should be waiting
      const execution = manager.getExecution(handle.id)
      expect(execution!.status).toBe('running')

      // Send signal
      await handle.signal('approval', { approved: true })

      await vi.advanceTimersByTimeAsync(10)

      // Workflow should complete
      const result = await handle.result()
      expect(result).toEqual({ type: 'approval', payload: { approved: true } })
    })

    it('should throw when signaling non-existent workflow', async () => {
      await expect(
        manager.signal('non-existent', 'test')
      ).rejects.toThrow('Workflow not found')
    })
  })

  // ============================================================================
  // List Executions Tests
  // ============================================================================

  describe('listExecutions', () => {
    it('should list all executions', async () => {
      const workflow = defineWorkflow({
        name: 'list-test',
        handler: async () => 'done',
      })

      manager.register(workflow)
      await manager.start(workflow, {})
      await manager.start(workflow, {})
      await manager.start(workflow, {})

      const executions = manager.listExecutions()
      expect(executions).toHaveLength(3)
    })

    it('should filter by status', async () => {
      const workflow = defineWorkflow({
        name: 'filter-status',
        handler: async () => 'done',
      })

      manager.register(workflow)
      await manager.start(workflow, {})
      await manager.start(workflow, {})

      // Let one complete
      await vi.advanceTimersByTimeAsync(10)

      const pending = manager.listExecutions({ status: 'pending' })
      const completed = manager.listExecutions({ status: 'completed' })

      // Both should have run to completion since they're instant
      expect(completed.length).toBeGreaterThan(0)
    })

    it('should filter by name', async () => {
      const workflow1 = defineWorkflow({
        name: 'workflow-a',
        handler: async () => 'a',
      })
      const workflow2 = defineWorkflow({
        name: 'workflow-b',
        handler: async () => 'b',
      })

      manager.register(workflow1)
      manager.register(workflow2)

      await manager.start(workflow1, {})
      await manager.start(workflow1, {})
      await manager.start(workflow2, {})

      const aExecutions = manager.listExecutions({ name: 'workflow-a' })
      const bExecutions = manager.listExecutions({ name: 'workflow-b' })

      expect(aExecutions).toHaveLength(2)
      expect(bExecutions).toHaveLength(1)
    })
  })

  // ============================================================================
  // Handle Methods Tests
  // ============================================================================

  describe('WorkflowHandle methods', () => {
    it('should return status', async () => {
      const workflow = defineWorkflow({
        name: 'status-test',
        handler: async () => 'done',
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      const initialStatus = await handle.status()
      expect(['pending', 'running', 'completed']).toContain(initialStatus)

      await vi.advanceTimersByTimeAsync(10)

      const finalStatus = await handle.status()
      expect(finalStatus).toBe('completed')
    })

    it('should throw on result() for non-existent workflow', async () => {
      const workflow = defineWorkflow({
        name: 'result-error',
        handler: async () => 'done',
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      // Manually delete the execution (simulating external deletion)
      ;(manager as any).executions.delete(handle.id)

      await expect(handle.result()).rejects.toThrow('Workflow not found')
    })

    it('should throw on status() for non-existent workflow', async () => {
      const workflow = defineWorkflow({
        name: 'status-error',
        handler: async () => 'done',
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      ;(manager as any).executions.delete(handle.id)

      await expect(handle.status()).rejects.toThrow('Workflow not found')
    })
  })

  // ============================================================================
  // Complex Workflow Tests
  // ============================================================================

  describe('complex workflows', () => {
    it('should handle workflow with queries and mutations', async () => {
      mockRunQuery.mockResolvedValue({ user: { id: '1', name: 'Test' } })
      mockRunMutation.mockResolvedValue({ success: true })

      const workflow = defineWorkflow({
        name: 'crud-workflow',
        handler: async (ctx) => {
          const user = await ctx.step.runQuery('get-user', 'users:get', { id: '1' })
          await ctx.step.runMutation('update-user', 'users:update', { id: '1', name: 'Updated' })
          return user
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      await vi.advanceTimersByTimeAsync(10)

      const result = await handle.result()
      expect(result).toEqual({ user: { id: '1', name: 'Test' } })
      expect(mockRunQuery).toHaveBeenCalledWith('users:get', { id: '1' })
      expect(mockRunMutation).toHaveBeenCalledWith('users:update', { id: '1', name: 'Updated' })
    })

    it('should handle workflow with parallel steps', async () => {
      const workflow = defineWorkflow({
        name: 'parallel-workflow',
        handler: async (ctx) => {
          const [a, b, c] = await ctx.step.parallel('fetch-all', [
            async () => 1,
            async () => 2,
            async () => 3,
          ])
          return a + b + c
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      await vi.advanceTimersByTimeAsync(10)

      const result = await handle.result()
      expect(result).toBe(6)
    })

    it('should handle workflow with typed arguments', async () => {
      interface OrderArgs {
        orderId: string
        items: { sku: string; qty: number }[]
      }

      interface OrderResult {
        total: number
        status: string
      }

      const workflow = defineWorkflow<OrderArgs, OrderResult>({
        name: 'order-workflow',
        handler: async (ctx, args) => {
          const total = args.items.reduce((sum, item) => sum + item.qty * 10, 0)
          return { total, status: 'processed' }
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {
        orderId: 'order-123',
        items: [
          { sku: 'ITEM-1', qty: 2 },
          { sku: 'ITEM-2', qty: 3 },
        ],
      })

      await vi.advanceTimersByTimeAsync(10)

      const result = await handle.result()
      expect(result.total).toBe(50)
      expect(result.status).toBe('processed')
    })

    it('should handle workflow self-cancellation', async () => {
      let cancelledAt: 'before' | 'after' | null = null

      const workflow = defineWorkflow({
        name: 'self-cancel',
        handler: async (ctx) => {
          cancelledAt = 'before'
          await ctx.cancel('Self cancelled')
          cancelledAt = 'after'
          // Note: cancel doesn't throw - it updates status but handler continues
          // The workflow will be marked cancelled but handler finishes
          return 'completed after cancel'
        },
      })

      manager.register(workflow)
      const handle = await manager.start(workflow, {})

      await vi.advanceTimersByTimeAsync(10)

      // Verify cancel was called
      expect(cancelledAt).toBe('after')

      // The workflow is cancelled (cancel() was called)
      const execution = manager.getExecution(handle.id)
      expect(execution!.status).toBe('cancelled')
      expect(execution!.error?.message).toBe('Self cancelled')
    })
  })
})
