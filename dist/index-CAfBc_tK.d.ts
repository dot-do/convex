/**
 * Core type definitions for convex.do
 * 100% compatible with Convex TypeScript SDK types
 */
/**
 * A unique identifier for a document in a table.
 * Generic over the table name for type safety.
 */
type Id<TableName extends string> = string & {
    __tableName: TableName;
};
/**
 * A generic ID that can reference any table.
 */
type GenericId<TableName extends string> = Id<TableName>;
/**
 * System-generated fields present on all documents.
 */
interface SystemFields {
    _id: Id<string>;
    _creationTime: number;
}
/**
 * A document in the database, combining user fields with system fields.
 */
type Doc<TableName extends string, DocumentType = Record<string, unknown>> = DocumentType & SystemFields & {
    __tableName: TableName;
};
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
 */
interface FunctionReference<Type extends FunctionType = FunctionType, Args = unknown, Returns = unknown> {
    _type: Type;
    _args: Args;
    _returns: Returns;
    _path: string;
}
/**
 * Primitive value types supported by Convex.
 */
type ConvexPrimitive = null | boolean | number | bigint | string | ArrayBuffer;
/**
 * All value types supported by Convex.
 */
type ConvexValue = ConvexPrimitive | ConvexValue[] | {
    [key: string]: ConvexValue;
};
/**
 * Options for paginated queries.
 */
interface PaginationOptions {
    numItems: number;
    cursor?: string | null;
}
/**
 * Result of a paginated query.
 */
interface PaginationResult<T> {
    page: T[];
    isDone: boolean;
    continueCursor: string;
}
/**
 * Application-level error from a Convex function.
 */
declare class ConvexError<T = string> extends Error {
    data: T;
    constructor(data: T);
}
/**
 * User identity information from authentication.
 */
interface UserIdentity {
    tokenIdentifier: string;
    subject: string;
    issuer: string;
    name?: string;
    email?: string;
    pictureUrl?: string;
    nickname?: string;
    givenName?: string;
    familyName?: string;
    emailVerified?: boolean;
    phoneNumber?: string;
    phoneNumberVerified?: boolean;
    updatedAt?: string;
}
/**
 * ID for a scheduled function execution.
 */
type ScheduledFunctionId = string & {
    __scheduled: true;
};
/**
 * ID for a stored file.
 */
type StorageId = string & {
    __storage: true;
};

export { type ConvexValue as C, type Doc as D, type FunctionReference as F, type GenericId as G, type Id as I, type PaginationOptions as P, type ScheduledFunctionId as S, type UserIdentity as U, type PaginationResult as a, type StorageId as b, type SystemFields as c, type FunctionType as d, type FunctionVisibility as e, ConvexError as f };
