/**
 * WebSocket Upgrade Handler for Cloudflare Workers
 *
 * Handles WebSocket upgrade requests for the /sync endpoint,
 * validating headers and forwarding to the appropriate Durable Object.
 *
 * Issue: convex-ws-upgrade-green
 * Phase: GREEN - Implement functionality
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Environment interface for Cloudflare Workers with Durable Objects
 */
interface WorkerEnv {
  CONVEX_DATABASE: DurableObjectNamespace
  CONVEX_SUBSCRIPTION: DurableObjectNamespace
}

interface DurableObjectNamespace {
  idFromName: (name: string) => DurableObjectId
  get: (id: DurableObjectId) => DurableObjectStub
}

interface DurableObjectId {
  toString: () => string
}

interface DurableObjectStub {
  fetch: (request: Request) => Promise<Response>
}

/**
 * Options for the SyncUpgradeHandler
 */
export interface SyncUpgradeHandlerOptions {
  /** List of supported WebSocket sub-protocols */
  supportedProtocols?: string[]
}

// ============================================================================
// Constants
// ============================================================================

/**
 * WebSocket GUID used for computing Sec-WebSocket-Accept
 * As defined in RFC 6455
 */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/**
 * Default supported protocols
 */
const DEFAULT_SUPPORTED_PROTOCOLS = ['convex-sync-v1', 'convex-sync-v2']

// ============================================================================
// SyncUpgradeHandler Class
// ============================================================================

/**
 * Handler for WebSocket upgrade requests
 *
 * Validates upgrade requests and creates appropriate responses
 * for the Cloudflare Workers environment.
 */
export class SyncUpgradeHandler {
  private supportedProtocols: string[]

  constructor(options: SyncUpgradeHandlerOptions = {}) {
    this.supportedProtocols = options.supportedProtocols ?? DEFAULT_SUPPORTED_PROTOCOLS
  }

  /**
   * Handle a WebSocket upgrade request
   */
  async handle(request: Request, env: WorkerEnv): Promise<Response> {
    return handleSyncUpgrade(request, env)
  }

  /**
   * Validates whether a request is a valid WebSocket upgrade request
   */
  isValidUpgradeRequest(request: Request): boolean {
    const upgrade = request.headers.get('Upgrade')
    return upgrade?.toLowerCase() === 'websocket'
  }

  /**
   * Computes the Sec-WebSocket-Accept value for a given key
   *
   * The accept value is computed as:
   * base64(SHA-1(key + WS_GUID))
   */
  computeAcceptKey(key: string): string {
    return computeWebSocketAccept(key)
  }

  /**
   * Parses the Sec-WebSocket-Protocol header into an array of protocols
   */
  parseProtocols(header: string): string[] {
    return header.split(',').map((p) => p.trim()).filter(Boolean)
  }

  /**
   * Selects the first supported protocol from a list of requested protocols
   */
  selectProtocol(requestedProtocols: string[]): string | null {
    for (const protocol of requestedProtocols) {
      if (this.supportedProtocols.includes(protocol)) {
        return protocol
      }
    }
    return null
  }

  /**
   * Creates response headers for a WebSocket upgrade response
   */
  createResponseHeaders(request: Request): Headers {
    const key = request.headers.get('Sec-WebSocket-Key') ?? ''
    const protocolHeader = request.headers.get('Sec-WebSocket-Protocol')

    const headers = new Headers({
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Accept': this.computeAcceptKey(key),
    })

    if (protocolHeader) {
      const requestedProtocols = this.parseProtocols(protocolHeader)
      const selectedProtocol = this.selectProtocol(requestedProtocols)
      if (selectedProtocol) {
        headers.set('Sec-WebSocket-Protocol', selectedProtocol)
      }
    }

    return headers
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Computes the Sec-WebSocket-Accept value
 *
 * Uses the Web Crypto API (available in Cloudflare Workers)
 */
function computeWebSocketAccept(key: string): string {
  // Use synchronous SHA-1 computation for the WebSocket accept key
  // This is a simplified implementation that works in the test environment
  const data = key + WS_GUID

  // Use a synchronous approach - compute SHA-1 using the synchronous interface
  // In Cloudflare Workers, we'd use crypto.subtle, but for testing we need sync
  const hash = sha1(data)
  return btoa(String.fromCharCode(...hash))
}

/**
 * Simple SHA-1 implementation for synchronous computation
 * Based on the SHA-1 specification (FIPS 180-4)
 */
function sha1(message: string): Uint8Array {
  // Convert string to bytes
  const msgBytes = new TextEncoder().encode(message)

  // Initialize hash values
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  // Pre-processing: adding padding bits
  const msgLen = msgBytes.length
  const bitLen = msgLen * 8

  // Message length in bits, as 64-bit big-endian
  const padded = new Uint8Array(Math.ceil((msgLen + 9) / 64) * 64)
  padded.set(msgBytes)
  padded[msgLen] = 0x80

  // Append length as 64-bit big-endian
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 4, bitLen, false)

  // Process each 512-bit chunk
  for (let i = 0; i < padded.length; i += 64) {
    const w = new Uint32Array(80)

    // Break chunk into sixteen 32-bit big-endian words
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false)
    }

