# FarmMitra

FarmMitra is a B2B distribution management platform for meat, poultry, fish and egg businesses.

## Phase 1 foundation

This repository contains the monorepo foundation, MySQL 8 + Prisma database architecture, REST API health endpoint, shared packages, and safe development seed structure. Business workflows and frontend applications are intentionally not implemented yet.

## Setup

1. Copy `.env.example` to `.env`.
2. Start infrastructure with `docker compose up -d`.
3. Install dependencies with `npm install`.
4. Generate the Prisma client with `npm run db:generate`.
5. Apply the migration with `npm run db:migrate`.
6. Seed development reference data with `npm run db:seed`.
7. Start the API with `npm run dev`.

The API health endpoint is available at `http://localhost:4000/health`.

## Phase 2 API

Authentication endpoints:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me` with `Authorization: Bearer <access-token>`

Admin-ready resource groups are available under `/api/v1/users`, `/api/v1/shops`, and `/api/v1/catalog/{categories|units|products|variants|prices}`. Access is controlled by seeded permission names, not controller-specific role checks.

## Inventory and warehouse extension

The live Prisma inventory model already includes `Warehouse`, `Inventory`, `InventoryTransaction`, and `StockReservation`. Phase 4 extends the REST API around that model without mutating the existing order lifecycle or the live data model.

Core API routes:

- `GET /api/v1/warehouses`
- `POST /api/v1/warehouses`
- `GET /api/v1/warehouses/:id`
- `PATCH /api/v1/warehouses/:id`
- `GET /api/v1/inventory`
- `GET /api/v1/inventory/:id`
- `GET /api/v1/inventory/variant/:variantId`
- `POST /api/v1/inventory/receipts`
- `POST /api/v1/inventory/issue`
- `POST /api/v1/inventory/adjustments`
- `GET /api/v1/inventory/transactions`

Stock is calculated as `onHand - reserved`, and the reserved quantity is never stored as a second source of truth. Inventory changes are recorded with corresponding `InventoryTransaction` entries and audited through the existing `AuditLog` infrastructure.

## Local development credentials

The repository seeds local-only acceptance accounts. Their credentials are documented in [docs/farmmitra-client-demo.md](docs/farmmitra-client-demo.md); use them only with the local development database and never in production.

## Windows MySQL

The detected local service is `MySQL80`. Start it with:

```powershell
Start-Service MySQL80
```

Then configure a valid MySQL account in `DATABASE_URL` and run:

```powershell
$env:DATABASE_URL='mysql://<user>:<password>@localhost:3306/farmmitra'
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:seed
```

At the time of Phase 2 implementation, port 3306 was reachable but the configured `farmmitra` credentials were rejected and Prisma reported `Unknown authentication plugin sha256_password`. Migration execution was therefore not reported as successful. The Docker daemon was also unavailable; use `docker compose up -d` only after starting Docker Desktop if Docker is the intended database runtime.
