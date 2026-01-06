/**
 * convex.do - 100% Convex API Compatible Package on Cloudflare Workers
 *
 * Main entrypoint for the Cloudflare Worker
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { FunctionRegistry } from './server/functions/registry'
import { validateArgs } from './server/functions/shared'

// Types
export type { Env } from './env'

// Create Hono app
const app = new Hono<{ Bindings: Env }>()

// CORS middleware
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Convex-Client'],
}))

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'convex.do',
    version: '0.0.1',
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})

// Query endpoint
app.post('/api/query', async (c) => {
  const { path, args, format: _format } = await c.req.json<{
    path: string
    args: unknown
    format?: 'json' | 'convex'
  }>()

  const registry = FunctionRegistry.getInstance()
  const entry = registry.getFunction(path)

  // Check if function exists
  if (!entry) {
    return c.json({ error: `Function "${path}" not found` }, 404)
  }

  // Check visibility - internal functions cannot be called from public API
  if (entry.fn._visibility === 'internal') {
    return c.json({ error: `Cannot call internal function "${path}" from public API` }, 403)
  }

  // Validate function type
  if (entry.fn._type !== 'query') {
    return c.json({ error: `Function "${path}" is not a query` }, 400)
  }

  // Validate arguments - if no validator, pass through the original args
  let validatedArgs: unknown
  const config = entry.fn._config as { args?: unknown; strictArgs?: boolean; handler: (...args: unknown[]) => unknown }
  if (config.args === undefined) {
    // No validator defined, pass through original args as-is
    validatedArgs = args ?? {}
  } else {
    try {
      validatedArgs = validateArgs(config.args as Parameters<typeof validateArgs>[0], args, config.strictArgs)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return c.json({ error: message }, 400)
    }
  }

  // Execute the query handler
  try {
    const result = await config.handler(validatedArgs)
    return c.json({ value: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ error: message }, 500)
  }
})

// Mutation endpoint
app.post('/api/mutation', async (c) => {
  const { path, args, format: _format } = await c.req.json<{
    path: string
    args: unknown
    format?: 'json' | 'convex'
  }>()

  const registry = FunctionRegistry.getInstance()
  const entry = registry.getFunction(path)

  // Check if function exists
  if (!entry) {
    return c.json({ error: `Function "${path}" not found` }, 404)
  }

  // Check visibility - internal functions cannot be called from public API
  if (entry.fn._visibility === 'internal') {
    return c.json({ error: `Cannot call internal function "${path}" from public API` }, 403)
  }

  // Validate function type
  if (entry.fn._type !== 'mutation') {
    return c.json({ error: `Function "${path}" is not a mutation` }, 400)
  }

  // Validate arguments - if no validator, pass through the original args
  let validatedArgs: unknown
  const mutConfig = entry.fn._config as { args?: unknown; strictArgs?: boolean; handler: (...args: unknown[]) => unknown }
  if (mutConfig.args === undefined) {
    // No validator defined, pass through original args as-is
    validatedArgs = args ?? {}
  } else {
    try {
      validatedArgs = validateArgs(mutConfig.args as Parameters<typeof validateArgs>[0], args, mutConfig.strictArgs)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return c.json({ error: message }, 400)
    }
  }

  // Execute the mutation handler
  try {
    const result = await mutConfig.handler(validatedArgs)
    return c.json({ value: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ error: message }, 500)
  }
})

// Action endpoint
app.post('/api/action', async (c) => {
  const { path, args, format: _format } = await c.req.json<{
    path: string
    args: unknown
    format?: 'json' | 'convex'
  }>()

  const registry = FunctionRegistry.getInstance()
  const entry = registry.getFunction(path)

  // Check if function exists
  if (!entry) {
    return c.json({ error: `Function "${path}" not found` }, 404)
  }

  // Check visibility - internal functions cannot be called from public API
  if (entry.fn._visibility === 'internal') {
    return c.json({ error: `Cannot call internal function "${path}" from public API` }, 403)
  }

  // Validate function type
  if (entry.fn._type !== 'action') {
    return c.json({ error: `Function "${path}" is not an action` }, 400)
  }

  // Validate arguments - if no validator, pass through the original args
  let validatedArgs: unknown
  const actConfig = entry.fn._config as { args?: unknown; strictArgs?: boolean; handler: (...args: unknown[]) => unknown }
  if (actConfig.args === undefined) {
    // No validator defined, pass through original args as-is
    validatedArgs = args ?? {}
  } else {
    try {
      validatedArgs = validateArgs(actConfig.args as Parameters<typeof validateArgs>[0], args, actConfig.strictArgs)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return c.json({ error: message }, 400)
    }
  }

  // Execute the action handler
  try {
    const result = await actConfig.handler(validatedArgs)
    return c.json({ value: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ error: message }, 500)
  }
})

// WebSocket sync endpoint
app.get('/sync', async (c) => {
  const upgradeHeader = c.req.header('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket', 426)
  }

  // TODO: Implement WebSocket handling via Durable Object
  return c.text('WebSocket not yet implemented', 501)
})

// Export the app
export default app

// Durable Object exports (will be implemented)
export { ConvexDatabase } from './durable-objects/ConvexDatabase'
export { ConvexSubscription } from './durable-objects/ConvexSubscription'
export { ConvexScheduler } from './durable-objects/ConvexScheduler'
export { ConvexStorage } from './durable-objects/ConvexStorage'

// Type for environment bindings
interface Env {
  CONVEX_DATABASE: DurableObjectNamespace
  CONVEX_SUBSCRIPTION: DurableObjectNamespace
  CONVEX_SCHEDULER: DurableObjectNamespace
  CONVEX_STORAGE: DurableObjectNamespace
  STORAGE_BUCKET: R2Bucket
  ENVIRONMENT: string
}
