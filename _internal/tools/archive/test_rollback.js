
const db = require('../database');

function parseDateStrict(dateStr) {
  if (!dateStr || dateStr === "" || dateStr === "null" || dateStr === "pppoe") return null;
  let d;
  if (dateStr.includes('/')) {
    const [m, dPart, y] = dateStr.split('/');
    d = new Date(`${y}-${m.padStart(2, '0')}-${dPart.padStart(2, '0')}T12:00:00`);
  } else if (dateStr.includes('T')) {
    d = new Date(dateStr);
  } else {
    d = new Date(dateStr + 'T12:00:00');
  }
  return isNaN(d.getTime()) ? null : d;
}

function addMonths(dateStr, months) {
  const d = parseDateStrict(dateStr);
  if (!d) return dateStr;
  const anchorDay = d.getDate();
  let nextYear = d.getFullYear();
  let nextMonth = d.getMonth() + months;
  while (nextMonth > 11) { nextYear++; nextMonth -= 12; }
  while (nextMonth < 0) { nextYear--; nextMonth += 12; }
  const lastDayOfTargetMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
  const targetDay = Math.min(anchorDay, lastDayOfTargetMonth);
  const res = new Date(nextYear, nextMonth, targetDay, 12, 0, 0);
  const y = res.getFullYear();
  const m = String(res.getMonth() + 1).padStart(2, '0');
  const dFinal = String(res.getDate()).padStart(2, '0');
  return `${y}-${m}-${dFinal}`;
}

console.log('🧪 Testing Rollback Dates...');
console.log('May 1 -> April 1:', addMonths('2026-05-01', -1));
console.log('Jan 1 -> Dec 1 (Prev Year):', addMonths('2026-01-01', -1));
console.log('Mar 31 -> Feb 28/29:', addMonths('2026-03-31', -1));

const testDate = '2026-04-01';
const rolled = addMonths(testDate, -1);
console.log(`Rollback ${testDate} -> ${rolled}`);

if (rolled === '2026-03-01') {
  console.log('✅ Date logic PASSED');
} else {
  console.log('❌ Date logic FAILED');
}
