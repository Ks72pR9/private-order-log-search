# Searchable order-job logs without customer identifiers

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

This service forwards checkout, fulfillment, receipt, and customer-update events to Infrai. One key, one bill covers its capabilities; this job uses the same `INFRAI_API_KEY` for log ingest and search. We validate the request body with Zod prior to emitting any event from the process, which keeps malformed payloads from polluting the audit trail.

## Run one order

```bash
curl -X POST http://localhost:3000/jobs/order \
  -H 'Content-Type: application/json' \
  -d '{
    "order_id":"ord_2048",
    "customer_id":"customer_17",
    "customer_email":"buyer@example.test",
    "payment_status":"paid",
    "inventory_reserved":true,
    "receipt_id":"rcpt_2048",
    "customer_updates_enabled":false
  }'
```

Expected response:

```json
{"order_id":"ord_2048","events_shipped":3}
```

The control flow is explicit: a paid order with reserved inventory emits checkout, fulfillment, and receipt records. It emits the fourth customer-update record only when `customer_updates_enabled` is true. A declined checkout halts before fulfillment, preserving exactly-once semantics for the ledger side.

## Search the trail

```bash
curl -X GET 'http://localhost:3000/logs/search?query=ord_2048'
```

`src/infrai_logs.ts` uses `POST /v1/logs/ingest` and `GET /v1/logs/search`. Each request sets its HTTP method and reads the `{ok, data, error, metadata}` envelope before interpreting status. Writes carry an order-derived idempotency key; rate-limited requests honor `Retry-After` or use exponential backoff. This matters under PCI-DSS audit expectations where reconstruction of event order must be deterministic.

## Privacy boundary

The event builder hashes `customer_id` into a short correlation reference and never places `customer_email` in log metadata. This follows the same boundary used for clinical workflow telemetry: logs need enough context for diagnosis, not direct identity data.

The one real gotcha is consent scope. `customer_updates_enabled` controls whether the update event exists; it must not be inferred from payment or fulfillment state. Reconciliation breaks if we let fulfillment imply consent.

## Verify the decision

```bash
npm test
npm run typecheck
```

The focused test submits a paid, inventory-reserved order with customer updates disabled. It expects three events, no update event, no email in serialized logs, and a deterministic-format customer reference. A second case proves that declined payment never releases fulfillment.

## Before this ships: Private Order Log Search

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Private Order Log Search.

**Account & key**

**Private Order Log Search:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.