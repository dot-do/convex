/**
 * TDD Tests for Real-Time Sync Protocol
 *
 * These tests define the expected interface and behavior for the sync protocol
 * used for client-server communication in convex.do
 */

import { describe, it, expect, beforeEach } from 'vitest'

import {
  // Message Types
  type SyncMessage,
  type QuerySubscription,
  type QueryUnsubscribe,
  type MutationRequest,
  type ActionRequest,
  type QueryResult,
  type MutationResult,
  type ActionResult,
  type ErrorResponse,
  type Ping,
  type Pong,
  type Authenticate,
  type Authenticated,
  type ModifyQuerySet,
  type Transition,
  type FunctionResult,

  // Protocol Class
  SyncProtocol,

  // Message type guards
  isQuerySubscription,
  isQueryUnsubscribe,
  isMutationRequest,
  isActionRequest,
  isQueryResult,
  isMutationResult,
  isActionResult,
  isErrorResponse,
  isPing,
  isPong,
  isAuthenticate,
  isAuthenticated,
  isModifyQuerySet,
  isTransition,

  // Utilities
  createRequestId,
  createQuerySubscription,
  createMutationRequest,
  createActionRequest,
  createPing,
  createPong,
  createErrorResponse,
  createQueryResult,
  createMutationResult,
  createActionResult,
  createAuthenticate,
  createModifyQuerySet,
  createTransition,

  // Error types
  SyncProtocolError,
  MessageParseError,
  MessageSerializeError,
  InvalidMessageError,
} from '../../src/sync/protocol'

// ============================================================================
// SyncMessage Type Definition Tests
// ============================================================================

