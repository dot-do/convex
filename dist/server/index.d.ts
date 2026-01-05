import { ArgsValidator, Validator, Infer } from '../values/index.js';
export { InferArgs, v } from '../values/index.js';
import { I as Id, P as PaginationOptions, a as PaginationResult, S as ScheduledFunctionId, U as UserIdentity, b as StorageId, F as FunctionReference$1 } from '../index-CAfBc_tK.js';
export { f as ConvexError, C as ConvexValue, D as Doc, d as FunctionType, e as FunctionVisibility, G as GenericId, c as SystemFields } from '../index-CAfBc_tK.js';

/**
 * Query Builder for database queries (Layer 4)
 *
 * Provides a fluent API for building database queries with index support.
 */

/**
 * Builder for index range expressions.
 */
interface IndexRangeBuilder$1<IndexFields extends string[]> {
    /**
     * Filter for equality on the current index field.
     */
    eq<F extends IndexFields[number]>(field: F, value: unknown): IndexRangeBuilder$1<IndexFields>;
    /**
     * Filter for less than on the current index field.
     */
    lt<F extends IndexFields[number]>(field: F, value: unknown): IndexRangeBuilder$1<IndexFields>;
    /**
     * Filter for less than or equal on the current index field.
     */
    lte<F extends IndexFields[number]>(field: F, value: unknown): IndexRangeBuilder$1<IndexFields>;
    /**
     * Filter for greater than on the current index field.
     */
    gt<F extends IndexFields[number]>(field: F, value: unknown): IndexRangeBuilder$1<IndexFields>;
    /**
     * Filter for greater than or equal on the current index field.
     */
    gte<F extends IndexFields[number]>(field: F, value: unknown): IndexRangeBuilder$1<IndexFields>;
}
/**
 * Index range expression for withIndex.
 */
type IndexRange<IndexFields extends string[]> = IndexRangeBuilder$1<IndexFields> | ((q: IndexRangeBuilder$1<IndexFields>) => IndexRangeBuilder$1<IndexFields>);
/**
 * Filter expression builder.
 */
interface FilterBuilder$1<Doc> {
    /**
     * Equality filter.
     */
    eq<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression$1;
    /**
     * Not equal filter.
     */
    neq<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression$1;
    /**
     * Less than filter.
     */
    lt<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression$1;
    /**
     * Less than or equal filter.
     */
    lte<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression$1;
    /**
     * Greater than filter.
     */
    gt<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression$1;
    /**
     * Greater than or equal filter.
     */
    gte<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression$1;
    /**
     * Logical AND of filters.
     */
    and(...filters: FilterExpression$1[]): FilterExpression$1;
    /**
     * Logical OR of filters.
     */
    or(...filters: FilterExpression$1[]): FilterExpression$1;
    /**
     * Logical NOT of a filter.
     */
    not(filter: FilterExpression$1): FilterExpression$1;
}
/**
 * A filter expression.
 */
interface FilterExpression$1 {
    readonly _brand: 'FilterExpression';
}
/**
 * Initial query state - can use withIndex or proceed to filtering.
 */
interface QueryInitializer$1<TableName extends string> {
    /**
     * Use a specific index for the query.
     */
    withIndex<IndexName extends string>(indexName: IndexName, indexRange?: (q: IndexRangeBuilder$1<string[]>) => IndexRangeBuilder$1<string[]>): QueryBuilder$1<TableName>;
    /**
     * Use a search index for full-text search.
     */
    withSearchIndex<IndexName extends string>(indexName: IndexName, searchFilter: (q: SearchFilterBuilder$1) => SearchFilterBuilder$1): QueryBuilder$1<TableName>;
    /**
     * Filter the query results.
     */
    filter(predicate: (q: FilterBuilder$1<Record<string, unknown>>) => FilterExpression$1): QueryBuilder$1<TableName>;
    /**
     * Order results by _creationTime.
     */
    order(order: 'asc' | 'desc'): QueryBuilder$1<TableName>;
    /**
     * Collect all results.
     */
    collect(): Promise<Array<Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }>>;
    /**
     * Get the first result.
     */
    first(): Promise<(Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }) | null>;
    /**
     * Get exactly one result (throws if not exactly one).
     */
    unique(): Promise<(Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }) | null>;
    /**
     * Take a limited number of results.
     */
    take(n: number): Promise<Array<Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }>>;
    /**
     * Paginate results.
     */
    paginate(paginationOpts: PaginationOptions): Promise<PaginationResult<Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }>>;
}
/**
 * Query builder with all operations available.
 */
interface QueryBuilder$1<TableName extends string> extends QueryInitializer$1<TableName> {
}
/**
 * Search filter builder for full-text search.
 */
interface SearchFilterBuilder$1 {
    /**
     * Search for text in the search field.
     */
    search(field: string, query: string): SearchFilterBuilder$1;
    /**
     * Filter by equality on a filter field.
     */
    eq(field: string, value: unknown): SearchFilterBuilder$1;
}
/**
 * Internal implementation of the query builder.
 */
declare class QueryBuilderImpl<TableName extends string> implements QueryBuilder$1<TableName> {
    private tableName;
    private indexName?;
    private indexFilters;
    private filterExpressions;
    private orderDirection;
    private limitCount?;
    private dbFetch;
    constructor(tableName: TableName, dbFetch: (query: QueryBuilderImpl<TableName>) => Promise<unknown[]>);
    withIndex<IndexName extends string>(indexName: IndexName, indexRange?: (q: IndexRangeBuilder$1<string[]>) => IndexRangeBuilder$1<string[]>): QueryBuilder$1<TableName>;
    withSearchIndex<IndexName extends string>(_indexName: IndexName, _searchFilter: (q: SearchFilterBuilder$1) => SearchFilterBuilder$1): QueryBuilder$1<TableName>;
    filter(predicate: (q: FilterBuilder$1<Record<string, unknown>>) => FilterExpression$1): QueryBuilder$1<TableName>;
    order(order: 'asc' | 'desc'): QueryBuilder$1<TableName>;
    collect(): Promise<Array<Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }>>;
    first(): Promise<(Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }) | null>;
    unique(): Promise<(Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }) | null>;
    take(n: number): Promise<Array<Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }>>;
    paginate(paginationOpts: PaginationOptions): Promise<PaginationResult<Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }>>;
    getTableName(): TableName;
    getIndexName(): string | undefined;
    getIndexFilters(): Array<{
        field: string;
        op: string;
        value: unknown;
    }>;
    getFilterExpressions(): FilterExpression$1[];
    getOrder(): 'asc' | 'desc';
    getLimit(): number | undefined;
}

/**
 * Query Builder for database queries
 *
 * Re-exports from database/QueryBuilder.ts for backward compatibility.
 * @deprecated Import from './database/QueryBuilder' instead
 */

/**
 * Builder for index range expressions.
 */
interface IndexRangeBuilder<IndexFields extends string[]> {
    /**
     * Filter for equality on the current index field.
     */
    eq<F extends IndexFields[number]>(field: F, value: unknown): IndexRangeBuilder<IndexFields>;
    /**
     * Filter for less than on the current index field.
     */
    lt<F extends IndexFields[number]>(field: F, value: unknown): IndexRangeBuilder<IndexFields>;
    /**
     * Filter for less than or equal on the current index field.
     */
    lte<F extends IndexFields[number]>(field: F, value: unknown): IndexRangeBuilder<IndexFields>;
    /**
     * Filter for greater than on the current index field.
     */
    gt<F extends IndexFields[number]>(field: F, value: unknown): IndexRangeBuilder<IndexFields>;
    /**
     * Filter for greater than or equal on the current index field.
     */
    gte<F extends IndexFields[number]>(field: F, value: unknown): IndexRangeBuilder<IndexFields>;
}
/**
 * Filter expression builder.
 */
interface FilterBuilder<Doc> {
    /**
     * Equality filter.
     */
    eq<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression;
    /**
     * Not equal filter.
     */
    neq<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression;
    /**
     * Less than filter.
     */
    lt<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression;
    /**
     * Less than or equal filter.
     */
    lte<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression;
    /**
     * Greater than filter.
     */
    gt<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression;
    /**
     * Greater than or equal filter.
     */
    gte<K extends keyof Doc>(field: K, value: Doc[K]): FilterExpression;
    /**
     * Logical AND of filters.
     */
    and(...filters: FilterExpression[]): FilterExpression;
    /**
     * Logical OR of filters.
     */
    or(...filters: FilterExpression[]): FilterExpression;
    /**
     * Logical NOT of a filter.
     */
    not(filter: FilterExpression): FilterExpression;
}
/**
 * A filter expression.
 */
interface FilterExpression {
    readonly _brand: 'FilterExpression';
}
/**
 * Initial query state - can use withIndex or proceed to filtering.
 */
interface QueryInitializer<TableName extends string> {
    /**
     * Use a specific index for the query.
     */
    withIndex<IndexName extends string>(indexName: IndexName, indexRange?: (q: IndexRangeBuilder<string[]>) => IndexRangeBuilder<string[]>): QueryBuilder<TableName>;
    /**
     * Use a search index for full-text search.
     */
    withSearchIndex<IndexName extends string>(indexName: IndexName, searchFilter: (q: SearchFilterBuilder) => SearchFilterBuilder): QueryBuilder<TableName>;
    /**
     * Filter the query results.
     */
    filter(predicate: (q: FilterBuilder<Record<string, unknown>>) => FilterExpression): QueryBuilder<TableName>;
    /**
     * Order results by _creationTime.
     */
    order(order: 'asc' | 'desc'): QueryBuilder<TableName>;
    /**
     * Collect all results.
     */
    collect(): Promise<Array<Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }>>;
    /**
     * Get the first result.
     */
    first(): Promise<(Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }) | null>;
    /**
     * Get exactly one result (throws if not exactly one).
     */
    unique(): Promise<(Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }) | null>;
    /**
     * Take a limited number of results.
     */
    take(n: number): Promise<Array<Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }>>;
    /**
     * Paginate results.
     */
    paginate(paginationOpts: PaginationOptions): Promise<PaginationResult<Record<string, unknown> & {
        _id: Id<TableName>;
        _creationTime: number;
    }>>;
}
/**
 * Query builder with all operations available.
 */
