const db = require('../database');

/**
 * ⚙️  Retrieves system settings from the database.
 * @returns {Object} Settings object or empty object if not found.
 */
function getSettings() {
    return db.prepare('SELECT * FROM settings LIMIT 1').get() || {};
}

/**
 * 📅  Strict date parser used across the system for consistency.
 */
function parseDateStrict(dateStr) {
    if (!dateStr || dateStr === "" || dateStr === "null" || dateStr === "pppoe") return null;
    
    let d;
    if (typeof dateStr !== 'string') {
        d = new Date(dateStr);
    } else if (dateStr.includes('/')) {
        // MM/DD/YYYY to YYYY-MM-DD
        const [m, dPart, y] = dateStr.split('/');
        // Support both M/D/YYYY and MM/DD/YYYY
        d = new Date(`${y}-${m.padStart(2, '0')}-${dPart.padStart(2, '0')}T12:00:00`);
    } else if (dateStr.includes('T')) {
        d = new Date(dateStr);
    } else {
        // Already YYYY-MM-DD or similar
        d = new Date(dateStr + 'T12:00:00');
    }
    
    return isNaN(d.getTime()) ? null : d;
}

/**
 * 📅  Calculate same-day next month properly (Fair Anniversary Cycle)
 * Ensures anniversary stays on the same day unless the day doesn't exist in the next month.
 */
function calculateNextDue(referenceDate, installationDate, forceToday = false) {
    const ref = referenceDate || new Date().toISOString().split('T')[0];
    
    const dRef = parseDateStrict(ref);
    const dInst = parseDateStrict(installationDate) || dRef;
    
    if (!dRef || !dInst) return ref;

    // The anchorDay is the 'billing day' (e.g. the 5th)
    const anchorDay = forceToday ? dRef.getDate() : dInst.getDate();
    
    // Jump precisely to the next month
    let nextYear = dRef.getFullYear();
    let nextMonth = dRef.getMonth() + 1;
    
    if (nextMonth > 11) { 
        nextYear++; 
        nextMonth = 0; 
    }
    
    // Handle months with different lengths (e.g. Jan 31 -> Feb 28)
    const lastDayOfTargetMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
    const targetDay = Math.min(anchorDay, lastDayOfTargetMonth);
    
    const res = new Date(nextYear, nextMonth, targetDay, 12, 0, 0);
    const yFinal = res.getFullYear();
    const mFinal = String(res.getMonth() + 1).padStart(2, '0');
    const dFinal = String(res.getDate()).padStart(2, '0');
    return `${yFinal}-${mFinal}-${dFinal}`;
}

/**
 * 📅  Add multiple months to a date correctly
 */
function addMonths(dateStr, months) {
    const d = parseDateStrict(dateStr);
    if (!d) return dateStr;
    
    const anchorDay = d.getDate();
    let nextYear = d.getFullYear();
    let nextMonth = d.getMonth() + months;
    
    while (nextMonth > 11) { 
        nextYear++; 
        nextMonth -= 12; 
    }
    while (nextMonth < 0) {
        nextYear--;
        nextMonth += 12;
    }
    
    const lastDayOfTargetMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
    const targetDay = Math.min(anchorDay, lastDayOfTargetMonth);
    
    const res = new Date(nextYear, nextMonth, targetDay, 12, 0, 0);
    const yFinal = res.getFullYear();
    const mFinal = String(res.getMonth() + 1).padStart(2, '0');
    const dFinal = String(res.getDate()).padStart(2, '0');
    return `${yFinal}-${mFinal}-${dFinal}`;
}

function sanitizePassword(p) {
    let s = String(p || '');
    if (s.endsWith('.0')) return s.slice(0, -2);
    return s;
}

/**
 * 📅  Calculates the next occurrence of a specific billing day (e.g., 2 or 17).
 * If today is past the billing day, it rolls over to the next month.
 */
function calculateCycleDate(billingDay, referenceDateStr = null) {
    const ref = referenceDateStr ? parseDateStrict(referenceDateStr) : new Date();
    if (!ref) return new Date().toISOString().split('T')[0];
    
    const targetDay = parseInt(billingDay, 10);
    if (isNaN(targetDay)) return ref.toISOString().split('T')[0];

    let y = ref.getFullYear();
    let m = ref.getMonth(); // 0-indexed

    // If today is past the target day, the next cycle is next month.
    if (ref.getDate() >= targetDay) {
        m++;
        if (m > 11) {
            m = 0;
            y++;
        }
    }

    const nextDate = new Date(y, m, targetDay, 12, 0, 0);
    const yFinal = nextDate.getFullYear();
    const mFinal = String(nextDate.getMonth() + 1).padStart(2, '0');
    const dFinal = String(nextDate.getDate()).padStart(2, '0');
    return `${yFinal}-${mFinal}-${dFinal}`;
}

module.exports = {
    getSettings,
    parseDateStrict,
    calculateNextDue,
    addMonths,
    sanitizePassword,
    calculateCycleDate
};
