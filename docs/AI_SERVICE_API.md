# AI Service API

Server-to-server API for external AI services to pull and update client records (sales, expenses, filings).

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
