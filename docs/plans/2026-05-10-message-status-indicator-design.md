# Message status indicator — design

**Date:** 2026-05-10
**Scope:** Web client. UI/UX feature that surfaces the send-lifecycle of an
outgoing DM (sending → sent → failed) next to each own message's timestamp,
with an inline retry affordance for failures.

## Why

The first-message bootstrap (`ensureGroupExists` → `claim` KP → `postCommit`
→ `postWelcome` → `mergePendingCommit` → `encryptOutbound` → `POST /api/dm`)
can take several hundred ms. Today the user sees no feedback during that
window — the optimistic message is pushed only after the REST round-trip
returns, so for new conversations Bob's message appears on Bob's screen
around the same moment Alice's screen receives it.

The optimistic-push refactor (prior turn) ensures the message renders
instantly when Enter is pressed. This design layers a small status icon on
top of that foundation so the user can tell whether the message has
actually landed on the server, and offers a one-click retry when it
hasn't.

This is the first slice of a deeper "delivery state" feature; `delivered`
and `read` are tracked on the Phase 6 plan and deliberately out of scope.

## Data model

`Message` (`web-client/src/lib/types.ts`) gains two optional fields:

```ts
interface Message {
  // ...existing fields...

  /** Send lifecycle for own messages. Absent → indicator hidden. */
  status?: "sending" | "sent" | "failed"

  /** ISO instant of the last `status` change. Used by `MessageStatus`
   *  to fade the "sent" check out ~3s after it lands without needing a
   *  separate clear-status action. */
  statusAt?: string
}
```

Both are persisted alongside `dmMessages` (already in the Zustand
`partialize` list). After reload, the timestamp comparison naturally
falls outside the 3-second fade window, so old "sent" check icons stay
hidden. `failed` messages keep their ⚠ on reload because the fade rule
only applies to `"sent"`.

A non-persisted **send-intent map** lives on the conversation viewmodel
as a `useRef`:

```ts
const pendingIntentsRef = useRef<Map<string, {
  content: string
  attachmentIds: string[]
  attachmentKeys: AttachmentBlobKey[]
  replyTo: { id: string; content: string; author: string } | null
}>>(new Map())
```

Populated when `sendMessage` runs, deleted on either terminal outcome
(`sent` or a successful retry). Session-only by design — survives no
reloads.

## State transitions

All transitions are keyed by the **optimistic id** (`crypto.randomUUID()`
generated before any network work).

```
[user hits send]
   │
   ▼
pushDmMessage(optimisticKey, { id: optimisticId, status: "sending", statusAt: now })
pendingIntentsRef.set(optimisticId, intent)
   │
   │  ensureGroupExists → encryptOutbound → POST /api/dm
   ▼
 ┌─────────────────────────┐    ┌──────────────────────────┐
 │ REST returns 201        │    │ any await above throws   │
 ▼                              ▼
 reconcileDmMessage(            updateDmMessage(
   optimisticKey,                 optimisticKey,
   optimisticId,                  optimisticId,
   { id: dm.id,                   { status: "failed",
     status: "sent",                statusAt: now })
     statusAt: now })             // intent stays in the ref for retry
 pendingIntentsRef.delete(
   optimisticId)
```

Retry:

```
[user clicks retry]
   │
   ▼
intent = pendingIntentsRef.get(optimisticId)   // disabled if absent
updateDmMessage(optimisticKey, optimisticId, { status: "sending", statusAt: now })
   │
   │  ensureGroupExists → encryptOutbound → POST /api/dm
   ▼
 (same two branches as the original send)
```

`ensureGroupExists` is idempotent — second invocation short-circuits.

WS-shortcut path (regular text, non-first message): same shape; the
existing `reconcileDmMessage` call in the WS `new_dm` `isOwnEcho` branch
of `useIdpWebSocket.ts` includes `status: "sent"` in the reconciled body.
A new `catch` around `sendDmWsUseCase` flips to `"failed"` (currently the
catch silently swallows).

### New store action

`updateDmMessage(conversationKey: string, messageId: string, patch: Partial<Message>)`
— small partial-update helper added to the WS slice. None of the existing
actions (`pushDmMessage`, `reconcileDmMessage`, `updateDmConversation`)
quite fit "flip a field by id without rebuilding the whole row" cleanly.

## Rendering

In `MessageItem.tsx`, between the timestamp and the (edited) marker, add a
conditional render scoped to own messages:

```tsx
<div className="flex items-baseline gap-2">
  <span className="font-semibold text-primary">{message.author}</span>
  <span className="text-xs text-muted-foreground">{message.timestamp}</span>
  {vm.isOwn && (
    <MessageStatus
      status={message.status}
      statusAt={message.statusAt}
      canRetry={vm.canRetry}
      onRetry={vm.retrySend}
    />
  )}
</div>
```

A new molecule `presentation/molecules/MessageStatus/MessageStatus.tsx`:

| `status`     | render                                                         |
|--------------|----------------------------------------------------------------|
| `"sending"`  | `<Clock />` (muted)                                            |
| `"sent"`     | `<Check />` (muted), hidden once `now() - statusAt > 3000ms`   |
| `"failed"`   | `<AlertCircle />` (destructive) + `<IconButton><RotateCw /></IconButton>` |
| undefined    | `null`                                                         |

Icons from `lucide-react`, matching the rest of `MessageItem`. The
3-second fade uses a `useEffect` that schedules one `setTimeout` to force
a re-render at `statusAt + 3000` — no interval polling, no global animation
frame. The render reads `Date.now() - new Date(statusAt).getTime()` and
returns `null` past the window. On reload, the elapsed time is already
past 3 s so the timeout fires immediately and the icon never appears.

Accessibility: each icon gets an `aria-label` (`"Sending"`, `"Sent"`,
`"Failed to send"`); retry button gets `aria-label="Retry sending"`. The
status block is wrapped in `role="status" aria-live="polite"` so screen
readers announce transitions without being noisy.

### Viewmodel changes

`MessageItem.viewmodel.ts` gains:

- `canRetry: boolean` — `message.status === "failed" && hasPendingIntent(message.id)`. The viewmodel reads `hasPendingIntent` via a new prop callback from `ConversationPage`.
- `retrySend()` — calls the `ConversationPage` viewmodel's `retrySend(optimisticId)` callback, passed through as a prop alongside `onReply`.

`ConversationPage.viewmodel.ts` gains:

- `pendingIntentsRef` (described above).
- `retrySend(optimisticId)` function — looks up the intent, flips status to `"sending"`, runs the network chain, reconciles or re-flips to `"failed"`.
- `hasPendingIntent(id)` predicate.

## Edge cases addressed

1. **WS echo races REST response** — both paths use the same `optimisticId`. REST 201 wins, reconciles forward; WS echo's `isOwn` short-circuit doesn't touch the store. No race.
2. **REST errors after server persisted it** (network blip after success) — when the WS `new_dm` arrives with `isOwn === true` and the existing entry is `"failed"`, the WS `isOwnEcho` path reconciles forward to `"sent"`. Works on the WS-shortcut path because `client_id` is propagated; **does not work** on REST-sent messages until `client_id` lands on `POST /api/dm` (Phase 6 follow-up).
3. **Concurrent retries / double-click** — retry button isn't rendered while `status === "sending"`, natural guard.
4. **Send-intent leaks** — `pendingIntentsRef` is scoped to the ConversationPage mount; unmount GC's it.
5. **Encrypt failure vs network failure** — wrap the entire post-optimistic body in a single `try/catch` that flips to `"failed"` on any error; per-step `console.warn` preserved inside the catch.

## Edge cases explicitly out of scope

- **Reload while `"sending"`** — message stays at `"sending"` forever with no retry available. Cosmetic gap, deferred.
- **`delivered` / `read` states** — separate phase, requires server-side
  delivery acks (cross-IdP makes this fuzzy) and read-receipt WS events.
  Tracked on the Phase 6 plan.
- **`client_id` propagation through `POST /api/dm`** — already on the
  Phase 6 plan; required for the edge case (2) recovery on the REST path.

## Testing

- **Unit** for `MessageStatus`: status → icon mapping; fade-window math
  (returns `null` past 3 s, renders within); retry button disabled when
  `canRetry === false`; aria attributes present.
- **Viewmodel** test for `ConversationPage.sendMessage`: stub the
  IoC ports, assert optimistic push → sending status → reconcile sets
  `"sent"` + correct id swap; failure path flips to `"failed"` and
  preserves the intent in the ref.
- No integration test for the WS race — non-deterministic, not worth
  the setup. Existing `e2ee-integration.spec.ts` covers the happy path.

## File touch list

```
web-client/src/lib/types.ts                                          # +status, +statusAt
web-client/src/store/slices/ws.slice.ts                              # +updateDmMessage
web-client/src/presentation/molecules/MessageStatus/
    MessageStatus.tsx                                                # new
    MessageStatus.viewmodel.ts                                       # optional, only if fade timer growns
web-client/src/presentation/pages/conversation/
    ConversationPage.viewmodel.ts                                    # +pendingIntentsRef, +retrySend, +hasPendingIntent
    ConversationPage.tsx                                             # pass retrySend + hasPendingIntent → MessageItem
web-client/src/presentation/organisms/MessageItem/
    MessageItem.tsx                                                  # +MessageStatus render block
    MessageItem.viewmodel.ts                                         # +canRetry, +retrySend
web-client/src/presentation/hooks/useIdpWebSocket.ts                 # add status:"sent" to reconciled body; failed-→sent recovery on isOwn echo
web-client/test/                                                     # MessageStatus.spec.ts (+ viewmodel test)
```
