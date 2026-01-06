/**
 * Journal System - Layer 10
 * Issue: convex-ugx
 *
 * Provides durable logging of workflow execution steps,
 * enabling replay, recovery, and audit capabilities.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Types of journal entries
 */
export type JournalEntryType =
  | 'workflow_start'
  | 'workflow_complete'
  | 'workflow_failure'
  | 'workflow_cancelled'
  | 'step_start'
  | 'step_complete'
  | 'step_failure'
  | 'step_retry'
  | 'signal_received'

/**
 * Step types for journal entries
 */
export type StepType = 'function' | 'query' | 'mutation' | 'action' | 'sleep' | 'wait_for_event' | 'parallel'

/**
 * Error information in journal entries
 */
export interface JournalError {
  message: string
  stack?: string
  code?: string
  retryable?: boolean
}

/**
 * A single journal entry
 */
export interface JournalEntry {
  id: string
  type: JournalEntryType
  sequence: number
  timestamp: number
  stepName?: string
  stepType?: StepType
  input?: unknown
  output?: unknown
  error?: JournalError
  duration?: number
  functionRef?: string
  retryAttempt?: number
  retryDelay?: number
  workflowArgs?: unknown
  workflowResult?: unknown
  signalName?: string
  signalPayload?: unknown
  reason?: string
}

/**
 * Journal status
 */
export type JournalStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * A workflow journal
 */
export interface Journal {
  id: string
  workflowId: string
  version: number
  createdAt: number
  status: JournalStatus
  entries: JournalEntry[]
  metadata?: Record<string, unknown>
  parentJournalId?: string
}

/**
 * Options for creating a journal
 */
export interface CreateJournalOptions {
  metadata?: Record<string, unknown>
  parentJournalId?: string
}

/**
 * Input for appending an entry
 */
export interface AppendEntryInput {
  type: JournalEntryType
  stepName?: string
  stepType?: StepType
  input?: unknown
  output?: unknown
  error?: JournalError
  functionRef?: string
  retryAttempt?: number
  retryDelay?: number
  workflowArgs?: unknown
  workflowResult?: unknown
  signalName?: string
  signalPayload?: unknown
  reason?: string
}

/**
 * State reconstructed from journal replay
 */
export interface JournalReplayState {
  completedSteps: Record<string, unknown>
  currentStep: string | null
  workflowResult?: unknown
  workflowError?: JournalError
  isComplete: boolean
  isFailed: boolean
  isCancelled: boolean
  isWaiting: boolean
  waitingStep?: string
  waitingFor?: 'event' | 'sleep'
  stepRetryCount: Record<string, number>
  signalsReceived: Array<{ name: string; payload: unknown }>
  cancellationReason?: string
}

/**
 * Options for replaying a journal
 */
export interface ReplayOptions {
  upToSequence?: number
  upToTimestamp?: number
}

/**
 * Options for querying journal entries
 */
export interface JournalQueryOptions {
  type?: JournalEntryType
  stepName?: string
  stepType?: StepType
  fromTimestamp?: number
  toTimestamp?: number
  fromSequence?: number
  toSequence?: number
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
}

/**
 * Options for listing journals
 */
export interface JournalListOptions {
  workflowId?: string
  status?: JournalStatus
  limit?: number
  offset?: number
}

/**
 * Persistence interface for journals
 */
export interface JournalPersistence {
  save(journal: Journal): Promise<void>
  load(journalId: string): Promise<Journal | null>
  delete(journalId: string): Promise<void>
  list(options?: JournalListOptions): Promise<Journal[]>
  append(journalId: string, entry: AppendEntryInput): Promise<void>
}

/**
 * A snapshot of journal state
 */
export interface JournalSnapshot {
  journalId: string
  sequence: number
  timestamp: number
  state: JournalReplayState
}

/**
 * Options for serializing a journal
 */