describe('SyncMessage Types', () => {
  describe('QuerySubscription message', () => {
    it('should have type "subscribe"', () => {
      const message: QuerySubscription = {
        type: 'subscribe',
        requestId: 'req_1',
        queryId: 'q_1',
        query: 'users:list',
        args: {},
        journal: undefined,
      }

      expect(message.type).toBe('subscribe')
    })

    it('should have required requestId field', () => {
      const message: QuerySubscription = {
        type: 'subscribe',
        requestId: 'req_123',
        queryId: 'q_1',
        query: 'users:list',
        args: {},
      }

      expect(message.requestId).toBe('req_123')
    })

    it('should have required queryId field', () => {
      const message: QuerySubscription = {
        type: 'subscribe',
        requestId: 'req_1',
        queryId: 'query_456',
        query: 'users:list',
        args: {},
      }

      expect(message.queryId).toBe('query_456')
    })

    it('should have query path field', () => {
      const message: QuerySubscription = {
        type: 'subscribe',
        requestId: 'req_1',
        queryId: 'q_1',
        query: 'messages:list',
        args: { channelId: '123' },
      }

      expect(message.query).toBe('messages:list')
    })

    it('should have args field', () => {
      const message: QuerySubscription = {
        type: 'subscribe',
        requestId: 'req_1',
        queryId: 'q_1',
        query: 'users:get',
        args: { id: 'user_123', includeProfile: true },
      }

      expect(message.args).toEqual({ id: 'user_123', includeProfile: true })
    })

    it('should support optional journal field for optimistic updates', () => {
      const message: QuerySubscription = {
        type: 'subscribe',
        requestId: 'req_1',
        queryId: 'q_1',
        query: 'users:list',
        args: {},
        journal: {
          base: 'v_123',
          mutations: ['m_1', 'm_2'],
        },
      }

      expect(message.journal).toBeDefined()
      expect(message.journal?.base).toBe('v_123')
    })
  })

  describe('QueryUnsubscribe message', () => {
    it('should have type "unsubscribe"', () => {
      const message: QueryUnsubscribe = {
        type: 'unsubscribe',
        queryId: 'q_1',
      }

      expect(message.type).toBe('unsubscribe')
    })

    it('should have queryId field', () => {
      const message: QueryUnsubscribe = {
        type: 'unsubscribe',
        queryId: 'query_789',
      }

      expect(message.queryId).toBe('query_789')
    })
  })

  describe('MutationRequest message', () => {
    it('should have type "mutation"', () => {
      const message: MutationRequest = {
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'users:create',
        args: { name: 'John' },
      }

      expect(message.type).toBe('mutation')
    })

    it('should have requestId for correlation', () => {
      const message: MutationRequest = {
        type: 'mutation',
        requestId: 'mut_req_123',
        mutation: 'users:update',
        args: {},
      }

      expect(message.requestId).toBe('mut_req_123')
    })

    it('should have mutation path field', () => {
      const message: MutationRequest = {
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'messages:send',
        args: { body: 'Hello' },
      }

      expect(message.mutation).toBe('messages:send')
    })

    it('should have args field', () => {
      const message: MutationRequest = {
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'users:update',
        args: { id: 'user_1', name: 'Jane', email: 'jane@example.com' },
      }

      expect(message.args).toEqual({ id: 'user_1', name: 'Jane', email: 'jane@example.com' })
    })
  })

  describe('ActionRequest message', () => {
    it('should have type "action"', () => {
      const message: ActionRequest = {
        type: 'action',
        requestId: 'req_1',
        action: 'email:send',
        args: {},
      }

      expect(message.type).toBe('action')
    })

    it('should have requestId for correlation', () => {
      const message: ActionRequest = {
        type: 'action',
        requestId: 'act_req_456',
        action: 'files:upload',
        args: {},
      }

      expect(message.requestId).toBe('act_req_456')
    })

    it('should have action path field', () => {
      const message: ActionRequest = {
        type: 'action',
        requestId: 'req_1',
        action: 'payments:process',
        args: { amount: 100 },
      }

      expect(message.action).toBe('payments:process')
    })

    it('should have args field', () => {
      const message: ActionRequest = {
        type: 'action',
        requestId: 'req_1',
        action: 'notifications:push',
        args: { userId: 'u_1', message: 'Hello', urgent: true },
      }

      expect(message.args).toEqual({ userId: 'u_1', message: 'Hello', urgent: true })
    })
  })

  describe('QueryResult message', () => {
    it('should have type "queryResult"', () => {
      const message: QueryResult = {
        type: 'queryResult',
        queryId: 'q_1',
        value: [],
        logLines: [],
      }

      expect(message.type).toBe('queryResult')
    })

    it('should have queryId for correlation', () => {
      const message: QueryResult = {
        type: 'queryResult',
        queryId: 'query_123',
        value: { users: [] },
        logLines: [],
      }

      expect(message.queryId).toBe('query_123')
    })

    it('should have value field with result data', () => {
      const message: QueryResult = {
        type: 'queryResult',
        queryId: 'q_1',
        value: [
          { _id: '1', name: 'Alice' },
          { _id: '2', name: 'Bob' },
        ],
        logLines: [],
      }

      expect(message.value).toHaveLength(2)
      expect(message.value[0]).toEqual({ _id: '1', name: 'Alice' })
    })

    it('should have logLines for server logs', () => {
      const message: QueryResult = {
        type: 'queryResult',
        queryId: 'q_1',
        value: null,
        logLines: ['Debug: Query started', 'Debug: Query completed'],
      }

      expect(message.logLines).toHaveLength(2)
    })

    it('should support journal for versioning', () => {
      const message: QueryResult = {
        type: 'queryResult',
        queryId: 'q_1',
        value: [],
        logLines: [],
        journal: {
          version: 'v_456',
          timestamp: 1704067200000,
        },
      }

      expect(message.journal?.version).toBe('v_456')
    })
  })

  describe('MutationResult message', () => {
    it('should have type "mutationResult"', () => {
      const message: MutationResult = {
        type: 'mutationResult',
        requestId: 'req_1',
        success: true,
        value: null,
        logLines: [],
      }

      expect(message.type).toBe('mutationResult')
    })

    it('should have requestId for correlation', () => {
      const message: MutationResult = {
        type: 'mutationResult',
        requestId: 'mut_123',
        success: true,
        value: { inserted: true },
        logLines: [],
      }

      expect(message.requestId).toBe('mut_123')
    })

    it('should have success flag', () => {
      const successMessage: MutationResult = {
        type: 'mutationResult',
        requestId: 'req_1',
        success: true,
        value: {},
        logLines: [],
      }

      const failureMessage: MutationResult = {
        type: 'mutationResult',
        requestId: 'req_2',
        success: false,
        value: null,
        logLines: [],
        error: 'Validation failed',
      }

      expect(successMessage.success).toBe(true)
      expect(failureMessage.success).toBe(false)
    })

    it('should have value field with result', () => {
      const message: MutationResult = {
        type: 'mutationResult',
        requestId: 'req_1',
        success: true,
        value: { _id: 'doc_123', created: true },
        logLines: [],
      }

      expect(message.value).toEqual({ _id: 'doc_123', created: true })
    })

    it('should have optional error field on failure', () => {
      const message: MutationResult = {
        type: 'mutationResult',
        requestId: 'req_1',
        success: false,
        value: null,
        logLines: [],
        error: 'Document not found',
        errorData: { documentId: 'doc_123' },
      }

      expect(message.error).toBe('Document not found')
      expect(message.errorData).toEqual({ documentId: 'doc_123' })
    })
  })

  describe('ActionResult message', () => {
    it('should have type "actionResult"', () => {
      const message: ActionResult = {
        type: 'actionResult',
        requestId: 'req_1',
        success: true,
        value: null,
        logLines: [],
      }

      expect(message.type).toBe('actionResult')
    })

    it('should have requestId for correlation', () => {
      const message: ActionResult = {
        type: 'actionResult',
        requestId: 'act_456',
        success: true,
        value: {},
        logLines: [],
      }

      expect(message.requestId).toBe('act_456')
    })

    it('should have success flag', () => {
      const message: ActionResult = {
        type: 'actionResult',
        requestId: 'req_1',
        success: false,
        value: null,
        logLines: [],
        error: 'External API error',
      }

      expect(message.success).toBe(false)
      expect(message.error).toBe('External API error')
    })

    it('should have value field with result', () => {
      const message: ActionResult = {
        type: 'actionResult',
        requestId: 'req_1',
        success: true,
        value: { emailSent: true, recipients: 5 },
        logLines: [],
      }

      expect(message.value).toEqual({ emailSent: true, recipients: 5 })
    })
  })

  describe('ErrorResponse message', () => {
    it('should have type "error"', () => {
      const message: ErrorResponse = {
        type: 'error',
        error: 'Internal server error',
        errorCode: 'INTERNAL_ERROR',
      }

      expect(message.type).toBe('error')
    })

    it('should have error message', () => {
      const message: ErrorResponse = {
        type: 'error',
        error: 'Authentication required',
        errorCode: 'UNAUTHENTICATED',
      }

      expect(message.error).toBe('Authentication required')
    })

    it('should have errorCode', () => {
      const message: ErrorResponse = {
        type: 'error',
        error: 'Rate limit exceeded',
        errorCode: 'RATE_LIMITED',
      }

      expect(message.errorCode).toBe('RATE_LIMITED')
    })

    it('should have optional requestId for correlation', () => {
      const message: ErrorResponse = {
        type: 'error',
        requestId: 'req_123',
        error: 'Function not found',
        errorCode: 'NOT_FOUND',
      }

      expect(message.requestId).toBe('req_123')
    })

    it('should have optional errorData for additional context', () => {
      const message: ErrorResponse = {
        type: 'error',
        error: 'Validation error',
        errorCode: 'VALIDATION_ERROR',
        errorData: {
          field: 'email',
          reason: 'Invalid format',
        },
      }

      expect(message.errorData).toEqual({ field: 'email', reason: 'Invalid format' })
    })
  })

  describe('Ping message', () => {
    it('should have type "ping"', () => {
      const message: Ping = {
        type: 'ping',
      }

      expect(message.type).toBe('ping')
    })
  })

  describe('Pong message', () => {
    it('should have type "pong"', () => {
      const message: Pong = {
        type: 'pong',
      }

      expect(message.type).toBe('pong')
    })
  })

  describe('Authenticate message', () => {
    it('should have type "authenticate"', () => {
      const message: Authenticate = {
        type: 'authenticate',
        token: 'jwt_token_here',
      }

      expect(message.type).toBe('authenticate')
    })

    it('should have token field', () => {
      const message: Authenticate = {
        type: 'authenticate',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      }

      expect(message.token).toContain('eyJ')
    })

    it('should have optional baseVersion for session resume', () => {
      const message: Authenticate = {
        type: 'authenticate',
        token: 'token',
        baseVersion: 42,
      }

      expect(message.baseVersion).toBe(42)
    })
  })

  describe('Authenticated message', () => {
    it('should have type "authenticated"', () => {
      const message: Authenticated = {
        type: 'authenticated',
      }

      expect(message.type).toBe('authenticated')
    })

    it('should have optional identity info', () => {
      const message: Authenticated = {
        type: 'authenticated',
        identity: {
          subject: 'user_123',
          issuer: 'https://auth.example.com',
        },
      }

      expect(message.identity?.subject).toBe('user_123')
    })
  })

  describe('ModifyQuerySet message', () => {
    it('should have type "modifyQuerySet"', () => {
      const message: ModifyQuerySet = {
        type: 'modifyQuerySet',
        baseVersion: 1,
        newVersion: 2,
        modifications: [],
      }

      expect(message.type).toBe('modifyQuerySet')
    })

    it('should have version tracking fields', () => {
      const message: ModifyQuerySet = {
        type: 'modifyQuerySet',
        baseVersion: 5,
        newVersion: 6,
        modifications: [],
      }

      expect(message.baseVersion).toBe(5)
      expect(message.newVersion).toBe(6)
    })

    it('should have array of modifications', () => {
      const message: ModifyQuerySet = {
        type: 'modifyQuerySet',
        baseVersion: 1,
        newVersion: 3,
        modifications: [
          { type: 'add', queryId: 'q_1', query: 'users:list', args: {} },
          { type: 'remove', queryId: 'q_2' },
        ],
      }

      expect(message.modifications).toHaveLength(2)
    })
  })

  describe('Transition message', () => {
    it('should have type "transition"', () => {
      const message: Transition = {
        type: 'transition',
        startVersion: 1,
        endVersion: 2,
        modifications: [],
      }

      expect(message.type).toBe('transition')
    })

    it('should track version transitions', () => {
      const message: Transition = {
        type: 'transition',
        startVersion: 10,
        endVersion: 15,
        modifications: [],
      }

      expect(message.startVersion).toBe(10)
      expect(message.endVersion).toBe(15)
    })

    it('should contain query result modifications', () => {
      const message: Transition = {
        type: 'transition',
        startVersion: 1,
        endVersion: 2,
        modifications: [
          { queryId: 'q_1', value: [{ _id: '1', name: 'Updated' }], logLines: [] },
        ],
      }

      expect(message.modifications[0].queryId).toBe('q_1')
    })
  })
})

