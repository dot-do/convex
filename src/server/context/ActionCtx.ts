/**
 * ActionCtx Implementation for Layer 4
 *
 * Provides the context object for action functions in Convex.
 * Actions can perform arbitrary operations including external API calls.
 *
 * ActionCtx provides:
 * - auth: Auth for checking authentication
 * - storage: StorageReader for file access
 * - scheduler: Scheduler for scheduling functions
 * - runQuery: Execute query functions
 * - runMutation: Execute mutation functions
 * - runAction: Execute other actions
 * - vectorSearch: Perform vector similarity search
 */

import type {
  ActionCtx,
  Auth,
  StorageReader,
  Scheduler,
} from '../context'
import type {
  FunctionReference,
  Id,
} from '../../types'

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an ActionCtx instance.
 *
 * This factory function creates a context object with all the required
 * properties and methods for action functions.
 *
 * @param auth - Auth instance for authentication
 * @param storage - StorageReader instance for file storage
 * @param scheduler - Scheduler instance for delayed execution
 * @param runQuery - Function to execute query functions
 * @param runMutation - Function to execute mutation functions
 * @param runAction - Function to execute other action functions
 * @param vectorSearch - Function to perform vector search
 * @returns ActionCtx instance
 *
 * @example
 * ```typescript
 * const ctx = createActionCtx(
 *   auth,
 *   storage,
 *   scheduler,
 *   queryRunner,
 *   mutationRunner,
 *   actionRunner,
 *   vectorSearchRunner
 * );
 * // Use in action handler
 * const result = await actionHandler(ctx, args);
 * ```
 */
