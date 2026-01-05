/**
 * TDD Tests for ConvexProvider and useConvex Hook
 *
 * This module provides comprehensive tests for the React context provider
 * and useConvex hook that provides access to the ConvexClient.
 *
 * Features tested:
 * - ConvexProvider renders children correctly
 * - ConvexProvider creates ConvexClient with URL and options
 * - useConvex returns the ConvexClient instance
 * - useConvex throws when used outside provider
 * - Client is memoized and stable across renders
 * - Options changes create new client
 *
 * @module tests/react/ConvexProvider
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { ConvexProvider, useConvex } from '../../src/react/ConvexProvider'
import { ConvexClient } from '../../src/client/ConvexClient'

// ============================================================================
// Mock ConvexClient
// ============================================================================

vi.mock('../../src/client/ConvexClient', () => {
  const MockConvexClient = vi.fn().mockImplementation((url, options) => {
    return {
      url,
      options,
      query: vi.fn(),
      mutation: vi.fn(),
      action: vi.fn(),
      onUpdate: vi.fn(),
      setAuth: vi.fn(),
      clearAuth: vi.fn(),
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

function UseConvexConsumer({
  onClient,
}: {
  onClient?: (client: ConvexClient) => void
}) {
  const client = useConvex()
  React.useEffect(() => {
    onClient?.(client)
  }, [client, onClient])
  return <div data-testid="consumer">Got client</div>
}

// ============================================================================
// ConvexProvider Tests
// ============================================================================

describe('ConvexProvider', () => {
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
      render(
        <ConvexProvider url="https://test.convex.cloud">
          <TestComponent />
        </ConvexProvider>
      )

      expect(screen.getByTestId('test-child')).toBeInTheDocument()
    })

    it('should render multiple children', () => {
      render(
        <ConvexProvider url="https://test.convex.cloud">
          <TestComponent testId="child-1" />
          <TestComponent testId="child-2" />
        </ConvexProvider>
      )

      expect(screen.getByTestId('child-1')).toBeInTheDocument()
      expect(screen.getByTestId('child-2')).toBeInTheDocument()
    })

    it('should render nested children', () => {
      render(
        <ConvexProvider url="https://test.convex.cloud">
          <div data-testid="outer">
            <div data-testid="inner">
              <TestComponent />
            </div>
          </div>
        </ConvexProvider>
      )

      expect(screen.getByTestId('outer')).toBeInTheDocument()
      expect(screen.getByTestId('inner')).toBeInTheDocument()
      expect(screen.getByTestId('test-child')).toBeInTheDocument()
    })

    it('should render with text node children', () => {
      render(
        <ConvexProvider url="https://test.convex.cloud">
          Hello World
        </ConvexProvider>
      )

      expect(screen.getByText('Hello World')).toBeInTheDocument()
    })

    it('should render with null children', () => {
      const { container } = render(
        <ConvexProvider url="https://test.convex.cloud">
          {null}
        </ConvexProvider>
      )

      expect(container).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Client Creation Tests
  // ============================================================================

  describe('client creation', () => {
    it('should create ConvexClient with provided URL', () => {
      render(
        <ConvexProvider url="https://test.convex.cloud">
          <TestComponent />
        </ConvexProvider>
      )

      expect(ConvexClient).toHaveBeenCalledWith(
        'https://test.convex.cloud',
        undefined
      )
    })

    it('should create ConvexClient with options', () => {
      const options = {
        autoReconnect: false,
        reconnectDelay: 5000,
      }

      render(
        <ConvexProvider url="https://test.convex.cloud" options={options}>
          <TestComponent />
        </ConvexProvider>
      )

      expect(ConvexClient).toHaveBeenCalledWith(
        'https://test.convex.cloud',
        options
      )
    })

    it('should create client only once on initial render', () => {
      const { rerender } = render(
        <ConvexProvider url="https://test.convex.cloud">
          <TestComponent testId="child-1" />
        </ConvexProvider>
      )

      expect(ConvexClient).toHaveBeenCalledTimes(1)

      // Re-render with same props
      rerender(
        <ConvexProvider url="https://test.convex.cloud">
          <TestComponent testId="child-2" />
        </ConvexProvider>
      )

      // Should still only be called once (memoized)
      expect(ConvexClient).toHaveBeenCalledTimes(1)
    })

    it('should create new client when URL changes', () => {
      const { rerender } = render(
        <ConvexProvider url="https://test1.convex.cloud">
          <TestComponent />
        </ConvexProvider>
      )

      expect(ConvexClient).toHaveBeenCalledTimes(1)
      expect(ConvexClient).toHaveBeenLastCalledWith(
        'https://test1.convex.cloud',
        undefined
      )

      rerender(
        <ConvexProvider url="https://test2.convex.cloud">
          <TestComponent />
        </ConvexProvider>
      )

      expect(ConvexClient).toHaveBeenCalledTimes(2)
      expect(ConvexClient).toHaveBeenLastCalledWith(
        'https://test2.convex.cloud',
        undefined
      )
    })

    it('should create new client when options change', () => {
      const options1 = { autoReconnect: true }
      const options2 = { autoReconnect: false }

      const { rerender } = render(
        <ConvexProvider url="https://test.convex.cloud" options={options1}>
          <TestComponent />
        </ConvexProvider>
      )

      expect(ConvexClient).toHaveBeenCalledTimes(1)

      rerender(
        <ConvexProvider url="https://test.convex.cloud" options={options2}>
          <TestComponent />
        </ConvexProvider>
      )

      expect(ConvexClient).toHaveBeenCalledTimes(2)
    })
  })

  // ============================================================================
  // Context Value Tests
  // ============================================================================

  describe('context value', () => {
    it('should provide client to consuming components', () => {
      let receivedClient: ConvexClient | null = null

      render(
        <ConvexProvider url="https://test.convex.cloud">
          <UseConvexConsumer
            onClient={(client) => {
              receivedClient = client
            }}
          />
        </ConvexProvider>
      )

      expect(receivedClient).toBeDefined()
      expect(receivedClient).not.toBeNull()
    })

    it('should provide stable client reference across re-renders', () => {
      const clients: ConvexClient[] = []

      const Consumer = () => {
        const client = useConvex()
        clients.push(client)
        return null
      }

      const { rerender } = render(
        <ConvexProvider url="https://test.convex.cloud">
          <Consumer />
        </ConvexProvider>
      )

      rerender(
        <ConvexProvider url="https://test.convex.cloud">
          <Consumer />
        </ConvexProvider>
      )

      expect(clients.length).toBe(2)
      expect(clients[0]).toBe(clients[1])
    })

    it('should provide new client when URL changes', () => {
      const clients: ConvexClient[] = []

      const Consumer = () => {
        const client = useConvex()
        clients.push(client)
        return null
      }

      const { rerender } = render(
        <ConvexProvider url="https://test1.convex.cloud">
          <Consumer />
        </ConvexProvider>
      )

      rerender(
        <ConvexProvider url="https://test2.convex.cloud">
          <Consumer />
        </ConvexProvider>
      )

      expect(clients.length).toBe(2)
      expect(clients[0]).not.toBe(clients[1])
    })
  })

  // ============================================================================
  // Nested Provider Tests
  // ============================================================================

  describe('nested providers', () => {
    it('should support nested providers', () => {
      const outerClients: ConvexClient[] = []
      const innerClients: ConvexClient[] = []

      const OuterConsumer = () => {
        const client = useConvex()
        outerClients.push(client)
        return <div data-testid="outer-consumer">Outer</div>
      }

      const InnerConsumer = () => {
        const client = useConvex()
        innerClients.push(client)
        return <div data-testid="inner-consumer">Inner</div>
      }

      render(
        <ConvexProvider url="https://outer.convex.cloud">
          <OuterConsumer />
          <ConvexProvider url="https://inner.convex.cloud">
            <InnerConsumer />
          </ConvexProvider>
        </ConvexProvider>
      )

      expect(outerClients.length).toBe(1)
      expect(innerClients.length).toBe(1)
      expect(outerClients[0]).not.toBe(innerClients[0])
    })

    it('should use closest provider', () => {
      let innerClient: ConvexClient | null = null

      const InnerConsumer = () => {
        const client = useConvex()
        innerClient = client
        return null
      }

      render(
        <ConvexProvider url="https://outer.convex.cloud">
          <ConvexProvider url="https://inner.convex.cloud">
            <InnerConsumer />
          </ConvexProvider>
        </ConvexProvider>
      )

      expect(innerClient).toBeDefined()
      expect((innerClient as unknown as { url: string }).url).toBe(
        'https://inner.convex.cloud'
      )
    })
  })
})

// ============================================================================
// useConvex Hook Tests
// ============================================================================

describe('useConvex', () => {
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
    it('should return the ConvexClient instance', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProvider url="https://test.convex.cloud">{children}</ConvexProvider>
      )

      const { result } = renderHook(() => useConvex(), { wrapper })

      expect(result.current).toBeDefined()
    })

    it('should return client with expected methods', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProvider url="https://test.convex.cloud">{children}</ConvexProvider>
      )

      const { result } = renderHook(() => useConvex(), { wrapper })

      expect(result.current.query).toBeDefined()
      expect(result.current.mutation).toBeDefined()
      expect(result.current.action).toBeDefined()
      expect(result.current.onUpdate).toBeDefined()
    })

    it('should return stable reference across renders', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProvider url="https://test.convex.cloud">{children}</ConvexProvider>
      )

      const { result, rerender } = renderHook(() => useConvex(), { wrapper })
      const firstClient = result.current

      rerender()

      expect(result.current).toBe(firstClient)
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw when used outside of ConvexProvider', () => {
      // Suppress console.error for this test since we expect an error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useConvex())
      }).toThrow('useConvex must be used within a ConvexProvider')

      consoleSpy.mockRestore()
    })

    it('should include helpful error message', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      try {
        renderHook(() => useConvex())
      } catch (error) {
        expect((error as Error).message).toContain('ConvexProvider')
        expect((error as Error).message).toContain('<ConvexProvider url="...">')
      }

      consoleSpy.mockRestore()
    })

    it('should work after being wrapped in provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // First, verify it throws without provider
      expect(() => {
        renderHook(() => useConvex())
      }).toThrow()

      consoleSpy.mockRestore()

      // Then verify it works with provider
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProvider url="https://test.convex.cloud">{children}</ConvexProvider>
      )

      const { result } = renderHook(() => useConvex(), { wrapper })
      expect(result.current).toBeDefined()
    })
  })

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('integration', () => {
    it('should allow calling client methods', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ConvexProvider url="https://test.convex.cloud">{children}</ConvexProvider>
      )

      const { result } = renderHook(() => useConvex(), { wrapper })

      const mockQuery = { _path: 'test:query', _type: 'query' } as const

      result.current.query(mockQuery as any, { arg: 'value' })

      expect(result.current.query).toHaveBeenCalledWith(mockQuery, {
        arg: 'value',
      })
    })

    it('should work in multiple components simultaneously', () => {
      const clients: ConvexClient[] = []

      const Consumer1 = () => {
        const client = useConvex()
        clients.push(client)
        return <div data-testid="consumer-1">1</div>
      }

      const Consumer2 = () => {
        const client = useConvex()
        clients.push(client)
        return <div data-testid="consumer-2">2</div>
      }

      render(
        <ConvexProvider url="https://test.convex.cloud">
          <Consumer1 />
          <Consumer2 />
        </ConvexProvider>
      )

      expect(clients.length).toBe(2)
      expect(clients[0]).toBe(clients[1])
    })
  })
})
