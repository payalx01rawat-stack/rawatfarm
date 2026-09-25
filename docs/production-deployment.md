# FarmMitra AWS development/staging preparation

This document prepares a manually created AWS development environment. It does not deploy the application, create AWS resources, configure DNS, or configure SSL.

## Repository audit

The repository is an npm workspaces monorepo. The versions below are taken from the repository files; no runtime version is inferred.

| Component | Repository requirement |
| --- | --- |
| Node.js | No `engines` field is declared. Use a current Node.js LTS release compatible with Next.js 15, Prisma 6.7.0, and TypeScript 5.7.2. Validate with `node --version`. |
| npm | npm 10.9.2, declared by `packageManager` in the root `package.json`. |
| MySQL | MySQL 8.4, used by `docker-compose.yml`; Prisma datasource provider is `mysql`. |
| Redis | Redis 7, used by `docker-compose.yml`. The current API does not import or connect to a Redis client. `REDIS_URL` is nevertheless required by the shared environment schema. |
| Prisma | Prisma CLI and `@prisma/client` 6.7.0. |
| API runtime | Node.js process using `tsx`; source entrypoint is `apps/api/src/server.ts`. |
| API port | `API_PORT`, default `4000`. `PORT` is not read by the API. |
| Frontend API URL | `NEXT_PUBLIC_API_BASE_URL` in browser code; `API_BASE_URL` is also used by the shop login server route. |
| Storage | No S3 or file-storage abstraction exists. Product, vendor, and QR image values are URL strings in MySQL. |
| Migrations | Existing SQL files under `prisma/migrations`; Prisma schema is `prisma/schema.prisma`. |

The root scripts are:

```powershell
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run build --workspaces --if-present
npm.cmd test --workspace @farmmitra/api
```

The API package scripts are:

```powershell
npm.cmd run build --workspace @farmmitra/api
npm.cmd start --workspace @farmmitra/api
```

The API health check is `GET /health`. The API exposes REST routes under `/api/v1`.

## AWS DEVELOPMENT ENVIRONMENT

Create a separate environment file on the EC2 host. Do not copy the local `.env` or reuse its local MySQL credentials.

### API environment variables

| Variable | Required by current API startup | Purpose and AWS development value |
| --- | --- | --- |
| `NODE_ENV` | No, defaults to `development` | Set to `development` for this environment. Do not set it to `production` before reviewing seed and operational behavior. |
| `API_PORT` | No, defaults to `4000` | Port bound by the API process. Use `4000` unless the EC2 host design requires another private port. |
| `DATABASE_URL` | Yes | Separate RDS MySQL connection string, for example `mysql://<user>:<password>@<rds-endpoint>:3306/farmmitra_dev`. Do not use the local URL. |
| `REDIS_URL` | Yes | Must be a valid URL because the shared schema validates it. Recommended format: `redis://:<password>@<redis-endpoint>:6379`. The current API does not use Redis yet. |
| `JWT_SECRET` | Yes | Random secret of at least 32 characters used to sign access tokens. Generate and store it in the EC2 secret store or protected environment file. |
| `JWT_EXPIRES_IN` | No, defaults to `15m` | JWT lifetime, such as `15m`. |
| `CORS_ALLOWED_ORIGINS` | No, local origins are the fallback | Comma-separated exact origins allowed to call the API. For a local frontend, include its actual origin, such as `http://localhost:3000`. Never use `*`. |
| `API_BASE_URL` | No API-process requirement; used by the shop server route when present | URL reachable from the frontend server process, such as `http://<ec2-development-address>:4000`. |
| `NEXT_PUBLIC_API_BASE_URL` | No API-process requirement; required for frontend AWS connectivity | API URL embedded into the local Next.js browser bundle, such as `http://<ec2-development-address>:4000`. Set this in each frontend app's local environment. |
| `FRONTEND_ORIGIN` | No | Present in the shared validation schema but not currently consumed by the API. `CORS_ALLOWED_ORIGINS` controls current CORS behavior. |
| `AWS_REGION` | No | Present for future integrations; not currently consumed by the application. |
| `AWS_S3_BUCKET` | No | Present for future integrations; no current S3 upload code uses it. |
| `FIREBASE_PROJECT_ID` | No | Present for future integrations; not currently consumed by the application. |

