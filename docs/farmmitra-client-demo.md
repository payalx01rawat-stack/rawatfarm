# FarmMitra Client Demo Runbook

**Scope:** Local development/demo only. This runbook does not describe AWS deployment, domains, SSL, payment gateways, or S3 uploads.

## Demo Storyline

### Problem

Multiple vendors need one marketplace without losing control of their own operations.

### Customer

A customer discovers products from multiple vendors and checks out through one marketplace.

### Vendor

Each vendor manages its own catalog, orders, delivery assignments, and payment collection configuration.

### Delivery

An assigned delivery partner moves the order through its delivery lifecycle and can record cash or UPI collection.

### Admin

An authorized admin oversees marketplace-level vendor, order, and collection information.

### Security

Vendor data is isolated at the backend authorization layer, not merely hidden in the UI.

## Local Demo Accounts

**LOCAL DEVELOPMENT / DEMO ONLY**

These accounts are seeded by `prisma/seed.ts`. Do not use them outside the local development database.

| Role | Login |
| --- | --- |
| Super Admin | `admin.local@farmmitra.test` |
| Vendor A | `vendor.a@farmmitra.test` |
| Vendor B | `vendor.b@farmmitra.test` |
| Customer | `customer.local@farmmitra.test` |
| Delivery Partner | `rahul.delivery@farmmitra.test` |

Local demo password for all accounts: `FarmMitraLocal123!`

## Customer Experience

1. Open the shop at `http://localhost:3000`.
2. Log in with the local customer account through the existing shop login flow.
3. Browse the marketplace homepage.
4. Point out product cards, vendor names, prices, units, and available images.
5. Search for a product or vendor.
6. Filter by vendor and category.
7. Sort by name, vendor, or price.
8. Clear the filters.
9. Open a product card to view product details.
10. Select a quantity and add the product to the cart.
11. Add one Vendor A product and one Vendor B product to the same cart.
12. Open checkout and review the vendor-separated cart groups and combined total.
13. Select a saved delivery address, or save a new address.
14. Place the order.
15. Confirm that the customer is taken to the order detail view.
16. Open order history from the navigation.
17. Open the new order and review the master order, vendor sub-orders, items, quantities, totals, address, payment, and delivery status.

FarmMitra allows customers to purchase products from multiple vendors through one marketplace and checkout.

## Multi-Vendor Architecture

Use one product from Vendor A and one product from Vendor B:

```text
Customer
  -> Vendor A product
  -> Vendor B product
  -> One cart
  -> One checkout
  -> Master order with vendor-specific sub-orders
```

The customer experiences one marketplace and checkout, while vendors retain isolated order and operational data.

## Vendor A Demo

1. Open the shop at `http://localhost:3000` and log in as Vendor A.
2. Open the vendor dashboard and review operational metrics.
3. Open Vendor settings.
4. Review or edit business name, image URL, phone, email, address, UPI details, QR image URL, cash/UPI toggles, and payment instructions.
5. Save and reload the page to confirm values persist.
6. Open Products.
7. Review product availability and prices.
8. Edit an owned product image URL, save it, and verify the URL is reflected in the marketplace/catalog response.
9. Clear the image URL and save again to demonstrate the missing-image fallback.
10. Open Orders and review Vendor A orders and statuses.
11. Open Delivery partners and review the vendor-scoped partner list.
12. From an eligible packed order, assign an eligible delivery partner.
13. Open Payments to review vendor-scoped collection records.

Each vendor manages its own catalog, orders, delivery assignments, and payment collection configuration.

## Vendor Isolation Demo

Log in as Vendor B and demonstrate only safe read/update checks:

- Vendor B own products and orders: allowed.
- Vendor B attempting to read or update Vendor A private resources: denied.
- Vendor B attempting to update Vendor A settings: expected `403 Forbidden`.
- Vendor B attempting to update Vendor A product/image: expected `403 Forbidden`.
- Vendor B attempting to read Vendor A order: expected `403 Forbidden`.

Do not perform destructive operations. The expected result demonstrates that vendor isolation is enforced by the backend authorization layer.

## Delivery Partner Demo

1. Log in as the local delivery partner.
2. Open the delivery dashboard.
3. Review assigned deliveries and collection information.
4. Open an assigned order.
5. Accept the delivery.
6. Start the delivery.
7. Complete the delivery with either:
   - Cash collection: record the amount and optional notes.
   - UPI collection: record the amount, reference number such as `UPI-TEST-002`, and optional notes.
8. Confirm that the delivery status becomes `DELIVERED`.
9. Confirm that payment status and delivery status are shown separately.

FarmMitra records cash and UPI collection; it does not include a payment gateway.

## Admin Demo

The admin frontend runs at `http://localhost:3002` in the current local setup.

