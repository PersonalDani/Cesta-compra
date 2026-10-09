import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const $ = id => document.getElementById(id);
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const money = v => eur.format(v || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CHECK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const COLORS = { Dia: "var(--dia)", Ahorramas: "var(--ahorramas)" };

const code = (new URLSearchParams(location.search).get("l") || "").trim();
const cacheKey = "mc:lista:" + code;
let L = null;
let pending = 0;

function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

async function rpc(fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(args || {}) });
  const txt = await r.text();
  let body = null; try { body = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (!r.ok) { const err = new Error(body?.message || txt || "HTTP " + r.status); err.status = r.status; throw err; }
  return body;
}

function setSync(st) {
  const el = $("sync");
  el.className = "sync" + (st === "ok" ? " ok" : " warn");
  el.querySelector("span").textContent = { ok: "Sincronizada", offline: "Sin conexión", missing: "No encontrada" }[st] || "";
}
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2400); }
function photo(it) {
  return it.u ? `<img class="ph" src="${esc(it.u)}" alt="" loading="lazy" decoding="async" width="52" height="52" referrerpolicy="no-referrer">` : `<div class="ph none" style="width:52px;height:52px" aria-hidden="true">—</div>`;
}
function qtyTxt(it) { return it.w ? String(it.q).replace(".", ",") + " kg" : it.q + " ud" + (it.q === 1 ? "" : "s"); }

function render() {
  if (!L) return;
  $("lname").textContent = L.name;
  document.title = L.name;
  $("lmeta").textContent = "Enviada el " + new Date(L.created_at).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const groups = new Map();
  for (const it of L.items) { const g = it.st || "Otros"; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); }
  let h = "", total = 0, left = 0, done = 0;
  for (const [g, items] of groups) {
    const gt = items.reduce((a, i) => a + (+i.lt || 0), 0);
    const ordered = items.filter(i => !i.done).concat(items.filter(i => i.done));
    h += `<div class="group"><div class="ghead"><h2 style="--c:${COLORS[g] || "var(--otro)"}"><i></i>${esc(g)}</h2><span class="num">${money(gt)}</span></div><div class="citems">${ordered.map(it => `
      <div class="lrow${it.done ? " done" : ""}" data-k="${esc(it.k)}" role="checkbox" aria-checked="${!!it.done}" tabindex="0">
        <span class="check">${CHECK}</span>
        ${photo(it)}
        <div class="pi"><div class="pn">${esc(it.n)}</div><div class="pm"><span class="q">${qtyTxt(it)}</span>${it.bd ? `<span class="badge">${esc(it.bd)}</span>` : ""}</div></div>
        <div class="price">${money(it.lt)}</div>
      </div>`).join("")}</div></div>`;
  }
  for (const it of L.items) { total += +it.lt || 0; if (it.done) done++; else left += +it.lt || 0; }
  $("out").innerHTML = h;
  $("extra").hidden = false;
  $("tTotal").textContent = money(total);
  $("tDone").textContent = `${done}/${L.items.length}`;
  $("tLeft").textContent = money(left);
  $("bar").style.width = (L.items.length ? Math.round(done / L.items.length * 100) : 0) + "%";
}

async function load(silent) {
  if (pending || document.hidden) return;
  try {
    const d = await rpc("lista_leer", { p_code: code });
    if (!d) { if (!L) $("out").innerHTML = `<div class="empty"><strong>Esta lista no existe</strong>Puede que el enlace esté incompleto. Pide que te lo vuelvan a enviar.</div>`; setSync("missing"); return; }
    if (!L || d.updated_at !== L.updated_at) { L = d; lsSet(cacheKey, L); render(); }
    setSync("ok");
  } catch (e) { setSync("offline"); if (!silent && !L) $("out").innerHTML = `<div class="empty"><strong>No hay conexión</strong>En cuanto vuelva la conexión se cargará la lista.</div>`; }
}

async function toggle(k) {
  const it = L?.items.find(i => i.k === k); if (!it) return;
  it.done = !it.done; render(); lsSet(cacheKey, L);
  pending++;
  try { const d = await rpc("lista_marcar", { p_code: code, p_k: k, p_v: it.done }); pending--; if (!pending) { L = d; lsSet(cacheKey, L); render(); } setSync("ok"); }
  catch (e) { pending--; setSync("offline"); toast("Sin conexión: se marcará cuando vuelva"); retryLater(k, it.done); }
}
const retries = new Map();
function retryLater(k, v) { retries.set(k, v); }
async function flushRetries() {
  for (const [k, v] of [...retries]) {
    try { await rpc("lista_marcar", { p_code: code, p_k: k, p_v: v }); retries.delete(k); } catch (e) { return; }
  }
  load(true);
}

document.addEventListener("click", e => { const row = e.target.closest(".lrow"); if (row) toggle(row.dataset.k); });
document.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && e.target.classList?.contains("lrow")) { e.preventDefault(); toggle(e.target.dataset.k); } });
document.addEventListener("error", e => { const t = e.target; if (t?.tagName === "IMG" && t.classList.contains("ph") && !t.dataset.failed) { t.dataset.failed = "1"; const d = document.createElement("div"); d.className = "ph none"; d.textContent = "—"; d.style.width = d.style.height = "52px"; t.replaceWith(d); } }, true);
$("copyText").addEventListener("click", async () => {
  if (!L) return;
  let txt = `🛒 ${L.name}\n`;
  const groups = new Map();
  for (const it of L.items) { const g = it.st || "Otros"; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); }
  for (const [g, items] of groups) { txt += `\n${g}\n`; for (const it of items) txt += `${it.done ? "✔" : "•"} ${qtyTxt(it)} × ${it.n} — ${money(it.lt)}\n`; }
  txt += `\nTotal: ${$("tTotal").textContent}`;
  try { await navigator.clipboard.writeText(txt); toast("Lista copiada"); } catch (err) { toast("No se pudo copiar"); }
});
$("uncheck").addEventListener("click", async () => {
  if (!L) return;
  for (const it of L.items.filter(i => i.done)) await toggle(it.k);
});
window.addEventListener("online", flushRetries);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { flushRetries(); } });

if (!code || !SUPABASE_URL) {
  $("out").innerHTML = `<div class="empty"><strong>Falta el código de la lista</strong>Abre el enlace completo que te enviaron.</div>`;
} else {
  L = lsGet(cacheKey);
  if (L) render();
  load();
  setInterval(() => load(true), 8000);
}