interface QueryBuilder<TableName extends string> extends QueryInitializer<TableName> {
}
/**
 * Search filter builder for full-text search.
 */
interface SearchFilterBuilder {
    /**
     * Search for text in the search field.
     */
    search(field: string, query: string): SearchFilterBuilder;
    /**
     * Filter by equality on a filter field.
     */
    eq(field: string, value: unknown): SearchFilterBuilder;
}

/**
 * QueryCtx Implementation
 *
 * Provides the context object for Convex query functions with read-only access
 * to database, authentication, and storage.
 *
 * Layer 4: Server Context Objects
 */

/**
 * Implementation of read-only database operations.
 */
declare class DatabaseReaderImpl implements DatabaseReader$1 {
    /**
     * Get a document by ID.
     */
    get<TableName extends string>(id: Id<TableName>): Promise<Record<string, unknown> | null>;
    /**
     * Start building a query for a table.
     */
    query<TableName extends string>(tableName: TableName): QueryBuilder<TableName>;
    /**
     * Normalize a string to a valid ID for a table.
     * Returns null if the string is not a valid ID.
     */
    normalizeId<TableName extends string>(tableName: TableName, id: string): Id<TableName> | null;
    /**
     * System table access for scheduled functions.
     */
    system: {
        get: (id: ScheduledFunctionId) => Promise<{
            _id: ScheduledFunctionId;
            _creationTime: number;
            name: string;
            args: unknown[];
            scheduledTime: number;
            state: {
                kind: "pending";
            } | {
                kind: "inProgress";
            } | {
                kind: "success";
            } | {
                kind: "failed";
                error: string;
            } | {
                kind: "canceled";
            };
        } | null>;
        query: (tableName: "_scheduled_functions") => QueryBuilder<"_scheduled_functions">;
    };
}
/**
 * Implementation of authentication context.
 */
declare class AuthImpl implements Auth {
    /**
     * Get the identity of the authenticated user.
     * Returns null if not authenticated.
     */
    getUserIdentity(): Promise<UserIdentity | null>;
}
/**
 * Implementation of read-only storage operations.
 */
declare class StorageReaderImpl implements StorageReader {
    /**
     * Get a URL for downloading a file.
     */
    getUrl(storageId: StorageId): Promise<string | null>;
    /**
     * Get metadata for a stored file.
     */
    getMetadata(storageId: StorageId): Promise<{
        storageId: StorageId;
        sha256: string;
        size: number;
        contentType?: string;
    } | null>;
}
/**
 * Implementation of the QueryCtx context object.
 */
declare class QueryCtxImpl implements QueryCtx {
    /** Read-only database access */
    db: DatabaseReader$1;
    /** Authentication context */
    auth: Auth;
    /** Read-only storage access */
    storage: StorageReader;
    constructor(db?: DatabaseReader$1, auth?: Auth, storage?: StorageReader);
}
/**
 * Create a new QueryCtx with the provided implementations.
 * This is typically called by the Convex runtime.
 */
declare function createQueryCtx(db: DatabaseReader$1, auth: Auth, storage: StorageReader): QueryCtx;
/**
 * Create a default QueryCtx (for testing or development).
 * The runtime should override the methods before use.
 */
declare function createDefaultQueryCtx(): QueryCtx;

/**
 * Context types for Convex functions
 *
 * These define the ctx object passed to query, mutation, and action handlers.
 */

/**
 * Authentication context available to all function types.
 */
interface Auth {
    /**
     * Get the identity of the authenticated user.
     * Returns null if not authenticated.
     */
    getUserIdentity(): Promise<UserIdentity | null>;
}
/**
 * Read-only storage operations.
 */
interface StorageReader {
    /**
     * Get a URL for downloading a file.
     */
    getUrl(storageId: StorageId): Promise<string | null>;
    /**
     * Get metadata for a stored file.
     */
    getMetadata(storageId: StorageId): Promise<{
        storageId: StorageId;
        sha256: string;
        size: number;
        contentType?: string;
    } | null>;
}
/**
 * Read/write storage operations.
 */
interface StorageWriter extends StorageReader {
    /**
     * Generate an upload URL for client-side uploads.
     */
    generateUploadUrl(): Promise<string>;
    /**
     * Store a blob directly.
     */
    store(blob: Blob): Promise<StorageId>;
    /**
     * Delete a stored file.
     */
    delete(storageId: StorageId): Promise<void>;
}
/**
 * Scheduler for delayed function execution.
 */
interface Scheduler {
    /**
     * Schedule a function to run after a delay.
     */
    runAfter<F extends FunctionReference$1<'mutation' | 'action'>>(delayMs: number, functionReference: F, args: F['_args']): Promise<ScheduledFunctionId>;
    /**
     * Schedule a function to run at a specific time.
     */
    runAt<F extends FunctionReference$1<'mutation' | 'action'>>(timestamp: number | Date, functionReference: F, args: F['_args']): Promise<ScheduledFunctionId>;
    /**
     * Cancel a scheduled function.
     */
    cancel(scheduledFunctionId: ScheduledFunctionId): Promise<void>;
}
/**
 * Read-only database operations.
 */
interface DatabaseReader$1 {
    /**
     * Get a document by ID.
     */
    get<TableName extends string>(id: Id<TableName>): Promise<Record<string, unknown> | null>;
    /**
     * Start building a query for a table.
     */
    query<TableName extends string>(tableName: TableName): QueryBuilder<TableName>;
    /**
     * Normalize a string to a valid ID for a table.
     * Returns null if the string is not a valid ID.
     */
    normalizeId<TableName extends string>(tableName: TableName, id: string): Id<TableName> | null;
    /**
     * Get the system table for querying scheduled functions.
     */
    system: {
        get(id: ScheduledFunctionId): Promise<{
            _id: ScheduledFunctionId;
            _creationTime: number;
            name: string;
            args: unknown[];
            scheduledTime: number;
            state: {
                kind: 'pending';
            } | {
                kind: 'inProgress';
            } | {
                kind: 'success';
            } | {
                kind: 'failed';
                error: string;
            } | {
                kind: 'canceled';
            };
        } | null>;
        query(tableName: '_scheduled_functions'): QueryBuilder<'_scheduled_functions'>;
    };
}
/**
 * Read/write database operations.
 */
interface DatabaseWriter$1 extends DatabaseReader$1 {
    /**
     * Insert a new document.
     */
    insert<TableName extends string>(tableName: TableName, document: Record<string, unknown>): Promise<Id<TableName>>;
    /**
     * Update specific fields of a document.
     */
    patch<TableName extends string>(id: Id<TableName>, fields: Partial<Record<string, unknown>>): Promise<void>;
    /**
     * Replace a document entirely.
     */
    replace<TableName extends string>(id: Id<TableName>, document: Record<string, unknown>): Promise<void>;
    /**
     * Delete a document.
     */
    delete(id: Id<string>): Promise<void>;
}
/**
 * Context for query functions.
 * Queries are read-only and must be deterministic.
 */
interface QueryCtx {
    /** Read-only database access */
    db: DatabaseReader$1;
    /** Authentication context */
    auth: Auth;
    /** Read-only storage access */
    storage: StorageReader;
}
/**
 * Context for mutation functions.
 * Mutations can read and write data.
 */
interface MutationCtx {
    /** Read/write database access */
    db: DatabaseWriter$1;
    /** Authentication context */
    auth: Auth;
    /** Read/write storage access */
    storage: StorageWriter;
    /** Scheduler for delayed execution */
    scheduler: Scheduler;
}
/**
 * Context for action functions.
 * Actions can perform arbitrary operations including external API calls.
 */
interface ActionCtx {
    /** Authentication context */
    auth: Auth;
    /** Read-only storage access */
    storage: StorageReader;
    /** Scheduler for delayed execution */
    scheduler: Scheduler;
    /**
     * Run a query from within an action.
     */
    runQuery<F extends FunctionReference$1<'query'>>(query: F, args: F['_args']): Promise<F['_returns']>;
    /**
     * Run a mutation from within an action.
     */
    runMutation<F extends FunctionReference$1<'mutation'>>(mutation: F, args: F['_args']): Promise<F['_returns']>;
    /**
     * Run another action from within an action.
     */
    runAction<F extends FunctionReference$1<'action'>>(action: F, args: F['_args']): Promise<F['_returns']>;
    /**
     * Perform a vector search.
     */
    vectorSearch<TableName extends string>(tableName: TableName, indexName: string, query: {
        vector: number[];
        limit?: number;
        filter?: (q: unknown) => unknown;
    }): Promise<Array<{
        _id: Id<TableName>;
        _score: number;
    }>>;
}

/**
 * Query function builder
 *
 * Creates read-only, deterministic query functions.
 */

/**
 * Configuration for a query function.
 */
interface QueryConfig<Args extends ArgsValidator | undefined, Returns> {
    /** Argument validators (optional) */
    args?: Args;
    /** Return type validator (optional) */
    returns?: Validator<Returns>;
    /** The query handler function */
    handler: (ctx: QueryCtx, args: Args extends ArgsValidator ? InferArgs$2<Args> : Record<string, never>) => Returns | Promise<Returns>;
}
/**
 * A registered query function.
 */
