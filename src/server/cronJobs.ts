/**
 * cronJobs() Scheduler API
 *
 * This module provides a cron-like scheduling system for Convex functions.
 * It supports convenient helper methods (daily, hourly, weekly, monthly)
 * as well as custom cron expressions and interval-based scheduling.
 *
 * @module
 */

import type { FunctionReference } from '../types'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Parsed cron expression fields
 */
export interface ParsedCronExpression {
  minute: number[]
  hour: number[]
  dayOfMonth: number[]
  month: number[]
  dayOfWeek: number[]
}

/**
 * Cron expression string type
 */
export type CronExpression = string

/**
 * Schedule configuration for a cron job
 */
export type CronSchedule =
  | { type: 'daily'; hourUTC: number; minuteUTC: number }
  | { type: 'hourly'; minuteUTC: number }
  | { type: 'weekly'; dayOfWeek: number; hourUTC: number; minuteUTC: number }
  | { type: 'monthly'; dayOfMonth: number; hourUTC: number; minuteUTC: number }
  | { type: 'interval'; seconds?: number; minutes?: number; hours?: number }
  | { type: 'cron'; expression: string; parsed: ParsedCronExpression }

/**
 * Definition of a single cron job
 */
export interface CronJobDefinition {
  functionRef: FunctionReference<'mutation' | 'action'>
  schedule: CronSchedule
  args?: Record<string, unknown>
  asCronExpression(): string
}

/**
 * Collection of cron jobs
 */
export interface Crons {
  jobs: Record<string, CronJobDefinition>

  daily<F extends FunctionReference<'mutation' | 'action'>>(
    name: string,
    schedule: { hourUTC: number; minuteUTC: number },
    functionRef: F,
    args?: F['_args']
  ): Crons

  hourly<F extends FunctionReference<'mutation' | 'action'>>(
    name: string,
    schedule: { minuteUTC?: number },
    functionRef: F,
    args?: F['_args']
  ): Crons

  weekly<F extends FunctionReference<'mutation' | 'action'>>(
    name: string,
    schedule: { dayOfWeek: number; hourUTC: number; minuteUTC: number },
    functionRef: F,
    args?: F['_args']
  ): Crons

  monthly<F extends FunctionReference<'mutation' | 'action'>>(
    name: string,
    schedule: { dayOfMonth: number; hourUTC: number; minuteUTC: number },
    functionRef: F,
    args?: F['_args']
  ): Crons

  interval<F extends FunctionReference<'mutation' | 'action'>>(
    name: string,
    schedule: { seconds?: number; minutes?: number; hours?: number },
    functionRef: F,
    args?: F['_args']
  ): Crons

  cron<F extends FunctionReference<'mutation' | 'action'>>(
    name: string,
    expression: CronExpression,
    functionRef: F,
    args?: F['_args']
  ): Crons

  toJSON(): { jobs: Record<string, unknown> }
}

/**
 * Error thrown when parsing invalid cron expressions
 */
export class CronParseError extends Error {
  field: string

  constructor(message: string, field: string) {
    super(message)
    this.name = 'CronParseError'
    this.field = field
  }
}

// ============================================================================
// Cron Expression Parsing
// ============================================================================

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

interface FieldConstraints {
  min: number
  max: number
  names?: Record<string, number>
}

const FIELD_CONSTRAINTS: Record<string, FieldConstraints> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12, names: MONTH_NAMES },
  dayOfWeek: { min: 0, max: 6, names: DAY_NAMES },
}

/**
 * Parse a single cron field value (handles ranges, steps, lists, wildcards)
 */
