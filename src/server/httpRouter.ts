/**
 * HTTP Router for custom HTTP endpoints
 *
 * Allows defining custom HTTP routes that can handle webhooks, APIs, etc.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * HTTP methods supported by the router.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'

/**
 * Context for HTTP action handlers.
 */
export interface HttpActionCtx {
  /** Run a query */
  runQuery<T>(query: unknown, args: unknown): Promise<T>
  /** Run a mutation */
  runMutation<T>(mutation: unknown, args: unknown): Promise<T>
  /** Run an action */
  runAction<T>(action: unknown, args: unknown): Promise<T>
  /** Storage operations */
  storage: {
    getUrl(storageId: string): Promise<string | null>
    generateUploadUrl(): Promise<string>
  }
}

/**
 * HTTP action handler function.
 */
export type HttpActionHandler = (
  ctx: HttpActionCtx,
  request: Request
) => Promise<Response>

/**
 * HTTP action configuration.
 */
export interface HttpActionConfig {
  /** Path pattern (e.g., "/webhooks/stripe") */
  path: string
  /** HTTP method */
  method: HttpMethod
  /** Handler function */
  handler: HttpActionHandler
}

/**
 * A registered HTTP action.
 */
export interface RegisteredHttpAction {
  readonly _type: 'httpAction'
  readonly _config: HttpActionConfig
}

/**
 * Route definition in the router.
 */
export interface RouteDefinition {
  path: string
  method: HttpMethod
  handler: HttpActionHandler
}

// ============================================================================
// HTTP Router
// ============================================================================

/**
 * HTTP Router class for managing routes.
 */
export class HttpRouter {
  private routes: RouteDefinition[] = []

  /**
   * Add a route for any HTTP method.
   */
  route(config: {
    path: string
    method: HttpMethod
    handler: RegisteredHttpAction
  }): this {
    this.routes.push({
      path: config.path,
      method: config.method,
      handler: config.handler._config.handler,
    })
    return this
  }

  /**
   * Add a GET route.
   */
  get(path: string, handler: RegisteredHttpAction): this {
    return this.route({ path, method: 'GET', handler })
  }

  /**
   * Add a POST route.
   */
  post(path: string, handler: RegisteredHttpAction): this {
    return this.route({ path, method: 'POST', handler })
  }

  /**
   * Add a PUT route.
   */
  put(path: string, handler: RegisteredHttpAction): this {
    return this.route({ path, method: 'PUT', handler })
  }

  /**
   * Add a PATCH route.
   */
  patch(path: string, handler: RegisteredHttpAction): this {
    return this.route({ path, method: 'PATCH', handler })
  }

  /**
   * Add a DELETE route.
   */
  delete(path: string, handler: RegisteredHttpAction): this {
    return this.route({ path, method: 'DELETE', handler })
  }

  /**
   * Add an OPTIONS route.
   */
  options(path: string, handler: RegisteredHttpAction): this {
    return this.route({ path, method: 'OPTIONS', handler })
  }

  /**
   * Add a HEAD route.
   */
  head(path: string, handler: RegisteredHttpAction): this {
    return this.route({ path, method: 'HEAD', handler })
  }

  /**
   * Get all registered routes.
   */
  getRoutes(): readonly RouteDefinition[] {
    return this.routes
  }

  /**
   * Match a request to a route.
   */
  match(request: Request): RouteDefinition | null {
    const url = new URL(request.url)
    const method = request.method as HttpMethod
    const path = url.pathname

    for (const route of this.routes) {
      if (route.method === method && this.pathMatches(route.path, path)) {
        return route
      }
    }

    return null
  }

  /**
   * Check if a path matches a route pattern.
   * Supports simple patterns like "/api/users/:id"
   */
  private pathMatches(pattern: string, path: string): boolean {
    // Exact match
    if (pattern === path) return true

    // Pattern matching with path parameters
    const patternParts = pattern.split('/')
    const pathParts = path.split('/')

    if (patternParts.length !== pathParts.length) return false

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]
      const pathPart = pathParts[i]

      // Path parameter (e.g., ":id")
      if (patternPart?.startsWith(':')) continue

      // Exact match required
      if (patternPart !== pathPart) return false
    }

    return true
  }

  /**
   * Extract path parameters from a request.
   */
  extractParams(pattern: string, path: string): Record<string, string> {
    const params: Record<string, string> = {}
    const patternParts = pattern.split('/')
    const pathParts = path.split('/')

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]
      const pathPart = pathParts[i]

      if (patternPart?.startsWith(':') && pathPart) {
        const paramName = patternPart.slice(1)
        params[paramName] = pathPart
      }
    }

    return params
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an HTTP router.
 *
 * @example
 * ```typescript
 * // convex/http.ts
 * import { httpRouter, httpAction } from "convex.do/server";
 * import { api } from "./_generated/api";
 *
 * const http = httpRouter();
 *
 * http.route({
 *   path: "/webhooks/stripe",
 *   method: "POST",
 *   handler: stripeWebhook,
 * });
 *
 * export default http;
 * ```
 */
export function httpRouter(): HttpRouter {
  return new HttpRouter()
}

/**
 * Create an HTTP action handler.
 *
 * @example
 * ```typescript
 * import { httpAction } from "convex.do/server";
 * import { api } from "./_generated/api";
 *
 * export const stripeWebhook = httpAction(async (ctx, request) => {
 *   const body = await request.text();
 *   const signature = request.headers.get("stripe-signature");
 *
 *   // Verify and process webhook
 *   await ctx.runMutation(api.payments.processWebhook, {
 *     body,
 *     signature,
 *   });
 *
 *   return new Response("OK", { status: 200 });
 * });
 * ```
 */
export function httpAction(handler: HttpActionHandler): RegisteredHttpAction {
  return {
    _type: 'httpAction',
    _config: {
      path: '',
      method: 'GET',
      handler,
    },
  }
}

// ============================================================================
// Export Types
// ============================================================================

export type { HttpActionCtx, HttpActionHandler, HttpActionConfig, RouteDefinition }
