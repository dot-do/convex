# convex.do

A 100% Convex API compatible package running on Cloudflare Workers with Durable Objects.

**convex.do** brings the full power of Convex's real-time database and backend infrastructure to Cloudflare's edge platform. This package provides a drop-in replacement for Convex that runs entirely on Cloudflare Workers, leveraging Durable Objects for persistent state management, real-time synchronization, and scheduled tasks.

## Features

- **100% Convex API Compatible**: Use the same Convex client and server APIs with zero code changes
- **Edge Computing**: Deploy on Cloudflare Workers for ultra-low latency globally
- **Durable Objects**: Leverage Durable Objects for persistent, coordinated state
- **Real-Time Sync**: WebSocket-based subscriptions for real-time updates
- **TypeScript First**: Full TypeScript support with comprehensive type definitions
- **React Integration**: Built-in React hooks for seamless frontend integration
- **Queries, Mutations & Actions**: Support for all Convex operation types
- **Scheduled Tasks**: Integrated scheduler via Durable Objects

## Installation

```bash
npm install convex.do
```

Or with yarn:

```bash
yarn add convex.do
```

### Prerequisites

- Node.js >= 18.0.0
- A Cloudflare account with Workers enabled
- Wrangler CLI for deployment

## Configuration

Create a `wrangler.toml` file in your project root:

```toml
name = "convex-app"
type = "service"
main = "src/index.ts"
compatibility_date = "2024-12-05"

[[durable_objects.bindings]]
name = "CONVEX_DATABASE"
class_name = "ConvexDatabase"

[[durable_objects.bindings]]
name = "CONVEX_SUBSCRIPTION"
class_name = "ConvexSubscription"

[[durable_objects.bindings]]
name = "CONVEX_SCHEDULER"
class_name = "ConvexScheduler"

[[durable_objects.bindings]]
name = "CONVEX_STORAGE"
class_name = "ConvexStorage"

[[r2_buckets]]
name = "STORAGE_BUCKET"
binding = "STORAGE_BUCKET"
```

## Usage Examples

### Server-Side: Defining Queries and Mutations

```typescript
import { defineQuery, defineMutation } from 'convex.do/server'

// Define a query
export const getUsers = defineQuery(async ({ db }, id: string) => {
  return await db.query('users').filter(u => u.id === id).collect()
})

// Define a mutation
export const createUser = defineMutation(async ({ db }, name: string) => {
  const user = { id: crypto.randomUUID(), name, createdAt: new Date() }
  await db.insert('users', user)
  return user
})
```

### Client-Side: Using the Convex Client

```typescript
import { ConvexClient } from 'convex.do/client'

const client = new ConvexClient(import.meta.env.VITE_CONVEX_URL)

// Call a query
const users = await client.query('getUsers', { id: 'user123' })

// Call a mutation
const newUser = await client.mutation('createUser', { name: 'John Doe' })
```

### React Integration

Use the provided React hooks for seamless integration:

```typescript
import { useQuery, useMutation } from 'convex.do/react'

export function UserList() {
  const users = useQuery('getUsers', {})
  const createUser = useMutation('createUser')

  const handleCreate = async (name: string) => {
    await createUser({ name })
  }

  return (
    <div>
      {users?.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
      <button onClick={() => handleCreate('New User')}>
        Add User
      </button>
    </div>
  )
}
```

### Real-Time Synchronization

Subscribe to real-time updates via WebSocket:

```typescript
import { useSubscription } from 'convex.do/sync'

export function LiveUserCount() {
  const count = useSubscription('getUserCount')

  return <div>Active users: {count}</div>
}
```

### Server-Side Actions

Define server-side actions that can run for longer durations:

