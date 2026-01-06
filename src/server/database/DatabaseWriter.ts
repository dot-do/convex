/**
 * @module DatabaseWriter
 *
 * DatabaseWriter implementation for Layer 4 - Database Layer.
 *
 * Extends DatabaseReader and provides write operations for document manipulation:
 * - `insert()`: Insert a new document into a table
 * - `patch()`: Partially update specific fields of an existing document
 * - `replace()`: Replace an entire document with new content
 * - `delete()`: Remove a document from the database
 *
 * All write operations validate input data and protect system fields (`_id`, `_creationTime`)
 * from modification. Documents are validated against the Convex value system, rejecting
 * invalid JavaScript values like `undefined`, `NaN`, `Infinity`, functions, and symbols.
 *
 * @example
 * ```typescript
 * // Create a DatabaseWriter with a writable storage backend
 * const storage = new InMemoryWritableStorage();
 * const db = new DatabaseWriter(storage);
 *
 * // Insert a new document
 * const userId = await db.insert('users', { name: 'Alice', email: 'alice@example.com' });
 *
 * // Update specific fields
 * await db.patch(userId, { email: 'alice.new@example.com' });
 *
 * // Replace entire document (preserving system fields)
 * await db.replace(userId, { name: 'Alice Smith', country: 'USA' });
 *
 * // Delete the document
 * await db.delete(userId);
 * ```
 */

import type { Id } from '../../types'
import { DatabaseReader, type StorageBackend } from './DatabaseReader'

// ============================================================================
// Constants
// ============================================================================

/**
 * System field names that are automatically managed by the database.
 * These fields cannot be set or modified by user operations.
 *
 * - `_id`: Unique document identifier, auto-generated on insert
 * - `_creationTime`: Unix timestamp (ms) when document was created
 *
 * @internal
 */
const SYSTEM_FIELDS = ['_id', '_creationTime'] as const

/**
 * Type representing the system field names.
 * @internal
 */
type SystemField = (typeof SYSTEM_FIELDS)[number]

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Extended storage interface with write operations.
 *
 * Extends the base StorageBackend with methods for document persistence.
 * Uses a table+id pattern for direct document access and manipulation.
 *
 * @example
 * ```typescript
 * class MyWritableStorage implements WritableStorageBackend {
 *   // Storage implementation
 *   private tables = new Map<string, Map<string, Record<string, unknown>>>();
 *
 *   getDocumentByTableAndId(table: string, id: string) {
 *     return this.tables.get(table)?.get(id) ?? null;
 *   }
 *
 *   saveDocument(table: string, id: string, doc: Record<string, unknown>) {
 *     if (!this.tables.has(table)) {
 *       this.tables.set(table, new Map());
 *     }
 *     this.tables.get(table)!.set(id, doc);
 *   }
 *
 *   deleteDocument(table: string, id: string) {
 *     this.tables.get(table)?.delete(id);
 *   }
 * }
 * ```
 */
export interface WritableStorageBackend extends StorageBackend {
  /**
   * Retrieves a document by table name and document ID.
   *
   * @param table - The name of the table containing the document
   * @param id - The unique document identifier
   * @returns The document if found, null otherwise
   */
  getDocumentByTableAndId(table: string, id: string): Record<string, unknown> | null

  /**
   * Persists a document to storage.
   *
   * If a document with the same ID exists, it will be overwritten.
   *
   * @param table - The name of the table to store the document in
   * @param id - The unique document identifier
   * @param doc - The complete document to store (including system fields)
   */
  saveDocument(table: string, id: string, doc: Record<string, unknown>): void

  /**
   * Removes a document from storage.
   *
   * This operation is idempotent - calling delete on a non-existent
   * document should not throw an error.
   *
   * @param table - The name of the table containing the document
   * @param id - The unique document identifier
   */
  deleteDocument(table: string, id: string): void
}

/**
 * Result of document value validation.
 *
 * @internal
 */
interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean
  /** Error message if validation failed */
  error?: string
}

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Checks if a value is a plain object (not null, not an array, not a special object type).
 *
 * Plain objects are the only object types that require recursive validation
 * of their properties. Special objects like Date, ArrayBuffer, etc. are
 * treated as atomic values.
 *
 * @param value - The value to check
 * @returns True if the value is a plain object
 *
 * @internal
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && value.constructor === Object
}

