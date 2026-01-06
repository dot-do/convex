/**
 * Compensation Handlers - Layer 10
 * Issue: convex-04c
 *
 * Provides saga-pattern rollback capabilities for workflow steps,
 * enabling transactional consistency across distributed operations.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Context provided to compensation handlers
 */
export interface CompensationContext {
  stepName: string
  stepResult?: unknown
  stepInput?: unknown
  metadata?: Record<string, unknown>
}

/**
 * A compensation handler function
 */
export type CompensationHandler = (context: CompensationContext) => Promise<unknown> | unknown

/**
 * Options for registering a compensation
 */
export interface CompensationRegistrationOptions {
  stepResult?: unknown
  stepInput?: unknown
  metadata?: Record<string, unknown>
  override?: boolean
  dependencies?: string[]
  condition?: (ctx: CompensationContext) => boolean | Promise<boolean>
  policy?: CompensationPolicy
  undoCompensation?: CompensationHandler
}

/**
 * A registered compensation entry
 */
export interface CompensationEntry {
  handler: CompensationHandler
  stepResult?: unknown
  stepInput?: unknown
  metadata?: Record<string, unknown>
  dependencies?: string[]
  condition?: (ctx: CompensationContext) => boolean | Promise<boolean>
  policy?: CompensationPolicy
  undoCompensation?: CompensationHandler
}

/**
 * Registry for managing compensation handlers
 */
export interface CompensationRegistry {
  id: string
  workflowId?: string
  workflowName?: string
  size(): number
  has(stepName: string): boolean
  get(stepName: string): CompensationEntry | undefined
  remove(stepName: string): void
  clear(): void
  getSteps(): string[]
  getRegistrationOrder(): string[]
}

/**
 * Options for creating a compensation registry
 */
export interface CompensationRegistryOptions {
  workflowId?: string
  workflowName?: string
}

/**
 * Result of a single compensation execution
 */
export interface SingleCompensationResult {
  success: boolean
  result?: unknown
  error?: Error
  timeMs?: number
  skipped?: boolean
}

/**
 * Result of executing compensations
 */
export interface CompensationExecutionResult {
  success: boolean
  executedCount: number
  failedCount: number
  successCount?: number
  totalTimeMs: number
  results: Record<string, SingleCompensationResult>
}

/**
 * Policy for compensation execution
 */
export interface CompensationPolicy {
  retryPolicy?: {
    maxAttempts: number
    baseDelay?: number
  }
  timeout?: number
  continueOnError?: boolean
}

/**
 * Options for executing compensations
 */
export interface CompensationExecutionOptions {
  continueOnError?: boolean
  stopOnError?: boolean
  retryPolicy?: {
    maxAttempts: number
    baseDelay?: number
  }
  order?: 'forward' | 'reverse' | 'dependency-aware' | string[]
  parallel?: boolean
  maxConcurrency?: number
  only?: string[]
  exclude?: string[]
  fromStep?: string
  includeFromStep?: boolean
  policy?: CompensationPolicy
  strategy?: CompensationStrategy
}

/**
 * Compensation execution strategies
 */
export enum CompensationStrategy {
  FailFast = 'fail-fast',
  BestEffort = 'best-effort',
  AllOrNothing = 'all-or-nothing',
}

// ============================================================================
// Internal Registry Implementation
// ============================================================================

class CompensationRegistryImpl implements CompensationRegistry {
  id: string
  workflowId?: string
  workflowName?: string
  private entries: Map<string, CompensationEntry> = new Map()
  private order: string[] = []

  constructor(options?: CompensationRegistryOptions) {
    this.id = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    this.workflowId = options?.workflowId
    this.workflowName = options?.workflowName
  }

  size(): number {
    return this.entries.size
  }

  has(stepName: string): boolean {
    return this.entries.has(stepName)
  }

  get(stepName: string): CompensationEntry | undefined {
    return this.entries.get(stepName)
  }

  set(stepName: string, entry: CompensationEntry): void {
    if (!this.entries.has(stepName)) {
      this.order.push(stepName)
    }
    this.entries.set(stepName, entry)
  }

  remove(stepName: string): void {
    this.entries.delete(stepName)
    this.order = this.order.filter((s) => s !== stepName)
  }

  clear(): void {
    this.entries.clear()
    this.order = []
  }

  getSteps(): string[] {
    return Array.from(this.entries.keys())
  }

