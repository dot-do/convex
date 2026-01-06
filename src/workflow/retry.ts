/**
 * Retry Logic - Layer 10
 * Issue: convex-08z
 *
 * Provides configurable retry strategies for workflow steps,
 * including backoff strategies, error classification, and retry limits.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Retry strategy types
 */
export type RetryStrategyType = 'exponential' | 'linear' | 'constant' | 'fibonacci' | 'decorrelated'

/**
 * Custom retry strategy function
 */
export type RetryStrategyFunction = (attempt: number, options: { baseDelay: number; maxDelay: number }) => number

/**
 * Retry strategy - can be a type name or custom function
 */
export type RetryStrategy = RetryStrategyType | RetryStrategyFunction

/**
 * Context provided during retry attempts
 */
export interface RetryContext {
  stepName: string
  attempt: number
  totalRetries: number
  startTime: number
  totalElapsedMs: number
  lastError?: Error
  delayMs?: number
}

/**
 * Callback for retry events
 */
export type OnRetryCallback = (context: RetryContext & { error: Error; delayMs: number }) => void

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  threshold: number
  resetTimeout: number
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  strategy: RetryStrategy
  jitter: boolean
  jitterFactor: number
  timeout?: number
  maxTotalTime?: number
  shouldRetry?: (error: Error) => boolean
  onRetry?: OnRetryCallback
  immediateRetry?: boolean
  respectRetryAfter?: boolean
  returnDetailedResult?: boolean
  circuitBreaker?: CircuitBreakerConfig
}

/**
 * Options for creating a retry policy
 */
export interface RetryPolicyOptions {
  maxAttempts?: number
  baseDelay?: number
  maxDelay?: number
  strategy?: RetryStrategy
  jitter?: boolean
  jitterFactor?: number
  timeout?: number
  maxTotalTime?: number
  shouldRetry?: (error: Error) => boolean
  onRetry?: OnRetryCallback
  immediateRetry?: boolean
  respectRetryAfter?: boolean
  returnDetailedResult?: boolean
  circuitBreaker?: CircuitBreakerConfig
}

/**
 * Detailed retry result
 */
export interface RetryResult<T> {
  success: boolean
  value?: T
  error?: Error
  attempts: number
  totalTime: number
  errors?: Error[]
}

/**
 * Error classification types
 */
export enum ErrorClassification {
  Retryable = 'retryable',
  NonRetryable = 'non-retryable',
  RetryableWithBackoff = 'retryable-with-backoff',
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error that should be retried
 */
export class RetryableError extends Error {
  retryable = true
  retryAfter?: number

  constructor(message: string, options?: { retryAfter?: number }) {
    super(message)
    this.name = 'RetryableError'
    this.retryAfter = options?.retryAfter
  }
}

/**
 * Error that should not be retried
 */
export class NonRetryableError extends Error {
  retryable = false
  code?: string

  constructor(message: string, options?: { code?: string }) {
    super(message)
    this.name = 'NonRetryableError'
    this.code = options?.code
  }
}

// ============================================================================
// Backoff Strategies
// ============================================================================

interface BackoffOptions {
  baseDelay: number
  maxDelay: number
  jitter?: boolean
  jitterFactor?: number
}

/**
 * Base interface for backoff strategies
 */
interface BackoffStrategy {
  getDelay(attempt: number): number
}

/**
 * Exponential backoff strategy
 */
export class ExponentialBackoff implements BackoffStrategy {
  private baseDelay: number
  private maxDelay: number
  private multiplier: number
  private jitter: boolean
  private jitterFactor: number

  constructor(options: BackoffOptions & { multiplier?: number }) {
    this.baseDelay = options.baseDelay
    this.maxDelay = options.maxDelay
    this.multiplier = options.multiplier || 2
    this.jitter = options.jitter || false
    this.jitterFactor = options.jitterFactor || 0.5
  }