// ============================================================================
// SyncProtocol Class Tests
// ============================================================================

describe('SyncProtocol', () => {
  let protocol: SyncProtocol

  beforeEach(() => {
    protocol = new SyncProtocol()
  })

  describe('Message Serialization', () => {
    it('should serialize QuerySubscription message to JSON string', () => {
      const message: QuerySubscription = {
        type: 'subscribe',
        requestId: 'req_1',
        queryId: 'q_1',
        query: 'users:list',
        args: {},
      }

      const serialized = protocol.serialize(message)

      expect(typeof serialized).toBe('string')
      expect(JSON.parse(serialized)).toEqual(message)
    })

    it('should serialize MutationRequest message', () => {
      const message: MutationRequest = {
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'users:create',
        args: { name: 'Alice' },
      }

      const serialized = protocol.serialize(message)
      const parsed = JSON.parse(serialized)

      expect(parsed.type).toBe('mutation')
      expect(parsed.mutation).toBe('users:create')
    })

    it('should serialize ActionRequest message', () => {
      const message: ActionRequest = {
        type: 'action',
        requestId: 'req_1',
        action: 'email:send',
        args: { to: 'test@example.com' },
      }

      const serialized = protocol.serialize(message)
      const parsed = JSON.parse(serialized)

      expect(parsed.type).toBe('action')
      expect(parsed.action).toBe('email:send')
    })

    it('should serialize Ping message', () => {
      const message: Ping = { type: 'ping' }

      const serialized = protocol.serialize(message)

      expect(serialized).toBe('{"type":"ping"}')
    })

    it('should serialize Pong message', () => {
      const message: Pong = { type: 'pong' }

      const serialized = protocol.serialize(message)

      expect(serialized).toBe('{"type":"pong"}')
    })

    it('should handle complex nested args in serialization', () => {
      const message: MutationRequest = {
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'data:update',
        args: {
          nested: {
            deep: {
              value: [1, 2, { key: 'value' }],
            },
          },
          array: [1, 'two', true, null],
        },
      }

      const serialized = protocol.serialize(message)
      const parsed = JSON.parse(serialized)

      expect(parsed.args.nested.deep.value[2].key).toBe('value')
      expect(parsed.args.array).toEqual([1, 'two', true, null])
    })

    it('should handle special characters in string fields', () => {
      const message: MutationRequest = {
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'messages:send',
        args: { body: 'Hello "world"!\n\tNew line and tab' },
      }

      const serialized = protocol.serialize(message)
      const parsed = JSON.parse(serialized)

      expect(parsed.args.body).toBe('Hello "world"!\n\tNew line and tab')
    })

    it('should throw MessageSerializeError for circular references', () => {
      const circular: Record<string, unknown> = { a: 1 }
      circular.self = circular

      const message = {
        type: 'mutation' as const,
        requestId: 'req_1',
        mutation: 'test:circular',
        args: circular,
      }

      expect(() => protocol.serialize(message)).toThrow(MessageSerializeError)
    })

    it('should handle BigInt serialization', () => {
      const message: MutationRequest = {
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'data:update',
        args: { bigValue: BigInt('9007199254740993') },
      }

      const serialized = protocol.serialize(message)
      const parsed = JSON.parse(serialized)

      // BigInt should be serialized as string with $bigint marker or as string
      expect(parsed.args.bigValue).toBeDefined()
    })
  })

  describe('Message Deserialization', () => {
    it('should deserialize JSON string to QuerySubscription', () => {
      const json = JSON.stringify({
        type: 'subscribe',
        requestId: 'req_1',
        queryId: 'q_1',
        query: 'users:list',
        args: {},
      })

      const message = protocol.deserialize(json)

      expect(message.type).toBe('subscribe')
      expect(isQuerySubscription(message)).toBe(true)
    })

    it('should deserialize MutationRequest', () => {
      const json = JSON.stringify({
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'users:create',
        args: { name: 'Bob' },
      })

      const message = protocol.deserialize(json)

      expect(message.type).toBe('mutation')
      expect(isMutationRequest(message)).toBe(true)
      if (isMutationRequest(message)) {
        expect(message.args).toEqual({ name: 'Bob' })
      }
    })

    it('should deserialize ActionRequest', () => {
      const json = JSON.stringify({
        type: 'action',
        requestId: 'req_1',
        action: 'files:process',
        args: { fileId: 'f_123' },
      })

      const message = protocol.deserialize(json)

      expect(message.type).toBe('action')
      expect(isActionRequest(message)).toBe(true)
    })

    it('should deserialize QueryResult', () => {
      const json = JSON.stringify({
        type: 'queryResult',
        queryId: 'q_1',
        value: [{ _id: '1', name: 'Alice' }],
        logLines: ['Log entry'],
      })

      const message = protocol.deserialize(json)

      expect(message.type).toBe('queryResult')
      expect(isQueryResult(message)).toBe(true)
    })

    it('should deserialize MutationResult', () => {
      const json = JSON.stringify({
        type: 'mutationResult',
        requestId: 'req_1',
        success: true,
        value: { _id: 'doc_1' },
        logLines: [],
      })

      const message = protocol.deserialize(json)

      expect(message.type).toBe('mutationResult')
      expect(isMutationResult(message)).toBe(true)
    })

    it('should deserialize ActionResult', () => {
      const json = JSON.stringify({
        type: 'actionResult',
        requestId: 'req_1',
        success: true,
        value: { processed: true },
        logLines: [],
      })

      const message = protocol.deserialize(json)

      expect(message.type).toBe('actionResult')
      expect(isActionResult(message)).toBe(true)
    })

    it('should deserialize ErrorResponse', () => {
      const json = JSON.stringify({
        type: 'error',
        error: 'Something went wrong',
        errorCode: 'INTERNAL_ERROR',
      })

      const message = protocol.deserialize(json)

      expect(message.type).toBe('error')
      expect(isErrorResponse(message)).toBe(true)
    })

    it('should deserialize Ping', () => {
      const json = '{"type":"ping"}'

      const message = protocol.deserialize(json)

      expect(isPing(message)).toBe(true)
    })

    it('should deserialize Pong', () => {
      const json = '{"type":"pong"}'

      const message = protocol.deserialize(json)

      expect(isPong(message)).toBe(true)
    })

    it('should throw MessageParseError for invalid JSON', () => {
      expect(() => protocol.deserialize('not valid json')).toThrow(MessageParseError)
    })

    it('should throw InvalidMessageError for unknown message type', () => {
      const json = JSON.stringify({ type: 'unknown', data: {} })

      expect(() => protocol.deserialize(json)).toThrow(InvalidMessageError)
    })

    it('should throw InvalidMessageError for missing required fields', () => {
      const json = JSON.stringify({ type: 'subscribe' })

      expect(() => protocol.deserialize(json)).toThrow(InvalidMessageError)
    })

    it('should throw InvalidMessageError for invalid field types', () => {
      const json = JSON.stringify({
        type: 'subscribe',
        requestId: 123, // should be string
        queryId: 'q_1',
        query: 'test',
        args: {},
      })

      expect(() => protocol.deserialize(json)).toThrow(InvalidMessageError)
    })
  })

  describe('Request/Response Correlation', () => {
    it('should generate unique request IDs', () => {
      const id1 = createRequestId()
      const id2 = createRequestId()
      const id3 = createRequestId()

      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).not.toBe(id3)
    })

    it('should generate request IDs with prefix', () => {
      const id = createRequestId('sub')

      expect(id).toMatch(/^sub_/)
    })

    it('should include timestamp component in request ID', () => {
      const id = createRequestId()

      // Request ID should contain some numeric component
      expect(id).toMatch(/\d+/)
    })

    it('should correlate mutation request with result', () => {
      const requestId = createRequestId('mut')

      const request: MutationRequest = {
        type: 'mutation',
        requestId,
        mutation: 'users:create',
        args: { name: 'Test' },
      }

      const result: MutationResult = {
        type: 'mutationResult',
        requestId,
        success: true,
        value: { _id: 'user_1' },
        logLines: [],
      }

      expect(request.requestId).toBe(result.requestId)
    })

    it('should correlate action request with result', () => {
      const requestId = createRequestId('act')

      const request: ActionRequest = {
        type: 'action',
        requestId,
        action: 'email:send',
        args: {},
      }

      const result: ActionResult = {
        type: 'actionResult',
        requestId,
        success: true,
        value: null,
        logLines: [],
      }

      expect(request.requestId).toBe(result.requestId)
    })

    it('should correlate query subscription with results by queryId', () => {
      const queryId = createRequestId('query')

      const subscription: QuerySubscription = {
        type: 'subscribe',
        requestId: createRequestId(),
        queryId,
        query: 'users:list',
        args: {},
      }

      const result: QueryResult = {
        type: 'queryResult',
        queryId,
        value: [],
        logLines: [],
      }

      expect(subscription.queryId).toBe(result.queryId)
    })

    it('should correlate error response with request', () => {
      const requestId = createRequestId()

      const request: MutationRequest = {
        type: 'mutation',
        requestId,
        mutation: 'users:delete',
        args: { id: 'invalid' },
      }

      const error: ErrorResponse = {
        type: 'error',
        requestId,
        error: 'Document not found',
        errorCode: 'NOT_FOUND',
      }

      expect(request.requestId).toBe(error.requestId)
    })
  })
})