1. Log in as the Super Admin.
2. Review the dashboard.
3. Open Products and show the real catalog table.
4. Open Orders if order records are available.
5. Open Delivery and show delivery-partner data.
6. Open Marketplace oversight and show authorized vendor, master-order, and collection visibility.
7. Explain that admin has authorized marketplace-level visibility while vendor operational data remains protected by role and scope.

Do not describe admin write capabilities that are not present in the current screen.

## Current Demo Data

The current local seed creates:

- Vendor A: `Vendor A`, UPI display name `Vendor A Fresh Foods`, UPI ID `vendorA@upi`
- Vendor B: `Vendor B`, UPI display name `Vendor B Market`, UPI ID `vendorB@upi`
- Vendor A product: `Fresh Chicken`, price `INR 280`, unit `KG`
- Vendor B product: `Fresh Mutton`, price `INR 720`, unit `KG`
- Category: `Fresh Foods`
- Delivery partner: Rahul Delivery, assigned to Vendor A with delivery and payment-collection capabilities
- Customer address: create or select one through the checkout address flow
- Existing orders: local checkout smoke tests may leave master orders and vendor sub-orders in the development database
- Vendor payment settings: cash and UPI collection are enabled by default; payment instructions are seeded for both vendors

The broad legacy catalog endpoint currently contains two additional records without vendor linkage or current prices. They are legacy/internal records, not created by the current marketplace seed, and are not exposed by the customer marketplace endpoint, which requires active vendor-backed products. Do not delete them during a demo.

## Demo Reset Procedure

The repository has a development seed command:

```powershell
npm.cmd run db:seed
```

The seed is blocked when `NODE_ENV=production` and is intended for development data. It upserts roles, permissions, demo accounts, vendors, delivery assignment, reference data, and the current marketplace products. It does not delete existing orders or provide a full database reset.

There is no safe automated reset command in the repository. Do not use `prisma migrate reset` or delete the local database for a client demo.

**Manual/local database reset procedure has not been automated.**

## Technical Demo Setup

| Service | URL |
| --- | --- |
| API | `http://localhost:4000` |
| Shop frontend | `http://localhost:3000` |
| Admin frontend | `http://localhost:3002` |
| Delivery App | `http://localhost:3004` |
| Health check | `GET http://localhost:4000/health` |

The health response should contain `status: "ok"` and `database: "connected"`.

### Start local infrastructure

Use the existing local MySQL service on port `3306` and the existing Redis service on port `6379`. Do not start Docker MySQL on port `3306`.

On Windows, check the ports with:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3306,6379
```

The API currently validates `REDIS_URL`; the current API request path does not use a Redis client, but Redis remains part of the local environment contract.

### Start application processes

From the repository root:

```powershell
npm.cmd run dev --workspace @farmmitra/api
npm.cmd run dev --workspace @farmmitra/shop-web
npm.cmd run dev --workspace @farmmitra/admin-web
npm.cmd run dev --workspace @farmmitra/delivery-web
```

If port `3000` is occupied, stop only the stale frontend Node process before restarting the shop. The admin frontend can run on `3002` when the shop owns `3000`.

## Pre-Demo Checklist

- [ ] MySQL running on port `3306`
- [ ] Redis available on port `6379`
- [ ] API running on port `4000`
- [ ] Shop frontend running on port `3000`
- [ ] Admin frontend running on port `3002`
- [ ] Delivery App running on port `3004`
- [ ] `GET /health` returns HTTP 200 with connected database
- [ ] Customer login works
- [ ] Vendor login works
- [ ] Delivery login works
- [ ] Admin login works
- [ ] Marketplace loads
- [ ] Search, filters, and sorting work
- [ ] Product detail loads
- [ ] Cart works
- [ ] Multi-vendor checkout works
- [ ] Demo product data is present
- [ ] Delivery partner is available
- [ ] No stale Next.js process is occupying the intended frontend port
- [ ] Browser console checked if browser tooling is available

## Known Limitations

- Browser automation is not currently available in this environment.
- Mobile interactive verification remains pending.
- Two legacy catalog records lack current vendor/price linkage but are not exposed through the customer marketplace.
- Product images use URL-based storage rather than S3 or file uploads.
- No payment gateway is integrated; the system records cash and UPI collection.
- The delivery partner and admin frontend currently run on local demo ports only.

These are intentional current-scope limitations, not claims of unsupported functionality.

## Verification Baseline

The current verified local baseline is:

- API regression: 23 passed, 0 failed
- Workspace production build: passed
- API health: database connected
- Customer marketplace and product detail: verified through live local HTTP/API checks
- Multi-vendor checkout: verified with Vendor A and Vendor B products
- Vendor isolation: unauthorized cross-vendor access returns `403`
- Admin product and delivery feeds: authorized live endpoints return data
- Browser/mobile interactive verification: unavailable in the current environment