    // Extend the sixteen 32-bit words into eighty 32-bit words
    for (let j = 16; j < 80; j++) {
      w[j] = rotateLeft(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1)
    }

    // Initialize working variables
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    // Main loop
    for (let j = 0; j < 80; j++) {
      let f: number
      let k: number

      if (j < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (j < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }

      const temp = (rotateLeft(a, 5) + f + e + k + w[j]) >>> 0
      e = d
      d = c
      c = rotateLeft(b, 30)
      b = a
      a = temp
    }

    // Add this chunk's hash to result
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  // Produce the final hash value (160 bits = 20 bytes)
  const result = new Uint8Array(20)
  const resultView = new DataView(result.buffer)
  resultView.setUint32(0, h0, false)
  resultView.setUint32(4, h1, false)
  resultView.setUint32(8, h2, false)
  resultView.setUint32(12, h3, false)
  resultView.setUint32(16, h4, false)

  return result
}

/**
 * Rotate left (circular left shift) operation
 */
function rotateLeft(n: number, bits: number): number {
  return ((n << bits) | (n >>> (32 - bits))) >>> 0
}

/**
 * Validates a Sec-WebSocket-Key header value
 *
 * The key must be a base64-encoded 16-byte value
 */
function isValidWebSocketKey(key: string | null): boolean {
  if (!key) return false

  // The key should be base64 encoded 16 bytes = 24 characters (with padding)
  // or 22 characters without padding
  try {
    const decoded = atob(key)
    return decoded.length === 16
  } catch {
    return false
  }
}

/**
 * Creates a JSON error response
 */
function errorResponse(status: number, message: string, headers?: HeadersInit): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  )
}

/**
 * Generates a unique client ID
 */
function generateClientId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ============================================================================
// Main Handler Function
// ============================================================================

/**
 * Handles WebSocket upgrade requests for the /sync endpoint
 *
 * Validates the request, creates a WebSocket pair, and forwards
 * the connection to the appropriate Durable Object.
 */
export async function handleSyncUpgrade(request: Request, env: WorkerEnv): Promise<Response> {
  // Check HTTP method
  if (request.method !== 'GET') {
    return errorResponse(405, 'Method not allowed')
  }

  // Check Upgrade header
  const upgrade = request.headers.get('Upgrade')
  if (!upgrade) {
    return errorResponse(400, 'Missing Upgrade header')
  }
  if (upgrade.toLowerCase() !== 'websocket') {
    return errorResponse(400, 'Invalid Upgrade header')
  }

  // Check Sec-WebSocket-Key
  const key = request.headers.get('Sec-WebSocket-Key')
  if (!isValidWebSocketKey(key)) {
    return errorResponse(400, 'Missing or invalid Sec-WebSocket-Key')
  }

  // Check Sec-WebSocket-Version
  const version = request.headers.get('Sec-WebSocket-Version')
  if (version && version !== '13') {
    return errorResponse(426, 'Unsupported WebSocket version', {
      'Sec-WebSocket-Version': '13',
    })
  }

  // Extract client ID from query params or generate one
  const url = new URL(request.url)
  const clientId = url.searchParams.get('clientId') ?? generateClientId()

  // Get the Durable Object for this client
  const subscriptionId = env.CONVEX_SUBSCRIPTION.idFromName(clientId)
  const subscriptionStub = env.CONVEX_SUBSCRIPTION.get(subscriptionId)

  // Forward the upgrade request to the Durable Object
  try {
    // Create a new request to forward to the DO
    const forwardUrl = new URL(request.url)
    forwardUrl.searchParams.set('clientId', clientId)

    const forwardRequest = new Request(forwardUrl.toString(), {
      method: 'GET',
      headers: request.headers,
    })

    const response = await subscriptionStub.fetch(forwardRequest)

    // Check for authentication/authorization errors
    if (response.status === 401) {
      return errorResponse(401, 'Invalid authentication token')
    }
    if (response.status === 403) {
      return errorResponse(403, 'Token expired')
    }
    if (response.status === 500) {
      return errorResponse(500, 'Internal server error')
    }

    // If the DO returned a WebSocket upgrade response, return it
    if (response.status === 101) {
      return response
    }

    // Handle other error responses
    return response
  } catch (error) {
    // Durable Object connection failure
    return errorResponse(503, 'Service unavailable')
  }
}
