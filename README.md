# convex.do

> Real-Time Database. Edge-Native. Serverless-First. AI-Ready.

Convex charges $25/month for their starter tier and scales to enterprise pricing. They control your infrastructure, your data, and your deployment options. Real-time subscriptions work great - as long as you're on their cloud.

**convex.do** is the open-source alternative. Full Convex compatibility. Runs on your Cloudflare account. Real-time subscriptions via Durable Objects. Deploy in minutes, not sprints.

## AI-Native API

```typescript
import { convex } from 'convex.do'           // Full SDK
import { convex } from 'convex.do/tiny'      // Minimal client
import { convex } from 'convex.do/react'     // React hooks
```

Natural language for real-time apps:

```typescript
import { convex } from 'convex.do'

// Talk to your database like a colleague
const messages = await convex`messages in #general`
const users = await convex`active users online now`
const tasks = await convex`overdue tasks assigned to me`

// Chain like sentences
await convex`new users this week`
  .notify(`Welcome to the team!`)

// Real-time that speaks human
await convex`watch messages in #general`
  .on('new', msg => console.log(msg.text))
  .on('update', msg => console.log('edited:', msg.text))
```

## The Problem

Convex is a great developer experience trapped in a SaaS model:

| What Convex Charges | The Reality |
|---------------------|-------------|
| **Starter** | $25/month (limited) |
| **Pro** | $50/month + usage |
| **Enterprise** | Custom pricing |
| **Vendor Lock-in** | Your data on their cloud |
| **Egress** | They control the costs |
| **Customization** | Limited to their features |

### The SaaS Tax

- Pricing scales with success (you pay more as you grow)
- No self-hosting option
- Data lives on their infrastructure
- Feature velocity controlled by their roadmap
- Real-time subscriptions are their moat

### The React Coupling

Convex works beautifully with React. But:
- Server components need workarounds
- Non-React frameworks are second-class
- The hooks are the API (no escape hatch)
- Testing requires their test harness

## The Solution

**convex.do** gives you Convex's DX on infrastructure you control:

```
Convex Cloud                        convex.do
---------------------------------------------------------------
$25-50+/month                       Your Cloudflare bill (~$5)
Their cloud                         Your Cloudflare account
Vendor lock-in                      MIT licensed
React-first                         Any framework
Their feature velocity              Fork and extend
Subscriptions via their infra       Durable Objects you own
```

## One-Click Deploy

```bash
npx create-dotdo convex
```

Real-time database running on your infrastructure. Convex-compatible API. WebSocket subscriptions out of the box.

```typescript
import { Convex } from 'convex.do'

export default Convex({
  name: 'my-app',
  domain: 'api.my-app.com',
})
```

## Features

### Messages and Chat

```typescript
// Messages just work
const messages = await convex`messages in #general`
const recent = await convex`messages in #general since yesterday`
const unread = await convex`unread messages for @alice`

// Send naturally
await convex`send "Hello team!" to #general`
await convex`send "Meeting in 5" to #engineering`

// Real-time subscriptions
await convex`watch #general`.on('message', msg => {
  console.log(`${msg.author}: ${msg.text}`)
})
```

### Users and Presence

```typescript
// Query users naturally
const alice = await convex`user alice`
const online = await convex`users online now`
const team = await convex`users in engineering team`

// Create users
await convex`create user alice with email alice@example.com`

// Presence is automatic
await convex`watch presence in #general`
  .on('join', user => console.log(`${user.name} joined`))
  .on('leave', user => console.log(`${user.name} left`))
```

### Tasks and Documents

```typescript
// Tasks
const myTasks = await convex`tasks assigned to me`
const overdue = await convex`overdue tasks`
const urgent = await convex`high priority tasks due today`

// Create and update
await convex`create task "Review PR" assigned to @bob due tomorrow`
await convex`complete task-123`
await convex`reassign task-123 to @alice`

// Documents
const docs = await convex`documents in project-x`
const recent = await convex`documents edited this week`
```

### Real-Time Subscriptions

```typescript
// Watch anything
await convex`watch tasks assigned to me`
  .on('new', task => notify(task))
  .on('complete', task => celebrate(task))

// Collaborative editing
await convex`watch document-123`
  .on('edit', delta => applyDelta(delta))

// Presence and typing indicators
await convex`watch typing in #general`
  .on('start', user => showTyping(user))
  .on('stop', user => hideTyping(user))
```

### Mutations

```typescript
// Write data naturally
await convex`add message "Hello" to #general from @alice`
await convex`update user alice set status to "away"`
await convex`delete message-456`

// Batch operations
await convex`
  mark all tasks in sprint-5 as complete
  notify @team "Sprint complete!"
  create celebration in #general
`
```

### Scheduled Jobs

```typescript
// Schedule anything
await convex`run cleanup every day at 3am`
await convex`send reminder to @alice in 30 minutes`
await convex`archive old messages every sunday`

// Check scheduled jobs
const jobs = await convex`scheduled jobs`
await convex`cancel job-789`
```

## Schema Definition

```typescript
// Define your schema naturally
await convex`
  table messages
    text: string
    author: reference to users
    channel: string
    created: timestamp

  table users
    name: string
    email: string
    avatar: url
    status: online | away | offline
`

// Or use TypeScript
import { schema } from 'convex.do'

export default schema({
  messages: {
    text: 'string',
    author: 'users',
    channel: 'string',
  },
  users: {
    name: 'string',
    email: 'string',
  },
})
```

## React Integration

```typescript
import { useConvex, useQuery, useMutation } from 'convex.do/react'

