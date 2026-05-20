const db = require("../config/database");

const DEFAULT_SETTINGS = {
  brand_name: "ANS Network",
  brand_subtitle: "MCN Manager System",
  logo_mode: "random",
  logo_data_url: "",
  web_title: "ANS Network",
  favicon_data_url: ""
};

function rowsToSettings(rows) {
  return rows.reduce((settings, row) => {
    settings[row.key] = row.value || "";
    return settings;
  }, { ...DEFAULT_SETTINGS });
}

function getSettingsObject() {
  const rows = db.prepare("SELECT key, value FROM system_settings").all();
  return rowsToSettings(rows);
}

function getSettings(req, res) {
  res.json({
    success: true,
    settings: getSettingsObject()
  });
}

function normalizeSettings(body) {
  const next = {};

  if (Object.prototype.hasOwnProperty.call(body, "brand_name")) {
    next.brand_name = String(body.brand_name || "").trim() || DEFAULT_SETTINGS.brand_name;
  }

  if (Object.prototype.hasOwnProperty.call(body, "logo_mode")) {
    next.logo_mode = body.logo_mode === "upload" ? "upload" : "random";
  }

  if (Object.prototype.hasOwnProperty.call(body, "logo_data_url")) {
    next.logo_data_url = String(body.logo_data_url || "");
  }

  if (Object.prototype.hasOwnProperty.call(body, "web_title")) {
    next.web_title = String(body.web_title || "").trim() || DEFAULT_SETTINGS.web_title;
  }

  if (Object.prototype.hasOwnProperty.call(body, "favicon_data_url")) {
    next.favicon_data_url = String(body.favicon_data_url || "");
  }

  return next;
}

function updateSettings(req, res) {
  const updates = normalizeSettings(req.body || {});

  const statement = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  const transaction = db.transaction((entries) => {
    for (const [key, value] of entries) {
      statement.run(key, value);
    }
  });

  transaction(Object.entries(updates));

  res.json({
    success: true,
    settings: getSettingsObject()
  });
}

module.exports = {
  getSettings,
  updateSettings
};
