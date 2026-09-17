/** Aggregate receipts before joining the queue: one row per VN, no drug-line multiplication. */
export function visitReceiptsSql(): string {
  return `SELECT r.vn, COUNT(*) AS receipt_count,
    SUM(COALESCE(r.bill_amount, 0)) AS receipt_amount
    FROM rcpt_print r
    WHERE (r.status IS NULL OR UPPER(TRIM(r.status)) <> 'ABORT')
      AND EXISTS (SELECT 1 FROM ovst v WHERE v.vn = r.vn AND v.vstdate = ?)
    GROUP BY r.vn`;
}

/** Receipt evidence only; does not certify that the whole visit is fully settled. */
export function paymentLabel(count: number, amount: number): string {
  if (count <= 0) return "ยังไม่พบใบเสร็จ";
  if (amount > 0) return "จ่ายแล้ว (มีใบเสร็จ)";
  if (amount === 0) return "มีใบเสร็จ 0 บาท";
  return "ตรวจสอบกับการเงิน";
}
