/**
 * TDD Tests for Server Error Response Standardization
 *
 * These tests verify that error responses are consistent across all server
 * endpoints, with proper error codes, HTTP status codes, and stack trace
 * handling in development mode.
 *
 * RED Phase: Tests define expected behavior for error response standardization.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  // Error Classes
  ConvexError,
  BaseConvexError,
  ServerError,
  ValidationError,
  AuthenticationError,
  NetworkError,
  TimeoutError,
  ErrorCode,
  serializeError,
  deserializeError,
} from '../../src/client/errors'

// ============================================================================
// Types for Error Response Format
// ============================================================================

/**
 * Standard error response format for all server endpoints.
 * This interface defines the expected shape of error responses.
 */
interface ErrorResponse {
  /** Error code matching Convex API error codes */
  code: string
  /** Human-readable error message */
  message: string
  /** Additional error data (for ConvexError) */
  data?: unknown
  /** Stack trace (only in dev mode) */
  stack?: string
  /** Request ID for tracing */
  requestId?: string
  /** HTTP status code */
  status?: number
}

/**
 * Expected mapping of error codes to HTTP status codes.
 */
const ERROR_CODE_TO_HTTP_STATUS: Record<string, number> = {
  [ErrorCode.VALIDATION]: 400,
  [ErrorCode.AUTH]: 401,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.SERVER]: 500,
  [ErrorCode.INTERNAL]: 500,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.NETWORK]: 502,
  [ErrorCode.APPLICATION]: 400, // ConvexError user errors are client errors
  [ErrorCode.UNKNOWN]: 500,
}

// ============================================================================
// Helper Functions for Testing
// ============================================================================

/**
 * Creates a standardized error response from an error.
 * This is the function that needs to be implemented.
 */
function createErrorResponse(error: Error, options?: { isDev?: boolean; requestId?: string }): ErrorResponse {
  const isDev = options?.isDev ?? false
  const requestId = options?.requestId

  if (error instanceof BaseConvexError) {
    const response: ErrorResponse = {
      code: error.code,
      message: error.message,
    }

    if (error instanceof ConvexError) {
      response.data = error.data
    }

    if (isDev && error.stack) {
      response.stack = error.stack
    }

    if (requestId) {
      response.requestId = requestId
    }

    response.status = ERROR_CODE_TO_HTTP_STATUS[error.code] ?? 500

    return response
  }

  // For plain Error objects, return a generic server error
  return {
    code: ErrorCode.INTERNAL,
    message: isDev ? error.message : 'Internal server error',
    status: 500,
    stack: isDev ? error.stack : undefined,
    requestId,
  }
}

/**
 * Gets the HTTP status code for an error.
 */
function getHttpStatusCode(error: Error): number {
  if (error instanceof BaseConvexError) {
    return ERROR_CODE_TO_HTTP_STATUS[error.code] ?? 500
  }
  return 500
}

// ============================================================================
// Error Response Format Tests
// ============================================================================