interface RegisteredQuery<Args extends ArgsValidator | undefined, Returns> {
    /** Internal marker for query type */
    readonly _type: 'query';
    /** Internal marker for args type */
    readonly _args: Args extends ArgsValidator ? InferArgs$2<Args> : Record<string, never>;
    /** Internal marker for return type */
    readonly _returns: Returns;
    /** Visibility: public or internal */
    readonly _visibility: 'public' | 'internal';
    /** The configuration */
    readonly _config: QueryConfig<Args, Returns>;
}
type InferArgs$2<T extends ArgsValidator> = T extends Validator<infer U> ? U : T extends Record<string, Validator> ? {
    [K in keyof T]: Infer<T[K]>;
} : never;
/**
 * Create a public query function.
 *
 * Queries are read-only, deterministic functions that can read from the database.
 * They automatically participate in real-time subscriptions.
 *
 * @example
 * ```typescript
 * import { query } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * export const listMessages = query({
 *   args: { channel: v.id("channels") },
 *   handler: async (ctx, args) => {
 *     return await ctx.db
 *       .query("messages")
 *       .withIndex("by_channel", (q) => q.eq("channel", args.channel))
 *       .collect();
 *   },
 * });
 * ```
 */
declare function query<Args extends ArgsValidator | undefined = undefined, Returns = unknown>(config: QueryConfig<Args, Returns>): RegisteredQuery<Args, Returns>;
/**
 * Create an internal query function.
 *
 * Internal queries can only be called from other functions, not from clients.
 *
 * @example
 * ```typescript
 * import { internalQuery } from "convex.do/server";
 *
 * export const getUser = internalQuery({
 *   args: { userId: v.id("users") },
 *   handler: async (ctx, args) => {
 *     return await ctx.db.get(args.userId);
 *   },
 * });
 * ```
 */
declare function internalQuery<Args extends ArgsValidator | undefined = undefined, Returns = unknown>(config: QueryConfig<Args, Returns>): RegisteredQuery<Args, Returns>;

/**
 * Mutation function builder
 *
 * Creates functions that can read and write to the database.
 */

/**
 * Configuration for a mutation function.
 */
interface MutationConfig<Args extends ArgsValidator | undefined, Returns> {
    /** Argument validators (optional) */
    args?: Args;
    /** Return type validator (optional) */
    returns?: Validator<Returns>;
    /** The mutation handler function */
    handler: (ctx: MutationCtx, args: Args extends ArgsValidator ? InferArgs$1<Args> : Record<string, never>) => Returns | Promise<Returns>;
}
/**
 * A registered mutation function.
 */
interface RegisteredMutation<Args extends ArgsValidator | undefined, Returns> {
    /** Internal marker for mutation type */
    readonly _type: 'mutation';
    /** Internal marker for args type */
    readonly _args: Args extends ArgsValidator ? InferArgs$1<Args> : Record<string, never>;
    /** Internal marker for return type */
    readonly _returns: Returns;
    /** Visibility: public or internal */
    readonly _visibility: 'public' | 'internal';
    /** The configuration */
    readonly _config: MutationConfig<Args, Returns>;
}
type InferArgs$1<T extends ArgsValidator> = T extends Validator<infer U> ? U : T extends Record<string, Validator> ? {
    [K in keyof T]: Infer<T[K]>;
} : never;
/**
 * Create a public mutation function.
 *
 * Mutations can read and write to the database. They run in a transaction
 * and are automatically retried on conflicts.
 *
 * @example
 * ```typescript
 * import { mutation } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * export const sendMessage = mutation({
 *   args: {
 *     channel: v.id("channels"),
 *     body: v.string(),
 *   },
 *   handler: async (ctx, args) => {
 *     const identity = await ctx.auth.getUserIdentity();
 *     if (!identity) throw new Error("Not authenticated");
 *
 *     return await ctx.db.insert("messages", {
 *       channel: args.channel,
 *       body: args.body,
 *       author: identity.tokenIdentifier,
 *     });
 *   },
 * });
 * ```
 */
declare function mutation<Args extends ArgsValidator | undefined = undefined, Returns = unknown>(config: MutationConfig<Args, Returns>): RegisteredMutation<Args, Returns>;
/**
 * Create an internal mutation function.
 *
 * Internal mutations can only be called from other functions, not from clients.
 *
 * @example
 * ```typescript
 * import { internalMutation } from "convex.do/server";
 *
 * export const updateUserStats = internalMutation({
 *   args: { userId: v.id("users"), increment: v.number() },
 *   handler: async (ctx, args) => {
 *     const user = await ctx.db.get(args.userId);
 *     if (!user) throw new Error("User not found");
 *
 *     await ctx.db.patch(args.userId, {
 *       messageCount: (user.messageCount ?? 0) + args.increment,
 *     });
 *   },
 * });
 * ```
 */
declare function internalMutation<Args extends ArgsValidator | undefined = undefined, Returns = unknown>(config: MutationConfig<Args, Returns>): RegisteredMutation<Args, Returns>;

/**
 * Action function builder
 *
 * Creates functions that can perform arbitrary operations including external API calls.
 */

/**
 * Configuration for an action function.
 */
interface ActionConfig<Args extends ArgsValidator | undefined, Returns> {
    /** Argument validators (optional) */
    args?: Args;
    /** Return type validator (optional) */
    returns?: Validator<Returns>;
    /** The action handler function */
    handler: (ctx: ActionCtx, args: Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>) => Returns | Promise<Returns>;
}
/**
 * A registered action function.
 */
interface RegisteredAction<Args extends ArgsValidator | undefined, Returns> {
    /** Internal marker for action type */
    readonly _type: 'action';
    /** Internal marker for args type */
    readonly _args: Args extends ArgsValidator ? InferArgs<Args> : Record<string, never>;
    /** Internal marker for return type */
    readonly _returns: Returns;
    /** Visibility: public or internal */
    readonly _visibility: 'public' | 'internal';
    /** The configuration */
    readonly _config: ActionConfig<Args, Returns>;
}
type InferArgs<T extends ArgsValidator> = T extends Validator<infer U> ? U : T extends Record<string, Validator> ? {
    [K in keyof T]: Infer<T[K]>;
} : never;
/**
 * Create a public action function.
 *
 * Actions can perform arbitrary operations including:
 * - External API calls (fetch)
 * - Non-deterministic operations
 * - Long-running computations
 *
 * Actions cannot directly access the database but can call queries and mutations.
 *
 * @example
 * ```typescript
 * import { action } from "convex.do/server";
 * import { v } from "convex.do/values";
 * import { api } from "./_generated/api";
 *
 * export const sendEmail = action({
 *   args: {
 *     to: v.string(),
 *     subject: v.string(),
 *     body: v.string(),
 *   },
 *   handler: async (ctx, args) => {
 *     // Call external API
 *     const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
 *       method: "POST",
 *       headers: {
 *         "Content-Type": "application/json",
 *         "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
 *       },
 *       body: JSON.stringify({
 *         personalizations: [{ to: [{ email: args.to }] }],
 *         from: { email: "noreply@example.com" },
 *         subject: args.subject,
 *         content: [{ type: "text/plain", value: args.body }],
 *       }),
 *     });
 *
 *     if (!response.ok) {
 *       throw new Error(`Failed to send email: ${response.statusText}`);
 *     }
 *
 *     // Record the email in the database
 *     await ctx.runMutation(api.emails.record, {
 *       to: args.to,
 *       subject: args.subject,
 *       sentAt: Date.now(),
 *     });
 *
 *     return { success: true };
 *   },
 * });
 * ```
 */
declare function action<Args extends ArgsValidator | undefined = undefined, Returns = unknown>(config: ActionConfig<Args, Returns>): RegisteredAction<Args, Returns>;
/**
 * Create an internal action function.
 *
 * Internal actions can only be called from other functions, not from clients.
 *
 * @example
 * ```typescript
 * import { internalAction } from "convex.do/server";
 *
 * export const processWebhook = internalAction({
 *   args: { payload: v.any() },
 *   handler: async (ctx, args) => {
 *     // Process webhook payload
 *     const result = await processPayload(args.payload);
 *
 *     // Update database
 *     await ctx.runMutation(api.webhooks.record, {
 *       payload: args.payload,
 *       result,
 *     });
 *
 *     return result;
 *   },
 * });
 * ```
 */
declare function internalAction<Args extends ArgsValidator | undefined = undefined, Returns = unknown>(config: ActionConfig<Args, Returns>): RegisteredAction<Args, Returns>;

/**
 * HTTP Router for custom HTTP endpoints
 *
 * Allows defining custom HTTP routes that can handle webhooks, APIs, etc.
 */
/**
 * HTTP methods supported by the router.
 */
type HttpMethod$1 = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';
/**
 * Context for HTTP action handlers.
 */
interface HttpActionCtx {
    /** Run a query */
    runQuery<T>(query: unknown, args: unknown): Promise<T>;
    /** Run a mutation */
    runMutation<T>(mutation: unknown, args: unknown): Promise<T>;
    /** Run an action */
    runAction<T>(action: unknown, args: unknown): Promise<T>;
    /** Storage operations */
    storage: {
        getUrl(storageId: string): Promise<string | null>;
        generateUploadUrl(): Promise<string>;
    };
}
/**
 * HTTP action handler function.
 */
type HttpActionHandler = (ctx: HttpActionCtx, request: Request & {
    params?: Record<string, string>;
}) => Promise<Response>;
/**
 * HTTP action configuration.
 */
interface HttpActionConfig {
    /** Path pattern (e.g., "/webhooks/stripe") */
    path: string;
    /** HTTP method */
    method: HttpMethod$1;
    /** Handler function */
    handler: HttpActionHandler;
}
/**
 * A registered HTTP action.
 */
interface RegisteredHttpAction {
    readonly _type: 'httpAction';
    readonly _config: HttpActionConfig;
}
/**
 * Route definition in the router.
 */
