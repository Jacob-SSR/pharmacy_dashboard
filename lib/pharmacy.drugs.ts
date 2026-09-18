/** Shared by queue totals and details. Parameters: visit date, then optional VN.
 * Count drug codes with positive net quantity, including returns before filtering.
 * Anchor the day to ovst, as cashier does, rather than the item posting date.
 * EXISTS avoids multiplying quantities if a drug catalogue contains duplicates.
 */
export function visitDrugsSql(singleVisit = false): string {
  return `
    SELECT op.vn, op.icode, SUM(COALESCE(op.qty, 0)) AS qty
    FROM opitemrece op
    INNER JOIN ovst visit ON visit.vn = op.vn
    WHERE visit.vstdate = ?
      AND (visit.an IS NULL OR visit.an = '')
      ${singleVisit ? "AND op.vn = ?" : ""}
      AND EXISTS (SELECT 1 FROM drugitems catalog WHERE catalog.icode = op.icode)
    GROUP BY op.vn, op.icode
    HAVING SUM(COALESCE(op.qty, 0)) > 0
  `;
}

/** Parameters: visit date, VN. Keep every active usage for a drug, including missing catalogue text. */
export function visitDrugUsagesSql(): string {
  return `
    SELECT DISTINCT active.icode, du.common_name
    FROM (
      SELECT op.icode, op.drugusage
      FROM opitemrece op
      INNER JOIN ovst visit ON visit.vn = op.vn
      WHERE visit.vstdate = ? AND op.vn = ?
        AND (visit.an IS NULL OR visit.an = '')
      GROUP BY op.icode, op.drugusage
      HAVING SUM(COALESCE(op.qty, 0)) > 0
    ) active
    LEFT JOIN drugusage du ON du.drugusage = active.drugusage
    ORDER BY active.icode, du.common_name
  `;
}

export function hospitalDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
