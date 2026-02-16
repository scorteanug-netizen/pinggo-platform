# Lead Ingestion API (v1)

## Endpoint

- `POST /api/v1/leads`

## Headers

- `Idempotency-Key` (optional)

## Request JSON example

```json
{
  "workspaceId": "ck_workspace_123",
  "firstName": "Ana",
  "lastName": "Popescu",
  "email": "ana@example.com",
  "phone": "+40123456789",
  "source": "web_form",
  "externalId": "lead-ext-001"
}
```

## Response JSON examples

### `201 Created` (new lead)

```json
{
  "leadId": "0d0f9e77-2f0b-4dbf-9d97-84c5a5ddf4fb",
  "sla": {
    "startedAt": "2026-02-13T12:00:00.000Z",
    "deadlineAt": "2026-02-13T12:15:00.000Z"
  },
  "idempotency": {
    "reused": false
  }
}
```

### `200 OK` (idempotent replay)

```json
{
  "leadId": "0d0f9e77-2f0b-4dbf-9d97-84c5a5ddf4fb",
  "sla": {
    "startedAt": "2026-02-13T12:00:00.000Z",
    "deadlineAt": "2026-02-13T12:15:00.000Z"
  },
  "idempotency": {
    "reused": true
  }
}
```

## Notes

- In v1, `deadlineAt` is fixed to `now + 15 minutes`.