interface RouteDefinition {
    path: string;
    method: HttpMethod$1;
    handler: HttpActionHandler;
}
/**
 * HTTP Router class for managing routes.
 */
declare class HttpRouter {
    private routes;
    /**
     * Add a route for any HTTP method.
     */
    route(config: {
        path: string;
        method: HttpMethod$1;
        handler: RegisteredHttpAction;
    }): this;
    /**
     * Add a GET route.
     */
    get(path: string, handler: RegisteredHttpAction): this;
    /**
     * Add a POST route.
     */
    post(path: string, handler: RegisteredHttpAction): this;
    /**
     * Add a PUT route.
     */
    put(path: string, handler: RegisteredHttpAction): this;
    /**
     * Add a PATCH route.
     */
    patch(path: string, handler: RegisteredHttpAction): this;
    /**
     * Add a DELETE route.
     */
    delete(path: string, handler: RegisteredHttpAction): this;
    /**
     * Add an OPTIONS route.
     */
    options(path: string, handler: RegisteredHttpAction): this;
    /**
     * Add a HEAD route.
     */
    head(path: string, handler: RegisteredHttpAction): this;
    /**
     * Get all registered routes.
     */
    getRoutes(): readonly RouteDefinition[];
    /**
     * Match a request to a route.
     */
    match(request: Request): RouteDefinition | null;
    /**
     * Handle an incoming HTTP request.
     * Matches the request to a route and executes the handler.
     *
     * @param ctx - The HTTP action context
     * @param request - The incoming request
     * @returns The response from the handler, or null if no route matches
     */
    handle(ctx: HttpActionCtx, request: Request): Promise<Response | null>;
    /**
     * Create an enhanced request with path parameters extracted.
     *
     * @param request - The original request
     * @param pattern - The route pattern to extract params from
     * @returns An enhanced request with params property
     */
    createRequest(request: Request, pattern: string): Request & {
        params: Record<string, string>;
    };
    /**
     * Check if a path matches a route pattern.
     * Supports simple patterns like "/api/users/:id" and wildcards like "/api/*"
     */
    private pathMatches;
    /**
     * Extract path parameters from a request.
     * Supports named parameters (e.g., ":id") and wildcards (e.g., "*path").
     */
    extractParams(pattern: string, path: string): Record<string, string>;
}
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
declare function httpRouter(): HttpRouter;
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
declare function httpAction(handler: HttpActionHandler): RegisteredHttpAction;

/**
 * Schema definition system
 *
 * Provides defineSchema and defineTable for defining the database schema.
 */

/**
 * Validation error with path information.
 */
interface ValidationError {
    path: string;
    message: string;
}
/**
 * Validation result for document validation.
 */
interface ValidationResult {
    valid: boolean;
    errors: Array<string | ValidationError>;
}
/**
 * Document shape definition using validators.
 */
type DocumentDefinition = Record<string, Validator>;
/**
 * Index configuration.
 */
interface IndexConfig {
    /** Fields to index, in order */
    fields: Array<string | {
        field: string;
        order: 'asc' | 'desc';
    }>;
    /** Whether this index enforces uniqueness */
    unique?: boolean;
    /** Whether this is a sparse index (only indexes documents where field exists) */
    sparse?: boolean;
}
/**
 * Index options for advanced configuration.
 */
interface IndexOptions {
    /** Whether this index enforces uniqueness */
    unique?: boolean;
    /** Whether this is a sparse index */
    sparse?: boolean;
}
/**
 * Search index configuration for full-text search.
 */
interface SearchIndexConfig {
    /** The field to search */
    searchField: string;
    /** Additional fields to filter by */
    filterFields?: string[];
}
/**
 * Vector index configuration for similarity search.
 */
interface VectorIndexConfig {
    /** The field containing the vector */
    vectorField: string;
    /** Number of dimensions in the vector */
    dimensions: number;
    /** Additional fields to filter by */
    filterFields?: string[];
}
/**
 * A table definition with document schema and indexes.
 */
interface TableDefinition<Doc extends DocumentDefinition = DocumentDefinition> {
    /** Document field validators */
    readonly document: Doc;
    /** Indexes defined on this table */
    readonly indexes: Record<string, IndexConfig>;
    /** Search indexes defined on this table */
    readonly searchIndexes: Record<string, SearchIndexConfig>;
    /** Vector indexes defined on this table */
    readonly vectorIndexes: Record<string, VectorIndexConfig>;
}
/**
 * Builder for table definitions with fluent index API.
 */
declare class TableBuilder<Doc extends DocumentDefinition> implements TableDefinition<Doc> {
    readonly document: Doc;
    readonly indexes: Record<string, IndexConfig>;
    readonly searchIndexes: Record<string, SearchIndexConfig>;
    readonly vectorIndexes: Record<string, VectorIndexConfig>;
    constructor(document: Doc);
    /**
     * Define an index on the table.
     *
     * @example
     * ```typescript
     * defineTable({
     *   channel: v.id("channels"),
     *   body: v.string(),
     *   author: v.id("users"),
     * })
     *   .index("by_channel", ["channel"])
     *   .index("by_author", ["author", "channel"])
     * ```
     */
    index(name: string, fields: Array<string | {
        field: string;
        order: 'asc' | 'desc';
    }>, options?: IndexOptions): this;
    /**
     * Define a search index for full-text search.
     *
     * @example
     * ```typescript
     * defineTable({
     *   title: v.string(),
     *   body: v.string(),
     *   category: v.string(),
     * })
     *   .searchIndex("search_body", {
     *     searchField: "body",
     *     filterFields: ["category"],
     *   })
     * ```
     */
    searchIndex(name: string, config: SearchIndexConfig): this;
    /**
     * Resolve a field path (including dot notation for nested fields) to a validator.
     * @throws Error if the path doesn't exist or goes through non-object types
     */
    private resolveFieldPathForSearch;
    /**
     * Check if a validator represents a string type (including optional<string>).
     */
    private isStringType;
    /**
     * Check if a validator represents an array type (including optional<array>).
     */
    private isArrayType;
    /**
     * Define a vector index for similarity search.
     *
     * @example
     * ```typescript
     * defineTable({
     *   text: v.string(),
     *   embedding: v.array(v.float64()),
     *   category: v.string(),
     * })
     *   .vectorIndex("by_embedding", {
     *     vectorField: "embedding",
     *     dimensions: 1536,
     *     filterFields: ["category"],
     *   })
     * ```
     */
    vectorIndex(name: string, config: VectorIndexConfig): this;
    /**
     * Validate a document against the table schema.
     */
    validate(doc: unknown): ValidationResult;
    /**
     * Return table definition with system fields included.
     */
    withSystemFields(): TableBuilder<Doc & {
        _id: Validator;
        _creationTime: Validator;
    }>;
    /**
     * Convert table definition to JSON representation.
     */
    toJSON(): {
        document: Record<string, {
            type: string;
        }>;
        indexes: Record<string, IndexConfig>;
        searchIndexes: Record<string, SearchIndexConfig>;
        vectorIndexes: Record<string, VectorIndexConfig>;
    };
    /**
     * Export schema definition compatible with Convex.
     */
    export(): {
        document: Doc;
        indexes: Record<string, IndexConfig>;
        searchIndexes: Record<string, SearchIndexConfig>;
        vectorIndexes: Record<string, VectorIndexConfig>;
    };
    /**
     * Generate code string representation.
     */
    toCode(): string;
    /**
     * Clone this table definition.
     */
    clone(): TableBuilder<Doc>;
    metadata?: {
        description?: string;
    };
    private _tableConfig?;
    config: ((cfg: Record<string, unknown>) => this) & Record<string, unknown>;
    /**
     * Set table description.
     */
    description(desc: string): this;
    /**
     * Initialize config on construction.
     */
    private initConfig;
}
/**
 * Create a table definition.
 *
 * @example
 * ```typescript
 * const messages = defineTable({
 *   channel: v.id("channels"),
 *   body: v.string(),
 *   author: v.id("users"),
 * })
 *   .index("by_channel", ["channel"])
 *   .index("by_author", ["author"])
 * ```
 */
declare function defineTable<Doc extends DocumentDefinition>(document: Doc): TableBuilder<Doc>;
/**
 * Schema definition mapping table names to table definitions.
 */
type SchemaDefinition = Record<string, TableDefinition>;
/**
 * Schema options for defineSchema.
 */
interface SchemaOptions {
    /** Whether to enable schema validation (default: true) */
    schemaValidation?: boolean;
    /** Whether to enforce strict table name types (default: true) */
    strictTableNameTypes?: boolean;
    /** Legacy option for backward compatibility */
    strict?: boolean;
}
/**
 * A compiled schema.
 */
interface Schema<T extends SchemaDefinition = SchemaDefinition> {
    /** Table definitions */
    readonly tables: T;
    /** Whether to enforce strict mode (reject unknown tables) */
    readonly strictMode: boolean;
    /** Whether schema validation is enabled */
    readonly schemaValidation: boolean;
    /** Whether strict table name types are enabled */
    readonly strictTableNameTypes: boolean;
    /** Convert schema to JSON representation */
    toJSON?(): unknown;
}
/**
 * Schema builder with configuration options.
 */
declare class SchemaBuilder<T extends SchemaDefinition> implements Schema<T> {
    readonly tables: T;
    readonly strictMode: boolean;
    readonly schemaValidation: boolean;
    readonly strictTableNameTypes: boolean;
    constructor(tables: T, options?: SchemaOptions);
    /**
     * Allow documents in tables not defined in the schema.
     * By default, strict mode is enabled and unknown tables are rejected.
     */
    strict(enabled: boolean): this;
    /**
     * Convert schema to JSON representation.
     */
    toJSON(): unknown;
}
/**
 * Define the database schema.
 *
 * @example
 * ```typescript
 * // convex/schema.ts
 * import { defineSchema, defineTable } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * export default defineSchema({
 *   messages: defineTable({
 *     channel: v.id("channels"),
 *     body: v.string(),
 *     author: v.id("users"),
 *   })
 *     .index("by_channel", ["channel"])
 *     .index("by_author", ["author"]),
 *
 *   channels: defineTable({
 *     name: v.string(),
 *     description: v.optional(v.string()),
 *   }),
 *
 *   users: defineTable({
 *     name: v.string(),
 *     email: v.string(),
 *     tokenIdentifier: v.string(),
 *   })
 *     .index("by_token", ["tokenIdentifier"]),
 * });
 * ```
 */
