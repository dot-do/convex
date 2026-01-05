/**
 * Change Detection System for Real-Time Query Updates
 *
 * Provides efficient change detection between data states, supporting:
 * - Deep object comparison
 * - Array change detection (add, remove, update)
 * - Nested object changes
 * - Change event emission
 * - Affected query detection
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Type of change detected
 */
export enum ChangeType {
  ADDED = 'added',
  REMOVED = 'removed',
  MODIFIED = 'modified',
}

/**
 * Represents a single change in the data
 */
export interface Change {
  path: (string | number)[]
  value?: unknown
  oldValue?: unknown
  newValue?: unknown
}

/**
 * Set of all changes detected between two data states
 */
export interface ChangeSet {
  added: Change[]
  removed: Change[]
  modified: Change[]
  timestamp: number
}

/**
 * Diff representation showing old and new values for each changed field
 */
export interface ChangeDiff {
  [key: string]: { old: unknown; new: unknown }
}

/**
 * Event emitted when changes are detected
 */
export interface ChangeEvent {
  type: 'change' | 'add' | 'remove' | 'modify'
  changes: ChangeSet
  timestamp: number
  oldData: unknown
  newData: unknown
}

/**
 * Query dependency configuration
 */
export interface QueryDependency {
  tables: string[]
  fields?: string[]
}

/**
 * Options for ChangeDetector configuration
 */
export interface ChangeDetectorOptions {
  deepCompare?: boolean
  trackArrayOrder?: boolean
  identityField?: string
  isEqual?: (a: unknown, b: unknown) => boolean
}

/**
 * Event handler type
 */
type EventHandler = (event: ChangeEvent) => void

// ============================================================================
// ChangeDetector Class
// ============================================================================

/**
 * Main class for detecting changes between data states
 */
export class ChangeDetector {
  private options: Required<ChangeDetectorOptions>
  private eventHandlers: Map<string, Set<EventHandler>> = new Map()
  private registeredQueries: Map<string, QueryDependency> = new Map()

  constructor(options: ChangeDetectorOptions = {}) {
    this.options = {
      deepCompare: options.deepCompare ?? true,
      trackArrayOrder: options.trackArrayOrder ?? true,
      identityField: options.identityField ?? '_id',
      isEqual: options.isEqual ?? this.defaultIsEqual.bind(this),
    }
  }

  /**
   * Detect all changes between old and new data
   */
  detectChanges(oldData: unknown, newData: unknown): ChangeSet {
    const changes: ChangeSet = {
      added: [],
      removed: [],
      modified: [],
      timestamp: Date.now(),
    }

    this.compareValues(oldData, newData, [], changes)

    // Emit events if there are changes
    if (
      changes.added.length > 0 ||
      changes.removed.length > 0 ||
      changes.modified.length > 0
    ) {
      this.emitEvent('change', changes, oldData, newData)

      if (changes.added.length > 0) {
        this.emitEvent('add', changes, oldData, newData)
      }
      if (changes.removed.length > 0) {
        this.emitEvent('remove', changes, oldData, newData)
      }
      if (changes.modified.length > 0) {
        this.emitEvent('modify', changes, oldData, newData)
      }
    }

    return changes
  }

  /**
   * Get a diff object showing old and new values for each changed field
   */
  getDiff(oldData: unknown, newData: unknown): ChangeDiff {
    const diff: ChangeDiff = {}
    const changes = this.detectChangesInternal(oldData, newData, [])

    for (const change of changes.added) {
      const key = this.pathToKey(change.path)
      diff[key] = { old: undefined, new: change.value }
    }

    for (const change of changes.removed) {
      const key = this.pathToKey(change.path)
      diff[key] = { old: change.value, new: undefined }
    }

    for (const change of changes.modified) {
      const key = this.pathToKey(change.path)
      diff[key] = { old: change.oldValue, new: change.newValue }
    }

    return diff
  }

