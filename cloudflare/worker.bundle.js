/* Deployment snapshot of lupin-data-api. Updated with Control Tower authorization and admin API. */
const headers = origin => ({
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": origin || "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
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
  const user = await db.prepare("SELECT users.*,airlines.slug AS airline_slug FROM sessions JOIN users ON users.id=sessions.user_id JOIN airlines ON airlines.id=users.airline_id WHERE sessions.token_hash=? AND sessions.expires_at>?").bind(hash, iso()).first();
  if (!user) return null;
  const suspended = await db.prepare("SELECT user_id FROM control_suspensions WHERE user_id=? AND airline_id=?").bind(user.id, user.airline_id).first();
  return suspended ? null : user;
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
        const suspension = await env.DB.prepare("SELECT user_id FROM control_suspensions WHERE user_id=? AND airline_id=?").bind(user.id, a.id).first();
        if (suspension) return reply({ error: "This account is suspended. Contact Lupin Airlines support." }, 403, origin);
        const t = randomToken();
        await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(t), user.id, new Date(Date.now() + 2592000000).toISOString()).run();
        return reply({ ok: true, username: user.username, miles: user.miles, token: t }, 200, origin);
      }
      const user = await currentUser(env.DB, request);
      const adminPath = p[2] === "admin";
      if (adminPath) {
        const a = slug === "lupin-airlines" ? await airline(env.DB, slug) : null;
        if (!a || !user || user.airline_slug !== slug) return reply({ error: "Sign in required." }, 401, origin);
        const primary = String(user.username).toLowerCase() === "lupin2015";
        const invited = await env.DB.prepare("SELECT user_id FROM control_admins WHERE user_id=? AND airline_id=?").bind(user.id, a.id).first();
        if (p.length === 4 && p[3] === "me" && request.method === "GET") return primary || invited ? reply({ ok: true, username: user.username, role: primary ? "primary" : "admin" }, 200, origin) : reply({ error: "Not an administrator." }, 403, origin);
        if (!primary && !invited) return reply({ error: "Not an administrator." }, 403, origin);
        if (p.length === 4 && p[3] === "overview" && request.method === "GET") {
          const [ur, br, fr, ar, sr] = await Promise.all([
            env.DB.prepare("SELECT u.username,u.miles,u.created_at,EXISTS(SELECT 1 FROM control_suspensions s WHERE s.user_id=u.id AND s.airline_id=u.airline_id) AS banned FROM users u WHERE u.airline_id=? ORDER BY u.username").bind(a.id).all(),
            env.DB.prepare("SELECT b.booking_id,b.flight,b.destination,b.date,b.status,u.username FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.airline_id=? ORDER BY b.id DESC LIMIT 500").bind(a.id).all(),
            env.DB.prepare("SELECT flight,destination,gate,departure,price FROM flights WHERE airline_id=? ORDER BY id").bind(a.id).all(),
            env.DB.prepare("SELECT u.username FROM control_admins c JOIN users u ON u.id=c.user_id WHERE c.airline_id=? ORDER BY u.username").bind(a.id).all(),
            env.DB.prepare("SELECT user_id FROM control_suspensions WHERE airline_id=?").bind(a.id).all()
          ]);
          return reply({ users: ur.results || [], bookings: br.results || [], flights: fr.results || [], admins: ar.results || [], suspended: (sr.results || []).map(x => x.user_id) }, 200, origin);
        }
        if (p.length === 6 && p[3] === "users" && p[4] && request.method === "POST") {
          const target = await env.DB.prepare("SELECT * FROM users WHERE airline_id=? AND username=?").bind(a.id, decodeURIComponent(p[4])).first();
          if (!target) return reply({ error: "Account not found." }, 404, origin);
          if (String(target.username).toLowerCase() === "lupin2015") return reply({ error: "The primary administrator is protected." }, 403, origin);
          if (p.length === 6 && p[5] === "miles") {
            const b = await request.json(), miles = Number(b.miles);
            if (!Number.isSafeInteger(miles) || miles < 0 || miles > 1000000000) return reply({ error: "Miles must be a whole number from 0 to 1,000,000,000." }, 400, origin);
            await env.DB.prepare("UPDATE users SET miles=? WHERE id=? AND airline_id=?").bind(miles, target.id, a.id).run();
            return reply({ ok: true, username: target.username, miles }, 200, origin);
          }
          if (p.length === 6 && p[5] === "password") {
            const b = await request.json(), password = String(b.password || "");
            if (password.length < 8 || password.length > 256) return reply({ error: "Password must be 8–256 characters." }, 400, origin);
            const passwordHash = await hashPassword(password);
            await env.DB.batch([env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(passwordHash, target.id), env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id)]);
            return reply({ ok: true, message: "Password reset. Existing sessions have been signed out." }, 200, origin);
          }
          if (p.length === 6 && p[5] === "ban") {
            if (await env.DB.prepare("SELECT user_id FROM control_admins WHERE user_id=? AND airline_id=?").bind(target.id, a.id).first()) return reply({ error: "Revoke administrator access before suspending this account." }, 409, origin);
            const b = await request.json();
            if (b.banned) await env.DB.batch([env.DB.prepare("INSERT INTO control_suspensions(user_id,airline_id,suspended_by,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET suspended_by=excluded.suspended_by,created_at=excluded.created_at").bind(target.id,a.id,user.id,iso()),env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id)]);
            else await env.DB.prepare("DELETE FROM control_suspensions WHERE user_id=? AND airline_id=?").bind(target.id,a.id).run();
            return reply({ ok: true, banned: !!b.banned }, 200, origin);
          }
        }
        if (p.length === 4 && p[3] === "invites" && request.method === "POST") {
          const b = await request.json(), username = String(b.username || "").trim();
          const target = await env.DB.prepare("SELECT id,username FROM users WHERE airline_id=? AND username=?").bind(a.id,username).first();
          if (!target) return reply({ error: "That username does not exist. Invite an existing account." }, 404, origin);
          if (String(target.username).toLowerCase() === "lupin2015") return reply({ error: "The primary administrator already has access." }, 409, origin);
          await env.DB.prepare("INSERT INTO control_admins(user_id,airline_id,invited_by,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET invited_by=excluded.invited_by,created_at=excluded.created_at").bind(target.id,a.id,user.id,iso()).run();
          return reply({ ok: true, username: target.username }, 201, origin);
        }
        if (p.length === 5 && p[3] === "invites" && request.method === "DELETE") {
          const username = decodeURIComponent(p[4] || "");
          const target = await env.DB.prepare("SELECT id,username FROM users WHERE airline_id=? AND username=?").bind(a.id,username).first();
          if (!target) return reply({ error: "Account not found." }, 404, origin);
          if (String(target.username).toLowerCase() === "lupin2015") return reply({ error: "The primary administrator is protected." }, 403, origin);
          await env.DB.prepare("DELETE FROM control_admins WHERE user_id=? AND airline_id=?").bind(target.id,a.id).run();
          return reply({ ok: true }, 200, origin);
        }
        return reply({ error: "Admin endpoint not found." }, 404, origin);
      }
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