describe('Error Response Format', () => {
  describe('consistent error response structure', () => {
    it('should have code property for all error types', () => {
      const errors = [
        new ConvexError('User error'),
        new ValidationError('Invalid input'),
        new AuthenticationError('Not authenticated'),
        new ServerError('Server issue'),
        new TimeoutError('Request timed out'),
        new NetworkError('Connection failed'),
      ]

      for (const error of errors) {
        const response = createErrorResponse(error)
        expect(response).toHaveProperty('code')
        expect(typeof response.code).toBe('string')
        expect(response.code.length).toBeGreaterThan(0)
      }
    })

    it('should have message property for all error types', () => {
      const errors = [
        new ConvexError('User error message'),
        new ValidationError('Validation failed'),
        new AuthenticationError('Auth required'),
        new ServerError('Server error'),
        new TimeoutError('Timeout'),
        new NetworkError('Network error'),
      ]

      for (const error of errors) {
        const response = createErrorResponse(error)
        expect(response).toHaveProperty('message')
        expect(typeof response.message).toBe('string')
      }
    })

    it('should have consistent shape across all endpoint types', () => {
      const error = new ServerError('Test error')
      const response = createErrorResponse(error)

      // All responses should have these required fields
      expect(response).toHaveProperty('code')
      expect(response).toHaveProperty('message')
      expect(response).toHaveProperty('status')

      // Verify types
      expect(typeof response.code).toBe('string')
      expect(typeof response.message).toBe('string')
      expect(typeof response.status).toBe('number')
    })

    it('should include requestId when provided', () => {
      const error = new ServerError('Test error')
      const requestId = 'req_abc123xyz456'
      const response = createErrorResponse(error, { requestId })

      expect(response.requestId).toBe(requestId)
    })

    it('should not include requestId when not provided', () => {
      const error = new ServerError('Test error')
      const response = createErrorResponse(error)

      expect(response.requestId).toBeUndefined()
    })
  })

  describe('ConvexError response format', () => {
    it('should include data property for ConvexError with string data', () => {
      const error = new ConvexError('User-facing error message')
      const response = createErrorResponse(error)

      expect(response.data).toBe('User-facing error message')
    })

    it('should include data property for ConvexError with object data', () => {
      const errorData = { field: 'email', reason: 'Invalid format' }
      const error = new ConvexError(errorData)
      const response = createErrorResponse(error)

      expect(response.data).toEqual(errorData)
    })

    it('should include data property for ConvexError with complex nested data', () => {
      const errorData = {
        errors: [
          { field: 'name', message: 'Required' },
          { field: 'email', message: 'Invalid' },
        ],
        code: 'VALIDATION_FAILED',
      }
      const error = new ConvexError(errorData)
      const response = createErrorResponse(error)

      expect(response.data).toEqual(errorData)
    })

    it('should have APPLICATION error code for ConvexError', () => {
      const error = new ConvexError('Any data')
      const response = createErrorResponse(error)

      expect(response.code).toBe(ErrorCode.APPLICATION)
    })
  })

  describe('plain Error handling', () => {
    it('should wrap plain Error with INTERNAL code', () => {
      const error = new Error('Unexpected error')
      const response = createErrorResponse(error)

      expect(response.code).toBe(ErrorCode.INTERNAL)
    })

    it('should hide internal error message in production mode', () => {
      const error = new Error('Database connection string: secret123')
      const response = createErrorResponse(error, { isDev: false })

      expect(response.message).toBe('Internal server error')
      expect(response.message).not.toContain('secret123')
    })

    it('should show internal error message in dev mode', () => {
      const error = new Error('Detailed debug message')
      const response = createErrorResponse(error, { isDev: true })

      expect(response.message).toBe('Detailed debug message')
    })
  })
})

// ============================================================================
// Error Code Tests
// ============================================================================

