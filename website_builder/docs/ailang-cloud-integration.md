# AILANG Cloud Integration — Reference Implementation

This documents how the Website Builder portal integrates with AILANG Cloud
via the coordinator messaging system. **This is the model for future AILANG
Cloud integrations.**

## Architecture

```
Browser (Vue)  →  Sidecar (Express)  →  Coordinator (Go)  →  Agent (Cloud Run Job)
                                                                    ↓
Browser  ←  Sidecar polls inbox  ←  Coordinator inbox  ←  Completion via Pub/Sub
                                                                    ↓
                                                            GitHub Pages (output)
```

## ID Chain & Correlation

The coordinator manages its own IDs. Don't introduce extra IDs — use what exists:

```
Sidecar sends message → Coordinator assigns messageId = "inbox_{ts}_{random}"
                         Coordinator creates task = "task-inbox_{N}"
                         task.MessageID = original messageId
Agent completes        → Pub/Sub completion
Coordinator            → Posts InboxMessage with correlation_id = task.MessageID
Frontend matches       → msg.correlation_id === messageId
```

The sidecar gets `messageId` back from the coordinator when sending. The frontend
stores this and matches completion messages by `msg.correlation_id`. This scales to
concurrent builds — each gets a unique correlation chain.

## Message Flow

### 1. Frontend → Sidecar: `POST /api/build`
- `BuildStep.vue` calls `sendBuild(brief)` via `api.js`
- Brief contains: user, siteName, description, style, content, repoConfig
- Media uploaded separately to staging paths (no base64 in brief)

### 2. Sidecar → Coordinator: `POST /api/messages`
- `sendCoordinatorMessage('website-builder', title, brief)` in `server.js`
- Falls back to `ailang messages send` CLI if `COORDINATOR_URL` not set
- Returns `{ briefId, messageId }` — **`messageId` is the correlation key**

### 3. Coordinator → Agent
- Creates task from message, dispatches to Cloud Run Job
- Agent config: `id: website-builder`, `inbox: website-builder`, `skip_approval: true`

### 4. Agent Execution
- **Agent commits directly to GitHub** (not the sidecar)
- Writes to `sites/{userId}/{siteSlug}/` in the websites repo

### 5. Completion Notification
- Agent publishes completion via Pub/Sub
- Coordinator's `CompletionHandler`:
  - Posts `InboxMessage` to the **agent's own inbox** (`website-builder`)
  - Payload: `{task_id, agent_id, status, branch_name, error_msg}`
  - `correlation_id` = original `messageId`

### 6. Frontend Polling: `GET /api/status`
- Sidecar polls `GET /api/messages?inbox=website-builder&status=unread`
- **Must poll the agent's inbox** (that's where completions land)
- Match: `msg.correlation_id === messageId` or `payload.agent_id === 'website-builder'`
- Status: `payload.status === 'completed'`

### 7. Loading Output
- Fetch from GitHub Pages: `https://{owner}.github.io/{repo}/sites/{userId}/{siteSlug}/`
- Wait up to 120s for Pages deployment

## Common Pitfalls

1. **Wrong inbox**: Completions go to the AGENT's inbox (`website-builder`), not a custom one
2. **Wrong correlation**: Use `messageId` from coordinator, not frontend-generated IDs
3. **Payload format**: `msg.payload` is a JSON string — parse with `JSON.parse()`
4. **Status value**: Coordinator sends `"completed"` (past tense)
5. **Who commits**: Agent commits to GitHub directly; sidecar only commits for WASM path

## Environment Variables (Sidecar)

| Variable | Purpose |
|----------|---------|
| `COORDINATOR_URL` | Coordinator REST API base URL |
| `COORDINATOR_API_KEY` | Bearer token for coordinator API |

## Key Files

| File | Role |
|------|------|
| `portal/src/components/steps/BuildStep.vue` | Build orchestration + polling |
| `portal/src/api.js` | API client |
| `portal/server.js` | Express sidecar, coordinator messaging |
| `ailang-multivac/config/config.cloud.yaml` | Agent config |