// ============================================================================
// Message Factory Function Tests
// ============================================================================

describe('Message Factory Functions', () => {
  describe('createQuerySubscription', () => {
    it('should create a valid QuerySubscription message', () => {
      const message = createQuerySubscription({
        query: 'users:list',
        args: { limit: 10 },
      })

      expect(message.type).toBe('subscribe')
      expect(message.requestId).toBeDefined()
      expect(message.queryId).toBeDefined()
      expect(message.query).toBe('users:list')
      expect(message.args).toEqual({ limit: 10 })
    })

    it('should auto-generate requestId if not provided', () => {
      const message = createQuerySubscription({
        query: 'test:query',
        args: {},
      })

      expect(message.requestId).toBeTruthy()
      expect(typeof message.requestId).toBe('string')
    })

    it('should auto-generate queryId if not provided', () => {
      const message = createQuerySubscription({
        query: 'test:query',
        args: {},
      })

      expect(message.queryId).toBeTruthy()
      expect(typeof message.queryId).toBe('string')
    })

    it('should use provided requestId', () => {
      const message = createQuerySubscription({
        requestId: 'custom_req_id',
        query: 'test:query',
        args: {},
      })

      expect(message.requestId).toBe('custom_req_id')
    })

    it('should use provided queryId', () => {
      const message = createQuerySubscription({
        queryId: 'custom_query_id',
        query: 'test:query',
        args: {},
      })

      expect(message.queryId).toBe('custom_query_id')
    })
  })

  describe('createMutationRequest', () => {
    it('should create a valid MutationRequest message', () => {
      const message = createMutationRequest({
        mutation: 'users:create',
        args: { name: 'Alice' },
      })

      expect(message.type).toBe('mutation')
      expect(message.requestId).toBeDefined()
      expect(message.mutation).toBe('users:create')
      expect(message.args).toEqual({ name: 'Alice' })
    })

    it('should auto-generate requestId', () => {
      const message = createMutationRequest({
        mutation: 'test:mutation',
        args: {},
      })

      expect(message.requestId).toBeTruthy()
    })
  })

  describe('createActionRequest', () => {
    it('should create a valid ActionRequest message', () => {
      const message = createActionRequest({
        action: 'email:send',
        args: { to: 'user@example.com' },
      })

      expect(message.type).toBe('action')
      expect(message.requestId).toBeDefined()
      expect(message.action).toBe('email:send')
      expect(message.args).toEqual({ to: 'user@example.com' })
    })
  })

  describe('createPing', () => {
    it('should create a Ping message', () => {
      const message = createPing()

      expect(message).toEqual({ type: 'ping' })
    })
  })

  describe('createPong', () => {
    it('should create a Pong message', () => {
      const message = createPong()

      expect(message).toEqual({ type: 'pong' })
    })
  })

  describe('createErrorResponse', () => {
    it('should create an ErrorResponse message', () => {
      const message = createErrorResponse({
        error: 'Something went wrong',
        errorCode: 'INTERNAL_ERROR',
      })

      expect(message.type).toBe('error')
      expect(message.error).toBe('Something went wrong')
      expect(message.errorCode).toBe('INTERNAL_ERROR')
    })

    it('should include optional requestId', () => {
      const message = createErrorResponse({
        requestId: 'req_123',
        error: 'Not found',
        errorCode: 'NOT_FOUND',
      })

      expect(message.requestId).toBe('req_123')
    })

    it('should include optional errorData', () => {
      const message = createErrorResponse({
        error: 'Validation error',
        errorCode: 'VALIDATION_ERROR',
        errorData: { field: 'email' },
      })

      expect(message.errorData).toEqual({ field: 'email' })
    })
  })

  describe('createQueryResult', () => {
    it('should create a QueryResult message', () => {
      const message = createQueryResult({
        queryId: 'q_1',
        value: [{ _id: '1', name: 'Alice' }],
      })

      expect(message.type).toBe('queryResult')
      expect(message.queryId).toBe('q_1')
      expect(message.value).toEqual([{ _id: '1', name: 'Alice' }])
      expect(message.logLines).toEqual([])
    })

    it('should include logLines', () => {
      const message = createQueryResult({
        queryId: 'q_1',
        value: null,
        logLines: ['Debug: Query executed'],
      })

      expect(message.logLines).toEqual(['Debug: Query executed'])
    })
  })

  describe('createMutationResult', () => {
    it('should create a success MutationResult message', () => {
      const message = createMutationResult({
        requestId: 'req_1',
        success: true,
        value: { _id: 'doc_1' },
      })

      expect(message.type).toBe('mutationResult')
      expect(message.requestId).toBe('req_1')
      expect(message.success).toBe(true)
      expect(message.value).toEqual({ _id: 'doc_1' })
    })

    it('should create a failure MutationResult message', () => {
      const message = createMutationResult({
        requestId: 'req_1',
        success: false,
        value: null,
        error: 'Validation failed',
        errorData: { field: 'name' },
      })

      expect(message.success).toBe(false)
      expect(message.error).toBe('Validation failed')
      expect(message.errorData).toEqual({ field: 'name' })
    })
  })

  describe('createActionResult', () => {
    it('should create a success ActionResult message', () => {
      const message = createActionResult({
        requestId: 'req_1',
        success: true,
        value: { sent: true },
      })

      expect(message.type).toBe('actionResult')
      expect(message.success).toBe(true)
      expect(message.value).toEqual({ sent: true })
    })

    it('should create a failure ActionResult message', () => {
      const message = createActionResult({
        requestId: 'req_1',
        success: false,
        value: null,
        error: 'External service unavailable',
      })

      expect(message.success).toBe(false)
      expect(message.error).toBe('External service unavailable')
    })
  })

  describe('createAuthenticate', () => {
    it('should create an Authenticate message', () => {
      const message = createAuthenticate({ token: 'jwt_token' })

      expect(message.type).toBe('authenticate')
      expect(message.token).toBe('jwt_token')
    })

    it('should include optional baseVersion', () => {
      const message = createAuthenticate({
        token: 'jwt_token',
        baseVersion: 42,
      })

      expect(message.baseVersion).toBe(42)
    })
  })

  describe('createModifyQuerySet', () => {
    it('should create a ModifyQuerySet message', () => {
      const message = createModifyQuerySet({
        baseVersion: 1,
        newVersion: 2,
        modifications: [
          { type: 'add', queryId: 'q_1', query: 'users:list', args: {} },
        ],
      })

      expect(message.type).toBe('modifyQuerySet')
      expect(message.baseVersion).toBe(1)
      expect(message.newVersion).toBe(2)
      expect(message.modifications).toHaveLength(1)
    })
  })

  describe('createTransition', () => {
    it('should create a Transition message', () => {
      const message = createTransition({
        startVersion: 1,
        endVersion: 2,
        modifications: [
          { queryId: 'q_1', value: [], logLines: [] },
        ],
      })

      expect(message.type).toBe('transition')
      expect(message.startVersion).toBe(1)
      expect(message.endVersion).toBe(2)
    })
  })
})

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards', () => {
  describe('isQuerySubscription', () => {
    it('should return true for QuerySubscription messages', () => {
      const message: SyncMessage = {
        type: 'subscribe',
        requestId: 'req_1',
        queryId: 'q_1',
        query: 'test',
        args: {},
      }

      expect(isQuerySubscription(message)).toBe(true)
    })

    it('should return false for other message types', () => {
      const message: SyncMessage = { type: 'ping' }

      expect(isQuerySubscription(message)).toBe(false)
    })
  })

  describe('isQueryUnsubscribe', () => {
    it('should return true for QueryUnsubscribe messages', () => {
      const message: SyncMessage = {
        type: 'unsubscribe',
        queryId: 'q_1',
      }

      expect(isQueryUnsubscribe(message)).toBe(true)
    })
  })

  describe('isMutationRequest', () => {
    it('should return true for MutationRequest messages', () => {
      const message: SyncMessage = {
        type: 'mutation',
        requestId: 'req_1',
        mutation: 'test:mutation',
        args: {},
      }

      expect(isMutationRequest(message)).toBe(true)
    })
  })

  describe('isActionRequest', () => {
    it('should return true for ActionRequest messages', () => {
      const message: SyncMessage = {
        type: 'action',
        requestId: 'req_1',
        action: 'test:action',
        args: {},
      }

      expect(isActionRequest(message)).toBe(true)
    })
  })

  describe('isQueryResult', () => {
    it('should return true for QueryResult messages', () => {
      const message: SyncMessage = {
        type: 'queryResult',
        queryId: 'q_1',
        value: [],
        logLines: [],
      }

      expect(isQueryResult(message)).toBe(true)
    })
  })

  describe('isMutationResult', () => {
    it('should return true for MutationResult messages', () => {
      const message: SyncMessage = {
        type: 'mutationResult',
        requestId: 'req_1',
        success: true,
        value: null,
        logLines: [],
      }

      expect(isMutationResult(message)).toBe(true)
    })
  })

  describe('isActionResult', () => {
    it('should return true for ActionResult messages', () => {
      const message: SyncMessage = {
        type: 'actionResult',
        requestId: 'req_1',
        success: true,
        value: null,
        logLines: [],
      }

      expect(isActionResult(message)).toBe(true)
    })
  })

  describe('isErrorResponse', () => {
    it('should return true for ErrorResponse messages', () => {
      const message: SyncMessage = {
        type: 'error',
        error: 'Error',
        errorCode: 'ERROR',
      }

      expect(isErrorResponse(message)).toBe(true)
    })
  })

  describe('isPing', () => {
    it('should return true for Ping messages', () => {
      const message: SyncMessage = { type: 'ping' }

      expect(isPing(message)).toBe(true)
    })
  })

  describe('isPong', () => {
    it('should return true for Pong messages', () => {
      const message: SyncMessage = { type: 'pong' }

      expect(isPong(message)).toBe(true)
    })
  })

  describe('isAuthenticate', () => {
    it('should return true for Authenticate messages', () => {
      const message: SyncMessage = {
        type: 'authenticate',
        token: 'token',
      }

      expect(isAuthenticate(message)).toBe(true)
    })
  })

  describe('isAuthenticated', () => {
    it('should return true for Authenticated messages', () => {
      const message: SyncMessage = { type: 'authenticated' }

      expect(isAuthenticated(message)).toBe(true)
    })
  })

  describe('isModifyQuerySet', () => {
    it('should return true for ModifyQuerySet messages', () => {
      const message: SyncMessage = {
        type: 'modifyQuerySet',
        baseVersion: 1,
        newVersion: 2,
        modifications: [],
      }

      expect(isModifyQuerySet(message)).toBe(true)
    })
  })

  describe('isTransition', () => {
    it('should return true for Transition messages', () => {
      const message: SyncMessage = {
        type: 'transition',
        startVersion: 1,
        endVersion: 2,
        modifications: [],
      }

      expect(isTransition(message)).toBe(true)
    })
  })
})

