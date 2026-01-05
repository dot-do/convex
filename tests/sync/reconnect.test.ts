/**
 * TDD RED Phase Tests for Reconnection Logic
 *
 * These tests define the expected interface and behavior for the reconnection system.
 * The implementation does not yet exist, so all tests should FAIL initially.
 *
 * Bead: convex-936.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Import from the module that will contain the implementation
import {
  ReconnectionManager,
  type ReconnectionConfig,
  type ReconnectionStatus,
  type ReconnectionState,
  type SubscriptionInfo,
} from '../../src/sync/reconnect'

// ============================================================================
// ReconnectionConfig Type Tests
// ============================================================================

describe('ReconnectionConfig', () => {
  describe('Default configuration', () => {
    it('should use default initialDelay of 1000ms', () => {
      const manager = new ReconnectionManager({})
      const config = manager.getConfig()
      expect(config.initialDelay).toBe(1000)
    })

    it('should use default maxDelay of 30000ms', () => {
      const manager = new ReconnectionManager({})
      const config = manager.getConfig()
      expect(config.maxDelay).toBe(30000)
    })

    it('should use default maxAttempts of 10', () => {
      const manager = new ReconnectionManager({})
      const config = manager.getConfig()
      expect(config.maxAttempts).toBe(10)
    })

    it('should use default backoffMultiplier of 2', () => {
      const manager = new ReconnectionManager({})
      const config = manager.getConfig()
      expect(config.backoffMultiplier).toBe(2)
    })

    it('should use default jitter of 0.1', () => {
      const manager = new ReconnectionManager({})
      const config = manager.getConfig()
      expect(config.jitter).toBe(0.1)
    })
  })

  describe('Custom configuration', () => {
    it('should accept custom initialDelay', () => {
      const manager = new ReconnectionManager({ initialDelay: 500 })
      const config = manager.getConfig()
      expect(config.initialDelay).toBe(500)
    })

    it('should accept custom maxDelay', () => {
      const manager = new ReconnectionManager({ maxDelay: 60000 })
      const config = manager.getConfig()
      expect(config.maxDelay).toBe(60000)
    })

    it('should accept custom maxAttempts', () => {
      const manager = new ReconnectionManager({ maxAttempts: 5 })
      const config = manager.getConfig()
      expect(config.maxAttempts).toBe(5)
    })

    it('should accept custom backoffMultiplier', () => {
      const manager = new ReconnectionManager({ backoffMultiplier: 1.5 })
      const config = manager.getConfig()
      expect(config.backoffMultiplier).toBe(1.5)
    })

    it('should accept custom jitter', () => {
      const manager = new ReconnectionManager({ jitter: 0.2 })
      const config = manager.getConfig()
      expect(config.jitter).toBe(0.2)
    })

    it('should accept all custom options together', () => {
      const manager = new ReconnectionManager({
        initialDelay: 2000,
        maxDelay: 60000,
        maxAttempts: 15,
        backoffMultiplier: 3,
        jitter: 0.25,
      })
      const config = manager.getConfig()
      expect(config.initialDelay).toBe(2000)
      expect(config.maxDelay).toBe(60000)
      expect(config.maxAttempts).toBe(15)
      expect(config.backoffMultiplier).toBe(3)
      expect(config.jitter).toBe(0.25)
    })
  })

  describe('Configuration validation', () => {
    it('should throw on negative initialDelay', () => {
      expect(() => new ReconnectionManager({ initialDelay: -100 })).toThrow()
    })

    it('should throw on negative maxDelay', () => {
      expect(() => new ReconnectionManager({ maxDelay: -100 })).toThrow()
    })

    it('should throw on negative maxAttempts', () => {
      expect(() => new ReconnectionManager({ maxAttempts: -1 })).toThrow()
    })

    it('should throw on backoffMultiplier less than 1', () => {
      expect(() => new ReconnectionManager({ backoffMultiplier: 0.5 })).toThrow()
    })

    it('should throw on negative jitter', () => {
      expect(() => new ReconnectionManager({ jitter: -0.1 })).toThrow()
    })

    it('should throw on jitter greater than 1', () => {
      expect(() => new ReconnectionManager({ jitter: 1.5 })).toThrow()
    })

    it('should throw if maxDelay is less than initialDelay', () => {
      expect(() => new ReconnectionManager({ initialDelay: 5000, maxDelay: 1000 })).toThrow()
    })

    it('should allow zero maxAttempts for infinite retries', () => {
      const manager = new ReconnectionManager({ maxAttempts: 0 })
      const config = manager.getConfig()
      expect(config.maxAttempts).toBe(0)
    })
  })
})

// ============================================================================
// ReconnectionManager Class Tests
// ============================================================================

describe('ReconnectionManager', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  describe('Initial state', () => {
    it('should start in disconnected state', () => {
      const status = manager.getStatus()
      expect(status.state).toBe('disconnected')
    })

    it('should have zero attempts initially', () => {
      const status = manager.getStatus()
      expect(status.attempt).toBe(0)
    })

    it('should have no nextAttemptIn initially', () => {
      const status = manager.getStatus()
      expect(status.nextAttemptIn).toBeNull()
    })

    it('should not be reconnecting initially', () => {
      expect(manager.isReconnecting()).toBe(false)
    })
  })

  describe('State transitions', () => {
    it('should transition to reconnecting when scheduleReconnect is called', () => {
      manager.scheduleReconnect()
      const status = manager.getStatus()
      expect(status.state).toBe('reconnecting')
    })

    it('should transition to connected when markConnected is called', () => {
      manager.markConnected()
      const status = manager.getStatus()
      expect(status.state).toBe('connected')
    })

    it('should transition to disconnected when markDisconnected is called', () => {
      manager.markConnected()
      manager.markDisconnected()
      const status = manager.getStatus()
      expect(status.state).toBe('disconnected')
    })

    it('should transition to failed when max attempts reached', () => {
      const smallManager = new ReconnectionManager({
        initialDelay: 100,
        maxDelay: 1000,
        maxAttempts: 2,
        backoffMultiplier: 2,
        jitter: 0,
      })

      // Simulate failed attempts
      smallManager.scheduleReconnect()
      vi.advanceTimersByTime(100)
      smallManager.handleReconnectFailed()

      smallManager.scheduleReconnect()
      vi.advanceTimersByTime(200)
      smallManager.handleReconnectFailed()

      const status = smallManager.getStatus()
      expect(status.state).toBe('failed')

      smallManager.dispose()
    })
  })
})

// ============================================================================
// Exponential Backoff Tests
// ============================================================================

describe('Exponential Backoff', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  describe('Delay calculation', () => {
    it('should use initialDelay for first attempt', () => {
      const delay = manager.calculateDelay(1)
      expect(delay).toBe(1000)
    })

    it('should double delay for second attempt', () => {
      const delay = manager.calculateDelay(2)
      expect(delay).toBe(2000)
    })

    it('should quadruple delay for third attempt', () => {
      const delay = manager.calculateDelay(3)
      expect(delay).toBe(4000)
    })

    it('should not exceed maxDelay', () => {
      const delay = manager.calculateDelay(100)
      expect(delay).toBe(30000)
    })

    it('should respect custom backoffMultiplier', () => {
      const customManager = new ReconnectionManager({
        initialDelay: 1000,
        maxDelay: 30000,
        maxAttempts: 10,
        backoffMultiplier: 3,
        jitter: 0,
      })

      expect(customManager.calculateDelay(1)).toBe(1000)
      expect(customManager.calculateDelay(2)).toBe(3000)
      expect(customManager.calculateDelay(3)).toBe(9000)

      customManager.dispose()
    })
  })

  describe('Actual reconnect scheduling', () => {
    it('should schedule first reconnect after initialDelay', () => {
      const callback = vi.fn()
      manager.onReconnecting = callback

      manager.scheduleReconnect()

      expect(callback).not.toHaveBeenCalled()
      vi.advanceTimersByTime(999)
      expect(callback).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(callback).toHaveBeenCalledWith(1)
    })

    it('should schedule second reconnect after doubled delay', () => {
      const callback = vi.fn()
      manager.onReconnecting = callback

      manager.scheduleReconnect()
      vi.advanceTimersByTime(1000)
      manager.handleReconnectFailed()

      manager.scheduleReconnect()
      vi.advanceTimersByTime(2000)

      expect(callback).toHaveBeenLastCalledWith(2)
    })

    it('should increment attempt counter', () => {
      manager.scheduleReconnect()
      vi.advanceTimersByTime(1000)
      manager.handleReconnectFailed()

      expect(manager.getStatus().attempt).toBe(1)

      manager.scheduleReconnect()
      vi.advanceTimersByTime(2000)
      manager.handleReconnectFailed()

      expect(manager.getStatus().attempt).toBe(2)
    })

    it('should cap delay at maxDelay', () => {
      // With initial 1000, multiplier 2, after 5 attempts delay would be 32000
      // But maxDelay is 30000
      const status1 = manager.getStatus()
      expect(status1.attempt).toBe(0)

      // Simulate 5 failed attempts
      for (let i = 0; i < 5; i++) {
        manager.scheduleReconnect()
        const delay = manager.calculateDelay(i + 1)
        vi.advanceTimersByTime(delay)
        manager.handleReconnectFailed()
      }

      // 6th attempt should use maxDelay
      const delay6 = manager.calculateDelay(6)
      expect(delay6).toBe(30000)
    })
  })
})

// ============================================================================
// Jitter Tests
// ============================================================================

describe('Jitter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should apply jitter to delay calculation', () => {
    const manager = new ReconnectionManager({
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitter: 0.5,
    })

    // With 50% jitter, delay should be between 500 and 1500
    const delay = manager.calculateDelay(1)
    expect(delay).toBeGreaterThanOrEqual(500)
    expect(delay).toBeLessThanOrEqual(1500)

    manager.dispose()
  })

  it('should produce different delays with jitter enabled', () => {
    const manager = new ReconnectionManager({
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitter: 0.5,
    })

    // Generate multiple delays and check they're not all identical
    const delays = new Set<number>()
    for (let i = 0; i < 10; i++) {
      delays.add(manager.calculateDelay(1))
    }

    // With 50% jitter, we should get some variation
    expect(delays.size).toBeGreaterThan(1)

    manager.dispose()
  })

  it('should not apply jitter when jitter is 0', () => {
    const manager = new ReconnectionManager({
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitter: 0,
    })

    // Without jitter, delay should always be exactly 1000
    for (let i = 0; i < 10; i++) {
      expect(manager.calculateDelay(1)).toBe(1000)
    }

    manager.dispose()
  })

  it('should bound jitter within configured range', () => {
    const manager = new ReconnectionManager({
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitter: 0.1, // 10% jitter
    })

    // With 10% jitter, delay should be between 900 and 1100
    for (let i = 0; i < 100; i++) {
      const delay = manager.calculateDelay(1)
      expect(delay).toBeGreaterThanOrEqual(900)
      expect(delay).toBeLessThanOrEqual(1100)
    }

    manager.dispose()
  })
})

// ============================================================================
// Maximum Retry Attempts Tests
// ============================================================================

describe('Maximum Retry Attempts', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 3,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('should stop after maxAttempts', () => {
    const maxAttemptsCallback = vi.fn()
    manager.onMaxAttemptsReached = maxAttemptsCallback

    // Attempt 1
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.handleReconnectFailed()

    // Attempt 2
    manager.scheduleReconnect()
    vi.advanceTimersByTime(200)
    manager.handleReconnectFailed()

    // Attempt 3
    manager.scheduleReconnect()
    vi.advanceTimersByTime(400)
    manager.handleReconnectFailed()

    expect(maxAttemptsCallback).toHaveBeenCalledTimes(1)
  })

  it('should not schedule more reconnects after max attempts', () => {
    // Exhaust all attempts
    for (let i = 0; i < 3; i++) {
      manager.scheduleReconnect()
      vi.advanceTimersByTime(manager.calculateDelay(i + 1))
      manager.handleReconnectFailed()
    }

    const reconnectingCallback = vi.fn()
    manager.onReconnecting = reconnectingCallback

    // Try to schedule another reconnect
    manager.scheduleReconnect()
    vi.advanceTimersByTime(10000)

    expect(reconnectingCallback).not.toHaveBeenCalled()
  })

  it('should allow infinite retries when maxAttempts is 0', () => {
    const infiniteManager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 0,
      backoffMultiplier: 2,
      jitter: 0,
    })

    const maxAttemptsCallback = vi.fn()
    infiniteManager.onMaxAttemptsReached = maxAttemptsCallback

    // Try many attempts
    for (let i = 0; i < 20; i++) {
      infiniteManager.scheduleReconnect()
      vi.advanceTimersByTime(1000)
      infiniteManager.handleReconnectFailed()
    }

    expect(maxAttemptsCallback).not.toHaveBeenCalled()

    infiniteManager.dispose()
  })

  it('should report remaining attempts in status', () => {
    expect(manager.getStatus().remainingAttempts).toBe(3)

    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.handleReconnectFailed()

    expect(manager.getStatus().remainingAttempts).toBe(2)
  })
})

// ============================================================================
// Callback Tests
// ============================================================================

describe('Callbacks', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 5,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  describe('onReconnecting callback', () => {
    it('should be called when reconnection starts', () => {
      const callback = vi.fn()
      manager.onReconnecting = callback

      manager.scheduleReconnect()
      vi.advanceTimersByTime(100)

      expect(callback).toHaveBeenCalled()
    })

    it('should receive attempt number', () => {
      const callback = vi.fn()
      manager.onReconnecting = callback

      manager.scheduleReconnect()
      vi.advanceTimersByTime(100)

      expect(callback).toHaveBeenCalledWith(1)
    })

    it('should be called with incrementing attempt numbers', () => {
      const callback = vi.fn()
      manager.onReconnecting = callback

      manager.scheduleReconnect()
      vi.advanceTimersByTime(100)
      manager.handleReconnectFailed()

      manager.scheduleReconnect()
      vi.advanceTimersByTime(200)

      expect(callback).toHaveBeenNthCalledWith(1, 1)
      expect(callback).toHaveBeenNthCalledWith(2, 2)
    })
  })

  describe('onReconnected callback', () => {
    it('should be called when connection is restored', () => {
      const callback = vi.fn()
      manager.onReconnected = callback

      manager.scheduleReconnect()
      vi.advanceTimersByTime(100)
      manager.markConnected()

      expect(callback).toHaveBeenCalled()
    })

    it('should not be called on initial connection', () => {
      const callback = vi.fn()
      manager.onReconnected = callback

      // Just mark as connected without having been disconnected
      manager.markConnected()

      // Should not call onReconnected for initial connection
      expect(callback).not.toHaveBeenCalled()
    })

    it('should be called after reconnection succeeds', () => {
      const callback = vi.fn()
      manager.onReconnected = callback

      // Initial connection
      manager.markConnected()
      // Disconnect
      manager.markDisconnected()
      // Start reconnecting
      manager.scheduleReconnect()
      vi.advanceTimersByTime(100)
      // Reconnect succeeds
      manager.markConnected()

      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('onMaxAttemptsReached callback', () => {
    it('should be called when max attempts exhausted', () => {
      const smallManager = new ReconnectionManager({
        initialDelay: 100,
        maxDelay: 1000,
        maxAttempts: 2,
        backoffMultiplier: 2,
        jitter: 0,
      })

      const callback = vi.fn()
      smallManager.onMaxAttemptsReached = callback

      smallManager.scheduleReconnect()
      vi.advanceTimersByTime(100)
      smallManager.handleReconnectFailed()

      smallManager.scheduleReconnect()
      vi.advanceTimersByTime(200)
      smallManager.handleReconnectFailed()

      expect(callback).toHaveBeenCalledTimes(1)

      smallManager.dispose()
    })

    it('should include final attempt number', () => {
      const smallManager = new ReconnectionManager({
        initialDelay: 100,
        maxDelay: 1000,
        maxAttempts: 3,
        backoffMultiplier: 2,
        jitter: 0,
      })

      const callback = vi.fn()
      smallManager.onMaxAttemptsReached = callback

      for (let i = 0; i < 3; i++) {
        smallManager.scheduleReconnect()
        vi.advanceTimersByTime(smallManager.calculateDelay(i + 1))
        smallManager.handleReconnectFailed()
      }

      expect(callback).toHaveBeenCalledWith(3)

      smallManager.dispose()
    })
  })

  describe('onDisconnected callback', () => {
    it('should be called when disconnection is detected', () => {
      const callback = vi.fn()
      manager.onDisconnected = callback

      manager.markConnected()
      manager.markDisconnected()

      expect(callback).toHaveBeenCalled()
    })
  })

  describe('onStateChange callback', () => {
    it('should be called on every state change', () => {
      const callback = vi.fn()
      manager.onStateChange = callback

      manager.scheduleReconnect()
      expect(callback).toHaveBeenCalledWith('reconnecting', 'disconnected')

      vi.advanceTimersByTime(100)
      manager.markConnected()
      expect(callback).toHaveBeenCalledWith('connected', 'reconnecting')
    })
  })
})

// ============================================================================
// Subscription Restoration Tests
// ============================================================================

describe('Subscription Restoration', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 5,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('should track subscriptions for restoration', () => {
    const sub1: SubscriptionInfo = {
      id: 'sub_1',
      queryPath: 'messages:list',
      args: { channel: 'general' },
    }
    const sub2: SubscriptionInfo = {
      id: 'sub_2',
      queryPath: 'users:get',
      args: { userId: '123' },
    }

    manager.trackSubscription(sub1)
    manager.trackSubscription(sub2)

    const subs = manager.getTrackedSubscriptions()
    expect(subs).toHaveLength(2)
    expect(subs).toContainEqual(sub1)
    expect(subs).toContainEqual(sub2)
  })

  it('should remove subscription from tracking', () => {
    const sub: SubscriptionInfo = {
      id: 'sub_1',
      queryPath: 'messages:list',
      args: { channel: 'general' },
    }

    manager.trackSubscription(sub)
    manager.untrackSubscription('sub_1')

    const subs = manager.getTrackedSubscriptions()
    expect(subs).toHaveLength(0)
  })

  it('should call restoration callback on reconnect', () => {
    const restoreCallback = vi.fn()
    manager.onRestoreSubscriptions = restoreCallback

    const sub: SubscriptionInfo = {
      id: 'sub_1',
      queryPath: 'messages:list',
      args: { channel: 'general' },
    }

    manager.trackSubscription(sub)

    // Simulate connection, disconnection, and reconnection
    manager.markConnected()
    manager.markDisconnected()
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.markConnected()

    expect(restoreCallback).toHaveBeenCalledWith([sub])
  })

  it('should preserve subscription order during restoration', () => {
    const restoreCallback = vi.fn()
    manager.onRestoreSubscriptions = restoreCallback

    const subs: SubscriptionInfo[] = [
      { id: 'sub_1', queryPath: 'a:first', args: {} },
      { id: 'sub_2', queryPath: 'b:second', args: {} },
      { id: 'sub_3', queryPath: 'c:third', args: {} },
    ]

    subs.forEach((sub) => manager.trackSubscription(sub))

    manager.markConnected()
    manager.markDisconnected()
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.markConnected()

    expect(restoreCallback).toHaveBeenCalledWith(subs)
  })

  it('should clear subscriptions on dispose', () => {
    const sub: SubscriptionInfo = {
      id: 'sub_1',
      queryPath: 'messages:list',
      args: { channel: 'general' },
    }

    manager.trackSubscription(sub)
    manager.dispose()

    const newManager = new ReconnectionManager({})
    expect(newManager.getTrackedSubscriptions()).toHaveLength(0)
    newManager.dispose()
  })
})

// ============================================================================
// State Preservation Tests
// ============================================================================

describe('State Preservation', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 5,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('should preserve attempt count during reconnection', () => {
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.handleReconnectFailed()

    manager.scheduleReconnect()

    expect(manager.getStatus().attempt).toBe(1)
  })

  it('should reset attempt count on successful connection', () => {
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.handleReconnectFailed()

    manager.scheduleReconnect()
    vi.advanceTimersByTime(200)
    manager.markConnected()

    expect(manager.getStatus().attempt).toBe(0)
  })

  it('should preserve last error information', () => {
    const error = new Error('Connection refused')
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.handleReconnectFailed(error)

    const status = manager.getStatus()
    expect(status.lastError).toBe(error)
  })

  it('should clear last error on successful connection', () => {
    const error = new Error('Connection refused')
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.handleReconnectFailed(error)

    manager.scheduleReconnect()
    vi.advanceTimersByTime(200)
    manager.markConnected()

    const status = manager.getStatus()
    expect(status.lastError).toBeNull()
  })

  it('should track time since last successful connection', () => {
    manager.markConnected()
    vi.advanceTimersByTime(5000)
    manager.markDisconnected()

    const status = manager.getStatus()
    expect(status.lastConnectedAt).toBeDefined()
    expect(status.disconnectedDuration).toBeGreaterThanOrEqual(0)
  })

  it('should preserve state across multiple reconnection cycles', () => {
    // First cycle
    manager.markConnected()
    manager.markDisconnected()
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.markConnected()

    // Second cycle
    manager.markDisconnected()
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.markConnected()

    // Should reset properly each time
    expect(manager.getStatus().attempt).toBe(0)
    expect(manager.getStatus().state).toBe('connected')
  })
})

// ============================================================================
// Manual Reconnect Tests
// ============================================================================

describe('Manual Reconnect', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 5,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('should allow manual reconnect trigger', async () => {
    const connectFn = vi.fn().mockResolvedValue(true)
    manager.setConnectFunction(connectFn)

    const promise = manager.reconnect()
    await vi.runAllTimersAsync()
    await promise

    expect(connectFn).toHaveBeenCalled()
  })

  it('should reset attempt counter on manual reconnect', () => {
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.handleReconnectFailed()

    expect(manager.getStatus().attempt).toBe(1)

    manager.resetAttempts()

    expect(manager.getStatus().attempt).toBe(0)
  })

  it('should bypass backoff on manual reconnect', async () => {
    const connectFn = vi.fn().mockResolvedValue(true)
    manager.setConnectFunction(connectFn)

    // Simulate failed attempts to build up backoff
    for (let i = 0; i < 3; i++) {
      manager.scheduleReconnect()
      vi.advanceTimersByTime(manager.calculateDelay(i + 1))
      manager.handleReconnectFailed()
    }

    // Manual reconnect should happen immediately
    const promise = manager.reconnect()
    await vi.runAllTimersAsync()
    await promise

    expect(connectFn).toHaveBeenCalled()
  })

  it('should cancel pending scheduled reconnect on manual reconnect', () => {
    const callback = vi.fn()
    manager.onReconnecting = callback

    manager.scheduleReconnect()

    // Manually reconnect before scheduled time
    manager.reconnect()

    // Advance past original scheduled time
    vi.advanceTimersByTime(200)

    // Callback should be called only once (from manual reconnect)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should return promise that resolves on success', async () => {
    const connectFn = vi.fn().mockResolvedValue(true)
    manager.setConnectFunction(connectFn)

    const promise = manager.reconnect()
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe(true)
  })

  it('should return promise that rejects on failure', async () => {
    const error = new Error('Connection failed')
    const connectFn = vi.fn().mockRejectedValue(error)
    manager.setConnectFunction(connectFn)

    const promise = manager.reconnect()
    await vi.runAllTimersAsync()

    await expect(promise).rejects.toThrow('Connection failed')
  })
})

// ============================================================================
// Cancel Reconnect Tests
// ============================================================================

describe('Cancel Reconnect', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('should cancel pending reconnection', () => {
    const callback = vi.fn()
    manager.onReconnecting = callback

    manager.scheduleReconnect()
    manager.cancelReconnect()

    vi.advanceTimersByTime(2000)

    expect(callback).not.toHaveBeenCalled()
  })

  it('should update state to disconnected after cancel', () => {
    manager.scheduleReconnect()
    manager.cancelReconnect()

    expect(manager.getStatus().state).toBe('disconnected')
  })

  it('should clear nextAttemptIn after cancel', () => {
    manager.scheduleReconnect()
    expect(manager.getStatus().nextAttemptIn).not.toBeNull()

    manager.cancelReconnect()
    expect(manager.getStatus().nextAttemptIn).toBeNull()
  })

  it('should be idempotent', () => {
    manager.scheduleReconnect()
    manager.cancelReconnect()
    manager.cancelReconnect()
    manager.cancelReconnect()

    expect(manager.getStatus().state).toBe('disconnected')
  })

  it('should not affect attempt counter', () => {
    manager.scheduleReconnect()
    vi.advanceTimersByTime(1000)
    manager.handleReconnectFailed()

    manager.scheduleReconnect()
    manager.cancelReconnect()

    expect(manager.getStatus().attempt).toBe(1)
  })
})

// ============================================================================
// Network State Detection Tests
// ============================================================================

describe('Network State Detection', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 5,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('should detect online/offline state', () => {
    manager.setNetworkState(false)
    expect(manager.isNetworkAvailable()).toBe(false)

    manager.setNetworkState(true)
    expect(manager.isNetworkAvailable()).toBe(true)
  })

  it('should pause reconnection when offline', () => {
    const callback = vi.fn()
    manager.onReconnecting = callback

    manager.setNetworkState(false)
    manager.scheduleReconnect()

    vi.advanceTimersByTime(10000)

    expect(callback).not.toHaveBeenCalled()
    expect(manager.getStatus().state).toBe('waiting_for_network')
  })

  it('should resume reconnection when online', () => {
    const callback = vi.fn()
    manager.onReconnecting = callback

    manager.setNetworkState(false)
    manager.scheduleReconnect()

    vi.advanceTimersByTime(1000)
    expect(callback).not.toHaveBeenCalled()

    manager.setNetworkState(true)
    vi.advanceTimersByTime(100)

    expect(callback).toHaveBeenCalled()
  })

  it('should trigger immediate reconnect when coming online', () => {
    const callback = vi.fn()
    manager.onReconnecting = callback

    manager.markConnected()
    manager.markDisconnected()
    manager.setNetworkState(false)
    manager.scheduleReconnect()

    // Simulate coming back online
    manager.setNetworkState(true)
    vi.advanceTimersByTime(100)

    expect(callback).toHaveBeenCalled()
  })

  it('should respect configurable network detection', () => {
    const customDetector = vi.fn().mockReturnValue(true)
    const customManager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 5,
      networkDetector: customDetector,
    })

    customManager.scheduleReconnect()
    vi.advanceTimersByTime(100)

    expect(customDetector).toHaveBeenCalled()

    customManager.dispose()
  })
})

// ============================================================================
// Status Reporting Tests
// ============================================================================

describe('Status Reporting', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('should report current state', () => {
    expect(manager.getStatus().state).toBe('disconnected')

    manager.scheduleReconnect()
    expect(manager.getStatus().state).toBe('reconnecting')

    vi.advanceTimersByTime(1000)
    manager.markConnected()
    expect(manager.getStatus().state).toBe('connected')
  })

  it('should report current attempt number', () => {
    expect(manager.getStatus().attempt).toBe(0)

    manager.scheduleReconnect()
    vi.advanceTimersByTime(1000)
    manager.handleReconnectFailed()

    expect(manager.getStatus().attempt).toBe(1)
  })

  it('should report time until next attempt', () => {
    manager.scheduleReconnect()

    const status = manager.getStatus()
    expect(status.nextAttemptIn).toBeLessThanOrEqual(1000)
    expect(status.nextAttemptIn).toBeGreaterThan(0)

    vi.advanceTimersByTime(500)

    const status2 = manager.getStatus()
    expect(status2.nextAttemptIn).toBeLessThanOrEqual(500)
  })

  it('should report remaining attempts', () => {
    expect(manager.getStatus().remainingAttempts).toBe(10)

    manager.scheduleReconnect()
    vi.advanceTimersByTime(1000)
    manager.handleReconnectFailed()

    expect(manager.getStatus().remainingAttempts).toBe(9)
  })

  it('should report last error', () => {
    expect(manager.getStatus().lastError).toBeNull()

    const error = new Error('Test error')
    manager.scheduleReconnect()
    vi.advanceTimersByTime(1000)
    manager.handleReconnectFailed(error)

    expect(manager.getStatus().lastError).toBe(error)
  })

  it('should report connection duration', () => {
    manager.markConnected()
    vi.advanceTimersByTime(5000)

    const status = manager.getStatus()
    expect(status.connectedDuration).toBeGreaterThanOrEqual(5000)
  })

  it('should report disconnection duration', () => {
    manager.markConnected()
    vi.advanceTimersByTime(1000)
    manager.markDisconnected()
    vi.advanceTimersByTime(3000)

    const status = manager.getStatus()
    expect(status.disconnectedDuration).toBeGreaterThanOrEqual(3000)
  })
})

// ============================================================================
// Edge Cases and Error Handling Tests
// ============================================================================

describe('Edge Cases and Error Handling', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 5,
      backoffMultiplier: 2,
      jitter: 0,
    })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('should handle multiple scheduleReconnect calls', () => {
    const callback = vi.fn()
    manager.onReconnecting = callback

    manager.scheduleReconnect()
    manager.scheduleReconnect()
    manager.scheduleReconnect()

    vi.advanceTimersByTime(100)

    // Should only trigger once
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should handle markConnected while not reconnecting', () => {
    manager.markConnected()
    expect(manager.getStatus().state).toBe('connected')
  })

  it('should handle markDisconnected while already disconnected', () => {
    manager.markDisconnected()
    expect(manager.getStatus().state).toBe('disconnected')
  })

  it('should handle dispose during reconnection', () => {
    const callback = vi.fn()
    manager.onReconnecting = callback

    manager.scheduleReconnect()
    manager.dispose()

    vi.advanceTimersByTime(1000)

    expect(callback).not.toHaveBeenCalled()
  })

  it('should handle rapid connect/disconnect cycles', () => {
    for (let i = 0; i < 10; i++) {
      manager.markConnected()
      manager.markDisconnected()
    }

    expect(manager.getStatus().state).toBe('disconnected')
  })

  it('should not throw when callbacks are not set', () => {
    // No callbacks set
    expect(() => {
      manager.scheduleReconnect()
      vi.advanceTimersByTime(100)
      manager.markConnected()
      manager.markDisconnected()
    }).not.toThrow()
  })

  it('should handle error thrown in callback', () => {
    manager.onReconnecting = () => {
      throw new Error('Callback error')
    }

    expect(() => {
      manager.scheduleReconnect()
      vi.advanceTimersByTime(100)
    }).not.toThrow()
  })

  it('should recover from callback errors', () => {
    let callCount = 0
    manager.onReconnecting = () => {
      callCount++
      if (callCount === 1) {
        throw new Error('First callback error')
      }
    }

    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.handleReconnectFailed()

    manager.scheduleReconnect()
    vi.advanceTimersByTime(200)

    expect(callCount).toBe(2)
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
  let manager: ReconnectionManager

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    if (manager) {
      manager.dispose()
    }
    vi.useRealTimers()
  })

  it('should work through complete reconnection cycle', () => {
    manager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 3,
      backoffMultiplier: 2,
      jitter: 0,
    })

    const events: string[] = []

    manager.onDisconnected = () => events.push('disconnected')
    manager.onReconnecting = (attempt) => events.push(`reconnecting:${attempt}`)
    manager.onReconnected = () => events.push('reconnected')

    // Initial connection
    manager.markConnected()

    // Connection lost
    manager.markDisconnected()
    expect(events).toContain('disconnected')

    // First reconnect attempt fails
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    expect(events).toContain('reconnecting:1')
    manager.handleReconnectFailed()

    // Second reconnect attempt succeeds
    manager.scheduleReconnect()
    vi.advanceTimersByTime(200)
    expect(events).toContain('reconnecting:2')
    manager.markConnected()
    expect(events).toContain('reconnected')

    expect(manager.getStatus().state).toBe('connected')
    expect(manager.getStatus().attempt).toBe(0)
  })

  it('should integrate with subscription restoration', () => {
    manager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 3,
      backoffMultiplier: 2,
      jitter: 0,
    })

    const restoredSubs: SubscriptionInfo[] = []
    manager.onRestoreSubscriptions = (subs) => {
      restoredSubs.push(...subs)
    }

    // Track subscriptions
    manager.trackSubscription({ id: '1', queryPath: 'test:query1', args: {} })
    manager.trackSubscription({ id: '2', queryPath: 'test:query2', args: { x: 1 } })

    // Connection cycle
    manager.markConnected()
    manager.markDisconnected()
    manager.scheduleReconnect()
    vi.advanceTimersByTime(100)
    manager.markConnected()

    expect(restoredSubs).toHaveLength(2)
  })

  it('should handle flaky connections', () => {
    manager = new ReconnectionManager({
      initialDelay: 100,
      maxDelay: 1000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitter: 0,
    })

    const reconnectedCount = vi.fn()
    manager.onReconnected = reconnectedCount

    // Simulate flaky connection with multiple disconnect/reconnect cycles
    for (let i = 0; i < 5; i++) {
      manager.markConnected()
      vi.advanceTimersByTime(50)
      manager.markDisconnected()
      manager.scheduleReconnect()
      vi.advanceTimersByTime(100)
      manager.markConnected()
    }

    expect(reconnectedCount).toHaveBeenCalledTimes(5)
  })

  it('should work with real-world scenario', () => {
    manager = new ReconnectionManager({
      initialDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitter: 0.1,
    })

    const connectFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce(true)

    manager.setConnectFunction(connectFn)

    const events: string[] = []
    manager.onReconnecting = (attempt) => events.push(`attempt:${attempt}`)
    manager.onReconnected = () => events.push('connected')

    // Simulate server going down
    manager.markConnected()
    manager.markDisconnected()

    // Start reconnection process
    manager.scheduleReconnect()

    // First attempt fails
    vi.advanceTimersByTime(1100) // With jitter
    manager.handleReconnectFailed(new Error('ECONNREFUSED'))

    // Second attempt fails
    manager.scheduleReconnect()
    vi.advanceTimersByTime(2200) // With jitter and backoff
    manager.handleReconnectFailed(new Error('ETIMEDOUT'))

    // Third attempt succeeds
    manager.scheduleReconnect()
    vi.advanceTimersByTime(4400) // With jitter and backoff
    manager.markConnected()

    expect(events).toContain('attempt:1')
    expect(events).toContain('attempt:2')
    expect(events).toContain('attempt:3')
    expect(events).toContain('connected')
  })
})
