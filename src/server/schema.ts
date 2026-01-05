/**
 * Schema definition system
 *
 * Provides defineSchema and defineTable for defining the database schema.
 */

import type { Validator, Infer } from '../values'
import { v } from '../values'

/**
 * Validation error with path information.
 */
export interface ValidationError {
  path: string
  message: string
}

/**
 * Validation result for document validation.
 */
export interface ValidationResult {
  valid: boolean
  errors: Array<string | ValidationError>
}

// ============================================================================
// Index Validation Helpers
// ============================================================================

/** Reserved index names that cannot be used */
const RESERVED_INDEX_NAMES = new Set(['by_creation_time', 'by_id'])

/** Pattern for valid index names: must start with letter, contain only letters, numbers, underscores */
const VALID_INDEX_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/

/** Pattern to detect array element access like tags[0] */
const ARRAY_ELEMENT_ACCESS_PATTERN = /\[\d+\]/

/**
 * Validates an index name.
 * @throws Error if the name is invalid
 */
function validateIndexName(name: string): void {
  // Reject empty string
  if (name === '') {
    throw new Error('Invalid index name: name cannot be empty')
  }

  // Reject whitespace-only names
  if (name.trim() === '') {
    throw new Error('Invalid index name: name cannot be whitespace-only')
  }

  // Reject names starting with underscore
  if (name.startsWith('_')) {
    throw new Error(`Index name "${name}" cannot start with an underscore`)
  }

  // Reject names starting with numbers
  if (/^\d/.test(name)) {
    throw new Error(`Index name "${name}" cannot start with a number`)
  }

  // Reject names with special characters (hyphens, dots, spaces, @, #, $, !)
  if (!VALID_INDEX_NAME_PATTERN.test(name)) {
    throw new Error(`Index name "${name}" contains invalid characters. Only letters, numbers, and underscores are allowed`)
  }

  // Reject reserved names
  if (RESERVED_INDEX_NAMES.has(name)) {
    throw new Error(`Index name "${name}" is reserved and cannot be used`)
  }
}

/**
 * Validates a field path exists in the document schema.
 * Supports dot notation for nested objects.
 * @throws Error if the field path is invalid or does not exist
 */
function validateFieldPath(fieldPath: string, documentSchema: Record<string, Validator>): void {
  // Reject empty string
  if (fieldPath === '') {
    throw new Error('Index field name cannot be empty')
  }

  // Reject whitespace-only
  if (fieldPath.trim() === '') {
    throw new Error('Index field name cannot be whitespace-only')
  }

  // Reject array element access (e.g., tags[0])
  if (ARRAY_ELEMENT_ACCESS_PATTERN.test(fieldPath)) {
    throw new Error(`Array element access is not supported in index fields: "${fieldPath}"`)
  }

  // Split the path by dots for nested fields
  const pathParts = fieldPath.split('.')
  let currentSchema: Record<string, Validator> | null = documentSchema

  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i]

    if (!currentSchema || !(part in currentSchema)) {
      const fullPath = pathParts.slice(0, i + 1).join('.')
      throw new Error(`Field "${fullPath}" does not exist in document schema`)
    }

    const validator: Validator | undefined = currentSchema[part]

    // If this is not the last part, we need to check if it's an object
    if (i < pathParts.length - 1) {
      // Check if the validator is an object validator by looking for shape property
      // We need to access the internal shape of ObjectValidator
      const validatorAny = validator as unknown as { shape?: Record<string, Validator> }

      // Also handle optional fields that wrap an object
      let innerShape: Record<string, Validator> | undefined = validatorAny.shape

      // Check if it's an optional wrapping an object
      if (!innerShape && validator && 'isOptional' in validator && validator.isOptional) {
        const optionalInner: Validator | undefined = (validator as unknown as { inner?: Validator }).inner
        if (optionalInner) {
          innerShape = (optionalInner as unknown as { shape?: Record<string, Validator> }).shape
        }
      }

      if (!innerShape) {
        throw new Error(`Cannot access nested field "${pathParts[i + 1]}" on non-object field "${pathParts.slice(0, i + 1).join('.')}"`)
      }

      currentSchema = innerShape
    }
  }
}

