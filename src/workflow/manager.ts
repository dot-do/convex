/**
 * Workflow Manager - Layer 10
 *
 * Provides orchestration and lifecycle management for durable workflows.
 * The WorkflowManager is responsible for:
 * - Starting and tracking workflow executions
 * - Managing workflow state persistence
 * - Handling workflow cancellation and signaling
 * - Creating workflow handles for external interaction
 *
 * @module workflow/manager
 * @packageDocumentation
 */

import type {
  WorkflowExecution,
  WorkflowStatus,
  RegisteredWorkflow,
  WorkflowHandle,
  StartWorkflowOptions,
  WorkflowCtx,
} from './types'
import { StepExecutor, generateId, parseDuration, WorkflowWaitingError } from './workflow'

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for workflows in milliseconds (1 hour) */
const DEFAULT_WORKFLOW_TIMEOUT_MS = 3600000

/** Default maximum retries for workflows */
const DEFAULT_MAX_RETRIES = 3

/** Polling interval for waiting on workflow results (in milliseconds) */
const RESULT_POLL_INTERVAL_MS = 100

/** Error message for workflow timeout */
const TIMEOUT_ERROR_MESSAGE = 'Workflow timed out'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration options for creating a WorkflowManager.
 *
 * Provides the database operation functions needed to execute
 * queries, mutations, and actions within workflow steps.
 */
interface WorkflowManagerOptions {
  /** Function to execute database queries */
  runQuery: <T>(query: unknown, args: unknown) => Promise<T>
  /** Function to execute database mutations */
  runMutation: <T>(mutation: unknown, args: unknown) => Promise<T>
  /** Function to execute actions */
  runAction: <T>(action: unknown, args: unknown) => Promise<T>
}

/**
 * Filter options for listing workflow executions.
 */
interface ExecutionFilter {
  /** Filter by workflow status */
  status?: WorkflowStatus
  /** Filter by workflow name */
  name?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolves the timeout value from multiple sources with priority.
 *
 * Priority order: start options > workflow config > default
 *
 * @param startTimeout - Timeout from start options (highest priority)
 * @param configTimeout - Timeout from workflow config
 * @returns Resolved timeout in milliseconds
 */
function resolveTimeout(
  startTimeout?: number | string,
  configTimeout?: number | string
): number {
  if (startTimeout !== undefined) {
    return parseDuration(startTimeout)
  }
  if (configTimeout !== undefined) {
    return parseDuration(configTimeout)
  }
  return DEFAULT_WORKFLOW_TIMEOUT_MS
}

/**
 * Resolves the max retries value from multiple sources with priority.
 *
 * @param startRetries - Max retries from start options (highest priority)
 * @param configRetries - Max retries from workflow config
 * @returns Resolved max retries count
 */
function resolveMaxRetries(startRetries?: number, configRetries?: number): number {
  return startRetries ?? configRetries ?? DEFAULT_MAX_RETRIES
}

/**
 * Extracts error information into a structured format.
 *
 * @param error - The error to extract information from
 * @returns Structured error information with message and optional stack
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
 * Checks if an error is a timeout error.
 *
 * @param error - The error to check
 * @returns True if the error indicates a workflow timeout
 */
function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === TIMEOUT_ERROR_MESSAGE
}

/**
 * Creates a promise that rejects after a specified timeout.
 *
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns Promise that rejects with a timeout error
 */
function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(TIMEOUT_ERROR_MESSAGE)), timeoutMs)
  })
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
// Workflow Manager
// ============================================================================

/**
 * Manages workflow executions, scheduling, and state persistence.
 *
 * The WorkflowManager provides the primary interface for:
 * - Registering workflow definitions
 * - Starting new workflow executions
 * - Retrieving workflow handles and execution state
 * - Canceling running workflows
 * - Sending signals/events to waiting workflows
 *
 * @example
 * ```typescript
 * // Create a workflow manager
 * const manager = new WorkflowManager({
 *   runQuery: ctx.runQuery,
 *   runMutation: ctx.runMutation,
 *   runAction: ctx.runAction,
 * })
 *
 * // Register workflows
 * manager.register(orderWorkflow)
 * manager.register(refundWorkflow)
 *
 * // Start a workflow
 * const handle = await manager.start(orderWorkflow, { orderId: '123' })
 *
 * // Wait for result
 * const result = await handle.result()
 * ```
 */
