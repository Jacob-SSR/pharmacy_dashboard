import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { visitDrugsSql, hospitalDate } from "../lib/pharmacy.drugs.ts";

test("queue and details count unique positive-net drug codes for the visit day", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE ovst (vn TEXT, vstdate TEXT, an TEXT);
      CREATE TABLE drugitems (icode TEXT);
      CREATE TABLE opitemrece (vn TEXT, icode TEXT, qty REAL, vstdate TEXT);
      INSERT INTO ovst VALUES ('v1','2026-09-17',NULL),('v2','2026-09-17',''),
        ('old','2026-09-16',NULL),('ipd','2026-09-17','a1');
      INSERT INTO drugitems VALUES ('a'),('a'),('b'),('c'),('d'),('e');
      INSERT INTO opitemrece VALUES
        ('v1','a',10,'2026-09-17'),('v1','a',5,'2026-09-17'),
        ('v1','b',0.5,'2026-09-18'),('v1','c',20,'2026-09-17'),
        ('v1','c',-20,'2026-09-17'),('v1','d',0,'2026-09-17'),
        ('v1','e',NULL,'2026-09-17'),('v1','service',1,'2026-09-17'),
        ('v2','a',1,'2026-09-17'),('v2','b',1,'2026-09-17'),
        ('v2','c',1,'2026-09-17'),('v2','d',1,'2026-09-17'),
        ('old','a',5,'2026-09-17'),('ipd','a',5,'2026-09-17');
    `);
    const summary = db.prepare(`SELECT vn, COUNT(*) AS drug_items, SUM(qty) AS drug_qty
      FROM (${visitDrugsSql()}) drugs GROUP BY vn ORDER BY vn`).all("2026-09-17");
    assert.deepEqual(summary.map((r) => ({ ...r })), [
      { vn: "v1", drug_items: 2, drug_qty: 15.5 },
      { vn: "v2", drug_items: 4, drug_qty: 4 },
    ]);
    for (const row of summary) {
      const details = db.prepare(visitDrugsSql(true)).all("2026-09-17", row.vn);
      assert.equal(details.length, row.drug_items);
      assert.equal(details.reduce((n, r) => n + r.qty, 0), row.drug_qty);
    }
    assert.equal(db.prepare(visitDrugsSql(true)).all("2026-09-16", "v1").length, 0);
    assert.equal(db.prepare(visitDrugsSql(true)).all("2026-09-17", "' OR 1=1 --").length, 0);
  } finally {
    db.close();
  }
});

test("today follows Bangkok at the UTC date boundary", () => {
  assert.equal(hospitalDate(new Date("2026-09-16T16:59:59Z")), "2026-09-16");
  assert.equal(hospitalDate(new Date("2026-09-16T17:00:00Z")), "2026-09-17");
});