/**
 * Validates an array of index fields.
 * @throws Error if any field is invalid
 */
function validateIndexFields(
  fields: Array<string | { field: string; order: 'asc' | 'desc' }>,
  documentSchema: Record<string, Validator>
): void {
  // Reject empty fields array
  if (fields.length === 0) {
    throw new Error('Index must have at least one field')
  }

  // Check for duplicates and validate each field
  const seenFields = new Set<string>()
  for (const field of fields) {
    // Extract field name from string or object format
    const fieldName = typeof field === 'string' ? field : field.field

    if (seenFields.has(fieldName)) {
      throw new Error(`Duplicate field "${fieldName}" in index`)
    }
    seenFields.add(fieldName)

    // Validate the field exists
    validateFieldPath(fieldName, documentSchema)
  }
}

// ============================================================================
// Table Definition Types
// ============================================================================

/**
 * Document shape definition using validators.
 */
export type DocumentDefinition = Record<string, Validator>

/**
 * Index configuration.
 */
export interface IndexConfig {
  /** Fields to index, in order */
  fields: Array<string | { field: string; order: 'asc' | 'desc' }>
  /** Whether this index enforces uniqueness */
  unique?: boolean
  /** Whether this is a sparse index (only indexes documents where field exists) */
  sparse?: boolean
}

/**
 * Index options for advanced configuration.
 */
export interface IndexOptions {
  /** Whether this index enforces uniqueness */
  unique?: boolean
  /** Whether this is a sparse index */
  sparse?: boolean
}

/**
 * Search index configuration for full-text search.
 */
export interface SearchIndexConfig {
  /** The field to search */
  searchField: string
  /** Additional fields to filter by */
  filterFields?: string[]
}

/**
 * Vector index configuration for similarity search.
 */
export interface VectorIndexConfig {
  /** The field containing the vector */
  vectorField: string
  /** Number of dimensions in the vector */
  dimensions: number
  /** Additional fields to filter by */
  filterFields?: string[]
}

/**
 * A table definition with document schema and indexes.
 */
export interface TableDefinition<Doc extends DocumentDefinition = DocumentDefinition> {
  /** Document field validators */
  readonly document: Doc
  /** Indexes defined on this table */
  readonly indexes: Record<string, IndexConfig>
  /** Search indexes defined on this table */
  readonly searchIndexes: Record<string, SearchIndexConfig>
  /** Vector indexes defined on this table */
  readonly vectorIndexes: Record<string, VectorIndexConfig>
}

/**
 * Infer the document type from a table definition.
 */
export type InferDocument<T extends TableDefinition> = {
  [K in keyof T['document']]: Infer<T['document'][K]>
}

// ============================================================================
// Table Builder
// ============================================================================

/**
 * Builder for table definitions with fluent index API.
 */
export class TableBuilder<Doc extends DocumentDefinition> implements TableDefinition<Doc> {
  readonly document: Doc
  readonly indexes: Record<string, IndexConfig> = {}
  readonly searchIndexes: Record<string, SearchIndexConfig> = {}
  readonly vectorIndexes: Record<string, VectorIndexConfig> = {}