export class WorkflowManager {
  /** Map of workflow execution ID to execution record */
  private readonly executions: Map<string, WorkflowExecution> = new Map()

  /** Map of workflow name to registered workflow definition */
  private readonly workflows: Map<string, RegisteredWorkflow> = new Map()

  /** Function to execute database queries */
  private readonly runQuery: <T>(query: unknown, args: unknown) => Promise<T>

  /** Function to execute database mutations */
  private readonly runMutation: <T>(mutation: unknown, args: unknown) => Promise<T>

  /** Function to execute actions */
  private readonly runAction: <T>(action: unknown, args: unknown) => Promise<T>

  /**
   * Creates a new WorkflowManager instance.
   *
   * @param options - Configuration options including database operation functions
   *
   * @example
   * ```typescript
   * const manager = new WorkflowManager({
   *   runQuery: async (query, args) => db.query(query, args),
   *   runMutation: async (mutation, args) => db.mutate(mutation, args),
   *   runAction: async (action, args) => actions.run(action, args),
   * })
   * ```
   */
  constructor(options: WorkflowManagerOptions) {
    this.runQuery = options.runQuery
    this.runMutation = options.runMutation
    this.runAction = options.runAction
  }

  // --------------------------------------------------------------------------
  // Public Registration Methods
  // --------------------------------------------------------------------------

  /**
   * Registers a workflow definition with the manager.
   *
   * Registered workflows can be referenced by name for resumption
   * and event handling.
   *
   * @param workflow - The workflow definition to register
   *
   * @example
   * ```typescript
   * const orderWorkflow = defineWorkflow({
   *   name: 'process-order',
   *   handler: async (ctx, args) => { ... }
   * })
   *
   * manager.register(orderWorkflow)
   * ```
   */
  register(workflow: RegisteredWorkflow): void {
    this.workflows.set(workflow._name, workflow)
  }

  // --------------------------------------------------------------------------
  // Public Execution Methods
  // --------------------------------------------------------------------------

  /**
   * Starts a new workflow execution.
   *
   * Creates a new execution record, stores it, and begins
   * executing the workflow handler asynchronously.
   *
   * @typeParam Args - Type of the workflow input arguments
   * @typeParam Returns - Type of the workflow return value
   * @param workflow - The workflow definition to execute
   * @param args - Arguments to pass to the workflow handler
   * @param options - Optional configuration (custom ID, timeout, retries)
   * @returns A handle for interacting with the workflow execution
   *
   * @example
   * ```typescript
   * // Start with default options
   * const handle = await manager.start(orderWorkflow, { orderId: '123' })
   *
   * // Start with custom options
   * const handle = await manager.start(orderWorkflow, { orderId: '123' }, {
   *   id: 'order-123-workflow',
   *   timeout: '2h',
   *   maxRetries: 5,
   * })
   * ```
   */
  async start<Args, Returns>(
    workflow: RegisteredWorkflow<Args, Returns>,
    args: Args,
    options: StartWorkflowOptions = {}
  ): Promise<WorkflowHandle<Returns>> {
    const execution = this.createExecution(workflow, args, options)
    this.executions.set(execution.id, execution)

    // Start execution asynchronously (fire and forget)
    this.executeWorkflowAsync(workflow, execution)

    return this.createHandle<Returns>(execution.id)
  }

  /**
   * Gets a handle to an existing workflow execution.
   *
   * @typeParam Returns - Expected type of the workflow result
   * @param id - The workflow execution ID
   * @returns A handle if the execution exists, null otherwise
   *
   * @example
   * ```typescript
   * const handle = manager.getHandle<OrderResult>('wf_123_abc')
   * if (handle) {
   *   const result = await handle.result()
   * }
   * ```
   */
  getHandle<Returns = unknown>(id: string): WorkflowHandle<Returns> | null {
    if (!this.executions.has(id)) {
      return null
    }
    return this.createHandle<Returns>(id)
  }

