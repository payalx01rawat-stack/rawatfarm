# FarmMitra AWS Development/Staging Deployment Preparation

This is a preparation and operator runbook for a manually created AWS development environment. It does not deploy FarmMitra, create AWS resources, configure DNS or SSL, or push to a remote.

Target topology:

```text
Customer/browser -> Shop or admin frontend -> FarmMitra API on EC2 -> RDS MySQL
                                                     optional private Redis
```

The current API uses Node.js, Prisma, and MySQL. Redis is validated by the shared environment schema but is not used by the API request path. S3 is not implemented: product and vendor image fields are URL strings. Do not provision either service unless a later implementation or environment policy requires it.

## 1. AWS prerequisites

- An AWS account and a named development/staging environment.
- An AWS Region selected by the operator.
- A VPC with subnets and routing that allow EC2 to reach private RDS.
- A controlled administrator network or current administrator IP address.
- A source checkout of the verified baseline commit `d9d8ebc`.
- No domain, DNS, or SSL setup is required for this development preparation.

## 2. IAM requirements

Use least privilege. The operator needs permission to inspect and manage only the selected development VPC, EC2 instance, RDS instance, and optional Redis service. The EC2 runtime needs no S3 or Firebase permissions for the current code. Do not place long-lived AWS access keys in the repository or application environment.

## 3. VPC and network expectations

- Keep RDS private and non-publicly accessible.
- Keep Redis private if it is provisioned.
- Place EC2 where it can reach RDS on TCP 3306 and optional Redis on TCP 6379.
- Allow controlled outbound HTTPS for package and repository access.
- A local browser may call the EC2 API directly during development, subject to a restricted EC2 ingress rule and exact CORS origins.

## 4. Security groups

Documented rules only; do not create them as part of this task:

| Resource | Inbound rule |
| --- | --- |
| EC2 | API TCP `4000` only from intended development access; SSH TCP `22` only from the administrator IP `/32` or controlled admin network. |
| RDS | TCP `3306` only from the EC2 security group; never public. |
| Redis | TCP `6379` only from the EC2 security group; never public. |

Never open RDS or Redis to `0.0.0.0/0`.

## 5. EC2 setup

Recommended development starting point: Ubuntu Server 24.04 LTS, x86_64, a burstable general-purpose instance with at least 2 vCPU and 2 GiB RAM, and 20 GiB gp3 storage. Use a larger instance only if build memory pressure requires it.

- Node.js: current Node.js LTS compatible with Next.js 15, Prisma 6.7.0, and TypeScript 5.7.2. Verify with `node --version`.
- npm: `10.9.2`, matching the root `packageManager` declaration. Verify with `npm --version`.
- Runtime: API source entrypoint `apps/api/src/server.ts`, started with the API workspace script.
- Process startup: use `systemd` or an existing standardized process manager. Configure automatic restart and stop/start behavior.
- Logging: send stdout/stderr to the process manager and retain enough logs for development diagnosis. Do not log secrets.

The current target keeps the frontends on the development workstation unless the operator separately chooses to run them on EC2. The application architecture is unchanged.

## 6. RDS setup

- Engine: MySQL 8.x; MySQL 8.4 matches `docker-compose.yml` and the Prisma datasource.
- Database name: `farmmitra_dev`.
- Username: dedicated non-root application user, such as `farmmitra_app`; do not use the master/root account for application traffic.
- Connectivity: private RDS endpoint reachable only from the EC2 security group.
- Backups: enable automated backups and retain a development-appropriate recovery window; take an on-demand snapshot before destructive maintenance.
- Connection format: `mysql://<user>:<password>@<rds-endpoint>:3306/farmmitra_dev`.
- Use the selected RDS TLS settings and CA bundle where required; do not disable certificate verification as a permanent practice.

## 7. Optional Redis setup

Redis is not required by the current API runtime. There is no Redis client import or connection in the API; the only current requirement is that `REDIS_URL` passes shared schema validation. Do not add Redis solely to support current API requests. If the environment policy requires it, use a private Redis 7-compatible service and allow TCP 6379 only from EC2.

## 8. Environment variables

Create protected environment files on the host and in each frontend app as needed. Do not commit them. Do not invent or copy values into this repository.

### Required

| Variable | Classification and use |
| --- | --- |
| `DATABASE_URL` | Required. RDS MySQL connection string. |
| `REDIS_URL` | Required by shared validation and API startup, though not used by request handling. Must be a valid URL. |
| `JWT_SECRET` | Required. At least 32 characters; store outside source control. |

### Optional or local default

| Variable | Classification and current behavior |
| --- | --- |
| `NODE_ENV` | Optional; defaults to `development`. Use `development` for seeded AWS development. |
| `API_PORT` | Optional; defaults to `4000`. The API does not read `PORT`. |
| `JWT_EXPIRES_IN` | Optional; defaults to `15m`. |
| `CORS_ALLOWED_ORIGINS` | Optional; defaults to local origins. Set exact comma-separated frontend origins for AWS development; never use `*`. |
| `API_BASE_URL` | Optional to API startup. Used by the shop server-side login route and should point to the reachable API URL. |
| `NEXT_PUBLIC_API_BASE_URL` | Optional only because source has a localhost fallback, but required for non-local frontend connectivity. It is exposed to browser code and must contain no credentials. |
| `FRONTEND_ORIGIN` | Optional schema field; currently not consumed by API CORS. |
| `AWS_REGION` | Optional future integration field; currently not consumed. |
| `AWS_S3_BUCKET` | Optional future integration field; S3 is not implemented. |
| `FIREBASE_PROJECT_ID` | Optional future integration field; currently not consumed. |

