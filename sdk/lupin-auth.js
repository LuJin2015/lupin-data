/* Lupin Cloud shared identity SDK. Works on GitHub Pages projects under lujin2015.github.io. */
(() => {
  const API = "https://lupin-data-api.lujinsg.workers.dev/api/auth";
  const KEY = "lupinCloudAccount";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  const save = value => { localStorage.setItem(KEY, JSON.stringify(value)); window.dispatchEvent(new CustomEvent("lupin-auth-change", { detail: value })); };
  const clear = () => { localStorage.removeItem(KEY); window.dispatchEvent(new CustomEvent("lupin-auth-change", { detail: null })); };
  async function request(action, options = {}) {
    const session = read();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (session?.token) headers.Authorization = "Bearer " + session.token;
    let response;
    try { response = await fetch(API + "/" + action, { ...options, headers, cache: "no-store" }); }
    catch { throw new Error("Could not reach Lupin Cloud. Check your connection and try again."); }
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) { const error = new Error(data.error || "Lupin Cloud returned HTTP " + response.status); error.status = response.status; throw error; }
    return data;
  }
  async function login(username, password) {
    const data = await request("login", { method: "POST", body: JSON.stringify({ username, password }) });
    save({ token: data.token, user: data.user, expiresAt: data.expiresAt });
    return data.user;
  }
  async function register(username, password) {
    const data = await request("register", { method: "POST", body: JSON.stringify({ username, password }) });
    save({ token: data.token, user: data.user, expiresAt: data.expiresAt });
    return data.user;
  }
  async function me() {
    const session = read(); if (!session?.token) return null;
    try { const data = await request("me"); save({ ...session, user: data.user }); return data.user; }
    catch (error) { if (error.status === 401) clear(); throw error; }
  }
  async function logout() {
    try { if (read()?.token) await request("logout", { method: "POST", body: "{}" }); } finally { clear(); }
  }
  const api = { apiBase: API, session: read, current: () => read()?.user?.username || "", login, register, me, logout };
  window.LUPIN_AUTH = api;

  // Keep other Lupin tabs in sync when a sibling app signs in or out.
  window.addEventListener("storage", event => {
    if (event.key !== KEY) return;
    const session = read();
    window.dispatchEvent(new CustomEvent("lupin-auth-change", { detail: session }));
    if (session?.token) me().catch(() => {});
  });

  function mountWidget() {
    if (!document.body || document.getElementById("lupin-cloud-widget")) return;
    const style = document.createElement("style");
    style.textContent = "#lupin-cloud-widget{position:fixed;right:16px;top:14px;z-index:99999;font:600 13px/1.4 system-ui,sans-serif;color:#f8f8ff}#lupin-cloud-widget button{font:inherit;cursor:pointer;border:1px solid #44445a;border-radius:999px;padding:9px 13px;background:#171827;color:inherit}#lupin-cloud-widget .lc-pill{background:#6d5dfc;border-color:#6d5dfc;color:white}#lupin-cloud-widget .lc-backdrop{position:fixed;inset:0;background:#070812bb;display:grid;place-items:center;padding:18px}#lupin-cloud-widget .lc-card{width:min(380px,100%);background:#151625;border:1px solid #34364d;border-radius:20px;padding:22px;box-shadow:0 24px 90px #0009}#lupin-cloud-widget h2{margin:0 0 6px;font-size:24px;letter-spacing:-.04em}#lupin-cloud-widget p{color:#b7bad0;margin:0 0 18px}#lupin-cloud-widget label{display:block;margin:12px 0;color:#d7d8e6}#lupin-cloud-widget input{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:11px;border-radius:10px;border:1px solid #44465f;background:#0d0e18;color:white;font:inherit}#lupin-cloud-widget .lc-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}#lupin-cloud-widget .lc-error{color:#ff9aab;min-height:18px}#lupin-cloud-widget .lc-main{background:#6d5dfc;border-color:#6d5dfc}#lupin-cloud-widget [hidden]{display:none!important}";
    document.head.appendChild(style);
    const root = document.createElement("div"); root.id = "lupin-cloud-widget";
    root.innerHTML = '<button class="lc-pill" type="button" id="lc-open">☁ Lupin Cloud · Sign in</button><div class="lc-backdrop" id="lc-backdrop" hidden><section class="lc-card" role="dialog" aria-modal="true" aria-labelledby="lc-title"><h2 id="lc-title">Your Lupin account</h2><p id="lc-description">One account across Lupin projects.</p><div id="lc-form-wrap"><form id="lc-form"><label>Username<input id="lc-username" autocomplete="username" minlength="3" maxlength="20" required></label><label>Password<input id="lc-password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label><div class="lc-error" id="lc-error" role="status"></div><div class="lc-row"><button type="button" id="lc-cancel">Cancel</button><button type="button" id="lc-switch">Create account</button><button class="lc-main" id="lc-submit" type="submit">Sign in</button></div></form></div><div id="lc-signed" hidden><p id="lc-welcome"></p><div class="lc-row"><button type="button" id="lc-close">Close</button><button class="lc-main" type="button" id="lc-logout">Sign out everywhere</button></div></div></section></div>';
    document.body.appendChild(root);
    let mode = "login";
    const $ = id => root.querySelector("#" + id);
    const backdrop = $("lc-backdrop");
    function open() { backdrop.hidden = false; refresh().catch(() => {}); }
    function close() { backdrop.hidden = true; }
    function render(user) {
      $("lc-form-wrap").hidden = !!user; $("lc-signed").hidden = !user;
      $("lc-open").textContent = user ? "☁ " + user.username + " · Lupin Cloud" : "☁ Lupin Cloud · Sign in";
      if (user) $("lc-welcome").textContent = "Signed in as " + user.username + ". Your Lupin Cloud identity is shared across supported Lupin projects.";
    }
    async function refresh() {
      const s = read(); if (!s?.token) { render(null); return; }
      try { render(await me()); } catch { render(null); $("lc-error").textContent = "Session expired. Please sign in again."; }
    }
    $("lc-open").addEventListener("click", open);
    $("lc-cancel").addEventListener("click", close); $("lc-close").addEventListener("click", close);
    $("lc-switch").addEventListener("click", () => { mode = mode === "login" ? "register" : "login"; $("lc-title").textContent = mode === "login" ? "Your Lupin account" : "Create your Lupin account"; $("lc-submit").textContent = mode === "login" ? "Sign in" : "Create account"; $("lc-switch").textContent = mode === "login" ? "Create account" : "I have an account"; $("lc-password").autocomplete = mode === "login" ? "current-password" : "new-password"; $("lc-error").textContent = ""; });
    $("lc-form").addEventListener("submit", async event => {
      event.preventDefault(); $("lc-submit").disabled = true; $("lc-error").textContent = mode === "login" ? "Signing in…" : "Creating account…";
      try { const user = mode === "login" ? await login($("lc-username").value.trim(), $("lc-password").value) : await register($("lc-username").value.trim(), $("lc-password").value); $("lc-error").textContent = ""; render(user); $("lc-form").reset(); }
      catch (error) { $("lc-error").textContent = error.message; }
      finally { $("lc-submit").disabled = false; }
    });
    $("lc-logout").addEventListener("click", async () => { $("lc-logout").disabled = true; try { await logout(); render(null); close(); } catch (error) { $("lc-error").textContent = error.message; } finally { $("lc-logout").disabled = false; } });
    window.addEventListener("lupin-auth-change", event => render(event.detail?.user || null));
    if (read()?.token) refresh().catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountWidget, { once: true }); else mountWidget();
})();
