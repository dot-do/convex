/**
 * Schema Definition System
 *
 * This module provides the core schema definition API for Convex applications,
 * enabling type-safe database schemas with compile-time validation and runtime checks.
 *
 * @module server/schema
 *
 * @description
 * The schema system consists of two main functions:
 * - `defineTable()` - Creates a table definition with document schema and fluent index API
 * - `defineSchema()` - Combines table definitions into an immutable application schema
 *
 * Key features:
 * - **Type Safety**: Full TypeScript inference for document types
 * - **Fluent API**: Chainable methods for defining indexes
 * - **Validation**: Runtime document validation against schema
 * - **Immutability**: Schemas are frozen after creation to prevent accidental mutation
 *
 * Supported index types:
 * - **Database indexes**: Standard B-tree indexes for query optimization
 * - **Search indexes**: Full-text search with relevance ranking
 * - **Vector indexes**: Approximate nearest neighbor (ANN) search for embeddings
 *
 * @example Basic usage
 * ```typescript
 * import { defineSchema, defineTable } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * export default defineSchema({
 *   users: defineTable({
 *     name: v.string(),
 *     email: v.string(),
 *   }).index("by_email", ["email"]),
 * });
 * ```
 *
 * @example Complex schema with multiple index types
 * ```typescript
 * import { defineSchema, defineTable } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * export default defineSchema({
 *   documents: defineTable({
 *     title: v.string(),
 *     content: v.string(),
 *     embedding: v.array(v.float64()),
 *     authorId: v.id("users"),
 *     category: v.string(),
 *   })
 *     .index("by_author", ["authorId"])
 *     .index("by_category_author", ["category", "authorId"])
 *     .searchIndex("search_content", {
 *       searchField: "content",
 *       filterFields: ["category"],
 *     })
 *     .vectorIndex("by_embedding", {
 *       vectorField: "embedding",
 *       dimensions: 1536,
 *       filterFields: ["category"],
 *     }),
 * });
 * ```
 *
 * @example Type inference with DataModel
 * ```typescript
 * import { defineSchema, defineTable, DataModel, Doc } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * const schema = defineSchema({
 *   users: defineTable({
 *     name: v.string(),
 *     email: v.string(),
 *   }),
 * });
 *
 * // Infer the data model type
 * type Model = DataModel<typeof schema>;
 * // Model.users = { name: string; email: string }
 *
 * // Get document type with system fields
 * type UserDoc = Doc<typeof schema, "users">;
 * // UserDoc = { _id: string; _creationTime: number; name: string; email: string }
 * ```
 *
 * @see {@link defineTable} - Create a table definition
 * @see {@link defineSchema} - Create an application schema
 * @see {@link TableBuilder} - Table definition builder class
 * @see {@link DataModel} - Type utility for schema inference
 */

import type { Validator, Infer } from '../values'
import { v } from '../values'

// ============================================================================
// Validation Error Types
// ============================================================================

/**
 * Represents a validation error with path information.
 * Used to identify exactly where in a document validation failed.
 */
export interface ValidationError {
  /** The path to the field that failed validation (e.g., "user.settings.theme") */
  path: string
  /** Description of why validation failed */
  message: string
}

/**
 * Result of validating a document against a table schema.
 * Contains information about whether validation passed and any errors found.
 */
export interface ValidationResult {
  /** Whether the document passed all validation checks */
  valid: boolean
  /** Array of validation errors (empty if valid is true) */
  errors: Array<string | ValidationError>
}

// ============================================================================
// Constants
// ============================================================================

/** Reserved index names that cannot be used by user-defined indexes */
const RESERVED_INDEX_NAMES: ReadonlySet<string> = new Set(['by_creation_time', 'by_id'])

/** Valid index name pattern: starts with letter, contains only letters, numbers, underscores */
const VALID_INDEX_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/

/** Pattern to detect array element access (e.g., tags[0]) which is not supported in indexes */
const ARRAY_ELEMENT_ACCESS_PATTERN = /\[\d+\]/

/** Valid table name pattern: starts with letter, contains only alphanumeric and underscore */
const VALID_TABLE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/

// ============================================================================
// Index Validation Helpers
// ============================================================================

/**
 * Validates that an index name follows the required naming conventions.
 *
 * Index names must:
 * - Not be empty or whitespace-only
 * - Start with a letter (not underscore or number)
 * - Contain only letters, numbers, and underscores
 * - Not be a reserved name (e.g., "by_creation_time", "by_id")
 *
 * @param name - The index name to validate
 * @throws {Error} If the name is invalid with a descriptive message
 *
 * @example
 * ```typescript
 * validateIndexName("by_email")       // OK
 * validateIndexName("_private")       // Error: cannot start with underscore
 * validateIndexName("by_creation_time") // Error: reserved name
 * ```
 */
function validateIndexName(name: string): void {
  if (name === '') {
    throw new Error('Invalid index name: name cannot be empty')
  }

  if (name.trim() === '') {
    throw new Error('Invalid index name: name cannot be whitespace-only')
  }

  if (name.startsWith('_')) {
    throw new Error(`Index name "${name}" cannot start with an underscore`)
  }

  if (/^\d/.test(name)) {
    throw new Error(`Index name "${name}" cannot start with a number`)
  }

  if (!VALID_INDEX_NAME_PATTERN.test(name)) {
    throw new Error(
      `Index name "${name}" contains invalid characters. Only letters, numbers, and underscores are allowed`
    )
  }

  if (RESERVED_INDEX_NAMES.has(name)) {
    throw new Error(`Index name "${name}" is reserved and cannot be used`)
  }
}

// ============================================================================
// Validator Shape Resolution Helpers
// ============================================================================

/**
 * Shape of an object validator containing field validators.
 */
type ValidatorShape = Record<string, Validator>

/**
 * Internal structure of a validator that may contain a shape property.
 */
interface ValidatorWithShape {
  shape?: ValidatorShape
}

/**
 * Internal structure of an optional validator that wraps another validator.
 */
interface OptionalValidator {
  isOptional: boolean
  inner?: Validator
}

/**
 * Extracts the inner shape from an object validator.
 * Handles both direct object validators and optional wrappers around objects.
 *
 * @param validator - The validator to extract shape from
 * @returns The inner shape if the validator is an object type, undefined otherwise
 */
function extractValidatorShape(validator: Validator): ValidatorShape | undefined {
  const validatorAny = validator as unknown as ValidatorWithShape

  // Check for direct object validator with shape
  if (validatorAny.shape) {
    return validatorAny.shape
  }

  // Check for optional wrapper around an object validator
  const optionalValidator = validator as unknown as OptionalValidator
  if (optionalValidator.isOptional && optionalValidator.inner) {
    const innerWithShape = optionalValidator.inner as unknown as ValidatorWithShape
    return innerWithShape.shape
  }

  return undefined
}

/**
 * Checks if a validator represents a string type (including optional<string>).
 *
 * @param validator - The validator to check
 * @returns True if the validator accepts string values
 */
function isStringValidator(validator: Validator): boolean {
  const description = validator.describe()
  return description === 'string' || description === 'string | undefined'
}

