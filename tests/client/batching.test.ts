/**
 * Request Batching Tests - Layer 7: Client SDK
 *
 * Comprehensive test suite for RequestBatcher class.
 * Tests cover batching, flushing, timing, cancellation, priorities, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  RequestBatcher,
  BatcherOptions,
  BatchRequest,
  BatchResult,
  BatchMetrics,
  BatchError,
  RequestCancelledError,
  BatchTimeoutError,
} from '../../src/client/batching'

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Mock transport for testing
 */
interface MockTransport {
  executeBatch: ReturnType<typeof vi.fn>
}

function createMockTransport(): MockTransport {
  return {
    executeBatch: vi.fn(async (requests: BatchRequest[]): Promise<BatchResult[]> => {
      return requests.map((req) => ({
        requestId: req.id,
        success: true,
        value: { result: `result-${req.id}` },
      }))
    }),
  }
}

/**
 * Wait for next tick
 */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Wait for specific time
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// RequestBatcher Class Tests
// ============================================================================

describe('RequestBatcher', () => {
  let transport: MockTransport
  let batcher: RequestBatcher

  beforeEach(() => {
    vi.useFakeTimers()
    transport = createMockTransport()
    batcher = new RequestBatcher({
      executor: transport.executeBatch,
    })
  })

  afterEach(() => {
    // Destroy batcher first to cancel all pending requests
    batcher.destroy()
    // Then restore real timers
    vi.useRealTimers()
  })

  // ============================================================================
  // Constructor and Configuration
  // ============================================================================

  describe('constructor', () => {
    it('should create a RequestBatcher with default options', () => {
      const b = new RequestBatcher({
        executor: transport.executeBatch,
      })
      expect(b).toBeInstanceOf(RequestBatcher)
      b.destroy()
    })

    it('should create a RequestBatcher with custom options', () => {
      const b = new RequestBatcher({
        executor: transport.executeBatch,
        batchDelay: 50,
        maxBatchSize: 10,
        timeout: 5000,
      })
      expect(b).toBeInstanceOf(RequestBatcher)
      b.destroy()
    })

    it('should accept an optional name for debugging', () => {
      const b = new RequestBatcher({
        executor: transport.executeBatch,
        name: 'test-batcher',
      })
      expect(b).toBeInstanceOf(RequestBatcher)
      b.destroy()
    })
  })

  describe('setBatchDelay', () => {
    it('should update the batch delay', () => {
      batcher.setBatchDelay(100)
      // The effect is tested through batching behavior
      expect(batcher.getBatchDelay()).toBe(100)
    })

    it('should throw for negative delay', () => {
      expect(() => batcher.setBatchDelay(-1)).toThrow()
    })

    it('should accept zero delay (next tick batching)', () => {
      batcher.setBatchDelay(0)
      expect(batcher.getBatchDelay()).toBe(0)
    })
  })

  describe('setBatchSize', () => {
    it('should update the max batch size', () => {
      batcher.setBatchSize(50)
      expect(batcher.getMaxBatchSize()).toBe(50)
    })

    it('should throw for invalid batch size', () => {
      expect(() => batcher.setBatchSize(0)).toThrow()
      expect(() => batcher.setBatchSize(-1)).toThrow()
    })

    it('should flush when batch reaches new smaller size', async () => {
      batcher.setBatchSize(100)

      // Add 5 requests
      for (let i = 0; i < 5; i++) {
        batcher.add({
          type: 'query',
          path: `test:query${i}`,
          args: {},
        })
      }

      // Change batch size to 3 - should trigger flush
      batcher.setBatchSize(3)

      // Wait for flush
      await vi.runAllTimersAsync()

      expect(transport.executeBatch).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // Basic Request Adding
  // ============================================================================

  describe('add', () => {
    it('should add a query request and return a promise', () => {
      const promise = batcher.add({
        type: 'query',
        path: 'test:getUser',
        args: { id: '123' },
      })

      expect(promise).toBeInstanceOf(Promise)
    })

    it('should add a mutation request', () => {
      const promise = batcher.add({
        type: 'mutation',
        path: 'test:updateUser',
        args: { id: '123', name: 'John' },
      })

      expect(promise).toBeInstanceOf(Promise)
    })

    it('should add an action request', () => {
      const promise = batcher.add({
        type: 'action',
        path: 'test:sendEmail',
        args: { to: 'test@example.com' },
      })

      expect(promise).toBeInstanceOf(Promise)
    })

    it('should generate unique request IDs', () => {
      const ids: string[] = []
      transport.executeBatch.mockImplementation(async (requests: BatchRequest[]) => {
        ids.push(...requests.map((r) => r.id))
        return requests.map((req) => ({
          requestId: req.id,
          success: true,
          value: null,
        }))
      })

      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.add({ type: 'query', path: 'test:q2', args: {} })
      batcher.add({ type: 'query', path: 'test:q3', args: {} })

      batcher.flush()
      vi.runAllTimers()

      expect(new Set(ids).size).toBe(3)
    })

    it('should resolve with the result when batch executes', async () => {
      transport.executeBatch.mockImplementation(async (requests: BatchRequest[]) => {
        return requests.map((req) => ({
          requestId: req.id,
          success: true,
          value: { data: req.args },
        }))
      })

      const promise = batcher.add({
        type: 'query',
        path: 'test:getUser',
        args: { id: '123' },
      })

      batcher.flush()
      await vi.runAllTimersAsync()

      const result = await promise
      expect(result).toEqual({ data: { id: '123' } })
    })

    it('should reject when request fails', async () => {
      transport.executeBatch.mockImplementation(async (requests: BatchRequest[]) => {
        return requests.map((req) => ({
          requestId: req.id,
          success: false,
          error: 'Test error',
          errorCode: 'TEST_ERROR',
        }))
      })

      const promise = batcher.add({
        type: 'query',
        path: 'test:getUser',
        args: {},
      })

      batcher.flush()
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Test error')
    })
  })

  // ============================================================================
  // Automatic Batching
  // ============================================================================

  describe('automatic batching', () => {
    it('should batch requests made in the same tick', async () => {
      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.add({ type: 'query', path: 'test:q2', args: {} })
      batcher.add({ type: 'query', path: 'test:q3', args: {} })

      // Trigger the batch
      await vi.runAllTimersAsync()

      expect(transport.executeBatch).toHaveBeenCalledTimes(1)
      expect(transport.executeBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: 'test:q1' }),
          expect.objectContaining({ path: 'test:q2' }),
          expect.objectContaining({ path: 'test:q3' }),
        ])
      )
    })

    it('should separate batches with delay', async () => {
      batcher.setBatchDelay(50)

      batcher.add({ type: 'query', path: 'test:q1', args: {} })

      await vi.advanceTimersByTimeAsync(50)

      batcher.add({ type: 'query', path: 'test:q2', args: {} })

      await vi.advanceTimersByTimeAsync(50)

      expect(transport.executeBatch).toHaveBeenCalledTimes(2)
    })

    it('should batch requests within delay window', async () => {
      batcher.setBatchDelay(50)

      batcher.add({ type: 'query', path: 'test:q1', args: {} })

      await vi.advanceTimersByTimeAsync(20)

      batcher.add({ type: 'query', path: 'test:q2', args: {} })

      await vi.advanceTimersByTimeAsync(50)

      expect(transport.executeBatch).toHaveBeenCalledTimes(1)
      expect(transport.executeBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ path: 'test:q1' }),
          expect.objectContaining({ path: 'test:q2' }),
        ])
      )
    })
  })

  // ============================================================================
  // Batch by Function Type
  // ============================================================================

  describe('batch by function type', () => {
    it('should batch queries separately from mutations by default', async () => {
      const b = new RequestBatcher({
        executor: transport.executeBatch,
        separateByType: true,
      })

      b.add({ type: 'query', path: 'test:q1', args: {} })
      b.add({ type: 'mutation', path: 'test:m1', args: {} })
      b.add({ type: 'query', path: 'test:q2', args: {} })

      b.flush()
      await vi.runAllTimersAsync()

      expect(transport.executeBatch).toHaveBeenCalledTimes(2)

      const calls = transport.executeBatch.mock.calls
      const queryBatch = calls.find((c) => c[0].some((r: BatchRequest) => r.type === 'query'))
      const mutationBatch = calls.find((c) => c[0].some((r: BatchRequest) => r.type === 'mutation'))

      expect(queryBatch[0]).toHaveLength(2)
      expect(mutationBatch[0]).toHaveLength(1)

      b.destroy()
    })

    it('should batch actions separately', async () => {
      const b = new RequestBatcher({
        executor: transport.executeBatch,
        separateByType: true,
      })

      b.add({ type: 'query', path: 'test:q1', args: {} })
      b.add({ type: 'action', path: 'test:a1', args: {} })
      b.add({ type: 'mutation', path: 'test:m1', args: {} })

      b.flush()
      await vi.runAllTimersAsync()

      expect(transport.executeBatch).toHaveBeenCalledTimes(3)

      b.destroy()
    })

    it('should batch all types together when separateByType is false', async () => {
      const b = new RequestBatcher({
        executor: transport.executeBatch,
        separateByType: false,
      })

      b.add({ type: 'query', path: 'test:q1', args: {} })
      b.add({ type: 'mutation', path: 'test:m1', args: {} })
      b.add({ type: 'action', path: 'test:a1', args: {} })

      b.flush()
      await vi.runAllTimersAsync()

      expect(transport.executeBatch).toHaveBeenCalledTimes(1)
      expect(transport.executeBatch).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ type: 'query' }),
        expect.objectContaining({ type: 'mutation' }),
        expect.objectContaining({ type: 'action' }),
      ]))

      b.destroy()
    })
  })

  // ============================================================================
  // Manual Flush
  // ============================================================================

  describe('flush', () => {
    it('should immediately execute pending batch', async () => {
      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.add({ type: 'query', path: 'test:q2', args: {} })

      expect(transport.executeBatch).not.toHaveBeenCalled()

      batcher.flush()
      await vi.runAllTimersAsync()

      expect(transport.executeBatch).toHaveBeenCalledTimes(1)
    })

    it('should do nothing if no pending requests', async () => {
      batcher.flush()
      await vi.runAllTimersAsync()

      expect(transport.executeBatch).not.toHaveBeenCalled()
    })

    it('should return a promise that resolves when batch completes', async () => {
      batcher.add({ type: 'query', path: 'test:q1', args: {} })

      const flushPromise = batcher.flush()

      await vi.runAllTimersAsync()
      await expect(flushPromise).resolves.toBeUndefined()
    })

    it('should handle multiple flush calls', async () => {
      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.flush()

      batcher.add({ type: 'query', path: 'test:q2', args: {} })
      batcher.flush()

      await vi.runAllTimersAsync()

      expect(transport.executeBatch).toHaveBeenCalledTimes(2)
    })
  })

  // ============================================================================
  // Max Batch Size
  // ============================================================================

  describe('max batch size', () => {
    it('should automatically flush when batch reaches max size', async () => {
      const b = new RequestBatcher({
        executor: transport.executeBatch,
        maxBatchSize: 3,
        batchDelay: 1000, // Long delay to ensure size triggers flush
      })

      b.add({ type: 'query', path: 'test:q1', args: {} })
      b.add({ type: 'query', path: 'test:q2', args: {} })

      // Should not have flushed yet
      expect(transport.executeBatch).not.toHaveBeenCalled()

      b.add({ type: 'query', path: 'test:q3', args: {} })

      // Should have triggered flush
      await vi.runAllTimersAsync()
      expect(transport.executeBatch).toHaveBeenCalledTimes(1)

      b.destroy()
    })

    it('should create multiple batches when exceeding max size', async () => {
      const b = new RequestBatcher({
        executor: transport.executeBatch,
        maxBatchSize: 2,
        batchDelay: 0,
      })

      b.add({ type: 'query', path: 'test:q1', args: {} })
      b.add({ type: 'query', path: 'test:q2', args: {} })
      b.add({ type: 'query', path: 'test:q3', args: {} })
      b.add({ type: 'query', path: 'test:q4', args: {} })
      b.add({ type: 'query', path: 'test:q5', args: {} })

      await vi.runAllTimersAsync()

      // Should have 3 batches: [q1,q2], [q3,q4], [q5]
      expect(transport.executeBatch).toHaveBeenCalledTimes(3)

      b.destroy()
    })
  })

  // ============================================================================
  // Request Cancellation
  // ============================================================================

  describe('cancellation', () => {
    it('should support request cancellation via AbortController', async () => {
      const controller = new AbortController()

      const promise = batcher.add({
        type: 'query',
        path: 'test:q1',
        args: {},
        signal: controller.signal,
      })

      controller.abort()

      await expect(promise).rejects.toThrow(RequestCancelledError)
    })

    it('should not include cancelled requests in batch', async () => {
      const controller = new AbortController()

      batcher.add({
        type: 'query',
        path: 'test:q1',
        args: {},
        signal: controller.signal,
      })
      batcher.add({ type: 'query', path: 'test:q2', args: {} })

      controller.abort()
      batcher.flush()
      await vi.runAllTimersAsync()

      expect(transport.executeBatch).toHaveBeenCalledWith([
        expect.objectContaining({ path: 'test:q2' }),
      ])
    })

    it('should handle cancellation during batch execution', async () => {
      // Use real timers for this test
      vi.useRealTimers()

      const controller = new AbortController()

      let resolveExecutor: () => void
      const executorPromise = new Promise<void>((resolve) => {
        resolveExecutor = resolve
      })

      const slowTransport = {
        executeBatch: vi.fn(async () => {
          await executorPromise
          return []
        }),
      }

      const b = new RequestBatcher({
        executor: slowTransport.executeBatch,
      })

      const promise = b.add({
        type: 'query',
        path: 'test:q1',
        args: {},
        signal: controller.signal,
      })

      b.flush()

      // Cancel during execution
      await wait(10)
      controller.abort()

      await expect(promise).rejects.toThrow(RequestCancelledError)

      // Cleanup
      resolveExecutor!()
      b.destroy()

      // Restore fake timers
      vi.useFakeTimers()
    })

    it('should support cancel method on returned promise', async () => {
      const result = batcher.add({
        type: 'query',
        path: 'test:q1',
        args: {},
      })

      result.cancel()

      await expect(result).rejects.toThrow(RequestCancelledError)
    })

    it('should handle cancellation of all requests in batch', async () => {
      const controller1 = new AbortController()
      const controller2 = new AbortController()

      batcher.add({
        type: 'query',
        path: 'test:q1',
        args: {},
        signal: controller1.signal,
      })
      batcher.add({
        type: 'query',
        path: 'test:q2',
        args: {},
        signal: controller2.signal,
      })

      controller1.abort()
      controller2.abort()

      batcher.flush()
      await vi.runAllTimersAsync()

      // Should not execute batch if all requests cancelled
      expect(transport.executeBatch).not.toHaveBeenCalled()
    })
  })

  // ============================================================================
  // Priority Requests
  // ============================================================================

  describe('priority requests', () => {
    it('should bypass batching for priority requests', async () => {
      batcher.setBatchDelay(1000) // Long delay

      const normalPromise = batcher.add({
        type: 'query',
        path: 'test:normal',
        args: {},
      })

      const priorityPromise = batcher.add({
        type: 'query',
        path: 'test:priority',
        args: {},
        priority: true,
      })

      // Priority should execute immediately
      await vi.runAllTimersAsync()

      expect(transport.executeBatch).toHaveBeenCalledTimes(2)

      // Check that priority was called first
      const firstCall = transport.executeBatch.mock.calls[0]
      expect(firstCall[0]).toHaveLength(1)
      expect(firstCall[0][0].path).toBe('test:priority')
    })

    it('should execute priority requests individually', async () => {
      batcher.add({
        type: 'query',
        path: 'test:p1',
        args: {},
        priority: true,
      })
      batcher.add({
        type: 'query',
        path: 'test:p2',
        args: {},
        priority: true,
      })

      await vi.runAllTimersAsync()

      // Each priority request should be separate
      expect(transport.executeBatch).toHaveBeenCalledTimes(2)
    })

    it('should not affect pending normal batch', async () => {
      batcher.setBatchDelay(100)

      batcher.add({ type: 'query', path: 'test:n1', args: {} })
      batcher.add({ type: 'query', path: 'test:n2', args: {} })

      // Add priority request
      batcher.add({
        type: 'query',
        path: 'test:priority',
        args: {},
        priority: true,
      })

      await vi.advanceTimersByTimeAsync(100)

      // Should have 2 batches: priority (immediate) and normal (after delay)
      expect(transport.executeBatch).toHaveBeenCalledTimes(2)
    })
  })

  // ============================================================================
  // Timeout Handling
  // ============================================================================

  describe('timeout handling', () => {
    it('should timeout individual requests', async () => {
      // Use real timers for this test since we need real async delays
      vi.useRealTimers()

      let resolveExecutor: () => void
      const executorPromise = new Promise<void>((resolve) => {
        resolveExecutor = resolve
      })

      const b = new RequestBatcher({
        executor: async () => {
          await executorPromise
          return []
        },
        timeout: 50,
      })

      const promise = b.add({
        type: 'query',
        path: 'test:slow',
        args: {},
      })

      b.flush()

      // Wait for timeout
      await wait(100)

      await expect(promise).rejects.toThrow(BatchTimeoutError)

      // Cleanup: resolve the executor so it completes
      resolveExecutor!()
      b.destroy()

      // Restore fake timers
      vi.useFakeTimers()
    })

    it('should allow request-level timeout override', async () => {
      // Use real timers for this test
      vi.useRealTimers()

      let resolveExecutor: () => void
      const executorPromise = new Promise<void>((resolve) => {
        resolveExecutor = resolve
      })

      const b = new RequestBatcher({
        executor: async () => {
          await executorPromise
          return []
        },
        timeout: 5000, // Default long timeout
      })

      const promise = b.add({
        type: 'query',
        path: 'test:slow',
        args: {},
        timeout: 50, // Short timeout override
      })

      b.flush()

      // Wait for timeout
      await wait(100)

      await expect(promise).rejects.toThrow(BatchTimeoutError)

      // Cleanup
      resolveExecutor!()
      b.destroy()

      // Restore fake timers
      vi.useFakeTimers()
    })

    it('should resolve other requests if one times out', async () => {
      // Use real timers for this test
      vi.useRealTimers()

      let callCount = 0
      let resolveFirstBatch: () => void
      const firstBatchPromise = new Promise<void>((resolve) => {
        resolveFirstBatch = resolve
      })

      const b = new RequestBatcher({
        executor: async (requests) => {
          callCount++
          if (callCount === 1) {
            // First batch waits (will timeout)
            await firstBatchPromise
          }
          return requests.map((r) => ({
            requestId: r.id,
            success: true,
            value: 'ok',
          }))
        },
        timeout: 50,
        batchDelay: 0,
      })

      const promise1 = b.add({
        type: 'query',
        path: 'test:q1',
        args: {},
      })

      b.flush()

      // Wait for timeout
      await wait(100)

      await expect(promise1).rejects.toThrow(BatchTimeoutError)

      // Add another request after timeout
      const promise2 = b.add({
        type: 'query',
        path: 'test:q2',
        args: {},
      })

      b.flush()

      // Wait for second batch to complete
      await wait(50)

      await expect(promise2).resolves.toBe('ok')

      // Cleanup
      resolveFirstBatch!()
      b.destroy()

      // Restore fake timers
      vi.useFakeTimers()
    })
  })

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('error handling', () => {
    it('should handle individual request errors', async () => {
      transport.executeBatch.mockImplementation(async (requests: BatchRequest[]) => {
        return requests.map((req, i) => ({
          requestId: req.id,
          success: i !== 1, // Second request fails
          value: i !== 1 ? 'ok' : undefined,
          error: i === 1 ? 'Request failed' : undefined,
          errorCode: i === 1 ? 'FAILED' : undefined,
        }))
      })

      const p1 = batcher.add({ type: 'query', path: 'test:q1', args: {} })
      const p2 = batcher.add({ type: 'query', path: 'test:q2', args: {} })
      const p3 = batcher.add({ type: 'query', path: 'test:q3', args: {} })

      batcher.flush()
      await vi.runAllTimersAsync()

      await expect(p1).resolves.toBe('ok')
      await expect(p2).rejects.toThrow('Request failed')
      await expect(p3).resolves.toBe('ok')
    })

    it('should handle batch-level errors', async () => {
      transport.executeBatch.mockRejectedValue(new Error('Network error'))

      const p1 = batcher.add({ type: 'query', path: 'test:q1', args: {} })
      const p2 = batcher.add({ type: 'query', path: 'test:q2', args: {} })

      batcher.flush()
      await vi.runAllTimersAsync()

      await expect(p1).rejects.toThrow('Network error')
      await expect(p2).rejects.toThrow('Network error')
    })

    it('should wrap errors in BatchError', async () => {
      transport.executeBatch.mockImplementation(async (requests: BatchRequest[]) => {
        return requests.map((req) => ({
          requestId: req.id,
          success: false,
          error: 'Test error',
          errorCode: 'TEST_CODE',
          errorData: { detail: 'extra info' },
        }))
      })

      const promise = batcher.add({ type: 'query', path: 'test:q1', args: {} })

      batcher.flush()
      await vi.runAllTimersAsync()

      try {
        await promise
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(BatchError)
        expect((e as BatchError).code).toBe('TEST_CODE')
        expect((e as BatchError).data).toEqual({ detail: 'extra info' })
      }
    })

    it('should handle missing result for request', async () => {
      transport.executeBatch.mockResolvedValue([])

      const promise = batcher.add({ type: 'query', path: 'test:q1', args: {} })

      batcher.flush()
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow(/result not found/i)
    })

    it('should handle executor throwing non-Error', async () => {
      transport.executeBatch.mockRejectedValue('string error')

      const promise = batcher.add({ type: 'query', path: 'test:q1', args: {} })

      batcher.flush()
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('string error')
    })
  })

  // ============================================================================
  // Metrics
  // ============================================================================

  describe('metrics', () => {
    it('should track batch count', async () => {
      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      batcher.add({ type: 'query', path: 'test:q2', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      const metrics = batcher.getMetrics()
      expect(metrics.totalBatches).toBe(2)
    })

    it('should track request count', async () => {
      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.add({ type: 'query', path: 'test:q2', args: {} })
      batcher.add({ type: 'query', path: 'test:q3', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      const metrics = batcher.getMetrics()
      expect(metrics.totalRequests).toBe(3)
    })

    it('should track average batch size', async () => {
      // Batch 1: 3 requests
      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.add({ type: 'query', path: 'test:q2', args: {} })
      batcher.add({ type: 'query', path: 'test:q3', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      // Batch 2: 1 request
      batcher.add({ type: 'query', path: 'test:q4', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      const metrics = batcher.getMetrics()
      expect(metrics.averageBatchSize).toBe(2) // (3 + 1) / 2
    })

    it('should track timing metrics', async () => {
      transport.executeBatch.mockImplementation(async (requests) => {
        await wait(50)
        return requests.map((r) => ({
          requestId: r.id,
          success: true,
          value: null,
        }))
      })

      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.flush()

      await vi.advanceTimersByTimeAsync(100)

      const metrics = batcher.getMetrics()
      expect(metrics.averageExecutionTime).toBeGreaterThanOrEqual(0)
    })

    it('should track error count', async () => {
      transport.executeBatch.mockRejectedValue(new Error('fail'))

      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      const metrics = batcher.getMetrics()
      expect(metrics.errorCount).toBe(1)
    })

    it('should track cancelled count', async () => {
      const controller = new AbortController()

      batcher.add({
        type: 'query',
        path: 'test:q1',
        args: {},
        signal: controller.signal,
      })

      controller.abort()
      await vi.runAllTimersAsync()

      const metrics = batcher.getMetrics()
      expect(metrics.cancelledCount).toBe(1)
    })

    it('should reset metrics', async () => {
      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      batcher.resetMetrics()

      const metrics = batcher.getMetrics()
      expect(metrics.totalBatches).toBe(0)
      expect(metrics.totalRequests).toBe(0)
    })
  })

  // ============================================================================
  // Transport Support
  // ============================================================================

  describe('transport support', () => {
    it('should work with HTTP transport', async () => {
      const httpExecutor = vi.fn(async (requests: BatchRequest[]) => {
        return requests.map((r) => ({
          requestId: r.id,
          success: true,
          value: `http:${r.path}`,
        }))
      })

      const b = new RequestBatcher({
        executor: httpExecutor,
        transport: 'http',
      })

      const promise = b.add({ type: 'query', path: 'test:q1', args: {} })
      b.flush()
      await vi.runAllTimersAsync()

      await expect(promise).resolves.toBe('http:test:q1')

      b.destroy()
    })

    it('should work with WebSocket transport', async () => {
      const wsExecutor = vi.fn(async (requests: BatchRequest[]) => {
        return requests.map((r) => ({
          requestId: r.id,
          success: true,
          value: `ws:${r.path}`,
        }))
      })

      const b = new RequestBatcher({
        executor: wsExecutor,
        transport: 'websocket',
      })

      const promise = b.add({ type: 'query', path: 'test:q1', args: {} })
      b.flush()
      await vi.runAllTimersAsync()

      await expect(promise).resolves.toBe('ws:test:q1')

      b.destroy()
    })

    it('should switch executors dynamically', async () => {
      const executor1 = vi.fn(async (requests: BatchRequest[]) => {
        return requests.map((r) => ({
          requestId: r.id,
          success: true,
          value: 'executor1',
        }))
      })

      const executor2 = vi.fn(async (requests: BatchRequest[]) => {
        return requests.map((r) => ({
          requestId: r.id,
          success: true,
          value: 'executor2',
        }))
      })

      const b = new RequestBatcher({ executor: executor1 })

      const p1 = b.add({ type: 'query', path: 'test:q1', args: {} })
      b.flush()
      await vi.runAllTimersAsync()

      b.setExecutor(executor2)

      const p2 = b.add({ type: 'query', path: 'test:q2', args: {} })
      b.flush()
      await vi.runAllTimersAsync()

      await expect(p1).resolves.toBe('executor1')
      await expect(p2).resolves.toBe('executor2')

      b.destroy()
    })
  })

  // ============================================================================
  // Lifecycle
  // ============================================================================

  describe('lifecycle', () => {
    it('should clean up on destroy', async () => {
      const controller = new AbortController()

      const p1 = batcher.add({ type: 'query', path: 'test:q1', args: {} })
      const p2 = batcher.add({
        type: 'query',
        path: 'test:q2',
        args: {},
        signal: controller.signal,
      })

      batcher.destroy()

      await expect(p1).rejects.toThrow(/destroyed|cancelled/i)
      await expect(p2).rejects.toThrow(/destroyed|cancelled/i)
    })

    it('should reject new requests after destroy', async () => {
      batcher.destroy()

      const promise = batcher.add({ type: 'query', path: 'test:q1', args: {} })

      await expect(promise).rejects.toThrow(/destroyed/i)
    })

    it('should support isPending check', () => {
      expect(batcher.hasPendingRequests()).toBe(false)

      batcher.add({ type: 'query', path: 'test:q1', args: {} })

      expect(batcher.hasPendingRequests()).toBe(true)
    })

    it('should support pending count', () => {
      expect(batcher.getPendingCount()).toBe(0)

      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.add({ type: 'query', path: 'test:q2', args: {} })

      expect(batcher.getPendingCount()).toBe(2)
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle rapid add/cancel cycles', async () => {
      for (let i = 0; i < 100; i++) {
        const result = batcher.add({
          type: 'query',
          path: `test:q${i}`,
          args: {},
        })
        if (i % 2 === 0) {
          result.cancel()
        }
      }

      batcher.flush()
      await vi.runAllTimersAsync()

      const metrics = batcher.getMetrics()
      expect(metrics.cancelledCount).toBe(50)
    })

    it('should handle concurrent flushes', async () => {
      batcher.add({ type: 'query', path: 'test:q1', args: {} })

      const flush1 = batcher.flush()
      const flush2 = batcher.flush()
      const flush3 = batcher.flush()

      await vi.runAllTimersAsync()

      await Promise.all([flush1, flush2, flush3])

      // Should only execute one batch
      expect(transport.executeBatch).toHaveBeenCalledTimes(1)
    })

    it('should handle empty args', async () => {
      const promise = batcher.add({
        type: 'query',
        path: 'test:q1',
        args: {},
      })

      batcher.flush()
      await vi.runAllTimersAsync()

      await expect(promise).resolves.toBeDefined()
    })

    it('should handle complex args', async () => {
      transport.executeBatch.mockImplementation(async (requests) => {
        return requests.map((r) => ({
          requestId: r.id,
          success: true,
          value: r.args,
        }))
      })

      const complexArgs = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        date: '2024-01-01',
        null: null,
        undefined: undefined,
      }

      const promise = batcher.add({
        type: 'query',
        path: 'test:q1',
        args: complexArgs,
      })

      batcher.flush()
      await vi.runAllTimersAsync()

      const result = await promise
      expect(result).toEqual(complexArgs)
    })

    it('should handle very large batch', async () => {
      const promises: Promise<unknown>[] = []

      for (let i = 0; i < 1000; i++) {
        promises.push(
          batcher.add({
            type: 'query',
            path: `test:q${i}`,
            args: { index: i },
          })
        )
      }

      batcher.flush()
      await vi.runAllTimersAsync()

      const results = await Promise.all(promises)
      expect(results).toHaveLength(1000)
    })

    it('should maintain request order in results', async () => {
      transport.executeBatch.mockImplementation(async (requests) => {
        // Return results in reverse order
        return requests
          .slice()
          .reverse()
          .map((r) => ({
            requestId: r.id,
            success: true,
            value: r.path,
          }))
      })

      const p1 = batcher.add({ type: 'query', path: 'first', args: {} })
      const p2 = batcher.add({ type: 'query', path: 'second', args: {} })
      const p3 = batcher.add({ type: 'query', path: 'third', args: {} })

      batcher.flush()
      await vi.runAllTimersAsync()

      // Each promise should get its correct result regardless of order
      await expect(p1).resolves.toBe('first')
      await expect(p2).resolves.toBe('second')
      await expect(p3).resolves.toBe('third')
    })
  })

  // ============================================================================
  // Retry Support
  // ============================================================================

  describe('retry support', () => {
    it('should support retry on failure', async () => {
      let attempts = 0
      const b = new RequestBatcher({
        executor: async (requests) => {
          attempts++
          if (attempts < 3) {
            throw new Error('Transient error')
          }
          return requests.map((r) => ({
            requestId: r.id,
            success: true,
            value: 'success',
          }))
        },
        retry: {
          maxAttempts: 3,
          delay: 100,
        },
      })

      const promise = b.add({ type: 'query', path: 'test:q1', args: {} })
      b.flush()

      await vi.runAllTimersAsync()

      await expect(promise).resolves.toBe('success')
      expect(attempts).toBe(3)

      b.destroy()
    })

    it('should fail after max retries', async () => {
      const b = new RequestBatcher({
        executor: async () => {
          throw new Error('Persistent error')
        },
        retry: {
          maxAttempts: 3,
          delay: 100,
        },
      })

      const promise = b.add({ type: 'query', path: 'test:q1', args: {} })
      b.flush()

      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Persistent error')

      b.destroy()
    })

    it('should apply exponential backoff', async () => {
      const timestamps: number[] = []
      let attempts = 0

      const b = new RequestBatcher({
        executor: async () => {
          timestamps.push(Date.now())
          attempts++
          if (attempts < 4) {
            throw new Error('Transient error')
          }
          return []
        },
        retry: {
          maxAttempts: 4,
          delay: 100,
          backoffMultiplier: 2,
        },
      })

      b.add({ type: 'query', path: 'test:q1', args: {} })
      b.flush()

      // Run timers incrementally
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }

      // Should have 4 attempts with increasing delays
      expect(attempts).toBe(4)

      b.destroy()
    })

    it('should not retry non-retryable errors', async () => {
      let attempts = 0
      const b = new RequestBatcher({
        executor: async () => {
          attempts++
          const error = new Error('Not retryable') as Error & { retryable: boolean }
          error.retryable = false
          throw error
        },
        retry: {
          maxAttempts: 3,
          delay: 100,
          shouldRetry: (error: Error & { retryable?: boolean }) => error.retryable !== false,
        },
      })

      const promise = b.add({ type: 'query', path: 'test:q1', args: {} })
      b.flush()

      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Not retryable')
      expect(attempts).toBe(1)

      b.destroy()
    })
  })

  // ============================================================================
  // Event Emitter Support
  // ============================================================================

  describe('events', () => {
    it('should emit batchStart event', async () => {
      const handler = vi.fn()
      batcher.on('batchStart', handler)

      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: expect.any(String),
          requestCount: 1,
        })
      )
    })

    it('should emit batchComplete event', async () => {
      const handler = vi.fn()
      batcher.on('batchComplete', handler)

      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: expect.any(String),
          requestCount: 1,
          duration: expect.any(Number),
          successCount: 1,
          errorCount: 0,
        })
      )
    })

    it('should emit batchError event', async () => {
      transport.executeBatch.mockRejectedValue(new Error('Batch failed'))

      const handler = vi.fn()
      batcher.on('batchError', handler)

      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          batchId: expect.any(String),
          error: expect.any(Error),
        })
      )
    })

    it('should emit requestCancelled event', async () => {
      const handler = vi.fn()
      batcher.on('requestCancelled', handler)

      const result = batcher.add({ type: 'query', path: 'test:q1', args: {} })
      result.cancel()

      await vi.runAllTimersAsync()

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: expect.any(String),
        })
      )
    })

    it('should support removing event listeners', async () => {
      const handler = vi.fn()
      batcher.on('batchStart', handler)
      batcher.off('batchStart', handler)

      batcher.add({ type: 'query', path: 'test:q1', args: {} })
      batcher.flush()
      await vi.runAllTimersAsync()

      expect(handler).not.toHaveBeenCalled()
    })
  })
})

