const db = require("../config/database");

const CURRENCIES = new Set(["VND", "USD", "GBP"]);
const OWNER_TYPES = new Set(["company", "personal", "external"]);
const ACCOUNT_TYPES = new Set(["bank", "cash", "wallet", "card", "other"]);

function clean(value) {
  return String(value || "").trim();
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeCurrency(value) {
  const currency = clean(value).toUpperCase() || "VND";
  return CURRENCIES.has(currency) ? currency : "VND";
}

function actor(req) {
  return {
    id: req.user?.id || null,
    name: req.user?.full_name || req.user?.email || "Unknown"
  };
}

function addTransactionHistory(transactionId, action, req, note, snapshot) {
  const by = actor(req);
  db.prepare(`
    INSERT INTO expense_transaction_history (transaction_id, action, actor_id, actor_name, note, snapshot)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(transactionId, action, by.id, by.name, clean(note) || null, JSON.stringify(snapshot || {}));
}

function addRevenueHistory(revenueId, action, req, note, snapshot) {
  const by = actor(req);
  db.prepare(`
    INSERT INTO expense_revenue_history (revenue_id, action, actor_id, actor_name, note, snapshot)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(revenueId, action, by.id, by.name, clean(note) || null, JSON.stringify(snapshot || {}));
}

function listAccounts(req, res) {
  const accounts = db.prepare(`
    SELECT
      a.*,
      COALESCE(r.total_revenue, 0) AS total_revenue,
      COALESCE(t.total_expense, 0) AS total_expense,
      COALESCE(a.opening_balance, 0) + COALESCE(r.total_revenue, 0) - COALESCE(t.total_expense, 0) AS balance
    FROM expense_accounts a
    LEFT JOIN (
      SELECT account_id, SUM(amount) AS total_revenue
      FROM expense_revenues
      WHERE status = 'active'
      GROUP BY account_id
    ) r ON r.account_id = a.id
    LEFT JOIN (
      SELECT account_id, SUM(amount) AS total_expense
      FROM expense_transactions
      WHERE status = 'active'
      GROUP BY account_id
    ) t ON t.account_id = a.id
    ORDER BY a.created_at DESC, a.id DESC
  `).all();

  res.json({ success: true, accounts });
}

function createAccount(req, res) {
  const data = req.body || {};
  const accountName = clean(data.account_name);
  const accountType = ACCOUNT_TYPES.has(clean(data.account_type)) ? clean(data.account_type) : "bank";
  const ownerType = OWNER_TYPES.has(clean(data.owner_type)) ? clean(data.owner_type) : "company";
  const currency = normalizeCurrency(data.currency);

  if (!accountName) return res.status(400).json({ success: false, message: "Account name is required" });

  const result = db.prepare(`
    INSERT INTO expense_accounts (
      account_name, account_type, owner_type, currency, bank_name, account_number,
      opening_balance, description, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    accountName,
    accountType,
    ownerType,
    currency,
    clean(data.bank_name) || null,
    clean(data.account_number) || null,
    numberValue(data.opening_balance),
    clean(data.description) || null,
    req.user.id
  );

  res.json({ success: true, account: db.prepare("SELECT * FROM expense_accounts WHERE id = ?").get(result.lastInsertRowid) });
}

function updateAccount(req, res) {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM expense_accounts WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ success: false, message: "Account not found" });

  const data = req.body || {};
  db.prepare(`
    UPDATE expense_accounts
    SET account_name = ?,
        account_type = ?,
        owner_type = ?,
        currency = ?,
        bank_name = ?,
        account_number = ?,
        opening_balance = ?,
        description = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    clean(data.account_name) || current.account_name,
    ACCOUNT_TYPES.has(clean(data.account_type)) ? clean(data.account_type) : current.account_type,
    OWNER_TYPES.has(clean(data.owner_type)) ? clean(data.owner_type) : current.owner_type,
    normalizeCurrency(data.currency || current.currency),
    clean(data.bank_name) || null,
    clean(data.account_number) || null,
    numberValue(data.opening_balance),
    clean(data.description) || null,
    clean(data.status) || current.status,
    id
  );

  res.json({ success: true, account: db.prepare("SELECT * FROM expense_accounts WHERE id = ?").get(id) });
}

function deleteAccount(req, res) {
  const id = Number(req.params.id);
  const usedTransactions = db.prepare("SELECT COUNT(*) AS count FROM expense_transactions WHERE account_id = ?").get(id).count;
  const usedRevenues = db.prepare("SELECT COUNT(*) AS count FROM expense_revenues WHERE account_id = ?").get(id).count;

  if (usedTransactions || usedRevenues) {
    db.prepare("UPDATE expense_accounts SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return res.json({ success: true, message: "Account is used, marked inactive" });
  }

  db.prepare("DELETE FROM expense_accounts WHERE id = ?").run(id);
  res.json({ success: true });
}

function listCategories(req, res) {
  const categories = db.prepare(`
    SELECT
      c.*,
      COUNT(t.id) AS transaction_count,
      COALESCE(SUM(CASE WHEN t.status = 'active' THEN t.amount ELSE 0 END), 0) AS total_spent
    FROM expense_categories c
    LEFT JOIN expense_transactions t ON t.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE ASC
  `).all();

  res.json({ success: true, categories });
}

function createCategory(req, res) {
  const name = clean(req.body?.name);
  if (!name) return res.status(400).json({ success: false, message: "Category name is required" });

  try {
    const result = db.prepare(`
      INSERT INTO expense_categories (name, description, created_by)
      VALUES (?, ?, ?)
    `).run(name, clean(req.body?.description) || null, req.user.id);
    res.json({ success: true, category: db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(result.lastInsertRowid) });
  } catch {
    res.status(400).json({ success: false, message: "Category already exists" });
  }
}

function updateCategory(req, res) {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ success: false, message: "Category not found" });

  try {
    db.prepare(`
      UPDATE expense_categories
      SET name = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      clean(req.body?.name) || current.name,
      clean(req.body?.description) || null,
      clean(req.body?.status) || current.status,
      id
    );
    res.json({ success: true, category: db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(id) });
  } catch {
    res.status(400).json({ success: false, message: "Category already exists" });
  }
}

function deleteCategory(req, res) {
  const id = Number(req.params.id);
  const used = db.prepare("SELECT COUNT(*) AS count FROM expense_transactions WHERE category_id = ?").get(id).count;
  if (used) {
    db.prepare("UPDATE expense_categories SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return res.json({ success: true, message: "Category is used, marked inactive" });
  }
  db.prepare("DELETE FROM expense_categories WHERE id = ?").run(id);
  res.json({ success: true });
}

function transactionSelect(where = "", order = "ORDER BY t.transaction_date DESC, t.id DESC") {
  return `
    SELECT
      t.*,
      a.account_name,
      a.owner_type,
      a.account_type,
      c.name AS category_name,
      creator.full_name AS created_by_name,
      updater.full_name AS updated_by_name,
      deleter.full_name AS deleted_by_name
    FROM expense_transactions t
    JOIN expense_accounts a ON a.id = t.account_id
    LEFT JOIN expense_categories c ON c.id = t.category_id
    LEFT JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users updater ON updater.id = t.updated_by
    LEFT JOIN users deleter ON deleter.id = t.deleted_by
    ${where}
    ${order}
  `;
}

function listTransactions(req, res) {
  const month = clean(req.query.month);
  const status = clean(req.query.status) || "active";
  const clauses = [];
  const params = [];

  if (status !== "all") {
    clauses.push("t.status = ?");
    params.push(status);
  }
  if (month) {
    clauses.push("substr(t.transaction_date, 1, 7) = ?");
    params.push(month);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const transactions = db.prepare(transactionSelect(where)).all(...params);
  res.json({ success: true, transactions });
}

function getTransaction(req, res) {
  const id = Number(req.params.id);
  const transaction = db.prepare(transactionSelect("WHERE t.id = ?", "")).get(id);
  if (!transaction) return res.status(404).json({ success: false, message: "Transaction not found" });

  const history = db.prepare("SELECT * FROM expense_transaction_history WHERE transaction_id = ? ORDER BY created_at DESC, id DESC").all(id);
  res.json({ success: true, transaction, history });
}

function createTransaction(req, res) {
  const data = req.body || {};
  const account = db.prepare("SELECT * FROM expense_accounts WHERE id = ?").get(Number(data.account_id));
  if (!account) return res.status(400).json({ success: false, message: "Account is required" });

  const amount = numberValue(data.amount);
  if (amount <= 0) return res.status(400).json({ success: false, message: "Amount must be greater than 0" });

  const title = clean(data.title);
  if (!title) return res.status(400).json({ success: false, message: "Title is required" });

  const debtStatus = account.owner_type === "personal" || account.owner_type === "external" ? "pending" : "none";
  const by = actor(req);
  const result = db.prepare(`
    INSERT INTO expense_transactions (
      account_id, category_id, amount, currency, transaction_date, title, vendor, note,
      attachment_name, attachment_data_url, debt_status, created_by, updated_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    account.id,
    Number(data.category_id) || null,
    amount,
    normalizeCurrency(data.currency || account.currency),
    clean(data.transaction_date) || new Date().toISOString().slice(0, 10),
    title,
    clean(data.vendor) || null,
    clean(data.note) || null,
    clean(data.attachment_name) || null,
    clean(data.attachment_data_url) || null,
    debtStatus,
    by.id,
    by.id
  );

  const transaction = db.prepare(transactionSelect("WHERE t.id = ?", "")).get(result.lastInsertRowid);
  addTransactionHistory(transaction.id, "created", req, data.note, transaction);
  res.json({ success: true, transaction });
}

function updateTransaction(req, res) {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM expense_transactions WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ success: false, message: "Transaction not found" });

  const data = req.body || {};
  const account = db.prepare("SELECT * FROM expense_accounts WHERE id = ?").get(Number(data.account_id || current.account_id));
  if (!account) return res.status(400).json({ success: false, message: "Account is required" });

  const debtStatus = clean(data.debt_status) || (account.owner_type === "personal" || account.owner_type === "external" ? current.debt_status || "pending" : "none");
  db.prepare(`
    UPDATE expense_transactions
    SET account_id = ?,
        category_id = ?,
        amount = ?,
        currency = ?,
        transaction_date = ?,
        title = ?,
        vendor = ?,
        note = ?,
        attachment_name = COALESCE(?, attachment_name),
        attachment_data_url = COALESCE(?, attachment_data_url),
        debt_status = ?,
        reimbursement_account_id = ?,
        reimbursed_at = CASE WHEN ? = 'paid' AND reimbursed_at IS NULL THEN CURRENT_TIMESTAMP ELSE reimbursed_at END,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    account.id,
    Number(data.category_id) || null,
    numberValue(data.amount || current.amount),
    normalizeCurrency(data.currency || account.currency),
    clean(data.transaction_date) || current.transaction_date,
    clean(data.title) || current.title,
    clean(data.vendor) || null,
    clean(data.note) || null,
    clean(data.attachment_name) || null,
    clean(data.attachment_data_url) || null,
    debtStatus,
    Number(data.reimbursement_account_id) || null,
    debtStatus,
    req.user.id,
    id
  );

  const transaction = db.prepare(transactionSelect("WHERE t.id = ?", "")).get(id);
  addTransactionHistory(id, "updated", req, data.history_note || data.note, transaction);
  res.json({ success: true, transaction });
}

function deleteTransaction(req, res) {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM expense_transactions WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ success: false, message: "Transaction not found" });

  db.prepare(`
    UPDATE expense_transactions
    SET status = 'deleted', deleted_by = ?, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.user.id, id);

  addTransactionHistory(id, "deleted", req, req.body?.note || "Deleted", current);
  res.json({ success: true });
}

function revenueSelect(where = "", order = "ORDER BY r.revenue_date DESC, r.id DESC") {
  return `
    SELECT
      r.*,
      a.account_name,
      a.owner_type,
      creator.full_name AS created_by_name,
      updater.full_name AS updated_by_name
    FROM expense_revenues r
    JOIN expense_accounts a ON a.id = r.account_id
    LEFT JOIN users creator ON creator.id = r.created_by
    LEFT JOIN users updater ON updater.id = r.updated_by
    ${where}
    ${order}
  `;
}

function listRevenues(req, res) {
  const month = clean(req.query.month);
  const clauses = ["r.status = 'active'"];
  const params = [];
  if (month) {
    clauses.push("substr(r.revenue_date, 1, 7) = ?");
    params.push(month);
  }
  const revenues = db.prepare(revenueSelect(`WHERE ${clauses.join(" AND ")}`)).all(...params);
  res.json({ success: true, revenues });
}

function createRevenue(req, res) {
  const data = req.body || {};
  const account = db.prepare("SELECT * FROM expense_accounts WHERE id = ?").get(Number(data.account_id));
  if (!account) return res.status(400).json({ success: false, message: "Account is required" });

  const amount = numberValue(data.amount);
  if (amount <= 0) return res.status(400).json({ success: false, message: "Amount must be greater than 0" });

  const result = db.prepare(`
    INSERT INTO expense_revenues (
      account_id, amount, currency, revenue_date, revenue_type, description, note, created_by, updated_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    account.id,
    amount,
    normalizeCurrency(data.currency || account.currency),
    clean(data.revenue_date) || new Date().toISOString().slice(0, 10),
    clean(data.revenue_type) || "Other",
    clean(data.description) || null,
    clean(data.note) || null,
    req.user.id,
    req.user.id
  );

  const revenue = db.prepare(revenueSelect("WHERE r.id = ?", "")).get(result.lastInsertRowid);
  addRevenueHistory(revenue.id, "created", req, data.note, revenue);
  res.json({ success: true, revenue });
}

function updateRevenue(req, res) {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM expense_revenues WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ success: false, message: "Revenue not found" });

  const data = req.body || {};
  const account = db.prepare("SELECT * FROM expense_accounts WHERE id = ?").get(Number(data.account_id || current.account_id));
  if (!account) return res.status(400).json({ success: false, message: "Account is required" });

  db.prepare(`
    UPDATE expense_revenues
    SET account_id = ?,
        amount = ?,
        currency = ?,
        revenue_date = ?,
        revenue_type = ?,
        description = ?,
        note = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    account.id,
    numberValue(data.amount || current.amount),
    normalizeCurrency(data.currency || account.currency),
    clean(data.revenue_date) || current.revenue_date,
    clean(data.revenue_type) || current.revenue_type,
    clean(data.description) || null,
    clean(data.note) || null,
    req.user.id,
    id
  );

  const revenue = db.prepare(revenueSelect("WHERE r.id = ?", "")).get(id);
  addRevenueHistory(id, "updated", req, data.history_note || data.note, revenue);
  res.json({ success: true, revenue });
}

function deleteRevenue(req, res) {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM expense_revenues WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ success: false, message: "Revenue not found" });

  db.prepare(`
    UPDATE expense_revenues
    SET status = 'deleted', deleted_by = ?, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.user.id, id);

  addRevenueHistory(id, "deleted", req, req.body?.note || "Deleted", current);
  res.json({ success: true });
}

function overview(req, res) {
  const month = clean(req.query.month) || new Date().toISOString().slice(0, 7);
  const accounts = db.prepare(`
    SELECT
      a.id, a.account_name, a.account_type, a.owner_type, a.currency, a.opening_balance,
      COALESCE(r.total_revenue, 0) AS total_revenue,
      COALESCE(t.total_expense, 0) AS total_expense,
      COALESCE(a.opening_balance, 0) + COALESCE(r.total_revenue, 0) - COALESCE(t.total_expense, 0) AS balance,
      COALESCE(mr.month_revenue, 0) AS month_revenue,
      COALESCE(mt.month_expense, 0) AS month_expense
    FROM expense_accounts a
    LEFT JOIN (SELECT account_id, SUM(amount) total_revenue FROM expense_revenues WHERE status='active' GROUP BY account_id) r ON r.account_id = a.id
    LEFT JOIN (SELECT account_id, SUM(amount) total_expense FROM expense_transactions WHERE status='active' GROUP BY account_id) t ON t.account_id = a.id
    LEFT JOIN (SELECT account_id, SUM(amount) month_revenue FROM expense_revenues WHERE status='active' AND substr(revenue_date,1,7)=? GROUP BY account_id) mr ON mr.account_id = a.id
    LEFT JOIN (SELECT account_id, SUM(amount) month_expense FROM expense_transactions WHERE status='active' AND substr(transaction_date,1,7)=? GROUP BY account_id) mt ON mt.account_id = a.id
    WHERE a.status = 'active'
    ORDER BY a.currency, a.account_name
  `).all(month, month);

  const debts = db.prepare(`
    SELECT
      t.*,
      a.account_name,
      a.owner_type,
      c.name AS category_name
    FROM expense_transactions t
    JOIN expense_accounts a ON a.id = t.account_id
    LEFT JOIN expense_categories c ON c.id = t.category_id
    WHERE t.status = 'active' AND t.debt_status = 'pending'
    ORDER BY t.transaction_date DESC, t.id DESC
  `).all();

  const totalsByCurrency = {};
  accounts.forEach((account) => {
    if (!totalsByCurrency[account.currency]) {
      totalsByCurrency[account.currency] = { balance: 0, revenue: 0, expense: 0, month_revenue: 0, month_expense: 0 };
    }
    totalsByCurrency[account.currency].balance += Number(account.balance || 0);
    totalsByCurrency[account.currency].revenue += Number(account.total_revenue || 0);
    totalsByCurrency[account.currency].expense += Number(account.total_expense || 0);
    totalsByCurrency[account.currency].month_revenue += Number(account.month_revenue || 0);
    totalsByCurrency[account.currency].month_expense += Number(account.month_expense || 0);
  });

  const categoryTotals = db.prepare(`
    SELECT c.name, t.currency, SUM(t.amount) AS total
    FROM expense_transactions t
    LEFT JOIN expense_categories c ON c.id = t.category_id
    WHERE t.status='active' AND substr(t.transaction_date,1,7)=?
    GROUP BY c.id, t.currency
    ORDER BY total DESC
    LIMIT 10
  `).all(month);

  res.json({
    success: true,
    month,
    accounts,
    totals_by_currency: totalsByCurrency,
    pending_debts: debts,
    category_totals: categoryTotals
  });
}

module.exports = {
  createAccount,
  createCategory,
  createRevenue,
  createTransaction,
  deleteAccount,
  deleteCategory,
  deleteRevenue,
  deleteTransaction,
  getTransaction,
  listAccounts,
  listCategories,
  listRevenues,
  listTransactions,
  overview,
  updateAccount,
  updateCategory,
  updateRevenue,
  updateTransaction
};
