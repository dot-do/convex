/**
 * TDD RED Phase Tests for Structured Logging/Observability
 *
 * These tests define the expected behavior for the structured logging infrastructure.
 * They cover JSON output format, log levels, context propagation, request tracing,
 * and performance timing metrics.
 *
 * These tests are designed to FAIL until the implementation is complete.
 *
 * TDD Issue: convex-7b62
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Import the logging module that doesn't exist yet (RED phase)
// This import should FAIL during the RED phase
// ============================================================================

import {
  Logger,
  LogLevel,
  LogEntry,
  LogContext,
  createLogger,
  createRequestContext,
  withContext,
  getLogger,
  setGlobalLogLevel,
  formatLogEntry,
  parseLogEntry,
  PerformanceTimer,
  createPerformanceTimer,
  RequestTracer,
  createRequestTracer,
  type LoggerOptions,
  type LogHandler,
  type LogFilter,
  type ContextProvider,
} from '../../src/server/logging'

// ============================================================================
// Structured Log Output Format (JSON) Tests
// ============================================================================

describe('Structured Log Output Format', () => {
  let logger: Logger
  let capturedLogs: LogEntry[]

  beforeEach(() => {
    capturedLogs = []
    logger = createLogger({
      handler: (entry) => {
        capturedLogs.push(entry)
      },
    })
  })

  describe('JSON format structure', () => {
    it('should output logs in valid JSON format', () => {
      logger.info('Test message')

      expect(capturedLogs).toHaveLength(1)
      const entry = capturedLogs[0]

      // Should be serializable to JSON
      const jsonString = JSON.stringify(entry)
      const parsed = JSON.parse(jsonString)

      expect(parsed).toEqual(entry)
    })

    it('should include timestamp in ISO 8601 format', () => {
      logger.info('Test message')

      const entry = capturedLogs[0]
      expect(entry.timestamp).toBeDefined()

      // Should be valid ISO 8601 date
      const date = new Date(entry.timestamp)
      expect(date.toISOString()).toBe(entry.timestamp)
    })

    it('should include log level in the entry', () => {
      logger.info('Test message')

      const entry = capturedLogs[0]
      expect(entry.level).toBe('info')
    })

    it('should include message in the entry', () => {
      logger.info('Test message')

      const entry = capturedLogs[0]
      expect(entry.message).toBe('Test message')
    })

    it('should include structured data in the entry', () => {
      logger.info('User logged in', { userId: 'user_123', action: 'login' })

      const entry = capturedLogs[0]
      expect(entry.data).toEqual({ userId: 'user_123', action: 'login' })
    })

    it('should include source/caller information', () => {
      logger.info('Test message')

      const entry = capturedLogs[0]
      expect(entry.source).toBeDefined()
      expect(typeof entry.source).toBe('string')
    })

    it('should support custom fields', () => {
      logger.info('Test message', {
        custom: 'field',
        nested: { value: 42 },
      })

      const entry = capturedLogs[0]
      expect(entry.data?.custom).toBe('field')
      expect(entry.data?.nested).toEqual({ value: 42 })
    })

    it('should handle circular references gracefully', () => {
      const circular: Record<string, unknown> = { name: 'test' }
      circular.self = circular

      // Should not throw
      expect(() => {
        logger.info('Circular data', circular)
      }).not.toThrow()

      const entry = capturedLogs[0]
      expect(entry).toBeDefined()
    })

    it('should redact sensitive fields by default', () => {
      logger.info('Auth event', {
        password: 'secret123',
        token: 'jwt_token',
        apiKey: 'api_key_123',
        user: 'john',
      })

      const entry = capturedLogs[0]
      expect(entry.data?.password).toBe('[REDACTED]')
      expect(entry.data?.token).toBe('[REDACTED]')
      expect(entry.data?.apiKey).toBe('[REDACTED]')
      expect(entry.data?.user).toBe('john')
    })
  })

  describe('formatLogEntry', () => {
    it('should format log entry as JSON string', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T00:00:00.000Z',
        level: 'info',
        message: 'Test',
        data: { key: 'value' },
      }

      const formatted = formatLogEntry(entry)
      const parsed = JSON.parse(formatted)

      expect(parsed.timestamp).toBe(entry.timestamp)
      expect(parsed.level).toBe(entry.level)
      expect(parsed.message).toBe(entry.message)
    })

    it('should support pretty print option', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T00:00:00.000Z',
        level: 'info',
        message: 'Test',
      }

      const compact = formatLogEntry(entry)
      const pretty = formatLogEntry(entry, { pretty: true })

      expect(compact).not.toContain('\n')
      expect(pretty).toContain('\n')
    })
  })

  describe('parseLogEntry', () => {
    it('should parse JSON log string back to entry', () => {
      const original: LogEntry = {
        timestamp: '2024-01-01T00:00:00.000Z',
        level: 'info',
        message: 'Test',
        data: { key: 'value' },
      }

      const json = JSON.stringify(original)
      const parsed = parseLogEntry(json)

      expect(parsed).toEqual(original)
    })

    it('should throw on invalid JSON', () => {
      expect(() => parseLogEntry('not json')).toThrow()
    })
  })
})

// ============================================================================
// Log Levels Tests
// ============================================================================

describe('Log Levels', () => {
  let capturedLogs: LogEntry[]
  let logger: Logger

  beforeEach(() => {
    capturedLogs = []
    logger = createLogger({
      handler: (entry) => {
        capturedLogs.push(entry)
      },
    })
  })

  describe('level methods', () => {
    it('should support debug level', () => {
      logger.debug('Debug message')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].level).toBe('debug')
    })

    it('should support info level', () => {
      logger.info('Info message')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].level).toBe('info')
    })

    it('should support warn level', () => {
      logger.warn('Warning message')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].level).toBe('warn')
    })

    it('should support error level', () => {
      logger.error('Error message')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].level).toBe('error')
    })

    it('should support fatal level', () => {
      logger.fatal('Fatal message')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].level).toBe('fatal')
    })

    it('should support trace level', () => {
      logger.trace('Trace message')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].level).toBe('trace')
    })
  })

  describe('level filtering', () => {
    it('should filter logs below minimum level', () => {
      const warnLogger = createLogger({
        level: 'warn',
        handler: (entry) => capturedLogs.push(entry),
      })

      warnLogger.debug('Debug')
      warnLogger.info('Info')
      warnLogger.warn('Warn')
      warnLogger.error('Error')

      expect(capturedLogs).toHaveLength(2)
      expect(capturedLogs[0].level).toBe('warn')
      expect(capturedLogs[1].level).toBe('error')
    })

    it('should respect log level hierarchy: trace < debug < info < warn < error < fatal', () => {
      const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

      for (let i = 0; i < levels.length; i++) {
        capturedLogs = []
        const currentLevel = levels[i]
        const levelLogger = createLogger({
          level: currentLevel,
          handler: (entry) => capturedLogs.push(entry),
        })

        // Log at all levels
        levelLogger.trace('trace')
        levelLogger.debug('debug')
        levelLogger.info('info')
        levelLogger.warn('warn')
        levelLogger.error('error')
        levelLogger.fatal('fatal')

        // Should have logs from current level and above
        expect(capturedLogs).toHaveLength(levels.length - i)
      }
    })

    it('should allow changing log level at runtime', () => {
      logger.setLevel('error')

      logger.info('Info message')
      expect(capturedLogs).toHaveLength(0)

      logger.error('Error message')
      expect(capturedLogs).toHaveLength(1)

      logger.setLevel('debug')
      logger.debug('Debug message')
      expect(capturedLogs).toHaveLength(2)
    })

    it('should support setting global log level', () => {
      setGlobalLogLevel('warn')

      const newLogger = createLogger({
        handler: (entry) => capturedLogs.push(entry),
      })

      newLogger.info('Info')
      expect(capturedLogs).toHaveLength(0)

      newLogger.warn('Warn')
      expect(capturedLogs).toHaveLength(1)
    })
  })

  describe('level-specific data', () => {
    it('should include error stack trace for error level', () => {
      const error = new Error('Test error')
      logger.error('An error occurred', { error })

      const entry = capturedLogs[0]
      expect(entry.data?.error).toBeDefined()
      expect(entry.data?.error?.stack).toBeDefined()
    })

    it('should include error cause chain', () => {
      const cause = new Error('Root cause')
      const error = new Error('Wrapper error', { cause })
      logger.error('Nested error', { error })

      const entry = capturedLogs[0]
      expect(entry.data?.error?.cause).toBeDefined()
    })
  })
})

// ============================================================================
// Context Propagation Tests
// ============================================================================

describe('Context Propagation', () => {
  let capturedLogs: LogEntry[]
  let logger: Logger

  beforeEach(() => {
    capturedLogs = []
    logger = createLogger({
      handler: (entry) => capturedLogs.push(entry),
    })
  })

  describe('basic context', () => {
    it('should include context in log entries', () => {
      const context: LogContext = {
        requestId: 'req_123',
        userId: 'user_456',
      }

      const contextLogger = logger.withContext(context)
      contextLogger.info('Test message')

      const entry = capturedLogs[0]
      expect(entry.context).toEqual(context)
    })

    it('should merge context with log data', () => {
      const contextLogger = logger.withContext({ service: 'api' })
      contextLogger.info('Test', { action: 'create' })

      const entry = capturedLogs[0]
      expect(entry.context?.service).toBe('api')
      expect(entry.data?.action).toBe('create')
    })

    it('should support nested context', () => {
      const level1 = logger.withContext({ level: 1 })
      const level2 = level1.withContext({ level: 2 })

      level2.info('Test')

      const entry = capturedLogs[0]
      expect(entry.context?.level).toBe(2)
    })

    it('should preserve parent context when adding child context', () => {
      const parent = logger.withContext({ parent: 'value' })
      const child = parent.withContext({ child: 'value' })

      child.info('Test')

      const entry = capturedLogs[0]
      expect(entry.context?.parent).toBe('value')
      expect(entry.context?.child).toBe('value')
    })
  })

  describe('createRequestContext', () => {
    it('should create context with request ID', () => {
      const context = createRequestContext()

      expect(context.requestId).toBeDefined()
      expect(typeof context.requestId).toBe('string')
    })

    it('should create unique request IDs', () => {
      const context1 = createRequestContext()
      const context2 = createRequestContext()

      expect(context1.requestId).not.toBe(context2.requestId)
    })

    it('should accept custom request ID', () => {
      const context = createRequestContext({ requestId: 'custom_123' })

      expect(context.requestId).toBe('custom_123')
    })

    it('should include timestamp', () => {
      const context = createRequestContext()

      expect(context.startTime).toBeDefined()
      expect(typeof context.startTime).toBe('number')
    })
  })

  describe('withContext helper', () => {
    it('should execute callback with context-aware logger', async () => {
      const result = await withContext({ requestId: 'req_123' }, async (log) => {
        log.info('Inside context')
        return 'done'
      })

      expect(result).toBe('done')
      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].context?.requestId).toBe('req_123')
    })

    it('should propagate context to nested calls', async () => {
      await withContext({ outer: 'value' }, async (log) => {
        log.info('Outer')

        await withContext({ inner: 'value' }, async (innerLog) => {
          innerLog.info('Inner')
        })
      })

      expect(capturedLogs).toHaveLength(2)
      expect(capturedLogs[0].context?.outer).toBe('value')
      expect(capturedLogs[1].context?.outer).toBe('value')
      expect(capturedLogs[1].context?.inner).toBe('value')
    })
  })

  describe('context providers', () => {
    it('should support dynamic context from providers', () => {
      let dynamicValue = 'initial'

      const contextProvider: ContextProvider = () => ({
        dynamic: dynamicValue,
      })

      const dynamicLogger = createLogger({
        handler: (entry) => capturedLogs.push(entry),
        contextProviders: [contextProvider],
      })

      dynamicLogger.info('First')
      dynamicValue = 'updated'
      dynamicLogger.info('Second')

      expect(capturedLogs[0].context?.dynamic).toBe('initial')
      expect(capturedLogs[1].context?.dynamic).toBe('updated')
    })
  })
})

// ============================================================================
// Request Tracing Tests
// ============================================================================

describe('Request Tracing', () => {
  let capturedLogs: LogEntry[]
  let logger: Logger

  beforeEach(() => {
    capturedLogs = []
    logger = createLogger({
      handler: (entry) => capturedLogs.push(entry),
    })
  })

  describe('RequestTracer', () => {
    it('should create tracer with unique trace ID', () => {
      const tracer = createRequestTracer()

      expect(tracer.traceId).toBeDefined()
      expect(typeof tracer.traceId).toBe('string')
    })

    it('should create spans within a trace', () => {
      const tracer = createRequestTracer()
      const span = tracer.startSpan('operation')

      expect(span.spanId).toBeDefined()
      expect(span.traceId).toBe(tracer.traceId)
    })

    it('should support nested spans', () => {
      const tracer = createRequestTracer()
      const parentSpan = tracer.startSpan('parent')
      const childSpan = parentSpan.startSpan('child')

      expect(childSpan.parentSpanId).toBe(parentSpan.spanId)
      expect(childSpan.traceId).toBe(tracer.traceId)
    })

    it('should record span duration on end', () => {
      const tracer = createRequestTracer()
      const span = tracer.startSpan('operation')

      // Simulate some work
      span.end()

      expect(span.duration).toBeDefined()
      expect(typeof span.duration).toBe('number')
      expect(span.duration).toBeGreaterThanOrEqual(0)
    })

    it('should include span info in log entries', () => {
      const tracer = createRequestTracer()
      const span = tracer.startSpan('operation')

      logger.withContext({ traceId: tracer.traceId, spanId: span.spanId }).info('Traced message')

      const entry = capturedLogs[0]
      expect(entry.context?.traceId).toBe(tracer.traceId)
      expect(entry.context?.spanId).toBe(span.spanId)
    })

    it('should support adding attributes to spans', () => {
      const tracer = createRequestTracer()
      const span = tracer.startSpan('operation')

      span.setAttribute('http.method', 'GET')
      span.setAttribute('http.url', '/api/users')
      span.end()

      expect(span.attributes).toEqual({
        'http.method': 'GET',
        'http.url': '/api/users',
      })
    })

    it('should support span events', () => {
      const tracer = createRequestTracer()
      const span = tracer.startSpan('operation')

      span.addEvent('cache_hit', { key: 'user_123' })
      span.end()

      expect(span.events).toHaveLength(1)
      expect(span.events[0].name).toBe('cache_hit')
    })

    it('should support span status', () => {
      const tracer = createRequestTracer()
      const span = tracer.startSpan('operation')

      span.setStatus('error', 'Operation failed')
      span.end()

      expect(span.status).toBe('error')
      expect(span.statusMessage).toBe('Operation failed')
    })

    it('should export trace data', () => {
      const tracer = createRequestTracer()
      const span1 = tracer.startSpan('op1')
      span1.end()
      const span2 = tracer.startSpan('op2')
      span2.end()

      const exportData = tracer.export()

      expect(exportData.traceId).toBe(tracer.traceId)
      expect(exportData.spans).toHaveLength(2)
    })
  })

  describe('distributed tracing', () => {
    it('should propagate trace context via headers', () => {
      const tracer = createRequestTracer()

      const headers = tracer.injectHeaders()

      expect(headers['x-trace-id']).toBe(tracer.traceId)
    })

    it('should extract trace context from headers', () => {
      const headers = {
        'x-trace-id': 'trace_123',
        'x-parent-span-id': 'span_456',
      }

      const tracer = createRequestTracer({ headers })

      expect(tracer.traceId).toBe('trace_123')
      expect(tracer.parentSpanId).toBe('span_456')
    })
  })
})

// ============================================================================
// Performance Timing Metrics Tests
// ============================================================================

describe('Performance Timing Metrics', () => {
  let capturedLogs: LogEntry[]
  let logger: Logger

  beforeEach(() => {
    capturedLogs = []
    logger = createLogger({
      handler: (entry) => capturedLogs.push(entry),
    })
  })

  describe('PerformanceTimer', () => {
    it('should measure elapsed time', async () => {
      const timer = createPerformanceTimer()

      await new Promise((resolve) => setTimeout(resolve, 10))

      const elapsed = timer.elapsed()
      expect(elapsed).toBeGreaterThanOrEqual(10)
    })

    it('should support named timers', () => {
      const timer = createPerformanceTimer('database_query')

      expect(timer.name).toBe('database_query')
    })

    it('should support lap times', async () => {
      const timer = createPerformanceTimer()

      await new Promise((resolve) => setTimeout(resolve, 5))
      const lap1 = timer.lap('step1')

      await new Promise((resolve) => setTimeout(resolve, 5))
      const lap2 = timer.lap('step2')

      expect(timer.laps).toHaveLength(2)
      expect(lap1.name).toBe('step1')
      expect(lap2.name).toBe('step2')
    })

    it('should log timing on stop', () => {
      const timer = createPerformanceTimer('operation', { logger })

      timer.stop()

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].data?.duration).toBeDefined()
      expect(capturedLogs[0].data?.operation).toBe('operation')
    })

    it('should include timing metadata', () => {
      const timer = createPerformanceTimer('operation', {
        logger,
        metadata: { table: 'users', action: 'select' },
      })

      timer.stop()

      const entry = capturedLogs[0]
      expect(entry.data?.table).toBe('users')
      expect(entry.data?.action).toBe('select')
    })

    it('should support high-resolution timing', () => {
      const timer = createPerformanceTimer('precise', { highResolution: true })

      const elapsed = timer.elapsed()
      // High-res timing should have sub-millisecond precision
      expect(typeof elapsed).toBe('number')
    })
  })

  describe('timing helpers', () => {
    it('should time async functions', async () => {
      const result = await logger.time('async_op', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return 'result'
      })

      expect(result).toBe('result')
      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].data?.duration).toBeGreaterThanOrEqual(5)
    })

    it('should time sync functions', () => {
      const result = logger.time('sync_op', () => {
        return 'result'
      })

      expect(result).toBe('result')
      expect(capturedLogs).toHaveLength(1)
    })

    it('should capture timing even on error', async () => {
      await expect(
        logger.time('failing_op', async () => {
          throw new Error('Failed')
        })
      ).rejects.toThrow('Failed')

      expect(capturedLogs).toHaveLength(1)
      expect(capturedLogs[0].level).toBe('error')
      expect(capturedLogs[0].data?.duration).toBeDefined()
    })
  })

  describe('metrics aggregation', () => {
    it('should aggregate timing metrics', () => {
      const timer1 = createPerformanceTimer('db_query')
      timer1.stop()

      const timer2 = createPerformanceTimer('db_query')
      timer2.stop()

      const metrics = getLogger().getMetrics('db_query')

      expect(metrics.count).toBe(2)
      expect(metrics.avg).toBeDefined()
      expect(metrics.min).toBeDefined()
      expect(metrics.max).toBeDefined()
      expect(metrics.p50).toBeDefined()
      expect(metrics.p95).toBeDefined()
      expect(metrics.p99).toBeDefined()
    })

    it('should track error rates', async () => {
      const successTimer = createPerformanceTimer('operation')
      successTimer.stop()

      const failTimer = createPerformanceTimer('operation')
      failTimer.error(new Error('Failed'))

      const metrics = getLogger().getMetrics('operation')

      expect(metrics.errorCount).toBe(1)
      expect(metrics.errorRate).toBe(0.5) // 1 error / 2 total
    })
  })
})

// ============================================================================
// Logger Configuration Tests
// ============================================================================

describe('Logger Configuration', () => {
  let capturedLogs: LogEntry[]

  beforeEach(() => {
    capturedLogs = []
  })

  describe('createLogger options', () => {
    it('should accept custom log handler', () => {
      const customHandler: LogHandler = vi.fn()

      const logger = createLogger({ handler: customHandler })
      logger.info('Test')

      expect(customHandler).toHaveBeenCalledTimes(1)
    })

    it('should accept multiple handlers', () => {
      const handler1: LogHandler = vi.fn()
      const handler2: LogHandler = vi.fn()

      const logger = createLogger({ handlers: [handler1, handler2] })
      logger.info('Test')

      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })

    it('should accept custom log filter', () => {
      const filter: LogFilter = (entry) => entry.message !== 'skip'

      const logger = createLogger({
        handler: (entry) => capturedLogs.push(entry),
        filter,
      })

      logger.info('keep')
      logger.info('skip')
      logger.info('also keep')

      expect(capturedLogs).toHaveLength(2)
    })

    it('should accept custom timestamp function', () => {
      const customTimestamp = () => '2024-01-01T00:00:00.000Z'

      const logger = createLogger({
        handler: (entry) => capturedLogs.push(entry),
        timestamp: customTimestamp,
      })

      logger.info('Test')

      expect(capturedLogs[0].timestamp).toBe('2024-01-01T00:00:00.000Z')
    })

    it('should accept service name', () => {
      const logger = createLogger({
        handler: (entry) => capturedLogs.push(entry),
        service: 'my-service',
      })

      logger.info('Test')

      expect(capturedLogs[0].service).toBe('my-service')
    })

    it('should accept environment', () => {
      const logger = createLogger({
        handler: (entry) => capturedLogs.push(entry),
        environment: 'production',
      })

      logger.info('Test')

      expect(capturedLogs[0].environment).toBe('production')
    })
  })

  describe('getLogger singleton', () => {
    it('should return same instance', () => {
      const logger1 = getLogger()
      const logger2 = getLogger()

      expect(logger1).toBe(logger2)
    })

    it('should accept namespace for scoped loggers', () => {
      const dbLogger = getLogger('database')
      const apiLogger = getLogger('api')

      expect(dbLogger).not.toBe(apiLogger)
    })
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Logging Integration', () => {
  let capturedLogs: LogEntry[]
  let logger: Logger

  beforeEach(() => {
    capturedLogs = []
    logger = createLogger({
      handler: (entry) => capturedLogs.push(entry),
      service: 'convex',
      environment: 'test',
    })
  })

  it('should support complete request logging workflow', async () => {
    // Create request context
    const requestContext = createRequestContext()
    const tracer = createRequestTracer()

    // Create scoped logger for this request
    const requestLogger = logger.withContext({
      requestId: requestContext.requestId,
      traceId: tracer.traceId,
    })

    // Start request span
    const span = tracer.startSpan('http_request')
    span.setAttribute('http.method', 'POST')
    span.setAttribute('http.url', '/api/messages')

    requestLogger.info('Request started')

    // Simulate database operation with timing
    const dbResult = await requestLogger.time('db_insert', async () => {
      const dbSpan = span.startSpan('db_insert')
      try {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return { id: 'msg_123' }
      } finally {
        dbSpan.end()
      }
    })

    requestLogger.info('Message created', { messageId: dbResult.id })

    // End request
    span.end()
    requestLogger.info('Request completed', {
      duration: span.duration,
      statusCode: 200,
    })

    // Verify logs
    expect(capturedLogs.length).toBeGreaterThanOrEqual(3)

    // All logs should have the same request ID and trace ID
    for (const log of capturedLogs) {
      expect(log.context?.requestId).toBe(requestContext.requestId)
      expect(log.context?.traceId).toBe(tracer.traceId)
    }
  })

  it('should handle error scenarios with proper context', async () => {
    const requestContext = createRequestContext()
    const requestLogger = logger.withContext({
      requestId: requestContext.requestId,
    })

    try {
      await requestLogger.time('failing_operation', async () => {
        throw new Error('Database connection failed')
      })
    } catch (err) {
      requestLogger.error('Operation failed', {
        error: err,
        recoverable: false,
      })
    }

    // Should have timing log (error level) and explicit error log
    expect(capturedLogs).toHaveLength(2)

    const errorLogs = capturedLogs.filter((l) => l.level === 'error')
    expect(errorLogs.length).toBeGreaterThanOrEqual(1)

    // Both should have request context
    for (const log of capturedLogs) {
      expect(log.context?.requestId).toBe(requestContext.requestId)
    }
  })
})
