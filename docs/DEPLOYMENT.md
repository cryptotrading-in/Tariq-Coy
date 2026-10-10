# Cloudflare setup checklist

Do not deploy the public app until the approved UI is connected and the tests pass. The current repository contains the initial backend foundation, not the finished application.

## 1. Create a dedicated D1 database

Create a new Cloudflare D1 database named `tariq-coy-personnel-db`. Do not reuse a database that belongs to another application.

Copy its database ID into `wrangler.toml` in place of `REPLACE_WITH_TARIQ_COY_D1_DATABASE_ID`.

The schema includes personal and service information. Restrict access to the Cloudflare account and do not expose the D1 binding to browser code.

## 2. Apply the schema and import the master roster

After the database ID is configured:

```sh
npm install
npx wrangler d1 migrations apply tariq-coy-personnel-db --remote
npx wrangler d1 execute tariq-coy-personnel-db --remote --file=seed/nominal_role.sql
```

The seed script contains the approved 61 Nominal Role employees and intentionally leaves Living IN/OUT unset. Confirm each person's living status before making monthly collection entries. It does not seed CNICs, phone numbers, addresses, or other private data.

## 3. Set up the first administrator

Generate a long, random one-time bootstrap secret and set it as a Worker secret:

```sh
npx wrangler secret put BOOTSTRAP_SECRET
```

Deploy the Worker, then send one HTTPS POST request to `/api/setup-admin` with:
- Header `Content-Type: application/json`
- Header `Origin: https://YOUR-APP-DOMAIN`
- Header `x-bootstrap-secret: YOUR-ONE-TIME-SECRET`
- JSON body `{"username":"your-admin-name","password":"a-long-unique-password" }`

Use a password of at least 12 characters. Do not send secrets through a public issue or commit them to GitHub. The endpoint refuses setup after the first user exists. Remove the `BOOTSTRAP_SECRET` secret after the initial administrator is created.

## 4. Authentication behavior

- Passwords are PBKDF2-SHA-256 hashed with a unique random salt.
- Session tokens are random, stored only as SHA-256 hashes in D1, and delivered using Secure, HttpOnly, SameSite=Strict cookies.
- Sessions expire after the configured duration and logout revokes the current session.
- Repeated incorrect attempts lock the matching account temporarily.
- All personnel endpoints require an authenticated session. Mutating endpoints require the admin role.
- Keep the Worker and database private behind Cloudflare access controls where feasible; enable Cloudflare rate limiting for login and setup endpoints.

## 5. Backups and restore

Before entering real personnel data, configure a regular D1 backup/export process, keep backup access restricted, and perform a restore test. Keep a separate copy of migration files in GitHub. A Git commit is not a database backup.

## 6. Production readiness gates

Before the app is declared live, verify:
- The approved UI has been connected without redesign.
- Login, logout, session expiry, role checks, and failed-login handling.
- D1 data remains after browser cache/cookies are cleared and across devices.
- The 61-person roster count and rank/Force No sort order.
- Living status must be explicitly set; it must never silently default all staff to IN.
- Leave deduction recalculates as `7000 / actual days in selected month * leave days`.
- DD, AD, INSP and Living OUT have zero mess charge.
- Paid collections cannot be partially paid or edited.
- Excel exports have Sr. No. first; Leave & Medical is one report with blank Remarks.
- Backups can be restored successfully.
