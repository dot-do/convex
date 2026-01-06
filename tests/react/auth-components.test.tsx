/**
 * TDD Tests for Auth Components: Authenticated, Unauthenticated, AuthLoading
 *
 * This module provides comprehensive tests for the authentication-based
 * conditional rendering components.
 *
 * Features tested:
 * - Authenticated: Renders children only when user is authenticated
 * - Unauthenticated: Renders children only when user is NOT authenticated
 * - AuthLoading: Renders children only while auth state is loading
 * - Fallback prop support for each component
 * - Integration with ConvexProviderWithAuth context
 *
 * @module tests/react/auth-components
 */

import React, { createContext, useContext } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// ============================================================================
// Mock ConvexProviderWithAuth with a minimal context-based implementation
// This avoids loading ConvexClient which causes memory issues in vitest
// ============================================================================

interface MockAuthState {
  isLoading: boolean
  isAuthenticated: boolean
}

interface MockConvexAuthContextValue {
  client: {
    setAuth: ReturnType<typeof vi.fn>
    clearAuth: ReturnType<typeof vi.fn>
  }
  authState: MockAuthState
}

const MockConvexAuthContext = createContext<MockConvexAuthContextValue | null>(null)

// Store current auth state for tests
let currentAuthState: MockAuthState = { isLoading: false, isAuthenticated: false }

// Mock the ConvexProviderWithAuth module
vi.mock('../../src/react/ConvexProviderWithAuth', () => {
  return {
    ConvexProviderWithAuth: ({ children, useAuth }: { children: React.ReactNode; useAuth: () => { isLoading: boolean; isAuthenticated: boolean } }) => {
      const auth = useAuth()
      currentAuthState = { isLoading: auth.isLoading, isAuthenticated: auth.isAuthenticated }
      const value = {
        client: { setAuth: vi.fn(), clearAuth: vi.fn() },
        authState: currentAuthState,
      }
      return React.createElement(MockConvexAuthContext.Provider, { value }, children)
    },
    useConvexAuth: () => {
      const context = useContext(MockConvexAuthContext)
      if (!context) {
        throw new Error('useConvexAuth must be used within a ConvexProviderWithAuth')
      }
      return context
    },
    useAuthState: () => {
      const context = useContext(MockConvexAuthContext)
      if (!context) {
        throw new Error('useAuthState must be used within a ConvexProviderWithAuth')
      }
      return context.authState
    },
  }
})

// Now import the components - they will use the mocked provider
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from '../../src/react/auth-components'
import {
  ConvexProviderWithAuth,
  type AuthClient,
} from '../../src/react/ConvexProviderWithAuth'

// ============================================================================
// Test Helpers
// ============================================================================

function createMockAuthClient(overrides: Partial<AuthClient> = {}): () => AuthClient {
  return () => ({
    getToken: vi.fn().mockResolvedValue('test-token'),
    isLoading: false,
    isAuthenticated: false,
    ...overrides,
  })
}

interface TestWrapperProps {
  children: React.ReactNode
  isLoading?: boolean
  isAuthenticated?: boolean
}

function TestWrapper({
  children,
  isLoading = false,
  isAuthenticated = false,
}: TestWrapperProps) {
  const useAuth = createMockAuthClient({ isLoading, isAuthenticated })
  return (
    <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
      {children}
    </ConvexProviderWithAuth>
  )
}

// ============================================================================
// Authenticated Component Tests
// ============================================================================