  /**
   * Gets the execution record for a workflow.
   *
   * @param id - The workflow execution ID
   * @returns The execution record if found, null otherwise
   *
   * @example
   * ```typescript
   * const execution = manager.getExecution('wf_123_abc')
   * if (execution) {
   *   console.log(`Status: ${execution.status}`)
   *   console.log(`Steps completed: ${execution.steps.length}`)
   * }
   * ```
   */
  getExecution(id: string): WorkflowExecution | null {
    return this.executions.get(id) ?? null
  }

  /**
   * Lists all workflow executions, optionally filtered.
   *
   * @param filter - Optional filter criteria (status, name)
   * @returns Array of matching execution records
   *
   * @example
   * ```typescript
   * // List all executions
   * const all = manager.listExecutions()
   *
   * // List running workflows
   * const running = manager.listExecutions({ status: 'running' })
   *
   * // List order workflows
   * const orders = manager.listExecutions({ name: 'process-order' })
   * ```
   */
  listExecutions(filter?: ExecutionFilter): WorkflowExecution[] {
    const executions = Array.from(this.executions.values())
    return this.filterExecutions(executions, filter)
  }

  // --------------------------------------------------------------------------
  // Public Control Methods
  // --------------------------------------------------------------------------

  /**
   * Cancels a running workflow.
   *
   * @param id - The workflow execution ID
   * @param reason - Optional cancellation reason
   * @throws {Error} If workflow not found or already completed/failed
   *
   * @example
   * ```typescript
   * await manager.cancel('wf_123_abc', 'User requested cancellation')
   * ```
   */
  async cancel(id: string, reason?: string): Promise<void> {
    const execution = this.getExecutionOrThrow(id)
    this.validateCancellable(execution)

    execution.status = 'cancelled'
    execution.endTime = Date.now()
    if (reason) {
      execution.error = { message: reason }
    }
  }

  /**
   * Sends a signal/event to a waiting workflow.
   *
   * If the workflow is waiting for an event (via `waitForEvent`),
   * this will resume its execution with the provided payload.
   *
   * @param id - The workflow execution ID
   * @param eventType - The type of event being sent
   * @param payload - Optional event payload
   * @throws {Error} If workflow not found
   *
   * @example
   * ```typescript
   * // Send approval event
   * await manager.signal('wf_123_abc', 'approval', {
   *   approved: true,
   *   approver: 'admin@example.com'
   * })
   * ```
   */
  async signal(id: string, eventType: string, payload?: unknown): Promise<void> {
    const execution = this.getExecutionOrThrow(id)
    const waitingStep = this.findWaitingStep(execution)

    if (waitingStep) {
      this.completeWaitingStep(waitingStep, eventType, payload)
      this.resumeWorkflow(execution)
    }
  }

  // --------------------------------------------------------------------------
  // Private Execution Creation
  // --------------------------------------------------------------------------

  /**
   * Creates a new workflow execution record.
   *
   * @param workflow - The workflow definition
   * @param args - The workflow arguments
   * @param options - Start options
   * @returns The new execution record
   */
  private createExecution<Args>(
    workflow: RegisteredWorkflow<Args, unknown>,
    args: Args,
    options: StartWorkflowOptions
  ): WorkflowExecution {
    const config = workflow._config

    return {
      id: options.id ?? generateId(),
      name: workflow._name,
      status: 'pending',
      args,
      steps: [],
      startTime: Date.now(),
      retryCount: 0,
      maxRetries: resolveMaxRetries(options.maxRetries, config.maxRetries),
      timeout: resolveTimeout(options.timeout, config.timeout),
    }
  }

  // --------------------------------------------------------------------------
  // Private Workflow Execution
  // --------------------------------------------------------------------------

  /**
   * Starts workflow execution asynchronously.
   *
   * @param workflow - The workflow definition
   * @param execution - The execution record
   */
  private executeWorkflowAsync(
    workflow: RegisteredWorkflow,
    execution: WorkflowExecution
  ): void {
    this.executeWorkflow(workflow, execution).catch((error) => {
      console.error(`Workflow ${execution.id} failed:`, error)
    })
  }

