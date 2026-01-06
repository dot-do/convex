/**
 * Journal System Tests - Layer 10
 * Issue: convex-ugx
 *
 * TDD RED Phase: These tests are expected to fail until implementation is complete.
 *
 * The Journal System provides durable logging of workflow execution steps,
 * enabling replay, recovery, and audit capabilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  Journal,
  JournalEntry,
  JournalEntryType,
  createJournal,
  appendEntry,
  replayJournal,
  getJournalEntries,
  serializeJournal,
  deserializeJournal,
  JournalPersistence,
  createInMemoryPersistence,
  JournalSnapshot,
  compactJournal,
} from '../../src/workflow/journal'

// ============================================================================
// Journal Creation Tests
// ============================================================================

describe('Journal Creation', () => {
  describe('createJournal', () => {
    it('should create a new empty journal', () => {
      const journal = createJournal('wf_test_123')

      expect(journal).toBeDefined()
      expect(journal.workflowId).toBe('wf_test_123')
      expect(journal.entries).toEqual([])
      expect(journal.version).toBe(0)
    })

    it('should create journal with unique ID', () => {
      const journal1 = createJournal('wf_1')
      const journal2 = createJournal('wf_2')

      expect(journal1.id).toBeDefined()
      expect(journal2.id).toBeDefined()
      expect(journal1.id).not.toBe(journal2.id)
    })

    it('should set creation timestamp', () => {
      const before = Date.now()
      const journal = createJournal('wf_test')
      const after = Date.now()

      expect(journal.createdAt).toBeGreaterThanOrEqual(before)
      expect(journal.createdAt).toBeLessThanOrEqual(after)
    })

    it('should initialize with pending status', () => {
      const journal = createJournal('wf_test')

      expect(journal.status).toBe('pending')
    })

    it('should accept optional metadata', () => {
      const journal = createJournal('wf_test', {
        metadata: {
          workflowName: 'order-processing',
          initiator: 'user-123',
        },
      })

      expect(journal.metadata).toEqual({
        workflowName: 'order-processing',
        initiator: 'user-123',
      })
    })

    it('should accept parent journal ID for child workflows', () => {
      const parentJournal = createJournal('wf_parent')
      const childJournal = createJournal('wf_child', {
        parentJournalId: parentJournal.id,
      })

      expect(childJournal.parentJournalId).toBe(parentJournal.id)
    })
  })
})

// ============================================================================
// Journal Entry Tests
// ============================================================================

describe('Journal Entry', () => {
  let journal: Journal

  beforeEach(() => {
    journal = createJournal('wf_test_123')
  })

  describe('appendEntry - Step Start', () => {
    it('should append step start entry', () => {
      const entry = appendEntry(journal, {
        type: 'step_start',
        stepName: 'validate-input',
        stepType: 'function',
        input: { orderId: '123' },
      })

      expect(entry.type).toBe('step_start')
      expect(entry.stepName).toBe('validate-input')
      expect(entry.stepType).toBe('function')
      expect(entry.input).toEqual({ orderId: '123' })
      expect(journal.entries).toHaveLength(1)
    })

    it('should auto-increment sequence number', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step1',
        stepType: 'function',
      })
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step2',
        stepType: 'function',
      })

      expect(journal.entries[0].sequence).toBe(1)
      expect(journal.entries[1].sequence).toBe(2)
    })

    it('should set entry timestamp', () => {
      const before = Date.now()
      const entry = appendEntry(journal, {
        type: 'step_start',
        stepName: 'test',
        stepType: 'function',
      })
      const after = Date.now()

      expect(entry.timestamp).toBeGreaterThanOrEqual(before)
      expect(entry.timestamp).toBeLessThanOrEqual(after)
    })

    it('should generate unique entry ID', () => {
      const entry1 = appendEntry(journal, {
        type: 'step_start',
        stepName: 'step1',
        stepType: 'function',
      })
      const entry2 = appendEntry(journal, {
        type: 'step_start',
        stepName: 'step2',
        stepType: 'function',
      })

      expect(entry1.id).toBeDefined()
      expect(entry2.id).toBeDefined()
      expect(entry1.id).not.toBe(entry2.id)
    })

    it('should support query step type', () => {
      const entry = appendEntry(journal, {
        type: 'step_start',
        stepName: 'fetch-user',
        stepType: 'query',
        input: { userId: '456' },
        functionRef: 'users:get',
      })

      expect(entry.stepType).toBe('query')
      expect(entry.functionRef).toBe('users:get')
    })

    it('should support mutation step type', () => {
      const entry = appendEntry(journal, {
        type: 'step_start',
        stepName: 'update-order',
        stepType: 'mutation',
        input: { orderId: '789', status: 'processing' },
        functionRef: 'orders:updateStatus',
      })

      expect(entry.stepType).toBe('mutation')
      expect(entry.functionRef).toBe('orders:updateStatus')
    })

    it('should support action step type', () => {
      const entry = appendEntry(journal, {
        type: 'step_start',
        stepName: 'send-email',
        stepType: 'action',
        input: { to: 'user@example.com' },
        functionRef: 'email:send',
      })

      expect(entry.stepType).toBe('action')
    })

    it('should support sleep step type', () => {
      const entry = appendEntry(journal, {
        type: 'step_start',
        stepName: 'rate-limit-delay',
        stepType: 'sleep',
        input: { duration: 5000 },
      })

      expect(entry.stepType).toBe('sleep')
      expect(entry.input).toEqual({ duration: 5000 })
    })

    it('should support wait_for_event step type', () => {
      const entry = appendEntry(journal, {
        type: 'step_start',
        stepName: 'await-approval',
        stepType: 'wait_for_event',
        input: { timeout: 86400000 },
      })

      expect(entry.stepType).toBe('wait_for_event')
    })
  })

  describe('appendEntry - Step Completion', () => {
    it('should append step completion entry', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'compute',
        stepType: 'function',
      })

      const entry = appendEntry(journal, {
        type: 'step_complete',
        stepName: 'compute',
        output: { result: 42 },
      })

      expect(entry.type).toBe('step_complete')
      expect(entry.stepName).toBe('compute')
      expect(entry.output).toEqual({ result: 42 })
    })

    it('should record completion duration', () => {
      const startEntry = appendEntry(journal, {
        type: 'step_start',
        stepName: 'slow-step',
        stepType: 'function',
      })

      // Simulate some time passing
      const completeEntry = appendEntry(journal, {
        type: 'step_complete',
        stepName: 'slow-step',
        output: 'done',
      })

      expect(completeEntry.duration).toBeDefined()
      expect(completeEntry.duration).toBeGreaterThanOrEqual(0)
    })

    it('should handle null output', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'void-step',
        stepType: 'function',
      })

      const entry = appendEntry(journal, {
        type: 'step_complete',
        stepName: 'void-step',
        output: null,
      })

      expect(entry.output).toBeNull()
    })

    it('should handle undefined output', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'undefined-step',
        stepType: 'function',
      })

      const entry = appendEntry(journal, {
        type: 'step_complete',
        stepName: 'undefined-step',
        output: undefined,
      })

      expect(entry.output).toBeUndefined()
    })

    it('should handle complex output objects', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'complex-step',
        stepType: 'function',
      })

      const complexOutput = {
        nested: {
          array: [1, 2, 3],
          date: new Date().toISOString(),
        },
        count: 100,
      }

      const entry = appendEntry(journal, {
        type: 'step_complete',
        stepName: 'complex-step',
        output: complexOutput,
      })

      expect(entry.output).toEqual(complexOutput)
    })
  })

  describe('appendEntry - Step Failure', () => {
    it('should append step failure entry', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'failing-step',
        stepType: 'function',
      })

      const entry = appendEntry(journal, {
        type: 'step_failure',
        stepName: 'failing-step',
        error: {
          message: 'Something went wrong',
          stack: 'Error: Something went wrong\n    at test.ts:10:5',
        },
      })

      expect(entry.type).toBe('step_failure')
      expect(entry.error?.message).toBe('Something went wrong')
      expect(entry.error?.stack).toBeDefined()
    })

    it('should record error code if available', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'api-call',
        stepType: 'action',
      })

      const entry = appendEntry(journal, {
        type: 'step_failure',
        stepName: 'api-call',
        error: {
          message: 'API request failed',
          code: 'API_ERROR',
        },
      })

      expect(entry.error?.code).toBe('API_ERROR')
    })

    it('should record retryable flag', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'retryable-step',
        stepType: 'function',
      })

      const entry = appendEntry(journal, {
        type: 'step_failure',
        stepName: 'retryable-step',
        error: {
          message: 'Temporary failure',
          retryable: true,
        },
      })

      expect(entry.error?.retryable).toBe(true)
    })

    it('should record non-retryable errors', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'fatal-step',
        stepType: 'function',
      })

      const entry = appendEntry(journal, {
        type: 'step_failure',
        stepName: 'fatal-step',
        error: {
          message: 'Fatal error',
          retryable: false,
        },
      })

      expect(entry.error?.retryable).toBe(false)
    })
  })

  describe('appendEntry - Retry Events', () => {
    it('should append retry attempt entry', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'retry-step',
        stepType: 'function',
      })
      appendEntry(journal, {
        type: 'step_failure',
        stepName: 'retry-step',
        error: { message: 'First attempt failed' },
      })

      const entry = appendEntry(journal, {
        type: 'step_retry',
        stepName: 'retry-step',
        retryAttempt: 1,
        retryDelay: 1000,
      })

      expect(entry.type).toBe('step_retry')
      expect(entry.retryAttempt).toBe(1)
      expect(entry.retryDelay).toBe(1000)
    })

    it('should track multiple retry attempts', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'flaky-step',
        stepType: 'function',
      })

      for (let i = 1; i <= 3; i++) {
        appendEntry(journal, {
          type: 'step_failure',
          stepName: 'flaky-step',
          error: { message: `Attempt ${i} failed` },
        })
        appendEntry(journal, {
          type: 'step_retry',
          stepName: 'flaky-step',
          retryAttempt: i,
          retryDelay: 1000 * Math.pow(2, i - 1),
        })
      }

      const retryEntries = journal.entries.filter((e) => e.type === 'step_retry')
      expect(retryEntries).toHaveLength(3)
      expect(retryEntries[0].retryAttempt).toBe(1)
      expect(retryEntries[1].retryAttempt).toBe(2)
      expect(retryEntries[2].retryAttempt).toBe(3)
    })
  })

  describe('appendEntry - Workflow Events', () => {
    it('should append workflow start entry', () => {
      const entry = appendEntry(journal, {
        type: 'workflow_start',
        workflowArgs: { orderId: '123' },
      })

      expect(entry.type).toBe('workflow_start')
      expect(entry.workflowArgs).toEqual({ orderId: '123' })
    })

    it('should append workflow complete entry', () => {
      appendEntry(journal, {
        type: 'workflow_start',
        workflowArgs: {},
      })

      const entry = appendEntry(journal, {
        type: 'workflow_complete',
        workflowResult: { success: true },
      })

      expect(entry.type).toBe('workflow_complete')
      expect(entry.workflowResult).toEqual({ success: true })
    })

    it('should append workflow failure entry', () => {
      appendEntry(journal, {
        type: 'workflow_start',
        workflowArgs: {},
      })

      const entry = appendEntry(journal, {
        type: 'workflow_failure',
        error: {
          message: 'Workflow failed',
          stack: 'Error: Workflow failed...',
        },
      })

      expect(entry.type).toBe('workflow_failure')
      expect(entry.error?.message).toBe('Workflow failed')
    })

    it('should append workflow cancelled entry', () => {
      appendEntry(journal, {
        type: 'workflow_start',
        workflowArgs: {},
      })

      const entry = appendEntry(journal, {
        type: 'workflow_cancelled',
        reason: 'User requested cancellation',
      })

      expect(entry.type).toBe('workflow_cancelled')
      expect(entry.reason).toBe('User requested cancellation')
    })

    it('should append signal received entry', () => {
      const entry = appendEntry(journal, {
        type: 'signal_received',
        signalName: 'approval',
        signalPayload: { approved: true, approver: 'admin' },
      })

      expect(entry.type).toBe('signal_received')
      expect(entry.signalName).toBe('approval')
      expect(entry.signalPayload).toEqual({ approved: true, approver: 'admin' })
    })
  })

  describe('appendEntry - Version Increment', () => {
    it('should increment journal version on each append', () => {
      expect(journal.version).toBe(0)

      appendEntry(journal, {
        type: 'workflow_start',
        workflowArgs: {},
      })
      expect(journal.version).toBe(1)

      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step1',
        stepType: 'function',
      })
      expect(journal.version).toBe(2)
    })
  })
})

// ============================================================================
// Journal Replay Tests
// ============================================================================

describe('Journal Replay', () => {
  let journal: Journal

  beforeEach(() => {
    journal = createJournal('wf_replay_test')
  })

  describe('replayJournal', () => {
    it('should replay empty journal', () => {
      const state = replayJournal(journal)

      expect(state.completedSteps).toEqual({})
      expect(state.currentStep).toBeNull()
      expect(state.workflowResult).toBeUndefined()
      expect(state.workflowError).toBeUndefined()
    })

    it('should reconstruct completed step results', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step1',
        stepType: 'function',
      })
      appendEntry(journal, {
        type: 'step_complete',
        stepName: 'step1',
        output: { value: 42 },
      })
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step2',
        stepType: 'function',
      })
      appendEntry(journal, {
        type: 'step_complete',
        stepName: 'step2',
        output: 'done',
      })

      const state = replayJournal(journal)

      expect(state.completedSteps['step1']).toEqual({ value: 42 })
      expect(state.completedSteps['step2']).toBe('done')
    })

    it('should identify current in-progress step', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step1',
        stepType: 'function',
      })
      appendEntry(journal, {
        type: 'step_complete',
        stepName: 'step1',
        output: 'result1',
      })
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step2',
        stepType: 'function',
      })

      const state = replayJournal(journal)

      expect(state.currentStep).toBe('step2')
      expect(state.completedSteps['step1']).toBe('result1')
      expect(state.completedSteps['step2']).toBeUndefined()
    })

    it('should reconstruct workflow result', () => {
      appendEntry(journal, {
        type: 'workflow_start',
        workflowArgs: { input: 'test' },
      })
      appendEntry(journal, {
        type: 'workflow_complete',
        workflowResult: { success: true, data: 'result' },
      })

      const state = replayJournal(journal)

      expect(state.workflowResult).toEqual({ success: true, data: 'result' })
      expect(state.isComplete).toBe(true)
    })

    it('should reconstruct workflow error', () => {
      appendEntry(journal, {
        type: 'workflow_start',
        workflowArgs: {},
      })
      appendEntry(journal, {
        type: 'workflow_failure',
        error: { message: 'Workflow crashed' },
      })

      const state = replayJournal(journal)

      expect(state.workflowError?.message).toBe('Workflow crashed')
      expect(state.isFailed).toBe(true)
    })

    it('should track retry state', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'retry-step',
        stepType: 'function',
      })
      appendEntry(journal, {
        type: 'step_failure',
        stepName: 'retry-step',
        error: { message: 'Failed' },
      })
      appendEntry(journal, {
        type: 'step_retry',
        stepName: 'retry-step',
        retryAttempt: 1,
        retryDelay: 1000,
      })
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'retry-step',
        stepType: 'function',
      })

      const state = replayJournal(journal)

      expect(state.stepRetryCount['retry-step']).toBe(1)
      expect(state.currentStep).toBe('retry-step')
    })

    it('should handle parallel step completion', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'parallel-group',
        stepType: 'parallel',
      })
      appendEntry(journal, {
        type: 'step_complete',
        stepName: 'parallel-group',
        output: ['result1', 'result2', 'result3'],
      })

      const state = replayJournal(journal)

      expect(state.completedSteps['parallel-group']).toEqual([
        'result1',
        'result2',
        'result3',
      ])
    })

    it('should reconstruct waiting state', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'wait-approval',
        stepType: 'wait_for_event',
        input: { timeout: 86400000 },
      })

      const state = replayJournal(journal)

      expect(state.isWaiting).toBe(true)
      expect(state.waitingStep).toBe('wait-approval')
      expect(state.waitingFor).toBe('event')
    })

    it('should handle sleep state', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'delay',
        stepType: 'sleep',
        input: { duration: 5000 },
      })

      const state = replayJournal(journal)

      expect(state.isWaiting).toBe(true)
      expect(state.waitingStep).toBe('delay')
      expect(state.waitingFor).toBe('sleep')
    })

    it('should handle cancelled state', () => {
      appendEntry(journal, {
        type: 'workflow_start',
        workflowArgs: {},
      })
      appendEntry(journal, {
        type: 'workflow_cancelled',
        reason: 'Timeout exceeded',
      })

      const state = replayJournal(journal)

      expect(state.isCancelled).toBe(true)
      expect(state.cancellationReason).toBe('Timeout exceeded')
    })

    it('should reconstruct signals received', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'wait-signal',
        stepType: 'wait_for_event',
      })
      appendEntry(journal, {
        type: 'signal_received',
        signalName: 'approval',
        signalPayload: { approved: true },
      })
      appendEntry(journal, {
        type: 'step_complete',
        stepName: 'wait-signal',
        output: { type: 'approval', payload: { approved: true } },
      })

      const state = replayJournal(journal)

      expect(state.signalsReceived).toHaveLength(1)
      expect(state.signalsReceived[0].name).toBe('approval')
      expect(state.signalsReceived[0].payload).toEqual({ approved: true })
    })
  })

  describe('replayJournal - Partial Replay', () => {
    it('should replay up to a specific sequence number', () => {
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step1',
        stepType: 'function',
      })
      appendEntry(journal, {
        type: 'step_complete',
        stepName: 'step1',
        output: 'result1',
      })
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step2',
        stepType: 'function',
      })
      appendEntry(journal, {
        type: 'step_complete',
        stepName: 'step2',
        output: 'result2',
      })

      const state = replayJournal(journal, { upToSequence: 2 })

      expect(state.completedSteps['step1']).toBe('result1')
      expect(state.completedSteps['step2']).toBeUndefined()
    })

    it('should replay up to a specific timestamp', () => {
      const timestamp1 = Date.now()
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step1',
        stepType: 'function',
      })
      appendEntry(journal, {
        type: 'step_complete',
        stepName: 'step1',
        output: 'result1',
      })

      const timestamp2 = Date.now() + 1000

      // Entries after this point should be skipped
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step2',
        stepType: 'function',
      })

      const state = replayJournal(journal, { upToTimestamp: timestamp2 - 1 })

      expect(state.completedSteps['step1']).toBeDefined()
      // step2 might or might not be included depending on timing
    })
  })
})

// ============================================================================
// Journal Persistence Tests
// ============================================================================

describe('Journal Persistence', () => {
  let persistence: JournalPersistence

  beforeEach(() => {
    persistence = createInMemoryPersistence()
  })

  describe('save and load', () => {
    it('should save and load a journal', async () => {
      const journal = createJournal('wf_persist_test')
      appendEntry(journal, {
        type: 'workflow_start',
        workflowArgs: { test: true },
      })
      appendEntry(journal, {
        type: 'step_start',
        stepName: 'step1',
        stepType: 'function',
      })

      await persistence.save(journal)
      const loaded = await persistence.load(journal.id)

      expect(loaded).not.toBeNull()
      expect(loaded!.workflowId).toBe('wf_persist_test')
      expect(loaded!.entries).toHaveLength(2)
    })

    it('should return null for non-existent journal', async () => {
      const loaded = await persistence.load('non-existent-id')
      expect(loaded).toBeNull()
    })

    it('should preserve entry order', async () => {
      const journal = createJournal('wf_order_test')
      for (let i = 0; i < 10; i++) {
        appendEntry(journal, {
          type: 'step_start',
          stepName: `step${i}`,
          stepType: 'function',
        })
      }

      await persistence.save(journal)
      const loaded = await persistence.load(journal.id)

      for (let i = 0; i < 10; i++) {
        expect(loaded!.entries[i].stepName).toBe(`step${i}`)
      }
    })

    it('should handle concurrent saves with versioning', async () => {
      const journal = createJournal('wf_concurrent')
      appendEntry(journal, {
        type: 'workflow_start',
        workflowArgs: {},
      })

      await persistence.save(journal)

      // Simulate concurrent modification
      const loaded1 = await persistence.load(journal.id)
      const loaded2 = await persistence.load(journal.id)

      appendEntry(loaded1!, {
        type: 'step_start',
        stepName: 'step-a',
        stepType: 'function',
      })
      appendEntry(loaded2!, {
        type: 'step_start',
        stepName: 'step-b',
        stepType: 'function',
      })

      // First save should succeed
      await persistence.save(loaded1!)

      // Second save should fail due to version conflict
      await expect(persistence.save(loaded2!)).rejects.toThrow(/version conflict/i)
    })
  })

  describe('delete', () => {
    it('should delete a journal', async () => {
      const journal = createJournal('wf_delete_test')
      await persistence.save(journal)

      await persistence.delete(journal.id)

      const loaded = await persistence.load(journal.id)
      expect(loaded).toBeNull()
    })

    it('should not throw when deleting non-existent journal', async () => {
      await expect(persistence.delete('non-existent')).resolves.not.toThrow()
    })
  })

  describe('list', () => {
    it('should list all journals', async () => {
      const journal1 = createJournal('wf_1')
      const journal2 = createJournal('wf_2')
      const journal3 = createJournal('wf_3')

      await persistence.save(journal1)
      await persistence.save(journal2)
      await persistence.save(journal3)

      const journals = await persistence.list()

      expect(journals).toHaveLength(3)
      expect(journals.map((j) => j.workflowId).sort()).toEqual(['wf_1', 'wf_2', 'wf_3'])
    })

    it('should filter by workflow ID', async () => {
      const journal1 = createJournal('wf_a')
      const journal2 = createJournal('wf_b')
      await persistence.save(journal1)
      await persistence.save(journal2)

      const journals = await persistence.list({ workflowId: 'wf_a' })

      expect(journals).toHaveLength(1)
      expect(journals[0].workflowId).toBe('wf_a')
    })

    it('should filter by status', async () => {
      const journal1 = createJournal('wf_1')
      const journal2 = createJournal('wf_2')

      appendEntry(journal1, { type: 'workflow_start', workflowArgs: {} })
      appendEntry(journal1, { type: 'workflow_complete', workflowResult: {} })
      journal1.status = 'completed'

      appendEntry(journal2, { type: 'workflow_start', workflowArgs: {} })
      journal2.status = 'running'

      await persistence.save(journal1)
      await persistence.save(journal2)

      const completed = await persistence.list({ status: 'completed' })
      const running = await persistence.list({ status: 'running' })

      expect(completed).toHaveLength(1)
      expect(running).toHaveLength(1)
    })

    it('should support pagination', async () => {
      for (let i = 0; i < 25; i++) {
        await persistence.save(createJournal(`wf_${i}`))
      }

      const page1 = await persistence.list({ limit: 10, offset: 0 })
      const page2 = await persistence.list({ limit: 10, offset: 10 })
      const page3 = await persistence.list({ limit: 10, offset: 20 })

      expect(page1).toHaveLength(10)
      expect(page2).toHaveLength(10)
      expect(page3).toHaveLength(5)
    })
  })

  describe('append (incremental)', () => {
    it('should append entry without loading full journal', async () => {
      const journal = createJournal('wf_incremental')
      await persistence.save(journal)

      await persistence.append(journal.id, {
        type: 'workflow_start',
        workflowArgs: { fast: true },
      })

      const loaded = await persistence.load(journal.id)
      expect(loaded!.entries).toHaveLength(1)
      expect(loaded!.entries[0].type).toBe('workflow_start')
    })

    it('should throw when appending to non-existent journal', async () => {
      await expect(
        persistence.append('non-existent', {
          type: 'step_start',
          stepName: 'test',
          stepType: 'function',
        })
      ).rejects.toThrow(/not found/i)
    })
  })
})

// ============================================================================
// Journal Query Tests
// ============================================================================

describe('Journal Query', () => {
  let journal: Journal

  beforeEach(() => {
    journal = createJournal('wf_query_test')

    // Set up a journal with various entries
    appendEntry(journal, { type: 'workflow_start', workflowArgs: { orderId: '123' } })
    appendEntry(journal, { type: 'step_start', stepName: 'validate', stepType: 'function' })
    appendEntry(journal, { type: 'step_complete', stepName: 'validate', output: true })
    appendEntry(journal, { type: 'step_start', stepName: 'fetch-user', stepType: 'query' })
    appendEntry(journal, { type: 'step_complete', stepName: 'fetch-user', output: { id: 'u1' } })
    appendEntry(journal, { type: 'step_start', stepName: 'process', stepType: 'function' })
    appendEntry(journal, { type: 'step_failure', stepName: 'process', error: { message: 'Failed' } })
    appendEntry(journal, { type: 'step_retry', stepName: 'process', retryAttempt: 1, retryDelay: 1000 })
    appendEntry(journal, { type: 'step_start', stepName: 'process', stepType: 'function' })
    appendEntry(journal, { type: 'step_complete', stepName: 'process', output: 'done' })
    appendEntry(journal, { type: 'step_start', stepName: 'save-result', stepType: 'function' })
    appendEntry(journal, { type: 'step_complete', stepName: 'save-result', output: { saved: true } })
  })

  describe('getJournalEntries', () => {
    it('should return all entries', () => {
      const entries = getJournalEntries(journal)
      expect(entries).toHaveLength(12)
    })

    it('should filter by entry type', () => {
      const startEntries = getJournalEntries(journal, { type: 'step_start' })
      expect(startEntries).toHaveLength(5) // 4 unique steps + 1 retry

      const completeEntries = getJournalEntries(journal, { type: 'step_complete' })
      expect(completeEntries).toHaveLength(4)
    })

    it('should filter by step name', () => {
      const processEntries = getJournalEntries(journal, { stepName: 'process' })
      expect(processEntries).toHaveLength(5) // 2 starts + 1 failure + 1 retry + 1 complete
    })

    it('should filter by step type', () => {
      const queryEntries = getJournalEntries(journal, { stepType: 'query' })
      expect(queryEntries).toHaveLength(1)

      const functionEntries = getJournalEntries(journal, { stepType: 'function' })
      expect(functionEntries).toHaveLength(4)
    })

    it('should filter by time range', () => {
      const startTime = journal.entries[2].timestamp
      const endTime = journal.entries[5].timestamp

      const rangeEntries = getJournalEntries(journal, {
        fromTimestamp: startTime,
        toTimestamp: endTime,
      })

      expect(rangeEntries.length).toBeGreaterThan(0)
      rangeEntries.forEach((e) => {
        expect(e.timestamp).toBeGreaterThanOrEqual(startTime)
        expect(e.timestamp).toBeLessThanOrEqual(endTime)
      })
    })

    it('should filter by sequence range', () => {
      const rangeEntries = getJournalEntries(journal, {
        fromSequence: 3,
        toSequence: 6,
      })

      expect(rangeEntries).toHaveLength(4)
      rangeEntries.forEach((e) => {
        expect(e.sequence).toBeGreaterThanOrEqual(3)
        expect(e.sequence).toBeLessThanOrEqual(6)
      })
    })

    it('should combine multiple filters', () => {
      const entries = getJournalEntries(journal, {
        type: 'step_start',
        stepType: 'function',
      })

      expect(entries).toHaveLength(4)
      entries.forEach((e) => {
        expect(e.type).toBe('step_start')
        expect(e.stepType).toBe('function')
      })
    })
  })

  describe('getLatestEntry', () => {
    it('should return the most recent entry', () => {
      const latest = getJournalEntries(journal, { limit: 1, order: 'desc' })[0]
      expect(latest.type).toBe('step_complete')
      expect(latest.stepName).toBe('save-result')
    })
  })

  describe('getStepHistory', () => {
    it('should return all entries for a specific step', () => {
      const history = getJournalEntries(journal, { stepName: 'process' })

      expect(history).toHaveLength(5)
      expect(history[0].type).toBe('step_start')
      expect(history[1].type).toBe('step_failure')
      expect(history[2].type).toBe('step_retry')
      expect(history[3].type).toBe('step_start')
      expect(history[4].type).toBe('step_complete')
    })
  })
})

// ============================================================================
// Serialization Tests
// ============================================================================

describe('Journal Serialization', () => {
  let journal: Journal

  beforeEach(() => {
    journal = createJournal('wf_serialize_test')
    appendEntry(journal, { type: 'workflow_start', workflowArgs: { data: 'test' } })
    appendEntry(journal, { type: 'step_start', stepName: 'step1', stepType: 'function' })
    appendEntry(journal, { type: 'step_complete', stepName: 'step1', output: { result: 42 } })
  })

  describe('serializeJournal', () => {
    it('should serialize journal to JSON string', () => {
      const json = serializeJournal(journal)

      expect(typeof json).toBe('string')
      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('should preserve all journal properties', () => {
      const json = serializeJournal(journal)
      const parsed = JSON.parse(json)

      expect(parsed.id).toBe(journal.id)
      expect(parsed.workflowId).toBe(journal.workflowId)
      expect(parsed.version).toBe(journal.version)
      expect(parsed.createdAt).toBe(journal.createdAt)
      expect(parsed.entries).toHaveLength(3)
    })

    it('should handle complex nested data', () => {
      appendEntry(journal, {
        type: 'step_complete',
        stepName: 'complex-step',
        output: {
          nested: {
            array: [1, { a: 'b' }, [2, 3]],
            nullValue: null,
            boolean: true,
          },
        },
      })

      const json = serializeJournal(journal)
      const parsed = JSON.parse(json)
      const entry = parsed.entries[3]

      expect(entry.output.nested.array).toEqual([1, { a: 'b' }, [2, 3]])
      expect(entry.output.nested.nullValue).toBeNull()
      expect(entry.output.nested.boolean).toBe(true)
    })

    it('should handle undefined values', () => {
      appendEntry(journal, {
        type: 'step_complete',
        stepName: 'undefined-step',
        output: undefined,
      })

      const json = serializeJournal(journal)
      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('should support compact serialization', () => {
      const fullJson = serializeJournal(journal, { compact: false })
      const compactJson = serializeJournal(journal, { compact: true })

      expect(compactJson.length).toBeLessThan(fullJson.length)
    })
  })

  describe('deserializeJournal', () => {
    it('should deserialize JSON string to journal', () => {
      const json = serializeJournal(journal)
      const restored = deserializeJournal(json)

      expect(restored.id).toBe(journal.id)
      expect(restored.workflowId).toBe(journal.workflowId)
      expect(restored.entries).toHaveLength(journal.entries.length)
    })

    it('should restore entry types correctly', () => {
      const json = serializeJournal(journal)
      const restored = deserializeJournal(json)

      expect(restored.entries[0].type).toBe('workflow_start')
      expect(restored.entries[1].type).toBe('step_start')
      expect(restored.entries[2].type).toBe('step_complete')
    })

    it('should throw for invalid JSON', () => {
      expect(() => deserializeJournal('not valid json')).toThrow()
    })

    it('should throw for missing required fields', () => {
      expect(() => deserializeJournal('{"invalid": true}')).toThrow(/invalid journal/i)
    })

    it('should validate entry structure', () => {
      const invalidJson = JSON.stringify({
        id: 'j1',
        workflowId: 'wf1',
        version: 1,
        createdAt: Date.now(),
        status: 'running',
        entries: [{ invalid: 'entry' }],
      })

      expect(() => deserializeJournal(invalidJson)).toThrow(/invalid entry/i)
    })
  })

  describe('roundtrip serialization', () => {
    it('should preserve journal through serialize/deserialize cycle', () => {
      const json = serializeJournal(journal)
      const restored = deserializeJournal(json)

      expect(restored.id).toBe(journal.id)
      expect(restored.workflowId).toBe(journal.workflowId)
      expect(restored.version).toBe(journal.version)
      expect(restored.createdAt).toBe(journal.createdAt)

      restored.entries.forEach((entry, i) => {
        expect(entry.type).toBe(journal.entries[i].type)
        expect(entry.sequence).toBe(journal.entries[i].sequence)
        expect(entry.timestamp).toBe(journal.entries[i].timestamp)
      })
    })

    it('should preserve replay state through serialization', () => {
      const originalState = replayJournal(journal)

      const json = serializeJournal(journal)
      const restored = deserializeJournal(json)
      const restoredState = replayJournal(restored)

      expect(restoredState.completedSteps).toEqual(originalState.completedSteps)
    })
  })
})

// ============================================================================
// Journal Snapshot/Compaction Tests
// ============================================================================

describe('Journal Snapshot and Compaction', () => {
  let journal: Journal

  beforeEach(() => {
    journal = createJournal('wf_snapshot_test')

    // Create a journal with many entries
    appendEntry(journal, { type: 'workflow_start', workflowArgs: {} })
    for (let i = 0; i < 20; i++) {
      appendEntry(journal, {
        type: 'step_start',
        stepName: `step${i}`,
        stepType: 'function',
      })
      if (i < 10) {
        // First 10 steps fail and retry
        appendEntry(journal, {
          type: 'step_failure',
          stepName: `step${i}`,
          error: { message: 'Failed' },
        })
        appendEntry(journal, {
          type: 'step_retry',
          stepName: `step${i}`,
          retryAttempt: 1,
          retryDelay: 1000,
        })
        appendEntry(journal, {
          type: 'step_start',
          stepName: `step${i}`,
          stepType: 'function',
        })
      }
      appendEntry(journal, {
        type: 'step_complete',
        stepName: `step${i}`,
        output: i * 10,
      })
    }
  })

  describe('JournalSnapshot', () => {
    it('should create snapshot of current state', () => {
      const snapshot: JournalSnapshot = {
        journalId: journal.id,
        sequence: journal.entries[journal.entries.length - 1].sequence,
        timestamp: Date.now(),
        state: replayJournal(journal),
      }

      expect(snapshot.journalId).toBe(journal.id)
      expect(Object.keys(snapshot.state.completedSteps)).toHaveLength(20)
    })
  })

  describe('compactJournal', () => {
    it('should remove intermediate retry entries', () => {
      const compacted = compactJournal(journal)

      // Should only have start and complete for each step
      const retryEntries = compacted.entries.filter((e) => e.type === 'step_retry')
      expect(retryEntries).toHaveLength(0)
    })

    it('should preserve final state', () => {
      const originalState = replayJournal(journal)
      const compacted = compactJournal(journal)
      const compactedState = replayJournal(compacted)

      expect(compactedState.completedSteps).toEqual(originalState.completedSteps)
    })

    it('should reduce entry count', () => {
      const originalCount = journal.entries.length
      const compacted = compactJournal(journal)

      expect(compacted.entries.length).toBeLessThan(originalCount)
    })

    it('should keep only latest start/complete pair for each step', () => {
      const compacted = compactJournal(journal)

      // For steps that had retries, should only have final start + complete
      const step0Entries = compacted.entries.filter((e) => e.stepName === 'step0')
      expect(step0Entries).toHaveLength(2) // start + complete
    })

    it('should preserve error entries for failed workflows', () => {
      const failedJournal = createJournal('wf_failed')
      appendEntry(failedJournal, { type: 'workflow_start', workflowArgs: {} })
      appendEntry(failedJournal, { type: 'step_start', stepName: 'fail', stepType: 'function' })
      appendEntry(failedJournal, { type: 'step_failure', stepName: 'fail', error: { message: 'Fatal' } })
      appendEntry(failedJournal, { type: 'workflow_failure', error: { message: 'Workflow failed' } })

      const compacted = compactJournal(failedJournal)

      const failureEntry = compacted.entries.find((e) => e.type === 'step_failure')
      expect(failureEntry).toBeDefined()
    })

    it('should maintain journal validity after compaction', () => {
      const compacted = compactJournal(journal)

      // Should still be valid for replay
      expect(() => replayJournal(compacted)).not.toThrow()

      // Should still have workflow start
      expect(compacted.entries.find((e) => e.type === 'workflow_start')).toBeDefined()
    })
  })
})
