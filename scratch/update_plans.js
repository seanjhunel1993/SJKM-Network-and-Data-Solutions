const db = require('../database');

const plans = [
  { id: '10mbps', name: '10MB', speed: '10 Mbps', price: 500, features: 'Unlimited Data\n1 WiFi Router\nEmail Support', is_popular: 1 },
  { id: '20mbps', name: '20MB', speed: '20 Mbps', price: 999, features: 'Unlimited Data\nDual-Band Router\nPriority Support', is_popular: 0 },
  { id: '30mbps', name: '30MB', speed: '30 Mbps', price: 1199, features: 'Unlimited Data\nHigh-Gain Router\n24/7 Phone Support', is_popular: 0 },
  { id: '40mbps', name: '40MB', speed: '40 Mbps', price: 1349, features: 'Unlimited Data\nGaming Optimized\nVIP Support', is_popular: 0 },
  { id: '50mbps', name: '50MB', speed: '50 Mbps', price: 1499, features: 'Unlimited Data\nEnterprise Router\nDedicated Support', is_popular: 0 },
  { id: '100mbps', name: '100MB', speed: '100 Mbps', price: 2499, features: 'Unlimited Data\nMesh WiFi System\nInstant On-site Support', is_popular: 0 }
];

console.log('🔄 Updating internet plans...');

db.transaction(() => {
  // Optional: Clear existing plans if you want a clean slate
  // db.prepare('DELETE FROM plans').run();

  for (const p of plans) {
    const exists = db.prepare('SELECT id FROM plans WHERE id = ?').get(p.id);
    if (exists) {
      db.prepare(`
        UPDATE plans 
        SET name = ?, speed = ?, price = ?, features = ?, is_popular = ?
        WHERE id = ?
      `).run(p.name, p.speed, p.price, p.features, p.is_popular, p.id);
      console.log(`✅ Updated: ${p.id}`);
    } else {
      db.prepare(`
        INSERT INTO plans (id, name, speed, price, features, is_popular, mikrotik_profile)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(p.id, p.name, p.speed, p.price, p.features, p.is_popular, p.id.toUpperCase());
      console.log(`✨ Inserted: ${p.id}`);
    }
  }
})();

console.log('🚀 All plans updated successfully!');
process.exit(0);
