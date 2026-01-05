/**
 * ConvexProvider - React context provider for convex.do
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { ConvexClient, type ClientOptions } from '../client/ConvexClient'

// ============================================================================
// Context
// ============================================================================

const ConvexContext = createContext<ConvexClient | null>(null)

// ============================================================================
// Provider
// ============================================================================

/**
 * Props for ConvexProvider.
 */
export interface ConvexProviderProps {
  /** The convex.do deployment URL */
  url: string
  /** Client options */
  options?: ClientOptions
  /** Children to render */
  children: ReactNode
}

/**
 * Provider component for convex.do React integration.
 *
 * @example
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
 */
export function ConvexProvider({
  url,
  options,
  children,
}: ConvexProviderProps): ReactNode {
  const client = useMemo(() => {
    return new ConvexClient(url, options)
  }, [url, options])

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
 * Hook to access the ConvexClient directly.
 *
 * @example
 * ```tsx
 * import { useConvex } from "convex.do/react";
 *
 * function MyComponent() {
 *   const client = useConvex();
 *
 *   const handleClick = async () => {
 *     await client.mutation(api.messages.send, { body: "Hello!" });
 *   };
 *
 *   return <button onClick={handleClick}>Send</button>;
 * }
 * ```
 */
export function useConvex(): ConvexClient {
  const client = useContext(ConvexContext)

  if (!client) {
    throw new Error(
      'useConvex must be used within a ConvexProvider. ' +
      'Make sure to wrap your app with <ConvexProvider url="...">.'
    )
  }

  return client
}
