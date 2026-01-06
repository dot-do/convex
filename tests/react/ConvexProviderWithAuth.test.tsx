/**
 * TDD Tests for ConvexProviderWithAuth and Related Hooks
 *
 * This module provides comprehensive tests for the authentication-aware
 * React context provider and hooks.
 *
 * Features tested:
 * - ConvexProviderWithAuth renders children
 * - useConvexAuth returns auth state and client
 * - useAuthState returns loading/authenticated states
 * - Auth token is passed to ConvexClient
 * - Auth state changes update client
 *
 * @module tests/react/ConvexProviderWithAuth
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import {
  ConvexProviderWithAuth,
  useConvexAuth,
  useAuthState,
  type AuthClient,
} from '../../src/react/ConvexProviderWithAuth'

// ============================================================================
// Mock ConvexClient
// ============================================================================

const mockSetAuth = vi.fn()
const mockClearAuth = vi.fn()

vi.mock('../../src/client/ConvexClient', () => {
  const MockConvexClient = vi.fn().mockImplementation((url, options) => {
    return {
      url,
      options,
      query: vi.fn(),
      mutation: vi.fn(),
      action: vi.fn(),
      onUpdate: vi.fn(),
      setAuth: mockSetAuth,
      clearAuth: mockClearAuth,
      close: vi.fn(),
    }
  })

  return {
    ConvexClient: MockConvexClient,
  }
})

// ============================================================================
// Test Helpers
// ============================================================================

function TestComponent({ testId = 'test-child' }: { testId?: string }) {
  return <div data-testid={testId}>Test Child</div>
}

function createMockAuthClient(overrides: Partial<AuthClient> = {}): () => AuthClient {
  return () => ({
    getToken: vi.fn().mockResolvedValue('test-token'),
    isLoading: false,
    isAuthenticated: false,
    ...overrides,
  })
}

function AuthStateConsumer() {
  const authState = useAuthState()
  return (
    <div data-testid="auth-state">
      <span data-testid="is-loading">{authState.isLoading.toString()}</span>
      <span data-testid="is-authenticated">{authState.isAuthenticated.toString()}</span>
    </div>
  )
}

function ConvexAuthConsumer() {
  const { client, authState } = useConvexAuth()
  return (
    <div data-testid="convex-auth">
      <span data-testid="has-client">{(!!client).toString()}</span>
      <span data-testid="auth-loading">{authState.isLoading.toString()}</span>
      <span data-testid="auth-authenticated">{authState.isAuthenticated.toString()}</span>
    </div>
  )
}

// ============================================================================
// ConvexProviderWithAuth Tests
// ============================================================================

describe('ConvexProviderWithAuth', () => {
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
    it('should render children correctly', () => {
      const useAuth = createMockAuthClient()

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <TestComponent />
        </ConvexProviderWithAuth>
      )

      expect(screen.getByTestId('test-child')).toBeInTheDocument()
    })

    it('should render multiple children', () => {
      const useAuth = createMockAuthClient()

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <TestComponent testId="child-1" />
          <TestComponent testId="child-2" />
        </ConvexProviderWithAuth>
      )

      expect(screen.getByTestId('child-1')).toBeInTheDocument()
      expect(screen.getByTestId('child-2')).toBeInTheDocument()
    })

    it('should render nested children', () => {
      const useAuth = createMockAuthClient()

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <div data-testid="outer">
            <div data-testid="inner">
              <TestComponent />
            </div>
          </div>
        </ConvexProviderWithAuth>
      )

      expect(screen.getByTestId('outer')).toBeInTheDocument()
      expect(screen.getByTestId('inner')).toBeInTheDocument()
      expect(screen.getByTestId('test-child')).toBeInTheDocument()
    })

    it('should render with text node children', () => {
      const useAuth = createMockAuthClient()

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          Hello World
        </ConvexProviderWithAuth>
      )

      expect(screen.getByText('Hello World')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Auth Token Tests
  // ============================================================================

  describe('auth token handling', () => {
    it('should set auth token when authenticated', async () => {
      const getToken = vi.fn().mockResolvedValue('my-auth-token')
      const useAuth = createMockAuthClient({
        getToken,
        isLoading: false,
        isAuthenticated: true,
      })

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <TestComponent />
        </ConvexProviderWithAuth>
      )

      await waitFor(() => {
        expect(getToken).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(mockSetAuth).toHaveBeenCalledWith('my-auth-token')
      })
    })

    it('should clear auth when not authenticated', async () => {
      const useAuth = createMockAuthClient({
        isLoading: false,
        isAuthenticated: false,
      })

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <TestComponent />
        </ConvexProviderWithAuth>
      )

      await waitFor(() => {
        expect(mockClearAuth).toHaveBeenCalled()
      })
    })

    it('should not set auth while loading', async () => {
      const getToken = vi.fn().mockResolvedValue('token')
      const useAuth = createMockAuthClient({
        getToken,
        isLoading: true,
        isAuthenticated: false,
      })

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <TestComponent />
        </ConvexProviderWithAuth>
      )

      // Wait a tick for effects to run
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(getToken).not.toHaveBeenCalled()
      expect(mockSetAuth).not.toHaveBeenCalled()
      expect(mockClearAuth).not.toHaveBeenCalled()
    })

    it('should handle null token gracefully', async () => {
      const getToken = vi.fn().mockResolvedValue(null)
      const useAuth = createMockAuthClient({
        getToken,
        isLoading: false,
        isAuthenticated: true,
      })

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <TestComponent />
        </ConvexProviderWithAuth>
      )

      await waitFor(() => {
        expect(getToken).toHaveBeenCalled()
      })

      // setAuth should not be called with null token
      expect(mockSetAuth).not.toHaveBeenCalled()
    })
  })

  // ============================================================================
  // Auth State Change Tests
  // ============================================================================

  describe('auth state changes', () => {
    it('should respond to auth state change callback', async () => {
      let authChangeCallback: (() => void) | undefined
      const useAuth = () => ({
        getToken: vi.fn().mockResolvedValue('token'),
        isLoading: false,
        isAuthenticated: true,
        onAuthStateChange: (callback: () => void) => {
          authChangeCallback = callback
          return () => {}
        },
      })

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <TestComponent />
        </ConvexProviderWithAuth>
      )

      expect(authChangeCallback).toBeDefined()

      // Trigger auth state change
      await act(async () => {
        authChangeCallback?.()
      })

      // Auth should be updated
      await waitFor(() => {
        expect(mockSetAuth).toHaveBeenCalled()
      })
    })

    it('should unsubscribe from auth state changes on unmount', () => {
      const unsubscribe = vi.fn()
      const useAuth = () => ({
        getToken: vi.fn().mockResolvedValue('token'),
        isLoading: false,
        isAuthenticated: false,
        onAuthStateChange: () => unsubscribe,
      })

      const { unmount } = render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <TestComponent />
        </ConvexProviderWithAuth>
      )

      unmount()

      expect(unsubscribe).toHaveBeenCalled()
    })
  })
})

// ============================================================================
// useConvexAuth Hook Tests
// ============================================================================

describe('useConvexAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Basic Usage Tests
  // ============================================================================

  describe('basic usage', () => {
    it('should return client and auth state', () => {
      const useAuth = createMockAuthClient({
        isLoading: false,
        isAuthenticated: true,
      })

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          {children}
        </ConvexProviderWithAuth>
      )

      const { result } = renderHook(() => useConvexAuth(), { wrapper })

      expect(result.current.client).toBeDefined()
      expect(result.current.authState).toBeDefined()
      expect(result.current.authState.isLoading).toBe(false)
      expect(result.current.authState.isAuthenticated).toBe(true)
    })

    it('should return client with expected methods', () => {
      const useAuth = createMockAuthClient()

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          {children}
        </ConvexProviderWithAuth>
      )

      const { result } = renderHook(() => useConvexAuth(), { wrapper })

      expect(result.current.client.query).toBeDefined()
      expect(result.current.client.mutation).toBeDefined()
      expect(result.current.client.action).toBeDefined()
      expect(result.current.client.setAuth).toBeDefined()
      expect(result.current.client.clearAuth).toBeDefined()
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw when used outside of ConvexProviderWithAuth', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useConvexAuth())
      }).toThrow('useConvexAuth must be used within a ConvexProviderWithAuth')

      consoleSpy.mockRestore()
    })

    it('should include helpful error message', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      try {
        renderHook(() => useConvexAuth())
      } catch (error) {
        expect((error as Error).message).toContain('ConvexProviderWithAuth')
      }

      consoleSpy.mockRestore()
    })
  })

  // ============================================================================
  // Component Integration Tests
  // ============================================================================

  describe('component integration', () => {
    it('should render correctly in consuming component', () => {
      const useAuth = createMockAuthClient({
        isLoading: false,
        isAuthenticated: true,
      })

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <ConvexAuthConsumer />
        </ConvexProviderWithAuth>
      )

      expect(screen.getByTestId('has-client').textContent).toBe('true')
      expect(screen.getByTestId('auth-loading').textContent).toBe('false')
      expect(screen.getByTestId('auth-authenticated').textContent).toBe('true')
    })
  })
})

// ============================================================================
// useAuthState Hook Tests
// ============================================================================

describe('useAuthState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Loading State Tests
  // ============================================================================

  describe('loading state', () => {
    it('should return isLoading true when auth is loading', () => {
      const useAuth = createMockAuthClient({
        isLoading: true,
        isAuthenticated: false,
      })

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          {children}
        </ConvexProviderWithAuth>
      )

      const { result } = renderHook(() => useAuthState(), { wrapper })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should return isLoading false when auth is loaded', () => {
      const useAuth = createMockAuthClient({
        isLoading: false,
        isAuthenticated: false,
      })

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          {children}
        </ConvexProviderWithAuth>
      )

      const { result } = renderHook(() => useAuthState(), { wrapper })

      expect(result.current.isLoading).toBe(false)
    })
  })

  // ============================================================================
  // Authenticated State Tests
  // ============================================================================

  describe('authenticated state', () => {
    it('should return isAuthenticated true when user is authenticated', () => {
      const useAuth = createMockAuthClient({
        isLoading: false,
        isAuthenticated: true,
      })

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          {children}
        </ConvexProviderWithAuth>
      )

      const { result } = renderHook(() => useAuthState(), { wrapper })

      expect(result.current.isAuthenticated).toBe(true)
    })

    it('should return isAuthenticated false when user is not authenticated', () => {
      const useAuth = createMockAuthClient({
        isLoading: false,
        isAuthenticated: false,
      })

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          {children}
        </ConvexProviderWithAuth>
      )

      const { result } = renderHook(() => useAuthState(), { wrapper })

      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  // ============================================================================
  // Component Integration Tests
  // ============================================================================

  describe('component integration', () => {
    it('should render loading state correctly', () => {
      const useAuth = createMockAuthClient({
        isLoading: true,
        isAuthenticated: false,
      })

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <AuthStateConsumer />
        </ConvexProviderWithAuth>
      )

      expect(screen.getByTestId('is-loading').textContent).toBe('true')
      expect(screen.getByTestId('is-authenticated').textContent).toBe('false')
    })

    it('should render authenticated state correctly', () => {
      const useAuth = createMockAuthClient({
        isLoading: false,
        isAuthenticated: true,
      })

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <AuthStateConsumer />
        </ConvexProviderWithAuth>
      )

      expect(screen.getByTestId('is-loading').textContent).toBe('false')
      expect(screen.getByTestId('is-authenticated').textContent).toBe('true')
    })

    it('should render unauthenticated state correctly', () => {
      const useAuth = createMockAuthClient({
        isLoading: false,
        isAuthenticated: false,
      })

      render(
        <ConvexProviderWithAuth url="https://test.convex.cloud" useAuth={useAuth}>
          <AuthStateConsumer />
        </ConvexProviderWithAuth>
      )

      expect(screen.getByTestId('is-loading').textContent).toBe('false')
      expect(screen.getByTestId('is-authenticated').textContent).toBe('false')
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw when used outside of ConvexProviderWithAuth', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useAuthState())
      }).toThrow()

      consoleSpy.mockRestore()
    })
  })
})
