/**
 * Client SDK exports for convex.do
 *
 * These are used when building client applications that connect to convex.do.
 * 100% compatible with Convex's convex/browser exports.
 */

export { ConvexClient } from './ConvexClient'
export { ConvexHttpClient } from './ConvexHttpClient'

export type {
  ClientOptions,
  SubscriptionOptions,
  SubscriptionCallback,
  SubscriptionHandle,
} from './ConvexClient'

export type {
  HttpClientOptions,
} from './ConvexHttpClient'

// Re-export types commonly used by clients
export type {
  Id,
  FunctionReference,
  ConvexError,
} from '../types'