/**
 * Checks if a validator represents an array type (including optional<array>).
 *
 * @param validator - The validator to check
 * @returns True if the validator accepts array values
 */
function isArrayValidator(validator: Validator): boolean {
  const description = validator.describe()
  return description.includes('[]')
}

// ============================================================================
// Field Path Resolution
// ============================================================================

/**
 * Result of resolving a field path in a document schema.
 */
interface FieldPathResolution {
  /** The validator at the resolved path */
  validator: Validator
  /** The full path that was resolved */
  resolvedPath: string
}

/**
 * Resolves a dot-notated field path to the corresponding validator in a schema.
 * Supports nested object access through dot notation (e.g., "user.settings.theme").
 *
 * @param fieldPath - The dot-notated field path to resolve
 * @param schema - The document schema to search in
 * @returns The resolved validator and path
 * @throws {Error} If the path doesn't exist or traverses non-object types
 *
 * @example
 * ```typescript
 * const schema = { user: v.object({ name: v.string() }) }
 * const result = resolveFieldPath("user.name", schema)
 * // result.validator is the string validator
 * ```
 */
function resolveFieldPath(
  fieldPath: string,
  schema: ValidatorShape
): FieldPathResolution {
  const pathParts = fieldPath.split('.')
  let currentSchema: ValidatorShape | null = schema

  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i]
    const currentPath = pathParts.slice(0, i + 1).join('.')

    if (!currentSchema || !(part in currentSchema)) {
      throw new Error(`Field "${currentPath}" does not exist in the document schema`)
    }

    const validator = currentSchema[part]

    // If this is the last part, return the validator
    if (i === pathParts.length - 1) {
      return { validator, resolvedPath: currentPath }
    }

    // For intermediate parts, extract the nested shape
    const innerShape = extractValidatorShape(validator)
    if (!innerShape) {
      const remainingPath = pathParts.slice(i + 1).join('.')
      throw new Error(
        `Cannot access nested property "${remainingPath}" on non-object field "${currentPath}"`
      )
    }

    currentSchema = innerShape
  }

  // Should never reach here, but TypeScript needs this
  throw new Error(`Field "${fieldPath}" does not exist in the document schema`)
}

/**
 * Validates a field path exists in the document schema.
 * Supports dot notation for nested objects but rejects array element access.
 *
 * @param fieldPath - The field path to validate
 * @param documentSchema - The document schema to validate against
 * @throws {Error} If the field path is invalid or does not exist
 */
function validateFieldPath(fieldPath: string, documentSchema: ValidatorShape): void {
  if (fieldPath === '') {
    throw new Error('Index field name cannot be empty')
  }

  if (fieldPath.trim() === '') {
    throw new Error('Index field name cannot be whitespace-only')
  }

  if (ARRAY_ELEMENT_ACCESS_PATTERN.test(fieldPath)) {
    throw new Error(`Array element access is not supported in index fields: "${fieldPath}"`)
  }

  // Use the unified field path resolution
  resolveFieldPath(fieldPath, documentSchema)
}

// ============================================================================
// Index Field Validation
// ============================================================================

/**
 * A field specification in an index definition.
 * Can be a simple field name or an object with field name and sort order.
 */
export type IndexFieldSpec = string | { field: string; order: 'asc' | 'desc' }

/**
 * Extracts the field name from an index field specification.
 *
 * @param field - The field specification
 * @returns The field name string
 */
function getFieldName(field: IndexFieldSpec): string {
  return typeof field === 'string' ? field : field.field
}

/**
 * Validates an array of index fields against the document schema.
 *
 * @param fields - Array of field specifications to validate
 * @param documentSchema - The document schema to validate against
 * @throws {Error} If any field is invalid, duplicated, or doesn't exist
 */
function validateIndexFields(
  fields: IndexFieldSpec[],
  documentSchema: ValidatorShape
): void {
  if (fields.length === 0) {
    throw new Error('Index must have at least one field')
  }

  const seenFields = new Set<string>()

  for (const field of fields) {
    const fieldName = getFieldName(field)

    if (seenFields.has(fieldName)) {
      throw new Error(`Duplicate field "${fieldName}" in index`)
    }
    seenFields.add(fieldName)

    validateFieldPath(fieldName, documentSchema)
  }
}

// ============================================================================
// Table Name Validation
// ============================================================================

/**
 * Validates that a table name follows the required naming conventions.
 *
 * Table names must:
 * - Not be empty
 * - Start with a letter (not underscore, as those are reserved for system tables)
 * - Not start with a number
 * - Contain only letters, numbers, and underscores
 *
 * @param name - The table name to validate
 * @throws {Error} If the name is invalid with a descriptive message
 */
function validateTableName(name: string): void {
  if (name === '') {
    throw new Error('Table name cannot be empty')
  }

  if (name.startsWith('_')) {
    throw new Error(
      `Table name "${name}" cannot start with underscore (reserved for system tables)`
    )
  }

  if (/^[0-9]/.test(name)) {
    throw new Error(`Table name "${name}" cannot start with a number`)
  }

  if (!VALID_TABLE_NAME_PATTERN.test(name)) {
    throw new Error(
      `Table name "${name}" contains invalid characters (only letters, numbers, and underscores allowed)`
    )
  }
}

// ============================================================================
// Table Definition Validation
// ============================================================================

/**
 * Validates that a table definition is valid.
 *
 * @param name - The table name (for error messages)
 * @param definition - The definition to validate
 * @throws {Error} If the definition is not a valid TableBuilder instance
 */
function validateTableDefinition(name: string, definition: unknown): void {
  if (definition === null) {
    throw new Error(
      `Table "${name}" has null definition. Use defineTable() to create a valid table definition.`
    )
  }

  if (definition === undefined) {
    throw new Error(
      `Table "${name}" has undefined definition. Use defineTable() to create a valid table definition.`
    )
  }

  if (typeof definition === 'string') {
    throw new Error(
      `Table "${name}" has string definition. Use defineTable() to create a valid table definition.`
    )
  }

  if (typeof definition === 'number' || typeof definition === 'boolean') {
    throw new Error(
      `Table "${name}" has primitive definition. Use defineTable() to create a valid table definition.`
    )
  }

  if (Array.isArray(definition)) {
    throw new Error(
      `Table "${name}" has array definition. Use defineTable() to create a valid table definition.`
    )
  }

  if (!(definition instanceof TableBuilder)) {
    throw new Error(
      `Table "${name}" has invalid definition. Use defineTable() to create a valid table definition.`
    )
  }
}

// ============================================================================
// Schema Options Validation
// ============================================================================

/**
 * Validates schema options for correctness.
 *
 * @param options - The schema options to validate
 * @throws {Error} If any option has an invalid type
 */
function validateSchemaOptions(options: SchemaOptions): void {
  if (options.schemaValidation !== undefined && typeof options.schemaValidation !== 'boolean') {
    throw new Error('schemaValidation option must be a boolean')
  }

  if (options.strictTableNameTypes !== undefined && typeof options.strictTableNameTypes !== 'boolean') {
    throw new Error('strictTableNameTypes option must be a boolean')
  }

  if (options.strict !== undefined && typeof options.strict !== 'boolean') {
    throw new Error('strict option must be a boolean')
  }
}

