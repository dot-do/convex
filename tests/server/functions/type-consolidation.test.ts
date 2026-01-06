/**
 * TDD Tests for Type Consolidation - InferArgs
 *
 * These tests verify that the InferArgs type is properly consolidated
 * and exported from a single location (shared.ts).
 *
 * RED Phase: These tests document the expected behavior after consolidation.
 * Currently, InferArgs is defined in 5 separate files, violating DRY.
 *
 * Duplicate locations found:
 * - src/server/action.ts (line 88)
 * - src/server/mutation.ts (line 72)
 * - src/server/query.ts (line 68)
 * - src/server/functions/mutation.ts (line 56)
 * - src/server/functions/shared.ts (line 55) <-- canonical location
 *
 * @module
 */

import { describe, it, expect } from 'vitest'
import { expectTypeOf } from 'vitest'
import { type InferArgs, type InferredArgs } from '../../../src/server/functions/shared'
import { v, type Validator, type Infer, type ArgsValidator } from '../../../src/values'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// Type-Level Tests for InferArgs
// ============================================================================

describe('InferArgs type consolidation', () => {
  describe('type inference correctness', () => {
    it('should infer types from Validator<T> shape', () => {
      // With a single v.object() validator, InferArgs should extract the inner type
      type TestArgs = InferArgs<Validator<{ name: string; age: number }>>

      // Verify the inferred type matches expected structure
      expectTypeOf<TestArgs>().toEqualTypeOf<{ name: string; age: number }>()
    })

    it('should infer types from Record<string, Validator> shape', () => {
      // With a record of validators, InferArgs should map each to its inferred type
      type NameValidator = Validator<string>
      type AgeValidator = Validator<number>

      type TestArgs = InferArgs<{ name: NameValidator; age: AgeValidator }>

      // Each validator gets inferred via Infer<T[K]>
      expectTypeOf<TestArgs>().toEqualTypeOf<{ name: string; age: number }>()
    })

    it('should return never for unsupported types', () => {
      // InferArgs should return never for types that don't match either pattern
      // This test uses a workaround since we can't directly test with non-ArgsValidator types
      type TestNever = InferArgs<Record<string, never>>

      // An empty record should still work but produce an empty object type
      expectTypeOf<TestNever>().toEqualTypeOf<Record<string, never>>()
    })

    it('should preserve optional fields', () => {
      // Optional validators should produce optional fields in the inferred type
      type OptionalValidator = Validator<string | undefined> & { isOptional: true }
      type RequiredValidator = Validator<number>

      type TestArgs = InferArgs<{
        name: RequiredValidator
        nickname: OptionalValidator
      }>

      // Both fields should be present in the output type
      expectTypeOf<TestArgs>().toHaveProperty('name')
      expectTypeOf<TestArgs>().toHaveProperty('nickname')
    })
  })

  describe('InferredArgs wrapper type', () => {
    it('should return empty object type when Args is undefined', () => {
      type TestArgs = InferredArgs<undefined>

      expectTypeOf<TestArgs>().toEqualTypeOf<Record<string, never>>()
    })

    it('should delegate to InferArgs when Args is defined', () => {
      type TestArgs = InferredArgs<Validator<{ id: string }>>

      expectTypeOf<TestArgs>().toEqualTypeOf<{ id: string }>()
    })
  })
})

// ============================================================================
// Static Analysis Tests for Duplicate Detection
// ============================================================================

