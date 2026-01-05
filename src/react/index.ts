/**
 * React bindings for convex.do
 *
 * 100% compatible with Convex's convex/react exports.
 */

export { ConvexProvider, useConvex } from './ConvexProvider'
export { useQuery } from './useQuery'
export { useMutation } from './useMutation'
export { useAction } from './useAction'
export { usePaginatedQuery } from './usePaginatedQuery'
export { ConvexProviderWithAuth } from './ConvexProviderWithAuth'

// Re-export client for convenience
export { ConvexClient } from '../client/ConvexClient'

// Re-export types
export type {
  FunctionReference,
  Id,
  ConvexError,
  PaginationOptions,
  PaginationResult,
} from '../types'