declare function defineSchema<T extends SchemaDefinition>(tables: T, options?: SchemaOptions): SchemaBuilder<T>;

/**
 * DatabaseReader Implementation - Layer 4
 *
 * Provides read-only database access for Convex queries.
 * Implements the DatabaseReader interface defined in context.ts
 *
 * Features:
 * - get(id): Get a document by ID
 * - query(table): Start a query builder for a table
 * - normalizeId(table, id): Normalize an ID to canonical form
 */

/**
 * Storage backend interface for DatabaseReader
 * This abstracts the actual storage implementation (could be Durable Object, etc.)
 */
interface StorageBackend {
    /**
     * Get a single document by ID
     */
    getDocument(id: string): Promise<Record<string, unknown> | null>;
    /**
     * Query documents from a table with optional filters
     */
    queryDocuments(tableName: string, options?: QueryOptions): Promise<Array<Record<string, unknown> & {
        _id: string;
        _creationTime: number;
    }>>;
}
/**
 * Query options for storage backend
 */
interface QueryOptions {
    indexName?: string;
    indexFilters?: Array<{
        field: string;
        op: string;
        value: unknown;
    }>;
    filters?: FilterExpression[];
    order?: 'asc' | 'desc';
    limit?: number;
}
/**
 * DatabaseReader provides read-only access to the database
 */
declare class DatabaseReader {
    private storage;
    constructor(storage: StorageBackend);
    /**
     * Get a document by ID
     */
    get<TableName extends string>(id: Id<TableName>): Promise<Record<string, unknown> | null>;
    /**
     * Start building a query for a table
     */
    query<TableName extends string>(tableName: TableName): QueryBuilder<TableName>;
    /**
     * Normalize a string to a valid ID for a table
     * Returns null if the string is not a valid ID format
     */
    normalizeId<TableName extends string>(_tableName: TableName, id: string): Id<TableName> | null;
}
/**
 * In-memory storage backend for testing and development
 */
declare class InMemoryStorage implements StorageBackend {
    private documents;
    getDocument(id: string): Promise<Record<string, unknown> | null>;
    queryDocuments(tableName: string, options?: QueryOptions): Promise<Array<Record<string, unknown> & {
        _id: string;
        _creationTime: number;
    }>>;
    /**
     * Evaluate a filter operation
     */
    private evaluateFilter;
    /**
     * Evaluate a filter expression
     */
    private evaluateFilterExpression;
    /**
     * Add a document to storage (for testing)
     */
    addDocument(id: string, doc: Record<string, unknown> & {
        _id: string;
        _creationTime: number;
    }): void;
    /**
     * Clear all documents (for testing)
     */
    clear(): void;
}

/**
 * DatabaseWriter implementation for Layer 4
 *
 * Extends DatabaseReader and provides write operations:
 * - insert(): Insert a new document
 * - patch(): Partially update a document
 * - replace(): Replace a document entirely
 * - delete(): Delete a document
 *
 * All operations validate input and protect system fields (_id, _creationTime)
 */

/**
 * Extended storage interface with write operations
 * Uses table+id pattern for direct document access
 */
interface WritableStorageBackend extends StorageBackend {
    getDocumentByTableAndId(table: string, id: string): Record<string, unknown> | null;
    saveDocument(table: string, id: string, doc: Record<string, unknown>): void;
    deleteDocument(table: string, id: string): void;
}
/**
 * DatabaseWriter extends DatabaseReader with write operations
 */
declare class DatabaseWriter extends DatabaseReader {
    protected writableStorage: WritableStorageBackend;
    constructor(storage: WritableStorageBackend);
    /**
     * Override get() to work with our storage implementation
     */
    get<TableName extends string>(id: Id<TableName>): Promise<Record<string, unknown> | null>;
    /**
     * Insert a new document into a table.
     * Returns the generated document ID.
     *
     * @throws {Error} If document contains system fields or invalid values
     */
    insert<TableName extends string>(tableName: TableName, document: Record<string, unknown>): Promise<Id<TableName>>;
    /**
     * Update specific fields of a document.
     * Merges the provided fields with the existing document.
     *
     * @throws {Error} If document not found, no fields provided, or attempting to modify system fields
     */
    patch<TableName extends string>(id: Id<TableName>, fields: Partial<Record<string, unknown>>): Promise<void>;
    /**
     * Replace a document entirely.
     * All old fields except system fields are removed.
     *
     * @throws {Error} If document not found or attempting to modify system fields
     */
    replace<TableName extends string>(id: Id<TableName>, document: Record<string, unknown>): Promise<void>;
    /**
     * Delete a document.
     * This operation is idempotent - deleting a non-existent document does not throw.
     */
    delete(id: Id<string>): Promise<void>;
    /**
     * Validate that document doesn't contain system fields
     */
    private validateNoSystemFields;
    /**
     * Validate document values according to Convex value system
     */
    private validateDocumentValues;
    /**
     * Recursively validate a value
     */
    private validateValue;
    /**
     * Generate a unique ID for a document
     */
    private generateId;
    /**
     * Convert ArrayBuffer to base64url string
     */
    private arrayBufferToBase64Url;
    /**
     * Extract table name from document ID
     */
    private extractTableFromId;
}

/**
 * MutationCtx Implementation
 *
 * Concrete implementation of the MutationCtx context object.
 * This provides the context passed to mutation function handlers.
 *
 * MutationCtx provides:
 * - db: DatabaseWriter (extends DatabaseReader with write operations)
 * - auth: Auth for checking authentication
 * - storage: StorageWriter for file access
 * - scheduler: Scheduler for scheduling functions
 */

/**
 * Create a MutationCtx instance.
 *
 * This factory function creates a context object with all the required
 * properties for mutation functions.
 *
 * @param db - DatabaseWriter instance for database operations
 * @param auth - Auth instance for authentication
 * @param storage - StorageWriter instance for file storage
 * @param scheduler - Scheduler instance for delayed execution
 * @returns MutationCtx instance
 *
 * @example
 * ```typescript
 * const ctx = createMutationCtx(db, auth, storage, scheduler);
 * // Use in mutation handler
 * const result = await mutationHandler(ctx, args);
 * ```
 */
declare function createMutationCtx(db: DatabaseWriter$1, auth: Auth, storage: StorageWriter, scheduler: Scheduler): MutationCtx;
/**
 * Validate that a context object implements the MutationCtx interface.
 *
 * @param ctx - The context object to validate
 * @returns True if valid, throws error otherwise
 */
declare function validateMutationCtx(ctx: unknown): ctx is MutationCtx;
/**
 * Ensure all required methods are present on DatabaseWriter.
 *
 * @param db - The database object to validate
 */
declare function validateDatabaseWriter(db: unknown): db is DatabaseWriter$1;
/**
 * Ensure all required methods are present on StorageWriter.
 *
 * @param storage - The storage object to validate
 */
declare function validateStorageWriter(storage: unknown): storage is StorageWriter;
/**
 * Ensure all required methods are present on Scheduler.
 *
 * @param scheduler - The scheduler object to validate
 */
declare function validateScheduler$1(scheduler: unknown): scheduler is Scheduler;
/**
 * Ensure all required methods are present on Auth.
 *
 * @param auth - The auth object to validate
 */
declare function validateAuth$1(auth: unknown): auth is Auth;
/**
 * Create a validated MutationCtx instance.
 *
 * This function creates a MutationCtx and validates all components
 * to ensure they implement the required interfaces.
 *
 * @param db - DatabaseWriter instance
 * @param auth - Auth instance
 * @param storage - StorageWriter instance
 * @param scheduler - Scheduler instance
 * @returns Validated MutationCtx instance
 * @throws Error if any component is invalid
 */
declare function createValidatedMutationCtx(db: DatabaseWriter$1, auth: Auth, storage: StorageWriter, scheduler: Scheduler): MutationCtx;

/**
 * ActionCtx Implementation for Layer 4
 *
 * Provides the context object for action functions in Convex.
 * Actions can perform arbitrary operations including external API calls.
 *
 * ActionCtx provides:
 * - auth: Auth for checking authentication
 * - storage: StorageReader for file access
 * - scheduler: Scheduler for scheduling functions
 * - runQuery: Execute query functions
 * - runMutation: Execute mutation functions
 * - runAction: Execute other actions
 * - vectorSearch: Perform vector similarity search
 */

/**
 * Create an ActionCtx instance.
 *
 * This factory function creates a context object with all the required
 * properties and methods for action functions.
 *
 * @param auth - Auth instance for authentication
 * @param storage - StorageReader instance for file storage
 * @param scheduler - Scheduler instance for delayed execution
 * @param runQuery - Function to execute query functions
 * @param runMutation - Function to execute mutation functions
 * @param runAction - Function to execute other action functions
 * @param vectorSearch - Function to perform vector search
 * @returns ActionCtx instance
 *
 * @example
 * ```typescript
 * const ctx = createActionCtx(
 *   auth,
 *   storage,
 *   scheduler,
 *   queryRunner,
 *   mutationRunner,
 *   actionRunner,
 *   vectorSearchRunner
 * );
 * // Use in action handler
 * const result = await actionHandler(ctx, args);
 * ```
 */
