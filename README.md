# Tariq Coy Personnel Record Management System

A secure, mobile-friendly personnel and monthly collection application for Tariq Coy, Faisalabad Airport.

## Project rules

- Preserve the approved UI. Do not redesign Home, Collection, navigation/menu, or Settings without explicit approval.
- The approved Nominal Role is the master list of 61 employees. Do not silently add, delete, or replace master employees.
- Date display and input format: DD-MM-YYYY.
- Rank order: DD, AD, INSP, SI, ASI, SGT, CPL. Within each rank, sort Force No by its numeric part in ascending order.
- Living IN/OUT is required and affects contribution and ration money.
- DD, AD, and INSP are exempt from mess charges. Living OUT employees have no mess charge.
- Monthly contribution and mess are collected together, while reports can be generated separately.
- No partial payments and no unique receipt number.
- Every report starts with Sr. No. Leave & Medical is one combined report; its Remarks column remains blank. Do not create a separate Paid/Pending report.
- Excel reports must be editable in Excel and Google Sheets.

## Collection calculation

For Living IN employees who are eligible for mess charges:

`leaveDeduction = (7000 / daysInSelectedMonth) * leaveDays`

`netMess = max(0, 7000 - leaveDeduction)`

The selected month's actual calendar-day count must be used (28/29/30/31). Entering the number of leave days should recalculate the deduction immediately. The UI may also allow manual override of the leave deduction. DD, AD, INSP, and Living OUT employees have a net mess charge of zero.

Use decimal-safe currency rounding to two decimal places for the displayed deduction; never use a fixed 30-day month.

## Intended deployment architecture

- Source control: this GitHub repository.
- Hosting and backend: Cloudflare Workers.
- Persistent online data: Cloudflare D1, accessed only through server-side Worker APIs.
- Current temporary development branch: authentication is disabled so the application flow can be tested without accounts.
- This no-login branch exposes personnel APIs to anyone who can reach the Worker. Never deploy it to a public URL or use it with real personnel data.
- Security: server-side authorization on every protected endpoint, validation of all input, parameterized SQL, secure session cookies, no secrets in frontend code, audit trail for important changes.
- Data protection: regular database exports/backups and a tested restore procedure.
- Browser storage must not be the source of truth for employee, leave, collection, or payment records.

## Build sequence

1. Establish project baseline and verify the approved UI assets before changing visual files.
2. Create D1 schema and migrations.
3. Implement authentication and authorization.
4. Implement personnel, leave, rates, monthly collection, payment, history, and report APIs.
5. Connect APIs to the locked UI without redesign.
6. Test calculations, access controls, month isolation, exports, backups, and restore.
7. Deploy to Cloudflare and verify production behavior.

## Temporary no-login development mode

The `remove-login-temporarily` branch removes first-admin setup, sign-in, session checks, and logout so the UI and API flow can be reviewed. This is intentionally insecure and for private development only. Do not merge into the production branch or deploy to a public Cloudflare Worker while authentication is disabled. Restore server-side authentication and authorization before production use.

### Approved master data and living status

- Migration `0003_seed_master_and_rates.sql` contains exactly the 61 employees in the approved Nominal Role PDF. It seeds them only if the employee table is completely empty; it never merges into, overwrites, or deletes a non-empty register.
- Newly seeded employees start with living status `UNSET`. Confirm each employee as `IN` or `OUT` before creating a monthly collection. The API rejects collection saves while status is unset.
- The same migration seeds the 14 rank/living-status contribution-rate combinations from the supplied September 2026 contribution report, effective from 2026-09. An exact existing rank/status/effective-date rate is never overwritten. Administrators can add later effective-month rates in Settings.
- The source contribution report contains an extra employee compared with the approved 61-person Nominal Role. That extra person is deliberately not seeded; the Nominal Role remains the master employee list.

### Development and migration safety

- Install dependencies: `npm install`
- Run unit tests: `npm test`
- Apply migrations to a local development database: `npm run db:migrate:local`
- Before any remote migration, take a D1 backup/export and confirm the configured database ID in `wrangler.toml`. Then review the migration plan and run `npm run db:migrate:remote`.
- Do not run remote migrations against production until the migration has passed CI and the current remote schema/backup has been verified.
- CI runs unit tests, applies all D1 migrations to a local database, and performs a Worker dry run on pushes and pull requests to `main`.

### Current implementation boundary

The repository currently contains the Worker API, schema migrations, and calculation tests, but no HTML/CSS application entry point or approved UI asset files were found in the repository. Do not treat the API-only Worker as the finished user-facing app or replace the previously approved design with a newly invented interface. The approved UI must be recovered/added and connected to these endpoints before the application is considered complete.

## Sensitive data

Do not commit real passwords, session secrets, API tokens, CNICs, phone numbers, or other private personnel details. Seed the approved master roster only after validating the source file and intended deployment access controls.
