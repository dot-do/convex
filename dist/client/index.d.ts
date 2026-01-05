export { a as ClientOptions, C as ConvexClient, b as SubscriptionCallback, c as SubscriptionHandle, S as SubscriptionOptions } from '../ConvexClient-LPzazDJ0.js';
import { F as FunctionReference } from '../index-CAfBc_tK.js';
export { f as ConvexError, I as Id } from '../index-CAfBc_tK.js';

/**
 * ConvexHttpClient - HTTP-only client
 *
 * For server-side or environments where WebSocket is not available.
 */

/**
 * Options for creating a ConvexHttpClient.
 */
interface HttpClientOptions {
    /** Custom fetch implementation */
    fetch?: typeof fetch;
    /** Default timeout for requests in milliseconds */
    timeout?: number;
}
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
declare class ConvexHttpClient {
    private url;
    private options;
    private authToken;
    constructor(url: string, options?: HttpClientOptions);
    /**
     * Set the authentication token.
     */
    setAuth(token: string): void;
    /**
     * Clear the authentication token.
     */
    clearAuth(): void;
    /**
     * Run a query.
     */
    query<T>(query: FunctionReference<'query', unknown, T>, args: unknown): Promise<T>;
    /**
     * Run a mutation.
     */
    mutation<T>(mutation: FunctionReference<'mutation', unknown, T>, args: unknown): Promise<T>;
    /**
     * Run an action.
     */
    action<T>(action: FunctionReference<'action', unknown, T>, args: unknown): Promise<T>;
    private request;
    private getHeaders;
}

export { ConvexHttpClient, FunctionReference, type HttpClientOptions };