  getRegistrationOrder(): string[] {
    return [...this.order]
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new compensation registry
 */
export function createCompensationRegistry(
  options?: CompensationRegistryOptions
): CompensationRegistry {
  return new CompensationRegistryImpl(options)
}

/**
 * Registers a compensation handler for a step
 */
export function registerCompensation(
  registry: CompensationRegistry,
  stepName: string,
  handler: CompensationHandler,
  options?: CompensationRegistrationOptions
): void {
  if (registry.has(stepName) && !options?.override) {
    throw new Error(`Compensation for step "${stepName}" is already registered`)
  }

  const entry: CompensationEntry = {
    handler,
    stepResult: options?.stepResult,
    stepInput: options?.stepInput,
    metadata: options?.metadata,
    dependencies: options?.dependencies,
    condition: options?.condition,
    policy: options?.policy,
    undoCompensation: options?.undoCompensation,
  }

  ;(registry as CompensationRegistryImpl).set(stepName, entry)
}

/**
 * Executes all registered compensations
 */
export async function executeCompensations(
  registry: CompensationRegistry,
  options?: CompensationExecutionOptions
): Promise<CompensationExecutionResult> {
  const startTime = Date.now()
  const results: Record<string, SingleCompensationResult> = {}
  let executedCount = 0
  let failedCount = 0
  let successCount = 0
  const completedCompensations: Array<{ stepName: string; entry: CompensationEntry }> = []

  // Determine execution order
  let stepsToExecute = registry.getRegistrationOrder()

  // Apply filters
  if (options?.only) {
    stepsToExecute = stepsToExecute.filter((s) => options.only!.includes(s))
  }
  if (options?.exclude) {
    stepsToExecute = stepsToExecute.filter((s) => !options.exclude!.includes(s))
  }
  if (options?.fromStep) {
    const idx = stepsToExecute.indexOf(options.fromStep)
    if (idx !== -1) {
      stepsToExecute = options.includeFromStep
        ? stepsToExecute.slice(0, idx + 1)
        : stepsToExecute.slice(0, idx)
    }
  }

  // Apply order - FailFast and stopOnError use forward order by default
  if ((options?.strategy === CompensationStrategy.FailFast || options?.stopOnError) && !options?.order) {
    // Forward order for fail-fast/stopOnError (so we stop early if first steps fail)
    // Keep as-is
  } else if (options?.order === 'forward') {
    // Keep as-is
  } else if (Array.isArray(options?.order)) {
    stepsToExecute = options.order.filter((s) => stepsToExecute.includes(s))
  } else {
    // Default: reverse order
    stepsToExecute = stepsToExecute.reverse()
  }

  // Helper to execute with retry logic
  const executeWithRetry = async (
    stepName: string,
    entry: CompensationEntry,
    retryPolicy?: { maxAttempts: number; baseDelay?: number }
  ): Promise<{ success: boolean; result?: unknown; error?: Error }> => {
    const maxAttempts = retryPolicy?.maxAttempts || 1
    const baseDelay = retryPolicy?.baseDelay || 100
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const ctx: CompensationContext = {
          stepName,
          stepResult: entry.stepResult,
          stepInput: entry.stepInput,
          metadata: entry.metadata,
        }

        // Apply timeout if specified
        const policy = options?.policy || entry.policy
        let result: unknown

        if (policy?.timeout) {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Compensation timeout')), policy.timeout)
          })
          result = await Promise.race([entry.handler(ctx), timeoutPromise])
        } else {
          result = await entry.handler(ctx)
        }

        return { success: true, result }
      } catch (error) {
        lastError = error as Error
        if (attempt < maxAttempts) {
          // Wait before retry with exponential backoff
          await new Promise((resolve) => setTimeout(resolve, baseDelay * attempt))
        }
      }
    }

    return { success: false, error: lastError }
  }

  const executeStep = async (stepName: string): Promise<void> => {
    const entry = registry.get(stepName)
    if (!entry) return

    const stepStart = Date.now()
    executedCount++

    // Check condition
    if (entry.condition) {
      const ctx: CompensationContext = {
        stepName,
        stepResult: entry.stepResult,
        stepInput: entry.stepInput,
        metadata: entry.metadata,
      }
      const shouldExecute = await entry.condition(ctx)
      if (!shouldExecute) {
        results[stepName] = { success: true, skipped: true, timeMs: Date.now() - stepStart }
        return
      }
    }

    // Determine retry policy: per-step policy > execution options policy > execution options retryPolicy
    const stepPolicy = entry.policy
    const globalPolicy = options?.policy
    const retryPolicy = stepPolicy?.retryPolicy || globalPolicy?.retryPolicy || options?.retryPolicy

    const execResult = await executeWithRetry(stepName, entry, retryPolicy)

    if (execResult.success) {
      results[stepName] = {
        success: true,
        result: execResult.result,
        timeMs: Date.now() - stepStart,
      }
      successCount++
      completedCompensations.push({ stepName, entry })
    } else {
      failedCount++
      results[stepName] = {
        success: false,
        error: execResult.error,
        timeMs: Date.now() - stepStart,
      }

      // Handle strategies
      if (options?.strategy === CompensationStrategy.FailFast || options?.stopOnError) {
        throw execResult.error
      }
    }
  }

  let allOrNothingFailed = false
  try {
    if (options?.parallel) {
      const concurrency = options.maxConcurrency || Infinity
      const chunks: string[][] = []
      for (let i = 0; i < stepsToExecute.length; i += concurrency) {
        chunks.push(stepsToExecute.slice(i, i + concurrency))
      }
      for (const chunk of chunks) {
        await Promise.all(chunk.map(executeStep))
      }
    } else {
      for (const stepName of stepsToExecute) {
        await executeStep(stepName)
      }
    }
  } catch {
    // Mark as failed for AllOrNothing strategy
    if (options?.strategy === CompensationStrategy.AllOrNothing) {
      allOrNothingFailed = true
    }
    // Continue - error already recorded
  }

  // Handle AllOrNothing rollback - undo completed compensations if any failed
  if (options?.strategy === CompensationStrategy.AllOrNothing && (allOrNothingFailed || failedCount > 0)) {
    for (const { stepName, entry } of completedCompensations) {
      if (entry.undoCompensation) {
        try {
          const ctx: CompensationContext = {
            stepName,
            stepResult: entry.stepResult,
            stepInput: entry.stepInput,
            metadata: entry.metadata,
          }
          await entry.undoCompensation(ctx)
        } catch {
          // Ignore undo errors in AllOrNothing cleanup
        }
      }
    }
  }

  return {
    success: failedCount === 0,
    executedCount,
    failedCount,
    successCount,
    totalTimeMs: Date.now() - startTime,
    results,
  }
}

