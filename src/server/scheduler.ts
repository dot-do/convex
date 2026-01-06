/**
 * Scheduler implementation for delayed function execution.
 *
 * Provides ctx.scheduler.runAfter(), ctx.scheduler.runAt(), and ctx.scheduler.cancel()
 * functionality for Convex mutations and actions.
 */

import type { Scheduler } from './context'
import type { FunctionReference, ScheduledFunctionId } from '../types'

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum delay allowed (30 days in milliseconds)
 */
const MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Maximum function path length
 */
const MAX_PATH_LENGTH = 500

// ============================================================================
// Types
// ============================================================================

/**
 * Status of a scheduled job
 */
type ScheduledJobStatus = 'pending' | 'executed' | 'canceled'

/**
 * Internal representation of a scheduled job
 */
interface ScheduledJob {
  id: ScheduledFunctionId
  functionPath: string
  functionType: 'mutation' | 'action'
  args: unknown
  scheduledTime: number
  status: ScheduledJobStatus
  timerId?: ReturnType<typeof setTimeout>
}

/**
 * Options for creating a scheduler
 */
export interface SchedulerOptions {
  /**
   * Callback for when a job should execute
   */
  onExecute?: (job: ScheduledJob) => void | Promise<void>

  /**
   * Storage for persisting jobs (for Durable Objects)
   */
  storage?: {
    get(key: string): Promise<ScheduledJob | null>
    put(key: string, value: ScheduledJob): Promise<void>
    delete(key: string): Promise<void>
    list(): Promise<Map<string, ScheduledJob>>
  }
}

// ============================================================================
// SchedulerImpl Class
// ============================================================================

/**
 * Implementation of the Scheduler interface.
 */