describe('Authenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Basic Rendering Tests
  // ============================================================================

  describe('basic rendering', () => {
    it('should render children when user is authenticated', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Authenticated>
            <div data-testid="authenticated-content">Secret Content</div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('authenticated-content')).toBeInTheDocument()
      expect(screen.getByText('Secret Content')).toBeInTheDocument()
    })

    it('should not render children when user is NOT authenticated', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <Authenticated>
            <div data-testid="authenticated-content">Secret Content</div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('authenticated-content')).not.toBeInTheDocument()
      expect(screen.queryByText('Secret Content')).not.toBeInTheDocument()
    })

    it('should not render children while auth is loading', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <Authenticated>
            <div data-testid="authenticated-content">Secret Content</div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('authenticated-content')).not.toBeInTheDocument()
    })

    it('should not render children while auth is loading even if isAuthenticated is true', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={true}>
          <Authenticated>
            <div data-testid="authenticated-content">Secret Content</div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('authenticated-content')).not.toBeInTheDocument()
    })

    it('should render multiple children when authenticated', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Authenticated>
            <div data-testid="child-1">First</div>
            <div data-testid="child-2">Second</div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('child-1')).toBeInTheDocument()
      expect(screen.getByTestId('child-2')).toBeInTheDocument()
    })

    it('should render nested children when authenticated', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Authenticated>
            <div data-testid="outer">
              <div data-testid="inner">Nested Content</div>
            </div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('outer')).toBeInTheDocument()
      expect(screen.getByTestId('inner')).toBeInTheDocument()
      expect(screen.getByText('Nested Content')).toBeInTheDocument()
    })

    it('should render text children when authenticated', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Authenticated>Hello Authenticated User</Authenticated>
        </TestWrapper>
      )

      expect(screen.getByText('Hello Authenticated User')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Fallback Prop Tests
  // ============================================================================

  describe('fallback prop', () => {
    it('should render fallback when user is NOT authenticated', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <Authenticated fallback={<div data-testid="fallback">Please sign in</div>}>
            <div data-testid="authenticated-content">Secret Content</div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('fallback')).toBeInTheDocument()
      expect(screen.getByText('Please sign in')).toBeInTheDocument()
      expect(screen.queryByTestId('authenticated-content')).not.toBeInTheDocument()
    })

    it('should not render fallback when user IS authenticated', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Authenticated fallback={<div data-testid="fallback">Please sign in</div>}>
            <div data-testid="authenticated-content">Secret Content</div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()
      expect(screen.getByTestId('authenticated-content')).toBeInTheDocument()
    })

    it('should not render fallback while auth is loading', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <Authenticated fallback={<div data-testid="fallback">Please sign in</div>}>
            <div data-testid="authenticated-content">Secret Content</div>
          </Authenticated>
        </TestWrapper>
      )

      // Neither content nor fallback should render while loading
      expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()
      expect(screen.queryByTestId('authenticated-content')).not.toBeInTheDocument()
    })

    it('should render nothing when not authenticated and no fallback provided', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <Authenticated>
            <div data-testid="authenticated-content">Secret Content</div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('authenticated-content')).not.toBeInTheDocument()
    })

    it('should support React element fallback', () => {
      const FallbackComponent = () => <span data-testid="component-fallback">Sign In</span>

      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <Authenticated fallback={<FallbackComponent />}>
            <div data-testid="authenticated-content">Secret Content</div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('component-fallback')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw when used outside of ConvexProviderWithAuth', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(
          <Authenticated>
            <div>Content</div>
          </Authenticated>
        )
      }).toThrow()

      consoleSpy.mockRestore()
    })
  })
})

// ============================================================================
// Unauthenticated Component Tests
// ============================================================================