function parseField(value: string, constraints: FieldConstraints, fieldName: string): number[] {
  const { min, max, names } = constraints
  const result: number[] = []

  // Handle list (comma-separated values)
  const parts = value.split(',')

  for (const part of parts) {
    let current = part.trim().toLowerCase()

    // Replace names with numbers
    if (names) {
      for (const [name, num] of Object.entries(names)) {
        current = current.replace(new RegExp(`\\b${name}\\b`, 'gi'), String(num))
      }
    }

    // Handle step values (*/n or n-m/s)
    let step = 1
    if (current.includes('/')) {
      const [range, stepStr] = current.split('/')
      step = parseInt(stepStr, 10)
      if (isNaN(step) || step <= 0) {
        throw new CronParseError(`Invalid step value in ${fieldName}: ${part}`, fieldName)
      }
      current = range
    }

    // Handle wildcard
    if (current === '*') {
      for (let i = min; i <= max; i += step) {
        result.push(i)
      }
      continue
    }

    // Handle range (n-m)
    if (current.includes('-')) {
      const [startStr, endStr] = current.split('-')
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)

      if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
        throw new CronParseError(`Invalid range in ${fieldName}: ${part}`, fieldName)
      }

      for (let i = start; i <= end; i += step) {
        result.push(i)
      }
      continue
    }

    // Handle single value
    const num = parseInt(current, 10)
    if (isNaN(num) || num < min || num > max) {
      throw new CronParseError(`Invalid value in ${fieldName}: ${part} (must be ${min}-${max})`, fieldName)
    }
    result.push(num)
  }

  // Sort and dedupe
  return [...new Set(result)].sort((a, b) => a - b)
}

/**
 * Parse a cron expression string into its component parts
 */
