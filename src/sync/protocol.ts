/**
 * Real-Time Sync Protocol
 *
 * Defines the message types and protocol for client-server communication
 * in the convex.do real-time sync system.
 */

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error class for sync protocol errors.
 */
export class SyncProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncProtocolError'
    Object.setPrototypeOf(this, SyncProtocolError.prototype)
  }
}

/**
 * Error thrown when a message cannot be parsed.
 */
export class MessageParseError extends SyncProtocolError {
  rawInput?: string

  constructor(message: string, rawInput?: string) {
    super(message)
    this.name = 'MessageParseError'
    this.rawInput = rawInput
    Object.setPrototypeOf(this, MessageParseError.prototype)
  }
}

/**
 * Error thrown when a message cannot be serialized.
 */
export class MessageSerializeError extends SyncProtocolError {
  messageObject?: unknown

  constructor(message: string, messageObject?: unknown) {
    super(message)
    this.name = 'MessageSerializeError'
    this.messageObject = messageObject
    Object.setPrototypeOf(this, MessageSerializeError.prototype)
  }
}

/**
 * Error thrown when a message is invalid (missing fields, wrong types, etc.).
 */
export class InvalidMessageError extends SyncProtocolError {
  details?: {
    field?: string
    messageType?: string
    [key: string]: unknown
  }

  constructor(message: string, details?: { field?: string; messageType?: string; [key: string]: unknown }) {
    super(message)
    this.name = 'InvalidMessageError'
    this.details = details
    Object.setPrototypeOf(this, InvalidMessageError.prototype)
  }
}

// ============================================================================
// Journal Types
// ============================================================================

/**
 * Journal information for optimistic updates in query subscriptions.
 */
export interface QueryJournal {
  base: string
  mutations: string[]
}

/**
 * Journal information in query results for versioning.
 */
