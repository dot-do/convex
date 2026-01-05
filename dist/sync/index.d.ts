/**
 * Conflict Resolution for Convex Sync
 *
 * Provides conflict detection and resolution for concurrent updates
 * in the Convex sync system.
 *
 * Bead: convex-936.6 - Conflict Resolution
 */
/**
 * Strategy for resolving conflicts
 */
type ConflictStrategy = 'server-wins' | 'client-wins' | 'merge' | 'manual';
/**
 * Type of conflict detected
 */
type ConflictType = 'field-conflict' | 'delete-update' | 'update-delete';
/**
 * Type of change operation
 */
type ChangeType = 'insert' | 'update' | 'delete';
/**
 * Represents a single field conflict
 */
interface FieldConflict {
    field: string;
    localValue: unknown;
    serverValue: unknown;
}
/**
 * Represents a change to be synced
 */
interface Change {
    id: string;
    documentId: string;
    table: string;
    type: ChangeType;
    fields: Record<string, unknown>;
    version: number;
    timestamp: number;
    baseFields?: Record<string, unknown>;
}
/**
 * Represents a detected conflict
 */
interface Conflict {
    type: ConflictType;
    localChange: Change;
    serverChange: Change;
    fieldConflicts: FieldConflict[];
    localVersion: number;
    serverVersion: number;
    versionDiff: number;
    localTimestamp: number;
    serverTimestamp: number;
    isLocalStale: boolean;
}
/**
 * Result of conflict resolution
 */
interface ResolvedChange {
    type: ChangeType;
    fields: Record<string, unknown>;
    version: number;
    resolutionStrategy?: ConflictStrategy | 'custom';
    mergedFields?: string[];
    baseFields?: Record<string, unknown>;
}
/**
 * Custom conflict handler function
 */
type ConflictHandler = (conflict: Conflict) => ResolvedChange | Promise<ResolvedChange>;
/**
 * Custom resolver function
 */
type CustomResolver = (local: Change, server: Change) => {
    fields: Record<string, unknown>;
    version: number;
    type?: ChangeType;
};
/**
 * Field-level strategy configuration
 */
type FieldStrategy = Record<string, Record<string, ConflictStrategy>>;
/**
 * Conflict listener callback
 */
type ConflictListener = (conflict: Conflict) => void;
/**
 * Options for ConflictResolver
 */
interface ConflictResolverOptions {
    defaultStrategy?: ConflictStrategy;
    onConflict?: ConflictHandler;
    versionGenerator?: (serverVersion: number) => number;
}
/**
 * Handles conflict detection and resolution for sync operations
 */
declare class ConflictResolver {
    readonly defaultStrategy: ConflictStrategy;
    readonly conflictHandler?: ConflictHandler;
    readonly fieldStrategies: FieldStrategy;
    private readonly versionGenerator;
    private readonly conflictListeners;
    constructor(options?: ConflictResolverOptions);
    /**
     * Detect conflicts between local and server changes
     */
    detectConflict(localChange: Change, serverChange: Change): Conflict | null;
    /**
     * Detect field-level conflicts between two field objects
     */
    private detectFieldConflicts;
    /**
     * Resolve a conflict using the specified strategy
     */
    resolveConflict(conflict: Conflict, strategy: ConflictStrategy | CustomResolver): ResolvedChange;
    /**
     * Resolve a conflict asynchronously (for async handlers)
     */
    resolveConflictAsync(conflict: Conflict, strategy: ConflictStrategy | CustomResolver): Promise<ResolvedChange>;
    /**
     * Resolve using server-wins strategy
     */
    private resolveServerWins;
    /**
     * Resolve using client-wins strategy
     */
    private resolveClientWins;
    /**
     * Resolve using merge strategy
     */
    private resolveMerge;
    /**
     * Resolve delete conflicts
     */
    private resolveDeleteConflict;
    /**
     * Auto-resolve non-conflicting changes
     */
    autoResolve(localChange: Change, serverChange: Change): ResolvedChange;
    /**
     * Set strategy for a specific field in a table
     */
    setFieldStrategy(table: string, field: string, strategy: ConflictStrategy): void;
    /**
     * Get strategy for a specific field in a table
     */
    getFieldStrategy(table: string, field: string): ConflictStrategy;
    /**
     * Clear strategy for a specific field
     */
    clearFieldStrategy(table: string, field: string): void;
    /**
     * Clear all field strategies
     */
    clearAllFieldStrategies(): void;
    /**
     * Add a conflict listener
     */
    addConflictListener(listener: ConflictListener): void;
    /**
     * Remove a conflict listener
     */
    removeConflictListener(listener: ConflictListener): void;
    /**
     * Notify all listeners of a conflict
     */
    private notifyListeners;
}

