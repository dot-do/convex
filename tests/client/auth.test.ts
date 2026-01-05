/**
 * TDD Tests for Auth Token Management
 *
 * These tests define the expected behavior for the AuthTokenManager class
 * that handles authentication token management for the client SDK.
 *
 * Layer 7: Client SDK - Auth Token Management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AuthTokenManager,
  AuthState,
  type AuthTokenManagerOptions,
  type AuthChangeCallback,
  type TokenClaims,
  type AuthError,
  AuthTokenError,
  TokenExpiredError,
  TokenInvalidError,
  TokenRefreshError,
  parseJWT,
  isTokenExpired,
  getTokenExpiryTime,
  createAuthHeader,
  createAuthMessage,
} from '../../src/client/auth'

// ============================================================================
// Mock localStorage
// ============================================================================

class MockLocalStorage implements Storage {
  private store: Map<string, string> = new Map()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys())
    return keys[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

// ============================================================================
// Test JWT Token Helpers
// ============================================================================

/**
 * Create a mock JWT token for testing.
 * Format: header.payload.signature
 */
function createMockJWT(claims: Partial<TokenClaims> = {}, options: { expired?: boolean; malformed?: boolean } = {}): string {
  if (options.malformed) {
    return 'not.a.valid.jwt.token'
  }

  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)

  const payload: TokenClaims = {
    sub: claims.sub ?? 'user_123',
    iss: claims.iss ?? 'https://auth.example.com',
    aud: claims.aud ?? 'convex.do',
    exp: options.expired
      ? now - 3600 // Expired 1 hour ago
      : claims.exp ?? now + 3600, // Expires in 1 hour
    iat: claims.iat ?? now,
    ...claims,
  }

  const encodedHeader = btoa(JSON.stringify(header))
  const encodedPayload = btoa(JSON.stringify(payload))
  const signature = 'mock_signature'

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

// ============================================================================
// AuthTokenManager Constructor Tests
// ============================================================================