  getDelay(attempt: number): number {
    const delay = Math.min(this.baseDelay * Math.pow(this.multiplier, attempt), this.maxDelay)

    if (this.jitter) {
      const jitterRange = delay * this.jitterFactor
      return delay - jitterRange + Math.random() * jitterRange * 2
    }

    return delay
  }
}

/**
 * Linear backoff strategy
 */
export class LinearBackoff implements BackoffStrategy {
  private baseDelay: number
  private maxDelay: number
  private increment: number

  constructor(options: BackoffOptions & { increment?: number }) {
    this.baseDelay = options.baseDelay
    this.maxDelay = options.maxDelay
    this.increment = options.increment || options.baseDelay
  }

  getDelay(attempt: number): number {
    return Math.min(this.baseDelay + this.increment * attempt, this.maxDelay)
  }
}

/**
 * Constant backoff strategy
 */
export class ConstantBackoff implements BackoffStrategy {
  private delay: number

  constructor(options: { delay: number }) {
    this.delay = options.delay
  }

  getDelay(_attempt: number): number {
    return this.delay
  }
}

/**
 * Fibonacci backoff strategy
 */
export class FibonacciBackoff implements BackoffStrategy {
  private baseDelay: number
  private maxDelay: number
  // Fibonacci sequence: F(1)=1, F(2)=1, F(3)=2, F(4)=3, F(5)=5, F(6)=8...
  // We store with 1-based indexing: fibCache[1]=1, fibCache[2]=1, fibCache[3]=2, etc.
  private fibCache: number[] = [0, 1, 1]

  constructor(options: BackoffOptions) {
    this.baseDelay = options.baseDelay
    this.maxDelay = options.maxDelay
  }

  private fib(n: number): number {
    if (n < this.fibCache.length) {
      return this.fibCache[n]
    }
    for (let i = this.fibCache.length; i <= n; i++) {
      this.fibCache[i] = this.fibCache[i - 1] + this.fibCache[i - 2]
    }
    return this.fibCache[n]
  }

  getDelay(attempt: number): number {
    // attempt 0 -> F(1) = 1, attempt 1 -> F(2) = 1, attempt 2 -> F(3) = 2, etc.
    return Math.min(this.baseDelay * this.fib(attempt + 1), this.maxDelay)
  }
}

/**
 * Decorrelated jitter backoff strategy
 */
export class DecorrelatedJitter implements BackoffStrategy {
  private baseDelay: number
  private maxDelay: number
  private prevDelay: number

  constructor(options: BackoffOptions) {
    this.baseDelay = options.baseDelay
    this.maxDelay = options.maxDelay
    this.prevDelay = options.baseDelay
  }

