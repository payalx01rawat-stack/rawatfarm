# Rawat Farm Admin

The Rawat Farm admin interface is a Next.js application for customer financial
history, order history, catalog management, and business operations.

## Customer history

The customer list links to customer detail pages. Customer details use the
existing `GET /api/v1/users/:id/financial-history` endpoint, protected by the
`users.read` permission. Financial totals come from existing orders and
collected payment records; order items display their stored charged prices.
Dates and times are shown in the `Asia/Kolkata` timezone.

## Product catalog

Admins can create products and edit product details, price, minimum order
quantity, image URL, and active status using the existing catalog endpoints:

- `GET /api/v1/catalog/products?business=rawat-farm`
- `POST /api/v1/catalog/products`
- `PATCH /api/v1/catalog/products/:id`

Price changes append a new effective product price; order item prices remain
the historical amounts charged at checkout. Product creation requires exactly
one active, approved vendor named `Rawat Farm`.

## Dashboard

The dashboard summarizes customer, order, collection, and outstanding data
returned by the existing order, payment, delivery-partner, and user APIs.
Dashboard totals are shown only when those requests succeed.

## Child Admin

Super Admins can create dedicated Child Admin accounts at `/child-admins`,
deactivate or reactivate them, and revoke their role. Revoking the role also
deactivates the account. Child Admins sign in to `/child-admin`, where business
orders, customers, delivery partners, vendors, shops, products, stock, base and
customer-specific prices, payments, collections, handovers, and summary reports
are available as read-only data.

The API enforces a route allowlist and rejects every Child Admin write request,
including user, role, order, inventory, price, payment, and settings mutations.
The role is provisioned by the development seed and is also created or
backfilled transactionally when a Super Admin creates or assigns it. Its
permissions are reset to the read-only set; no schema migration is required.
