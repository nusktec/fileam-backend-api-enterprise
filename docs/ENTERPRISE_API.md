# Enterprise API Documentation

Base URL: `/api/v1/enterprise`  
Auth: `Authorization: Bearer <accessToken>`

---

## Route Structure (Screen Names)

| Route Prefix | Screen Name |
|--------------|-------------|
| `/dashboard` | Global Dashboard |
| `/clients` | Clients |
| `/clients/:clientId/details` | Client Details |
| `/clients/:clientId/dashboard` | Client Details (Dashboard) |
| `/clients/:clientId/client-business-profile` | Business Profile |
| `/clients/:clientId/tax-computation/*` | Tax Computation |
| `/clients/:clientId/financials/*` | Financials |
| `/clients/:clientId/filings/*` | Filings |
| `/clients/:clientId/evidence-vault/*` | Evidence Vault |
| `/clients/:clientId/reports/*` | Reports |
| `/compliance/*` | Compliance |

---

## Screen: Global Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Global dashboard metrics and recent activities |

**Response:**
```json
{
  "totalClients": { "value": 12, "thisWeek": 2 },
  "taxDueThisMonth": { "value": 450000, "thisWeek": 120000 },
  "potentialTaxSavings": { "value": 85000, "thisWeek": 15000 },
  "complianceRiskAlert": { "level": "low", "message": "All filings on track", "thisWeek": 0 },
  "recentActivities": [
    { "id": "...", "clientName": "ACME LTD", "activity": "Updated their profile", "timestamp": "...", "hoursAgo": 2 }
  ]
}
```

---

## Screen: Clients

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients?q=&type=` | List all clients (search by name, email, RC, TIN) |
| GET | `/clients/available?q=` | List available users for client request |

**Client object:**
- `businessName`, `companyRegNumber` (rcNumber), `isActive`, `vatStatus` (Registered/Unregistered), `nextFiling` (taxType, dueDate)

---

## Screen: Client Details (Dashboard)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients/:clientId/details` | Client details |
| GET | `/clients/:clientId/dashboard` | Client dashboard metrics |

**Dashboard response:**
- `businessName`, `status` (VAT required/not required)
- `metricData`: Tax Due This Month, Filings Completed, Filing In Progress
- `taxObligations`: [{ taxType, dueDate, amount, status }]
- `taxBreakdownByType`: { total, CIT, VAT, WHT, PAYE }

---

## Screen: Business Profile

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/clients/:clientId/client-business-profile` | Business Identity |
| PUT | `/clients/:clientId/client-contact` | Contact Info |
| PUT | `/clients/:clientId/tax-configuration` | Tax Configure (VAT, PAYE, WHT, CIT) |
| GET/PUT | `/clients/:clientId/business-profile` | Full business profile |

---

## Screen: Tax Computation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients/:clientId/vat-computation/status` | VAT status |
| POST | `/clients/:clientId/vat-computation/calculate` | Start VAT Filing |
| GET | `/clients/:clientId/vat-computation/results` | View VAT Computation |
| GET | `/clients/:clientId/tax-summary` | Tax summary |
| GET | `/clients/:clientId/tax-computation/threshold` | Below VAT Threshold status & message |
| GET | `/clients/:clientId/tax-computation/chart` | Chart: totalTurnover, chartSet (12 months), status |
| GET | `/clients/:clientId/tax-computation/breakdown` | CIT/VAT/WHT/PAYE Computation Breakdown with sub-items |
| GET | `/clients/:clientId/tax-computation/assumptions` | VAT Registration Status, CIT rate, MSME Exemption, Pioneer Tax |
| POST | `/clients/:clientId/filings` | Proceed filing |

**Threshold message:** "This business turnover in the last 12 months is below N25,000,000. VAT registration is not currently required..."

---

## Screen: Financials

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients/:clientId/financials/summary` | Metrics (total, clean, need review, flagged) |
| GET | `/clients/:clientId/financials/documents` | Table: invoiceNo, date, vendor, amount, status, fileType, confidence (0-100) |
| POST | `/clients/:clientId/financials/documents/upload` | Upload invoice PDF/DOCX → returns fileId |
| POST | `/clients/:clientId/financials/documents/:fileId/ocr-extract` | OCR extraction (mock) → returns extractionId |
| POST | `/clients/:clientId/financials/documents/:extractionId/vendor-identify` | Vendor identification → returns vendorId |
| POST | `/clients/:clientId/financials/documents/:vendorId/analyze` | Final analysis → valid invoice |
| GET | `/clients/:clientId/financials/documents/:id/review` | Review Invoice: metrics, invoice data, impact summary |

---

## Screen: Financial Report

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients/:clientId/financial-report/profit-loss?year=&month=` | Profit & Loss |
| GET | `/clients/:clientId/financial-report/balance-sheet?year=&month=` | Balance Sheet |

---

## Screen: Filings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients/:clientId/filings/summary` | submitted, inProgress, today, overdue (counts + days) |
| GET | `/clients/:clientId/filings/unfiled` | Unfiled items |
| GET | `/clients/:clientId/filings?page=&limit=&status=` | List filings |
| GET | `/clients/:clientId/filings/vat-returns` | VAT Return list (dueDate, readiness 0-100) |

---

## Screen: Evidence Vault

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients/:clientId/evidence-vault/stats` | Metrics: All Document, Invoice, Receipts, VAT Schedules, Filings, WHT Certs |
| GET | `/clients/:clientId/evidence-vault/documents?category=&page=` | List documents |
| GET | `/clients/:clientId/evidence-vault/documents/:id/download` | Download file |

---

## Screen: Profitability Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients/:clientId/financials/profitability/trends` | Profitability Trends (Jan-Dec: Revenue, Expenses, Net Profit) |
| GET | `/clients/:clientId/financials/profitability/expense-breakdown` | Expense Breakdown Chart (category, amount) |

---

## Screen: Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clients/:clientId/reports/taxes-summary` | Taxes Summary (Total Liability, VAT, CIT, WHT, breakdown) |
| GET | `/clients/:clientId/reports/vat-payment` | VAT Payment Report |
| GET | `/clients/:clientId/reports/cit` | CIT Computation Report |
| GET | `/clients/:clientId/reports/wht` | WHT Report |
| GET | `/clients/:clientId/reports/tax-withholding` | Tax Withholding Report |
| GET | `/clients/:clientId/reports/paye` | PAYE Computation Report |
| GET | `/clients/:clientId/reports/:reportId/download` | Download PDF |

---

## Screen: Compliance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/compliance/overview` | Pending Filings, Payment Due, Completed Filings |
| GET | `/compliance/upcoming-deadlines` | Table: client, taxType, deadline, status (Pending/Overdue/Filed) |

---

## Other Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload file (returns url, key) |
| DELETE | `/upload?key=` | Delete file |
| GET | `/profile` | Get profile |
| GET | `/contacts-and-types` | Contacts and types |