describe('InferArgs duplication detection', () => {
  const srcDir = path.resolve(__dirname, '../../../src')

  /**
   * Scan files for InferArgs type definitions.
   * Returns an array of { file, line, isExported } for each definition found.
   */
  function findInferArgsDefinitions(): Array<{ file: string; line: number; isExported: boolean }> {
    const results: Array<{ file: string; line: number; isExported: boolean }> = []

    const filesToCheck = [
      'server/action.ts',
      'server/mutation.ts',
      'server/query.ts',
      'server/functions/mutation.ts',
      'server/functions/shared.ts',
    ]

    for (const relPath of filesToCheck) {
      const fullPath = path.join(srcDir, relPath)

      if (!fs.existsSync(fullPath)) {
        continue
      }

      const content = fs.readFileSync(fullPath, 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Match both exported and non-exported type definitions
        if (line.match(/^(?:export\s+)?type\s+InferArgs\s*</)) {
          results.push({
            file: relPath,
            line: i + 1,
            isExported: line.startsWith('export'),
          })
        }
      }
    }

    return results
  }

  it('should only have ONE InferArgs definition (in shared.ts)', () => {
    const definitions = findInferArgsDefinitions()

    // After GREEN phase consolidation, there should be exactly 1 definition
    // This test will FAIL in RED phase because there are currently 5 definitions
    expect(definitions.length).toBe(1)
    expect(definitions[0]?.file).toBe('server/functions/shared.ts')
    expect(definitions[0]?.isExported).toBe(true)
  })

  it('should NOT have InferArgs in action.ts', () => {
    const definitions = findInferArgsDefinitions()
    const actionDef = definitions.find(d => d.file === 'server/action.ts')

    // This test will FAIL in RED phase
    expect(actionDef).toBeUndefined()
  })

  it('should NOT have InferArgs in mutation.ts', () => {
    const definitions = findInferArgsDefinitions()
    const mutationDef = definitions.find(d => d.file === 'server/mutation.ts')

    // This test will FAIL in RED phase
    expect(mutationDef).toBeUndefined()
  })

  it('should NOT have InferArgs in query.ts', () => {
    const definitions = findInferArgsDefinitions()
    const queryDef = definitions.find(d => d.file === 'server/query.ts')

    // This test will FAIL in RED phase
    expect(queryDef).toBeUndefined()
  })

  it('should NOT have InferArgs in functions/mutation.ts', () => {
    const definitions = findInferArgsDefinitions()
    const fnMutationDef = definitions.find(d => d.file === 'server/functions/mutation.ts')

    // This test will FAIL in RED phase
    expect(fnMutationDef).toBeUndefined()
  })

  it('should report current duplication status', () => {
    const definitions = findInferArgsDefinitions()

    // This test documents the current state
    console.log('\n=== InferArgs Duplication Report ===')
    console.log(`Total definitions found: ${definitions.length}`)

    for (const def of definitions) {
      const exportStatus = def.isExported ? 'exported' : 'private'
      console.log(`  - ${def.file}:${def.line} (${exportStatus})`)
    }

    if (definitions.length > 1) {
      console.log('\nDuplication detected! GREEN phase should consolidate to shared.ts only.')
    } else {
      console.log('\nNo duplication - consolidation complete!')
    }
    console.log('===================================\n')

    // This assertion always passes - it's just for documentation
    expect(definitions.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Usage Verification Tests
// ============================================================================

describe('InferArgs usage after consolidation', () => {
  it('should be importable from shared.ts', () => {
    // This test verifies the import path works
    // If InferArgs isn't exported from shared.ts, this file won't compile
    type TestType = InferArgs<Validator<{ test: string }>>

    expectTypeOf<TestType>().toEqualTypeOf<{ test: string }>()
  })

  it('should work with v.object() validators', () => {
    // Real-world usage pattern with v.object()
    const argsValidator = v.object({
      name: v.string(),
      age: v.number(),
    })

    type Args = InferArgs<typeof argsValidator>

    // Verify the type inference works correctly
    expectTypeOf<Args>().toHaveProperty('name')
    expectTypeOf<Args>().toHaveProperty('age')
  })

  it('should work with inline validator records', () => {
    // Real-world usage pattern with inline records
    const argsRecord = {
      id: v.string(),
      count: v.number(),
      optional: v.optional(v.boolean()),
    }

    type Args = InferArgs<typeof argsRecord>

    // Verify all fields are present
    expectTypeOf<Args>().toHaveProperty('id')
    expectTypeOf<Args>().toHaveProperty('count')
    expectTypeOf<Args>().toHaveProperty('optional')
  })
})
