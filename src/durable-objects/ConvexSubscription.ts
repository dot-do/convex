/**
 * ConvexSubscription Durable Object
 *
 * Manages real-time subscriptions and WebSocket connections.
 * Handles subscription tracking and change notifications.
 */

import type { Env } from '../env'

interface Subscription {
  clientId: string
  queryPath: string
  args: unknown
  lastResult: unknown
  lastTimestamp: number
}

interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'authenticate' | 'ping'
  subscriptionId?: string
  queryPath?: string
  args?: unknown
  token?: string
}

export class ConvexSubscription implements DurableObject {
  private state: DurableObjectState
  protected env: Env
  private subscriptions: Map<string, Subscription> = new Map()
  private clientSubscriptions: Map<string, Set<string>> = new Map()
  private authenticatedClients: Map<string, string> = new Map() // clientId -> token

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    // Restore subscriptions from storage on startup
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Map<string, Subscription>>('subscriptions')
      if (stored) {
        this.subscriptions = stored
        // Rebuild client subscriptions index
        for (const [subId, sub] of this.subscriptions) {
          if (!this.clientSubscriptions.has(sub.clientId)) {
            this.clientSubscriptions.set(sub.clientId, new Set())
          }
          this.clientSubscriptions.get(sub.clientId)!.add(subId)
        }
      }
    })
  }

  /**
   * Generate a subscription ID
   */
  private generateSubscriptionId(clientId: string, queryPath: string, args: unknown): string {
    const argsHash = this.hashArgs(args)
    return `${clientId}:${queryPath}:${argsHash}`
  }

  /**
   * Hash args for subscription deduplication
   */
  private hashArgs(args: unknown): string {
    const str = JSON.stringify(args)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString(36)
  }

  /**
   * Subscribe to a query
   */
  async subscribe(
    clientId: string,
    queryPath: string,
    args: unknown
  ): Promise<string> {
    const subscriptionId = this.generateSubscriptionId(clientId, queryPath, args)

    const subscription: Subscription = {
      clientId,
      queryPath,
      args,
      lastResult: null,
      lastTimestamp: 0,
    }

    this.subscriptions.set(subscriptionId, subscription)

    // Track by client
    if (!this.clientSubscriptions.has(clientId)) {
      this.clientSubscriptions.set(clientId, new Set())
    }
    this.clientSubscriptions.get(clientId)!.add(subscriptionId)

    // Persist
    await this.state.storage.put('subscriptions', this.subscriptions)

    return subscriptionId
  }

  /**
   * Unsubscribe from a query
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId)
    if (!subscription) return

    this.subscriptions.delete(subscriptionId)

    // Remove from client index
    const clientSubs = this.clientSubscriptions.get(subscription.clientId)
    if (clientSubs) {
      clientSubs.delete(subscriptionId)
      if (clientSubs.size === 0) {
        this.clientSubscriptions.delete(subscription.clientId)
      }
    }

    // Persist
    await this.state.storage.put('subscriptions', this.subscriptions)
  }

  /**
   * Unsubscribe all subscriptions for a client
   */
  async unsubscribeClient(clientId: string): Promise<void> {
    const clientSubs = this.clientSubscriptions.get(clientId)
    if (!clientSubs) return

    for (const subId of clientSubs) {
      this.subscriptions.delete(subId)
    }

    this.clientSubscriptions.delete(clientId)

    // Persist
    await this.state.storage.put('subscriptions', this.subscriptions)
  }

  /**
   * Update the result of a subscription (after query re-execution)
   */
  async updateSubscriptionResult(
    subscriptionId: string,
    result: unknown
  ): Promise<boolean> {
    const subscription = this.subscriptions.get(subscriptionId)
    if (!subscription) return false

    const resultStr = JSON.stringify(result)
    const lastResultStr = JSON.stringify(subscription.lastResult)

    // Check if result changed
    if (resultStr !== lastResultStr) {
      subscription.lastResult = result
      subscription.lastTimestamp = Date.now()
      await this.state.storage.put('subscriptions', this.subscriptions)
      return true // Changed
    }

    return false // No change
  }

  /**
   * Get subscriptions that might be affected by a table change
   */
  getAffectedSubscriptions(tableName: string): Subscription[] {
    const affected: Subscription[] = []

    for (const subscription of this.subscriptions.values()) {
      // Simple heuristic: check if query path references the table
      // In a full implementation, we'd parse the query to determine affected tables
      if (this.queryMightTouchTable(subscription.queryPath, tableName)) {
        affected.push(subscription)
      }
    }

    return affected
  }

  /**
   * Check if a query might touch a specific table
   */
  private queryMightTouchTable(queryPath: string, tableName: string): boolean {
    // Simple heuristic: query path like "messages:list" touches "messages" table
    // In practice, we'd need more sophisticated analysis
    const parts = queryPath.split(':')
    return parts[0] === tableName || queryPath.includes(tableName)
  }

  /**
   * Handle WebSocket connections
   */
  async fetch(request: Request): Promise<Response> {
    new URL(request.url)  // validate URL

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = [pair[0], pair[1]]

      // Accept the WebSocket
      this.state.acceptWebSocket(server)

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    // HTTP API for subscription management
    if (request.method === 'POST') {
      const body = await request.json() as {
        operation: string
        clientId?: string
        subscriptionId?: string
        queryPath?: string
        args?: unknown
        result?: unknown
        tableName?: string
      }

      switch (body.operation) {
        case 'subscribe':
          const subId = await this.subscribe(
            body.clientId!,
            body.queryPath!,
            body.args
          )
          return Response.json({ subscriptionId: subId })

        case 'unsubscribe':
          await this.unsubscribe(body.subscriptionId!)
          return Response.json({ success: true })

        case 'unsubscribeClient':
          await this.unsubscribeClient(body.clientId!)
          return Response.json({ success: true })

        case 'updateResult':
          const changed = await this.updateSubscriptionResult(
            body.subscriptionId!,
            body.result
          )
          return Response.json({ changed })

        case 'getAffected':
          const affected = this.getAffectedSubscriptions(body.tableName!)
          return Response.json({ subscriptions: affected })

        default:
          return Response.json({ error: 'Unknown operation' }, { status: 400 })
      }
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  /**
   * Handle incoming WebSocket messages
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      ws.send(JSON.stringify({ error: 'Binary messages not supported' }))
      return
    }

    try {
      const msg = JSON.parse(message) as WebSocketMessage

      switch (msg.type) {
        case 'subscribe':
          const subId = await this.subscribe(
            this.getClientId(ws),
            msg.queryPath!,
            msg.args
          )
          ws.send(JSON.stringify({
            type: 'subscribed',
            subscriptionId: subId,
          }))
          break

        case 'unsubscribe':
          await this.unsubscribe(msg.subscriptionId!)
          ws.send(JSON.stringify({
            type: 'unsubscribed',
            subscriptionId: msg.subscriptionId,
          }))
          break

        case 'authenticate':
          this.authenticatedClients.set(this.getClientId(ws), msg.token!)
          ws.send(JSON.stringify({ type: 'authenticated' }))
          break

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }))
          break

        default:
          ws.send(JSON.stringify({ error: `Unknown message type: ${msg.type}` }))
      }
    } catch (error) {
      ws.send(JSON.stringify({ error: (error as Error).message }))
    }
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    const clientId = this.getClientId(ws)
    await this.unsubscribeClient(clientId)
    this.authenticatedClients.delete(clientId)
  }

  /**
   * Get client ID for a WebSocket
   */
  private getClientId(ws: WebSocket): string {
    // Use WebSocket's attachment to store client ID
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = this.state as any
    const attachment = state.getWebSocketAttachment?.(ws) as { clientId?: string } | undefined
    if (attachment?.clientId) {
      return attachment.clientId
    }

    // Generate new client ID
    const clientId = crypto.randomUUID()
    state.setWebSocketAttachment?.(ws, { clientId })
    return clientId
  }

  /**
   * Broadcast update to subscribed clients
   */
  async broadcastUpdate(subscriptionId: string, data: unknown): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId)
    if (!subscription) return

    const message = JSON.stringify({
      type: 'update',
      subscriptionId,
      data,
    })

    // Send to all WebSockets for this client
    for (const ws of this.state.getWebSockets()) {
      const clientId = this.getClientId(ws)
      if (clientId === subscription.clientId) {
        try {
          ws.send(message)
        } catch {
          // WebSocket might be closed
        }
      }
    }
  }
}