```typescript
import { defineAction } from 'convex.do/server'

export const sendEmail = defineAction(async ({ db }, userId: string) => {
  const user = await db.query('users').filter(u => u.id === userId).first()

  // Send email via external service
  await fetch('https://api.sendgrid.com/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.SENDGRID_API_KEY}` },
    body: JSON.stringify({ to: user.email, subject: 'Hello!' })
  })

  return { success: true }
})
```

## API Reference

### Server Module (`convex.do/server`)

#### `defineQuery(handler: QueryHandler): QueryDefinition`

Define a query function that reads data from the database.

```typescript
defineQuery(async ({ db, env }, arg1: Type1, arg2: Type2) => {
  // Read-only database operations
  return result
})
```

#### `defineMutation(handler: MutationHandler): MutationDefinition`

Define a mutation function that modifies data in the database.

```typescript
defineMutation(async ({ db, env }, arg1: Type1, arg2: Type2) => {
  // Read-write database operations
  return result
})
```

#### `defineAction(handler: ActionHandler): ActionDefinition`

Define an action function that can call external APIs and run longer operations.

```typescript
defineAction(async ({ db, env }, arg1: Type1, arg2: Type2) => {
  // Long-running operations, external API calls
  return result
})
```

### Client Module (`convex.do/client`)

#### `ConvexClient`

Main client for communicating with the Convex backend.

```typescript
class ConvexClient {
  constructor(url: string)
  query<T>(path: string, args: Record<string, any>): Promise<T>
  mutation<T>(path: string, args: Record<string, any>): Promise<T>
  action<T>(path: string, args: Record<string, any>): Promise<T>
}
```

### React Module (`convex.do/react`)

#### `useQuery<T>(path: string, args?: Record<string, any>): T | undefined`

Hook to call a query and subscribe to real-time updates.

```typescript
const data = useQuery('getUsers', { limit: 10 })
```

#### `useMutation<T>(path: string): (args: Record<string, any>) => Promise<T>`

Hook to call a mutation.

```typescript
const createUser = useMutation('createUser')
await createUser({ name: 'Alice' })
```

#### `useAction<T>(path: string): (args: Record<string, any>) => Promise<T>`

Hook to call an action.

```typescript
const sendEmail = useAction('sendEmail')
await sendEmail({ userId: 'user123' })
```

### Sync Module (`convex.do/sync`)

#### `useSubscription<T>(path: string, args?: Record<string, any>): T | undefined`

Hook for WebSocket-based real-time subscriptions.

```typescript
const liveData = useSubscription('getLiveUsers', { limit: 10 })
```

### Values Module (`convex.do/values`)

Type-safe value definitions for your data:

```typescript
import { v } from 'convex.do/values'

const userSchema = {
  id: v.id('users'),
  name: v.string(),
  email: v.string(),
  createdAt: v.number(),
}
```

## Durable Objects

convex.do uses four primary Durable Objects:

### ConvexDatabase

Manages persistent data storage and retrieval with ACID guarantees.

### ConvexSubscription

Handles WebSocket connections and real-time subscription management.

### ConvexScheduler

Manages scheduled tasks and cron jobs.

### ConvexStorage

Manages file storage and retrieval via Cloudflare R2.

## Development

### Build

```bash
npm run build
```

### Development Server

```bash
npm run dev
```

The development server starts on `http://localhost:8787` and supports hot reloading.

### Testing

Run tests with:

```bash
npm run test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Generate coverage report:

```bash
npm run test:coverage
```

### Linting and Formatting

Lint your code:

```bash
npm run lint
```

Format your code:

```bash
npm run format
```

### Type Checking

Check TypeScript types:

```bash
npm run typecheck
```

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

This will build the project and deploy it to Cloudflare Workers.

## Environment Variables

Set environment variables in your `wrangler.toml`:

```toml
[env.production]
vars = { ENVIRONMENT = "production" }

[env.development]
vars = { ENVIRONMENT = "development" }
```

Access environment variables in your handlers:

```typescript
defineQuery(async ({ env }, arg) => {
  const apiKey = env.API_KEY
})
```

## Comparison with Convex

| Feature | convex.do | Convex |
|---------|-----------|--------|
| Real-time Database | Yes | Yes |
| Queries | Yes | Yes |
| Mutations | Yes | Yes |
| Actions | Yes | Yes |
| React Integration | Yes | Yes |
| TypeScript | Yes | Yes |
| Infrastructure | Cloudflare Workers | Convex Cloud |
| Durable Objects | Yes | N/A |
| Edge Deployment | Yes | No (US-based) |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Links

- [Convex Documentation](https://docs.convex.dev)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)
- [Repository](https://github.com/drivly/convex.do)
