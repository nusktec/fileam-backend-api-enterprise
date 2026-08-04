# AI Service API

Server-to-server API for external AI services to pull and update client records (sales, expenses, filings) and retrieve the evidence vault.

## Authentication

All requests require header-based auth:

| Header        | Description                                      |
|---------------|--------------------------------------------------|
| `X-Client-Id` | Client/user ID whose records to access           |
| `X-Api-Secret`| Secret (set via `AI_SERVICE_SECRET` env variable) |

## Endpoints

Base path: `/api/v1/ai`

### GET /records

Fetch records by type.

**Query params:**

| Param      | Required | Description                                      |
|------------|----------|--------------------------------------------------|
| `type`     | Yes      | `sales` \| `expenses` \| `filings`               |
| `page`     | No       | Page number (default: 1)                         |
| `limit`    | No       | Items per page (default: 20, max: 100)           |
| `sortOrder`| No       | `ASC` \| `DESC` (default: DESC)                  |
| `status`   | No       | Filter by status (sales, filings)                |
| `taxType`  | No       | Filter by tax type (filings only)                |
| `dateFrom` | No       | Inclusive start date (ISO)                       |
| `dateTo`   | No       | Inclusive end date (ISO)                         |

**Example:**

```bash
curl -X GET "http://localhost:5000/api/v1/ai/records?type=sales&page=1&limit=20" \
  -H "X-Client-Id: <userId>" \
  -H "X-Api-Secret: <AI_SERVICE_SECRET>"
```

### PATCH /records

Update a single record.

**Body (JSON):**

```json
{
  "type": "sales",
  "id": "<recordId>",
  "payload": {
    "description": "Updated description",
    "status": "Paid"
  }
}
```

**Payload fields by type:**

- **sales:** `description`, `category`, `customerName`, `amount`, `paymentType`, `date`, `vatableIncome`, `serviceIncome`, `status`
- **expenses:** `description`, `category`, `amount`, `vatInclusive`, `vatAmount`, `date`, `receiptUrl`
- **filings:** `status`, `documentUrl`, `submittedAt`, `receiptUrl`

**Example:**

```bash
curl -X PATCH "http://localhost:5000/api/v1/ai/records" \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: <userId>" \
  -H "X-Api-Secret: <AI_SERVICE_SECRET>" \
  -d '{"type":"sales","id":"<saleId>","payload":{"status":"Paid"}}'
```

### GET /evidence-vault/documents

List evidence vault documents for the client (same aggregation as mobile: sales invoices/receipts, expenses, tax payables, reports).

**Query params:**

| Param      | Required | Description |
|------------|----------|-------------|
| `search`   | No       | Free-text filter |
| `category` | No       | `all` \| `invoices` \| `receipts` \| `vat_schedules` \| `filings` \| `wht_notes` |
| `dateFrom` | No       | Inclusive start date (ISO) |
| `dateTo`   | No       | Inclusive end date (ISO) |

**Response `data`:** `{ documents: VaultDocument[], categoryCounts: { ... } }`

Document ids are composite, e.g. `sale-{uuid}`, `expense-{uuid}`, `payable-{uuid}`, `report-{uuid}`.

```bash
curl -X GET "http://localhost:5000/api/v1/ai/evidence-vault/documents?category=invoices" \
  -H "X-Client-Id: <userId>" \
  -H "X-Api-Secret: <AI_SERVICE_SECRET>"
```

### GET /evidence-vault/documents/:id

Fetch a single vault document by composite id.

### GET /evidence-vault/documents/:id/download

- If a stored `documentUrl` exists → JSON `{ url }`.
- Else if a PDF can be generated → binary PDF stream.
- Else → 404.