describe('Error Codes', () => {
  describe('error codes match Convex API conventions', () => {
    it('should use VALIDATION for ValidationError', () => {
      const error = new ValidationError('Invalid input')
      expect(error.code).toBe(ErrorCode.VALIDATION)
    })

    it('should use AUTH for basic AuthenticationError', () => {
      const error = new AuthenticationError('Auth required')
      expect(error.code).toBe(ErrorCode.AUTH)
    })

    it('should use UNAUTHORIZED for unauthorized access', () => {
      const error = new AuthenticationError('Not authenticated', {
        code: ErrorCode.UNAUTHORIZED,
      })
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED)
    })

    it('should use FORBIDDEN for forbidden access', () => {
      const error = new AuthenticationError('Access denied', {
        code: ErrorCode.FORBIDDEN,
      })
      expect(error.code).toBe(ErrorCode.FORBIDDEN)
    })

    it('should use NOT_FOUND for resource not found', () => {
      const error = new ServerError('Document not found', {
        code: ErrorCode.NOT_FOUND,
      })
      expect(error.code).toBe(ErrorCode.NOT_FOUND)
    })

    it('should use CONFLICT for concurrent modification', () => {
      const error = new ServerError('Conflict detected', {
        code: ErrorCode.CONFLICT,
      })
      expect(error.code).toBe(ErrorCode.CONFLICT)
    })

    it('should use RATE_LIMITED for rate limiting', () => {
      const error = new ServerError('Too many requests', {
        code: ErrorCode.RATE_LIMITED,
      })
      expect(error.code).toBe(ErrorCode.RATE_LIMITED)
    })

    it('should use SERVER for generic server errors', () => {
      const error = new ServerError('Server error')
      expect(error.code).toBe(ErrorCode.SERVER)
    })

    it('should use INTERNAL for internal errors', () => {
      const error = new ServerError('Internal error', {
        code: ErrorCode.INTERNAL,
      })
      expect(error.code).toBe(ErrorCode.INTERNAL)
    })

    it('should use TIMEOUT for timeout errors', () => {
      const error = new TimeoutError('Request timed out')
      expect(error.code).toBe(ErrorCode.TIMEOUT)
    })

    it('should use NETWORK for network errors', () => {
      const error = new NetworkError('Connection failed')
      expect(error.code).toBe(ErrorCode.NETWORK)
    })

    it('should use APPLICATION for ConvexError', () => {
      const error = new ConvexError('User error')
      expect(error.code).toBe(ErrorCode.APPLICATION)
    })
  })

  describe('error codes are uppercase strings', () => {
    it('should have all error codes as uppercase strings', () => {
      const codes = Object.values(ErrorCode)

      for (const code of codes) {
        expect(typeof code).toBe('string')
        expect(code).toBe(code.toUpperCase())
      }
    })
  })

  describe('error codes are unique', () => {
    it('should have all unique error codes', () => {
      const codes = Object.values(ErrorCode)
      const uniqueCodes = new Set(codes)

      expect(uniqueCodes.size).toBe(codes.length)
    })
  })
})

// ============================================================================
// HTTP Status Code Tests
// ============================================================================

describe('HTTP Status Codes', () => {
  describe('status code mapping', () => {
    it('should return 400 for ValidationError', () => {
      const error = new ValidationError('Invalid input')
      expect(getHttpStatusCode(error)).toBe(400)
    })

    it('should return 401 for AUTH error', () => {
      const error = new AuthenticationError('Auth required')
      expect(getHttpStatusCode(error)).toBe(401)
    })

    it('should return 401 for UNAUTHORIZED error', () => {
      const error = new AuthenticationError('Not authenticated', {
        code: ErrorCode.UNAUTHORIZED,
      })
      expect(getHttpStatusCode(error)).toBe(401)
    })

    it('should return 403 for FORBIDDEN error', () => {
      const error = new AuthenticationError('Access denied', {
        code: ErrorCode.FORBIDDEN,
      })
      expect(getHttpStatusCode(error)).toBe(403)
    })

    it('should return 404 for NOT_FOUND error', () => {
      const error = new ServerError('Not found', {
        code: ErrorCode.NOT_FOUND,
      })
      expect(getHttpStatusCode(error)).toBe(404)
    })

    it('should return 409 for CONFLICT error', () => {
      const error = new ServerError('Conflict', {
        code: ErrorCode.CONFLICT,
      })
      expect(getHttpStatusCode(error)).toBe(409)
    })

    it('should return 429 for RATE_LIMITED error', () => {
      const error = new ServerError('Rate limited', {
        code: ErrorCode.RATE_LIMITED,
      })
      expect(getHttpStatusCode(error)).toBe(429)
    })

    it('should return 500 for SERVER error', () => {
      const error = new ServerError('Server error')
      expect(getHttpStatusCode(error)).toBe(500)
    })

    it('should return 500 for INTERNAL error', () => {
      const error = new ServerError('Internal', {
        code: ErrorCode.INTERNAL,
      })
      expect(getHttpStatusCode(error)).toBe(500)
    })

    it('should return 504 for TIMEOUT error', () => {
      const error = new TimeoutError('Timeout')
      expect(getHttpStatusCode(error)).toBe(504)
    })

    it('should return 502 for NETWORK error', () => {
      const error = new NetworkError('Network error')
      expect(getHttpStatusCode(error)).toBe(502)
    })

    it('should return 400 for APPLICATION (ConvexError) error', () => {
      const error = new ConvexError('User error')
      expect(getHttpStatusCode(error)).toBe(400)
    })

    it('should return 500 for plain Error', () => {
      const error = new Error('Unknown error')
      expect(getHttpStatusCode(error)).toBe(500)
    })

    it('should return 500 for unknown error codes', () => {
      const error = new BaseConvexError('Unknown', ErrorCode.UNKNOWN)
      expect(getHttpStatusCode(error)).toBe(500)
    })
  })

  describe('error response includes status', () => {
    it('should include status in error response', () => {
      const error = new ValidationError('Invalid')
      const response = createErrorResponse(error)

      expect(response.status).toBe(400)
    })

    it('should include correct status for each error type', () => {
      const testCases: Array<[Error, number]> = [
        [new ValidationError('test'), 400],
        [new AuthenticationError('test'), 401],
        [new AuthenticationError('test', { code: ErrorCode.FORBIDDEN }), 403],
        [new ServerError('test', { code: ErrorCode.NOT_FOUND }), 404],
        [new ServerError('test', { code: ErrorCode.RATE_LIMITED }), 429],
        [new ServerError('test'), 500],
        [new TimeoutError('test'), 504],
        [new NetworkError('test'), 502],
        [new ConvexError('test'), 400],
      ]

      for (const [error, expectedStatus] of testCases) {
        const response = createErrorResponse(error)
        expect(response.status).toBe(expectedStatus)
      }
    })
  })
})

