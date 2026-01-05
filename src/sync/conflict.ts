/**
 * Conflict Resolution for Convex Sync
 *
 * Provides conflict detection and resolution for concurrent updates
 * in the Convex sync system.
 *
 * Bead: convex-936.6 - Conflict Resolution
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Strategy for resolving conflicts
 */
export type ConflictStrategy = 'server-wins' | 'client-wins' | 'merge' | 'manual'

/**
 * Type of conflict detected
 */
export type ConflictType = 'field-conflict' | 'delete-update' | 'update-delete'

/**
 * Type of change operation
 */
export type ChangeType = 'insert' | 'update' | 'delete'

/**
 * Represents a single field conflict
 */
export interface FieldConflict {
  field: string
  localValue: unknown
  serverValue: unknown
}

/**
 * Represents a change to be synced
 */
export interface Change {
  id: string
  documentId: string
  table: string
  type: ChangeType
  fields: Record<string, unknown>
  version: number
  timestamp: number
  baseFields?: Record<string, unknown>
}

/**
 * Represents a detected conflict
 */
export interface Conflict {
  type: ConflictType
  localChange: Change
  serverChange: Change
  fieldConflicts: FieldConflict[]
  localVersion: number
  serverVersion: number
  versionDiff: number
  localTimestamp: number
  serverTimestamp: number
  isLocalStale: boolean
}

/**
 * Result of conflict resolution
 */
export interface ResolvedChange {
  type: ChangeType
  fields: Record<string, unknown>
  version: number
  resolutionStrategy?: ConflictStrategy | 'custom'
  mergedFields?: string[]
  baseFields?: Record<string, unknown>
}

/**
 * Custom conflict handler function
 */
export type ConflictHandler = (conflict: Conflict) => ResolvedChange | Promise<ResolvedChange>

/**
 * Custom resolver function
 */
export type CustomResolver = (local: Change, server: Change) => {
  fields: Record<string, unknown>
  version: number
  type?: ChangeType
}

/**
 * Field-level strategy configuration
 */
export type FieldStrategy = Record<string, Record<string, ConflictStrategy>>

/**
 * Conflict listener callback
 */
export type ConflictListener = (conflict: Conflict) => void

/**
 * Options for ConflictResolver
 */
export interface ConflictResolverOptions {
  defaultStrategy?: ConflictStrategy
  onConflict?: ConflictHandler
  versionGenerator?: (serverVersion: number) => number
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Deep equality check for two values
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== typeof b) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((val, idx) => deepEqual(val, b[idx]))
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const aKeys = Object.keys(aObj)
    const bKeys = Object.keys(bObj)

    if (aKeys.length !== bKeys.length) return false
    return aKeys.every(key => deepEqual(aObj[key], bObj[key]))
  }

  return false
}

/**
 * Get all keys from both objects
 */
function getAllKeys(obj1: Record<string, unknown>, obj2: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)])
  return Array.from(keys)
}

// ============================================================================
// ConflictResolver Class
// ============================================================================

/**
 * Handles conflict detection and resolution for sync operations
 */
export class ConflictResolver {
  public readonly defaultStrategy: ConflictStrategy
  public readonly conflictHandler?: ConflictHandler
  public readonly fieldStrategies: FieldStrategy = {}
  private readonly versionGenerator: (serverVersion: number) => number
  private readonly conflictListeners: Set<ConflictListener> = new Set()

  constructor(options: ConflictResolverOptions = {}) {
    this.defaultStrategy = options.defaultStrategy ?? 'server-wins'
    this.conflictHandler = options.onConflict
    this.versionGenerator = options.versionGenerator ?? ((serverVersion: number) => serverVersion + 1)
  }

  /**
   * Detect conflicts between local and server changes
   */
  detectConflict(localChange: Change, serverChange: Change): Conflict | null {
    // Different documents or tables - no conflict
    if (
      localChange.documentId !== serverChange.documentId ||
      localChange.table !== serverChange.table
    ) {
      return null
    }

    // Both deletes - no conflict
    if (localChange.type === 'delete' && serverChange.type === 'delete') {
      return null
    }

    // Different documents for insert - no conflict
    if (
      localChange.type === 'insert' &&
      serverChange.type === 'insert' &&
      localChange.documentId !== serverChange.documentId
    ) {
      return null
    }

    // Determine conflict type
    let conflictType: ConflictType
    if (localChange.type === 'delete' && serverChange.type === 'update') {
      conflictType = 'delete-update'
    } else if (localChange.type === 'update' && serverChange.type === 'delete') {
      conflictType = 'update-delete'
    } else {
      // Check for field-level conflicts
      const fieldConflicts = this.detectFieldConflicts(localChange.fields, serverChange.fields)

      if (fieldConflicts.length === 0) {
        return null
      }

      conflictType = 'field-conflict'
    }

    const conflict: Conflict = {
      type: conflictType,
      localChange,
      serverChange,
      fieldConflicts:
        conflictType === 'field-conflict'
          ? this.detectFieldConflicts(localChange.fields, serverChange.fields)
          : [],
      localVersion: localChange.version,
      serverVersion: serverChange.version,
      versionDiff: serverChange.version - localChange.version,
      localTimestamp: localChange.timestamp,
      serverTimestamp: serverChange.timestamp,
      isLocalStale: serverChange.version - localChange.version > 1,
    }

    // Notify listeners
    this.notifyListeners(conflict)

    // Call conflict handler if present
    if (this.conflictHandler) {
      this.conflictHandler(conflict)
    }

    return conflict
  }