declare function createActionCtx(auth: Auth, storage: StorageReader, scheduler: Scheduler, runQuery: <F extends FunctionReference$1<'query'>>(query: F, args: F['_args']) => Promise<F['_returns']>, runMutation: <F extends FunctionReference$1<'mutation'>>(mutation: F, args: F['_args']) => Promise<F['_returns']>, runAction: <F extends FunctionReference$1<'action'>>(action: F, args: F['_args']) => Promise<F['_returns']>, vectorSearch: <TableName extends string>(tableName: TableName, indexName: string, query: {
    vector: number[];
    limit?: number;
    filter?: (q: unknown) => unknown;
}) => Promise<Array<{
    _id: Id<TableName>;
    _score: number;
}>>): ActionCtx;
/**
 * Validate that a context object implements the ActionCtx interface.
 *
 * @param ctx - The context object to validate
 * @returns True if valid, throws error otherwise
 */
declare function validateActionCtx(ctx: unknown): ctx is ActionCtx;
/**
 * Ensure all required methods are present on Auth.
 *
 * @param auth - The auth object to validate
 */
declare function validateAuth(auth: unknown): auth is Auth;
/**
 * Ensure all required methods are present on StorageReader.
 *
 * @param storage - The storage object to validate
 */
declare function validateStorageReader(storage: unknown): storage is StorageReader;
/**
 * Ensure all required methods are present on Scheduler.
 *
 * @param scheduler - The scheduler object to validate
 */
declare function validateScheduler(scheduler: unknown): scheduler is Scheduler;
/**
 * Create a validated ActionCtx instance.
 *
 * This function creates an ActionCtx and validates all components
 * to ensure they implement the required interfaces.
 *
 * @param auth - Auth instance
 * @param storage - StorageReader instance
 * @param scheduler - Scheduler instance
 * @param runQuery - Function to execute query functions
 * @param runMutation - Function to execute mutation functions
 * @param runAction - Function to execute other action functions
 * @param vectorSearch - Function to perform vector search
 * @returns Validated ActionCtx instance
 * @throws Error if any component is invalid
 */
declare function createValidatedActionCtx(auth: Auth, storage: StorageReader, scheduler: Scheduler, runQuery: <F extends FunctionReference$1<'query'>>(query: F, args: F['_args']) => Promise<F['_returns']>, runMutation: <F extends FunctionReference$1<'mutation'>>(mutation: F, args: F['_args']) => Promise<F['_returns']>, runAction: <F extends FunctionReference$1<'action'>>(action: F, args: F['_args']) => Promise<F['_returns']>, vectorSearch: <TableName extends string>(tableName: TableName, indexName: string, query: {
    vector: number[];
    limit?: number;
    filter?: (q: unknown) => unknown;
}) => Promise<Array<{
    _id: Id<TableName>;
    _score: number;
}>>): ActionCtx;

/**
 * Registered Function Types and Utilities
 *
 * This module provides types and utilities for working with registered
 * Convex functions (queries, mutations, and actions).
 *
 * @module
 */

/**
 * A union type representing any registered function (query, mutation, or action).
 */
type AnyRegisteredFunction = RegisteredQuery<ArgsValidator | undefined, unknown> | RegisteredMutation<ArgsValidator | undefined, unknown> | RegisteredAction<ArgsValidator | undefined, unknown>;
/**
 * Function type literals.
 */
type FunctionType$2 = 'query' | 'mutation' | 'action';
/**
 * Function visibility literals.
 */
type FunctionVisibility$2 = 'public' | 'internal';
/**
 * Generic registered function type parameterized by function type.
 */
type GenericRegisteredFunction<T extends FunctionType$2 = FunctionType$2> = T extends 'query' ? RegisteredQuery<ArgsValidator | undefined, unknown> : T extends 'mutation' ? RegisteredMutation<ArgsValidator | undefined, unknown> : T extends 'action' ? RegisteredAction<ArgsValidator | undefined, unknown> : never;
/**
 * Extract the args type from a registered function.
 */
type FunctionArgs$1<F extends AnyRegisteredFunction> = F['_args'];
/**
 * Extract the return type from a registered function.
 */
type FunctionReturns<F extends AnyRegisteredFunction> = F['_returns'];
/**
 * Check if a value is a RegisteredQuery.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredQuery
 *
 * @example
 * ```typescript
 * const fn = query({ handler: async (ctx) => 'hello' })
 * if (isQuery(fn)) {
 *   // fn is typed as RegisteredQuery
 * }
 * ```
 */
declare function isQuery(fn: unknown): fn is RegisteredQuery<ArgsValidator | undefined, unknown>;
/**
 * Check if a value is a RegisteredMutation.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredMutation
 *
 * @example
 * ```typescript
 * const fn = mutation({ handler: async (ctx) => 'created' })
 * if (isMutation(fn)) {
 *   // fn is typed as RegisteredMutation
 * }
 * ```
 */
declare function isMutation(fn: unknown): fn is RegisteredMutation<ArgsValidator | undefined, unknown>;
/**
 * Check if a value is a RegisteredAction.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredAction
 *
 * @example
 * ```typescript
 * const fn = action({ handler: async (ctx) => 'done' })
 * if (isAction(fn)) {
 *   // fn is typed as RegisteredAction
 * }
 * ```
 */
declare function isAction(fn: unknown): fn is RegisteredAction<ArgsValidator | undefined, unknown>;
/**
 * Check if a value is any type of registered function.
 *
 * @param fn - The value to check
 * @returns True if the value is a RegisteredQuery, RegisteredMutation, or RegisteredAction
 *
 * @example
 * ```typescript
 * if (isRegisteredFunction(fn)) {
 *   console.log(fn._type) // 'query' | 'mutation' | 'action'
 * }
 * ```
 */
declare function isRegisteredFunction(fn: unknown): fn is AnyRegisteredFunction;
/**
 * Check if a registered function is public (callable from clients).
 *
 * @param fn - The value to check
 * @returns True if the value is a public registered function
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' })
 * console.log(isPublicFunction(q)) // true
 *
 * const internal = internalQuery({ handler: async (ctx) => 'hello' })
 * console.log(isPublicFunction(internal)) // false
 * ```
 */
declare function isPublicFunction(fn: unknown): fn is AnyRegisteredFunction;
/**
 * Check if a registered function is internal (only callable from other functions).
 *
 * @param fn - The value to check
 * @returns True if the value is an internal registered function
 *
 * @example
 * ```typescript
 * const q = internalQuery({ handler: async (ctx) => 'hello' })
 * console.log(isInternalFunction(q)) // true
 * ```
 */
declare function isInternalFunction(fn: unknown): fn is AnyRegisteredFunction;
/**
 * Get the type of a registered function ('query', 'mutation', or 'action').
 *
 * @param fn - The registered function
 * @returns The function type
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' })
 * console.log(getFunctionType(q)) // 'query'
 * ```
 */
declare function getFunctionType(fn: AnyRegisteredFunction): FunctionType$2;
/**
 * Get the visibility of a registered function ('public' or 'internal').
 *
 * @param fn - The registered function
 * @returns The function visibility
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' })
 * console.log(getFunctionVisibility(q)) // 'public'
 *
 * const internal = internalQuery({ handler: async (ctx) => 'hello' })
 * console.log(getFunctionVisibility(internal)) // 'internal'
 * ```
 */
declare function getFunctionVisibility(fn: AnyRegisteredFunction): FunctionVisibility$2;
/**
 * Get the args validator from a registered function.
 *
 * @param fn - The registered function
 * @returns The args validator, or undefined if not defined
 *
 * @example
 * ```typescript
 * const q = query({
 *   args: { id: v.string() },
 *   handler: async (ctx, args) => args.id
 * })
 * const validator = getArgsValidator(q) // { id: v.string() }
 * ```
 */
declare function getArgsValidator(fn: AnyRegisteredFunction): ArgsValidator | undefined;
/**
 * Get the returns validator from a registered function.
 *
 * @param fn - The registered function
 * @returns The returns validator, or undefined if not defined
 *
 * @example
 * ```typescript
 * const q = query({
 *   returns: v.string(),
 *   handler: async (ctx) => 'hello'
 * })
 * const validator = getReturnsValidator(q) // v.string()
 * ```
 */
declare function getReturnsValidator(fn: AnyRegisteredFunction): Validator | undefined;
/**
 * Get the handler function from a registered function.
 *
 * @param fn - The registered function
 * @returns The handler function
 *
 * @example
 * ```typescript
 * const q = query({ handler: async (ctx) => 'hello' })
 * const handler = getFunctionHandler(q)
 * ```
 */
declare function getFunctionHandler<F extends AnyRegisteredFunction>(fn: F): F['_config']['handler'];

/**
 * Function Registry for convex.do
 *
 * Provides a singleton registry for storing and looking up registered Convex functions
 * (queries, mutations, actions) and HTTP endpoints.
 *
 * The registry supports:
 * - Registration of functions with path validation
 * - Lookup of functions by path
 * - Listing functions by type and visibility
 * - HTTP endpoint registration with path parameter matching
 * - Module-based bulk registration
 *
 * Bead: convex-2pb - Function Registration and Lookup System
 */
/**
 * Function types supported by the registry.
 */
type FunctionType$1 = 'query' | 'mutation' | 'action';
/**
 * Function visibility levels.
 */
type FunctionVisibility$1 = 'public' | 'internal';
/**
 * HTTP methods supported by the registry.
 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';
/**
 * A registered function (query, mutation, or action).
 */
interface RegisteredFunction$1 {
    readonly _type: FunctionType$1;
    readonly _visibility: FunctionVisibility$1;
    readonly _config: {
        handler: (...args: unknown[]) => unknown | Promise<unknown>;
        args?: unknown;
        returns?: unknown;
    };
}
/**
 * A registered HTTP endpoint.
 */
