-- Control Tower administrator invitations and account suspensions.
CREATE TABLE IF NOT EXISTS control_admins (
  user_id INTEGER PRIMARY KEY,
  airline_id INTEGER NOT NULL,
  invited_by INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(airline_id) REFERENCES airlines(id) ON DELETE CASCADE,
  FOREIGN KEY(invited_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS control_suspensions (
  user_id INTEGER PRIMARY KEY,
  airline_id INTEGER NOT NULL,
  suspended_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(airline_id) REFERENCES airlines(id) ON DELETE CASCADE,
  FOREIGN KEY(suspended_by) REFERENCES users(id)
);