/**
 * ConvexProviderWithAuth - Provider with authentication integration
 */

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { ConvexClient, type ClientOptions } from '../client/ConvexClient'

// ============================================================================
// Types
// ============================================================================

/**
 * Authentication state.
 */
export interface AuthState {
  /** Whether authentication is loading */
  isLoading: boolean
  /** Whether user is authenticated */
  isAuthenticated: boolean
}

/**
 * Authentication client interface.
 * This should be implemented by your auth provider (e.g., Clerk, Auth0).
 */
export interface AuthClient {
  /** Get the current authentication token */
  getToken(): Promise<string | null>
  /** Whether the client is currently loading */
  isLoading: boolean
  /** Whether the user is authenticated */
  isAuthenticated: boolean
  /** Called when auth state changes */
  onAuthStateChange?: (callback: () => void) => () => void
}

/**
 * Props for ConvexProviderWithAuth.
 */
export interface ConvexProviderWithAuthProps {
  /** The convex.do deployment URL */
  url: string
  /** Client options */
  options?: ClientOptions
  /** Authentication client */
  useAuth: () => AuthClient
  /** Children to render */
  children: ReactNode
}

// ============================================================================
// Context
// ============================================================================

interface ConvexAuthContextValue {
  client: ConvexClient
  authState: AuthState
}

const ConvexAuthContext = createContext<ConvexAuthContextValue | null>(null)

// ============================================================================
// Provider
// ============================================================================

/**
 * Provider component with authentication integration.
 *
 * @example
 * ```tsx
 * import { ConvexProviderWithAuth } from "convex.do/react";
 * import { useAuth } from "@clerk/clerk-react";
 *
 * function useConvexAuth() {
 *   const { getToken, isLoaded, isSignedIn } = useAuth();
 *   return {
 *     getToken: () => getToken({ template: "convex" }),
 *     isLoading: !isLoaded,
 *     isAuthenticated: isSignedIn ?? false,
 *   };
 * }
 *
 * function App() {
 *   return (
 *     <ConvexProviderWithAuth
 *       url="https://your-worker.workers.dev"
 *       useAuth={useConvexAuth}
 *     >
 *       <YourApp />
 *     </ConvexProviderWithAuth>
 *   );
 * }
 * ```
 */
export function ConvexProviderWithAuth({
  url,
  options,
  useAuth,
  children,
}: ConvexProviderWithAuthProps): ReactNode {
  const auth = useAuth()
  const [authState, setAuthState] = useState<AuthState>({
    isLoading: auth.isLoading,
    isAuthenticated: auth.isAuthenticated,
  })

  const client = useMemo(() => {
    return new ConvexClient(url, options)
  }, [url, options])

  // Update auth token when authentication changes
  useEffect(() => {
    let mounted = true

    const updateAuth = async () => {
      if (!mounted) return

      setAuthState({
        isLoading: auth.isLoading,
        isAuthenticated: auth.isAuthenticated,
      })

      if (auth.isLoading) return

      if (auth.isAuthenticated) {
        const token = await auth.getToken()
        if (token && mounted) {
          client.setAuth(token)
        }
      } else {
        client.clearAuth()
      }
    }

    updateAuth()

    // Subscribe to auth changes if supported
    const unsubscribe = auth.onAuthStateChange?.(() => {
      updateAuth()
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [client, auth])

  const value = useMemo(
    () => ({ client, authState }),
    [client, authState]
  )

  return (
    <ConvexAuthContext.Provider value={value}>
      {children}
    </ConvexAuthContext.Provider>
  )
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to access the ConvexClient in an auth-aware context.
 */
export function useConvexAuth(): ConvexAuthContextValue {
  const context = useContext(ConvexAuthContext)

  if (!context) {
    throw new Error(
      'useConvexAuth must be used within a ConvexProviderWithAuth. ' +
      'Make sure to wrap your app with <ConvexProviderWithAuth>.'
    )
  }

  return context
}

/**
 * Hook to get the current authentication state.
 */
export function useAuthState(): AuthState {
  const { authState } = useConvexAuth()
  return authState
}
