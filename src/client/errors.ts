/**
 * Layer 7: Client SDK Error Handling
 *
 * Provides comprehensive error types, serialization, and utilities
 * for the convex.do client SDK.
 */

// ============================================================================
// Error Code Enum
// ============================================================================

/**
 * Error codes for categorizing errors in the client SDK.
 */
export enum ErrorCode {
  /** Network-related errors (connection failures, offline, etc.) */
  NETWORK = 'NETWORK',
  /** Authentication-related errors */
  AUTH = 'AUTH',
  /** Validation errors (invalid arguments, schema mismatches) */
  VALIDATION = 'VALIDATION',
  /** Server-side errors */
  SERVER = 'SERVER',
  /** Request timeout errors */
  TIMEOUT = 'TIMEOUT',
  /** Unknown or unclassified errors */
  UNKNOWN = 'UNKNOWN',
  /** Rate limiting errors */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Resource not found errors */
  NOT_FOUND = 'NOT_FOUND',
  /** Unauthorized access errors */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** Forbidden access errors */
  FORBIDDEN = 'FORBIDDEN',
  /** Conflict errors (concurrent modification, etc.) */
  CONFLICT = 'CONFLICT',
  /** Internal server errors */
  INTERNAL = 'INTERNAL',
  /** Application-level errors thrown by user code */
  APPLICATION = 'APPLICATION',
}

// ============================================================================
// Error Context Type
// ============================================================================

/**
 * Context information attached to errors for debugging and tracing.
 */
export interface ErrorContext {
  /** The function name where the error occurred */
  functionName: string
  /** The arguments passed to the function */
  args?: unknown
  /** Timestamp when the error occurred */
  timestamp: number
  /** Request ID for tracing */
  requestId?: string
  /** User ID if available */
  userId?: string
  /** Session ID if available */
  sessionId?: string
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/**
 * Field error for validation errors with multiple fields.
 */
export interface FieldError {
  field: string
  message: string
}

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Options for creating a BaseConvexError.
 */
export interface BaseConvexErrorOptions {
  cause?: Error
  context?: ErrorContext
}

/**
 * Base class for all Convex-specific errors.
 */
export class BaseConvexError extends Error {
  /** Error code categorizing the error type */
  readonly code: ErrorCode
  /** Timestamp when the error was created */
  readonly timestamp: number
  /** Original error that caused this error */
  readonly cause?: Error
  /** Context information for debugging */
  context?: ErrorContext

