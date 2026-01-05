/**
 * Optimistic Updates for Convex.do
 *
 * Provides client-side optimistic update management for improved UX.
 * Updates are applied immediately to local state while waiting for
 * server confirmation, then confirmed or reverted based on response.
 *
 * Features:
 * - Apply optimistic updates with expected results
 * - Confirm updates when server responds successfully
 * - Revert updates on error
 * - Handle multiple pending updates
 * - Maintain update ordering
 * - Cascade rollbacks for dependent updates
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Status of an optimistic update
 */
export const OptimisticUpdateStatus = {
  PENDING: 'pending' as const,
  IN_FLIGHT: 'in-flight' as const,
  CONFIRMED: 'confirmed' as const,
  REVERTED: 'reverted' as const,
}

export type OptimisticUpdateStatusType =
  | 'pending'
  | 'in-flight'
  | 'confirmed'
  | 'reverted'

/**
 * Function that transforms data optimistically
 */
export type OptimisticUpdateFunction<T> = (currentData: T) => T

/**
 * Configuration options for an optimistic update
 */
export interface OptimisticUpdateOptions {
  /** Unique key for the update (useful for serialization) */
  key?: string
  /** ID of an update this one depends on */
  dependsOn?: string
  /** Whether to automatically revert on error (default: true) */
  revertOnError?: boolean
}

/**
 * Represents a single optimistic update
 */
export interface OptimisticUpdate<TArgs = Record<string, unknown>> {
  /** Unique identifier for this update */
  id: string
  /** Name of the mutation */
  mutation: string
  /** Arguments passed to the mutation */
  args: TArgs
  /** Function to apply the optimistic update */
  updateFn: OptimisticUpdateFunction<unknown>
  /** Current status of the update */
  status: OptimisticUpdateStatusType
  /** Timestamp when the update was applied */
  appliedAt: number
  /** Order in which update was applied */
  order: number
  /** Optional key for serialization */
  key?: string
  /** ID of update this depends on */
  dependsOn?: string
  /** Whether to revert on error */
  revertOnError: boolean
}

/**
 * Configuration for OptimisticUpdateManager
 */
export interface OptimisticUpdateManagerConfig {
  /** Maximum number of pending updates (default: unlimited) */
  maxPendingUpdates?: number
  /** Enable debug logging (default: false) */
  enableLogging?: boolean
}

/**
 * Filter options for getPendingUpdates
 */
export interface PendingUpdatesFilter {
  /** Filter by mutation name */
  mutation?: string
  /** Filter by status */
  status?: OptimisticUpdateStatusType
}

/**
 * Event payload for update applied
 */
export interface UpdateAppliedEvent {
  updateId: string
  mutation: string
  args: Record<string, unknown>
}

/**
 * Event payload for update confirmed
 */
export interface UpdateConfirmedEvent {
  updateId: string
  mutation: string
  args: Record<string, unknown>
  serverResponse?: unknown
}

/**
 * Event payload for update reverted
 */
export interface UpdateRevertedEvent {
  updateId: string
  mutation: string
  args: Record<string, unknown>
  error?: Error
}

/**
 * Event payload for update error
 */
export interface UpdateErrorEvent {
  updateId: string
  mutation: string
  args: Record<string, unknown>
  error: Error
}

/**
 * Options for getOptimisticData
 */
export interface GetOptimisticDataOptions {
  /** Whether to throw on error instead of skipping failed updates */
  throwOnError?: boolean
}

// ============================================================================
// Event Emitter
// ============================================================================

type EventCallback<T> = (payload: T) => void

class EventEmitter<Events extends Record<string, unknown>> {
  private listeners: Map<keyof Events, Set<EventCallback<unknown>>> = new Map()

  on<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>)

    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback<unknown>)
    }
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      for (const callback of callbacks) {
        callback(payload)
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}

interface OptimisticUpdateEvents {
  applied: UpdateAppliedEvent
  confirmed: UpdateConfirmedEvent
  reverted: UpdateRevertedEvent
  error: UpdateErrorEvent
}

// ============================================================================
// ID Generator
// ============================================================================

function generateUpdateId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `opt_${timestamp}_${random}`
}

// ============================================================================
// OptimisticUpdateManager Class
// ============================================================================

/**
 * Manages optimistic updates for a Convex client
 */
