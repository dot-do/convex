/**
 * convex.do - 100% Convex API Compatible Package on Cloudflare Workers
 *
 * Main entrypoint for the Cloudflare Worker
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'

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
  const { path, args, format } = await c.req.json<{
    path: string
    args: unknown
    format?: 'json' | 'convex'
  }>()

  // TODO: Implement query execution
  return c.json({
    status: 'not_implemented',
    path,
    args,
  })
})

// Mutation endpoint
app.post('/api/mutation', async (c) => {
  const { path, args, format } = await c.req.json<{
    path: string
    args: unknown
    format?: 'json' | 'convex'
  }>()

  // TODO: Implement mutation execution
  return c.json({
    status: 'not_implemented',
    path,
    args,
  })
})

// Action endpoint
app.post('/api/action', async (c) => {
  const { path, args, format } = await c.req.json<{
    path: string
    args: unknown
    format?: 'json' | 'convex'
  }>()

  // TODO: Implement action execution
  return c.json({
    status: 'not_implemented',
    path,
    args,
  })
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