// ============================================================================
// Error Types Tests
// ============================================================================

describe('Error Types', () => {
  describe('SyncProtocolError', () => {
    it('should be an instance of Error', () => {
      const error = new SyncProtocolError('Test error')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(SyncProtocolError)
    })

    it('should have name property set to SyncProtocolError', () => {
      const error = new SyncProtocolError('Test')

      expect(error.name).toBe('SyncProtocolError')
    })

    it('should have message property', () => {
      const error = new SyncProtocolError('Custom message')

      expect(error.message).toBe('Custom message')
    })
  })

  describe('MessageParseError', () => {
    it('should extend SyncProtocolError', () => {
      const error = new MessageParseError('Parse failed')

      expect(error).toBeInstanceOf(SyncProtocolError)
      expect(error).toBeInstanceOf(MessageParseError)
    })

    it('should have name property set to MessageParseError', () => {
      const error = new MessageParseError('Test')

      expect(error.name).toBe('MessageParseError')
    })

    it('should include raw input in error', () => {
      const error = new MessageParseError('Parse failed', 'invalid json')

      expect(error.rawInput).toBe('invalid json')
    })
  })

  describe('MessageSerializeError', () => {
    it('should extend SyncProtocolError', () => {
      const error = new MessageSerializeError('Serialize failed')

      expect(error).toBeInstanceOf(SyncProtocolError)
      expect(error).toBeInstanceOf(MessageSerializeError)
    })

    it('should have name property set to MessageSerializeError', () => {
      const error = new MessageSerializeError('Test')

      expect(error.name).toBe('MessageSerializeError')
    })

    it('should include message object in error', () => {
      const message = { type: 'test' }
      const error = new MessageSerializeError('Serialize failed', message)

      expect(error.message).toBe('Serialize failed')
    })
  })

  describe('InvalidMessageError', () => {
    it('should extend SyncProtocolError', () => {
      const error = new InvalidMessageError('Invalid message')

      expect(error).toBeInstanceOf(SyncProtocolError)
      expect(error).toBeInstanceOf(InvalidMessageError)
    })

    it('should have name property set to InvalidMessageError', () => {
      const error = new InvalidMessageError('Test')

      expect(error.name).toBe('InvalidMessageError')
    })

    it('should include validation details', () => {
      const error = new InvalidMessageError('Missing required field', {
        field: 'requestId',
        messageType: 'subscribe',
      })

      expect(error.details?.field).toBe('requestId')
      expect(error.details?.messageType).toBe('subscribe')
    })
  })
})