  /**
   * Check if there are any changes between old and new data
   */
  hasChanges(oldData: unknown, newData: unknown): boolean {
    if (!this.options.trackArrayOrder) {
      return !this.deepEqualsIgnoreArrayOrder(oldData, newData)
    }

    return !this.options.isEqual(oldData, newData)
  }

  /**
   * Deep equals that ignores array order (for trackArrayOrder: false)
   */
  private deepEqualsIgnoreArrayOrder(
    a: unknown,
    b: unknown,
    seen: WeakMap<object, object> = new WeakMap()
  ): boolean {
    // Handle identical references
    if (a === b) return true

    // Handle NaN
    if (typeof a === 'number' && typeof b === 'number') {
      if (Number.isNaN(a) && Number.isNaN(b)) return true
    }

    // Handle null/undefined
    if (a === null || b === null) return a === b
    if (a === undefined || b === undefined) return a === b

    // Handle different types
    if (typeof a !== typeof b) return false

    // Handle primitives
    if (typeof a !== 'object') return a === b

    // Handle Date objects
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime()
    }

    // Handle circular references
    if (seen.has(a as object)) {
      return seen.get(a as object) === b
    }
    seen.set(a as object, b as object)

    // Handle array vs non-array mismatch
    if (Array.isArray(a) !== Array.isArray(b)) {
      return false
    }

    // Handle arrays - ignore order by sorting
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      // Sort primitives, for objects we compare element by element
      const sortedA = [...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
      const sortedB = [...b].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
      for (let i = 0; i < sortedA.length; i++) {
        if (!this.deepEqualsIgnoreArrayOrder(sortedA[i], sortedB[i], seen)) return false
      }
      return true
    }

    // Handle plain objects
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>

    const aKeys = Object.keys(aObj)
    const bKeys = Object.keys(bObj)