export interface ResultJournal {
  version: string
  timestamp: number
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Subscribe to a query for real-time updates.
 */
export interface QuerySubscription {
  type: 'subscribe'
  requestId: string
  queryId: string
  query: string
  args: Record<string, unknown>
  journal?: QueryJournal
}

/**
 * Unsubscribe from a query.
 */
export interface QueryUnsubscribe {
  type: 'unsubscribe'
  queryId: string
}

/**
 * Request to execute a mutation.
 */
export interface MutationRequest {
  type: 'mutation'
  requestId: string
  mutation: string
  args: Record<string, unknown>
}

/**
 * Request to execute an action.
 */
export interface ActionRequest {
  type: 'action'
  requestId: string
  action: string
  args: Record<string, unknown>
}

/**
 * Result of a query subscription.
 */
export interface QueryResult {
  type: 'queryResult'
  queryId: string
  value: unknown
  logLines: string[]
  journal?: ResultJournal
}

/**
 * Result of a mutation execution.
 */
export interface MutationResult {
  type: 'mutationResult'
  requestId: string
  success: boolean
  value: unknown
  logLines: string[]
  error?: string
  errorData?: unknown
}

/**
 * Result of an action execution.
 */
export interface ActionResult {
  type: 'actionResult'
  requestId: string
  success: boolean
  value: unknown
  logLines: string[]
  error?: string
  errorData?: unknown
}

/**
 * Error response from the server.
 */
export interface ErrorResponse {
  type: 'error'
  requestId?: string
  error: string
  errorCode: string
  errorData?: unknown
}

/**
 * Ping message for heartbeat.
 */
export interface Ping {
  type: 'ping'
}

/**
 * Pong message for heartbeat response.
 */
export interface Pong {
  type: 'pong'
}

/**
 * Authentication request message.
 */
export interface Authenticate {
  type: 'authenticate'
  token: string
  baseVersion?: number
}

/**
 * Authentication success response.
 */
export interface Authenticated {
  type: 'authenticated'
  identity?: {
    subject: string
    issuer: string
  }
}

/**
 * Modification to the query set.
 */
export interface QuerySetModification {
  type: 'add' | 'remove'
  queryId: string
  query?: string
  args?: Record<string, unknown>
}

/**
 * Modify the active query set.
 */
export interface ModifyQuerySet {
  type: 'modifyQuerySet'
  baseVersion: number
  newVersion: number
  modifications: QuerySetModification[]
}

/**
 * Query result modification in a transition.
 */
export interface QueryResultModification {
  queryId: string
  value: unknown
  logLines: string[]
}

/**
 * Transition message with query result updates.
 */
export interface Transition {
  type: 'transition'
  startVersion: number
  endVersion: number
  modifications: QueryResultModification[]
}

/**
 * Generic function result type.
 */
export type FunctionResult = QueryResult | MutationResult | ActionResult

/**
 * Union of all sync message types.
 */
export type SyncMessage =
  | QuerySubscription
  | QueryUnsubscribe
  | MutationRequest
  | ActionRequest
  | QueryResult
  | MutationResult
  | ActionResult
  | ErrorResponse
  | Ping
  | Pong
  | Authenticate
  | Authenticated
  | ModifyQuerySet
  | Transition

// ============================================================================
// Type Guards
// ============================================================================

export function isQuerySubscription(message: SyncMessage): message is QuerySubscription {
  return message.type === 'subscribe'
}

export function isQueryUnsubscribe(message: SyncMessage): message is QueryUnsubscribe {
  return message.type === 'unsubscribe'
}

export function isMutationRequest(message: SyncMessage): message is MutationRequest {
  return message.type === 'mutation'
}

export function isActionRequest(message: SyncMessage): message is ActionRequest {
  return message.type === 'action'
}

export function isQueryResult(message: SyncMessage): message is QueryResult {
  return message.type === 'queryResult'
}

export function isMutationResult(message: SyncMessage): message is MutationResult {
  return message.type === 'mutationResult'
}

export function isActionResult(message: SyncMessage): message is ActionResult {
  return message.type === 'actionResult'
}

export function isErrorResponse(message: SyncMessage): message is ErrorResponse {
  return message.type === 'error'
}

export function isPing(message: SyncMessage): message is Ping {
  return message.type === 'ping'
}

export function isPong(message: SyncMessage): message is Pong {
  return message.type === 'pong'
}

export function isAuthenticate(message: SyncMessage): message is Authenticate {
  return message.type === 'authenticate'
}

export function isAuthenticated(message: SyncMessage): message is Authenticated {
  return message.type === 'authenticated'
}

export function isModifyQuerySet(message: SyncMessage): message is ModifyQuerySet {
  return message.type === 'modifyQuerySet'
}

export function isTransition(message: SyncMessage): message is Transition {
  return message.type === 'transition'
}

// ============================================================================
// Request ID Generation
// ============================================================================

let requestIdCounter = 0

/**
 * Generate a unique request ID.
 */
export function createRequestId(prefix: string = 'req'): string {
  requestIdCounter++
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}_${timestamp}_${requestIdCounter}_${random}`
}

// ============================================================================
// Message Factory Functions
// ============================================================================

export interface CreateQuerySubscriptionOptions {
  requestId?: string
  queryId?: string
  query: string
  args: Record<string, unknown>
  journal?: QueryJournal
}

export function createQuerySubscription(options: CreateQuerySubscriptionOptions): QuerySubscription {
  return {
    type: 'subscribe',
    requestId: options.requestId ?? createRequestId('sub'),
    queryId: options.queryId ?? createRequestId('query'),
    query: options.query,
    args: options.args,
    journal: options.journal,
  }
}

export interface CreateMutationRequestOptions {
  requestId?: string
  mutation: string
  args: Record<string, unknown>
}

export function createMutationRequest(options: CreateMutationRequestOptions): MutationRequest {
  return {
    type: 'mutation',
    requestId: options.requestId ?? createRequestId('mut'),
    mutation: options.mutation,
    args: options.args,
  }
}

export interface CreateActionRequestOptions {
  requestId?: string
  action: string
  args: Record<string, unknown>
}

export function createActionRequest(options: CreateActionRequestOptions): ActionRequest {
  return {
    type: 'action',
    requestId: options.requestId ?? createRequestId('act'),
    action: options.action,
    args: options.args,
  }
}

export function createPing(): Ping {
  return { type: 'ping' }
}

export function createPong(): Pong {
  return { type: 'pong' }
}

export interface CreateErrorResponseOptions {
  requestId?: string
  error: string
  errorCode: string
  errorData?: unknown
}

export function createErrorResponse(options: CreateErrorResponseOptions): ErrorResponse {
  const response: ErrorResponse = {
    type: 'error',
    error: options.error,
    errorCode: options.errorCode,
  }
  if (options.requestId !== undefined) {
    response.requestId = options.requestId
  }
  if (options.errorData !== undefined) {
    response.errorData = options.errorData
  }
  return response
}

export interface CreateQueryResultOptions {
  queryId: string
  value: unknown
  logLines?: string[]
  journal?: ResultJournal
}

export function createQueryResult(options: CreateQueryResultOptions): QueryResult {
  return {
    type: 'queryResult',
    queryId: options.queryId,
    value: options.value,
    logLines: options.logLines ?? [],
    journal: options.journal,
  }
}

export interface CreateMutationResultOptions {
  requestId: string
  success: boolean
  value: unknown
  logLines?: string[]
  error?: string
  errorData?: unknown
}

export function createMutationResult(options: CreateMutationResultOptions): MutationResult {
  const result: MutationResult = {
    type: 'mutationResult',
    requestId: options.requestId,
    success: options.success,
    value: options.value,
    logLines: options.logLines ?? [],
  }
  if (options.error !== undefined) {
    result.error = options.error
  }
  if (options.errorData !== undefined) {
    result.errorData = options.errorData
  }
  return result
}

export interface CreateActionResultOptions {
  requestId: string
  success: boolean
  value: unknown
  logLines?: string[]
  error?: string
  errorData?: unknown
}

export function createActionResult(options: CreateActionResultOptions): ActionResult {
  const result: ActionResult = {
    type: 'actionResult',
    requestId: options.requestId,
    success: options.success,
    value: options.value,
    logLines: options.logLines ?? [],
  }
  if (options.error !== undefined) {
    result.error = options.error
  }
  if (options.errorData !== undefined) {
    result.errorData = options.errorData
  }
  return result
}

export interface CreateAuthenticateOptions {
  token: string
  baseVersion?: number
}

export function createAuthenticate(options: CreateAuthenticateOptions): Authenticate {
  const message: Authenticate = {
    type: 'authenticate',
    token: options.token,
  }
  if (options.baseVersion !== undefined) {
    message.baseVersion = options.baseVersion
  }
  return message
}

export interface CreateModifyQuerySetOptions {
  baseVersion: number
  newVersion: number
  modifications: QuerySetModification[]
}

export function createModifyQuerySet(options: CreateModifyQuerySetOptions): ModifyQuerySet {
  return {
    type: 'modifyQuerySet',
    baseVersion: options.baseVersion,
    newVersion: options.newVersion,
    modifications: options.modifications,
  }
}

export interface CreateTransitionOptions {
  startVersion: number
  endVersion: number
  modifications: QueryResultModification[]
}

export function createTransition(options: CreateTransitionOptions): Transition {
  return {
    type: 'transition',
    startVersion: options.startVersion,
    endVersion: options.endVersion,
    modifications: options.modifications,
  }
}

// ============================================================================
// SyncProtocol Class
// ============================================================================

/**
 * Valid message types in the sync protocol.
 */
const VALID_MESSAGE_TYPES = new Set([
  'subscribe',
  'unsubscribe',
  'mutation',
  'action',
  'queryResult',
  'mutationResult',
  'actionResult',
  'error',
  'ping',
  'pong',
  'authenticate',
  'authenticated',
  'modifyQuerySet',
  'transition',
])

/**
 * Required fields for each message type.
 */
const MESSAGE_REQUIRED_FIELDS: Record<string, string[]> = {
  subscribe: ['requestId', 'queryId', 'query', 'args'],
  unsubscribe: ['queryId'],
  mutation: ['requestId', 'mutation', 'args'],
  action: ['requestId', 'action', 'args'],
  queryResult: ['queryId', 'value', 'logLines'],
  mutationResult: ['requestId', 'success', 'value', 'logLines'],
  actionResult: ['requestId', 'success', 'value', 'logLines'],
  error: ['error', 'errorCode'],
  ping: [],
  pong: [],
  authenticate: ['token'],
  authenticated: [],
  modifyQuerySet: ['baseVersion', 'newVersion', 'modifications'],
  transition: ['startVersion', 'endVersion', 'modifications'],
}

/**
 * Expected field types for validation.
 */
const MESSAGE_FIELD_TYPES: Record<string, Record<string, string>> = {
  subscribe: {
    requestId: 'string',
    queryId: 'string',
    query: 'string',
    args: 'object',
  },
  unsubscribe: {
    queryId: 'string',
  },
  mutation: {
    requestId: 'string',
    mutation: 'string',
    args: 'object',
  },
  action: {
    requestId: 'string',
    action: 'string',
    args: 'object',
  },
  queryResult: {
    queryId: 'string',
    logLines: 'array',
  },
  mutationResult: {
    requestId: 'string',
    success: 'boolean',
    logLines: 'array',
  },
  actionResult: {
    requestId: 'string',
    success: 'boolean',
    logLines: 'array',
  },
  error: {
    error: 'string',
    errorCode: 'string',
  },
  authenticate: {
    token: 'string',
  },
  modifyQuerySet: {
    baseVersion: 'number',
    newVersion: 'number',
    modifications: 'array',
  },
  transition: {
    startVersion: 'number',
    endVersion: 'number',
    modifications: 'array',
  },
}

export interface SyncProtocolOptions {
  /**
   * If true, reject messages with unknown fields.
   * If false, ignore unknown fields.
   * Default: false
   */
  strictValidation?: boolean
}

/**
 * Protocol handler for serializing and deserializing sync messages.
 */
export class SyncProtocol {
  private options: Required<SyncProtocolOptions>

  constructor(options: SyncProtocolOptions = {}) {
    this.options = {
      strictValidation: options.strictValidation ?? false,
    }
  }

  /**
   * Serialize a sync message to a JSON string.
   */
  serialize(message: SyncMessage): string {
    try {
      // Handle BigInt serialization
      const replacer = (_key: string, value: unknown): unknown => {
        if (typeof value === 'bigint') {
          return value.toString()
        }
        return value
      }

      return JSON.stringify(message, replacer)
    } catch (error) {
      if (error instanceof TypeError && (error.message.includes('circular') || error.message.includes('cyclic'))) {
        throw new MessageSerializeError('Cannot serialize message with circular reference', message)
      }
      throw new MessageSerializeError(
        `Failed to serialize message: ${error instanceof Error ? error.message : String(error)}`,
        message
      )
    }
  }

  /**
   * Deserialize a JSON string to a sync message.
   */
  deserialize(input: string): SyncMessage {
    let parsed: unknown

    // Parse JSON
    try {
      parsed = JSON.parse(input)
    } catch (error) {
      throw new MessageParseError(
        `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
        input
      )
    }

    // Validate it's an object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new InvalidMessageError('Message must be an object', {
        messageType: 'unknown',
      })
    }

    const obj = parsed as Record<string, unknown>

    // Validate type field
    if (!('type' in obj) || typeof obj.type !== 'string') {
      throw new InvalidMessageError('Message must have a string "type" field', {
        field: 'type',
      })
    }

    const messageType = obj.type

    // Validate message type is known
    if (!VALID_MESSAGE_TYPES.has(messageType)) {
      throw new InvalidMessageError(`Unknown message type: ${messageType}`, {
        messageType,
      })
    }

    // Validate required fields
    const requiredFields = MESSAGE_REQUIRED_FIELDS[messageType] ?? []
    for (const field of requiredFields) {
      if (!(field in obj)) {
        throw new InvalidMessageError(`Missing required field: ${field}`, {
          field,
          messageType,
        })
      }
    }

    // Validate field types
    const fieldTypes = MESSAGE_FIELD_TYPES[messageType] ?? {}
    for (const [field, expectedType] of Object.entries(fieldTypes)) {
      if (field in obj) {
        const value = obj[field]
        if (!this.isValidType(value, expectedType)) {
          throw new InvalidMessageError(`Invalid type for field "${field}": expected ${expectedType}`, {
            field,
            messageType,
          })
        }
      }
    }

    // Strict validation: check for unknown fields
    if (this.options.strictValidation) {
      const knownFields = new Set(['type', ...requiredFields, ...Object.keys(fieldTypes)])
      // Add optional fields based on message type
      const optionalFields = this.getOptionalFields(messageType)
      for (const field of optionalFields) {
        knownFields.add(field)
      }

      for (const field of Object.keys(obj)) {
        if (!knownFields.has(field)) {
          throw new InvalidMessageError(`Unknown field: ${field}`, {
            field,
            messageType,
          })
        }
      }
    }

    return obj as SyncMessage
  }

  /**
   * Check if a value matches the expected type.
   */
  private isValidType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number'
      case 'boolean':
        return typeof value === 'boolean'
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      case 'array':
        return Array.isArray(value)
      default:
        return true
    }
  }

  /**
   * Get optional fields for a message type.
   */
  private getOptionalFields(messageType: string): string[] {
    switch (messageType) {
      case 'subscribe':
        return ['journal']
      case 'queryResult':
        return ['journal']
      case 'mutationResult':
        return ['error', 'errorData']
      case 'actionResult':
        return ['error', 'errorData']
      case 'error':
        return ['requestId', 'errorData']
      case 'authenticate':
        return ['baseVersion']
      case 'authenticated':
        return ['identity']
      default:
        return []
    }
  }
}
