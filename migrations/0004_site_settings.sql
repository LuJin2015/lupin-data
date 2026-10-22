CREATE TABLE IF NOT EXISTS site_settings (
  airline_id INTEGER NOT NULL REFERENCES airlines(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (airline_id, setting_key)
);