  constructor(document: Doc) {
    this.document = document
    this.initConfig()
  }

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
  index(
    name: string,
    fields: Array<string | { field: string; order: 'asc' | 'desc' }>,
    options?: IndexOptions
  ): this {
    // Validate index name
    validateIndexName(name)

    // Check for duplicate index name
    if (name in this.indexes) {
      throw new Error(`Duplicate index: "${name}" already exists on this table`)
    }

    // Validate fields array
    validateIndexFields(fields, this.document)

    // Build the index config
    const indexConfig: IndexConfig = {
      fields: fields,
    }

    // Add options if provided
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
  searchIndex(name: string, config: SearchIndexConfig): this {
    // Validate index name
    if (!name || name.trim() === '') {
      throw new Error('Search index name is required and cannot be empty')
    }

    // Validate index name format (alphanumeric and underscore only)
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error(`Invalid search index name "${name}": name must contain only alphanumeric characters and underscores`)
    }

    // Check for duplicate search index names
    if (this.searchIndexes[name]) {
      throw new Error(`Duplicate search index name "${name}": a search index with this name already exists`)
    }

    // Validate searchField is present
    if (!config || config.searchField === undefined || config.searchField === null) {
      throw new Error('searchField is required for search index configuration')
    }

    // Validate searchField is a non-empty string
    if (typeof config.searchField !== 'string' || config.searchField.trim() === '') {
      throw new Error('searchField must be a non-empty string')
    }

    const searchField = config.searchField

    // Validate searchField exists in schema and get the validator
    const fieldValidator = this.resolveFieldPathForSearch(searchField)

    // Check if the field is a string type
    if (!this.isStringType(fieldValidator)) {
      throw new Error(`searchField "${searchField}" must reference a string type field, got ${fieldValidator.describe()}`)
    }

    // Validate filterFields if present
    if (config.filterFields) {
      for (const filterField of config.filterFields) {
        // Check if filterField is the same as searchField
        if (filterField === searchField) {
          throw new Error(`searchField "${searchField}" cannot also be in filterFields`)
        }

        // Validate filterField exists in schema
        this.resolveFieldPathForSearch(filterField)
      }
    }

    this.searchIndexes[name] = config
    return this
  }

  /**
   * Resolve a field path (including dot notation for nested fields) to a validator.
   * @throws Error if the path doesn't exist or goes through non-object types
   */
  private resolveFieldPathForSearch(fieldPath: string): Validator {
    const pathParts = fieldPath.split('.')
    let currentSchema: Record<string, Validator> | null = this.document

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]

      if (!currentSchema || !(part in currentSchema)) {
        const fullPath = pathParts.slice(0, i + 1).join('.')
        throw new Error(`Field "${fullPath}" does not exist in the document schema`)
      }

      const validator: Validator | undefined = currentSchema[part]

      // If this is the last part, return the validator
      if (i === pathParts.length - 1) {
        return validator
      }

      // For intermediate parts, we need to check if it's an object and get its shape
      const validatorAny = validator as unknown as { shape?: Record<string, Validator> }
      let innerShape: Record<string, Validator> | undefined = validatorAny.shape

      // Check if it's an optional wrapping an object
      if (!innerShape && validator && 'isOptional' in validator && validator.isOptional) {
        const optionalInner: Validator | undefined = (validator as unknown as { inner?: Validator }).inner
        if (optionalInner) {
          innerShape = (optionalInner as unknown as { shape?: Record<string, Validator> }).shape
        }
      }

      if (!innerShape) {
        throw new Error(`Cannot access nested property "${pathParts.slice(i + 1).join('.')}" on non-object field "${pathParts.slice(0, i + 1).join('.')}"`)
      }

