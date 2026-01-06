/**
 * Workflow Implementation - Layer 10
 *
 * Provides durable workflow execution with step-based persistence.
 * This module implements the core workflow primitives including:
 * - Step execution with automatic retry and caching
 * - Duration parsing for timeouts and delays
 * - Unique ID generation for workflow tracking
 * - Workflow definition factory
 *
 * @module workflow
 * @packageDocumentation
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
  StepStatus,
} from './types'

// ============================================================================
// Constants
// ============================================================================

/** Workflow ID prefix for identification */
const WORKFLOW_ID_PREFIX = 'wf_'

/** Duration unit multipliers in milliseconds */
const DURATION_UNITS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
} as const

/** Regular expression pattern for parsing duration strings */
const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/

/** Default step options */
const DEFAULT_STEP_OPTIONS: Required<Omit<StepOptions, 'timeout'>> = {
  retries: 3,
  retryDelay: 1000,
  exponentialBackoff: true,
  maxRetryDelay: 60000,
} as const

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parses a duration value into milliseconds.
 *
 * Supports both numeric values (already in milliseconds) and string formats:
 * - `"100ms"` - milliseconds
 * - `"5s"` - seconds
 * - `"10m"` - minutes
 * - `"2h"` - hours
 * - `"1d"` - days
 *
 * @param duration - Duration as number (ms) or string with unit suffix
 * @returns Duration in milliseconds
 * @throws {Error} If the duration string format is invalid
 *
 * @example
 * ```typescript
 * parseDuration(5000)     // Returns: 5000
 * parseDuration('5s')     // Returns: 5000
 * parseDuration('1m')     // Returns: 60000
 * parseDuration('2h')     // Returns: 7200000
 * ```
 */