  /**
   * Detect field-level conflicts between two field objects
   */
  private detectFieldConflicts(
    localFields: Record<string, unknown>,
    serverFields: Record<string, unknown>
  ): FieldConflict[] {
    const conflicts: FieldConflict[] = []

    // Get all keys that exist in both objects
    const localKeys = new Set(Object.keys(localFields))
    const serverKeys = new Set(Object.keys(serverFields))

    // Find overlapping keys
    for (const key of localKeys) {
      if (serverKeys.has(key)) {
        const localValue = localFields[key]
        const serverValue = serverFields[key]

        if (!deepEqual(localValue, serverValue)) {
          conflicts.push({
            field: key,
            localValue,
            serverValue,
          })
        }
      }
    }

    return conflicts
  }

  /**
   * Resolve a conflict using the specified strategy
   */
  resolveConflict(
    conflict: Conflict,
    strategy: ConflictStrategy | CustomResolver
  ): ResolvedChange {
    // Handle custom resolver function
    if (typeof strategy === 'function') {
      const result = strategy(conflict.localChange, conflict.serverChange)

      if (!result || typeof result !== 'object' || !result.fields) {
        throw new Error('Invalid resolution result: custom resolver must return an object with fields and version')
      }

      return {
        type: result.type ?? conflict.serverChange.type,
        fields: result.fields,
        version: result.version,
        resolutionStrategy: 'custom',
      }
    }

    // Validate strategy
    if (!['server-wins', 'client-wins', 'merge', 'manual'].includes(strategy)) {
      throw new Error(`Invalid conflict strategy: ${strategy}`)
    }

    // Handle manual strategy
    if (strategy === 'manual') {
      if (!this.conflictHandler) {
        throw new Error('Manual resolution requires a conflict handler to be configured')
      }

      const result = this.conflictHandler(conflict)
      if (result instanceof Promise) {
        throw new Error('For async handlers, use resolveConflictAsync instead')
      }
      return {
        ...result,
        resolutionStrategy: 'manual',
      }
    }

    // Handle delete conflicts
    if (conflict.type === 'delete-update' || conflict.type === 'update-delete') {
      return this.resolveDeleteConflict(conflict, strategy)
    }

    // Handle field conflicts
    switch (strategy) {
      case 'server-wins':
        return this.resolveServerWins(conflict)
      case 'client-wins':
        return this.resolveClientWins(conflict)
      case 'merge':
        return this.resolveMerge(conflict)
      default:
        throw new Error(`Invalid conflict strategy: ${strategy}`)
    }
  }

  /**
   * Resolve a conflict asynchronously (for async handlers)
   */
  async resolveConflictAsync(
    conflict: Conflict,
    strategy: ConflictStrategy | CustomResolver
  ): Promise<ResolvedChange> {
    if (strategy === 'manual' && this.conflictHandler) {
      const result = await this.conflictHandler(conflict)
      return {
        ...result,
        resolutionStrategy: 'manual',
      }
    }

    return this.resolveConflict(conflict, strategy)
  }

  /**
   * Resolve using server-wins strategy
   */
  private resolveServerWins(conflict: Conflict): ResolvedChange {
    return {
      type: conflict.serverChange.type,
      fields: { ...conflict.serverChange.fields },
      version: conflict.serverVersion,
      resolutionStrategy: 'server-wins',
    }
  }

  /**
   * Resolve using client-wins strategy
   */
  private resolveClientWins(conflict: Conflict): ResolvedChange {
    return {
      type: conflict.localChange.type,
      fields: { ...conflict.localChange.fields },
      version: this.versionGenerator(conflict.serverVersion),
      resolutionStrategy: 'client-wins',
    }
  }