  constructor(message: string, code: ErrorCode, options?: BaseConvexErrorOptions) {
    super(message)
    this.name = 'BaseConvexError'
    this.code = code
    this.timestamp = Date.now()
    this.cause = options?.cause
    this.context = options?.context

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

// ============================================================================
// ConvexError (Application Error)
// ============================================================================

/**
 * Application-level error with typed data.
 * This is the error type that users throw from their Convex functions.
 */
export class ConvexError<T = unknown> extends BaseConvexError {
  /** The error data */
  readonly data: T

  constructor(data: T, options?: BaseConvexErrorOptions) {
    const message = typeof data === 'string' ? data : JSON.stringify(data)
    super(message, ErrorCode.APPLICATION, options)
    this.name = 'ConvexError'
    this.data = data
  }
}

// ============================================================================
// NetworkError
// ============================================================================

/**
 * Options for creating a NetworkError.
 */
export interface NetworkErrorOptions extends BaseConvexErrorOptions {
  statusCode?: number
  url?: string
  method?: string
  isOffline?: boolean
}

/**
 * Error for network-related failures (connection issues, fetch failures, etc.)
 */
export class NetworkError extends BaseConvexError {
  /** HTTP status code if available */
  readonly statusCode?: number
  /** URL that was being accessed */
  readonly url?: string
  /** HTTP method used */
  readonly method?: string
  /** Whether the error is due to being offline */
  readonly isOffline: boolean

  constructor(message: string, options?: NetworkErrorOptions) {
    super(message, ErrorCode.NETWORK, options)
    this.name = 'NetworkError'
    this.statusCode = options?.statusCode
    this.url = options?.url
    this.method = options?.method
    this.isOffline = options?.isOffline ?? false
  }
}

// ============================================================================
// AuthenticationError
// ============================================================================

/**
 * Options for creating an AuthenticationError.
 */
export interface AuthenticationErrorOptions extends BaseConvexErrorOptions {
  code?: ErrorCode.AUTH | ErrorCode.UNAUTHORIZED | ErrorCode.FORBIDDEN
  tokenExpired?: boolean
  requiredRole?: string
  requiredPermissions?: string[]
  requiresReauth?: boolean
}

/**
 * Error for authentication and authorization failures.
 */
export class AuthenticationError extends BaseConvexError {
  /** Whether the token has expired */
  readonly tokenExpired?: boolean
  /** Required role for access */
  readonly requiredRole?: string
  /** Required permissions for access */
  readonly requiredPermissions?: string[]
  /** Whether re-authentication is required */
  readonly requiresReauth?: boolean

  constructor(message: string, options?: AuthenticationErrorOptions) {
    super(message, options?.code ?? ErrorCode.AUTH, options)
    this.name = 'AuthenticationError'
    this.tokenExpired = options?.tokenExpired
    this.requiredRole = options?.requiredRole
    this.requiredPermissions = options?.requiredPermissions
    this.requiresReauth = options?.requiresReauth
  }
}

// ============================================================================
// ValidationError
// ============================================================================

/**
 * Options for creating a ValidationError.
 */
export interface ValidationErrorOptions extends BaseConvexErrorOptions {
  field?: string
  expectedType?: string
  receivedType?: string
  receivedValue?: unknown
  constraint?: string
  fieldErrors?: FieldError[]
  path?: string[]
}

/**
 * Error for validation failures (invalid arguments, schema mismatches, etc.)
 */
export class ValidationError extends BaseConvexError {
  /** The field that failed validation */
  readonly field?: string
  /** Expected type for the field */
  readonly expectedType?: string
  /** Actual type received */
  readonly receivedType?: string
  /** Actual value received */
  readonly receivedValue?: unknown
  /** Constraint that was violated */
  readonly constraint?: string
  /** Multiple field errors */
  readonly fieldErrors?: FieldError[]
  /** Path to nested field */
  readonly path?: string[]

  constructor(message: string, options?: ValidationErrorOptions) {
    super(message, ErrorCode.VALIDATION, options)
    this.name = 'ValidationError'
    this.field = options?.field
    this.expectedType = options?.expectedType
    this.receivedType = options?.receivedType
    this.receivedValue = options?.receivedValue
    this.constraint = options?.constraint
    this.fieldErrors = options?.fieldErrors
    this.path = options?.path
  }
}

// ============================================================================
// ServerError
// ============================================================================

/**
 * Options for creating a ServerError.
 */
export interface ServerErrorOptions extends BaseConvexErrorOptions {
  code?: ErrorCode.SERVER | ErrorCode.INTERNAL | ErrorCode.NOT_FOUND | ErrorCode.CONFLICT | ErrorCode.RATE_LIMITED
  statusCode?: number
  requestId?: string
  serverMessage?: string
  retryAfter?: number
}

/**
 * Error for server-side failures.
 */
export class ServerError extends BaseConvexError {
  /** HTTP status code */
  readonly statusCode?: number
  /** Request ID for tracing */
  readonly requestId?: string
  /** Detailed server message (not shown to users) */
  readonly serverMessage?: string
  /** Seconds to wait before retrying (for rate limiting) */
  readonly retryAfter?: number

  constructor(message: string, options?: ServerErrorOptions) {
    super(message, options?.code ?? ErrorCode.SERVER, options)
    this.name = 'ServerError'
    this.statusCode = options?.statusCode
    this.requestId = options?.requestId
    this.serverMessage = options?.serverMessage
    this.retryAfter = options?.retryAfter
  }
}

// ============================================================================
// TimeoutError
// ============================================================================

/**
 * Options for creating a TimeoutError.
 */
export interface TimeoutErrorOptions extends BaseConvexErrorOptions {
  timeout?: number
  elapsed?: number
  operation?: string
  isClientTimeout?: boolean
}

/**
 * Error for request timeout failures.
 */
export class TimeoutError extends BaseConvexError {
  /** Configured timeout in milliseconds */
  readonly timeout?: number
  /** Actual elapsed time in milliseconds */
  readonly elapsed?: number
  /** Operation that timed out */
  readonly operation?: string
  /** Whether timeout was client-side */
  readonly isClientTimeout?: boolean

  constructor(message: string, options?: TimeoutErrorOptions) {
    super(message, ErrorCode.TIMEOUT, options)
    this.name = 'TimeoutError'
    this.timeout = options?.timeout
    this.elapsed = options?.elapsed
    this.operation = options?.operation
    this.isClientTimeout = options?.isClientTimeout
  }
}

// ============================================================================
// Error Serialization
// ============================================================================

/**
 * Serialized error format for transmission.
 */
export interface SerializedError {
  name: string
  message: string
  code: string
  timestamp: number
  stack?: string
  cause?: SerializedError
  context?: ErrorContext
  // Type-specific fields
  data?: unknown
  statusCode?: number
  url?: string
  method?: string
  isOffline?: boolean
  tokenExpired?: boolean
  requiredRole?: string
  requiredPermissions?: string[]
  requiresReauth?: boolean
  field?: string
  expectedType?: string
  receivedType?: string
  receivedValue?: unknown
  constraint?: string
  fieldErrors?: FieldError[]
  path?: string[]
  requestId?: string
  serverMessage?: string
  retryAfter?: number
  timeout?: number
  elapsed?: number
  operation?: string
  isClientTimeout?: boolean
}

/**
 * Serialize an error for transmission or storage.
 */
export function serializeError(error: Error): SerializedError {
  const base: SerializedError = {
    name: error.name,
    message: error.message,
    code: (error as BaseConvexError).code ?? ErrorCode.UNKNOWN,
    timestamp: (error as BaseConvexError).timestamp ?? Date.now(),
    stack: error.stack,
  }

  // Serialize cause chain
  if ((error as BaseConvexError).cause) {
    base.cause = serializeError((error as BaseConvexError).cause as Error)
  }

  // Serialize context
  if ((error as BaseConvexError).context) {
    base.context = (error as BaseConvexError).context
  }

  // Type-specific fields
  if (error instanceof ConvexError) {
    base.data = error.data
  }

  if (error instanceof NetworkError) {
    base.statusCode = error.statusCode
    base.url = error.url
    base.method = error.method
    base.isOffline = error.isOffline
  }

  if (error instanceof AuthenticationError) {
    base.tokenExpired = error.tokenExpired
    base.requiredRole = error.requiredRole
    base.requiredPermissions = error.requiredPermissions
    base.requiresReauth = error.requiresReauth
  }

  if (error instanceof ValidationError) {
    base.field = error.field
    base.expectedType = error.expectedType
    base.receivedType = error.receivedType
    base.receivedValue = error.receivedValue
    base.constraint = error.constraint
    base.fieldErrors = error.fieldErrors
    base.path = error.path
  }

  if (error instanceof ServerError) {
    base.statusCode = error.statusCode
    base.requestId = error.requestId
    base.serverMessage = error.serverMessage
    base.retryAfter = error.retryAfter
  }

  if (error instanceof TimeoutError) {
    base.timeout = error.timeout
    base.elapsed = error.elapsed
    base.operation = error.operation
    base.isClientTimeout = error.isClientTimeout
  }

  return base
}

/**
 * Deserialize an error from serialized format.
 */
export function deserializeError(serialized: SerializedError): BaseConvexError {
  const options: BaseConvexErrorOptions = {
    context: serialized.context,
  }

  // Deserialize cause chain
  if (serialized.cause) {
    options.cause = deserializeError(serialized.cause)
  }

  let error: BaseConvexError

  switch (serialized.name) {
    case 'ConvexError':
      error = new ConvexError(serialized.data, options)
      break

    case 'NetworkError':
      error = new NetworkError(serialized.message, {
        ...options,
        statusCode: serialized.statusCode,
        url: serialized.url,
        method: serialized.method,
        isOffline: serialized.isOffline,
      })
      break

    case 'AuthenticationError':
      error = new AuthenticationError(serialized.message, {
        ...options,
        code: serialized.code as ErrorCode.AUTH | ErrorCode.UNAUTHORIZED | ErrorCode.FORBIDDEN,
        tokenExpired: serialized.tokenExpired,
        requiredRole: serialized.requiredRole,
        requiredPermissions: serialized.requiredPermissions,
        requiresReauth: serialized.requiresReauth,
      })
      break

    case 'ValidationError':
      error = new ValidationError(serialized.message, {
        ...options,
        field: serialized.field,
        expectedType: serialized.expectedType,
        receivedType: serialized.receivedType,
        receivedValue: serialized.receivedValue,
        constraint: serialized.constraint,
        fieldErrors: serialized.fieldErrors,
        path: serialized.path,
      })
      break

    case 'ServerError':
      error = new ServerError(serialized.message, {
        ...options,
        code: serialized.code as ErrorCode.SERVER | ErrorCode.INTERNAL | ErrorCode.NOT_FOUND | ErrorCode.CONFLICT | ErrorCode.RATE_LIMITED,
        statusCode: serialized.statusCode,
        requestId: serialized.requestId,
        serverMessage: serialized.serverMessage,
        retryAfter: serialized.retryAfter,
      })
      break

    case 'TimeoutError':
      error = new TimeoutError(serialized.message, {
        ...options,
        timeout: serialized.timeout,
        elapsed: serialized.elapsed,
        operation: serialized.operation,
        isClientTimeout: serialized.isClientTimeout,
      })
      break

    default:
      error = new BaseConvexError(serialized.message, serialized.code as ErrorCode, options)
  }

  // Preserve original stack trace
  if (serialized.stack) {
    error.stack = serialized.stack
  }

  return error
}

// ============================================================================
// Error Wrapping
// ============================================================================

/**
 * Options for wrapping errors.
 */
export interface WrapErrorOptions {
  context?: ErrorContext
  forceWrap?: boolean
}

/**
 * Wrap an error with a specific error code and optional message.
 */
export function wrapError(
  error: unknown,
  code: ErrorCode,
  message?: string,
  options?: WrapErrorOptions
): BaseConvexError {
  // Handle non-Error values
  if (!(error instanceof Error)) {
    const msg = message ?? (typeof error === 'string' ? error : String(error))
    return new BaseConvexError(msg, code, { context: options?.context })
  }

  // Don't double-wrap unless forced
  if (error instanceof BaseConvexError && !options?.forceWrap) {
    if (options?.context) {
      error.context = { ...error.context, ...options.context }
    }
    return error
  }

  const wrappedMessage = message ?? error.message

  const baseOptions: BaseConvexErrorOptions = {
    cause: error,
    context: options?.context,
  }

  switch (code) {
    case ErrorCode.NETWORK:
      return new NetworkError(wrappedMessage, baseOptions)

    case ErrorCode.AUTH:
    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.FORBIDDEN:
      return new AuthenticationError(wrappedMessage, { ...baseOptions, code: code as ErrorCode.AUTH })

    case ErrorCode.VALIDATION:
      return new ValidationError(wrappedMessage, baseOptions)

    case ErrorCode.SERVER:
    case ErrorCode.INTERNAL:
    case ErrorCode.NOT_FOUND:
    case ErrorCode.CONFLICT:
    case ErrorCode.RATE_LIMITED:
      return new ServerError(wrappedMessage, { ...baseOptions, code: code as ErrorCode.SERVER })

    case ErrorCode.TIMEOUT:
      return new TimeoutError(wrappedMessage, baseOptions)

    case ErrorCode.APPLICATION:
      return new ConvexError(wrappedMessage, baseOptions)

    default:
      return new BaseConvexError(wrappedMessage, code, baseOptions)
  }
}

// ============================================================================
// Error Context Utilities
// ============================================================================

/**
 * Create an error context object.
 */
export function createErrorContext(
  functionName: string,
  args?: unknown,
  additional?: Partial<ErrorContext>
): ErrorContext {
  return {
    functionName,
    args,
    timestamp: Date.now(),
    ...additional,
  }
}

/**
 * Add context to an existing error.
 */
export function addErrorContext(
  error: Error,
  context: Partial<ErrorContext>
): BaseConvexError {
  if (!(error instanceof BaseConvexError)) {
    // Wrap plain Error with context
    const wrapped = new BaseConvexError(error.message, ErrorCode.UNKNOWN, {
      cause: error,
      context: context as ErrorContext,
    })
    return wrapped
  }

  // Merge context
  error.context = {
    ...error.context,
    ...context,
  } as ErrorContext

  return error
}

// ============================================================================
// Retry-able Error Detection
// ============================================================================

/** HTTP status codes that indicate retryable errors */
const RETRYABLE_STATUS_CODES = [502, 503, 504]

/**
 * Determine if an error is retryable.
 */
export function isRetryableError(error: Error): boolean {
  if (!(error instanceof BaseConvexError)) {
    return false
  }

  // Network errors are generally retryable
  if (error instanceof NetworkError) {
    return true
  }

  // Timeout errors are retryable
  if (error instanceof TimeoutError) {
    return true
  }

  // Rate limited errors are retryable
  if (error.code === ErrorCode.RATE_LIMITED) {
    return true
  }

  // Server errors with specific status codes are retryable
  if (error instanceof ServerError && error.statusCode) {
    return RETRYABLE_STATUS_CODES.includes(error.statusCode)
  }

  return false
}

// ============================================================================
// User-Friendly Error Messages
// ============================================================================

/**
 * Get a user-friendly message for an error.
 */
export function getUserFriendlyMessage(error: Error): string {
  if (error instanceof ConvexError) {
    // For ConvexError, return the data if it's a string or has a message property
    if (typeof error.data === 'string') {
      return error.data
    }
    if (error.data && typeof error.data === 'object' && 'message' in error.data) {
      return String((error.data as { message: unknown }).message)
    }
    return 'An application error occurred.'
  }

  if (error instanceof NetworkError) {
    if (error.isOffline) {
      return 'You appear to be offline. Please check your internet connection and try again.'
    }
    return 'A network error occurred. Please check your connection and try again.'
  }

  if (error instanceof AuthenticationError) {
    if (error.tokenExpired) {
      return 'Your session has expired. Please sign in again.'
    }
    return 'Authentication required. Please sign in to continue.'
  }

  if (error instanceof ValidationError) {
    if (error.field) {
      return `Please check the ${error.field} field and try again.`
    }
    if (error.fieldErrors && error.fieldErrors.length > 0) {
      return 'Please check the form for errors and try again.'
    }
    return 'Invalid input. Please check your data and try again.'
  }

  if (error instanceof ServerError) {
    if (error.code === ErrorCode.RATE_LIMITED) {
      return 'Too many requests. Please slow down and try again later.'
    }
    return 'Something went wrong on our end. Please try again later.'
  }

  if (error instanceof TimeoutError) {
    return 'The request is taking longer than expected. Please try again.'
  }

  // Generic message for unknown errors
  return 'An unexpected error occurred. Please try again.'
}

// ============================================================================
// Error Logging Utilities
// ============================================================================

/** Sensitive field names that should be redacted in logs */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'key',
  'auth',
  'credential',
  'apikey',
  'api_key',
  'authorization',
  'bearer',
  'jwt',
  'session',
  'cookie',
]

/**
 * Redact sensitive values from an object.
 */
function redactSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj // Prevent infinite recursion

  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item, depth + 1))
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase()
    const isSensitive = SENSITIVE_FIELDS.some((field) => lowerKey.includes(field))

    if (isSensitive) {
      result[key] = '[REDACTED]'
    } else {
      result[key] = redactSensitive(value, depth + 1)
    }
  }

  return result
}

