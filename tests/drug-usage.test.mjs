import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { visitDrugUsagesSql } from "../lib/pharmacy.drugs.ts";

test("usage names follow the visit and keep multiple active usages without cancelled lines", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE ovst (vn TEXT, vstdate TEXT, an TEXT);
      CREATE TABLE opitemrece (vn TEXT, icode TEXT, drugusage TEXT, qty REAL);
      CREATE TABLE drugusage (drugusage TEXT, common_name TEXT, name1 TEXT);
      INSERT INTO ovst VALUES ('v1','2026-09-18',NULL),('v2','2026-09-18',NULL),('ipd','2026-09-18','a');
      INSERT INTO drugusage VALUES ('01','Usage A','Wrong field'),('01','Usage A','Wrong field'),
        ('02','Usage B','Wrong field'),('03',NULL,'Do not substitute'),('04','','Do not substitute');
      INSERT INTO opitemrece VALUES ('v1','a','01',10),('v1','a','01',-2),('v1','a','02',5),
        ('v1','b','02',5),('v1','b','02',-5),('v1','c','missing',1),
        ('v1','d','03',1),('v1','e','04',1),('v2','other','01',1),('ipd','inpatient','01',1);`);
    const query = db.prepare(visitDrugUsagesSql());
    assert.deepEqual(query.all('2026-09-18','v1').map(r => ({...r})), [
      {icode:'a',common_name:'Usage A'}, {icode:'a',common_name:'Usage B'},
      {icode:'c',common_name:null}, {icode:'d',common_name:null}, {icode:'e',common_name:''},
    ]);
    assert.equal(query.all('2026-09-17','v1').length,0);
    assert.equal(query.all('2026-09-18','ipd').length,0);
    assert.equal(query.all('2026-09-18',"' OR 1=1 --").length,0);
  } finally { db.close(); }
});
