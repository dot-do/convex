/**
 * MutationCtx Implementation
 *
 * Concrete implementation of the MutationCtx context object.
 * This provides the context passed to mutation function handlers.
 *
 * MutationCtx provides:
 * - db: DatabaseWriter (extends DatabaseReader with write operations)
 * - auth: Auth for checking authentication
 * - storage: StorageWriter for file access
 * - scheduler: Scheduler for scheduling functions
 */

import type {
  MutationCtx,
  DatabaseWriter,
  Auth,
  StorageWriter,
  Scheduler,
} from '../context'

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a MutationCtx instance.
 *
 * This factory function creates a context object with all the required
 * properties for mutation functions.
 *
 * @param db - DatabaseWriter instance for database operations
 * @param auth - Auth instance for authentication
 * @param storage - StorageWriter instance for file storage
 * @param scheduler - Scheduler instance for delayed execution
 * @returns MutationCtx instance
 *
 * @example
 * ```typescript
 * const ctx = createMutationCtx(db, auth, storage, scheduler);
 * // Use in mutation handler
 * const result = await mutationHandler(ctx, args);
 * ```
 */
export function createMutationCtx(
  db: DatabaseWriter,
  auth: Auth,
  storage: StorageWriter,
  scheduler: Scheduler
): MutationCtx {
  return {
    db,
    auth,
    storage,
    scheduler,
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate that a context object implements the MutationCtx interface.
 *
 * @param ctx - The context object to validate
 * @returns True if valid, throws error otherwise
 */
export function validateMutationCtx(ctx: unknown): ctx is MutationCtx {
  if (!ctx || typeof ctx !== 'object') {
    throw new Error('MutationCtx must be an object')
  }

  const mutationCtx = ctx as Record<string, unknown>

  if (!mutationCtx.db || typeof mutationCtx.db !== 'object') {
    throw new Error('MutationCtx.db is required and must be a DatabaseWriter')
  }

  if (!mutationCtx.auth || typeof mutationCtx.auth !== 'object') {
    throw new Error('MutationCtx.auth is required and must be an Auth instance')
  }

  if (!mutationCtx.storage || typeof mutationCtx.storage !== 'object') {
    throw new Error('MutationCtx.storage is required and must be a StorageWriter')
  }

  if (!mutationCtx.scheduler || typeof mutationCtx.scheduler !== 'object') {
    throw new Error('MutationCtx.scheduler is required and must be a Scheduler')
  }

  return true
}

/**
 * Ensure all required methods are present on DatabaseWriter.
 *
 * @param db - The database object to validate
 */
export function validateDatabaseWriter(db: unknown): db is DatabaseWriter {
  if (!db || typeof db !== 'object') {
    throw new Error('DatabaseWriter must be an object')
  }

  const dbWriter = db as Record<string, unknown>

  // Check read methods (from DatabaseReader)
  if (typeof dbWriter.get !== 'function') {
    throw new Error('DatabaseWriter.get must be a function')
  }

  if (typeof dbWriter.query !== 'function') {
    throw new Error('DatabaseWriter.query must be a function')
  }

  if (typeof dbWriter.normalizeId !== 'function') {
    throw new Error('DatabaseWriter.normalizeId must be a function')
  }

  // Check write methods
  if (typeof dbWriter.insert !== 'function') {
    throw new Error('DatabaseWriter.insert must be a function')
  }

  if (typeof dbWriter.patch !== 'function') {
    throw new Error('DatabaseWriter.patch must be a function')
  }

  if (typeof dbWriter.replace !== 'function') {
    throw new Error('DatabaseWriter.replace must be a function')
  }

  if (typeof dbWriter.delete !== 'function') {
    throw new Error('DatabaseWriter.delete must be a function')
  }

  return true
}

/**
 * Ensure all required methods are present on StorageWriter.
 *
 * @param storage - The storage object to validate
 */
export function validateStorageWriter(storage: unknown): storage is StorageWriter {
  if (!storage || typeof storage !== 'object') {
    throw new Error('StorageWriter must be an object')
  }

  const storageWriter = storage as Record<string, unknown>

  // Check read methods (from StorageReader)
  if (typeof storageWriter.getUrl !== 'function') {
    throw new Error('StorageWriter.getUrl must be a function')
  }

  if (typeof storageWriter.getMetadata !== 'function') {
    throw new Error('StorageWriter.getMetadata must be a function')
  }

  // Check write methods
  if (typeof storageWriter.generateUploadUrl !== 'function') {
    throw new Error('StorageWriter.generateUploadUrl must be a function')
  }

  if (typeof storageWriter.store !== 'function') {
    throw new Error('StorageWriter.store must be a function')
  }

  if (typeof storageWriter.delete !== 'function') {
    throw new Error('StorageWriter.delete must be a function')
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
 * Create a validated MutationCtx instance.
 *
 * This function creates a MutationCtx and validates all components
 * to ensure they implement the required interfaces.
 *
 * @param db - DatabaseWriter instance
 * @param auth - Auth instance
 * @param storage - StorageWriter instance
 * @param scheduler - Scheduler instance
 * @returns Validated MutationCtx instance
 * @throws Error if any component is invalid
 */
export function createValidatedMutationCtx(
  db: DatabaseWriter,
  auth: Auth,
  storage: StorageWriter,
  scheduler: Scheduler
): MutationCtx {
  // Validate all components
  validateDatabaseWriter(db)
  validateAuth(auth)
  validateStorageWriter(storage)
  validateScheduler(scheduler)

  // Create and return the context
  return createMutationCtx(db, auth, storage, scheduler)
}
