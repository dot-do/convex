/**
 * TDD RED Phase Tests for Shared Utilities Module
 *
 * These tests define the expected behavior of the consolidated shared utilities
 * module that should be extracted from duplicated implementations across the codebase.
 *
 * The shared utilities module will provide:
 * - ID generation (generateId, generateDocumentId)
 * - Hashing utilities (hashString, hashObject)
 * - Response helpers (createSuccessResponse, createErrorResponse)
 * - Validation utilities (validateTableName, validateId)
 *
 * All tests should compile but FAIL because the module doesn't exist yet.
 */

import { describe, it, expect, vi } from 'vitest'

// Import from the shared utilities module that should be created
// This import will fail until the module is implemented
import {
  // ID Generation
  generateId,
  generateDocumentId,
  generateWorkflowId,
  generateRequestId,
  // Hashing
  hashString,
  hashObject,
  // Response Helpers
  createSuccessResponse,
  createErrorResponse,
  // Validation
  validateTableName,
  validateId,
  validateNonEmpty,
} from '../../src/shared/utils'

// ============================================================================
// ID Generation Tests
// ============================================================================

describe('ID Generation Utilities', () => {
  describe('generateId', () => {
    it('should generate a unique string ID', () => {
      const id = generateId()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('should generate unique IDs on each call', () => {
      const id1 = generateId()
      const id2 = generateId()
      expect(id1).not.toBe(id2)
    })

    it('should generate URL-safe IDs', () => {
      const id = generateId()
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/)
    })

    it('should generate 1000 unique IDs with no duplicates', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId())
      }
      expect(ids.size).toBe(1000)
    })

    it('should accept an optional prefix', () => {
      const id = generateId('test')
      expect(id).toMatch(/^test/)
    })

    it('should generate IDs with consistent length', () => {
      const ids = Array.from({ length: 100 }, () => generateId())
      const lengths = new Set(ids.map((id) => id.length))
      // Should have only a few distinct lengths (with prefix variations)
      expect(lengths.size).toBeLessThanOrEqual(3)
    })
  })

  describe('generateDocumentId', () => {
    it('should generate an ID for a specific table', () => {
      const id = generateDocumentId('users')
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('should include the table name in the ID', () => {
      const id = generateDocumentId('users')
      expect(id).toContain('users')
    })

    it('should generate unique IDs for the same table', () => {
      const id1 = generateDocumentId('users')
      const id2 = generateDocumentId('users')
      expect(id1).not.toBe(id2)
    })

    it('should generate different IDs for different tables', () => {
      const usersId = generateDocumentId('users')
      const docsId = generateDocumentId('documents')
      expect(usersId).not.toBe(docsId)
    })

    it('should validate table name is not empty', () => {
      expect(() => generateDocumentId('')).toThrow()
    })

    it('should validate table name format', () => {
      expect(() => generateDocumentId('invalid-table')).toThrow()
    })

    it('should accept valid JavaScript identifier table names', () => {
      expect(() => generateDocumentId('users')).not.toThrow()
      expect(() => generateDocumentId('_privateTable')).not.toThrow()
      expect(() => generateDocumentId('table123')).not.toThrow()
    })

    it('should generate URL-safe document IDs', () => {
      const id = generateDocumentId('users')
      // Should be safe for use in URLs
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/)
    })

    it('should handle long table names', () => {
      const longTableName = 'a'.repeat(100)
      const id = generateDocumentId(longTableName)
      expect(id).toContain(longTableName)
    })
  })

  describe('generateWorkflowId', () => {
    it('should generate a workflow-prefixed ID', () => {
      const id = generateWorkflowId()
      expect(id).toMatch(/^wf_/)
    })

    it('should include timestamp information', () => {
      const id = generateWorkflowId()
      // The ID should contain a timestamp-like segment
      expect(id.length).toBeGreaterThan(5)
    })

    it('should generate unique workflow IDs', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateWorkflowId())
      }
      expect(ids.size).toBe(100)
    })
  })

  describe('generateRequestId', () => {
    it('should generate a request ID with the given prefix', () => {
      const id = generateRequestId('sub')
      expect(id).toMatch(/^sub/)
    })

    it('should generate unique request IDs', () => {
      const id1 = generateRequestId('req')
      const id2 = generateRequestId('req')
      expect(id1).not.toBe(id2)
    })

    it('should support different prefixes', () => {
      const subId = generateRequestId('sub')
      const mutId = generateRequestId('mut')
      const actId = generateRequestId('act')
      expect(subId).toMatch(/^sub/)
      expect(mutId).toMatch(/^mut/)
      expect(actId).toMatch(/^act/)
    })
  })
})