// ============================================================================
// Cancellable Promise Tests
// ============================================================================

describe('CancellablePromise', () => {
  let transport: MockTransport
  let batcher: RequestBatcher

  beforeEach(() => {
    vi.useFakeTimers()
    transport = createMockTransport()
    batcher = new RequestBatcher({
      executor: transport.executeBatch,
    })
  })

  afterEach(() => {
    batcher.destroy()
    vi.useRealTimers()
  })

  it('should be thenable', async () => {
    const result = batcher.add({ type: 'query', path: 'test:q1', args: {} })

    batcher.flush()
    await vi.runAllTimersAsync()

    const value = await result.then((v) => ({ wrapped: v }))
    expect(value).toEqual({ wrapped: expect.objectContaining({ result: expect.any(String) }) })
  })

  it('should support catch', async () => {
    transport.executeBatch.mockRejectedValue(new Error('fail'))

    const result = batcher.add({ type: 'query', path: 'test:q1', args: {} })

    batcher.flush()
    await vi.runAllTimersAsync()

    const error = await result.catch((e) => e.message)
    expect(error).toBe('fail')
  })

  it('should support finally', async () => {
    const finallyFn = vi.fn()
    const result = batcher.add({ type: 'query', path: 'test:q1', args: {} })

    batcher.flush()
    await vi.runAllTimersAsync()

    await result.finally(finallyFn)
    expect(finallyFn).toHaveBeenCalled()
  })

  it('should expose requestId', () => {
    const result = batcher.add({ type: 'query', path: 'test:q1', args: {} })
    expect(result.requestId).toBeDefined()
    expect(typeof result.requestId).toBe('string')
  })
})