interface RegisteredHttpEndpoint {
    readonly _type: 'httpAction';
    readonly _config: {
        path: string;
        method: HttpMethod;
        handler: (ctx: unknown, request: Request) => Promise<Response>;
    };
}
/**
 * Entry for a registered function in the registry.
 */
interface FunctionEntry {
    /** The registration path */
    path: string;
    /** The function type */
    type: FunctionType$1;
    /** The function visibility */
    visibility: FunctionVisibility$1;
    /** The registered function */
    fn: RegisteredFunction$1;
}
/**
 * Entry for a registered HTTP endpoint in the registry.
 */
interface HttpEndpointEntry {
    /** The HTTP path pattern */
    path: string;
    /** The HTTP method */
    method: HttpMethod;
    /** The registered endpoint */
    endpoint: RegisteredHttpEndpoint;
}
/**
 * Match result for HTTP endpoint with extracted parameters.
 */
interface HttpEndpointMatch extends HttpEndpointEntry {
    /** Extracted path parameters */
    params: Record<string, string>;
}
/**
 * Options for registration methods.
 */
interface RegistrationOptions {
    /** Force overwrite existing registration */
    force?: boolean;
}
/**
 * Error class for function registry errors.
 */
declare class FunctionRegistryError extends Error {
    readonly code?: string;
    constructor(message: string, code?: string);
}
/**
 * Singleton registry for Convex functions and HTTP endpoints.
 *
 * @example
 * ```typescript
 * const registry = FunctionRegistry.getInstance()
 *
 * // Register functions
 * registry.register('users:get', getUserQuery)
 * registry.register('users:create', createUserMutation)
 *
 * // Lookup functions
 * const fn = registry.getFunction('users:get')
 * const queries = registry.listFunctions('query')
 *
 * // HTTP endpoints
 * registry.registerHttpEndpoint('/api/users', 'GET', listUsersEndpoint)
 * const endpoint = registry.getHttpEndpoint('/api/users', 'GET')
 * ```
 */
declare class FunctionRegistry implements Iterable<FunctionEntry> {
    private static instance;
    private readonly functionMap;
    private readonly httpEndpoints;
    /**
     * Private constructor to enforce singleton pattern.
     */
    private constructor();
    /**
     * Get the singleton instance of the registry.
     */
    static getInstance(): FunctionRegistry;
    /**
     * Reset the singleton instance (for testing purposes).
     */
    static resetInstance(): void;
    /**
     * Register a function with the given path.
     *
     * @param path - The function path (e.g., "users:get" or "users/get")
     * @param fn - The registered function
     * @param options - Registration options
     * @returns The registry instance for chaining
     * @throws FunctionRegistryError if path is invalid or already registered
     */
    register(path: string, fn: RegisteredFunction$1, options?: RegistrationOptions): this;
    /**
     * Get a registered function by path.
     *
     * @param path - The function path
     * @returns The function entry or undefined if not found
     */
    getFunction(path: string): FunctionEntry | undefined;
    /**
     * Check if a function is registered at the given path.
     *
     * @param path - The function path
     * @returns True if a function is registered at the path
     */
    has(path: string): boolean;
    /**
     * Unregister a function at the given path.
     *
     * @param path - The function path
     * @returns True if a function was removed, false if not found
     */
    unregister(path: string): boolean;
    /**
     * List all registered functions, optionally filtered by type and/or visibility.
     *
     * @param type - Optional function type filter
     * @param visibility - Optional visibility filter
     * @returns Array of function entries
     */
    listFunctions(type?: FunctionType$1, visibility?: FunctionVisibility$1): FunctionEntry[];
    /**
     * Generate a key for HTTP endpoint storage.
     */
    private httpEndpointKey;
    /**
     * Register an HTTP endpoint.
     *
     * @param path - The HTTP path pattern (e.g., "/api/users/:id")
     * @param method - The HTTP method
     * @param endpoint - The registered HTTP endpoint
     * @param options - Registration options
     * @returns The registry instance for chaining
     * @throws FunctionRegistryError if path is invalid or already registered
     */
    registerHttpEndpoint(path: string, method: HttpMethod, endpoint: RegisteredHttpEndpoint, options?: RegistrationOptions): this;
    /**
     * Get a registered HTTP endpoint by exact path and method.
     *
     * @param path - The HTTP path
     * @param method - The HTTP method
     * @returns The endpoint entry or undefined if not found
     */
    getHttpEndpoint(path: string, method: HttpMethod): HttpEndpointEntry | undefined;
    /**
     * Check if an HTTP endpoint is registered at the given path and method.
     *
     * @param path - The HTTP path
     * @param method - The HTTP method
     * @returns True if an endpoint is registered
     */
    hasHttpEndpoint(path: string, method: HttpMethod): boolean;
    /**
     * Unregister an HTTP endpoint at the given path and method.
     *
     * @param path - The HTTP path
     * @param method - The HTTP method
     * @returns True if an endpoint was removed, false if not found
     */
    unregisterHttpEndpoint(path: string, method: HttpMethod): boolean;
    /**
     * List all registered HTTP endpoints, optionally filtered by method.
     *
     * @param method - Optional HTTP method filter
     * @returns Array of HTTP endpoint entries
     */
    listHttpEndpoints(method?: HttpMethod): HttpEndpointEntry[];
    /**
     * Match an HTTP request path and method to a registered endpoint.
     * Supports path parameters (e.g., "/api/users/:id" matches "/api/users/123").
     *
     * @param requestPath - The actual request path
     * @param method - The HTTP method
     * @returns The matched endpoint with extracted parameters, or undefined if no match
     */
    matchHttpEndpoint(requestPath: string, method: HttpMethod): HttpEndpointMatch | undefined;
    /**
     * Match a request path against a pattern path, extracting parameters.
     *
     * @param pattern - The pattern path (e.g., "/api/users/:id")
     * @param requestPath - The actual request path (e.g., "/api/users/123")
     * @returns Extracted parameters or null if no match
     */
    private matchPath;
    /**
     * Register multiple functions from a module object.
     *
     * @param prefix - The path prefix for all functions in the module
     * @param module - An object containing registered functions
     * @returns The registry instance for chaining
     */
    registerModule(prefix: string, module: Record<string, unknown>): this;
    /**
     * Check if a value is a registered function.
     */
    private isRegisteredFunction;
    /**
     * Get the number of registered functions.
     */
    size(): number;
    /**
     * Get the number of registered HTTP endpoints.
     */
    httpEndpointCount(): number;
    /**
     * Clear all registered functions and HTTP endpoints.
     */
    clear(): void;
    /**
     * Iterate over all registered functions.
     */
    [Symbol.iterator](): Iterator<FunctionEntry>;
    /**
     * Get entries as [path, entry] pairs.
     */
    entries(): IterableIterator<[string, FunctionEntry]>;
    /**
     * Get all registered paths.
     */
    paths(): IterableIterator<string>;
    /**
     * Get all registered functions (without path information).
     */
    functions(): IterableIterator<RegisteredFunction$1>;
}

/**
 * FunctionReference Types and api() Generation
 *
 * This module provides:
 * - FunctionReference<Type, Args, Returns> type
 * - api object generation
 * - Type-safe function references
 * - makeFunctionReference helper
 * - Function path resolution
 * - Nested module references (api.users.get)
 *
 * 100% compatible with Convex's convex/server exports.
 */
/**
 * Function types supported by Convex.
 */
type FunctionType = 'query' | 'mutation' | 'action';
/**
 * Visibility levels for functions.
 */
type FunctionVisibility = 'public' | 'internal';
/**
 * A reference to a registered function.
 * This is the core type for type-safe function calls.
 *
 * @typeParam Type - The function type ('query' | 'mutation' | 'action')
 * @typeParam Args - The argument type for the function
 * @typeParam Returns - The return type of the function
 * @typeParam Visibility - The visibility level ('public' | 'internal')
 */
interface FunctionReference<Type extends FunctionType = FunctionType, Args = unknown, Returns = unknown, Visibility extends FunctionVisibility = 'public'> {
    /** The function type */
    _type: Type;
    /** The argument type (phantom type for type inference) */
    _args: Args;
    /** The return type (phantom type for type inference) */
    _returns: Returns;
    /** The full path to the function (e.g., 'users:get' or 'admin/users:list') */
    _path: string;
    /** The visibility level */
    _visibility: Visibility;
}
/**
 * A generic function reference with unknown args and returns.
 * Useful when you need to accept any function reference of a specific type.
 */
type GenericFunctionReference<Type extends FunctionType = FunctionType, Visibility extends FunctionVisibility = FunctionVisibility> = FunctionReference<Type, unknown, unknown, Visibility>;
/**
 * Any function reference (query, mutation, or action).
 */
type AnyFunctionReference = FunctionReference<FunctionType, unknown, unknown, FunctionVisibility>;
/**
 * Shorthand for query function references.
 */
type QueryReference<Args = unknown, Returns = unknown> = FunctionReference<'query', Args, Returns>;
/**
 * Shorthand for mutation function references.
 */
type MutationReference<Args = unknown, Returns = unknown> = FunctionReference<'mutation', Args, Returns>;
/**
 * Shorthand for action function references.
 */
type ActionReference<Args = unknown, Returns = unknown> = FunctionReference<'action', Args, Returns>;
/**
 * A function reference that can be scheduled (mutations and actions only).
 * Queries cannot be scheduled because they are read-only.
 */
type SchedulableFunctionReference = FunctionReference<'mutation' | 'action', unknown, unknown, FunctionVisibility>;
/**
 * Extract the args type from a function reference.
 */
type FunctionArgs<F extends AnyFunctionReference> = F['_args'];
/**
 * Extract the return type from a function reference.
 */
type FunctionReturnType<F extends AnyFunctionReference> = F['_returns'];
/**
 * Filter an API object to only include functions of a specific type.
 */
