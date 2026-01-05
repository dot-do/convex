/**
 * Convex Worker Handler
 *
 * Main handler for the Cloudflare Worker that processes:
 * - Function calls (queries, mutations, actions)
 * - WebSocket subscriptions
 * - Custom HTTP routes
 */

import type { HttpRouter } from '../server/httpRouter'
import type {
  WorkerEnv,
  RequestHandler,
  MiddlewareHandler,
  ErrorHandler,
  FunctionCallRequest,
  FunctionCallResponse,
} from './types'
import { CorsMiddleware, type CorsOptions } from './cors'
import { RateLimiter, type RateLimitOptions } from './rate-limit'

// ============================================================================
// Types
// ============================================================================

/**
 * Worker configuration options.
 */
export interface WorkerConfig {
  /** HTTP router for custom routes */
  http?: HttpRouter
  /** CORS configuration */
  cors?: CorsOptions | boolean
  /** Rate limiting configuration */
  rateLimit?: RateLimitOptions | boolean
  /** Custom error handler */
  onError?: ErrorHandler
  /** Middleware stack */
  middleware?: MiddlewareHandler[]
}

// ============================================================================
// Convex Worker
// ============================================================================

/**
 * Main Convex Worker class that handles incoming requests.
 */
export class ConvexWorker {
  private config: WorkerConfig
  private corsMiddleware?: CorsMiddleware
  private rateLimiter?: RateLimiter

  constructor(config: WorkerConfig = {}) {
    this.config = config

    // Set up CORS
    if (config.cors === true) {
      this.corsMiddleware = new CorsMiddleware()
    } else if (config.cors && typeof config.cors === 'object') {
      this.corsMiddleware = new CorsMiddleware(config.cors)
    }

    // Set up rate limiting
    if (config.rateLimit === true) {
      this.rateLimiter = new RateLimiter({ limit: 1000 })
    } else if (config.rateLimit && typeof config.rateLimit === 'object') {
      this.rateLimiter = new RateLimiter(config.rateLimit)
    }
  }

