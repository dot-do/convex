/**
 * Workflow Implementation - Layer 10
 *
 * Durable workflow execution with step-based persistence.
 */

import type {
  WorkflowCtx,
  WorkflowHandler,
  WorkflowConfig,
  RegisteredWorkflow,
  StepOptions,
  WaitForEventOptions,
  WorkflowExecution,
  StepExecution,
} from './types'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse duration string to milliseconds.
 * Supports: "1s", "1m", "1h", "1d", or number in ms
 */
export function parseDuration(duration: number | string): number {
  if (typeof duration === 'number') return duration

  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/)
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`)
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 'ms':
      return value
    case 's':
      return value * 1000
    case 'm':
      return value * 60 * 1000
    case 'h':
      return value * 60 * 60 * 1000
    case 'd':
      return value * 24 * 60 * 60 * 1000
    default:
      throw new Error(`Unknown duration unit: ${unit}`)
  }
}

/**
 * Generate a unique ID.
 */
export function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// ============================================================================
// Step Executor
// ============================================================================

/**
 * Executes workflow steps with persistence and retry logic.
 */
export class StepExecutor {
  private execution: WorkflowExecution
  private runQuery: <T>(query: unknown, args: unknown) => Promise<T>
  private runMutation: <T>(mutation: unknown, args: unknown) => Promise<T>
  private runAction: <T>(action: unknown, args: unknown) => Promise<T>
  private saveExecution: (execution: WorkflowExecution) => Promise<void>

  constructor(
    execution: WorkflowExecution,
    options: {
      runQuery: <T>(query: unknown, args: unknown) => Promise<T>
      runMutation: <T>(mutation: unknown, args: unknown) => Promise<T>
      runAction: <T>(action: unknown, args: unknown) => Promise<T>
      saveExecution: (execution: WorkflowExecution) => Promise<void>
    }
  ) {
    this.execution = execution
    this.runQuery = options.runQuery
    this.runMutation = options.runMutation
    this.runAction = options.runAction
    this.saveExecution = options.saveExecution
  }

  /**
   * Run a function step.
   */
  async run<T>(name: string, fn: () => Promise<T> | T, options: StepOptions = {}): Promise<T> {
    // Check if step already completed
    const existingStep = this.execution.steps.find((s) => s.name === name)
    if (existingStep?.status === 'completed') {
      return existingStep.output as T
    }

    // Create or get step record
    const step = this.getOrCreateStep(name)
    step.status = 'running'
    step.startTime = Date.now()
    await this.saveExecution(this.execution)

    try {
      const result = await this.executeWithRetry(fn, options)
      step.status = 'completed'
      step.output = result
      step.endTime = Date.now()
      await this.saveExecution(this.execution)
      return result
    } catch (error) {
      step.status = 'failed'
      step.error = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
      step.endTime = Date.now()
      await this.saveExecution(this.execution)
      throw error
    }
  }

  /**
   * Run a query step.
   */
  async runQueryStep<T>(
    name: string,
    query: unknown,
    args: unknown,
    options: StepOptions = {}
  ): Promise<T> {
    return this.run(name, () => this.runQuery<T>(query, args), options)
  }

  /**
   * Run a mutation step.
   */
  async runMutationStep<T>(
    name: string,
    mutation: unknown,
    args: unknown,
    options: StepOptions = {}
  ): Promise<T> {
    return this.run(name, () => this.runMutation<T>(mutation, args), options)
  }

  /**
   * Run an action step.
   */
  async runActionStep<T>(
    name: string,
    action: unknown,
    args: unknown,
    options: StepOptions = {}
  ): Promise<T> {
    return this.run(name, () => this.runAction<T>(action, args), options)
  }

  /**
   * Sleep for a duration.
   */
  async sleep(name: string, duration: number | string): Promise<void> {
    const ms = parseDuration(duration)

    // Check if sleep already completed
    const existingStep = this.execution.steps.find((s) => s.name === name)
    if (existingStep?.status === 'completed') {
      return
    }

    const step = this.getOrCreateStep(name)
    step.status = 'running'
    step.input = { duration: ms }
    step.startTime = Date.now()
    await this.saveExecution(this.execution)

    // In production, this would schedule a wake-up instead of blocking
    await new Promise((resolve) => setTimeout(resolve, ms))

    step.status = 'completed'
    step.endTime = Date.now()
    await this.saveExecution(this.execution)
  }

  /**
   * Wait for an event.
   */
  async waitForEvent<T>(name: string, options: WaitForEventOptions = {}): Promise<T> {
    const existingStep = this.execution.steps.find((s) => s.name === name)
    if (existingStep?.status === 'completed') {
      return existingStep.output as T
    }

    const step = this.getOrCreateStep(name)
    step.status = 'running'
    step.input = options
    step.startTime = Date.now()
    await this.saveExecution(this.execution)

    // In production, this would register an event listener
    // For now, throw an error indicating the workflow is waiting
    throw new WorkflowWaitingError(name, 'event')
  }

  /**
   * Run steps in parallel.
   */
  async parallel<T extends readonly unknown[]>(
    name: string,
    steps: { [K in keyof T]: () => Promise<T[K]> }
  ): Promise<T> {
    const existingStep = this.execution.steps.find((s) => s.name === name)
    if (existingStep?.status === 'completed') {
      return existingStep.output as T
    }

    const step = this.getOrCreateStep(name)
    step.status = 'running'
    step.startTime = Date.now()
    await this.saveExecution(this.execution)

    try {
      const results = (await Promise.all(steps.map((s) => s()))) as T
      step.status = 'completed'
      step.output = results
      step.endTime = Date.now()
      await this.saveExecution(this.execution)
      return results
    } catch (error) {
      step.status = 'failed'
      step.error = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
      step.endTime = Date.now()
      await this.saveExecution(this.execution)
      throw error
    }
  }

  /**
   * Get or create a step record.
   */
  private getOrCreateStep(name: string): StepExecution {
    let step = this.execution.steps.find((s) => s.name === name)
    if (!step) {
      step = {
        name,
        status: 'pending',
        startTime: 0,
        retryCount: 0,
      }
      this.execution.steps.push(step)
    }
    return step
  }

  /**
   * Execute with retry logic.
   */
  private async executeWithRetry<T>(fn: () => Promise<T> | T, options: StepOptions): Promise<T> {
    const maxRetries = options.retries ?? 3
    const retryDelay = options.retryDelay ?? 1000
    const exponentialBackoff = options.exponentialBackoff ?? true
    const maxRetryDelay = options.maxRetryDelay ?? 60000

    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < maxRetries) {
          const delay = exponentialBackoff
            ? Math.min(retryDelay * Math.pow(2, attempt), maxRetryDelay)
            : retryDelay
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError
  }
}

// ============================================================================
// Workflow Waiting Error
// ============================================================================

/**
 * Error thrown when a workflow is waiting for something (event, sleep, etc).
 */
export class WorkflowWaitingError extends Error {
  constructor(
    public stepName: string,
    public waitType: 'event' | 'sleep'
  ) {
    super(`Workflow waiting for ${waitType} in step: ${stepName}`)
    this.name = 'WorkflowWaitingError'
  }
}

// ============================================================================
// Workflow Factory
// ============================================================================

/**
 * Define a workflow.
 */
export function defineWorkflow<Args = unknown, Returns = unknown>(options: {
  name: string
  handler: WorkflowHandler<Args, Returns>
  config?: WorkflowConfig
}): RegisteredWorkflow<Args, Returns> {
  return {
    _type: 'workflow',
    _name: options.name,
    _handler: options.handler,
    _config: options.config ?? {},
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { WorkflowCtx, WorkflowHandler, WorkflowConfig, RegisteredWorkflow }
