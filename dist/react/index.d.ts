import { ReactNode } from 'react';
import { a as ClientOptions, C as ConvexClient } from '../ConvexClient-LPzazDJ0.js';
import { F as FunctionReference, a as PaginationResult } from '../index-CAfBc_tK.js';
export { f as ConvexError, I as Id, P as PaginationOptions } from '../index-CAfBc_tK.js';

/**
 * ConvexProvider - React context provider for convex.do
 */

/**
 * Props for ConvexProvider.
 */
interface ConvexProviderProps {
    /** The convex.do deployment URL */
    url: string;
    /** Client options */
    options?: ClientOptions;
    /** Children to render */
    children: ReactNode;
}
/**
 * Provider component for convex.do React integration.
 *
 * @example
 * ```tsx
 * import { ConvexProvider } from "convex.do/react";
 *
 * function App() {
 *   return (
 *     <ConvexProvider url="https://your-worker.workers.dev">
 *       <YourApp />
 *     </ConvexProvider>
 *   );
 * }
 * ```
 */
declare function ConvexProvider({ url, options, children, }: ConvexProviderProps): ReactNode;
/**
 * Hook to access the ConvexClient directly.
 *
 * @example
 * ```tsx
 * import { useConvex } from "convex.do/react";
 *
 * function MyComponent() {
 *   const client = useConvex();
 *
 *   const handleClick = async () => {
 *     await client.mutation(api.messages.send, { body: "Hello!" });
 *   };
 *
 *   return <button onClick={handleClick}>Send</button>;
 * }
 * ```
 */
declare function useConvex(): ConvexClient;

/**
 * useQuery - React hook for reactive queries
 */

/**
 * Result state for useQuery.
 */
type UseQueryResult<T> = T | undefined;
/**
 * Skip token to conditionally disable a query.
 */
declare const skip: unique symbol;
type Skip = typeof skip;
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
declare function useQuery<T>(query: FunctionReference<'query', unknown, T>, args: unknown | 'skip' | Skip): UseQueryResult<T>;

/**
 * useMutation - React hook for mutations
 */

/**
 * Return type for useMutation.
 */
type UseMutationReturnType<Args, Returns> = (args: Args) => Promise<Returns>;
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
declare function useMutation<Args, Returns>(mutation: FunctionReference<'mutation', Args, Returns>): UseMutationReturnType<Args, Returns>;

/**
 * useAction - React hook for actions
 */

/**
 * Return type for useAction.
 */
type UseActionReturnType<Args, Returns> = (args: Args) => Promise<Returns>;
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
declare function useAction<Args, Returns>(action: FunctionReference<'action', Args, Returns>): UseActionReturnType<Args, Returns>;

/**
 * usePaginatedQuery - React hook for paginated queries
 */

/**
 * Options for usePaginatedQuery.
 */
interface UsePaginatedQueryOptions {
    /** Number of items to fetch per page */
    numItems: number;
}
/**
 * Status of a paginated query.
 */
type PaginatedQueryStatus = 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
/**
 * Return type for usePaginatedQuery.
 */
interface UsePaginatedQueryResult<T> {
    /** All loaded results */
    results: T[];
    /** Current status */
    status: PaginatedQueryStatus;
    /** Whether currently loading */
    isLoading: boolean;
    /** Function to load more results */
    loadMore: (numItems: number) => void;
}
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
declare function usePaginatedQuery<T>(query: FunctionReference<'query', unknown, PaginationResult<T>>, args: Record<string, unknown>, options: UsePaginatedQueryOptions): UsePaginatedQueryResult<T>;

/**
 * ConvexProviderWithAuth - Provider with authentication integration
 */

/**
 * Authentication client interface.
 * This should be implemented by your auth provider (e.g., Clerk, Auth0).
 */
interface AuthClient {
    /** Get the current authentication token */
    getToken(): Promise<string | null>;
    /** Whether the client is currently loading */
    isLoading: boolean;
    /** Whether the user is authenticated */
    isAuthenticated: boolean;
    /** Called when auth state changes */
    onAuthStateChange?: (callback: () => void) => () => void;
}
/**
 * Props for ConvexProviderWithAuth.
 */
interface ConvexProviderWithAuthProps {
    /** The convex.do deployment URL */
    url: string;
    /** Client options */
    options?: ClientOptions;
    /** Authentication client */
    useAuth: () => AuthClient;
    /** Children to render */
    children: ReactNode;
}
/**
 * Provider component with authentication integration.
 *
 * @example
 * ```tsx
 * import { ConvexProviderWithAuth } from "convex.do/react";
 * import { useAuth } from "@clerk/clerk-react";
 *
 * function useConvexAuth() {
 *   const { getToken, isLoaded, isSignedIn } = useAuth();
 *   return {
 *     getToken: () => getToken({ template: "convex" }),
 *     isLoading: !isLoaded,
 *     isAuthenticated: isSignedIn ?? false,
 *   };
 * }
 *
 * function App() {
 *   return (
 *     <ConvexProviderWithAuth
 *       url="https://your-worker.workers.dev"
 *       useAuth={useConvexAuth}
 *     >
 *       <YourApp />
 *     </ConvexProviderWithAuth>
 *   );
 * }
 * ```
 */
declare function ConvexProviderWithAuth({ url, options, useAuth, children, }: ConvexProviderWithAuthProps): ReactNode;

export { ConvexClient, ConvexProvider, ConvexProviderWithAuth, FunctionReference, PaginationResult, useAction, useConvex, useMutation, usePaginatedQuery, useQuery };
