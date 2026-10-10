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
- Authentication: secure server-validated sessions; no public access to personnel data.
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

## Sensitive data

Do not commit real passwords, session secrets, API tokens, CNICs, phone numbers, or other private personnel details. Seed the approved master roster only after validating the source file and intended deployment access controls.
