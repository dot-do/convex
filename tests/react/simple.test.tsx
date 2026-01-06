import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup, act } from '@testing-library/react'
import { ConvexProvider } from '../../src/react/ConvexProvider'
import { useMutationWithState } from '../../src/react/useMutation'
import type { FunctionReference } from '../../src/types'

const { mockMutation } = vi.hoisted(() => ({
  mockMutation: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../src/client/ConvexClient', () => {
  const MockConvexClient = vi.fn().mockImplementation((url) => ({
    url,
    query: vi.fn(),
    mutation: mockMutation,
    action: vi.fn(),
    onUpdate: vi.fn().mockReturnValue(() => {}),
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
    close: vi.fn(),
  }))
  return { ConvexClient: MockConvexClient }
})

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

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <ConvexProvider url="https://test.convex.cloud">{children}</ConvexProvider>
  )
}

describe('simple test', () => {
  beforeEach(() => {
    mockMutation.mockReset().mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
  })

  it('test 1 - should work', () => {
    const { result } = renderHook(
      () => useMutationWithState(createMutationRef('test:mutation')),
      { wrapper: createWrapper() }
    )

    console.log('Test 1 - result.current:', result.current)
    expect(result.current).not.toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('test 2 - should also work', () => {
    const { result } = renderHook(
      () => useMutationWithState(createMutationRef('test:mutation')),
      { wrapper: createWrapper() }
    )

    console.log('Test 2 - result.current:', result.current)
    expect(result.current).not.toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('test 3 - after mutation', async () => {
    mockMutation.mockResolvedValue({ success: true })

    const { result } = renderHook(
      () => useMutationWithState(createMutationRef('test:mutation')),
      { wrapper: createWrapper() }
    )

    console.log('Test 3 before mutation - result.current:', result.current)

    await act(async () => {
      await result.current.mutate({ data: 'test' })
    })

    console.log('Test 3 after mutation - result.current:', result.current)
    expect(result.current.isLoading).toBe(false)
  })

  it('test 4 - should still work', () => {
    const { result } = renderHook(
      () => useMutationWithState(createMutationRef('test:mutation')),
      { wrapper: createWrapper() }
    )

    console.log('Test 4 - result.current:', result.current)
    expect(result.current).not.toBeNull()
    expect(result.current.isLoading).toBe(false)
  })
})
