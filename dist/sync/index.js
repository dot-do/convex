// src/sync/conflict.ts
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aObj = a;
    const bObj = b;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }
  return false;
}
function getAllKeys(obj1, obj2) {
  const keys = /* @__PURE__ */ new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
  return Array.from(keys);
}
var ConflictResolver = class {
  defaultStrategy;
  conflictHandler;
  fieldStrategies = {};
  versionGenerator;
  conflictListeners = /* @__PURE__ */ new Set();
  constructor(options = {}) {
    this.defaultStrategy = options.defaultStrategy ?? "server-wins";
    this.conflictHandler = options.onConflict;
    this.versionGenerator = options.versionGenerator ?? ((serverVersion) => serverVersion + 1);
  }
  /**
   * Detect conflicts between local and server changes
   */
  detectConflict(localChange, serverChange) {
    if (localChange.documentId !== serverChange.documentId || localChange.table !== serverChange.table) {
      return null;
    }
    if (localChange.type === "delete" && serverChange.type === "delete") {
      return null;
    }
    if (localChange.type === "insert" && serverChange.type === "insert" && localChange.documentId !== serverChange.documentId) {
      return null;
    }
    let conflictType;
    if (localChange.type === "delete" && serverChange.type === "update") {
      conflictType = "delete-update";
    } else if (localChange.type === "update" && serverChange.type === "delete") {
      conflictType = "update-delete";
    } else {
      const fieldConflicts = this.detectFieldConflicts(localChange.fields, serverChange.fields);
      if (fieldConflicts.length === 0) {
        return null;
      }
      conflictType = "field-conflict";
    }
    const conflict = {
      type: conflictType,
      localChange,
      serverChange,
      fieldConflicts: conflictType === "field-conflict" ? this.detectFieldConflicts(localChange.fields, serverChange.fields) : [],
      localVersion: localChange.version,
      serverVersion: serverChange.version,
      versionDiff: serverChange.version - localChange.version,
      localTimestamp: localChange.timestamp,
      serverTimestamp: serverChange.timestamp,
      isLocalStale: serverChange.version - localChange.version > 1
    };
    this.notifyListeners(conflict);
    if (this.conflictHandler) {
      this.conflictHandler(conflict);
    }
    return conflict;
  }
  /**
   * Detect field-level conflicts between two field objects
   */
  detectFieldConflicts(localFields, serverFields) {
    const conflicts = [];
    const localKeys = new Set(Object.keys(localFields));
    const serverKeys = new Set(Object.keys(serverFields));
    for (const key of localKeys) {
      if (serverKeys.has(key)) {
        const localValue = localFields[key];
        const serverValue = serverFields[key];
        if (!deepEqual(localValue, serverValue)) {
          conflicts.push({
            field: key,
            localValue,
            serverValue
          });
        }
      }
    }
    return conflicts;
  }
  /**
   * Resolve a conflict using the specified strategy
   */
  resolveConflict(conflict, strategy) {
    if (typeof strategy === "function") {
      const result = strategy(conflict.localChange, conflict.serverChange);
      if (!result || typeof result !== "object" || !result.fields) {
        throw new Error("Invalid resolution result: custom resolver must return an object with fields and version");
      }
      return {
        type: result.type ?? conflict.serverChange.type,
        fields: result.fields,
        version: result.version,
        resolutionStrategy: "custom"
      };
    }
    if (!["server-wins", "client-wins", "merge", "manual"].includes(strategy)) {
      throw new Error(`Invalid conflict strategy: ${strategy}`);
    }
    if (strategy === "manual") {
      if (!this.conflictHandler) {
        throw new Error("Manual resolution requires a conflict handler to be configured");
      }
      const result = this.conflictHandler(conflict);
      if (result instanceof Promise) {
        throw new Error("For async handlers, use resolveConflictAsync instead");
      }
      return {
        ...result,
        resolutionStrategy: "manual"
      };
    }
    if (conflict.type === "delete-update" || conflict.type === "update-delete") {
      return this.resolveDeleteConflict(conflict, strategy);
    }
    switch (strategy) {
      case "server-wins":
        return this.resolveServerWins(conflict);
      case "client-wins":
        return this.resolveClientWins(conflict);
      case "merge":
        return this.resolveMerge(conflict);
      default:
        throw new Error(`Invalid conflict strategy: ${strategy}`);
    }
  }
  /**
   * Resolve a conflict asynchronously (for async handlers)
   */
  async resolveConflictAsync(conflict, strategy) {
    if (strategy === "manual" && this.conflictHandler) {
      const result = await this.conflictHandler(conflict);
      return {
        ...result,
        resolutionStrategy: "manual"
      };
    }
    return this.resolveConflict(conflict, strategy);
  }
  /**
   * Resolve using server-wins strategy
   */
  resolveServerWins(conflict) {
    return {
      type: conflict.serverChange.type,
      fields: { ...conflict.serverChange.fields },
      version: conflict.serverVersion,
      resolutionStrategy: "server-wins"
    };
  }
  /**
   * Resolve using client-wins strategy
   */
  resolveClientWins(conflict) {
    return {
      type: conflict.localChange.type,
      fields: { ...conflict.localChange.fields },
      version: this.versionGenerator(conflict.serverVersion),
      resolutionStrategy: "client-wins"
    };
  }
  /**
   * Resolve using merge strategy
   */
  resolveMerge(conflict) {
    const localFields = conflict.localChange.fields;
    const serverFields = conflict.serverChange.fields;
    const mergedFields = {};
    const mergedFieldNames = [];
    const allKeys = getAllKeys(localFields, serverFields);
    for (const key of allKeys) {
      const inLocal = key in localFields;
      const inServer = key in serverFields;
      if (inLocal && inServer) {
        const localValue = localFields[key];
        const serverValue = serverFields[key];
        if (deepEqual(localValue, serverValue)) {
          mergedFields[key] = serverValue;
        } else {
          const fieldStrategy = this.getFieldStrategy(conflict.localChange.table, key);
          if (fieldStrategy === "client-wins") {
            mergedFields[key] = localValue;
          } else {
            mergedFields[key] = serverValue;
          }
        }
      } else if (inLocal) {
        mergedFields[key] = localFields[key];
        mergedFieldNames.push(key);
      } else {
        mergedFields[key] = serverFields[key];
        mergedFieldNames.push(key);
      }
    }
    return {
      type: conflict.serverChange.type,
      fields: mergedFields,
      version: this.versionGenerator(conflict.serverVersion),
      resolutionStrategy: "merge",
      mergedFields: mergedFieldNames
    };
  }
  /**
   * Resolve delete conflicts
   */
  resolveDeleteConflict(conflict, strategy) {
    if (conflict.type === "delete-update") {
      if (strategy === "client-wins") {
        return {
          type: "delete",
          fields: {},
          version: this.versionGenerator(conflict.serverVersion),
          resolutionStrategy: strategy
        };
      } else {
        return {
          type: "update",
          fields: { ...conflict.serverChange.fields },
          version: conflict.serverVersion,
          resolutionStrategy: strategy
        };
      }
    } else {
      if (strategy === "client-wins") {
        return {
          type: "update",
          fields: { ...conflict.localChange.fields },
          version: this.versionGenerator(conflict.serverVersion),
          resolutionStrategy: strategy
        };
      } else {
        return {
          type: "delete",
          fields: {},
          version: conflict.serverVersion,
          resolutionStrategy: strategy
        };
      }
    }
  }
  /**
   * Auto-resolve non-conflicting changes
   */
  autoResolve(localChange, serverChange) {
    const mergedFields = {
      ...localChange.fields,
      ...serverChange.fields
    };
    return {
      type: serverChange.type,
      fields: mergedFields,
      version: this.versionGenerator(serverChange.version),
      resolutionStrategy: "merge",
      baseFields: localChange.baseFields ?? serverChange.baseFields
    };
  }
  /**
   * Set strategy for a specific field in a table
   */
  setFieldStrategy(table, field, strategy) {
    if (!this.fieldStrategies[table]) {
      this.fieldStrategies[table] = {};
    }
    this.fieldStrategies[table][field] = strategy;
  }
  /**
   * Get strategy for a specific field in a table
   */
  getFieldStrategy(table, field) {
    return this.fieldStrategies[table]?.[field] ?? this.defaultStrategy;
  }
  /**
   * Clear strategy for a specific field
   */
  clearFieldStrategy(table, field) {
    if (this.fieldStrategies[table]) {
      delete this.fieldStrategies[table][field];
    }
  }
  /**
   * Clear all field strategies
   */
  clearAllFieldStrategies() {
    for (const table of Object.keys(this.fieldStrategies)) {
      delete this.fieldStrategies[table];
    }
  }
  /**
   * Add a conflict listener
   */
  addConflictListener(listener) {
    this.conflictListeners.add(listener);
  }
  /**
   * Remove a conflict listener
   */
  removeConflictListener(listener) {
    this.conflictListeners.delete(listener);
  }
  /**
   * Notify all listeners of a conflict
   */
  notifyListeners(conflict) {
    for (const listener of this.conflictListeners) {
      listener(conflict);
    }
  }
};