export interface SerializeOptions {
  compact?: boolean
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new journal
 */
export function createJournal(workflowId: string, options?: CreateJournalOptions): Journal {
  return {
    id: `journal_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    workflowId,
    version: 0,
    createdAt: Date.now(),
    status: 'pending',
    entries: [],
    metadata: options?.metadata,
    parentJournalId: options?.parentJournalId,
  }
}

/**
 * Appends an entry to a journal
 */
export function appendEntry(journal: Journal, input: AppendEntryInput): JournalEntry {
  const sequence = journal.entries.length + 1
  const timestamp = Date.now()

  // Calculate duration for step_complete entries
  let duration: number | undefined
  if (input.type === 'step_complete' && input.stepName) {
    const startEntry = [...journal.entries]
      .reverse()
      .find((e) => e.type === 'step_start' && e.stepName === input.stepName)
    if (startEntry) {
      duration = timestamp - startEntry.timestamp
    }
  }

  const entry: JournalEntry = {
    id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    type: input.type,
    sequence,
    timestamp,
    stepName: input.stepName,
    stepType: input.stepType,
    input: input.input,
    output: input.output,
    error: input.error,
    duration,
    functionRef: input.functionRef,
    retryAttempt: input.retryAttempt,
    retryDelay: input.retryDelay,
    workflowArgs: input.workflowArgs,
    workflowResult: input.workflowResult,
    signalName: input.signalName,
    signalPayload: input.signalPayload,
    reason: input.reason,
  }

  journal.entries.push(entry)
  journal.version++

  return entry
}

/**
 * Replays a journal to reconstruct state
 */
export function replayJournal(journal: Journal, options?: ReplayOptions): JournalReplayState {
  const state: JournalReplayState = {
    completedSteps: {},
    currentStep: null,
    isComplete: false,
    isFailed: false,
    isCancelled: false,
    isWaiting: false,
    stepRetryCount: {},
    signalsReceived: [],
  }

  const entries = options?.upToSequence
    ? journal.entries.filter((e) => e.sequence <= options.upToSequence!)
    : options?.upToTimestamp
      ? journal.entries.filter((e) => e.timestamp <= options.upToTimestamp!)
      : journal.entries

  for (const entry of entries) {
    switch (entry.type) {
      case 'step_start':
        state.currentStep = entry.stepName || null
        if (entry.stepType === 'wait_for_event') {
          state.isWaiting = true
          state.waitingStep = entry.stepName
          state.waitingFor = 'event'
        } else if (entry.stepType === 'sleep') {
          state.isWaiting = true
          state.waitingStep = entry.stepName
          state.waitingFor = 'sleep'
        }
        break

      case 'step_complete':
        if (entry.stepName) {
          state.completedSteps[entry.stepName] = entry.output
          if (state.currentStep === entry.stepName) {
            state.currentStep = null
          }
          state.isWaiting = false
          state.waitingStep = undefined
          state.waitingFor = undefined
        }
        break

      case 'step_failure':
        // Step failed but may retry
        break

      case 'step_retry':
        if (entry.stepName) {
          state.stepRetryCount[entry.stepName] = entry.retryAttempt || 0
        }
        break

      case 'workflow_complete':
        state.workflowResult = entry.workflowResult
        state.isComplete = true
        state.currentStep = null
        break

      case 'workflow_failure':
        state.workflowError = entry.error
        state.isFailed = true
        break

      case 'workflow_cancelled':
        state.isCancelled = true
        state.cancellationReason = entry.reason
        break

      case 'signal_received':
        state.signalsReceived.push({
          name: entry.signalName || '',
          payload: entry.signalPayload,
        })
        break
    }
  }

  return state
}

/**
 * Gets journal entries with optional filtering
 */
export function getJournalEntries(journal: Journal, options?: JournalQueryOptions): JournalEntry[] {
  let entries = [...journal.entries]

  if (options?.type) {
    entries = entries.filter((e) => e.type === options.type)
  }
  if (options?.stepName) {
    entries = entries.filter((e) => e.stepName === options.stepName)
  }
  if (options?.stepType) {
    entries = entries.filter((e) => e.stepType === options.stepType)
  }
  if (options?.fromTimestamp !== undefined) {
    entries = entries.filter((e) => e.timestamp >= options.fromTimestamp!)
  }
  if (options?.toTimestamp !== undefined) {
    entries = entries.filter((e) => e.timestamp <= options.toTimestamp!)
  }
  if (options?.fromSequence !== undefined) {
    entries = entries.filter((e) => e.sequence >= options.fromSequence!)
  }
  if (options?.toSequence !== undefined) {
    entries = entries.filter((e) => e.sequence <= options.toSequence!)
  }

  if (options?.order === 'desc') {
    entries = entries.reverse()
  }

  if (options?.offset) {
    entries = entries.slice(options.offset)
  }
  if (options?.limit) {
    entries = entries.slice(0, options.limit)
  }

  return entries
}

/**
 * Serializes a journal to JSON string
 */
export function serializeJournal(journal: Journal, options?: SerializeOptions): string {
  if (options?.compact) {
    return JSON.stringify(journal)
  }
  return JSON.stringify(journal, null, 2)
}

/**
 * Deserializes a journal from JSON string
 */
export function deserializeJournal(json: string): Journal {
  const parsed = JSON.parse(json)

  // Validate required fields
  if (!parsed.id || !parsed.workflowId || parsed.version === undefined || !parsed.createdAt) {
    throw new Error('Invalid journal: missing required fields')
  }

  // Validate entries
  if (parsed.entries) {
    for (const entry of parsed.entries) {
      if (!entry.type || entry.sequence === undefined || entry.timestamp === undefined) {
        throw new Error('Invalid entry: missing required fields')
      }
    }
  }

  return parsed as Journal
}

/**
 * Compacts a journal by removing intermediate retry/failure entries
 */
export function compactJournal(journal: Journal): Journal {
  const compacted = createJournal(journal.workflowId, {
    metadata: journal.metadata,
    parentJournalId: journal.parentJournalId,
  })
  compacted.id = journal.id
  compacted.createdAt = journal.createdAt
  compacted.status = journal.status

  // Track which steps have completed
  const completedSteps = new Set<string>()
  const failedWorkflow = journal.entries.some((e) => e.type === 'workflow_failure')

  // First pass: identify completed steps
  for (const entry of journal.entries) {
    if (entry.type === 'step_complete' && entry.stepName) {
      completedSteps.add(entry.stepName)
    }
  }

  // Second pass: keep only relevant entries
  const stepLastStart: Map<string, JournalEntry> = new Map()
  const stepComplete: Map<string, JournalEntry> = new Map()

  for (const entry of journal.entries) {
    if (entry.type === 'workflow_start' || entry.type === 'workflow_complete' || entry.type === 'workflow_cancelled') {
      compacted.entries.push({ ...entry })
    } else if (entry.type === 'workflow_failure') {
      compacted.entries.push({ ...entry })
    } else if (entry.type === 'step_start' && entry.stepName) {
      stepLastStart.set(entry.stepName, entry)
    } else if (entry.type === 'step_complete' && entry.stepName) {
      stepComplete.set(entry.stepName, entry)
    } else if (entry.type === 'step_failure' && entry.stepName && failedWorkflow && !completedSteps.has(entry.stepName)) {
      // Keep failure entries for failed workflows where step didn't eventually complete
      compacted.entries.push({ ...entry })
    } else if (entry.type === 'signal_received') {
      compacted.entries.push({ ...entry })
    }
  }

  // Add final start/complete pairs
  for (const [stepName, startEntry] of stepLastStart) {
    compacted.entries.push({ ...startEntry })
    const completeEntry = stepComplete.get(stepName)
    if (completeEntry) {
      compacted.entries.push({ ...completeEntry })
    }
  }

  // Sort by sequence
  compacted.entries.sort((a, b) => a.sequence - b.sequence)

  // Renumber sequences
  compacted.entries.forEach((entry, idx) => {
    entry.sequence = idx + 1
  })

  compacted.version = compacted.entries.length

  return compacted
}

// ============================================================================
// In-Memory Persistence
// ============================================================================

/**
 * Creates an in-memory persistence implementation
 */
export function createInMemoryPersistence(): JournalPersistence {
  const journals = new Map<string, Journal>()
  const versions = new Map<string, number>()

  return {
    async save(journal: Journal): Promise<void> {
      const storedVersion = versions.get(journal.id)
      if (storedVersion !== undefined && storedVersion !== journal.version - journal.entries.length) {
        // Check if this is a concurrent modification
        const stored = journals.get(journal.id)
        if (stored && stored.version !== journal.version - 1 && journals.has(journal.id)) {
          // Only throw if there was a real concurrent modification
          const expectedVersion = versions.get(journal.id)
          if (expectedVersion !== undefined && journal.version - journal.entries.length !== expectedVersion) {
            throw new Error('Version conflict: journal was modified concurrently')
          }
        }
      }

      journals.set(journal.id, JSON.parse(JSON.stringify(journal)))
      versions.set(journal.id, journal.version)
    },

    async load(journalId: string): Promise<Journal | null> {
      const journal = journals.get(journalId)
      return journal ? JSON.parse(JSON.stringify(journal)) : null
    },

    async delete(journalId: string): Promise<void> {
      journals.delete(journalId)
      versions.delete(journalId)
    },

    async list(options?: JournalListOptions): Promise<Journal[]> {
      let result = Array.from(journals.values())

      if (options?.workflowId) {
        result = result.filter((j) => j.workflowId === options.workflowId)
      }
      if (options?.status) {
        result = result.filter((j) => j.status === options.status)
      }
      if (options?.offset) {
        result = result.slice(options.offset)
      }
      if (options?.limit) {
        result = result.slice(0, options.limit)
      }

      return result.map((j) => JSON.parse(JSON.stringify(j)))
    },

    async append(journalId: string, entry: AppendEntryInput): Promise<void> {
      const journal = journals.get(journalId)
      if (!journal) {
        throw new Error(`Journal not found: ${journalId}`)
      }

      appendEntry(journal, entry)
      versions.set(journalId, journal.version)
    },
  }
}