describe('AuthTokenManager', () => {
  let mockStorage: MockLocalStorage

  beforeEach(() => {
    mockStorage = new MockLocalStorage()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create an AuthTokenManager with default options', () => {
      const manager = new AuthTokenManager()
      expect(manager).toBeDefined()
    })

    it('should accept custom options', () => {
      const options: AuthTokenManagerOptions = {
        storage: mockStorage,
        storageKey: 'custom_auth_token',
        autoRefresh: true,
        refreshThreshold: 300, // 5 minutes before expiry
      }
      const manager = new AuthTokenManager(options)
      expect(manager).toBeDefined()
    })

    it('should initialize in unauthenticated state', () => {
      const manager = new AuthTokenManager()
      expect(manager.getState()).toBe(AuthState.Unauthenticated)
    })

    it('should not have a token initially', () => {
      const manager = new AuthTokenManager()
      expect(manager.getToken()).toBeNull()
    })

    it('should not be authenticated initially', () => {
      const manager = new AuthTokenManager()
      expect(manager.isAuthenticated()).toBe(false)
    })

    it('should restore token from storage if available', () => {
      const token = createMockJWT()
      mockStorage.setItem('convex_auth_token', token)

      const manager = new AuthTokenManager({ storage: mockStorage })

      expect(manager.getToken()).toBe(token)
      expect(manager.isAuthenticated()).toBe(true)
    })

    it('should not restore expired token from storage', () => {
      const expiredToken = createMockJWT({}, { expired: true })
      mockStorage.setItem('convex_auth_token', expiredToken)

      const manager = new AuthTokenManager({ storage: mockStorage })

      expect(manager.getToken()).toBeNull()
      expect(manager.isAuthenticated()).toBe(false)
    })

    it('should use custom storage key when restoring', () => {
      const token = createMockJWT()
      mockStorage.setItem('my_custom_key', token)

      const manager = new AuthTokenManager({
        storage: mockStorage,
        storageKey: 'my_custom_key',
      })

      expect(manager.getToken()).toBe(token)
    })
  })

  // ============================================================================
  // Token Management Tests
  // ============================================================================

  describe('setToken()', () => {
    it('should set the authentication token', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()

      manager.setToken(token)

      expect(manager.getToken()).toBe(token)
    })

    it('should transition to authenticated state', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()

      manager.setToken(token)

      expect(manager.getState()).toBe(AuthState.Authenticated)
    })

    it('should return true for isAuthenticated()', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()

      manager.setToken(token)

      expect(manager.isAuthenticated()).toBe(true)
    })

    it('should persist token to storage when storage is configured', () => {
      const manager = new AuthTokenManager({ storage: mockStorage })
      const token = createMockJWT()

      manager.setToken(token)

      expect(mockStorage.getItem('convex_auth_token')).toBe(token)
    })

    it('should use custom storage key', () => {
      const manager = new AuthTokenManager({
        storage: mockStorage,
        storageKey: 'custom_key',
      })
      const token = createMockJWT()

      manager.setToken(token)

      expect(mockStorage.getItem('custom_key')).toBe(token)
    })

    it('should throw TokenInvalidError for malformed token', () => {
      const manager = new AuthTokenManager()
      const malformedToken = 'not-a-jwt'

      expect(() => manager.setToken(malformedToken)).toThrow(TokenInvalidError)
    })

    it('should throw TokenExpiredError for expired token', () => {
      const manager = new AuthTokenManager()
      const expiredToken = createMockJWT({}, { expired: true })

      expect(() => manager.setToken(expiredToken)).toThrow(TokenExpiredError)
    })

    it('should trigger auth change callbacks', () => {
      const manager = new AuthTokenManager()
      const callback = vi.fn()
      manager.onAuthChange(callback)

      const token = createMockJWT()
      manager.setToken(token)

      expect(callback).toHaveBeenCalledWith({
        state: AuthState.Authenticated,
        token,
        claims: expect.objectContaining({ sub: 'user_123' }),
      })
    })

    it('should replace existing token', () => {
      const manager = new AuthTokenManager()
      const token1 = createMockJWT({ sub: 'user_1' })
      const token2 = createMockJWT({ sub: 'user_2' })

      manager.setToken(token1)
      manager.setToken(token2)

      expect(manager.getToken()).toBe(token2)
      expect(manager.getClaims()?.sub).toBe('user_2')
    })

    it('should schedule auto-refresh when enabled', () => {
      const manager = new AuthTokenManager({
        autoRefresh: true,
        refreshThreshold: 300, // 5 minutes
      })
      const token = createMockJWT()

      manager.setToken(token)

      // Verify that refresh is scheduled (we'll test this more thoroughly below)
      expect(manager.isRefreshScheduled()).toBe(true)
    })
  })

  describe('getToken()', () => {
    it('should return null when not authenticated', () => {
      const manager = new AuthTokenManager()
      expect(manager.getToken()).toBeNull()
    })

    it('should return the current token when authenticated', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()
      manager.setToken(token)

      expect(manager.getToken()).toBe(token)
    })

    it('should return null after token is cleared', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()
      manager.setToken(token)
      manager.clearToken()

      expect(manager.getToken()).toBeNull()
    })
  })

  describe('clearToken()', () => {
    it('should clear the authentication token', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()
      manager.setToken(token)

      manager.clearToken()

      expect(manager.getToken()).toBeNull()
    })

    it('should transition to unauthenticated state', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()
      manager.setToken(token)

      manager.clearToken()

      expect(manager.getState()).toBe(AuthState.Unauthenticated)
    })

    it('should return false for isAuthenticated()', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()
      manager.setToken(token)

      manager.clearToken()

      expect(manager.isAuthenticated()).toBe(false)
    })

    it('should remove token from storage', () => {
      const manager = new AuthTokenManager({ storage: mockStorage })
      const token = createMockJWT()
      manager.setToken(token)

      manager.clearToken()

      expect(mockStorage.getItem('convex_auth_token')).toBeNull()
    })

    it('should trigger auth change callbacks', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()
      manager.setToken(token)

      const callback = vi.fn()
      manager.onAuthChange(callback)

      manager.clearToken()

      expect(callback).toHaveBeenCalledWith({
        state: AuthState.Unauthenticated,
        token: null,
        claims: null,
      })
    })

    it('should cancel scheduled refresh', () => {
      const manager = new AuthTokenManager({ autoRefresh: true })
      const token = createMockJWT()
      manager.setToken(token)

      manager.clearToken()

      expect(manager.isRefreshScheduled()).toBe(false)
    })

    it('should be safe to call when not authenticated', () => {
      const manager = new AuthTokenManager()

      expect(() => manager.clearToken()).not.toThrow()
    })

    it('should be safe to call multiple times', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()
      manager.setToken(token)

      manager.clearToken()
      expect(() => manager.clearToken()).not.toThrow()
    })
  })

  describe('isAuthenticated()', () => {
    it('should return false initially', () => {
      const manager = new AuthTokenManager()
      expect(manager.isAuthenticated()).toBe(false)
    })

    it('should return true after setting token', () => {
      const manager = new AuthTokenManager()
      manager.setToken(createMockJWT())

      expect(manager.isAuthenticated()).toBe(true)
    })

    it('should return false after clearing token', () => {
      const manager = new AuthTokenManager()
      manager.setToken(createMockJWT())
      manager.clearToken()

      expect(manager.isAuthenticated()).toBe(false)
    })

    it('should return false if token has expired', () => {
      const manager = new AuthTokenManager()
      // Create a token that expires in 1 second
      const shortLivedToken = createMockJWT({ exp: Math.floor(Date.now() / 1000) + 1 })
      manager.setToken(shortLivedToken)

      // Advance time past expiry
      vi.advanceTimersByTime(2000)

      expect(manager.isAuthenticated()).toBe(false)
    })
  })

  // ============================================================================
  // Auth State Tests
  // ============================================================================

  describe('getState()', () => {
    it('should return Unauthenticated initially', () => {
      const manager = new AuthTokenManager()
      expect(manager.getState()).toBe(AuthState.Unauthenticated)
    })

    it('should return Authenticated after setting token', () => {
      const manager = new AuthTokenManager()
      manager.setToken(createMockJWT())

      expect(manager.getState()).toBe(AuthState.Authenticated)
    })

    it('should return Unauthenticated after clearing token', () => {
      const manager = new AuthTokenManager()
      manager.setToken(createMockJWT())
      manager.clearToken()

      expect(manager.getState()).toBe(AuthState.Unauthenticated)
    })

    it('should return Error after auth failure', () => {
      const manager = new AuthTokenManager()

      try {
        manager.setToken('invalid-token')
      } catch {
        // Expected
      }

      expect(manager.getState()).toBe(AuthState.Error)
    })
  })

  describe('AuthState enum', () => {
    it('should export Unauthenticated state', () => {
      expect(AuthState.Unauthenticated).toBeDefined()
    })

    it('should export Authenticating state', () => {
      expect(AuthState.Authenticating).toBeDefined()
    })

    it('should export Authenticated state', () => {
      expect(AuthState.Authenticated).toBeDefined()
    })

    it('should export Error state', () => {
      expect(AuthState.Error).toBeDefined()
    })

    it('should have distinct values', () => {
      const states = [
        AuthState.Unauthenticated,
        AuthState.Authenticating,
        AuthState.Authenticated,
        AuthState.Error,
      ]
      const uniqueStates = new Set(states)
      expect(uniqueStates.size).toBe(4)
    })
  })

  // ============================================================================
  // Auth Change Callbacks Tests
  // ============================================================================

  describe('onAuthChange()', () => {
    it('should register a callback', () => {
      const manager = new AuthTokenManager()
      const callback = vi.fn()

      const unsubscribe = manager.onAuthChange(callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('should call callback when token is set', () => {
      const manager = new AuthTokenManager()
      const callback = vi.fn()
      manager.onAuthChange(callback)

      const token = createMockJWT()
      manager.setToken(token)

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should call callback when token is cleared', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT()
      manager.setToken(token)

      const callback = vi.fn()
      manager.onAuthChange(callback)
      manager.clearToken()

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should pass auth state info to callback', () => {
      const manager = new AuthTokenManager()
      const callback = vi.fn()
      manager.onAuthChange(callback)

      const token = createMockJWT({ sub: 'user_456' })
      manager.setToken(token)

      expect(callback).toHaveBeenCalledWith({
        state: AuthState.Authenticated,
        token,
        claims: expect.objectContaining({ sub: 'user_456' }),
      })
    })

    it('should support multiple callbacks', () => {
      const manager = new AuthTokenManager()
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      manager.onAuthChange(callback1)
      manager.onAuthChange(callback2)

      manager.setToken(createMockJWT())

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
    })

    it('should allow unsubscribing', () => {
      const manager = new AuthTokenManager()
      const callback = vi.fn()
      const unsubscribe = manager.onAuthChange(callback)

      unsubscribe()
      manager.setToken(createMockJWT())

      expect(callback).not.toHaveBeenCalled()
    })

    it('should be safe to unsubscribe multiple times', () => {
      const manager = new AuthTokenManager()
      const callback = vi.fn()
      const unsubscribe = manager.onAuthChange(callback)

      unsubscribe()
      expect(() => unsubscribe()).not.toThrow()
    })

    it('should call callback with error state on auth failure', () => {
      const manager = new AuthTokenManager()
      const callback = vi.fn()
      manager.onAuthChange(callback)

      try {
        manager.setToken('invalid-token')
      } catch {
        // Expected
      }

      expect(callback).toHaveBeenCalledWith({
        state: AuthState.Error,
        token: null,
        claims: null,
        error: expect.any(Error),
      })
    })
  })

  // ============================================================================
  // Token Claims Tests
  // ============================================================================

  describe('getClaims()', () => {
    it('should return null when not authenticated', () => {
      const manager = new AuthTokenManager()
      expect(manager.getClaims()).toBeNull()
    })

    it('should return parsed claims when authenticated', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT({
        sub: 'user_789',
        iss: 'https://issuer.example.com',
        aud: 'my-app',
      })

      manager.setToken(token)

      const claims = manager.getClaims()
      expect(claims).not.toBeNull()
      expect(claims?.sub).toBe('user_789')
      expect(claims?.iss).toBe('https://issuer.example.com')
      expect(claims?.aud).toBe('my-app')
    })

    it('should return null after clearing token', () => {
      const manager = new AuthTokenManager()
      manager.setToken(createMockJWT())
      manager.clearToken()

      expect(manager.getClaims()).toBeNull()
    })

    it('should include standard JWT claims', () => {
      const manager = new AuthTokenManager()
      const now = Math.floor(Date.now() / 1000)
      const token = createMockJWT({
        sub: 'user_123',
        iss: 'issuer',
        aud: 'audience',
        exp: now + 3600,
        iat: now,
      })

      manager.setToken(token)

      const claims = manager.getClaims()
      expect(claims?.sub).toBe('user_123')
      expect(claims?.iss).toBe('issuer')
      expect(claims?.aud).toBe('audience')
      expect(claims?.exp).toBe(now + 3600)
      expect(claims?.iat).toBe(now)
    })

    it('should include custom claims', () => {
      const manager = new AuthTokenManager()
      const token = createMockJWT({
        sub: 'user_123',
        role: 'admin',
        permissions: ['read', 'write'],
      } as TokenClaims)

      manager.setToken(token)

      const claims = manager.getClaims()
      expect((claims as Record<string, unknown>)?.role).toBe('admin')
      expect((claims as Record<string, unknown>)?.permissions).toEqual(['read', 'write'])
    })
  })

  describe('getSubject()', () => {
    it('should return null when not authenticated', () => {
      const manager = new AuthTokenManager()
      expect(manager.getSubject()).toBeNull()
    })

    it('should return the subject claim', () => {
      const manager = new AuthTokenManager()
      manager.setToken(createMockJWT({ sub: 'user_abc' }))

      expect(manager.getSubject()).toBe('user_abc')
    })
  })

  describe('getExpiryTime()', () => {
    it('should return null when not authenticated', () => {
      const manager = new AuthTokenManager()
      expect(manager.getExpiryTime()).toBeNull()
    })

    it('should return the expiry time in milliseconds', () => {
      const manager = new AuthTokenManager()
      const expTime = Math.floor(Date.now() / 1000) + 3600
      manager.setToken(createMockJWT({ exp: expTime }))

      expect(manager.getExpiryTime()).toBe(expTime * 1000)
    })

    it('should return null if token has no expiry', () => {
      const manager = new AuthTokenManager()
      // Create token without exp claim by manipulating the mock
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const payload = btoa(JSON.stringify({ sub: 'user_123' }))
      const token = `${header}.${payload}.signature`

      manager.setToken(token)

      expect(manager.getExpiryTime()).toBeNull()
    })
  })

  describe('getTimeUntilExpiry()', () => {
    it('should return null when not authenticated', () => {
      const manager = new AuthTokenManager()
      expect(manager.getTimeUntilExpiry()).toBeNull()
    })

    it('should return time until expiry in milliseconds', () => {
      const manager = new AuthTokenManager()
      const now = Date.now()
      const expTime = Math.floor(now / 1000) + 3600 // 1 hour from now
      manager.setToken(createMockJWT({ exp: expTime }))

      const timeUntilExpiry = manager.getTimeUntilExpiry()
      expect(timeUntilExpiry).toBeGreaterThan(3500000) // ~59 minutes
      expect(timeUntilExpiry).toBeLessThanOrEqual(3600000) // 1 hour
    })

    it('should return negative value for expired token', () => {
      const manager = new AuthTokenManager()
      // Set a token that will expire soon
      const expTime = Math.floor(Date.now() / 1000) + 1
      manager.setToken(createMockJWT({ exp: expTime }))

      // Advance time past expiry
      vi.advanceTimersByTime(2000)

      const timeUntilExpiry = manager.getTimeUntilExpiry()
      expect(timeUntilExpiry).toBeLessThan(0)
    })
  })

  // ============================================================================
  // Token Refresh Tests
  // ============================================================================

  describe('Token Refresh', () => {
    describe('isRefreshScheduled()', () => {
      it('should return false when auto-refresh is disabled', () => {
        const manager = new AuthTokenManager({ autoRefresh: false })
        manager.setToken(createMockJWT())

        expect(manager.isRefreshScheduled()).toBe(false)
      })

      it('should return true when auto-refresh is enabled and token is set', () => {
        const manager = new AuthTokenManager({ autoRefresh: true })
        manager.setToken(createMockJWT())

        expect(manager.isRefreshScheduled()).toBe(true)
      })

      it('should return false after token is cleared', () => {
        const manager = new AuthTokenManager({ autoRefresh: true })
        manager.setToken(createMockJWT())
        manager.clearToken()

        expect(manager.isRefreshScheduled()).toBe(false)
      })
    })

    describe('setRefreshHandler()', () => {
      it('should register a refresh handler', () => {
        const manager = new AuthTokenManager({ autoRefresh: true })
        const refreshHandler = vi.fn()

        manager.setRefreshHandler(refreshHandler)

        expect(manager.hasRefreshHandler()).toBe(true)
      })

      it('should call refresh handler before token expires', async () => {
        const manager = new AuthTokenManager({
          autoRefresh: true,
          refreshThreshold: 60, // Refresh 60 seconds before expiry
        })

        const newToken = createMockJWT({ sub: 'refreshed_user' })
        const refreshHandler = vi.fn().mockResolvedValue(newToken)
        manager.setRefreshHandler(refreshHandler)

        // Set token that expires in 90 seconds
        const expTime = Math.floor(Date.now() / 1000) + 90
        manager.setToken(createMockJWT({ exp: expTime }))

        // Advance time to 35 seconds before expiry (should trigger refresh at 60 seconds before)
        await vi.advanceTimersByTimeAsync(35000)

        expect(refreshHandler).toHaveBeenCalledTimes(1)
      })

      it('should update token with refreshed value', async () => {
        const manager = new AuthTokenManager({
          autoRefresh: true,
          refreshThreshold: 60,
        })

        const newToken = createMockJWT({ sub: 'new_user_id' })
        const refreshHandler = vi.fn().mockResolvedValue(newToken)
        manager.setRefreshHandler(refreshHandler)

        // Set token expiring soon
        const expTime = Math.floor(Date.now() / 1000) + 90
        manager.setToken(createMockJWT({ exp: expTime }))

        await vi.advanceTimersByTimeAsync(35000)

        expect(manager.getToken()).toBe(newToken)
        expect(manager.getClaims()?.sub).toBe('new_user_id')
      })

      it('should handle refresh failure gracefully', async () => {
        const manager = new AuthTokenManager({
          autoRefresh: true,
          refreshThreshold: 60,
        })

        const refreshHandler = vi.fn().mockRejectedValue(new Error('Refresh failed'))
        manager.setRefreshHandler(refreshHandler)

        const originalToken = createMockJWT({ exp: Math.floor(Date.now() / 1000) + 90 })
        manager.setToken(originalToken)

        const errorCallback = vi.fn()
        manager.onAuthChange(errorCallback)

        await vi.advanceTimersByTimeAsync(35000)

        // Should still have the original token
        expect(manager.getToken()).toBe(originalToken)
        // Should emit error event
        expect(errorCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            state: AuthState.Error,
            error: expect.any(Error),
          })
        )
      })

      it('should retry refresh on failure', async () => {
        const manager = new AuthTokenManager({
          autoRefresh: true,
          refreshThreshold: 60,
          refreshRetryCount: 3,
          refreshRetryDelay: 1000,
        })

        const newToken = createMockJWT({ sub: 'refreshed' })
        const refreshHandler = vi.fn()
          .mockRejectedValueOnce(new Error('First attempt failed'))
          .mockRejectedValueOnce(new Error('Second attempt failed'))
          .mockResolvedValueOnce(newToken)

        manager.setRefreshHandler(refreshHandler)
        manager.setToken(createMockJWT({ exp: Math.floor(Date.now() / 1000) + 90 }))

        // Trigger refresh
        await vi.advanceTimersByTimeAsync(35000)
        // Wait for retries
        await vi.advanceTimersByTimeAsync(3000)

        expect(refreshHandler).toHaveBeenCalledTimes(3)
        expect(manager.getToken()).toBe(newToken)
      })
    })

    describe('refreshToken()', () => {
      it('should manually trigger token refresh', async () => {
        const manager = new AuthTokenManager()
        const newToken = createMockJWT({ sub: 'manually_refreshed' })
        const refreshHandler = vi.fn().mockResolvedValue(newToken)
        manager.setRefreshHandler(refreshHandler)
        manager.setToken(createMockJWT())

        await manager.refreshToken()

        expect(refreshHandler).toHaveBeenCalledTimes(1)
        expect(manager.getToken()).toBe(newToken)
      })

      it('should throw TokenRefreshError if no refresh handler', async () => {
        const manager = new AuthTokenManager()
        manager.setToken(createMockJWT())

        await expect(manager.refreshToken()).rejects.toThrow(TokenRefreshError)
      })

      it('should throw TokenRefreshError if not authenticated', async () => {
        const manager = new AuthTokenManager()
        manager.setRefreshHandler(vi.fn())

        await expect(manager.refreshToken()).rejects.toThrow(TokenRefreshError)
      })

      it('should pass current token to refresh handler', async () => {
        const manager = new AuthTokenManager()
        const currentToken = createMockJWT({ sub: 'original' })
        const refreshHandler = vi.fn().mockResolvedValue(createMockJWT())
        manager.setRefreshHandler(refreshHandler)
        manager.setToken(currentToken)

        await manager.refreshToken()

        expect(refreshHandler).toHaveBeenCalledWith(currentToken)
      })
    })

    describe('cancelRefresh()', () => {
      it('should cancel scheduled refresh', () => {
        const manager = new AuthTokenManager({ autoRefresh: true })
        manager.setToken(createMockJWT())

        manager.cancelRefresh()

        expect(manager.isRefreshScheduled()).toBe(false)
      })

      it('should be safe to call when no refresh is scheduled', () => {
        const manager = new AuthTokenManager({ autoRefresh: false })

        expect(() => manager.cancelRefresh()).not.toThrow()
      })
    })
  })

  // ============================================================================
  // Integration with Fetch Tests
  // ============================================================================

  describe('Fetch Integration', () => {
    describe('getAuthHeader()', () => {
      it('should return null when not authenticated', () => {
        const manager = new AuthTokenManager()
        expect(manager.getAuthHeader()).toBeNull()
      })

      it('should return Bearer token header when authenticated', () => {
        const manager = new AuthTokenManager()
        const token = createMockJWT()
        manager.setToken(token)

        expect(manager.getAuthHeader()).toBe(`Bearer ${token}`)
      })

      it('should return null after clearing token', () => {
        const manager = new AuthTokenManager()
        manager.setToken(createMockJWT())
        manager.clearToken()

        expect(manager.getAuthHeader()).toBeNull()
      })
    })

    describe('getAuthHeaders()', () => {
      it('should return empty object when not authenticated', () => {
        const manager = new AuthTokenManager()
        expect(manager.getAuthHeaders()).toEqual({})
      })

      it('should return headers object with Authorization when authenticated', () => {
        const manager = new AuthTokenManager()
        const token = createMockJWT()
        manager.setToken(token)

        expect(manager.getAuthHeaders()).toEqual({
          Authorization: `Bearer ${token}`,
        })
      })
    })

    describe('applyToRequest()', () => {
      it('should add Authorization header to request init', () => {
        const manager = new AuthTokenManager()
        const token = createMockJWT()
        manager.setToken(token)

        const requestInit: RequestInit = { method: 'POST' }
        const result = manager.applyToRequest(requestInit)

        expect(result.headers).toBeDefined()
        expect((result.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${token}`)
      })

      it('should preserve existing headers', () => {
        const manager = new AuthTokenManager()
        const token = createMockJWT()
        manager.setToken(token)

        const requestInit: RequestInit = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
        const result = manager.applyToRequest(requestInit)

        expect((result.headers as Record<string, string>)['Content-Type']).toBe('application/json')
        expect((result.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${token}`)
      })

      it('should not modify request when not authenticated', () => {
        const manager = new AuthTokenManager()

        const requestInit: RequestInit = { method: 'POST' }
        const result = manager.applyToRequest(requestInit)

        expect(result).toEqual({ method: 'POST' })
      })

      it('should handle Headers object', () => {
        const manager = new AuthTokenManager()
        const token = createMockJWT()
        manager.setToken(token)

        const headers = new Headers({ 'Content-Type': 'application/json' })
        const requestInit: RequestInit = { method: 'POST', headers }
        const result = manager.applyToRequest(requestInit)

        expect((result.headers as Headers).get('Authorization')).toBe(`Bearer ${token}`)
        expect((result.headers as Headers).get('Content-Type')).toBe('application/json')
      })
    })
  })

  // ============================================================================
  // Integration with WebSocket Tests
  // ============================================================================

  describe('WebSocket Integration', () => {
    describe('getAuthMessage()', () => {
      it('should return null when not authenticated', () => {
        const manager = new AuthTokenManager()
        expect(manager.getAuthMessage()).toBeNull()
      })

      it('should return authenticate message when authenticated', () => {
        const manager = new AuthTokenManager()
        const token = createMockJWT()
        manager.setToken(token)

        const message = manager.getAuthMessage()

        expect(message).toEqual({
          type: 'authenticate',
          token,
        })
      })
    })

    describe('getAuthMessageJSON()', () => {
      it('should return null when not authenticated', () => {
        const manager = new AuthTokenManager()
        expect(manager.getAuthMessageJSON()).toBeNull()
      })

      it('should return JSON string of authenticate message', () => {
        const manager = new AuthTokenManager()
        const token = createMockJWT()
        manager.setToken(token)

        const json = manager.getAuthMessageJSON()

        expect(json).toBe(JSON.stringify({ type: 'authenticate', token }))
      })
    })
  })

  // ============================================================================
  // Token Validation Tests
  // ============================================================================

  describe('Token Validation', () => {
    describe('validateToken()', () => {
      it('should return true for valid token', () => {
        const manager = new AuthTokenManager()
        const token = createMockJWT()

        expect(manager.validateToken(token)).toBe(true)
      })

      it('should return false for malformed token', () => {
        const manager = new AuthTokenManager()

        expect(manager.validateToken('not-a-jwt')).toBe(false)
        expect(manager.validateToken('')).toBe(false)
        expect(manager.validateToken('a.b')).toBe(false)
      })

      it('should return false for expired token', () => {
        const manager = new AuthTokenManager()
        const expiredToken = createMockJWT({}, { expired: true })

        expect(manager.validateToken(expiredToken)).toBe(false)
      })

      it('should return true for token without expiry', () => {
        const manager = new AuthTokenManager()
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
        const payload = btoa(JSON.stringify({ sub: 'user_123' }))
        const token = `${header}.${payload}.signature`

        expect(manager.validateToken(token)).toBe(true)
      })
    })
  })

  // ============================================================================
  // Error Types Tests
  // ============================================================================

  describe('Error Types', () => {
    describe('AuthTokenError', () => {
      it('should be an instance of Error', () => {
        const error = new AuthTokenError('Test error')

        expect(error).toBeInstanceOf(Error)
        expect(error).toBeInstanceOf(AuthTokenError)
      })

      it('should have name property', () => {
        const error = new AuthTokenError('Test')

        expect(error.name).toBe('AuthTokenError')
      })

      it('should have message property', () => {
        const error = new AuthTokenError('Custom message')

        expect(error.message).toBe('Custom message')
      })
    })

    describe('TokenExpiredError', () => {
      it('should extend AuthTokenError', () => {
        const error = new TokenExpiredError('Token expired')

        expect(error).toBeInstanceOf(AuthTokenError)
        expect(error).toBeInstanceOf(TokenExpiredError)
      })

      it('should have name property', () => {
        const error = new TokenExpiredError('Test')

        expect(error.name).toBe('TokenExpiredError')
      })

      it('should include expiry time', () => {
        const expiryTime = Date.now() - 3600000
        const error = new TokenExpiredError('Token expired', expiryTime)

        expect(error.expiryTime).toBe(expiryTime)
      })
    })

    describe('TokenInvalidError', () => {
      it('should extend AuthTokenError', () => {
        const error = new TokenInvalidError('Token invalid')

        expect(error).toBeInstanceOf(AuthTokenError)
        expect(error).toBeInstanceOf(TokenInvalidError)
      })

      it('should have name property', () => {
        const error = new TokenInvalidError('Test')

        expect(error.name).toBe('TokenInvalidError')
      })

      it('should include reason', () => {
        const error = new TokenInvalidError('Token invalid', 'malformed')

        expect(error.reason).toBe('malformed')
      })
    })

    describe('TokenRefreshError', () => {
      it('should extend AuthTokenError', () => {
        const error = new TokenRefreshError('Refresh failed')

        expect(error).toBeInstanceOf(AuthTokenError)
        expect(error).toBeInstanceOf(TokenRefreshError)
      })

      it('should have name property', () => {
        const error = new TokenRefreshError('Test')

        expect(error.name).toBe('TokenRefreshError')
      })

      it('should include original error', () => {
        const originalError = new Error('Network error')
        const error = new TokenRefreshError('Refresh failed', originalError)

        expect(error.cause).toBe(originalError)
      })
    })
  })

  // ============================================================================
  // Dispose/Cleanup Tests
  // ============================================================================

  describe('dispose()', () => {
    it('should clear the token', () => {
      const manager = new AuthTokenManager()
      manager.setToken(createMockJWT())

      manager.dispose()

      expect(manager.getToken()).toBeNull()
    })

    it('should cancel scheduled refresh', () => {
      const manager = new AuthTokenManager({ autoRefresh: true })
      manager.setToken(createMockJWT())

      manager.dispose()

      expect(manager.isRefreshScheduled()).toBe(false)
    })

    it('should remove all auth change listeners', () => {
      const manager = new AuthTokenManager()
      const callback = vi.fn()
      manager.onAuthChange(callback)

      manager.dispose()
      manager.setToken(createMockJWT())

      expect(callback).not.toHaveBeenCalled()
    })

    it('should clear refresh handler', () => {
      const manager = new AuthTokenManager()
      manager.setRefreshHandler(vi.fn())

      manager.dispose()

      expect(manager.hasRefreshHandler()).toBe(false)
    })

    it('should be safe to call multiple times', () => {
      const manager = new AuthTokenManager()
      manager.setToken(createMockJWT())

      expect(() => {
        manager.dispose()
        manager.dispose()
      }).not.toThrow()
    })
  })
})

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('JWT Utility Functions', () => {
  describe('parseJWT()', () => {
    it('should parse a valid JWT token', () => {
      const token = createMockJWT({ sub: 'user_123' })
      const claims = parseJWT(token)

      expect(claims.sub).toBe('user_123')
    })

    it('should throw for malformed token', () => {
      expect(() => parseJWT('invalid')).toThrow(TokenInvalidError)
      expect(() => parseJWT('a.b')).toThrow(TokenInvalidError)
      expect(() => parseJWT('')).toThrow(TokenInvalidError)
    })

    it('should throw for invalid base64 payload', () => {
      expect(() => parseJWT('header.!!!invalid-base64!!!.signature')).toThrow(TokenInvalidError)
    })

    it('should throw for non-JSON payload', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }))
      expect(() => parseJWT(`${header}.not-json.signature`)).toThrow(TokenInvalidError)
    })

    it('should handle URL-safe base64 encoding', () => {
      // JWT uses URL-safe base64 which replaces + with - and / with _
      const token = createMockJWT({ sub: 'user+test/123' })
      const claims = parseJWT(token)

      expect(claims.sub).toBe('user+test/123')
    })
  })

  describe('isTokenExpired()', () => {
    it('should return false for valid token', () => {
      const token = createMockJWT({ exp: Math.floor(Date.now() / 1000) + 3600 })

      expect(isTokenExpired(token)).toBe(false)
    })

    it('should return true for expired token', () => {
      const token = createMockJWT({}, { expired: true })

      expect(isTokenExpired(token)).toBe(true)
    })

    it('should return false for token without expiry', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const payload = btoa(JSON.stringify({ sub: 'user_123' }))
      const token = `${header}.${payload}.signature`

      expect(isTokenExpired(token)).toBe(false)
    })

    it('should accept optional buffer time', () => {
      const expTime = Math.floor(Date.now() / 1000) + 30 // Expires in 30 seconds
      const token = createMockJWT({ exp: expTime })

      expect(isTokenExpired(token)).toBe(false)
      expect(isTokenExpired(token, 60)).toBe(true) // With 60 second buffer
    })
  })

  describe('getTokenExpiryTime()', () => {
    it('should return expiry time in milliseconds', () => {
      const expTime = Math.floor(Date.now() / 1000) + 3600
      const token = createMockJWT({ exp: expTime })

      expect(getTokenExpiryTime(token)).toBe(expTime * 1000)
    })

    it('should return null for token without expiry', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const payload = btoa(JSON.stringify({ sub: 'user_123' }))
      const token = `${header}.${payload}.signature`

      expect(getTokenExpiryTime(token)).toBeNull()
    })

    it('should throw for malformed token', () => {
      expect(() => getTokenExpiryTime('invalid')).toThrow(TokenInvalidError)
    })
  })

  describe('createAuthHeader()', () => {
    it('should create Bearer token header', () => {
      const token = 'my-jwt-token'
      expect(createAuthHeader(token)).toBe('Bearer my-jwt-token')
    })

    it('should return null for empty token', () => {
      expect(createAuthHeader('')).toBeNull()
      expect(createAuthHeader(null as unknown as string)).toBeNull()
      expect(createAuthHeader(undefined as unknown as string)).toBeNull()
    })
  })

  describe('createAuthMessage()', () => {
    it('should create authenticate message object', () => {
      const token = 'my-jwt-token'
      expect(createAuthMessage(token)).toEqual({
        type: 'authenticate',
        token: 'my-jwt-token',
      })
    })

    it('should return null for empty token', () => {
      expect(createAuthMessage('')).toBeNull()
      expect(createAuthMessage(null as unknown as string)).toBeNull()
    })
  })
})

// ============================================================================
// Type Export Tests
// ============================================================================

describe('Type Exports', () => {
  it('should export AuthTokenManagerOptions type', () => {
    const options: AuthTokenManagerOptions = {
      storage: new MockLocalStorage(),
      storageKey: 'test',
      autoRefresh: true,
    }
    expect(options).toBeDefined()
  })

  it('should export AuthChangeCallback type', () => {
    const callback: AuthChangeCallback = (info) => {
      console.log(info.state)
    }
    expect(callback).toBeDefined()
  })

  it('should export TokenClaims type', () => {
    const claims: TokenClaims = {
      sub: 'user_123',
      iss: 'issuer',
      aud: 'audience',
      exp: Date.now(),
      iat: Date.now(),
    }
    expect(claims).toBeDefined()
  })

  it('should export AuthError type', () => {
    const error: AuthError = {
      code: 'EXPIRED',
      message: 'Token expired',
    }
    expect(error).toBeDefined()
  })
})
