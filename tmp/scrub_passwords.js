const db = require('better-sqlite3')('data/isp_db.sqlite');
const res1 = db.prepare("UPDATE clients SET pppoe_pass = SUBSTR(pppoe_pass, 1, LENGTH(pppoe_pass) - 2) WHERE pppoe_pass LIKE '%.0'").run();
const res2 = db.prepare("UPDATE clients SET web_password = SUBSTR(web_password, 1, LENGTH(web_password) - 2) WHERE web_password LIKE '%.0'").run();
console.log(`Cleaned ${res1.changes} pppoe passwords and ${res2.changes} web passwords.`);
