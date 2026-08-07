function testCalculateNextDue(ref, inst, forceToday) {
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

  const nowStr = '2026-04-04'; // Assume today is Apr 4
  const finalRef = forceToday ? nowStr : (ref || nowStr);
  const dRef = parseDateStrict(finalRef);
  const dInst = parseDateStrict(inst) || dRef;
  
  const anchorDay = forceToday ? dRef.getDate() : dInst.getDate();
  let nextYear = dRef.getFullYear();
  let nextMonth = dRef.getMonth() + 1; 
  if (nextMonth > 11) { nextYear++; nextMonth = 0; }
  const lastDayOfTargetMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
  const targetDay = Math.min(anchorDay, lastDayOfTargetMonth);
  const res = new Date(nextYear, nextMonth, targetDay, 12, 0, 0);
  const y = res.getFullYear();
  const m = String(res.getMonth() + 1).padStart(2, '0');
  const d = String(res.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

console.log('Test 1 (APR 2 -> MAY 2):', testCalculateNextDue('2026-04-02', null, false));
console.log('Test 2 (MAR 30 -> MAY 4 - Late Payment on Apr 4):', testCalculateNextDue('2026-03-30', null, true));
