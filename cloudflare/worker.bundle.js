/* Deployment snapshot of lupin-data-api. Update this snapshot when the live Worker changes. */
const headers = origin => ({
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": origin || "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cache-control": "no-store"
});
const reply = (data, status = 200, origin) => new Response(JSON.stringify(data), { status, headers: headers(origin) });
const enc = new TextEncoder();
const iso = () => new Date().toISOString();
async function sha(v) {
  const b = await crypto.subtle.digest("SHA-256", enc.encode(v));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password) {
  const salt = crypto.randomUUID();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
  return salt + "$" + [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function checkPassword(password, stored) {
  const p = String(stored).split("$");
  if (p.length !== 2) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(p[0]), iterations: 100000, hash: "SHA-256" }, key, 256);
  const actual = [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, "0")).join("");
  return actual === p[1];
}
function randomToken() {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}
function makeBookingId() { return "LUP-" + crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(); }
async function airline(db, slug) { return db.prepare("SELECT * FROM airlines WHERE slug=?").bind(slug).first(); }
async function ensureAirline(db, slug) {
  let a = await airline(db, slug);
  if (a) return a;
  await db.prepare("INSERT INTO airlines(slug,name,created_at) VALUES(?,?,?)").bind(slug, slug === "lupin-airlines" ? "Lupin Airlines" : slug, iso()).run();
  return airline(db, slug);
}
async function currentUser(db, request) {
  const auth = request.headers.get("authorization") || "", token = auth.trim().split(" ").slice(1).join(" ");
  if (!token) return null;
  const hash = await sha(token);
  return db.prepare("SELECT users.*,airlines.slug AS airline_slug FROM sessions JOIN users ON users.id=sessions.user_id JOIN airlines ON airlines.id=users.airline_id WHERE sessions.token_hash=? AND sessions.expires_at>?").bind(hash, iso()).first();
}
function passengerCount(value) {
  const match = String(value || "1 passenger").match(/[0-9]+/);
  return Math.max(1, Math.min(6, Number(match ? match[0] : 1)));
}
function validDate(value) { return typeof value === "string" && value.length === 10 && value[4] === "-" && value[7] === "-" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value); }
function validSeat(code) { return typeof code === "string" && /^(?:[1-9]|[12][0-9]|30)[A-F]$/.test(code); }
function allSeats() {
  const seats = [];
  for (let row = 1; row <= 30; row++) for (const col of ["A","B","C","D","E","F"]) seats.push(String(row) + col);
  return seats;
}
async function occupiedSeats(db, airlineId, flight, date) {
  const r = await db.prepare("SELECT seat_code FROM booking_seats WHERE airline_id=? AND flight=? AND flight_date=?").bind(airlineId, flight, date).all();
  return (r.results || []).map(x => x.seat_code);
}
export default {
  async fetch(request, env) {
    const origin = env.CORS_ORIGIN || "*";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
    const url = new URL(request.url), p = url.pathname.split("/").filter(Boolean);
    try {
      if (p[0] !== "api") return reply({ ok: true, service: "lupin-cloud" }, 200, origin);
      const slug = p[1];
      if (p.length === 3 && p[2] === "flights" && request.method === "GET") {
        const a = await airline(env.DB, slug);
        if (!a) return reply({ flights: [] }, 200, origin);
        const r = await env.DB.prepare("SELECT flight,destination,gate,departure,price FROM flights WHERE airline_id=? ORDER BY id").bind(a.id).all();
        return reply({ flights: r.results }, 200, origin);
      }
      // Seat maps reveal only seat codes, never passenger identities.
      if (p.length === 3 && p[2] === "seats" && request.method === "GET") {
        const a = await airline(env.DB, slug);
        const flight = String(url.searchParams.get("flight") || "");
        const date = String(url.searchParams.get("date") || "");
        if (!a || !flight || !validDate(date)) return reply({ error: "Choose a valid flight and date." }, 400, origin);
        const known = await env.DB.prepare("SELECT flight FROM flights WHERE airline_id=? AND flight=?").bind(a.id, flight).first();
        if (!known) return reply({ error: "Flight not found." }, 404, origin);
        const occupied = await occupiedSeats(env.DB, a.id, flight, date);
        return reply({ flight, date, seats: allSeats(), occupied }, 200, origin);
      }
      if (p.length === 3 && p[2] === "register" && request.method === "POST") {
        const b = await request.json(), username = String(b.username || "").trim(), password = String(b.password || "");
        if (!/^[A-Za-z0-9_-]{3,20}$/.test(username)) return reply({ error: "Username must be 3–20 letters, numbers, _ or -." }, 400, origin);
        if (password.length < 6) return reply({ error: "Password must be at least 6 characters." }, 400, origin);
        const a = await ensureAirline(env.DB, slug), exists = await env.DB.prepare("SELECT id FROM users WHERE airline_id=? AND username=?").bind(a.id, username).first();
        if (exists) return reply({ error: "That username is already in use." }, 409, origin);
        const ph = await hashPassword(password), r = await env.DB.prepare("INSERT INTO users(airline_id,username,password_hash,created_at) VALUES(?,?,?,?)").bind(a.id, username, ph, iso()).run(), t = randomToken();
        await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(t), r.meta.last_row_id, new Date(Date.now() + 2592000000).toISOString()).run();
        return reply({ ok: true, username, miles: 0, token: t }, 201, origin);
      }
      if (p.length === 3 && p[2] === "login" && request.method === "POST") {
        const b = await request.json(), a = await airline(env.DB, slug);
        if (!a) return reply({ error: "Incorrect username or password." }, 401, origin);
        const user = await env.DB.prepare("SELECT * FROM users WHERE airline_id=? AND username=?").bind(a.id, String(b.username || "").trim()).first();
        if (!user || !await checkPassword(String(b.password || ""), user.password_hash)) return reply({ error: "Incorrect username or password." }, 401, origin);
        const t = randomToken();
        await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(t), user.id, new Date(Date.now() + 2592000000).toISOString()).run();
        return reply({ ok: true, username: user.username, miles: user.miles, token: t }, 200, origin);
      }
      const user = await currentUser(env.DB, request);
      if (p.length === 3 && p[2] === "me" && request.method === "GET") {
        if (!user || user.airline_slug !== slug) return reply({ error: "Please log in." }, 401, origin);
        return reply({ username: user.username, miles: user.miles }, 200, origin);
      }
      if (p.length === 3 && p[2] === "miles" && request.method === "POST") {
        if (!user || user.airline_slug !== slug) return reply({ error: "Please log in." }, 401, origin);
        const b = await request.json(), delta = Number(b.delta);
        if (!Number.isInteger(delta) || delta === 0) return reply({ error: "Miles change must be a non-zero whole number." }, 400, origin);
        const next = Math.max(0, Number(user.miles || 0) + delta);
        await env.DB.prepare("UPDATE users SET miles=? WHERE id=?").bind(next, user.id).run();
        return reply({ ok: true, miles: next }, 200, origin);
      }
      if (p.length === 3 && p[2] === "bookings" && request.method === "GET") {
        if (!user || user.airline_slug !== slug) return reply({ error: "Please log in." }, 401, origin);
        const r = await env.DB.prepare("SELECT booking_id AS bookingId,flight,destination,date,time,gate,passengers,fare,status,booked_at AS bookedAt,miles_earned AS milesEarned FROM bookings WHERE user_id=? ORDER BY id DESC").bind(user.id).all();
        for (const b of (r.results || [])) {
          const s = await env.DB.prepare("SELECT seat_code FROM booking_seats WHERE booking_id=? ORDER BY seat_code").bind(b.bookingId).all();
          b.seats = (s.results || []).map(x => x.seat_code);
        }
        return reply({ bookings: r.results }, 200, origin);
      }
      if (p.length === 3 && p[2] === "bookings" && request.method === "POST") {
        if (!user || user.airline_slug !== slug) return reply({ error: "Please log in." }, 401, origin);
        const b = await request.json(), flightCode = String(b.flight || ""), flight = await env.DB.prepare("SELECT * FROM flights WHERE airline_id=? AND flight=?").bind(user.airline_id, flightCode).first();
        if (!flight) return reply({ error: "Flight not found." }, 400, origin);
        const date = String(b.date || "");
        if (!validDate(date)) return reply({ error: "Choose a valid flight date." }, 400, origin);
        const count = passengerCount(b.passengers);
        let chosen = Array.isArray(b.seats) ? b.seats.map(x => String(x).toUpperCase()) : [];
        if (chosen.length === 0) {
          const occupied = new Set(await occupiedSeats(env.DB, user.airline_id, flightCode, date));
          chosen = allSeats().filter(x => !occupied.has(x)).slice(0, count);
        }
        if (chosen.length !== count) return reply({ error: "Choose exactly " + count + " seat" + (count === 1 ? "" : "s") + " for your passenger count." }, 400, origin);
        if (new Set(chosen).size !== chosen.length || chosen.some(x => !validSeat(x))) return reply({ error: "One or more seat selections are invalid." }, 400, origin);
        const id = makeBookingId(), miles = 500, fare = Number(String(flight.price).replace(/[^0-9]/g, "")) || 0, now = iso();
        const statements = [
          env.DB.prepare("INSERT INTO bookings(booking_id,user_id,airline_id,name,flight,destination,date,time,gate,passengers,fare,miles_earned,status,booked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, user.id, user.airline_id, String(b.name || user.username).slice(0, 40), flight.flight, flight.destination, date, flight.departure, flight.gate, String(b.passengers || "1 passenger"), fare, miles, "Confirmed", now),
          ...chosen.map(seat => env.DB.prepare("INSERT INTO booking_seats(booking_id,airline_id,flight,flight_date,seat_code,created_at) VALUES(?,?,?,?,?,?)").bind(id, user.airline_id, flight.flight, date, seat, now)),
          env.DB.prepare("UPDATE users SET miles=miles+? WHERE id=?").bind(miles, user.id)
        ];
        try {
          await env.DB.batch(statements);
        } catch (e) {
          const message = String(e.message || e);
          if (/booking_seats|UNIQUE constraint failed/i.test(message)) return reply({ error: "One of those seats was just booked by someone else. Please refresh the seat map and choose again." }, 409, origin);
          throw e;
        }
        return reply({ ok: true, bookingId: id, milesEarned: miles, seats: chosen }, 201, origin);
      }
      if (p.length === 5 && p[2] === "bookings" && p[4] === "cancel" && request.method === "POST") {
        if (!user || user.airline_slug !== slug) return reply({ error: "Please log in." }, 401, origin);
        const booking = await env.DB.prepare("SELECT * FROM bookings WHERE booking_id=? AND user_id=?").bind(p[3], user.id).first();
        if (!booking) return reply({ error: "Booking not found." }, 404, origin);
        if (booking.status === "Cancelled") return reply({ error: "Booking is already cancelled." }, 400, origin);
        await env.DB.batch([
          env.DB.prepare("UPDATE bookings SET status='Cancelled' WHERE booking_id=? AND user_id=?").bind(p[3], user.id),
          env.DB.prepare("DELETE FROM booking_seats WHERE booking_id=?").bind(p[3]),
          env.DB.prepare("UPDATE users SET miles=MAX(0,miles-?) WHERE id=?").bind(booking.miles_earned, user.id)
        ]);
        return reply({ ok: true }, 200, origin);
      }
      return reply({ error: "Not found." }, 404, origin);
    } catch (e) {
      return reply({ error: "Server error.", detail: String(e.message || e) }, 500, origin);
    }
  }
};