The API's actual required startup values are `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET`; the remaining values have schema defaults or are optional. `PORT` is not an application variable in this repository. Use `API_PORT`.

### Frontend environment

The local shop and admin/vendor Next.js applications should use environment files that are not committed:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://<aws-development-api-address>:4000
API_BASE_URL=http://<aws-development-api-address>:4000
```

Use the actual AWS API address selected for development. Do not hardcode an AWS address into source code. `NEXT_PUBLIC_API_BASE_URL` is exposed to browser code, so it must not contain credentials.

## Database: AWS RDS MySQL

Create a separate RDS database with:

- Engine: MySQL
- Version: MySQL 8.4, matching `docker-compose.yml` and the Prisma MySQL datasource
- Database name: `farmmitra_dev`
- Username: a dedicated non-root application user, for example `farmmitra_app`
- Port: `3306`
- Connectivity: private subnet and reachable only from the EC2/application security group
- SSL: enable RDS TLS in the database connection policy. Use the AWS RDS CA bundle and the connection parameters required by the selected RDS MySQL configuration; do not disable certificate verification as a permanent setup

The RDS database must not use the existing local MySQL database. Keep the local `DATABASE_URL` unchanged.

### Prisma migration procedure

From the repository checkout on EC2, after setting the AWS RDS `DATABASE_URL`:

```powershell
npm.cmd install
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:migrate --workspace @farmmitra/database
```

The migration command uses the existing migration history and is non-destructive. Do not use `prisma migrate reset`, delete the RDS database, or remove migration directories. For a new empty development database, Prisma will apply the checked-in migrations. If Prisma reports drift or a migration failure, stop and investigate rather than resetting the database.

### Backup and rollback readiness

Before applying any migration to an environment containing data, take and verify a database backup or managed-database snapshot. Record the backup identifier with the deployment change. Application and database rollback are separate concerns: restore the previous approved application commit and rebuild first, but do not attempt an automatic down migration unless a reviewed reverse migration exists. If a schema change must be reversed, stop the application, restore the verified database backup or snapshot according to the database provider procedure, then restore the previous application version. Never use `prisma migrate reset` for rollback.

The current MVP release checkpoint is `fa2ec46`; the previous verified baseline is `e13affc`. Keep both commit identifiers in the deployment record so the application can be restored without rewriting Git history.

## Redis

Redis is currently an infrastructure/schema requirement, not an active API dependency. The architecture documentation reserves Redis and BullMQ for asynchronous workers, but this repository contains no Redis client import and the current API request path does not use Redis.

For AWS development, use ElastiCache for Redis or another private AWS-compatible managed Redis service only if the environment policy requires the declared dependency to be provisioned. Use Redis 7 compatibility and a private endpoint. Set:

```dotenv
REDIS_URL=redis://:<redis-auth-token>@<redis-endpoint>:6379
```

Do not expose Redis publicly and do not add a Redis library or change the current implementation as part of this setup.

## EC2 development size

Recommended starting point: one x86_64 general-purpose burstable instance such as `t3.small` (2 vCPU, 2 GiB RAM) for the API only. Use 20 GiB gp3 EBS storage. This is intentionally modest because the frontends remain local and no workers are being run on EC2 initially.

- OS: Ubuntu Server 24.04 LTS 64-bit
- Architecture: x86_64
- Minimum: 2 vCPU and 2 GiB RAM; use `t3.medium` only if build memory pressure makes `t3.small` insufficient
- Disk: 20 GiB gp3 minimum
- Node.js: current Node.js LTS compatible with the declared dependencies; verify with `node --version`
- npm: 10.9.2, matching the repository package manager declaration
- Process manager: `systemd` is sufficient for one API process; PM2 is an acceptable alternative if already standardized by the team
- API bind port: `API_PORT=4000`

On EC2, from the repository root:

```bash
npm install
npm run db:generate
npm run build --workspaces --if-present
npm start --workspace @farmmitra/api
```

The repository does not define a root `start` script. Start the API with the workspace command above. Configure the process manager to restart the API and load the protected environment file; do not put secrets in shell history or source control.

## Security groups and network access

Use private subnets for RDS and Redis where possible.

| Resource | Inbound | Outbound |
| --- | --- | --- |
| EC2 API | TCP `4000` only from the developer's current IP `/32` or a controlled development network; TCP `22` only from the administrator's current IP `/32` if SSH is used | HTTPS `443` for package/repository access; TCP `3306` to the RDS security group; TCP `6379` to the Redis security group |
| RDS MySQL | TCP `3306` only from the EC2/application security group | Default RDS-managed outbound behavior; no public access |
| ElastiCache/managed Redis | TCP `6379` only from the EC2/application security group | Default managed-service behavior; no public access |

Do not open ports `3306` or `6379` to `0.0.0.0/0`. Domain and SSL termination are out of scope for this development setup. If the local browser must call the API directly, allow only the developer IP or controlled development network on port `4000`; CORS must still list the exact local frontend origin.

## S3 assessment

S3 is not required by the current application. There is no storage adapter, AWS SDK dependency, upload endpoint, or file persistence flow. `imageUrl` and `qrImageUrl` are stored as URL strings and can continue to reference externally managed URLs during development.

Do not create an S3 bucket or add S3 IAM permissions for this environment unless a later implementation adds an upload abstraction. If that happens, use a private bucket, scoped application IAM permissions, and presigned uploads rather than changing the current image handling implicitly.

## Seed and development data

After migrations, seed only a non-production AWS development database:

```bash
NODE_ENV=development npm run db:seed
```

The seed is blocked when `NODE_ENV=production`. It creates roles, permissions, units, a branch, warehouse, category, two vendors, sample products, and local acceptance accounts. The credentials below are **DEVELOPMENT ONLY** and must not be used in production or committed as production credentials:

- Super Admin: `admin.local@farmmitra.test`
- Vendor A: `vendor.a@farmmitra.test`
- Vendor B: `vendor.b@farmmitra.test`
- Customer: `customer.local@farmmitra.test`
- Delivery Partner: `rahul.delivery@farmmitra.test`
- Seed password for all five accounts: `FarmMitraLocal123!`

Change or remove these accounts before any environment becomes production-like. The seed is idempotent for its managed records, but it is still intended for development data only.

## AWS setup order

1. Create or select a development VPC with private subnets for RDS and Redis and a controlled route for the EC2 host.
2. Create the RDS MySQL 8.4 instance/database named `farmmitra_dev` with a dedicated application user.
3. Create ElastiCache Redis 7 or choose a private AWS-compatible managed Redis service; this is optional for current request handling but satisfies the declared environment contract.
4. Create the development EC2 instance with the cost-conscious size above and install the repository's Node.js/npm requirements.
5. Configure security groups so only EC2 reaches RDS/Redis, and only controlled developer traffic reaches SSH/API ports.
6. Check out the repository on EC2 and configure `NODE_ENV`, `API_PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ALLOWED_ORIGINS`, and any optional variables required by the chosen setup.
7. Run `npm run db:validate`, `npm run db:generate`, and `npm run db:migrate --workspace @farmmitra/database` against the separate RDS database.
8. Run the development seed with `NODE_ENV=development npm run db:seed`.
9. Build the API and workspaces with `npm run build --workspaces --if-present`.
10. Start the API with `npm start --workspace @farmmitra/api` under `systemd` or the selected process manager.
11. Set local frontend `NEXT_PUBLIC_API_BASE_URL` and `API_BASE_URL` to the AWS development API address; do not modify source code.
12. Run the health check, login, customer marketplace, multi-vendor checkout, vendor-isolation, delivery, and payment smoke tests.

## Manual AWS commands

On EC2, after installing Node.js/npm and checking out the repository:

```bash
cd /opt/farmmitra
npm install
npm run db:validate
npm run db:generate
npm run db:migrate --workspace @farmmitra/database
NODE_ENV=development npm run db:seed
npm run build --workspaces --if-present
npm start --workspace @farmmitra/api
```

From a development workstation, configure the local Next.js applications without changing source:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL='http://<aws-development-api-address>:4000'
$env:API_BASE_URL='http://<aws-development-api-address>:4000'
npm.cmd run dev --workspace @farmmitra/shop-web
npm.cmd run dev --workspace @farmmitra/admin-web
```

Verify the API manually:

```powershell
Invoke-WebRequest 'http://<aws-development-api-address>:4000/health'
```

Do not claim the environment is deployed until these commands have been run by the operator and the smoke tests pass.

## Repository validation

Run from the repository root before handing the checkout to the AWS operator:

```powershell
npm.cmd test --workspace @farmmitra/api
npm.cmd run build --workspaces --if-present
```