// ============================================================================
// Table Definition Types
// ============================================================================

/**
 * Document shape definition using validators.
 * Maps field names to their corresponding validators.
 *
 * @remarks
 * This type constrains the document definition to only accept valid field names
 * (non-empty strings) mapped to Validator instances. System fields (_id, _creationTime)
 * are automatically added by Convex and should not be included in the definition.
 *
 * @example
 * ```typescript
 * const userDoc: DocumentDefinition = {
 *   name: v.string(),
 *   email: v.string(),
 *   age: v.optional(v.number()),
 * };
 * ```
 */
export type DocumentDefinition = Record<string, Validator>

/**
 * Configuration for a database index.
 *
 * @remarks
 * Database indexes improve query performance for reads that filter or sort by
 * the indexed fields. Compound indexes (multiple fields) should list fields
 * in order of selectivity, with the most selective field first.
 *
 * @example
 * ```typescript
 * const config: IndexConfig = {
 *   fields: ['authorId', 'createdAt'],
 *   unique: false,
 * };
 * ```
 */
export interface IndexConfig {
  /**
   * Fields to index, in order.
   * For compound indexes, list fields in order of selectivity.
   */
  readonly fields: readonly IndexFieldSpec[]
  /**
   * Whether this index enforces uniqueness across documents.
   * @default false
   */
  readonly unique?: boolean
  /**
   * Whether this is a sparse index (only indexes documents where the field exists).
   * Sparse indexes skip documents where any indexed field is undefined.
   * @default false
   */
  readonly sparse?: boolean
}

/**
 * Options for configuring index behavior.
 *
 * @example
 * ```typescript
 * table.index("by_email", ["email"], { unique: true });
 * ```
 */
export interface IndexOptions {
  /**
   * Whether this index enforces uniqueness across documents.
   * When true, attempts to insert/update documents with duplicate values will fail.
   * @default false
   */
  readonly unique?: boolean
  /**
   * Whether this is a sparse index.
   * Sparse indexes only include documents where all indexed fields have values.
   * @default false
   */
  readonly sparse?: boolean
}

/**
 * Configuration for a full-text search index.
 *
 * @remarks
 * Search indexes enable efficient text searching with relevance ranking.
 * The search field must be a string type field. Filter fields allow
 * narrowing search results by additional criteria.
 *
 * @example
 * ```typescript
 * const config: SearchIndexConfig = {
 *   searchField: 'content',
 *   filterFields: ['category', 'status'],
 * };
 * ```
 */
export interface SearchIndexConfig {
  /**
   * The field to perform full-text search on.
   * Must reference a string-type field in the document schema.
   */
  readonly searchField: string
  /**
   * Additional fields that can be used to filter search results.
   * These fields can be used to narrow down results before or after search.
   */
  readonly filterFields?: readonly string[]
}

/**
 * Configuration for a vector similarity search index.
 *
 * @remarks
 * Vector indexes enable efficient approximate nearest neighbor (ANN) searches
 * for applications like semantic search, recommendations, and similarity matching.
 * The vector field must be an array of float64 values with consistent dimensions.
 *
 * @example
 * ```typescript
 * const config: VectorIndexConfig = {
 *   vectorField: 'embedding',
 *   dimensions: 1536, // OpenAI ada-002
 *   filterFields: ['category'],
 * };
 * ```
 */
export interface VectorIndexConfig {
  /**
   * The field containing the vector embedding.
   * Must reference an array-type field (typically v.array(v.float64())).
   */
  readonly vectorField: string
  /**
   * Number of dimensions in the vector.
   * Must match your embedding model's output dimensions (e.g., 1536 for OpenAI ada-002).
   */
  readonly dimensions: number
  /**
   * Additional fields that can be used to filter search results.
   * Filtering is applied before vector similarity search for efficiency.
   */
  readonly filterFields?: readonly string[]
}

/**
 * A complete table definition with document schema and indexes.
 *
 * @remarks
 * This interface represents the complete configuration for a database table,
 * including the document schema and all index definitions. It is implemented
 * by {@link TableBuilder} and should generally be created using {@link defineTable}.
 *
 * @typeParam Doc - The document definition type mapping field names to validators
 *
 * @example
 * ```typescript
 * // TableDefinition is the return type of defineTable
 * const userTable: TableDefinition = defineTable({
 *   name: v.string(),
 *   email: v.string(),
 * }).index("by_email", ["email"]);
 * ```
 */
export interface TableDefinition<Doc extends DocumentDefinition = DocumentDefinition> {
  /**
   * Document field validators defining the schema.
   * Maps field names to their corresponding validators.
   */
  readonly document: Doc
  /**
   * Database indexes defined on this table.
   * Maps index names to their configurations.
   */
  readonly indexes: Readonly<Record<string, IndexConfig>>
  /**
   * Full-text search indexes defined on this table.
   * Maps search index names to their configurations.
   */
  readonly searchIndexes: Readonly<Record<string, SearchIndexConfig>>
  /**
   * Vector similarity search indexes defined on this table.
   * Maps vector index names to their configurations.
   */
  readonly vectorIndexes: Readonly<Record<string, VectorIndexConfig>>
}

/**
 * Infers the TypeScript document type from a table definition.
 *
 * @remarks
 * This utility type extracts the TypeScript type that documents in a table
 * must conform to, based on the validator definitions. It handles optional
 * fields, nested objects, arrays, and unions correctly.
 *
 * @typeParam T - The table definition type (result of defineTable)
 *
 * @example Basic inference
 * ```typescript
 * const userTable = defineTable({
 *   name: v.string(),
 *   age: v.number(),
 * });
 * type User = InferDocument<typeof userTable>;
 * // User = { name: string; age: number }
 * ```
 *
 * @example With optional fields
 * ```typescript
 * const profileTable = defineTable({
 *   bio: v.optional(v.string()),
 *   avatar: v.optional(v.string()),
 * });
 * type Profile = InferDocument<typeof profileTable>;
 * // Profile = { bio?: string; avatar?: string }
 * ```
 */
export type InferDocument<T extends TableDefinition> = {
  [K in keyof T['document']]: Infer<T['document'][K]>
}

// ============================================================================
// Document Validation Helpers
// ============================================================================

/**
 * Parameters for nested document validation.
 */
interface NestedValidationParams {
  /** The object to validate */
  obj: Record<string, unknown>
  /** The schema to validate against */
  schema: ValidatorShape
  /** Current path in the document (for error messages) */
  path: string
  /** Array to collect validation errors */
  errors: Array<string | ValidationError>
}

/**
 * Validates nested objects recursively against a schema.
 *
 * @param params - The validation parameters
 */
function validateNestedDocument(params: NestedValidationParams): void {
  const { obj, schema, path, errors } = params

  for (const [key, validator] of Object.entries(schema)) {
    const currentPath = path ? `${path}.${key}` : key
    const value = obj[key]

    // Check required fields
    if (value === undefined) {
      if (!validator.isOptional) {
        errors.push(`Missing required field: ${currentPath}`)
      }
      continue
    }

    // Validate the value
    try {
      validator.parse(value)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ path: currentPath, message })
    }
  }
}