type FilterByFunctionType<API, Type extends FunctionType> = {
    [K in keyof API]: API[K] extends FunctionReference<Type, infer A, infer R> ? FunctionReference<Type, A, R> : API[K] extends Record<string, unknown> ? FilterByFunctionType<API[K], Type> : never;
};
/**
 * Optional rest args for functions with empty args.
 * When args is an empty object, the args parameter becomes optional.
 */
type OptionalRestArgs<F extends AnyFunctionReference> = FunctionArgs<F> extends Record<string, never> ? [] | [Record<string, never>] : [FunctionArgs<F>];
/**
 * Args and options combined for function calls with additional options.
 */
type ArgsAndOptions<F extends AnyFunctionReference, Options> = FunctionArgs<F> extends Record<string, never> ? [] | [Record<string, never>] | [Record<string, never>, Options] : [FunctionArgs<F>] | [FunctionArgs<F>, Options];
/**
 * A registered function with metadata.
 * Used internally for building the api and internal objects.
 */
interface RegisteredFunction {
    _type: FunctionType;
    _visibility: FunctionVisibility;
    _args?: unknown;
    _returns?: unknown;
}
/**
 * Parsed function path result.
 */
interface ParsedFunctionPath {
    /** The module path (e.g., 'users' or 'admin/users') */
    module: string;
    /** The function name (e.g., 'get' or 'list') */
    functionName: string;
    /** The full path (e.g., 'users:get' or 'admin/users:list') */
    fullPath: string;
}
/**
 * Parse a function path into its components.
 *
 * @param path - The function path (e.g., 'users:get' or 'admin/users:list')
 * @returns The parsed path components
 *
 * @example
 * ```typescript
 * parseFunctionPath('users:get')
 * // => { module: 'users', functionName: 'get', fullPath: 'users:get' }
 *
 * parseFunctionPath('admin/users:list')
 * // => { module: 'admin/users', functionName: 'list', fullPath: 'admin/users:list' }
 * ```
 */
declare function parseFunctionPath(path: string): ParsedFunctionPath;
/**
 * Create a function reference from a path.
 *
 * This function uses TypeScript's generic type parameter to determine the function type.
 * Since generics are erased at runtime, this function uses a mapping approach where
 * the first type parameter determines the runtime type.
 *
 * @typeParam Type - The function type
 * @typeParam Args - The argument type
 * @typeParam Returns - The return type
 * @typeParam Visibility - The visibility level
 *
 * @param path - The function path (e.g., 'users:get')
 * @param visibility - The visibility level (default: 'public')
 * @returns A typed function reference
 *
 * @example
 * ```typescript
 * const ref = makeFunctionReference<'query', { id: string }, User | null>(
 *   'users:get'
 * )
 * // Use with ctx.runQuery(ref, { id: userId })
 * ```
 */
declare function makeFunctionReference<Type extends FunctionType, Args = unknown, Returns = unknown, Visibility extends FunctionVisibility = 'public'>(path: string, visibility?: Visibility): FunctionReference<Type, Args, Returns, Visibility>;
declare function makeFunctionReference<Args = unknown, Returns = unknown, Visibility extends FunctionVisibility = 'public'>(path: string, visibility?: Visibility): FunctionReference<'query', Args, Returns, Visibility>;
/**
 * Create a query function reference.
 */
declare function makeQueryReference<Args = unknown, Returns = unknown, Visibility extends FunctionVisibility = 'public'>(path: string, visibility?: Visibility): FunctionReference<'query', Args, Returns, Visibility>;
/**
 * Create a mutation function reference.
 */
declare function makeMutationReference<Args = unknown, Returns = unknown, Visibility extends FunctionVisibility = 'public'>(path: string, visibility?: Visibility): FunctionReference<'mutation', Args, Returns, Visibility>;
/**
 * Create an action function reference.
 */
declare function makeActionReference<Args = unknown, Returns = unknown, Visibility extends FunctionVisibility = 'public'>(path: string, visibility?: Visibility): FunctionReference<'action', Args, Returns, Visibility>;
/**
 * Get the function name/path from a function reference.
 *
 * @param ref - The function reference
 * @returns The function path string
 *
 * @example
 * ```typescript
 * const ref = makeFunctionReference<'query', {}, void>('users:get')
 * getFunctionName(ref) // => 'users:get'
 * ```
 */
declare function getFunctionName(ref: AnyFunctionReference): string;
/**
 * Template literal tag for creating function name strings.
 * Validates the path format and returns a string.
 *
 * @example
 * ```typescript
 * const name = functionName`users:get`
 * // => 'users:get'
 *
 * const module = 'users'
 * const func = 'create'
 * const name2 = functionName`${module}:${func}`
 * // => 'users:create'
 * ```
 */
declare function functionName(strings: TemplateStringsArray, ...values: unknown[]): string;
/**
 * Create a serializable function handle from a function reference.
 * Function handles can be stored in the database and used later.
 *
 * @param ref - The function reference
 * @returns A string handle that can be serialized
 *
 * @example
 * ```typescript
 * const ref = makeFunctionReference<'mutation', {}, void>('tasks:process')
 * const handle = createFunctionHandle(ref)
 * // Store handle in database, use later with scheduler
 * ```
 */
declare function createFunctionHandle(ref: AnyFunctionReference): string;
/**
 * Nested API structure type.
 * Represents the nested module structure of the api object.
 */
type NestedApi = {
    [key: string]: FunctionReference<FunctionType, unknown, unknown, FunctionVisibility> | NestedApi;
};
/**
 * Create an api object from registered functions.
 * Only includes public functions.
 *
 * @param registeredFunctions - Map of function paths to registered functions
 * @returns An api object with nested module structure
 *
 * @example
 * ```typescript
 * const registeredFunctions = {
 *   'users:get': { _type: 'query', _visibility: 'public' },
 *   'users:create': { _type: 'mutation', _visibility: 'public' },
 *   'admin/users:list': { _type: 'query', _visibility: 'public' },
 * }
 *
 * const api = createApi(registeredFunctions)
 * // api.users.get._path === 'users:get'
 * // api.admin.users.list._path === 'admin/users:list'
 * ```
 */
declare function createApi(registeredFunctions: Record<string, RegisteredFunction>): NestedApi;
/**
 * Create an internal api object from registered functions.
 * Only includes internal functions.
 *
 * @param registeredFunctions - Map of function paths to registered functions
 * @returns An internal api object with nested module structure
 *
 * @example
 * ```typescript
 * const registeredFunctions = {
 *   'users:getSecret': { _type: 'query', _visibility: 'internal' },
 *   'admin/secrets:get': { _type: 'query', _visibility: 'internal' },
 * }
 *
 * const internal = createInternalApi(registeredFunctions)
 * // internal.users.getSecret._path === 'users:getSecret'
 * // internal.admin.secrets.get._path === 'admin/secrets:get'
 * ```
 */
declare function createInternalApi(registeredFunctions: Record<string, RegisteredFunction>): NestedApi;

export { type ActionCtx, type ActionReference, type AnyFunctionReference, type AnyRegisteredFunction, type RegisteredFunction as ApiRegisteredFunction, type ArgsAndOptions, ArgsValidator, type Auth, AuthImpl, DatabaseReader, type DatabaseReader$1 as DatabaseReaderCtx, DatabaseReaderImpl, DatabaseWriter, type DatabaseWriter$1 as DatabaseWriterCtx, type FilterBuilder$1 as FilterBuilder, type FilterByFunctionType, type FilterExpression$1 as FilterExpression, type FunctionArgs$1 as FunctionArgs, type FunctionEntry, type FunctionReference as FunctionRef, FunctionReference$1 as FunctionReference, type FunctionArgs as FunctionReferenceArgs, FunctionRegistry, FunctionRegistryError, type FunctionReturnType, type FunctionReturns, type GenericFunctionReference, type GenericRegisteredFunction, type HttpEndpointEntry, type HttpEndpointMatch, type HttpMethod, HttpRouter, Id, InMemoryStorage, type IndexRange, type IndexRangeBuilder$1 as IndexRangeBuilder, Infer, type MutationCtx, type MutationReference, type NestedApi, type OptionalRestArgs, PaginationOptions, PaginationResult, type ParsedFunctionPath, type QueryBuilder$1 as QueryBuilder, QueryBuilderImpl, type QueryCtx, QueryCtxImpl, type QueryInitializer$1 as QueryInitializer, type QueryOptions, type QueryReference, type RegisteredAction, type RegisteredFunction$1 as RegisteredFunction, type RegisteredHttpEndpoint, type RegisteredMutation, type RegisteredQuery, type RegistrationOptions, type SchedulableFunctionReference, ScheduledFunctionId, type Scheduler, type SearchFilterBuilder$1 as SearchFilterBuilder, type StorageBackend, StorageId, type StorageReader, StorageReaderImpl, type StorageWriter, UserIdentity, Validator, action, createActionCtx, createApi, createDefaultQueryCtx, createFunctionHandle, createInternalApi, createMutationCtx, createQueryCtx, createValidatedActionCtx, createValidatedMutationCtx, defineSchema, defineTable, functionName, getArgsValidator, getFunctionHandler, getFunctionName, getFunctionType, getFunctionVisibility, getReturnsValidator, httpAction, httpRouter, internalAction, internalMutation, internalQuery, isAction, isInternalFunction, isMutation, isPublicFunction, isQuery, isRegisteredFunction, makeActionReference, makeFunctionReference, makeMutationReference, makeQueryReference, mutation, parseFunctionPath, query, validateAuth as validateActionAuth, validateActionCtx, validateScheduler as validateActionScheduler, validateAuth$1 as validateAuth, validateDatabaseWriter, validateMutationCtx, validateScheduler$1 as validateScheduler, validateStorageReader, validateStorageWriter };
