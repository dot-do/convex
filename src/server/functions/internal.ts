/**
 * Internal Function Builders
 *
 * Creates internal query, mutation, and action functions that are NOT
 * exposed via HTTP/public API and can only be called from other Convex functions.
 *
 * These are re-exported from the existing implementations in query.ts,
 * mutation.ts, and action.ts for convenience.
 */

// Re-export internal function builders from their respective modules
export { internalQuery } from '../query'
export { internalMutation } from '../mutation'
export { internalAction } from '../action'

// Re-export types for convenience
export type { RegisteredQuery, QueryConfig, QueryArgs, QueryReturns } from '../query'
export type { RegisteredMutation, MutationConfig, MutationArgs, MutationReturns } from '../mutation'
export type { RegisteredAction, ActionConfig, ActionArgs, ActionReturns } from '../action'
