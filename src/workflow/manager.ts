/**
 * Workflow Manager - Layer 10
 *
 * Manages workflow executions, scheduling, and state persistence.
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
// Workflow Manager
// ============================================================================

/**
 * Manages workflow executions.
 */
export class WorkflowManager {
  private executions: Map<string, WorkflowExecution> = new Map()
  private workflows: Map<string, RegisteredWorkflow> = new Map()
  private runQuery: <T>(query: unknown, args: unknown) => Promise<T>
  private runMutation: <T>(mutation: unknown, args: unknown) => Promise<T>
  private runAction: <T>(action: unknown, args: unknown) => Promise<T>

  constructor(options: {
    runQuery: <T>(query: unknown, args: unknown) => Promise<T>
    runMutation: <T>(mutation: unknown, args: unknown) => Promise<T>
    runAction: <T>(action: unknown, args: unknown) => Promise<T>
  }) {
    this.runQuery = options.runQuery
    this.runMutation = options.runMutation
    this.runAction = options.runAction
  }

  /**
   * Register a workflow.
   */
  register(workflow: RegisteredWorkflow): void {
    this.workflows.set(workflow._name, workflow)
  }

  /**
   * Start a workflow execution.
   */
  async start<Args, Returns>(
    workflow: RegisteredWorkflow<Args, Returns>,
    args: Args,
    options: StartWorkflowOptions = {}
  ): Promise<WorkflowHandle<Returns>> {
    const id = options.id ?? generateId()
    const config = workflow._config

    // Create execution record
    const execution: WorkflowExecution = {
      id,
      name: workflow._name,
      status: 'pending',
      args,
      steps: [],
      startTime: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? config.maxRetries ?? 3,
      timeout: options.timeout
        ? parseDuration(options.timeout)
        : config.timeout
          ? parseDuration(config.timeout)
          : 3600000, // 1 hour default
    }

    this.executions.set(id, execution)

    // Start execution asynchronously
    this.executeWorkflow(workflow, execution).catch((error) => {
      console.error(`Workflow ${id} failed:`, error)
    })

    return this.createHandle<Returns>(id)
  }

  /**
   * Get a handle to an existing workflow.
   */
  getHandle<Returns = unknown>(id: string): WorkflowHandle<Returns> | null {
    if (!this.executions.has(id)) {
      return null
    }
    return this.createHandle<Returns>(id)
  }

  /**
   * Get workflow execution by ID.
   */
  getExecution(id: string): WorkflowExecution | null {
    return this.executions.get(id) ?? null
  }

  /**
   * List all workflow executions.
   */
  listExecutions(filter?: { status?: WorkflowStatus; name?: string }): WorkflowExecution[] {
    const executions = Array.from(this.executions.values())

    return executions.filter((e) => {
      if (filter?.status && e.status !== filter.status) return false
      if (filter?.name && e.name !== filter.name) return false
      return true
    })
  }

  /**
   * Cancel a workflow.
   */
  async cancel(id: string, reason?: string): Promise<void> {
    const execution = this.executions.get(id)
    if (!execution) {
      throw new Error(`Workflow not found: ${id}`)
    }

    if (execution.status === 'completed' || execution.status === 'failed') {
      throw new Error(`Cannot cancel workflow in status: ${execution.status}`)
    }

    execution.status = 'cancelled'
    execution.endTime = Date.now()
    execution.error = reason ? { message: reason } : undefined
  }

  /**
   * Send an event to a workflow.
   */
  async signal(id: string, eventType: string, payload?: unknown): Promise<void> {
    const execution = this.executions.get(id)
    if (!execution) {
      throw new Error(`Workflow not found: ${id}`)
    }

    // Find any steps waiting for events
    const waitingStep = execution.steps.find(
      (s) => s.status === 'running' && s.input && typeof s.input === 'object'
    )

    if (waitingStep) {
      waitingStep.output = { type: eventType, payload }
      waitingStep.status = 'completed'
      waitingStep.endTime = Date.now()

      // Resume the workflow
      const workflow = this.workflows.get(execution.name)
      if (workflow) {
        this.executeWorkflow(workflow, execution).catch((error) => {
          console.error(`Workflow ${id} resume failed:`, error)
        })
      }
    }
  }

  /**
   * Execute a workflow.
   */
  private async executeWorkflow(
    workflow: RegisteredWorkflow,
    execution: WorkflowExecution
  ): Promise<void> {
    execution.status = 'running'

    // Create step executor
    const stepExecutor = new StepExecutor(execution, {
      runQuery: this.runQuery,
      runMutation: this.runMutation,
      runAction: this.runAction,
      saveExecution: async (exec) => {
        this.executions.set(exec.id, exec)
      },
    })

    // Create workflow context
    const ctx: WorkflowCtx = {
      workflowId: execution.id,
      step: {
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
      },
      cancel: async (reason) => {
        await this.cancel(execution.id, reason)
      },
    }

    try {
      // Check for timeout
      const timeoutPromise = execution.timeout
        ? new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Workflow timed out')), execution.timeout)
          })
        : null

      // Execute workflow handler
      const handlerPromise = workflow._handler(ctx, execution.args)

      const result = timeoutPromise
        ? await Promise.race([handlerPromise, timeoutPromise])
        : await handlerPromise

      // Only mark as completed if not already cancelled
      if (execution.status !== 'cancelled') {
        execution.status = 'completed'
        execution.result = result
        execution.endTime = Date.now()
      }
    } catch (error) {
      if (error instanceof WorkflowWaitingError) {
        // Workflow is waiting for something, don't mark as failed
        return
      }

      if ((error as Error).message === 'Workflow timed out') {
        execution.status = 'timed_out'
      } else {
        execution.status = 'failed'
      }

      execution.error = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }
      execution.endTime = Date.now()
    }
  }

  /**
   * Create a handle for a workflow.
   */
  private createHandle<Returns>(id: string): WorkflowHandle<Returns> {
    return {
      id,
      result: async () => {
        // Poll until complete
        while (true) {
          const execution = this.executions.get(id)
          if (!execution) {
            throw new Error(`Workflow not found: ${id}`)
          }

          if (execution.status === 'completed') {
            return execution.result as Returns
          }

          if (execution.status === 'failed') {
            throw new Error(execution.error?.message ?? 'Workflow failed')
          }

          if (execution.status === 'cancelled') {
            throw new Error('Workflow was cancelled')
          }

          if (execution.status === 'timed_out') {
            throw new Error('Workflow timed out')
          }

          // Wait and check again
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      },
      status: async () => {
        const execution = this.executions.get(id)
        if (!execution) {
          throw new Error(`Workflow not found: ${id}`)
        }
        return execution.status
      },
      cancel: async (reason) => {
        await this.cancel(id, reason)
      },
      signal: async (eventType, payload) => {
        await this.signal(id, eventType, payload)
      },
    }
  }
}
