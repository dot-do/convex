/**
 * Auth Components - Conditional rendering based on authentication state
 *
 * This module provides React components for conditionally rendering content
 * based on the current authentication state from ConvexProviderWithAuth.
 *
 * ## Components
 * - {@link Authenticated} - Renders children only when user is authenticated
 * - {@link Unauthenticated} - Renders children only when user is NOT authenticated
 * - {@link AuthLoading} - Renders children only while auth state is loading
 *
 * ## Usage Pattern
 * These components are designed to be used together to handle all auth states:
 *
 * ```tsx
 * <ConvexProviderWithAuth url={convexUrl} useAuth={useAuth}>
 *   <AuthLoading>
 *     <LoadingSpinner />
 *   </AuthLoading>
 *   <Authenticated>
 *     <Dashboard />
 *   </Authenticated>
 *   <Unauthenticated>
 *     <SignInPage />
 *   </Unauthenticated>
 * </ConvexProviderWithAuth>
 * ```
 *
 * ## Important Notes
 * - All components must be used within a ConvexProviderWithAuth context
 * - During loading state, both Authenticated and Unauthenticated render nothing
 * - Components support an optional `fallback` prop for the inverse condition
 *
 * @module react/auth-components
 */

import type { ReactNode } from 'react'
import { useConvexAuth } from './ConvexProviderWithAuth'

// ============================================================================
// Types
// ============================================================================

/**
 * Props for auth conditional rendering components.
 *
 * @public
 */
export interface AuthComponentProps {
  /**
   * Content to render when the component's condition is met.
   * Can be any valid React node (elements, strings, fragments, etc.)
   */
  children: ReactNode

  /**
   * Optional content to render when the component's condition is NOT met.
   * If not provided, nothing will be rendered in that case.
   *
   * Note: During loading state, neither children nor fallback are rendered
   * for Authenticated and Unauthenticated components.
   */
  fallback?: ReactNode
}

// ============================================================================
// Components
// ============================================================================

/**
 * Renders children only when the user is authenticated.
 *
 * This component checks the auth state from ConvexProviderWithAuth context
 * and conditionally renders its children based on authentication status.
 *
 * ## Rendering Behavior
 * - **Loading**: Renders nothing (use AuthLoading for loading UI)
 * - **Authenticated**: Renders children
 * - **Not Authenticated**: Renders fallback (if provided) or nothing
 *
 * @example Basic usage
 * ```tsx
 * <Authenticated>
 *   <Dashboard />
 * </Authenticated>
 * ```
 *
 * @example With fallback for unauthenticated users
 * ```tsx
 * <Authenticated fallback={<SignInPrompt />}>
 *   <Dashboard />
 * </Authenticated>
 * ```
 *
 * @example Protected route pattern
 * ```tsx
 * function ProtectedRoute({ children }: { children: ReactNode }) {
 *   return (
 *     <>
 *       <AuthLoading><Spinner /></AuthLoading>
 *       <Authenticated>{children}</Authenticated>
 *       <Unauthenticated><Redirect to="/login" /></Unauthenticated>
 *     </>
 *   )
 * }
 * ```
 *
 * @throws Will throw if used outside of ConvexProviderWithAuth context
 *
 * @public
 */
export function Authenticated({ children, fallback }: AuthComponentProps): ReactNode {
  const { authState } = useConvexAuth()

  // Don't render anything while loading - use AuthLoading for loading states
  if (authState.isLoading) {
    return null
  }

  // Render children when authenticated, fallback otherwise
  if (authState.isAuthenticated) {
    return <>{children}</>
  }

  return fallback ? <>{fallback}</> : null
}

/** React DevTools display name */
Authenticated.displayName = 'Authenticated'

/**
 * Renders children only when the user is NOT authenticated.
 *
 * This component checks the auth state from ConvexProviderWithAuth context
 * and conditionally renders its children when the user is not logged in.
 *
 * ## Rendering Behavior
 * - **Loading**: Renders nothing (use AuthLoading for loading UI)
 * - **Not Authenticated**: Renders children
 * - **Authenticated**: Renders fallback (if provided) or nothing
 *
 * @example Basic usage
 * ```tsx
 * <Unauthenticated>
 *   <SignInForm />
 * </Unauthenticated>
 * ```
 *
 * @example With fallback for authenticated users
 * ```tsx
 * <Unauthenticated fallback={<WelcomeBack />}>
 *   <SignInForm />
 * </Unauthenticated>
 * ```
 *
 * @example Header with conditional auth buttons
 * ```tsx
 * <header>
 *   <Authenticated>
 *     <LogoutButton />
 *   </Authenticated>
 *   <Unauthenticated>
 *     <LoginButton />
 *   </Unauthenticated>
 * </header>
 * ```
 *
 * @throws Will throw if used outside of ConvexProviderWithAuth context
 *
 * @public
 */
export function Unauthenticated({ children, fallback }: AuthComponentProps): ReactNode {
  const { authState } = useConvexAuth()

  // Don't render anything while loading - use AuthLoading for loading states
  if (authState.isLoading) {
    return null
  }

  // Render children when NOT authenticated, fallback otherwise
  if (!authState.isAuthenticated) {
    return <>{children}</>
  }

  return fallback ? <>{fallback}</> : null
}

/** React DevTools display name */
Unauthenticated.displayName = 'Unauthenticated'

/**
 * Renders children only while the authentication state is loading.
 *
 * This component checks the auth state from ConvexProviderWithAuth context
 * and renders its children during the initial auth check. Use this to show
 * loading indicators while the auth state is being determined.
 *
 * ## Rendering Behavior
 * - **Loading**: Renders children
 * - **Resolved** (authenticated or not): Renders fallback (if provided) or nothing
 *
 * ## Key Difference from Other Components
 * Unlike Authenticated and Unauthenticated, AuthLoading renders children
 * DURING the loading state, not after it resolves.
 *
 * @example Basic loading spinner
 * ```tsx
 * <AuthLoading>
 *   <LoadingSpinner />
 * </AuthLoading>
 * ```
 *
 * @example With fallback for resolved state
 * ```tsx
 * <AuthLoading fallback={<AppContent />}>
 *   <LoadingSpinner />
 * </AuthLoading>
 * ```
 *
 * @example Full-page loading screen
 * ```tsx
 * <AuthLoading>
 *   <div className="loading-screen">
 *     <Spinner />
 *     <p>Checking authentication...</p>
 *   </div>
 * </AuthLoading>
 * ```
 *
 * @throws Will throw if used outside of ConvexProviderWithAuth context
 *
 * @public
 */
export function AuthLoading({ children, fallback }: AuthComponentProps): ReactNode {
  const { authState } = useConvexAuth()

  // Render children while loading, fallback when resolved
  if (authState.isLoading) {
    return <>{children}</>
  }

  return fallback ? <>{fallback}</> : null
}

/** React DevTools display name */
AuthLoading.displayName = 'AuthLoading'
