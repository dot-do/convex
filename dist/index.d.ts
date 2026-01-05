import * as hono_types from 'hono/types';
import { Hono } from 'hono';

/**
 * Environment bindings type definition for Cloudflare Workers
 */
interface Env$1 {
    CONVEX_DATABASE: DurableObjectNamespace;
    CONVEX_SUBSCRIPTION: DurableObjectNamespace;
    CONVEX_SCHEDULER: DurableObjectNamespace;
    CONVEX_STORAGE: DurableObjectNamespace;
    STORAGE_BUCKET: R2Bucket;
    ENVIRONMENT: string;
}

/**
 * ConvexDatabase Durable Object
 *
 * Core persistence layer using SQLite storage.
 * Provides ACID-compliant document storage with indexes.
 */

interface Document {
    _id: string;
    _creationTime: number;
    [key: string]: unknown;
}
interface QueryFilter {
    field: string;
    operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
    value: unknown;
}
interface QueryOptions {
    order?: {
        field: string;
        direction: 'asc' | 'desc';
    };
    limit?: number;
    cursor?: string;
}
interface FieldDefinition {
    type: string;
    optional: boolean;
    table?: string;
    element?: FieldDefinition;
    fields?: Record<string, FieldDefinition>;
    variants?: FieldDefinition[];
    value?: unknown;
}
interface IndexDefinition {
    name: string;
    fields: string[];
    unique: boolean;
}
interface TableSchema {
    name: string;
    fields: Record<string, FieldDefinition>;
    indexes: IndexDefinition[];
}
interface SchemaDefinition {
    tables: Record<string, TableSchema>;
}
interface MigrationOperation {
    type: 'addColumn' | 'dropColumn' | 'createTable' | 'dropTable' | 'createIndex' | 'dropIndex';
    table: string;
    column?: string;
    definition?: FieldDefinition;
    index?: IndexDefinition;
}
interface MigrationPlan {
    fromVersion: number;
    toVersion: number;
    operations: MigrationOperation[];
    expectedSchemaHash?: string;
}
declare class ConvexDatabase implements DurableObject {
    private state;
    protected env: Env$1;
    private sql;
    private initialized;
    private tables;
    constructor(state: DurableObjectState, env: Env$1);
    /**
     * Initialize the database schema
     */
    ensureInitialized(): Promise<void>;
    /**
     * Check if initialized
     */
    isInitialized(): boolean;
    /**
     * Ensure a table exists, creating it if necessary
     */
    private ensureTable;
    /**
     * Generate a unique document ID
     */
    private generateId;
    /**
     * Validate a document value for Convex compatibility
     */
    private validateValue;
    /**
     * Validate document for insert/update
     */
    private validateDocument;
    /**
     * Serialize a document for storage
     * Handles BigInt and ArrayBuffer special cases
     */
    private serializeDocument;
    /**
     * Deserialize a document from storage
     * Handles BigInt and ArrayBuffer special cases
     */
    private deserializeDocument;
    /**
     * Insert a new document
     */
    insert(tableName: string, doc: Omit<Document, '_id' | '_creationTime'>): Promise<string>;
    /**
     * Get a document by ID
     */
    get(tableName: string, id: string): Promise<Document | null>;
    /**
     * Validate fields for patch/update
     */
    private validatePatchFields;
    /**
     * Patch (partial update) a document
     */
    patch(tableName: string, id: string, fields: Record<string, unknown>): Promise<void>;
    /**
     * Replace a document entirely
     */
    replace(tableName: string, id: string, doc: Omit<Document, '_id' | '_creationTime'>): Promise<void>;
    /**
     * Delete a document
     */
    delete(tableName: string, id: string): Promise<void>;
    /**
     * Query documents with filters
     */
    query(tableName: string, filters?: QueryFilter[], options?: QueryOptions): Promise<Document[]>;
    /**
     * Translate filter operator to SQL
     */
    private translateOperator;
    /**
     * Run a transaction
     */
    runTransaction<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * Convert a JavaScript value to SQLite-compatible format
     */
    toSQLiteValue(value: unknown, fieldConfig: {
        type: string;
        optional: boolean;
    }): unknown;
    /**
     * Convert a SQLite value back to JavaScript format
     */
    fromSQLiteValue(value: unknown, fieldConfig: {
        type: string;
        optional: boolean;
    }): unknown;
    /**
     * Convert a Convex field type to SQLite column type
     */
    convexTypeToSQLite(fieldDef: FieldDefinition): string;
    /**
     * Validate table name
     */
    private validateTableName;
    /**
     * Validate field name
     */
    private validateFieldName;
    /**
     * Generate CREATE TABLE SQL from schema
     */
    generateCreateTableSQL(schema: TableSchema): string;
    /**
     * Generate CREATE INDEX SQL
     */
    generateCreateIndexSQL(tableName: string, indexDef: IndexDefinition): string;
    /**
     * Create a table from schema definition
     */
    createTable(schema: TableSchema): Promise<void>;
    /**
     * Get current schema version
     */
    getCurrentSchemaVersion(): Promise<number>;
    /**
     * Compute a hash for a schema definition
     */
    private computeSchemaHash;
    /**
     * Apply a migration plan
     */
    applyMigration(migration: MigrationPlan): Promise<void>;
    /**
     * Apply a full schema definition
     */
    applySchema(schema: SchemaDefinition): Promise<void>;
    /**
     * List all document IDs in a table
     */
    listDocumentIds(tableName: string): Promise<string[]>;
    /**
     * Get document count for a table
     */
    getDocumentCount(tableName: string): Promise<number>;
    /**
     * Handle HTTP requests to this Durable Object
     */
    fetch(request: Request): Promise<Response>;
}

