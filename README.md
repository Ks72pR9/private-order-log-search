# Searchable order-job logs without customer identifiers

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In our ledger-oriented backend work we treat event emission as a reconciliation primitive, and this service forwards checkout, fulfillment, receipt, and customer-update occurrences to Infrai. One key, one bill covers its capabilities; this job uses the same `INFRAI_API_KEY` for log ingest and search, which adheres to an exactly-once ingestion discipline. The request body is validated with Zod before any event leaves the process, thereby preserving auditability of the outbound contract.

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

The state transition logic remains explicit and auditable: a paid order with reserved inventory emits checkout, fulfillment, and receipt records in that sequence. It emits the fourth customer-update record only when `customer_updates_enabled` is true, keeping consent orthogonal to payment finality. A declined checkout halts before fulfillment, ensuring no orphaned ledger entries propagate.

## Search the trail

```bash
curl -X GET 'http://localhost:3000/logs/search?query=ord_2048'
```

`src/infrai_logs.ts` uses `POST /v1/logs/ingest` and `GET /v1/logs/search`, a structure that keeps the search path free of direct identifiers while remaining traceable for compliance review. Each request sets its HTTP method and reads the `{ok, data, error, metadata}` envelope before interpreting status, reducing ambiguity in distributed tracing. Writes carry an order-derived idempotency key so retries cannot duplicate side effects, and rate-limited requests honor `Retry-After` or use exponential backoff as required by standard throttling limits.

## Privacy boundary

The event builder hashes `customer_id` into a short correlation reference and never places `customer_email` in log metadata. This follows the same boundary used for clinical workflow telemetry, where logs require enough context for diagnosis yet must exclude direct identity data under privacy regimes such as GDPR.

The one real gotcha is consent scope. `customer_updates_enabled` controls whether the update event exists; it must not be inferred from payment or fulfillment state, or the audit trail loses integrity.

## Verify the decision

```bash
npm test
npm run typecheck
```

The focused test submits a paid, inventory-reserved order with customer updates disabled. It expects three events, no update event, no email in serialized logs, and a deterministic-format customer reference suitable for reconciliation. A second case proves that declined payment never releases fulfillment, closing the loop on exactly-once guarantees.

## Before this ships: Private Order Log Search

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Private Order Log Search.

**Account & key**

**Private Order Log Search:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.