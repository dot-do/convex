/**
 * useAction - React hook for actions
 */

import { useCallback, useState } from 'react'
import { useConvex } from './ConvexProvider'
import type { FunctionReference } from '../types'

// ============================================================================
// Types
// ============================================================================

/**
 * State for action execution.
 */
export interface ActionState {
  /** Whether the action is currently executing */
  isLoading: boolean
  /** Error from the last execution, if any */
  error: Error | null
}

/**
 * Return type for useAction.
 */
export type UseActionReturnType<Args, Returns> = (args: Args) => Promise<Returns>

// ============================================================================
// Hook
// ============================================================================

/**
 * Get a function to execute an action.
 *
 * @example
 * ```tsx
 * import { useAction } from "convex.do/react";
 * import { api } from "../convex/_generated/api";
 *
 * function GenerateImage({ prompt }: { prompt: string }) {
 *   const generate = useAction(api.ai.generateImage);
 *   const [imageUrl, setImageUrl] = useState<string | null>(null);
 *   const [isGenerating, setIsGenerating] = useState(false);
 *
 *   const handleGenerate = async () => {
 *     setIsGenerating(true);
 *     try {
 *       const result = await generate({ prompt });
 *       setImageUrl(result.url);
 *     } finally {
 *       setIsGenerating(false);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleGenerate} disabled={isGenerating}>
 *         {isGenerating ? "Generating..." : "Generate"}
 *       </button>
 *       {imageUrl && <img src={imageUrl} alt={prompt} />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAction<Args, Returns>(
  action: FunctionReference<'action', Args, Returns>
): UseActionReturnType<Args, Returns> {
  const client = useConvex()

  const execute = useCallback(
    async (args: Args): Promise<Returns> => {
      return client.action(action, args)
    },
    [client, action]
  )

  return execute
}

/**
 * Get a function to execute an action with loading and error state.
 *
 * @example
 * ```tsx
 * import { useActionWithState } from "convex.do/react";
 *
 * function AIChat() {
 *   const { execute, isLoading, error } = useActionWithState(api.ai.chat);
 *
 *   return (
 *     <div>
 *       <button
 *         onClick={() => execute({ message: "Hello!" })}
 *         disabled={isLoading}
 *       >
 *         {isLoading ? "Thinking..." : "Ask AI"}
 *       </button>
 *       {error && <p className="error">{error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useActionWithState<Args, Returns>(
  action: FunctionReference<'action', Args, Returns>
): ActionState & { execute: UseActionReturnType<Args, Returns> } {
  const client = useConvex()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const execute = useCallback(
    async (args: Args): Promise<Returns> => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await client.action(action, args)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [client, action]
  )

  return { execute, isLoading, error }
}
