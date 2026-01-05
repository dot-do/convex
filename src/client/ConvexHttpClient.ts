/**
 * ConvexHttpClient - HTTP-only client
 *
 * For server-side or environments where WebSocket is not available.
 */

import type { FunctionReference } from '../types'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for creating a ConvexHttpClient.
 */
export interface HttpClientOptions {
  /** Custom fetch implementation */
  fetch?: typeof fetch
  /** Default timeout for requests in milliseconds */
  timeout?: number
}

// ============================================================================
// ConvexHttpClient Implementation
// ============================================================================

/**
 * HTTP-only client for convex.do.
 *
 * Use this client when:
 * - Running on the server (Node.js, Edge functions)
 * - WebSocket is not available
 * - You don't need real-time subscriptions
 *
 * @example
 * ```typescript
 * import { ConvexHttpClient } from "convex.do/client";
 *
 * const client = new ConvexHttpClient("https://your-worker.workers.dev");
 *
 * // Run a query
 * const messages = await client.query(api.messages.list, { channel });
 *
 * // Run a mutation
 * await client.mutation(api.messages.send, { channel, body: "Hello!" });
 *
 * // Run an action
 * const result = await client.action(api.ai.generate, { prompt: "..." });
 * ```
 */
export class ConvexHttpClient {
  private url: string
  private options: Required<HttpClientOptions>
  private authToken: string | null = null

  constructor(url: string, options: HttpClientOptions = {}) {
    this.url = url.replace(/\/$/, '')

    this.options = {
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      timeout: options.timeout ?? 30000,
    }
  }

  /**
   * Set the authentication token.
   */
  setAuth(token: string): void {
    this.authToken = token
  }

  /**
   * Clear the authentication token.
   */
  clearAuth(): void {
    this.authToken = null
  }

  /**
   * Run a query.
   */
  async query<T>(
    query: FunctionReference<'query', unknown, T>,
    args: unknown
  ): Promise<T> {
    return this.request<T>('/api/query', query._path, args)
  }

  /**
   * Run a mutation.
   */
  async mutation<T>(
    mutation: FunctionReference<'mutation', unknown, T>,
    args: unknown
  ): Promise<T> {
    return this.request<T>('/api/mutation', mutation._path, args)
  }

  /**
   * Run an action.
   */
  async action<T>(
    action: FunctionReference<'action', unknown, T>,
    args: unknown
  ): Promise<T> {
    return this.request<T>('/api/action', action._path, args)
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async request<T>(
    endpoint: string,
    path: string,
    args: unknown
  ): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)

    try {
      const response = await this.options.fetch(`${this.url}${endpoint}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          path,
          args,
          format: 'json',
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = await response.json() as { error?: string; message?: string }
        throw new Error(error.error || error.message || `Request failed: ${response.status}`)
      }

      return response.json() as Promise<T>
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }

    return headers
  }
}
