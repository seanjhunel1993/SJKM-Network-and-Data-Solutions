const db = require('./database');
const mikrotik = require('./mikrotik');

// Mock calculateNextDue (re-implemented here for testing)
function calculateNextDue(referenceDate) {
  const d = new Date(referenceDate + 'T12:00:00'); 
  let nextYear = d.getFullYear();
  let nextMonth = d.getMonth() + 1;
  if (nextMonth > 11) { nextYear++; nextMonth = 0; }
  const daysInNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
  const targetDay = Math.min(d.getDate(), daysInNextMonth);
  const resDate = new Date(nextYear, nextMonth, targetDay);
  return resDate.toISOString().split('T')[0];
}

async function runTests() {
  console.log('🧪 Starting Conditional Billing Cycle Tests...\n');

  // Test 1: Date Correction (February & Short Months)
  console.log('--- Test 1: Date Correction (e.g. Feb 31st -> 28/29th) ---');
  const d1 = '2024-01-31';
  const next1 = calculateNextDue(d1);
  console.log(`Input: ${d1}, Expected: 2024-02-29 (Leap), Result: ${next1}`);
  if (next1 === '2024-02-29') console.log('✅ Passed'); else console.log('❌ Failed');

  const d2 = '2024-03-31';
  const next2 = calculateNextDue(d2);
  console.log(`Input: ${d2}, Expected: 2024-04-30, Result: ${next2}`);
  if (next2 === '2024-04-30') console.log('✅ Passed'); else console.log('❌ Failed');

  // Test 2: Early Payment (Stability)
  console.log('\n--- Test 2: Early Payment (Keep Same Day) ---');
  const oldDue2 = '2024-04-12';
  const payDate2 = '2024-04-05'; // 7 days early
  const isLate2 = new Date(payDate2) > new Date(oldDue2); // simplified for test
  const calculatedDue2 = isLate2 ? calculateNextDue(payDate2) : calculateNextDue(oldDue2);
  const expectedDue2 = '2024-05-12'; 
  console.log(`Due: ${oldDue2}, Pay Early: ${payDate2}, Expected: ${expectedDue2}, Result: ${calculatedDue2}`);
  if (calculatedDue2 === expectedDue2) console.log('✅ Passed'); else console.log('❌ Failed');

  // Test 3: On-Time Payment (Stability)
  console.log('\n--- Test 3: On-Time Payment (Keep Same Day) ---');
  const oldDue3 = '2024-04-12';
  const payDate3 = '2024-04-12'; // exactly on time
  const isLate3 = new Date(payDate3 + 'T12:00:00') > new Date(oldDue3 + 'T12:00:00');
  const calculatedDue3 = isLate3 ? calculateNextDue(payDate3) : calculateNextDue(oldDue3);
  const expectedDue3 = '2024-05-12'; 
  console.log(`Due: ${oldDue3}, Pay On-Time: ${payDate3}, Expected: ${expectedDue3}, Result: ${calculatedDue3}`);
  if (calculatedDue3 === expectedDue3) console.log('✅ Passed'); else console.log('❌ Failed');

  // Test 4: Late Payment (Shift Reset)
  console.log('\n--- Test 4: Late Payment (Reset to Payment Day) ---');
  const oldDue4 = '2024-04-12';
  const payDate4 = '2024-04-18'; // 6 days late
  const isLate4 = new Date(payDate4 + 'T12:00:00') > new Date(oldDue4 + 'T12:00:00');
  const calculatedDue4 = isLate4 ? calculateNextDue(payDate4) : calculateNextDue(oldDue4);
  const expectedDue4 = '2024-05-18'; 
  console.log(`Due: ${oldDue4}, Pay Late: ${payDate4}, Expected: ${expectedDue4}, Result: ${calculatedDue4}`);
  if (calculatedDue4 === expectedDue4) console.log('✅ Passed'); else console.log('❌ Failed');

  console.log('\n🏁 Tests Completed.');
}

runTests();
