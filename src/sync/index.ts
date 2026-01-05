/**
 * Sync Module
 *
 * Provides synchronization utilities for Convex including:
 * - Subscription state management
 * - Conflict resolution
 * - Reconnection handling
 */

export {
  ConflictResolver,
  type ConflictStrategy,
  type ConflictType,
  type ChangeType,
  type FieldConflict,
  type Change,
  type Conflict,
  type ResolvedChange,
  type ConflictHandler,
  type CustomResolver,
  type FieldStrategy,
  type ConflictListener,
  type ConflictResolverOptions,
} from './conflict'

export {
  SubscriptionManager,
  Subscription,
  SubscriptionState,
  SubscriptionError,
  type SubscriptionCallback,
  type SubscriptionOptions,
  type SubscriptionManagerOptions,
  type SubscriptionFilter,
  type UpdateOptions,
  type SubscriptionJSON,
  type SubscriptionManagerJSON,
  type ErrorCallback,
} from './subscription'
