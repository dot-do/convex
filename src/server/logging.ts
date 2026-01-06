/**
 * Structured Logging Module for Convex Server
 *
 * Provides structured JSON logging with support for log levels, context propagation,
 * request tracing, and performance timing metrics. Designed for Workers runtime compatibility.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  data?: Record<string, unknown>
  context?: LogContext
  source?: string
  service?: string
  environment?: string
}

export interface LogContext {
  requestId?: string
  startTime?: number
  traceId?: string
  spanId?: string
  [key: string]: unknown
}

export type LogHandler = (entry: LogEntry) => void

export type LogFilter = (entry: LogEntry) => boolean

export type ContextProvider = () => LogContext

export interface LoggerOptions {
  level?: LogLevel
  handler?: LogHandler
  handlers?: LogHandler[]
  filter?: LogFilter
  timestamp?: () => string
  service?: string
  environment?: string
  contextProviders?: ContextProvider[]
}

export interface TimerOptions {
  logger?: Logger
  metadata?: Record<string, unknown>
  highResolution?: boolean
}

export interface Lap {
  name: string
  elapsed: number
}

export interface SpanEvent {
  name: string
  timestamp: number
  attributes?: Record<string, unknown>
}

export interface Span {
  spanId: string
  traceId: string
  parentSpanId?: string
  name: string
  startTime: number
  endTime?: number
  duration?: number
  attributes: Record<string, unknown>
  events: SpanEvent[]
  status?: 'ok' | 'error'
  statusMessage?: string
  setAttribute(key: string, value: unknown): void
  addEvent(name: string, attributes?: Record<string, unknown>): void
  setStatus(status: 'ok' | 'error', message?: string): void
  startSpan(name: string): Span
  end(): void
}

export interface TraceExport {
  traceId: string
  spans: Array<{
    spanId: string
    parentSpanId?: string
    name: string
    startTime: number
    endTime?: number
    duration?: number
    attributes: Record<string, unknown>
    events: SpanEvent[]
    status?: string
    statusMessage?: string
  }>
}

export interface RequestTracer {
  traceId: string
  parentSpanId?: string
  startSpan(name: string): Span
  injectHeaders(): Record<string, string>
  export(): TraceExport
}

export interface PerformanceTimer {
  name?: string
  laps: Lap[]
  elapsed(): number
  lap(name: string): Lap
  stop(): number
  error(err: Error): void
}

export interface TimingMetrics {
  count: number
  avg: number
  min: number
  max: number
  p50: number
  p95: number
  p99: number
  errorCount: number
  errorRate: number
}

export interface Logger {
  trace(message: string, data?: Record<string, unknown>): void
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
  fatal(message: string, data?: Record<string, unknown>): void
  setLevel(level: LogLevel): void
  withContext(context: LogContext): Logger
  time<T>(name: string, fn: () => T | Promise<T>): T | Promise<T>
  getMetrics(name: string): TimingMetrics
}

// ============================================================================
// Constants
// ============================================================================

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
}

const SENSITIVE_FIELDS = ['password', 'token', 'apiKey', 'secret', 'authorization', 'cookie']

// ============================================================================
// Global State
// ============================================================================

let globalLogLevel: LogLevel = 'trace'
let globalLogger: Logger | null = null
const scopedLoggers = new Map<string, Logger>()
const metricsStore = new Map<string, number[]>()
const errorMetricsStore = new Map<string, number>()

// Current context stack for withContext helper
let currentContextStack: LogContext[] = []
let currentHandler: LogHandler | null = null

// ============================================================================
// Utility Functions
// ============================================================================

function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`
}

function getCallerSource(): string {
  const err = new Error()
  const stack = err.stack?.split('\n') || []
  // Skip Error, getCallerSource, log method, and internal calls
  const callerLine = stack.find(
    (line, idx) =>
      idx > 2 &&
      !line.includes('logging.ts') &&
      !line.includes('at Logger') &&
      line.includes('at ')
  )
  if (callerLine) {
    const match = callerLine.match(/at\s+(?:.*?\s+\()?(.+?)(?:\))?$/)
    return match?.[1]?.trim() || 'unknown'
  }
  return 'unknown'
}

function redactSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      result[key] = '[REDACTED]'
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitiveData(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

function serializeError(error: Error): Record<string, unknown> {
  const result: Record<string, unknown> = {
    message: error.message,
    name: error.name,
    stack: error.stack,
  }
  if (error.cause) {
    if (error.cause instanceof Error) {
      result.cause = serializeError(error.cause)
    } else {
      result.cause = error.cause
    }
  }
  return result
}

function processData(data: Record<string, unknown>): Record<string, unknown> {
  const processed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Error) {
      processed[key] = serializeError(value)
    } else if (value && typeof value === 'object') {
      try {
        // Test for circular references
        JSON.stringify(value)
        processed[key] = value
      } catch {
        processed[key] = '[Circular or non-serializable]'
      }
    } else {
      processed[key] = value
    }
  }
  return redactSensitiveData(processed)
}

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel]
}

function getHighResolutionTime(): number {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now()
  }
  return Date.now()
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

// ============================================================================
// Format and Parse Functions
// ============================================================================

export function formatLogEntry(entry: LogEntry, options?: { pretty?: boolean }): string {
  if (options?.pretty) {
    return JSON.stringify(entry, null, 2)
  }
  return JSON.stringify(entry)
}

export function parseLogEntry(json: string): LogEntry {
  return JSON.parse(json) as LogEntry
}

// ============================================================================
// Request Context
// ============================================================================

export function createRequestContext(options?: { requestId?: string }): LogContext {
  return {
    requestId: options?.requestId || generateId(),
    startTime: Date.now(),
  }
}

// ============================================================================
// Context Helper
// ============================================================================

export async function withContext<T>(
  context: LogContext,
  callback: (logger: Logger) => Promise<T>
): Promise<T> {
  // Merge with current context stack
  const mergedContext = currentContextStack.reduce(
    (acc, ctx) => ({ ...acc, ...ctx }),
    {} as LogContext
  )
  const fullContext = { ...mergedContext, ...context }

  currentContextStack.push(context)

  try {
    const contextLogger = createLogger({
      handler: currentHandler || ((entry) => console.log(formatLogEntry(entry))),
    }).withContext(fullContext)

    return await callback(contextLogger)
  } finally {
    currentContextStack.pop()
  }
}

// ============================================================================
// Performance Timer
// ============================================================================

export function createPerformanceTimer(name?: string, options?: TimerOptions): PerformanceTimer {
  const startTime = options?.highResolution ? getHighResolutionTime() : Date.now()
  const laps: Lap[] = []
  let lastLapTime = startTime
  let stopped = false
  let endDuration = 0

  const timer: PerformanceTimer = {
    name,
    laps,

    elapsed(): number {
      if (stopped) return endDuration
      if (options?.highResolution) {
        return getHighResolutionTime() - startTime
      }
      return Date.now() - startTime
    },

    lap(lapName: string): Lap {
      const currentTime = options?.highResolution ? getHighResolutionTime() : Date.now()
      const elapsed = currentTime - lastLapTime
      lastLapTime = currentTime
      const lap: Lap = { name: lapName, elapsed }
      laps.push(lap)
      return lap
    },

    stop(): number {
      if (stopped) return endDuration
      stopped = true
      endDuration = this.elapsed()

      // Record metric
      const metricName = name || 'unnamed'
      const existing = metricsStore.get(metricName) || []
      existing.push(endDuration)
      metricsStore.set(metricName, existing)

      // Log if logger provided
      if (options?.logger) {
        options.logger.info('Timer completed', {
          operation: name,
          duration: endDuration,
          ...options.metadata,
        })
      }

      return endDuration
    },

    error(err: Error): void {
      if (stopped) return
      stopped = true
      endDuration = this.elapsed()

      // Record metric
      const metricName = name || 'unnamed'
      const existing = metricsStore.get(metricName) || []
      existing.push(endDuration)
      metricsStore.set(metricName, existing)

      // Record error
      const errorCount = errorMetricsStore.get(metricName) || 0
      errorMetricsStore.set(metricName, errorCount + 1)
    },
  }

  return timer
}

// ============================================================================
// Request Tracer
// ============================================================================

function createSpan(
  traceId: string,
  name: string,
  parentSpanId?: string,
  spans?: Span[]
): Span {
  const spanId = generateId()
  const startTime = Date.now()
  const attributes: Record<string, unknown> = {}
  const events: SpanEvent[] = []
  let status: 'ok' | 'error' | undefined
  let statusMessage: string | undefined
  let endTime: number | undefined
  let duration: number | undefined

  const span: Span = {
    spanId,
    traceId,
    parentSpanId,
    name,
    startTime,
    attributes,
    events,

    get endTime() {
      return endTime
    },

    get duration() {
      return duration
    },

    get status() {
      return status
    },

    get statusMessage() {
      return statusMessage
    },

    setAttribute(key: string, value: unknown): void {
      attributes[key] = value
    },

    addEvent(eventName: string, attrs?: Record<string, unknown>): void {
      events.push({
        name: eventName,
        timestamp: Date.now(),
        attributes: attrs,
      })
    },

    setStatus(s: 'ok' | 'error', message?: string): void {
      status = s
      statusMessage = message
    },

    startSpan(childName: string): Span {
      return createSpan(traceId, childName, spanId, spans)
    },

    end(): void {
      endTime = Date.now()
      duration = endTime - startTime
      if (spans) {
        spans.push(span)
      }
    },
  }

  return span
}

export function createRequestTracer(options?: {
  headers?: Record<string, string>
}): RequestTracer {
  const traceId = options?.headers?.['x-trace-id'] || generateId()
  const parentSpanId = options?.headers?.['x-parent-span-id']
  const spans: Span[] = []

  return {
    traceId,
    parentSpanId,

    startSpan(name: string): Span {
      return createSpan(traceId, name, parentSpanId, spans)
    },

    injectHeaders(): Record<string, string> {
      return {
        'x-trace-id': traceId,
      }
    },

    export(): TraceExport {
      return {
        traceId,
        spans: spans.map((s) => ({
          spanId: s.spanId,
          parentSpanId: s.parentSpanId,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
          attributes: s.attributes,
          events: s.events,
          status: s.status,
          statusMessage: s.statusMessage,
        })),
      }
    },
  }
}

// ============================================================================
// Logger Implementation
// ============================================================================

class LoggerImpl implements Logger {
  private level: LogLevel
  private handlers: LogHandler[]
  private filter?: LogFilter
  private timestampFn: () => string
  private service?: string
  private environment?: string
  private context: LogContext
  private contextProviders: ContextProvider[]

  constructor(options: LoggerOptions = {}, context: LogContext = {}) {
    this.level = options.level || globalLogLevel
    this.handlers = options.handlers || (options.handler ? [options.handler] : [])
    this.filter = options.filter
    this.timestampFn = options.timestamp || (() => new Date().toISOString())
    this.service = options.service
    this.environment = options.environment
    this.context = context
    this.contextProviders = options.contextProviders || []

    // Track handler for withContext helper
    if (this.handlers.length > 0) {
      currentHandler = this.handlers[0]
    }
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!shouldLog(level, this.level)) {
      return
    }

    // Gather dynamic context from providers
    const dynamicContext = this.contextProviders.reduce(
      (acc, provider) => ({ ...acc, ...provider() }),
      {} as LogContext
    )

    const entry: LogEntry = {
      timestamp: this.timestampFn(),
      level,
      message,
      source: getCallerSource(),
    }

    if (data) {
      entry.data = processData(data)
    }

    const mergedContext = { ...this.context, ...dynamicContext }
    if (Object.keys(mergedContext).length > 0) {
      entry.context = mergedContext
    }

    if (this.service) {
      entry.service = this.service
    }

    if (this.environment) {
      entry.environment = this.environment
    }

    // Apply filter
    if (this.filter && !this.filter(entry)) {
      return
    }

    // Send to handlers
    for (const handler of this.handlers) {
      handler(entry)
    }
  }

  trace(message: string, data?: Record<string, unknown>): void {
    this.log('trace', message, data)
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data)
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data)
  }

  fatal(message: string, data?: Record<string, unknown>): void {
    this.log('fatal', message, data)
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  withContext(context: LogContext): Logger {
    const newLogger = new LoggerImpl(
      {
        level: this.level,
        handlers: this.handlers,
        filter: this.filter,
        timestamp: this.timestampFn,
        service: this.service,
        environment: this.environment,
        contextProviders: this.contextProviders,
      },
      { ...this.context, ...context }
    )
    return newLogger
  }

  time<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
    const startTime = Date.now()

    const logResult = (success: boolean, duration: number, error?: Error) => {
      const data: Record<string, unknown> = {
        operation: name,
        duration,
      }
      if (error) {
        data.error = error
      }

      if (success) {
        this.info(`Timer: ${name}`, data)
      } else {
        this.error(`Timer: ${name} failed`, data)
      }
    }

    try {
      const result = fn()

      if (result instanceof Promise) {
        return result
          .then((value) => {
            const duration = Date.now() - startTime
            logResult(true, duration)
            return value
          })
          .catch((err) => {
            const duration = Date.now() - startTime
            logResult(false, duration, err)
            throw err
          }) as Promise<T>
      }

      const duration = Date.now() - startTime
      logResult(true, duration)
      return result
    } catch (err) {
      const duration = Date.now() - startTime
      logResult(false, duration, err as Error)
      throw err
    }
  }

  getMetrics(name: string): TimingMetrics {
    const values = metricsStore.get(name) || []
    const errorCount = errorMetricsStore.get(name) || 0
    const count = values.length

    if (count === 0) {
      return {
        count: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        errorCount: 0,
        errorRate: 0,
      }
    }

    const sum = values.reduce((a, b) => a + b, 0)
    const avg = sum / count
    const min = Math.min(...values)
    const max = Math.max(...values)

    return {
      count,
      avg,
      min,
      max,
      p50: calculatePercentile(values, 50),
      p95: calculatePercentile(values, 95),
      p99: calculatePercentile(values, 99),
      errorCount,
      errorRate: errorCount / count,
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createLogger(options: LoggerOptions = {}): Logger {
  return new LoggerImpl(options)
}

export function getLogger(namespace?: string): Logger {
  if (!namespace) {
    if (!globalLogger) {
      globalLogger = createLogger()
    }
    return globalLogger
  }

  let logger = scopedLoggers.get(namespace)
  if (!logger) {
    logger = createLogger()
    scopedLoggers.set(namespace, logger)
  }
  return logger
}

export function setGlobalLogLevel(level: LogLevel): void {
  globalLogLevel = level
}
