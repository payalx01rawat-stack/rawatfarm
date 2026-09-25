# FarmMitra Delivery App

Local development only. AWS deployment and infrastructure remain on hold.

## Applications and ports

| Application | Local port | Command |
| --- | ---: | --- |
| Customer marketplace | 3000 | `npm.cmd run dev --workspace @farmmitra/shop-web` |
| Vendor operations | 3000, under the shop workspace | `npm.cmd run dev --workspace @farmmitra/shop-web` |
| Admin | 3002 | `npm.cmd run dev --workspace @farmmitra/admin-web` |
| Delivery app | 3004 | `npm.cmd run dev --workspace @farmmitra/delivery-web` |
| API | 4000 | `npm.cmd run dev --workspace @farmmitra/api` |

The delivery frontend lives at `apps/delivery-app` and is an independently accessible Next.js workspace named `@farmmitra/delivery-web`.

## Delivery partner login

The app uses the existing `POST /api/v1/auth/login` endpoint. After login it accepts only accounts with `DELIVERY_PARTNER`, `DELIVERY_STAFF`, or `SUPER_ADMIN` roles. The JWT is stored under the local delivery-app key and is sent to every protected API request. Expired or unauthorized sessions show an error and clear the delivery session. Logout removes the delivery token and user record.

A delivery account must already exist in the local seed or be created through the existing user management flow. No new credentials are added here.

## Delivery app workflow

The mobile-first app provides:

- Today dashboard with assigned, pending, completed, collected, cash, UPI, and outstanding totals.
- Assigned order filters for pending, out-for-delivery, delivered, and payment-pending orders.
- Order detail with address, item summary, delivery actions, payment summary, and payment history.
- Accept, start, and complete actions restricted by current backend lifecycle state.
- Cash and UPI collection against the remaining balance.
- UPI reference validation.
- Payment history and outstanding tabs.
- Profile and logout.

The API remains the source of truth for authorization, assignment scope, order state, collection amounts, and overdue calculation.

## Vendor delivery management

Vendor pages are available under the existing shop workspace:

- `/vendor/delivery-partners`: add an existing delivery-role user, view vendor-scoped partners, activate/deactivate a vendor relationship.
- `/vendor/delivery-dashboard`: delivery and collection totals plus partner summaries.
- `/vendor/collections`: vendor-scoped collection history with method and reference.
- `/vendor/outstanding`: vendor-scoped outstanding and overdue balances.
- `/vendor/orders`: assign only partners returned for the authenticated vendor.

Vendor identity is resolved through `GET /api/v1/marketplace/me`. Every vendor route checks the authenticated vendor relationship server-side; frontend filtering is not a security boundary.

## API endpoints

Delivery partner endpoints:

- `GET /api/v1/marketplace/delivery/dashboard`
- `GET /api/v1/marketplace/delivery/orders`
- `GET /api/v1/marketplace/delivery/orders/:deliveryId`
- `POST /api/v1/marketplace/delivery/orders/:deliveryId/accept`
- `POST /api/v1/marketplace/delivery/orders/:deliveryId/start`
- `POST /api/v1/marketplace/delivery/orders/:deliveryId/complete`
- `GET /api/v1/marketplace/delivery/payments`
- `GET /api/v1/marketplace/delivery/history`
- `GET /api/v1/marketplace/delivery/outstanding`
- `POST /api/v1/marketplace/orders/:orderId/collect-payment`

Vendor endpoints:

- `GET /api/v1/marketplace/vendors/:vendorId/delivery-partners`
- `GET /api/v1/marketplace/vendors/:vendorId/delivery-partners/:userId`
- `PATCH /api/v1/marketplace/vendors/:vendorId/delivery-partners/:userId`
- `DELETE /api/v1/marketplace/vendors/:vendorId/delivery-partners/:userId` (soft-deactivates the vendor relationship)
- `POST /api/v1/marketplace/vendors/:vendorId/delivery-partners`
- `POST /api/v1/marketplace/orders/:orderId/assignment`
- `GET /api/v1/marketplace/vendors/:vendorId/delivery-dashboard`
- `GET /api/v1/marketplace/vendors/:vendorId/collections`
- `GET /api/v1/marketplace/vendors/:vendorId/outstanding`

Customer master-order responses already include vendor sub-orders and their payment records, while customer ownership checks remain enforced by the existing master-order routes.

## Payment ledger and partial payments

Existing `Payment` records are reused. A valid collected record has status `COMPLETED`, `CASH_COLLECTED`, or `UPI_COLLECTED`. The payment summary calculates:

```text
collected = SUM(valid payment amounts)
outstanding = MAX(order total - collected, 0)
```

Previous payments are never overwritten. UPI collections require a reference ID. A collection must be greater than zero and no greater than the current outstanding balance. Cash collection records what the delivery partner reported receiving; it does not claim bank or gateway confirmation.

Delivery completion and payment status remain separate. An order may be delivered while an outstanding balance remains.

## Outstanding and overdue logic

The backend returns `PAYMENT_PENDING`, `PARTIALLY_PAID`, or `PAID`, plus `daysOutstanding` and `overdue`.

- If there is a payment, age is measured from the most recent collected payment.
- Otherwise, age is measured from the order date.
- `0-6` days is `OUTSTANDING`.
- `7+` days is `OVERDUE`.
- Fully paid balances have zero outstanding and are not overdue.

## Database change

`VendorUser.isActive` was added so a vendor can deactivate only its relationship with a delivery partner without changing the user’s global status. Indexes were added for vendor-active partner lookups and assignment history. Migration:

```text
prisma/migrations/20260925100000_delivery_partner_controls/migration.sql
```

Run locally after setting `DATABASE_URL`:

```powershell
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:migrate
```

No AWS database is created or modified by this work.

## Regression scenario

Use local seeded data and real product prices:

1. Vendor A has Rahul Delivery and another authorized delivery partner as active delivery partners.
2. A customer places a Vendor A order.
3. Rahul Delivery collects `1000` by cash.
4. Verify collected `1000`, outstanding order total minus `1000`, and `PARTIALLY_PAID`.
5. The authorized partner collects the remaining balance by UPI with a reference ID.
6. Verify both payment rows remain visible, cash/UPI totals are correct, outstanding is zero, and status is `PAID`.
7. Use a separate partial order with no collection for at least seven days to verify `OVERDUE`.

The current automated tests cover the ledger calculation and seven-day threshold. Live account/browser smoke testing is still an operator step.

## Security notes

- Delivery endpoints require delivery roles or super-admin access.
- Delivery order actions require an assignment to the authenticated delivery partner.
- Vendor endpoints resolve and enforce the vendor relationship server-side.
- Inactive vendor relationships cannot be assigned to new orders.
- Payment collection is checked against assignment, vendor/order scope, capability, and outstanding balance.
- No payment gateway, AWS resource, notification provider, or S3 integration is added.