// src/sync/subscription.ts
var SubscriptionState = /* @__PURE__ */ ((SubscriptionState2) => {
  SubscriptionState2["Pending"] = "pending";
  SubscriptionState2["Active"] = "active";
  SubscriptionState2["Error"] = "error";
  SubscriptionState2["Closed"] = "closed";
  return SubscriptionState2;
})(SubscriptionState || {});
var SubscriptionError = class _SubscriptionError extends Error {
  /** Error code */
  code;
  /** Associated subscription ID */
  subscriptionId;
  constructor(message, code, subscriptionId) {
    super(message);
    this.name = "SubscriptionError";
    this.code = code;
    this.subscriptionId = subscriptionId;
    Object.setPrototypeOf(this, _SubscriptionError.prototype);
  }
};
var Subscription = class {
  /** Unique subscription ID */
  id;
  /** Query path */
  query;
  /** Query arguments */
  args;
  /** Subscription options */
  options;
  /** Creation timestamp */
  createdAt;
  /** Current subscription state */
  _state = "pending" /* Pending */;
  /** Current data */
  _data;
  /** Current error */
  _error;
  /** Last update timestamp */
  _updatedAt;
  /** Data history (if tracking enabled) */
  _history;
  /** Callback function */
  _callback;
  /** Reference to the manager */
  _manager;
  /** Whether initial callback has been skipped */
  _initialSkipped = false;
  constructor(id, query, args, callback, manager, options, trackHistory) {
    this.id = id;
    this.query = query;
    this.args = args;
    this._callback = callback;
    this._manager = manager;
    this.options = options;
    this.createdAt = Date.now();
    if (trackHistory) {
      this._history = [];
    }
  }
  // Getters for state
  get state() {
    return this._state;
  }
  get data() {
    return this._data;
  }
  get error() {
    return this._error;
  }
  get updatedAt() {
    return this._updatedAt;
  }
  get history() {
    return this._history;
  }
  get isActive() {
    return this._state === "active" /* Active */;
  }
  get isPending() {
    return this._state === "pending" /* Pending */;
  }
  get isClosed() {
    return this._state === "closed" /* Closed */;
  }
  get hasError() {
    return this._state === "error" /* Error */;
  }
  // Internal methods (called by manager)
  /** @internal */
  _setState(state) {
    this._state = state;
  }
  /** @internal */
  _setData(data, options) {
    if (options?.isInitial && this.options?.skipInitialCallback && !this._initialSkipped) {
      this._initialSkipped = true;
      this._data = data;
      this._updatedAt = Date.now();
      this._state = "active" /* Active */;
      this._error = void 0;
      if (this._history) {
        this._history.push(data);
      }
      return true;
    }
    this._data = data;
    this._updatedAt = Date.now();
    this._state = "active" /* Active */;
    this._error = void 0;
    if (this._history) {
      this._history.push(data);
    }
    try {
      this._callback(data);
    } catch {
    }
    return true;
  }
  /** @internal */
  _setError(error) {
    this._error = error;
    this._state = "error" /* Error */;
    if (this.options?.onError) {
      try {
        this.options.onError(error);
      } catch {
      }
    }
  }
  /** @internal */
  _close() {
    this._state = "closed" /* Closed */;
  }
  /**
   * Unsubscribe from this subscription.
   */
  unsubscribe() {
    this._manager.unsubscribe(this.id);
  }
  /**
   * Convert subscription to JSON representation.
   */
  toJSON() {
    return {
      id: this.id,
      query: this.query,
      args: this.args,
      state: this._state,
      data: this._data,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt
    };
  }
};
function hashQueryArgs(query, args) {
  const str = JSON.stringify({ query, args });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `${query}:${hash.toString(36)}`;
}
function generateSubscriptionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `sub_${timestamp}_${random}`;
}
var SubscriptionManager = class {
  _options;
  _subscriptions = /* @__PURE__ */ new Map();
  _disposed = false;
  // For deduplication
  _queryRefCounts = /* @__PURE__ */ new Map();
  _querySubscriptions = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    this._options = options;
  }
  /**
   * Subscribe to a query with a callback.
   */
  subscribe(query, args, callback, options) {
    if (this._disposed) {
      throw new SubscriptionError(
        "Cannot subscribe: SubscriptionManager has been disposed",
        "MANAGER_DISPOSED"
      );
    }
    const id = generateSubscriptionId();
    const subscription = new Subscription(
      id,
      query,
      args,
      callback,
      this,
      options,
      this._options.trackHistory
    );
    this._subscriptions.set(id, subscription);
    if (this._options.deduplicateSubscriptions) {
      const queryHash = hashQueryArgs(query, args);
      const currentCount = this._queryRefCounts.get(queryHash) || 0;
      this._queryRefCounts.set(queryHash, currentCount + 1);
      if (!this._querySubscriptions.has(queryHash)) {
        this._querySubscriptions.set(queryHash, /* @__PURE__ */ new Set());
      }
      this._querySubscriptions.get(queryHash).add(id);
    }
    if (this._options.onSubscribe) {
      this._options.onSubscribe(subscription);
    }
    return subscription;
  }
  /**
   * Unsubscribe from a subscription by ID.
   */
  unsubscribe(subscriptionId) {
    const subscription = this._subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }
    subscription._close();
    this._subscriptions.delete(subscriptionId);
    if (this._options.deduplicateSubscriptions) {
      const queryHash = hashQueryArgs(subscription.query, subscription.args);
      const currentCount = this._queryRefCounts.get(queryHash) || 0;
      if (currentCount > 1) {
        this._queryRefCounts.set(queryHash, currentCount - 1);
      } else {
        this._queryRefCounts.delete(queryHash);
      }
      const subs = this._querySubscriptions.get(queryHash);
      if (subs) {
        subs.delete(subscriptionId);
        if (subs.size === 0) {
          this._querySubscriptions.delete(queryHash);
        }
      }
    }
    if (this._options.onUnsubscribe) {
      this._options.onUnsubscribe(subscription);
    }
    return true;
  }
  /**
   * Update subscription data.
   */
  updateSubscription(subscriptionId, data, options) {
    const subscription = this._subscriptions.get(subscriptionId);
    if (!subscription || subscription.state === "closed" /* Closed */) {
      return false;
    }
    subscription._setData(data, options);
    if (this._options.onUpdate) {
      this._options.onUpdate(subscription, data);
    }
    return true;
  }
  /**
   * Set subscription error.
   */
  setSubscriptionError(subscriptionId, error) {
    const subscription = this._subscriptions.get(subscriptionId);
    if (!subscription || subscription.state === "closed" /* Closed */) {
      return false;
    }
    subscription._setError(error);
    if (this._options.onSubscriptionError) {
      this._options.onSubscriptionError(subscription, error);
    }
    return true;
  }
  /**
   * Get all subscriptions, optionally filtered.
   */
  getSubscriptions(filter) {
    let subscriptions = Array.from(this._subscriptions.values());
    subscriptions = subscriptions.filter((s) => s.state !== "closed" /* Closed */);
    if (filter?.query) {
      subscriptions = subscriptions.filter((s) => s.query === filter.query);
    }
    if (filter?.state) {
      subscriptions = subscriptions.filter((s) => s.state === filter.state);
    }
    return subscriptions;
  }
  /**
   * Get subscription by ID.
   */
  getSubscriptionById(subscriptionId) {
    return this._subscriptions.get(subscriptionId);
  }
  /**
   * Check if a subscription exists.
   */
  hasSubscription(subscriptionId) {
    const sub = this._subscriptions.get(subscriptionId);
    return sub !== void 0 && sub.state !== "closed" /* Closed */;
  }
  /**
   * Get the count of active subscriptions.
   */
  getSubscriptionCount() {
    return this.getSubscriptions().length;
  }
  /**
   * Unsubscribe all subscriptions.
   */
  unsubscribeAll() {
    for (const subscription of this._subscriptions.values()) {
      subscription._close();
      if (this._options.onUnsubscribe) {
        this._options.onUnsubscribe(subscription);
      }
    }
    this._subscriptions.clear();
    this._queryRefCounts.clear();
    this._querySubscriptions.clear();
  }
  /**
   * Unsubscribe all subscriptions for a specific query.
   */
  unsubscribeByQuery(query) {
    let removed = 0;
    const toRemove = [];
    for (const [id, subscription] of this._subscriptions) {
      if (subscription.query === query && subscription.state !== "closed" /* Closed */) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      if (this.unsubscribe(id)) {
        removed++;
      }
    }
    return removed;
  }
  /**
   * Get the reference count for a query (for deduplication).
   */
  getQueryRefCount(query, args) {
    const queryHash = hashQueryArgs(query, args);
    return this._queryRefCounts.get(queryHash) || 0;
  }
  /**
   * Check if a query is still active (has subscriptions).
   */
  hasActiveQuery(query, args) {
    const queryHash = hashQueryArgs(query, args);
    return (this._queryRefCounts.get(queryHash) || 0) > 0;
  }
  /**
   * Update all subscriptions for a specific query (for deduplication).
   */
  updateByQuery(query, args, data) {
    const queryHash = hashQueryArgs(query, args);
    const subIds = this._querySubscriptions.get(queryHash);
    if (!subIds) {
      return 0;
    }
    let updated = 0;
    for (const id of subIds) {
      if (this.updateSubscription(id, data)) {
        updated++;
      }
    }
    return updated;
  }
  /**
   * Dispose the manager and clean up resources.
   */
  dispose() {
    if (this._disposed) {
      return;
    }
    this.unsubscribeAll();
    this._disposed = true;
  }
  /**
   * Convert manager state to JSON.
   */
  toJSON() {
    const subscriptions = this.getSubscriptions().map((s) => s.toJSON());
    return {
      subscriptions,
      count: subscriptions.length
    };
  }
};

export { ConflictResolver, Subscription, SubscriptionError, SubscriptionManager, SubscriptionState };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map