// ============================================================================
// Round-trip Tests
// ============================================================================

describe('Round-trip Serialization', () => {
  let protocol: SyncProtocol

  beforeEach(() => {
    protocol = new SyncProtocol()
  })

  it('should preserve QuerySubscription through serialization round-trip', () => {
    const original: QuerySubscription = {
      type: 'subscribe',
      requestId: 'req_123',
      queryId: 'q_456',
      query: 'users:list',
      args: { filter: 'active', limit: 50 },
    }

    const serialized = protocol.serialize(original)
    const deserialized = protocol.deserialize(serialized)

    expect(deserialized).toEqual(original)
  })

  it('should preserve MutationRequest through serialization round-trip', () => {
    const original: MutationRequest = {
      type: 'mutation',
      requestId: 'mut_789',
      mutation: 'users:create',
      args: {
        name: 'Test User',
        email: 'test@example.com',
        metadata: { role: 'admin', permissions: ['read', 'write'] },
      },
    }

    const serialized = protocol.serialize(original)
    const deserialized = protocol.deserialize(serialized)

    expect(deserialized).toEqual(original)
  })

  it('should preserve ActionRequest through serialization round-trip', () => {
    const original: ActionRequest = {
      type: 'action',
      requestId: 'act_101',
      action: 'email:sendBulk',
      args: {
        recipients: ['a@test.com', 'b@test.com'],
        template: 'welcome',
      },
    }

    const serialized = protocol.serialize(original)
    const deserialized = protocol.deserialize(serialized)

    expect(deserialized).toEqual(original)
  })

  it('should preserve QueryResult through serialization round-trip', () => {
    const original: QueryResult = {
      type: 'queryResult',
      queryId: 'q_1',
      value: [
        { _id: 'doc_1', name: 'Alice', createdAt: 1704067200000 },
        { _id: 'doc_2', name: 'Bob', createdAt: 1704067300000 },
      ],
      logLines: ['Query executed successfully'],
      journal: { version: 'v_100', timestamp: 1704067400000 },
    }

    const serialized = protocol.serialize(original)
    const deserialized = protocol.deserialize(serialized)

    expect(deserialized).toEqual(original)
  })

  it('should preserve MutationResult through serialization round-trip', () => {
    const original: MutationResult = {
      type: 'mutationResult',
      requestId: 'mut_1',
      success: true,
      value: { _id: 'new_doc_1', createdAt: 1704067200000 },
      logLines: ['Document created'],
    }

    const serialized = protocol.serialize(original)
    const deserialized = protocol.deserialize(serialized)

    expect(deserialized).toEqual(original)
  })

  it('should preserve ErrorResponse through serialization round-trip', () => {
    const original: ErrorResponse = {
      type: 'error',
      requestId: 'req_fail',
      error: 'Validation failed: email is required',
      errorCode: 'VALIDATION_ERROR',
      errorData: {
        field: 'email',
        constraint: 'required',
        received: undefined,
      },
    }

    const serialized = protocol.serialize(original)
    const deserialized = protocol.deserialize(serialized)

    // undefined is dropped in JSON serialization
    expect(deserialized.type).toBe(original.type)
    expect((deserialized as ErrorResponse).error).toBe(original.error)
    expect((deserialized as ErrorResponse).errorCode).toBe(original.errorCode)
  })

  it('should preserve null values in args', () => {
    const original: MutationRequest = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'data:update',
      args: { field1: null, field2: 'value', field3: null },
    }

    const serialized = protocol.serialize(original)
    const deserialized = protocol.deserialize(serialized)

    expect(deserialized).toEqual(original)
    if (isMutationRequest(deserialized)) {
      expect(deserialized.args.field1).toBeNull()
      expect(deserialized.args.field3).toBeNull()
    }
  })

  it('should preserve empty arrays and objects', () => {
    const original: QueryResult = {
      type: 'queryResult',
      queryId: 'q_1',
      value: [],
      logLines: [],
    }

    const serialized = protocol.serialize(original)
    const deserialized = protocol.deserialize(serialized)

    expect(deserialized).toEqual(original)
  })

  it('should preserve deeply nested structures', () => {
    const original: MutationRequest = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'complex:update',
      args: {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
                array: [1, [2, [3, [4]]]],
              },
            },
          },
        },
      },
    }

    const serialized = protocol.serialize(original)
    const deserialized = protocol.deserialize(serialized)

    expect(deserialized).toEqual(original)
  })
})

