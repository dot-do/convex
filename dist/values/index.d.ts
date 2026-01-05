/**
 * Validator system for convex.do
 * 100% compatible with Convex v validators
 */
/**
 * Base interface for all validators.
 * Provides type inference and validation logic.
 */
interface Validator<T = unknown, IsOptional extends boolean = boolean> {
    /** The inferred TypeScript type */
    readonly _type: T;
    /** Whether this validator is optional */
    readonly isOptional: IsOptional;
    /** Parse and validate a value, throwing on invalid input */
    parse(value: unknown): T;
    /** Check if a value is valid without throwing */
    isValid(value: unknown): value is T;
    /** Make this validator optional */
    optional(): OptionalValidator<T>;
    /** Get a description of this validator for error messages */
    describe(): string;
}
/**
 * Infer the TypeScript type from a validator.
 */
type Infer<V extends Validator> = V['_type'];
declare abstract class BaseValidator<T, IsOptional extends boolean = false> implements Validator<T, IsOptional> {
    abstract readonly _type: T;
    readonly isOptional: IsOptional;
    abstract parse(value: unknown): T;
    abstract describe(): string;
    isValid(value: unknown): value is T;
    optional(): OptionalValidator<T>;
}
declare class StringValidator extends BaseValidator<string> {
    readonly _type: string;
    parse(value: unknown): string;
    describe(): string;
}
declare class NumberValidator extends BaseValidator<number> {
    readonly _type: number;
    parse(value: unknown): number;
    describe(): string;
}
declare class BooleanValidator extends BaseValidator<boolean> {
    readonly _type: boolean;
    parse(value: unknown): boolean;
    describe(): string;
}
declare class NullValidator extends BaseValidator<null> {
    readonly _type: null;
    parse(value: unknown): null;
    describe(): string;
}
declare class Int64Validator extends BaseValidator<bigint> {
    readonly _type: bigint;
    parse(value: unknown): bigint;
    describe(): string;
}
declare class Float64Validator extends BaseValidator<number> {
    readonly _type: number;
    parse(value: unknown): number;
    describe(): string;
}
declare class BytesValidator extends BaseValidator<ArrayBuffer> {
    readonly _type: ArrayBuffer;
    parse(value: unknown): ArrayBuffer;
    describe(): string;
}
declare class IdValidator<TableName extends string> extends BaseValidator<string & {
    __tableName: TableName;
}> {
    readonly _type: string & {
        __tableName: TableName;
    };
    private tableName;
    constructor(tableName: TableName);
    parse(value: unknown): string & {
        __tableName: TableName;
    };
    describe(): string;
}
type ObjectShape = Record<string, Validator>;
type InferObject<T extends ObjectShape> = {
    [K in keyof T]: Infer<T[K]>;
};
type ObjectMode = 'strip' | 'strict' | 'passthrough';
declare class ObjectValidator<T extends ObjectShape> extends BaseValidator<InferObject<T>> {
    readonly _type: InferObject<T>;
    private shape;
    private mode;
    constructor(shape: T, mode?: ObjectMode);
    parse(value: unknown): InferObject<T>;
    private parseInternal;
    describe(): string;
    /**
     * Returns a new validator that throws on extra fields.
     */
    strict(): ObjectValidator<T>;
    /**
     * Returns a new validator that passes through extra fields.
     */
    passthrough(): ObjectValidator<T>;
    /**
     * Returns a new validator with additional fields.
     */
    extend<U extends ObjectShape>(additionalShape: U): ObjectValidator<T & U>;
    /**
     * Returns a new validator with only the specified fields.
     */
    pick<K extends keyof T>(keys: K[]): ObjectValidator<Pick<T, K>>;
    /**
     * Returns a new validator without the specified fields.
     */
    omit<K extends keyof T>(keys: K[]): ObjectValidator<Omit<T, K>>;
}
interface ArrayConstraints {
    minLength?: number;
    maxLength?: number;
    exactLength?: number;
}
declare class ArrayValidator<T extends Validator> extends BaseValidator<Infer<T>[]> {
    readonly _type: Infer<T>[];
    private element;
    private constraints;
    constructor(element: T, constraints?: ArrayConstraints);
    parse(value: unknown): Infer<T>[];
    describe(): string;
    /**
     * Returns a new validator that requires at least one element.
     */
    nonempty(): ArrayValidator<T>;
    /**
     * Returns a new validator with a minimum length constraint.
     */
    min(minLength: number): ArrayValidator<T>;
    /**
     * Returns a new validator with a maximum length constraint.
     */
    max(maxLength: number): ArrayValidator<T>;
    /**
     * Returns a new validator with an exact length constraint.
     */
    length(exactLength: number): ArrayValidator<T>;
}
type InferUnion<T extends Validator[]> = T[number] extends Validator<infer U> ? U : never;
declare class UnionValidator<T extends Validator[]> extends BaseValidator<InferUnion<T>> {
    readonly _type: InferUnion<T>;
    private validators;
    constructor(validators: T);
    parse(value: unknown): InferUnion<T>;
    describe(): string;
}
declare class OptionalValidator<T> extends BaseValidator<T | undefined, true> {
    readonly _type: T | undefined;
    readonly isOptional: true;
    private inner;
    constructor(inner: Validator<T>);
    parse(value: unknown): T | undefined;
    describe(): string;
    optional(): OptionalValidator<T | undefined>;
    /**
     * Returns a new validator that provides a default value when undefined.
     */
    default(defaultValue: T): DefaultValidator<T>;
}
declare class DefaultValidator<T> extends BaseValidator<T, true> {
    readonly _type: T;
    readonly isOptional: true;
    private inner;
    private defaultValue;
    constructor(inner: Validator<T>, defaultValue: T);
    parse(value: unknown): T;
    describe(): string;
}
declare class LiteralValidator<T extends string | number | boolean> extends BaseValidator<T> {
    readonly _type: T;
    private literal;
    constructor(literal: T);
    parse(value: unknown): T;
    describe(): string;
}
declare class RecordValidator<K extends Validator<string>, V extends Validator> extends BaseValidator<Record<Infer<K>, Infer<V>>> {
    readonly _type: Record<Infer<K>, Infer<V>>;
    private keys;
    private values;
    constructor(keys: K, values: V);
    parse(value: unknown): Record<Infer<K>, Infer<V>>;
    describe(): string;
}
declare class AnyValidator extends BaseValidator<unknown> {
    readonly _type: unknown;
    parse(value: unknown): unknown;
    describe(): string;
}
declare class UnknownValidator extends BaseValidator<unknown> {
    readonly _type: unknown;
    parse(value: unknown): unknown;
    describe(): string;
}
declare class NullableValidator<T> extends BaseValidator<T | null> {
    readonly _type: T | null;
    private inner;
    constructor(inner: Validator<T>);
    parse(value: unknown): T | null;
    describe(): string;
}
declare class NullishValidator<T> extends BaseValidator<T | null | undefined, true> {
    readonly _type: T | null | undefined;
    readonly isOptional: true;
    private inner;
    constructor(inner: Validator<T>);
    parse(value: unknown): T | null | undefined;
    describe(): string;
}
declare class DiscriminatedUnionValidator<T extends Validator[]> extends BaseValidator<InferUnion<T>> {
    readonly _type: InferUnion<T>;
    private discriminator;
    private validators;
    constructor(discriminator: string, validators: T);
    parse(value: unknown): InferUnion<T>;
    describe(): string;
}
/**
 * The v namespace provides factory functions for creating validators.
 * This is 100% compatible with Convex's v validators.
 */
