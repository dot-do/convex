/**
 * Environment bindings type definition for Cloudflare Workers
 */

export interface Env {
  // Durable Objects
  CONVEX_DATABASE: DurableObjectNamespace
  CONVEX_SUBSCRIPTION: DurableObjectNamespace
  CONVEX_SCHEDULER: DurableObjectNamespace
  CONVEX_STORAGE: DurableObjectNamespace

  // R2 Storage
  STORAGE_BUCKET: R2Bucket

  // Environment variables
  ENVIRONMENT: string
}
