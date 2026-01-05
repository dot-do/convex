/**
 * useQuery - React hook for reactive queries
 */

import { useState, useEffect, useRef } from 'react'
import { useConvex } from './ConvexProvider'
import type { FunctionReference } from '../types'

// ============================================================================
// Types
// ============================================================================

/**
 * Result state for useQuery.
 */
export type UseQueryResult<T> =
  | T
  | undefined

/**
 * Skip token to conditionally disable a query.
 */
export const skip = Symbol('skip')
export type Skip = typeof skip

// ============================================================================
// Hook
// ============================================================================

/**
 * Subscribe to a query with real-time updates.
 *
 * The query will automatically re-run when:
 * - The underlying data changes (pushed from server)
 * - The args change
 *
 * @example
 * ```tsx
 * import { useQuery } from "convex.do/react";
 * import { api } from "../convex/_generated/api";
 *
 * function MessageList({ channel }: { channel: Id<"channels"> }) {
 *   const messages = useQuery(api.messages.list, { channel });
 *
 *   if (messages === undefined) {
 *     return <div>Loading...</div>;
 *   }
 *
 *   return (
 *     <ul>
 *       {messages.map((msg) => (
 *         <li key={msg._id}>{msg.body}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Conditionally skip the query
 * const user = useQuery(
 *   api.users.get,
 *   userId ? { userId } : "skip"
 * );
 * ```
 */
export function useQuery<T>(
  query: FunctionReference<'query', unknown, T>,
  args: unknown | 'skip' | Skip
): UseQueryResult<T> {
  const client = useConvex()
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<Error | null>(null)

  // Track args for comparison
  const argsRef = useRef<string>('')
  const argsJson = args === 'skip' || args === skip ? '__skip__' : JSON.stringify(args)

  useEffect(() => {
    // Skip if args indicate skip
    if (args === 'skip' || args === skip) {
      setData(undefined)
      return
    }

    // Skip if args haven't changed
    if (argsRef.current === argsJson) {
      return
    }
    argsRef.current = argsJson

    // Subscribe to the query
    const unsubscribe = client.onUpdate(
      query,
      args,
      (result) => {
        setData(result)
        setError(null)
      },
      {
        onError: (err) => {
          setError(err)
        },
      }
    )

    return () => {
      unsubscribe()
    }
  }, [client, query, argsJson, args])

  // Throw error for error boundary
  if (error) {
    throw error
  }

  return data
}
