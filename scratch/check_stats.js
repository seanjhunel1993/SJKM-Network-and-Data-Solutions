const db = require('../database');
const today = new Date().toLocaleDateString('en-CA');
const sevenDaysLater = new Date();
sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
const sevenDaysStr = sevenDaysLater.toLocaleDateString('en-CA');

const overdueCount = db.prepare("SELECT COUNT(*) as count FROM clients WHERE next_due_date < ? AND status NOT IN ('deleted', 'disconnected')").get(today).count;
const dueSoonCount = db.prepare("SELECT COUNT(*) as count FROM clients WHERE next_due_date >= ? AND next_due_date <= ? AND status NOT IN ('deleted', 'disconnected')").get(today, sevenDaysStr).count;
const totalClients = db.prepare("SELECT COUNT(*) as count FROM clients WHERE status != 'deleted'").get().count;
const disconnectedCount = db.prepare("SELECT COUNT(*) as count FROM clients WHERE status = 'disconnected'").get().count;

console.log({today, sevenDaysStr, overdueCount, dueSoonCount, totalClients, disconnectedCount});