// ============================================================================
// JSON Serialization Helpers
// ============================================================================

/**
 * Maps a validator description to a JSON type name.
 *
 * @param description - The validator description
 * @returns The corresponding JSON type name
 */
function mapValidatorToJsonType(description: string): string {
  const lowerDesc = description.toLowerCase()

  switch (lowerDesc) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'int64':
      return 'int64'
    case 'float64':
      return 'float64'
    case 'bytes':
      return 'bytes'
    default:
      if (lowerDesc.includes('[]')) return 'array'
      if (lowerDesc.startsWith('{')) return 'object'
      if (lowerDesc.startsWith('v.id')) return 'id'
      return description
  }
}

/**
 * Maps a validator description to a code representation.
 *
 * @param description - The validator description
 * @returns The code string representation
 */
function mapValidatorToCode(description: string): string {
  switch (description) {
    case 'string':
      return 'v.string()'
    case 'number':
      return 'v.number()'
    case 'boolean':
      return 'v.boolean()'
    case 'null':
      return 'v.null()'
    case 'int64':
      return 'v.int64()'
    case 'float64':
      return 'v.float64()'
    case 'bytes':
      return 'v.bytes()'
    default:
      if (description.includes('[]')) {
        const innerType = description.replace('[]', '')
        return `v.array(v.${innerType}())`
      }
      if (description.startsWith('v.id')) {
        return description
      }
      return `v.${description}()`
  }
}

// ============================================================================
// Deep Clone Helpers
// ============================================================================

/**
 * Creates a deep clone of an IndexConfig.
 *
 * @param config - The index config to clone
 * @returns A new IndexConfig with cloned fields
 */
function cloneIndexConfig(config: IndexConfig): IndexConfig {
  return {
    fields: [...config.fields],
    ...(config.unique !== undefined && { unique: config.unique }),
    ...(config.sparse !== undefined && { sparse: config.sparse }),
  }
}

/**
 * Creates a deep clone of a SearchIndexConfig.
 *
 * @param config - The search index config to clone
 * @returns A new SearchIndexConfig with cloned arrays
 */
function cloneSearchIndexConfig(config: SearchIndexConfig): SearchIndexConfig {
  return {
    searchField: config.searchField,
    ...(config.filterFields && { filterFields: [...config.filterFields] }),
  }
}

/**
 * Creates a deep clone of a VectorIndexConfig.
 *
 * @param config - The vector index config to clone
 * @returns A new VectorIndexConfig with cloned arrays
 */
function cloneVectorIndexConfig(config: VectorIndexConfig): VectorIndexConfig {
  return {
    vectorField: config.vectorField,
    dimensions: config.dimensions,
    ...(config.filterFields && { filterFields: [...config.filterFields] }),
  }
}

// ============================================================================
// Table Builder Implementation
// ============================================================================

/**
 * A configurable function type that also acts as a property container.
 * Used for the table config method which can be called and also accessed as properties.
 *
 * @typeParam T - The return type when called as a function
 * @internal
 */
type ConfigurableFunction<T> = ((cfg: Record<string, unknown>) => T) & Record<string, unknown>

/**
 * Internal type for mutable index storage during table building.
 * Converted to readonly when accessed through the interface.
 * @internal
 */
type MutableIndexConfig = {
  fields: IndexFieldSpec[]
  unique?: boolean
  sparse?: boolean
}

/**
 * Builder class for creating table definitions with a fluent API.
 *
 * @remarks
 * TableBuilder provides a fluent interface for defining database tables including:
 * - Document schema with field validators
 * - Database indexes for query optimization
 * - Full-text search indexes for text search
 * - Vector indexes for similarity search
 *
 * All index definition methods return `this` for method chaining. The builder
 * validates all inputs at definition time to catch errors early.
 *
 * @typeParam Doc - The document definition type mapping field names to validators.
 *   This type parameter is inferred from the document object passed to the constructor.
 *
 * @example Basic table with single index
 * ```typescript
 * const usersTable = defineTable({
 *   name: v.string(),
 *   email: v.string(),
 * }).index("by_email", ["email"]);
 * ```
 *
 * @example Table with multiple index types
 * ```typescript
 * const documentsTable = defineTable({
 *   title: v.string(),
 *   content: v.string(),
 *   embedding: v.array(v.float64()),
 *   category: v.string(),
 * })
 *   .index("by_category", ["category"])
 *   .searchIndex("search_content", {
 *     searchField: "content",
 *     filterFields: ["category"],
 *   })
 *   .vectorIndex("by_embedding", {
 *     vectorField: "embedding",
 *     dimensions: 1536,
 *   });
 * ```
 *
 * @example Compound index with options
 * ```typescript
 * const ordersTable = defineTable({
 *   userId: v.id("users"),
 *   status: v.string(),
 *   createdAt: v.number(),
 * })
 *   .index("by_user_status", ["userId", "status"])
 *   .index("by_user_created", ["userId", "createdAt"], { sparse: true });
 * ```
 *
 * @see {@link defineTable} - Factory function to create TableBuilder instances
 * @see {@link TableDefinition} - Interface implemented by TableBuilder
 */
export class TableBuilder<Doc extends DocumentDefinition> implements TableDefinition<Doc> {
  /**
   * The document schema for this table.
   * Contains field validators that define the structure of documents.
   * @readonly
   */
  readonly document: Doc

  /**
   * Database indexes defined on this table.
   * Maps index names to their configurations.
   * @readonly after schema creation
   */
  readonly indexes: Record<string, IndexConfig> = {}

  /**
   * Full-text search indexes defined on this table.
   * Maps search index names to their configurations.
   * @readonly after schema creation
   */
  readonly searchIndexes: Record<string, SearchIndexConfig> = {}

  /**
   * Vector similarity search indexes defined on this table.
   * Maps vector index names to their configurations.
   * @readonly after schema creation
   */
  readonly vectorIndexes: Record<string, VectorIndexConfig> = {}

  /**
   * Optional metadata for the table.
   * Can include description and other custom properties.
   */
  metadata?: { description?: string }

  /**
   * Internal storage for table configuration.
   * @internal
   */
  private _tableConfig?: Record<string, unknown>

  /**
   * Configuration function that can also store and expose config properties.
   *
   * @remarks
   * This hybrid function/object allows both calling patterns:
   * - `table.config({ ttl: 100 })` - Set configuration
   * - `table.config.ttl` - Access configuration value
   */
  config!: ConfigurableFunction<this>

  /**
   * Creates a new TableBuilder with the given document schema.
   *
   * @param document - Object mapping field names to validators
   *
   * @example
   * ```typescript
   * const builder = new TableBuilder({
   *   name: v.string(),
   *   email: v.string(),
   * });
   * ```
   */
  constructor(document: Doc) {
    this.document = document
    this.initializeConfig()
  }

