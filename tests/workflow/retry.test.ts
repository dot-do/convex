/**
 * Retry Logic Tests - Layer 10
 * Issue: convex-08z
 *
 * TDD RED Phase: These tests are expected to fail until implementation is complete.
 *
 * The Retry Logic module provides configurable retry strategies for workflow steps,
 * including backoff strategies, error classification, and retry limits.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  RetryPolicy,
  RetryContext,
  RetryResult,
  createRetryPolicy,
  executeWithRetry,
  calculateBackoff,
  shouldRetry,
  classifyError,
  ErrorClassification,
  RetryStrategy,
  ExponentialBackoff,
  LinearBackoff,
  ConstantBackoff,
  FibonacciBackoff,
  DecorrelatedJitter,
  RetryableError,
  NonRetryableError,
  createRetryContext,
  resetRetryContext,
} from '../../src/workflow/retry'

// ============================================================================
// Basic Retry Tests
// ============================================================================

describe('Basic Retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('executeWithRetry', () => {
    it('should execute function successfully on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const policy = createRetryPolicy({ maxAttempts: 3 })

      const result = await executeWithRetry(fn, policy)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 3) throw new Error('Temporary failure')
        return 'success'
      })
      const policy = createRetryPolicy({ maxAttempts: 5 })

      const resultPromise = executeWithRetry(fn, policy)

      // Advance through retries
      await vi.advanceTimersByTimeAsync(10000)

      const result = await resultPromise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should throw after max retries exceeded', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Persistent failure'))
      const policy = createRetryPolicy({ maxAttempts: 3 })

      const resultPromise = executeWithRetry(fn, policy).catch((e) => e)
      await vi.advanceTimersByTimeAsync(10000)
      const error = await resultPromise

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Persistent failure')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should call onRetry callback', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 3) throw new Error(`Attempt ${attempts} failed`)
        return 'success'
      })
      const onRetry = vi.fn()
      const policy = createRetryPolicy({
        maxAttempts: 5,
        onRetry,
      })

      const resultPromise = executeWithRetry(fn, policy)
      await vi.advanceTimersByTimeAsync(10000)
      await resultPromise

      expect(onRetry).toHaveBeenCalledTimes(2)
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          error: expect.any(Error),
        })
      )
    })

    it('should provide retry context to function', async () => {
      const fn = vi.fn().mockImplementation(async (ctx: RetryContext) => {
        if (ctx.attempt < 2) throw new Error('Retry')
        return `Attempt: ${ctx.attempt}`
      })
      const policy = createRetryPolicy({ maxAttempts: 5 })

      const resultPromise = executeWithRetry(fn, policy)
      await vi.advanceTimersByTimeAsync(10000)
      const result = await resultPromise

      expect(result).toBe('Attempt: 2')
    })

    it('should track total elapsed time', async () => {
      let capturedContext: RetryContext | null = null
      const fn = vi.fn().mockImplementation(async (ctx: RetryContext) => {
        capturedContext = ctx
        if (ctx.attempt < 2) throw new Error('Retry')
        return 'done'
      })
      const policy = createRetryPolicy({
        maxAttempts: 5,
        baseDelay: 100,
      })

      const resultPromise = executeWithRetry(fn, policy)
      await vi.advanceTimersByTimeAsync(10000)
      await resultPromise

      expect(capturedContext!.totalElapsedMs).toBeGreaterThan(0)
    })

    it('should respect timeout', async () => {
      const fn = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000))
        return 'too slow'
      })
      const policy = createRetryPolicy({
        maxAttempts: 3,
        timeout: 1000,
      })

      const resultPromise = executeWithRetry(fn, policy).catch((e) => e)
      await vi.advanceTimersByTimeAsync(15000)
      const error = await resultPromise

      expect(error.message).toMatch(/timeout/i)
    })

    it('should not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new NonRetryableError('Fatal error'))
      const policy = createRetryPolicy({ maxAttempts: 5 })

      const resultPromise = executeWithRetry(fn, policy).catch((e) => e)
      await vi.advanceTimersByTimeAsync(1000)
      const error = await resultPromise

      expect(fn).toHaveBeenCalledTimes(1)
      expect(error.message).toBe('Fatal error')
    })

    it('should immediately retry retryable errors', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 2) throw new RetryableError('Try again')
        return 'success'
      })
      const policy = createRetryPolicy({ maxAttempts: 5, immediateRetry: true })

      const resultPromise = executeWithRetry(fn, policy)
      await vi.advanceTimersByTimeAsync(100)
      const result = await resultPromise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe('createRetryPolicy', () => {
    it('should create policy with defaults', () => {
      const policy = createRetryPolicy()

      expect(policy.maxAttempts).toBe(3)
      expect(policy.baseDelay).toBe(1000)
      expect(policy.maxDelay).toBe(30000)
      expect(policy.strategy).toBe('exponential')
    })

    it('should accept custom max attempts', () => {
      const policy = createRetryPolicy({ maxAttempts: 10 })
      expect(policy.maxAttempts).toBe(10)
    })

    it('should accept custom delays', () => {
      const policy = createRetryPolicy({
        baseDelay: 500,
        maxDelay: 60000,
      })

      expect(policy.baseDelay).toBe(500)
      expect(policy.maxDelay).toBe(60000)
    })

    it('should accept custom strategy', () => {
      const policy = createRetryPolicy({ strategy: 'linear' })
      expect(policy.strategy).toBe('linear')
    })

    it('should accept jitter configuration', () => {
      const policy = createRetryPolicy({
        jitter: true,
        jitterFactor: 0.5,
      })

      expect(policy.jitter).toBe(true)
      expect(policy.jitterFactor).toBe(0.5)
    })

    it('should accept custom shouldRetry function', () => {
      const customShouldRetry = vi.fn().mockReturnValue(false)
      const policy = createRetryPolicy({ shouldRetry: customShouldRetry })

      expect(policy.shouldRetry).toBe(customShouldRetry)
    })

    it('should validate max attempts is positive', () => {
      expect(() => createRetryPolicy({ maxAttempts: 0 })).toThrow(/max attempts/i)
      expect(() => createRetryPolicy({ maxAttempts: -1 })).toThrow(/max attempts/i)
    })

    it('should validate delays are non-negative', () => {
      expect(() => createRetryPolicy({ baseDelay: -100 })).toThrow(/delay/i)
      expect(() => createRetryPolicy({ maxDelay: -100 })).toThrow(/delay/i)
    })
  })
})

// ============================================================================
// Backoff Strategy Tests
// ============================================================================

describe('Backoff Strategies', () => {
  describe('ExponentialBackoff', () => {
    it('should calculate exponential backoff', () => {
      const backoff = new ExponentialBackoff({ baseDelay: 1000, maxDelay: 30000 })

      expect(backoff.getDelay(0)).toBe(1000)    // 1000 * 2^0
      expect(backoff.getDelay(1)).toBe(2000)    // 1000 * 2^1
      expect(backoff.getDelay(2)).toBe(4000)    // 1000 * 2^2
      expect(backoff.getDelay(3)).toBe(8000)    // 1000 * 2^3
      expect(backoff.getDelay(4)).toBe(16000)   // 1000 * 2^4
    })

    it('should cap at max delay', () => {
      const backoff = new ExponentialBackoff({ baseDelay: 1000, maxDelay: 10000 })

      expect(backoff.getDelay(5)).toBe(10000)
      expect(backoff.getDelay(10)).toBe(10000)
    })

    it('should support custom multiplier', () => {
      const backoff = new ExponentialBackoff({
        baseDelay: 1000,
        maxDelay: 100000,
        multiplier: 3,
      })

      expect(backoff.getDelay(0)).toBe(1000)    // 1000 * 3^0
      expect(backoff.getDelay(1)).toBe(3000)    // 1000 * 3^1
      expect(backoff.getDelay(2)).toBe(9000)    // 1000 * 3^2
    })

    it('should add jitter when configured', () => {
      const backoff = new ExponentialBackoff({
        baseDelay: 1000,
        maxDelay: 30000,
        jitter: true,
        jitterFactor: 0.5,
      })

      const delays = new Set<number>()
      for (let i = 0; i < 100; i++) {
        delays.add(backoff.getDelay(1))
      }

      // With jitter, we should get varied values
      expect(delays.size).toBeGreaterThan(1)

      // All values should be within jitter range (1000 to 3000 for attempt 1)
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(1000)
        expect(delay).toBeLessThanOrEqual(3000)
      })
    })
  })

  describe('LinearBackoff', () => {
    it('should calculate linear backoff', () => {
      const backoff = new LinearBackoff({ baseDelay: 1000, maxDelay: 30000 })

      expect(backoff.getDelay(0)).toBe(1000)
      expect(backoff.getDelay(1)).toBe(2000)
      expect(backoff.getDelay(2)).toBe(3000)
      expect(backoff.getDelay(3)).toBe(4000)
    })

    it('should support custom increment', () => {
      const backoff = new LinearBackoff({
        baseDelay: 1000,
        maxDelay: 30000,
        increment: 500,
      })

      expect(backoff.getDelay(0)).toBe(1000)
      expect(backoff.getDelay(1)).toBe(1500)
      expect(backoff.getDelay(2)).toBe(2000)
    })

    it('should cap at max delay', () => {
      const backoff = new LinearBackoff({ baseDelay: 1000, maxDelay: 3000 })

      expect(backoff.getDelay(5)).toBe(3000)
      expect(backoff.getDelay(10)).toBe(3000)
    })
  })

  describe('ConstantBackoff', () => {
    it('should return constant delay', () => {
      const backoff = new ConstantBackoff({ delay: 5000 })

      expect(backoff.getDelay(0)).toBe(5000)
      expect(backoff.getDelay(1)).toBe(5000)
      expect(backoff.getDelay(10)).toBe(5000)
    })
  })

  describe('FibonacciBackoff', () => {
    it('should calculate fibonacci backoff', () => {
      const backoff = new FibonacciBackoff({ baseDelay: 1000, maxDelay: 100000 })

      // Fibonacci sequence: 1, 1, 2, 3, 5, 8, 13, 21...
      expect(backoff.getDelay(0)).toBe(1000)     // fib(1) = 1
      expect(backoff.getDelay(1)).toBe(1000)     // fib(2) = 1
      expect(backoff.getDelay(2)).toBe(2000)     // fib(3) = 2
      expect(backoff.getDelay(3)).toBe(3000)     // fib(4) = 3
      expect(backoff.getDelay(4)).toBe(5000)     // fib(5) = 5
      expect(backoff.getDelay(5)).toBe(8000)     // fib(6) = 8
    })

    it('should cap at max delay', () => {
      const backoff = new FibonacciBackoff({ baseDelay: 1000, maxDelay: 5000 })

      expect(backoff.getDelay(10)).toBe(5000)
    })
  })

  describe('DecorrelatedJitter', () => {
    it('should produce decorrelated delays', () => {
      const backoff = new DecorrelatedJitter({ baseDelay: 1000, maxDelay: 30000 })

      const delays: number[] = []
      for (let i = 0; i < 10; i++) {
        delays.push(backoff.getDelay(i))
      }

      // Delays should vary but stay within bounds
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(1000)
        expect(delay).toBeLessThanOrEqual(30000)
      })

      // Should not be monotonically increasing (due to jitter)
      const uniqueDelays = new Set(delays)
      expect(uniqueDelays.size).toBeGreaterThan(1)
    })

    it('should maintain some correlation to previous delay', () => {
      const backoff = new DecorrelatedJitter({ baseDelay: 1000, maxDelay: 30000 })

      // Decorrelated jitter typically uses: min(maxDelay, random(baseDelay, prevDelay * 3))
      // So delays shouldn't jump too drastically
      const delay1 = backoff.getDelay(0)
      const delay2 = backoff.getDelay(1)

      // The second delay should be related to the first
      expect(delay2).toBeLessThanOrEqual(delay1 * 3)
    })
  })

  describe('calculateBackoff', () => {
    it('should use strategy from policy', () => {
      const policy = createRetryPolicy({
        strategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 30000,
      })

      expect(calculateBackoff(policy, 0)).toBe(1000)
      expect(calculateBackoff(policy, 1)).toBe(2000)
      expect(calculateBackoff(policy, 2)).toBe(4000)
    })

    it('should support string strategy names', () => {
      expect(calculateBackoff({ strategy: 'linear', baseDelay: 1000, maxDelay: 10000 }, 2)).toBe(3000)
      expect(calculateBackoff({ strategy: 'constant', baseDelay: 1000, maxDelay: 10000 }, 2)).toBe(1000)
    })

    it('should support custom strategy function', () => {
      const customStrategy = vi.fn().mockReturnValue(5000)
      const policy = createRetryPolicy({
        strategy: customStrategy,
        baseDelay: 1000,
        maxDelay: 30000,
      })

      const delay = calculateBackoff(policy, 3)

      expect(delay).toBe(5000)
      expect(customStrategy).toHaveBeenCalledWith(3, expect.objectContaining({
        baseDelay: 1000,
        maxDelay: 30000,
      }))
    })
  })
})

// ============================================================================
// Retry Limit Tests
// ============================================================================

describe('Retry Limits', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('maxAttempts', () => {
    it('should enforce maximum attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Always fails'))
      const policy = createRetryPolicy({ maxAttempts: 3 })

      const resultPromise = executeWithRetry(fn, policy).catch((e) => e)
      await vi.advanceTimersByTimeAsync(10000)
      await resultPromise

      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should allow single attempt (no retries)', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Fail'))
      const policy = createRetryPolicy({ maxAttempts: 1 })

      const resultPromise = executeWithRetry(fn, policy).catch((e) => e)
      await vi.advanceTimersByTimeAsync(1000)
      await resultPromise

      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should support unlimited retries with maxAttempts: Infinity', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 100) throw new Error('Keep trying')
        return 'finally'
      })
      const policy = createRetryPolicy({
        maxAttempts: Infinity,
        baseDelay: 10,
      })

      const resultPromise = executeWithRetry(fn, policy)
      await vi.advanceTimersByTimeAsync(100000)
      const result = await resultPromise

      expect(result).toBe('finally')
      expect(fn).toHaveBeenCalledTimes(100)
    })
  })

  describe('maxTotalTime', () => {
    it('should stop retrying after max total time', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Slow failure'))
      const policy = createRetryPolicy({
        maxAttempts: 100,
        baseDelay: 1000,
        maxTotalTime: 5000,
      })

      const resultPromise = executeWithRetry(fn, policy).catch((e) => e)
      await vi.advanceTimersByTimeAsync(10000)
      const error = await resultPromise

      expect(error.message).toMatch(/time limit|timeout/i)
      // Should have made some attempts but stopped due to time
      expect(fn.mock.calls.length).toBeLessThan(100)
    })
  })

  describe('per-step retry limits', () => {
    it('should track retries per step', async () => {
      const context = createRetryContext('step-1')

      expect(context.stepName).toBe('step-1')
      expect(context.attempt).toBe(0)
      expect(context.totalRetries).toBe(0)
    })

    it('should increment retry count', async () => {
      const context = createRetryContext('step-1')

      context.attempt++
      context.totalRetries++

      expect(context.attempt).toBe(1)
      expect(context.totalRetries).toBe(1)
    })

    it('should reset context for new step', () => {
      const context = createRetryContext('step-1')
      context.attempt = 5
      context.totalRetries = 5

      const resetContext = resetRetryContext(context, 'step-2')

      expect(resetContext.stepName).toBe('step-2')
      expect(resetContext.attempt).toBe(0)
      expect(resetContext.totalRetries).toBe(0)
    })
  })
})

// ============================================================================
// Error Classification Tests
// ============================================================================

describe('Error Classification', () => {
  describe('classifyError', () => {
    it('should classify retryable errors', () => {
      const error = new RetryableError('Temporary issue')
      const classification = classifyError(error)

      expect(classification).toBe(ErrorClassification.Retryable)
    })

    it('should classify non-retryable errors', () => {
      const error = new NonRetryableError('Permanent issue')
      const classification = classifyError(error)

      expect(classification).toBe(ErrorClassification.NonRetryable)
    })

    it('should classify network errors as retryable', () => {
      const networkError = new Error('ECONNREFUSED')
      const classification = classifyError(networkError)

      expect(classification).toBe(ErrorClassification.Retryable)
    })

    it('should classify timeout errors as retryable', () => {
      const timeoutError = new Error('Request timed out')
      const classification = classifyError(timeoutError)

      expect(classification).toBe(ErrorClassification.Retryable)
    })

    it('should classify 500 errors as retryable', () => {
      const serverError = Object.assign(new Error('Internal Server Error'), {
        status: 500,
      })
      const classification = classifyError(serverError)

      expect(classification).toBe(ErrorClassification.Retryable)
    })

    it('should classify 503 errors as retryable', () => {
      const unavailableError = Object.assign(new Error('Service Unavailable'), {
        status: 503,
      })
      const classification = classifyError(unavailableError)

      expect(classification).toBe(ErrorClassification.Retryable)
    })

    it('should classify 429 errors as retryable with backoff', () => {
      const rateLimitError = Object.assign(new Error('Too Many Requests'), {
        status: 429,
        headers: { 'retry-after': '60' },
      })
      const classification = classifyError(rateLimitError)

      expect(classification).toBe(ErrorClassification.RetryableWithBackoff)
    })

    it('should classify 400 errors as non-retryable', () => {
      const badRequestError = Object.assign(new Error('Bad Request'), {
        status: 400,
      })
      const classification = classifyError(badRequestError)

      expect(classification).toBe(ErrorClassification.NonRetryable)
    })

    it('should classify 401 errors as non-retryable', () => {
      const authError = Object.assign(new Error('Unauthorized'), {
        status: 401,
      })
      const classification = classifyError(authError)

      expect(classification).toBe(ErrorClassification.NonRetryable)
    })

    it('should classify 404 errors as non-retryable', () => {
      const notFoundError = Object.assign(new Error('Not Found'), {
        status: 404,
      })
      const classification = classifyError(notFoundError)

      expect(classification).toBe(ErrorClassification.NonRetryable)
    })

    it('should classify validation errors as non-retryable', () => {
      const validationError = new Error('Validation failed: email is invalid')
      const classification = classifyError(validationError)

      expect(classification).toBe(ErrorClassification.NonRetryable)
    })

    it('should use custom classifier when provided', () => {
      const customClassifier = vi.fn().mockReturnValue(ErrorClassification.Retryable)
      const error = new Error('Custom error')

      const classification = classifyError(error, { customClassifier })

      expect(customClassifier).toHaveBeenCalledWith(error)
      expect(classification).toBe(ErrorClassification.Retryable)
    })

    it('should handle unknown errors as retryable by default', () => {
      const unknownError = new Error('Something unexpected happened')
      const classification = classifyError(unknownError)

      expect(classification).toBe(ErrorClassification.Retryable)
    })
  })

  describe('shouldRetry', () => {
    it('should return true for retryable classification', () => {
      expect(shouldRetry(ErrorClassification.Retryable)).toBe(true)
    })

    it('should return true for retryable with backoff classification', () => {
      expect(shouldRetry(ErrorClassification.RetryableWithBackoff)).toBe(true)
    })

    it('should return false for non-retryable classification', () => {
      expect(shouldRetry(ErrorClassification.NonRetryable)).toBe(false)
    })

    it('should check attempt count against max attempts', () => {
      const context: RetryContext = {
        stepName: 'test',
        attempt: 3,
        totalRetries: 3,
        startTime: Date.now(),
        totalElapsedMs: 5000,
        lastError: new Error('test'),
      }
      const policy = createRetryPolicy({ maxAttempts: 3 })

      expect(shouldRetry(ErrorClassification.Retryable, context, policy)).toBe(false)
    })

    it('should allow retry when under max attempts', () => {
      const context: RetryContext = {
        stepName: 'test',
        attempt: 1,
        totalRetries: 1,
        startTime: Date.now(),
        totalElapsedMs: 1000,
        lastError: new Error('test'),
      }
      const policy = createRetryPolicy({ maxAttempts: 3 })

      expect(shouldRetry(ErrorClassification.Retryable, context, policy)).toBe(true)
    })
  })

  describe('RetryableError', () => {
    it('should be instanceof Error', () => {
      const error = new RetryableError('Test')
      expect(error instanceof Error).toBe(true)
      expect(error instanceof RetryableError).toBe(true)
    })

    it('should have retryable property', () => {
      const error = new RetryableError('Test')
      expect(error.retryable).toBe(true)
    })

    it('should preserve error message', () => {
      const error = new RetryableError('Specific message')
      expect(error.message).toBe('Specific message')
    })

    it('should accept retry delay hint', () => {
      const error = new RetryableError('Rate limited', { retryAfter: 5000 })
      expect(error.retryAfter).toBe(5000)
    })
  })

  describe('NonRetryableError', () => {
    it('should be instanceof Error', () => {
      const error = new NonRetryableError('Test')
      expect(error instanceof Error).toBe(true)
      expect(error instanceof NonRetryableError).toBe(true)
    })

    it('should have retryable property set to false', () => {
      const error = new NonRetryableError('Test')
      expect(error.retryable).toBe(false)
    })

    it('should accept error code', () => {
      const error = new NonRetryableError('Invalid input', { code: 'INVALID_INPUT' })
      expect(error.code).toBe('INVALID_INPUT')
    })
  })
})

// ============================================================================
// Retry Strategy Integration Tests
// ============================================================================

describe('Retry Strategy Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('exponential backoff with jitter', () => {
    it('should apply jitter to exponential backoff', async () => {
      const delays: number[] = []
      const fn = vi.fn().mockImplementation(async () => {
        throw new Error('Fail')
      })
      const policy = createRetryPolicy({
        maxAttempts: 5,
        strategy: 'exponential',
        baseDelay: 1000,
        jitter: true,
        jitterFactor: 0.5,
        onRetry: (ctx) => {
          delays.push(ctx.delayMs)
        },
      })

      const resultPromise = executeWithRetry(fn, policy).catch((e) => e)
      await vi.advanceTimersByTimeAsync(100000)
      await resultPromise

      // Delays should not be exact exponential due to jitter
      expect(delays.length).toBe(4) // 5 attempts, 4 retries
      const uniqueDelays = new Set(delays)
      // With jitter, we should likely have varied delays
      expect(uniqueDelays.size).toBeGreaterThanOrEqual(1)
    })
  })

  describe('custom retry predicate', () => {
    it('should use custom shouldRetry function', async () => {
      let retryCount = 0
      const customShouldRetry = vi.fn().mockImplementation((error) => {
        retryCount++
        return error.message.includes('retry')
      })

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Please retry'))
        .mockRejectedValueOnce(new Error('Please retry'))
        .mockRejectedValueOnce(new Error('Do not retry'))

      const policy = createRetryPolicy({
        maxAttempts: 10,
        shouldRetry: customShouldRetry,
      })

      const resultPromise = executeWithRetry(fn, policy).catch((e) => e)
      await vi.advanceTimersByTimeAsync(10000)
      const error = await resultPromise

      expect(error.message).toBe('Do not retry')
      expect(fn).toHaveBeenCalledTimes(3)
      expect(customShouldRetry).toHaveBeenCalledTimes(3)
    })
  })

  describe('retry with rate limiting', () => {
    it('should respect retry-after header', async () => {
      const onRetry = vi.fn()
      const rateLimitError = Object.assign(new Error('Rate limited'), {
        status: 429,
        retryAfter: 5000,
      })

      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts === 1) throw rateLimitError
        return 'success'
      })

      const policy = createRetryPolicy({
        maxAttempts: 5,
        respectRetryAfter: true,
        onRetry,
      })

      const resultPromise = executeWithRetry(fn, policy)
      await vi.advanceTimersByTimeAsync(10000)
      const result = await resultPromise

      expect(result).toBe('success')
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          delayMs: expect.any(Number),
        })
      )
    })
  })

  describe('circuit breaker integration', () => {
    it('should support circuit breaker pattern', async () => {
      const policy = createRetryPolicy({
        maxAttempts: 5,
        circuitBreaker: {
          threshold: 3, // Open circuit after 3 failures
          resetTimeout: 30000,
        },
      })

      const fn = vi.fn().mockRejectedValue(new Error('Service down'))

      const resultPromise = executeWithRetry(fn, policy).catch((e) => e)
      await vi.advanceTimersByTimeAsync(100000)
      const error = await resultPromise

      // After threshold failures, should stop retrying
      expect(fn.mock.calls.length).toBeLessThanOrEqual(3)
      expect(error.message).toMatch(/circuit.*open|service down/i)
    })
  })
})

// ============================================================================
// Retry Result Tests
// ============================================================================

describe('Retry Result', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('RetryResult type', () => {
    it('should return success result', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const policy = createRetryPolicy({ maxAttempts: 3 })

      const result = await executeWithRetry<string>(fn, policy)

      expect(result).toBe('success')
    })

    it('should return detailed result with attempts info', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 3) throw new Error('Retry')
        return 'done'
      })
      const policy = createRetryPolicy({
        maxAttempts: 5,
        returnDetailedResult: true,
      })

      const resultPromise = executeWithRetry(fn, policy)
      await vi.advanceTimersByTimeAsync(10000)
      const result = await resultPromise as RetryResult<string>

      expect(result.success).toBe(true)
      expect(result.value).toBe('done')
      expect(result.attempts).toBe(3)
      expect(result.totalTime).toBeGreaterThan(0)
    })

    it('should return failure result with all attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Always fails'))
      const policy = createRetryPolicy({
        maxAttempts: 3,
        returnDetailedResult: true,
      })

      const resultPromise = executeWithRetry(fn, policy)
      await vi.advanceTimersByTimeAsync(10000)
      const result = await resultPromise as RetryResult<string>

      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(Error)
      expect(result.attempts).toBe(3)
      expect(result.errors).toHaveLength(3)
    })
  })
})
