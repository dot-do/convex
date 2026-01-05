/**
 * Schema Definition System
 *
 * Provides `defineSchema` and `defineTable` for defining the database schema.
 * This module enables type-safe schema definitions with support for:
 * - Document field validation using validators
 * - Database indexes for query optimization
 * - Full-text search indexes
 * - Vector indexes for similarity search
 *
 * @example
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
 * @module server/schema
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
 */
export type DocumentDefinition = Record<string, Validator>

/**
 * Configuration for a database index.
 */
export interface IndexConfig {
  /** Fields to index, in order. Compound indexes list multiple fields. */
  fields: IndexFieldSpec[]
  /** Whether this index enforces uniqueness across documents */
  unique?: boolean
  /** Whether this is a sparse index (only indexes documents where the field exists) */
  sparse?: boolean
}

/**
 * Options for configuring index behavior.
 */
export interface IndexOptions {
  /** Whether this index enforces uniqueness across documents */
  unique?: boolean
  /** Whether this is a sparse index (only indexes documents where the field exists) */
  sparse?: boolean
}

/**
 * Configuration for a full-text search index.
 */
export interface SearchIndexConfig {
  /** The field to perform full-text search on */
  searchField: string
  /** Additional fields that can be used to filter search results */
  filterFields?: string[]
}

/**
 * Configuration for a vector similarity search index.
 */
export interface VectorIndexConfig {
  /** The field containing the vector embedding */
  vectorField: string
  /** Number of dimensions in the vector (must match your embedding model) */
  dimensions: number
  /** Additional fields that can be used to filter search results */
  filterFields?: string[]
}

/**
 * A complete table definition with document schema and indexes.
 *
 * @typeParam Doc - The document definition type
 */
export interface TableDefinition<Doc extends DocumentDefinition = DocumentDefinition> {
  /** Document field validators defining the schema */
  readonly document: Doc
  /** Database indexes defined on this table */
  readonly indexes: Record<string, IndexConfig>
  /** Full-text search indexes defined on this table */
  readonly searchIndexes: Record<string, SearchIndexConfig>
  /** Vector similarity search indexes defined on this table */
  readonly vectorIndexes: Record<string, VectorIndexConfig>
}

/**
 * Infers the TypeScript document type from a table definition.
 *
 * @typeParam T - The table definition type
 *
 * @example
 * ```typescript
 * const userTable = defineTable({ name: v.string(), age: v.number() })
 * type User = InferDocument<typeof userTable>
 * // User = { name: string; age: number }
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
 */
type ConfigurableFunction<T> = ((cfg: Record<string, unknown>) => T) & Record<string, unknown>

/**
 * Builder class for creating table definitions with a fluent API.
 *
 * Provides methods for defining indexes, search indexes, and vector indexes
 * on a table, all with method chaining support.
 *
 * @typeParam Doc - The document definition type for this table
 *
 * @example
 * ```typescript
 * const usersTable = defineTable({
 *   name: v.string(),
 *   email: v.string(),
 * })
 *   .index("by_email", ["email"])
 *   .searchIndex("search_name", { searchField: "name" })
 * ```
 */
export class TableBuilder<Doc extends DocumentDefinition> implements TableDefinition<Doc> {
  /** The document schema for this table */
  readonly document: Doc

  /** Database indexes defined on this table */
  readonly indexes: Record<string, IndexConfig> = {}

  /** Full-text search indexes defined on this table */
  readonly searchIndexes: Record<string, SearchIndexConfig> = {}

  /** Vector similarity search indexes defined on this table */
  readonly vectorIndexes: Record<string, VectorIndexConfig> = {}

  /** Optional metadata for the table (e.g., description) */
  metadata?: { description?: string }

  /** Internal storage for table configuration */
  private _tableConfig?: Record<string, unknown>

  /**
   * Configuration function that can also store and expose config properties.
   * Allows both `table.config({ ttl: 100 })` and `table.config.ttl` access patterns.
   */
  config!: ConfigurableFunction<this>

  /**
   * Creates a new TableBuilder with the given document schema.
   *
   * @param document - The document field validators
   */
  constructor(document: Doc) {
    this.document = document
    this.initializeConfig()
  }

