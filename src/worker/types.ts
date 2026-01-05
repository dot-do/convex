/**
 * Worker Types
 */

import type { DurableObjectNamespace } from '@cloudflare/workers-types'

// ============================================================================
// Environment Types
// ============================================================================

/**
 * Worker environment bindings.
 */
export interface WorkerEnv {
  /** Durable Object namespace for the Convex database */
  CONVEX_DATABASE: DurableObjectNamespace
  /** Optional: JWT secret for auth */
  JWT_SECRET?: string
  /** Optional: Allowed CORS origins */
  CORS_ORIGINS?: string
  /** Optional: Rate limit per minute */
  RATE_LIMIT_PER_MINUTE?: string
}

// ============================================================================
// Handler Types
// ============================================================================

/**
 * Request handler function.
 */
export type RequestHandler = (
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext
) => Promise<Response>

/**
 * Route handler function with extracted path parameters.
 */
export type RouteHandler = (
  request: Request & { params: Record<string, string> },
  env: WorkerEnv,
  ctx: ExecutionContext
) => Promise<Response>

/**
 * Middleware handler that can modify request/response.
 */
export type MiddlewareHandler = (
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
  next: () => Promise<Response>
) => Promise<Response>

/**
 * Error handler for unhandled exceptions.
 */
export type ErrorHandler = (
  error: Error,
  request: Request,
  env: WorkerEnv
) => Response

// ============================================================================
// Function Types
// ============================================================================

/**
 * Function call request body.
 */
export interface FunctionCallRequest {
  /** Path to the function (e.g., "messages:send") */
  path: string
  /** Function arguments */
  args: unknown
  /** Optional format (defaults to "json") */
  format?: 'json' | 'convex'
}

/**
 * Function call response.
 */
export interface FunctionCallResponse {
  /** The return value of the function */
  value: unknown
  /** Log lines from the function execution */
  logLines?: string[]
}

/**
 * Subscription request for WebSocket.
 */
export interface SubscriptionRequest {
  /** Type of message */
  type: 'subscribe' | 'unsubscribe'
  /** Subscription ID */
  subscriptionId: string
  /** Query path */
  path: string
  /** Query arguments */
  args: unknown
}

/**
 * Subscription update message.
 */
export interface SubscriptionUpdate {
  /** Type of message */
  type: 'update'
  /** Subscription ID */
  subscriptionId: string
  /** Updated value */
  value: unknown
}
