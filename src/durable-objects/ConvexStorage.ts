/**
 * ConvexStorage Durable Object
 *
 * Handles file storage using R2 as the backend.
 */

import type { Env } from '../env'

interface StoredFile {
  storageId: string
  sha256: string
  size: number
  contentType: string | null
  uploadedAt: number
  metadata: Record<string, string>
}

interface UploadUrl {
  uploadUrl: string
  storageId: string
  expiresAt: number
}

export class ConvexStorage implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private files: Map<string, StoredFile> = new Map()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    // Load file metadata from storage
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Map<string, StoredFile>>('files')
      if (stored) {
        this.files = stored
      }
    })
  }

  /**
   * Generate a storage ID
   */
  private generateStorageId(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return 'kg' + btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  /**
   * Generate an upload URL for direct client upload
   */
  async generateUploadUrl(): Promise<UploadUrl> {
    const storageId = this.generateStorageId()
    const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour

    // Store pending upload info
    await this.state.storage.put(`pending:${storageId}`, {
      storageId,
      expiresAt,
    })

    // The upload URL would be to this worker
    const uploadUrl = `/storage/upload/${storageId}`

    return {
      uploadUrl,
      storageId,
      expiresAt,
    }
  }

  /**
   * Store a file
   */
  async store(
    storageId: string,
    data: ArrayBuffer,
    contentType: string | null,
    metadata: Record<string, string> = {}
  ): Promise<StoredFile> {
    // Calculate SHA256
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = new Uint8Array(hashBuffer)
    const sha256 = Array.from(hashArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Store in R2
    await this.env.STORAGE_BUCKET.put(storageId, data, {
      httpMetadata: {
        contentType: contentType || 'application/octet-stream',
      },
      customMetadata: metadata,
    })

    const file: StoredFile = {
      storageId,
      sha256,
      size: data.byteLength,
      contentType,
      uploadedAt: Date.now(),
      metadata,
    }

    // Store metadata
    this.files.set(storageId, file)
    await this.state.storage.put('files', this.files)

    // Clean up pending upload
    await this.state.storage.delete(`pending:${storageId}`)

    return file
  }

  /**
   * Get file metadata
   */
  async getMetadata(storageId: string): Promise<StoredFile | null> {
    return this.files.get(storageId) || null
  }

  /**
   * Get a file URL for downloading
   */
  async getUrl(storageId: string): Promise<string | null> {
    const file = this.files.get(storageId)
    if (!file) return null

    // Return a URL to fetch through this worker
    return `/storage/download/${storageId}`
  }

  /**
   * Get file data
   */
  async getData(storageId: string): Promise<ArrayBuffer | null> {
    const object = await this.env.STORAGE_BUCKET.get(storageId)
    if (!object) return null
    return object.arrayBuffer()
  }

  /**
   * Delete a file
   */
  async delete(storageId: string): Promise<boolean> {
    const existed = this.files.has(storageId)

    if (existed) {
      // Delete from R2
      await this.env.STORAGE_BUCKET.delete(storageId)

      // Delete metadata
      this.files.delete(storageId)
      await this.state.storage.put('files', this.files)
    }

    return existed
  }

  /**
   * List files with optional prefix
   */
  async list(
    options: { limit?: number; cursor?: string } = {}
  ): Promise<{ files: StoredFile[]; cursor?: string }> {
    const limit = options.limit || 100
    const files = Array.from(this.files.values())
      .sort((a, b) => b.uploadedAt - a.uploadedAt)
      .slice(0, limit)

    return { files }
  }

  /**
   * Handle HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      // Handle upload
      if (request.method === 'POST' && path.startsWith('/storage/upload/')) {
        const storageId = path.replace('/storage/upload/', '')

        // Verify pending upload exists
        const pending = await this.state.storage.get(`pending:${storageId}`)
        if (!pending) {
          return Response.json(
            { error: 'Invalid or expired upload URL' },
            { status: 400 }
          )
        }

        const data = await request.arrayBuffer()
        const contentType = request.headers.get('Content-Type')

        const file = await this.store(storageId, data, contentType)
        return Response.json({ file })
      }

      // Handle download
      if (request.method === 'GET' && path.startsWith('/storage/download/')) {
        const storageId = path.replace('/storage/download/', '')

        const file = this.files.get(storageId)
        if (!file) {
          return Response.json({ error: 'File not found' }, { status: 404 })
        }

        const data = await this.getData(storageId)
        if (!data) {
          return Response.json({ error: 'File data not found' }, { status: 404 })
        }

        return new Response(data, {
          headers: {
            'Content-Type': file.contentType || 'application/octet-stream',
            'Content-Length': file.size.toString(),
            'ETag': `"${file.sha256}"`,
          },
        })
      }

      // Handle API operations
      if (request.method === 'POST') {
        const body = await request.json() as {
          operation: string
          storageId?: string
          limit?: number
          cursor?: string
        }

        switch (body.operation) {
          case 'generateUploadUrl':
            const uploadUrl = await this.generateUploadUrl()
            return Response.json(uploadUrl)

          case 'getMetadata':
            const metadata = await this.getMetadata(body.storageId!)
            return Response.json({ file: metadata })

          case 'getUrl':
            const fileUrl = await this.getUrl(body.storageId!)
            return Response.json({ url: fileUrl })

          case 'delete':
            const deleted = await this.delete(body.storageId!)
            return Response.json({ deleted })

          case 'list':
            const result = await this.list({
              ...(body.limit !== undefined && { limit: body.limit }),
              ...(body.cursor !== undefined && { cursor: body.cursor }),
            })
            return Response.json(result)

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
