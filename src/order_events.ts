import { createHash } from "node:crypto";
import { z } from "zod";
import type { LogRecord } from "./infrai_logs.js";

export const orderJobSchema = z.object({
  order_id: z.string().min(1),
  customer_id: z.string().min(1),
  customer_email: z.string().email(),
  payment_status: z.enum(["paid", "declined"]),
  inventory_reserved: z.boolean(),
  receipt_id: z.string().min(1),
  customer_updates_enabled: z.boolean(),
});

export type OrderJob = z.infer<typeof orderJobSchema>;

export function buildOrderEvents(input: OrderJob, now: Date): LogRecord[] {
  const customerRef = createHash("sha256").update(input.customer_id).digest("hex").slice(0, 16);
  const shared = {
    order_id: input.order_id,
    customer_ref: customerRef,
  };
  const timestamp = now.toISOString();
  const checkoutAccepted = input.payment_status === "paid";
  const fulfillmentReady = checkoutAccepted && input.inventory_reserved;
  const records: LogRecord[] = [
    {
      message: "checkout evaluated",
      level: checkoutAccepted ? "info" : "warn",
      service: "checkout-job",
      timestamp,
      metadata: { ...shared, checkout_status: checkoutAccepted ? "accepted" : "declined" },
    },
  ];

  if (!fulfillmentReady) return records;

  records.push(
    {
      message: "fulfillment released",
      level: "info",
      service: "fulfillment-job",
      timestamp,
      metadata: { ...shared, fulfillment_status: "released" },
    },
    {
      message: "receipt recorded",
      level: "info",
      service: "receipt-job",
      timestamp,
      metadata: { ...shared, receipt_id: input.receipt_id },
    },
  );

  if (input.customer_updates_enabled) {
    records.push({
      message: "customer order update queued",
      level: "info",
      service: "order-update-job",
      timestamp,
      metadata: { ...shared, update_status: "queued" },
    });
  }
  return records;
}