  /**
   * Initializes the config method/property hybrid.
   * This allows config to be called as a function and accessed as properties.
   * @internal
   */
  private initializeConfig(): void {
    const self = this
    const configFn = function (cfg: Record<string, unknown>): TableBuilder<Doc> {
      self._tableConfig = cfg
      Object.assign(configFn, cfg)
      return self
    }
    this.config = configFn as ConfigurableFunction<this>
  }

  /**
   * Defines a database index on this table.
   *
   * @remarks
   * Indexes improve query performance for reads that filter or sort by the indexed fields.
   * For compound indexes (multiple fields), list fields in order of selectivity -
   * the most selective field (fewest duplicates) should come first.
   *
   * Index naming convention: Use descriptive names like `by_fieldName` or `by_field1_field2`
   * for compound indexes. Names must start with a letter and contain only alphanumeric
   * characters and underscores.
   *
   * @param name - Unique name for the index (e.g., "by_email", "by_author_date")
   * @param fields - Array of field names to index, in order of selectivity
   * @param options - Optional index configuration
   * @returns This builder for method chaining
   *
   * @throws {Error} Index name is empty, starts with underscore/number, or contains invalid characters
   * @throws {Error} Index name is reserved ("by_creation_time", "by_id")
   * @throws {Error} Index with this name already exists on this table
   * @throws {Error} Fields array is empty
   * @throws {Error} Field does not exist in document schema
   * @throws {Error} Duplicate field in index definition
   *
   * @example Single field index
   * ```typescript
   * defineTable({ email: v.string() })
   *   .index("by_email", ["email"])
   * ```
   *
   * @example Compound index
   * ```typescript
   * defineTable({
   *   authorId: v.id("users"),
   *   createdAt: v.number(),
   * }).index("by_author_date", ["authorId", "createdAt"])
   * ```
   *
   * @example Index with options
   * ```typescript
   * defineTable({ email: v.string() })
   *   .index("by_email", ["email"], { unique: true })
   * ```
   */
  index(name: string, fields: IndexFieldSpec[], options?: IndexOptions): this {
    // Validate index name
    validateIndexName(name)

    // Check for duplicate index name
    if (name in this.indexes) {
      throw new Error(`Duplicate index: "${name}" already exists on this table`)
    }

    // Validate all fields exist and are not duplicated
    validateIndexFields(fields, this.document)

    // Build index config - only allocate options properties if needed
    const indexConfig: MutableIndexConfig = { fields: [...fields] }

    // Only add optional properties if they have values (minimize object size)
    if (options?.unique !== undefined) {
      indexConfig.unique = options.unique
    }
    if (options?.sparse !== undefined) {
      indexConfig.sparse = options.sparse
    }

    // Store the config (cast is safe because MutableIndexConfig is compatible with IndexConfig)
    this.indexes[name] = indexConfig as IndexConfig
    return this
  }

  /**
   * Defines a full-text search index on this table.
   *
   * @remarks
   * Search indexes enable efficient text searching with relevance ranking.
   * The search field must be a string type field. Filter fields allow narrowing
   * results by additional criteria before or after the search.
   *
   * Search index naming convention: Use descriptive names like `search_fieldName`
   * that indicate what field is being searched.
   *
   * @param name - Unique name for the search index (e.g., "search_content")
   * @param config - Search index configuration specifying the search and filter fields
   * @returns This builder for method chaining
   *
   * @throws {Error} Name is empty or contains invalid characters
   * @throws {Error} Search index with this name already exists
   * @throws {Error} searchField is missing or empty
   * @throws {Error} searchField references a non-string type
   * @throws {Error} searchField is duplicated in filterFields
   * @throws {Error} Filter field does not exist in document schema
   *
   * @example Basic search index
   * ```typescript
   * defineTable({
   *   title: v.string(),
   *   body: v.string(),
   * }).searchIndex("search_body", {
   *   searchField: "body",
   * })
   * ```
   *
   * @example Search index with filters
   * ```typescript
   * defineTable({
   *   title: v.string(),
   *   body: v.string(),
   *   category: v.string(),
   *   status: v.string(),
   * }).searchIndex("search_body", {
   *   searchField: "body",
   *   filterFields: ["category", "status"],
   * })
   * ```
   */
  searchIndex(name: string, config: SearchIndexConfig): this {
    // Validate name and check for duplicates
    this.validateSearchIndexName(name)

    // Validate configuration and field references
    this.validateSearchIndexConfig(name, config)

    // Store the config (clone filterFields to prevent external mutation)
    this.searchIndexes[name] = config.filterFields
      ? { searchField: config.searchField, filterFields: [...config.filterFields] }
      : { searchField: config.searchField }
    return this
  }

  /**
   * Validates the search index name.
   *
   * @param name - The name to validate
   * @throws {Error} If the name is invalid
   */
  private validateSearchIndexName(name: string): void {
    if (!name || name.trim() === '') {
      throw new Error('Search index name is required and cannot be empty')
    }

    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error(
        `Invalid search index name "${name}": name must contain only alphanumeric characters and underscores`
      )
    }

