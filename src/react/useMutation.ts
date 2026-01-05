/**
 * useMutation - React hook for mutations
 */

import { useCallback, useState } from 'react'
import { useConvex } from './ConvexProvider'
import type { FunctionReference } from '../types'

// ============================================================================
// Types
// ============================================================================

/**
 * State for mutation execution.
 */
export interface MutationState {
  /** Whether the mutation is currently executing */
  isLoading: boolean
  /** Error from the last execution, if any */
  error: Error | null
}

/**
 * Return type for useMutation.
 */
export type UseMutationReturnType<Args, Returns> = (args: Args) => Promise<Returns>

// ============================================================================
// Hook
// ============================================================================

/**
 * Get a function to execute a mutation.
 *
 * @example
 * ```tsx
 * import { useMutation } from "convex.do/react";
 * import { api } from "../convex/_generated/api";
 *
 * function SendMessage({ channel }: { channel: Id<"channels"> }) {
 *   const sendMessage = useMutation(api.messages.send);
 *   const [body, setBody] = useState("");
 *
 *   const handleSubmit = async (e: FormEvent) => {
 *     e.preventDefault();
 *     await sendMessage({ channel, body });
 *     setBody("");
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input
 *         value={body}
 *         onChange={(e) => setBody(e.target.value)}
 *         placeholder="Type a message..."
 *       />
 *       <button type="submit">Send</button>
 *     </form>
 *   );
 * }
 * ```
 */
export function useMutation<Args, Returns>(
  mutation: FunctionReference<'mutation', Args, Returns>
): UseMutationReturnType<Args, Returns> {
  const client = useConvex()

  const mutate = useCallback(
    async (args: Args): Promise<Returns> => {
      return client.mutation(mutation, args)
    },
    [client, mutation]
  )

  return mutate
}

/**
 * Get a function to execute a mutation with loading and error state.
 *
 * @example
 * ```tsx
 * import { useMutationWithState } from "convex.do/react";
 *
 * function SendMessage() {
 *   const { mutate, isLoading, error } = useMutationWithState(api.messages.send);
 *
 *   return (
 *     <div>
 *       <button onClick={() => mutate({ body: "Hello!" })} disabled={isLoading}>
 *         {isLoading ? "Sending..." : "Send"}
 *       </button>
 *       {error && <p className="error">{error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMutationWithState<Args, Returns>(
  mutation: FunctionReference<'mutation', Args, Returns>
): MutationState & { mutate: UseMutationReturnType<Args, Returns> } {
  const client = useConvex()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutate = useCallback(
    async (args: Args): Promise<Returns> => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await client.mutation(mutation, args)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [client, mutation]
  )

  return { mutate, isLoading, error }
}
