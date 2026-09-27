---
title: Isolate polling runs while preserving receipt order
date: 2026-09-27
category: logic-errors
module: Telegram notification polling
problem_type: logic_error
component: messaging
symptoms:
  - A receive response arriving after effect cleanup could update the chat and start deleting its receipt.
  - A new polling run could issue a receive or delete while the previous run's request was still pending.
  - A successful delete completed by a stopped run could be repeated by the next run.
root_cause: concurrency
resolution_type: code_fix
severity: high
tags: [polling, react-effects, abort, receipt-ordering]
---

# Isolate polling runs while preserving receipt order

## Problem

The chat polls a Telegram notification queue. React effect cleanup aborts the request, but a client or test transport can still settle its promise later. The old polling run must not deliver that notification to the UI or change the queue state after a new run starts.

## Symptoms

- The old `receiveNotification` response could call `onIncoming` or `onOutgoingStatus` and set the shared pending receipt after cleanup.
- A new run could start another queue request before the old one settled.
- If the old `deleteNotification` succeeded after cleanup, a naive retry by the new run would delete the same receipt twice. Depending on the API response, that could stop polling even though the notification was already acknowledged.

## What Didn't Work

- Aborting the request and clearing the timer in cleanup was insufficient: neither action guarantees that an already-started promise stops or that the transport honors abort.
- Checking `active` only before the request left a gap after each `await`.
- Keeping a bare shared receipt without the outcome of the in-flight delete forced the new run to repeat a delete whose result was already known.

## Solution

In [`useNotificationPolling.ts`](../../../src/features/chat/useNotificationPolling.ts), each run checks `active` after awaiting both receive and delete. It records the outstanding operation in `inFlightRef`. A new run waits for that operation to settle before touching the queue. For a completed delete, the new run clears the matching pending receipt only when the delete returned success; after an error it keeps the receipt and retries its deletion before receiving again.

```ts
const previousOperation = inFlightRef.current
if (previousOperation) {
  const deleted = await previousOperation.settled
  if (!active) return
  if (previousOperation.kind === 'delete' && deleted === true
    && pendingReceiptRef.current === previousOperation.receiptId) {
    pendingReceiptRef.current = undefined
  }
}
```

The receive path classifies a valid notification before storing its receipt. The next operation deletes that receipt before another receive. The existing 1, 2, and 4 second retry delays and manual continuation after exhausted delete retries remain in place.

## Why This Works

Only the current effect run performs UI callbacks and receipt updates. The settled-operation record transfers a completed delete's outcome without letting the stopped run mutate shared state. Waiting for the outstanding request prevents overlapping queue requests even when abort is ignored. If a transport never settles an aborted request, the next run waits as well; avoiding parallel queue reads takes priority over automatic progress in that case.

## Prevention

- In [`useNotificationPolling.test.tsx`](../../../src/features/chat/useNotificationPolling.test.tsx), resolve an old receive after cleanup and verify it neither renders nor deletes the receipt while the new run waits for the old request.
- Resolve and reject an old delete after cleanup. On success, verify no second delete occurs; on failure, verify the same receipt is deleted before the next receive.
- Keep the application-level late-notification test in [`App.test.tsx`](../../../src/App.test.tsx) so leaving the chat cannot acknowledge a response delivered afterward.
