/**
 * Schema definition system
 *
 * Provides defineSchema and defineTable for defining the database schema.
 */

import type { Validator, Infer } from '../values'

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
  fields: string[]
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
  index(name: string, fields: Array<keyof Doc & string>): this {
    this.indexes[name] = { fields: fields as string[] }
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
    this.searchIndexes[name] = config
    return this
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
    this.vectorIndexes[name] = config
    return this
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
 * A compiled schema.
 */
export interface Schema<T extends SchemaDefinition = SchemaDefinition> {
  /** Table definitions */
  readonly tables: T
  /** Whether to enforce strict mode (reject unknown tables) */
  readonly strictMode: boolean
}

/**
 * Schema builder with configuration options.
 */
export class SchemaBuilder<T extends SchemaDefinition> implements Schema<T> {
  readonly tables: T
  strictMode = true

  constructor(tables: T) {
    this.tables = tables
  }

  /**
   * Allow documents in tables not defined in the schema.
   * By default, strict mode is enabled and unknown tables are rejected.
   */
  strict(enabled: boolean): this {
    this.strictMode = enabled
    return this
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
  options?: { strict?: boolean }
): SchemaBuilder<T> {
  const schema = new SchemaBuilder(tables)
  if (options?.strict !== undefined) {
    schema.strict(options.strict)
  }
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
