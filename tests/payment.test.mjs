import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { visitReceiptsSql, paymentLabel } from "../lib/pharmacy.payment.ts";

test("receipts join once per visit, exclude cancellations, and follow visit date", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE ovst (vn TEXT, vstdate TEXT);
      CREATE TABLE rcpt_print (vn TEXT, status TEXT, bill_amount REAL);
      INSERT INTO ovst VALUES ('v1','2026-09-17'),('v2','2026-09-17'),
        ('v3','2026-09-17'),('old','2026-09-16'),('v4','2026-09-17');
      INSERT INTO rcpt_print VALUES ('v1',NULL,100),('v1','',50),
        ('v1','ABORT',500),('v2',' abort ',100),('v3',NULL,0),('old',NULL,90);`);
    const rows = db.prepare(`SELECT v.vn, COALESCE(r.receipt_count,0) AS count,
      COALESCE(r.receipt_amount,0) AS amount FROM ovst v
      LEFT JOIN (${visitReceiptsSql()}) r ON r.vn=v.vn
      WHERE v.vstdate=? ORDER BY v.vn`).all("2026-09-17", "2026-09-17");
    assert.deepEqual(rows.map(r => ({...r})), [
      {vn:"v1",count:2,amount:150}, {vn:"v2",count:0,amount:0},
      {vn:"v3",count:1,amount:0}, {vn:"v4",count:0,amount:0},
    ]);
  } finally { db.close(); }
});

test("plain labels distinguish receipt evidence, zero receipts and refunds", () => {
  assert.equal(paymentLabel(0,0), "ยังไม่พบใบเสร็จ");
  assert.equal(paymentLabel(1,100), "จ่ายแล้ว (มีใบเสร็จ)");
  assert.equal(paymentLabel(1,0), "มีใบเสร็จ 0 บาท");
  assert.equal(paymentLabel(1,-20), "ตรวจสอบกับการเงิน");
});