  /**
   * Resolve using merge strategy
   */
  private resolveMerge(conflict: Conflict): ResolvedChange {
    const localFields = conflict.localChange.fields
    const serverFields = conflict.serverChange.fields
    const mergedFields: Record<string, unknown> = {}
    const mergedFieldNames: string[] = []

    // Get all unique keys
    const allKeys = getAllKeys(localFields, serverFields)

    for (const key of allKeys) {
      const inLocal = key in localFields
      const inServer = key in serverFields

      if (inLocal && inServer) {
        // Both have this field - check for conflict
        const localValue = localFields[key]
        const serverValue = serverFields[key]

        if (deepEqual(localValue, serverValue)) {
          // Same value - no conflict
          mergedFields[key] = serverValue
        } else {
          // Conflict - use field strategy or default
          const fieldStrategy = this.getFieldStrategy(conflict.localChange.table, key)

          if (fieldStrategy === 'client-wins') {
            mergedFields[key] = localValue
          } else {
            // Default to server-wins for conflicts in merge mode
            mergedFields[key] = serverValue
          }
        }
      } else if (inLocal) {
        // Only local has this field
        mergedFields[key] = localFields[key]
        mergedFieldNames.push(key)
      } else {
        // Only server has this field
        mergedFields[key] = serverFields[key]
        mergedFieldNames.push(key)
      }
    }

    return {
      type: conflict.serverChange.type,
      fields: mergedFields,
      version: this.versionGenerator(conflict.serverVersion),
      resolutionStrategy: 'merge',
      mergedFields: mergedFieldNames,
    }
  }

  /**
   * Resolve delete conflicts
   */
  private resolveDeleteConflict(
    conflict: Conflict,
    strategy: ConflictStrategy
  ): ResolvedChange {
    if (conflict.type === 'delete-update') {
      // Local wants to delete, server has update
      if (strategy === 'client-wins') {
        return {
          type: 'delete',
          fields: {},
          version: this.versionGenerator(conflict.serverVersion),
          resolutionStrategy: strategy,
        }
      } else {
        // server-wins or merge: keep the update
        return {
          type: 'update',
          fields: { ...conflict.serverChange.fields },
          version: conflict.serverVersion,
          resolutionStrategy: strategy,
        }
      }
    } else {
      // update-delete: Local wants to update, server has delete
      if (strategy === 'client-wins') {
        return {
          type: 'update',
          fields: { ...conflict.localChange.fields },
          version: this.versionGenerator(conflict.serverVersion),
          resolutionStrategy: strategy,
        }
      } else {
        // server-wins or merge: apply the delete
        return {
          type: 'delete',
          fields: {},
          version: conflict.serverVersion,
          resolutionStrategy: strategy,
        }
      }
    }
  }

  /**
   * Auto-resolve non-conflicting changes
   */
  autoResolve(localChange: Change, serverChange: Change): ResolvedChange {
    // Merge non-conflicting fields
    const mergedFields: Record<string, unknown> = {
      ...localChange.fields,
      ...serverChange.fields,
    }

    return {
      type: serverChange.type,
      fields: mergedFields,
      version: this.versionGenerator(serverChange.version),
      resolutionStrategy: 'merge',
      baseFields: localChange.baseFields ?? serverChange.baseFields,
    }
  }

  /**
   * Set strategy for a specific field in a table
   */
  setFieldStrategy(table: string, field: string, strategy: ConflictStrategy): void {
    if (!this.fieldStrategies[table]) {
      this.fieldStrategies[table] = {}
    }
    this.fieldStrategies[table][field] = strategy
  }

  /**
   * Get strategy for a specific field in a table
   */
  getFieldStrategy(table: string, field: string): ConflictStrategy {
    return this.fieldStrategies[table]?.[field] ?? this.defaultStrategy
  }

  /**
   * Clear strategy for a specific field
   */
  clearFieldStrategy(table: string, field: string): void {
    if (this.fieldStrategies[table]) {
      delete this.fieldStrategies[table][field]
    }
  }

  /**
   * Clear all field strategies
   */
  clearAllFieldStrategies(): void {
    for (const table of Object.keys(this.fieldStrategies)) {
      delete this.fieldStrategies[table]
    }
  }

  /**
   * Add a conflict listener
   */
  addConflictListener(listener: ConflictListener): void {
    this.conflictListeners.add(listener)
  }

  /**
   * Remove a conflict listener
   */
  removeConflictListener(listener: ConflictListener): void {
    this.conflictListeners.delete(listener)
  }

  /**
   * Notify all listeners of a conflict
   */
  private notifyListeners(conflict: Conflict): void {
    for (const listener of this.conflictListeners) {
      listener(conflict)
    }
  }
}