/**
 * Options for formatting errors for logging.
 */
export interface FormatErrorOptions {
  format?: 'text' | 'json'
  includeStack?: boolean
  redactSensitive?: boolean
}

/**
 * Format an error for logging.
 */
export function formatErrorForLogging(
  error: Error,
  options?: FormatErrorOptions
): string {
  const format = options?.format ?? 'text'
  const includeStack = options?.includeStack ?? true
  const shouldRedact = options?.redactSensitive ?? true

  const baseError = error as BaseConvexError
  const timestamp = baseError.timestamp ?? Date.now()
  const dateStr = new Date(timestamp).toISOString()

  // Build log data
  const logData: Record<string, unknown> = {
    timestamp: dateStr,
    name: error.name,
    message: error.message,
    code: baseError.code,
  }

  // Add type-specific fields
  if (error instanceof ServerError) {
    logData.statusCode = error.statusCode
    logData.requestId = error.requestId
  }

  if (error instanceof NetworkError) {
    logData.url = error.url
    logData.method = error.method
    logData.isOffline = error.isOffline
  }

  if (error instanceof ValidationError) {
    logData.field = error.field
    logData.expectedType = error.expectedType
    logData.receivedType = error.receivedType
  }

  if (error instanceof TimeoutError) {
    logData.timeout = error.timeout
    logData.elapsed = error.elapsed
    logData.operation = error.operation
  }

  // Add context
  if (baseError.context) {
    const context = shouldRedact
      ? redactSensitive(baseError.context)
      : baseError.context
    logData.context = context
  }

  // Add stack trace
  if (includeStack && error.stack) {
    logData.stack = error.stack
  }

  // Add cause chain
  if (baseError.cause) {
    logData.cause = {
      name: baseError.cause.name,
      message: baseError.cause.message,
      stack: baseError.cause.stack,
    }
  }

  if (format === 'json') {
    return JSON.stringify(logData, null, 2)
  }

  // Text format
  const lines: string[] = [
    `[${dateStr}] ${error.name}: ${error.message}`,
    `  Code: ${baseError.code ?? 'UNKNOWN'}`,
  ]

  if (error instanceof ServerError && error.statusCode) {
    lines.push(`  Status: ${error.statusCode}`)
  }

  if (error instanceof ServerError && error.requestId) {
    lines.push(`  Request ID: ${error.requestId}`)
  }

  if (baseError.context) {
    const ctx = shouldRedact ? redactSensitive(baseError.context) : baseError.context
    lines.push(`  Context: ${JSON.stringify(ctx)}`)
  }

  if (includeStack && error.stack) {
    lines.push(`  Stack: ${error.stack}`)
  }

  // Add full cause chain
  let currentCause: Error | undefined = baseError.cause
  let causeDepth = 0
  while (currentCause && causeDepth < 10) {
    const indent = '  '.repeat(causeDepth + 1)
    lines.push(`${indent}Cause: ${currentCause.name}: ${currentCause.message}`)
    if (currentCause.stack) {
      lines.push(`${indent}Cause Stack: ${currentCause.stack}`)
    }
    currentCause = (currentCause as BaseConvexError).cause
    causeDepth++
  }

  return lines.join('\n')
}