// ============================================================================
// Hashing Utilities Tests
// ============================================================================

describe('Hashing Utilities', () => {
  describe('hashString', () => {
    it('should return a string hash', () => {
      const result = hashString('hello')
      expect(typeof result).toBe('string')
    })

    it('should produce consistent hashes for the same input', () => {
      const hash1 = hashString('hello')
      const hash2 = hashString('hello')
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashString('hello')
      const hash2 = hashString('world')
      expect(hash1).not.toBe(hash2)
    })

    it('should return a hexadecimal string', () => {
      const result = hashString('test')
      expect(result).toMatch(/^[a-f0-9]+$/)
    })

    it('should return a consistent-length hash', () => {
      const hash1 = hashString('short')
      const hash2 = hashString('a much longer string with many characters')
      expect(hash1.length).toBe(hash2.length)
    })

    it('should handle empty strings', () => {
      const result = hashString('')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle unicode strings', () => {
      const result = hashString('Hello, World')
      expect(typeof result).toBe('string')
    })

    it('should be case-sensitive', () => {
      const hash1 = hashString('Hello')
      const hash2 = hashString('hello')
      expect(hash1).not.toBe(hash2)
    })

    it('should have good distribution for similar inputs', () => {
      const hashes = new Set<string>()
      for (let i = 0; i < 1000; i++) {
        hashes.add(hashString(`input-${i}`))
      }
      expect(hashes.size).toBe(1000)
    })
  })

  describe('hashObject', () => {
    it('should hash a simple object', () => {
      const result = hashObject({ a: 1 })
      expect(typeof result).toBe('string')
    })

    it('should produce consistent hashes for the same object', () => {
      const hash1 = hashObject({ a: 1, b: 2 })
      const hash2 = hashObject({ a: 1, b: 2 })
      expect(hash1).toBe(hash2)
    })

    it('should produce the same hash regardless of key order', () => {
      const hash1 = hashObject({ a: 1, b: 2, c: 3 })
      const hash2 = hashObject({ c: 3, a: 1, b: 2 })
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different objects', () => {
      const hash1 = hashObject({ a: 1 })
      const hash2 = hashObject({ a: 2 })
      expect(hash1).not.toBe(hash2)
    })

    it('should handle nested objects', () => {
      const obj = { outer: { inner: { value: 42 } } }
      const hash1 = hashObject(obj)
      const hash2 = hashObject(obj)
      expect(hash1).toBe(hash2)
    })

    it('should handle arrays', () => {
      const hash1 = hashObject({ items: [1, 2, 3] })
      const hash2 = hashObject({ items: [1, 2, 3] })
      expect(hash1).toBe(hash2)
    })

    it('should distinguish between different arrays', () => {
      const hash1 = hashObject({ items: [1, 2, 3] })
      const hash2 = hashObject({ items: [1, 2, 4] })
      expect(hash1).not.toBe(hash2)
    })

    it('should handle null values', () => {
      const result = hashObject({ value: null })
      expect(typeof result).toBe('string')
    })

    it('should handle undefined values', () => {
      const result = hashObject({ value: undefined })
      expect(typeof result).toBe('string')
    })

    it('should handle boolean values', () => {
      const trueHash = hashObject({ active: true })
      const falseHash = hashObject({ active: false })
      expect(trueHash).not.toBe(falseHash)
    })

    it('should handle special number values', () => {
      const nanHash = hashObject({ value: NaN })
      const infHash = hashObject({ value: Infinity })
      const negInfHash = hashObject({ value: -Infinity })
      expect(new Set([nanHash, infHash, negInfHash]).size).toBe(3)
    })

    it('should handle Date objects', () => {
      const date = new Date('2024-01-15T12:00:00Z')
      const hash1 = hashObject({ date })
      const hash2 = hashObject({ date })
      expect(hash1).toBe(hash2)
    })

    it('should handle empty objects', () => {
      const hash1 = hashObject({})
      const hash2 = hashObject({})
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for empty object vs empty array', () => {
      const objHash = hashObject({})
      const arrHash = hashObject([])
      expect(objHash).not.toBe(arrHash)
    })
  })
})