/**
 * Validates that a value is not undefined.
 *
 * Convex does not support undefined values in documents. Use null for optional fields.
 *
 * @param value - The value to validate
 * @param path - The field path for error messages
 * @returns Validation result
 *
 * @internal
 */
function validateNotUndefined(value: unknown, path: string): ValidationResult {
  if (value === undefined) {
    return {
      valid: false,
      error: `Invalid value at '${path}': undefined is not allowed. Use null for optional fields.`,
    }
  }
  return { valid: true }
}

/**
 * Validates that a number is not NaN.
 *
 * NaN values cannot be serialized consistently and are not supported.
 *
 * @param value - The value to validate
 * @param path - The field path for error messages
 * @returns Validation result
 *
 * @internal
 */
function validateNotNaN(value: unknown, path: string): ValidationResult {
  if (typeof value === 'number' && isNaN(value)) {
    return {
      valid: false,
      error: `Invalid value at '${path}': NaN is not allowed.`,
    }
  }
  return { valid: true }
}

/**
 * Validates that a value is not Infinity or -Infinity.
 *
 * Infinite values cannot be serialized in JSON and are not supported.
 *
 * @param value - The value to validate
 * @param path - The field path for error messages
 * @returns Validation result
 *
 * @internal
 */
function validateNotInfinity(value: unknown, path: string): ValidationResult {
  if (value === Infinity || value === -Infinity) {
    return {
      valid: false,
      error: `Invalid value at '${path}': Infinity is not allowed.`,
    }
  }
  return { valid: true }
}

/**
 * Validates that a value is not a function.
 *
 * Functions cannot be serialized and stored in the database.
 *
 * @param value - The value to validate
 * @param path - The field path for error messages
 * @returns Validation result
 *
 * @internal
 */
function validateNotFunction(value: unknown, path: string): ValidationResult {
  if (typeof value === 'function') {
    return {
      valid: false,
      error: `Invalid value at '${path}': function is not allowed.`,
    }
  }
  return { valid: true }
}

/**
 * Validates that a value is not a Symbol.
 *
 * Symbols are not serializable and cannot be stored in the database.
 *
 * @param value - The value to validate
 * @param path - The field path for error messages
 * @returns Validation result
 *
 * @internal
 */
function validateNotSymbol(value: unknown, path: string): ValidationResult {
  if (typeof value === 'symbol') {
    return {
      valid: false,
      error: `Invalid value at '${path}': symbol is not allowed.`,
    }
  }
  return { valid: true }
}

/**
 * Runs all atomic value validations on a value.
 *
 * This combines all individual validation checks into a single pass.
 * Returns on the first validation failure for efficiency.
 *
 * @param value - The value to validate
 * @param path - The field path for error messages
 * @returns Validation result with the first error encountered
 *
 * @internal
 */
function validateAtomicValue(value: unknown, path: string): ValidationResult {
  // Run all validations in order, return first failure
  const validations = [
    validateNotUndefined,
    validateNotNaN,
    validateNotInfinity,
    validateNotFunction,
    validateNotSymbol,
  ]

  for (const validate of validations) {
    const result = validate(value, path)
    if (!result.valid) {
      return result
    }
  }

  return { valid: true }
}

/**
 * Recursively validates all values in a document.
 *
 * Validates atomic values and recursively processes arrays and nested objects.
 * This ensures that all values at any depth conform to the Convex value system.
 *
 * @param value - The value to validate
 * @param path - The current field path for error messages
 * @returns Validation result
 *
 * @internal
 */
function validateValueRecursive(value: unknown, path: string): ValidationResult {
  // First validate the atomic value constraints
  const atomicResult = validateAtomicValue(value, path)
  if (!atomicResult.valid) {
    return atomicResult
  }

  // Recursively validate array elements
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const result = validateValueRecursive(value[i], `${path}[${i}]`)
      if (!result.valid) {
        return result
      }
    }
  }

  // Recursively validate plain object properties
  if (isPlainObject(value)) {
    for (const [key, val] of Object.entries(value)) {
      const result = validateValueRecursive(val, `${path}.${key}`)
      if (!result.valid) {
        return result
      }
    }
  }

  return { valid: true }
}

/**
 * Validates all fields in a document.
 *
 * @param document - The document to validate
 * @throws {Error} If any field contains an invalid value
 *
 * @internal
 */