// ============================================================================
// Protocol Options and Configuration Tests
// ============================================================================

describe('SyncProtocol Options', () => {
  it('should accept options in constructor', () => {
    const protocol = new SyncProtocol({
      strictValidation: true,
    })

    expect(protocol).toBeInstanceOf(SyncProtocol)
  })

  it('should support lenient mode that allows unknown fields', () => {
    const protocol = new SyncProtocol({
      strictValidation: false,
    })

    const json = JSON.stringify({
      type: 'ping',
      unknownField: 'should be ignored',
    })

    const message = protocol.deserialize(json)

    expect(message.type).toBe('ping')
  })

  it('should reject unknown fields in strict mode', () => {
    const protocol = new SyncProtocol({
      strictValidation: true,
    })

    const json = JSON.stringify({
      type: 'ping',
      unknownField: 'should cause error',
    })

    expect(() => protocol.deserialize(json)).toThrow(InvalidMessageError)
  })
})

// ============================================================================
// Edge Cases and Special Scenarios
// ============================================================================

describe('Edge Cases', () => {
  let protocol: SyncProtocol

  beforeEach(() => {
    protocol = new SyncProtocol()
  })

  it('should handle empty string args', () => {
    const message: MutationRequest = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'test:mutation',
      args: { name: '' },
    }

    const serialized = protocol.serialize(message)
    const deserialized = protocol.deserialize(serialized) as MutationRequest

    expect(deserialized.args.name).toBe('')
  })

  it('should handle very long strings', () => {
    const longString = 'a'.repeat(100000)
    const message: MutationRequest = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'test:mutation',
      args: { content: longString },
    }

    const serialized = protocol.serialize(message)
    const deserialized = protocol.deserialize(serialized) as MutationRequest

    expect(deserialized.args.content).toBe(longString)
  })

  it('should handle unicode characters', () => {
    const message: MutationRequest = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'test:mutation',
      args: {
        text: 'Hello World',
        chinese: '你好世界',
        arabic: 'مرحبا بالعالم',
        emoji: '😀🎉🚀',
      },
    }

    const serialized = protocol.serialize(message)
    const deserialized = protocol.deserialize(serialized) as MutationRequest

    expect(deserialized.args.chinese).toBe('你好世界')
    expect(deserialized.args.emoji).toBe('😀🎉🚀')
  })

  it('should handle numeric edge cases', () => {
    const message: MutationRequest = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'test:mutation',
      args: {
        zero: 0,
        negative: -1,
        float: 3.14159,
        scientific: 1e10,
        maxSafeInt: Number.MAX_SAFE_INTEGER,
        minSafeInt: Number.MIN_SAFE_INTEGER,
      },
    }

    const serialized = protocol.serialize(message)
    const deserialized = protocol.deserialize(serialized) as MutationRequest

    expect(deserialized.args.zero).toBe(0)
    expect(deserialized.args.negative).toBe(-1)
    expect(deserialized.args.maxSafeInt).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('should handle boolean values correctly', () => {
    const message: MutationRequest = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'test:mutation',
      args: {
        trueValue: true,
        falseValue: false,
      },
    }

    const serialized = protocol.serialize(message)
    const deserialized = protocol.deserialize(serialized) as MutationRequest

    expect(deserialized.args.trueValue).toBe(true)
    expect(deserialized.args.falseValue).toBe(false)
  })

  it('should handle arrays with mixed types', () => {
    const message: QueryResult = {
      type: 'queryResult',
      queryId: 'q_1',
      value: [
        'string',
        123,
        true,
        null,
        { nested: 'object' },
        [1, 2, 3],
      ],
      logLines: [],
    }

    const serialized = protocol.serialize(message)
    const deserialized = protocol.deserialize(serialized) as QueryResult

    expect(deserialized.value).toEqual(message.value)
  })

  it('should handle query paths with special characters', () => {
    const message: QuerySubscription = {
      type: 'subscribe',
      requestId: 'req_1',
      queryId: 'q_1',
      query: 'my_module:get_user_by_email',
      args: {},
    }

    const serialized = protocol.serialize(message)
    const deserialized = protocol.deserialize(serialized) as QuerySubscription

    expect(deserialized.query).toBe('my_module:get_user_by_email')
  })

  it('should handle Infinity as special value', () => {
    const message: MutationRequest = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'test:mutation',
      args: { infinity: Infinity, negInfinity: -Infinity },
    }

    // JSON.stringify converts Infinity to null
    const serialized = protocol.serialize(message)
    const deserialized = protocol.deserialize(serialized) as MutationRequest

    expect(deserialized.args.infinity).toBeNull()
    expect(deserialized.args.negInfinity).toBeNull()
  })

  it('should handle NaN as special value', () => {
    const message: MutationRequest = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'test:mutation',
      args: { nan: NaN },
    }

    // JSON.stringify converts NaN to null
    const serialized = protocol.serialize(message)
    const deserialized = protocol.deserialize(serialized) as MutationRequest

    expect(deserialized.args.nan).toBeNull()
  })

  it('should handle Date objects in args', () => {
    const date = new Date('2024-01-01T00:00:00Z')
    const message: MutationRequest = {
      type: 'mutation',
      requestId: 'req_1',
      mutation: 'test:mutation',
      args: { date },
    }

    const serialized = protocol.serialize(message)
    const deserialized = protocol.deserialize(serialized) as MutationRequest

    // Date is serialized as ISO string
    expect(deserialized.args.date).toBe('2024-01-01T00:00:00.000Z')
  })
})