export function parseCronExpression(expression: string): ParsedCronExpression {
  const fields = expression.trim().split(/\s+/)

  if (fields.length !== 5) {
    throw new CronParseError(
      `Invalid cron expression: expected 5 fields, got ${fields.length}`,
      'expression'
    )
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields

  return {
    minute: parseField(minute, FIELD_CONSTRAINTS.minute, 'minute'),
    hour: parseField(hour, FIELD_CONSTRAINTS.hour, 'hour'),
    dayOfMonth: parseField(dayOfMonth, FIELD_CONSTRAINTS.dayOfMonth, 'dayOfMonth'),
    month: parseField(month, FIELD_CONSTRAINTS.month, 'month'),
    dayOfWeek: parseField(dayOfWeek, FIELD_CONSTRAINTS.dayOfWeek, 'dayOfWeek'),
  }
}

/**
 * Validate a cron expression string
 */
export function validateCronExpression(expression: string): boolean {
  try {
    parseCronExpression(expression)
    return true
  } catch {
    return false
  }
}

/**
 * Calculate the next run time for a cron expression
 */
export function getNextRunTime(expression: string, from: Date = new Date()): Date {
  const parsed = parseCronExpression(expression)
  const next = new Date(from)

  // Start from the next minute
  next.setUTCSeconds(0, 0)
  next.setUTCMinutes(next.getUTCMinutes() + 1)

  // Try to find next match within reasonable limit (1 year)
  const maxIterations = 525600 // minutes in a year

  for (let i = 0; i < maxIterations; i++) {
    const minute = next.getUTCMinutes()
    const hour = next.getUTCHours()
    const dayOfMonth = next.getUTCDate()
    const month = next.getUTCMonth() + 1 // JavaScript months are 0-indexed
    const dayOfWeek = next.getUTCDay()

    // Check if current time matches
    const minuteMatch = parsed.minute.includes(minute)
    const hourMatch = parsed.hour.includes(hour)
    const dayOfMonthMatch = parsed.dayOfMonth.includes(dayOfMonth)
    const monthMatch = parsed.month.includes(month)
    const dayOfWeekMatch = parsed.dayOfWeek.includes(dayOfWeek)

    if (minuteMatch && hourMatch && dayOfMonthMatch && monthMatch && dayOfWeekMatch) {
      return next
    }

    // Advance by one minute
    next.setUTCMinutes(next.getUTCMinutes() + 1)
  }

  // Should never reach here for valid expressions
  return next
}

// ============================================================================
// Validation Helpers
// ============================================================================

/** Validates that a job name is non-empty and unique */
function validateJobName(name: string, existingJobs: Record<string, CronJobDefinition>): void {
  if (!name || name.trim() === '') {
    throw new Error('Invalid job name: name cannot be empty')
  }
  if (name in existingJobs) {
    throw new Error(`Job name '${name}' already exists`)
  }
}

/** Validates hour is within 0-23 range */
function validateHour(hour: number): void {
  if (hour < 0 || hour >= 24) {
    throw new Error(`Invalid hour: ${hour} (must be 0-23)`)
  }
}

/** Validates minute is within 0-59 range */
function validateMinute(minute: number): void {
  if (minute < 0 || minute >= 60) {
    throw new Error(`Invalid minute: ${minute} (must be 0-59)`)
  }
}

/** Validates day of week is within 0-6 (Sunday=0) */
function validateDayOfWeek(day: number): void {
  if (day < 0 || day > 6) {
    throw new Error(`Invalid dayOfWeek: ${day} (must be 0-6, where 0=Sunday)`)
  }
}

/** Validates day of month is within 1-31 */
function validateDayOfMonth(day: number): void {
  if (day < 1 || day > 31) {
    throw new Error(`Invalid dayOfMonth: ${day} (must be 1-31)`)
  }
}

/** Validates combined time schedule (hour and minute) */
function validateTimeSchedule(hourUTC: number, minuteUTC: number): void {
  validateHour(hourUTC)
  validateMinute(minuteUTC)
}

/** Validates interval has positive duration and no negative components */
function validateInterval(interval: { seconds?: number; minutes?: number; hours?: number }): void {
  const { seconds, minutes, hours } = interval

  // Check for negative values first
  if (seconds !== undefined && seconds < 0) {
    throw new Error('Invalid interval: seconds cannot be negative')
  }
  if (minutes !== undefined && minutes < 0) {
    throw new Error('Invalid interval: minutes cannot be negative')
  }
  if (hours !== undefined && hours < 0) {
    throw new Error('Invalid interval: hours cannot be negative')
  }

  // Ensure total duration is positive
  const totalSeconds = (seconds ?? 0) + (minutes ?? 0) * 60 + (hours ?? 0) * 3600
  if (totalSeconds <= 0) {
    throw new Error('Invalid interval: must be positive')
  }
}

// ============================================================================
// Job Definition Helper
// ============================================================================

/**
 * Create a cron job definition with the ability to convert to cron expression
 */
function createJobDefinition(
  schedule: CronSchedule,
  functionRef: FunctionReference<'mutation' | 'action'>,
  args?: Record<string, unknown>
): CronJobDefinition {
  return {
    functionRef,
    schedule,
    args,
    asCronExpression(): string {
      switch (schedule.type) {
        case 'daily':
          return `${schedule.minuteUTC} ${schedule.hourUTC} * * *`
        case 'hourly':
          return `${schedule.minuteUTC} * * * *`
        case 'weekly':
          return `${schedule.minuteUTC} ${schedule.hourUTC} * * ${schedule.dayOfWeek}`
        case 'monthly':
          return `${schedule.minuteUTC} ${schedule.hourUTC} ${schedule.dayOfMonth} * *`
        case 'interval':
          // Intervals don't have exact cron equivalents; approximate with */n
          if (schedule.minutes) {
            return `*/${schedule.minutes} * * * *`
          }
          if (schedule.hours) {
            return `0 */${schedule.hours} * * *`
          }
          // Seconds not supported in 5-field cron
          return '* * * * *'
        case 'cron':
          return schedule.expression
      }
    },
  }
}

// ============================================================================
// Main Factory Function
// ============================================================================

/**
 * Create a new cron jobs registry
 *
 * @example
 * ```typescript
 * import { cronJobs } from 'convex.do/server'
 * import { internal } from './_generated/api'
 *
 * export default cronJobs()
 *   .daily('cleanup', { hourUTC: 3, minuteUTC: 0 }, internal.tasks.cleanup)
 *   .hourly('sync', { minuteUTC: 15 }, internal.data.sync)
 *   .cron('custom', '0 9-17 * * 1-5', internal.reports.generate)
 * ```
 */
export function cronJobs(): Crons {
  const jobs: Record<string, CronJobDefinition> = {}

  const crons: Crons = {
    jobs,

    daily<F extends FunctionReference<'mutation' | 'action'>>(
      name: string,
      schedule: { hourUTC: number; minuteUTC: number },
      functionRef: F,
      args?: F['_args']
    ): Crons {
      validateJobName(name, jobs)
      validateTimeSchedule(schedule.hourUTC, schedule.minuteUTC)

      jobs[name] = createJobDefinition(
        { type: 'daily', ...schedule },
        functionRef,
        args as Record<string, unknown>
      )
      return crons
    },

    hourly<F extends FunctionReference<'mutation' | 'action'>>(
      name: string,
      schedule: { minuteUTC?: number },
      functionRef: F,
      args?: F['_args']
    ): Crons {
      validateJobName(name, jobs)
      const minuteUTC = schedule.minuteUTC ?? 0
      validateMinute(minuteUTC)

      jobs[name] = createJobDefinition(
        { type: 'hourly', minuteUTC },
        functionRef,
        args as Record<string, unknown>
      )
      return crons
    },

    weekly<F extends FunctionReference<'mutation' | 'action'>>(
      name: string,
      schedule: { dayOfWeek: number; hourUTC: number; minuteUTC: number },
      functionRef: F,
      args?: F['_args']
    ): Crons {
      validateJobName(name, jobs)
      validateDayOfWeek(schedule.dayOfWeek)
      validateTimeSchedule(schedule.hourUTC, schedule.minuteUTC)

      jobs[name] = createJobDefinition(
        { type: 'weekly', ...schedule },
        functionRef,
        args as Record<string, unknown>
      )
      return crons
    },

    monthly<F extends FunctionReference<'mutation' | 'action'>>(
      name: string,
      schedule: { dayOfMonth: number; hourUTC: number; minuteUTC: number },
      functionRef: F,
      args?: F['_args']
    ): Crons {
      validateJobName(name, jobs)
      validateDayOfMonth(schedule.dayOfMonth)
      validateTimeSchedule(schedule.hourUTC, schedule.minuteUTC)

      jobs[name] = createJobDefinition(
        { type: 'monthly', ...schedule },
        functionRef,
        args as Record<string, unknown>
      )
      return crons
    },

    interval<F extends FunctionReference<'mutation' | 'action'>>(
      name: string,
      schedule: { seconds?: number; minutes?: number; hours?: number },
      functionRef: F,
      args?: F['_args']
    ): Crons {
      validateJobName(name, jobs)
      validateInterval(schedule)

      jobs[name] = createJobDefinition(
        { type: 'interval', ...schedule },
        functionRef,
        args as Record<string, unknown>
      )
      return crons
    },

    cron<F extends FunctionReference<'mutation' | 'action'>>(
      name: string,
      expression: CronExpression,
      functionRef: F,
      args?: F['_args']
    ): Crons {
      validateJobName(name, jobs)

      // Parse and validate the cron expression
      const parsed = parseCronExpression(expression)

      jobs[name] = createJobDefinition(
        {
          type: 'cron',
          expression,
          parsed,
        },
        functionRef,
        args as Record<string, unknown>
      )
      return crons
    },

    toJSON(): { jobs: Record<string, unknown> } {
      const jobsData: Record<string, unknown> = {}
      for (const [name, job] of Object.entries(jobs)) {
        jobsData[name] = {
          schedule: job.schedule,
          functionRef: job.functionRef,
          args: job.args,
          cronExpression: job.asCronExpression(),
        }
      }
      return { jobs: jobsData }
    },
  }

  return crons
}

/**
 * Alias for cronJobs()
 */
export const defineCronJobs = cronJobs
