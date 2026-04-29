# API Reference — Shree Cement House

Base URL: `http://localhost:4000` (dev) · `https://your-domain.com` (prod)

All routes except `/api/auth/login` require:
```
Authorization: Bearer <jwt_token>
```

---

## Auth

### POST /api/auth/login
```json
// Request
{ "phone": "9876543210", "password": "owner123" }

// Response 200
{ "success": true, "data": { "token": "eyJ...", "user": { "id": "...", "name": "Ramesh Kumar", "role": "OWNER" } } }
```

---

## Orders

| Method | Path                       | Description                          | Role  |
|--------|----------------------------|--------------------------------------|-------|
| GET    | /api/orders                | List orders (filter: status, page)   | Both  |
| GET    | /api/orders/:id            | Single order with items + deliveries | Both  |
| POST   | /api/orders                | Create order (debits ledger, deducts stock) | Both |
| PATCH  | /api/orders/:id/status     | Change order status                  | Both  |
| GET    | /api/orders/:id/challan    | Download PDF challan                 | Both  |

### POST /api/orders — body
```json
{
  "customerId": "uuid",
  "deliveryDate": "2026-04-22T00:00:00Z",
  "paymentMode": "CASH | UPI | CHEQUE | CREDIT | PARTIAL",
  "amountPaid": 38000,
  "notes": "optional",
  "items": [
    { "materialId": "uuid", "quantity": 100, "unitPrice": 380, "purchasePrice": 350 }
  ]
}
```

---

## Customers

| Method | Path                        | Description                        | Role  |
|--------|-----------------------------|------------------------------------|-------|
| GET    | /api/customers              | List with balance (filter: search, riskTag) | Both |
| GET    | /api/customers/:id          | Full profile + stats               | Both  |
| POST   | /api/customers              | Create customer                    | Both  |
| PATCH  | /api/customers/:id          | Update customer fields             | Both  |
| PATCH  | /api/customers/:id/risk     | Change risk tag                    | Owner |
| DELETE | /api/customers/:id          | Soft delete (sets isActive=false)  | Owner |

---

## Ledger (Khata)

| Method | Path                                | Description                  | Role  |
|--------|-------------------------------------|------------------------------|-------|
| GET    | /api/ledger/:customerId             | Full ledger + running balance | Both  |
| GET    | /api/ledger/summary/all             | All customers with balance   | Both  |
| POST   | /api/ledger/payment                 | Record a payment (CREDIT)    | Both  |
| GET    | /api/ledger/:customerId/statement   | Download PDF statement       | Both  |

### POST /api/ledger/payment — body
```json
{ "customerId": "uuid", "amount": 20000, "paymentMode": "UPI", "reference": "TXN123456", "orderId": "uuid (optional)" }
```

---

## Inventory

| Method | Path                           | Description                     | Role  |
|--------|--------------------------------|---------------------------------|-------|
| GET    | /api/inventory                 | All materials with stock status | Both  |
| POST   | /api/inventory/stock-in        | Add stock from supplier         | Both  |
| POST   | /api/inventory/bill-scans      | Scan seller bill image into editable draft | Both |
| GET    | /api/inventory/bill-scans/:id  | Get bill scan draft with match candidates | Both |
| POST   | /api/inventory/bill-scans/:id/commit | Import reviewed bill lines into stock | Both |
| POST   | /api/inventory/adjust          | Manual stock correction         | Owner |
| GET    | /api/inventory/:id/movements   | Audit trail for one material    | Both  |

### POST /api/inventory/bill-scans — body
```json
{
  "fileName": "supplier-bill.jpg",
  "dataUrl": "data:image/jpeg;base64,..."
}
```

Returns an editable draft. Inventory is not changed until commit.

Requires `GEMINI_API_KEY`; optional `GEMINI_BILL_SCAN_MODEL` defaults to `gemini-2.0-flash`.

### POST /api/inventory/bill-scans/:id/commit — body
```json
{
  "lines": [
    {
      "lineId": "uuid",
      "action": "APPLY",
      "materialId": "existing-material-uuid",
      "unit": "bags",
      "quantity": 200,
      "purchasePrice": 250,
      "lineTotal": 50000
    },
    {
      "lineId": "uuid",
      "action": "APPLY",
      "createMaterial": {
        "name": "New Cement Brand",
        "unit": "bags",
        "salePrice": 350
      },
      "unit": "bags",
      "quantity": 100,
      "purchasePrice": 260
    }
  ]
}
```

---

## Delivery

| Method | Path                          | Description                           | Role  |
|--------|-------------------------------|---------------------------------------|-------|
| GET    | /api/delivery                 | List (filter: status, date)           | Both  |
| GET    | /api/delivery/:id             | Single delivery with items            | Both  |
| POST   | /api/delivery                 | Create challan from order             | Both  |
| PATCH  | /api/delivery/:id/dispatch    | Mark as in transit                    | Both  |
| PATCH  | /api/delivery/:id/confirm     | Mark delivered (OTP/photo/manual)     | Both  |
| PATCH  | /api/delivery/:id/fail        | Mark failed + revert order status     | Both  |
| GET    | /api/delivery/today/summary   | Today's board (counts + list)         | Both  |

### POST /api/delivery — body
```json
{
  "orderId": "uuid",
  "driverName": "Mangal Singh",
  "vehicleNumber": "HR-10 AB 1234",
  "items": [
    { "materialId": "uuid", "orderedQty": 100, "deliveredQty": 100 }
  ]
}
```

### PATCH /api/delivery/:id/confirm — body
```json
{ "confirmationType": "OTP | PHOTO | MANUAL", "confirmationRef": "4821" }
```

---

## Reminders

| Method | Path                   | Description                             | Role  |
|--------|------------------------|-----------------------------------------|-------|
| GET    | /api/reminders         | Recent reminders log                    | Both  |
| POST   | /api/reminders/send    | Send reminder to one customer           | Owner |
| POST   | /api/reminders/bulk    | Send to all overdue customers           | Owner |

---

## Reports

| Method | Path                        | Description                     | Role  |
|--------|-----------------------------|---------------------------------|-------|
| GET    | /api/reports/dashboard      | Today's KPIs                    | Both  |
| GET    | /api/reports/monthly        | Monthly summary (?year=&month=) | Owner |

---

## Error format

All errors follow:
```json
{ "success": false, "error": "Human-readable message", "code": "OPTIONAL_CODE" }
```

Common HTTP codes:
- `400` — bad request / validation failure
- `401` — missing or invalid JWT
- `403` — action requires OWNER role
- `404` — resource not found
- `409` — conflict (e.g. duplicate phone number)
