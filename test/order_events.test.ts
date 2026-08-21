import assert from "node:assert/strict";
import test from "node:test";
import { buildOrderEvents, orderJobSchema } from "../src/order_events.js";

test("paid reserved orders emit receipt but omit updates without consent", () => {
  const input = orderJobSchema.parse({
    order_id: "ord_2048",
    customer_id: "patient-adjacent-customer-17",
    customer_email: "buyer@example.test",
    payment_status: "paid",
    inventory_reserved: true,
    receipt_id: "rcpt_2048",
    customer_updates_enabled: false,
  });
  const events = buildOrderEvents(input, new Date("2026-08-21T09:00:00.000Z"));

  assert.deepEqual(events.map((event) => event.service), [
    "checkout-job",
    "fulfillment-job",
    "receipt-job",
  ]);
  assert.equal(JSON.stringify(events).includes(input.customer_email), false);
  assert.match(String(events[0].metadata.customer_ref), /^[a-f0-9]{16}$/);
});

test("declined checkout does not release fulfillment", () => {
  const input = orderJobSchema.parse({
    order_id: "ord_4096",
    customer_id: "customer-22",
    customer_email: "buyer@example.test",
    payment_status: "declined",
    inventory_reserved: true,
    receipt_id: "rcpt_4096",
    customer_updates_enabled: true,
  });
  const events = buildOrderEvents(input, new Date("2026-08-21T09:00:00.000Z"));
  assert.deepEqual(events.map((event) => event.service), ["checkout-job"]);
});