    if (this.searchIndexes[name]) {
      throw new Error(
        `Duplicate search index name "${name}": a search index with this name already exists`
      )
    }
  }

  /**
   * Validates the search index configuration.
   *
   * @param name - The index name (for error messages)
   * @param config - The configuration to validate
   * @throws {Error} If the configuration is invalid
   */
  private validateSearchIndexConfig(name: string, config: SearchIndexConfig): void {
    if (!config || config.searchField === undefined || config.searchField === null) {
      throw new Error('searchField is required for search index configuration')
    }

    if (typeof config.searchField !== 'string' || config.searchField.trim() === '') {
      throw new Error('searchField must be a non-empty string')
    }

    const searchField = config.searchField
    const { validator: fieldValidator } = resolveFieldPath(searchField, this.document)

    if (!isStringValidator(fieldValidator)) {
      throw new Error(
        `searchField "${searchField}" must reference a string type field, got ${fieldValidator.describe()}`
      )
    }

    if (config.filterFields) {
      for (const filterField of config.filterFields) {
        if (filterField === searchField) {
          throw new Error(`searchField "${searchField}" cannot also be in filterFields`)
        }
        resolveFieldPath(filterField, this.document)
      }
    }
  }

  /**
   * Defines a vector similarity search index on this table.
   *
   * @remarks
   * Vector indexes enable efficient approximate nearest neighbor (ANN) searches
   * for applications like semantic search, recommendations, and similarity matching.
   * The vector field must be an array type (typically `v.array(v.float64())`).
   *
   * The `dimensions` parameter must match your embedding model's output:
   * - OpenAI text-embedding-ada-002: 1536
   * - OpenAI text-embedding-3-small: 1536
   * - OpenAI text-embedding-3-large: 3072
   * - Cohere embed-english-v3.0: 1024
   *
   * @param name - Unique name for the vector index (e.g., "by_embedding")
   * @param config - Vector index configuration including dimensions
   * @returns This builder for method chaining
   *
   * @throws {Error} Name is empty
   * @throws {Error} Vector index with this name already exists
   * @throws {Error} vectorField does not exist in document schema
   * @throws {Error} vectorField is not an array type
   * @throws {Error} dimensions is not a positive number
   * @throws {Error} Filter field does not exist in document schema
   *
   * @example Basic vector index
   * ```typescript
   * defineTable({
   *   text: v.string(),
   *   embedding: v.array(v.float64()),
   * }).vectorIndex("by_embedding", {
   *   vectorField: "embedding",
   *   dimensions: 1536,
   * })
   * ```
   *
   * @example Vector index with filters
   * ```typescript
   * defineTable({
   *   text: v.string(),
   *   embedding: v.array(v.float64()),
   *   category: v.string(),
   *   language: v.string(),
   * }).vectorIndex("by_embedding", {
   *   vectorField: "embedding",
   *   dimensions: 1536,
   *   filterFields: ["category", "language"],
   * })
   * ```
   */
  vectorIndex(name: string, config: VectorIndexConfig): this {
    // Validate name and check for duplicates
    this.validateVectorIndexName(name)

    // Validate configuration and field references
    this.validateVectorIndexConfig(config)

    // Store the config (clone filterFields to prevent external mutation)
    const storedConfig: VectorIndexConfig = {
      vectorField: config.vectorField,
      dimensions: config.dimensions,
    }
    if (config.filterFields) {
      ;(storedConfig as { filterFields: string[] }).filterFields = [...config.filterFields]
    }
    this.vectorIndexes[name] = storedConfig
    return this
  }

  /**
   * Validates the vector index name.
   *
   * @param name - The name to validate
   * @throws {Error} If the name is invalid
   */
  private validateVectorIndexName(name: string): void {
    if (!name || name.trim() === '') {
      throw new Error('Vector index name is required and cannot be empty')
    }

    if (this.vectorIndexes[name]) {
      throw new Error(`Duplicate vector index: "${name}" already exists on this table`)
    }
  }

  /**
   * Validates the vector index configuration.
   *
   * @param config - The configuration to validate
   * @throws {Error} If the configuration is invalid
   */
  private validateVectorIndexConfig(config: VectorIndexConfig): void {
    if (!(config.vectorField in this.document)) {
      throw new Error(`Field "${config.vectorField}" does not exist in the document schema`)
    }

    const vectorFieldValidator = this.document[config.vectorField]
    if (!isArrayValidator(vectorFieldValidator)) {
      throw new Error(
        `Vector field "${config.vectorField}" must be an array type, got ${vectorFieldValidator.describe()}`
      )
    }

    if (config.dimensions <= 0) {
      throw new Error(`Invalid dimensions: must be a positive number, got ${config.dimensions}`)
    }

    if (config.filterFields) {
      for (const filterField of config.filterFields) {
        if (!(filterField in this.document)) {
          throw new Error(`Filter field "${filterField}" does not exist in the document schema`)
        }
      }
    }
  }

  /**
   * Validates a document against this table's schema.
   *
   * @remarks
   * Performs runtime validation to check that:
   * - All required fields are present
   * - All field values match their validator types
   * - No extra fields are present (if strict mode is enabled)
   *
   * This is useful for validating user input before inserting into the database,
   * or for testing document structures.
   *
   * @param doc - The document to validate (unknown type for flexibility)
   * @returns Validation result containing `valid` boolean and `errors` array
   *
   * @example Basic validation
   * ```typescript
   * const usersTable = defineTable({
   *   name: v.string(),
   *   age: v.number(),
   * });
   *
   * const result = usersTable.validate({ name: "John", age: 30 });
   * console.log(result.valid); // true
   * ```
   *
   * @example Handling validation errors
   * ```typescript
   * const result = usersTable.validate({ name: "John", age: "thirty" });
   * if (!result.valid) {
   *   for (const error of result.errors) {
   *     if (typeof error === 'string') {
   *       console.error(error);
   *     } else {
   *       console.error(`${error.path}: ${error.message}`);
   *     }
   *   }
   * }
   * ```
   */
  validate(doc: unknown): ValidationResult {
    const errors: Array<string | ValidationError> = []

    // Early return for non-object values
    if (typeof doc !== 'object' || doc === null) {
      return { valid: false, errors: ['Document must be an object'] }
    }

    // Validate all fields against schema
    validateNestedDocument({
      obj: doc as Record<string, unknown>,
      schema: this.document,
      path: '',
      errors,
    })

    return { valid: errors.length === 0, errors }
  }

  /**
   * Creates a new table definition with system fields (_id, _creationTime) included.
   *
   * @remarks
   * Convex automatically adds these system fields to every document:
   * - `_id`: Unique document identifier (string format)
   * - `_creationTime`: Timestamp when document was created (milliseconds since epoch)
   *
   * This method is useful when you need type definitions that include these fields,
   * such as when working with query results.
   *
   * @returns A new TableBuilder with system fields added to the document schema
   *
   * @example
   * ```typescript
   * const usersTable = defineTable({ name: v.string() });
   * const usersWithSystem = usersTable.withSystemFields();
   *
   * // Now includes _id and _creationTime in the type
   * type UserDoc = InferDocument<typeof usersWithSystem>;
   * // UserDoc = { name: string; _id: string; _creationTime: number }
   * ```
   */
  withSystemFields(): TableBuilder<Doc & { _id: Validator; _creationTime: Validator }> {
    const systemFields = {
      _id: v.string(),
      _creationTime: v.number(),
    }

    const newDocument = {
      ...this.document,
      ...systemFields,
    } as Doc & { _id: Validator; _creationTime: Validator }

    const builder = new TableBuilder(newDocument)
    // Copy all indexes to the new builder
    Object.assign(builder.indexes, this.indexes)
    Object.assign(builder.searchIndexes, this.searchIndexes)
    Object.assign(builder.vectorIndexes, this.vectorIndexes)

    return builder
  }

  /**
   * Converts the table definition to a JSON-serializable representation.
   *
   * @remarks
   * This method is useful for:
   * - Inspecting the schema structure at runtime
   * - Sending schema information over the wire
   * - Generating documentation or debugging output
   *
   * @returns JSON representation with document fields as type objects and all indexes
   *
   * @example
   * ```typescript
   * const table = defineTable({
   *   name: v.string(),
   *   age: v.number(),
   * }).index("by_name", ["name"]);
   *
   * console.log(JSON.stringify(table.toJSON(), null, 2));
   * // {
   * //   "document": { "name": { "type": "string" }, "age": { "type": "number" } },
   * //   "indexes": { "by_name": { "fields": ["name"] } },
   * //   ...
   * // }
   * ```
   */
  toJSON(): {
    document: Record<string, { type: string }>
    indexes: Record<string, IndexConfig>
    searchIndexes: Record<string, SearchIndexConfig>
    vectorIndexes: Record<string, VectorIndexConfig>
  } {
    const documentJson: Record<string, { type: string }> = {}

    for (const [key, validator] of Object.entries(this.document)) {
      const type = mapValidatorToJsonType(validator.describe())
      documentJson[key] = { type }
    }

    return {
      document: documentJson,
      indexes: { ...this.indexes },
      searchIndexes: { ...this.searchIndexes },
      vectorIndexes: { ...this.vectorIndexes },
    }
  }

  /**
   * Exports the table definition in a format compatible with Convex.
   *
   * @remarks
   * Unlike `toJSON()`, this preserves the validator objects in the document
   * definition, making it suitable for passing to Convex APIs.
   *
   * @returns The raw table definition data with original validators
   *
   * @example
   * ```typescript
   * const table = defineTable({ name: v.string() });
   * const exported = table.export();
   * // exported.document.name is the original validator
   * ```
   */
  export(): {
    document: Doc
    indexes: Record<string, IndexConfig>
    searchIndexes: Record<string, SearchIndexConfig>
    vectorIndexes: Record<string, VectorIndexConfig>
  } {
    return {
      document: this.document,
      indexes: { ...this.indexes },
      searchIndexes: { ...this.searchIndexes },
      vectorIndexes: { ...this.vectorIndexes },
    }
  }

  /**
   * Generates a TypeScript code string representation of this table definition.
   *
   * @remarks
   * This method is useful for:
   * - Code generation tools
   * - Schema documentation
   * - Debugging and logging
   *
   * The generated code uses the `defineTable` and `v` API and can be
   * copied directly into a schema file.
   *
   * @returns TypeScript code that would recreate this table definition
   *
   * @example
   * ```typescript
   * const table = defineTable({
   *   name: v.string(),
   *   email: v.string(),
   * }).index("by_email", ["email"]);
   *
   * console.log(table.toCode());
   * // defineTable({
   * //   name: v.string(),
   * //   email: v.string(),
   * // })
   * //   .index('by_email', ["email"])
   * ```
   */
  toCode(): string {
    const lines: string[] = ['defineTable({']

    for (const [key, validator] of Object.entries(this.document)) {
      const typeStr = mapValidatorToCode(validator.describe())
      lines.push(`  ${key}: ${typeStr},`)
    }

    lines.push('})')

    // Append index definitions
    for (const [name, config] of Object.entries(this.indexes)) {
      const fieldsStr = JSON.stringify(config.fields)
      lines[lines.length - 1] += `\n  .index('${name}', ${fieldsStr})`
    }

    // Append search index definitions
    for (const [name, config] of Object.entries(this.searchIndexes)) {
      lines[lines.length - 1] += `\n  .searchIndex('${name}', ${JSON.stringify(config)})`
    }

    // Append vector index definitions
    for (const [name, config] of Object.entries(this.vectorIndexes)) {
      lines[lines.length - 1] += `\n  .vectorIndex('${name}', ${JSON.stringify(config)})`
    }

    return lines.join('\n')
  }

  /**
   * Creates a deep clone of this table definition.
   *
   * @remarks
   * The clone is fully independent - modifications to it will not affect
   * the original table definition. This is useful when you need to create
   * variations of a table definition.
   *
   * @returns A new TableBuilder with the same configuration
   *
   * @example
   * ```typescript
   * const baseTable = defineTable({
   *   name: v.string(),
   * }).index("by_name", ["name"]);
   *
   * const clonedTable = baseTable.clone();
   * clonedTable.index("another_index", ["name"]); // Doesn't affect baseTable
   * ```
   */
  clone(): TableBuilder<Doc> {
    const clonedDoc = { ...this.document }
    const cloned = new TableBuilder(clonedDoc)

    // Deep clone all index configurations
    for (const [name, config] of Object.entries(this.indexes)) {
      cloned.indexes[name] = cloneIndexConfig(config)
    }

    for (const [name, config] of Object.entries(this.searchIndexes)) {
      cloned.searchIndexes[name] = cloneSearchIndexConfig(config)
    }

    for (const [name, config] of Object.entries(this.vectorIndexes)) {
      cloned.vectorIndexes[name] = cloneVectorIndexConfig(config)
    }

    // Clone metadata if present
    if (this.metadata) {
      cloned.metadata = { ...this.metadata }
    }

    // Clone config if present
    if (this._tableConfig) {
      cloned.config(this._tableConfig)
    }

    return cloned
  }

  /**
   * Sets a description for this table.
   *
   * @remarks
   * Descriptions are stored in metadata and can be used for:
   * - Documentation generation
   * - Schema introspection
   * - Admin UI display
   *
   * @param desc - The description text
   * @returns This builder for method chaining
   *
   * @example
   * ```typescript
   * const usersTable = defineTable({
   *   name: v.string(),
   *   email: v.string(),
   * })
   *   .description("Stores user account information")
   *   .index("by_email", ["email"]);
   * ```
   */
  description(desc: string): this {
    // Initialize metadata if needed, then set description
    this.metadata = this.metadata ?? {}
    this.metadata.description = desc
    return this
  }
}

