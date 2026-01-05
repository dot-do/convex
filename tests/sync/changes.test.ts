/**
 * TDD RED Phase Tests for Change Detection System
 *
 * These tests define the expected interface and behavior for the change detection system.
 * The implementation does not yet exist, so all tests should FAIL initially.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Import from the module that will contain the implementation
import {
  ChangeDetector,
  ChangeSet,
  ChangeDiff,
  ChangeType,
  ChangeEvent,
  detectChanges,
  getDiff,
  hasChanges,
} from '../../src/sync/changes'

// ============================================================================
// ChangeDetector Class Tests
// ============================================================================

describe('ChangeDetector Class', () => {
  describe('Constructor and basic structure', () => {
    it('should create a ChangeDetector instance', () => {
      const detector = new ChangeDetector()
      expect(detector).toBeInstanceOf(ChangeDetector)
    })

    it('should have detectChanges method', () => {
      const detector = new ChangeDetector()
      expect(typeof detector.detectChanges).toBe('function')
    })

    it('should have getDiff method', () => {
      const detector = new ChangeDetector()
      expect(typeof detector.getDiff).toBe('function')
    })

    it('should have hasChanges method', () => {
      const detector = new ChangeDetector()
      expect(typeof detector.hasChanges).toBe('function')
    })

    it('should have getAffectedQueries method', () => {
      const detector = new ChangeDetector()
      expect(typeof detector.getAffectedQueries).toBe('function')
    })

    it('should have on method for event subscription', () => {
      const detector = new ChangeDetector()
      expect(typeof detector.on).toBe('function')
    })

    it('should have off method for event unsubscription', () => {
      const detector = new ChangeDetector()
      expect(typeof detector.off).toBe('function')
    })

    it('should accept options in constructor', () => {
      const detector = new ChangeDetector({
        deepCompare: true,
        trackArrayOrder: true,
      })
      expect(detector).toBeInstanceOf(ChangeDetector)
    })
  })

  describe('Configuration options', () => {
    it('should respect deepCompare option', () => {
      const detector = new ChangeDetector({ deepCompare: true })
      const oldData = { nested: { value: 1 } }
      const newData = { nested: { value: 2 } }

      const changes = detector.detectChanges(oldData, newData)
      expect(changes.modified.length).toBeGreaterThan(0)
    })

    it('should respect trackArrayOrder option', () => {
      const detector = new ChangeDetector({ trackArrayOrder: true })
      const oldData = { items: [1, 2, 3] }
      const newData = { items: [3, 2, 1] }

      const changes = detector.detectChanges(oldData, newData)
      expect(changes.modified.length).toBeGreaterThan(0)
    })

    it('should not detect changes for reordered arrays when trackArrayOrder is false', () => {
      const detector = new ChangeDetector({ trackArrayOrder: false })
      const oldData = { items: [1, 2, 3] }
      const newData = { items: [3, 2, 1] }

      const hasChange = detector.hasChanges(oldData, newData)
      expect(hasChange).toBe(false)
    })

    it('should allow custom equality function', () => {
      const detector = new ChangeDetector({
        isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      })

      const hasChange = detector.hasChanges({ a: 1 }, { a: 1 })
      expect(hasChange).toBe(false)
    })
  })
})

// ============================================================================
// detectChanges Method Tests
// ============================================================================

describe('detectChanges Method', () => {
  let detector: ChangeDetector

  beforeEach(() => {
    detector = new ChangeDetector()
  })

  describe('Return structure (ChangeSet)', () => {
    it('should return a ChangeSet object', () => {
      const changes = detector.detectChanges({}, {})
      expect(changes).toHaveProperty('added')
      expect(changes).toHaveProperty('removed')
      expect(changes).toHaveProperty('modified')
    })

    it('should have added array in ChangeSet', () => {
      const changes = detector.detectChanges({}, {})
      expect(Array.isArray(changes.added)).toBe(true)
    })

    it('should have removed array in ChangeSet', () => {
      const changes = detector.detectChanges({}, {})
      expect(Array.isArray(changes.removed)).toBe(true)
    })

    it('should have modified array in ChangeSet', () => {
      const changes = detector.detectChanges({}, {})
      expect(Array.isArray(changes.modified)).toBe(true)
    })

    it('should include timestamp in ChangeSet', () => {
      const changes = detector.detectChanges({}, {})
      expect(typeof changes.timestamp).toBe('number')
    })
  })

  describe('Detecting added items', () => {
    it('should detect single added property', () => {
      const oldData = {}
      const newData = { name: 'Alice' }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(1)
      expect(changes.added[0].path).toEqual(['name'])
      expect(changes.added[0].value).toBe('Alice')
    })

    it('should detect multiple added properties', () => {
      const oldData = {}
      const newData = { name: 'Alice', age: 30, active: true }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(3)
    })

    it('should detect nested added properties', () => {
      const oldData = { user: {} }
      const newData = { user: { name: 'Alice' } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(1)
      expect(changes.added[0].path).toEqual(['user', 'name'])
    })

    it('should detect deeply nested added properties', () => {
      const oldData = { level1: { level2: {} } }
      const newData = { level1: { level2: { level3: { value: 'deep' } } } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.some((c) => c.path.includes('level3'))).toBe(true)
    })

    it('should detect added array elements', () => {
      const oldData = { items: ['a', 'b'] }
      const newData = { items: ['a', 'b', 'c'] }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(1)
      expect(changes.added[0].value).toBe('c')
    })
  })

  describe('Detecting removed items', () => {
    it('should detect single removed property', () => {
      const oldData = { name: 'Alice' }
      const newData = {}

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.removed.length).toBe(1)
      expect(changes.removed[0].path).toEqual(['name'])
      expect(changes.removed[0].value).toBe('Alice')
    })

    it('should detect multiple removed properties', () => {
      const oldData = { name: 'Alice', age: 30, active: true }
      const newData = {}

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.removed.length).toBe(3)
    })

    it('should detect nested removed properties', () => {
      const oldData = { user: { name: 'Alice' } }
      const newData = { user: {} }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.removed.length).toBe(1)
      expect(changes.removed[0].path).toEqual(['user', 'name'])
    })

    it('should detect removed array elements', () => {
      const oldData = { items: ['a', 'b', 'c'] }
      const newData = { items: ['a', 'b'] }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.removed.length).toBe(1)
      expect(changes.removed[0].value).toBe('c')
    })
  })

  describe('Detecting modified items', () => {
    it('should detect single modified property', () => {
      const oldData = { name: 'Alice' }
      const newData = { name: 'Alicia' }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
      expect(changes.modified[0].path).toEqual(['name'])
      expect(changes.modified[0].oldValue).toBe('Alice')
      expect(changes.modified[0].newValue).toBe('Alicia')
    })

    it('should detect type change as modification', () => {
      const oldData = { value: '42' }
      const newData = { value: 42 }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
      expect(changes.modified[0].oldValue).toBe('42')
      expect(changes.modified[0].newValue).toBe(42)
    })

    it('should detect nested modified properties', () => {
      const oldData = { user: { name: 'Alice' } }
      const newData = { user: { name: 'Alicia' } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
      expect(changes.modified[0].path).toEqual(['user', 'name'])
    })

    it('should detect modified array elements', () => {
      const oldData = { items: ['a', 'b', 'c'] }
      const newData = { items: ['a', 'B', 'c'] }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
      expect(changes.modified[0].oldValue).toBe('b')
      expect(changes.modified[0].newValue).toBe('B')
    })
  })

  describe('Document-level change detection', () => {
    it('should detect added documents in array', () => {
      const oldData = [{ _id: '1', name: 'Alice' }]
      const newData = [
        { _id: '1', name: 'Alice' },
        { _id: '2', name: 'Bob' },
      ]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(1)
      expect(changes.added[0].value._id).toBe('2')
    })

    it('should detect removed documents in array', () => {
      const oldData = [
        { _id: '1', name: 'Alice' },
        { _id: '2', name: 'Bob' },
      ]
      const newData = [{ _id: '1', name: 'Alice' }]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.removed.length).toBe(1)
      expect(changes.removed[0].value._id).toBe('2')
    })

    it('should detect modified documents in array', () => {
      const oldData = [{ _id: '1', name: 'Alice' }]
      const newData = [{ _id: '1', name: 'Alicia' }]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
    })

    it('should use _id field for document identity by default', () => {
      const detector = new ChangeDetector({ identityField: '_id' })
      const oldData = [{ _id: '1', name: 'Alice', order: 1 }]
      const newData = [{ _id: '1', name: 'Alice', order: 2 }]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
    })

    it('should support custom identity field', () => {
      const detector = new ChangeDetector({ identityField: 'id' })
      const oldData = [{ id: 'doc1', name: 'Alice' }]
      const newData = [{ id: 'doc1', name: 'Alicia' }]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
    })
  })

  describe('Mixed changes', () => {
    it('should detect added, removed, and modified in same operation', () => {
      const oldData = { a: 1, b: 2, c: 3 }
      const newData = { a: 10, c: 3, d: 4 }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(1) // d
      expect(changes.removed.length).toBe(1) // b
      expect(changes.modified.length).toBe(1) // a
    })

    it('should handle complex nested mixed changes', () => {
      const oldData = {
        users: [
          { _id: '1', name: 'Alice', profile: { age: 25 } },
          { _id: '2', name: 'Bob', profile: { age: 30 } },
        ],
      }
      const newData = {
        users: [
          { _id: '1', name: 'Alice', profile: { age: 26 } },
          { _id: '3', name: 'Charlie', profile: { age: 35 } },
        ],
      }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBeGreaterThan(0) // Charlie
      expect(changes.removed.length).toBeGreaterThan(0) // Bob
      expect(changes.modified.length).toBeGreaterThan(0) // Alice's age
    })
  })
})

// ============================================================================
// getDiff Method Tests
// ============================================================================

describe('getDiff Method', () => {
  let detector: ChangeDetector

  beforeEach(() => {
    detector = new ChangeDetector()
  })

  describe('Basic diff structure', () => {
    it('should return a ChangeDiff object', () => {
      const diff = detector.getDiff({}, {})
      expect(diff).toBeDefined()
      expect(typeof diff).toBe('object')
    })

    it('should return empty object for identical data', () => {
      const diff = detector.getDiff({ a: 1 }, { a: 1 })
      expect(Object.keys(diff)).toHaveLength(0)
    })
  })

  describe('Property diffs', () => {
    it('should show old and new values for modified properties', () => {
      const oldDoc = { name: 'Alice' }
      const newDoc = { name: 'Alicia' }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff.name).toEqual({ old: 'Alice', new: 'Alicia' })
    })

    it('should show undefined as old for added properties', () => {
      const oldDoc = {}
      const newDoc = { name: 'Alice' }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff.name).toEqual({ old: undefined, new: 'Alice' })
    })

    it('should show undefined as new for removed properties', () => {
      const oldDoc = { name: 'Alice' }
      const newDoc = {}

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff.name).toEqual({ old: 'Alice', new: undefined })
    })

    it('should handle multiple property changes', () => {
      const oldDoc = { name: 'Alice', age: 25, city: 'NYC' }
      const newDoc = { name: 'Alicia', age: 26, city: 'NYC' }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff.name).toEqual({ old: 'Alice', new: 'Alicia' })
      expect(diff.age).toEqual({ old: 25, new: 26 })
      expect(diff.city).toBeUndefined()
    })
  })

  describe('Nested object diffs', () => {
    it('should show nested property changes', () => {
      const oldDoc = { profile: { email: 'alice@old.com' } }
      const newDoc = { profile: { email: 'alice@new.com' } }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff['profile.email']).toEqual({
        old: 'alice@old.com',
        new: 'alice@new.com',
      })
    })

    it('should handle deeply nested changes', () => {
      const oldDoc = { a: { b: { c: { d: 1 } } } }
      const newDoc = { a: { b: { c: { d: 2 } } } }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff['a.b.c.d']).toEqual({ old: 1, new: 2 })
    })

    it('should handle nested object replacement', () => {
      const oldDoc = { profile: { name: 'Alice' } }
      const newDoc = { profile: { name: 'Bob', age: 30 } }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff['profile.name']).toEqual({ old: 'Alice', new: 'Bob' })
      expect(diff['profile.age']).toEqual({ old: undefined, new: 30 })
    })
  })

  describe('Array diffs', () => {
    it('should show array element changes', () => {
      const oldDoc = { tags: ['a', 'b', 'c'] }
      const newDoc = { tags: ['a', 'B', 'c'] }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff['tags[1]']).toEqual({ old: 'b', new: 'B' })
    })

    it('should show added array elements', () => {
      const oldDoc = { tags: ['a', 'b'] }
      const newDoc = { tags: ['a', 'b', 'c'] }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff['tags[2]']).toEqual({ old: undefined, new: 'c' })
    })

    it('should show removed array elements', () => {
      const oldDoc = { tags: ['a', 'b', 'c'] }
      const newDoc = { tags: ['a', 'b'] }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff['tags[2]']).toEqual({ old: 'c', new: undefined })
    })

    it('should handle array of objects', () => {
      const oldDoc = { items: [{ id: 1, name: 'First' }] }
      const newDoc = { items: [{ id: 1, name: 'Updated' }] }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff['items[0].name']).toEqual({ old: 'First', new: 'Updated' })
    })
  })

  describe('Type changes', () => {
    it('should detect type changes', () => {
      const oldDoc = { value: '42' }
      const newDoc = { value: 42 }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff.value).toEqual({ old: '42', new: 42 })
    })

    it('should handle null to value change', () => {
      const oldDoc = { value: null }
      const newDoc = { value: 'hello' }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff.value).toEqual({ old: null, new: 'hello' })
    })

    it('should handle value to null change', () => {
      const oldDoc = { value: 'hello' }
      const newDoc = { value: null }

      const diff = detector.getDiff(oldDoc, newDoc)

      expect(diff.value).toEqual({ old: 'hello', new: null })
    })
  })
})

// ============================================================================
// hasChanges Method Tests
// ============================================================================

describe('hasChanges Method', () => {
  let detector: ChangeDetector

  beforeEach(() => {
    detector = new ChangeDetector()
  })

  describe('Identical data', () => {
    it('should return false for identical primitive values', () => {
      expect(detector.hasChanges(42, 42)).toBe(false)
      expect(detector.hasChanges('hello', 'hello')).toBe(false)
      expect(detector.hasChanges(true, true)).toBe(false)
      expect(detector.hasChanges(null, null)).toBe(false)
    })

    it('should return false for identical objects', () => {
      expect(detector.hasChanges({ a: 1 }, { a: 1 })).toBe(false)
    })

    it('should return false for identical arrays', () => {
      expect(detector.hasChanges([1, 2, 3], [1, 2, 3])).toBe(false)
    })

    it('should return false for identical nested structures', () => {
      const data = {
        users: [
          { name: 'Alice', tags: ['admin'] },
          { name: 'Bob', tags: ['user'] },
        ],
      }
      expect(detector.hasChanges(data, JSON.parse(JSON.stringify(data)))).toBe(
        false
      )
    })

    it('should return false for empty objects', () => {
      expect(detector.hasChanges({}, {})).toBe(false)
    })

    it('should return false for empty arrays', () => {
      expect(detector.hasChanges([], [])).toBe(false)
    })
  })

  describe('Different data', () => {
    it('should return true for different primitive values', () => {
      expect(detector.hasChanges(42, 43)).toBe(true)
      expect(detector.hasChanges('hello', 'world')).toBe(true)
      expect(detector.hasChanges(true, false)).toBe(true)
    })

    it('should return true for different types', () => {
      expect(detector.hasChanges('42', 42)).toBe(true)
      expect(detector.hasChanges(null, undefined)).toBe(true)
      expect(detector.hasChanges([], {})).toBe(true)
    })

    it('should return true for objects with different values', () => {
      expect(detector.hasChanges({ a: 1 }, { a: 2 })).toBe(true)
    })

    it('should return true for objects with different keys', () => {
      expect(detector.hasChanges({ a: 1 }, { b: 1 })).toBe(true)
    })

    it('should return true for arrays with different values', () => {
      expect(detector.hasChanges([1, 2, 3], [1, 2, 4])).toBe(true)
    })

    it('should return true for arrays with different lengths', () => {
      expect(detector.hasChanges([1, 2], [1, 2, 3])).toBe(true)
    })
  })

  describe('Deep comparison', () => {
    it('should detect deep nested changes', () => {
      const oldData = { a: { b: { c: { d: 1 } } } }
      const newData = { a: { b: { c: { d: 2 } } } }

      expect(detector.hasChanges(oldData, newData)).toBe(true)
    })

    it('should detect changes in nested arrays', () => {
      const oldData = { items: [[1, 2], [3, 4]] }
      const newData = { items: [[1, 2], [3, 5]] }

      expect(detector.hasChanges(oldData, newData)).toBe(true)
    })

    it('should detect changes in array of objects', () => {
      const oldData = { users: [{ name: 'Alice' }] }
      const newData = { users: [{ name: 'Alicia' }] }

      expect(detector.hasChanges(oldData, newData)).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('should handle undefined values', () => {
      expect(detector.hasChanges(undefined, undefined)).toBe(false)
      expect(detector.hasChanges(undefined, null)).toBe(true)
      expect(detector.hasChanges({ a: undefined }, {})).toBe(true)
    })

    it('should handle NaN values', () => {
      expect(detector.hasChanges(NaN, NaN)).toBe(false)
      expect(detector.hasChanges(NaN, 0)).toBe(true)
    })

    it('should handle Date objects', () => {
      const date1 = new Date('2024-01-01')
      const date2 = new Date('2024-01-01')
      const date3 = new Date('2024-01-02')

      expect(detector.hasChanges(date1, date2)).toBe(false)
      expect(detector.hasChanges(date1, date3)).toBe(true)
    })

    it('should handle RegExp objects', () => {
      expect(detector.hasChanges(/abc/, /abc/)).toBe(false)
      expect(detector.hasChanges(/abc/, /def/)).toBe(true)
    })

    it('should handle sparse arrays', () => {
      const sparse1 = [1, , 3] // eslint-disable-line no-sparse-arrays
      const sparse2 = [1, , 3] // eslint-disable-line no-sparse-arrays
      const sparse3 = [1, 2, 3]

      expect(detector.hasChanges(sparse1, sparse2)).toBe(false)
      expect(detector.hasChanges(sparse1, sparse3)).toBe(true)
    })
  })
})

// ============================================================================
// Deep Object Comparison Tests
// ============================================================================

describe('Deep Object Comparison', () => {
  let detector: ChangeDetector

  beforeEach(() => {
    detector = new ChangeDetector({ deepCompare: true })
  })

  describe('Object equality', () => {
    it('should consider objects with same properties equal', () => {
      const obj1 = { a: 1, b: 2, c: 3 }
      const obj2 = { a: 1, b: 2, c: 3 }

      expect(detector.hasChanges(obj1, obj2)).toBe(false)
    })

    it('should consider objects with different property order equal', () => {
      const obj1 = { a: 1, b: 2, c: 3 }
      const obj2 = { c: 3, b: 2, a: 1 }

      expect(detector.hasChanges(obj1, obj2)).toBe(false)
    })

    it('should detect missing properties', () => {
      const obj1 = { a: 1, b: 2, c: 3 }
      const obj2 = { a: 1, b: 2 }

      expect(detector.hasChanges(obj1, obj2)).toBe(true)
    })

    it('should detect extra properties', () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { a: 1, b: 2, c: 3 }

      expect(detector.hasChanges(obj1, obj2)).toBe(true)
    })
  })

  describe('Nested object comparison', () => {
    it('should compare nested objects deeply', () => {
      const obj1 = { level1: { level2: { value: 'same' } } }
      const obj2 = { level1: { level2: { value: 'same' } } }

      expect(detector.hasChanges(obj1, obj2)).toBe(false)
    })

    it('should detect deep nested changes', () => {
      const obj1 = { level1: { level2: { value: 'old' } } }
      const obj2 = { level1: { level2: { value: 'new' } } }

      expect(detector.hasChanges(obj1, obj2)).toBe(true)
    })

    it('should handle mixed nesting levels', () => {
      const obj1 = { a: 1, b: { c: 2, d: { e: 3 } } }
      const obj2 = { a: 1, b: { c: 2, d: { e: 3 } } }

      expect(detector.hasChanges(obj1, obj2)).toBe(false)
    })
  })

  describe('Object with array values', () => {
    it('should compare arrays within objects', () => {
      const obj1 = { items: [1, 2, 3], name: 'test' }
      const obj2 = { items: [1, 2, 3], name: 'test' }

      expect(detector.hasChanges(obj1, obj2)).toBe(false)
    })

    it('should detect array changes within objects', () => {
      const obj1 = { items: [1, 2, 3], name: 'test' }
      const obj2 = { items: [1, 2, 4], name: 'test' }

      expect(detector.hasChanges(obj1, obj2)).toBe(true)
    })
  })

  describe('Special object types', () => {
    it('should compare Date objects by value', () => {
      const obj1 = { date: new Date('2024-01-01') }
      const obj2 = { date: new Date('2024-01-01') }

      expect(detector.hasChanges(obj1, obj2)).toBe(false)
    })

    it('should compare Map objects', () => {
      const map1 = new Map([
        ['a', 1],
        ['b', 2],
      ])
      const map2 = new Map([
        ['a', 1],
        ['b', 2],
      ])

      expect(detector.hasChanges({ data: map1 }, { data: map2 })).toBe(false)
    })

    it('should compare Set objects', () => {
      const set1 = new Set([1, 2, 3])
      const set2 = new Set([1, 2, 3])

      expect(detector.hasChanges({ data: set1 }, { data: set2 })).toBe(false)
    })
  })
})

// ============================================================================
// Array Changes Tests
// ============================================================================

describe('Array Changes', () => {
  let detector: ChangeDetector

  beforeEach(() => {
    detector = new ChangeDetector()
  })

  describe('Add operations', () => {
    it('should detect single item added to end', () => {
      const oldData = [1, 2, 3]
      const newData = [1, 2, 3, 4]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(1)
      expect(changes.added[0].value).toBe(4)
    })

    it('should detect single item added to beginning', () => {
      const oldData = [2, 3, 4]
      const newData = [1, 2, 3, 4]

      const changes = detector.detectChanges(oldData, newData)

      // Index-based comparison: [0]:2→1, [1]:3→2, [2]:4→3, [3]:undefined→4
      // Detects modifications at shifted indices plus one added item
      const totalChanges = changes.added.length + changes.modified.length
      expect(totalChanges).toBeGreaterThan(0)
    })

    it('should detect multiple items added', () => {
      const oldData = [1]
      const newData = [1, 2, 3, 4]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(3)
    })

    it('should detect item added to middle', () => {
      const oldData = [1, 3]
      const newData = [1, 2, 3]

      const changes = detector.detectChanges(oldData, newData)

      // Index-based comparison: [0]:1→1, [1]:3→2, [2]:undefined→3
      // Detects modification at index 1 plus added item at index 2
      const totalChanges = changes.added.length + changes.modified.length
      expect(totalChanges).toBeGreaterThan(0)
    })
  })

  describe('Remove operations', () => {
    it('should detect single item removed from end', () => {
      const oldData = [1, 2, 3, 4]
      const newData = [1, 2, 3]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.removed.length).toBe(1)
      expect(changes.removed[0].value).toBe(4)
    })

    it('should detect single item removed from beginning', () => {
      const oldData = [1, 2, 3, 4]
      const newData = [2, 3, 4]

      const changes = detector.detectChanges(oldData, newData)

      // Index-based comparison: shifts cause modifications, plus one removed
      const totalChanges = changes.removed.length + changes.modified.length
      expect(totalChanges).toBeGreaterThan(0)
    })

    it('should detect multiple items removed', () => {
      const oldData = [1, 2, 3, 4]
      const newData = [1]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.removed.length).toBe(3)
    })

    it('should detect item removed from middle', () => {
      const oldData = [1, 2, 3]
      const newData = [1, 3]

      const changes = detector.detectChanges(oldData, newData)

      // Index-based comparison: [0]:1→1, [1]:2→3, [2]:3→undefined
      // Detects modification at index 1 plus removed item at index 2
      const totalChanges = changes.removed.length + changes.modified.length
      expect(totalChanges).toBeGreaterThan(0)
    })
  })

  describe('Update operations', () => {
    it('should detect single item updated', () => {
      const oldData = [1, 2, 3]
      const newData = [1, 20, 3]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
      expect(changes.modified[0].oldValue).toBe(2)
      expect(changes.modified[0].newValue).toBe(20)
    })

    it('should detect multiple items updated', () => {
      const oldData = [1, 2, 3]
      const newData = [10, 20, 30]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(3)
    })
  })

  describe('Array of objects', () => {
    it('should detect object added to array', () => {
      const oldData = [{ _id: '1', name: 'Alice' }]
      const newData = [
        { _id: '1', name: 'Alice' },
        { _id: '2', name: 'Bob' },
      ]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(1)
      expect(changes.added[0].value._id).toBe('2')
    })

    it('should detect object removed from array', () => {
      const oldData = [
        { _id: '1', name: 'Alice' },
        { _id: '2', name: 'Bob' },
      ]
      const newData = [{ _id: '1', name: 'Alice' }]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.removed.length).toBe(1)
      expect(changes.removed[0].value._id).toBe('2')
    })

    it('should detect object property modified in array', () => {
      const oldData = [{ _id: '1', name: 'Alice' }]
      const newData = [{ _id: '1', name: 'Alicia' }]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBeGreaterThan(0)
    })
  })

  describe('Mixed array operations', () => {
    it('should detect add, remove, and update simultaneously', () => {
      const oldData = [
        { _id: '1', name: 'Alice' },
        { _id: '2', name: 'Bob' },
      ]
      const newData = [
        { _id: '1', name: 'Alicia' },
        { _id: '3', name: 'Charlie' },
      ]

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBeGreaterThan(0) // Charlie
      expect(changes.removed.length).toBeGreaterThan(0) // Bob
      expect(changes.modified.length).toBeGreaterThan(0) // Alice -> Alicia
    })
  })
})

// ============================================================================
// Nested Object Changes Tests
// ============================================================================

describe('Nested Object Changes', () => {
  let detector: ChangeDetector

  beforeEach(() => {
    detector = new ChangeDetector({ deepCompare: true })
  })

  describe('Single level nesting', () => {
    it('should detect nested property added', () => {
      const oldData = { user: { name: 'Alice' } }
      const newData = { user: { name: 'Alice', email: 'alice@example.com' } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(1)
      expect(changes.added[0].path).toEqual(['user', 'email'])
    })

    it('should detect nested property removed', () => {
      const oldData = { user: { name: 'Alice', email: 'alice@example.com' } }
      const newData = { user: { name: 'Alice' } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.removed.length).toBe(1)
      expect(changes.removed[0].path).toEqual(['user', 'email'])
    })

    it('should detect nested property modified', () => {
      const oldData = { user: { name: 'Alice' } }
      const newData = { user: { name: 'Alicia' } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
      expect(changes.modified[0].path).toEqual(['user', 'name'])
    })
  })

  describe('Deep nesting', () => {
    it('should detect changes at depth 3', () => {
      const oldData = { a: { b: { c: 'old' } } }
      const newData = { a: { b: { c: 'new' } } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
      expect(changes.modified[0].path).toEqual(['a', 'b', 'c'])
    })

    it('should detect changes at depth 5', () => {
      const oldData = { l1: { l2: { l3: { l4: { l5: 'old' } } } } }
      const newData = { l1: { l2: { l3: { l4: { l5: 'new' } } } } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
      expect(changes.modified[0].path).toEqual(['l1', 'l2', 'l3', 'l4', 'l5'])
    })
  })

  describe('Object replacement', () => {
    it('should detect when nested object is replaced entirely', () => {
      const oldData = { config: { theme: 'dark', lang: 'en' } }
      const newData = { config: { theme: 'light', size: 'large' } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBeGreaterThan(0) // size
      expect(changes.removed.length).toBeGreaterThan(0) // lang
      expect(changes.modified.length).toBeGreaterThan(0) // theme
    })

    it('should detect when object becomes null', () => {
      const oldData = { config: { theme: 'dark' } }
      const newData = { config: null }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBeGreaterThan(0)
    })

    it('should detect when null becomes object', () => {
      const oldData = { config: null }
      const newData = { config: { theme: 'dark' } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBeGreaterThan(0)
    })
  })

  describe('Arrays within nested objects', () => {
    it('should detect array changes in nested objects', () => {
      const oldData = { user: { tags: ['a', 'b'] } }
      const newData = { user: { tags: ['a', 'b', 'c'] } }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.added.length).toBe(1)
    })

    it('should detect nested object changes within arrays', () => {
      const oldData = { users: [{ profile: { score: 10 } }] }
      const newData = { users: [{ profile: { score: 20 } }] }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1)
    })
  })
})

// ============================================================================
// Change Event Emission Tests
// ============================================================================

describe('Change Event Emission', () => {
  let detector: ChangeDetector

  beforeEach(() => {
    detector = new ChangeDetector()
  })

  describe('Event subscription', () => {
    it('should emit change event when changes detected', () => {
      const handler = vi.fn()
      detector.on('change', handler)

      detector.detectChanges({ a: 1 }, { a: 2 })

      expect(handler).toHaveBeenCalled()
    })

    it('should not emit change event when no changes', () => {
      const handler = vi.fn()
      detector.on('change', handler)

      detector.detectChanges({ a: 1 }, { a: 1 })

      expect(handler).not.toHaveBeenCalled()
    })

    it('should pass ChangeEvent to handler', () => {
      const handler = vi.fn()
      detector.on('change', handler)

      detector.detectChanges({ a: 1 }, { a: 2 })

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'change',
          changes: expect.any(Object),
        })
      )
    })
  })

  describe('Specific change events', () => {
    it('should emit add event for additions', () => {
      const handler = vi.fn()
      detector.on('add', handler)

      detector.detectChanges({}, { name: 'Alice' })

      expect(handler).toHaveBeenCalled()
    })

    it('should emit remove event for removals', () => {
      const handler = vi.fn()
      detector.on('remove', handler)

      detector.detectChanges({ name: 'Alice' }, {})

      expect(handler).toHaveBeenCalled()
    })

    it('should emit modify event for modifications', () => {
      const handler = vi.fn()
      detector.on('modify', handler)

      detector.detectChanges({ name: 'Alice' }, { name: 'Alicia' })

      expect(handler).toHaveBeenCalled()
    })
  })

  describe('Event unsubscription', () => {
    it('should not receive events after unsubscribe', () => {
      const handler = vi.fn()
      detector.on('change', handler)
      detector.off('change', handler)

      detector.detectChanges({ a: 1 }, { a: 2 })

      expect(handler).not.toHaveBeenCalled()
    })

    it('should handle multiple handlers', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      detector.on('change', handler1)
      detector.on('change', handler2)

      detector.detectChanges({ a: 1 }, { a: 2 })

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('should only remove specific handler', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      detector.on('change', handler1)
      detector.on('change', handler2)
      detector.off('change', handler1)

      detector.detectChanges({ a: 1 }, { a: 2 })

      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })
  })

  describe('Event data structure', () => {
    it('should include timestamp in event', () => {
      let receivedEvent: ChangeEvent | null = null
      detector.on('change', (event) => {
        receivedEvent = event
      })

      detector.detectChanges({ a: 1 }, { a: 2 })

      expect(receivedEvent).not.toBeNull()
      expect(typeof receivedEvent!.timestamp).toBe('number')
    })

    it('should include source data reference in event', () => {
      let receivedEvent: ChangeEvent | null = null
      detector.on('change', (event) => {
        receivedEvent = event
      })

      const oldData = { a: 1 }
      const newData = { a: 2 }
      detector.detectChanges(oldData, newData)

      expect(receivedEvent).not.toBeNull()
      expect(receivedEvent!.oldData).toBe(oldData)
      expect(receivedEvent!.newData).toBe(newData)
    })
  })
})

// ============================================================================
// Affected Query Detection Tests
// ============================================================================

describe('Affected Query Detection', () => {
  describe('Query registration', () => {
    it('should allow registering queries with table dependencies', () => {
      const detector = new ChangeDetector()

      detector.registerQuery('query1', {
        tables: ['users'],
        fields: ['name', 'email'],
      })

      expect(detector.getRegisteredQueries()).toContain('query1')
    })

    it('should allow registering queries with field dependencies', () => {
      const detector = new ChangeDetector()

      detector.registerQuery('query2', {
        tables: ['users'],
        fields: ['profile.avatar'],
      })

      expect(detector.getRegisteredQueries()).toContain('query2')
    })

    it('should allow unregistering queries', () => {
      const detector = new ChangeDetector()

      detector.registerQuery('query1', { tables: ['users'] })
      detector.unregisterQuery('query1')

      expect(detector.getRegisteredQueries()).not.toContain('query1')
    })
  })

  describe('Finding affected queries', () => {
    it('should find queries affected by table changes', () => {
      const detector = new ChangeDetector()

      detector.registerQuery('usersQuery', { tables: ['users'] })
      detector.registerQuery('postsQuery', { tables: ['posts'] })

      const changes: ChangeSet = {
        added: [{ path: ['users', '1'], value: { name: 'Alice' } }],
        removed: [],
        modified: [],
        timestamp: Date.now(),
      }

      const affected = detector.getAffectedQueries(changes)

      expect(affected).toContain('usersQuery')
      expect(affected).not.toContain('postsQuery')
    })

    it('should find queries affected by field changes', () => {
      const detector = new ChangeDetector()

      detector.registerQuery('nameQuery', {
        tables: ['users'],
        fields: ['name'],
      })
      detector.registerQuery('emailQuery', {
        tables: ['users'],
        fields: ['email'],
      })

      const changes: ChangeSet = {
        added: [],
        removed: [],
        modified: [
          {
            path: ['users', '1', 'name'],
            oldValue: 'Alice',
            newValue: 'Alicia',
          },
        ],
        timestamp: Date.now(),
      }

      const affected = detector.getAffectedQueries(changes)

      expect(affected).toContain('nameQuery')
      expect(affected).not.toContain('emailQuery')
    })

    it('should return all table queries when any field changes', () => {
      const detector = new ChangeDetector()

      detector.registerQuery('allUsersQuery', {
        tables: ['users'],
        fields: [], // All fields
      })

      const changes: ChangeSet = {
        added: [],
        removed: [],
        modified: [{ path: ['users', '1', 'anyField'], oldValue: 1, newValue: 2 }],
        timestamp: Date.now(),
      }

      const affected = detector.getAffectedQueries(changes)

      expect(affected).toContain('allUsersQuery')
    })
  })

  describe('Complex query dependencies', () => {
    it('should handle queries with multiple table dependencies', () => {
      const detector = new ChangeDetector()

      detector.registerQuery('joinQuery', {
        tables: ['users', 'posts'],
      })

      const changes: ChangeSet = {
        added: [{ path: ['posts', '1'], value: { title: 'New Post' } }],
        removed: [],
        modified: [],
        timestamp: Date.now(),
      }

      const affected = detector.getAffectedQueries(changes)

      expect(affected).toContain('joinQuery')
    })

    it('should handle nested field dependencies', () => {
      const detector = new ChangeDetector()

      detector.registerQuery('profileQuery', {
        tables: ['users'],
        fields: ['profile.settings.theme'],
      })

      const changes: ChangeSet = {
        added: [],
        removed: [],
        modified: [
          {
            path: ['users', '1', 'profile', 'settings', 'theme'],
            oldValue: 'dark',
            newValue: 'light',
          },
        ],
        timestamp: Date.now(),
      }

      const affected = detector.getAffectedQueries(changes)

      expect(affected).toContain('profileQuery')
    })

    it('should handle wildcard field dependencies', () => {
      const detector = new ChangeDetector()

      detector.registerQuery('anySettingQuery', {
        tables: ['users'],
        fields: ['profile.settings.*'],
      })

      const changes: ChangeSet = {
        added: [],
        removed: [],
        modified: [
          {
            path: ['users', '1', 'profile', 'settings', 'newSetting'],
            oldValue: undefined,
            newValue: 'value',
          },
        ],
        timestamp: Date.now(),
      }

      const affected = detector.getAffectedQueries(changes)

      expect(affected).toContain('anySettingQuery')
    })
  })

  describe('Query invalidation batch', () => {
    it('should return unique list of affected queries', () => {
      const detector = new ChangeDetector()

      detector.registerQuery('query1', { tables: ['users'], fields: ['name'] })
      detector.registerQuery('query1', {
        tables: ['users'],
        fields: ['email'],
      }) // Duplicate registration

      const changes: ChangeSet = {
        added: [],
        removed: [],
        modified: [
          { path: ['users', '1', 'name'], oldValue: 'a', newValue: 'b' },
          { path: ['users', '1', 'email'], oldValue: 'a@a.com', newValue: 'b@b.com' },
        ],
        timestamp: Date.now(),
      }

      const affected = detector.getAffectedQueries(changes)

      const uniqueQueries = [...new Set(affected)]
      expect(affected).toEqual(uniqueQueries)
    })
  })
})

// ============================================================================
// Standalone Function Tests
// ============================================================================

describe('Standalone Functions', () => {
  describe('detectChanges function', () => {
    it('should detect changes without creating detector instance', () => {
      const changes = detectChanges({ a: 1 }, { a: 2 })

      expect(changes.modified.length).toBe(1)
    })

    it('should return proper ChangeSet structure', () => {
      const changes = detectChanges({}, { a: 1 })

      expect(changes).toHaveProperty('added')
      expect(changes).toHaveProperty('removed')
      expect(changes).toHaveProperty('modified')
      expect(changes).toHaveProperty('timestamp')
    })
  })

  describe('getDiff function', () => {
    it('should get diff without creating detector instance', () => {
      const diff = getDiff({ name: 'Alice' }, { name: 'Alicia' })

      expect(diff.name).toEqual({ old: 'Alice', new: 'Alicia' })
    })
  })

  describe('hasChanges function', () => {
    it('should check for changes without creating detector instance', () => {
      expect(hasChanges({ a: 1 }, { a: 1 })).toBe(false)
      expect(hasChanges({ a: 1 }, { a: 2 })).toBe(true)
    })
  })
})

// ============================================================================
// Type Exports Tests
// ============================================================================

describe('Type Exports', () => {
  it('should export ChangeType enum', () => {
    expect(ChangeType.ADDED).toBeDefined()
    expect(ChangeType.REMOVED).toBeDefined()
    expect(ChangeType.MODIFIED).toBeDefined()
  })

  it('should export ChangeSet type with correct structure', () => {
    const changeSet: ChangeSet = {
      added: [],
      removed: [],
      modified: [],
      timestamp: Date.now(),
    }

    expect(changeSet).toBeDefined()
  })

  it('should export ChangeDiff type', () => {
    const diff: ChangeDiff = {
      fieldName: { old: 'oldValue', new: 'newValue' },
    }

    expect(diff).toBeDefined()
  })

  it('should export ChangeEvent type', () => {
    const event: ChangeEvent = {
      type: 'change',
      changes: {
        added: [],
        removed: [],
        modified: [],
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
      oldData: {},
      newData: {},
    }

    expect(event).toBeDefined()
  })
})

// ============================================================================
// Edge Cases and Performance Tests
// ============================================================================

describe('Edge Cases', () => {
  let detector: ChangeDetector

  beforeEach(() => {
    detector = new ChangeDetector()
  })

  describe('Empty data handling', () => {
    it('should handle both empty objects', () => {
      const changes = detector.detectChanges({}, {})

      expect(changes.added.length).toBe(0)
      expect(changes.removed.length).toBe(0)
      expect(changes.modified.length).toBe(0)
    })

    it('should handle both empty arrays', () => {
      const changes = detector.detectChanges([], [])

      expect(changes.added.length).toBe(0)
      expect(changes.removed.length).toBe(0)
      expect(changes.modified.length).toBe(0)
    })

    it('should handle null values', () => {
      const changes = detector.detectChanges(null, { a: 1 })

      expect(changes.added.length).toBeGreaterThan(0)
    })

    it('should handle undefined values', () => {
      const changes = detector.detectChanges(undefined, { a: 1 })

      expect(changes.added.length).toBeGreaterThan(0)
    })
  })

  describe('Circular reference handling', () => {
    it('should handle circular references in objects', () => {
      const obj1: Record<string, unknown> = { a: 1 }
      obj1.self = obj1

      const obj2: Record<string, unknown> = { a: 2 }
      obj2.self = obj2

      expect(() => detector.detectChanges(obj1, obj2)).not.toThrow()
    })

    it('should detect changes despite circular references', () => {
      const obj1: Record<string, unknown> = { a: 1 }
      obj1.self = obj1

      const obj2: Record<string, unknown> = { a: 2 }
      obj2.self = obj2

      const changes = detector.detectChanges(obj1, obj2)

      expect(changes.modified.length).toBeGreaterThan(0)
    })
  })

  describe('Large data handling', () => {
    it('should handle objects with many properties', () => {
      const oldData: Record<string, number> = {}
      const newData: Record<string, number> = {}

      for (let i = 0; i < 1000; i++) {
        oldData[`key${i}`] = i
        newData[`key${i}`] = i + 1
      }

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1000)
    })

    it('should handle large arrays', () => {
      const oldData = Array.from({ length: 1000 }, (_, i) => i)
      const newData = Array.from({ length: 1000 }, (_, i) => i + 1)

      const changes = detector.detectChanges(oldData, newData)

      expect(changes.modified.length).toBe(1000)
    })
  })

  describe('Special values', () => {
    it('should handle NaN values', () => {
      expect(detector.hasChanges({ a: NaN }, { a: NaN })).toBe(false)
    })

    it('should handle Infinity values', () => {
      expect(detector.hasChanges({ a: Infinity }, { a: Infinity })).toBe(false)
      expect(detector.hasChanges({ a: Infinity }, { a: -Infinity })).toBe(true)
    })

    it('should handle -0 vs 0', () => {
      // In most cases -0 and 0 are considered equal
      expect(detector.hasChanges({ a: -0 }, { a: 0 })).toBe(false)
    })

    it('should handle BigInt values', () => {
      expect(
        detector.hasChanges({ a: BigInt(123) }, { a: BigInt(123) })
      ).toBe(false)
      expect(
        detector.hasChanges({ a: BigInt(123) }, { a: BigInt(456) })
      ).toBe(true)
    })

    it('should handle Symbol values', () => {
      const sym = Symbol('test')
      expect(detector.hasChanges({ a: sym }, { a: sym })).toBe(false)
    })
  })

  describe('Function properties', () => {
    it('should handle function properties', () => {
      const fn1 = () => {}
      const fn2 = () => {}

      // Different function instances
      expect(detector.hasChanges({ fn: fn1 }, { fn: fn2 })).toBe(true)

      // Same function instance
      expect(detector.hasChanges({ fn: fn1 }, { fn: fn1 })).toBe(false)
    })
  })
})
