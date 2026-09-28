---
title: Preserve hidden-number receipts until contact identity is available
date: 2026-09-28
category: logic-errors
module: GREEN-API notification polling
problem_type: logic_error
component: messaging
symptoms:
  - A valid notification from a hidden-number sender could be acknowledged before its contact identity was known.
  - A temporary contact lookup failure could leave the receipt waiting without a retry path.
  - Deferring malformed hidden-number notifications could block the rest of the queue.
  - Retrying deletion after delivery could display the same message more than once.
root_cause: concurrency
resolution_type: code_fix
severity: high
tags: [polling, hidden-number, receipt-ordering, contact-lookup]
---

# Preserve hidden-number receipts until contact identity is available

## Problem

An incoming GREEN-API notification can have `senderPhoneNumber: "0"`, so the active recipient cannot be inferred from the sender phone number. The chat must wait for contact lookup and compare the notification's `chatId` with the resolved contact. A valid receipt that arrives before identity is available must remain pending until that comparison can be made.

This is a separate classification concern from [polling run serialization](polling-run-receipt-ordering.md), which protects queue operations across effect cleanup and restarts.

## Symptoms

- A matching hidden-number reply could be acknowledged before lookup completed, losing a message that should appear in the chat.
- Deferring every hidden-number notification could leave malformed records or records without `chatId` unacknowledged and block later queue items.
- A failed contact lookup could leave a valid receipt pending with no way to reclassify it after the user retries.
- A failed delete after the message callback could call that callback again when the same receipt was retried.

## What Didn't Work

Acknowledging a hidden-number record immediately discards it before its `chatId` can be compared with the contact lookup. Deferring all such records is too broad: malformed notifications and records without `chatId` cannot pass the identity check. Treating a resolved `{ deleted: false }` response as a transport failure can stop queue processing even though the delete request settled.

## Solution

In [`useNotificationPolling.ts`](../../../src/features/chat/useNotificationPolling.ts), keep a pending receipt together with its notification and a `classified` flag. Validate the fields needed to display the message before deferring it. Only a valid hidden-number incoming message with a `chatId` is held while contact identity is loading, unavailable, or has no resolved ID. Malformed records and hidden-number records without `chatId` are ignored and acknowledged. Once identity resolves, deliver a matching `chatId` and ignore a foreign one. Mark the receipt classified before awaiting deletion so a failed delete retries the receipt without invoking the callback a second time.

When contact status or `chatId` changes, retry classification against the existing receipt without starting another receive. [`useChatContact.ts`](../../../src/features/chat/useChatContact.ts) exposes a retry action after lookup failure, and [`ChatWorkspace.tsx`](../../../src/features/chat/ChatWorkspace.tsx) presents it to the user. A resolved delete result, including `deleted: false`, clears the receipt and allows polling to continue. A rejected delete preserves the same receipt; retryable failures are retried, and polling can be resumed manually after retries are exhausted. A non-retryable error stops polling in a terminal state and requires returning to the connection flow. Queue operations remain serialized as described in the [polling run guidance](polling-run-receipt-ordering.md).

## Why This Works

The receipt stays pending while identity is insufficient, is classified once when enough information exists (or when its payload is invalid), and is then acknowledged. Contact lookup changes trigger another classification attempt without issuing a second receive. Separating classification from deletion preserves one UI delivery across delete retries. Treating either resolved delete result as completion prevents a processed receipt from blocking the queue.

## Prevention

- In [`useNotificationPolling.test.tsx`](../../../src/features/chat/useNotificationPolling.test.tsx), keep coverage for unresolved identity, delayed matching, malformed hidden-number notifications, missing `chatId`, resolved `deleted: false`, and delete retry behavior.
- In [`App.test.tsx`](../../../src/App.test.tsx), keep the integration case where contact lookup fails, the hidden-number receipt remains pending, a user retry resolves identity, and the matching message is shown and deleted.
- Run the polling tests and the full application suite when changing receipt classification or contact lookup state.

The implementation was verified on 2026-09-28: all 93 tests passed, along with lint and the production build.
