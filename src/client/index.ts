/**
 * Client SDK exports for convex.do
 *
 * These are used when building client applications that connect to convex.do.
 * 100% compatible with Convex's convex/browser exports.
 */

export { ConvexClient } from './ConvexClient'
export { ConvexHttpClient } from './ConvexHttpClient'

// Enhanced HTTP client with batching, retry, and improved error handling
export {
  ConvexHttpClient as EnhancedHttpClient,
  ConvexError as HttpConvexError,
} from './http'
export type {
  HttpClientOptions as EnhancedHttpClientOptions,
  RetryBackoff,
} from './http'
export {
  AuthTokenManager,
  AuthState,
  AuthTokenError,
  TokenExpiredError,
  TokenInvalidError,
  TokenRefreshError,
  parseJWT,
  isTokenExpired,
  getTokenExpiryTime,
  createAuthHeader,
  createAuthMessage,
} from './auth'

export type {
  ClientOptions,
  SubscriptionOptions,
  SubscriptionCallback,
  SubscriptionHandle,
} from './ConvexClient'

export type {
  HttpClientOptions,
} from './ConvexHttpClient'

export type {
  AuthTokenManagerOptions,
  AuthChangeCallback,
  AuthChangeInfo,
  TokenClaims,
  RefreshHandler,
  AuthError,
} from './auth'

// Serialization exports
export {
  serializeArgs,
  deserializeResult,
  serializeMessage,
  deserializeMessage,
  serializeValue,
  deserializeValue,
  serializeInt64,
  deserializeInt64,
  serializeBytes,
  deserializeBytes,
  serializeDate,
  deserializeDate,
  serializeId,
  deserializeId,
  serializeToBinary,
  deserializeFromBinary,
  validateWithSchema,
  SerializationError,
  DeserializationError,
  SchemaValidationError,
} from './serialization'

export type {
  SerializationOptions,
  ConvexValue,
  SerializedValue,
  SchemaType,
} from './serialization'

// Error handling exports
export {
  // Error classes
  BaseConvexError,
  ConvexError,
  NetworkError,
  AuthenticationError,
  ValidationError,
  ServerError,
  TimeoutError,

  // Error codes
  ErrorCode,

  // Serialization
  serializeError,
  deserializeError,

  // Wrapping
  wrapError,

  // Context utilities
  createErrorContext,
  addErrorContext,

  // Detection utilities
  isRetryableError,
  getUserFriendlyMessage,

  // Logging utilities
  formatErrorForLogging,
  createErrorLogger,

  // Type guards
  isBaseConvexError,
  isConvexError,
  isNetworkError,
  isAuthenticationError,
  isValidationError,
  isServerError,
  isTimeoutError,
} from './errors'

export type {
  ErrorContext,
  FieldError,
  BaseConvexErrorOptions,
  NetworkErrorOptions,
  AuthenticationErrorOptions,
  ValidationErrorOptions,
  ServerErrorOptions,
  TimeoutErrorOptions,
  SerializedError,
  WrapErrorOptions,
  FormatErrorOptions,
  LogLevel,
  ErrorLoggerOptions,
  ErrorLogger,
} from './errors'

// Request batching exports
export {
  RequestBatcher,
  BatchError,
  RequestCancelledError,
  BatchTimeoutError,
} from './batching'

export type {
  FunctionType,
  TransportType,
  BatchRequest,
  BatchResult,
  BatchExecutor,
  RetryConfig,
  BatcherOptions,
  AddRequestOptions,
  BatchMetrics,
  BatcherEvents,
  BatchStartEvent,
  BatchCompleteEvent,
  BatchErrorEvent,
  RequestCancelledEvent,
  CancellablePromise,
} from './batching'

// Subscription management exports
export {
  ClientSubscription,
  ClientSubscriptionManager,
  SubscriptionError,
  SubscriptionStatus,
} from './subscriptions'

export type {
  QueryRef,
  SubscriptionPriority,
  SubscriptionOptions as ClientSubscriptionOptions,
  SubscriptionEventHandlers,
  UpdateOptions,
  SubscriptionFilter,
  PendingResubscription,
  ClientSubscriptionJSON,
  ClientSubscriptionManagerJSON,
  ClientSubscriptionManagerOptions,
} from './subscriptions'

// Re-export types commonly used by clients
export type {
  Id,
  FunctionReference,
} from '../types'
