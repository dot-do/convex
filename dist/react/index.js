import { createContext, useMemo, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { jsx } from 'react/jsx-runtime';

// src/react/ConvexProvider.tsx

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
var ConvexContext = createContext(null);
function ConvexProvider({
  url,
  options,
  children
}) {
  const client = useMemo(() => {
    return new ConvexClient(url, options);
  }, [url, options]);
  return /* @__PURE__ */ jsx(ConvexContext.Provider, { value: client, children });
}
function useConvex() {
  const client = useContext(ConvexContext);
  if (!client) {
    throw new Error(
      'useConvex must be used within a ConvexProvider. Make sure to wrap your app with <ConvexProvider url="...">.'
    );
  }
  return client;
}
var skip = /* @__PURE__ */ Symbol("skip");
function useQuery(query, args) {
  const client = useConvex();
  const [data, setData] = useState(void 0);
  const [error, setError] = useState(null);
  const argsRef = useRef("");
  const argsJson = args === "skip" || args === skip ? "__skip__" : JSON.stringify(args);
  useEffect(() => {
    if (args === "skip" || args === skip) {
      setData(void 0);
      return;
    }
    if (argsRef.current === argsJson) {
      return;
    }
    argsRef.current = argsJson;
    const unsubscribe = client.onUpdate(
      query,
      args,
      (result) => {
        setData(result);
        setError(null);
      },
      {
        onError: (err) => {
          setError(err);
        }
      }
    );
    return () => {
      unsubscribe();
    };
  }, [client, query, argsJson, args]);
  if (error) {
    throw error;
  }
  return data;
}
function useMutation(mutation) {
  const client = useConvex();
  const mutate = useCallback(
    async (args) => {
      return client.mutation(mutation, args);
    },
    [client, mutation]
  );
  return mutate;
}
function useAction(action) {
  const client = useConvex();
  const execute = useCallback(
    async (args) => {
      return client.action(action, args);
    },
    [client, action]
  );
  return execute;
}
function usePaginatedQuery(query, args, options) {
  const client = useConvex();
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("LoadingFirstPage");
  const [cursor, setCursor] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const argsRef = useRef("");
  const argsJson = JSON.stringify(args);
  useEffect(() => {
    if (argsRef.current !== argsJson) {
      argsRef.current = argsJson;
      setResults([]);
      setCursor(null);
      setStatus("LoadingFirstPage");
    }
  }, [argsJson]);
  useEffect(() => {
    if (status !== "LoadingFirstPage") return;
    const paginationOpts = {
      numItems: options.numItems,
      cursor: null
    };
    const unsubscribe = client.onUpdate(
      query,
      { ...args, paginationOpts },
      (result) => {
        setResults(result.page);
        setCursor(result.continueCursor);
        setStatus(result.isDone ? "Exhausted" : "CanLoadMore");
      }
    );
    return () => {
      unsubscribe();
    };
  }, [client, query, args, options.numItems, status]);
  const loadMore = useCallback(
    async (numItems) => {
      if (status !== "CanLoadMore" || !cursor) return;
      setStatus("LoadingMore");
      setIsLoadingMore(true);
      try {
        const paginationOpts = {
          numItems,
          cursor
        };
        const result = await client.query(query, {
          ...args,
          paginationOpts
        });
        setResults((prev) => [...prev, ...result.page]);
        setCursor(result.continueCursor);
        setStatus(result.isDone ? "Exhausted" : "CanLoadMore");
      } finally {
        setIsLoadingMore(false);
      }
    },
    [client, query, args, cursor, status]
  );
  return {
    results,
    status,
    isLoading: status === "LoadingFirstPage" || isLoadingMore,
    loadMore
  };
}
var ConvexAuthContext = createContext(null);
function ConvexProviderWithAuth({
  url,
  options,
  useAuth,
  children
}) {
  const auth = useAuth();
  const [authState, setAuthState] = useState({
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated
  });
  const client = useMemo(() => {
    return new ConvexClient(url, options);
  }, [url, options]);
  useEffect(() => {
    let mounted = true;
    const updateAuth = async () => {
      if (!mounted) return;
      setAuthState({
        isLoading: auth.isLoading,
        isAuthenticated: auth.isAuthenticated
      });
      if (auth.isLoading) return;
      if (auth.isAuthenticated) {
        const token = await auth.getToken();
        if (token && mounted) {
          client.setAuth(token);
        }
      } else {
        client.clearAuth();
      }
    };
    updateAuth();
    const unsubscribe = auth.onAuthStateChange?.(() => {
      updateAuth();
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [client, auth]);
  const value = useMemo(
    () => ({ client, authState }),
    [client, authState]
  );
  return /* @__PURE__ */ jsx(ConvexAuthContext.Provider, { value, children });
}

export { ConvexClient, ConvexProvider, ConvexProviderWithAuth, useAction, useConvex, useMutation, usePaginatedQuery, useQuery };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map