For each frontend app, set `NEXT_PUBLIC_API_BASE_URL` and `API_BASE_URL` to the selected API address. The shop server route uses `API_BASE_URL`; browser calls use `NEXT_PUBLIC_API_BASE_URL`. Source fallback values remain localhost for local development only.

## 9. Git deployment

No remote is configured for this repository. When an approved transport is available, transfer or check out the repository at the verified baseline without rewriting it:

```bash
git checkout d9d8ebc
```

Do not push from this preparation task. Keep the baseline recoverable.

## 10. Install dependencies

From the repository root on the host:

```bash
npm install
```

Use the lockfile and the repository-declared npm version. Do not copy local `.env` files or local database credentials.

## 11. Prisma generation and validation

```bash
npm run db:validate
npm run db:generate
```

The Prisma schema is `prisma/schema.prisma`, uses the MySQL provider, and is compatible with MySQL 8.x. The generated client is produced by the existing database workspace script.

## 12. Prisma migration

For a new empty development database, apply the checked-in migration history:

```bash
npm run db:migrate
```

Do not run `prisma migrate reset`, delete migrations, or ignore drift. Stop and investigate migration errors. Do not alter the schema for this preparation task.

## 13. Seed strategy

Seed only a disposable, non-production development database after migrations:

```bash
NODE_ENV=development npm run db:seed
```

Do not seed a production environment. Review and change seeded local accounts before an environment becomes production-like. No seed credentials belong in this runbook or in source control.

## 14. API startup

Build and start the API under `systemd` or the selected process manager:

```bash
npm run build --workspace @farmmitra/api
npm start --workspace @farmmitra/api
```

Load the protected environment file through the process manager and configure restart-on-failure. The API listens on `API_PORT`.

## 15. Shop startup

If the shop is hosted on the development host, configure its environment and run:

```bash
npm run build --workspace @farmmitra/shop-web
npm run dev --workspace @farmmitra/shop-web
```

Use an appropriate process manager command for a persistent staging frontend. Otherwise run the shop locally with the AWS API URL in its uncommitted environment file.

## 16. Admin startup

If the admin app is hosted on the development host, configure its environment and run:

```bash
npm run build --workspace @farmmitra/admin-web
npm run dev --workspace @farmmitra/admin-web
```

Use an appropriate process manager command for a persistent staging frontend. Otherwise run the admin app locally with the AWS API URL in its uncommitted environment file.

## 17. Health verification

Verify the API and database:

```text
GET http://<api-address>:4000/health
```

Expect HTTP 200 and a response containing `status: "ok"` and `database: "connected"`. Then verify login, marketplace access, multi-vendor checkout, vendor isolation, delivery, payment, and admin smoke paths.

## 18. CORS verification

Set `CORS_ALLOWED_ORIGINS` to the exact scheme, host, and port of every frontend origin. Confirm a browser preflight from each intended origin receives the expected `Access-Control-Allow-Origin` value. Confirm an unlisted origin does not receive an allow-origin header. `FRONTEND_ORIGIN` alone does not configure current API CORS.

## 19. Rollback procedure

The verified local MVP checkpoint is `d9d8ebc` (`chore: establish verified FarmMitra MVP baseline`). To roll back application code, stop the process, check out that commit, reinstall/build if needed, and restart:

```bash
git checkout d9d8ebc
npm install
npm run db:generate
npm run build --workspaces --if-present
```

Do not rewrite or amend the baseline commit. Database rollback is a separate operation: take a snapshot first and use a reviewed migration strategy rather than resetting a shared database.

## 20. Backup considerations

Use RDS automated backups and snapshots appropriate for development. Before migrations or destructive data work, capture an on-demand snapshot and record the migration commit. Redis is optional and currently non-authoritative; do not treat it as the system of record.

## 21. Security checklist

- [ ] No real secrets, credentials, or AWS keys are committed.
- [ ] RDS is private and TCP 3306 is allowed only from EC2.
- [ ] Redis, if provisioned, is private and TCP 6379 is allowed only from EC2.
- [ ] SSH is restricted to the administrator IP or controlled admin network.
- [ ] API ingress is restricted to intended development access.
- [ ] `CORS_ALLOWED_ORIGINS` contains exact origins and never `*`.
- [ ] Seed data is limited to development and reviewed before production-like use.
- [ ] Process logs do not contain secrets.
- [ ] The deployment can return to commit `d9d8ebc`.

## Final local verification

Run from the repository root before any operator deployment:

```powershell
npm.cmd test --workspace @farmmitra/api
npm.cmd run build --workspaces --if-present
git status --short
```

This runbook is preparation only. No AWS resource is created by these instructions.