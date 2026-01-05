/**
 * usePaginatedQuery - React hook for paginated queries
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useConvex } from './ConvexProvider'
import type { FunctionReference, PaginationResult, PaginationOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for usePaginatedQuery.
 */
export interface UsePaginatedQueryOptions {
  /** Number of items to fetch per page */
  numItems: number
}

/**
 * Status of a paginated query.
 */
export type PaginatedQueryStatus =
  | 'LoadingFirstPage'
  | 'CanLoadMore'
  | 'LoadingMore'
  | 'Exhausted'

/**
 * Return type for usePaginatedQuery.
 */
export interface UsePaginatedQueryResult<T> {
  /** All loaded results */
  results: T[]
  /** Current status */
  status: PaginatedQueryStatus
  /** Whether currently loading */
  isLoading: boolean
  /** Function to load more results */
  loadMore: (numItems: number) => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Subscribe to a paginated query with automatic page management.
 *
 * @example
 * ```tsx
 * import { usePaginatedQuery } from "convex.do/react";
 * import { api } from "../convex/_generated/api";
 *
 * function MessageHistory({ channel }: { channel: Id<"channels"> }) {
 *   const { results, status, loadMore } = usePaginatedQuery(
 *     api.messages.listPaginated,
 *     { channel },
 *     { numItems: 20 }
 *   );
 *
 *   return (
 *     <div>
 *       <ul>
 *         {results.map((msg) => (
 *           <li key={msg._id}>{msg.body}</li>
 *         ))}
 *       </ul>
 *
 *       {status === "CanLoadMore" && (
 *         <button onClick={() => loadMore(20)}>Load More</button>
 *       )}
 *
 *       {status === "LoadingMore" && <div>Loading...</div>}
 *
 *       {status === "Exhausted" && <div>No more messages</div>}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePaginatedQuery<T>(
  query: FunctionReference<'query', unknown, PaginationResult<T>>,
  args: Record<string, unknown>,
  options: UsePaginatedQueryOptions
): UsePaginatedQueryResult<T> {
  const client = useConvex()

  const [results, setResults] = useState<T[]>([])
  const [status, setStatus] = useState<PaginatedQueryStatus>('LoadingFirstPage')
  const [cursor, setCursor] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Track args for comparison
  const argsRef = useRef<string>('')
  const argsJson = JSON.stringify(args)

  // Reset when args change
  useEffect(() => {
    if (argsRef.current !== argsJson) {
      argsRef.current = argsJson
      setResults([])
      setCursor(null)
      setStatus('LoadingFirstPage')
    }
  }, [argsJson])

  // Load first page
  useEffect(() => {
    if (status !== 'LoadingFirstPage') return

    const paginationOpts: PaginationOptions = {
      numItems: options.numItems,
      cursor: null,
    }

    const unsubscribe = client.onUpdate(
      query,
      { ...args, paginationOpts },
      (result) => {
        setResults(result.page)
        setCursor(result.continueCursor)
        setStatus(result.isDone ? 'Exhausted' : 'CanLoadMore')
      }
    )

    return () => {
      unsubscribe()
    }
  }, [client, query, args, options.numItems, status])

  // Load more function
  const loadMore = useCallback(
    async (numItems: number) => {
      if (status !== 'CanLoadMore' || !cursor) return

      setStatus('LoadingMore')
      setIsLoadingMore(true)

      try {
        const paginationOpts: PaginationOptions = {
          numItems,
          cursor,
        }

        const result = await client.query(query, {
          ...args,
          paginationOpts,
        })

        setResults((prev) => [...prev, ...result.page])
        setCursor(result.continueCursor)
        setStatus(result.isDone ? 'Exhausted' : 'CanLoadMore')
      } finally {
        setIsLoadingMore(false)
      }
    },
    [client, query, args, cursor, status]
  )

  return {
    results,
    status,
    isLoading: status === 'LoadingFirstPage' || isLoadingMore,
    loadMore,
  }
}