// ============================================================================
// Error Logger
// ============================================================================

/**
 * Log level type.
 */
export type LogLevel = 'log' | 'warn' | 'error'

/**
 * Error logger options.
 */
export interface ErrorLoggerOptions {
  /** Custom log handler */
  handler?: (message: string, level: LogLevel, error: Error) => void | Promise<void>
  /** Minimum log level */
  level?: LogLevel
  /** Whether to use async handling */
  async?: boolean
  /** Whether to batch logs */
  batch?: boolean
  /** Batch interval in milliseconds */
  batchInterval?: number
}

/**
 * Error logger interface.
 */
export interface ErrorLogger {
  log(error: Error): void | Promise<void>
  warn(error: Error): void | Promise<void>
  error(error: Error): void | Promise<void>
  flush?(): Promise<void>
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  log: 0,
  warn: 1,
  error: 2,
}

/**
 * Create an error logger instance.
 */
export function createErrorLogger(options?: ErrorLoggerOptions): ErrorLogger {
  const level = options?.level ?? 'log'
  const handler = options?.handler
  const isAsync = options?.async ?? false
  const shouldBatch = options?.batch ?? false
  const batchInterval = options?.batchInterval ?? 1000

  let batchedLogs: Array<{ message: string; level: LogLevel; error: Error }> = []
  let batchTimeout: ReturnType<typeof setTimeout> | null = null

  function shouldLog(logLevel: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[logLevel] >= LOG_LEVEL_PRIORITY[level]
  }

  function formatAndLog(error: Error, logLevel: LogLevel): void | Promise<void> {
    if (!shouldLog(logLevel)) {
      return
    }

    const message = formatErrorForLogging(error)

    if (shouldBatch) {
      batchedLogs.push({ message, level: logLevel, error })

      if (!batchTimeout) {
        batchTimeout = setTimeout(() => {
          flushBatch()
        }, batchInterval)
      }
      return
    }

    return executeLog(message, logLevel, error)
  }

  function executeLog(message: string, logLevel: LogLevel, error: Error): void | Promise<void> {
    if (handler) {
      const result = handler(message, logLevel, error)
      if (isAsync && result instanceof Promise) {
        return result
      }
      return
    }

    // Default console logging
    switch (logLevel) {
      case 'log':
        console.log(message)
        break
      case 'warn':
        console.warn(message)
        break
      case 'error':
        console.error(message)
        break
    }
  }

  function flushBatch(): void {
    if (batchTimeout) {
      clearTimeout(batchTimeout)
      batchTimeout = null
    }

    if (batchedLogs.length === 0) {
      return
    }

    const logs = batchedLogs
    batchedLogs = []

    const combinedMessage = logs.map((l) => l.message).join('\n---\n')

    if (handler) {
      handler(combinedMessage, 'log', logs[0].error)
    } else {
      console.log(combinedMessage)
    }
  }

  return {
    log(error: Error) {
      return formatAndLog(error, 'log')
    },
    warn(error: Error) {
      return formatAndLog(error, 'warn')
    },
    error(error: Error) {
      return formatAndLog(error, 'error')
    },
    async flush() {
      flushBatch()
    },
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a BaseConvexError.
 */
export function isBaseConvexError(value: unknown): value is BaseConvexError {
  return value instanceof BaseConvexError
}

/**
 * Check if a value is a ConvexError.
 */
export function isConvexError(value: unknown): value is ConvexError {
  return value instanceof ConvexError
}

/**
 * Check if a value is a NetworkError.
 */
export function isNetworkError(value: unknown): value is NetworkError {
  return value instanceof NetworkError
}

/**
 * Check if a value is an AuthenticationError.
 */
export function isAuthenticationError(value: unknown): value is AuthenticationError {
  return value instanceof AuthenticationError
}

/**
 * Check if a value is a ValidationError.
 */
export function isValidationError(value: unknown): value is ValidationError {
  return value instanceof ValidationError
}

/**
 * Check if a value is a ServerError.
 */
export function isServerError(value: unknown): value is ServerError {
  return value instanceof ServerError
}

/**
 * Check if a value is a TimeoutError.
 */
export function isTimeoutError(value: unknown): value is TimeoutError {
  return value instanceof TimeoutError
}