export class OptimisticUpdateManager {
  private updates: Map<string, OptimisticUpdate> = new Map()
  private orderedIds: string[] = []
  private orderCounter = 0
  private emitter = new EventEmitter<OptimisticUpdateEvents>()
  private config: OptimisticUpdateManagerConfig
  private erroredUpdates: Set<string> = new Set()

  constructor(config: OptimisticUpdateManagerConfig = {}) {
    this.config = {
      maxPendingUpdates: config.maxPendingUpdates,
      enableLogging: config.enableLogging ?? false,
    }
  }

  /**
   * Apply an optimistic update
   */
  applyOptimisticUpdate<TData = unknown, TArgs = Record<string, unknown>>(
    mutation: string,
    args: TArgs,
    updateFn: OptimisticUpdateFunction<TData>,
    options: OptimisticUpdateOptions = {}
  ): string {
    const id = generateUpdateId()
    const order = this.orderCounter++

    const update: OptimisticUpdate<TArgs> = {
      id,
      mutation,
      args,
      updateFn: updateFn as OptimisticUpdateFunction<unknown>,
      status: 'pending',
      appliedAt: Date.now(),
      order,
      key: options.key,
      dependsOn: options.dependsOn,
      revertOnError: options.revertOnError ?? true,
    }

    this.updates.set(id, update as OptimisticUpdate)
    this.orderedIds.push(id)

    if (this.config.enableLogging) {
      console.log(`[OptimisticUpdate] Applied: ${id} (${mutation})`)
    }

    this.emitter.emit('applied', {
      updateId: id,
      mutation,
      args: args as Record<string, unknown>,
    })

    return id
  }

  /**
   * Confirm an optimistic update (server succeeded)
   */
  confirmUpdate(updateId: string, serverResponse?: unknown): boolean {
    const update = this.updates.get(updateId)

    if (!update) {
      return false
    }

    // Remove from pending
    this.updates.delete(updateId)
    this.orderedIds = this.orderedIds.filter((id) => id !== updateId)
    this.erroredUpdates.delete(updateId)

    if (this.config.enableLogging) {
      console.log(`[OptimisticUpdate] Confirmed: ${updateId}`)
    }

    this.emitter.emit('confirmed', {
      updateId,
      mutation: update.mutation,
      args: update.args,
      serverResponse,
    })

    return true
  }

  /**
   * Revert an optimistic update (server failed)
   */
  revertUpdate(updateId: string, error?: Error): boolean {
    const update = this.updates.get(updateId)

    if (!update) {
      return false
    }

    // Find and revert dependent updates first
    const dependentUpdates = this.findDependentUpdates(updateId)

    // Revert dependents in reverse order
    for (let i = dependentUpdates.length - 1; i >= 0; i--) {
      const depId = dependentUpdates[i]
      if (depId) {
        this.revertUpdateInternal(depId, new Error('Parent update reverted'))
      }
    }

    // Revert this update
    this.revertUpdateInternal(updateId, error)

    return true
  }

  private revertUpdateInternal(updateId: string, error?: Error): void {
    const update = this.updates.get(updateId)

    if (!update) {
      return
    }

    // Remove from pending
    this.updates.delete(updateId)
    this.orderedIds = this.orderedIds.filter((id) => id !== updateId)
    this.erroredUpdates.delete(updateId)

    if (this.config.enableLogging) {
      console.log(`[OptimisticUpdate] Reverted: ${updateId}`)
    }

    this.emitter.emit('reverted', {
      updateId,
      mutation: update.mutation,
      args: update.args,
      error,
    })
  }

  /**
   * Find all updates that depend on the given update
   */
  private findDependentUpdates(updateId: string): string[] {
    const dependents: string[] = []
    const visited = new Set<string>()

    const findRecursive = (parentId: string) => {
      for (const [id, update] of this.updates) {
        if (update.dependsOn === parentId && !visited.has(id)) {
          visited.add(id)
          dependents.push(id)
          findRecursive(id)
        }
      }
    }

    findRecursive(updateId)

    return dependents
  }

  /**
   * Get all pending updates
   */
  getPendingUpdates(filter?: PendingUpdatesFilter): OptimisticUpdate[] {
    let updates = this.orderedIds
      .map((id) => this.updates.get(id))
      .filter((u): u is OptimisticUpdate => u !== undefined)

    if (filter?.mutation) {
      updates = updates.filter((u) => u.mutation === filter.mutation)
    }

    if (filter?.status) {
      updates = updates.filter((u) => u.status === filter.status)
    }

    // Return a copy
    return updates.map((u) => ({ ...u }))
  }

