/**
 * TDD RED Phase Tests for cronJobs() Scheduler API
 *
 * These tests define the expected behavior for the cronJobs() function builder
 * that creates cron-scheduled function execution.
 *
 * cronJobs() provides:
 * - Convenient helper methods (daily, hourly, weekly, monthly)
 * - Custom cron expression scheduling via .cron()
 * - Integration with ConvexScheduler DO
 * - Type-safe function references
 * - Cron expression parsing and validation
 *
 * @see convex-jvef - cronJobs() Scheduler API (RED)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  cronJobs,
  Crons,
  CronSchedule,
  CronJobDefinition,
  CronExpression,
  parseCronExpression,
  validateCronExpression,
  getNextRunTime,
  CronParseError,
  defineCronJobs,
} from '../../src/server/cronJobs'
import { mutation, internalMutation } from '../../src/server/mutation'
import { action, internalAction } from '../../src/server/action'
import { makeFunctionReference, makeMutationReference, makeActionReference } from '../../src/server/functions'
import { v } from '../../src/values'

// ============================================================================
// cronJobs() Function Builder Tests
// ============================================================================

describe('cronJobs()', () => {
  describe('basic creation', () => {
    it('should create an empty cron jobs registry', () => {
      const crons = cronJobs()
      expect(crons).toBeDefined()
      expect(crons.jobs).toBeDefined()
      expect(Object.keys(crons.jobs)).toHaveLength(0)
    })

    it('should return a Crons type object', () => {
      const crons = cronJobs()
      const typedCrons: Crons = crons
      expect(typedCrons).toBeDefined()
    })

    it('should be chainable for defining multiple jobs', () => {
      const cleanup = makeMutationReference('tasks:cleanup')
      const report = makeActionReference('reports:generateDaily')

      const crons = cronJobs()
        .daily('cleanup', { hourUTC: 3, minuteUTC: 0 }, cleanup)
        .daily('report', { hourUTC: 8, minuteUTC: 30 }, report)

      expect(Object.keys(crons.jobs)).toHaveLength(2)
      expect(crons.jobs.cleanup).toBeDefined()
      expect(crons.jobs.report).toBeDefined()
    })
  })

  // ============================================================================
  // Daily Schedule Tests
  // ============================================================================

  describe('.daily()', () => {
    it('should schedule a job to run daily at a specific UTC time', () => {
      const cleanup = makeMutationReference('tasks:cleanup')

      const crons = cronJobs().daily(
        'daily-cleanup',
        { hourUTC: 3, minuteUTC: 30 },
        cleanup
      )

      expect(crons.jobs['daily-cleanup']).toBeDefined()
      expect(crons.jobs['daily-cleanup'].schedule.type).toBe('daily')
      expect(crons.jobs['daily-cleanup'].schedule.hourUTC).toBe(3)
      expect(crons.jobs['daily-cleanup'].schedule.minuteUTC).toBe(30)
    })

    it('should accept mutation function references', () => {
      const myMutation = makeMutationReference('jobs:dailyTask')

      const crons = cronJobs().daily(
        'mutation-job',
        { hourUTC: 0, minuteUTC: 0 },
        myMutation
      )

      expect(crons.jobs['mutation-job'].functionRef).toBe(myMutation)
    })

    it('should accept action function references', () => {
      const myAction = makeActionReference('jobs:dailyReport')

      const crons = cronJobs().daily(
        'action-job',
        { hourUTC: 12, minuteUTC: 0 },
        myAction
      )

      expect(crons.jobs['action-job'].functionRef).toBe(myAction)
    })

    it('should accept optional args for the scheduled function', () => {
      const cleanup = makeMutationReference('tasks:cleanup')

      const crons = cronJobs().daily(
        'cleanup-with-args',
        { hourUTC: 3, minuteUTC: 0 },
        cleanup,
        { maxAge: 30 }
      )

      expect(crons.jobs['cleanup-with-args'].args).toEqual({ maxAge: 30 })
    })

    it('should reject invalid hour values (negative)', () => {
      const cleanup = makeMutationReference('tasks:cleanup')

      expect(() =>
        cronJobs().daily('invalid', { hourUTC: -1, minuteUTC: 0 }, cleanup)
      ).toThrow(/Invalid hour/)
    })

    it('should reject invalid hour values (>= 24)', () => {
      const cleanup = makeMutationReference('tasks:cleanup')

      expect(() =>
        cronJobs().daily('invalid', { hourUTC: 24, minuteUTC: 0 }, cleanup)
      ).toThrow(/Invalid hour/)
    })

    it('should reject invalid minute values (negative)', () => {
      const cleanup = makeMutationReference('tasks:cleanup')

      expect(() =>
        cronJobs().daily('invalid', { hourUTC: 0, minuteUTC: -1 }, cleanup)
      ).toThrow(/Invalid minute/)
    })

    it('should reject invalid minute values (>= 60)', () => {
      const cleanup = makeMutationReference('tasks:cleanup')

      expect(() =>
        cronJobs().daily('invalid', { hourUTC: 0, minuteUTC: 60 }, cleanup)
      ).toThrow(/Invalid minute/)
    })
  })

  // ============================================================================
  // Hourly Schedule Tests
  // ============================================================================

  describe('.hourly()', () => {
    it('should schedule a job to run every hour at a specific minute', () => {
      const healthCheck = makeMutationReference('system:healthCheck')

      const crons = cronJobs().hourly(
        'hourly-check',
        { minuteUTC: 15 },
        healthCheck
      )

      expect(crons.jobs['hourly-check']).toBeDefined()
      expect(crons.jobs['hourly-check'].schedule.type).toBe('hourly')
      expect(crons.jobs['hourly-check'].schedule.minuteUTC).toBe(15)
    })

    it('should default to minute 0 if not specified', () => {
      const sync = makeActionReference('data:sync')

      const crons = cronJobs().hourly('hourly-sync', {}, sync)

      expect(crons.jobs['hourly-sync'].schedule.minuteUTC).toBe(0)
    })

    it('should reject invalid minute values', () => {
      const task = makeMutationReference('tasks:run')

      expect(() =>
        cronJobs().hourly('invalid', { minuteUTC: 75 }, task)
      ).toThrow(/Invalid minute/)
    })
  })

  // ============================================================================
  // Weekly Schedule Tests
  // ============================================================================

  describe('.weekly()', () => {
    it('should schedule a job to run weekly on a specific day and time', () => {
      const weeklyReport = makeActionReference('reports:weekly')

      const crons = cronJobs().weekly(
        'weekly-report',
        { dayOfWeek: 1, hourUTC: 9, minuteUTC: 0 }, // Monday at 9:00 UTC
        weeklyReport
      )

      expect(crons.jobs['weekly-report']).toBeDefined()
      expect(crons.jobs['weekly-report'].schedule.type).toBe('weekly')
      expect(crons.jobs['weekly-report'].schedule.dayOfWeek).toBe(1)
      expect(crons.jobs['weekly-report'].schedule.hourUTC).toBe(9)
    })

    it('should accept dayOfWeek 0-6 (Sunday-Saturday)', () => {
      const task = makeMutationReference('tasks:run')

      // Sunday (0)
      const crons0 = cronJobs().weekly('sun', { dayOfWeek: 0, hourUTC: 0, minuteUTC: 0 }, task)
      expect(crons0.jobs['sun'].schedule.dayOfWeek).toBe(0)

      // Saturday (6)
      const crons6 = cronJobs().weekly('sat', { dayOfWeek: 6, hourUTC: 0, minuteUTC: 0 }, task)
      expect(crons6.jobs['sat'].schedule.dayOfWeek).toBe(6)
    })

    it('should reject invalid dayOfWeek values', () => {
      const task = makeMutationReference('tasks:run')

      expect(() =>
        cronJobs().weekly('invalid', { dayOfWeek: 7, hourUTC: 0, minuteUTC: 0 }, task)
      ).toThrow(/Invalid dayOfWeek/)

      expect(() =>
        cronJobs().weekly('invalid', { dayOfWeek: -1, hourUTC: 0, minuteUTC: 0 }, task)
      ).toThrow(/Invalid dayOfWeek/)
    })
  })

  // ============================================================================
  // Monthly Schedule Tests
  // ============================================================================

  describe('.monthly()', () => {
    it('should schedule a job to run monthly on a specific day and time', () => {
      const monthlyReport = makeActionReference('reports:monthly')

      const crons = cronJobs().monthly(
        'monthly-report',
        { dayOfMonth: 1, hourUTC: 0, minuteUTC: 0 }, // 1st of each month at midnight
        monthlyReport
      )

      expect(crons.jobs['monthly-report']).toBeDefined()
      expect(crons.jobs['monthly-report'].schedule.type).toBe('monthly')
      expect(crons.jobs['monthly-report'].schedule.dayOfMonth).toBe(1)
    })

    it('should accept dayOfMonth 1-31', () => {
      const task = makeMutationReference('tasks:run')

      const crons1 = cronJobs().monthly('day1', { dayOfMonth: 1, hourUTC: 0, minuteUTC: 0 }, task)
      expect(crons1.jobs['day1'].schedule.dayOfMonth).toBe(1)

      const crons31 = cronJobs().monthly('day31', { dayOfMonth: 31, hourUTC: 0, minuteUTC: 0 }, task)
      expect(crons31.jobs['day31'].schedule.dayOfMonth).toBe(31)
    })

    it('should reject invalid dayOfMonth values', () => {
      const task = makeMutationReference('tasks:run')

      expect(() =>
        cronJobs().monthly('invalid', { dayOfMonth: 0, hourUTC: 0, minuteUTC: 0 }, task)
      ).toThrow(/Invalid dayOfMonth/)

      expect(() =>
        cronJobs().monthly('invalid', { dayOfMonth: 32, hourUTC: 0, minuteUTC: 0 }, task)
      ).toThrow(/Invalid dayOfMonth/)
    })
  })

  // ============================================================================
  // Interval Schedule Tests
  // ============================================================================

  describe('.interval()', () => {
    it('should schedule a job to run at fixed intervals', () => {
      const heartbeat = makeMutationReference('system:heartbeat')

      const crons = cronJobs().interval(
        'heartbeat',
        { minutes: 5 },
        heartbeat
      )

      expect(crons.jobs['heartbeat']).toBeDefined()
      expect(crons.jobs['heartbeat'].schedule.type).toBe('interval')
      expect(crons.jobs['heartbeat'].schedule.minutes).toBe(5)
    })

    it('should accept seconds interval', () => {
      const task = makeMutationReference('tasks:quick')

      const crons = cronJobs().interval('quick', { seconds: 30 }, task)
      expect(crons.jobs['quick'].schedule.seconds).toBe(30)
    })

    it('should accept hours interval', () => {
      const task = makeMutationReference('tasks:slow')

      const crons = cronJobs().interval('slow', { hours: 2 }, task)
      expect(crons.jobs['slow'].schedule.hours).toBe(2)
    })

    it('should reject zero interval', () => {
      const task = makeMutationReference('tasks:run')

      expect(() =>
        cronJobs().interval('invalid', { minutes: 0 }, task)
      ).toThrow(/Invalid interval/)
    })

    it('should reject negative interval', () => {
      const task = makeMutationReference('tasks:run')

      expect(() =>
        cronJobs().interval('invalid', { seconds: -10 }, task)
      ).toThrow(/Invalid interval/)
    })
  })

  // ============================================================================
  // Custom Cron Expression Tests
  // ============================================================================

  describe('.cron()', () => {
    it('should schedule a job with a standard cron expression', () => {
      const task = makeMutationReference('tasks:custom')

      // Every 5 minutes
      const crons = cronJobs().cron('custom-task', '*/5 * * * *', task)

      expect(crons.jobs['custom-task']).toBeDefined()
      expect(crons.jobs['custom-task'].schedule.type).toBe('cron')
      expect(crons.jobs['custom-task'].schedule.expression).toBe('*/5 * * * *')
    })

    it('should parse minute field', () => {
      const task = makeMutationReference('tasks:run')

      // At minute 30 of every hour
      const crons = cronJobs().cron('at-30', '30 * * * *', task)
      expect(crons.jobs['at-30'].schedule.parsed.minute).toEqual([30])
    })

    it('should parse hour field', () => {
      const task = makeMutationReference('tasks:run')

      // At 3:00 AM every day
      const crons = cronJobs().cron('at-3am', '0 3 * * *', task)
      expect(crons.jobs['at-3am'].schedule.parsed.hour).toEqual([3])
    })

    it('should parse day of month field', () => {
      const task = makeMutationReference('tasks:run')

      // On the 15th of every month at midnight
      const crons = cronJobs().cron('on-15th', '0 0 15 * *', task)
      expect(crons.jobs['on-15th'].schedule.parsed.dayOfMonth).toEqual([15])
    })

    it('should parse month field', () => {
      const task = makeMutationReference('tasks:run')

      // First day of January at midnight
      const crons = cronJobs().cron('jan-only', '0 0 1 1 *', task)
      expect(crons.jobs['jan-only'].schedule.parsed.month).toEqual([1])
    })

    it('should parse day of week field', () => {
      const task = makeMutationReference('tasks:run')

      // Every Monday at midnight
      const crons = cronJobs().cron('mondays', '0 0 * * 1', task)
      expect(crons.jobs['mondays'].schedule.parsed.dayOfWeek).toEqual([1])
    })

    it('should handle step values (*/n)', () => {
      const task = makeMutationReference('tasks:run')

      // Every 15 minutes
      const crons = cronJobs().cron('every-15', '*/15 * * * *', task)
      expect(crons.jobs['every-15'].schedule.parsed.minute).toEqual([0, 15, 30, 45])
    })

    it('should handle range values (n-m)', () => {
      const task = makeMutationReference('tasks:run')

      // Business hours (9 AM to 5 PM)
      const crons = cronJobs().cron('business-hours', '0 9-17 * * *', task)
      expect(crons.jobs['business-hours'].schedule.parsed.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
    })

    it('should handle list values (n,m,o)', () => {
      const task = makeMutationReference('tasks:run')

      // At 8 AM, 12 PM, and 6 PM
      const crons = cronJobs().cron('three-times', '0 8,12,18 * * *', task)
      expect(crons.jobs['three-times'].schedule.parsed.hour).toEqual([8, 12, 18])
    })

    it('should handle wildcard (*)', () => {
      const task = makeMutationReference('tasks:run')

      // Every minute (wildcard)
      const crons = cronJobs().cron('every-minute', '* * * * *', task)
      expect(crons.jobs['every-minute'].schedule.parsed.minute.length).toBe(60) // 0-59
    })

    it('should handle combined expressions', () => {
      const task = makeMutationReference('tasks:run')

      // Every 10 minutes during business hours on weekdays
      const crons = cronJobs().cron('complex', '*/10 9-17 * * 1-5', task)
      const schedule = crons.jobs['complex'].schedule.parsed

      expect(schedule.minute).toEqual([0, 10, 20, 30, 40, 50])
      expect(schedule.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
      expect(schedule.dayOfWeek).toEqual([1, 2, 3, 4, 5])
    })

    it('should reject invalid cron expressions', () => {
      const task = makeMutationReference('tasks:run')

      expect(() => cronJobs().cron('invalid', 'not a cron', task)).toThrow(CronParseError)
    })

    it('should reject cron expressions with wrong number of fields', () => {
      const task = makeMutationReference('tasks:run')

      // Too few fields
      expect(() => cronJobs().cron('invalid', '* * *', task)).toThrow(CronParseError)

      // Too many fields (6 field with seconds not supported)
      expect(() => cronJobs().cron('invalid', '* * * * * *', task)).toThrow(CronParseError)
    })

    it('should reject out-of-range values', () => {
      const task = makeMutationReference('tasks:run')

      // Minute 60 is invalid
      expect(() => cronJobs().cron('invalid', '60 * * * *', task)).toThrow(CronParseError)

      // Hour 24 is invalid
      expect(() => cronJobs().cron('invalid', '0 24 * * *', task)).toThrow(CronParseError)

      // Day 32 is invalid
      expect(() => cronJobs().cron('invalid', '0 0 32 * *', task)).toThrow(CronParseError)

      // Month 13 is invalid
      expect(() => cronJobs().cron('invalid', '0 0 1 13 *', task)).toThrow(CronParseError)

      // Day of week 7 is invalid (use 0 for Sunday)
      expect(() => cronJobs().cron('invalid', '0 0 * * 7', task)).toThrow(CronParseError)
    })
  })
})