describe('Unauthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Basic Rendering Tests
  // ============================================================================

  describe('basic rendering', () => {
    it('should render children when user is NOT authenticated', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <Unauthenticated>
            <div data-testid="unauthenticated-content">Sign In Form</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('unauthenticated-content')).toBeInTheDocument()
      expect(screen.getByText('Sign In Form')).toBeInTheDocument()
    })

    it('should not render children when user IS authenticated', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Unauthenticated>
            <div data-testid="unauthenticated-content">Sign In Form</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('unauthenticated-content')).not.toBeInTheDocument()
      expect(screen.queryByText('Sign In Form')).not.toBeInTheDocument()
    })

    it('should not render children while auth is loading', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <Unauthenticated>
            <div data-testid="unauthenticated-content">Sign In Form</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('unauthenticated-content')).not.toBeInTheDocument()
    })

    it('should not render children while auth is loading even if isAuthenticated is false', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <Unauthenticated>
            <div data-testid="unauthenticated-content">Sign In Form</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('unauthenticated-content')).not.toBeInTheDocument()
    })

    it('should render multiple children when unauthenticated', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <Unauthenticated>
            <div data-testid="child-1">Sign In</div>
            <div data-testid="child-2">Or Sign Up</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('child-1')).toBeInTheDocument()
      expect(screen.getByTestId('child-2')).toBeInTheDocument()
    })

    it('should render nested children when unauthenticated', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <Unauthenticated>
            <div data-testid="outer">
              <div data-testid="inner">Nested Form</div>
            </div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('outer')).toBeInTheDocument()
      expect(screen.getByTestId('inner')).toBeInTheDocument()
    })

    it('should render text children when unauthenticated', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <Unauthenticated>Please sign in to continue</Unauthenticated>
        </TestWrapper>
      )

      expect(screen.getByText('Please sign in to continue')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Fallback Prop Tests
  // ============================================================================

  describe('fallback prop', () => {
    it('should render fallback when user IS authenticated', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Unauthenticated fallback={<div data-testid="fallback">Welcome back!</div>}>
            <div data-testid="unauthenticated-content">Sign In Form</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('fallback')).toBeInTheDocument()
      expect(screen.getByText('Welcome back!')).toBeInTheDocument()
      expect(screen.queryByTestId('unauthenticated-content')).not.toBeInTheDocument()
    })

    it('should not render fallback when user is NOT authenticated', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <Unauthenticated fallback={<div data-testid="fallback">Welcome back!</div>}>
            <div data-testid="unauthenticated-content">Sign In Form</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()
      expect(screen.getByTestId('unauthenticated-content')).toBeInTheDocument()
    })

    it('should not render fallback while auth is loading', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={true}>
          <Unauthenticated fallback={<div data-testid="fallback">Welcome back!</div>}>
            <div data-testid="unauthenticated-content">Sign In Form</div>
          </Unauthenticated>
        </TestWrapper>
      )

      // Neither content nor fallback should render while loading
      expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()
      expect(screen.queryByTestId('unauthenticated-content')).not.toBeInTheDocument()
    })

    it('should render nothing when authenticated and no fallback provided', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Unauthenticated>
            <div data-testid="unauthenticated-content">Sign In Form</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('unauthenticated-content')).not.toBeInTheDocument()
    })

    it('should support React element fallback', () => {
      const FallbackComponent = () => <span data-testid="component-fallback">Dashboard</span>

      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Unauthenticated fallback={<FallbackComponent />}>
            <div data-testid="unauthenticated-content">Sign In Form</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('component-fallback')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw when used outside of ConvexProviderWithAuth', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(
          <Unauthenticated>
            <div>Content</div>
          </Unauthenticated>
        )
      }).toThrow()

      consoleSpy.mockRestore()
    })
  })
})

// ============================================================================
// AuthLoading Component Tests
// ============================================================================