  /**
   * Executes a workflow to completion.
   *
   * @param workflow - The workflow definition
   * @param execution - The execution record
   */
  private async executeWorkflow(
    workflow: RegisteredWorkflow,
    execution: WorkflowExecution
  ): Promise<void> {
    execution.status = 'running'

    const ctx = this.createWorkflowContext(execution)

    try {
      const result = await this.executeWithTimeout(workflow, ctx, execution)
      this.handleWorkflowSuccess(execution, result)
    } catch (error) {
      this.handleWorkflowError(execution, error)
    }
  }

  /**
   * Executes the workflow handler with optional timeout.
   *
   * @param workflow - The workflow definition
   * @param ctx - The workflow context
   * @param execution - The execution record
   * @returns The workflow result
   */
  private async executeWithTimeout(
    workflow: RegisteredWorkflow,
    ctx: WorkflowCtx,
    execution: WorkflowExecution
  ): Promise<unknown> {
    const handlerPromise = workflow._handler(ctx, execution.args)

    if (execution.timeout) {
      const timeoutPromise = createTimeoutPromise(execution.timeout)
      return Promise.race([handlerPromise, timeoutPromise])
    }

    return handlerPromise
  }

  /**
   * Handles successful workflow completion.
   *
   * @param execution - The execution record
   * @param result - The workflow result
   */
  private handleWorkflowSuccess(execution: WorkflowExecution, result: unknown): void {
    // Only mark as completed if not already cancelled
    if (execution.status !== 'cancelled') {
      execution.status = 'completed'
      execution.result = result
      execution.endTime = Date.now()
    }
  }

  /**
   * Handles workflow execution errors.
   *
   * @param execution - The execution record
   * @param error - The error that occurred
   */
  private handleWorkflowError(execution: WorkflowExecution, error: unknown): void {
    // Workflow waiting errors are expected and handled specially
    if (error instanceof WorkflowWaitingError) {
      return
    }

    execution.status = isTimeoutError(error) ? 'timed_out' : 'failed'
    execution.error = extractErrorInfo(error)
    execution.endTime = Date.now()
  }

  // --------------------------------------------------------------------------
  // Private Context Creation
  // --------------------------------------------------------------------------

  /**
   * Creates the workflow context for step execution.
   *
   * @param execution - The execution record
   * @returns The workflow context
   */
  private createWorkflowContext(execution: WorkflowExecution): WorkflowCtx {
    const stepExecutor = this.createStepExecutor(execution)

    return {
      workflowId: execution.id,
      step: this.createStepInterface(stepExecutor),
      cancel: async (reason) => {
        await this.cancel(execution.id, reason)
      },
    }
  }

  /**
   * Creates a step executor for the workflow.
   *
   * @param execution - The execution record
   * @returns The step executor
   */
  private createStepExecutor(execution: WorkflowExecution): StepExecutor {
    return new StepExecutor(execution, {
      runQuery: this.runQuery,
      runMutation: this.runMutation,
      runAction: this.runAction,
      saveExecution: async (exec) => {
        this.executions.set(exec.id, exec)
      },
    })
  }

  /**
   * Creates the step interface for the workflow context.
   *
   * @param stepExecutor - The step executor
   * @returns The step interface object
   */
  private createStepInterface(stepExecutor: StepExecutor): WorkflowCtx['step'] {
    return {
      run: (name, fn, options) => stepExecutor.run(name, fn, options),
      runQuery: (name, query, args, options) =>
        stepExecutor.runQueryStep(name, query, args, options),
      runMutation: (name, mutation, args, options) =>
        stepExecutor.runMutationStep(name, mutation, args, options),
      runAction: (name, action, args, options) =>
        stepExecutor.runActionStep(name, action, args, options),
      sleep: (name, duration) => stepExecutor.sleep(name, duration),
      waitForEvent: (name, options) => stepExecutor.waitForEvent(name, options),
      parallel: (name, steps) => stepExecutor.parallel(name, steps),
    }
  }

  // --------------------------------------------------------------------------
  // Private Handle Creation
  // --------------------------------------------------------------------------