  getDelay(_attempt: number): number {
    const delay = Math.min(
      this.maxDelay,
      this.baseDelay + Math.random() * (this.prevDelay * 3 - this.baseDelay)
    )
    this.prevDelay = delay
    return delay
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a retry policy with defaults
 */
export function createRetryPolicy(options?: RetryPolicyOptions): RetryPolicy {
  if (options?.maxAttempts !== undefined && options.maxAttempts <= 0 && options.maxAttempts !== Infinity) {
    throw new Error('Max attempts must be positive')
  }
  if (options?.baseDelay !== undefined && options.baseDelay < 0) {
    throw new Error('Base delay must be non-negative')
  }
  if (options?.maxDelay !== undefined && options.maxDelay < 0) {
    throw new Error('Max delay must be non-negative')
  }

  // Calculate maxDelay: use explicit value, or scale based on baseDelay, capped at 30000
  const baseDelay = options?.baseDelay ?? 1000
  const defaultMaxDelay = options?.maxDelay ?? Math.min(30000, baseDelay * 100)

  return {
    maxAttempts: options?.maxAttempts ?? 3,
    baseDelay: baseDelay,
    maxDelay: defaultMaxDelay,
    strategy: options?.strategy ?? 'exponential',
    jitter: options?.jitter ?? false,
    jitterFactor: options?.jitterFactor ?? 0.5,
    timeout: options?.timeout,
    maxTotalTime: options?.maxTotalTime,
    shouldRetry: options?.shouldRetry,
    onRetry: options?.onRetry,
    immediateRetry: options?.immediateRetry,
    respectRetryAfter: options?.respectRetryAfter,
    returnDetailedResult: options?.returnDetailedResult,
    circuitBreaker: options?.circuitBreaker,
  }
}

/**
 * Creates a retry context
 */
export function createRetryContext(stepName: string): RetryContext {
  return {
    stepName,
    attempt: 0,
    totalRetries: 0,
    startTime: Date.now(),
    totalElapsedMs: 0,
  }
}

/**
 * Resets a retry context for a new step
 */
export function resetRetryContext(context: RetryContext, stepName: string): RetryContext {
  return {
    stepName,
    attempt: 0,
    totalRetries: 0,
    startTime: Date.now(),
    totalElapsedMs: 0,
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculates backoff delay based on policy and attempt
 */
export function calculateBackoff(
  policy: Pick<RetryPolicy, 'strategy' | 'baseDelay' | 'maxDelay' | 'jitter' | 'jitterFactor'>,
  attempt: number
): number {
  const { strategy, baseDelay, maxDelay } = policy

  if (typeof strategy === 'function') {
    return strategy(attempt, { baseDelay, maxDelay })
  }

  const options: BackoffOptions = {
    baseDelay,
    maxDelay,
    jitter: policy.jitter,
    jitterFactor: policy.jitterFactor,
  }

  switch (strategy) {
    case 'exponential':
      return new ExponentialBackoff(options).getDelay(attempt)
    case 'linear':
      return new LinearBackoff(options).getDelay(attempt)
    case 'constant':
      return baseDelay
    case 'fibonacci':
      return new FibonacciBackoff(options).getDelay(attempt)
    case 'decorrelated':
      return new DecorrelatedJitter(options).getDelay(attempt)
    default:
      return new ExponentialBackoff(options).getDelay(attempt)
  }
}

/**
 * Classifies an error for retry decisions
 */
export function classifyError(
  error: Error,
  options?: { customClassifier?: (error: Error) => ErrorClassification }
): ErrorClassification {
  if (options?.customClassifier) {
    return options.customClassifier(error)
  }

  // Check for explicit retry markers
  if (error instanceof RetryableError) {
    return ErrorClassification.Retryable
  }
  if (error instanceof NonRetryableError) {
    return ErrorClassification.NonRetryable
  }

  // Check for retryable property
  if ('retryable' in error) {
    return (error as { retryable: boolean }).retryable
      ? ErrorClassification.Retryable
      : ErrorClassification.NonRetryable
  }

  // Check for HTTP status codes
  if ('status' in error) {
    const status = (error as { status: number }).status
    if (status === 429) {
      return ErrorClassification.RetryableWithBackoff
    }
    if (status >= 500) {
      return ErrorClassification.Retryable
    }
    if (status >= 400 && status < 500) {
      return ErrorClassification.NonRetryable
    }
  }

  // Check for network/timeout errors
  const message = error.message.toLowerCase()
  if (
    message.includes('econnrefused') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network')
  ) {
    return ErrorClassification.Retryable
  }

  // Check for validation errors
  if (message.includes('validation')) {
    return ErrorClassification.NonRetryable
  }

  // Check for explicit "do not" prefix indicating non-retryable
  if (message.startsWith('do not')) {
    return ErrorClassification.NonRetryable
  }

  // Default to retryable for unknown errors
  return ErrorClassification.Retryable
}

/**
 * Determines if an error should be retried
 */
export function shouldRetry(
  classification: ErrorClassification,
  context?: RetryContext,
  policy?: RetryPolicy
): boolean {
  if (classification === ErrorClassification.NonRetryable) {
    return false
  }

  if (context && policy) {
    if (context.attempt >= policy.maxAttempts) {
      return false
    }
  }

  return true
}

/**
 * Executes a function with retry logic
 */
export async function executeWithRetry<T>(
  fn: (context: RetryContext) => Promise<T>,
  policy: RetryPolicy
): Promise<T | RetryResult<T>> {
  const context = createRetryContext('default')
  const errors: Error[] = []
  let circuitFailures = 0

  // Support Infinity by using a condition that works with infinite values
  while (policy.maxAttempts === Infinity || context.attempt < policy.maxAttempts) {
    context.attempt++
    context.totalElapsedMs = Date.now() - context.startTime

    // Check max total time
    if (policy.maxTotalTime && context.totalElapsedMs >= policy.maxTotalTime) {
      const error = new Error('Retry time limit exceeded')
      if (policy.returnDetailedResult) {
        return {
          success: false,
          error,
          attempts: context.attempt,
          totalTime: context.totalElapsedMs,
          errors,
        }
      }
      throw error
    }

    // Check circuit breaker
    if (policy.circuitBreaker && circuitFailures >= policy.circuitBreaker.threshold) {
      const error = new Error('Circuit breaker open')
      if (policy.returnDetailedResult) {
        return {
          success: false,
          error,
          attempts: context.attempt,
          totalTime: context.totalElapsedMs,
          errors,
        }
      }
      throw error
    }

    try {
      let result: T

      if (policy.timeout) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Operation timeout')), policy.timeout)
        })
        result = await Promise.race([fn(context), timeoutPromise])
      } else {
        result = await fn(context)
      }

      if (policy.returnDetailedResult) {
        return {
          success: true,
          value: result,
          attempts: context.attempt,
          totalTime: Date.now() - context.startTime,
        }
      }

      return result
    } catch (error) {
      const err = error as Error
      errors.push(err)
      context.lastError = err
      circuitFailures++

      const classification = classifyError(err)

      // Check custom shouldRetry
      if (policy.shouldRetry && !policy.shouldRetry(err)) {
        if (policy.returnDetailedResult) {
          return {
            success: false,
            error: err,
            attempts: context.attempt,
            totalTime: Date.now() - context.startTime,
            errors,
          }
        }
        throw err
      }

      // Check if error is non-retryable
      if (classification === ErrorClassification.NonRetryable) {
        if (policy.returnDetailedResult) {
          return {
            success: false,
            error: err,
            attempts: context.attempt,
            totalTime: Date.now() - context.startTime,
            errors,
          }
        }
        throw err
      }

      // Check if we've exhausted retries (skip for Infinity)
      if (policy.maxAttempts !== Infinity && context.attempt >= policy.maxAttempts) {
        if (policy.returnDetailedResult) {
          return {
            success: false,
            error: err,
            attempts: context.attempt,
            totalTime: Date.now() - context.startTime,
            errors,
          }
        }
        throw err
      }

      // Calculate delay
      let delayMs = calculateBackoff(policy, context.attempt - 1)

      // Check for retry-after
      if (policy.respectRetryAfter && 'retryAfter' in err) {
        delayMs = (err as { retryAfter: number }).retryAfter
      }

      context.delayMs = delayMs
      context.totalRetries++

      // Call onRetry callback
      if (policy.onRetry) {
        policy.onRetry({ ...context, error: err, delayMs })
      }

      // Wait before retrying
      if (!policy.immediateRetry || classification !== ErrorClassification.Retryable) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  // Should not reach here, but handle edge case
  const finalError = context.lastError || new Error('Max retries exceeded')
  if (policy.returnDetailedResult) {
    return {
      success: false,
      error: finalError,
      attempts: context.attempt,
      totalTime: Date.now() - context.startTime,
      errors,
    }
  }
  throw finalError
}
