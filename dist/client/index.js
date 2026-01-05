// src/client/ConvexClient.ts
var ConvexClient = class {
  url;
  wsUrl;
  options;
  ws = null;
  subscriptions = /* @__PURE__ */ new Map();
  pendingSubscriptions = /* @__PURE__ */ new Map();
  authToken = null;
  isConnected = false;
  reconnectAttempts = 0;
  reconnectTimeout = null;
  pingInterval = null;
  idCounter = 0;
  constructor(url, options = {}) {
    this.url = url.replace(/\/$/, "");
    this.wsUrl = this.url.replace(/^http/, "ws") + "/sync";
    this.options = {
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      WebSocket: options.WebSocket ?? globalThis.WebSocket,
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1e3,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10
    };
    this.connect();
  }
  /**
   * Set the authentication token.
   */
  setAuth(token) {
    this.authToken = token;
    if (this.ws && this.isConnected) {
      this.send({ type: "authenticate", token });
    }
  }
  /**
   * Clear the authentication token.
   */
  clearAuth() {
    this.authToken = null;
  }
  /**
   * Subscribe to a query with real-time updates.
   */
  onUpdate(query, args, callback, options) {
    const id = this.generateId();
    const state = {
      id,
      queryPath: query._path,
      args,
      callback,
      ...options !== void 0 && { options }
    };
    if (this.isConnected) {
      this.subscriptions.set(id, state);
      this.send({
        type: "subscribe",
        subscriptionId: id,
        queryPath: query._path,
        args
      });
    } else {
      this.pendingSubscriptions.set(id, state);
    }
    return () => this.unsubscribe(id);
  }
  /**
   * Run a query (one-time, non-reactive).
   */
  async query(query, args) {
    const response = await this.options.fetch(`${this.url}/api/query`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        path: query._path,
        args,
        format: "json"
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Query failed");
    }
    return response.json();
  }
  /**
   * Run a mutation.
   */
  async mutation(mutation, args) {
    const response = await this.options.fetch(`${this.url}/api/mutation`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        path: mutation._path,
        args,
        format: "json"
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Mutation failed");
    }
    return response.json();
  }
  /**
   * Run an action.
   */
  async action(action, args) {
    const response = await this.options.fetch(`${this.url}/api/action`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        path: action._path,
        args,
        format: "json"
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Action failed");
    }
    return response.json();
  }
  /**
   * Close the client connection.
   */
  close() {
    this.options.autoReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.pendingSubscriptions.clear();
    this.isConnected = false;
  }
  // ============================================================================
  // Private Methods
  // ============================================================================
  connect() {
    try {
      this.ws = new this.options.WebSocket(this.wsUrl);
      this.ws.addEventListener("open", () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        if (this.authToken) {
          this.send({ type: "authenticate", token: this.authToken });
        }
        for (const state of this.subscriptions.values()) {
          this.send({
            type: "subscribe",
            subscriptionId: state.id,
            queryPath: state.queryPath,
            args: state.args
          });
          state.options?.onConnect?.();
        }
        for (const [id, state] of this.pendingSubscriptions) {
          this.subscriptions.set(id, state);
          this.send({
            type: "subscribe",
            subscriptionId: state.id,
            queryPath: state.queryPath,
            args: state.args
          });
          state.options?.onConnect?.();
        }
        this.pendingSubscriptions.clear();
        this.pingInterval = setInterval(() => {
          if (this.isConnected) {
            this.send({ type: "ping" });
          }
        }, 3e4);
      });
      this.ws.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });
      this.ws.addEventListener("close", () => {
        this.isConnected = false;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        for (const state of this.subscriptions.values()) {
          state.options?.onDisconnect?.();
        }
        if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          this.reconnectTimeout = setTimeout(() => this.connect(), delay);
        }
      });
      this.ws.addEventListener("error", (event) => {
        console.error("WebSocket error:", event);
      });
    } catch (error) {
      console.error("Failed to connect:", error);
      if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        this.reconnectTimeout = setTimeout(() => this.connect(), delay);
      }
    }
  }
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      switch (message.type) {
        case "update": {
          const state = this.subscriptions.get(message.subscriptionId);
          if (state) {
            state.lastResult = message.data;
            state.callback(message.data);
          }
          break;
        }
        case "error": {
          if (message.subscriptionId) {
            const state = this.subscriptions.get(message.subscriptionId);
            if (state) {
              state.options?.onError?.(new Error(message.message));
            }
          } else {
            console.error("Server error:", message.message);
          }
          break;
        }
        case "subscribed":
        case "authenticated":
        case "pong":
          break;
        default:
          console.warn("Unknown message type:", message);
      }
    } catch (error) {
      console.error("Failed to parse message:", error);
    }
  }
  send(message) {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
    }
  }
  unsubscribe(id) {
    const state = this.subscriptions.get(id);
    if (state) {
      this.subscriptions.delete(id);
      if (this.isConnected) {
        this.send({ type: "unsubscribe", subscriptionId: id });
      }
    }
    this.pendingSubscriptions.delete(id);
  }
  generateId() {
    return `sub_${++this.idCounter}_${Date.now()}`;
  }
  getHeaders() {
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }
    return headers;
  }
};

// src/client/ConvexHttpClient.ts
var ConvexHttpClient = class {
  url;
  options;
  authToken = null;
  constructor(url, options = {}) {
    this.url = url.replace(/\/$/, "");
    this.options = {
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      timeout: options.timeout ?? 3e4
    };
  }
  /**
   * Set the authentication token.
   */
  setAuth(token) {
    this.authToken = token;
  }
  /**
   * Clear the authentication token.
   */
  clearAuth() {
    this.authToken = null;
  }
  /**
   * Run a query.
   */
  async query(query, args) {
    return this.request("/api/query", query._path, args);
  }
  /**
   * Run a mutation.
   */
  async mutation(mutation, args) {
    return this.request("/api/mutation", mutation._path, args);
  }
  /**
   * Run an action.
   */
  async action(action, args) {
    return this.request("/api/action", action._path, args);
  }
  // ============================================================================
  // Private Methods
  // ============================================================================
  async request(endpoint, path, args) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);
    try {
      const response = await this.options.fetch(`${this.url}${endpoint}`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          path,
          args,
          format: "json"
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || `Request failed: ${response.status}`);
      }
      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }
  getHeaders() {
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }
    return headers;
  }
};

export { ConvexClient, ConvexHttpClient };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map