  /**
   * Creates a handle for interacting with a workflow.
   *
   * @typeParam Returns - Expected type of the workflow result
   * @param id - The workflow execution ID
   * @returns A workflow handle
   */
  private createHandle<Returns>(id: string): WorkflowHandle<Returns> {
    return {
      id,
      result: () => this.waitForResult<Returns>(id),
      status: () => this.getStatus(id),
      cancel: (reason) => this.cancel(id, reason),
      signal: (eventType, payload) => this.signal(id, eventType, payload),
    }
  }

  /**
   * Waits for a workflow to complete and returns the result.
   *
   * @typeParam Returns - Expected type of the workflow result
   * @param id - The workflow execution ID
   * @returns The workflow result
   * @throws {Error} If workflow fails, is cancelled, or times out
   */
  private async waitForResult<Returns>(id: string): Promise<Returns> {
    while (true) {
      const execution = this.getExecutionOrThrow(id)

      switch (execution.status) {
        case 'completed':
          return execution.result as Returns
        case 'failed':
          throw new Error(execution.error?.message ?? 'Workflow failed')
        case 'cancelled':
          throw new Error('Workflow was cancelled')
        case 'timed_out':
          throw new Error('Workflow timed out')
        default:
          // Still running, wait and poll again
          await sleep(RESULT_POLL_INTERVAL_MS)
      }
    }
  }

  /**
   * Gets the current status of a workflow.
   *
   * @param id - The workflow execution ID
   * @returns The workflow status
   * @throws {Error} If workflow not found
   */
  private async getStatus(id: string): Promise<WorkflowStatus> {
    const execution = this.getExecutionOrThrow(id)
    return execution.status
  }

  // --------------------------------------------------------------------------
  // Private Signal/Event Handling
  // --------------------------------------------------------------------------

  /**
   * Finds a step that is waiting for an event.
   *
   * @param execution - The execution record
   * @returns The waiting step if found, undefined otherwise
   */
  private findWaitingStep(
    execution: WorkflowExecution
  ): WorkflowExecution['steps'][0] | undefined {
    return execution.steps.find(
      (s) => s.status === 'running' && s.input && typeof s.input === 'object'
    )
  }

  /**
   * Completes a waiting step with the received event.
   *
   * @param step - The step to complete
   * @param eventType - The event type
   * @param payload - The event payload
   */
  private completeWaitingStep(
    step: WorkflowExecution['steps'][0],
    eventType: string,
    payload?: unknown
  ): void {
    step.output = { type: eventType, payload }
    step.status = 'completed'
    step.endTime = Date.now()
  }

  /**
   * Resumes a workflow after receiving an event.
   *
   * @param execution - The execution record
   */
  private resumeWorkflow(execution: WorkflowExecution): void {
    const workflow = this.workflows.get(execution.name)
    if (workflow) {
      this.executeWorkflowAsync(workflow, execution)
    }
  }

  // --------------------------------------------------------------------------
  // Private Validation & Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Gets an execution or throws if not found.
   *
   * @param id - The workflow execution ID
   * @returns The execution record
   * @throws {Error} If workflow not found
   */
  private getExecutionOrThrow(id: string): WorkflowExecution {
    const execution = this.executions.get(id)
    if (!execution) {
      throw new Error(`Workflow not found: ${id}`)
    }
    return execution
  }

  /**
   * Validates that a workflow can be cancelled.
   *
   * @param execution - The execution record
   * @throws {Error} If workflow is already completed or failed
   */
  private validateCancellable(execution: WorkflowExecution): void {
    if (execution.status === 'completed' || execution.status === 'failed') {
      throw new Error(`Cannot cancel workflow in status: ${execution.status}`)
    }
  }

  /**
   * Filters executions based on provided criteria.
   *
   * @param executions - The executions to filter
   * @param filter - The filter criteria
   * @returns Filtered executions
   */
  private filterExecutions(
    executions: WorkflowExecution[],
    filter?: ExecutionFilter
  ): WorkflowExecution[] {
    if (!filter) {
      return executions
    }

    return executions.filter((e) => {
      if (filter.status && e.status !== filter.status) {
        return false
      }
      if (filter.name && e.name !== filter.name) {
        return false
      }
      return true
    })
  }
}