  /**
   * Initializes the config method/property hybrid.
   * This allows config to be called as a function and accessed as properties.
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
   * Indexes improve query performance for reads that filter or sort by the indexed fields.
   * Compound indexes (multiple fields) should list fields in order of selectivity.
   *
   * @param name - Unique name for the index
   * @param fields - Array of field names to index, in order
   * @param options - Optional index configuration (unique, sparse)
   * @returns This builder for method chaining
   * @throws {Error} If the index name is invalid, already exists, or fields are invalid
   *
   * @example
   * ```typescript
   * defineTable({ email: v.string(), createdAt: v.number() })
   *   .index("by_email", ["email"])
   *   .index("by_created", ["createdAt"], { unique: false })
   * ```
   */
  index(name: string, fields: IndexFieldSpec[], options?: IndexOptions): this {
    validateIndexName(name)

    if (name in this.indexes) {
      throw new Error(`Duplicate index: "${name}" already exists on this table`)
    }

    validateIndexFields(fields, this.document)

    const indexConfig: IndexConfig = { fields }

    if (options?.unique !== undefined) {
      indexConfig.unique = options.unique
    }
    if (options?.sparse !== undefined) {
      indexConfig.sparse = options.sparse
    }

    this.indexes[name] = indexConfig
    return this
  }

  /**
   * Defines a full-text search index on this table.
   *
   * Search indexes enable efficient text searching with relevance ranking.
   * The search field must be a string type, and filter fields allow narrowing results.
   *
   * @param name - Unique name for the search index
   * @param config - Search index configuration
   * @returns This builder for method chaining
   * @throws {Error} If the name is invalid, already exists, or fields are invalid
   *
   * @example
   * ```typescript
   * defineTable({
   *   title: v.string(),
   *   body: v.string(),
   *   category: v.string(),
   * }).searchIndex("search_body", {
   *   searchField: "body",
   *   filterFields: ["category"],
   * })
   * ```
   */
  searchIndex(name: string, config: SearchIndexConfig): this {
    this.validateSearchIndexName(name)
    this.validateSearchIndexConfig(name, config)

    this.searchIndexes[name] = config
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
   * Vector indexes enable efficient approximate nearest neighbor (ANN) searches
   * for applications like semantic search, recommendations, and similarity matching.
   *
   * @param name - Unique name for the vector index
   * @param config - Vector index configuration including dimensions
   * @returns This builder for method chaining
   * @throws {Error} If the name is invalid, already exists, or fields are invalid
   *
   * @example
   * ```typescript
   * defineTable({
   *   text: v.string(),
   *   embedding: v.array(v.float64()),
   *   category: v.string(),
   * }).vectorIndex("by_embedding", {
   *   vectorField: "embedding",
   *   dimensions: 1536,
   *   filterFields: ["category"],
   * })
   * ```
   */
  vectorIndex(name: string, config: VectorIndexConfig): this {
    this.validateVectorIndexName(name)
    this.validateVectorIndexConfig(config)

    this.vectorIndexes[name] = config
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
   * Checks that all required fields are present and all values match their validators.
   *
   * @param doc - The document to validate
   * @returns Validation result with any errors found
   *
   * @example
   * ```typescript
   * const result = usersTable.validate({ name: "John", age: "thirty" })
   * if (!result.valid) {
   *   console.error(result.errors)
   * }
   * ```
   */
  validate(doc: unknown): ValidationResult {
    const errors: Array<string | ValidationError> = []

    if (typeof doc !== 'object' || doc === null) {
      return { valid: false, errors: ['Document must be an object'] }
    }

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
   * System fields are automatically added by Convex to every document.
   * Use this when you need type definitions that include these fields.
   *
   * @returns A new TableBuilder with system fields added to the document schema
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
    Object.assign(builder.indexes, this.indexes)
    Object.assign(builder.searchIndexes, this.searchIndexes)
    Object.assign(builder.vectorIndexes, this.vectorIndexes)

    return builder
  }

  /**
   * Converts the table definition to a JSON-serializable representation.
   *
   * Useful for inspecting the schema or sending it over the wire.
   *
   * @returns JSON representation of the table definition
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
   * @returns The raw table definition data
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
   * Generates a code string representation of this table definition.
   *
   * Useful for code generation or displaying the schema in a human-readable format.
   *
   * @returns TypeScript code that would recreate this table definition
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
   * The clone is independent and modifications to it won't affect the original.
   *
   * @returns A new TableBuilder with the same configuration
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
   * Descriptions are stored in metadata and can be useful for documentation.
   *
   * @param desc - The description text
   * @returns This builder for method chaining
   */
  description(desc: string): this {
    this.metadata = this.metadata || {}
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
 * This is the primary way to define a table's structure including field types,
 * indexes, and search capabilities. The returned builder supports method chaining
 * for adding indexes.
 *
 * @typeParam Doc - The document definition type
 * @param document - Object mapping field names to validators
 * @returns A TableBuilder for further configuration
 *
 * @example
 * ```typescript
 * // Simple table
 * const users = defineTable({
 *   name: v.string(),
 *   email: v.string(),
 * })
 *
 * // Table with indexes
 * const messages = defineTable({
 *   channel: v.id("channels"),
 *   body: v.string(),
 *   author: v.id("users"),
 * })
 *   .index("by_channel", ["channel"])
 *   .index("by_author", ["author", "channel"])
 * ```
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