export function createActionCtx(
  auth: Auth,
  storage: StorageReader,
  scheduler: Scheduler,
  runQuery: <F extends FunctionReference<'query'>>(
    query: F,
    args: F['_args']
  ) => Promise<F['_returns']>,
  runMutation: <F extends FunctionReference<'mutation'>>(
    mutation: F,
    args: F['_args']
  ) => Promise<F['_returns']>,
  runAction: <F extends FunctionReference<'action'>>(
    action: F,
    args: F['_args']
  ) => Promise<F['_returns']>,
  vectorSearch: <TableName extends string>(
    tableName: TableName,
    indexName: string,
    query: {
      vector: number[]
      limit?: number
      filter?: (q: unknown) => unknown
    }
  ) => Promise<Array<{ _id: Id<TableName>; _score: number }>>
): ActionCtx {
  return {
    auth,
    storage,
    scheduler,
    runQuery,
    runMutation,
    runAction,
    vectorSearch,
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate that a context object implements the ActionCtx interface.
 *
 * @param ctx - The context object to validate
 * @returns True if valid, throws error otherwise
 */
export function validateActionCtx(ctx: unknown): ctx is ActionCtx {
  if (!ctx || typeof ctx !== 'object') {
    throw new Error('ActionCtx must be an object')
  }

  const actionCtx = ctx as Record<string, unknown>

  if (!actionCtx.auth || typeof actionCtx.auth !== 'object') {
    throw new Error('ActionCtx.auth is required and must be an Auth instance')
  }

  if (!actionCtx.storage || typeof actionCtx.storage !== 'object') {
    throw new Error('ActionCtx.storage is required and must be a StorageReader')
  }

  if (!actionCtx.scheduler || typeof actionCtx.scheduler !== 'object') {
    throw new Error('ActionCtx.scheduler is required and must be a Scheduler')
  }

  if (typeof actionCtx.runQuery !== 'function') {
    throw new Error('ActionCtx.runQuery is required and must be a function')
  }

  if (typeof actionCtx.runMutation !== 'function') {
    throw new Error('ActionCtx.runMutation is required and must be a function')
  }

  if (typeof actionCtx.runAction !== 'function') {
    throw new Error('ActionCtx.runAction is required and must be a function')
  }

  if (typeof actionCtx.vectorSearch !== 'function') {
    throw new Error('ActionCtx.vectorSearch is required and must be a function')
  }

  return true
}

/**
 * Ensure all required methods are present on Auth.
 *
 * @param auth - The auth object to validate
 */
export function validateAuth(auth: unknown): auth is Auth {
  if (!auth || typeof auth !== 'object') {
    throw new Error('Auth must be an object')
  }

  const authObj = auth as Record<string, unknown>

  if (typeof authObj.getUserIdentity !== 'function') {
    throw new Error('Auth.getUserIdentity must be a function')
  }

  return true
}

/**
 * Ensure all required methods are present on StorageReader.
 *
 * @param storage - The storage object to validate
 */
export function validateStorageReader(storage: unknown): storage is StorageReader {
  if (!storage || typeof storage !== 'object') {
    throw new Error('StorageReader must be an object')
  }

  const storageReader = storage as Record<string, unknown>

  if (typeof storageReader.getUrl !== 'function') {
    throw new Error('StorageReader.getUrl must be a function')
  }

  if (typeof storageReader.getMetadata !== 'function') {
    throw new Error('StorageReader.getMetadata must be a function')
  }

  return true
}

/**
 * Ensure all required methods are present on Scheduler.
 *
 * @param scheduler - The scheduler object to validate
 */
export function validateScheduler(scheduler: unknown): scheduler is Scheduler {
  if (!scheduler || typeof scheduler !== 'object') {
    throw new Error('Scheduler must be an object')
  }

  const schedulerObj = scheduler as Record<string, unknown>

  if (typeof schedulerObj.runAfter !== 'function') {
    throw new Error('Scheduler.runAfter must be a function')
  }

  if (typeof schedulerObj.runAt !== 'function') {
    throw new Error('Scheduler.runAt must be a function')
  }

  if (typeof schedulerObj.cancel !== 'function') {
    throw new Error('Scheduler.cancel must be a function')
  }

  return true
}

/**
 * Create a validated ActionCtx instance.
 *
 * This function creates an ActionCtx and validates all components
 * to ensure they implement the required interfaces.
 *
 * @param auth - Auth instance
 * @param storage - StorageReader instance
 * @param scheduler - Scheduler instance
 * @param runQuery - Function to execute query functions
 * @param runMutation - Function to execute mutation functions
 * @param runAction - Function to execute other action functions
 * @param vectorSearch - Function to perform vector search
 * @returns Validated ActionCtx instance
 * @throws Error if any component is invalid
 */
export function createValidatedActionCtx(
  auth: Auth,
  storage: StorageReader,
  scheduler: Scheduler,
  runQuery: <F extends FunctionReference<'query'>>(
    query: F,
    args: F['_args']
  ) => Promise<F['_returns']>,
  runMutation: <F extends FunctionReference<'mutation'>>(
    mutation: F,
    args: F['_args']
  ) => Promise<F['_returns']>,
  runAction: <F extends FunctionReference<'action'>>(
    action: F,
    args: F['_args']
  ) => Promise<F['_returns']>,
  vectorSearch: <TableName extends string>(
    tableName: TableName,
    indexName: string,
    query: {
      vector: number[]
      limit?: number
      filter?: (q: unknown) => unknown
    }
  ) => Promise<Array<{ _id: Id<TableName>; _score: number }>>
): ActionCtx {
  // Validate all components
  validateAuth(auth)
  validateStorageReader(storage)
  validateScheduler(scheduler)

  // Validate function arguments
  if (typeof runQuery !== 'function') {
    throw new Error('runQuery must be a function')
  }
  if (typeof runMutation !== 'function') {
    throw new Error('runMutation must be a function')
  }
  if (typeof runAction !== 'function') {
    throw new Error('runAction must be a function')
  }
  if (typeof vectorSearch !== 'function') {
    throw new Error('vectorSearch must be a function')
  }

  // Create and return the context
  return createActionCtx(
    auth,
    storage,
    scheduler,
    runQuery,
    runMutation,
    runAction,
    vectorSearch
  )
}