// ============================================================================
// Compensation Scope
// ============================================================================

/**
 * A scope for grouping compensations hierarchically
 */
export class CompensationScope {
  private name: string
  private registry: CompensationRegistry
  private children: CompensationScope[] = []
  private parent?: CompensationScope

  constructor(name: string, parent?: CompensationScope) {
    this.name = name
    this.registry = createCompensationRegistry()
    this.parent = parent
  }

  createChild(name: string): CompensationScope {
    const child = new CompensationScope(name, this)
    this.children.push(child)
    return child
  }

  getChildren(): CompensationScope[] {
    return [...this.children]
  }

  register(stepName: string, handler: CompensationHandler, options?: CompensationRegistrationOptions): void {
    registerCompensation(this.registry, stepName, handler, options)
  }

  has(stepName: string): boolean {
    return this.registry.has(stepName)
  }

  async compensate(options?: CompensationExecutionOptions): Promise<CompensationExecutionResult> {
    // Compensate children first (depth-first, reverse order)
    for (const child of [...this.children].reverse()) {
      await child.compensate(options)
    }

    // Then compensate this scope
    return executeCompensations(this.registry, options)
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wraps a step execution with automatic compensation registration
 */
export async function withCompensation<T>(
  registry: CompensationRegistry,
  stepName: string,
  step: () => Promise<T>,
  compensation: CompensationHandler,
  options?: Omit<CompensationRegistrationOptions, 'stepResult'>
): Promise<T> {
  const result = await step()

  registerCompensation(registry, stepName, compensation, {
    ...options,
    stepResult: result,
  })

  return result
}

/**
 * Options for creating a compensable step
 */
export interface CompensableStepOptions<TInput, TOutput> {
  name: string
  execute: (input: TInput) => Promise<TOutput>
  compensate: (ctx: CompensationContext & { stepResult: TOutput }) => Promise<unknown>
}

/**
 * A reusable compensable step
 */
export interface CompensableStep<TInput, TOutput> {
  run(registry: CompensationRegistry, input: TInput): Promise<TOutput>
}

/**
 * Creates a reusable compensable step
 */
export function createCompensableStep<TInput, TOutput>(
  options: CompensableStepOptions<TInput, TOutput>
): CompensableStep<TInput, TOutput> {
  return {
    async run(registry: CompensationRegistry, input: TInput): Promise<TOutput> {
      const result = await options.execute(input)

      registerCompensation(registry, options.name, (ctx) => {
        return options.compensate(ctx as CompensationContext & { stepResult: TOutput })
      }, {
        stepResult: result,
        stepInput: input,
      })

      return result
    },
  }
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown during compensation execution
 */
export class CompensationError extends Error {
  stepName: string
  cause?: Error
  errors?: CompensationError[]

  constructor(
    stepName: string,
    message: string,
    options?: { cause?: Error }
  ) {
    super(message)
    this.name = 'CompensationError'
    this.stepName = stepName
    this.cause = options?.cause
  }

  static aggregate(errors: CompensationError[]): CompensationError {
    const error = new CompensationError(
      'multiple',
      `Multiple compensation failures: ${errors.map((e) => e.message).join(', ')}`
    )
    error.errors = errors
    return error
  }
}