function validateDocument(document: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(document)) {
    const result = validateValueRecursive(value, key)
    if (!result.valid) {
      throw new Error(result.error)
    }
  }
}

/**
 * Checks if a document contains any system fields.
 *
 * @param document - The document to check
 * @returns The first system field found, or null if none
 *
 * @internal
 */
function findSystemField(document: Record<string, unknown>): SystemField | null {
  for (const field of SYSTEM_FIELDS) {
    if (field in document) {
      return field
    }
  }
  return null
}

/**
 * Validates that a document does not contain system fields.
 *
 * @param document - The document to validate
 * @param operation - The operation name for error messages
 * @throws {Error} If a system field is present
 *
 * @internal
 */
function validateNoSystemFields(document: Record<string, unknown>, operation: string): void {
  const systemField = findSystemField(document)
  if (systemField !== null) {
    throw new Error(
      `System field '${systemField}' cannot be modified. System fields are auto-generated and read-only.`
    )
  }
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a cryptographically random buffer of bytes.
 *
 * Uses the Web Crypto API for secure random number generation.
 *
 * @param length - Number of random bytes to generate
 * @returns Uint8Array containing random bytes
 *
 * @internal
 */
function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

/**
 * Converts a byte array to a base64url-encoded string.
 *
 * Base64url encoding is URL-safe and uses `-` and `_` instead of `+` and `/`,
 * with no padding characters. This is suitable for use in document IDs.
 *
 * @param bytes - The bytes to encode
 * @returns Base64url-encoded string
 *
 * @internal
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Generates a unique document ID for a given table.
 *
 * The ID format is `{tableName}_{randomPart}` where:
 * - `tableName` is the name of the table
 * - `randomPart` is 16 bytes of cryptographically random data encoded as base64url
 *
 * This format allows extracting the table name from an ID, which is useful
 * for routing operations to the correct table.
 *
 * @typeParam TableName - The table name type for the generated ID
 * @param tableName - The name of the table
 * @returns A unique typed document ID
 *
 * @example
 * ```typescript
 * const id = generateDocumentId('users');
 * // id might be: 'users_HxK9_fLmN8pQrStUvWxYz'
 * ```
 *
 * @internal
 */
function generateDocumentId<TableName extends string>(tableName: TableName): Id<TableName> {
  const randomBytes = generateRandomBytes(16)
  const base64Part = bytesToBase64Url(randomBytes)
  return `${tableName}_${base64Part}` as Id<TableName>
}

/**
 * Extracts the table name from a document ID.
 *
 * The ID format is `{tableName}_{randomPart}`. This function extracts
 * the table name portion before the first underscore.
 *
 * @param id - The document ID to parse
 * @returns The table name extracted from the ID
 * @throws {Error} If the ID format is invalid (no underscore separator)
 *
 * @example
 * ```typescript
 * const tableName = extractTableFromId('users_abc123');
 * // tableName = 'users'
 * ```
 *
 * @internal
 */
function extractTableFromId(id: string): string {
  const underscoreIndex = id.indexOf('_')
  if (underscoreIndex === -1) {
    throw new Error(
      `Invalid document ID format: '${id}'. Expected format: 'tableName_randomPart'`
    )
  }
  return id.substring(0, underscoreIndex)
}

// ============================================================================
// DatabaseWriter Implementation
// ============================================================================

/**
 * DatabaseWriter extends DatabaseReader with write operations.
 *
 * This class provides a complete interface for document manipulation including
 * creation, updates, and deletion. It inherits all read capabilities from
 * DatabaseReader and adds write methods that maintain data integrity.
 *
 * All write operations:
 * - Validate input data against the Convex value system
 * - Protect system fields (`_id`, `_creationTime`) from modification
 * - Ensure documents are properly persisted to storage
 *
 * @example
 * ```typescript
 * const storage = new MyWritableStorage();
 * const db = new DatabaseWriter(storage);
 *
 * // Full CRUD lifecycle
 * const id = await db.insert('users', { name: 'Alice', email: 'alice@example.com' });
 *
 * let user = await db.get(id);
 * console.log(user.name); // 'Alice'
 *
 * await db.patch(id, { email: 'newemail@example.com' });
 * user = await db.get(id);
 * console.log(user.email); // 'newemail@example.com'
 *
 * await db.replace(id, { name: 'Alice Smith', country: 'USA' });
 * user = await db.get(id);
 * console.log(user.country); // 'USA'
 * console.log(user.email); // undefined (replaced)
 *
 * await db.delete(id);
 * user = await db.get(id);
 * console.log(user); // null
 * ```
 */
export class DatabaseWriter extends DatabaseReader {
  /**
   * The writable storage backend for document persistence.
   * @internal
   */
  protected readonly writableStorage: WritableStorageBackend

  /**
   * Creates a new DatabaseWriter instance.
   *
   * @param storage - The writable storage backend to use for document operations
   *
   * @example
   * ```typescript
   * const storage = new MyWritableStorage();
   * const db = new DatabaseWriter(storage);
   * ```
   */
  constructor(storage: WritableStorageBackend) {
    super(storage)
    this.writableStorage = storage
  }

  /**
   * Retrieves a document by its unique identifier.
   *
   * Overrides the base class implementation to use the writable storage's
   * table+id lookup pattern.
   *
   * @typeParam TableName - The name of the table the document belongs to
   * @param id - The typed document ID to retrieve
   * @returns Promise resolving to the document if found, null otherwise
   *
   * @example
   * ```typescript
   * const user = await db.get('users_abc123' as Id<'users'>);
   * if (user) {
   *   console.log(`Found user: ${user.name}`);
   * }
   * ```
   */
  async get<TableName extends string>(
    id: Id<TableName>
  ): Promise<Record<string, unknown> | null> {
    const tableName = extractTableFromId(id)
    return this.writableStorage.getDocumentByTableAndId(tableName, id)
  }

  /**
   * Inserts a new document into a table.
   *
   * Creates a new document with an auto-generated unique ID and creation timestamp.
   * The document is validated before insertion to ensure all values conform to
   * the Convex value system.
   *
   * System fields (`_id`, `_creationTime`) are automatically added and must not
   * be provided in the input document.
   *
   * @typeParam TableName - The name of the table to insert into
   * @param tableName - The name of the table
   * @param document - The document fields to insert (without system fields)
   * @returns Promise resolving to the generated document ID
   *
   * @throws {Error} If the document contains system fields (`_id`, `_creationTime`)
   * @throws {Error} If the document contains invalid values (undefined, NaN, Infinity, functions, symbols)
   *
   * @example
   * ```typescript
   * // Basic insert
   * const userId = await db.insert('users', {
   *   name: 'Alice',
   *   email: 'alice@example.com',
   *   age: 30,
   * });
   *
   * // The document now has system fields
   * const user = await db.get(userId);
   * console.log(user._id);           // 'users_HxK9...'
   * console.log(user._creationTime); // 1704067200000
   * console.log(user.name);          // 'Alice'
   * ```
   *
   * @example
   * ```typescript
   * // Insert with nested data
   * const postId = await db.insert('posts', {
   *   title: 'Hello World',
   *   content: 'My first post',
   *   metadata: { tags: ['intro', 'welcome'], draft: false },
   * });
   * ```
   *
   * @example
   * ```typescript
   * // This will throw - system fields not allowed
   * await db.insert('users', {
   *   _id: 'custom_id',  // Error!
   *   name: 'Bob',
   * });
   * ```
   */
  async insert<TableName extends string>(
    tableName: TableName,
    document: Record<string, unknown>
  ): Promise<Id<TableName>> {
    // Validate no system fields are provided
    validateNoSystemFields(document, 'insert')

    // Validate all document values
    validateDocument(document)

    // Generate unique ID
    const id = generateDocumentId(tableName)

    // Create complete document with system fields
    const fullDocument: Record<string, unknown> = {
      ...document,
      _id: id,
      _creationTime: Date.now(),
    }

    // Persist to storage
    this.writableStorage.saveDocument(tableName, id, fullDocument)

    return id
  }

  /**
   * Updates specific fields of an existing document.
   *
   * Merges the provided fields with the existing document, preserving
   * any fields not specified in the update. System fields are preserved
   * and cannot be modified.
   *
   * @typeParam TableName - The name of the table containing the document
   * @param id - The ID of the document to update
   * @param fields - The fields to update (partial document)
   * @returns Promise that resolves when the update is complete
   *
   * @throws {Error} If the document does not exist
   * @throws {Error} If no fields are provided (empty update)
   * @throws {Error} If attempting to modify system fields
   * @throws {Error} If field values are invalid
   *
   * @example
   * ```typescript
   * // Update a single field
   * await db.patch(userId, { email: 'newemail@example.com' });
   *
   * // Update multiple fields
   * await db.patch(userId, {
   *   email: 'newemail@example.com',
   *   age: 31,
   *   active: true,
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Add new fields to existing document
   * await db.patch(userId, {
   *   nickname: 'ally',
   *   lastLogin: Date.now(),
   * });
   * ```
   *
   * @example
   * ```typescript
   * // This will throw - empty update not allowed
   * await db.patch(userId, {});
   *
   * // This will throw - system fields cannot be modified
   * await db.patch(userId, { _id: 'new_id' });
   * ```
   */
  async patch<TableName extends string>(
    id: Id<TableName>,
    fields: Partial<Record<string, unknown>>
  ): Promise<void> {
    // Validate at least one field is provided
    const fieldCount = Object.keys(fields).length
    if (fieldCount === 0) {
      throw new Error('patch() requires at least one field to update')
    }

    // Validate no system fields are being modified
    validateNoSystemFields(fields, 'patch')

    // Validate field values
    validateDocument(fields)

    // Get existing document
    const tableName = extractTableFromId(id)
    const existingDoc = this.writableStorage.getDocumentByTableAndId(tableName, id)

    if (!existingDoc) {
      throw new Error(`Document with ID ${id} not found`)
    }

    // Merge fields with existing document
    const updatedDoc: Record<string, unknown> = {
      ...existingDoc,
      ...fields,
    }

    // Persist updated document
    this.writableStorage.saveDocument(tableName, id, updatedDoc)
  }

  /**
   * Replaces an entire document with new content.
   *
   * All existing fields are removed except for system fields (`_id`, `_creationTime`),
   * which are preserved. The document is replaced with the provided content.
   *
   * This is useful when you want to completely redefine a document's structure
   * rather than updating individual fields.
   *
   * @typeParam TableName - The name of the table containing the document
   * @param id - The ID of the document to replace
   * @param document - The new document content (without system fields)
   * @returns Promise that resolves when the replace is complete
   *
   * @throws {Error} If the document does not exist
   * @throws {Error} If attempting to set system fields
   * @throws {Error} If document values are invalid
   *
   * @example
   * ```typescript
   * // Original document: { _id, _creationTime, name: 'Alice', email: 'alice@example.com' }
   *
   * await db.replace(userId, { name: 'Alice Smith', country: 'USA' });
   *
   * // After replace: { _id, _creationTime, name: 'Alice Smith', country: 'USA' }
   * // Note: 'email' field is gone, only specified fields remain
   * ```
   *
   * @example
   * ```typescript
   * // Replace with empty document (keeps only system fields)
   * await db.replace(userId, {});
   *
   * const user = await db.get(userId);
   * console.log(user._id);   // preserved
   * console.log(user.name);  // undefined
   * ```
   */
  async replace<TableName extends string>(
    id: Id<TableName>,
    document: Record<string, unknown>
  ): Promise<void> {
    // Validate no system fields are provided
    validateNoSystemFields(document, 'replace')

    // Validate document values
    validateDocument(document)

    // Get existing document to preserve system fields
    const tableName = extractTableFromId(id)
    const existingDoc = this.writableStorage.getDocumentByTableAndId(tableName, id)

    if (!existingDoc) {
      throw new Error(`Document with ID ${id} not found`)
    }

    // Create new document with preserved system fields
    const newDoc: Record<string, unknown> = {
      ...document,
      _id: existingDoc._id,
      _creationTime: existingDoc._creationTime,
    }

    // Persist replaced document
    this.writableStorage.saveDocument(tableName, id, newDoc)
  }

  /**
   * Deletes a document by its ID.
   *
   * This operation is idempotent - deleting a non-existent document
   * does not throw an error and simply returns successfully.
   *
   * @param id - The ID of the document to delete
   * @returns Promise that resolves when the delete is complete
   *
   * @example
   * ```typescript
   * // Delete a document
   * await db.delete(userId);
   *
   * // Document is now gone
   * const user = await db.get(userId);
   * console.log(user); // null
   *
   * // Safe to delete again (idempotent)
   * await db.delete(userId); // No error
   * ```
   */
  async delete(id: Id<string>): Promise<void> {
    const tableName = extractTableFromId(id)
    this.writableStorage.deleteDocument(tableName, id)
  }
}
