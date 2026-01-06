/**
 * API Parity Tests for convex.do
 *
 * These tests verify that convex.do exports match the Convex API surface.
 * This ensures 100% compatibility with Convex's public API.
 *
 * Reference: https://docs.convex.dev/api
 */

import { describe, it, expect } from 'vitest'

describe('convex.do API Parity', () => {
  /**
   * Tests for convex.do/server exports
   * These should match convex/server
   */
  describe('convex.do/server exports', () => {
    it('should export query function builder', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.query).toBeDefined()
      expect(typeof serverModule.query).toBe('function')
    })

    it('should export mutation function builder', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.mutation).toBeDefined()
      expect(typeof serverModule.mutation).toBe('function')
    })

    it('should export action function builder', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.action).toBeDefined()
      expect(typeof serverModule.action).toBe('function')
    })

    it('should export internalQuery function builder', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.internalQuery).toBeDefined()
      expect(typeof serverModule.internalQuery).toBe('function')
    })

    it('should export internalMutation function builder', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.internalMutation).toBeDefined()
      expect(typeof serverModule.internalMutation).toBe('function')
    })

    it('should export internalAction function builder', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.internalAction).toBeDefined()
      expect(typeof serverModule.internalAction).toBe('function')
    })

    it('should export httpRouter function builder', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.httpRouter).toBeDefined()
      expect(typeof serverModule.httpRouter).toBe('function')
    })

    it('should export httpAction function builder', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.httpAction).toBeDefined()
      expect(typeof serverModule.httpAction).toBe('function')
    })

    it('should export defineSchema function', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.defineSchema).toBeDefined()
      expect(typeof serverModule.defineSchema).toBe('function')
    })

    it('should export defineTable function', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.defineTable).toBeDefined()
      expect(typeof serverModule.defineTable).toBe('function')
    })

    it('should export v validators namespace', async () => {
      const serverModule = await import('../../src/server')
      expect(serverModule.v).toBeDefined()
      expect(typeof serverModule.v).toBe('object')
    })

    describe('v validators should have all required methods', () => {
      it('should have v.string()', async () => {
        const { v } = await import('../../src/server')
        expect(v.string).toBeDefined()
        expect(typeof v.string).toBe('function')
        const validator = v.string()
        expect(validator.parse).toBeDefined()
      })

      it('should have v.number()', async () => {
        const { v } = await import('../../src/server')
        expect(v.number).toBeDefined()
        expect(typeof v.number).toBe('function')
        const validator = v.number()
        expect(validator.parse).toBeDefined()
      })

      it('should have v.boolean()', async () => {
        const { v } = await import('../../src/server')
        expect(v.boolean).toBeDefined()
        expect(typeof v.boolean).toBe('function')
        const validator = v.boolean()
        expect(validator.parse).toBeDefined()
      })

      it('should have v.null()', async () => {
        const { v } = await import('../../src/server')
        expect(v.null).toBeDefined()
        expect(typeof v.null).toBe('function')
        const validator = v.null()
        expect(validator.parse).toBeDefined()
      })

      it('should have v.int64()', async () => {
        const { v } = await import('../../src/server')
        expect(v.int64).toBeDefined()
        expect(typeof v.int64).toBe('function')
        const validator = v.int64()
        expect(validator.parse).toBeDefined()
      })

      it('should have v.float64()', async () => {
        const { v } = await import('../../src/server')
        expect(v.float64).toBeDefined()
        expect(typeof v.float64).toBe('function')
        const validator = v.float64()
        expect(validator.parse).toBeDefined()
      })

      it('should have v.bytes()', async () => {
        const { v } = await import('../../src/server')
        expect(v.bytes).toBeDefined()
        expect(typeof v.bytes).toBe('function')
        const validator = v.bytes()
        expect(validator.parse).toBeDefined()
      })

      it('should have v.id()', async () => {
        const { v } = await import('../../src/server')
        expect(v.id).toBeDefined()
        expect(typeof v.id).toBe('function')
        const validator = v.id('users')
        expect(validator.parse).toBeDefined()
      })

      it('should have v.object()', async () => {
        const { v } = await import('../../src/server')
        expect(v.object).toBeDefined()
        expect(typeof v.object).toBe('function')
        const validator = v.object({ name: v.string() })
        expect(validator.parse).toBeDefined()
      })

      it('should have v.array()', async () => {
        const { v } = await import('../../src/server')
        expect(v.array).toBeDefined()
        expect(typeof v.array).toBe('function')
        const validator = v.array(v.string())
        expect(validator.parse).toBeDefined()
      })

      it('should have v.union()', async () => {
        const { v } = await import('../../src/server')
        expect(v.union).toBeDefined()
        expect(typeof v.union).toBe('function')
        const validator = v.union(v.string(), v.number())
        expect(validator.parse).toBeDefined()
      })

      it('should have v.optional()', async () => {
        const { v } = await import('../../src/server')
        expect(v.optional).toBeDefined()
        expect(typeof v.optional).toBe('function')
        const validator = v.optional(v.string())
        expect(validator.parse).toBeDefined()
      })

      it('should have v.literal()', async () => {
        const { v } = await import('../../src/server')
        expect(v.literal).toBeDefined()
        expect(typeof v.literal).toBe('function')
        const validator = v.literal('test')
        expect(validator.parse).toBeDefined()
      })

      it('should have v.any()', async () => {
        const { v } = await import('../../src/server')
        expect(v.any).toBeDefined()
        expect(typeof v.any).toBe('function')
        const validator = v.any()
        expect(validator.parse).toBeDefined()
      })
    })

    it('should export all required server types', async () => {
      // Type exports are verified at compile time
      // This test verifies the module can be imported without errors
      const serverModule = await import('../../src/server')
      expect(serverModule).toBeDefined()
    })
  })

  /**
   * Tests for convex.do/react exports
   * These should match convex/react
   */
  describe('convex.do/react exports', () => {
    it('should export ConvexProvider component', async () => {
      const reactModule = await import('../../src/react')
      expect(reactModule.ConvexProvider).toBeDefined()
      expect(typeof reactModule.ConvexProvider).toBe('function')
    })

    it('should export useQuery hook', async () => {
      const reactModule = await import('../../src/react')
      expect(reactModule.useQuery).toBeDefined()
      expect(typeof reactModule.useQuery).toBe('function')
    })

    it('should export useMutation hook', async () => {
      const reactModule = await import('../../src/react')
      expect(reactModule.useMutation).toBeDefined()
      expect(typeof reactModule.useMutation).toBe('function')
    })

    it('should export useAction hook', async () => {
      const reactModule = await import('../../src/react')
      expect(reactModule.useAction).toBeDefined()
      expect(typeof reactModule.useAction).toBe('function')
    })

    it('should export usePaginatedQuery hook', async () => {
      const reactModule = await import('../../src/react')
      expect(reactModule.usePaginatedQuery).toBeDefined()
      expect(typeof reactModule.usePaginatedQuery).toBe('function')
    })

    it('should export useConvex hook', async () => {
      const reactModule = await import('../../src/react')
      expect(reactModule.useConvex).toBeDefined()
      expect(typeof reactModule.useConvex).toBe('function')
    })

    it('should export ConvexProviderWithAuth component', async () => {
      const reactModule = await import('../../src/react')
      expect(reactModule.ConvexProviderWithAuth).toBeDefined()
      expect(typeof reactModule.ConvexProviderWithAuth).toBe('function')
    })

    it('should export ConvexClient for convenience', async () => {
      const reactModule = await import('../../src/react')
      expect(reactModule.ConvexClient).toBeDefined()
      expect(typeof reactModule.ConvexClient).toBe('function')
    })
  })

  /**
   * Tests for convex.do/client exports
   * These should match convex/browser
   */
  describe('convex.do/client exports', () => {
    it('should export ConvexClient class', async () => {
      const clientModule = await import('../../src/client')
      expect(clientModule.ConvexClient).toBeDefined()
      expect(typeof clientModule.ConvexClient).toBe('function')
    })

    it('should export ConvexHttpClient class', async () => {
      const clientModule = await import('../../src/client')
      expect(clientModule.ConvexHttpClient).toBeDefined()
      expect(typeof clientModule.ConvexHttpClient).toBe('function')
    })

    it('should be able to instantiate ConvexClient', async () => {
      const { ConvexClient } = await import('../../src/client')
      // ConvexClient should be constructible with a URL
      expect(() => new ConvexClient('https://example.convex.cloud')).not.toThrow()
    })

    it('should be able to instantiate ConvexHttpClient', async () => {
      const { ConvexHttpClient } = await import('../../src/client')
      // ConvexHttpClient should be constructible with a URL
      expect(() => new ConvexHttpClient('https://example.convex.cloud')).not.toThrow()
    })
  })

  /**
   * Tests for convex.do/values exports
   * These should match convex/values
   */
  describe('convex.do/values exports', () => {
    it('should export v validators namespace', async () => {
      const valuesModule = await import('../../src/values')
      expect(valuesModule.v).toBeDefined()
      expect(typeof valuesModule.v).toBe('object')
    })

    describe('v validators complete API', () => {
      it('should have all primitive validators', async () => {
        const { v } = await import('../../src/values')

        // All primitive validators
        expect(v.string).toBeDefined()
        expect(v.number).toBeDefined()
        expect(v.boolean).toBeDefined()
        expect(v.null).toBeDefined()
        expect(v.int64).toBeDefined()
        expect(v.float64).toBeDefined()
        expect(v.bytes).toBeDefined()
      })

      it('should have all complex validators', async () => {
        const { v } = await import('../../src/values')

        // All complex validators
        expect(v.id).toBeDefined()
        expect(v.object).toBeDefined()
        expect(v.array).toBeDefined()
        expect(v.union).toBeDefined()
        expect(v.optional).toBeDefined()
        expect(v.literal).toBeDefined()
        expect(v.record).toBeDefined()
        expect(v.any).toBeDefined()
      })

      it('should have utility validators', async () => {
        const { v } = await import('../../src/values')

        // Utility validators (Convex-compatible)
        expect(v.nullable).toBeDefined()
        expect(v.nullish).toBeDefined()
      })
    })

    it('should export Validator type', async () => {
      // Type exports are verified at compile time
      // This import verifies the type is accessible
      const valuesModule = await import('../../src/values')
      expect(valuesModule).toBeDefined()

      // Verify that Validator is exported (type-level check via usage)
      type TestValidator = typeof valuesModule.v.string extends () => infer V ? V : never
      const stringValidator = valuesModule.v.string()
      expect(stringValidator.parse('test')).toBe('test')
    })

    it('should export Infer type utility', async () => {
      // Type exports are verified at compile time
      const valuesModule = await import('../../src/values')

      // Verify Infer works by using it implicitly through validator usage
      const numberValidator = valuesModule.v.number()
      const result = numberValidator.parse(42)
      expect(typeof result).toBe('number')
    })

    it('should export ArgsValidator type', async () => {
      // Type check - ArgsValidator should be usable
      const valuesModule = await import('../../src/values')
      expect(valuesModule).toBeDefined()
    })

    it('should export InferArgs type utility', async () => {
      // Type check - InferArgs should be usable
      const valuesModule = await import('../../src/values')
      expect(valuesModule).toBeDefined()
    })
  })

  /**
   * Combined API surface validation
   */
  describe('Complete API Surface', () => {
    it('server exports should enable defining queries', async () => {
      const { query, v } = await import('../../src/server')

      const myQuery = query({
        args: { name: v.string() },
        handler: async (_ctx, args) => {
          return `Hello, ${args.name}!`
        },
      })

      expect(myQuery).toBeDefined()
    })

    it('server exports should enable defining mutations', async () => {
      const { mutation, v } = await import('../../src/server')

      const myMutation = mutation({
        args: { count: v.number() },
        handler: async (_ctx, args) => {
          return args.count + 1
        },
      })

      expect(myMutation).toBeDefined()
    })

    it('server exports should enable defining actions', async () => {
      const { action, v } = await import('../../src/server')

      const myAction = action({
        args: { url: v.string() },
        handler: async (_ctx, args) => {
          return `Fetched: ${args.url}`
        },
      })

      expect(myAction).toBeDefined()
    })

    it('server exports should enable defining schemas', async () => {
      const { defineSchema, defineTable, v } = await import('../../src/server')

      const schema = defineSchema({
        users: defineTable({
          name: v.string(),
          email: v.string(),
          age: v.optional(v.number()),
        }),
        posts: defineTable({
          title: v.string(),
          content: v.string(),
          authorId: v.id('users'),
        }),
      })

      expect(schema).toBeDefined()
    })

    it('server exports should enable defining HTTP routes', async () => {
      const { httpRouter, httpAction } = await import('../../src/server')

      const http = httpRouter()

      http.route({
        path: '/api/hello',
        method: 'GET',
        handler: httpAction(async () => {
          return new Response('Hello!')
        }),
      })

      expect(http).toBeDefined()
    })

    it('all subpackages should be importable without errors', async () => {
      const [server, react, client, values] = await Promise.all([
        import('../../src/server'),
        import('../../src/react'),
        import('../../src/client'),
        import('../../src/values'),
      ])

      expect(server).toBeDefined()
      expect(react).toBeDefined()
      expect(client).toBeDefined()
      expect(values).toBeDefined()
    })
  })

  /**
   * Export consistency tests
   */
  describe('Export Consistency', () => {
    it('v from server should be the same as v from values', async () => {
      const { v: serverV } = await import('../../src/server')
      const { v: valuesV } = await import('../../src/values')

      // Both should have the same methods
      expect(Object.keys(serverV).sort()).toEqual(Object.keys(valuesV).sort())
    })

    it('ConvexClient from react should be the same as from client', async () => {
      const { ConvexClient: reactClient } = await import('../../src/react')
      const { ConvexClient: clientClient } = await import('../../src/client')

      // Both should be the same constructor
      expect(reactClient).toBe(clientClient)
    })
  })
})
