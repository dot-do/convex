/**
 * Query Translator for ConvexDatabase
 *
 * Translates Convex-style queries into SQLite-compatible SQL statements.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Filter operators supported by Convex queries
 */
export type FilterOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'

/**
 * A single query filter
 */
export interface QueryFilter {
  field: string
  op: FilterOperator
  value: unknown
}

/**
 * Logical filter for combining conditions with AND/OR
 */
export interface LogicalFilter {
  type: 'and' | 'or'
  filters: (QueryFilter | LogicalFilter)[]
}

/**
 * Order specification for queries
 */
export interface OrderSpec {
  field: string
  direction: 'asc' | 'desc'
}

/**
 * Index specification for optimized queries
 */
export interface IndexSpec {
  name: string
  fields: string[]
}

/**
 * Index-based query definition
 */
export interface IndexQueryDefinition {
  name: string
  fields: string[]
}

/**
 * Complete query definition
 */
export interface QueryDefinition {
  table: string
  filters: QueryFilter[]
  logicalFilter?: LogicalFilter
  order?: OrderSpec
  limit?: number
  index?: IndexSpec
}

/**
 * Translated SQL query result
 */
export interface TranslatedQuery {
  sql: string
  params: string[]
  indexHint?: string
}

interface TranslatedFragment {
  sql: string
  params: string[]
}

// ============================================================================
// System fields that don't need json_extract
// ============================================================================

const SYSTEM_FIELDS = new Set(['_id', '_creationTime'])

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Escape a table name to prevent SQL injection
 */
function escapeTableName(name: string): string {
  // Remove any characters that aren't alphanumeric or underscore
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '')
  return `"${sanitized}"`
}

/**
 * Escape a field name for use in json_extract path
 */
function escapeFieldPath(field: string): string {
  // Remove any SQL injection attempts from field names
  // Only allow alphanumeric, underscore, hyphen, and dot (for nested paths)
  return field.replace(/[^a-zA-Z0-9_.\-]/g, '')
}

/**
 * Get the SQL column reference for a field
 */
function getFieldReference(field: string): string {
  const escapedField = escapeFieldPath(field)
  if (SYSTEM_FIELDS.has(escapedField)) {
    return escapedField
  }
  return `json_extract(data, '$.${escapedField}')`
}

/**
 * Convert a value to a JSON string representation for parameterized queries
 */
function valueToParam(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * Get the SQL operator for a filter operator
 */
function operatorToSQL(op: FilterOperator): string {
  switch (op) {
    case 'eq': return '='
    case 'neq': return '!='
    case 'lt': return '<'
    case 'lte': return '<='
    case 'gt': return '>'
    case 'gte': return '>='
    default:
      throw new Error(`Unknown operator: ${op}`)
  }
}

/**
 * Validate a filter value - throw if invalid
 */
function validateFilterValue(value: unknown): void {
  if (value === undefined) {
    throw new Error('Filter value cannot be undefined')
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      throw new Error('Filter value cannot be NaN')
    }
    if (!Number.isFinite(value)) {
      throw new Error('Filter value cannot be Infinity')
    }
  }
}

// ============================================================================
// Core Translation Functions
// ============================================================================

/**
 * Translate a single filter to SQL fragment
 */
export function translateFilter(filter: QueryFilter): TranslatedFragment {
  validateFilterValue(filter.value)

  const fieldRef = getFieldReference(filter.field)

  // Handle null equality/inequality specially
  if (filter.value === null) {
    if (filter.op === 'eq') {
      return { sql: `${fieldRef} IS NULL`, params: [] }
    }
    if (filter.op === 'neq') {
      return { sql: `${fieldRef} IS NOT NULL`, params: [] }
    }
  }

  const sqlOp = operatorToSQL(filter.op)
  const param = valueToParam(filter.value)

  return {
    sql: `${fieldRef} ${sqlOp} ?`,
    params: [param],
  }
}

/**
 * Translate a logical filter (AND/OR with nested filters)
 */
function translateLogicalFilter(logicalFilter: LogicalFilter): TranslatedFragment {
  const fragments: TranslatedFragment[] = []

  for (const filter of logicalFilter.filters) {
    if ('type' in filter) {
      // Nested logical filter
      fragments.push(translateLogicalFilter(filter))
    } else {
      // Simple filter
      fragments.push(translateFilter(filter))
    }
  }

  const connector = logicalFilter.type === 'and' ? ' AND ' : ' OR '
  const combinedSql = fragments.map(f => f.sql).join(connector)
  const combinedParams = fragments.flatMap(f => f.params)

  return {
    sql: `(${combinedSql})`,
    params: combinedParams,
  }
}

/**
 * Build a WHERE clause from filters and logical filter
 */
export function buildWhereClause(
  filters: QueryFilter[],
  logicalFilter?: LogicalFilter
): TranslatedFragment {
  const fragments: TranslatedFragment[] = []

  // Translate simple filters
  for (const filter of filters) {
    fragments.push(translateFilter(filter))
  }

  // Translate logical filter if present
  if (logicalFilter) {
    fragments.push(translateLogicalFilter(logicalFilter))
  }

  if (fragments.length === 0) {
    return { sql: '', params: [] }
  }

  const combinedSql = fragments.map(f => f.sql).join(' AND ')
  const combinedParams = fragments.flatMap(f => f.params)

  return {
    sql: `WHERE ${combinedSql}`,
    params: combinedParams,
  }
}

/**
 * Translate an order specification to SQL fragment
 */
export function translateOrdering(order?: OrderSpec): string {
  if (!order) {
    return 'ORDER BY _creationTime ASC'
  }

  const direction = order.direction === 'desc' ? 'DESC' : 'ASC'
  const fieldRef = getFieldReference(order.field)

  return `ORDER BY ${fieldRef} ${direction}`
}

/**
 * Translate a limit to SQL fragment
 */
export function translateLimit(limit: number | undefined): string {
  if (limit === undefined) {
    return ''
  }
  return `LIMIT ${limit}`
}

/**
 * Main function: Translate a complete query definition to SQL
 */
export function translateQuery(query: QueryDefinition): TranslatedQuery {
  const tableName = escapeTableName(query.table)

  // Build WHERE clause
  const whereClause = buildWhereClause(query.filters, query.logicalFilter)

  // Build ORDER BY clause
  const orderClause = translateOrdering(query.order)

  // Build LIMIT clause
  const limitClause = translateLimit(query.limit)

  // Combine all parts
  const parts = [
    `SELECT _id, _creationTime, data FROM ${tableName}`,
    whereClause.sql,
    orderClause,
    limitClause,
  ].filter(Boolean)

  const result: TranslatedQuery = {
    sql: parts.join(' '),
    params: whereClause.params,
  }

  // Add index hint if specified
  if (query.index) {
    result.indexHint = query.index.name
  }

  return result
}
