import { Hono } from 'hono';
import { cors } from 'hono/cors';

// src/index.ts

// src/durable-objects/ConvexDatabase.ts
var RESERVED_TABLES = /* @__PURE__ */ new Set(["_documents", "_schema_versions", "_metadata"]);
var ConvexDatabase = class {
  state;
  _env;
  sql;
  initialized = false;
  tables = /* @__PURE__ */ new Set();
  constructor(state, env) {
    this.state = state;
    this._env = env;
    this.sql = state.storage.sql;
  }
  /**
   * Initialize the database schema
   */
  async ensureInitialized() {
    if (this.initialized) return;
    await this.state.blockConcurrencyWhile(async () => {
      if (this.initialized) return;
      this.sql.exec("PRAGMA journal_mode=WAL");
      this.sql.exec("PRAGMA foreign_keys=ON");
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS _metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS _documents (
          _id TEXT PRIMARY KEY,
          _table TEXT NOT NULL,
          _creationTime INTEGER NOT NULL
        )
      `);
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS _schema_versions (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          schema_hash TEXT NOT NULL
        )
      `);
      const tablesResult = this.sql.exec(
        `SELECT value FROM _metadata WHERE key = 'tables'`
      ).toArray();
      if (tablesResult.length > 0 && tablesResult[0]) {
        const tables = JSON.parse(tablesResult[0].value);
        tables.forEach((t) => this.tables.add(t));
      }
      this.initialized = true;
    });
  }
  /**
   * Check if initialized
   */
  isInitialized() {
    return this.initialized;
  }
  /**
   * Ensure a table exists, creating it if necessary
   */
  ensureTable(tableName) {
    if (this.tables.has(tableName)) return;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        _id TEXT PRIMARY KEY,
        _creationTime INTEGER NOT NULL,
        data TEXT NOT NULL
      )
    `);
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS "${tableName}_creation_time"
      ON "${tableName}" (_creationTime)
    `);
    this.tables.add(tableName);
    this.sql.exec(
      `INSERT OR REPLACE INTO _metadata (key, value) VALUES ('tables', ?)`,
      JSON.stringify([...this.tables])
    );
  }
  /**
   * Generate a unique document ID
   */
  generateId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
  /**
   * Validate a document value for Convex compatibility
   */
  validateValue(value, path = "") {
    if (value === void 0) {
      throw new Error(`Invalid value at ${path || "root"}: undefined is not allowed (use null instead)`);
    }
    if (typeof value === "function") {
      throw new Error(`Invalid value at ${path || "root"}: functions are not serializable`);
    }
    if (typeof value === "symbol") {
      throw new Error(`Invalid value at ${path || "root"}: symbols are not serializable`);
    }
    if (typeof value === "number") {
      if (Number.isNaN(value)) {
        throw new Error(`Invalid value at ${path || "root"}: NaN is not a valid number`);
      }
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid value at ${path || "root"}: Infinity is not a valid number`);
      }
    }
    if (typeof value === "bigint") {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => this.validateValue(item, `${path}[${index}]`));
    } else if (value !== null && typeof value === "object" && !(value instanceof ArrayBuffer)) {
      try {
        JSON.stringify(value);
      } catch (e) {
        if (e.message.includes("circular")) {
          throw new Error(`Invalid value at ${path || "root"}: circular references are not allowed`);
        }
      }
      for (const [key, val] of Object.entries(value)) {
        this.validateValue(val, path ? `${path}.${key}` : key);
      }
    }
  }
  /**
   * Validate document for insert/update
   */
  validateDocument(doc) {
    if ("_id" in doc) {
      throw new Error("Cannot specify _id on insert - it is auto-generated");
    }
    if ("_creationTime" in doc) {
      throw new Error("Cannot specify _creationTime on insert - it is auto-generated");
    }
    this.validateValue(doc);
  }
  /**
   * Serialize a document for storage
   * Handles BigInt and ArrayBuffer special cases
   */
  serializeDocument(doc) {
    return JSON.stringify(doc, (_key, value) => {
      if (typeof value === "bigint") {
        return { __type: "bigint", value: value.toString() };
      }
      if (value instanceof ArrayBuffer) {
        return { __type: "arraybuffer", value: Array.from(new Uint8Array(value)) };
      }
      return value;
    });
  }
  /**
   * Deserialize a document from storage
   * Handles BigInt and ArrayBuffer special cases
   */
  deserializeDocument(data) {
    return JSON.parse(data, (_key, value) => {
      if (value && typeof value === "object" && value.__type === "bigint") {
        return BigInt(value.value);
      }
      if (value && typeof value === "object" && value.__type === "arraybuffer") {
        return new Uint8Array(value.value).buffer;
      }
      return value;
    });
  }
  /**
   * Insert a new document
   */
  async insert(tableName, doc) {
    await this.ensureInitialized();
    this.validateDocument(doc);
    this.ensureTable(tableName);
    const id = this.generateId();
    const creationTime = Date.now();
    this.sql.exec(
      `INSERT INTO "${tableName}" (_id, _creationTime, data) VALUES (?, ?, ?)`,
      id,
      creationTime,
      this.serializeDocument(doc)
    );
    this.sql.exec(
      `INSERT INTO _documents (_id, _table, _creationTime) VALUES (?, ?, ?)`,
      id,
      tableName,
      creationTime
    );
    return id;
  }
  /**
   * Get a document by ID
   */
  async get(tableName, id) {
    await this.ensureInitialized();
    if (!this.tables.has(tableName)) {
      return null;
    }
    const results = this.sql.exec(
      `SELECT _id, _creationTime, data FROM "${tableName}" WHERE _id = ?`,
      id
    ).toArray();
    if (results.length === 0 || !results[0]) {
      return null;
    }
    const row = results[0];
    return {
      _id: row._id,
      _creationTime: row._creationTime,
      ...this.deserializeDocument(row.data)
    };
  }
  /**
   * Validate fields for patch/update
   */
  validatePatchFields(fields) {
    if ("_id" in fields) {
      throw new Error("Cannot patch _id field - it is immutable");
    }
    if ("_creationTime" in fields) {
      throw new Error("Cannot patch _creationTime field - it is immutable");
    }
    this.validateValue(fields);
  }
  /**
   * Patch (partial update) a document
   */
  async patch(tableName, id, fields) {
    await this.ensureInitialized();
    this.validatePatchFields(fields);
    if (!this.tables.has(tableName)) {
      throw new Error(`Table "${tableName}" does not exist`);
    }
    const existing = await this.get(tableName, id);
    if (!existing) {
      throw new Error(`Document "${id}" not found in table "${tableName}"`);
    }
    const { _id, _creationTime, ...existingData } = existing;
    const newData = { ...existingData, ...fields };
    this.sql.exec(
      `UPDATE "${tableName}" SET data = ? WHERE _id = ?`,
      JSON.stringify(newData),
      id
    );
  }
  /**
   * Replace a document entirely
   */
  async replace(tableName, id, doc) {
    await this.ensureInitialized();
    this.validateValue(doc);
    if (!this.tables.has(tableName)) {
      throw new Error(`Table "${tableName}" does not exist`);
    }
    const result = this.sql.exec(
      `UPDATE "${tableName}" SET data = ? WHERE _id = ?`,
      JSON.stringify(doc),
      id
    );
    if (result.rowsWritten === 0) {
      throw new Error(`Document "${id}" not found in table "${tableName}"`);
    }
  }
  /**
   * Delete a document
   */
  async delete(tableName, id) {
    await this.ensureInitialized();
    if (!this.tables.has(tableName)) {
      return;
    }
    this.sql.exec(`DELETE FROM "${tableName}" WHERE _id = ?`, id);
    this.sql.exec(`DELETE FROM _documents WHERE _id = ?`, id);
  }
  /**
   * Query documents with filters
   */
  async query(tableName, filters = [], options = {}) {
    await this.ensureInitialized();
    if (!this.tables.has(tableName)) {
      return [];
    }
    let sql = `SELECT _id, _creationTime, data FROM "${tableName}"`;
    const params = [];
    if (filters.length > 0) {
      const whereClauses = filters.map((filter) => {
        const op = this.translateOperator(filter.operator);
        params.push(JSON.stringify(filter.value));
        return `json_extract(data, '$.${filter.field}') ${op} ?`;
      });
      sql += ` WHERE ${whereClauses.join(" AND ")}`;
    }
    if (options.order) {
      const direction = options.order.direction === "desc" ? "DESC" : "ASC";
      if (options.order.field === "_creationTime") {
        sql += ` ORDER BY _creationTime ${direction}`;
      } else {
        sql += ` ORDER BY json_extract(data, '$.${options.order.field}') ${direction}`;
      }
    } else {
      sql += ` ORDER BY _creationTime ASC`;
    }
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    const results = this.sql.exec(sql, ...params).toArray();
    return results.map((row) => ({
      _id: row._id,
      _creationTime: row._creationTime,
      ...this.deserializeDocument(row.data)
    }));
  }
  /**
   * Translate filter operator to SQL
   */
  translateOperator(op) {
    switch (op) {
      case "eq":
        return "=";
      case "neq":
        return "!=";
      case "lt":
        return "<";
      case "lte":
        return "<=";
      case "gt":
        return ">";
      case "gte":
        return ">=";
      default:
        throw new Error(`Unknown operator: ${op}`);
    }
  }
  /**
   * Run a transaction
   */
  async runTransaction(fn) {
    await this.ensureInitialized();
    this.sql.exec("BEGIN TRANSACTION");
    try {
      const result = await fn();
      this.sql.exec("COMMIT");
      return result;
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    }
  }
  // ============================================================================
  // Type Conversion Methods
  // ============================================================================
  /**
   * Convert a JavaScript value to SQLite-compatible format
   */
  toSQLiteValue(value, fieldConfig) {
    if (value === void 0 || value === null) {
      if (!fieldConfig.optional) {
        throw new Error("Cannot set undefined/null for required field");
      }
      return null;
    }
    if (fieldConfig.type === "boolean") {
      return value ? 1 : 0;
    }
    if (fieldConfig.type === "object" || fieldConfig.type === "array") {
      return JSON.stringify(value);
    }
    return value;
  }
  /**
   * Convert a SQLite value back to JavaScript format
   */
  fromSQLiteValue(value, fieldConfig) {
    if (value === null) {
      return fieldConfig.optional ? void 0 : null;
    }
    if (fieldConfig.type === "boolean") {
      return value === 1;
    }
    if (fieldConfig.type === "object" || fieldConfig.type === "array") {
      return typeof value === "string" ? JSON.parse(value) : value;
    }
    return value;
  }
  // ============================================================================
  // Type Mapping Methods
  // ============================================================================
  /**
   * Convert a Convex field type to SQLite column type
   */
  convexTypeToSQLite(fieldDef) {
    const { type, optional } = fieldDef;
    const nullSuffix = optional ? "" : " NOT NULL";
    switch (type) {
      case "string":
        return `TEXT${nullSuffix}`;
      case "number":
      case "float64":
        return `REAL${nullSuffix}`;
      case "boolean":
        return `INTEGER${nullSuffix}`;
      case "int64":
        return `INTEGER${nullSuffix}`;
      case "bytes":
        return `BLOB${nullSuffix}`;
      case "id":
        return `TEXT${nullSuffix}`;
      case "array":
      case "object":
      case "union":
        return `TEXT${nullSuffix}`;
      // JSON stored as TEXT
      case "null":
        return "TEXT DEFAULT NULL";
      case "literal":
        if (typeof fieldDef.value === "string") return `TEXT${nullSuffix}`;
        if (typeof fieldDef.value === "number") return `REAL${nullSuffix}`;
        if (typeof fieldDef.value === "boolean") return `INTEGER${nullSuffix}`;
        return `TEXT${nullSuffix}`;
      default:
        throw new Error(`Unsupported type: ${type}`);
    }
  }
  // ============================================================================
  // Schema Management Methods
  // ============================================================================
  /**
   * Validate table name
   */
  validateTableName(name) {
    if (!name || name.trim() === "") {
      throw new Error("Invalid table name: name cannot be empty");
    }
    if (RESERVED_TABLES.has(name)) {
      throw new Error(`Reserved table name: ${name}`);
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid table name: ${name}`);
    }
  }
  /**
   * Validate field name
   */
  validateFieldName(name) {
    if (name.startsWith("_")) {
      throw new Error(`Invalid field name: ${name} (underscore prefix reserved for system fields)`);
    }
  }
  /**
   * Generate CREATE TABLE SQL from schema
   */
  generateCreateTableSQL(schema) {
    this.validateTableName(schema.name);
    const columns = [
      '"_id" TEXT PRIMARY KEY',
      '"_creationTime" INTEGER NOT NULL'
    ];
    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      this.validateFieldName(fieldName);
      if (fieldDef.type === "id" && !fieldDef.table) {
        throw new Error(`ID field "${fieldName}" missing table reference`);
      }
      const sqlType = this.convexTypeToSQLite(fieldDef);
      columns.push(`"${fieldName}" ${sqlType}`);
      if (fieldDef.type === "id") {
        columns.push(`CHECK(typeof("${fieldName}") = 'text' OR "${fieldName}" IS NULL)`);
      }
    }
    return `CREATE TABLE "${schema.name}" (${columns.join(", ")})`;
  }
  /**
   * Generate CREATE INDEX SQL
   */
  generateCreateIndexSQL(tableName, indexDef) {
    const uniqueKeyword = indexDef.unique ? "UNIQUE " : "";
    const indexName = `${tableName}_${indexDef.name}`;
    const fields = indexDef.fields.map((f) => `"${f}"`).join(", ");
    return `CREATE ${uniqueKeyword}INDEX "${indexName}" ON "${tableName}" (${fields})`;
  }
  /**
   * Create a table from schema definition
   */
  async createTable(schema) {
    await this.ensureInitialized();
    this.validateTableName(schema.name);
    for (const fieldName of Object.keys(schema.fields)) {
      this.validateFieldName(fieldName);
    }
    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      if (fieldDef.type === "id" && !fieldDef.table) {
        throw new Error(`ID field "${fieldName}" missing table reference`);
      }
    }
    for (const index of schema.indexes) {
      for (const field of index.fields) {
        if (!schema.fields[field] && field !== "_id" && field !== "_creationTime") {
          throw new Error(`Index "${index.name}" references field "${field}" which does not exist`);
        }
      }
    }
    const createTableSQL = this.generateCreateTableSQL(schema);
    this.sql.exec(createTableSQL);
    for (const index of schema.indexes) {
      const createIndexSQL = this.generateCreateIndexSQL(schema.name, index);
      this.sql.exec(createIndexSQL);
    }
    this.tables.add(schema.name);
    this.sql.exec(
      `INSERT OR REPLACE INTO _metadata (key, value) VALUES ('tables', ?)`,
      JSON.stringify([...this.tables])
    );
  }
  /**
   * Get current schema version
   */
  async getCurrentSchemaVersion() {
    await this.ensureInitialized();
    const result = this.sql.exec(
      "SELECT MAX(version) as version FROM _schema_versions"
    ).toArray();
    const firstRow = result[0];
    if (result.length === 0 || firstRow === void 0 || firstRow.version === null) {
      return 0;
    }
    return firstRow.version;
  }
  /**
   * Compute a hash for a schema definition
   */
  computeSchemaHash(schema) {
    const str = JSON.stringify(schema);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
  /**
   * Apply a migration plan
   */
  async applyMigration(migration) {
    await this.ensureInitialized();
    const currentVersion = await this.getCurrentSchemaVersion();
    if (migration.fromVersion !== currentVersion) {
      throw new Error(`Version conflict: expected version ${migration.fromVersion}, current version is ${currentVersion}`);
    }
    if (migration.expectedSchemaHash) {
      const result = this.sql.exec(
        "SELECT schema_hash FROM _schema_versions WHERE version = ?",
        migration.fromVersion
      ).toArray();
      if (result.length > 0 && result[0]?.schema_hash !== migration.expectedSchemaHash) {
        throw new Error(`Schema hash mismatch: expected ${migration.expectedSchemaHash}`);
      }
    }
    this.sql.exec("BEGIN TRANSACTION");
    try {
      for (const op of migration.operations) {
        switch (op.type) {
          case "addColumn":
            const colType = op.definition ? this.convexTypeToSQLite(op.definition) : "TEXT";
            this.sql.exec(`ALTER TABLE "${op.table}" ADD COLUMN "${op.column}" ${colType}`);
            break;
          case "dropColumn":
            this.sql.exec(`ALTER TABLE "${op.table}" DROP COLUMN "${op.column}"`);
            break;
          case "createTable":
            break;
          case "dropTable":
            this.sql.exec(`DROP TABLE IF EXISTS "${op.table}"`);
            break;
          case "createIndex":
            if (op.index) {
              const indexSQL = this.generateCreateIndexSQL(op.table, op.index);
              this.sql.exec(indexSQL);
            }
            break;
          case "dropIndex":
            if (op.index) {
              this.sql.exec(`DROP INDEX IF EXISTS "${op.table}_${op.index.name}"`);
            }
            break;
        }
      }
      this.sql.exec(
        "INSERT INTO _schema_versions (version, applied_at, schema_hash) VALUES (?, ?, ?)",
        migration.toVersion,
        Date.now(),
        "migrated"
      );
      this.sql.exec("COMMIT");
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    }
  }
  /**
   * Apply a full schema definition
   */
  async applySchema(schema) {
    await this.ensureInitialized();
    const schemaHash = this.computeSchemaHash(schema);
    const currentVersion = await this.getCurrentSchemaVersion();
    const newVersion = currentVersion + 1;
    for (const tableSchema of Object.values(schema.tables)) {
      await this.createTable(tableSchema);
    }
    this.sql.exec(
      "INSERT INTO _schema_versions (version, applied_at, schema_hash) VALUES (?, ?, ?)",
      newVersion,
      Date.now(),
      schemaHash
    );
  }
  // ============================================================================
  // System Table Methods
  // ============================================================================
  /**
   * List all document IDs in a table
   */
  async listDocumentIds(tableName) {
    await this.ensureInitialized();
    const result = this.sql.exec(
      "SELECT _id FROM _documents WHERE _table = ?",
      tableName
    ).toArray();
    return result.map((row) => row._id);
  }
  /**
   * Get document count for a table
   */
  async getDocumentCount(tableName) {
    await this.ensureInitialized();
    const result = this.sql.exec(
      "SELECT COUNT(*) as count FROM _documents WHERE _table = ?",
      tableName
    ).toArray();
    return result[0]?.count ?? 0;
  }
  /**
   * Handle HTTP requests to this Durable Object
   */
  async fetch(request) {
    const url = new URL(request.url);
    url.pathname;
    try {
      await this.ensureInitialized();
      if (request.method === "POST") {
        const body = await request.json();
        switch (body.operation) {
          case "insert":
            const insertId = await this.insert(body.table, body.doc);
            return Response.json({ id: insertId });
          case "get":
            const doc = await this.get(body.table, body.id);
            return Response.json({ document: doc });
          case "patch":
            await this.patch(body.table, body.id, body.fields);
            return Response.json({ success: true });
          case "replace":
            await this.replace(body.table, body.id, body.doc);
            return Response.json({ success: true });
          case "delete":
            await this.delete(body.table, body.id);
            return Response.json({ success: true });
          case "query":
            const results = await this.query(body.table, body.filters, body.options);
            return Response.json({ documents: results });
          default:
            return Response.json({ error: "Unknown operation" }, { status: 400 });
        }
      }
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    } catch (error) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      );
    }
  }
};

