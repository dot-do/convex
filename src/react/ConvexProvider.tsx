/**
 * ConvexProvider - React context provider for convex.do
 *
 * This module provides the React context infrastructure for integrating
 * convex.do with React applications. It exports:
 * - `ConvexProvider`: A context provider component that creates and manages
 *   the ConvexClient instance
 * - `useConvex`: A hook for accessing the ConvexClient from any component
 *   within the provider tree
 *
 * @module react/ConvexProvider
 * @packageDocumentation
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { ConvexClient, type ClientOptions } from '../client/ConvexClient'

// ============================================================================
// Constants
// ============================================================================

/**
 * Error message displayed when useConvex is called outside of a ConvexProvider.
 * Provides helpful guidance for developers on how to fix the issue.
 * @internal
 */
const MISSING_PROVIDER_ERROR_MESSAGE =
  'useConvex must be used within a ConvexProvider. ' +
  'Make sure to wrap your app with <ConvexProvider url="...">.'

// ============================================================================
// Context
// ============================================================================

/**
 * React context for the ConvexClient instance.
 *
 * The context value is `null` when no provider is present in the component tree.
 * Components should use the `useConvex` hook rather than consuming this context
 * directly, as the hook provides proper error handling and type safety.
 *
 * @internal
 */
const ConvexContext = createContext<ConvexClient | null>(null)

// ============================================================================
// Types
// ============================================================================

/**
 * Props for the ConvexProvider component.
 *
 * @example
 * ```tsx
 * const props: ConvexProviderProps = {
 *   url: "https://your-worker.workers.dev",
 *   options: { autoReconnect: true },
 *   children: <App />
 * };
 * ```
 */
export interface ConvexProviderProps {
  /**
   * The convex.do deployment URL.
   *
   * This should be the base URL of your Cloudflare Worker deployment.
   * The client will use this URL for both HTTP requests and WebSocket connections.
   *
   * @example "https://your-worker.workers.dev"
   */
  url: string

  /**
   * Optional configuration options for the ConvexClient.
   *
   * These options control client behavior such as reconnection strategies,
   * custom fetch/WebSocket implementations, and timeout settings.
   *
   * @see {@link ClientOptions} for available options
   * @default undefined
   */
  options?: ClientOptions

