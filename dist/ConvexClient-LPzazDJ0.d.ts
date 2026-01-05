import { F as FunctionReference } from './index-CAfBc_tK.js';

/**
 * ConvexClient - WebSocket-based reactive client
 *
 * Provides real-time subscriptions and optimistic updates.
 */

/**
 * Options for creating a ConvexClient.
 */
interface ClientOptions {
    /** Custom fetch implementation */
    fetch?: typeof fetch;
    /** Custom WebSocket implementation */
    WebSocket?: typeof WebSocket;
    /** Whether to automatically reconnect on disconnect */
    autoReconnect?: boolean;
    /** Reconnection delay in milliseconds */
    reconnectDelay?: number;
    /** Maximum reconnection attempts */
    maxReconnectAttempts?: number;
}
/**
 * Options for subscribing to a query.
 */
interface SubscriptionOptions {
    /** Called when the subscription is first established */
    onConnect?: () => void;
    /** Called when the subscription is lost */
    onDisconnect?: () => void;
    /** Called when an error occurs */
    onError?: (error: Error) => void;
}
/**
 * Callback for subscription updates.
 */
type SubscriptionCallback<T> = (result: T) => void;
/**
 * Handle for managing a subscription.
 */
interface SubscriptionHandle {
    /** Unsubscribe from the query */
    unsubscribe: () => void;
}
/**
 * WebSocket-based client for convex.do with real-time subscriptions.
 *
 * @example
 * ```typescript
 * import { ConvexClient } from "convex.do/client";
 *
 * const client = new ConvexClient("https://your-worker.workers.dev");
 *
 * // Subscribe to a query
 * const unsubscribe = client.onUpdate(api.messages.list, { channel }, (messages) => {
 *   console.log("Messages:", messages);
 * });
 *
 * // Run a mutation
 * await client.mutation(api.messages.send, { channel, body: "Hello!" });
 *
 * // Clean up
 * unsubscribe();
 * client.close();
 * ```
 */
declare class ConvexClient {
    private url;
    private wsUrl;
    private options;
    private ws;
    private subscriptions;
    private pendingSubscriptions;
    private authToken;
    private isConnected;
    private reconnectAttempts;
    private reconnectTimeout;
    private pingInterval;
    private idCounter;
    constructor(url: string, options?: ClientOptions);
    /**
     * Set the authentication token.
     */
    setAuth(token: string): void;
    /**
     * Clear the authentication token.
     */
    clearAuth(): void;
    /**
     * Subscribe to a query with real-time updates.
     */
    onUpdate<T>(query: FunctionReference<'query', unknown, T>, args: unknown, callback: SubscriptionCallback<T>, options?: SubscriptionOptions): () => void;
    /**
     * Run a query (one-time, non-reactive).
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
    /**
     * Close the client connection.
     */
    close(): void;
    private connect;
    private handleMessage;
    private send;
    private unsubscribe;
    private generateId;
    private getHeaders;
}

export { ConvexClient as C, type SubscriptionOptions as S, type ClientOptions as a, type SubscriptionCallback as b, type SubscriptionHandle as c };
