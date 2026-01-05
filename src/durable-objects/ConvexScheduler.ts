/**
 * ConvexScheduler Durable Object
 *
 * Handles scheduled function execution using Durable Object alarms.
 */

import type { Env } from '../env'

interface ScheduledFunction {
  id: string
  functionPath: string
  args: unknown
  runAt: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled'
  createdAt: number
  completedAt?: number
  error?: string
  retries: number
  maxRetries: number
}

export class ConvexScheduler implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private sql: SqlStorage
  private initialized = false

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.sql = state.storage.sql
  }

  /**
   * Initialize the scheduler tables
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return

    await this.state.blockConcurrencyWhile(async () => {
      if (this.initialized) return

      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_functions (
          id TEXT PRIMARY KEY,
          function_path TEXT NOT NULL,
          args TEXT NOT NULL,
          run_at INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL,
          completed_at INTEGER,
          error TEXT,
          retries INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 3
        )
      `)

      this.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_scheduled_run_at
        ON scheduled_functions (run_at)
        WHERE status = 'pending'
      `)

      this.initialized = true
    })
  }

  /**
   * Generate a unique scheduled function ID
   */
  private generateId(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  /**
   * Schedule a function to run after a delay
   */
  async runAfter(
    delayMs: number,
    functionPath: string,
    args: unknown
  ): Promise<string> {
    await this.ensureInitialized()

    const id = this.generateId()
    const runAt = Date.now() + delayMs
    const createdAt = Date.now()

    this.sql.exec(
      `INSERT INTO scheduled_functions (id, function_path, args, run_at, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      id,
      functionPath,
      JSON.stringify(args),
      runAt,
      createdAt
    )

    // Set alarm for execution
    await this.scheduleNextAlarm()

    return id
  }

  /**
   * Schedule a function to run at a specific time
   */
  async runAt(
    timestamp: number,
    functionPath: string,
    args: unknown
  ): Promise<string> {
    const delayMs = Math.max(0, timestamp - Date.now())
    return this.runAfter(delayMs, functionPath, args)
  }

  /**
   * Cancel a scheduled function
   */
  async cancel(scheduledId: string): Promise<boolean> {
    await this.ensureInitialized()

    const result = this.sql.exec(
      `UPDATE scheduled_functions
       SET status = 'canceled', completed_at = ?
       WHERE id = ? AND status = 'pending'`,
      Date.now(),
      scheduledId
    )

    return result.rowsWritten > 0
  }

  /**
   * Get a scheduled function by ID
   */
  async get(scheduledId: string): Promise<ScheduledFunction | null> {
    await this.ensureInitialized()

    const results = this.sql.exec(
      `SELECT * FROM scheduled_functions WHERE id = ?`,
      scheduledId
    ).toArray()

    if (results.length === 0 || !results[0]) {
      return null
    }

    const row = results[0]
    return {
      id: row.id as string,
      functionPath: row.function_path as string,
      args: JSON.parse(row.args as string) as unknown,
      runAt: row.run_at as number,
      status: row.status as ScheduledFunction['status'],
      createdAt: row.created_at as number,
      completedAt: row.completed_at as number | undefined,
      error: row.error as string | undefined,
      retries: row.retries as number,
      maxRetries: row.max_retries as number,
    }
  }

  /**
   * List scheduled functions
   */
  async list(
    status?: ScheduledFunction['status'],
    limit = 100
  ): Promise<ScheduledFunction[]> {
    await this.ensureInitialized()

    let sql = `SELECT * FROM scheduled_functions`
    const params: unknown[] = []

    if (status) {
      sql += ` WHERE status = ?`
      params.push(status)
    }

    sql += ` ORDER BY run_at ASC LIMIT ?`
    params.push(limit)

    const results = this.sql.exec(sql, ...params).toArray()

    return results.map(row => ({
      id: row.id as string,
      functionPath: row.function_path as string,
      args: JSON.parse(row.args as string) as unknown,
      runAt: row.run_at as number,
      status: row.status as ScheduledFunction['status'],
      createdAt: row.created_at as number,
      completedAt: row.completed_at as number | undefined,
      error: row.error as string | undefined,
      retries: row.retries as number,
      maxRetries: row.max_retries as number,
    }))
  }

  /**
   * Schedule the next alarm for pending functions
   */
  private async scheduleNextAlarm(): Promise<void> {
    const results = this.sql.exec(
      `SELECT MIN(run_at) as next_run FROM scheduled_functions WHERE status = 'pending'`
    ).toArray()

    if (results.length > 0 && results[0]?.next_run) {
      const nextRun = results[0].next_run as number
      await this.state.storage.setAlarm(nextRun)
    }
  }

  /**
   * Handle alarm - execute due scheduled functions
   */
  async alarm(): Promise<void> {
    await this.ensureInitialized()

    const now = Date.now()

    // Get all pending functions that are due
    const due = this.sql.exec(
      `SELECT * FROM scheduled_functions
       WHERE status = 'pending' AND run_at <= ?
       ORDER BY run_at ASC`,
      now
    ).toArray()

    for (const row of due) {
      const func: ScheduledFunction = {
        id: row.id as string,
        functionPath: row.function_path as string,
        args: JSON.parse(row.args as string) as unknown,
        runAt: row.run_at as number,
        status: 'running',
        createdAt: row.created_at as number,
        retries: row.retries as number,
        maxRetries: row.max_retries as number,
      }

      // Mark as running
      this.sql.exec(
        `UPDATE scheduled_functions SET status = 'running' WHERE id = ?`,
        func.id
      )

      try {
        // Execute the function
        await this.executeFunction(func)

        // Mark as completed
        this.sql.exec(
          `UPDATE scheduled_functions SET status = 'completed', completed_at = ? WHERE id = ?`,
          Date.now(),
          func.id
        )
      } catch (error) {
        const errorMessage = (error as Error).message

        if (func.retries < func.maxRetries) {
          // Retry with exponential backoff
          const backoffMs = Math.pow(2, func.retries) * 1000
          const newRunAt = Date.now() + backoffMs

          this.sql.exec(
            `UPDATE scheduled_functions
             SET status = 'pending', run_at = ?, retries = retries + 1, error = ?
             WHERE id = ?`,
            newRunAt,
            errorMessage,
            func.id
          )
        } else {
          // Mark as failed
          this.sql.exec(
            `UPDATE scheduled_functions
             SET status = 'failed', completed_at = ?, error = ?
             WHERE id = ?`,
            Date.now(),
            errorMessage,
            func.id
          )
        }
      }
    }

    // Schedule next alarm
    await this.scheduleNextAlarm()
  }

  /**
   * Execute a scheduled function
   */
  private async executeFunction(func: ScheduledFunction): Promise<void> {
    // TODO: Actually execute the function via the database/runtime
    // For now, this is a stub that would call the function executor
    console.log(`Executing scheduled function: ${func.functionPath}`, func.args)

    // In the real implementation, we would:
    // 1. Look up the function definition
    // 2. Create the appropriate context
    // 3. Execute the function
    // 4. Handle the result
  }

  /**
   * Handle HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    try {
      await this.ensureInitialized()

      if (request.method === 'POST') {
        const body = await request.json() as {
          operation: string
          functionPath?: string
          args?: unknown
          delayMs?: number
          timestamp?: number
          scheduledId?: string
          status?: ScheduledFunction['status']
          limit?: number
        }

        switch (body.operation) {
          case 'runAfter':
            const afterId = await this.runAfter(
              body.delayMs!,
              body.functionPath!,
              body.args
            )
            return Response.json({ scheduledId: afterId })

          case 'runAt':
            const atId = await this.runAt(
              body.timestamp!,
              body.functionPath!,
              body.args
            )
            return Response.json({ scheduledId: atId })

          case 'cancel':
            const canceled = await this.cancel(body.scheduledId!)
            return Response.json({ canceled })

          case 'get':
            const func = await this.get(body.scheduledId!)
            return Response.json({ scheduledFunction: func })

          case 'list':
            const functions = await this.list(body.status, body.limit)
            return Response.json({ scheduledFunctions: functions })

          default:
            return Response.json({ error: 'Unknown operation' }, { status: 400 })
        }
      }

      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: 500 }
      )
    }
  }
}