// ============================================================================
// Response Helpers Tests
// ============================================================================

describe('Response Helpers', () => {
  describe('createSuccessResponse', () => {
    it('should create a success response with value', () => {
      const response = createSuccessResponse({ value: 42 })
      expect(response.success).toBe(true)
      expect(response.value).toBe(42)
    })

    it('should include request ID when provided', () => {
      const response = createSuccessResponse({
        requestId: 'req_123',
        value: 'test',
      })
      expect(response.requestId).toBe('req_123')
    })

    it('should not include error fields', () => {
      const response = createSuccessResponse({ value: null })
      expect(response).not.toHaveProperty('error')
      expect(response).not.toHaveProperty('errorCode')
    })

    it('should handle complex value types', () => {
      const complexValue = {
        users: [{ name: 'Alice' }, { name: 'Bob' }],
        count: 2,
      }
      const response = createSuccessResponse({ value: complexValue })
      expect(response.value).toEqual(complexValue)
    })

    it('should handle undefined value', () => {
      const response = createSuccessResponse({ value: undefined })
      expect(response.success).toBe(true)
      expect(response.value).toBeUndefined()
    })

    it('should handle null value', () => {
      const response = createSuccessResponse({ value: null })
      expect(response.success).toBe(true)
      expect(response.value).toBeNull()
    })

    it('should include log lines when provided', () => {
      const response = createSuccessResponse({
        value: 'result',
        logLines: ['Log 1', 'Log 2'],
      })
      expect(response.logLines).toEqual(['Log 1', 'Log 2'])
    })
  })

  describe('createErrorResponse', () => {
    it('should create an error response with message', () => {
      const response = createErrorResponse({
        error: 'Something went wrong',
        errorCode: 'INTERNAL_ERROR',
      })
      expect(response.error).toBe('Something went wrong')
      expect(response.errorCode).toBe('INTERNAL_ERROR')
    })

    it('should include request ID when provided', () => {
      const response = createErrorResponse({
        requestId: 'req_123',
        error: 'Not found',
        errorCode: 'NOT_FOUND',
      })
      expect(response.requestId).toBe('req_123')
    })

    it('should include error data when provided', () => {
      const response = createErrorResponse({
        error: 'Validation failed',
        errorCode: 'VALIDATION_ERROR',
        errorData: { field: 'email', reason: 'invalid format' },
      })
      expect(response.errorData).toEqual({
        field: 'email',
        reason: 'invalid format',
      })
    })

    it('should handle different error codes', () => {
      const codes = ['NOT_FOUND', 'UNAUTHORIZED', 'FORBIDDEN', 'INTERNAL_ERROR']
      codes.forEach((code) => {
        const response = createErrorResponse({
          error: 'Error',
          errorCode: code,
        })
        expect(response.errorCode).toBe(code)
      })
    })

    it('should not include errorData when not provided', () => {
      const response = createErrorResponse({
        error: 'Error message',
        errorCode: 'ERROR',
      })
      expect(response).not.toHaveProperty('errorData')
    })

    it('should have type property set to error', () => {
      const response = createErrorResponse({
        error: 'Error',
        errorCode: 'ERROR',
      })
      expect(response.type).toBe('error')
    })
  })
})

// ============================================================================
// Validation Utilities Tests
// ============================================================================

