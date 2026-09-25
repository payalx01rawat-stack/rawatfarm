# FarmMitra Architecture

All clients communicate with the REST API. The API owns authentication, business rules, and Prisma access. MySQL is the system of record. Redis and BullMQ are reserved for asynchronous jobs. S3, Firebase Cloud Messaging, and future WhatsApp integration remain external adapters.

No frontend or worker connects directly to MySQL.

## Phase 3 inventory boundaries

Product and variant stock is vendor-owned. Tracked stock uses `IN_STOCK`, `LOW_STOCK`, and `OUT_OF_STOCK` status rules with a non-negative decimal quantity; untracked products are explicitly reported as `NOT_TRACKED`. Vendor adjustments require a reason and write immutable `StockMovement` records.

Marketplace checkout resolves ownership and availability inside the existing master-order transaction. It conditionally decrements the product or selected variant, so concurrent requests cannot oversell. Each deduction is linked to its order item. Cancelling an eligible vendor sub-order restores only its deducted items, guarded by the movement ledger so retries do not double-restore. Returns are not restocked yet because the existing return workflow does not define a completed restock event.

## Phase 2 API boundaries

The API owns password hashing, JWT access-token issuance, authentication context loading, permission checks, and audit event creation. Permissions are persisted in `Permission` and attached through `RolePermission`; route handlers request permission names through reusable authorization helpers. Passwords are stored only as bcrypt hashes. Refresh and logout endpoints remain reserved for the next authentication increment.

Database availability is observable through `GET /health`. A failed MySQL query returns HTTP 503 with `database: "unavailable"`; the service does not claim a successful migration or seed when credentials are invalid.
