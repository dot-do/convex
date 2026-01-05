/**
 * CORS Middleware for Cloudflare Workers
 */

import type { MiddlewareHandler, WorkerEnv } from './types'

// ============================================================================
// Types
// ============================================================================

/**
 * CORS configuration options.
 */
export interface CorsOptions {
  /** Allowed origins (default: '*') */
  origins?: string | string[]
  /** Allowed methods (default: standard HTTP methods) */
  methods?: string[]
  /** Allowed headers */
  allowedHeaders?: string[]
  /** Exposed headers */
  exposedHeaders?: string[]
  /** Allow credentials */
  credentials?: boolean
  /** Max age for preflight cache */
  maxAge?: number
}

// ============================================================================
// CORS Middleware
// ============================================================================

/**
 * CORS middleware for handling Cross-Origin Resource Sharing.
 */
export class CorsMiddleware {
  private options: Required<CorsOptions>

  constructor(options: CorsOptions = {}) {
    this.options = {
      origins: options.origins ?? '*',
      methods: options.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: options.allowedHeaders ?? ['Content-Type', 'Authorization'],
      exposedHeaders: options.exposedHeaders ?? [],
      credentials: options.credentials ?? false,
      maxAge: options.maxAge ?? 86400,
    }
  }

  /**
   * Create middleware handler.
   */
  handler(): MiddlewareHandler {
    return async (request, env, ctx, next) => {
      // Handle preflight request
      if (request.method === 'OPTIONS') {
        return this.handlePreflight(request)
      }

      // Get response from next handler
      const response = await next()

      // Add CORS headers to response
      return this.addCorsHeaders(request, response)
    }
  }

  /**
   * Handle preflight OPTIONS request.
   */
  handlePreflight(request: Request): Response {
    const origin = request.headers.get('Origin')

    if (!this.isOriginAllowed(origin)) {
      return new Response(null, { status: 403 })
    }

    const headers = new Headers()
    this.setCorsHeaders(headers, origin)

    // Preflight-specific headers
    const requestMethod = request.headers.get('Access-Control-Request-Method')
    const requestHeaders = request.headers.get('Access-Control-Request-Headers')

    if (requestMethod) {
      headers.set('Access-Control-Allow-Methods', this.options.methods.join(', '))
    }

    if (requestHeaders) {
      headers.set('Access-Control-Allow-Headers', this.options.allowedHeaders.join(', '))
    }

    headers.set('Access-Control-Max-Age', this.options.maxAge.toString())

    return new Response(null, { status: 204, headers })
  }

  /**
   * Add CORS headers to a response.
   */
  addCorsHeaders(request: Request, response: Response): Response {
    const origin = request.headers.get('Origin')

    if (!this.isOriginAllowed(origin)) {
      return response
    }

    const newResponse = new Response(response.body, response)
    this.setCorsHeaders(newResponse.headers, origin)

    return newResponse
  }

  /**
   * Check if origin is allowed.
   */
  private isOriginAllowed(origin: string | null): boolean {
    if (!origin) return true // Same-origin requests don't have Origin header

    if (this.options.origins === '*') return true

    const allowedOrigins = Array.isArray(this.options.origins)
      ? this.options.origins
      : [this.options.origins]

    return allowedOrigins.includes(origin)
  }

  /**
   * Set CORS headers on response.
   */
  private setCorsHeaders(headers: Headers, origin: string | null): void {
    // Allow-Origin
    if (this.options.origins === '*') {
      headers.set('Access-Control-Allow-Origin', '*')
    } else if (origin && this.isOriginAllowed(origin)) {
      headers.set('Access-Control-Allow-Origin', origin)
      headers.append('Vary', 'Origin')
    }

    // Allow-Credentials
    if (this.options.credentials) {
      headers.set('Access-Control-Allow-Credentials', 'true')
    }

    // Expose-Headers
    if (this.options.exposedHeaders.length > 0) {
      headers.set('Access-Control-Expose-Headers', this.options.exposedHeaders.join(', '))
    }
  }

  /**
   * Create from environment.
   */
  static fromEnv(env: WorkerEnv): CorsMiddleware {
    const origins = env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((o) => o.trim()) : '*'
    return new CorsMiddleware({ origins })
  }
}