// ============================================================================
// defineTable Function
// ============================================================================

/**
 * Creates a table definition with the given document schema.
 *
 * @remarks
 * This is the primary entry point for defining database tables. The function
 * returns a {@link TableBuilder} that provides a fluent API for adding indexes,
 * search indexes, and vector indexes.
 *
 * The document schema is defined using validators from the `v` namespace.
 * Each field in the schema object maps to a validator that specifies the
 * field's type and constraints.
 *
 * **Supported validator types:**
 * - Primitives: `v.string()`, `v.number()`, `v.boolean()`, `v.null()`
 * - Extended: `v.int64()`, `v.float64()`, `v.bytes()`
 * - References: `v.id("tableName")`
 * - Complex: `v.object({...})`, `v.array(...)`, `v.union(...)`
 * - Modifiers: `v.optional(...)`, `v.literal(...)`
 *
 * @typeParam Doc - The document definition type (inferred from the document object)
 * @param document - Object mapping field names to validators
 * @returns A TableBuilder for adding indexes and other configuration
 *
 * @example Simple table
 * ```typescript
 * const users = defineTable({
 *   name: v.string(),
 *   email: v.string(),
 * });
 * ```
 *
 * @example Table with indexes
 * ```typescript
 * const messages = defineTable({
 *   channelId: v.id("channels"),
 *   body: v.string(),
 *   authorId: v.id("users"),
 * })
 *   .index("by_channel", ["channelId"])
 *   .index("by_author", ["authorId", "channelId"]);
 * ```
 *
 * @example Complex nested schema
 * ```typescript
 * const profiles = defineTable({
 *   userId: v.id("users"),
 *   settings: v.object({
 *     theme: v.union(v.literal("light"), v.literal("dark")),
 *     notifications: v.boolean(),
 *   }),
 *   tags: v.array(v.string()),
 * });
 * ```
 *
 * @see {@link TableBuilder} - The builder class returned by this function
 * @see {@link defineSchema} - Combines table definitions into a schema
 */
export function defineTable<Doc extends DocumentDefinition>(
  document: Doc
): TableBuilder<Doc> {
  return new TableBuilder(document)
}

// ============================================================================
// Schema Definition Types
// ============================================================================

/**
 * A mapping of table names to their definitions.
 */
export type SchemaDefinition = Record<string, TableDefinition>

/**
 * Configuration options for defineSchema.
 */
