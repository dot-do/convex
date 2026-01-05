/**
 * Auth Token Management for Client SDK
 *
 * Provides comprehensive authentication token management including:
 * - Token storage (memory and optional localStorage)
 * - JWT parsing and validation
 * - Automatic token refresh
 * - Auth state management
 * - Integration with fetch requests and WebSocket
 *
 * Layer 7: Client SDK
 */

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error class for authentication token errors.
 */
export class AuthTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthTokenError'
    Object.setPrototypeOf(this, AuthTokenError.prototype)
  }
}

/**
 * Error thrown when a token has expired.
 */
export class TokenExpiredError extends AuthTokenError {
  expiryTime?: number

  constructor(message: string, expiryTime?: number) {
    super(message)
    this.name = 'TokenExpiredError'
    this.expiryTime = expiryTime
    Object.setPrototypeOf(this, TokenExpiredError.prototype)
  }
}

/**
 * Error thrown when a token is invalid or malformed.
 */
export class TokenInvalidError extends AuthTokenError {
  reason?: string

  constructor(message: string, reason?: string) {
    super(message)
    this.name = 'TokenInvalidError'
    this.reason = reason
    Object.setPrototypeOf(this, TokenInvalidError.prototype)
  }
}

/**
 * Error thrown when token refresh fails.
 */
export class TokenRefreshError extends AuthTokenError {
  cause?: Error