declare const v: {
    readonly string: () => StringValidator;
    readonly number: () => NumberValidator;
    readonly boolean: () => BooleanValidator;
    readonly null: () => NullValidator;
    readonly int64: () => Int64Validator;
    readonly float64: () => Float64Validator;
    readonly bytes: () => BytesValidator;
    readonly id: <T extends string>(tableName: T) => IdValidator<T>;
    readonly object: <T extends ObjectShape>(shape: T) => ObjectValidator<T>;
    readonly array: <T extends Validator>(element: T) => ArrayValidator<T>;
    readonly union: <T extends Validator[]>(...validators: T) => UnionValidator<T>;
    readonly optional: <T extends Validator>(validator: T) => OptionalValidator<Infer<T>>;
    readonly literal: <T extends string | number | boolean>(value: T) => LiteralValidator<T>;
    readonly record: <K extends Validator<string>, V extends Validator>(keys: K | V, values?: V) => RecordValidator<StringValidator, V> | RecordValidator<K, V>;
    readonly any: () => AnyValidator;
    readonly unknown: () => UnknownValidator;
    readonly nullable: <T extends Validator>(validator: T) => NullableValidator<Infer<T>>;
    readonly nullish: <T extends Validator>(validator: T) => NullishValidator<Infer<T>>;
    readonly discriminatedUnion: <T extends Validator[]>(discriminator: string, validators: T) => DiscriminatedUnionValidator<T>;
};
/**
 * Args validator type for function definitions.
 */
type ArgsValidator = Validator<Record<string, unknown>> | Record<string, Validator>;
/**
 * Infer args type from an args validator.
 */
type InferArgs<T extends ArgsValidator> = T extends Validator<infer U> ? U : T extends Record<string, Validator> ? {
    [K in keyof T]: Infer<T[K]>;
} : never;

export { type ArgsValidator, type Infer, type InferArgs, type Validator, v };