  /**
   * Handle incoming fetch request.
   */
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    try {
      // Build middleware chain
      const middlewares: MiddlewareHandler[] = []

      // Add CORS middleware
      if (this.corsMiddleware) {
        middlewares.push(this.corsMiddleware.handler())
      }

      // Add rate limiter
      if (this.rateLimiter) {
        middlewares.push(this.rateLimiter.handler())
      }

      // Add custom middleware
      if (this.config.middleware) {
        middlewares.push(...this.config.middleware)
      }

      // Execute middleware chain
      return await this.executeMiddleware(middlewares, request, env, ctx, async () => {
        return this.handleRequest(request, env, ctx)
      })
    } catch (error) {
      return this.handleError(error as Error, request, env)
    }
  }

  /**
   * Execute middleware chain.
   */
  private async executeMiddleware(
    middlewares: MiddlewareHandler[],
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext,
    handler: () => Promise<Response>
  ): Promise<Response> {
    if (middlewares.length === 0) {
      return handler()
    }

    const [current, ...rest] = middlewares
    return current!(request, env, ctx, () =>
      this.executeMiddleware(rest, request, env, ctx, handler)
    )
  }

  /**
   * Handle the actual request after middleware.
   */
  private async handleRequest(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request, env)
    }

    // API routes
    if (path.startsWith('/api/')) {
      return this.handleApiRoute(request, env, path)
    }

    // Sync endpoint (for real-time subscriptions over HTTP)
    if (path === '/sync') {
      return this.handleSync(request, env)
    }

    // Custom HTTP routes
    if (this.config.http) {
      const ctx = await this.createHttpActionCtx(env)
      const response = await this.config.http.handle(ctx, request)
      if (response) {
        return response
      }
    }

    // 404 for unmatched routes
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * Handle API routes for function calls.
   */
  private async handleApiRoute(
    request: Request,
    env: WorkerEnv,
    path: string
  ): Promise<Response> {
    // Only accept POST for function calls
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    let body: FunctionCallRequest
    try {
      body = (await request.json()) as FunctionCallRequest
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Route to appropriate handler
    if (path === '/api/query') {
      return this.handleQuery(body, env, request)
    } else if (path === '/api/mutation') {
      return this.handleMutation(body, env, request)
    } else if (path === '/api/action') {
      return this.handleAction(body, env, request)
    }

    return new Response(JSON.stringify({ error: 'Unknown API endpoint' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * Handle query function call.
   */
  private async handleQuery(
    body: FunctionCallRequest,
    env: WorkerEnv,
    request: Request
  ): Promise<Response> {
    try {
      const id = env.CONVEX_DATABASE.idFromName('main')
      const stub = env.CONVEX_DATABASE.get(id)

      const response = await stub.fetch(
        new Request('http://internal/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: request.headers.get('Authorization') || '',
          },
          body: JSON.stringify(body),
        })
      )

      return response
    } catch (error) {
      return this.errorResponse(error as Error)
    }
  }

  /**
   * Handle mutation function call.
   */
  private async handleMutation(
    body: FunctionCallRequest,
    env: WorkerEnv,
    request: Request
  ): Promise<Response> {
    try {
      const id = env.CONVEX_DATABASE.idFromName('main')
      const stub = env.CONVEX_DATABASE.get(id)

      const response = await stub.fetch(
        new Request('http://internal/mutation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: request.headers.get('Authorization') || '',
          },
          body: JSON.stringify(body),
        })
      )

      return response
    } catch (error) {
      return this.errorResponse(error as Error)
    }
  }

  /**
   * Handle action function call.
   */
  private async handleAction(
    body: FunctionCallRequest,
    env: WorkerEnv,
    request: Request
  ): Promise<Response> {
    try {
      const id = env.CONVEX_DATABASE.idFromName('main')
      const stub = env.CONVEX_DATABASE.get(id)

      const response = await stub.fetch(
        new Request('http://internal/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: request.headers.get('Authorization') || '',
          },
          body: JSON.stringify(body),
        })
      )

      return response
    } catch (error) {
      return this.errorResponse(error as Error)
    }
  }

  /**
   * Handle WebSocket upgrade for real-time subscriptions.
   */
  private async handleWebSocket(request: Request, env: WorkerEnv): Promise<Response> {
    try {
      const id = env.CONVEX_DATABASE.idFromName('main')
      const stub = env.CONVEX_DATABASE.get(id)

      // Forward the WebSocket upgrade to the Durable Object
      return stub.fetch(request)
    } catch (error) {
      return new Response('WebSocket connection failed', { status: 500 })
    }
  }

  /**
   * Handle sync endpoint for real-time updates over HTTP.
   */
  private async handleSync(request: Request, env: WorkerEnv): Promise<Response> {
    try {
      const id = env.CONVEX_DATABASE.idFromName('main')
      const stub = env.CONVEX_DATABASE.get(id)

      const response = await stub.fetch(
        new Request('http://internal/sync', {
          method: request.method,
          headers: request.headers,
          body: request.body,
        })
      )

      return response
    } catch (error) {
      return this.errorResponse(error as Error)
    }
  }

  /**
   * Create HTTP action context for custom routes.
   */
  private async createHttpActionCtx(env: WorkerEnv) {
    const id = env.CONVEX_DATABASE.idFromName('main')
    const stub = env.CONVEX_DATABASE.get(id)

    return {
      runQuery: async <T>(query: unknown, args: unknown): Promise<T> => {
        const response = await stub.fetch(
          new Request('http://internal/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: (query as any)._path, args }),
          })
        )
        const result = await response.json() as FunctionCallResponse
        return result.value as T
      },
      runMutation: async <T>(mutation: unknown, args: unknown): Promise<T> => {
        const response = await stub.fetch(
          new Request('http://internal/mutation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: (mutation as any)._path, args }),
          })
        )
        const result = await response.json() as FunctionCallResponse
        return result.value as T
      },
      runAction: async <T>(action: unknown, args: unknown): Promise<T> => {
        const response = await stub.fetch(
          new Request('http://internal/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: (action as any)._path, args }),
          })
        )
        const result = await response.json() as FunctionCallResponse
        return result.value as T
      },
      storage: {
        getUrl: async (storageId: string): Promise<string | null> => {
          const response = await stub.fetch(
            new Request(`http://internal/storage/${storageId}`, {
              method: 'GET',
            })
          )
          if (!response.ok) return null
          const result = await response.json() as { url: string }
          return result.url
        },
        generateUploadUrl: async (): Promise<string> => {
          const response = await stub.fetch(
            new Request('http://internal/storage/upload', {
              method: 'POST',
            })
          )
          const result = await response.json() as { url: string }
          return result.url
        },
      },
    }
  }

  /**
   * Create error response.
   */
  private errorResponse(error: Error): Response {
    return new Response(
      JSON.stringify({
        error: error.message,
        type: error.name,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  /**
   * Handle errors.
   */
  private handleError(error: Error, request: Request, env: WorkerEnv): Response {
    if (this.config.onError) {
      return this.config.onError(error, request, env)
    }

    console.error('Unhandled error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Convex Worker handler.
 *
 * @example
 * ```typescript
 * // worker.ts
 * import { createWorker, httpRouter, httpAction } from 'convex.do';
 *
 * const http = httpRouter();
 * http.post('/webhooks/stripe', httpAction(async (ctx, request) => {
 *   // Handle webhook
 *   return new Response('OK');
 * }));
 *
 * export default createWorker({
 *   http,
 *   cors: true,
 *   rateLimit: { limit: 1000 },
 * });
 * ```
 */
export function createWorker(config: WorkerConfig = {}): {
  fetch: RequestHandler
} {
  const worker = new ConvexWorker(config)

  return {
    fetch: (request, env, ctx) => worker.fetch(request, env, ctx),
  }
}
