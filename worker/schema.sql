PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS airlines (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 slug TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 airline_id INTEGER NOT NULL,
 username TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 miles INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 UNIQUE(airline_id, username),
 FOREIGN KEY (airline_id) REFERENCES airlines(id)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL,
 expires_at TEXT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS flights (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 airline_id INTEGER NOT NULL,
 flight TEXT NOT NULL,
 destination TEXT NOT NULL,
 gate TEXT NOT NULL,
 departure TEXT NOT NULL,
 price TEXT NOT NULL,
 UNIQUE(airline_id, flight),
 FOREIGN KEY (airline_id) REFERENCES airlines(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS bookings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_id TEXT NOT NULL UNIQUE,
 user_id INTEGER NOT NULL,
 airline_id INTEGER NOT NULL,
 name TEXT NOT NULL,
 flight TEXT NOT NULL,
 destination TEXT NOT NULL,
 date TEXT NOT NULL,
 time TEXT NOT NULL,
 gate TEXT NOT NULL,
 passengers TEXT NOT NULL,
 fare INTEGER NOT NULL,
 miles_earned INTEGER NOT NULL DEFAULT 500,
 status TEXT NOT NULL DEFAULT 'Confirmed',
 booked_at TEXT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (airline_id) REFERENCES airlines(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_users_airline_username ON users(airline_id, username);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_flights_airline ON flights(airline_id);