export class SchedulerImpl implements Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map()
  private idCounter = 0
  private options: SchedulerOptions

  constructor(options: SchedulerOptions = {}) {
    this.options = options
  }

  /**
   * Generate a unique ID for a scheduled function
   */
  private generateId(): ScheduledFunctionId {
    const timestamp = Date.now()
    const counter = this.idCounter++
    const random = Math.random().toString(36).substring(2, 8)
    return `sched_${timestamp}_${counter}_${random}` as ScheduledFunctionId
  }

  /**
   * Validate a function reference
   */
  private validateFunctionReference(
    functionReference: FunctionReference<'mutation' | 'action'>
  ): void {
    if (functionReference === undefined) {
      throw new Error('Invalid function reference: undefined')
    }

    if (functionReference === null) {
      throw new Error('Invalid function reference: null')
    }

    if (typeof functionReference !== 'object') {
      throw new Error('Invalid function reference: must be an object')
    }

    if (!functionReference._path) {
      throw new Error('Invalid function reference: missing _path')
    }

    if (functionReference._path === '') {
      throw new Error('Invalid function reference: empty _path')
    }

    if (functionReference._path.length > MAX_PATH_LENGTH) {
      throw new Error(`Invalid function path: exceeds maximum length of ${MAX_PATH_LENGTH}`)
    }

    if (functionReference._type === 'query') {
      throw new Error('Cannot schedule a query function. Only mutations and actions can be scheduled.')
    }
  }

  /**
   * Validate a delay value in milliseconds
   */
  private validateDelay(delayMs: number): void {
    if (typeof delayMs !== 'number' || Number.isNaN(delayMs)) {
      throw new Error('Invalid delay: must be a valid number, got NaN')
    }

    if (!Number.isFinite(delayMs)) {
      throw new Error('Invalid delay: cannot be Infinity')
    }

    if (delayMs < 0) {
      throw new Error('Invalid delay: cannot be negative')
    }

    if (delayMs > MAX_DELAY_MS) {
      throw new Error(`Invalid delay: exceeds maximum of ${MAX_DELAY_MS}ms (30 days)`)
    }
  }

  /**
   * Validate a timestamp value
   */
  private validateTimestamp(timestamp: number): void {
    if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
      throw new Error('Invalid timestamp: must be a valid number, got NaN')
    }

    if (!Number.isFinite(timestamp)) {
      throw new Error('Invalid timestamp: cannot be Infinity')
    }

    if (timestamp < 0) {
      throw new Error('Invalid timestamp: cannot be negative')
    }

    const now = Date.now()
    if (timestamp < now) {
      throw new Error('Invalid timestamp: cannot schedule in the past')
    }
  }

  /**
   * Schedule a job to execute at a specific time
   */
  private scheduleJob(job: ScheduledJob): void {
    const delay = Math.max(0, job.scheduledTime - Date.now())

    job.timerId = setTimeout(async () => {
      const currentJob = this.jobs.get(job.id)
      if (currentJob && currentJob.status === 'pending') {
        currentJob.status = 'executed'
        this.jobs.set(job.id, currentJob)

        if (this.options.onExecute) {
          await this.options.onExecute(currentJob)
        }
      }
    }, delay)

    this.jobs.set(job.id, job)
  }

  /**
   * Schedule a function to run after a delay.
   */
  async runAfter<F extends FunctionReference<'mutation' | 'action'>>(
    delayMs: number,
    functionReference: F,
    args: F['_args']
  ): Promise<ScheduledFunctionId> {
    this.validateFunctionReference(functionReference)
    this.validateDelay(delayMs)

    const id = this.generateId()
    const scheduledTime = Date.now() + delayMs

    const job: ScheduledJob = {
      id,
      functionPath: functionReference._path,
      functionType: functionReference._type as 'mutation' | 'action',
      args,
      scheduledTime,
      status: 'pending',
    }

    this.scheduleJob(job)

    // Persist to storage if available
    if (this.options.storage) {
      await this.options.storage.put(id, job)
    }

    return id
  }

  /**
   * Schedule a function to run at a specific time.
   */
  async runAt<F extends FunctionReference<'mutation' | 'action'>>(
    timestamp: number | Date,
    functionReference: F,
    args: F['_args']
  ): Promise<ScheduledFunctionId> {
    this.validateFunctionReference(functionReference)

    // Convert Date to timestamp
    let timestampMs: number
    if (timestamp instanceof Date) {
      timestampMs = timestamp.getTime()
      if (Number.isNaN(timestampMs)) {
        throw new Error('Invalid Date object')
      }
    } else {
      timestampMs = timestamp
    }

    this.validateTimestamp(timestampMs)

    const id = this.generateId()

    const job: ScheduledJob = {
      id,
      functionPath: functionReference._path,
      functionType: functionReference._type as 'mutation' | 'action',
      args,
      scheduledTime: timestampMs,
      status: 'pending',
    }

    this.scheduleJob(job)

    // Persist to storage if available
    if (this.options.storage) {
      await this.options.storage.put(id, job)
    }

    return id
  }

  /**
   * Cancel a scheduled function.
   */
  async cancel(scheduledFunctionId: ScheduledFunctionId): Promise<void> {
    const job = this.jobs.get(scheduledFunctionId)

    if (!job) {
      throw new Error(`Scheduled function not found: ${scheduledFunctionId}`)
    }

    if (job.status === 'executed') {
      throw new Error(`Cannot cancel: function has already been executed`)
    }

    if (job.status === 'canceled') {
      throw new Error(`Cannot cancel: function has already been canceled`)
    }

    // Clear the timer
    if (job.timerId) {
      clearTimeout(job.timerId)
    }

    job.status = 'canceled'
    this.jobs.set(scheduledFunctionId, job)

    // Update storage if available
    if (this.options.storage) {
      await this.options.storage.put(scheduledFunctionId, job)
    }
  }

  /**
   * Get a scheduled job by ID (for testing/inspection)
   */
  getJob(id: ScheduledFunctionId): ScheduledJob | undefined {
    return this.jobs.get(id)
  }

  /**
   * Get all scheduled jobs (for testing/inspection)
   */
  getAllJobs(): Map<string, ScheduledJob> {
    return new Map(this.jobs)
  }

  /**
   * Clear all scheduled jobs (for testing/cleanup)
   */
  clearAll(): void {
    for (const job of this.jobs.values()) {
      if (job.timerId) {
        clearTimeout(job.timerId)
      }
    }
    this.jobs.clear()
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Scheduler instance.
 */
export function createScheduler(options: SchedulerOptions = {}): Scheduler {
  return new SchedulerImpl(options)
}