/**
 * ConvexSubscription Durable Object
 *
 * Manages real-time subscriptions and WebSocket connections.
 * Handles subscription tracking and change notifications.
 */

interface Subscription {
    clientId: string;
    queryPath: string;
    args: unknown;
    lastResult: unknown;
    lastTimestamp: number;
}
declare class ConvexSubscription implements DurableObject {
    private state;
    protected env: Env$1;
    private subscriptions;
    private clientSubscriptions;
    private authenticatedClients;
    constructor(state: DurableObjectState, env: Env$1);
    /**
     * Generate a subscription ID
     */
    private generateSubscriptionId;
    /**
     * Hash args for subscription deduplication
     */
    private hashArgs;
    /**
     * Subscribe to a query
     */
    subscribe(clientId: string, queryPath: string, args: unknown): Promise<string>;
    /**
     * Unsubscribe from a query
     */
    unsubscribe(subscriptionId: string): Promise<void>;
    /**
     * Unsubscribe all subscriptions for a client
     */
    unsubscribeClient(clientId: string): Promise<void>;
    /**
     * Update the result of a subscription (after query re-execution)
     */
    updateSubscriptionResult(subscriptionId: string, result: unknown): Promise<boolean>;
    /**
     * Get subscriptions that might be affected by a table change
     */
    getAffectedSubscriptions(tableName: string): Subscription[];
    /**
     * Check if a query might touch a specific table
     */
    private queryMightTouchTable;
    /**
     * Handle WebSocket connections
     */
    fetch(request: Request): Promise<Response>;
    /**
     * Handle incoming WebSocket messages
     */
    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
    /**
     * Handle WebSocket close
     */
    webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void>;
    /**
     * Get client ID for a WebSocket
     */
    private getClientId;
    /**
     * Broadcast update to subscribed clients
     */
    broadcastUpdate(subscriptionId: string, data: unknown): Promise<void>;
}

/**
 * ConvexScheduler Durable Object
 *
 * Handles scheduled function execution using Durable Object alarms.
 */

interface ScheduledFunction {
    id: string;
    functionPath: string;
    args: unknown;
    runAt: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
    createdAt: number;
    completedAt?: number;
    error?: string;
    retries: number;
    maxRetries: number;
}
declare class ConvexScheduler implements DurableObject {
    private state;
    protected env: Env$1;
    private sql;
    private initialized;
    constructor(state: DurableObjectState, env: Env$1);
    /**
     * Initialize the scheduler tables
     */
    private ensureInitialized;
    /**
     * Generate a unique scheduled function ID
     */
    private generateId;
    /**
     * Schedule a function to run after a delay
     */
    runAfter(delayMs: number, functionPath: string, args: unknown): Promise<string>;
    /**
     * Schedule a function to run at a specific time
     */
    runAt(timestamp: number, functionPath: string, args: unknown): Promise<string>;
    /**
     * Cancel a scheduled function
     */
    cancel(scheduledId: string): Promise<boolean>;
    /**
     * Get a scheduled function by ID
     */
    get(scheduledId: string): Promise<ScheduledFunction | null>;
    /**
     * List scheduled functions
     */
    list(status?: ScheduledFunction['status'], limit?: number): Promise<ScheduledFunction[]>;
    /**
     * Schedule the next alarm for pending functions
     */
    private scheduleNextAlarm;
    /**
     * Handle alarm - execute due scheduled functions
     */
    alarm(): Promise<void>;
    /**
     * Execute a scheduled function
     */
    private executeFunction;
    /**
     * Handle HTTP requests
     */
    fetch(request: Request): Promise<Response>;
}

/**
 * ConvexStorage Durable Object
 *
 * Handles file storage using R2 as the backend.
 */

interface StoredFile {
    storageId: string;
    sha256: string;
    size: number;
    contentType: string | null;
    uploadedAt: number;
    metadata: Record<string, string>;
}
interface UploadUrl {
    uploadUrl: string;
    storageId: string;
    expiresAt: number;
}
declare class ConvexStorage implements DurableObject {
    private state;
    private env;
    private files;
    constructor(state: DurableObjectState, env: Env$1);
    /**
     * Generate a storage ID
     */
    private generateStorageId;
    /**
     * Generate an upload URL for direct client upload
     */
    generateUploadUrl(): Promise<UploadUrl>;
    /**
     * Store a file
     */
    store(storageId: string, data: ArrayBuffer, contentType: string | null, metadata?: Record<string, string>): Promise<StoredFile>;
    /**
     * Get file metadata
     */
    getMetadata(storageId: string): Promise<StoredFile | null>;
    /**
     * Get a file URL for downloading
     */
    getUrl(storageId: string): Promise<string | null>;
    /**
     * Get file data
     */
    getData(storageId: string): Promise<ArrayBuffer | null>;
    /**
     * Delete a file
     */
    delete(storageId: string): Promise<boolean>;
    /**
     * List files with optional prefix
     */
    list(options?: {
        limit?: number;
        cursor?: string;
    }): Promise<{
        files: StoredFile[];
        cursor?: string;
    }>;
    /**
     * Handle HTTP requests
     */
    fetch(request: Request): Promise<Response>;
}

declare const app: Hono<{
    Bindings: Env;
}, hono_types.BlankSchema, "/">;

interface Env {
    CONVEX_DATABASE: DurableObjectNamespace;
    CONVEX_SUBSCRIPTION: DurableObjectNamespace;
    CONVEX_SCHEDULER: DurableObjectNamespace;
    CONVEX_STORAGE: DurableObjectNamespace;
    STORAGE_BUCKET: R2Bucket;
    ENVIRONMENT: string;
}

export { ConvexDatabase, ConvexScheduler, ConvexStorage, ConvexSubscription, type Env$1 as Env, app as default };