describe('Validation Utilities', () => {
  describe('validateTableName', () => {
    it('should accept valid table names', () => {
      expect(() => validateTableName('users')).not.toThrow()
      expect(() => validateTableName('documents')).not.toThrow()
      expect(() => validateTableName('myTable123')).not.toThrow()
    })

    it('should accept names starting with underscore', () => {
      expect(() => validateTableName('_internal')).not.toThrow()
      expect(() => validateTableName('_privateData')).not.toThrow()
    })

    it('should reject empty names', () => {
      expect(() => validateTableName('')).toThrow()
    })

    it('should reject names with hyphens', () => {
      expect(() => validateTableName('my-table')).toThrow()
    })

    it('should reject names starting with numbers', () => {
      expect(() => validateTableName('123users')).toThrow()
    })

    it('should reject names with spaces', () => {
      expect(() => validateTableName('my table')).toThrow()
    })

    it('should reject names with special characters', () => {
      expect(() => validateTableName('users@table')).toThrow()
      expect(() => validateTableName('users.table')).toThrow()
      expect(() => validateTableName('users/table')).toThrow()
    })

    it('should return the validated name', () => {
      const result = validateTableName('users')
      expect(result).toBe('users')
    })

    it('should provide a descriptive error message', () => {
      expect(() => validateTableName('invalid-name')).toThrow(/invalid|identifier/i)
    })
  })

  describe('validateId', () => {
    it('should accept valid document IDs', () => {
      expect(() => validateId('users_abc123')).not.toThrow()
      expect(() => validateId('documents_xyz789')).not.toThrow()
    })

    it('should reject empty IDs', () => {
      expect(() => validateId('')).toThrow()
    })

    it('should reject IDs without table prefix', () => {
      expect(() => validateId('abc123')).toThrow()
    })

    it('should return the validated ID', () => {
      const id = 'users_abc123'
      const result = validateId(id)
      expect(result).toBe(id)
    })

    it('should provide a descriptive error message', () => {
      expect(() => validateId('invalid')).toThrow(/invalid|format|id/i)
    })

    it('should validate IDs match expected table', () => {
      expect(() => validateId('users_abc123', 'users')).not.toThrow()
      expect(() => validateId('users_abc123', 'documents')).toThrow()
    })
  })

  describe('validateNonEmpty', () => {
    it('should accept non-empty strings', () => {
      expect(() => validateNonEmpty('hello', 'value')).not.toThrow()
    })

    it('should reject empty strings', () => {
      expect(() => validateNonEmpty('', 'value')).toThrow()
    })

    it('should reject whitespace-only strings', () => {
      expect(() => validateNonEmpty('   ', 'value')).toThrow()
    })

    it('should include field name in error message', () => {
      expect(() => validateNonEmpty('', 'username')).toThrow(/username/i)
    })

    it('should return the trimmed value', () => {
      const result = validateNonEmpty('  hello  ', 'value')
      expect(result).toBe('hello')
    })

    it('should reject null and undefined', () => {
      expect(() => validateNonEmpty(null as unknown as string, 'value')).toThrow()
      expect(() => validateNonEmpty(undefined as unknown as string, 'value')).toThrow()
    })
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Shared Utils Integration', () => {
  it('should generate IDs that can be validated', () => {
    const id = generateDocumentId('users')
    expect(() => validateId(id, 'users')).not.toThrow()
  })

  it('should hash generated IDs consistently', () => {
    const id = generateDocumentId('users')
    const hash1 = hashString(id)
    const hash2 = hashString(id)
    expect(hash1).toBe(hash2)
  })

  it('should create success response with generated request ID', () => {
    const requestId = generateRequestId('req')
    const response = createSuccessResponse({
      requestId,
      value: 'test',
    })
    expect(response.requestId).toBe(requestId)
    expect(response.success).toBe(true)
  })

  it('should create error response with generated request ID', () => {
    const requestId = generateRequestId('req')
    const response = createErrorResponse({
      requestId,
      error: 'Error occurred',
      errorCode: 'ERROR',
    })
    expect(response.requestId).toBe(requestId)
    expect(response.type).toBe('error')
  })
})
