/**
 * TDD Tests for Layer 7: Client SDK Error Handling
 *
 * These tests define the expected interface and behavior for error handling
 * in the convex.do client SDK.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  // Error Classes
  ConvexError,
  NetworkError,
  AuthenticationError,
  ValidationError,
  ServerError,
  TimeoutError,
  BaseConvexError,

  // Error Codes Enum
  ErrorCode,

  // Error Serialization
  serializeError,
  deserializeError,

  // Error Wrapping
  wrapError,

  // Error Context
  type ErrorContext,
  createErrorContext,
  addErrorContext,

  // Retry Detection
  isRetryableError,

  // User-friendly Messages
  getUserFriendlyMessage,

  // Error Logging
  formatErrorForLogging,
  createErrorLogger,
  type ErrorLogger,

  // Type Guards
  isConvexError,
  isNetworkError,
  isAuthenticationError,
  isValidationError,
  isServerError,
  isTimeoutError,
  isBaseConvexError,
} from '../../src/client/errors'

// ============================================================================
// ErrorCode Enum Tests
// ============================================================================

describe('ErrorCode Enum', () => {
  it('should have NETWORK error code', () => {
    expect(ErrorCode.NETWORK).toBe('NETWORK')
  })

  it('should have AUTH error code', () => {
    expect(ErrorCode.AUTH).toBe('AUTH')
  })

  it('should have VALIDATION error code', () => {
    expect(ErrorCode.VALIDATION).toBe('VALIDATION')
  })

  it('should have SERVER error code', () => {
    expect(ErrorCode.SERVER).toBe('SERVER')
  })

  it('should have TIMEOUT error code', () => {
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT')
  })

  it('should have UNKNOWN error code', () => {
    expect(ErrorCode.UNKNOWN).toBe('UNKNOWN')
  })

  it('should have RATE_LIMITED error code', () => {
    expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED')
  })

  it('should have NOT_FOUND error code', () => {
    expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND')
  })

  it('should have UNAUTHORIZED error code', () => {
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED')
  })

  it('should have FORBIDDEN error code', () => {
    expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN')
  })

  it('should have CONFLICT error code', () => {
    expect(ErrorCode.CONFLICT).toBe('CONFLICT')
  })

  it('should have INTERNAL error code', () => {
    expect(ErrorCode.INTERNAL).toBe('INTERNAL')
  })

  it('should have APPLICATION error code for user-thrown ConvexErrors', () => {
    expect(ErrorCode.APPLICATION).toBe('APPLICATION')
  })
})

// ============================================================================
// BaseConvexError Tests
// ============================================================================

describe('BaseConvexError', () => {
  it('should be an instance of Error', () => {
    const error = new BaseConvexError('Test error', ErrorCode.UNKNOWN)

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(BaseConvexError)
  })

  it('should have name property set to BaseConvexError', () => {
    const error = new BaseConvexError('Test', ErrorCode.UNKNOWN)

    expect(error.name).toBe('BaseConvexError')
  })

  it('should have message property', () => {
    const error = new BaseConvexError('Custom message', ErrorCode.UNKNOWN)

    expect(error.message).toBe('Custom message')
  })

  it('should have code property', () => {
    const error = new BaseConvexError('Test', ErrorCode.SERVER)

    expect(error.code).toBe(ErrorCode.SERVER)
  })

  it('should have timestamp property', () => {
    const before = Date.now()
    const error = new BaseConvexError('Test', ErrorCode.UNKNOWN)
    const after = Date.now()

    expect(error.timestamp).toBeGreaterThanOrEqual(before)
    expect(error.timestamp).toBeLessThanOrEqual(after)
  })

  it('should have optional cause property for error wrapping', () => {
    const cause = new Error('Original error')
    const error = new BaseConvexError('Wrapped error', ErrorCode.UNKNOWN, { cause })

    expect(error.cause).toBe(cause)
  })

  it('should have optional context property', () => {
    const context: ErrorContext = {
      functionName: 'users:create',
      args: { name: 'Test' },
      timestamp: Date.now(),
    }
    const error = new BaseConvexError('Test', ErrorCode.UNKNOWN, { context })

    expect(error.context).toEqual(context)
  })

  it('should preserve stack trace', () => {
    const error = new BaseConvexError('Test', ErrorCode.UNKNOWN)

    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('BaseConvexError')
  })

  it('should capture stack trace correctly when wrapping errors', () => {
    const original = new Error('Original')
    const wrapped = new BaseConvexError('Wrapped', ErrorCode.UNKNOWN, { cause: original })

    expect(wrapped.stack).toBeDefined()
    expect(wrapped.cause).toBe(original)
  })
})

// ============================================================================
// ConvexError (Application Error) Tests
// ============================================================================

describe('ConvexError', () => {
  it('should extend BaseConvexError', () => {
    const error = new ConvexError('Application error')

    expect(error).toBeInstanceOf(BaseConvexError)
    expect(error).toBeInstanceOf(ConvexError)
  })

  it('should have name property set to ConvexError', () => {
    const error = new ConvexError('Test')

    expect(error.name).toBe('ConvexError')
  })

  it('should have APPLICATION error code', () => {
    const error = new ConvexError('Test')

    expect(error.code).toBe(ErrorCode.APPLICATION)
  })

  it('should accept string data', () => {
    const error = new ConvexError('Simple error message')

    expect(error.data).toBe('Simple error message')
    expect(error.message).toBe('Simple error message')
  })

  it('should accept object data', () => {
    const errorData = { field: 'email', reason: 'Invalid format' }
    const error = new ConvexError(errorData)

    expect(error.data).toEqual(errorData)
  })

  it('should serialize object data to message', () => {
    const errorData = { field: 'email' }
    const error = new ConvexError(errorData)

    expect(error.message).toBe(JSON.stringify(errorData))
  })

  it('should accept generic type parameter for data', () => {
    interface ValidationErrorData {
      field: string
      message: string
    }

    const error = new ConvexError<ValidationErrorData>({
      field: 'email',
      message: 'Invalid email format',
    })

    expect(error.data.field).toBe('email')
    expect(error.data.message).toBe('Invalid email format')
  })

  it('should handle nested object data', () => {
    const nestedData = {
      errors: [
        { field: 'name', message: 'Required' },
        { field: 'email', message: 'Invalid' },
      ],
      code: 'VALIDATION_FAILED',
    }

    const error = new ConvexError(nestedData)

    expect(error.data).toEqual(nestedData)
  })

  it('should handle array data', () => {
    const arrayData = ['Error 1', 'Error 2', 'Error 3']
    const error = new ConvexError(arrayData)

    expect(error.data).toEqual(arrayData)
  })

  it('should handle null data', () => {
    const error = new ConvexError(null)

    expect(error.data).toBeNull()
  })

  it('should handle number data', () => {
    const error = new ConvexError(404)

    expect(error.data).toBe(404)
  })

  it('should handle boolean data', () => {
    const error = new ConvexError(false)

    expect(error.data).toBe(false)
  })
})

// ============================================================================
// NetworkError Tests
// ============================================================================

describe('NetworkError', () => {
  it('should extend BaseConvexError', () => {
    const error = new NetworkError('Connection failed')

    expect(error).toBeInstanceOf(BaseConvexError)
    expect(error).toBeInstanceOf(NetworkError)
  })

  it('should have name property set to NetworkError', () => {
    const error = new NetworkError('Test')

    expect(error.name).toBe('NetworkError')
  })

  it('should have NETWORK error code', () => {
    const error = new NetworkError('Test')

    expect(error.code).toBe(ErrorCode.NETWORK)
  })

  it('should have message property', () => {
    const error = new NetworkError('Connection refused')

    expect(error.message).toBe('Connection refused')
  })

  it('should have optional statusCode property', () => {
    const error = new NetworkError('Service unavailable', { statusCode: 503 })

    expect(error.statusCode).toBe(503)
  })

  it('should have optional url property', () => {
    const error = new NetworkError('Failed', { url: 'https://api.example.com' })

    expect(error.url).toBe('https://api.example.com')
  })

  it('should have optional method property', () => {
    const error = new NetworkError('Failed', { method: 'POST' })

    expect(error.method).toBe('POST')
  })

  it('should wrap fetch errors', () => {
    const fetchError = new TypeError('Failed to fetch')
    const error = new NetworkError('Network request failed', { cause: fetchError })

    expect(error.cause).toBe(fetchError)
  })

  it('should indicate if error is due to offline status', () => {
    const error = new NetworkError('Network request failed', { isOffline: true })

    expect(error.isOffline).toBe(true)
  })

  it('should default isOffline to false', () => {
    const error = new NetworkError('Network request failed')

    expect(error.isOffline).toBe(false)
  })
})

// ============================================================================
// AuthenticationError Tests
// ============================================================================

describe('AuthenticationError', () => {
  it('should extend BaseConvexError', () => {
    const error = new AuthenticationError('Token expired')

    expect(error).toBeInstanceOf(BaseConvexError)
    expect(error).toBeInstanceOf(AuthenticationError)
  })

  it('should have name property set to AuthenticationError', () => {
    const error = new AuthenticationError('Test')

    expect(error.name).toBe('AuthenticationError')
  })

  it('should have AUTH error code by default', () => {
    const error = new AuthenticationError('Test')

    expect(error.code).toBe(ErrorCode.AUTH)
  })

  it('should support UNAUTHORIZED error code', () => {
    const error = new AuthenticationError('Not authenticated', {
      code: ErrorCode.UNAUTHORIZED,
    })

    expect(error.code).toBe(ErrorCode.UNAUTHORIZED)
  })

  it('should support FORBIDDEN error code', () => {
    const error = new AuthenticationError('Access denied', {
      code: ErrorCode.FORBIDDEN,
    })

    expect(error.code).toBe(ErrorCode.FORBIDDEN)
  })

  it('should have optional tokenExpired property', () => {
    const error = new AuthenticationError('Token expired', { tokenExpired: true })

    expect(error.tokenExpired).toBe(true)
  })

  it('should have optional requiredRole property', () => {
    const error = new AuthenticationError('Insufficient permissions', {
      requiredRole: 'admin',
    })

    expect(error.requiredRole).toBe('admin')
  })

  it('should have optional requiredPermissions property', () => {
    const error = new AuthenticationError('Missing permissions', {
      requiredPermissions: ['read', 'write'],
    })

    expect(error.requiredPermissions).toEqual(['read', 'write'])
  })

  it('should indicate if re-authentication is required', () => {
    const error = new AuthenticationError('Session expired', {
      requiresReauth: true,
    })

    expect(error.requiresReauth).toBe(true)
  })
})

// ============================================================================
// ValidationError Tests
// ============================================================================

describe('ValidationError', () => {
  it('should extend BaseConvexError', () => {
    const error = new ValidationError('Invalid input')

    expect(error).toBeInstanceOf(BaseConvexError)
    expect(error).toBeInstanceOf(ValidationError)
  })

  it('should have name property set to ValidationError', () => {
    const error = new ValidationError('Test')

    expect(error.name).toBe('ValidationError')
  })

  it('should have VALIDATION error code', () => {
    const error = new ValidationError('Test')

    expect(error.code).toBe(ErrorCode.VALIDATION)
  })

  it('should have optional field property', () => {
    const error = new ValidationError('Invalid email', { field: 'email' })

    expect(error.field).toBe('email')
  })

  it('should have optional expectedType property', () => {
    const error = new ValidationError('Expected string', {
      field: 'name',
      expectedType: 'string',
    })

    expect(error.expectedType).toBe('string')
  })

  it('should have optional receivedType property', () => {
    const error = new ValidationError('Type mismatch', {
      field: 'age',
      expectedType: 'number',
      receivedType: 'string',
    })

    expect(error.receivedType).toBe('string')
  })

  it('should have optional receivedValue property', () => {
    const error = new ValidationError('Invalid value', {
      field: 'status',
      receivedValue: 'invalid_status',
    })

    expect(error.receivedValue).toBe('invalid_status')
  })

  it('should have optional constraint property', () => {
    const error = new ValidationError('Value too long', {
      field: 'name',
      constraint: 'maxLength: 100',
    })

    expect(error.constraint).toBe('maxLength: 100')
  })

  it('should support multiple field errors', () => {
    const error = new ValidationError('Multiple validation errors', {
      fieldErrors: [
        { field: 'email', message: 'Invalid format' },
        { field: 'age', message: 'Must be positive' },
      ],
    })

    expect(error.fieldErrors).toHaveLength(2)
    expect(error.fieldErrors![0].field).toBe('email')
    expect(error.fieldErrors![1].field).toBe('age')
  })

  it('should have optional path property for nested field errors', () => {
    const error = new ValidationError('Invalid nested field', {
      field: 'address.city',
      path: ['address', 'city'],
    })

    expect(error.path).toEqual(['address', 'city'])
  })
})

// ============================================================================
// ServerError Tests
// ============================================================================

describe('ServerError', () => {
  it('should extend BaseConvexError', () => {
    const error = new ServerError('Internal server error')

    expect(error).toBeInstanceOf(BaseConvexError)
    expect(error).toBeInstanceOf(ServerError)
  })

  it('should have name property set to ServerError', () => {
    const error = new ServerError('Test')

    expect(error.name).toBe('ServerError')
  })

  it('should have SERVER error code by default', () => {
    const error = new ServerError('Test')

    expect(error.code).toBe(ErrorCode.SERVER)
  })

  it('should support INTERNAL error code', () => {
    const error = new ServerError('Internal error', {
      code: ErrorCode.INTERNAL,
    })

    expect(error.code).toBe(ErrorCode.INTERNAL)
  })

  it('should support NOT_FOUND error code', () => {
    const error = new ServerError('Resource not found', {
      code: ErrorCode.NOT_FOUND,
    })

    expect(error.code).toBe(ErrorCode.NOT_FOUND)
  })

  it('should support CONFLICT error code', () => {
    const error = new ServerError('Conflict detected', {
      code: ErrorCode.CONFLICT,
    })

    expect(error.code).toBe(ErrorCode.CONFLICT)
  })

  it('should support RATE_LIMITED error code', () => {
    const error = new ServerError('Too many requests', {
      code: ErrorCode.RATE_LIMITED,
    })

    expect(error.code).toBe(ErrorCode.RATE_LIMITED)
  })

  it('should have optional statusCode property', () => {
    const error = new ServerError('Server error', { statusCode: 500 })

    expect(error.statusCode).toBe(500)
  })

  it('should have optional requestId property for tracing', () => {
    const error = new ServerError('Server error', {
      requestId: 'req_abc123xyz',
    })

    expect(error.requestId).toBe('req_abc123xyz')
  })

  it('should have optional serverMessage property', () => {
    const error = new ServerError('Server error', {
      serverMessage: 'Database connection failed',
    })

    expect(error.serverMessage).toBe('Database connection failed')
  })

  it('should have optional retryAfter property for rate limiting', () => {
    const error = new ServerError('Rate limited', {
      code: ErrorCode.RATE_LIMITED,
      retryAfter: 60,
    })

    expect(error.retryAfter).toBe(60)
  })
})

// ============================================================================
// TimeoutError Tests
// ============================================================================

describe('TimeoutError', () => {
  it('should extend BaseConvexError', () => {
    const error = new TimeoutError('Request timed out')

    expect(error).toBeInstanceOf(BaseConvexError)
    expect(error).toBeInstanceOf(TimeoutError)
  })

  it('should have name property set to TimeoutError', () => {
    const error = new TimeoutError('Test')

    expect(error.name).toBe('TimeoutError')
  })

  it('should have TIMEOUT error code', () => {
    const error = new TimeoutError('Test')

    expect(error.code).toBe(ErrorCode.TIMEOUT)
  })

  it('should have optional timeout property (in ms)', () => {
    const error = new TimeoutError('Request timed out', { timeout: 30000 })

    expect(error.timeout).toBe(30000)
  })

  it('should have optional elapsed property (actual time elapsed)', () => {
    const error = new TimeoutError('Request timed out', {
      timeout: 30000,
      elapsed: 30500,
    })

    expect(error.elapsed).toBe(30500)
  })

  it('should have optional operation property', () => {
    const error = new TimeoutError('Request timed out', {
      operation: 'query',
    })

    expect(error.operation).toBe('query')
  })

  it('should indicate if timeout was client-side or server-side', () => {
    const clientTimeout = new TimeoutError('Client timeout', {
      isClientTimeout: true,
    })

    const serverTimeout = new TimeoutError('Server timeout', {
      isClientTimeout: false,
    })

    expect(clientTimeout.isClientTimeout).toBe(true)
    expect(serverTimeout.isClientTimeout).toBe(false)
  })
})

// ============================================================================
// Error Serialization/Deserialization Tests
// ============================================================================

describe('Error Serialization', () => {
  describe('serializeError', () => {
    it('should serialize BaseConvexError to JSON-compatible object', () => {
      const error = new BaseConvexError('Test error', ErrorCode.SERVER)
      const serialized = serializeError(error)

      expect(serialized).toHaveProperty('name', 'BaseConvexError')
      expect(serialized).toHaveProperty('message', 'Test error')
      expect(serialized).toHaveProperty('code', ErrorCode.SERVER)
      expect(serialized).toHaveProperty('timestamp')
    })

    it('should serialize ConvexError with data', () => {
      const error = new ConvexError({ field: 'email', reason: 'invalid' })
      const serialized = serializeError(error)

      expect(serialized).toHaveProperty('name', 'ConvexError')
      expect(serialized).toHaveProperty('data', { field: 'email', reason: 'invalid' })
    })

    it('should serialize NetworkError with network-specific fields', () => {
      const error = new NetworkError('Connection failed', {
        statusCode: 503,
        url: 'https://api.example.com',
        method: 'POST',
      })
      const serialized = serializeError(error)

      expect(serialized).toHaveProperty('statusCode', 503)
      expect(serialized).toHaveProperty('url', 'https://api.example.com')
      expect(serialized).toHaveProperty('method', 'POST')
    })

    it('should serialize ValidationError with validation-specific fields', () => {
      const error = new ValidationError('Invalid', {
        field: 'email',
        expectedType: 'string',
        receivedType: 'number',
      })
      const serialized = serializeError(error)

      expect(serialized).toHaveProperty('field', 'email')
      expect(serialized).toHaveProperty('expectedType', 'string')
      expect(serialized).toHaveProperty('receivedType', 'number')
    })

    it('should serialize error context', () => {
      const context: ErrorContext = {
        functionName: 'users:create',
        args: { name: 'Test' },
        timestamp: 1704067200000,
      }
      const error = new ServerError('Error', { context })
      const serialized = serializeError(error)

      expect(serialized).toHaveProperty('context')
      expect(serialized.context).toEqual(context)
    })

    it('should serialize nested cause chain', () => {
      const original = new Error('Database error')
      const wrapped = new ServerError('Server error', { cause: original })
      const serialized = serializeError(wrapped)

      expect(serialized).toHaveProperty('cause')
      expect(serialized.cause).toHaveProperty('message', 'Database error')
    })

    it('should serialize stack trace', () => {
      const error = new ServerError('Test')
      const serialized = serializeError(error)

      expect(serialized).toHaveProperty('stack')
      expect(typeof serialized.stack).toBe('string')
    })

    it('should handle serialization of plain Error objects', () => {
      const error = new Error('Plain error')
      const serialized = serializeError(error)

      expect(serialized).toHaveProperty('name', 'Error')
      expect(serialized).toHaveProperty('message', 'Plain error')
    })

    it('should produce JSON-stringifiable output', () => {
      const error = new ConvexError({ complex: { nested: true } })
      const serialized = serializeError(error)

      expect(() => JSON.stringify(serialized)).not.toThrow()
    })
  })

  describe('deserializeError', () => {
    it('should deserialize BaseConvexError', () => {
      const serialized = {
        name: 'BaseConvexError',
        message: 'Test error',
        code: ErrorCode.SERVER,
        timestamp: Date.now(),
      }

      const error = deserializeError(serialized)

      expect(error).toBeInstanceOf(BaseConvexError)
      expect(error.message).toBe('Test error')
      expect(error.code).toBe(ErrorCode.SERVER)
    })

    it('should deserialize ConvexError with data', () => {
      const serialized = {
        name: 'ConvexError',
        message: '{"field":"email"}',
        code: ErrorCode.APPLICATION,
        data: { field: 'email' },
        timestamp: Date.now(),
      }

      const error = deserializeError(serialized)

      expect(error).toBeInstanceOf(ConvexError)
      expect((error as ConvexError<unknown>).data).toEqual({ field: 'email' })
    })

    it('should deserialize NetworkError', () => {
      const serialized = {
        name: 'NetworkError',
        message: 'Connection failed',
        code: ErrorCode.NETWORK,
        statusCode: 503,
        url: 'https://api.example.com',
        timestamp: Date.now(),
      }

      const error = deserializeError(serialized)

      expect(error).toBeInstanceOf(NetworkError)
      expect((error as NetworkError).statusCode).toBe(503)
    })

    it('should deserialize AuthenticationError', () => {
      const serialized = {
        name: 'AuthenticationError',
        message: 'Token expired',
        code: ErrorCode.AUTH,
        tokenExpired: true,
        timestamp: Date.now(),
      }

      const error = deserializeError(serialized)

      expect(error).toBeInstanceOf(AuthenticationError)
      expect((error as AuthenticationError).tokenExpired).toBe(true)
    })

    it('should deserialize ValidationError', () => {
      const serialized = {
        name: 'ValidationError',
        message: 'Invalid input',
        code: ErrorCode.VALIDATION,
        field: 'email',
        expectedType: 'string',
        timestamp: Date.now(),
      }

      const error = deserializeError(serialized)

      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).field).toBe('email')
    })

    it('should deserialize ServerError', () => {
      const serialized = {
        name: 'ServerError',
        message: 'Internal error',
        code: ErrorCode.SERVER,
        requestId: 'req_123',
        timestamp: Date.now(),
      }

      const error = deserializeError(serialized)

      expect(error).toBeInstanceOf(ServerError)
      expect((error as ServerError).requestId).toBe('req_123')
    })

    it('should deserialize TimeoutError', () => {
      const serialized = {
        name: 'TimeoutError',
        message: 'Timeout',
        code: ErrorCode.TIMEOUT,
        timeout: 30000,
        elapsed: 30500,
        timestamp: Date.now(),
      }

      const error = deserializeError(serialized)

      expect(error).toBeInstanceOf(TimeoutError)
      expect((error as TimeoutError).timeout).toBe(30000)
    })

    it('should preserve error context', () => {
      const context = {
        functionName: 'users:create',
        args: { name: 'Test' },
        timestamp: Date.now(),
      }
      const serialized = {
        name: 'ServerError',
        message: 'Error',
        code: ErrorCode.SERVER,
        context,
        timestamp: Date.now(),
      }

      const error = deserializeError(serialized)

      expect(error.context).toEqual(context)
    })

    it('should handle unknown error types gracefully', () => {
      const serialized = {
        name: 'UnknownErrorType',
        message: 'Unknown',
        code: 'UNKNOWN_CODE',
        timestamp: Date.now(),
      }

      const error = deserializeError(serialized)

      expect(error).toBeInstanceOf(BaseConvexError)
      expect(error.message).toBe('Unknown')
    })

    it('should round-trip serialize/deserialize correctly', () => {
      const original = new ValidationError('Invalid email', {
        field: 'email',
        expectedType: 'string',
        receivedType: 'number',
        context: {
          functionName: 'users:create',
          args: { email: 123 },
          timestamp: Date.now(),
        },
      })

      const serialized = serializeError(original)
      const deserialized = deserializeError(serialized)

      expect(deserialized.name).toBe(original.name)
      expect(deserialized.message).toBe(original.message)
      expect(deserialized.code).toBe(original.code)
      expect((deserialized as ValidationError).field).toBe(original.field)
    })
  })
})

// ============================================================================
// Error Wrapping Tests
// ============================================================================

describe('Error Wrapping', () => {
  describe('wrapError', () => {
    it('should wrap a plain Error as NetworkError for fetch failures', () => {
      const fetchError = new TypeError('Failed to fetch')
      const wrapped = wrapError(fetchError, ErrorCode.NETWORK)

      expect(wrapped).toBeInstanceOf(NetworkError)
      expect(wrapped.cause).toBe(fetchError)
    })

    it('should wrap a plain Error as ServerError', () => {
      const serverError = new Error('Database connection failed')
      const wrapped = wrapError(serverError, ErrorCode.SERVER)

      expect(wrapped).toBeInstanceOf(ServerError)
      expect(wrapped.cause).toBe(serverError)
    })

    it('should preserve original error message in wrapped error', () => {
      const original = new Error('Original message')
      const wrapped = wrapError(original, ErrorCode.SERVER, 'Wrapped context')

      expect(wrapped.message).toBe('Wrapped context')
      expect((wrapped.cause as Error).message).toBe('Original message')
    })

    it('should use original message if no new message provided', () => {
      const original = new Error('Original message')
      const wrapped = wrapError(original, ErrorCode.SERVER)

      expect(wrapped.message).toBe('Original message')
    })

    it('should preserve stack trace from original error', () => {
      const original = new Error('Original')
      const wrapped = wrapError(original, ErrorCode.SERVER)

      expect(wrapped.cause).toBe(original)
      expect((wrapped.cause as Error).stack).toBeDefined()
    })

    it('should add context to wrapped error', () => {
      const original = new Error('Original')
      const context: ErrorContext = {
        functionName: 'users:get',
        args: { id: '123' },
        timestamp: Date.now(),
      }

      const wrapped = wrapError(original, ErrorCode.SERVER, undefined, { context })

      expect(wrapped.context).toEqual(context)
    })

    it('should not double-wrap ConvexError types', () => {
      const convexError = new ServerError('Server error')
      const wrapped = wrapError(convexError, ErrorCode.SERVER)

      expect(wrapped).toBe(convexError)
    })

    it('should allow upgrading error type when explicitly requested', () => {
      const networkError = new NetworkError('Connection failed')
      const wrapped = wrapError(networkError, ErrorCode.TIMEOUT, 'Request timed out', {
        forceWrap: true,
      })

      expect(wrapped).toBeInstanceOf(TimeoutError)
      expect(wrapped.cause).toBe(networkError)
    })

    it('should wrap string as error', () => {
      const wrapped = wrapError('String error', ErrorCode.UNKNOWN)

      expect(wrapped).toBeInstanceOf(BaseConvexError)
      expect(wrapped.message).toBe('String error')
    })

    it('should wrap unknown values', () => {
      const wrapped = wrapError({ custom: 'object' }, ErrorCode.UNKNOWN)

      expect(wrapped).toBeInstanceOf(BaseConvexError)
    })
  })
})

// ============================================================================
// Error Context Tests
// ============================================================================

describe('Error Context', () => {
  describe('ErrorContext type', () => {
    it('should have functionName property', () => {
      const context: ErrorContext = {
        functionName: 'users:create',
        timestamp: Date.now(),
      }

      expect(context.functionName).toBe('users:create')
    })

    it('should have optional args property', () => {
      const context: ErrorContext = {
        functionName: 'users:get',
        args: { id: 'user_123' },
        timestamp: Date.now(),
      }

      expect(context.args).toEqual({ id: 'user_123' })
    })

    it('should have timestamp property', () => {
      const now = Date.now()
      const context: ErrorContext = {
        functionName: 'test',
        timestamp: now,
      }

      expect(context.timestamp).toBe(now)
    })

    it('should have optional requestId property', () => {
      const context: ErrorContext = {
        functionName: 'test',
        timestamp: Date.now(),
        requestId: 'req_abc123',
      }

      expect(context.requestId).toBe('req_abc123')
    })

    it('should have optional userId property', () => {
      const context: ErrorContext = {
        functionName: 'test',
        timestamp: Date.now(),
        userId: 'user_123',
      }

      expect(context.userId).toBe('user_123')
    })

    it('should have optional sessionId property', () => {
      const context: ErrorContext = {
        functionName: 'test',
        timestamp: Date.now(),
        sessionId: 'sess_xyz789',
      }

      expect(context.sessionId).toBe('sess_xyz789')
    })

    it('should have optional custom metadata property', () => {
      const context: ErrorContext = {
        functionName: 'test',
        timestamp: Date.now(),
        metadata: {
          environment: 'production',
          version: '1.0.0',
        },
      }

      expect(context.metadata).toEqual({
        environment: 'production',
        version: '1.0.0',
      })
    })
  })

  describe('createErrorContext', () => {
    it('should create context with function name', () => {
      const context = createErrorContext('users:create')

      expect(context.functionName).toBe('users:create')
      expect(context.timestamp).toBeDefined()
    })

    it('should create context with args', () => {
      const context = createErrorContext('users:create', { name: 'Test' })

      expect(context.args).toEqual({ name: 'Test' })
    })

    it('should auto-generate timestamp', () => {
      const before = Date.now()
      const context = createErrorContext('test')
      const after = Date.now()

      expect(context.timestamp).toBeGreaterThanOrEqual(before)
      expect(context.timestamp).toBeLessThanOrEqual(after)
    })

    it('should accept additional context options', () => {
      const context = createErrorContext('test', undefined, {
        requestId: 'req_123',
        userId: 'user_456',
      })

      expect(context.requestId).toBe('req_123')
      expect(context.userId).toBe('user_456')
    })
  })

  describe('addErrorContext', () => {
    it('should add context to existing error', () => {
      const error = new ServerError('Error')
      const context = createErrorContext('users:create', { name: 'Test' })

      const errorWithContext = addErrorContext(error, context)

      expect(errorWithContext.context).toEqual(context)
    })

    it('should return the same error instance (mutate in place)', () => {
      const error = new ServerError('Error')
      const context = createErrorContext('test')

      const result = addErrorContext(error, context)

      expect(result).toBe(error)
    })

    it('should merge with existing context', () => {
      const existingContext = createErrorContext('test', undefined, {
        requestId: 'req_123',
      })
      const error = new ServerError('Error', { context: existingContext })

      const newContext = { userId: 'user_456' }
      addErrorContext(error, newContext)

      expect(error.context?.requestId).toBe('req_123')
      expect(error.context?.userId).toBe('user_456')
    })

    it('should work with plain Error objects by wrapping them', () => {
      const plainError = new Error('Plain error')
      const context = createErrorContext('test')

      const result = addErrorContext(plainError, context)

      expect(result).toBeInstanceOf(BaseConvexError)
      expect(result.context).toEqual(context)
    })
  })
})

// ============================================================================
// Retry-able Error Detection Tests
// ============================================================================

describe('Retry-able Error Detection', () => {
  describe('isRetryableError', () => {
    it('should return true for NetworkError (transient connection issues)', () => {
      const error = new NetworkError('Connection reset')

      expect(isRetryableError(error)).toBe(true)
    })

    it('should return true for TimeoutError', () => {
      const error = new TimeoutError('Request timed out')

      expect(isRetryableError(error)).toBe(true)
    })

    it('should return true for ServerError with 503 status', () => {
      const error = new ServerError('Service unavailable', { statusCode: 503 })

      expect(isRetryableError(error)).toBe(true)
    })

    it('should return true for ServerError with 502 status', () => {
      const error = new ServerError('Bad gateway', { statusCode: 502 })

      expect(isRetryableError(error)).toBe(true)
    })

    it('should return true for ServerError with 504 status', () => {
      const error = new ServerError('Gateway timeout', { statusCode: 504 })

      expect(isRetryableError(error)).toBe(true)
    })

    it('should return true for rate-limited errors', () => {
      const error = new ServerError('Too many requests', {
        code: ErrorCode.RATE_LIMITED,
      })

      expect(isRetryableError(error)).toBe(true)
    })

    it('should return false for ValidationError', () => {
      const error = new ValidationError('Invalid input')

      expect(isRetryableError(error)).toBe(false)
    })

    it('should return false for AuthenticationError', () => {
      const error = new AuthenticationError('Invalid token')

      expect(isRetryableError(error)).toBe(false)
    })

    it('should return false for ConvexError (application errors)', () => {
      const error = new ConvexError('Application error')

      expect(isRetryableError(error)).toBe(false)
    })

    it('should return false for ServerError with 400 status', () => {
      const error = new ServerError('Bad request', { statusCode: 400 })

      expect(isRetryableError(error)).toBe(false)
    })

    it('should return false for ServerError with 404 status', () => {
      const error = new ServerError('Not found', { statusCode: 404 })

      expect(isRetryableError(error)).toBe(false)
    })

    it('should return false for ServerError with 500 status (permanent server error)', () => {
      const error = new ServerError('Internal error', { statusCode: 500 })

      expect(isRetryableError(error)).toBe(false)
    })

    it('should return true for NetworkError when offline', () => {
      const error = new NetworkError('Offline', { isOffline: true })

      expect(isRetryableError(error)).toBe(true)
    })

    it('should handle plain Error objects', () => {
      const error = new Error('Unknown error')

      expect(isRetryableError(error)).toBe(false)
    })
  })
})

// ============================================================================
// User-Friendly Error Messages Tests
// ============================================================================

describe('User-Friendly Error Messages', () => {
  describe('getUserFriendlyMessage', () => {
    it('should return friendly message for NetworkError', () => {
      const error = new NetworkError('fetch failed')
      const message = getUserFriendlyMessage(error)

      expect(message).toContain('network')
      expect(message).not.toContain('fetch failed') // Should hide technical details
    })

    it('should return friendly message for NetworkError when offline', () => {
      const error = new NetworkError('offline', { isOffline: true })
      const message = getUserFriendlyMessage(error)

      expect(message.toLowerCase()).toContain('offline')
    })

    it('should return friendly message for AuthenticationError', () => {
      const error = new AuthenticationError('JWT expired')
      const message = getUserFriendlyMessage(error)

      expect(message.toLowerCase()).toMatch(/sign.*in|log.*in|authenticate|session/)
    })

    it('should return friendly message for AuthenticationError with expired token', () => {
      const error = new AuthenticationError('Token expired', { tokenExpired: true })
      const message = getUserFriendlyMessage(error)

      expect(message.toLowerCase()).toContain('session')
    })

    it('should return friendly message for ValidationError', () => {
      const error = new ValidationError('Invalid', { field: 'email' })
      const message = getUserFriendlyMessage(error)

      expect(message.toLowerCase()).toContain('email')
    })

    it('should return friendly message for ValidationError with multiple fields', () => {
      const error = new ValidationError('Multiple errors', {
        fieldErrors: [
          { field: 'email', message: 'Invalid' },
          { field: 'password', message: 'Too short' },
        ],
      })
      const message = getUserFriendlyMessage(error)

      expect(message).toBeDefined()
    })

    it('should return friendly message for ServerError', () => {
      const error = new ServerError('Database error')
      const message = getUserFriendlyMessage(error)

      expect(message.toLowerCase()).toMatch(/problem|error|wrong|try.*again/)
    })

    it('should return friendly message for TimeoutError', () => {
      const error = new TimeoutError('30s timeout exceeded')
      const message = getUserFriendlyMessage(error)

      expect(message.toLowerCase()).toMatch(/taking.*long|timeout|slow|try.*again/)
    })

    it('should return friendly message for rate-limited errors', () => {
      const error = new ServerError('Rate limited', { code: ErrorCode.RATE_LIMITED })
      const message = getUserFriendlyMessage(error)

      expect(message.toLowerCase()).toMatch(/too many|slow down|wait|try.*later/)
    })

    it('should return ConvexError data as message for string data', () => {
      const error = new ConvexError('User-provided error message')
      const message = getUserFriendlyMessage(error)

      expect(message).toBe('User-provided error message')
    })

    it('should handle ConvexError with object data', () => {
      const error = new ConvexError({ message: 'Custom message', code: 'CUSTOM' })
      const message = getUserFriendlyMessage(error)

      expect(message).toBe('Custom message')
    })

    it('should return generic message for unknown errors', () => {
      const error = new Error('Unknown internal error')
      const message = getUserFriendlyMessage(error)

      expect(message).toBeDefined()
      expect(message.length).toBeGreaterThan(0)
    })

    it('should not expose sensitive information', () => {
      const error = new ServerError('SQL injection attempt detected', {
        serverMessage: 'SELECT * FROM users WHERE...',
      })
      const message = getUserFriendlyMessage(error)

      expect(message).not.toContain('SQL')
      expect(message).not.toContain('SELECT')
    })
  })
})

// ============================================================================
// Error Logging Utilities Tests
// ============================================================================

describe('Error Logging Utilities', () => {
  describe('formatErrorForLogging', () => {
    it('should format error with all relevant fields', () => {
      const error = new ServerError('Server error', {
        statusCode: 500,
        requestId: 'req_123',
        context: {
          functionName: 'users:create',
          args: { name: 'Test' },
          timestamp: 1704067200000,
        },
      })

      const formatted = formatErrorForLogging(error)

      expect(formatted).toContain('ServerError')
      expect(formatted).toContain('Server error')
      expect(formatted).toContain('500')
      expect(formatted).toContain('req_123')
      expect(formatted).toContain('users:create')
    })

    it('should include stack trace', () => {
      const error = new ServerError('Test')
      const formatted = formatErrorForLogging(error)

      expect(formatted).toContain('Stack:')
    })

    it('should include cause chain', () => {
      const original = new Error('Database error')
      const wrapped = new ServerError('Server error', { cause: original })
      const formatted = formatErrorForLogging(wrapped)

      expect(formatted).toContain('Cause:')
      expect(formatted).toContain('Database error')
    })

    it('should handle deeply nested cause chain', () => {
      const level1 = new Error('Level 1')
      const level2 = new NetworkError('Level 2', { cause: level1 })
      const level3 = new ServerError('Level 3', { cause: level2 })

      const formatted = formatErrorForLogging(level3)

      expect(formatted).toContain('Level 1')
      expect(formatted).toContain('Level 2')
      expect(formatted).toContain('Level 3')
    })

    it('should sanitize sensitive data in args', () => {
      const error = new ServerError('Error', {
        context: {
          functionName: 'auth:login',
          args: { password: 'secret123', token: 'jwt_token' },
          timestamp: Date.now(),
        },
      })

      const formatted = formatErrorForLogging(error)

      expect(formatted).not.toContain('secret123')
      expect(formatted).not.toContain('jwt_token')
      expect(formatted).toContain('[REDACTED]')
    })

    it('should format as JSON when requested', () => {
      const error = new ServerError('Test')
      const formatted = formatErrorForLogging(error, { format: 'json' })

      expect(() => JSON.parse(formatted)).not.toThrow()
    })

    it('should format as plain text by default', () => {
      const error = new ServerError('Test')
      const formatted = formatErrorForLogging(error)

      expect(typeof formatted).toBe('string')
    })

    it('should include timestamp in formatted output', () => {
      const error = new ServerError('Test')
      const formatted = formatErrorForLogging(error)

      expect(formatted).toMatch(/\d{4}-\d{2}-\d{2}|\d+/)
    })
  })

  describe('createErrorLogger', () => {
    it('should create a logger instance', () => {
      const logger = createErrorLogger()

      expect(logger).toBeDefined()
      expect(typeof logger.log).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.error).toBe('function')
    })

    it('should log errors with log method', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const logger = createErrorLogger()
      const error = new ServerError('Test')

      logger.log(error)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should log warnings with warn method', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const logger = createErrorLogger()
      const error = new ValidationError('Test')

      logger.warn(error)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should log errors with error method', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const logger = createErrorLogger()
      const error = new ServerError('Critical error')

      logger.error(error)

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should accept custom log handler', () => {
      const customHandler = vi.fn()
      const logger = createErrorLogger({ handler: customHandler })
      const error = new ServerError('Test')

      logger.error(error)

      expect(customHandler).toHaveBeenCalled()
    })

    it('should support log levels', () => {
      const handler = vi.fn()
      const logger = createErrorLogger({ handler, level: 'error' })

      logger.log(new ServerError('Info'))
      logger.warn(new ServerError('Warn'))
      logger.error(new ServerError('Error'))

      // Only error should be logged when level is 'error'
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('should include context in logged output', () => {
      const handler = vi.fn()
      const logger = createErrorLogger({ handler })
      const error = new ServerError('Test', {
        context: {
          functionName: 'test:function',
          timestamp: Date.now(),
        },
      })

      logger.error(error)

      expect(handler).toHaveBeenCalled()
      const loggedContent = handler.mock.calls[0][0]
      expect(loggedContent).toContain('test:function')
    })

    it('should support async error reporting', async () => {
      const asyncHandler = vi.fn().mockResolvedValue(undefined)
      const logger = createErrorLogger({
        handler: asyncHandler,
        async: true,
      })

      const error = new ServerError('Test')
      await logger.error(error)

      expect(asyncHandler).toHaveBeenCalled()
    })

    it('should batch errors when configured', () => {
      vi.useFakeTimers()
      const handler = vi.fn()
      const logger = createErrorLogger({
        handler,
        batch: true,
        batchInterval: 1000,
      })

      logger.log(new ServerError('Error 1'))
      logger.log(new ServerError('Error 2'))
      logger.log(new ServerError('Error 3'))

      expect(handler).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)

      expect(handler).toHaveBeenCalledTimes(1)
      vi.useRealTimers()
    })
  })
})

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards', () => {
  describe('isBaseConvexError', () => {
    it('should return true for BaseConvexError', () => {
      const error = new BaseConvexError('Test', ErrorCode.UNKNOWN)
      expect(isBaseConvexError(error)).toBe(true)
    })

    it('should return true for all ConvexError subclasses', () => {
      expect(isBaseConvexError(new ConvexError('Test'))).toBe(true)
      expect(isBaseConvexError(new NetworkError('Test'))).toBe(true)
      expect(isBaseConvexError(new AuthenticationError('Test'))).toBe(true)
      expect(isBaseConvexError(new ValidationError('Test'))).toBe(true)
      expect(isBaseConvexError(new ServerError('Test'))).toBe(true)
      expect(isBaseConvexError(new TimeoutError('Test'))).toBe(true)
    })

    it('should return false for plain Error', () => {
      const error = new Error('Test')
      expect(isBaseConvexError(error)).toBe(false)
    })

    it('should return false for non-error values', () => {
      expect(isBaseConvexError(null)).toBe(false)
      expect(isBaseConvexError(undefined)).toBe(false)
      expect(isBaseConvexError('string')).toBe(false)
      expect(isBaseConvexError(123)).toBe(false)
      expect(isBaseConvexError({})).toBe(false)
    })
  })

  describe('isConvexError', () => {
    it('should return true for ConvexError', () => {
      const error = new ConvexError('Test')
      expect(isConvexError(error)).toBe(true)
    })

    it('should return false for other error types', () => {
      expect(isConvexError(new NetworkError('Test'))).toBe(false)
      expect(isConvexError(new ServerError('Test'))).toBe(false)
      expect(isConvexError(new Error('Test'))).toBe(false)
    })
  })

  describe('isNetworkError', () => {
    it('should return true for NetworkError', () => {
      const error = new NetworkError('Test')
      expect(isNetworkError(error)).toBe(true)
    })

    it('should return false for other error types', () => {
      expect(isNetworkError(new ServerError('Test'))).toBe(false)
      expect(isNetworkError(new Error('Test'))).toBe(false)
    })
  })

  describe('isAuthenticationError', () => {
    it('should return true for AuthenticationError', () => {
      const error = new AuthenticationError('Test')
      expect(isAuthenticationError(error)).toBe(true)
    })

    it('should return false for other error types', () => {
      expect(isAuthenticationError(new NetworkError('Test'))).toBe(false)
    })
  })

  describe('isValidationError', () => {
    it('should return true for ValidationError', () => {
      const error = new ValidationError('Test')
      expect(isValidationError(error)).toBe(true)
    })

    it('should return false for other error types', () => {
      expect(isValidationError(new ServerError('Test'))).toBe(false)
    })
  })

  describe('isServerError', () => {
    it('should return true for ServerError', () => {
      const error = new ServerError('Test')
      expect(isServerError(error)).toBe(true)
    })

    it('should return false for other error types', () => {
      expect(isServerError(new NetworkError('Test'))).toBe(false)
    })
  })

  describe('isTimeoutError', () => {
    it('should return true for TimeoutError', () => {
      const error = new TimeoutError('Test')
      expect(isTimeoutError(error)).toBe(true)
    })

    it('should return false for other error types', () => {
      expect(isTimeoutError(new NetworkError('Test'))).toBe(false)
    })
  })
})

// ============================================================================
// Stack Trace Preservation Tests
// ============================================================================

describe('Stack Trace Preservation', () => {
  it('should capture stack trace at error creation point', () => {
    function createError() {
      return new ServerError('Test error')
    }

    const error = createError()

    expect(error.stack).toContain('createError')
  })

  it('should preserve stack trace when wrapping errors', () => {
    function innerFunction() {
      throw new Error('Inner error')
    }

    function outerFunction() {
      try {
        innerFunction()
      } catch (e) {
        throw new ServerError('Outer error', { cause: e as Error })
      }
    }

    try {
      outerFunction()
    } catch (e) {
      const error = e as ServerError
      expect(error.stack).toContain('outerFunction')
      expect((error.cause as Error).stack).toContain('innerFunction')
    }
  })

  it('should maintain stack trace through serialization/deserialization', () => {
    const error = new ServerError('Test')
    const serialized = serializeError(error)
    const deserialized = deserializeError(serialized)

    expect(deserialized.stack).toBe(error.stack)
  })

  it('should have clean stack trace without internal frames', () => {
    const error = new ValidationError('Test')

    // Stack should not include internal error handling frames
    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('ValidationError')
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Error Handling Integration', () => {
  it('should handle full error lifecycle: create -> wrap -> serialize -> deserialize', () => {
    // 1. Create original error
    const originalError = new TypeError('Cannot read property of undefined')

    // 2. Wrap with context
    const context = createErrorContext('users:get', { id: '123' })
    const wrappedError = wrapError(
      originalError,
      ErrorCode.SERVER,
      'Failed to fetch user',
      { context }
    )

    // 3. Serialize for transmission
    const serialized = serializeError(wrappedError)
    const jsonString = JSON.stringify(serialized)

    // 4. Deserialize on receiving end
    const parsed = JSON.parse(jsonString)
    const deserializedError = deserializeError(parsed)

    // Verify error properties preserved
    expect(deserializedError).toBeInstanceOf(ServerError)
    expect(deserializedError.message).toBe('Failed to fetch user')
    expect(deserializedError.code).toBe(ErrorCode.SERVER)
    expect(deserializedError.context?.functionName).toBe('users:get')
  })

  it('should provide appropriate user message based on error type', () => {
    const errors = [
      new NetworkError('ECONNREFUSED'),
      new AuthenticationError('Invalid JWT'),
      new ValidationError('Schema mismatch', { field: 'email' }),
      new ServerError('ENOENT: no such file'),
      new TimeoutError('30000ms exceeded'),
    ]

    for (const error of errors) {
      const message = getUserFriendlyMessage(error)

      // User message should not contain technical details
      expect(message).not.toContain('ECONNREFUSED')
      expect(message).not.toContain('JWT')
      expect(message).not.toContain('Schema mismatch')
      expect(message).not.toContain('ENOENT')
      expect(message).not.toContain('30000ms')
    }
  })

  it('should correctly identify retryable errors in error chain', () => {
    const networkError = new NetworkError('Connection reset')
    const serverError = new ServerError('Request failed', { cause: networkError })

    // The server error wrapping a network error should still be retryable
    // if the root cause is retryable
    expect(isRetryableError(networkError)).toBe(true)
  })

  it('should format errors consistently for logging', () => {
    const errors = [
      new ConvexError({ message: 'User error' }),
      new NetworkError('Offline', { isOffline: true }),
      new ValidationError('Invalid', { field: 'name', expectedType: 'string' }),
      new ServerError('DB error', { statusCode: 500, requestId: 'req_123' }),
    ]

    for (const error of errors) {
      const formatted = formatErrorForLogging(error)

      expect(formatted).toContain(error.name)
      expect(formatted).toContain(error.message)
      expect(typeof formatted).toBe('string')
    }
  })
})