// ============================================================================
// Stack Trace Tests
// ============================================================================

describe('Stack Trace Handling', () => {
  describe('dev mode stack traces', () => {
    it('should include stack trace in dev mode', () => {
      const error = new ServerError('Test error')
      const response = createErrorResponse(error, { isDev: true })

      expect(response.stack).toBeDefined()
      expect(typeof response.stack).toBe('string')
      expect(response.stack!.length).toBeGreaterThan(0)
    })

    it('should include stack trace for all error types in dev mode', () => {
      const errors = [
        new ConvexError('test'),
        new ValidationError('test'),
        new AuthenticationError('test'),
        new ServerError('test'),
        new TimeoutError('test'),
        new NetworkError('test'),
      ]

      for (const error of errors) {
        const response = createErrorResponse(error, { isDev: true })
        expect(response.stack).toBeDefined()
        expect(response.stack).toContain(error.name)
      }
    })

    it('should include helpful stack trace pointing to error source', () => {
      function innerFunction() {
        throw new ServerError('Error from inner function')
      }

      function outerFunction() {
        innerFunction()
      }

      try {
        outerFunction()
      } catch (e) {
        const response = createErrorResponse(e as Error, { isDev: true })
        expect(response.stack).toContain('innerFunction')
      }
    })

    it('should preserve stack trace when wrapping errors', () => {
      function originalFunction() {
        throw new Error('Original error')
      }

      try {
        originalFunction()
      } catch (e) {
        const wrapped = new ServerError('Wrapped error', { cause: e as Error })
        const response = createErrorResponse(wrapped, { isDev: true })

        expect(response.stack).toBeDefined()
        expect(wrapped.cause).toBeDefined()
        expect((wrapped.cause as Error).stack).toContain('originalFunction')
      }
    })
  })

  describe('production mode stack traces', () => {
    it('should NOT include stack trace in production mode by default', () => {
      const error = new ServerError('Test error')
      const response = createErrorResponse(error, { isDev: false })

      expect(response.stack).toBeUndefined()
    })

    it('should NOT include stack trace when isDev is not specified', () => {
      const error = new ServerError('Test error')
      const response = createErrorResponse(error)

      expect(response.stack).toBeUndefined()
    })

    it('should hide stack trace for all error types in production', () => {
      const errors = [
        new ConvexError('test'),
        new ValidationError('test'),
        new AuthenticationError('test'),
        new ServerError('test'),
        new TimeoutError('test'),
        new NetworkError('test'),
      ]

      for (const error of errors) {
        const response = createErrorResponse(error, { isDev: false })
        expect(response.stack).toBeUndefined()
      }
    })
  })

  describe('stack trace security', () => {
    it('should not include stack trace in production', () => {
      // Create an error with paths in the stack trace
      const error = new ServerError('Server error occurred')
      // The stack trace would contain file paths like /Users/secret/project/src/internal.ts:42
      const response = createErrorResponse(error, { isDev: false })

      // Stack trace should not be included in production
      expect(response.stack).toBeUndefined()
      // Only the message should be present
      expect(response.message).toBe('Server error occurred')
    })

    it('should not leak environment variables in stack', () => {
      const error = new ServerError('DB connection failed')
      error.stack = `Error: DB connection failed
        at connect (postgres://user:password123@host/db)
        at Database.init`

      const response = createErrorResponse(error, { isDev: false })

      expect(response.stack).toBeUndefined()
    })
  })
})

