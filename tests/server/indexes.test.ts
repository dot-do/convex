/**
 * TDD RED Phase Tests for Table Indexes (.index() method)
 *
 * These tests define the expected behavior for the .index() builder method.
 * They are designed to FAIL until the implementation is complete.
 *
 * @see convex-tj1 - Table Indexes (.index) Tests (RED)
 */

import { describe, it, expect } from 'vitest'
import { defineTable } from '../../src/server/schema'
import { v } from '../../src/values'

// ============================================================================
// Basic Index Definition
// ============================================================================

describe('.index() method', () => {
  describe('basic index definition', () => {
    it('should create a single field index', () => {
      const table = defineTable({ email: v.string() })
        .index('by_email', ['email'])

      // Index should be stored with name as key and fields in config
      expect(table.indexes['by_email']).toBeDefined()
      expect(table.indexes['by_email'].fields).toEqual(['email'])
    })

    it('should create an index with the exact name provided', () => {
      const table = defineTable({ userId: v.string() })
        .index('by_user_id', ['userId'])

      // Find the index by name
      const indexNames = Object.keys(table.indexes)
      expect(indexNames).toContain('by_user_id')
    })

    it('should store the index fields correctly', () => {
      const table = defineTable({ status: v.string() })
        .index('by_status', ['status'])

      // Verify field is stored
      expect(table.indexes['by_status']).toBeDefined()
      expect(table.indexes['by_status'].fields).toEqual(['status'])
    })

    it('should allow defining an index on any document field', () => {
      const table = defineTable({
        name: v.string(),
        age: v.number(),
        active: v.boolean(),
      })
        .index('by_name', ['name'])
        .index('by_age', ['age'])
        .index('by_active', ['active'])

      expect(Object.keys(table.indexes)).toHaveLength(3)
    })

    it('should support index names with underscores', () => {
      const table = defineTable({ createdAt: v.number() })
        .index('by_created_at', ['createdAt'])

      expect(table.indexes['by_created_at']).toBeDefined()
    })

    it('should support index names starting with by_', () => {
      const table = defineTable({ email: v.string() })
        .index('by_email', ['email'])

      expect(table.indexes['by_email']).toBeDefined()
    })

    it('should support descriptive multi-word index names', () => {
      const table = defineTable({
        organizationId: v.string(),
        userId: v.string(),
      })
        .index('by_organization_and_user', ['organizationId', 'userId'])

      expect(table.indexes['by_organization_and_user']).toBeDefined()
    })
  })

  // ============================================================================
  // Single Field and Compound Indexes
  // ============================================================================

  describe('single field indexes', () => {
    it('should create a single field index', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })
        .index('by_email', ['email'])

      expect(table.indexes['by_email'].fields).toEqual(['email'])
    })

    it('should support index on ID fields', () => {
      const table = defineTable({
        userId: v.id('users'),
        content: v.string(),
      })
        .index('by_user', ['userId'])

      expect(table.indexes['by_user'].fields).toEqual(['userId'])
    })

    it('should support index on number fields', () => {
      const table = defineTable({
        priority: v.number(),
      })
        .index('by_priority', ['priority'])

      expect(table.indexes['by_priority'].fields).toEqual(['priority'])
    })

    it('should support index on boolean fields', () => {
      const table = defineTable({
        isActive: v.boolean(),
      })
        .index('by_active_status', ['isActive'])

      expect(table.indexes['by_active_status'].fields).toEqual(['isActive'])
    })
  })

  describe('compound indexes', () => {
    it('should create a compound index with two fields', () => {
      const table = defineTable({
        firstName: v.string(),
        lastName: v.string(),
      })
        .index('by_name', ['lastName', 'firstName'])

      expect(table.indexes['by_name'].fields).toEqual(['lastName', 'firstName'])
    })

    it('should create a compound index with three fields', () => {
      const table = defineTable({
        organizationId: v.id('organizations'),
        projectId: v.id('projects'),
        taskId: v.id('tasks'),
      })
        .index('by_org_project_task', ['organizationId', 'projectId', 'taskId'])

      expect(table.indexes['by_org_project_task'].fields).toEqual([
        'organizationId',
        'projectId',
        'taskId',
      ])
    })

    it('should create a compound index with four fields', () => {
      const table = defineTable({
        year: v.number(),
        month: v.number(),
        day: v.number(),
        hour: v.number(),
      })
        .index('by_datetime', ['year', 'month', 'day', 'hour'])

      expect(table.indexes['by_datetime'].fields).toHaveLength(4)
    })

    it('should support compound indexes with mixed field types', () => {
      const table = defineTable({
        status: v.string(),
        priority: v.number(),
        isUrgent: v.boolean(),
      })
        .index('by_status_priority_urgent', ['status', 'priority', 'isUrgent'])

      expect(table.indexes['by_status_priority_urgent'].fields).toEqual([
        'status',
        'priority',
        'isUrgent',
      ])
    })
  })

  // ============================================================================
  // Field Order Preservation
  // ============================================================================

  describe('field order preservation', () => {
    it('should preserve field order in compound indexes', () => {
      const table = defineTable({
        a: v.string(),
        b: v.string(),
        c: v.string(),
      })
        .index('by_abc', ['a', 'b', 'c'])

      expect(table.indexes['by_abc'].fields).toEqual(['a', 'b', 'c'])
    })

    it('should preserve reverse field order', () => {
      const table = defineTable({
        a: v.string(),
        b: v.string(),
        c: v.string(),
      })
        .index('by_cba', ['c', 'b', 'a'])

      expect(table.indexes['by_cba'].fields).toEqual(['c', 'b', 'a'])
    })

    it('should maintain field order as specified, not alphabetical', () => {
      const table = defineTable({
        zebra: v.string(),
        apple: v.string(),
        mango: v.string(),
      })
        .index('by_zam', ['zebra', 'apple', 'mango'])

      // Order should match input, not alphabetical
      expect(table.indexes['by_zam'].fields[0]).toBe('zebra')
      expect(table.indexes['by_zam'].fields[1]).toBe('apple')
      expect(table.indexes['by_zam'].fields[2]).toBe('mango')
    })

    it('should preserve field order across multiple indexes', () => {
      const table = defineTable({
        x: v.string(),
        y: v.string(),
        z: v.string(),
      })
        .index('by_xy', ['x', 'y'])
        .index('by_yx', ['y', 'x'])
        .index('by_xyz', ['x', 'y', 'z'])
        .index('by_zyx', ['z', 'y', 'x'])

      expect(table.indexes['by_xy'].fields).toEqual(['x', 'y'])
      expect(table.indexes['by_yx'].fields).toEqual(['y', 'x'])
      expect(table.indexes['by_xyz'].fields).toEqual(['x', 'y', 'z'])
      expect(table.indexes['by_zyx'].fields).toEqual(['z', 'y', 'x'])
    })

    it('should respect insertion order for field arrays', () => {
      const fields = ['first', 'second', 'third']
      const table = defineTable({
        first: v.string(),
        second: v.string(),
        third: v.string(),
      })
        .index('ordered', fields)

      // Fields should be in exact same order as passed
      for (let i = 0; i < fields.length; i++) {
        expect(table.indexes['ordered'].fields[i]).toBe(fields[i])
      }
    })
  })

  // ============================================================================
  // Nested Field Paths
  // ============================================================================

  describe('nested field paths', () => {
    it('should support simple nested field paths', () => {
      const table = defineTable({
        address: v.object({
          city: v.string(),
        }),
      })
        .index('by_city', ['address.city'])

      expect(table.indexes['by_city'].fields).toEqual(['address.city'])
    })

    it('should support deeply nested field paths', () => {
      const table = defineTable({
        user: v.object({
          profile: v.object({
            location: v.object({
              country: v.string(),
            }),
          }),
        }),
      })
        .index('by_country', ['user.profile.location.country'])

      expect(table.indexes['by_country'].fields).toEqual(['user.profile.location.country'])
    })

    it('should support compound indexes with nested paths', () => {
      const table = defineTable({
        address: v.object({
          country: v.string(),
          state: v.string(),
          city: v.string(),
        }),
      })
        .index('by_location', ['address.country', 'address.state', 'address.city'])

      expect(table.indexes['by_location'].fields).toEqual([
        'address.country',
        'address.state',
        'address.city',
      ])
    })

    it('should support mixed top-level and nested fields', () => {
      const table = defineTable({
        name: v.string(),
        metadata: v.object({
          createdAt: v.number(),
        }),
      })
        .index('by_name_and_created', ['name', 'metadata.createdAt'])

      expect(table.indexes['by_name_and_created'].fields).toEqual([
        'name',
        'metadata.createdAt',
      ])
    })

    it('should preserve order with nested field paths', () => {
      const table = defineTable({
        a: v.object({ b: v.string() }),
        c: v.object({ d: v.string() }),
      })
        .index('by_nested', ['c.d', 'a.b'])

      expect(table.indexes['by_nested'].fields[0]).toBe('c.d')
      expect(table.indexes['by_nested'].fields[1]).toBe('a.b')
    })

    it('should support array element access in paths', () => {
      // Note: This might not be supported in Convex - test should verify behavior
      const table = defineTable({
        tags: v.array(v.string()),
      })

      // This tests if indexed array fields are supported
      // The actual implementation may reject this
      expect(() => {
        table.index('by_first_tag', ['tags[0]'])
      }).toThrow() // Expected to fail - arrays typically indexed differently
    })
  })

  // ============================================================================
  // Index Validation - Duplicate Names
  // ============================================================================

  describe('index validation - duplicate names', () => {
    it('should reject duplicate index names on the same table', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })
        .index('by_email', ['email'])

      // Second index with same name should fail
      expect(() => {
        table.index('by_email', ['name'])
      }).toThrow()
    })

    it('should provide a clear error message for duplicate index names', () => {
      const table = defineTable({
        field1: v.string(),
        field2: v.string(),
      })
        .index('duplicate_name', ['field1'])

      expect(() => {
        table.index('duplicate_name', ['field2'])
      }).toThrow(/duplicate|already exists|already defined/i)
    })

    it('should allow same index name on different tables', () => {
      const table1 = defineTable({ email: v.string() })
        .index('by_email', ['email'])

      const table2 = defineTable({ email: v.string() })
        .index('by_email', ['email'])

      // Both should be valid
      expect(table1.indexes['by_email']).toBeDefined()
      expect(table2.indexes['by_email']).toBeDefined()
    })

    it('should be case-sensitive for index names', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })
        .index('by_email', ['email'])
        .index('BY_EMAIL', ['email'])
        .index('By_Email', ['name'])

      // All three should be distinct
      expect(Object.keys(table.indexes)).toContain('by_email')
      expect(Object.keys(table.indexes)).toContain('BY_EMAIL')
      expect(Object.keys(table.indexes)).toContain('By_Email')
    })
  })

  // ============================================================================
  // Index Validation - Empty Fields
  // ============================================================================

  describe('index validation - empty fields', () => {
    it('should reject an index with empty fields array', () => {
      const table = defineTable({ email: v.string() })

      expect(() => {
        table.index('empty_index', [])
      }).toThrow()
    })

    it('should provide clear error for empty fields array', () => {
      const table = defineTable({ email: v.string() })

      expect(() => {
        table.index('empty_index', [])
      }).toThrow(/empty|at least one|no fields/i)
    })

    it('should reject empty string as a field name', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })

      expect(() => {
        table.index('bad_index', [''])
      }).toThrow()
    })

    it('should reject fields array with empty string among valid fields', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })

      expect(() => {
        table.index('bad_index', ['email', '', 'name'])
      }).toThrow()
    })

    it('should reject whitespace-only field names', () => {
      const table = defineTable({
        email: v.string(),
      })

      expect(() => {
        table.index('whitespace_index', ['   '])
      }).toThrow()
    })
  })

  // ============================================================================
  // Index Validation - Invalid Names
  // ============================================================================

  describe('index validation - invalid names', () => {
    it('should reject empty index name', () => {
      const table = defineTable({ email: v.string() })

      expect(() => {
        table.index('', ['email'])
      }).toThrow()
    })

    it('should reject whitespace-only index name', () => {
      const table = defineTable({ email: v.string() })

      expect(() => {
        table.index('   ', ['email'])
      }).toThrow()
    })

    it('should reject index names starting with underscore', () => {
      // This test checks Convex naming conventions
      const table = defineTable({ email: v.string() })

      expect(() => {
        table.index('_by_email', ['email'])
      }).toThrow()
    })

    it('should reject index names with special characters', () => {
      const table = defineTable({ email: v.string() })

      const invalidNames = [
        'by-email', // hyphen
        'by.email', // dot
        'by email', // space
        'by@email', // at sign
        'by#email', // hash
        'by$email', // dollar
        'by!email', // exclamation
      ]

      for (const name of invalidNames) {
        expect(() => {
          defineTable({ email: v.string() }).index(name, ['email'])
        }).toThrow()
      }
    })

    it('should reject index names starting with numbers', () => {
      const table = defineTable({ email: v.string() })

      expect(() => {
        table.index('1_by_email', ['email'])
      }).toThrow()
    })

    it('should accept valid index names', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })
        .index('by_email', ['email'])
        .index('byEmail', ['email'])
        .index('by_email_123', ['email'])
        .index('BY_EMAIL', ['email'])
        .index('a', ['name'])

      expect(Object.keys(table.indexes)).toHaveLength(5)
    })

    it('should reject reserved index names', () => {
      // The 'by_creation_time' and 'by_id' might be reserved
      const table = defineTable({ email: v.string() })

      expect(() => {
        table.index('by_creation_time', ['email'])
      }).toThrow()

      expect(() => {
        defineTable({ email: v.string() }).index('by_id', ['email'])
      }).toThrow()
    })
  })

  // ============================================================================
  // Index Validation - Non-existent Fields
  // ============================================================================

  describe('index validation - non-existent fields', () => {
    it('should reject index on non-existent field', () => {
      const table = defineTable({
        email: v.string(),
      })

      expect(() => {
        table.index('by_name', ['name'])
      }).toThrow()
    })

    it('should provide clear error for non-existent field', () => {
      const table = defineTable({
        email: v.string(),
      })

      expect(() => {
        table.index('by_name', ['name'])
      }).toThrow(/not found|does not exist|undefined|unknown field/i)
    })

    it('should reject if any field in compound index is non-existent', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })

      expect(() => {
        table.index('by_all', ['email', 'nonexistent', 'name'])
      }).toThrow()
    })

    it('should reject non-existent nested field paths', () => {
      const table = defineTable({
        address: v.object({
          city: v.string(),
        }),
      })

      expect(() => {
        table.index('by_country', ['address.country'])
      }).toThrow()
    })

    it('should reject invalid nested path on non-object field', () => {
      const table = defineTable({
        name: v.string(),
      })

      expect(() => {
        table.index('invalid_nested', ['name.first'])
      }).toThrow()
    })
  })

  // ============================================================================
  // Index Validation - Duplicate Fields
  // ============================================================================

  describe('index validation - duplicate fields', () => {
    it('should reject duplicate fields in the same index', () => {
      const table = defineTable({
        email: v.string(),
      })

      expect(() => {
        table.index('duplicate_fields', ['email', 'email'])
      }).toThrow()
    })

    it('should provide clear error for duplicate fields', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })

      expect(() => {
        table.index('bad', ['email', 'name', 'email'])
      }).toThrow(/duplicate|already included|repeated/i)
    })
  })

  // ============================================================================
  // Chaining Behavior
  // ============================================================================

  describe('chaining behavior', () => {
    it('should return table definition for chaining', () => {
      const table = defineTable({ email: v.string() })
      const result = table.index('by_email', ['email'])

      // Should return the same table builder for chaining
      expect(result).toBe(table)
    })

    it('should allow chaining multiple index definitions', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
        status: v.string(),
      })
        .index('by_email', ['email'])
        .index('by_name', ['name'])
        .index('by_status', ['status'])

      expect(Object.keys(table.indexes)).toHaveLength(3)
    })

    it('should allow chaining index with searchIndex', () => {
      const table = defineTable({
        email: v.string(),
        content: v.string(),
      })
        .index('by_email', ['email'])
        .searchIndex('search_content', {
          searchField: 'content',
        })

      expect(table.indexes['by_email']).toBeDefined()
      expect(table.searchIndexes['search_content']).toBeDefined()
    })

    it('should allow chaining index with vectorIndex', () => {
      const table = defineTable({
        email: v.string(),
        embedding: v.array(v.float64()),
      })
        .index('by_email', ['email'])
        .vectorIndex('by_embedding', {
          vectorField: 'embedding',
          dimensions: 1536,
        })

      expect(table.indexes['by_email']).toBeDefined()
      expect(table.vectorIndexes['by_embedding']).toBeDefined()
    })

    it('should maintain all indexes after multiple chains', () => {
      const table = defineTable({
        a: v.string(),
        b: v.string(),
        c: v.string(),
        d: v.string(),
        e: v.string(),
      })
        .index('idx1', ['a'])
        .index('idx2', ['b'])
        .index('idx3', ['c'])
        .index('idx4', ['d'])
        .index('idx5', ['e'])

      expect(Object.keys(table.indexes)).toHaveLength(5)
      expect(table.indexes['idx1'].fields).toEqual(['a'])
      expect(table.indexes['idx5'].fields).toEqual(['e'])
    })

    it('should not modify original table definition', () => {
      const original = defineTable({ email: v.string() })
      const withIndex = original.index('by_email', ['email'])

      // Both should point to the same object in this fluent API
      expect(withIndex).toBe(original)
      expect(original.indexes['by_email']).toBeDefined()
    })
  })

  // ============================================================================
  // Integration with Schema
  // ============================================================================

  describe('integration with schema', () => {
    it('should work correctly when used in defineSchema', () => {
      // This test verifies indexes work in the full schema context
      const table = defineTable({
        userId: v.id('users'),
        content: v.string(),
        timestamp: v.number(),
      })
        .index('by_user', ['userId'])
        .index('by_timestamp', ['timestamp'])
        .index('by_user_and_time', ['userId', 'timestamp'])

      // Verify all indexes are properly defined
      expect(table.indexes['by_user']).toBeDefined()
      expect(table.indexes['by_timestamp']).toBeDefined()
      expect(table.indexes['by_user_and_time']).toBeDefined()

      // Verify document schema is still accessible
      expect(table.document.userId).toBeDefined()
      expect(table.document.content).toBeDefined()
      expect(table.document.timestamp).toBeDefined()
    })

    it('should preserve indexes through table definition export', () => {
      const messages = defineTable({
        channelId: v.id('channels'),
        authorId: v.id('users'),
        body: v.string(),
        createdAt: v.number(),
      })
        .index('by_channel', ['channelId'])
        .index('by_author', ['authorId'])
        .index('by_channel_and_time', ['channelId', 'createdAt'])

      // Simulate passing to defineSchema
      const tableDefinition = messages as typeof messages

      expect(tableDefinition.indexes['by_channel'].fields).toEqual(['channelId'])
      expect(tableDefinition.indexes['by_author'].fields).toEqual(['authorId'])
      expect(tableDefinition.indexes['by_channel_and_time'].fields).toEqual([
        'channelId',
        'createdAt',
      ])
    })
  })

  // ============================================================================
  // TypeScript Type Safety (Compile-Time Tests)
  // ============================================================================

  describe('TypeScript type safety', () => {
    it('should enforce field names match document schema', () => {
      // This is a compile-time check - if it compiles, type safety works
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })
        // These should be allowed by TypeScript
        .index('by_email', ['email'])
        .index('by_name', ['name'])
        .index('by_both', ['email', 'name'])

      expect(table).toBeDefined()
    })

    it('should allow index fields to be subset of document fields', () => {
      const table = defineTable({
        a: v.string(),
        b: v.string(),
        c: v.string(),
        d: v.string(),
      })
        .index('by_a', ['a'])
        .index('by_ab', ['a', 'b'])
        .index('by_abc', ['a', 'b', 'c'])

      // All indexes only reference existing fields
      expect(table.indexes).toBeDefined()
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle very long index names', () => {
      const longName = 'by_' + 'a'.repeat(100)
      const table = defineTable({ field: v.string() })

      // This might fail if there's a length limit
      expect(() => {
        table.index(longName, ['field'])
      }).not.toThrow() // or .toThrow() if there's a limit
    })

    it('should handle very long field paths', () => {
      // Create deeply nested object type
      const table = defineTable({
        level1: v.object({
          level2: v.object({
            level3: v.object({
              level4: v.object({
                level5: v.string(),
              }),
            }),
          }),
        }),
      })

      // This tests support for deep nesting
      const result = table.index('deep_path', [
        'level1.level2.level3.level4.level5',
      ])

      expect(result.indexes['deep_path'].fields).toEqual([
        'level1.level2.level3.level4.level5',
      ])
    })

    it('should handle index on optional fields', () => {
      const table = defineTable({
        requiredField: v.string(),
        optionalField: v.optional(v.string()),
      })
        .index('by_optional', ['optionalField'])

      expect(table.indexes['by_optional'].fields).toEqual(['optionalField'])
    })

    it('should handle index on union type fields', () => {
      const table = defineTable({
        status: v.union(v.literal('active'), v.literal('inactive')),
      })
        .index('by_status', ['status'])

      expect(table.indexes['by_status'].fields).toEqual(['status'])
    })

    it('should handle index on nullable fields', () => {
      const table = defineTable({
        deletedAt: v.union(v.number(), v.null()),
      })
        .index('by_deleted', ['deletedAt'])

      expect(table.indexes['by_deleted'].fields).toEqual(['deletedAt'])
    })

    it('should handle many indexes on same table', () => {
      const fields: Record<string, ReturnType<typeof v.string>> = {}
      const indexCount = 32 // Convex has a limit

      for (let i = 0; i < indexCount; i++) {
        fields[`field${i}`] = v.string()
      }

      let table = defineTable(fields)

      for (let i = 0; i < indexCount; i++) {
        table = table.index(`by_field${i}`, [`field${i}`])
      }

      expect(Object.keys(table.indexes)).toHaveLength(indexCount)
    })

    it('should handle index field that is an ID type', () => {
      const table = defineTable({
        authorId: v.id('users'),
        channelId: v.id('channels'),
      })
        .index('by_author_channel', ['authorId', 'channelId'])

      expect(table.indexes['by_author_channel'].fields).toEqual([
        'authorId',
        'channelId',
      ])
    })

    it('should handle table with no other configurations', () => {
      const table = defineTable({ name: v.string() })
        .index('by_name', ['name'])

      // Should work even without search or vector indexes
      expect(table.indexes['by_name']).toBeDefined()
      expect(table.searchIndexes).toEqual({})
      expect(table.vectorIndexes).toEqual({})
    })
  })

  // ============================================================================
  // Index Structure Format
  // ============================================================================

  describe('index structure format', () => {
    it('should store indexes as array format for Convex compatibility', () => {
      const table = defineTable({
        email: v.string(),
        name: v.string(),
      })
        .index('by_email', ['email'])
        .index('by_name', ['name'])

      // This tests that indexes can be converted to array format
      // Expected format: [{ name: string, fields: string[] }]
      const indexArray = Object.entries(table.indexes).map(([name, config]) => ({
        name,
        fields: config.fields,
      }))

      expect(indexArray).toContainEqual({
        name: 'by_email',
        fields: ['email'],
      })
      expect(indexArray).toContainEqual({
        name: 'by_name',
        fields: ['name'],
      })
    })

    it('should maintain consistent index config structure', () => {
      const table = defineTable({
        field1: v.string(),
        field2: v.string(),
      })
        .index('test_index', ['field1', 'field2'])

      const indexConfig = table.indexes['test_index']

      // IndexConfig should have consistent structure
      expect(indexConfig).toHaveProperty('fields')
      expect(Array.isArray(indexConfig.fields)).toBe(true)
      expect(indexConfig.fields).toEqual(['field1', 'field2'])
    })
  })
})
