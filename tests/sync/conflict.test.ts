/**
 * TDD RED Phase Tests for Conflict Resolution
 *
 * These tests define the expected behavior for the ConflictResolver system.
 * They are designed to FAIL until the implementation is complete.
 *
 * Bead: convex-936.6 - Conflict Resolution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ConflictResolver,
  ConflictStrategy,
  Conflict,
  ConflictType,
  FieldConflict,
  Change,
  ResolvedChange,
  ConflictHandler,
  FieldStrategy,
} from '../../src/sync/conflict'

// ============================================================================
// Test Fixtures
// ============================================================================

function createChange(overrides: Partial<Change> = {}): Change {
  return {
    id: 'change_123',
    documentId: 'doc_456',
    table: 'users',
    type: 'update',
    fields: { name: 'Alice' },
    version: 1,
    timestamp: Date.now(),
    ...overrides,
  }
}

function createLocalChange(overrides: Partial<Change> = {}): Change {
  return createChange({
    id: 'local_change_1',
    fields: { name: 'Alice Local', email: 'alice@local.com' },
    version: 1,
    timestamp: Date.now() - 1000,
    ...overrides,
  })
}

function createServerChange(overrides: Partial<Change> = {}): Change {
  return createChange({
    id: 'server_change_1',
    fields: { name: 'Alice Server', phone: '555-1234' },
    version: 2,
    timestamp: Date.now(),
    ...overrides,
  })
}

// ============================================================================
// ConflictResolver Class Tests
// ============================================================================

describe('ConflictResolver', () => {
  let resolver: ConflictResolver

  beforeEach(() => {
    resolver = new ConflictResolver()
  })

  describe('constructor', () => {
    it('should create resolver with default strategy', () => {
      const resolver = new ConflictResolver()
      expect(resolver.defaultStrategy).toBe('server-wins')
    })

    it('should accept custom default strategy', () => {
      const resolver = new ConflictResolver({ defaultStrategy: 'client-wins' })
      expect(resolver.defaultStrategy).toBe('client-wins')
    })

    it('should accept merge as default strategy', () => {
      const resolver = new ConflictResolver({ defaultStrategy: 'merge' })
      expect(resolver.defaultStrategy).toBe('merge')
    })

    it('should accept manual as default strategy', () => {
      const resolver = new ConflictResolver({ defaultStrategy: 'manual' })
      expect(resolver.defaultStrategy).toBe('manual')
    })

    it('should accept custom conflict handler', () => {
      const handler: ConflictHandler = vi.fn()
      const resolver = new ConflictResolver({ onConflict: handler })
      expect(resolver.conflictHandler).toBe(handler)
    })

    it('should initialize with empty field strategies', () => {
      const resolver = new ConflictResolver()
      expect(resolver.fieldStrategies).toEqual({})
    })
  })

  // ==========================================================================
  // detectConflict() Tests
  // ==========================================================================

  describe('detectConflict()', () => {
    describe('basic conflict detection', () => {
      it('should detect conflict when both changes modify same field', () => {
        const localChange = createLocalChange({
          fields: { name: 'Alice Local' },
        })
        const serverChange = createServerChange({
          fields: { name: 'Alice Server' },
        })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict).not.toBeNull()
        expect(conflict?.type).toBe('field-conflict')
      })

      it('should return null when no conflict exists', () => {
        const localChange = createLocalChange({
          fields: { email: 'alice@local.com' },
        })
        const serverChange = createServerChange({
          fields: { phone: '555-1234' },
        })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict).toBeNull()
      })

      it('should return null when changes are for different documents', () => {
        const localChange = createLocalChange({ documentId: 'doc_1' })
        const serverChange = createServerChange({ documentId: 'doc_2' })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict).toBeNull()
      })

      it('should return null when changes are for different tables', () => {
        const localChange = createLocalChange({ table: 'users' })
        const serverChange = createServerChange({ table: 'profiles' })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict).toBeNull()
      })
    })

    describe('conflict types', () => {
      it('should detect update-update conflict', () => {
        const localChange = createLocalChange({ type: 'update' })
        const serverChange = createServerChange({ type: 'update' })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict).not.toBeNull()
        expect(conflict?.localChange.type).toBe('update')
        expect(conflict?.serverChange.type).toBe('update')
      })

      it('should detect delete-update conflict', () => {
        const localChange = createLocalChange({ type: 'delete', fields: {} })
        const serverChange = createServerChange({ type: 'update' })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict).not.toBeNull()
        expect(conflict?.type).toBe('delete-update')
      })

      it('should detect update-delete conflict', () => {
        const localChange = createLocalChange({ type: 'update' })
        const serverChange = createServerChange({ type: 'delete', fields: {} })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict).not.toBeNull()
        expect(conflict?.type).toBe('update-delete')
      })

      it('should not conflict for delete-delete', () => {
        const localChange = createLocalChange({ type: 'delete', fields: {} })
        const serverChange = createServerChange({ type: 'delete', fields: {} })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict).toBeNull()
      })

      it('should not conflict for insert operations on different documents', () => {
        const localChange = createLocalChange({
          type: 'insert',
          documentId: 'new_doc_1',
        })
        const serverChange = createServerChange({
          type: 'insert',
          documentId: 'new_doc_2',
        })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict).toBeNull()
      })
    })

    describe('version-based detection', () => {
      it('should detect conflict when local version is behind server', () => {
        const localChange = createLocalChange({ version: 1 })
        const serverChange = createServerChange({ version: 3 })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict).not.toBeNull()
        expect(conflict?.versionDiff).toBe(2)
      })

      it('should include version information in conflict', () => {
        const localChange = createLocalChange({ version: 5 })
        const serverChange = createServerChange({ version: 7 })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict?.localVersion).toBe(5)
        expect(conflict?.serverVersion).toBe(7)
      })

      it('should not conflict when versions are sequential', () => {
        const localChange = createLocalChange({
          version: 2,
          fields: { email: 'new@email.com' },
        })
        const serverChange = createServerChange({
          version: 2,
          fields: { phone: '555-0000' },
        })

        // Different fields, same version - no conflict
        const conflict = resolver.detectConflict(localChange, serverChange)
        expect(conflict).toBeNull()
      })
    })

    describe('timestamp-based detection', () => {
      it('should include timestamps in conflict', () => {
        const localTime = Date.now() - 5000
        const serverTime = Date.now()

        const localChange = createLocalChange({ timestamp: localTime })
        const serverChange = createServerChange({ timestamp: serverTime })

        const conflict = resolver.detectConflict(localChange, serverChange)

        expect(conflict?.localTimestamp).toBe(localTime)
        expect(conflict?.serverTimestamp).toBe(serverTime)
      })
    })
  })

  // ==========================================================================
  // Field-Level Conflict Detection
  // ==========================================================================

  describe('field-level conflict detection', () => {
    it('should identify specific conflicting fields', () => {
      const localChange = createLocalChange({
        fields: { name: 'Alice', email: 'alice@local.com', age: 30 },
      })
      const serverChange = createServerChange({
        fields: { name: 'Alicia', email: 'alice@server.com', phone: '555-1234' },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict).not.toBeNull()
      expect(conflict?.fieldConflicts).toHaveLength(2)
      expect(conflict?.fieldConflicts.map(fc => fc.field)).toContain('name')
      expect(conflict?.fieldConflicts.map(fc => fc.field)).toContain('email')
    })

    it('should not include non-conflicting fields in fieldConflicts', () => {
      const localChange = createLocalChange({
        fields: { name: 'Alice', age: 30 },
      })
      const serverChange = createServerChange({
        fields: { name: 'Alicia', phone: '555-1234' },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict?.fieldConflicts).toHaveLength(1)
      expect(conflict?.fieldConflicts[0].field).toBe('name')
    })

    it('should include local and server values for each field conflict', () => {
      const localChange = createLocalChange({
        fields: { name: 'Alice Local' },
      })
      const serverChange = createServerChange({
        fields: { name: 'Alice Server' },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)

      const nameConflict = conflict?.fieldConflicts.find(fc => fc.field === 'name')
      expect(nameConflict?.localValue).toBe('Alice Local')
      expect(nameConflict?.serverValue).toBe('Alice Server')
    })

    it('should detect conflicts in nested object fields', () => {
      const localChange = createLocalChange({
        fields: { address: { city: 'New York', zip: '10001' } },
      })
      const serverChange = createServerChange({
        fields: { address: { city: 'Los Angeles', zip: '90001' } },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict).not.toBeNull()
      expect(conflict?.fieldConflicts).toHaveLength(1)
      expect(conflict?.fieldConflicts[0].field).toBe('address')
    })

    it('should detect conflicts in array fields', () => {
      const localChange = createLocalChange({
        fields: { tags: ['a', 'b', 'c'] },
      })
      const serverChange = createServerChange({
        fields: { tags: ['x', 'y', 'z'] },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict).not.toBeNull()
      expect(conflict?.fieldConflicts.map(fc => fc.field)).toContain('tags')
    })

    it('should not conflict when field values are deeply equal', () => {
      const localChange = createLocalChange({
        fields: { data: { nested: { value: 42 } } },
      })
      const serverChange = createServerChange({
        fields: { data: { nested: { value: 42 } } },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict).toBeNull()
    })
  })

  // ==========================================================================
  // resolveConflict() Tests
  // ==========================================================================

  describe('resolveConflict()', () => {
    let conflict: Conflict

    beforeEach(() => {
      const localChange = createLocalChange({
        fields: { name: 'Alice Local', email: 'alice@local.com' },
        version: 1,
      })
      const serverChange = createServerChange({
        fields: { name: 'Alice Server', phone: '555-1234' },
        version: 2,
      })

      conflict = resolver.detectConflict(localChange, serverChange)!
    })

    describe('server-wins strategy', () => {
      it('should return server values when using server-wins', () => {
        const resolved = resolver.resolveConflict(conflict, 'server-wins')

        expect(resolved.fields.name).toBe('Alice Server')
      })

      it('should keep server-only fields', () => {
        const resolved = resolver.resolveConflict(conflict, 'server-wins')

        expect(resolved.fields.phone).toBe('555-1234')
      })

      it('should discard local-only fields', () => {
        const resolved = resolver.resolveConflict(conflict, 'server-wins')

        expect(resolved.fields.email).toBeUndefined()
      })

      it('should update version to server version', () => {
        const resolved = resolver.resolveConflict(conflict, 'server-wins')

        expect(resolved.version).toBe(2)
      })

      it('should mark resolution strategy in result', () => {
        const resolved = resolver.resolveConflict(conflict, 'server-wins')

        expect(resolved.resolutionStrategy).toBe('server-wins')
      })
    })

    describe('client-wins strategy', () => {
      it('should return local values when using client-wins', () => {
        const resolved = resolver.resolveConflict(conflict, 'client-wins')

        expect(resolved.fields.name).toBe('Alice Local')
      })

      it('should keep local-only fields', () => {
        const resolved = resolver.resolveConflict(conflict, 'client-wins')

        expect(resolved.fields.email).toBe('alice@local.com')
      })

      it('should discard server-only fields', () => {
        const resolved = resolver.resolveConflict(conflict, 'client-wins')

        expect(resolved.fields.phone).toBeUndefined()
      })

      it('should increment version beyond server version', () => {
        const resolved = resolver.resolveConflict(conflict, 'client-wins')

        expect(resolved.version).toBeGreaterThan(2)
      })
    })

    describe('merge strategy', () => {
      it('should merge non-conflicting fields from both sides', () => {
        const resolved = resolver.resolveConflict(conflict, 'merge')

        expect(resolved.fields.email).toBe('alice@local.com')
        expect(resolved.fields.phone).toBe('555-1234')
      })

      it('should use server value for conflicting fields by default', () => {
        const resolved = resolver.resolveConflict(conflict, 'merge')

        expect(resolved.fields.name).toBe('Alice Server')
      })

      it('should preserve all unique fields from both changes', () => {
        const localChange = createLocalChange({
          fields: { a: 1, b: 2, c: 3 },
        })
        const serverChange = createServerChange({
          fields: { c: 30, d: 4, e: 5 },
        })

        const mergeConflict = resolver.detectConflict(localChange, serverChange)!
        const resolved = resolver.resolveConflict(mergeConflict, 'merge')

        expect(resolved.fields.a).toBe(1)
        expect(resolved.fields.b).toBe(2)
        expect(resolved.fields.c).toBe(30) // Server wins for conflicts
        expect(resolved.fields.d).toBe(4)
        expect(resolved.fields.e).toBe(5)
      })

      it('should increment version beyond server version', () => {
        const resolved = resolver.resolveConflict(conflict, 'merge')

        expect(resolved.version).toBeGreaterThan(2)
      })

      it('should mark merged fields in result', () => {
        const resolved = resolver.resolveConflict(conflict, 'merge')

        expect(resolved.mergedFields).toContain('email')
        expect(resolved.mergedFields).toContain('phone')
      })
    })

    describe('manual strategy', () => {
      it('should throw error when no handler is provided', () => {
        expect(() => {
          resolver.resolveConflict(conflict, 'manual')
        }).toThrow(/manual resolution.*handler/i)
      })

      it('should call conflict handler when manual strategy is used', () => {
        const handler = vi.fn().mockReturnValue({
          fields: { name: 'Custom Resolution' },
          version: 3,
        })

        const resolverWithHandler = new ConflictResolver({ onConflict: handler })
        const localChange = createLocalChange()
        const serverChange = createServerChange()
        const manualConflict = resolverWithHandler.detectConflict(localChange, serverChange)!

        resolverWithHandler.resolveConflict(manualConflict, 'manual')

        expect(handler).toHaveBeenCalledWith(manualConflict)
      })

      it('should return handler result for manual resolution', () => {
        const handler = vi.fn().mockReturnValue({
          fields: { name: 'Custom Resolution', custom: true },
          version: 10,
        })

        const resolverWithHandler = new ConflictResolver({ onConflict: handler })
        const localChange = createLocalChange()
        const serverChange = createServerChange()
        const manualConflict = resolverWithHandler.detectConflict(localChange, serverChange)!

        const resolved = resolverWithHandler.resolveConflict(manualConflict, 'manual')

        expect(resolved.fields.name).toBe('Custom Resolution')
        expect(resolved.fields.custom).toBe(true)
        expect(resolved.version).toBe(10)
      })
    })

    describe('custom resolver function', () => {
      it('should accept custom resolver function instead of strategy', () => {
        const customResolver = (local: Change, server: Change) => ({
          fields: { ...server.fields, ...local.fields, merged: true },
          version: server.version + 1,
        })

        const resolved = resolver.resolveConflict(conflict, customResolver)

        expect(resolved.fields.merged).toBe(true)
      })

      it('should pass local and server changes to custom resolver', () => {
        const customResolver = vi.fn().mockReturnValue({
          fields: {},
          version: 1,
        })

        resolver.resolveConflict(conflict, customResolver)

        expect(customResolver).toHaveBeenCalledWith(
          conflict.localChange,
          conflict.serverChange
        )
      })

      it('should allow complex custom merge logic', () => {
        const localChange = createLocalChange({
          fields: { count: 5, items: ['a', 'b'] },
        })
        const serverChange = createServerChange({
          fields: { count: 10, items: ['c', 'd'] },
        })

        const sumConflict = resolver.detectConflict(localChange, serverChange)!

        const customResolver = (local: Change, server: Change) => ({
          fields: {
            count: (local.fields.count as number) + (server.fields.count as number),
            items: [...(local.fields.items as string[]), ...(server.fields.items as string[])],
          },
          version: server.version + 1,
        })

        const resolved = resolver.resolveConflict(sumConflict, customResolver)

        expect(resolved.fields.count).toBe(15)
        expect(resolved.fields.items).toEqual(['a', 'b', 'c', 'd'])
      })
    })

    describe('delete conflict resolution', () => {
      it('should resolve delete-update with server-wins by applying delete', () => {
        const localChange = createLocalChange({ type: 'delete', fields: {} })
        const serverChange = createServerChange({ type: 'update' })

        const deleteConflict = resolver.detectConflict(localChange, serverChange)!
        const resolved = resolver.resolveConflict(deleteConflict, 'server-wins')

        expect(resolved.type).toBe('update')
      })

      it('should resolve delete-update with client-wins by applying delete', () => {
        const localChange = createLocalChange({ type: 'delete', fields: {} })
        const serverChange = createServerChange({ type: 'update' })

        const deleteConflict = resolver.detectConflict(localChange, serverChange)!
        const resolved = resolver.resolveConflict(deleteConflict, 'client-wins')

        expect(resolved.type).toBe('delete')
      })

      it('should resolve update-delete with server-wins by applying delete', () => {
        const localChange = createLocalChange({ type: 'update' })
        const serverChange = createServerChange({ type: 'delete', fields: {} })

        const deleteConflict = resolver.detectConflict(localChange, serverChange)!
        const resolved = resolver.resolveConflict(deleteConflict, 'server-wins')

        expect(resolved.type).toBe('delete')
      })

      it('should resolve update-delete with client-wins by applying update', () => {
        const localChange = createLocalChange({ type: 'update' })
        const serverChange = createServerChange({ type: 'delete', fields: {} })

        const deleteConflict = resolver.detectConflict(localChange, serverChange)!
        const resolved = resolver.resolveConflict(deleteConflict, 'client-wins')

        expect(resolved.type).toBe('update')
      })
    })
  })

  // ==========================================================================
  // Per-Field Strategy Configuration
  // ==========================================================================

  describe('setFieldStrategy()', () => {
    it('should set strategy for specific field', () => {
      resolver.setFieldStrategy('users', 'name', 'client-wins')

      expect(resolver.getFieldStrategy('users', 'name')).toBe('client-wins')
    })

    it('should set strategy for multiple fields', () => {
      resolver.setFieldStrategy('users', 'name', 'client-wins')
      resolver.setFieldStrategy('users', 'email', 'server-wins')
      resolver.setFieldStrategy('users', 'bio', 'merge')

      expect(resolver.getFieldStrategy('users', 'name')).toBe('client-wins')
      expect(resolver.getFieldStrategy('users', 'email')).toBe('server-wins')
      expect(resolver.getFieldStrategy('users', 'bio')).toBe('merge')
    })

    it('should set strategy for different tables', () => {
      resolver.setFieldStrategy('users', 'name', 'client-wins')
      resolver.setFieldStrategy('posts', 'title', 'server-wins')

      expect(resolver.getFieldStrategy('users', 'name')).toBe('client-wins')
      expect(resolver.getFieldStrategy('posts', 'title')).toBe('server-wins')
    })

    it('should return default strategy for unconfigured fields', () => {
      resolver.setFieldStrategy('users', 'name', 'client-wins')

      expect(resolver.getFieldStrategy('users', 'email')).toBe('server-wins') // default
    })

    it('should override previously set strategy', () => {
      resolver.setFieldStrategy('users', 'name', 'client-wins')
      resolver.setFieldStrategy('users', 'name', 'server-wins')

      expect(resolver.getFieldStrategy('users', 'name')).toBe('server-wins')
    })

    it('should apply field strategy during merge resolution', () => {
      resolver.setFieldStrategy('users', 'name', 'client-wins')

      const localChange = createLocalChange({
        table: 'users',
        fields: { name: 'Alice Local', email: 'local@test.com' },
      })
      const serverChange = createServerChange({
        table: 'users',
        fields: { name: 'Alice Server', email: 'server@test.com' },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)!
      const resolved = resolver.resolveConflict(conflict, 'merge')

      expect(resolved.fields.name).toBe('Alice Local') // client-wins for name
      expect(resolved.fields.email).toBe('server@test.com') // server-wins (default) for email
    })
  })

  describe('clearFieldStrategy()', () => {
    it('should remove field strategy', () => {
      resolver.setFieldStrategy('users', 'name', 'client-wins')
      resolver.clearFieldStrategy('users', 'name')

      expect(resolver.getFieldStrategy('users', 'name')).toBe('server-wins') // default
    })

    it('should not affect other field strategies', () => {
      resolver.setFieldStrategy('users', 'name', 'client-wins')
      resolver.setFieldStrategy('users', 'email', 'merge')
      resolver.clearFieldStrategy('users', 'name')

      expect(resolver.getFieldStrategy('users', 'email')).toBe('merge')
    })
  })

  describe('clearAllFieldStrategies()', () => {
    it('should remove all field strategies', () => {
      resolver.setFieldStrategy('users', 'name', 'client-wins')
      resolver.setFieldStrategy('users', 'email', 'merge')
      resolver.setFieldStrategy('posts', 'title', 'server-wins')

      resolver.clearAllFieldStrategies()

      expect(resolver.getFieldStrategy('users', 'name')).toBe('server-wins')
      expect(resolver.getFieldStrategy('users', 'email')).toBe('server-wins')
      expect(resolver.getFieldStrategy('posts', 'title')).toBe('server-wins')
    })
  })

  // ==========================================================================
  // Automatic Merge for Non-Conflicting Fields
  // ==========================================================================

  describe('automatic merge for non-conflicting fields', () => {
    it('should automatically merge when only one side modified a field', () => {
      const localChange = createLocalChange({
        fields: { localOnly: 'value1' },
      })
      const serverChange = createServerChange({
        fields: { serverOnly: 'value2' },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)

      // No actual conflict - different fields
      expect(conflict).toBeNull()
    })

    it('should auto-resolve when using default strategy with no field overlap', () => {
      const localChange = createLocalChange({
        fields: { email: 'alice@new.com' },
        version: 1,
      })
      const serverChange = createServerChange({
        fields: { phone: '555-9999' },
        version: 2,
      })

      // autoResolve should work for non-conflicting changes
      const result = resolver.autoResolve(localChange, serverChange)

      expect(result.fields.email).toBe('alice@new.com')
      expect(result.fields.phone).toBe('555-9999')
      expect(result.version).toBeGreaterThan(2)
    })

    it('should preserve base document fields during auto-resolve', () => {
      const localChange = createLocalChange({
        fields: { email: 'alice@new.com' },
        baseFields: { name: 'Alice', age: 30 },
      })
      const serverChange = createServerChange({
        fields: { phone: '555-9999' },
        baseFields: { name: 'Alice', age: 30 },
      })

      const result = resolver.autoResolve(localChange, serverChange)

      expect(result.baseFields?.name).toBe('Alice')
      expect(result.baseFields?.age).toBe(30)
    })
  })

  // ==========================================================================
  // Conflict Callback/Handler Support
  // ==========================================================================

  describe('conflict callback/handler support', () => {
    it('should call onConflict handler when conflict is detected', () => {
      const handler = vi.fn()
      const resolverWithHandler = new ConflictResolver({ onConflict: handler })

      const localChange = createLocalChange()
      const serverChange = createServerChange()

      resolverWithHandler.detectConflict(localChange, serverChange)

      expect(handler).toHaveBeenCalled()
    })

    it('should pass conflict object to handler', () => {
      const handler = vi.fn()
      const resolverWithHandler = new ConflictResolver({ onConflict: handler })

      const localChange = createLocalChange()
      const serverChange = createServerChange()

      resolverWithHandler.detectConflict(localChange, serverChange)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          localChange,
          serverChange,
          type: expect.any(String),
        })
      )
    })

    it('should support async conflict handlers', async () => {
      const asyncHandler = vi.fn().mockResolvedValue({
        fields: { name: 'Async Resolution' },
        version: 5,
      })

      const resolverWithHandler = new ConflictResolver({ onConflict: asyncHandler })
      const localChange = createLocalChange()
      const serverChange = createServerChange()
      const conflict = resolverWithHandler.detectConflict(localChange, serverChange)!

      const resolved = await resolverWithHandler.resolveConflictAsync(conflict, 'manual')

      expect(asyncHandler).toHaveBeenCalled()
      expect(resolved.fields.name).toBe('Async Resolution')
    })

    it('should allow handler to return resolution', () => {
      const handler = vi.fn().mockReturnValue({
        fields: { name: 'Handler Resolution' },
        version: 5,
      })

      const resolverWithHandler = new ConflictResolver({ onConflict: handler })
      const localChange = createLocalChange()
      const serverChange = createServerChange()
      const conflict = resolverWithHandler.detectConflict(localChange, serverChange)!

      const resolved = resolverWithHandler.resolveConflict(conflict, 'manual')

      expect(resolved.fields.name).toBe('Handler Resolution')
    })

    it('should support multiple conflict listeners', () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      resolver.addConflictListener(listener1)
      resolver.addConflictListener(listener2)

      const localChange = createLocalChange()
      const serverChange = createServerChange()

      resolver.detectConflict(localChange, serverChange)

      expect(listener1).toHaveBeenCalled()
      expect(listener2).toHaveBeenCalled()
    })

    it('should allow removing conflict listeners', () => {
      const listener = vi.fn()

      resolver.addConflictListener(listener)
      resolver.removeConflictListener(listener)

      const localChange = createLocalChange()
      const serverChange = createServerChange()

      resolver.detectConflict(localChange, serverChange)

      expect(listener).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Version Tracking
  // ==========================================================================

  describe('version tracking', () => {
    it('should track version in conflict object', () => {
      const localChange = createLocalChange({ version: 5 })
      const serverChange = createServerChange({ version: 8 })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict?.localVersion).toBe(5)
      expect(conflict?.serverVersion).toBe(8)
    })

    it('should calculate version difference', () => {
      const localChange = createLocalChange({ version: 3 })
      const serverChange = createServerChange({ version: 10 })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict?.versionDiff).toBe(7)
    })

    it('should determine if local is stale', () => {
      const localChange = createLocalChange({ version: 1 })
      const serverChange = createServerChange({ version: 5 })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict?.isLocalStale).toBe(true)
    })

    it('should not mark as stale when versions are close', () => {
      const localChange = createLocalChange({ version: 4 })
      const serverChange = createServerChange({ version: 5 })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict?.isLocalStale).toBe(false)
    })

    it('should generate new version after resolution', () => {
      const localChange = createLocalChange({ version: 3 })
      const serverChange = createServerChange({ version: 5 })

      const conflict = resolver.detectConflict(localChange, serverChange)!
      const resolved = resolver.resolveConflict(conflict, 'merge')

      expect(resolved.version).toBeGreaterThan(5)
    })

    it('should support custom version generator', () => {
      const versionGenerator = vi.fn().mockReturnValue(100)
      const resolverWithGenerator = new ConflictResolver({
        versionGenerator,
      })

      const localChange = createLocalChange()
      const serverChange = createServerChange()
      const conflict = resolverWithGenerator.detectConflict(localChange, serverChange)!

      const resolved = resolverWithGenerator.resolveConflict(conflict, 'merge')

      expect(versionGenerator).toHaveBeenCalled()
      expect(resolved.version).toBe(100)
    })
  })

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty field objects', () => {
      const localChange = createLocalChange({ fields: {} })
      const serverChange = createServerChange({ fields: {} })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict).toBeNull()
    })

    it('should handle null field values', () => {
      const localChange = createLocalChange({ fields: { name: null } })
      const serverChange = createServerChange({ fields: { name: 'Alice' } })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict).not.toBeNull()
      expect(conflict?.fieldConflicts[0].localValue).toBeNull()
    })

    it('should handle undefined to value changes', () => {
      const localChange = createLocalChange({ fields: { name: undefined } })
      const serverChange = createServerChange({ fields: { name: 'Alice' } })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict).not.toBeNull()
    })

    it('should handle deeply nested field changes', () => {
      const localChange = createLocalChange({
        fields: {
          profile: {
            settings: {
              theme: {
                primary: 'blue',
              },
            },
          },
        },
      })
      const serverChange = createServerChange({
        fields: {
          profile: {
            settings: {
              theme: {
                primary: 'red',
              },
            },
          },
        },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict).not.toBeNull()
    })

    it('should handle array modifications', () => {
      const localChange = createLocalChange({
        fields: { items: [1, 2, 3, 4] },
      })
      const serverChange = createServerChange({
        fields: { items: [1, 2, 5] },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict).not.toBeNull()
      expect(conflict?.fieldConflicts[0].field).toBe('items')
    })

    it('should handle type changes for same field', () => {
      const localChange = createLocalChange({
        fields: { value: 'string' },
      })
      const serverChange = createServerChange({
        fields: { value: 42 },
      })

      const conflict = resolver.detectConflict(localChange, serverChange)

      expect(conflict).not.toBeNull()
    })
  })

  describe('error handling', () => {
    it('should throw for invalid strategy', () => {
      const localChange = createLocalChange()
      const serverChange = createServerChange()
      const conflict = resolver.detectConflict(localChange, serverChange)!

      expect(() => {
        resolver.resolveConflict(conflict, 'invalid-strategy' as ConflictStrategy)
      }).toThrow(/invalid.*strategy/i)
    })

    it('should throw when custom resolver returns invalid result', () => {
      const localChange = createLocalChange()
      const serverChange = createServerChange()
      const conflict = resolver.detectConflict(localChange, serverChange)!

      const invalidResolver = () => null as unknown as ResolvedChange

      expect(() => {
        resolver.resolveConflict(conflict, invalidResolver)
      }).toThrow(/invalid.*resolution/i)
    })

    it('should throw when custom resolver throws', () => {
      const localChange = createLocalChange()
      const serverChange = createServerChange()
      const conflict = resolver.detectConflict(localChange, serverChange)!

      const throwingResolver = () => {
        throw new Error('Custom error')
      }

      expect(() => {
        resolver.resolveConflict(conflict, throwingResolver)
      }).toThrow('Custom error')
    })
  })

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('integration scenarios', () => {
    it('should handle full conflict resolution workflow', () => {
      // Create resolver with configuration
      const resolver = new ConflictResolver({
        defaultStrategy: 'merge',
      })

      resolver.setFieldStrategy('users', 'name', 'client-wins')
      resolver.setFieldStrategy('users', 'email', 'server-wins')

      // Simulate concurrent edits
      const localChange = createLocalChange({
        table: 'users',
        fields: {
          name: 'Alice Updated (Local)',
          email: 'alice@local.com',
          bio: 'Local bio',
        },
        version: 1,
      })

      const serverChange = createServerChange({
        table: 'users',
        fields: {
          name: 'Alice Updated (Server)',
          email: 'alice@server.com',
          phone: '555-1234',
        },
        version: 2,
      })

      // Detect and resolve
      const conflict = resolver.detectConflict(localChange, serverChange)!
      expect(conflict).not.toBeNull()

      const resolved = resolver.resolveConflict(conflict, 'merge')

      // Verify resolution
      expect(resolved.fields.name).toBe('Alice Updated (Local)') // client-wins
      expect(resolved.fields.email).toBe('alice@server.com') // server-wins
      expect(resolved.fields.bio).toBe('Local bio') // local-only
      expect(resolved.fields.phone).toBe('555-1234') // server-only
    })

    it('should handle multiple sequential conflicts', () => {
      const changes: Change[] = []

      // Initial state
      let baseVersion = 1

      // Multiple local changes
      for (let i = 0; i < 5; i++) {
        changes.push(createLocalChange({
          id: `local_${i}`,
          fields: { [`field_${i}`]: `local_value_${i}` },
          version: baseVersion,
        }))
      }

      // Server change that conflicts with all
      const serverChange = createServerChange({
        fields: { field_0: 'server_value_0', field_1: 'server_value_1' },
        version: baseVersion + 1,
      })

      // Process each local change
      for (const localChange of changes) {
        const conflict = resolver.detectConflict(localChange, serverChange)
        if (conflict) {
          const resolved = resolver.resolveConflict(conflict, 'merge')
          baseVersion = resolved.version
        }
      }

      expect(baseVersion).toBeGreaterThan(1)
    })

    it('should work with real-world user profile update scenario', () => {
      const resolver = new ConflictResolver({
        defaultStrategy: 'merge',
      })

      // User edits profile on mobile (offline)
      const mobileEdit = createLocalChange({
        table: 'profiles',
        documentId: 'profile_user123',
        fields: {
          displayName: 'Johnny',
          avatar: 'new-avatar.jpg',
          lastSeen: Date.now() - 30000,
        },
        version: 10,
        timestamp: Date.now() - 30000,
      })

      // Server receives update from web client
      const webEdit = createServerChange({
        table: 'profiles',
        documentId: 'profile_user123',
        fields: {
          displayName: 'John Doe',
          bio: 'Updated bio from web',
          lastSeen: Date.now() - 15000,
        },
        version: 11,
        timestamp: Date.now() - 15000,
      })

      const conflict = resolver.detectConflict(mobileEdit, webEdit)!
      expect(conflict).not.toBeNull()
      expect(conflict.fieldConflicts.map(fc => fc.field)).toContain('displayName')
      expect(conflict.fieldConflicts.map(fc => fc.field)).toContain('lastSeen')

      const resolved = resolver.resolveConflict(conflict, 'merge')

      // Server wins for conflicting fields by default
      expect(resolved.fields.displayName).toBe('John Doe')
      // Non-conflicting fields are merged
      expect(resolved.fields.avatar).toBe('new-avatar.jpg')
      expect(resolved.fields.bio).toBe('Updated bio from web')
    })
  })
})

// ============================================================================
// Type Export Tests
// ============================================================================

describe('Type Exports', () => {
  it('should export ConflictStrategy type', () => {
    const strategy: ConflictStrategy = 'server-wins'
    expect(['server-wins', 'client-wins', 'merge', 'manual']).toContain(strategy)
  })

  it('should export ConflictType type', () => {
    const type: ConflictType = 'field-conflict'
    expect(['field-conflict', 'delete-update', 'update-delete']).toContain(type)
  })

  it('should export Conflict interface', () => {
    const conflict: Partial<Conflict> = {
      type: 'field-conflict',
      fieldConflicts: [],
    }
    expect(conflict.type).toBeDefined()
  })

  it('should export FieldConflict interface', () => {
    const fieldConflict: FieldConflict = {
      field: 'name',
      localValue: 'local',
      serverValue: 'server',
    }
    expect(fieldConflict.field).toBe('name')
  })

  it('should export Change interface', () => {
    const change: Partial<Change> = {
      id: 'change_1',
      documentId: 'doc_1',
      table: 'users',
      type: 'update',
    }
    expect(change.id).toBeDefined()
  })

  it('should export ResolvedChange interface', () => {
    const resolved: Partial<ResolvedChange> = {
      fields: {},
      version: 1,
      resolutionStrategy: 'merge',
    }
    expect(resolved.version).toBe(1)
  })

  it('should export ConflictHandler type', () => {
    const handler: ConflictHandler = (conflict) => ({
      fields: {},
      version: conflict.serverVersion + 1,
    })
    expect(typeof handler).toBe('function')
  })

  it('should export FieldStrategy type', () => {
    const strategies: FieldStrategy = {
      users: {
        name: 'client-wins',
        email: 'server-wins',
      },
    }
    expect(strategies.users.name).toBe('client-wins')
  })
})