  constructor(message: string, cause?: Error) {
    super(message)
    this.name = 'TokenRefreshError'
    this.cause = cause
    Object.setPrototypeOf(this, TokenRefreshError.prototype)
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Authentication states.
 */
export enum AuthState {
  Unauthenticated = 'unauthenticated',
  Authenticating = 'authenticating',
  Authenticated = 'authenticated',
  Error = 'error',
}

/**
 * Standard JWT claims.
 */
export interface TokenClaims {
  /** Subject - typically user ID */
  sub?: string
  /** Issuer */
  iss?: string
  /** Audience */
  aud?: string | string[]
  /** Expiration time (Unix timestamp in seconds) */
  exp?: number
  /** Issued at (Unix timestamp in seconds) */
  iat?: number
  /** Not before (Unix timestamp in seconds) */
  nbf?: number
  /** JWT ID */
  jti?: string
  /** Allow additional custom claims */
  [key: string]: unknown
}

/**
 * Auth change event info.
 */
export interface AuthChangeInfo {
  state: AuthState
  token: string | null
  claims: TokenClaims | null
  error?: Error
}

/**
 * Auth change callback function.
 */
export type AuthChangeCallback = (info: AuthChangeInfo) => void

/**
 * Token refresh handler function.
 */
export type RefreshHandler = (currentToken: string) => Promise<string>

/**
 * Auth error info.
 */
export interface AuthError {
  code: string
  message: string
}

/**
 * Options for AuthTokenManager.
 */
export interface AuthTokenManagerOptions {
  /** Storage for persisting token (e.g., localStorage) */
  storage?: Storage
  /** Key to use for storing token */
  storageKey?: string
  /** Enable automatic token refresh before expiry */
  autoRefresh?: boolean
  /** Seconds before expiry to trigger refresh */
  refreshThreshold?: number
  /** Number of times to retry refresh on failure */
  refreshRetryCount?: number
  /** Delay in milliseconds between refresh retries */
  refreshRetryDelay?: number
}

// ============================================================================
// JWT Utility Functions
// ============================================================================

/**
 * Decode base64url to string.
 */
function base64UrlDecode(input: string): string {
  // Replace URL-safe characters with standard base64 characters
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/')

  // Pad with = if necessary
  const pad = base64.length % 4
  if (pad) {
    base64 += '='.repeat(4 - pad)
  }

  try {
    return atob(base64)
  } catch {
    throw new TokenInvalidError('Invalid base64 encoding in token', 'invalid_base64')
  }
}

/**
 * Parse a JWT token and extract claims.
 */
export function parseJWT(token: string): TokenClaims {
  if (!token || typeof token !== 'string') {
    throw new TokenInvalidError('Token must be a non-empty string', 'empty')
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new TokenInvalidError('Token must have three parts separated by dots', 'malformed')
  }

  const payloadPart = parts[1]
  if (!payloadPart) {
    throw new TokenInvalidError('Token payload is missing', 'missing_payload')
  }

  const payloadJson = base64UrlDecode(payloadPart)

  try {
    const claims = JSON.parse(payloadJson) as TokenClaims
    return claims
  } catch {
    throw new TokenInvalidError('Token payload is not valid JSON', 'invalid_json')
  }
}

/**
 * Check if a token is expired.
 *
 * @param token - JWT token string
 * @param bufferSeconds - Optional buffer time in seconds before actual expiry
 * @returns true if token is expired (or will expire within buffer), false otherwise
 */
export function isTokenExpired(token: string, bufferSeconds: number = 0): boolean {
  try {
    const claims = parseJWT(token)

    if (claims.exp === undefined) {
      // No expiry claim - token never expires
      return false
    }

    const now = Math.floor(Date.now() / 1000)
    return claims.exp <= now + bufferSeconds
  } catch {
    // If we can't parse the token, consider it expired
    return true
  }
}

/**
 * Get the expiry time of a token in milliseconds.
 *
 * @param token - JWT token string
 * @returns Expiry time in milliseconds, or null if no expiry
 */
export function getTokenExpiryTime(token: string): number | null {
  const claims = parseJWT(token)

  if (claims.exp === undefined) {
    return null
  }

  return claims.exp * 1000
}

/**
 * Create an Authorization header value.
 *
 * @param token - JWT token string
 * @returns Bearer token string, or null if token is empty
 */
export function createAuthHeader(token: string | null | undefined): string | null {
  if (!token) {
    return null
  }
  return `Bearer ${token}`
}

/**
 * Create an authenticate message for WebSocket.
 *
 * @param token - JWT token string
 * @returns Authenticate message object, or null if token is empty
 */
export function createAuthMessage(token: string | null | undefined): { type: 'authenticate'; token: string } | null {
  if (!token) {
    return null
  }
  return {
    type: 'authenticate',
    token,
  }
}

// ============================================================================
// AuthTokenManager Implementation
// ============================================================================

/**
 * Manages authentication tokens for the client SDK.
 *
 * @example
 * ```typescript
 * import { AuthTokenManager } from 'convex.do/client';
 *
 * const auth = new AuthTokenManager({
 *   storage: localStorage,
 *   autoRefresh: true,
 * });
 *
 * // Set token after login
 * auth.setToken(jwtToken);
 *
 * // Listen for auth changes
 * auth.onAuthChange((info) => {
 *   if (info.state === AuthState.Authenticated) {
 *     console.log('Logged in as', info.claims?.sub);
 *   }
 * });
 *
 * // Get headers for API requests
 * const headers = auth.getAuthHeaders();
 * ```
 */
export class AuthTokenManager {
  private token: string | null = null
  private claims: TokenClaims | null = null
  private state: AuthState = AuthState.Unauthenticated
  private storage: Storage | null
  private storageKey: string
  private autoRefresh: boolean
  private refreshThreshold: number
  private refreshRetryCount: number
  private refreshRetryDelay: number
  private refreshHandler: RefreshHandler | null = null
  private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null
  private authChangeCallbacks: Set<AuthChangeCallback> = new Set()
  private disposed = false

  constructor(options: AuthTokenManagerOptions = {}) {
    this.storage = options.storage ?? null
    this.storageKey = options.storageKey ?? 'convex_auth_token'
    this.autoRefresh = options.autoRefresh ?? false
    this.refreshThreshold = options.refreshThreshold ?? 300 // 5 minutes default
    this.refreshRetryCount = options.refreshRetryCount ?? 3
    this.refreshRetryDelay = options.refreshRetryDelay ?? 1000

    // Restore token from storage if available
    this.restoreFromStorage()
  }

  /**
   * Restore token from storage.
   */
  private restoreFromStorage(): void {
    if (!this.storage) {
      return
    }

    const storedToken = this.storage.getItem(this.storageKey)
    if (!storedToken) {
      return
    }

    // Validate the stored token
    try {
      if (isTokenExpired(storedToken)) {
        // Remove expired token from storage
        this.storage.removeItem(this.storageKey)
        return
      }

      const claims = parseJWT(storedToken)
      this.token = storedToken
      this.claims = claims
      this.state = AuthState.Authenticated

      // Schedule refresh if auto-refresh is enabled
      this.scheduleRefresh()
    } catch {
      // Remove invalid token from storage
      this.storage.removeItem(this.storageKey)
    }
  }

  /**
   * Set the authentication token.
   *
   * @param token - JWT token string
   * @throws TokenInvalidError if token is malformed
   * @throws TokenExpiredError if token is already expired
   */
  setToken(token: string): void {
    if (this.disposed) {
      return
    }

    // Parse and validate the token
    let claims: TokenClaims
    try {
      claims = parseJWT(token)
    } catch (error) {
      this.state = AuthState.Error
      this.emitAuthChange(error as Error)
      throw error
    }

    // Check if token is expired
    if (claims.exp !== undefined) {
      const now = Math.floor(Date.now() / 1000)
      if (claims.exp <= now) {
        const error = new TokenExpiredError('Token has already expired', claims.exp * 1000)
        this.state = AuthState.Error
        this.emitAuthChange(error)
        throw error
      }
    }

    // Store the token
    this.token = token
    this.claims = claims
    this.state = AuthState.Authenticated

    // Persist to storage
    if (this.storage) {
      this.storage.setItem(this.storageKey, token)
    }

    // Schedule refresh
    this.scheduleRefresh()

    // Emit auth change
    this.emitAuthChange()
  }

  /**
   * Get the current authentication token.
   *
   * @returns Current token or null if not authenticated
   */
  getToken(): string | null {
    // Check if token has expired
    if (this.token && this.claims?.exp !== undefined) {
      const now = Math.floor(Date.now() / 1000)
      if (this.claims.exp <= now) {
        // Token has expired, clear it
        this.clearTokenInternal(false)
        return null
      }
    }
    return this.token
  }

  /**
   * Clear the authentication token.
   */
  clearToken(): void {
    this.clearTokenInternal(true)
  }

  /**
   * Internal method to clear token.
   */
  private clearTokenInternal(emitChange: boolean): void {
    const hadToken = this.token !== null

    this.token = null
    this.claims = null
    this.state = AuthState.Unauthenticated

    // Cancel scheduled refresh
    this.cancelRefresh()

    // Remove from storage
    if (this.storage) {
      this.storage.removeItem(this.storageKey)
    }

    // Emit auth change
    if (emitChange && hadToken) {
      this.emitAuthChange()
    }
  }

  /**
   * Check if currently authenticated.
   *
   * @returns true if authenticated with valid token
   */
  isAuthenticated(): boolean {
    if (!this.token) {
      return false
    }

    // Check if token has expired
    if (this.claims?.exp !== undefined) {
      const now = Math.floor(Date.now() / 1000)
      if (this.claims.exp <= now) {
        return false
      }
    }

    return true
  }

  /**
   * Get the current authentication state.
   */
  getState(): AuthState {
    return this.state
  }

  /**
   * Get the parsed token claims.
   *
   * @returns Token claims or null if not authenticated
   */
  getClaims(): TokenClaims | null {
    return this.claims
  }

  /**
   * Get the subject (user ID) from token claims.
   *
   * @returns Subject claim or null
   */
  getSubject(): string | null {
    return this.claims?.sub ?? null
  }

  /**
   * Get the token expiry time in milliseconds.
   *
   * @returns Expiry time or null if no expiry
   */
  getExpiryTime(): number | null {
    if (!this.claims?.exp) {
      return null
    }
    return this.claims.exp * 1000
  }

  /**
   * Get time until token expiry in milliseconds.
   *
   * @returns Time until expiry or null if no expiry
   */
  getTimeUntilExpiry(): number | null {
    const expiryTime = this.getExpiryTime()
    if (expiryTime === null) {
      return null
    }
    return expiryTime - Date.now()
  }

  /**
   * Register a callback for auth state changes.
   *
   * @param callback - Callback function
   * @returns Unsubscribe function
   */
  onAuthChange(callback: AuthChangeCallback): () => void {
    this.authChangeCallbacks.add(callback)

    return () => {
      this.authChangeCallbacks.delete(callback)
    }
  }

  /**
   * Emit auth change event to all listeners.
   */
  private emitAuthChange(error?: Error): void {
    const info: AuthChangeInfo = {
      state: this.state,
      token: this.token,
      claims: this.claims,
    }

    if (error) {
      info.error = error
    }

    for (const callback of this.authChangeCallbacks) {
      try {
        callback(info)
      } catch {
        // Ignore callback errors
      }
    }
  }

  // ============================================================================
  // Token Refresh
  // ============================================================================

  /**
   * Set the token refresh handler.
   *
   * @param handler - Function that receives current token and returns new token
   */
  setRefreshHandler(handler: RefreshHandler): void {
    this.refreshHandler = handler
  }

  /**
   * Check if a refresh handler is registered.
   */
  hasRefreshHandler(): boolean {
    return this.refreshHandler !== null
  }

  /**
   * Check if a token refresh is scheduled.
   */
  isRefreshScheduled(): boolean {
    return this.refreshTimeoutId !== null
  }

  /**
   * Schedule automatic token refresh.
   */
  private scheduleRefresh(): void {
    if (!this.autoRefresh || !this.token || !this.claims?.exp) {
      return
    }

    // Cancel any existing refresh
    this.cancelRefresh()

    const expiryTime = this.claims.exp * 1000
    const refreshTime = expiryTime - this.refreshThreshold * 1000
    const delay = refreshTime - Date.now()

    if (delay <= 0) {
      // Should refresh immediately
      this.performRefresh()
    } else {
      this.refreshTimeoutId = setTimeout(() => {
        this.performRefresh()
      }, delay)
    }
  }

  /**
   * Cancel scheduled token refresh.
   */
  cancelRefresh(): void {
    if (this.refreshTimeoutId !== null) {
      clearTimeout(this.refreshTimeoutId)
      this.refreshTimeoutId = null
    }
  }

  /**
   * Perform token refresh with retry logic.
   */
  private async performRefresh(retryCount: number = 0): Promise<void> {
    if (!this.refreshHandler || !this.token) {
      return
    }

    try {
      const newToken = await this.refreshHandler(this.token)
      this.setToken(newToken)
    } catch (error) {
      if (retryCount < this.refreshRetryCount - 1) {
        // Retry after delay
        setTimeout(() => {
          this.performRefresh(retryCount + 1)
        }, this.refreshRetryDelay)
      } else {
        // Max retries exceeded
        this.state = AuthState.Error
        this.emitAuthChange(error instanceof Error ? error : new TokenRefreshError('Refresh failed'))
      }
    }
  }

  /**
   * Manually trigger token refresh.
   *
   * @returns Promise that resolves when refresh is complete
   * @throws TokenRefreshError if no refresh handler or not authenticated
   */
  async refreshToken(): Promise<void> {
    if (!this.refreshHandler) {
      throw new TokenRefreshError('No refresh handler registered')
    }

    if (!this.token) {
      throw new TokenRefreshError('Not authenticated')
    }

    const newToken = await this.refreshHandler(this.token)
    this.setToken(newToken)
  }

  // ============================================================================
  // Token Validation
  // ============================================================================

  /**
   * Validate a token without setting it.
   *
   * @param token - JWT token string
   * @returns true if token is valid and not expired
   */
  validateToken(token: string): boolean {
    try {
      parseJWT(token)
      return !isTokenExpired(token)
    } catch {
      return false
    }
  }

  // ============================================================================
  // Fetch Integration
  // ============================================================================

  /**
   * Get the Authorization header value.
   *
   * @returns Bearer token string or null
   */
  getAuthHeader(): string | null {
    return createAuthHeader(this.getToken())
  }

  /**
   * Get headers object with Authorization header.
   *
   * @returns Headers object or empty object if not authenticated
   */
  getAuthHeaders(): Record<string, string> {
    const header = this.getAuthHeader()
    if (!header) {
      return {}
    }
    return { Authorization: header }
  }

  /**
   * Apply authentication to a request init object.
   *
   * @param init - Request init object
   * @returns Modified request init with Authorization header
   */
  applyToRequest(init: RequestInit): RequestInit {
    const authHeader = this.getAuthHeader()
    if (!authHeader) {
      return init
    }

    const existingHeaders = init.headers

    if (existingHeaders instanceof Headers) {
      existingHeaders.set('Authorization', authHeader)
      return { ...init, headers: existingHeaders }
    }

    if (Array.isArray(existingHeaders)) {
      return {
        ...init,
        headers: [...existingHeaders, ['Authorization', authHeader]],
      }
    }

    return {
      ...init,
      headers: {
        ...(existingHeaders as Record<string, string> | undefined),
        Authorization: authHeader,
      },
    }
  }

  // ============================================================================
  // WebSocket Integration
  // ============================================================================

  /**
   * Get authenticate message for WebSocket.
   *
   * @returns Authenticate message object or null
   */
  getAuthMessage(): { type: 'authenticate'; token: string } | null {
    return createAuthMessage(this.getToken())
  }

  /**
   * Get authenticate message as JSON string for WebSocket.
   *
   * @returns JSON string or null
   */
  getAuthMessageJSON(): string | null {
    const message = this.getAuthMessage()
    if (!message) {
      return null
    }
    return JSON.stringify(message)
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose the auth manager and clean up resources.
   */
  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.token = null
    this.claims = null
    this.state = AuthState.Unauthenticated
    this.cancelRefresh()
    this.authChangeCallbacks.clear()
    this.refreshHandler = null
  }
}