export function parseDuration(duration: number | string): number {
  if (typeof duration === 'number') {
    return duration
  }

  const match = duration.match(DURATION_PATTERN)
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`)
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]
  const multiplier = DURATION_UNITS[unit]

  if (multiplier === undefined) {
    throw new Error(`Unknown duration unit: ${unit}`)
  }

  return value * multiplier
}

/**
 * Generates a unique workflow execution ID.
 *
 * The generated ID follows the format: `wf_{timestamp}_{random}`
 * - `wf_` prefix identifies it as a workflow ID
 * - Timestamp provides temporal ordering
 * - Random suffix ensures uniqueness
 *
 * @returns A unique workflow ID string
 *
 * @example
 * ```typescript
 * const id = generateId()
 * // Returns something like: "wf_1699234567890_abc123d"
 * ```
 */
export function generateId(): string {
  const timestamp = Date.now()
  const randomPart = Math.random().toString(36).substring(2, 9)
  return `${WORKFLOW_ID_PREFIX}${timestamp}_${randomPart}`
}

/**
 * Extracts error information into a structured format.
 *
 * @param error - The error to extract information from
 * @returns Structured error information with message and optional stack trace
 */
function extractErrorInfo(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    message: String(error),
  }
}

/**
 * Calculates the delay for a retry attempt using optional exponential backoff.
 *
 * @param attempt - The current retry attempt number (0-indexed)
 * @param baseDelay - The base delay in milliseconds
 * @param useExponentialBackoff - Whether to apply exponential backoff
 * @param maxDelay - Maximum delay cap in milliseconds
 * @returns The calculated delay in milliseconds
 */
function calculateRetryDelay(
  attempt: number,
  baseDelay: number,
  useExponentialBackoff: boolean,
  maxDelay: number
): number {
  if (!useExponentialBackoff) {
    return baseDelay
  }
  const exponentialDelay = baseDelay * Math.pow(2, attempt)
  return Math.min(exponentialDelay, maxDelay)
}

/**
 * Delays execution for a specified duration.
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// Workflow Waiting Error
// ============================================================================

/**
 * Error thrown when a workflow is waiting for an external event or timer.
 *
 * This error is used internally to signal that a workflow has paused execution
 * and is waiting for something to happen (e.g., an event signal or sleep timer).
 * The workflow manager catches this error and handles the suspension appropriately.
 *
 * @example
 * ```typescript
 * // Thrown internally when waiting for an event
 * throw new WorkflowWaitingError('wait-for-approval', 'event')
 *
 * // Can be caught and handled by workflow orchestration
 * try {
 *   await executor.waitForEvent('approval')
 * } catch (error) {
 *   if (error instanceof WorkflowWaitingError) {
 *     // Handle workflow suspension
 *   }
 * }
 * ```
 */
export class WorkflowWaitingError extends Error {
  /** The name of the step that is waiting */
  public readonly stepName: string

  /** The type of wait (event or sleep) */
  public readonly waitType: 'event' | 'sleep'

  /**
   * Creates a new WorkflowWaitingError.
   *
   * @param stepName - The name of the step that is waiting
   * @param waitType - The type of wait ('event' or 'sleep')
   */
  constructor(stepName: string, waitType: 'event' | 'sleep') {
    super(`Workflow waiting for ${waitType} in step: ${stepName}`)
    this.name = 'WorkflowWaitingError'
    this.stepName = stepName
    this.waitType = waitType
  }
}

// ============================================================================
// Step Executor
// ============================================================================

/**
 * Configuration options for creating a StepExecutor.
 *
 * @typeParam TQuery - Type for query function references
 * @typeParam TMutation - Type for mutation function references
 * @typeParam TAction - Type for action function references
 */
interface StepExecutorOptions {
  /** Function to execute a query */
  runQuery: <T>(query: unknown, args: unknown) => Promise<T>
  /** Function to execute a mutation */
  runMutation: <T>(mutation: unknown, args: unknown) => Promise<T>
  /** Function to execute an action */
  runAction: <T>(action: unknown, args: unknown) => Promise<T>
  /** Function to persist execution state */
  saveExecution: (execution: WorkflowExecution) => Promise<void>
}

/**
 * Executes workflow steps with automatic persistence, caching, and retry logic.
 *
 * The StepExecutor is responsible for:
 * - Running individual workflow steps with retry capabilities
 * - Caching completed step results for replay
 * - Persisting step state for durability
 * - Handling parallel step execution
 * - Managing sleep and event waiting
 *
 * @example
 * ```typescript
 * const executor = new StepExecutor(execution, {
 *   runQuery: ctx.runQuery,
 *   runMutation: ctx.runMutation,
 *   runAction: ctx.runAction,
 *   saveExecution: async (exec) => await db.save(exec),
 * })
 *
 * // Execute a simple step
 * const result = await executor.run('compute-total', async () => {
 *   return items.reduce((sum, item) => sum + item.price, 0)
 * })
 * ```
 */
export class StepExecutor {
  /** The current workflow execution state */
  private readonly execution: WorkflowExecution

  /** Function to execute queries */
  private readonly runQuery: <T>(query: unknown, args: unknown) => Promise<T>

  /** Function to execute mutations */
  private readonly runMutation: <T>(mutation: unknown, args: unknown) => Promise<T>

  /** Function to execute actions */
  private readonly runAction: <T>(action: unknown, args: unknown) => Promise<T>

  /** Function to persist execution state */
  private readonly saveExecution: (execution: WorkflowExecution) => Promise<void>

  /**
   * Creates a new StepExecutor instance.
   *
   * @param execution - The workflow execution record to operate on
   * @param options - Configuration options including database operation functions
   */
  constructor(execution: WorkflowExecution, options: StepExecutorOptions) {
    this.execution = execution
    this.runQuery = options.runQuery
    this.runMutation = options.runMutation
    this.runAction = options.runAction
    this.saveExecution = options.saveExecution
  }

  // --------------------------------------------------------------------------
  // Public Step Execution Methods
  // --------------------------------------------------------------------------

  /**
   * Executes a function step with automatic persistence and retry.
   *
   * If the step has already completed in a previous execution, the cached
   * result is returned immediately without re-executing the function.
   *
   * @typeParam T - The return type of the step function
   * @param name - Unique name for this step within the workflow
   * @param fn - The function to execute (can be sync or async)
   * @param options - Optional retry and timeout configuration
   * @returns The result of the step function
   * @throws Rethrows any error from the step function after retry exhaustion
   *
   * @example
   * ```typescript
   * const total = await executor.run('calculate-total', async () => {
   *   const items = await fetchItems()
   *   return items.reduce((sum, item) => sum + item.price, 0)
   * }, { retries: 5, retryDelay: 2000 })
   * ```
   */
  async run<T>(name: string, fn: () => Promise<T> | T, options: StepOptions = {}): Promise<T> {
    // Return cached result if step already completed
    const cachedResult = this.getCachedStepResult<T>(name)
    if (cachedResult !== undefined) {
      return cachedResult
    }

    // Initialize and persist step as running
    const step = this.initializeStep(name, 'running')
    await this.saveExecution(this.execution)

    try {
      const result = await this.executeWithRetry(fn, options)
      this.completeStep(step, result)
      await this.saveExecution(this.execution)
      return result
    } catch (error) {
      this.failStep(step, error)
      await this.saveExecution(this.execution)
      throw error
    }
  }

  /**
   * Executes a database query as a workflow step.
   *
   * @typeParam T - The return type of the query
   * @param name - Unique name for this step
   * @param query - The query function reference
   * @param args - Arguments to pass to the query
   * @param options - Optional retry configuration
   * @returns The query result
   *
   * @example
   * ```typescript
   * const user = await executor.runQueryStep(
   *   'fetch-user',
   *   api.users.get,
   *   { id: userId }
   * )
   * ```
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
   * Executes a database mutation as a workflow step.
   *
   * @typeParam T - The return type of the mutation
   * @param name - Unique name for this step
   * @param mutation - The mutation function reference
   * @param args - Arguments to pass to the mutation
   * @param options - Optional retry configuration
   * @returns The mutation result
   *
   * @example
   * ```typescript
   * await executor.runMutationStep(
   *   'update-status',
   *   api.orders.updateStatus,
   *   { orderId, status: 'processing' }
   * )
   * ```
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
   * Executes an action as a workflow step.
   *
   * Actions are suitable for operations with side effects like sending emails,
   * making HTTP requests, or calling external services.
   *
   * @typeParam T - The return type of the action
   * @param name - Unique name for this step
   * @param action - The action function reference
   * @param args - Arguments to pass to the action
   * @param options - Optional retry configuration
   * @returns The action result
   *
   * @example
   * ```typescript
   * await executor.runActionStep(
   *   'send-confirmation',
   *   api.email.sendConfirmation,
   *   { to: userEmail, orderId }
   * )
   * ```
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
   * Pauses workflow execution for a specified duration.
   *
   * In production, this would schedule a wake-up timer rather than blocking.
   * The sleep is durable - if the workflow restarts, completed sleeps are skipped.
   *
   * @param name - Unique name for this sleep step
   * @param duration - Duration to sleep (number in ms or string like "5s", "1m")
   *
   * @example
   * ```typescript
   * // Wait for 30 seconds before next step
   * await executor.sleep('rate-limit-delay', '30s')
   *
   * // Wait for 5 minutes
   * await executor.sleep('cooldown-period', '5m')
   * ```
   */
  async sleep(name: string, duration: number | string): Promise<void> {
    const durationMs = parseDuration(duration)

    // Skip if sleep already completed
    const existingStep = this.findCompletedStep(name)
    if (existingStep) {
      return
    }

    // Initialize step with duration info
    const step = this.initializeStep(name, 'running', { duration: durationMs })
    await this.saveExecution(this.execution)

    // In production, this would schedule a wake-up instead of blocking
    await sleep(durationMs)

    this.completeStep(step)
    await this.saveExecution(this.execution)
  }

  /**
   * Suspends workflow execution until an external event is received.
   *
   * The workflow will pause at this point and resume when a matching
   * signal is sent via the workflow handle's `signal()` method.
   *
   * @typeParam T - The expected type of the event payload
   * @param name - Unique name for this wait step
   * @param options - Optional timeout and filter configuration
   * @returns The received event data
   * @throws {WorkflowWaitingError} Always throws to signal suspension (caught by manager)
   *
   * @example
   * ```typescript
   * // Wait for approval event
   * const approval = await executor.waitForEvent<ApprovalEvent>(
   *   'wait-for-approval',
   *   { timeout: '24h' }
   * )
   * ```
   */
  async waitForEvent<T>(name: string, options: WaitForEventOptions = {}): Promise<T> {
    // Return cached result if event already received
    const cachedResult = this.getCachedStepResult<T>(name)
    if (cachedResult !== undefined) {
      return cachedResult
    }

    // Initialize step as waiting
    this.initializeStep(name, 'running', options)
    await this.saveExecution(this.execution)

    // Throw to signal workflow suspension
    // In production, this registers an event listener
    throw new WorkflowWaitingError(name, 'event')
  }

  /**
   * Executes multiple steps in parallel.
   *
   * All steps run concurrently and the method returns when all complete.
   * If any step fails, the entire parallel block fails.
   *
   * @typeParam T - Tuple type of all step return values
   * @param name - Unique name for this parallel step group
   * @param steps - Array of step functions to execute in parallel
   * @returns Array of results in the same order as input steps
   *
   * @example
   * ```typescript
   * const [user, orders, notifications] = await executor.parallel(
   *   'fetch-dashboard-data',
   *   [
   *     () => fetchUser(userId),
   *     () => fetchOrders(userId),
   *     () => fetchNotifications(userId),
   *   ]
   * )
   * ```
   */
  async parallel<T extends readonly unknown[]>(
    name: string,
    steps: { [K in keyof T]: () => Promise<T[K]> }
  ): Promise<T> {
    // Return cached result if parallel step already completed
    const cachedResult = this.getCachedStepResult<T>(name)
    if (cachedResult !== undefined) {
      return cachedResult
    }

    // Initialize and persist step
    const step = this.initializeStep(name, 'running')
    await this.saveExecution(this.execution)

    try {
      const results = (await Promise.all(steps.map((s) => s()))) as unknown as T
      this.completeStep(step, results)
      await this.saveExecution(this.execution)
      return results
    } catch (error) {
      this.failStep(step, error)
      await this.saveExecution(this.execution)
      throw error
    }
  }

  // --------------------------------------------------------------------------
  // Private Helper Methods
  // --------------------------------------------------------------------------

  /**
   * Finds a step by name in the execution history.
   *
   * @param name - The step name to search for
   * @returns The step execution record if found, undefined otherwise
   */
  private findStep(name: string): StepExecution | undefined {
    return this.execution.steps.find((s) => s.name === name)
  }

  /**
   * Finds a completed step and returns it.
   *
   * @param name - The step name to search for
   * @returns The completed step if found, undefined otherwise
   */
  private findCompletedStep(name: string): StepExecution | undefined {
    const step = this.findStep(name)
    return step?.status === 'completed' ? step : undefined
  }

  /**
   * Gets the cached result from a completed step.
   *
   * @typeParam T - The expected result type
   * @param name - The step name to get result for
   * @returns The cached result if step completed, undefined otherwise
   */
  private getCachedStepResult<T>(name: string): T | undefined {
    const step = this.findCompletedStep(name)
    return step?.output as T | undefined
  }

  /**
   * Gets an existing step record or creates a new one.
   *
   * @param name - The step name
   * @returns The existing or newly created step execution record
   */
  private getOrCreateStep(name: string): StepExecution {
    let step = this.findStep(name)
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
   * Initializes a step for execution.
   *
   * @param name - The step name
   * @param status - Initial status to set
   * @param input - Optional input data to store
   * @returns The initialized step execution record
   */
  private initializeStep(
    name: string,
    status: StepStatus,
    input?: unknown
  ): StepExecution {
    const step = this.getOrCreateStep(name)
    step.status = status
    step.startTime = Date.now()
    if (input !== undefined) {
      step.input = input
    }
    return step
  }

  /**
   * Marks a step as completed with an optional result.
   *
   * @param step - The step to complete
   * @param output - Optional result value
   */
  private completeStep(step: StepExecution, output?: unknown): void {
    step.status = 'completed'
    step.endTime = Date.now()
    if (output !== undefined) {
      step.output = output
    }
  }

  /**
   * Marks a step as failed with error information.
   *
   * @param step - The step that failed
   * @param error - The error that caused the failure
   */
  private failStep(step: StepExecution, error: unknown): void {
    step.status = 'failed'
    step.error = extractErrorInfo(error)
    step.endTime = Date.now()
  }

  /**
   * Executes a function with automatic retry logic.
   *
   * Supports configurable retry count, delay, exponential backoff,
   * and maximum delay caps.
   *
   * @typeParam T - The return type of the function
   * @param fn - The function to execute
   * @param options - Retry configuration options
   * @returns The function result on success
   * @throws The last error encountered after all retries exhausted
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T> | T,
    options: StepOptions
  ): Promise<T> {
    const maxRetries = options.retries ?? DEFAULT_STEP_OPTIONS.retries
    const retryDelay = options.retryDelay ?? DEFAULT_STEP_OPTIONS.retryDelay
    const exponentialBackoff = options.exponentialBackoff ?? DEFAULT_STEP_OPTIONS.exponentialBackoff
    const maxRetryDelay = options.maxRetryDelay ?? DEFAULT_STEP_OPTIONS.maxRetryDelay

    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // If not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const delay = calculateRetryDelay(
            attempt,
            retryDelay,
            exponentialBackoff,
            maxRetryDelay
          )
          await sleep(delay)
        }
      }
    }

    throw lastError
  }
}

// ============================================================================
// Workflow Factory
// ============================================================================

/**
 * Options for defining a workflow.
 *
 * @typeParam Args - Type of the workflow input arguments
 * @typeParam Returns - Type of the workflow return value
 */
interface DefineWorkflowOptions<Args, Returns> {
  /** Unique name for the workflow */
  name: string
  /** The workflow handler function */
  handler: WorkflowHandler<Args, Returns>
  /** Optional configuration */
  config?: WorkflowConfig
}

/**
 * Defines a new workflow with the given configuration.
 *
 * Creates a registered workflow that can be executed by the WorkflowManager.
 * The workflow handler receives a context object with step execution methods
 * and the input arguments.
 *
 * @typeParam Args - Type of the workflow input arguments (defaults to unknown)
 * @typeParam Returns - Type of the workflow return value (defaults to unknown)
 * @param options - Workflow definition options
 * @returns A registered workflow object
 *
 * @example
 * ```typescript
 * interface OrderArgs {
 *   orderId: string
 *   items: Item[]
 * }
 *
 * interface OrderResult {
 *   total: number
 *   confirmationId: string
 * }
 *
 * const processOrder = defineWorkflow<OrderArgs, OrderResult>({
 *   name: 'process-order',
 *   handler: async (ctx, args) => {
 *     // Validate inventory
 *     await ctx.step.run('validate-inventory', async () => {
 *       // validation logic
 *     })
 *
 *     // Process payment
 *     const payment = await ctx.step.runAction(
 *       'charge-payment',
 *       api.payments.charge,
 *       { amount: total }
 *     )
 *
 *     return { total, confirmationId: payment.id }
 *   },
 *   config: {
 *     maxRetries: 5,
 *     timeout: '1h',
 *   },
 * })
 * ```
 */
export function defineWorkflow<Args = unknown, Returns = unknown>(
  options: DefineWorkflowOptions<Args, Returns>
): RegisteredWorkflow<Args, Returns> {
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
