-- Adds durable seat assignments. Unique constraint prevents two confirmed bookings
-- from holding the same seat for the same airline, flight, and date.
CREATE TABLE IF NOT EXISTS booking_seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL,
  airline_id INTEGER NOT NULL,
  flight TEXT NOT NULL,
  flight_date TEXT NOT NULL,
  seat_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (airline_id, flight, flight_date, seat_code),
  FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
  FOREIGN KEY (airline_id) REFERENCES airlines(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_booking_seats_flight_date
  ON booking_seats(airline_id, flight, flight_date);
