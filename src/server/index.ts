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

// Export database implementations
export { DatabaseReader, InMemoryStorage } from './database/DatabaseReader'
export type { StorageBackend, QueryOptions } from './database/DatabaseReader'
export { DatabaseWriter } from './database/DatabaseWriter'

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

// Export context implementations
export {
  QueryCtxImpl,
  DatabaseReaderImpl,
  AuthImpl,
  StorageReaderImpl,
  createQueryCtx,
  createDefaultQueryCtx,
} from './context'

// Export MutationCtx utilities
export {
  createMutationCtx,
  validateMutationCtx,
  validateDatabaseWriter,
  validateStorageWriter,
  validateScheduler,
  validateAuth,
  createValidatedMutationCtx,
} from './context/MutationCtx'

// Export ActionCtx utilities
export {
  createActionCtx,
  validateActionCtx,
  validateAuth as validateActionAuth,
  validateStorageReader,
  validateScheduler as validateActionScheduler,
  createValidatedActionCtx,
} from './context/ActionCtx'

// Export query builder types
export type {
  QueryBuilder,
  QueryInitializer,
  IndexRange,
  IndexRangeBuilder,
  FilterBuilder,
  FilterExpression,
  SearchFilterBuilder,
} from './database/QueryBuilder'

export { QueryBuilderImpl } from './database/QueryBuilder'