/**
 * Subscription State Management
 *
 * Provides client-side subscription management for real-time queries
 * in a Convex-compatible way.
 *
 * Features:
 * - Subscribe to queries with callbacks
 * - Track subscription lifecycle (pending, active, error, closed)
 * - Handle multiple subscriptions to same query
 * - Reference counting for deduplicated subscriptions
 * - Callback invocation on data changes
 *
 * @module sync/subscription
 */
/**
 * Subscription callback function type.
 */
type SubscriptionCallback<T = unknown> = (data: T) => void | Promise<void>;
/**
 * Error callback function type.
 */
type ErrorCallback = (error: Error) => void;
/**
 * Subscription states.
 */
declare enum SubscriptionState {
    /** Subscription created but no data received yet */
    Pending = "pending",
    /** Subscription is active and receiving updates */
    Active = "active",
    /** Subscription encountered an error */
    Error = "error",
    /** Subscription has been closed */
    Closed = "closed"
}
/**
 * Options for creating a subscription.
 */
interface SubscriptionOptions {
    /** Skip calling the callback for the initial data */
    skipInitialCallback?: boolean;
    /** Priority level for the subscription */
    priority?: 'low' | 'normal' | 'high';
    /** Error callback */
    onError?: ErrorCallback;
}
/**
 * Options for the SubscriptionManager.
 */
interface SubscriptionManagerOptions {
    /** Maximum number of subscriptions allowed */
    maxSubscriptions?: number;
    /** Enable deduplication of subscriptions with same query and args */
    deduplicateSubscriptions?: boolean;
    /** Track data history for subscriptions */
    trackHistory?: boolean;
    /** Callback when a subscription is created */
    onSubscribe?: (subscription: Subscription) => void;
    /** Callback when a subscription is closed */
    onUnsubscribe?: (subscription: Subscription) => void;
    /** Callback when a subscription receives data */
    onUpdate?: (subscription: Subscription, data: unknown) => void;
    /** Callback when a subscription encounters an error */
    onSubscriptionError?: (subscription: Subscription, error: Error) => void;
}
/**
 * Filter options for getSubscriptions().
 */
interface SubscriptionFilter {
    /** Filter by query path */
    query?: string;
    /** Filter by subscription state */
    state?: SubscriptionState;
}
/**
 * Update options for updateSubscription().
 */
interface UpdateOptions {
    /** Mark this as the initial data update */
    isInitial?: boolean;
}
/**
 * JSON representation of a subscription.
 */
interface SubscriptionJSON {
    id: string;
    query: string;
    args: unknown;
    state: SubscriptionState;
    data: unknown;
    createdAt: number;
    updatedAt: number | undefined;
}
/**
 * JSON representation of the manager state.
 */
interface SubscriptionManagerJSON {
    subscriptions: SubscriptionJSON[];
    count: number;
}
/**
 * Error class for subscription-related errors.
 */
declare class SubscriptionError extends Error {
    /** Error code */
    code?: string;
    /** Associated subscription ID */
    subscriptionId?: string;
    constructor(message: string, code?: string, subscriptionId?: string);
}
/**
 * Represents a single subscription to a query.
 */