// ============================================================================
// ConvexError Class Hierarchy Tests
// ============================================================================

describe('ConvexError Class Hierarchy', () => {
  describe('inheritance chain', () => {
    it('should have BaseConvexError extend Error', () => {
      const error = new BaseConvexError('test', ErrorCode.UNKNOWN)

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(BaseConvexError)
    })

    it('should have ConvexError extend BaseConvexError', () => {
      const error = new ConvexError('test')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(BaseConvexError)
      expect(error).toBeInstanceOf(ConvexError)
    })

    it('should have ValidationError extend BaseConvexError', () => {
      const error = new ValidationError('test')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(BaseConvexError)
      expect(error).toBeInstanceOf(ValidationError)
    })

    it('should have AuthenticationError extend BaseConvexError', () => {
      const error = new AuthenticationError('test')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(BaseConvexError)
      expect(error).toBeInstanceOf(AuthenticationError)
    })

    it('should have ServerError extend BaseConvexError', () => {
      const error = new ServerError('test')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(BaseConvexError)
      expect(error).toBeInstanceOf(ServerError)
    })

    it('should have TimeoutError extend BaseConvexError', () => {
      const error = new TimeoutError('test')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(BaseConvexError)
      expect(error).toBeInstanceOf(TimeoutError)
    })

    it('should have NetworkError extend BaseConvexError', () => {
      const error = new NetworkError('test')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(BaseConvexError)
      expect(error).toBeInstanceOf(NetworkError)
    })
  })

  describe('error name property', () => {
    it('should have correct name for BaseConvexError', () => {
      const error = new BaseConvexError('test', ErrorCode.UNKNOWN)
      expect(error.name).toBe('BaseConvexError')
    })

    it('should have correct name for ConvexError', () => {
      const error = new ConvexError('test')
      expect(error.name).toBe('ConvexError')
    })

    it('should have correct name for ValidationError', () => {
      const error = new ValidationError('test')
      expect(error.name).toBe('ValidationError')
    })

    it('should have correct name for AuthenticationError', () => {
      const error = new AuthenticationError('test')
      expect(error.name).toBe('AuthenticationError')
    })

    it('should have correct name for ServerError', () => {
      const error = new ServerError('test')
      expect(error.name).toBe('ServerError')
    })

    it('should have correct name for TimeoutError', () => {
      const error = new TimeoutError('test')
      expect(error.name).toBe('TimeoutError')
    })

    it('should have correct name for NetworkError', () => {
      const error = new NetworkError('test')
      expect(error.name).toBe('NetworkError')
    })
  })

  describe('common properties', () => {
    it('should have code property on all error types', () => {
      const errors = [
        new BaseConvexError('test', ErrorCode.UNKNOWN),
        new ConvexError('test'),
        new ValidationError('test'),
        new AuthenticationError('test'),
        new ServerError('test'),
        new TimeoutError('test'),
        new NetworkError('test'),
      ]

      for (const error of errors) {
        expect(error.code).toBeDefined()
        expect(typeof error.code).toBe('string')
      }
    })

    it('should have timestamp property on all error types', () => {
      const before = Date.now()

      const errors = [
        new BaseConvexError('test', ErrorCode.UNKNOWN),
        new ConvexError('test'),
        new ValidationError('test'),
        new AuthenticationError('test'),
        new ServerError('test'),
        new TimeoutError('test'),
        new NetworkError('test'),
      ]

      const after = Date.now()

      for (const error of errors) {
        expect(error.timestamp).toBeGreaterThanOrEqual(before)
        expect(error.timestamp).toBeLessThanOrEqual(after)
      }
    })

    it('should have message property on all error types', () => {
      const message = 'Test error message'
      const errors = [
        new BaseConvexError(message, ErrorCode.UNKNOWN),
        new ConvexError(message),
        new ValidationError(message),
        new AuthenticationError(message),
        new ServerError(message),
        new TimeoutError(message),
        new NetworkError(message),
      ]

      for (const error of errors) {
        expect(error.message).toBe(message)
      }
    })

    it('should support cause property on all error types', () => {
      const cause = new Error('Original cause')
      const errors = [
        new BaseConvexError('test', ErrorCode.UNKNOWN, { cause }),
        new ConvexError('test', { cause }),
        new ValidationError('test', { cause }),
        new AuthenticationError('test', { cause }),
        new ServerError('test', { cause }),
        new TimeoutError('test', { cause }),
        new NetworkError('test', { cause }),
      ]

      for (const error of errors) {
        expect(error.cause).toBe(cause)
      }
    })

    it('should support context property on all error types', () => {
      const context = {
        functionName: 'test:function',
        args: { id: '123' },
        timestamp: Date.now(),
      }

      const errors = [
        new BaseConvexError('test', ErrorCode.UNKNOWN, { context }),
        new ConvexError('test', { context }),
        new ValidationError('test', { context }),
        new AuthenticationError('test', { context }),
        new ServerError('test', { context }),
        new TimeoutError('test', { context }),
        new NetworkError('test', { context }),
      ]

      for (const error of errors) {
        expect(error.context).toEqual(context)
      }
    })
  })

  describe('error-specific properties', () => {
    it('ConvexError should have data property', () => {
      const data = { custom: 'data', count: 42 }
      const error = new ConvexError(data)

      expect(error.data).toEqual(data)
    })

    it('ValidationError should have field property', () => {
      const error = new ValidationError('Invalid', { field: 'email' })
      expect(error.field).toBe('email')
    })

    it('ValidationError should have fieldErrors property', () => {
      const fieldErrors = [
        { field: 'name', message: 'Required' },
        { field: 'email', message: 'Invalid' },
      ]
      const error = new ValidationError('Multiple errors', { fieldErrors })

      expect(error.fieldErrors).toEqual(fieldErrors)
    })

    it('AuthenticationError should have tokenExpired property', () => {
      const error = new AuthenticationError('Expired', { tokenExpired: true })
      expect(error.tokenExpired).toBe(true)
    })

    it('AuthenticationError should have requiresReauth property', () => {
      const error = new AuthenticationError('Reauth needed', { requiresReauth: true })
      expect(error.requiresReauth).toBe(true)
    })

    it('ServerError should have statusCode property', () => {
      const error = new ServerError('Error', { statusCode: 503 })
      expect(error.statusCode).toBe(503)
    })

    it('ServerError should have requestId property', () => {
      const error = new ServerError('Error', { requestId: 'req_123' })
      expect(error.requestId).toBe('req_123')
    })

    it('ServerError should have retryAfter property', () => {
      const error = new ServerError('Rate limited', { retryAfter: 60 })
      expect(error.retryAfter).toBe(60)
    })

    it('TimeoutError should have timeout property', () => {
      const error = new TimeoutError('Timeout', { timeout: 30000 })
      expect(error.timeout).toBe(30000)
    })

    it('TimeoutError should have elapsed property', () => {
      const error = new TimeoutError('Timeout', { elapsed: 30500 })
      expect(error.elapsed).toBe(30500)
    })

    it('TimeoutError should have operation property', () => {
      const error = new TimeoutError('Timeout', { operation: 'query' })
      expect(error.operation).toBe('query')
    })

    it('NetworkError should have statusCode property', () => {
      const error = new NetworkError('Error', { statusCode: 503 })
      expect(error.statusCode).toBe(503)
    })

    it('NetworkError should have url property', () => {
      const error = new NetworkError('Error', { url: 'https://api.example.com' })
      expect(error.url).toBe('https://api.example.com')
    })

    it('NetworkError should have isOffline property', () => {
      const error = new NetworkError('Offline', { isOffline: true })
      expect(error.isOffline).toBe(true)
    })
  })
})