// src/durable-objects/ConvexSubscription.ts
var ConvexSubscription = class {
  state;
  env;
  subscriptions = /* @__PURE__ */ new Map();
  clientSubscriptions = /* @__PURE__ */ new Map();
  authenticatedClients = /* @__PURE__ */ new Map();
  // clientId -> token
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get("subscriptions");
      if (stored) {
        this.subscriptions = stored;
        for (const [subId, sub] of this.subscriptions) {
          if (!this.clientSubscriptions.has(sub.clientId)) {
            this.clientSubscriptions.set(sub.clientId, /* @__PURE__ */ new Set());
          }
          this.clientSubscriptions.get(sub.clientId).add(subId);
        }
      }
    });
  }
  /**
   * Generate a subscription ID
   */
  generateSubscriptionId(clientId, queryPath, args) {
    const argsHash = this.hashArgs(args);
    return `${clientId}:${queryPath}:${argsHash}`;
  }
  /**
   * Hash args for subscription deduplication
   */
  hashArgs(args) {
    const str = JSON.stringify(args);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
  /**
   * Subscribe to a query
   */
  async subscribe(clientId, queryPath, args) {
    const subscriptionId = this.generateSubscriptionId(clientId, queryPath, args);
    const subscription = {
      clientId,
      queryPath,
      args,
      lastResult: null,
      lastTimestamp: 0
    };
    this.subscriptions.set(subscriptionId, subscription);
    if (!this.clientSubscriptions.has(clientId)) {
      this.clientSubscriptions.set(clientId, /* @__PURE__ */ new Set());
    }
    this.clientSubscriptions.get(clientId).add(subscriptionId);
    await this.state.storage.put("subscriptions", this.subscriptions);
    return subscriptionId;
  }
  /**
   * Unsubscribe from a query
   */
  async unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;
    this.subscriptions.delete(subscriptionId);
    const clientSubs = this.clientSubscriptions.get(subscription.clientId);
    if (clientSubs) {
      clientSubs.delete(subscriptionId);
      if (clientSubs.size === 0) {
        this.clientSubscriptions.delete(subscription.clientId);
      }
    }
    await this.state.storage.put("subscriptions", this.subscriptions);
  }
  /**
   * Unsubscribe all subscriptions for a client
   */
  async unsubscribeClient(clientId) {
    const clientSubs = this.clientSubscriptions.get(clientId);
    if (!clientSubs) return;
    for (const subId of clientSubs) {
      this.subscriptions.delete(subId);
    }
    this.clientSubscriptions.delete(clientId);
    await this.state.storage.put("subscriptions", this.subscriptions);
  }
  /**
   * Update the result of a subscription (after query re-execution)
   */
  async updateSubscriptionResult(subscriptionId, result) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;
    const resultStr = JSON.stringify(result);
    const lastResultStr = JSON.stringify(subscription.lastResult);
    if (resultStr !== lastResultStr) {
      subscription.lastResult = result;
      subscription.lastTimestamp = Date.now();
      await this.state.storage.put("subscriptions", this.subscriptions);
      return true;
    }
    return false;
  }
  /**
   * Get subscriptions that might be affected by a table change
   */
  getAffectedSubscriptions(tableName) {
    const affected = [];
    for (const subscription of this.subscriptions.values()) {
      if (this.queryMightTouchTable(subscription.queryPath, tableName)) {
        affected.push(subscription);
      }
    }
    return affected;
  }
  /**
   * Check if a query might touch a specific table
   */
  queryMightTouchTable(queryPath, tableName) {
    const parts = queryPath.split(":");
    return parts[0] === tableName || queryPath.includes(tableName);
  }
  /**
   * Handle WebSocket connections
   */
  async fetch(request) {
    new URL(request.url);
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.state.acceptWebSocket(server);
      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }
    if (request.method === "POST") {
      const body = await request.json();
      switch (body.operation) {
        case "subscribe":
          const subId = await this.subscribe(
            body.clientId,
            body.queryPath,
            body.args
          );
          return Response.json({ subscriptionId: subId });
        case "unsubscribe":
          await this.unsubscribe(body.subscriptionId);
          return Response.json({ success: true });
        case "unsubscribeClient":
          await this.unsubscribeClient(body.clientId);
          return Response.json({ success: true });
        case "updateResult":
          const changed = await this.updateSubscriptionResult(
            body.subscriptionId,
            body.result
          );
          return Response.json({ changed });
        case "getAffected":
          const affected = this.getAffectedSubscriptions(body.tableName);
          return Response.json({ subscriptions: affected });
        default:
          return Response.json({ error: "Unknown operation" }, { status: 400 });
      }
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  /**
   * Handle incoming WebSocket messages
   */
  async webSocketMessage(ws, message) {
    if (typeof message !== "string") {
      ws.send(JSON.stringify({ error: "Binary messages not supported" }));
      return;
    }
    try {
      const msg = JSON.parse(message);
      switch (msg.type) {
        case "subscribe":
          const subId = await this.subscribe(
            this.getClientId(ws),
            msg.queryPath,
            msg.args
          );
          ws.send(JSON.stringify({
            type: "subscribed",
            subscriptionId: subId
          }));
          break;
        case "unsubscribe":
          await this.unsubscribe(msg.subscriptionId);
          ws.send(JSON.stringify({
            type: "unsubscribed",
            subscriptionId: msg.subscriptionId
          }));
          break;
        case "authenticate":
          this.authenticatedClients.set(this.getClientId(ws), msg.token);
          ws.send(JSON.stringify({ type: "authenticated" }));
          break;
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;
        default:
          ws.send(JSON.stringify({ error: `Unknown message type: ${msg.type}` }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ error: error.message }));
    }
  }
  /**
   * Handle WebSocket close
   */
  async webSocketClose(ws, code, reason) {
    const clientId = this.getClientId(ws);
    await this.unsubscribeClient(clientId);
    this.authenticatedClients.delete(clientId);
  }
  /**
   * Get client ID for a WebSocket
   */
  getClientId(ws) {
    const attachment = this.state.getWebSocketAttachment(ws);
    if (attachment?.clientId) {
      return attachment.clientId;
    }
    const clientId = crypto.randomUUID();
    this.state.setWebSocketAttachment(ws, { clientId });
    return clientId;
  }
  /**
   * Broadcast update to subscribed clients
   */
  async broadcastUpdate(subscriptionId, data) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;
    const message = JSON.stringify({
      type: "update",
      subscriptionId,
      data
    });
    for (const ws of this.state.getWebSockets()) {
      const clientId = this.getClientId(ws);
      if (clientId === subscription.clientId) {
        try {
          ws.send(message);
        } catch {
        }
      }
    }
  }
};

