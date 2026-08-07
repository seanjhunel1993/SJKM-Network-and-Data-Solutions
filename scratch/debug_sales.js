const db = require('../database');
const today = new Date().toISOString().split('T')[0];
const sevenDaysLater = new Date();
sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
const sevenDaysStr = sevenDaysLater.toISOString().split('T')[0];

const totalRevenue = db.prepare("SELECT SUM(amount) as total FROM payments WHERE status = 'paid'").get().total || 0;
const totalClients = db.prepare("SELECT COUNT(*) as count FROM clients WHERE status != 'deleted'").get().count;
const monthlyTarget = db.prepare("SELECT SUM(CAST(monthly_rate AS REAL)) as total FROM clients WHERE status != 'deleted'").get().total || 0;
const overdueCount = db.prepare("SELECT COUNT(*) as count FROM clients WHERE next_due_date < ? AND status != 'deleted'").get(today).count;
const dueSoonCount = db.prepare("SELECT COUNT(*) as count FROM clients WHERE next_due_date >= ? AND next_due_date <= ? AND status != 'deleted'").get(today, sevenDaysStr).count;

const currentMonth = new Date().toISOString().split('T')[0].substring(0, 7);
const monthCollection = db.prepare("SELECT SUM(amount) as total FROM payments WHERE status = 'paid' AND SUBSTR(paid_date, 1, 7) = ?").get(currentMonth).total || 0;

const arpu = totalClients > 0 ? (monthlyTarget / totalClients) : 0;
const collectionEfficiency = monthlyTarget > 0 ? (monthCollection / monthlyTarget) * 100 : 0;

console.log({
    totalRevenue,
    totalClients,
    monthlyTarget,
    overdueCount,
    dueSoonCount,
    monthCollection,
    arpu,
    collectionEfficiency
});