describe('AuthLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Basic Rendering Tests
  // ============================================================================

  describe('basic rendering', () => {
    it('should render children while auth state is loading', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <AuthLoading>
            <div data-testid="loading-content">Loading...</div>
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.getByTestId('loading-content')).toBeInTheDocument()
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('should not render children when auth state is resolved (authenticated)', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <AuthLoading>
            <div data-testid="loading-content">Loading...</div>
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.queryByTestId('loading-content')).not.toBeInTheDocument()
    })

    it('should not render children when auth state is resolved (not authenticated)', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <AuthLoading>
            <div data-testid="loading-content">Loading...</div>
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.queryByTestId('loading-content')).not.toBeInTheDocument()
    })

    it('should render multiple children while loading', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <AuthLoading>
            <div data-testid="spinner">Spinner</div>
            <div data-testid="message">Please wait...</div>
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.getByTestId('spinner')).toBeInTheDocument()
      expect(screen.getByTestId('message')).toBeInTheDocument()
    })

    it('should render nested children while loading', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <AuthLoading>
            <div data-testid="outer">
              <div data-testid="inner">Loading animation</div>
            </div>
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.getByTestId('outer')).toBeInTheDocument()
      expect(screen.getByTestId('inner')).toBeInTheDocument()
    })

    it('should render text children while loading', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <AuthLoading>Authenticating...</AuthLoading>
        </TestWrapper>
      )

      expect(screen.getByText('Authenticating...')).toBeInTheDocument()
    })

    it('should render loading indicator component', () => {
      const LoadingSpinner = () => (
        <div data-testid="spinner" role="progressbar">
          <span>Loading</span>
        </div>
      )

      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <AuthLoading>
            <LoadingSpinner />
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.getByTestId('spinner')).toBeInTheDocument()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Fallback Prop Tests
  // ============================================================================

  describe('fallback prop', () => {
    it('should render fallback when auth state is resolved (authenticated)', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <AuthLoading fallback={<div data-testid="fallback">Ready!</div>}>
            <div data-testid="loading-content">Loading...</div>
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.getByTestId('fallback')).toBeInTheDocument()
      expect(screen.queryByTestId('loading-content')).not.toBeInTheDocument()
    })

    it('should render fallback when auth state is resolved (not authenticated)', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <AuthLoading fallback={<div data-testid="fallback">Ready!</div>}>
            <div data-testid="loading-content">Loading...</div>
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.getByTestId('fallback')).toBeInTheDocument()
      expect(screen.queryByTestId('loading-content')).not.toBeInTheDocument()
    })

    it('should not render fallback while loading', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <AuthLoading fallback={<div data-testid="fallback">Ready!</div>}>
            <div data-testid="loading-content">Loading...</div>
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()
      expect(screen.getByTestId('loading-content')).toBeInTheDocument()
    })

    it('should render nothing when not loading and no fallback provided', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <AuthLoading>
            <div data-testid="loading-content">Loading...</div>
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.queryByTestId('loading-content')).not.toBeInTheDocument()
    })

    it('should support React element fallback', () => {
      const FallbackComponent = () => <span data-testid="component-fallback">Done!</span>

      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <AuthLoading fallback={<FallbackComponent />}>
            <div data-testid="loading-content">Loading...</div>
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.getByTestId('component-fallback')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw when used outside of ConvexProviderWithAuth', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(
          <AuthLoading>
            <div>Content</div>
          </AuthLoading>
        )
      }).toThrow()

      consoleSpy.mockRestore()
    })
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Auth Components Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Composition Tests
  // ============================================================================

  describe('composition', () => {
    it('should compose all three components correctly - loading state', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <AuthLoading>
            <div data-testid="loading">Loading...</div>
          </AuthLoading>
          <Authenticated>
            <div data-testid="authenticated">Dashboard</div>
          </Authenticated>
          <Unauthenticated>
            <div data-testid="unauthenticated">Sign In</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('loading')).toBeInTheDocument()
      expect(screen.queryByTestId('authenticated')).not.toBeInTheDocument()
      expect(screen.queryByTestId('unauthenticated')).not.toBeInTheDocument()
    })

    it('should compose all three components correctly - authenticated state', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <AuthLoading>
            <div data-testid="loading">Loading...</div>
          </AuthLoading>
          <Authenticated>
            <div data-testid="authenticated">Dashboard</div>
          </Authenticated>
          <Unauthenticated>
            <div data-testid="unauthenticated">Sign In</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('loading')).not.toBeInTheDocument()
      expect(screen.getByTestId('authenticated')).toBeInTheDocument()
      expect(screen.queryByTestId('unauthenticated')).not.toBeInTheDocument()
    })

    it('should compose all three components correctly - unauthenticated state', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <AuthLoading>
            <div data-testid="loading">Loading...</div>
          </AuthLoading>
          <Authenticated>
            <div data-testid="authenticated">Dashboard</div>
          </Authenticated>
          <Unauthenticated>
            <div data-testid="unauthenticated">Sign In</div>
          </Unauthenticated>
        </TestWrapper>
      )

      expect(screen.queryByTestId('loading')).not.toBeInTheDocument()
      expect(screen.queryByTestId('authenticated')).not.toBeInTheDocument()
      expect(screen.getByTestId('unauthenticated')).toBeInTheDocument()
    })

    it('should support nested composition', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Authenticated>
            <div data-testid="outer-authenticated">
              <Authenticated>
                <div data-testid="inner-authenticated">Nested Auth Content</div>
              </Authenticated>
            </div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('outer-authenticated')).toBeInTheDocument()
      expect(screen.getByTestId('inner-authenticated')).toBeInTheDocument()
    })

    it('should support mixed nested composition', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <Authenticated>
            <div data-testid="authenticated-section">
              <Unauthenticated>
                <div data-testid="should-not-render">This should not render</div>
              </Unauthenticated>
              <div data-testid="always-render">This always renders when authenticated</div>
            </div>
          </Authenticated>
        </TestWrapper>
      )

      expect(screen.getByTestId('authenticated-section')).toBeInTheDocument()
      expect(screen.queryByTestId('should-not-render')).not.toBeInTheDocument()
      expect(screen.getByTestId('always-render')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Real-world Usage Patterns
  // ============================================================================

  describe('real-world usage patterns', () => {
    it('should support typical app layout pattern', () => {
      render(
        <TestWrapper isAuthenticated={false} isLoading={false}>
          <header data-testid="header">
            <Authenticated>
              <button data-testid="logout-btn">Logout</button>
            </Authenticated>
            <Unauthenticated>
              <button data-testid="login-btn">Login</button>
            </Unauthenticated>
          </header>
          <main>
            <AuthLoading>
              <div data-testid="main-loading">Loading app...</div>
            </AuthLoading>
            <Unauthenticated>
              <div data-testid="landing-page">Welcome! Please sign in.</div>
            </Unauthenticated>
            <Authenticated>
              <div data-testid="dashboard">Your Dashboard</div>
            </Authenticated>
          </main>
        </TestWrapper>
      )

      expect(screen.getByTestId('header')).toBeInTheDocument()
      expect(screen.queryByTestId('logout-btn')).not.toBeInTheDocument()
      expect(screen.getByTestId('login-btn')).toBeInTheDocument()
      expect(screen.queryByTestId('main-loading')).not.toBeInTheDocument()
      expect(screen.getByTestId('landing-page')).toBeInTheDocument()
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument()
    })

    it('should support protected route pattern', () => {
      function ProtectedRoute({ children }: { children: React.ReactNode }) {
        return (
          <>
            <AuthLoading>
              <div data-testid="route-loading">Checking authentication...</div>
            </AuthLoading>
            <Authenticated>{children}</Authenticated>
            <Unauthenticated>
              <div data-testid="redirect-message">Redirecting to login...</div>
            </Unauthenticated>
          </>
        )
      }

      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <ProtectedRoute>
            <div data-testid="protected-content">Secret Data</div>
          </ProtectedRoute>
        </TestWrapper>
      )

      expect(screen.queryByTestId('route-loading')).not.toBeInTheDocument()
      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
      expect(screen.queryByTestId('redirect-message')).not.toBeInTheDocument()
    })

    it('should support conditional navigation pattern', () => {
      render(
        <TestWrapper isAuthenticated={true} isLoading={false}>
          <nav data-testid="nav">
            <a href="/">Home</a>
            <Authenticated>
              <a data-testid="profile-link" href="/profile">
                Profile
              </a>
              <a data-testid="settings-link" href="/settings">
                Settings
              </a>
            </Authenticated>
            <Unauthenticated>
              <a data-testid="signin-link" href="/signin">
                Sign In
              </a>
            </Unauthenticated>
          </nav>
        </TestWrapper>
      )

      expect(screen.getByTestId('nav')).toBeInTheDocument()
      expect(screen.getByTestId('profile-link')).toBeInTheDocument()
      expect(screen.getByTestId('settings-link')).toBeInTheDocument()
      expect(screen.queryByTestId('signin-link')).not.toBeInTheDocument()
    })

    it('should support loading skeleton pattern with fallback', () => {
      const SkeletonLoader = () => (
        <div data-testid="skeleton">
          <div className="skeleton-avatar" />
          <div className="skeleton-text" />
        </div>
      )

      const UserProfile = () => (
        <div data-testid="user-profile">
          <img alt="Avatar" />
          <span>John Doe</span>
        </div>
      )

      render(
        <TestWrapper isAuthenticated={false} isLoading={true}>
          <AuthLoading fallback={<UserProfile />}>
            <SkeletonLoader />
          </AuthLoading>
        </TestWrapper>
      )

      expect(screen.getByTestId('skeleton')).toBeInTheDocument()
      expect(screen.queryByTestId('user-profile')).not.toBeInTheDocument()
    })
  })

  // ============================================================================
  // Context Sharing Tests
  // ============================================================================

  describe('context sharing', () => {
    it('should all components use the same auth context', () => {
      // All components should agree on the current auth state
      const useAuth = createMockAuthClient({
        isLoading: false,
        isAuthenticated: true,
      })

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <div data-testid="app">
            <AuthLoading>
              <span data-testid="is-loading" />
            </AuthLoading>
            <Authenticated>
              <span data-testid="is-authenticated" />
            </Authenticated>
            <Unauthenticated>
              <span data-testid="is-unauthenticated" />
            </Unauthenticated>
          </div>
        </ConvexProviderWithAuth>
      )

      // Only authenticated marker should be present
      expect(screen.queryByTestId('is-loading')).not.toBeInTheDocument()
      expect(screen.getByTestId('is-authenticated')).toBeInTheDocument()
      expect(screen.queryByTestId('is-unauthenticated')).not.toBeInTheDocument()
    })
  })
})