export interface SchemaOptions {
  /**
   * Whether to enable schema validation at runtime.
   * When true, documents are validated before writes.
   * @default true
   */
  schemaValidation?: boolean

  /**
   * Whether to enforce strict table name types in TypeScript.
   * When true, only defined table names are allowed in queries.
   * @default true
   */
  strictTableNameTypes?: boolean

  /**
   * Legacy option for backward compatibility.
   * Controls whether unknown tables are rejected.
   * @deprecated Use strictTableNameTypes instead
   */
  strict?: boolean
}

/**
 * A compiled schema containing table definitions and configuration.
 *
 * @typeParam T - The schema definition type mapping table names to definitions
 */
export interface Schema<T extends SchemaDefinition = SchemaDefinition> {
  /** Table definitions keyed by table name */
  readonly tables: T
  /** Whether strict mode is enabled (rejects unknown tables) */
  readonly strictMode: boolean
  /** Whether schema validation is enabled */
  readonly schemaValidation: boolean
  /** Whether strict table name types are enabled */
  readonly strictTableNameTypes: boolean
  /** Converts the schema to a JSON-serializable format */
  toJSON?(): unknown
}

// ============================================================================
// Schema Builder Implementation
// ============================================================================

/**
 * Builder class for compiled schemas with configuration.
 *
 * This class holds the compiled schema definition and provides
 * methods for configuration and serialization.
 *
 * @typeParam T - The schema definition type
 */
export class SchemaBuilder<T extends SchemaDefinition> implements Schema<T> {
  /** Table definitions */
  readonly tables: T

  /** Whether strict mode is enabled */
  readonly strictMode: boolean = true

  /** Whether schema validation is enabled */
  readonly schemaValidation: boolean = true

  /** Whether strict table name types are enabled */
  readonly strictTableNameTypes: boolean = true

  /**
   * Creates a new SchemaBuilder with the given tables and options.
   *
   * @param tables - The table definitions
   * @param options - Optional configuration
   */
  constructor(tables: T, options?: SchemaOptions) {
    if (options?.schemaValidation !== undefined) {
      (this as { schemaValidation: boolean }).schemaValidation = options.schemaValidation
    }
    if (options?.strictTableNameTypes !== undefined) {
      (this as { strictTableNameTypes: boolean }).strictTableNameTypes = options.strictTableNameTypes
    }
    if (options?.strict !== undefined) {
      (this as { strictMode: boolean }).strictMode = options.strict
    }

    this.tables = tables
  }

  /**
   * Configures strict mode for this schema.
   *
   * When enabled, operations on tables not defined in the schema will be rejected.
   *
   * @param enabled - Whether to enable strict mode
   * @returns This builder for method chaining
   */
  strict(enabled: boolean): this {
    (this as { strictMode: boolean }).strictMode = enabled
    return this
  }

  /**
   * Converts the schema to a JSON-serializable representation.
   *
   * @returns JSON representation of the schema
   */
  toJSON(): unknown {
    return {
      tables: this.tables,
      schemaValidation: this.schemaValidation,
      strictTableNameTypes: this.strictTableNameTypes,
      strictMode: this.strictMode,
    }
  }
}

// ============================================================================
// Schema Freezing Helpers
// ============================================================================

/**
 * Freezes a table definition and all its nested structures.
 *
 * @param tableDefinition - The table definition to freeze
 */
function freezeTableDefinition(tableDefinition: TableDefinition): void {
  Object.freeze(tableDefinition)

  if ('document' in tableDefinition) {
    Object.freeze(tableDefinition.document)
  }
  if ('indexes' in tableDefinition) {
    Object.freeze(tableDefinition.indexes)
  }
  if ('searchIndexes' in tableDefinition) {
    Object.freeze(tableDefinition.searchIndexes)
  }
  if ('vectorIndexes' in tableDefinition) {
    Object.freeze(tableDefinition.vectorIndexes)
  }
}

/**
 * Freezes all table definitions in a schema.
 *
 * @param tables - The tables object to freeze
 */
function freezeAllTables(tables: SchemaDefinition): void {
  Object.freeze(tables)
  for (const tableDefinition of Object.values(tables)) {
    freezeTableDefinition(tableDefinition)
  }
}

// ============================================================================
// defineSchema Function
// ============================================================================

/**
 * Defines the database schema for a Convex application.
 *
 * This is the main entry point for schema definition. It validates all table
 * names and definitions, then returns an immutable schema object that can be
 * used for type inference and runtime validation.
 *
 * @typeParam T - The schema definition type
 * @param tables - Object mapping table names to table definitions
 * @param options - Optional configuration for schema behavior
 * @returns A compiled, immutable schema
 * @throws {Error} If any table names or definitions are invalid
 *
 * @example
 * ```typescript
 * // convex/schema.ts
 * import { defineSchema, defineTable } from "convex.do/server";
 * import { v } from "convex.do/values";
 *
 * export default defineSchema({
 *   users: defineTable({
 *     name: v.string(),
 *     email: v.string(),
 *   }).index("by_email", ["email"]),
 *
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
 * });
 * ```
 */
export function defineSchema<T extends SchemaDefinition>(
  tables: T,
  options?: SchemaOptions
): SchemaBuilder<T> {
  // Validate options if provided
  if (options) {
    validateSchemaOptions(options)
  }

  // Validate all table names and definitions
  for (const [tableName, tableDefinition] of Object.entries(tables)) {
    validateTableName(tableName)
    validateTableDefinition(tableName, tableDefinition)
  }

  // Create the schema builder
  const schema = new SchemaBuilder(tables, options)

  // Make the schema immutable
  freezeAllTables(tables)
  Object.freeze(schema)

  return schema
}

// ============================================================================
// Data Model Type Utilities
// ============================================================================

/**
 * Generates the data model type from a schema.
 *
 * This type maps each table name to its inferred document type,
 * useful for creating strongly-typed database operations.
 *
 * @typeParam S - The schema type
 *
 * @example
 * ```typescript
 * const schema = defineSchema({ users: defineTable({ name: v.string() }) })
 * type Model = DataModel<typeof schema>
 * // Model = { users: { name: string } }
 * ```
 */
export type DataModel<S extends Schema> = {
  [TableName in keyof S['tables']]: InferDocument<S['tables'][TableName]>
}

/**
 * Gets the document type for a specific table including system fields.
 *
 * System fields (_id, _creationTime) are automatically added to every document
 * by Convex. This type includes both user-defined and system fields.
 *
 * @typeParam S - The schema type
 * @typeParam TableName - The name of the table
 *
 * @example
 * ```typescript
 * const schema = defineSchema({ users: defineTable({ name: v.string() }) })
 * type UserDoc = Doc<typeof schema, 'users'>
 * // UserDoc = { _id: string, _creationTime: number, name: string }
 * ```
 */
export type Doc<S extends Schema, TableName extends keyof S['tables']> =
  InferDocument<S['tables'][TableName]> & {
    /** Unique identifier for this document */
    _id: string & { __tableName: TableName }
    /** Timestamp when this document was created (milliseconds since epoch) */
    _creationTime: number
  }