// src/durable-objects/ConvexScheduler.ts
var ConvexScheduler = class {
  state;
  env;
  sql;
  initialized = false;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
  }
  /**
   * Initialize the scheduler tables
   */
  async ensureInitialized() {
    if (this.initialized) return;
    await this.state.blockConcurrencyWhile(async () => {
      if (this.initialized) return;
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_functions (
          id TEXT PRIMARY KEY,
          function_path TEXT NOT NULL,
          args TEXT NOT NULL,
          run_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL,
          completed_at INTEGER,
          error TEXT,
          retries INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 3
        )
      `);
      this.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_scheduled_run_at
        ON scheduled_functions (run_at)
        WHERE status = 'pending'
      `);
      this.initialized = true;
    });
  }
  /**
   * Generate a unique scheduled function ID
   */
  generateId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
  /**
   * Schedule a function to run after a delay
   */
  async runAfter(delayMs, functionPath, args) {
    await this.ensureInitialized();
    const id = this.generateId();
    const runAt = Date.now() + delayMs;
    const createdAt = Date.now();
    this.sql.exec(
      `INSERT INTO scheduled_functions (id, function_path, args, run_at, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      id,
      functionPath,
      JSON.stringify(args),
      runAt,
      createdAt
    );
    await this.scheduleNextAlarm();
    return id;
  }
  /**
   * Schedule a function to run at a specific time
   */
  async runAt(timestamp, functionPath, args) {
    const delayMs = Math.max(0, timestamp - Date.now());
    return this.runAfter(delayMs, functionPath, args);
  }
  /**
   * Cancel a scheduled function
   */
  async cancel(scheduledId) {
    await this.ensureInitialized();
    const result = this.sql.exec(
      `UPDATE scheduled_functions
       SET status = 'canceled', completed_at = ?
       WHERE id = ? AND status = 'pending'`,
      Date.now(),
      scheduledId
    );
    return result.rowsWritten > 0;
  }
  /**
   * Get a scheduled function by ID
   */
  async get(scheduledId) {
    await this.ensureInitialized();
    const results = this.sql.exec(
      `SELECT * FROM scheduled_functions WHERE id = ?`,
      scheduledId
    ).toArray();
    if (results.length === 0 || !results[0]) {
      return null;
    }
    const row = results[0];
    return {
      id: row.id,
      functionPath: row.function_path,
      args: JSON.parse(row.args),
      runAt: row.run_at,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      error: row.error,
      retries: row.retries,
      maxRetries: row.max_retries
    };
  }
  /**
   * List scheduled functions
   */
  async list(status, limit = 100) {
    await this.ensureInitialized();
    let sql = `SELECT * FROM scheduled_functions`;
    const params = [];
    if (status) {
      sql += ` WHERE status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY run_at ASC LIMIT ?`;
    params.push(limit);
    const results = this.sql.exec(sql, ...params).toArray();
    return results.map((row) => ({
      id: row.id,
      functionPath: row.function_path,
      args: JSON.parse(row.args),
      runAt: row.run_at,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      error: row.error,
      retries: row.retries,
      maxRetries: row.max_retries
    }));
  }
  /**
   * Schedule the next alarm for pending functions
   */
  async scheduleNextAlarm() {
    const results = this.sql.exec(
      `SELECT MIN(run_at) as next_run FROM scheduled_functions WHERE status = 'pending'`
    ).toArray();
    if (results.length > 0 && results[0]?.next_run) {
      const nextRun = results[0].next_run;
      await this.state.storage.setAlarm(nextRun);
    }
  }
  /**
   * Handle alarm - execute due scheduled functions
   */
  async alarm() {
    await this.ensureInitialized();
    const now = Date.now();
    const due = this.sql.exec(
      `SELECT * FROM scheduled_functions
       WHERE status = 'pending' AND run_at <= ?
       ORDER BY run_at ASC`,
      now
    ).toArray();
    for (const row of due) {
      const func = {
        id: row.id,
        functionPath: row.function_path,
        args: JSON.parse(row.args),
        runAt: row.run_at,
        status: "running",
        createdAt: row.created_at,
        retries: row.retries,
        maxRetries: row.max_retries
      };
      this.sql.exec(
        `UPDATE scheduled_functions SET status = 'running' WHERE id = ?`,
        func.id
      );
      try {
        await this.executeFunction(func);
        this.sql.exec(
          `UPDATE scheduled_functions SET status = 'completed', completed_at = ? WHERE id = ?`,
          Date.now(),
          func.id
        );
      } catch (error) {
        const errorMessage = error.message;
        if (func.retries < func.maxRetries) {
          const backoffMs = Math.pow(2, func.retries) * 1e3;
          const newRunAt = Date.now() + backoffMs;
          this.sql.exec(
            `UPDATE scheduled_functions
             SET status = 'pending', run_at = ?, retries = retries + 1, error = ?
             WHERE id = ?`,
            newRunAt,
            errorMessage,
            func.id
          );
        } else {
          this.sql.exec(
            `UPDATE scheduled_functions
             SET status = 'failed', completed_at = ?, error = ?
             WHERE id = ?`,
            Date.now(),
            errorMessage,
            func.id
          );
        }
      }
    }
    await this.scheduleNextAlarm();
  }
  /**
   * Execute a scheduled function
   */
  async executeFunction(func) {
    console.log(`Executing scheduled function: ${func.functionPath}`, func.args);
  }
  /**
   * Handle HTTP requests
   */
  async fetch(request) {
    try {
      await this.ensureInitialized();
      if (request.method === "POST") {
        const body = await request.json();
        switch (body.operation) {
          case "runAfter":
            const afterId = await this.runAfter(
              body.delayMs,
              body.functionPath,
              body.args
            );
            return Response.json({ scheduledId: afterId });
          case "runAt":
            const atId = await this.runAt(
              body.timestamp,
              body.functionPath,
              body.args
            );
            return Response.json({ scheduledId: atId });
          case "cancel":
            const canceled = await this.cancel(body.scheduledId);
            return Response.json({ canceled });
          case "get":
            const func = await this.get(body.scheduledId);
            return Response.json({ scheduledFunction: func });
          case "list":
            const functions = await this.list(body.status, body.limit);
            return Response.json({ scheduledFunctions: functions });
          default:
            return Response.json({ error: "Unknown operation" }, { status: 400 });
        }
      }
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    } catch (error) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      );
    }
  }
};

// src/durable-objects/ConvexStorage.ts
var ConvexStorage = class {
  state;
  env;
  files = /* @__PURE__ */ new Map();
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get("files");
      if (stored) {
        this.files = stored;
      }
    });
  }
  /**
   * Generate a storage ID
   */
  generateStorageId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return "kg" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
  /**
   * Generate an upload URL for direct client upload
   */
  async generateUploadUrl() {
    const storageId = this.generateStorageId();
    const expiresAt = Date.now() + 60 * 60 * 1e3;
    await this.state.storage.put(`pending:${storageId}`, {
      storageId,
      expiresAt
    });
    const uploadUrl = `/storage/upload/${storageId}`;
    return {
      uploadUrl,
      storageId,
      expiresAt
    };
  }
  /**
   * Store a file
   */
  async store(storageId, data, contentType, metadata = {}) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    const sha256 = Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
    await this.env.STORAGE_BUCKET.put(storageId, data, {
      httpMetadata: {
        contentType: contentType || "application/octet-stream"
      },
      customMetadata: metadata
    });
    const file = {
      storageId,
      sha256,
      size: data.byteLength,
      contentType,
      uploadedAt: Date.now(),
      metadata
    };
    this.files.set(storageId, file);
    await this.state.storage.put("files", this.files);
    await this.state.storage.delete(`pending:${storageId}`);
    return file;
  }
  /**
   * Get file metadata
   */
  async getMetadata(storageId) {
    return this.files.get(storageId) || null;
  }
  /**
   * Get a file URL for downloading
   */
  async getUrl(storageId) {
    const file = this.files.get(storageId);
    if (!file) return null;
    return `/storage/download/${storageId}`;
  }
  /**
   * Get file data
   */
  async getData(storageId) {
    const object = await this.env.STORAGE_BUCKET.get(storageId);
    if (!object) return null;
    return object.arrayBuffer();
  }
  /**
   * Delete a file
   */
  async delete(storageId) {
    const existed = this.files.has(storageId);
    if (existed) {
      await this.env.STORAGE_BUCKET.delete(storageId);
      this.files.delete(storageId);
      await this.state.storage.put("files", this.files);
    }
    return existed;
  }
  /**
   * List files with optional prefix
   */
  async list(options = {}) {
    const limit = options.limit || 100;
    const files = Array.from(this.files.values()).sort((a, b) => b.uploadedAt - a.uploadedAt).slice(0, limit);
    return { files };
  }
  /**
   * Handle HTTP requests
   */
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (request.method === "POST" && path.startsWith("/storage/upload/")) {
        const storageId = path.replace("/storage/upload/", "");
        const pending = await this.state.storage.get(`pending:${storageId}`);
        if (!pending) {
          return Response.json(
            { error: "Invalid or expired upload URL" },
            { status: 400 }
          );
        }
        const data = await request.arrayBuffer();
        const contentType = request.headers.get("Content-Type");
        const file = await this.store(storageId, data, contentType);
        return Response.json({ file });
      }
      if (request.method === "GET" && path.startsWith("/storage/download/")) {
        const storageId = path.replace("/storage/download/", "");
        const file = this.files.get(storageId);
        if (!file) {
          return Response.json({ error: "File not found" }, { status: 404 });
        }
        const data = await this.getData(storageId);
        if (!data) {
          return Response.json({ error: "File data not found" }, { status: 404 });
        }
        return new Response(data, {
          headers: {
            "Content-Type": file.contentType || "application/octet-stream",
            "Content-Length": file.size.toString(),
            "ETag": `"${file.sha256}"`
          }
        });
      }
      if (request.method === "POST") {
        const body = await request.json();
        switch (body.operation) {
          case "generateUploadUrl":
            const uploadUrl = await this.generateUploadUrl();
            return Response.json(uploadUrl);
          case "getMetadata":
            const metadata = await this.getMetadata(body.storageId);
            return Response.json({ file: metadata });
          case "getUrl":
            const fileUrl = await this.getUrl(body.storageId);
            return Response.json({ url: fileUrl });
          case "delete":
            const deleted = await this.delete(body.storageId);
            return Response.json({ deleted });
          case "list":
            const result = await this.list({
              limit: body.limit,
              cursor: body.cursor
            });
            return Response.json(result);
          default:
            return Response.json({ error: "Unknown operation" }, { status: 400 });
        }
      }
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    } catch (error) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      );
    }
  }
};

// src/index.ts
var app = new Hono();
app.use("/*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "Convex-Client"]
}));
app.get("/", (c) => {
  return c.json({
    name: "convex.do",
    version: "0.0.1",
    status: "ok",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.post("/api/query", async (c) => {
  const { path, args, format: _format } = await c.req.json();
  return c.json({
    status: "not_implemented",
    path,
    args
  });
});
app.post("/api/mutation", async (c) => {
  const { path, args, format: _format } = await c.req.json();
  return c.json({
    status: "not_implemented",
    path,
    args
  });
});
app.post("/api/action", async (c) => {
  const { path, args, format: _format } = await c.req.json();
  return c.json({
    status: "not_implemented",
    path,
    args
  });
});
app.get("/sync", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.text("Expected WebSocket", 426);
  }
  return c.text("WebSocket not yet implemented", 501);
});
var src_default = app;

export { ConvexDatabase, ConvexScheduler, ConvexStorage, ConvexSubscription, src_default as default };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map