  /**
   * Get optimistic data by applying all pending updates to server data
   */
  getOptimisticData<T>(serverData: T, options: GetOptimisticDataOptions = {}): T {
    let data = serverData

    for (const id of this.orderedIds) {
      const update = this.updates.get(id)

      if (!update) {
        continue
      }

      // Skip already errored updates
      if (this.erroredUpdates.has(id)) {
        continue
      }

      try {
        data = update.updateFn(data) as T
      } catch (error) {
        if (!update.revertOnError && options.throwOnError) {
          throw error
        }

        // Mark as errored so we skip it in future calls
        this.erroredUpdates.add(id)

        // Emit error event
        this.emitter.emit('error', {
          updateId: id,
          mutation: update.mutation,
          args: update.args,
          error: error instanceof Error ? error : new Error(String(error)),
        })

        // Skip this update and continue with others
        continue
      }
    }

    return data
  }

  /**
   * Revert all pending updates
   */
  revertAll(): number {
    const count = this.updates.size

    // Get all IDs before modifying
    const ids = [...this.orderedIds]

    for (const id of ids) {
      this.revertUpdate(id)
    }

    return count
  }

  /**
   * Check if there are pending updates
   */
  hasPendingUpdates(): boolean {
    return this.updates.size > 0
  }

  /**
   * Get a specific update by ID
   */
  getUpdateById(updateId: string): OptimisticUpdate | undefined {
    const update = this.updates.get(updateId)
    return update ? { ...update } : undefined
  }

  /**
   * Mark an update as in-flight (request sent to server)
   */
  markInFlight(updateId: string): boolean {
    const update = this.updates.get(updateId)

    if (!update) {
      return false
    }

    update.status = 'in-flight'
    return true
  }

  /**
   * Clear all updates without triggering events
   */
  clear(): void {
    this.updates.clear()
    this.orderedIds = []
    this.erroredUpdates.clear()
  }

  // =========================================================================
  // Event Listeners
  // =========================================================================

  /**
   * Subscribe to update applied events
   */
  onUpdateApplied(callback: EventCallback<UpdateAppliedEvent>): () => void {
    return this.emitter.on('applied', callback)
  }

  /**
   * Subscribe to update confirmed events
   */
  onUpdateConfirmed(callback: EventCallback<UpdateConfirmedEvent>): () => void {
    return this.emitter.on('confirmed', callback)
  }

  /**
   * Subscribe to update reverted events
   */
  onUpdateReverted(callback: EventCallback<UpdateRevertedEvent>): () => void {
    return this.emitter.on('reverted', callback)
  }

  /**
   * Subscribe to update error events
   */
  onUpdateError(callback: EventCallback<UpdateErrorEvent>): () => void {
    return this.emitter.on('error', callback)
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    this.emitter.removeAllListeners()
  }

  // =========================================================================
  // Serialization
  // =========================================================================

  /**
   * Serialize pending updates to JSON
   */
  serialize(): string {
    const updates = this.orderedIds.map((id) => {
      const update = this.updates.get(id)
      if (!update) return null

      return {
        id: update.id,
        mutation: update.mutation,
        args: update.args,
        status: update.status,
        appliedAt: update.appliedAt,
        order: update.order,
        key: update.key,
        dependsOn: update.dependsOn,
        revertOnError: update.revertOnError,
      }
    }).filter(Boolean)

    return JSON.stringify(updates)
  }

  /**
   * Deserialize pending updates from JSON
   */
  deserialize(
    json: string,
    updateFunctions?: Record<string, OptimisticUpdateFunction<unknown>>
  ): void {
    const updates = JSON.parse(json) as Array<Omit<OptimisticUpdate, 'updateFn'>>

    for (const update of updates) {
      // Try to restore the update function
      let updateFn: OptimisticUpdateFunction<unknown> = (d) => d

      if (update.key && updateFunctions?.[update.key]) {
        updateFn = updateFunctions[update.key]
      }

      const fullUpdate: OptimisticUpdate = {
        ...update,
        updateFn,
      }

      this.updates.set(update.id, fullUpdate)
      this.orderedIds.push(update.id)

      // Track max order for new updates
      if (update.order >= this.orderCounter) {
        this.orderCounter = update.order + 1
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new OptimisticUpdateManager instance
 */
export function createOptimisticUpdateManager(
  config?: OptimisticUpdateManagerConfig
): OptimisticUpdateManager {
  return new OptimisticUpdateManager(config)
}
