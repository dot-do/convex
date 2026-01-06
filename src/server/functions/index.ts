/**
 * Function Types and Utilities for Convex Functions
 *
 * This module provides the core types, utilities, and factories for working
 * with Convex functions (queries, mutations, and actions).
 *
 * Key Features:
 * - Registered function types and type guards
 * - Function registry for managing and executing functions
 * - Function references for type-safe cross-function calls
 * - API generation utilities
 * - Shared utilities for argument validation
 *
 * @module
 *
 * @example
 * ```typescript
 * import {
 *   isQuery,
 *   isMutation,
 *   FunctionRegistry,
 *   makeFunctionReference,
 * } from "convex.do/server/functions";
 *
 * // Check function type
 * if (isQuery(fn)) {
 *   console.log("This is a query");
 * }
 *
 * // Create function reference
 * const ref = makeFunctionReference<"query">("users:list");
 *
 * // Use registry
 * const registry = new FunctionRegistry();
 * registry.register("users:list", myQuery);
 * ```
 */

// ============================================================================
// Registered Function Types and Utilities
// ============================================================================

export {
  // Types
  type RegisteredQuery,
  type RegisteredMutation,
  type RegisteredAction,
  type AnyRegisteredFunction,
  type FunctionArgs,
  type FunctionReturns,
  type GenericRegisteredFunction,
  // Type guards
  isQuery,
  isMutation,
  isAction,
  isRegisteredFunction,
  isPublicFunction,
  isInternalFunction,
  // Utility functions
  getFunctionType,
  getFunctionVisibility,
  getArgsValidator,
  getReturnsValidator,
  getFunctionHandler,
} from './registered'

// ============================================================================
// Shared Utilities
// ============================================================================

export {
  // Types - Canonical FunctionType and FunctionVisibility definitions
  type FunctionType,
  type FunctionVisibility,
  type InferredArgs,
  type BaseFunctionConfig,
  type RegisteredFunctionBase,
  type ExtractArgs,
  type ExtractReturns,
  // Utility functions
  phantomType,
  createRegisteredFunction,
  validateArgs,
  validateReturns,
} from './shared'

// ============================================================================
// Function Registry
// ============================================================================

export {
  FunctionRegistry,
  FunctionRegistryError,
  type RegisteredFunction,
  type RegisteredHttpEndpoint,
  type FunctionEntry,
  type HttpEndpointEntry,
  type HttpEndpointMatch,
  type RegistrationOptions,
  type HttpMethod,
} from './registry'

// ============================================================================
// Function References and API Generation
// ============================================================================

export {
  // Core types
  type FunctionReference,
  type GenericFunctionReference,
  type AnyFunctionReference,
  type QueryReference,
  type MutationReference,
  type ActionReference,
  type SchedulableFunctionReference,
  // Type helpers
  type FunctionArgs as FunctionReferenceArgs,
  type FunctionReturnType,
  type FilterByFunctionType,
  type OptionalRestArgs,
  type ArgsAndOptions,
  type RegisteredFunction as ApiRegisteredFunction,
  type ParsedFunctionPath,
  type NestedApi,
  // Factory functions
  makeFunctionReference,
  makeQueryReference,
  makeMutationReference,
  makeActionReference,
  // Utility functions
  getFunctionName,
  parseFunctionPath,
  createFunctionHandle,
  functionName,
  // API generation
  createApi,
  createInternalApi,
} from './api'