    if (aKeys.length !== bKeys.length) return false

    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false
      if (!this.deepEqualsIgnoreArrayOrder(aObj[key], bObj[key], seen)) return false
    }

    return true
  }

  /**
   * Register a query with its dependencies
   */
  registerQuery(queryId: string, dependency: QueryDependency): void {
    this.registeredQueries.set(queryId, dependency)
  }

  /**
   * Unregister a query
   */
  unregisterQuery(queryId: string): void {
    this.registeredQueries.delete(queryId)
  }

  /**
   * Get list of registered query IDs
   */
  getRegisteredQueries(): string[] {
    return Array.from(this.registeredQueries.keys())
  }

  /**
   * Find queries affected by the given changes
   */
  getAffectedQueries(changes: ChangeSet): string[] {
    const affected = new Set<string>()

    for (const [queryId, dependency] of this.registeredQueries.entries()) {
      if (this.isQueryAffected(dependency, changes)) {
        affected.add(queryId)
      }
    }

    return Array.from(affected)
  }

  /**
   * Subscribe to change events
   */
  on(eventType: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set())
    }
    this.eventHandlers.get(eventType)!.add(handler)
  }

  /**
   * Unsubscribe from change events
   */
  off(eventType: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private defaultIsEqual(a: unknown, b: unknown): boolean {
    return this.deepEquals(a, b)
  }

  private deepEquals(
    a: unknown,
    b: unknown,
    seen: WeakMap<object, object> = new WeakMap()
  ): boolean {
    // Handle identical references
    if (a === b) return true

    // Handle NaN
    if (typeof a === 'number' && typeof b === 'number') {
      if (Number.isNaN(a) && Number.isNaN(b)) return true
    }

    // Handle null/undefined
    if (a === null || b === null) return a === b
    if (a === undefined || b === undefined) return a === b

    // Handle different types
    if (typeof a !== typeof b) return false

    // Handle primitives
    if (typeof a !== 'object') return a === b

    // Handle Date objects
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime()
    }

    // Handle RegExp objects
    if (a instanceof RegExp && b instanceof RegExp) {
      return a.toString() === b.toString()
    }

    // Handle Map objects
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false
      for (const [key, value] of a) {
        if (!b.has(key) || !this.deepEquals(value, b.get(key), seen)) {
          return false
        }
      }
      return true
    }

    // Handle Set objects
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false
      for (const value of a) {
        if (!b.has(value)) return false
      }
      return true
    }

    // Handle circular references
    if (seen.has(a as object)) {
      return seen.get(a as object) === b
    }
    seen.set(a as object, b as object)

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (!this.deepEquals(a[i], b[i], seen)) return false
      }
      return true
    }

    // Handle array vs non-array mismatch
    if (Array.isArray(a) !== Array.isArray(b)) {
      return false
    }

    // Handle plain objects
    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>

    const aKeys = Object.keys(aObj)
    const bKeys = Object.keys(bObj)

    if (aKeys.length !== bKeys.length) return false

    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false
      if (!this.deepEquals(aObj[key], bObj[key], seen)) return false
    }

    return true
  }

  private compareValues(
    oldData: unknown,
    newData: unknown,
    path: (string | number)[],
    changes: ChangeSet,
    seen: WeakMap<object, boolean> = new WeakMap()
  ): void {
    // Handle identical values
    if (oldData === newData) return

    // Handle NaN
    if (
      typeof oldData === 'number' &&
      typeof newData === 'number' &&
      Number.isNaN(oldData) &&
      Number.isNaN(newData)
    ) {
      return
    }

    // Handle null/undefined to value transitions
    if (oldData === null || oldData === undefined) {
      if (newData !== null && newData !== undefined) {
        // At root level, treat as added; at nested level, treat as modified to preserve old value
        if (path.length === 0) {
          // Root level - add all fields from new object
          if (typeof newData === 'object' && newData !== null) {
            this.addObjectChanges(newData, path, changes, 'added')
          } else {
            changes.added.push({ path: [...path], value: newData })
          }
        } else {
          // Nested level - treat as modification
          changes.modified.push({
            path: [...path],
            oldValue: oldData,
            newValue: newData,
          })
        }
      }
      return
    }

    // Handle value to null/undefined transitions
    if (newData === null || newData === undefined) {
      if (oldData !== null && oldData !== undefined) {
        // At root level, treat as removed; at nested level, treat as modified
        if (path.length === 0) {
          if (typeof oldData === 'object' && oldData !== null) {
            this.addObjectChanges(oldData, path, changes, 'removed')
          } else {
            changes.removed.push({ path: [...path], value: oldData })
          }
        } else {
          changes.modified.push({
            path: [...path],
            oldValue: oldData,
            newValue: newData,
          })
        }
      }
      return
    }

    // Handle type changes
    if (typeof oldData !== typeof newData) {
      changes.modified.push({
        path: [...path],
        oldValue: oldData,
        newValue: newData,
      })
      return
    }

    // Handle primitives
    if (typeof oldData !== 'object') {
      if (oldData !== newData) {
        changes.modified.push({
          path: [...path],
          oldValue: oldData,
          newValue: newData,
        })
      }
      return
    }

    // Handle circular references
    if (typeof oldData === 'object' && oldData !== null) {
      if (seen.has(oldData)) return
      seen.set(oldData, true)
    }

    // Handle Date objects
    if (oldData instanceof Date && newData instanceof Date) {
      if (oldData.getTime() !== newData.getTime()) {
        changes.modified.push({
          path: [...path],
          oldValue: oldData,
          newValue: newData,
        })
      }
      return
    }

    // Handle arrays
    if (Array.isArray(oldData) && Array.isArray(newData)) {
      this.compareArrays(oldData, newData, path, changes, seen)
      return
    }

    // Handle array vs non-array
    if (Array.isArray(oldData) !== Array.isArray(newData)) {
      changes.modified.push({
        path: [...path],
        oldValue: oldData,
        newValue: newData,
      })
      return
    }

    // Handle objects
    this.compareObjects(
      oldData as Record<string, unknown>,
      newData as Record<string, unknown>,
      path,
      changes,
      seen
    )
  }

  private compareArrays(
    oldArr: unknown[],
    newArr: unknown[],
    path: (string | number)[],
    changes: ChangeSet,
    seen: WeakMap<object, boolean>
  ): void {
    // Check if arrays contain objects with identity fields
    const hasIdentity =
      oldArr.length > 0 &&
      typeof oldArr[0] === 'object' &&
      oldArr[0] !== null &&
      this.options.identityField in (oldArr[0] as Record<string, unknown>)

    if (hasIdentity) {
      this.compareArrayByIdentity(oldArr, newArr, path, changes, seen)
    } else {
      this.compareArrayByIndex(oldArr, newArr, path, changes, seen)
    }
  }

  private compareArrayByIdentity(
    oldArr: unknown[],
    newArr: unknown[],
    path: (string | number)[],
    changes: ChangeSet,
    seen: WeakMap<object, boolean>
  ): void {
    const idField = this.options.identityField
    const oldMap = new Map<unknown, unknown>()
    const newMap = new Map<unknown, unknown>()

    for (const item of oldArr) {
      if (typeof item === 'object' && item !== null) {
        const id = (item as Record<string, unknown>)[idField]
        oldMap.set(id, item)
      }
    }

    for (const item of newArr) {
      if (typeof item === 'object' && item !== null) {
        const id = (item as Record<string, unknown>)[idField]
        newMap.set(id, item)
      }
    }

    // Find added items
    for (const [id, item] of newMap) {
      if (!oldMap.has(id)) {
        changes.added.push({ path: [...path], value: item })
      }
    }

    // Find removed items
    for (const [id, item] of oldMap) {
      if (!newMap.has(id)) {
        changes.removed.push({ path: [...path], value: item })
      }
    }

    // Find modified items
    for (const [id, oldItem] of oldMap) {
      if (newMap.has(id)) {
        const newItem = newMap.get(id)
        this.compareValues(oldItem, newItem, path, changes, seen)
      }
    }
  }

  private compareArrayByIndex(
    oldArr: unknown[],
    newArr: unknown[],
    path: (string | number)[],
    changes: ChangeSet,
    seen: WeakMap<object, boolean>
  ): void {
    const maxLen = Math.max(oldArr.length, newArr.length)

    for (let i = 0; i < maxLen; i++) {
      const itemPath = [...path, i]

      if (i >= oldArr.length) {
        // New item added
        changes.added.push({ path: itemPath, value: newArr[i] })
      } else if (i >= newArr.length) {
        // Item removed
        changes.removed.push({ path: itemPath, value: oldArr[i] })
      } else {
        // Compare items
        this.compareValues(oldArr[i], newArr[i], itemPath, changes, seen)
      }
    }
  }

  private compareObjects(
    oldObj: Record<string, unknown>,
    newObj: Record<string, unknown>,
    path: (string | number)[],
    changes: ChangeSet,
    seen: WeakMap<object, boolean>
  ): void {
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])

    for (const key of allKeys) {
      const keyPath = [...path, key]

      if (!(key in oldObj)) {
        // New property added
        if (typeof newObj[key] === 'object' && newObj[key] !== null) {
          this.addObjectChanges(newObj[key], keyPath, changes, 'added')
        } else {
          changes.added.push({ path: keyPath, value: newObj[key] })
        }
      } else if (!(key in newObj)) {
        // Property removed
        if (typeof oldObj[key] === 'object' && oldObj[key] !== null) {
          this.addObjectChanges(oldObj[key], keyPath, changes, 'removed')
        } else {
          changes.removed.push({ path: keyPath, value: oldObj[key] })
        }
      } else {
        // Compare values
        this.compareValues(oldObj[key], newObj[key], keyPath, changes, seen)
      }
    }
  }

  private addObjectChanges(
    obj: unknown,
    path: (string | number)[],
    changes: ChangeSet,
    type: 'added' | 'removed'
  ): void {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const itemPath = [...path, i]
        if (typeof obj[i] === 'object' && obj[i] !== null) {
          this.addObjectChanges(obj[i], itemPath, changes, type)
        } else {
          changes[type].push({ path: itemPath, value: obj[i] })
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      const record = obj as Record<string, unknown>
      for (const key of Object.keys(record)) {
        const keyPath = [...path, key]
        if (typeof record[key] === 'object' && record[key] !== null) {
          this.addObjectChanges(record[key], keyPath, changes, type)
        } else {
          changes[type].push({ path: keyPath, value: record[key] })
        }
      }
    } else {
      changes[type].push({ path, value: obj })
    }
  }

  private detectChangesInternal(
    oldData: unknown,
    newData: unknown,
    path: (string | number)[]
  ): ChangeSet {
    const changes: ChangeSet = {
      added: [],
      removed: [],
      modified: [],
      timestamp: Date.now(),
    }

    this.compareValues(oldData, newData, path, changes)

    return changes
  }

  private pathToKey(path: (string | number)[]): string {
    if (path.length === 0) return ''

    let result = ''
    for (let i = 0; i < path.length; i++) {
      const part = path[i]
      if (typeof part === 'number') {
        result += `[${part}]`
      } else if (i === 0) {
        result = part
      } else {
        result += `.${part}`
      }
    }
    return result
  }

  private emitEvent(
    type: 'change' | 'add' | 'remove' | 'modify',
    changes: ChangeSet,
    oldData: unknown,
    newData: unknown
  ): void {
    const event: ChangeEvent = {
      type,
      changes,
      timestamp: Date.now(),
      oldData,
      newData,
    }

    const handlers = this.eventHandlers.get(type)
    if (handlers) {
      for (const handler of handlers) {
        handler(event)
      }
    }
  }

  private isQueryAffected(
    dependency: QueryDependency,
    changes: ChangeSet
  ): boolean {
    const allChanges = [
      ...changes.added,
      ...changes.removed,
      ...changes.modified,
    ]

    for (const change of allChanges) {
      const changePath = change.path

      // Check if the change affects any of the dependency tables
      for (const table of dependency.tables) {
        if (changePath.length > 0 && changePath[0] === table) {
          // If no specific fields are tracked, any change to the table affects the query
          if (!dependency.fields || dependency.fields.length === 0) {
            return true
          }

          // Check if the changed field is in the dependency list
          const fieldPath = changePath.slice(2).join('.')

          for (const depField of dependency.fields) {
            // Handle wildcard matching
            if (depField.endsWith('.*')) {
              const prefix = depField.slice(0, -2)
              if (fieldPath.startsWith(prefix)) {
                return true
              }
            } else if (
              fieldPath === depField ||
              fieldPath.startsWith(depField + '.')
            ) {
              return true
            }
          }
        }
      }
    }

    return false
  }
}

// ============================================================================
// Standalone Functions
// ============================================================================

/**
 * Detect changes between two data states
 */
export function detectChanges(oldData: unknown, newData: unknown): ChangeSet {
  const detector = new ChangeDetector()
  return detector.detectChanges(oldData, newData)
}

/**
 * Get a diff object showing old and new values for each changed field
 */
export function getDiff(oldData: unknown, newData: unknown): ChangeDiff {
  const detector = new ChangeDetector()
  return detector.getDiff(oldData, newData)
}

/**
 * Check if there are any changes between two data states
 */
export function hasChanges(oldData: unknown, newData: unknown): boolean {
  const detector = new ChangeDetector()
  return detector.hasChanges(oldData, newData)
}
