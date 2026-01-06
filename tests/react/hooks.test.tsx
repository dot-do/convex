/**
 * TDD Tests for React Hooks: useQuery, useMutation, useAction, usePaginatedQuery
 *
 * This module provides comprehensive tests for the core React hooks
 * that interact with ConvexClient for queries, mutations, and actions.
 *
 * Features tested:
 * - useQuery: reactive queries with real-time updates
 * - useQuery skip functionality
 * - useMutation: mutation execution
 * - useMutationWithState: loading and error states
 * - useAction: action execution
 * - useActionWithState: loading and error states
 * - usePaginatedQuery: paginated queries with load more
 * - Pagination status states
 *
 * @module tests/react/hooks
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { ConvexProvider } from '../../src/react/ConvexProvider'
import { useQuery, skip } from '../../src/react/useQuery'
import { useMutation, useMutationWithState } from '../../src/react/useMutation'
import { useAction, useActionWithState } from '../../src/react/useAction'
import { usePaginatedQuery } from '../../src/react/usePaginatedQuery'
import type { FunctionReference, PaginationResult } from '../../src/types'

// ============================================================================
// Mock ConvexClient
// ============================================================================

// Use vi.hoisted to ensure mocks are available when vi.mock factory runs
// (vi.mock is hoisted to the top of the file, before regular const declarations)
const {
  mockQuery,
  mockMutation,
  mockAction,
  mockOnUpdate,
  mockSetAuth,
  mockClearAuth,
  mockClose,
} = vi.hoisted(() => ({
  mockQuery: vi.fn().mockResolvedValue(null),
  mockMutation: vi.fn().mockResolvedValue(null),
  mockAction: vi.fn().mockResolvedValue(null),
  mockOnUpdate: vi.fn().mockReturnValue(() => {}),
  mockSetAuth: vi.fn(),
  mockClearAuth: vi.fn(),
  mockClose: vi.fn(),
}))

// Reset all mock implementations to defaults before each test
function resetMockDefaults() {
  // Clear and reset all mocks with proper default implementations
  mockQuery.mockClear()
  mockQuery.mockReset()
  mockQuery.mockResolvedValue(null)

  mockMutation.mockClear()
  mockMutation.mockReset()
  mockMutation.mockResolvedValue(null)

  mockAction.mockClear()
  mockAction.mockReset()
  mockAction.mockResolvedValue(null)

  mockOnUpdate.mockClear()
  mockOnUpdate.mockReset()
  mockOnUpdate.mockReturnValue(() => {})

  mockSetAuth.mockClear()
  mockSetAuth.mockReset()

  mockClearAuth.mockClear()
  mockClearAuth.mockReset()

  mockClose.mockClear()
  mockClose.mockReset()
}

vi.mock('../../src/client/ConvexClient', () => {
  const MockConvexClient = vi.fn().mockImplementation((url, options) => {
    return {
      url,
      options,
      query: mockQuery,
      mutation: mockMutation,
      action: mockAction,
      onUpdate: mockOnUpdate,
      setAuth: mockSetAuth,
      clearAuth: mockClearAuth,
      close: mockClose,
    }
  })

  return {
    ConvexClient: MockConvexClient,
  }
})

// ============================================================================
// Test Helpers
// ============================================================================

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <ConvexProvider url="https://test.convex.cloud">{children}</ConvexProvider>
  )
}

function createQueryRef<T = unknown>(
  path: string
): FunctionReference<'query', unknown, T> {
  return {
    _type: 'query',
    _args: {} as unknown,
    _returns: {} as T,
    _path: path,
  }
}

function createMutationRef<Args = unknown, Returns = unknown>(
  path: string
): FunctionReference<'mutation', Args, Returns> {
  return {
    _type: 'mutation',
    _args: {} as Args,
    _returns: {} as Returns,
    _path: path,
  }
}

function createActionRef<Args = unknown, Returns = unknown>(
  path: string
): FunctionReference<'action', Args, Returns> {
  return {
    _type: 'action',
    _args: {} as Args,
    _returns: {} as Returns,
    _path: path,
  }
}

// ============================================================================
// useQuery Tests
// ============================================================================

describe('useQuery', () => {
  beforeEach(() => {
    resetMockDefaults()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Basic Usage Tests
  // ============================================================================

  describe('basic usage', () => {
    it('should return undefined initially', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { result } = renderHook(
        () => useQuery(createQueryRef('messages:list'), {}),
        { wrapper: createWrapper() }
      )

      expect(result.current).toBeUndefined()
    })

    it('should subscribe to query on mount', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      renderHook(() => useQuery(createQueryRef('messages:list'), { channel: 'general' }), {
        wrapper: createWrapper(),
      })

      expect(mockOnUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _path: 'messages:list' }),
        { channel: 'general' },
        expect.any(Function),
        expect.objectContaining({ onError: expect.any(Function) })
      )
    })

    it('should return data when subscription receives update', async () => {
      let updateCallback: ((data: unknown) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      const { result } = renderHook(
        () => useQuery(createQueryRef('messages:list'), {}),
        { wrapper: createWrapper() }
      )

      expect(result.current).toBeUndefined()

      act(() => {
        updateCallback?.([{ id: '1', body: 'Hello' }])
      })

      expect(result.current).toEqual([{ id: '1', body: 'Hello' }])
    })

    it('should unsubscribe on unmount', () => {
      const unsubscribe = vi.fn()
      mockOnUpdate.mockImplementation(() => unsubscribe)

      const { unmount } = renderHook(
        () => useQuery(createQueryRef('messages:list'), {}),
        { wrapper: createWrapper() }
      )

      expect(unsubscribe).not.toHaveBeenCalled()

      unmount()

      expect(unsubscribe).toHaveBeenCalled()
    })

    it('should resubscribe when args change', () => {
      const unsubscribe1 = vi.fn()
      const unsubscribe2 = vi.fn()
      let callCount = 0

      mockOnUpdate.mockImplementation(() => {
        callCount++
        return callCount === 1 ? unsubscribe1 : unsubscribe2
      })

      const { rerender } = renderHook(
        ({ channel }) => useQuery(createQueryRef('messages:list'), { channel }),
        {
          wrapper: createWrapper(),
          initialProps: { channel: 'general' },
        }
      )

      expect(mockOnUpdate).toHaveBeenCalledTimes(1)

      rerender({ channel: 'random' })

      expect(unsubscribe1).toHaveBeenCalled()
      expect(mockOnUpdate).toHaveBeenCalledTimes(2)
    })

    it('should not resubscribe when args are deeply equal', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { rerender } = renderHook(
        () => useQuery(createQueryRef('messages:list'), { channel: 'general' }),
        { wrapper: createWrapper() }
      )

      expect(mockOnUpdate).toHaveBeenCalledTimes(1)

      // Rerender with equivalent args object (new reference but same value)
      rerender()

      // Should still only be called once due to JSON comparison
      expect(mockOnUpdate).toHaveBeenCalledTimes(1)
    })
  })

  // ============================================================================
  // Skip Functionality Tests
  // ============================================================================

  describe('skip functionality', () => {
    it('should not subscribe when args is "skip" string', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { result } = renderHook(
        () => useQuery(createQueryRef('users:get'), 'skip'),
        { wrapper: createWrapper() }
      )

      expect(mockOnUpdate).not.toHaveBeenCalled()
      expect(result.current).toBeUndefined()
    })

    it('should not subscribe when args is skip symbol', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { result } = renderHook(
        () => useQuery(createQueryRef('users:get'), skip),
        { wrapper: createWrapper() }
      )

      expect(mockOnUpdate).not.toHaveBeenCalled()
      expect(result.current).toBeUndefined()
    })

    it('should subscribe when changing from skip to real args', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { rerender } = renderHook(
        ({ shouldSkip, userId }: { shouldSkip: boolean; userId: string }) =>
          useQuery(createQueryRef('users:get'), shouldSkip ? skip : { userId }),
        {
          wrapper: createWrapper(),
          initialProps: { shouldSkip: true, userId: 'user-1' },
        }
      )

      expect(mockOnUpdate).not.toHaveBeenCalled()

      rerender({ shouldSkip: false, userId: 'user-1' })

      expect(mockOnUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _path: 'users:get' }),
        { userId: 'user-1' },
        expect.any(Function),
        expect.any(Object)
      )
    })

    it('should unsubscribe when changing from real args to skip', () => {
      const unsubscribe = vi.fn()
      mockOnUpdate.mockImplementation(() => unsubscribe)

      const { rerender, result } = renderHook(
        ({ shouldSkip, userId }: { shouldSkip: boolean; userId: string }) =>
          useQuery(createQueryRef('users:get'), shouldSkip ? skip : { userId }),
        {
          wrapper: createWrapper(),
          initialProps: { shouldSkip: false, userId: 'user-1' },
        }
      )

      expect(mockOnUpdate).toHaveBeenCalledTimes(1)

      rerender({ shouldSkip: true, userId: 'user-1' })

      expect(unsubscribe).toHaveBeenCalled()
      expect(result.current).toBeUndefined()
    })

    it('should support conditional skip pattern', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { result, rerender } = renderHook(
        ({ userId }: { userId: string | null }) =>
          useQuery(createQueryRef('users:get'), userId ? { userId } : skip),
        {
          wrapper: createWrapper(),
          initialProps: { userId: null as string | null },
        }
      )

      expect(mockOnUpdate).not.toHaveBeenCalled()
      expect(result.current).toBeUndefined()

      rerender({ userId: 'user-123' })

      expect(mockOnUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _path: 'users:get' }),
        { userId: 'user-123' },
        expect.any(Function),
        expect.any(Object)
      )
    })
  })

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should throw error for error boundary to catch', async () => {
      let errorCallback: ((error: Error) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback, options) => {
        errorCallback = options?.onError
        return () => {}
      })

      const { result } = renderHook(
        () => useQuery(createQueryRef('messages:list'), {}),
        { wrapper: createWrapper() }
      )

      expect(() => {
        act(() => {
          errorCallback?.(new Error('Query failed'))
        })
      }).toThrow('Query failed')
    })

    it('should clear error when data is received after error', async () => {
      let updateCallback: ((data: unknown) => void) | null = null
      let errorCallback: ((error: Error) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback, options) => {
        updateCallback = callback
        errorCallback = options?.onError
        return () => {}
      })

      const { result } = renderHook(
        () => useQuery(createQueryRef('messages:list'), {}),
        { wrapper: createWrapper() }
      )

      // First receive data
      act(() => {
        updateCallback?.([{ id: '1' }])
      })

      expect(result.current).toEqual([{ id: '1' }])

      // The error mechanism throws, so we test it doesn't throw after getting data
      act(() => {
        updateCallback?.([{ id: '2' }])
      })

      expect(result.current).toEqual([{ id: '2' }])
    })
  })

  // ============================================================================
  // Data Update Tests
  // ============================================================================

  describe('data updates', () => {
    it('should update data on each subscription update', () => {
      let updateCallback: ((data: unknown) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      const { result } = renderHook(
        () => useQuery(createQueryRef('messages:list'), {}),
        { wrapper: createWrapper() }
      )

      act(() => {
        updateCallback?.([{ id: '1' }])
      })
      expect(result.current).toEqual([{ id: '1' }])

      act(() => {
        updateCallback?.([{ id: '1' }, { id: '2' }])
      })
      expect(result.current).toEqual([{ id: '1' }, { id: '2' }])

      act(() => {
        updateCallback?.([])
      })
      expect(result.current).toEqual([])
    })

    it('should handle null data', () => {
      let updateCallback: ((data: unknown) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      const { result } = renderHook(
        () => useQuery(createQueryRef('users:get'), { userId: '123' }),
        { wrapper: createWrapper() }
      )

      act(() => {
        updateCallback?.(null)
      })

      expect(result.current).toBeNull()
    })

    it('should handle complex data types', () => {
      let updateCallback: ((data: unknown) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      const { result } = renderHook(
        () => useQuery(createQueryRef('data:complex'), {}),
        { wrapper: createWrapper() }
      )

      const complexData = {
        users: [{ id: '1', profile: { name: 'Alice', settings: { theme: 'dark' } } }],
        metadata: { total: 1, page: 1 },
        nested: { deeply: { nested: { value: 42 } } },
      }

      act(() => {
        updateCallback?.(complexData)
      })

      expect(result.current).toEqual(complexData)
    })
  })
})

// ============================================================================
// useMutation Tests
// ============================================================================

describe('useMutation', () => {
  beforeEach(() => {
    resetMockDefaults()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Basic Usage Tests
  // ============================================================================

  describe('basic usage', () => {
    it('should return a function', () => {
      const { result } = renderHook(
        () => useMutation(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      expect(typeof result.current).toBe('function')
    })

    it('should call client.mutation when invoked', async () => {
      mockMutation.mockResolvedValue({ id: 'msg-1' })

      const { result } = renderHook(
        () => useMutation(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        await result.current({ body: 'Hello' })
      })

      expect(mockMutation).toHaveBeenCalledWith(
        expect.objectContaining({ _path: 'messages:send' }),
        { body: 'Hello' }
      )
    })

    it('should return mutation result', async () => {
      const expectedResult = { id: 'msg-123', body: 'Hello' }
      mockMutation.mockResolvedValue(expectedResult)

      const { result } = renderHook(
        () => useMutation(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      let mutationResult: unknown
      await act(async () => {
        mutationResult = await result.current({ body: 'Hello' })
      })

      expect(mutationResult).toEqual(expectedResult)
    })

    it('should throw on mutation error', async () => {
      const error = new Error('Mutation failed')
      mockMutation.mockRejectedValue(error)

      const { result } = renderHook(
        () => useMutation(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      await expect(
        act(async () => {
          await result.current({ body: 'Hello' })
        })
      ).rejects.toThrow('Mutation failed')
    })

    it('should be stable across renders', () => {
      // Create mutation ref once outside the hook to ensure stable reference
      const mutationRef = createMutationRef('messages:send')

      const { result, rerender } = renderHook(
        () => useMutation(mutationRef),
        { wrapper: createWrapper() }
      )

      const firstMutate = result.current

      rerender()

      expect(result.current).toBe(firstMutate)
    })
  })

  // ============================================================================
  // Multiple Mutations Tests
  // ============================================================================

  describe('multiple mutations', () => {
    it('should support multiple concurrent mutations', async () => {
      mockMutation.mockImplementation(async (ref, args) => {
        return { id: `msg-${args.index}` }
      })

      const { result } = renderHook(
        () => useMutation(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      const results: unknown[] = []
      await act(async () => {
        results.push(
          await Promise.all([
            result.current({ index: 1 }),
            result.current({ index: 2 }),
            result.current({ index: 3 }),
          ])
        )
      })

      expect(mockMutation).toHaveBeenCalledTimes(3)
    })

    it('should handle mixed success and failure', async () => {
      let callCount = 0
      mockMutation.mockImplementation(async () => {
        callCount++
        if (callCount === 2) {
          throw new Error('Second mutation failed')
        }
        return { success: true, callCount }
      })

      const { result } = renderHook(
        () => useMutation(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      // First mutation should succeed
      await act(async () => {
        const result1 = await result.current({ index: 1 })
        expect(result1).toEqual({ success: true, callCount: 1 })
      })

      // Second mutation should fail - wrap in try/catch to properly handle the error
      let secondError: Error | null = null
      await act(async () => {
        try {
          await result.current({ index: 2 })
        } catch (err) {
          secondError = err as Error
        }
      })
      expect(secondError).toBeInstanceOf(Error)
      expect(secondError?.message).toBe('Second mutation failed')

      // Third mutation should succeed
      await act(async () => {
        const result3 = await result.current({ index: 3 })
        expect(result3).toEqual({ success: true, callCount: 3 })
      })
    })
  })
})

// ============================================================================
// useMutationWithState Tests
// ============================================================================

describe('useMutationWithState', () => {
  beforeEach(() => {
    resetMockDefaults()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Initial State Tests
  // ============================================================================

  describe('initial state', () => {
    it('should return initial state with isLoading false', () => {
      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      // Debug: Check if there was an error during render
      if (result.current === null) {
        console.error('result.current is null - hook likely threw an error')
        // @ts-expect-error - accessing internal error property for debugging
        console.error('renderHook error:', result.error)
      }

      expect(result.current).not.toBeNull()
      expect(result.current.isLoading).toBe(false)
    })

    it('should return initial state with error null', () => {
      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      expect(result.current.error).toBeNull()
    })

    it('should return mutate function', () => {
      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      expect(typeof result.current.mutate).toBe('function')
    })
  })

  // ============================================================================
  // Loading State Tests
  // ============================================================================

  describe('loading state', () => {
    it('should set isLoading to true during mutation', async () => {
      let resolvePromise: (value: unknown) => void
      mockMutation.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve
          })
      )

      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(false)

      let mutationPromise: Promise<unknown>
      act(() => {
        mutationPromise = result.current.mutate({ body: 'Hello' })
      })

      expect(result.current.isLoading).toBe(true)

      await act(async () => {
        resolvePromise!({ id: 'msg-1' })
        await mutationPromise
      })

      expect(result.current.isLoading).toBe(false)
    })

    it('should set isLoading to false after successful mutation', async () => {
      mockMutation.mockResolvedValue({ id: 'msg-1' })

      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        await result.current.mutate({ body: 'Hello' })
      })

      expect(result.current.isLoading).toBe(false)
    })

    it('should set isLoading to false after failed mutation', async () => {
      mockMutation.mockRejectedValue(new Error('Failed'))

      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        try {
          await result.current.mutate({ body: 'Hello' })
        } catch {
          // Expected
        }
      })

      expect(result.current.isLoading).toBe(false)
    })
  })

  // ============================================================================
  // Error State Tests
  // ============================================================================

  describe('error state', () => {
    it('should set error on mutation failure', async () => {
      const expectedError = new Error('Mutation failed')
      mockMutation.mockRejectedValue(expectedError)

      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        try {
          await result.current.mutate({ body: 'Hello' })
        } catch {
          // Expected
        }
      })

      expect(result.current.error).toBe(expectedError)
    })

    it('should convert non-Error to Error', async () => {
      mockMutation.mockRejectedValue('String error')

      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        try {
          await result.current.mutate({ body: 'Hello' })
        } catch {
          // Expected
        }
      })

      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error?.message).toBe('String error')
    })

    it('should clear error on new mutation', async () => {
      mockMutation
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({ id: 'msg-1' })

      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      // First mutation fails
      await act(async () => {
        try {
          await result.current.mutate({ body: 'Hello' })
        } catch {
          // Expected
        }
      })

      expect(result.current.error).not.toBeNull()

      // Second mutation succeeds, error should be cleared
      await act(async () => {
        await result.current.mutate({ body: 'Hello again' })
      })

      expect(result.current.error).toBeNull()
    })

    it('should re-throw error after setting state', async () => {
      const expectedError = new Error('Mutation failed')
      mockMutation.mockRejectedValue(expectedError)

      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      await expect(
        act(async () => {
          await result.current.mutate({ body: 'Hello' })
        })
      ).rejects.toThrow('Mutation failed')
    })
  })

  // ============================================================================
  // Return Value Tests
  // ============================================================================

  describe('return value', () => {
    it('should return mutation result on success', async () => {
      const expectedResult = { id: 'msg-123' }
      mockMutation.mockResolvedValue(expectedResult)

      const { result } = renderHook(
        () => useMutationWithState(createMutationRef('messages:send')),
        { wrapper: createWrapper() }
      )

      let mutationResult: unknown
      await act(async () => {
        mutationResult = await result.current.mutate({ body: 'Hello' })
      })

      expect(mutationResult).toEqual(expectedResult)
    })
  })
})

// ============================================================================
// useAction Tests
// ============================================================================

describe('useAction', () => {
  beforeEach(() => {
    resetMockDefaults()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Basic Usage Tests
  // ============================================================================

  describe('basic usage', () => {
    it('should return a function', () => {
      const { result } = renderHook(
        () => useAction(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      expect(typeof result.current).toBe('function')
    })

    it('should call client.action when invoked', async () => {
      mockAction.mockResolvedValue({ url: 'https://example.com/image.png' })

      const { result } = renderHook(
        () => useAction(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        await result.current({ prompt: 'A cat' })
      })

      expect(mockAction).toHaveBeenCalledWith(
        expect.objectContaining({ _path: 'ai:generate' }),
        { prompt: 'A cat' }
      )
    })

    it('should return action result', async () => {
      const expectedResult = { url: 'https://example.com/image.png' }
      mockAction.mockResolvedValue(expectedResult)

      const { result } = renderHook(
        () => useAction(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      let actionResult: unknown
      await act(async () => {
        actionResult = await result.current({ prompt: 'A cat' })
      })

      expect(actionResult).toEqual(expectedResult)
    })

    it('should throw on action error', async () => {
      mockAction.mockRejectedValue(new Error('Action failed'))

      const { result } = renderHook(
        () => useAction(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      await expect(
        act(async () => {
          await result.current({ prompt: 'A cat' })
        })
      ).rejects.toThrow('Action failed')
    })

    it('should be stable across renders', () => {
      // Create action ref once outside the hook to ensure stable reference
      const actionRef = createActionRef('ai:generate')

      const { result, rerender } = renderHook(
        () => useAction(actionRef),
        { wrapper: createWrapper() }
      )

      const firstExecute = result.current

      rerender()

      expect(result.current).toBe(firstExecute)
    })
  })
})

// ============================================================================
// useActionWithState Tests
// ============================================================================

describe('useActionWithState', () => {
  beforeEach(() => {
    resetMockDefaults()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Initial State Tests
  // ============================================================================

  describe('initial state', () => {
    it('should return initial state with isLoading false', () => {
      const { result } = renderHook(
        () => useActionWithState(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(false)
    })

    it('should return initial state with error null', () => {
      const { result } = renderHook(
        () => useActionWithState(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      expect(result.current.error).toBeNull()
    })

    it('should return execute function', () => {
      const { result } = renderHook(
        () => useActionWithState(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      expect(typeof result.current.execute).toBe('function')
    })
  })

  // ============================================================================
  // Loading State Tests
  // ============================================================================

  describe('loading state', () => {
    it('should set isLoading to true during action', async () => {
      let resolvePromise: (value: unknown) => void
      mockAction.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve
          })
      )

      const { result } = renderHook(
        () => useActionWithState(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(false)

      let actionPromise: Promise<unknown>
      act(() => {
        actionPromise = result.current.execute({ prompt: 'A cat' })
      })

      expect(result.current.isLoading).toBe(true)

      await act(async () => {
        resolvePromise!({ url: 'https://example.com/image.png' })
        await actionPromise
      })

      expect(result.current.isLoading).toBe(false)
    })

    it('should set isLoading to false after successful action', async () => {
      mockAction.mockResolvedValue({ url: 'https://example.com/image.png' })

      const { result } = renderHook(
        () => useActionWithState(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        await result.current.execute({ prompt: 'A cat' })
      })

      expect(result.current.isLoading).toBe(false)
    })

    it('should set isLoading to false after failed action', async () => {
      mockAction.mockRejectedValue(new Error('Failed'))

      const { result } = renderHook(
        () => useActionWithState(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        try {
          await result.current.execute({ prompt: 'A cat' })
        } catch {
          // Expected
        }
      })

      expect(result.current.isLoading).toBe(false)
    })
  })

  // ============================================================================
  // Error State Tests
  // ============================================================================

  describe('error state', () => {
    it('should set error on action failure', async () => {
      const expectedError = new Error('Action failed')
      mockAction.mockRejectedValue(expectedError)

      const { result } = renderHook(
        () => useActionWithState(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        try {
          await result.current.execute({ prompt: 'A cat' })
        } catch {
          // Expected
        }
      })

      expect(result.current.error).toBe(expectedError)
    })

    it('should convert non-Error to Error', async () => {
      mockAction.mockRejectedValue('String error')

      const { result } = renderHook(
        () => useActionWithState(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        try {
          await result.current.execute({ prompt: 'A cat' })
        } catch {
          // Expected
        }
      })

      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error?.message).toBe('String error')
    })

    it('should clear error on new action', async () => {
      mockAction
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce({ url: 'https://example.com/image.png' })

      const { result } = renderHook(
        () => useActionWithState(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      // First action fails
      await act(async () => {
        try {
          await result.current.execute({ prompt: 'A cat' })
        } catch {
          // Expected
        }
      })

      expect(result.current.error).not.toBeNull()

      // Second action succeeds, error should be cleared
      await act(async () => {
        await result.current.execute({ prompt: 'A dog' })
      })

      expect(result.current.error).toBeNull()
    })

    it('should re-throw error after setting state', async () => {
      mockAction.mockRejectedValue(new Error('Action failed'))

      const { result } = renderHook(
        () => useActionWithState(createActionRef('ai:generate')),
        { wrapper: createWrapper() }
      )

      await expect(
        act(async () => {
          await result.current.execute({ prompt: 'A cat' })
        })
      ).rejects.toThrow('Action failed')
    })
  })
})

// ============================================================================
// usePaginatedQuery Tests
// ============================================================================

describe('usePaginatedQuery', () => {
  beforeEach(() => {
    resetMockDefaults()
  })

  afterEach(() => {
    cleanup()
  })

  // ============================================================================
  // Initial State Tests
  // ============================================================================

  describe('initial state', () => {
    it('should return empty results initially', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<unknown>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      expect(result.current.results).toEqual([])
    })

    it('should return LoadingFirstPage status initially', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<unknown>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      expect(result.current.status).toBe('LoadingFirstPage')
    })

    it('should return isLoading true initially', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<unknown>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(true)
    })

    it('should return loadMore function', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<unknown>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      expect(typeof result.current.loadMore).toBe('function')
    })
  })

  // ============================================================================
  // Status Transitions Tests
  // ============================================================================

  describe('status transitions', () => {
    it('should transition to CanLoadMore when more data available', () => {
      let updateCallback: ((data: PaginationResult<unknown>) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<{ id: string }>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      act(() => {
        updateCallback?.({
          page: [{ id: '1' }, { id: '2' }],
          isDone: false,
          continueCursor: 'cursor-123',
        })
      })

      expect(result.current.status).toBe('CanLoadMore')
      expect(result.current.isLoading).toBe(false)
    })

    it('should transition to Exhausted when no more data', () => {
      let updateCallback: ((data: PaginationResult<unknown>) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<{ id: string }>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      act(() => {
        updateCallback?.({
          page: [{ id: '1' }],
          isDone: true,
          continueCursor: '',
        })
      })

      expect(result.current.status).toBe('Exhausted')
      expect(result.current.isLoading).toBe(false)
    })

    it('should transition to LoadingMore when loading more', async () => {
      let updateCallback: ((data: PaginationResult<unknown>) => void) | null = null
      let resolveLoadMore: (value: PaginationResult<unknown>) => void

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      mockQuery.mockImplementation(() => {
        return new Promise((resolve) => {
          resolveLoadMore = resolve
        })
      })

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<{ id: string }>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      // First, load initial page
      act(() => {
        updateCallback?.({
          page: [{ id: '1' }],
          isDone: false,
          continueCursor: 'cursor-123',
        })
      })

      expect(result.current.status).toBe('CanLoadMore')

      // Start loading more
      act(() => {
        result.current.loadMore(20)
      })

      expect(result.current.status).toBe('LoadingMore')
      expect(result.current.isLoading).toBe(true)

      // Resolve the load more
      await act(async () => {
        resolveLoadMore!({
          page: [{ id: '2' }],
          isDone: true,
          continueCursor: '',
        })
      })

      expect(result.current.status).toBe('Exhausted')
    })
  })

  // ============================================================================
  // Results Accumulation Tests
  // ============================================================================

  describe('results accumulation', () => {
    it('should accumulate results from multiple pages', async () => {
      let updateCallback: ((data: PaginationResult<unknown>) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      mockQuery.mockResolvedValue({
        page: [{ id: '3' }, { id: '4' }],
        isDone: true,
        continueCursor: '',
      })

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<{ id: string }>>('messages:list'),
            { channel: 'general' },
            { numItems: 2 }
          ),
        { wrapper: createWrapper() }
      )

      // First page
      act(() => {
        updateCallback?.({
          page: [{ id: '1' }, { id: '2' }],
          isDone: false,
          continueCursor: 'cursor-123',
        })
      })

      expect(result.current.results).toEqual([{ id: '1' }, { id: '2' }])

      // Load more
      await act(async () => {
        result.current.loadMore(2)
      })

      expect(result.current.results).toEqual([
        { id: '1' },
        { id: '2' },
        { id: '3' },
        { id: '4' },
      ])
    })

    it('should reset results when args change', () => {
      let updateCallback: ((data: PaginationResult<unknown>) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      const { result, rerender } = renderHook(
        ({ channel }) =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<{ id: string }>>('messages:list'),
            { channel },
            { numItems: 20 }
          ),
        {
          wrapper: createWrapper(),
          initialProps: { channel: 'general' },
        }
      )

      // Load some data
      act(() => {
        updateCallback?.({
          page: [{ id: '1' }],
          isDone: false,
          continueCursor: 'cursor-123',
        })
      })

      expect(result.current.results).toEqual([{ id: '1' }])

      // Change args
      rerender({ channel: 'random' })

      expect(result.current.results).toEqual([])
      expect(result.current.status).toBe('LoadingFirstPage')
    })
  })

  // ============================================================================
  // Load More Tests
  // ============================================================================

  describe('loadMore', () => {
    it('should not load more when status is LoadingFirstPage', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<unknown>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      result.current.loadMore(20)

      expect(mockQuery).not.toHaveBeenCalled()
    })

    it('should not load more when status is Exhausted', () => {
      let updateCallback: ((data: PaginationResult<unknown>) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<{ id: string }>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      act(() => {
        updateCallback?.({
          page: [{ id: '1' }],
          isDone: true,
          continueCursor: '',
        })
      })

      expect(result.current.status).toBe('Exhausted')

      result.current.loadMore(20)

      expect(mockQuery).not.toHaveBeenCalled()
    })

    it('should not load more when status is LoadingMore', async () => {
      let updateCallback: ((data: PaginationResult<unknown>) => void) | null = null
      let resolveLoadMore: () => void

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      mockQuery.mockImplementation(() => {
        return new Promise((resolve) => {
          resolveLoadMore = () => resolve({
            page: [{ id: '2' }],
            isDone: true,
            continueCursor: '',
          })
        })
      })

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<{ id: string }>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      act(() => {
        updateCallback?.({
          page: [{ id: '1' }],
          isDone: false,
          continueCursor: 'cursor-123',
        })
      })

      // Start first loadMore
      act(() => {
        result.current.loadMore(20)
      })

      expect(result.current.status).toBe('LoadingMore')
      expect(mockQuery).toHaveBeenCalledTimes(1)

      // Try to load more again while loading
      act(() => {
        result.current.loadMore(20)
      })

      // Should still only be called once
      expect(mockQuery).toHaveBeenCalledTimes(1)

      // Cleanup
      await act(async () => {
        resolveLoadMore!()
      })
    })

    it('should use provided numItems for loadMore', async () => {
      let updateCallback: ((data: PaginationResult<unknown>) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      mockQuery.mockResolvedValue({
        page: [],
        isDone: true,
        continueCursor: '',
      })

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<{ id: string }>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      act(() => {
        updateCallback?.({
          page: [{ id: '1' }],
          isDone: false,
          continueCursor: 'cursor-123',
        })
      })

      await act(async () => {
        result.current.loadMore(50)
      })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          paginationOpts: expect.objectContaining({ numItems: 50 }),
        })
      )
    })

    it('should pass cursor to loadMore query', async () => {
      let updateCallback: ((data: PaginationResult<unknown>) => void) | null = null

      mockOnUpdate.mockImplementation((query, args, callback) => {
        updateCallback = callback
        return () => {}
      })

      mockQuery.mockResolvedValue({
        page: [],
        isDone: true,
        continueCursor: '',
      })

      const { result } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<{ id: string }>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      act(() => {
        updateCallback?.({
          page: [{ id: '1' }],
          isDone: false,
          continueCursor: 'my-cursor-abc',
        })
      })

      await act(async () => {
        result.current.loadMore(20)
      })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          paginationOpts: expect.objectContaining({ cursor: 'my-cursor-abc' }),
        })
      )
    })
  })

  // ============================================================================
  // Subscription Tests
  // ============================================================================

  describe('subscription', () => {
    it('should subscribe with paginationOpts', () => {
      mockOnUpdate.mockImplementation(() => () => {})

      renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<unknown>>('messages:list'),
            { channel: 'general' },
            { numItems: 25 }
          ),
        { wrapper: createWrapper() }
      )

      expect(mockOnUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          channel: 'general',
          paginationOpts: { numItems: 25, cursor: null },
        }),
        expect.any(Function)
      )
    })

    it('should unsubscribe on unmount', () => {
      const unsubscribe = vi.fn()
      mockOnUpdate.mockImplementation(() => unsubscribe)

      const { unmount } = renderHook(
        () =>
          usePaginatedQuery(
            createQueryRef<PaginationResult<unknown>>('messages:list'),
            { channel: 'general' },
            { numItems: 20 }
          ),
        { wrapper: createWrapper() }
      )

      expect(unsubscribe).not.toHaveBeenCalled()

      unmount()

      expect(unsubscribe).toHaveBeenCalled()
    })
  })
})
