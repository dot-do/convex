/**
 * Workflow Types - Layer 10
 *
 * Types for defining durable workflows with step-based execution.
 */

// ============================================================================
// Core Workflow Types
// ============================================================================

/**
 * Workflow execution status.
 */
export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'

/**
 * Step execution status.
 */
export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'cancelled'

/**
 * Workflow execution record stored in the database.
 */
export interface WorkflowExecution {
  /** Unique workflow execution ID */
  id: string
  /** Workflow name */
  name: string
  /** Current status */
  status: WorkflowStatus
  /** Input arguments */
  args: unknown
  /** Final result (if completed) */
  result?: unknown
  /** Error (if failed) */
  error?: {
    message: string
    stack?: string
  }
  /** Execution history */
  steps: StepExecution[]
  /** When the workflow started */
  startTime: number
  /** When the workflow ended (if completed/failed) */
  endTime?: number
  /** Next scheduled retry time */
  nextRetryTime?: number
  /** Number of retries attempted */
  retryCount: number
  /** Maximum retries allowed */
  maxRetries: number
  /** Timeout in milliseconds */
  timeout?: number
}

/**
 * Step execution record.
 */
export interface StepExecution {
  /** Step name */
  name: string
  /** Step status */
  status: StepStatus
  /** Step input */
  input?: unknown
  /** Step output */
  output?: unknown
  /** Error if failed */
  error?: {
    message: string
    stack?: string
  }
  /** Start time */
  startTime: number
  /** End time */
  endTime?: number
  /** Retry count for this step */
  retryCount: number
}

// ============================================================================
// Step Context Types
// ============================================================================

/**
 * Context passed to workflow functions.
 */
export interface WorkflowCtx {
  /**
   * Run a step with automatic persistence and retry.
   * If the step has already completed, the cached result is returned.
   */
  step: {
    /**
     * Run a function step.
     */
    run<T>(
      name: string,
      fn: () => Promise<T> | T,
      options?: StepOptions
    ): Promise<T>

    /**
     * Run a query step.
     */
    runQuery<T>(
      name: string,
      query: unknown,
      args: unknown,
      options?: StepOptions
    ): Promise<T>

    /**
     * Run a mutation step.
     */
    runMutation<T>(
      name: string,
      mutation: unknown,
      args: unknown,
      options?: StepOptions
    ): Promise<T>

    /**
     * Run an action step.
     */
    runAction<T>(
      name: string,
      action: unknown,
      args: unknown,
      options?: StepOptions
    ): Promise<T>

    /**
     * Sleep for a specified duration.
     */
    sleep(name: string, duration: number | string): Promise<void>

    /**
     * Wait for an event.
     */
    waitForEvent<T>(name: string, options?: WaitForEventOptions): Promise<T>

    /**
     * Run steps in parallel.
     */
    parallel<T extends readonly unknown[]>(
      name: string,
      steps: { [K in keyof T]: () => Promise<T[K]> }
    ): Promise<T>
  }

  /** Current workflow execution ID */
  workflowId: string

  /** Cancel the workflow */
  cancel(reason?: string): Promise<void>
}

/**
 * Options for step execution.
 */
export interface StepOptions {
  /** Maximum retries for this step (default: 3) */
  retries?: number
  /** Retry delay in ms (default: 1000) */
  retryDelay?: number
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean
  /** Maximum retry delay in ms (default: 60000) */
  maxRetryDelay?: number
  /** Step timeout in ms */
  timeout?: number
}

/**
 * Options for waiting for events.
 */
export interface WaitForEventOptions {
  /** Timeout for waiting (default: indefinite) */
  timeout?: number | string
  /** Event filter */
  filter?: Record<string, unknown>
}

// ============================================================================
// Workflow Definition Types
// ============================================================================

/**
 * Workflow handler function.
 */
export type WorkflowHandler<Args = unknown, Returns = unknown> = (
  ctx: WorkflowCtx,
  args: Args
) => Promise<Returns>

/**
 * Workflow configuration options.
 */
export interface WorkflowConfig {
  /** Maximum retries for the workflow (default: 3) */
  maxRetries?: number
  /** Workflow timeout in ms or duration string (default: 1 hour) */
  timeout?: number | string
  /** Whether to persist execution state (default: true) */
  persist?: boolean
}

/**
 * Registered workflow.
 */
export interface RegisteredWorkflow<Args = unknown, Returns = unknown> {
  readonly _type: 'workflow'
  readonly _name: string
  readonly _handler: WorkflowHandler<Args, Returns>
  readonly _config: WorkflowConfig
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Workflow event for signaling/communication.
 */
export interface WorkflowEvent {
  /** Event type */
  type: string
  /** Event payload */
  payload?: unknown
  /** Target workflow ID */
  workflowId: string
  /** Timestamp */
  timestamp: number
}

// ============================================================================
// Manager Types
// ============================================================================

/**
 * Options for starting a workflow.
 */
export interface StartWorkflowOptions {
  /** Custom workflow ID (auto-generated if not provided) */
  id?: string
  /** Override default timeout */
  timeout?: number | string
  /** Override max retries */
  maxRetries?: number
}

/**
 * Result of starting a workflow.
 */
export interface WorkflowHandle<Returns = unknown> {
  /** Workflow ID */
  id: string
  /** Wait for completion and get result */
  result(): Promise<Returns>
  /** Get current status */
  status(): Promise<WorkflowStatus>
  /** Cancel the workflow */
  cancel(reason?: string): Promise<void>
  /** Send an event to the workflow */
  signal(eventType: string, payload?: unknown): Promise<void>
}
