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

import type { Id } from '../../types'
import { DatabaseReader, type StorageBackend } from './DatabaseReader'

/**
 * Extended storage interface with write operations
 * Uses table+id pattern for direct document access
 */
export interface WritableStorageBackend extends StorageBackend {
  getDocumentByTableAndId(table: string, id: string): Record<string, unknown> | null
  saveDocument(table: string, id: string, doc: Record<string, unknown>): void
  deleteDocument(table: string, id: string): void
}

/**
 * System field names that cannot be modified by users
 */
const SYSTEM_FIELDS = ['_id', '_creationTime'] as const

/**
 * DatabaseWriter extends DatabaseReader with write operations
 */
export class DatabaseWriter extends DatabaseReader {
  protected writableStorage: WritableStorageBackend

  constructor(storage: WritableStorageBackend) {
    super(storage)
    this.writableStorage = storage
  }

  /**
   * Override get() to work with our storage implementation
   */
  async get<TableName extends string>(
    id: Id<TableName>
  ): Promise<Record<string, unknown> | null> {
    // Extract table name from ID (format: tableName_randomPart)
    const tableName = this.extractTableFromId(id)
    const doc = this.writableStorage.getDocumentByTableAndId(tableName, id)
    return doc
  }

  /**
   * Insert a new document into a table.
   * Returns the generated document ID.
   *
   * @throws {Error} If document contains system fields or invalid values
   */
  async insert<TableName extends string>(
    tableName: TableName,
    document: Record<string, unknown>
  ): Promise<Id<TableName>> {
    // Validate that no system fields are provided
    this.validateNoSystemFields(document, 'insert')

    // Validate document values
    this.validateDocumentValues(document)

    // Generate a unique ID
    const id = this.generateId(tableName)

    // Add system fields
    const fullDocument = {
      ...document,
      _id: id,
      _creationTime: Date.now(),
    }

    // Save to storage
    this.writableStorage.saveDocument(tableName, id, fullDocument)

    return id
  }

  /**
   * Update specific fields of a document.
   * Merges the provided fields with the existing document.
   *
   * @throws {Error} If document not found, no fields provided, or attempting to modify system fields
   */
  async patch<TableName extends string>(
    id: Id<TableName>,
    fields: Partial<Record<string, unknown>>
  ): Promise<void> {
    // Validate at least one field is provided
    if (Object.keys(fields).length === 0) {
      throw new Error('patch() requires at least one field to update')
    }

    // Validate that no system fields are being modified
    this.validateNoSystemFields(fields, 'patch')

    // Validate field values
    this.validateDocumentValues(fields)

    // Get existing document
    const tableName = this.extractTableFromId(id)
    const existingDoc = this.writableStorage.getDocumentByTableAndId(tableName, id)

    if (!existingDoc) {
      throw new Error(`Document with ID ${id} not found`)
    }

    // Merge fields
    const updatedDoc = {
      ...existingDoc,
      ...fields,
    }

    // Save updated document
    this.writableStorage.saveDocument(tableName, id, updatedDoc)
  }

  /**
   * Replace a document entirely.
   * All old fields except system fields are removed.
   *
   * @throws {Error} If document not found or attempting to modify system fields
   */
  async replace<TableName extends string>(
    id: Id<TableName>,
    document: Record<string, unknown>
  ): Promise<void> {
    // Validate that no system fields are being replaced
    this.validateNoSystemFields(document, 'replace')

    // Validate document values
    this.validateDocumentValues(document)

    // Get existing document to preserve system fields
    const tableName = this.extractTableFromId(id)
    const existingDoc = this.writableStorage.getDocumentByTableAndId(tableName, id)

    if (!existingDoc) {
      throw new Error(`Document with ID ${id} not found`)
    }

    // Create new document with preserved system fields
    const newDoc = {
      ...document,
      _id: existingDoc._id,
      _creationTime: existingDoc._creationTime,
    }

    // Save replaced document
    this.writableStorage.saveDocument(tableName, id, newDoc)
  }

  /**
   * Delete a document.
   * This operation is idempotent - deleting a non-existent document does not throw.
   */
  async delete(id: Id<string>): Promise<void> {
    const tableName = this.extractTableFromId(id)
    this.writableStorage.deleteDocument(tableName, id)
  }

  /**
   * Validate that document doesn't contain system fields
   */
  private validateNoSystemFields(
    document: Record<string, unknown>,
    operation: string
  ): void {
    for (const field of SYSTEM_FIELDS) {
      if (field in document) {
        throw new Error(
          `System field '${field}' cannot be modified. System fields are auto-generated and read-only.`
        )
      }
    }
  }

  /**
   * Validate document values according to Convex value system
   */
  private validateDocumentValues(document: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(document)) {
      this.validateValue(value, key)
    }
  }

  /**
   * Recursively validate a value
   */
  private validateValue(value: unknown, path: string): void {
    // Check for undefined
    if (value === undefined) {
      throw new Error(
        `Invalid value at '${path}': undefined is not allowed. Use null for optional fields.`
      )
    }

    // Check for NaN
    if (typeof value === 'number' && isNaN(value)) {
      throw new Error(
        `Invalid value at '${path}': NaN is not allowed.`
      )
    }

    // Check for Infinity
    if (value === Infinity || value === -Infinity) {
      throw new Error(
        `Invalid value at '${path}': Infinity is not allowed.`
      )
    }

    // Check for functions
    if (typeof value === 'function') {
      throw new Error(
        `Invalid value at '${path}': function is not allowed.`
      )
    }

    // Check for symbols
    if (typeof value === 'symbol') {
      throw new Error(
        `Invalid value at '${path}': symbol is not allowed.`
      )
    }

    // Recursively validate arrays
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        this.validateValue(item, `${path}[${index}]`)
      })
    }

    // Recursively validate objects (but not null, Date, etc.)
    if (value !== null && typeof value === 'object' && value.constructor === Object) {
      for (const [key, val] of Object.entries(value)) {
        this.validateValue(val, `${path}.${key}`)
      }
    }
  }

  /**
   * Generate a unique ID for a document
   */
  private generateId<TableName extends string>(tableName: TableName): Id<TableName> {
    // Generate a unique ID using crypto random and base64url encoding
    const randomBytes = new Uint8Array(16)
    crypto.getRandomValues(randomBytes)

    // Convert to base64url (URL-safe base64)
    const base64 = this.arrayBufferToBase64Url(randomBytes.buffer)

    // Include table name in ID for easy extraction
    const id = `${tableName}_${base64}`

    return id as Id<TableName>
  }

  /**
   * Convert ArrayBuffer to base64url string
   */
  private arrayBufferToBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    // Convert to base64 and make URL-safe
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  /**
   * Extract table name from document ID
   */
  private extractTableFromId(id: string): string {
    const parts = id.split('_')
    if (parts.length < 2) {
      throw new Error(`Invalid document ID format: ${id}`)
    }
    return parts[0]
  }
}