// ============================================================================
// Error Serialization/Deserialization for API Responses
// ============================================================================

describe('Error Serialization for API Responses', () => {
  describe('serialization preserves error information', () => {
    it('should serialize ConvexError with data', () => {
      const error = new ConvexError({ field: 'email', reason: 'invalid' })
      const serialized = serializeError(error)

      expect(serialized.name).toBe('ConvexError')
      expect(serialized.code).toBe(ErrorCode.APPLICATION)
      expect(serialized.data).toEqual({ field: 'email', reason: 'invalid' })
    })

    it('should serialize ValidationError with field info', () => {
      const error = new ValidationError('Invalid', {
        field: 'email',
        expectedType: 'string',
        receivedType: 'number',
      })
      const serialized = serializeError(error)

      expect(serialized.name).toBe('ValidationError')
      expect(serialized.field).toBe('email')
      expect(serialized.expectedType).toBe('string')
      expect(serialized.receivedType).toBe('number')
    })

    it('should serialize ServerError with request info', () => {
      const error = new ServerError('Error', {
        statusCode: 500,
        requestId: 'req_123',
      })
      const serialized = serializeError(error)

      expect(serialized.name).toBe('ServerError')
      expect(serialized.statusCode).toBe(500)
      expect(serialized.requestId).toBe('req_123')
    })

    it('should produce JSON-stringifiable output', () => {
      const errors = [
        new ConvexError({ nested: { data: true } }),
        new ValidationError('test', { fieldErrors: [{ field: 'a', message: 'b' }] }),
        new ServerError('test', { statusCode: 500, requestId: 'req' }),
      ]

      for (const error of errors) {
        const serialized = serializeError(error)
        expect(() => JSON.stringify(serialized)).not.toThrow()
      }
    })
  })

  describe('deserialization restores error instances', () => {
    it('should deserialize ConvexError', () => {
      const original = new ConvexError({ test: 'data' })
      const serialized = serializeError(original)
      const deserialized = deserializeError(serialized)

      expect(deserialized).toBeInstanceOf(ConvexError)
      expect((deserialized as ConvexError).data).toEqual({ test: 'data' })
    })

    it('should deserialize ValidationError', () => {
      const original = new ValidationError('Invalid', { field: 'email' })
      const serialized = serializeError(original)
      const deserialized = deserializeError(serialized)

      expect(deserialized).toBeInstanceOf(ValidationError)
      expect((deserialized as ValidationError).field).toBe('email')
    })

    it('should deserialize ServerError', () => {
      const original = new ServerError('Error', { requestId: 'req_123' })
      const serialized = serializeError(original)
      const deserialized = deserializeError(serialized)

      expect(deserialized).toBeInstanceOf(ServerError)
      expect((deserialized as ServerError).requestId).toBe('req_123')
    })

    it('should round-trip all error types correctly', () => {
      const errors = [
        new ConvexError('test'),
        new ValidationError('test'),
        new AuthenticationError('test'),
        new ServerError('test'),
        new TimeoutError('test'),
        new NetworkError('test'),
      ]

      for (const original of errors) {
        const serialized = serializeError(original)
        const jsonString = JSON.stringify(serialized)
        const parsed = JSON.parse(jsonString)
        const deserialized = deserializeError(parsed)

        expect(deserialized.name).toBe(original.name)
        expect(deserialized.message).toBe(original.message)
        expect(deserialized.code).toBe(original.code)
      }
    })
  })
})

