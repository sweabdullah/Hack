const path = require('path');

let Database;
let db;

try {
  Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '..', 'retention.db');
  db = new Database(dbPath);
} catch (error) {
  console.warn('⚠️  Warning: better-sqlite3 native module not available. Database features will be disabled.');
  console.warn('   To enable database features, install Visual Studio Build Tools with C++ support.');
  console.warn('   Download: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022');
  db = null;
}

if (db) {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
  CREATE TABLE IF NOT EXISTS merchants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    manager_token TEXT,
    refresh_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zid_customer_id INTEGER UNIQUE NOT NULL,
    store_id INTEGER NOT NULL,
    name TEXT,
    phone TEXT,
    email TEXT,
    total_orders INTEGER DEFAULT 0,
    total_spent REAL DEFAULT 0,
    first_order_date DATETIME,
    last_order_date DATETIME,
    days_since_last_order INTEGER,
    segment TEXT DEFAULT 'NEW',
    is_vip INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES merchants(store_id)
  );

  CREATE TABLE IF NOT EXISTS product_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    store_id INTEGER NOT NULL,
    product_name TEXT,
    avg_days_to_finish INTEGER DEFAULT 30,
    offset_days INTEGER DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, store_id),
    FOREIGN KEY (store_id) REFERENCES merchants(store_id)
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    order_id INTEGER NOT NULL,
    send_at DATETIME NOT NULL,
    status TEXT DEFAULT 'PENDING',
    message_template TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE INDEX IF NOT EXISTS idx_customers_store_segment ON customers(store_id, segment);
  CREATE INDEX IF NOT EXISTS idx_reminders_status_send_at ON reminders(status, send_at);
  CREATE INDEX IF NOT EXISTS idx_product_settings_store ON product_settings(store_id);
`);
}

module.exports = db;

