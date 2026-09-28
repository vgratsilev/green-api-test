# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Chat messaging

### Outgoing Message
A text message the active chat is sending to its selected recipient. Its local lifecycle distinguishes work waiting in the send queue, a request in progress, provider acceptance, delivery, read, and failure; retry continues the same message's history.

### Delivery Status
A provider event describing the delivery progress of one outgoing message. When it includes a message ID, that ID links the event to its message; the event can arrive before the corresponding send request returns.