  /**
   * React children to render within the provider.
   *
   * All descendant components will have access to the ConvexClient
   * through the `useConvex` hook.
   */
  children: ReactNode
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a new ConvexClient instance with the specified configuration.
 *
 * This factory function encapsulates the client creation logic, making it
 * easier to test and potentially extend in the future.
 *
 * @param url - The convex.do deployment URL
 * @param options - Optional client configuration options
 * @returns A new ConvexClient instance
 *
 * @internal
 */
function createConvexClient(url: string, options?: ClientOptions): ConvexClient {
  return new ConvexClient(url, options)
}

/**
 * Validates that a ConvexClient exists in the context.
 *
 * This function provides a type guard that narrows the client type
 * from `ConvexClient | null` to `ConvexClient`, throwing a descriptive
 * error if the client is null.
 *
 * @param client - The client value from context (may be null)
 * @returns The validated ConvexClient instance
 * @throws {Error} If the client is null (component is outside provider)
 *
 * @internal
 */
function assertClientExists(client: ConvexClient | null): ConvexClient {
  if (client === null) {
    throw new Error(MISSING_PROVIDER_ERROR_MESSAGE)
  }
  return client
}

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Provider component for convex.do React integration.
 *
 * This component creates a ConvexClient instance and makes it available
 * to all descendant components through React context. The client is
 * memoized and will only be recreated when the `url` or `options` props change.
 *
 * @remarks
 * - The client is automatically created when the component mounts
 * - The client is memoized based on `url` and `options` dependencies
 * - Nested providers are supported; components use the closest provider
 * - Changing `url` or `options` will create a new client instance
 *
 * @param props - The provider props
 * @param props.url - The convex.do deployment URL
 * @param props.options - Optional client configuration
 * @param props.children - React children to render
 * @returns The provider element wrapping the children
 *
 * @example
 * Basic usage:
 * ```tsx
 * import { ConvexProvider } from "convex.do/react";
 *
 * function App() {
 *   return (
 *     <ConvexProvider url="https://your-worker.workers.dev">
 *       <YourApp />
 *     </ConvexProvider>
 *   );
 * }
 * ```
 *
 * @example
 * With custom options:
 * ```tsx
 * import { ConvexProvider } from "convex.do/react";
 *
 * function App() {
 *   return (
 *     <ConvexProvider
 *       url="https://your-worker.workers.dev"
 *       options={{
 *         autoReconnect: true,
 *         reconnectDelay: 2000,
 *         maxReconnectAttempts: 5
 *       }}
 *     >
 *       <YourApp />
 *     </ConvexProvider>
 *   );
 * }
 * ```
 *
 * @example
 * Nested providers for multi-tenant apps:
 * ```tsx
 * import { ConvexProvider } from "convex.do/react";
 *
 * function MultiTenantApp() {
 *   return (
 *     <ConvexProvider url="https://main.workers.dev">
 *       <MainLayout />
 *       <ConvexProvider url="https://tenant.workers.dev">
 *         <TenantSpecificFeature />
 *       </ConvexProvider>
 *     </ConvexProvider>
 *   );
 * }
 * ```
 */
export function ConvexProvider({
  url,
  options,
  children,
}: ConvexProviderProps): ReactNode {
  /**
   * Memoized ConvexClient instance.
   *
   * The client is recreated only when url or options change,
   * ensuring stable references across re-renders when props remain the same.
   */
  const client = useMemo<ConvexClient>(
    () => createConvexClient(url, options),
    [url, options]
  )

  return (
    <ConvexContext.Provider value={client}>
      {children}
    </ConvexContext.Provider>
  )
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the ConvexClient from within a ConvexProvider.
 *
 * This hook provides access to the ConvexClient instance, allowing
 * components to perform queries, mutations, and actions, as well as
 * subscribe to real-time updates.
 *
 * @returns The ConvexClient instance from the nearest ConvexProvider
 * @throws {Error} If called outside of a ConvexProvider with a helpful message
 *
 * @remarks
 * - Must be used within a ConvexProvider
 * - Returns a stable reference as long as the provider's props don't change
 * - The client provides methods for queries, mutations, actions, and subscriptions
 *
 * @example
 * Basic usage with mutation:
 * ```tsx
 * import { useConvex } from "convex.do/react";
 *
 * function SendMessage() {
 *   const client = useConvex();
 *
 *   const handleClick = async () => {
 *     await client.mutation(api.messages.send, { body: "Hello!" });
 *   };
 *
 *   return <button onClick={handleClick}>Send</button>;
 * }
 * ```
 *
 * @example
 * With query:
 * ```tsx
 * import { useConvex } from "convex.do/react";
 * import { useState, useEffect } from "react";
 *
 * function MessageList() {
 *   const client = useConvex();
 *   const [messages, setMessages] = useState([]);
 *
 *   useEffect(() => {
 *     const unsubscribe = client.onUpdate(
 *       api.messages.list,
 *       { channel: "general" },
 *       (data) => setMessages(data)
 *     );
 *     return unsubscribe;
 *   }, [client]);
 *
 *   return (
 *     <ul>
 *       {messages.map((msg) => (
 *         <li key={msg.id}>{msg.body}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @example
 * With action:
 * ```tsx
 * import { useConvex } from "convex.do/react";
 *
 * function ImageUploader() {
 *   const client = useConvex();
 *
 *   const handleUpload = async (file: File) => {
 *     const url = await client.action(api.files.getUploadUrl, {});
 *     await fetch(url, { method: "PUT", body: file });
 *   };
 *
 *   return <input type="file" onChange={(e) => handleUpload(e.target.files[0])} />;
 * }
 * ```
 */
export function useConvex(): ConvexClient {
  const client = useContext(ConvexContext)
  return assertClientExists(client)
}
