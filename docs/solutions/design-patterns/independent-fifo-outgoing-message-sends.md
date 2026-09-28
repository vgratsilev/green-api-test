---
title: Independent FIFO sends with per-message status reconciliation
date: 2026-09-28
category: design-patterns
module: GREEN-API outgoing message composer
problem_type: design_pattern
component: messaging
severity: medium
applies_when:
  - A composer accepts another draft while a provider request is pending.
  - The provider assigns a message ID after accepting a send.
  - Delivery statuses can arrive before the send response.
tags: [outgoing-messages, fifo-queue, composer, delivery-status]
---

# Independent FIFO sends with per-message status reconciliation

## Context

The chat composer must stay available while a request is pending so a user can prepare the next draft. The provider returns the durable `idMessage` only after a send resolves, and a status notification can arrive before that response. A global send lock prevents independent drafts from progressing. Matching by ID avoids relying on message position or text to choose the bubble.

## Guidance

- Create a temporary local ID for each outgoing bubble and bind each FIFO job to that ID and its text. A retry should continue the failed bubble's lifecycle rather than create a separate message. `enqueueMessage` does this in `ChatWorkspace.tsx:85-95`.
- Drain one component-local queue and await each provider request before starting the next. Keep the composer enabled while jobs wait; represent waiting and active sends as separate message states (`ChatWorkspace.tsx:18, 97-113, 196-200`).
- When a send resolves, replace only its local ID with the returned `idMessage`. Use that provider ID as the correlation key for later delivery statuses (`ChatWorkspace.tsx:110-122`).
- A status may arrive before its send response. Cache unmatched statuses by provider ID while the send queue is active, then consume only the entry matching the returned ID. Bound the cache so unrelated events cannot grow it indefinitely (`ChatWorkspace.tsx:65-82, 114-120, 231-237`).
- Keep retry state on its own bubble. On retry, temporarily use a new local ID; on success replace it with the retry's provider ID, and on failure restore the old ID and failed state. Disable only that bubble's retry control while it is sending (`ChatWorkspace.tsx:85-95, 123-130, 182-212`).
- Capture the draft submitted with each send. Clear the composer only if its current value still matches that snapshot, so text entered while a request is pending remains intact (`ChatWorkspace.tsx:85-95, 110-122`).
- Route form submission and Enter through one trimmed validation path. Preserve Shift+Enter as native multiline input and allow IME composition to finish. Keep the composer's 4,096-character limit in one domain constant used by validation, the textarea, and its hint (`ChatWorkspace.tsx:133-150, 196-200`; `src/domain/chat.ts:23`).
- Render incoming time from the normalized notification timestamp; use local receive time only when the timestamp is absent or invalid (`ChatWorkspace.tsx:56-63`).

## Why This Matters

The temporary ID bridges the interval when the UI knows which send it is performing but the provider has not returned its ID yet. After the response, `idMessage` links that specific bubble to asynchronous delivery events. FIFO ordering keeps outgoing requests predictable, and per-message transitions prevent one failure or retry from changing another message. Snapshot-based clearing protects a newer draft, while the provider timestamp preserves the event's actual time when a backlog is displayed.

## When to Apply

- A UI accepts multiple asynchronous sends without blocking input.
- A remote service assigns IDs after accepting requests.
- Status events may arrive before or after request responses.
- Users need to retry one failed item without disturbing other queued work.

## Examples

Integration scenarios in `src/App.test.tsx:427-457` cover a failed send followed by another draft and a retry scoped to the failed bubble. The scenarios at `src/App.test.tsx:459-567` cover the 4,096-character limit, trimmed payload, keyboard and IME behavior, FIFO order, an early `read` status for the second message, and an incoming backlog timestamp.

The full verification for U4 passed on 2026-09-28: `npm run test` (96 tests), `npm run lint`, and `npm run build`.

## Related

- [Isolate polling runs while preserving receipt order](../logic-errors/polling-run-receipt-ordering.md) covers the separate inbound notification queue.
- [Preserve hidden-number receipts until contact identity is available](../logic-errors/hidden-number-contact-receipts.md) covers inbound identity classification.