declare class Subscription<T = unknown> {
    /** Unique subscription ID */
    readonly id: string;
    /** Query path */
    readonly query: string;
    /** Query arguments */
    readonly args: unknown;
    /** Subscription options */
    readonly options?: SubscriptionOptions;
    /** Creation timestamp */
    readonly createdAt: number;
    /** Current subscription state */
    private _state;
    /** Current data */
    private _data;
    /** Current error */
    private _error;
    /** Last update timestamp */
    private _updatedAt;
    /** Data history (if tracking enabled) */
    private _history;
    /** Callback function */
    private _callback;
    /** Reference to the manager */
    private _manager;
    /** Whether initial callback has been skipped */
    private _initialSkipped;
    constructor(id: string, query: string, args: unknown, callback: SubscriptionCallback<T>, manager: SubscriptionManager, options?: SubscriptionOptions, trackHistory?: boolean);
    get state(): SubscriptionState;
    get data(): T | undefined;
    get error(): Error | undefined;
    get updatedAt(): number | undefined;
    get history(): T[] | undefined;
    get isActive(): boolean;
    get isPending(): boolean;
    get isClosed(): boolean;
    get hasError(): boolean;
    /** @internal */
    _setState(state: SubscriptionState): void;
    /** @internal */
    _setData(data: T, options?: UpdateOptions): boolean;
    /** @internal */
    _setError(error: Error): void;
    /** @internal */
    _close(): void;
    /**
     * Unsubscribe from this subscription.
     */
    unsubscribe(): void;
    /**
     * Convert subscription to JSON representation.
     */
    toJSON(): SubscriptionJSON;
}
/**
 * Manages subscriptions to real-time queries.
 */
declare class SubscriptionManager {
    private _options;
    private _subscriptions;
    private _disposed;
    private _queryRefCounts;
    private _querySubscriptions;
    constructor(options?: SubscriptionManagerOptions);
    /**
     * Subscribe to a query with a callback.
     */
    subscribe<T = unknown>(query: string, args: unknown, callback: SubscriptionCallback<T>, options?: SubscriptionOptions): Subscription<T>;
    /**
     * Unsubscribe from a subscription by ID.
     */
    unsubscribe(subscriptionId: string): boolean;
    /**
     * Update subscription data.
     */
    updateSubscription(subscriptionId: string, data: unknown, options?: UpdateOptions): boolean;
    /**
     * Set subscription error.
     */
    setSubscriptionError(subscriptionId: string, error: Error): boolean;
    /**
     * Get all subscriptions, optionally filtered.
     */
    getSubscriptions(filter?: SubscriptionFilter): Subscription[];
    /**
     * Get subscription by ID.
     */
    getSubscriptionById(subscriptionId: string): Subscription | undefined;
    /**
     * Check if a subscription exists.
     */
    hasSubscription(subscriptionId: string): boolean;
    /**
     * Get the count of active subscriptions.
     */
    getSubscriptionCount(): number;
    /**
     * Unsubscribe all subscriptions.
     */
    unsubscribeAll(): void;
    /**
     * Unsubscribe all subscriptions for a specific query.
     */
    unsubscribeByQuery(query: string): number;
    /**
     * Get the reference count for a query (for deduplication).
     */
    getQueryRefCount(query: string, args: unknown): number;
    /**
     * Check if a query is still active (has subscriptions).
     */
    hasActiveQuery(query: string, args: unknown): boolean;
    /**
     * Update all subscriptions for a specific query (for deduplication).
     */
    updateByQuery(query: string, args: unknown, data: unknown): number;
    /**
     * Dispose the manager and clean up resources.
     */
    dispose(): void;
    /**
     * Convert manager state to JSON.
     */
    toJSON(): SubscriptionManagerJSON;
}

export { type Change, type ChangeType, type Conflict, type ConflictHandler, type ConflictListener, ConflictResolver, type ConflictResolverOptions, type ConflictStrategy, type ConflictType, type CustomResolver, type ErrorCallback, type FieldConflict, type FieldStrategy, type ResolvedChange, Subscription, type SubscriptionCallback, SubscriptionError, type SubscriptionFilter, type SubscriptionJSON, SubscriptionManager, type SubscriptionManagerJSON, type SubscriptionManagerOptions, type SubscriptionOptions, SubscriptionState, type UpdateOptions };
