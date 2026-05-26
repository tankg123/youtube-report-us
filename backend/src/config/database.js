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
    first_name TEXT,
    last_name TEXT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    email_verified INTEGER NOT NULL DEFAULT 1,
    email_verified_at DATETIME,
    two_factor_enabled INTEGER NOT NULL DEFAULT 0,
    two_factor_secret TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.some((column) => column.name === "first_name")) {
  db.exec("ALTER TABLE users ADD COLUMN first_name TEXT");
}
if (!userColumns.some((column) => column.name === "last_name")) {
  db.exec("ALTER TABLE users ADD COLUMN last_name TEXT");
}
if (!userColumns.some((column) => column.name === "email_verified")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1");
}
if (!userColumns.some((column) => column.name === "email_verified_at")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified_at DATETIME");
}
if (!userColumns.some((column) => column.name === "two_factor_enabled")) {
  db.exec("ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.some((column) => column.name === "two_factor_secret")) {
  db.exec("ALTER TABLE users ADD COLUMN two_factor_secret TEXT");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS email_verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec("CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_codes(user_id, used_at, expires_at)");

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

  CREATE TABLE IF NOT EXISTS user_group_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, group_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES channel_groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS content_id_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label_id INTEGER,
    album_title TEXT NOT NULL,
    album_artist TEXT,
    album_upc TEXT,
    genre TEXT,
    label TEXT,
    release_date TEXT,
    ownership TEXT,
    match_policy TEXT,
    ddex_party_id TEXT,
    album_art_filename TEXT,
    track_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'created',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (label_id) REFERENCES content_id_labels(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS content_id_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    track_number INTEGER NOT NULL DEFAULT 0,
    filename TEXT NOT NULL,
    isrc TEXT NOT NULL,
    song_title TEXT NOT NULL,
    artist TEXT,
    custom_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES content_id_products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS content_id_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS content_id_artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS content_id_track_artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(track_id, artist_id),
    FOREIGN KEY (track_id) REFERENCES content_id_tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES content_id_artists(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS expense_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'bank',
    owner_type TEXT NOT NULL DEFAULT 'company',
    currency TEXT NOT NULL DEFAULT 'VND',
    bank_name TEXT,
    account_number TEXT,
    opening_balance REAL NOT NULL DEFAULT 0,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS expense_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    category_id INTEGER,
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'VND',
    transaction_date TEXT NOT NULL,
    title TEXT NOT NULL,
    vendor TEXT,
    note TEXT,
    attachment_name TEXT,
    attachment_data_url TEXT,
    debt_status TEXT NOT NULL DEFAULT 'none',
    reimbursement_account_id INTEGER,
    reimbursed_at DATETIME,
    status TEXT NOT NULL DEFAULT 'active',
    created_by INTEGER,
    updated_by INTEGER,
    deleted_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (account_id) REFERENCES expense_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL,
    FOREIGN KEY (reimbursement_account_id) REFERENCES expense_accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS expense_transaction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    actor_id INTEGER,
    actor_name TEXT,
    note TEXT,
    snapshot TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES expense_transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS expense_revenues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'VND',
    revenue_date TEXT NOT NULL,
    revenue_type TEXT NOT NULL,
    description TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by INTEGER,
    updated_by INTEGER,
    deleted_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (account_id) REFERENCES expense_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS expense_revenue_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revenue_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    actor_id INTEGER,
    actor_name TEXT,
    note TEXT,
    snapshot TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (revenue_id) REFERENCES expense_revenues(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS content_id_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'unused',
    album_title TEXT,
    song_title TEXT,
    artist TEXT,
    product_id INTEGER,
    track_id INTEGER,
    notes TEXT,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES content_id_products(id) ON DELETE SET NULL,
    FOREIGN KEY (track_id) REFERENCES content_id_tracks(id) ON DELETE SET NULL
  );
`);

db.exec("CREATE INDEX IF NOT EXISTS idx_content_id_codes_type_status ON content_id_codes(type, status)");
db.exec("CREATE INDEX IF NOT EXISTS idx_content_id_products_created ON content_id_products(created_at)");
db.exec("CREATE INDEX IF NOT EXISTS idx_content_id_tracks_product ON content_id_tracks(product_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_content_id_track_artists_track ON content_id_track_artists(track_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_content_id_track_artists_artist ON content_id_track_artists(artist_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_expense_transactions_account_date ON expense_transactions(account_id, transaction_date)");
db.exec("CREATE INDEX IF NOT EXISTS idx_expense_revenues_account_date ON expense_revenues(account_id, revenue_date)");

const contentProductColumns = db.prepare("PRAGMA table_info(content_id_products)").all();
if (!contentProductColumns.some((column) => column.name === "label_id")) {
  db.exec("ALTER TABLE content_id_products ADD COLUMN label_id INTEGER");
}

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
