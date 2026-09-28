---
title: Isolate polling runs while preserving receipt order
date: 2026-09-27
last_updated: 2026-09-28
category: logic-errors
module: GREEN-API notification polling
problem_type: logic_error
component: messaging
symptoms:
  - A receive response arriving after effect cleanup could update the chat and start deleting its receipt.
  - A new polling run could issue a receive or delete while the previous run's request was still pending.
  - A resolved delete completed by a stopped run could be repeated by the next run, or a resolved `deleted: false` response could stop polling.
root_cause: concurrency
resolution_type: code_fix
severity: high
tags: [polling, react-effects, abort, receipt-ordering]
---

# Isolate polling runs while preserving receipt order

## Problem

The chat polls the GREEN-API notification queue. React effect cleanup aborts the request, but a client or test transport can still settle its promise later. The old polling run must not deliver that notification to the UI or change the queue state after a new run starts.

## Symptoms

- The old `receiveNotification` response could call `onIncoming` or `onOutgoingStatus` and set the shared pending receipt after cleanup.
- A new run could start another queue request before the old one settled.
- If the old `deleteNotification` settled after cleanup, a naive retry by the new run would delete the same receipt twice. Treating a resolved `deleted: false` response as a transport error could also stop polling even though the delete request completed.

## What Didn't Work

- Aborting the request and clearing the timer in cleanup was insufficient: neither action guarantees that an already-started promise stops or that the transport honors abort.
- Checking `active` only before the request left a gap after each `await`.
- Keeping a bare shared receipt without the outcome of the in-flight delete forced the new run to repeat a delete whose result was already known.

## Solution

In [`useNotificationPolling.ts`](../../../src/features/chat/useNotificationPolling.ts), each run checks `active` after awaiting both receive and delete. It records the outstanding operation in `inFlightRef`. A new run waits for that operation to settle before touching the queue. Any resolved delete result, whether `deleted: true` or `deleted: false`, completes the receipt; a retryable rejected request keeps the receipt for another deletion attempt. After retryable failures exhaust their retries, the user can resume polling. A non-retryable error stops polling in a terminal state and requires returning to the connection flow.

```ts
const previousOperation = inFlightRef.current
if (previousOperation) {
  const deleted = await previousOperation.settled
  if (!active) return
  if (previousOperation.kind === 'delete' && deleted !== undefined
    && pendingReceiptRef.current === previousOperation.receiptId) {
    pendingReceiptRef.current = undefined
  }
}
```

The receive path stores the receipt, then classifies its notification before deletion. The next queue operation deletes that receipt before another receive. Retryable delete failures use 1, 2, and 4 second delays; after retries are exhausted the user can resume polling, while a non-retryable error requires returning to the connection flow. For hidden-number messages whose contact identity is not ready, see [Preserve hidden-number receipts until contact identity is available](hidden-number-contact-receipts.md).

## Why This Works

Only the current effect run performs UI callbacks and receipt updates. The settled-operation record transfers a completed delete's outcome without letting the stopped run mutate shared state. Waiting for the outstanding request prevents overlapping queue requests even when abort is ignored. If a transport never settles an aborted request, the next run waits as well; avoiding parallel queue reads takes priority over automatic progress in that case.

## Prevention

- In [`useNotificationPolling.test.tsx`](../../../src/features/chat/useNotificationPolling.test.tsx), resolve an old receive after cleanup and verify it neither renders nor deletes the receipt while the new run waits for the old request.
- Resolve an old delete after cleanup, including a `deleted: false` result, and verify no second delete occurs. Reject an old delete and verify the same receipt is retried before the next receive.
- Keep the application-level late-notification test in [`App.test.tsx`](../../../src/App.test.tsx) so leaving the chat cannot acknowledge a response delivered afterward.
