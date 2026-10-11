# Language preferences, customer Khata, and cash handovers

## Language preferences

The shared locale dictionaries and formatting helpers live in `packages/shared-utils`. Supported values are `en`, `hi`, and `hinglish`; unknown translation keys fall back to English. Each web app renders the shared selector and keeps the preference in `farmmitra_language`. Signed-in users can save their own preference through `PATCH /api/v1/users/me/preferred-language`; the API only updates the authenticated user's profile.

The selector is available throughout Admin, Shop/Vendor, and Delivery. It is wired to shared navigation, customer sign-in/registration and detail screens, delivery sign-in, and the Khata statement. Existing pages that have not yet been converted to translation keys continue to show their original text; the dictionaries do not automatically translate arbitrary business content.

Account synchronization uses the token for the active app/account: Admin uses `farmmitra_access_token` with `farmmitra_user`; Shop uses the customer access token or vendor token according to `farmmitra_shop_user.roles`; Delivery uses `farmmitra_delivery_token` with `farmmitra_delivery_user`. All use the API's standard Bearer access JWT. On HTTP 401, only that app's session keys are cleared and a matching sign-in link is shown; the local language remains saved. A successful sign-in triggers one preference sync with its newly issued token, without retry loops.

## Khata statement

`GET /api/v1/users/me/financial-history` is restricted to the signed-in customer and returns only that customer's Rawat Farm history. Admin customer details continue to use `GET /api/v1/users/:id/financial-history` with the existing `users.read` permission.

Both endpoints include a derived ledger. `from` and `to` accept `YYYY-MM-DD` dates interpreted as Asia/Kolkata calendar days. `page` and `pageSize` paginate the returned transactions. Order totals are debits; only collected payment statuses are credits. Transaction prices and payment facts are read from the existing orders and payments; this feature does not copy or rewrite historical records.

Opening balance for a selected range is the net of earlier order charges and collected payments. The current data model does not provide a separate customer opening-credit balance or authorized Khata adjustment/reversal records, so the ledger reports adjustments as zero and cannot represent an opening balance that exists outside the order/payment history.

The Shop customer statement is at `/khata`. It provides day, week, month, custom-range and all-time filters, balance summary, transaction details, pagination, INR formatting, Asia/Kolkata dates, and browser print-to-PDF.

## Staff cash handovers

Cash handovers are separate from customer payments. Admin endpoints are:

- `GET /api/v1/marketplace/admin/cash-handovers`
- `POST /api/v1/marketplace/admin/cash-handovers`

The POST requires an `idempotency-key`, an active Rawat Farm delivery partner, and an amount no greater than their collected-but-not-yet-handed-over CASH balance. It records the receiving admin and does not create or modify a customer payment. The Admin Payments page displays balances and recent handovers.

The additive migration `20261009055000_add_cash_handovers` creates the handover table. It has been applied to the configured local database; no existing user, customer, vendor, product, order, or payment rows were changed. Cash handovers are for physical CASH only; UPI settlement and adjustment/reversal workflows are not modeled.

## Validation notes

Unit and mocked-route tests cover locale formatting/fallback, customer ownership checks, ledger calculations, and handover authorization limits/idempotency. Database-backed API integration tests that delete fixtures were not run against the existing database.