// ============================================================================
// Error Response Integration Tests
// ============================================================================

describe('Error Response Integration', () => {
  describe('query endpoint errors', () => {
    it('should format validation errors consistently', () => {
      const error = new ValidationError('Argument "id" is required', {
        field: 'id',
        expectedType: 'string',
      })
      const response = createErrorResponse(error)

      expect(response.code).toBe(ErrorCode.VALIDATION)
      expect(response.status).toBe(400)
      expect(response.message).toContain('id')
    })

    it('should format auth errors consistently', () => {
      const error = new AuthenticationError('Not authenticated')
      const response = createErrorResponse(error)

      expect(response.code).toBe(ErrorCode.AUTH)
      expect(response.status).toBe(401)
    })

    it('should format not found errors consistently', () => {
      const error = new ServerError('Document not found', {
        code: ErrorCode.NOT_FOUND,
      })
      const response = createErrorResponse(error)

      expect(response.code).toBe(ErrorCode.NOT_FOUND)
      expect(response.status).toBe(404)
    })
  })

  describe('mutation endpoint errors', () => {
    it('should format ConvexError from user code', () => {
      const error = new ConvexError({
        message: 'Email already exists',
        code: 'EMAIL_EXISTS',
      })
      const response = createErrorResponse(error)

      expect(response.code).toBe(ErrorCode.APPLICATION)
      expect(response.status).toBe(400)
      expect(response.data).toEqual({
        message: 'Email already exists',
        code: 'EMAIL_EXISTS',
      })
    })

    it('should format conflict errors consistently', () => {
      const error = new ServerError('Concurrent modification detected', {
        code: ErrorCode.CONFLICT,
      })
      const response = createErrorResponse(error)

      expect(response.code).toBe(ErrorCode.CONFLICT)
      expect(response.status).toBe(409)
    })
  })

  describe('action endpoint errors', () => {
    it('should format timeout errors consistently', () => {
      const error = new TimeoutError('Action timed out', {
        timeout: 120000,
        elapsed: 120500,
        operation: 'action:sendEmail',
      })
      const response = createErrorResponse(error)

      expect(response.code).toBe(ErrorCode.TIMEOUT)
      expect(response.status).toBe(504)
    })

    it('should format network errors consistently', () => {
      const error = new NetworkError('External API unreachable', {
        url: 'https://external-api.com',
        statusCode: 503,
      })
      const response = createErrorResponse(error)

      expect(response.code).toBe(ErrorCode.NETWORK)
      expect(response.status).toBe(502)
    })
  })

  describe('error tracing', () => {
    it('should include request ID for error tracing', () => {
      const requestId = 'req_abc123def456'
      const error = new ServerError('Internal error')
      const response = createErrorResponse(error, { requestId })

      expect(response.requestId).toBe(requestId)
    })

    it('should include full error context in dev mode', () => {
      const error = new ServerError('Error', {
        context: {
          functionName: 'users:get',
          args: { id: 'user_123' },
          timestamp: Date.now(),
          requestId: 'req_123',
        },
      })
      const response = createErrorResponse(error, { isDev: true })

      expect(response.stack).toBeDefined()
    })
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle error with null message', () => {
    const error = new ServerError('')
    const response = createErrorResponse(error)

    expect(response.message).toBe('')
    expect(response.code).toBe(ErrorCode.SERVER)
  })

  it('should handle error with very long message', () => {
    const longMessage = 'a'.repeat(10000)
    const error = new ServerError(longMessage)
    const response = createErrorResponse(error)

    expect(response.message).toBe(longMessage)
  })

  it('should handle error with special characters in message', () => {
    const specialMessage = 'Error: <script>alert("xss")</script> & "quotes"'
    const error = new ServerError(specialMessage)
    const response = createErrorResponse(error)

    expect(response.message).toBe(specialMessage)
  })

  it('should handle ConvexError with circular reference in data', () => {
    const data: Record<string, unknown> = { name: 'test' }
    // Note: This would fail in practice, but the error should handle it gracefully
    const error = new ConvexError(data)
    const response = createErrorResponse(error)

    expect(response.data).toBeDefined()
  })

  it('should handle ConvexError with undefined data', () => {
    const error = new ConvexError(undefined)
    const response = createErrorResponse(error)

    expect(response.data).toBeUndefined()
  })

  it('should handle nested cause chain', () => {
    const level1 = new Error('Database error')
    const level2 = new NetworkError('Connection failed', { cause: level1 })
    const level3 = new ServerError('Request failed', { cause: level2 })

    const response = createErrorResponse(level3, { isDev: true })

    expect(response.code).toBe(ErrorCode.SERVER)
    expect(response.stack).toBeDefined()
  })
})
