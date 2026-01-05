/**
 * Function types and utilities for convex.do
 *
 * This module re-exports registered function types and utilities.
 *
 * @module
 */

export {
  // Types
  type RegisteredQuery,
  type RegisteredMutation,
  type RegisteredAction,
  type AnyRegisteredFunction,
  type FunctionType,
  type FunctionVisibility,
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

// Export Function Registry
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
  type FunctionType as RegistryFunctionType,
  type FunctionVisibility as RegistryFunctionVisibility,
} from './registry'

// Export FunctionReference types and api generation utilities
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
