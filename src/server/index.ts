/**
 * Server-side exports for convex.do
 *
 * These are used when writing Convex functions (queries, mutations, actions).
 * 100% compatible with Convex's convex/server exports.
 */

// Re-export validators
export { v } from '../values'
export type { Validator, Infer, ArgsValidator, InferArgs } from '../values'

// Re-export types
export type {
  Id,
  GenericId,
  Doc,
  SystemFields,
  FunctionType,
  FunctionVisibility,
  FunctionReference,
  ConvexValue,
  ConvexError,
  UserIdentity,
  PaginationOptions,
  PaginationResult,
  ScheduledFunctionId,
  StorageId,
} from '../types'

// Export function builders
export { query, internalQuery } from './query'
export { mutation, internalMutation } from './mutation'
export { action, internalAction } from './action'
export { httpRouter, httpAction, HttpRouter } from './httpRouter'

// Export schema builders
export { defineSchema, defineTable } from './schema'

// Export context types
export type {
  QueryCtx,
  MutationCtx,
  ActionCtx,
  DatabaseReader,
  DatabaseWriter,
  Auth,
  Scheduler,
  StorageReader,
  StorageWriter,
} from './context'

// Export query builder types
export type {
  QueryBuilder,
  QueryInitializer,
  IndexRange,
  IndexRangeBuilder,
} from './queryBuilder'