export function Chat({ channel }) {
  // Natural queries in hooks
  const messages = useQuery(convex`messages in ${channel}`)
  const send = useMutation(convex`send message to ${channel}`)

  return (
    <div>
      {messages?.map(msg => (
        <Message key={msg.id} message={msg} />
      ))}
      <Input onSend={text => send`${text}`} />
    </div>
  )
}
```

### Real-Time Hooks

```typescript
// Presence hook
const online = usePresence(convex`users in #general`)

// Typing indicators
const typing = useTyping(convex`typing in #general`)

// Live cursors
const cursors = useCursors(convex`cursors in document-123`)
```

## Actions

```typescript
// Long-running operations
await convex`send welcome email to @alice`
await convex`generate report for Q4`
await convex`sync inventory with shopify`

// Chain actions
await convex`new signup @alice`
  .then(convex`send welcome email`)
  .then(convex`notify sales team`)
```

## File Storage

```typescript
// Upload files naturally
await convex`upload avatar for @alice`
await convex`attach document to task-123`

// Query files
const files = await convex`files uploaded by @alice`
const images = await convex`images in project-x`

// Signed URLs
const url = await convex`download link for file-456`
```

## Architecture

### Durable Object per Database

```
ConvexDO (your-app)
  |
  +-- SQLite: Tables, indexes, subscriptions
  |
  +-- WebSockets: Real-time connections
  |
  +-- Scheduler: Cron jobs, delayed tasks
  |
  +-- R2: File storage
```

### Real-Time Architecture

```
Client                   Edge                    Durable Object
  |                        |                          |
  |-- WebSocket connect -->|                          |
  |                        |-- Upgrade to DO -------->|
  |                        |                          |
  |-- subscribe ---------->|-- Forward -------------->|
  |                        |                          |
  |                        |<-- Push updates ---------|
  |<-- Real-time data -----|                          |
```

### Storage Tiers

| Tier | Storage | Use Case | Latency |
|------|---------|----------|---------|
| **Hot** | SQLite | Active queries, subscriptions | <5ms |
| **Warm** | R2 | File attachments, exports | <50ms |
| **Archive** | R2 Glacier | Old data, compliance | <1s |

## vs Convex Cloud

| Feature | Convex Cloud | convex.do |
|---------|--------------|-----------|
| **Pricing** | $25-50+/month | ~$5/month |
| **Infrastructure** | Their cloud | Your Cloudflare |
| **Real-time** | Yes | Yes (Durable Objects) |
| **React Hooks** | Yes | Yes |
| **TypeScript** | Yes | Yes |
| **Self-hosting** | No | Yes |
| **Custom domains** | Enterprise | Included |
| **Data location** | US only | Global edge |
| **Vendor lock-in** | Yes | MIT licensed |

## Promise Pipelining

Chain operations without waiting:

```typescript
// All in one round trip
const result = await convex`create project "Launch"`
  .then(project => convex`add @alice to ${project}`)
  .then(project => convex`create task "Setup" in ${project}`)
  .then(task => convex`assign ${task} to @alice`)

// Map over results
await convex`overdue tasks`
  .map(task => convex`remind assignee of ${task}`)

// Parallel operations
await convex`all team members`
  .map(member => convex`send weekly digest to ${member}`)
```

## Aggregations

```typescript
// Count, sum, average
const count = await convex`count messages in #general`
const total = await convex`sum revenue this month`
const avg = await convex`average response time`

// Group by
const byChannel = await convex`messages grouped by channel`
const byUser = await convex`tasks completed grouped by assignee`

// Time series
const daily = await convex`signups per day this month`
const hourly = await convex`messages per hour today`
```

## Search

```typescript
// Full-text search
const results = await convex`search messages for "launch date"`
const docs = await convex`search documents containing "quarterly review"`

// Filtered search
const tasks = await convex`search tasks for "bug" assigned to @alice`
```

## Deployment Options

### Cloudflare Workers (Recommended)

```bash
npx create-dotdo convex
wrangler deploy
```

### Docker

```bash
docker run -p 8787:8787 dotdo/convex
```

### Self-Hosted

```bash
git clone https://github.com/dotdo/convex.do
cd convex.do
pnpm install && pnpm build
wrangler deploy
```

## Migration from Convex

```typescript
// Your existing Convex code
import { query, mutation } from 'convex/server'

export const getMessages = query(async ({ db }) => {
  return await db.query('messages').collect()
})

// Works unchanged with convex.do
import { query, mutation } from 'convex.do/server'

export const getMessages = query(async ({ db }) => {
  return await db.query('messages').collect()
})

// Or use natural language
const messages = await convex`all messages`
```

## Roadmap

### Core
- [x] Real-time subscriptions
- [x] Queries and mutations
- [x] Actions (long-running)
- [x] File storage
- [x] Scheduled jobs
- [ ] Transactions
- [ ] Vector search

### React
- [x] useQuery hook
- [x] useMutation hook
- [x] useAction hook
- [x] Real-time updates
- [ ] Suspense support
- [ ] Server components

### Infrastructure
- [x] Durable Objects backend
- [x] SQLite storage
- [x] R2 file storage
- [x] WebSocket subscriptions
- [ ] Multi-region replication
- [ ] Edge caching

## Contributing

convex.do is open source under the MIT license.

```bash
git clone https://github.com/dotdo/convex.do
cd convex.do
pnpm install
pnpm test
```

## License

MIT License - Own your real-time infrastructure.

---

<p align="center">
  <strong>Real-time without the SaaS tax.</strong>
  <br />
  Convex DX. Your infrastructure. MIT licensed.
  <br /><br />
  <a href="https://convex.do">Website</a> |
  <a href="https://docs.convex.do">Docs</a> |
  <a href="https://discord.gg/dotdo">Discord</a> |
  <a href="https://github.com/dotdo/convex.do">GitHub</a>
</p>