// ============================================================================
// Cron Expression Parsing Tests
// ============================================================================

describe('parseCronExpression()', () => {
  describe('minute field parsing', () => {
    it('should parse single minute value', () => {
      const parsed = parseCronExpression('30 * * * *')
      expect(parsed.minute).toEqual([30])
    })

    it('should parse minute range', () => {
      const parsed = parseCronExpression('10-15 * * * *')
      expect(parsed.minute).toEqual([10, 11, 12, 13, 14, 15])
    })

    it('should parse minute step', () => {
      const parsed = parseCronExpression('*/20 * * * *')
      expect(parsed.minute).toEqual([0, 20, 40])
    })

    it('should parse minute list', () => {
      const parsed = parseCronExpression('0,15,30,45 * * * *')
      expect(parsed.minute).toEqual([0, 15, 30, 45])
    })

    it('should parse minute wildcard', () => {
      const parsed = parseCronExpression('* * * * *')
      expect(parsed.minute.length).toBe(60)
      expect(parsed.minute[0]).toBe(0)
      expect(parsed.minute[59]).toBe(59)
    })
  })

  describe('hour field parsing', () => {
    it('should parse single hour value', () => {
      const parsed = parseCronExpression('0 12 * * *')
      expect(parsed.hour).toEqual([12])
    })

    it('should parse hour range', () => {
      const parsed = parseCronExpression('0 9-17 * * *')
      expect(parsed.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
    })

    it('should parse hour step', () => {
      const parsed = parseCronExpression('0 */6 * * *')
      expect(parsed.hour).toEqual([0, 6, 12, 18])
    })

    it('should parse hour list', () => {
      const parsed = parseCronExpression('0 8,12,18 * * *')
      expect(parsed.hour).toEqual([8, 12, 18])
    })
  })

  describe('day of month field parsing', () => {
    it('should parse single day value', () => {
      const parsed = parseCronExpression('0 0 15 * *')
      expect(parsed.dayOfMonth).toEqual([15])
    })

    it('should parse day range', () => {
      const parsed = parseCronExpression('0 0 1-7 * *')
      expect(parsed.dayOfMonth).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it('should parse day step', () => {
      const parsed = parseCronExpression('0 0 */7 * *')
      expect(parsed.dayOfMonth).toEqual([1, 8, 15, 22, 29])
    })

    it('should parse day list', () => {
      const parsed = parseCronExpression('0 0 1,15 * *')
      expect(parsed.dayOfMonth).toEqual([1, 15])
    })
  })

  describe('month field parsing', () => {
    it('should parse single month value', () => {
      const parsed = parseCronExpression('0 0 1 6 *')
      expect(parsed.month).toEqual([6])
    })

    it('should parse month range', () => {
      const parsed = parseCronExpression('0 0 1 1-6 *')
      expect(parsed.month).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('should parse month names (jan-dec)', () => {
      const parsed = parseCronExpression('0 0 1 jan *')
      expect(parsed.month).toEqual([1])

      const parsedDec = parseCronExpression('0 0 1 dec *')
      expect(parsedDec.month).toEqual([12])
    })

    it('should parse month name ranges', () => {
      const parsed = parseCronExpression('0 0 1 jan-mar *')
      expect(parsed.month).toEqual([1, 2, 3])
    })
  })

  describe('day of week field parsing', () => {
    it('should parse single day value', () => {
      const parsed = parseCronExpression('0 0 * * 1')
      expect(parsed.dayOfWeek).toEqual([1])
    })

    it('should parse day range', () => {
      const parsed = parseCronExpression('0 0 * * 1-5')
      expect(parsed.dayOfWeek).toEqual([1, 2, 3, 4, 5])
    })

    it('should parse day names (sun-sat)', () => {
      const parsed = parseCronExpression('0 0 * * mon')
      expect(parsed.dayOfWeek).toEqual([1])

      const parsedSun = parseCronExpression('0 0 * * sun')
      expect(parsedSun.dayOfWeek).toEqual([0])
    })

    it('should parse day name ranges', () => {
      const parsed = parseCronExpression('0 0 * * mon-fri')
      expect(parsed.dayOfWeek).toEqual([1, 2, 3, 4, 5])
    })
  })

  describe('error handling', () => {
    it('should throw CronParseError for invalid expressions', () => {
      expect(() => parseCronExpression('invalid')).toThrow(CronParseError)
    })

    it('should throw CronParseError with descriptive message', () => {
      try {
        parseCronExpression('60 * * * *')
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(CronParseError)
        expect((e as CronParseError).message).toContain('minute')
      }
    })

    it('should include the invalid field in error', () => {
      try {
        parseCronExpression('0 25 * * *')
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as CronParseError).field).toBe('hour')
      }
    })
  })
})

// ============================================================================
// validateCronExpression() Tests
// ============================================================================

describe('validateCronExpression()', () => {
  it('should return true for valid expressions', () => {
    expect(validateCronExpression('0 * * * *')).toBe(true)
    expect(validateCronExpression('*/5 * * * *')).toBe(true)
    expect(validateCronExpression('0 9-17 * * 1-5')).toBe(true)
  })

  it('should return false for invalid expressions', () => {
    expect(validateCronExpression('invalid')).toBe(false)
    expect(validateCronExpression('60 * * * *')).toBe(false)
    expect(validateCronExpression('* * *')).toBe(false)
  })
})

// ============================================================================
// getNextRunTime() Tests
// ============================================================================

describe('getNextRunTime()', () => {
  it('should calculate next run time for simple expression', () => {
    // At minute 0 of every hour
    const now = new Date('2024-01-15T10:30:00Z')
    const next = getNextRunTime('0 * * * *', now)

    expect(next.getUTCHours()).toBe(11)
    expect(next.getUTCMinutes()).toBe(0)
  })

  it('should calculate next run time for daily schedule', () => {
    // At 3:00 AM UTC daily
    const now = new Date('2024-01-15T10:30:00Z')
    const next = getNextRunTime('0 3 * * *', now)

    // Should be next day at 3:00
    expect(next.getUTCDate()).toBe(16)
    expect(next.getUTCHours()).toBe(3)
    expect(next.getUTCMinutes()).toBe(0)
  })

  it('should return correct time when already past today\'s run time', () => {
    // At 8:00 AM UTC, but it's already 10:00 AM
    const now = new Date('2024-01-15T10:00:00Z')
    const next = getNextRunTime('0 8 * * *', now)

    // Should be next day
    expect(next.getUTCDate()).toBe(16)
    expect(next.getUTCHours()).toBe(8)
  })

  it('should handle weekly schedules', () => {
    // Every Monday at 9:00 AM
    const now = new Date('2024-01-15T10:00:00Z') // Monday
    const next = getNextRunTime('0 9 * * 1', now)

    // Already past this Monday's time, should be next Monday
    expect(next.getUTCDate()).toBe(22)
    expect(next.getUTCHours()).toBe(9)
  })

  it('should handle monthly schedules', () => {
    // First of each month at midnight
    const now = new Date('2024-01-15T10:00:00Z')
    const next = getNextRunTime('0 0 1 * *', now)

    // Should be Feb 1st
    expect(next.getUTCMonth()).toBe(1) // February (0-indexed)
    expect(next.getUTCDate()).toBe(1)
  })

  it('should handle step expressions', () => {
    // Every 15 minutes
    const now = new Date('2024-01-15T10:08:00Z')
    const next = getNextRunTime('*/15 * * * *', now)

    expect(next.getUTCMinutes()).toBe(15)
    expect(next.getUTCHours()).toBe(10)
  })
})

// ============================================================================
// CronJobDefinition Type Tests
// ============================================================================

describe('CronJobDefinition type', () => {
  it('should store function reference', () => {
    const task = makeMutationReference('tasks:cleanup')
    const crons = cronJobs().daily('job', { hourUTC: 0, minuteUTC: 0 }, task)

    const job: CronJobDefinition = crons.jobs['job']
    expect(job.functionRef).toBeDefined()
  })

  it('should store schedule configuration', () => {
    const task = makeMutationReference('tasks:run')
    const crons = cronJobs().cron('job', '*/5 * * * *', task)

    const job = crons.jobs['job']
    expect(job.schedule).toBeDefined()
    expect(job.schedule.type).toBe('cron')
    expect(job.schedule.expression).toBe('*/5 * * * *')
  })

  it('should store optional args', () => {
    const task = makeMutationReference('tasks:cleanup')
    const crons = cronJobs().daily(
      'job',
      { hourUTC: 0, minuteUTC: 0 },
      task,
      { daysOld: 30 }
    )

    expect(crons.jobs['job'].args).toEqual({ daysOld: 30 })
  })
})

// ============================================================================
// CronSchedule Type Tests
// ============================================================================

describe('CronSchedule type', () => {
  it('should support daily schedule type', () => {
    const schedule: CronSchedule = {
      type: 'daily',
      hourUTC: 3,
      minuteUTC: 30,
    }
    expect(schedule.type).toBe('daily')
  })

  it('should support hourly schedule type', () => {
    const schedule: CronSchedule = {
      type: 'hourly',
      minuteUTC: 0,
    }
    expect(schedule.type).toBe('hourly')
  })

  it('should support weekly schedule type', () => {
    const schedule: CronSchedule = {
      type: 'weekly',
      dayOfWeek: 1,
      hourUTC: 9,
      minuteUTC: 0,
    }
    expect(schedule.type).toBe('weekly')
  })

  it('should support monthly schedule type', () => {
    const schedule: CronSchedule = {
      type: 'monthly',
      dayOfMonth: 1,
      hourUTC: 0,
      minuteUTC: 0,
    }
    expect(schedule.type).toBe('monthly')
  })

  it('should support interval schedule type', () => {
    const schedule: CronSchedule = {
      type: 'interval',
      seconds: 30,
    }
    expect(schedule.type).toBe('interval')
  })

  it('should support cron schedule type', () => {
    const schedule: CronSchedule = {
      type: 'cron',
      expression: '*/5 * * * *',
      parsed: {
        minute: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
        hour: Array.from({ length: 24 }, (_, i) => i),
        dayOfMonth: Array.from({ length: 31 }, (_, i) => i + 1),
        month: Array.from({ length: 12 }, (_, i) => i + 1),
        dayOfWeek: Array.from({ length: 7 }, (_, i) => i),
      },
    }
    expect(schedule.type).toBe('cron')
  })
})

// ============================================================================
// Integration with Scheduler Tests
// ============================================================================

describe('integration with scheduler', () => {
  it('should convert daily schedule to equivalent cron expression', () => {
    const task = makeMutationReference('tasks:run')
    const crons = cronJobs().daily('daily', { hourUTC: 3, minuteUTC: 30 }, task)

    // Should internally represent as cron expression
    expect(crons.jobs['daily'].asCronExpression()).toBe('30 3 * * *')
  })

  it('should convert hourly schedule to equivalent cron expression', () => {
    const task = makeMutationReference('tasks:run')
    const crons = cronJobs().hourly('hourly', { minuteUTC: 15 }, task)

    expect(crons.jobs['hourly'].asCronExpression()).toBe('15 * * * *')
  })

  it('should convert weekly schedule to equivalent cron expression', () => {
    const task = makeMutationReference('tasks:run')
    const crons = cronJobs().weekly('weekly', { dayOfWeek: 1, hourUTC: 9, minuteUTC: 0 }, task)

    expect(crons.jobs['weekly'].asCronExpression()).toBe('0 9 * * 1')
  })

  it('should convert monthly schedule to equivalent cron expression', () => {
    const task = makeMutationReference('tasks:run')
    const crons = cronJobs().monthly('monthly', { dayOfMonth: 15, hourUTC: 0, minuteUTC: 0 }, task)

    expect(crons.jobs['monthly'].asCronExpression()).toBe('0 0 15 * *')
  })

  it('should provide toJSON() for persistence', () => {
    const task = makeMutationReference('tasks:run')
    const crons = cronJobs()
      .daily('daily', { hourUTC: 3, minuteUTC: 0 }, task)
      .cron('custom', '*/5 * * * *', task)

    const json = crons.toJSON()
    expect(json.jobs.daily).toBeDefined()
    expect(json.jobs.custom).toBeDefined()
  })
})

// ============================================================================
// Job Name Validation Tests
// ============================================================================

describe('job name validation', () => {
  it('should accept valid job names', () => {
    const task = makeMutationReference('tasks:run')

    expect(() =>
      cronJobs().daily('my-job', { hourUTC: 0, minuteUTC: 0 }, task)
    ).not.toThrow()

    expect(() =>
      cronJobs().daily('myJob_123', { hourUTC: 0, minuteUTC: 0 }, task)
    ).not.toThrow()
  })

  it('should reject empty job names', () => {
    const task = makeMutationReference('tasks:run')

    expect(() =>
      cronJobs().daily('', { hourUTC: 0, minuteUTC: 0 }, task)
    ).toThrow(/Invalid job name/)
  })

  it('should reject duplicate job names', () => {
    const task = makeMutationReference('tasks:run')

    expect(() =>
      cronJobs()
        .daily('duplicate', { hourUTC: 0, minuteUTC: 0 }, task)
        .daily('duplicate', { hourUTC: 1, minuteUTC: 0 }, task)
    ).toThrow(/already exists/)
  })
})

// ============================================================================
// defineCronJobs() Alternative API Tests
// ============================================================================

describe('defineCronJobs()', () => {
  it('should be an alias for cronJobs()', () => {
    const crons = defineCronJobs()
    expect(crons).toBeDefined()
    expect(crons.jobs).toBeDefined()
  })

  it('should work identically to cronJobs()', () => {
    const task = makeMutationReference('tasks:run')

    const crons = defineCronJobs().daily('job', { hourUTC: 0, minuteUTC: 0 }, task)
    expect(crons.jobs['job']).toBeDefined()
  })
})

// ============================================================================
// Export Type Tests
// ============================================================================

describe('cronJobs exports', () => {
  it('should export cronJobs function', () => {
    expect(typeof cronJobs).toBe('function')
  })

  it('should export Crons type (compile-time check)', () => {
    const crons: Crons = cronJobs()
    expect(crons).toBeDefined()
  })

  it('should export CronSchedule type (compile-time check)', () => {
    const schedule: CronSchedule = {
      type: 'daily',
      hourUTC: 0,
      minuteUTC: 0,
    }
    expect(schedule).toBeDefined()
  })

  it('should export CronJobDefinition type (compile-time check)', () => {
    const task = makeMutationReference('tasks:run')
    const crons = cronJobs().daily('job', { hourUTC: 0, minuteUTC: 0 }, task)
    const job: CronJobDefinition = crons.jobs['job']
    expect(job).toBeDefined()
  })

  it('should export CronExpression type (compile-time check)', () => {
    const expr: CronExpression = '*/5 * * * *'
    expect(expr).toBeDefined()
  })

  it('should export parseCronExpression function', () => {
    expect(typeof parseCronExpression).toBe('function')
  })

  it('should export validateCronExpression function', () => {
    expect(typeof validateCronExpression).toBe('function')
  })

  it('should export getNextRunTime function', () => {
    expect(typeof getNextRunTime).toBe('function')
  })

  it('should export CronParseError class', () => {
    expect(CronParseError).toBeDefined()
    const error = new CronParseError('test', 'minute')
    expect(error).toBeInstanceOf(Error)
    expect(error.field).toBe('minute')
  })

  it('should export defineCronJobs function', () => {
    expect(typeof defineCronJobs).toBe('function')
  })
})

// ============================================================================
// Real-world Usage Pattern Tests
// ============================================================================

describe('real-world usage patterns', () => {
  it('should support typical cron jobs file structure', () => {
    // This is how users would typically define cron jobs
    const cleanup = makeMutationReference('tasks:cleanup')
    const sendReport = makeActionReference('reports:sendDaily')
    const healthCheck = makeMutationReference('system:healthCheck')

    const crons = cronJobs()
      // Clean up old data daily at 3 AM
      .daily('cleanup', { hourUTC: 3, minuteUTC: 0 }, cleanup, { daysOld: 30 })
      // Send daily report at 8 AM
      .daily('daily-report', { hourUTC: 8, minuteUTC: 0 }, sendReport)
      // Health check every 5 minutes
      .interval('health-check', { minutes: 5 }, healthCheck)

    expect(Object.keys(crons.jobs)).toHaveLength(3)
  })

  it('should support complex scheduling scenarios', () => {
    const backup = makeActionReference('system:backup')
    const report = makeActionReference('reports:weekly')

    const crons = cronJobs()
      // Full backup on Sundays at 2 AM
      .weekly('full-backup', { dayOfWeek: 0, hourUTC: 2, minuteUTC: 0 }, backup, { type: 'full' })
      // Incremental backup Mon-Sat at 2 AM
      .cron('incremental-backup', '0 2 * * 1-6', backup, { type: 'incremental' })
      // Weekly report on Fridays at 5 PM
      .weekly('weekly-report', { dayOfWeek: 5, hourUTC: 17, minuteUTC: 0 }, report)

    expect(Object.keys(crons.jobs)).toHaveLength(3)
  })

  it('should match Convex official cronJobs API pattern', () => {
    // Test that our API matches Convex's documented cronJobs API
    const task = makeMutationReference('tasks:run')

    // Convex pattern: cronJobs.cron(name, expression, func, args?)
    const crons = cronJobs()
      .cron('every-minute', '* * * * *', task)
      .cron('every-hour', '0 * * * *', task)
      .cron('daily-midnight', '0 0 * * *', task)

    expect(crons.jobs['every-minute']).toBeDefined()
    expect(crons.jobs['every-hour']).toBeDefined()
    expect(crons.jobs['daily-midnight']).toBeDefined()
  })
})
