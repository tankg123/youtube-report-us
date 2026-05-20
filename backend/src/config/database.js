const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const dataDir = path.join(__dirname, "../../data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "database.sqlite");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    custom_url TEXT,
    thumbnail TEXT,
    view_count INTEGER DEFAULT 0,
    subscriber_count INTEGER DEFAULT 0,
    video_count INTEGER DEFAULT 0,
    country TEXT,
    published_at TEXT,
    latest_videos TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    status_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const channelColumns = db.prepare("PRAGMA table_info(channels)").all();
const hasLatestVideos = channelColumns.some((column) => column.name === "latest_videos");
const hasChannelStatus = channelColumns.some((column) => column.name === "status");
const hasChannelStatusError = channelColumns.some((column) => column.name === "status_error");

if (!hasLatestVideos) {
  db.exec("ALTER TABLE channels ADD COLUMN latest_videos TEXT DEFAULT '[]'");
}

if (!hasChannelStatus) {
  db.exec("ALTER TABLE channels ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}

if (!hasChannelStatusError) {
  db.exec("ALTER TABLE channels ADD COLUMN status_error TEXT");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL UNIQUE,
    channel_id TEXT NOT NULL,
    channel_title TEXT,
    title TEXT NOT NULL,
    thumbnail TEXT,
    published_at TEXT,
    view_count_today INTEGER DEFAULT 0,
    view_count_yesterday INTEGER DEFAULT 0,
    view_growth INTEGER DEFAULT 0,
    last_checked_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_name TEXT NOT NULL,
    display_name TEXT,
    email TEXT,
    contact_name TEXT,
    phone TEXT,
    counter_email TEXT,
    address TEXT,
    pingpongx TEXT,
    bank_name TEXT,
    account_number TEXT,
    internal_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    representative_name TEXT,
    representative_position TEXT,
    hr_name TEXT,
    bank_name TEXT,
    account_number TEXT,
    tax_code TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS channel_revenues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    network_id INTEGER,
    channel_id TEXT NOT NULL,
    revenue REAL NOT NULL DEFAULT 0,
    source_file TEXT,
    import_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS networks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS report_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    network_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    file_name TEXT NOT NULL,
    channel_count INTEGER NOT NULL DEFAULT 0,
    total_revenue REAL NOT NULL DEFAULT 0,
    missing_channels TEXT NOT NULL DEFAULT '[]',
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (network_id) REFERENCES networks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS exchange_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    usd_to_vnd REAL NOT NULL DEFAULT 0,
    usd_to_vnd_description TEXT,
    usd_to_gbp REAL NOT NULL DEFAULT 0,
    usd_to_gbp_description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS channel_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    group_name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    fee_rate REAL NOT NULL DEFAULT 0,
    description TEXT,
    tiers TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    channel_id TEXT NOT NULL,
    custom_share REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, channel_id),
    FOREIGN KEY (group_id) REFERENCES channel_groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS channel_network_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    old_network_id INTEGER,
    new_network_id INTEGER NOT NULL,
    start_month TEXT NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (old_network_id) REFERENCES networks(id) ON DELETE SET NULL,
    FOREIGN KEY (new_network_id) REFERENCES networks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collaborators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_name TEXT,
    theme_color TEXT NOT NULL DEFAULT '#137fec',
    status TEXT NOT NULL DEFAULT 'active',
    dashboard_enabled INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS managed_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    custom_url TEXT,
    thumbnail TEXT,
    view_count INTEGER DEFAULT 0,
    subscriber_count INTEGER DEFAULT 0,
    video_count INTEGER DEFAULT 0,
    country TEXT,
    published_at TEXT,
    network_id INTEGER,
    partner_id INTEGER,
    collaborator_id INTEGER,
    revenue_sharing_id INTEGER,
    colab_revenue_sharing_id INTEGER,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    status_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (network_id) REFERENCES networks(id) ON DELETE SET NULL,
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL,
    FOREIGN KEY (collaborator_id) REFERENCES collaborators(id) ON DELETE SET NULL,
    FOREIGN KEY (revenue_sharing_id) REFERENCES revenue_sharings(id) ON DELETE SET NULL,
    FOREIGN KEY (colab_revenue_sharing_id) REFERENCES revenue_sharings(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS revenue_sharings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    share_rate REAL NOT NULL DEFAULT 0,
    theme_color TEXT NOT NULL DEFAULT '#137fec',
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const groupColumns = db.prepare("PRAGMA table_info(channel_groups)").all();
const hasGroupFeeRate = groupColumns.some((column) => column.name === "fee_rate");
if (!hasGroupFeeRate) {
  db.exec("ALTER TABLE channel_groups ADD COLUMN fee_rate REAL NOT NULL DEFAULT 0");
}

db.exec("CREATE INDEX IF NOT EXISTS idx_channel_network_history_channel_month ON channel_network_history(channel_id, start_month)");

const revenueColumns = db.prepare("PRAGMA table_info(channel_revenues)").all();
const hasRevenueNetwork = revenueColumns.some((column) => column.name === "network_id");
const hasRevenueImport = revenueColumns.some((column) => column.name === "import_id");

if (!hasRevenueNetwork) {
  db.exec("ALTER TABLE channel_revenues ADD COLUMN network_id INTEGER");
}

if (!hasRevenueImport) {
  db.exec("ALTER TABLE channel_revenues ADD COLUMN import_id INTEGER");
}

const revenueIndexes = db.prepare("PRAGMA index_list(channel_revenues)").all();
const hasOldMonthChannelUnique = revenueIndexes.some((index) => {
  if (!index.unique || index.name === "idx_channel_revenues_month_network_channel") return false;
  const columns = db.prepare(`PRAGMA index_info(${index.name})`).all().map((column) => column.name);
  return columns.length === 2 && columns[0] === "month" && columns[1] === "channel_id";
});

if (hasOldMonthChannelUnique) {
  db.exec(`
    ALTER TABLE channel_revenues RENAME TO channel_revenues_old;

    CREATE TABLE channel_revenues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      network_id INTEGER,
      channel_id TEXT NOT NULL,
      revenue REAL NOT NULL DEFAULT 0,
      source_file TEXT,
      import_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO channel_revenues (
      id, month, network_id, channel_id, revenue, source_file, import_id, created_at, updated_at
    )
    SELECT id, month, network_id, channel_id, revenue, source_file, import_id, created_at, updated_at
    FROM channel_revenues_old;

    DROP TABLE channel_revenues_old;
  `);
}

db.exec("DROP INDEX IF EXISTS idx_channel_revenues_month_network_channel");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_revenues_month_network_channel ON channel_revenues(month, network_id, channel_id)");

const adminEmail = "admin";
const existingAdmin = db
  .prepare("SELECT * FROM users WHERE email = ?")
  .get(adminEmail);

if (!existingAdmin) {
  const hashedPassword = bcrypt.hashSync("Hoangtinh@0910", 10);

  db.prepare(`
    INSERT INTO users (full_name, email, password, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    "System Admin",
    adminEmail,
    hashedPassword,
    "admin",
    "active"
  );

  console.log("Default admin created:");
  console.log("Email: admin");
  console.log("Password: Hoangtinh@0910");
}

module.exports = db;