      currentSchema = innerShape
    }

    // Should never get here
    throw new Error(`Field "${fieldPath}" does not exist in the document schema`)
  }

  /**
   * Check if a validator represents a string type (including optional<string>).
   */
  private isStringType(validator: Validator): boolean {
    const desc = validator.describe()

    // Direct string type
    if (desc === 'string') {
      return true
    }

    // Optional string type: "string | undefined"
    if (desc === 'string | undefined') {
      return true
    }

    return false
  }

  /**
   * Check if a validator represents an array type (including optional<array>).
   */
  private isArrayType(validator: Validator): boolean {
    const desc = validator.describe()

    // Check for array notation: type[]
    if (desc.includes('[]')) {
      return true
    }

    return false
  }

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
  vectorIndex(name: string, config: VectorIndexConfig): this {
    // Validate index name
    if (!name || name.trim() === '') {
      throw new Error('Vector index name is required and cannot be empty')
    }

    // Check for duplicate vector index names
    if (this.vectorIndexes[name]) {
      throw new Error(`Duplicate vector index: "${name}" already exists on this table`)
    }

    // Validate vectorField exists in schema
    if (!(config.vectorField in this.document)) {
      throw new Error(`Field "${config.vectorField}" does not exist in the document schema`)
    }

    // Validate vectorField is an array type
    const vectorFieldValidator = this.document[config.vectorField]
    if (!this.isArrayType(vectorFieldValidator)) {
      throw new Error(`Vector field "${config.vectorField}" must be an array type, got ${vectorFieldValidator.describe()}`)
    }

    // Validate dimensions is positive
    if (config.dimensions <= 0) {
      throw new Error(`Invalid dimensions: must be a positive number, got ${config.dimensions}`)
    }

    // Validate filterFields if present
    if (config.filterFields) {
      for (const filterField of config.filterFields) {
        if (!(filterField in this.document)) {
          throw new Error(`Filter field "${filterField}" does not exist in the document schema`)
        }
      }
    }

    this.vectorIndexes[name] = config
    return this
  }

  /**
   * Validate a document against the table schema.
   */
  validate(doc: unknown): ValidationResult {
    const errors: Array<string | ValidationError> = []

    if (typeof doc !== 'object' || doc === null) {
      return {
        valid: false,
        errors: ['Document must be an object'],
      }
    }

    const docObj = doc as Record<string, unknown>

    // Helper function to validate nested objects
    const validateNested = (
      obj: Record<string, unknown>,
      schema: Record<string, Validator>,
      path: string = ''
    ): void => {
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

        // Try to parse the value
        try {
          validator.parse(value)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          errors.push({ path: currentPath, message })
        }
      }
    }

    validateNested(docObj, this.document)

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Return table definition with system fields included.
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
   * Convert table definition to JSON representation.
   */
  toJSON(): {
    document: Record<string, { type: string }>
    indexes: Record<string, IndexConfig>
    searchIndexes: Record<string, SearchIndexConfig>
    vectorIndexes: Record<string, VectorIndexConfig>
  } {
    const documentJson: Record<string, { type: string }> = {}

    for (const [key, validator] of Object.entries(this.document)) {
      const desc = validator.describe().toLowerCase()
      let type = 'unknown'

      if (desc === 'string') type = 'string'
      else if (desc === 'number') type = 'number'
      else if (desc === 'boolean') type = 'boolean'
      else if (desc === 'null') type = 'null'
      else if (desc === 'int64') type = 'int64'
      else if (desc === 'float64') type = 'float64'
      else if (desc === 'bytes') type = 'bytes'
      else if (desc.includes('[]')) type = 'array'
      else if (desc.startsWith('{')) type = 'object'
      else if (desc.startsWith('v.id')) type = 'id'
      else type = desc

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
   * Export schema definition compatible with Convex.
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
   * Generate code string representation.
   */
  toCode(): string {
    const lines: string[] = ['defineTable({']

    for (const [key, validator] of Object.entries(this.document)) {
      const desc = validator.describe()
      let typeStr = 'v.unknown()'

      if (desc === 'string') typeStr = 'v.string()'
      else if (desc === 'number') typeStr = 'v.number()'
      else if (desc === 'boolean') typeStr = 'v.boolean()'
      else if (desc === 'null') typeStr = 'v.null()'
      else if (desc === 'int64') typeStr = 'v.int64()'
      else if (desc === 'float64') typeStr = 'v.float64()'
      else if (desc === 'bytes') typeStr = 'v.bytes()'
      else if (desc.includes('[]')) {
        const innerType = desc.replace('[]', '')
        typeStr = `v.array(v.${innerType}())`
      }
      else if (desc.startsWith('v.id')) typeStr = desc
      else typeStr = `v.${desc}()`

      lines.push(`  ${key}: ${typeStr},`)
    }

    lines.push('})')

    // Add indexes
    for (const [name, config] of Object.entries(this.indexes)) {
      const fieldsStr = JSON.stringify(config.fields)
      lines[lines.length - 1] = lines[lines.length - 1] + `\n  .index('${name}', ${fieldsStr})`
    }

    // Add search indexes
    for (const [name, config] of Object.entries(this.searchIndexes)) {
      lines[lines.length - 1] = lines[lines.length - 1] + `\n  .searchIndex('${name}', ${JSON.stringify(config)})`
    }

    // Add vector indexes
    for (const [name, config] of Object.entries(this.vectorIndexes)) {
      lines[lines.length - 1] = lines[lines.length - 1] + `\n  .vectorIndex('${name}', ${JSON.stringify(config)})`
    }

    return lines.join('\n')
  }

  /**
   * Clone this table definition.
   */
  clone(): TableBuilder<Doc> {
    // Create a shallow copy of the document (validators are immutable)
    const clonedDoc = { ...this.document }
    const cloned = new TableBuilder(clonedDoc)

    // Deep copy indexes
    for (const [name, config] of Object.entries(this.indexes)) {
      cloned.indexes[name] = { fields: [...config.fields] }
    }

    // Deep copy search indexes
    for (const [name, config] of Object.entries(this.searchIndexes)) {
      cloned.searchIndexes[name] = {
        searchField: config.searchField,
        filterFields: config.filterFields ? [...config.filterFields] : undefined,
      }
    }

    // Deep copy vector indexes
    for (const [name, config] of Object.entries(this.vectorIndexes)) {
      cloned.vectorIndexes[name] = {
        vectorField: config.vectorField,
        dimensions: config.dimensions,
        filterFields: config.filterFields ? [...config.filterFields] : undefined,
      }
    }

    // Copy metadata if present
    if (this.metadata) {
      cloned.metadata = { ...this.metadata }
    }

    // Copy config if present
    if (this._tableConfig) {
      cloned.config(this._tableConfig)
    }

    return cloned
  }

  // Internal storage for metadata
  metadata?: { description?: string }

  // Internal storage for table config
  private _tableConfig?: Record<string, unknown>

  // Callable config that also acts as a property getter
  // This is a bit of a hack to satisfy the test's expectation of both
  // `table.config({...})` and `table.config.ttl`
  config!: ((cfg: Record<string, unknown>) => this) & Record<string, unknown>

  /**
   * Set table description.
   */
  description(desc: string): this {
    this.metadata = this.metadata || {}
    this.metadata.description = desc
    return this
  }

  /**
   * Initialize config on construction.
   */
  private initConfig(): void {
    const self = this
    const configFn = function (cfg: Record<string, unknown>): TableBuilder<Doc> {
      self._tableConfig = cfg
      // Copy config properties to the function itself
      Object.assign(configFn, cfg)
      return self
    }
    this.config = configFn as ((cfg: Record<string, unknown>) => this) & Record<string, unknown>
  }
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
export function defineTable<Doc extends DocumentDefinition>(
  document: Doc
): TableBuilder<Doc> {
  return new TableBuilder(document)
}

// ============================================================================
// Schema Definition
// ============================================================================

/**
 * Schema definition mapping table names to table definitions.
 */
export type SchemaDefinition = Record<string, TableDefinition>

/**
 * Schema options for defineSchema.
 */
export interface SchemaOptions {
  /** Whether to enable schema validation (default: true) */
  schemaValidation?: boolean
  /** Whether to enforce strict table name types (default: true) */
  strictTableNameTypes?: boolean
  /** Legacy option for backward compatibility */
  strict?: boolean
}

/**
 * A compiled schema.
 */
export interface Schema<T extends SchemaDefinition = SchemaDefinition> {
  /** Table definitions */
  readonly tables: T
  /** Whether to enforce strict mode (reject unknown tables) */
  readonly strictMode: boolean
  /** Whether schema validation is enabled */
  readonly schemaValidation: boolean
  /** Whether strict table name types are enabled */
  readonly strictTableNameTypes: boolean
  /** Convert schema to JSON representation */
  toJSON?(): unknown
}

/**
 * Schema builder with configuration options.
 */
export class SchemaBuilder<T extends SchemaDefinition> implements Schema<T> {
  readonly tables: T
  readonly strictMode: boolean = true
  readonly schemaValidation: boolean = true
  readonly strictTableNameTypes: boolean = true

  constructor(tables: T, options?: SchemaOptions) {
    // Handle options
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
   * Allow documents in tables not defined in the schema.
   * By default, strict mode is enabled and unknown tables are rejected.
   */
  strict(enabled: boolean): this {
    (this as { strictMode: boolean }).strictMode = enabled
    return this
  }

  /**
   * Convert schema to JSON representation.
   */
  toJSON(): unknown {
    return {
      tables: this.tables,
      schemaValidation: this.schemaValidation,
      strictTableNameTypes: this.strictTableNameTypes,
      strictMode: this.strictMode
    }
  }
}

/**
 * Valid table name pattern: starts with letter, contains only alphanumeric and underscore
 * (but not starting with underscore)
 */
const VALID_TABLE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/

/**
 * Validate table name
 */
function validateTableName(name: string): void {
  if (name === '') {
    throw new Error('Table name cannot be empty')
  }
  if (name.startsWith('_')) {
    throw new Error(`Table name "${name}" cannot start with underscore (reserved for system tables)`)
  }
  if (/^[0-9]/.test(name)) {
    throw new Error(`Table name "${name}" cannot start with a number`)
  }
  if (!VALID_TABLE_NAME_PATTERN.test(name)) {
    throw new Error(`Table name "${name}" contains invalid characters (only letters, numbers, and underscores allowed)`)
  }
}

/**
 * Validate table definition
 */
function validateTableDefinition(name: string, definition: unknown): void {
  if (definition === null) {
    throw new Error(`Table "${name}" has null definition. Use defineTable() to create a valid table definition.`)
  }
  if (definition === undefined) {
    throw new Error(`Table "${name}" has undefined definition. Use defineTable() to create a valid table definition.`)
  }
  if (typeof definition === 'string') {
    throw new Error(`Table "${name}" has string definition. Use defineTable() to create a valid table definition.`)
  }
  if (typeof definition === 'number' || typeof definition === 'boolean') {
    throw new Error(`Table "${name}" has primitive definition. Use defineTable() to create a valid table definition.`)
  }
  if (Array.isArray(definition)) {
    throw new Error(`Table "${name}" has array definition. Use defineTable() to create a valid table definition.`)
  }
  if (!(definition instanceof TableBuilder)) {
    throw new Error(`Table "${name}" has invalid definition. Use defineTable() to create a valid table definition.`)
  }
}

/**
 * Validate schema options
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
export function defineSchema<T extends SchemaDefinition>(
  tables: T,
  options?: SchemaOptions
): SchemaBuilder<T> {
  // Validate options if provided
  if (options) {
    validateSchemaOptions(options)
  }

  // Validate each table name and definition
  for (const [tableName, tableDefinition] of Object.entries(tables)) {
    validateTableName(tableName)
    validateTableDefinition(tableName, tableDefinition)
  }

  const schema = new SchemaBuilder(tables, options)

  // Freeze the tables object and schema to make them immutable
  Object.freeze(tables)
  for (const tableDefinition of Object.values(tables)) {
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
  Object.freeze(schema)

  return schema
}

// ============================================================================
// Data Model Types
// ============================================================================

/**
 * Generate the data model type from a schema.
 */
export type DataModel<S extends Schema> = {
  [TableName in keyof S['tables']]: InferDocument<S['tables'][TableName]>
}

/**
 * Get the document type for a table.
 */
export type Doc<S extends Schema, TableName extends keyof S['tables']> =
  InferDocument<S['tables'][TableName]> & {
    _id: string & { __tableName: TableName }
    _creationTime: number
  }
