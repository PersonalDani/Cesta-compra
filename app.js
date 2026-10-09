import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const STORES = {
  dia: { name: "Dia", site: "dia.es", url: "https://www.dia.es", c: "var(--dia)", img: i => "https://www.dia.es" + i + "?imwidth=176" },
  ahorramas: { name: "Ahorramas", site: "ahorramas.com", url: "https://www.ahorramas.com", c: "var(--ahorramas)", img: i => "https://www.ahorramas.com" + i + "?sw=176&sh=176&sm=fit" }
};
const UNITS = { kg: "€/kg", l: "€/l", ud: "€/ud", doc: "€/docena", m: "€/m", lavado: "€/lavado" };
const LS = { code: "mc:code", state: "mc:state", store: "mc:store", queue: "mc:queue", sort: "mc:sort", sent: "mc:sent" };
const REMOTE = !!(SUPABASE_URL && SUPABASE_KEY);
const POLL_MS = 8000;

const $ = id => document.getElementById(id);
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const money = v => eur.format(v || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const CHEV = '<svg class="chev" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

let S = cleanState(lsGet(LS.state, null));
let code = lsGet(LS.code, null);
let queue = lsGet(LS.queue, []);
let store = lsGet(LS.store, "dia");
let tab = "cat";
let syncState = REMOTE ? "loading" : "local";
let flushing = false;
const CAT = {};
const shownPerSub = {};

function cleanState(d) {
  return { cart: Array.isArray(d?.cart) ? d.cart : [], saved: Array.isArray(d?.saved) ? d.saved : [], updated_at: d?.updated_at || null };
}
function persist() { lsSet(LS.state, S); lsSet(LS.queue, queue); }

const isW = p => p.uu === "kg" && p.pu && Math.abs(p.pu - p.p) < 0.005 && !/\d\s*(k?g|gr|kilo)s?\b/i.test(p.n || "");
const step = it => it.w ? 0.5 : 1;
const qtyTxt = it => it.w ? String(it.q).replace(".", ",") + " kg" : String(it.q);

function findProduct(s, id) { return CAT[s]?.byId?.get(String(id)) || null; }
function pick(p) {
  return { p: p.p, op: p.op || null, pu: p.pu || null, uu: p.uu || "", d: p.d || null, bd: p.bd || "", pr: p.pr || "", club: !!p.club, i: p.i || "", w: !!p.w };
}
function live(it) {
  if (it.manual || !STORES[it.s]) return it;
  const c = CAT[it.s];
  if (!c?.ready) return it;
  const f = c.byId.get(String(it.id));
  return f ? { ...it, ...pick(f.p), gone: false } : { ...it, gone: true };
}
function lineTotal(it) {
  const q = it.q || 0, p = +it.p || 0;
  if (Array.isArray(it.d) && it.d[0] > 1 && q >= it.d[0]) { const n = it.d[0], t = +it.d[1]; return Math.floor(q / n) * t + (q % n) * p; }
  return p * q;
}
function totals(items) {
  let t = 0, full = 0, c = 0, n = 0;
  for (const raw of items) { const it = live(raw); const l = lineTotal(it); t += l; full += (+it.p || 0) * it.q; n++; if (it.done) c += l; }
  return { t, full, c, n, save: full - t };
}
function storeName(it) { return it.s === "otro" ? (it.sn || "Otro") : (STORES[it.s]?.name || it.s); }
function storeColor(s) { return STORES[s]?.c || "var(--otro)"; }
function imgUrl(s, it) { return it.i && STORES[s] ? STORES[s].img(it.i) : ""; }
function photo(s, it, size) {
  const u = imgUrl(s, it);
  if (!u) return `<div class="ph none" style="width:${size}px;height:${size}px" aria-hidden="true">—</div>`;
  return `<img class="ph" src="${esc(u)}" alt="" loading="lazy" decoding="async" width="${size}" height="${size}" referrerpolicy="no-referrer">`;
}
function unitText(p) { return p.pu ? `${String(p.pu.toFixed(2)).replace(".", ",")} ${UNITS[p.uu] || "€/" + esc(p.uu || "ud")}` : ""; }
function badges(it) {
  let h = "";
  if (it.club) h += `<span class="badge club">Precio Club Dia</span>`;
  if (it.bd) h += `<span class="badge" title="${esc(it.pr || "")}">${esc(it.bd)}</span>`;
  else if (it.op && it.op > it.p) h += `<span class="badge">-${Math.round((1 - it.p / it.op) * 100)}%</span>`;
  if (Array.isArray(it.d) && !/^\s*\d+\s*x\s*\d+/i.test(it.bd || "")) h += `<span class="badge">${it.d[0]} uds por ${money(it.d[1])}</span>`;
  return h;
}

function applyLocal(op) {
  const c = S.cart;
  if (op.t === "add") {
    const ex = c.find(x => x.k === op.item.k);
    if (ex) ex.q = Math.round((ex.q + (op.item.q || 1)) * 100) / 100; else c.push({ ...op.item });
  } else if (op.t === "qty") {
    if (op.q <= 0) S.cart = c.filter(x => x.k !== op.k); else { const ex = c.find(x => x.k === op.k); if (ex) ex.q = op.q; }
  } else if (op.t === "done") {
    const ex = c.find(x => x.k === op.k); if (ex) ex.done = !!op.v;
  } else if (op.t === "del") {
    S.cart = c.filter(x => x.k !== op.k);
  } else if (op.t === "cart") {
    S.cart = op.items;
  } else if (op.t === "saved") {
    S.saved = op.items;
  }
}
function act(op, soft) {
  applyLocal(op);
  if (REMOTE) queue.push(op);
  persist();
  soft ? softRender() : render();
  if (REMOTE) flush();
}

async function rpc(fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(args || {})
  });
  const txt = await r.text();
  let body = null; try { body = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (!r.ok) { const err = new Error(body?.message || txt || ("HTTP " + r.status)); err.status = r.status; throw err; }
  return body;
}
async function ensureCode() {
  if (code) return code;
  code = await rpc("cesta_crear");
  lsSet(LS.code, code);
  if (S.cart.length || S.saved.length) {
    queue = [{ t: "cart", items: S.cart }, { t: "saved", items: S.saved }].concat(queue.filter(o => o.t !== "cart" && o.t !== "saved"));
    persist();
  }
  return code;
}
async function flush() {
  if (!REMOTE || flushing) return;
  flushing = true;
  try {
    await ensureCode();
    let last = null;
    while (queue.length) {
      last = await rpc("cesta_op", { p_code: code, p_op: queue[0] });
      queue.shift(); persist();
    }
    if (last && !queue.length) { S = cleanState(last); persist(); }
    setSync("ok");
  } catch (e) {
    if (/cesta_no_existe/.test(e.message)) { setSync("missing"); }
    else if (e.status >= 400 && e.status < 500 && !/cesta_no_existe/.test(e.message)) { queue.shift(); persist(); setSync("warn", "No se pudo guardar un cambio"); }
    else setSync("offline");
  } finally { flushing = false; }
}
async function pull() {
  if (!REMOTE || flushing || queue.length || document.hidden) return;
  try {
    await ensureCode();
    const d = await rpc("cesta_leer", { p_code: code });
    if (!d) { setSync("missing"); return; }
    if (d.updated_at !== S.updated_at) { S = cleanState(d); persist(); softRender(true); }
    setSync("ok");
  } catch (e) { setSync("offline"); }
}
function setSync(st, msg) {
  syncState = st;
  const el = $("sync");
  const txt = msg || { ok: "Cesta compartida", local: "Solo en este móvil", offline: "Sin conexión · se guardará luego", missing: "Cesta no encontrada", loading: "Conectando…", warn: "No se pudo guardar" }[st];
  el.className = "sync" + (st === "ok" ? " ok" : (st === "offline" || st === "warn" || st === "missing") ? " warn" : "");
  el.querySelector("span").textContent = txt;
  if (tab === "share") renderShare();
}

async function loadStore(s) {
  if (CAT[s]?.loading || CAT[s]?.ready) return;
  CAT[s] = { loading: true };
  try {
    const r = await fetch(`data/${s}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    const subs = {}, byId = new Map();
    for (const cat of data.cats) for (const sb of cat.subs) {
      const items = sb.items.map(p => { const o = { ...p, id: String(p.id) }; o.w = p.w === true || (!data.wflag && isW(o)); return o; });
      subs[sb.id] = { name: sb.name, items };
      for (const p of items) if (!byId.has(p.id)) byId.set(p.id, { p, subName: sb.name, t: norm(p.n + " " + (p.b || "")) });
    }
    CAT[s] = { ready: true, data, subs, byId };
  } catch (e) { CAT[s] = { error: String(e.message || e) }; }
  if (store === s && tab === "cat") renderCatalog();
  renderBar();
  if (tab === "cart") renderCart();
}

function cartItem(s, id) { return S.cart.find(c => c.k === s + ":" + id); }
function prodRow(s, p, subName, showWhere) {
  const c = cartItem(s, p.id);
  const ctl = c
    ? `<div class="qty"><button data-act="dec" data-k="${esc(c.k)}" aria-label="Quitar">−</button><span>${qtyTxt(c)}</span><button data-act="inc" data-k="${esc(c.k)}" aria-label="Añadir más">+</button></div>`
    : `<button class="add" data-act="add" data-s="${s}" data-id="${esc(p.id)}">Añadir</button>`;
  return `<div class="prod">${photo(s, p, 60)}
    <div class="pi"><div class="pn">${esc(p.n)}</div><div class="pm">${showWhere ? `<span class="where">${esc(subName)}</span>` : ""}${!p.w && unitText(p) ? `<span class="num">${unitText(p)}</span>` : ""}${p.w ? `<span>Se vende al peso</span>` : ""}${badges(p)}</div></div>
    <div class="pr"><div class="price">${money(p.p)}${p.w ? `<small>/kg</small>` : ""}${p.op && p.op > p.p ? `<s>${money(p.op)}</s>` : ""}</div>${ctl}</div></div>`;
}
function sorted(items) {
  const m = $("sort").value;
  if (m === "rec") return items;
  const a = items.slice();
  if (m === "price") a.sort((x, y) => x.p - y.p); else a.sort((x, y) => (x.pu || 9e9) - (y.pu || 9e9));
  return a;
}

function renderStores() {
  $("stores").innerHTML = Object.keys(STORES).map(s => {
    const c = CAT[s]; const n = c?.ready ? c.data.products : "";
    return `<button class="store" style="--c:${storeColor(s)}" aria-pressed="${store === s}" data-store="${s}"><i></i>${esc(STORES[s].name)}${n ? ` <span class="n">${n}</span>` : ""}</button>`;
  }).join("");
  const c = CAT[store];
  $("storeMeta").innerHTML = c?.ready
    ? `Precios de <a href="${STORES[store].url}" target="_blank" rel="noopener">${STORES[store].site}</a> del ${new Date(c.data.updated).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}. Se actualizan cada mes; en tienda pueden variar.`
    : "";
}
function renderCatalog() {
  renderStores();
  const s = store, out = $("catOut"), c = CAT[s];
  if (!c || c.loading) { out.innerHTML = `<div class="empty"><strong>Cargando ${esc(STORES[s].name)}…</strong>La primera vez tarda unos segundos; después se abre al momento.</div>`; loadStore(s); return; }
  if (c.error) { out.innerHTML = `<div class="empty"><strong>No se pudo cargar el catálogo</strong>Comprueba la conexión y vuelve a intentarlo.<button class="btn" data-act="retryStore">Reintentar</button></div>`; return; }
  const q = norm($("q").value.trim());
  if (q) {
    const words = q.split(/\s+/);
    const hits = []; for (const f of c.byId.values()) if (words.every(w => f.t.includes(w))) hits.push(f);
    const meta = new Map(hits.map(h => [h.p.id, h.subName]));
    const shown = sorted(hits.map(h => h.p)).slice(0, 80);
    out.innerHTML = hits.length
      ? `<p class="note">${hits.length} resultado${hits.length === 1 ? "" : "s"}${hits.length > 80 ? " (se muestran 80)" : ""}</p><div class="results">${shown.map(p => prodRow(s, p, meta.get(p.id), true)).join("")}</div>`
      : `<div class="empty"><strong>Sin resultados</strong>No hay nada con «${esc($("q").value.trim())}» en ${esc(STORES[s].name)}.</div>`;
    return;
  }
  const open = new Set([...out.querySelectorAll("details[open]")].map(d => d.dataset.key));
  out.innerHTML = c.data.cats.map(cat => {
    const n = cat.subs.reduce((a, sb) => a + sb.items.length, 0);
    const ck = "c:" + s + ":" + cat.id;
    return `<details class="cat" data-key="${esc(ck)}"${open.has(ck) ? " open" : ""}><summary><span class="l">${CHEV}<span>${esc(cat.name)}</span></span><span class="n">${n}</span></summary>${cat.subs.map(sb => {
      const sk = "s:" + s + ":" + sb.id;
      return `<details class="sub" data-key="${esc(sk)}" data-sub="${esc(sb.id)}"${open.has(sk) ? " open" : ""}><summary><span class="l">${CHEV}<span>${esc(sb.name)}</span></span><span class="n">${sb.items.length}</span></summary><div class="prods"></div></details>`;
    }).join("")}</details>`;
  }).join("");
  out.querySelectorAll("details.sub[open]").forEach(fillSub);
}
function fillSub(det) {
  const s = store, id = det.dataset.sub, box = det.querySelector(".prods"), d = CAT[s]?.subs?.[id];
  if (!d || !box) return;
  const lim = shownPerSub[s + id] || 60; const items = sorted(d.items);
  box.innerHTML = items.slice(0, lim).map(p => prodRow(s, p, d.name, false)).join("") +
    (items.length > lim ? `<div class="more"><button class="btn" data-act="more" data-sub="${esc(id)}">Ver ${Math.min(60, items.length - lim)} más de ${items.length - lim}</button></div>` : "");
}

function renderCart() {
  const out = $("cartOut");
  if (!S.cart.length) {
    out.innerHTML = `<div class="empty"><strong>La cesta está vacía</strong>Ve al catálogo, abre una sección y pulsa «Añadir» en lo que quieras comprar.<button class="btn primary" data-tabgo="cat">Ir al catálogo</button></div>`;
    $("cartActions").hidden = true; return;
  }
  for (const s of new Set(S.cart.map(i => i.s))) if (STORES[s]) loadStore(s);
  const groups = new Map();
  for (const raw of S.cart) { const it = live(raw); const g = it.s === "otro" ? "otro:" + (it.sn || "Otro") : it.s; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); }
  let h = "";
  for (const items of groups.values()) {
    const s = items[0].s, t = totals(items);
    const ordered = items.filter(i => !i.done).concat(items.filter(i => i.done));
    h += `<div class="group"><div class="ghead"><h2 style="--c:${storeColor(s)}"><i></i>${esc(storeName(items[0]))}</h2><span class="num">${money(t.t)}</span></div><div class="citems">${ordered.map(it => {
      const lt = lineTotal(it), full = (+it.p || 0) * it.q;
      return `<div class="crow${it.done ? " done" : ""}">
        <button class="check" data-act="toggle" data-k="${esc(it.k)}" aria-label="${it.done ? "Desmarcar" : "Marcar como cogido"}">${CHECK}</button>
        ${photo(s, it, 44)}
        <div class="pi"><div class="pn" data-act="toggle" data-k="${esc(it.k)}">${esc(it.n)}</div><div class="pm"><span class="num">${money(it.p)}/${it.w ? "kg" : "ud"}</span>${badges(it)}${it.gone ? `<span class="warn">Ya no aparece en el catálogo</span>` : ""}</div></div>
        <div class="cside"><div class="price">${money(lt)}</div>${full - lt > 0.004 ? `<span class="save">Ahorras ${money(full - lt)}</span>` : ""}<div class="qty"><button data-act="dec" data-k="${esc(it.k)}" aria-label="Quitar">−</button><span>${qtyTxt(it)}</span><button data-act="inc" data-k="${esc(it.k)}" aria-label="Añadir más">+</button></div></div></div>`;
    }).join("")}</div></div>`;
  }
  out.innerHTML = h; $("cartActions").hidden = false;
}

function renderSaved() {
  const out = $("savedOut");
  if (!S.saved.length) { out.innerHTML = `<div class="empty"><strong>Aún no hay cestas guardadas</strong>Llena la cesta y pulsa «Guardar cesta» para repetir esa compra otro día con un toque.</div>`; return; }
  for (const b of S.saved) for (const s of new Set(b.items.map(i => i.s))) if (STORES[s]) loadStore(s);
  out.innerHTML = `<div class="panel">` + S.saved.slice().sort((a, b) => (b.created || 0) - (a.created || 0)).map(b => {
    const t = totals(b.items); const stores = [...new Set(b.items.map(i => storeName(i)))].join(" · ");
    return `<div class="basket"><div class="hd"><h3>${esc(b.name)}</h3><span class="price">${money(t.t)}</span></div>
      <p>${t.n} producto${t.n === 1 ? "" : "s"} · ${esc(stores)}</p>
      <div class="thumbs">${b.items.slice(0, 12).map(i => photo(i.s, live(i), 36)).join("")}</div>
      <div class="actions"><button class="btn primary" data-act="useB" data-id="${esc(b.id)}" ${S.cart.length ? "data-confirm" : ""}>Usar como cesta</button><button class="btn" data-act="mergeB" data-id="${esc(b.id)}">Sumar a la cesta</button><button class="btn" data-act="overB" data-id="${esc(b.id)}" data-confirm>Sustituir por la cesta actual</button><button class="btn danger" data-act="delB" data-id="${esc(b.id)}" data-confirm>Borrar</button></div></div>`;
  }).join("") + `</div>`;
}

function baseUrl() { return location.origin + location.pathname.replace(/[^/]*$/, ""); }
function listLink(c) { return baseUrl() + "lista.html?l=" + c; }
function sendLinkHTML(c) {
  const link = listLink(c);
  return `<div class="code" id="sendLink">${esc(link)}</div>
    <div class="actions">
      <button class="btn primary" data-act="copySend" data-link="${esc(link)}">Copiar enlace</button>
      <a class="btn" href="https://wa.me/?text=${encodeURIComponent("Te paso la lista de la compra: " + link)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
      ${navigator.share ? `<button class="btn" data-act="shareSend" data-link="${esc(link)}">Compartir…</button>` : ""}
    </div>`;
}
async function renderSent() {
  const out = $("sentOut"); if (!out) return;
  const sent = lsGet(LS.sent, []);
  if (!sent.length) { out.innerHTML = ""; return; }
  out.innerHTML = `<div class="panel"><h3>Listas enviadas</h3>${sent.map(x => `<div class="basket" data-sent="${esc(x.code)}"><div class="hd"><h3>${esc(x.name)}</h3><span class="price">${money(x.total)}</span></div><p class="sentst">${x.n} producto${x.n === 1 ? "" : "s"} · enviada el ${new Date(x.created).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}</p><div class="actions"><a class="btn" href="${esc(listLink(x.code))}" target="_blank" rel="noopener">Abrir lista</a><button class="btn" data-act="copySend" data-link="${esc(listLink(x.code))}">Copiar enlace</button><button class="btn ghost" data-act="forgetSent" data-code="${esc(x.code)}" data-confirm>Quitar de aquí</button></div></div>`).join("")}</div>`;
  if (!REMOTE) return;
  for (const x of sent) {
    try {
      const d = await rpc("lista_leer", { p_code: x.code });
      const el = out.querySelector(`[data-sent="${x.code}"] .sentst`);
      if (!el) continue;
      if (!d) { el.textContent = "Esta lista ya no existe"; continue; }
      const done = d.items.filter(i => i.done).length;
      el.innerHTML = `<b class="num">${done} de ${d.items.length}</b> cogidos · enviada el ${new Date(d.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`;
    } catch (e) {}
  }
}

function shareLink() { return code ? location.origin + location.pathname + "?c=" + code : ""; }
function cartText() {
  const groups = new Map();
  for (const raw of S.cart) { const it = live(raw); const g = storeName(it); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); }
  let txt = "🛒 Lista de la compra\n";
  for (const [g, items] of groups) {
    txt += `\n${g}\n`;
    for (const it of items) txt += `${it.done ? "✔" : "•"} ${qtyTxt(it)} × ${it.n} — ${money(lineTotal(it))}\n`;
  }
  txt += `\nTotal: ${money(totals(S.cart).t)}`;
  return txt;
}
function renderShare() {
  const out = $("shareOut");
  if (!REMOTE) { out.innerHTML = `<div class="empty"><strong>Compartir no está activado</strong>Falta configurar Supabase en config.js. Mientras tanto la cesta se guarda solo en este móvil.</div>`; return; }
  const link = shareLink();
  const status = { ok: "Conectada. Los cambios se ven en todos los móviles con este enlace.", offline: "Sin conexión ahora mismo. Tus cambios se guardan y se enviarán al volver la conexión.", missing: "Este enlace no corresponde a ninguna cesta. Puedes crear una nueva.", loading: "Conectando…", warn: "Un cambio no se pudo guardar." }[syncState] || "";
  out.innerHTML = `
    <div class="form">
      <h3>Cesta compartida</h3>
      <p class="note">${esc(status)}</p>
      <p class="note">Quien abra este enlace ve y edita la misma cesta y las mismas cestas guardadas, y puede ir marcando lo que coge. Pásalo solo a quien quieras.</p>
      ${link ? `<div class="code" id="shareLink">${esc(link)}</div>
      <div class="actions">
        <button class="btn primary" data-act="copyLink">Copiar enlace</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent("Mi lista de la compra: " + link)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
        ${navigator.share ? `<button class="btn" data-act="shareLink">Compartir…</button>` : ""}
      </div>` : `<button class="btn primary" data-act="retrySync">Crear cesta compartida</button>`}
    </div>
    <div class="form">
      <h3>Lista en texto</h3>
      <p class="note">Para pegar en un mensaje, sin enlace.</p>
      <div class="actions"><button class="btn" data-act="copyText" ${S.cart.length ? "" : "disabled"}>Copiar lista</button></div>
    </div>
    <div class="form">
      <h3>Unirse a otra cesta</h3>
      <p class="note">Pega el enlace que te hayan pasado. La cesta de este móvil se cambiará por esa.</p>
      <div class="inline"><input id="joinIn" placeholder="https://…?c=…" autocomplete="off"><button class="btn primary" data-act="join" data-confirm>Unirme</button></div>
    </div>
    <div class="form">
      <h3>Empezar una cesta nueva</h3>
      <p class="note">Deja de compartir con quien tenga el enlace actual. Tu cesta y tus cestas guardadas se copian a la nueva.</p>
      <div class="actions"><button class="btn danger" data-act="newCode" data-confirm>Crear enlace nuevo</button></div>
    </div>`;
}

function renderBar() {
  const t = totals(S.cart);
  $("cartCnt").textContent = t.n ? String(t.n) : "";
  $("tTotal").textContent = money(t.t);
  if (tab === "cart") {
    $("tLabel").textContent = "Total cesta";
    $("tSub").innerHTML = `<span>Cogido <b class="num">${money(t.c)}</b></span><span>Falta <b class="num">${money(t.t - t.c)}</b></span>` + (t.save > 0.004 ? `<span>Ahorro en ofertas <b class="num">${money(t.save)}</b></span>` : "");
    $("tGo").hidden = true;
  } else {
    const st = totals(S.cart.filter(i => i.s === store));
    $("tLabel").textContent = "Subtotal cesta";
    $("tSub").innerHTML = `<span>${t.n} producto${t.n === 1 ? "" : "s"}</span>` + (st.n && st.n !== t.n ? `<span>${esc(STORES[store]?.name || "")} <b class="num">${money(st.t)}</b></span>` : "");
    $("tGo").hidden = false;
  }
}

function render() {
  try {
    for (const t of ["cat", "cart", "saved", "share"]) $("v-" + t).hidden = t !== tab;
    document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
    if (tab === "cat") renderCatalog();
    if (tab === "cart") renderCart();
    if (tab === "saved") { renderSaved(); renderSent(); }
    if (tab === "share") renderShare();
    renderBar();
  } catch (e) { showRecovery(e); }
}
function softRender(fromRemote) {
  try {
    if (tab === "cat") {
      if ($("q").value.trim()) renderCatalog();
      else document.querySelectorAll("#catOut details.sub[open]").forEach(fillSub);
    } else if (!(fromRemote && document.activeElement && document.activeElement.tagName === "INPUT")) render();
    renderBar();
  } catch (e) { showRecovery(e); }
}

function toast(t) {
  const el = $("toast"); el.textContent = t; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2600);
}
function arm(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = "1"; const old = btn.textContent; btn.textContent = "¿Seguro? Toca otra vez";
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; } }, 3000);
  return false;
}
async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch (e) { const el = $("shareLink"); if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast("Mantén pulsado para copiar"); }
}
function parseCode(v) {
  v = String(v || "").trim(); if (!v) return null;
  try { const u = new URL(v); v = u.searchParams.get("c") || ""; } catch (e) {}
  return /^[a-z0-9]{20,64}$/i.test(v) ? v : null;
}
async function joinCode(c) {
  code = c; lsSet(LS.code, c); queue = []; S = cleanState(null); persist();
  setSync("loading"); render();
  await pull();
  if (syncState === "ok") toast("Te has unido a la cesta compartida");
}
function snapshot(c) { const x = { ...live(c), done: false }; delete x.gone; return x; }

document.addEventListener("click", async e => {
  const st = e.target.closest("[data-store]");
  if (st) { store = st.dataset.store; lsSet(LS.store, store); $("q").value = ""; render(); window.scrollTo({ top: 0 }); return; }
  const tb = e.target.closest("[data-tab],[data-tabgo]");
  if (tb) { tab = tb.dataset.tab || tb.dataset.tabgo; render(); window.scrollTo({ top: 0 }); if (tab !== "cat") pull(); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (b.hasAttribute("data-confirm") && !arm(b)) return;
  const it = b.dataset.k ? S.cart.find(c => c.k === b.dataset.k) : null;
  switch (a) {
    case "add": {
      const f = findProduct(b.dataset.s, b.dataset.id); if (!f) return;
      const p = f.p, s = b.dataset.s;
      act({ t: "add", item: { k: s + ":" + p.id, s, id: p.id, n: p.n, b: p.b || "", ...pick(p), sub: f.subName, q: 1, done: false } }, true);
      return;
    }
    case "inc": if (it) act({ t: "qty", k: it.k, q: Math.round((it.q + step(it)) * 100) / 100 }, true); return;
    case "dec": if (it) act({ t: "qty", k: it.k, q: Math.round((it.q - step(it)) * 100) / 100 < step(it) - 0.001 ? 0 : Math.round((it.q - step(it)) * 100) / 100 }, true); return;
    case "toggle": if (it) act({ t: "done", k: it.k, v: !it.done }); return;
    case "more": { const k = store + b.dataset.sub; shownPerSub[k] = (shownPerSub[k] || 60) + 60; const d = b.closest("details.sub"); if (d) fillSub(d); return; }
    case "retryStore": CAT[store] = null; renderCatalog(); return;
    case "uncheckAll": act({ t: "cart", items: S.cart.map(c => ({ ...c, done: false })) }); return;
    case "removeDone": act({ t: "cart", items: S.cart.filter(c => !c.done) }); return;
    case "clearCart": act({ t: "cart", items: [] }); return;
    case "saveBasket": {
      if (!S.cart.length) return;
      const name = $("bname").value.trim() || "Cesta del " + new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long" });
      act({ t: "saved", items: S.saved.concat([{ id: nid(), name, created: Date.now(), items: S.cart.map(snapshot) }]) });
      $("bname").value = ""; toast("Cesta guardada en «Mis cestas»"); return;
    }
    case "useB": { const bk = S.saved.find(x => x.id === b.dataset.id); if (!bk) return; tab = "cart"; act({ t: "cart", items: bk.items.map(snapshot) }); return; }
    case "mergeB": {
      const bk = S.saved.find(x => x.id === b.dataset.id); if (!bk) return;
      const items = S.cart.map(c => ({ ...c }));
      for (const i of bk.items) { const ex = items.find(c => c.k === i.k); if (ex) ex.q = Math.round((ex.q + i.q) * 100) / 100; else items.push(snapshot(i)); }
      tab = "cart"; act({ t: "cart", items }); return;
    }
    case "overB": { if (!S.cart.length) return; act({ t: "saved", items: S.saved.map(x => x.id === b.dataset.id ? { ...x, items: S.cart.map(snapshot) } : x) }); toast("Cesta sustituida"); return; }
    case "delB": act({ t: "saved", items: S.saved.filter(x => x.id !== b.dataset.id) }); return;
    case "copyLink": copy(shareLink(), "Enlace copiado"); return;
    case "sendList": {
      if (!S.cart.length) return;
      if (!REMOTE) { toast("Falta configurar Supabase"); return; }
      const name = $("listName").value.trim() || "Lista de la compra";
      const items = S.cart.map(raw => { const it = live(raw); return { k: it.k, st: storeName(it), n: it.n, q: it.q, w: !!it.w, lt: Math.round(lineTotal(it) * 100) / 100, bd: it.bd || "", u: imgUrl(it.s, it), done: false }; });
      b.disabled = true; b.textContent = "Creando…";
      try {
        const c = await rpc("lista_crear", { p_name: name, p_items: items });
        const sent = lsGet(LS.sent, []);
        sent.unshift({ code: c, name, created: Date.now(), n: items.length, total: items.reduce((a, i) => a + i.lt, 0) });
        lsSet(LS.sent, sent.slice(0, 30));
        $("sendOut").innerHTML = sendLinkHTML(c);
        $("listName").value = "";
        toast("Lista creada: ya puedes enviarla");
      } catch (err) { toast("No se pudo crear la lista; revisa la conexión"); }
      b.disabled = false; b.textContent = "Crear enlace";
      return;
    }
    case "copySend": copy(b.dataset.link, "Enlace copiado"); return;
    case "shareSend": try { await navigator.share({ title: "Lista de la compra", url: b.dataset.link }); } catch (err) {} return;
    case "forgetSent": lsSet(LS.sent, lsGet(LS.sent, []).filter(x => x.code !== b.dataset.code)); renderSent(); return;
    case "shareLink": try { await navigator.share({ title: "Mi Cesta", text: "Mi lista de la compra", url: shareLink() }); } catch (err) {} return;
    case "copyText": copy(cartText(), "Lista copiada"); return;
    case "retrySync": setSync("loading"); await flush(); await pull(); render(); return;
    case "join": { const c = parseCode($("joinIn").value); if (!c) { toast("Ese enlace no parece de Mi Cesta"); return; } await joinCode(c); return; }
    case "newCode": {
      const keep = { cart: S.cart, saved: S.saved };
      try {
        setSync("loading");
        const c = await rpc("cesta_crear"); code = c; lsSet(LS.code, c);
        queue = [{ t: "cart", items: keep.cart }, { t: "saved", items: keep.saved }]; persist();
        await flush(); toast("Enlace nuevo creado"); render();
      } catch (err) { setSync("offline"); toast("No hay conexión; inténtalo luego"); }
      return;
    }
  }
});

document.addEventListener("toggle", e => { const d = e.target; if (d.matches && d.matches("details.sub") && d.open) fillSub(d); }, true);
document.addEventListener("error", e => {
  const t = e.target;
  if (t && t.tagName === "IMG" && t.classList.contains("ph") && !t.dataset.failed) {
    t.dataset.failed = "1";
    const d = document.createElement("div"); d.className = "ph none"; d.textContent = "—"; d.style.width = t.width + "px"; d.style.height = t.height + "px"; t.replaceWith(d);
  }
}, true);
$("q").addEventListener("input", () => { clearTimeout($("q")._t); $("q")._t = setTimeout(renderCatalog, 180); });
$("sort").addEventListener("change", () => { lsSet(LS.sort, $("sort").value); if ($("q").value.trim()) renderCatalog(); else document.querySelectorAll("#catOut details.sub[open]").forEach(fillSub); });
$("manual").addEventListener("submit", e => {
  e.preventDefault();
  const n = $("m-name").value.trim(); if (!n) return;
  const p = Math.round(parseFloat(String($("m-price").value).replace(/\s|€/g, "").replace(",", ".")) * 100) / 100 || 0;
  const sn = $("m-store").value.trim() || "Otro";
  act({ t: "add", item: { k: "m:" + nid(), s: "otro", sn, id: "", n, p, q: 1, done: false, manual: true } });
  $("manual").reset(); toast("Añadido a la cesta");
});
$("recReload").addEventListener("click", () => location.reload());
$("recReset").addEventListener("click", () => { for (const k of Object.values(LS)) if (k !== LS.code) lsDel(k); location.reload(); });

function showRecovery(err) {
  try { $("recoveryMsg").textContent = String(err?.message || err || "Error desconocido"); $("recovery").hidden = false; } catch (e) {}
}
window.addEventListener("error", e => { if (e.error) showRecovery(e.error); });
window.addEventListener("unhandledrejection", e => { console.warn(e.reason); });
window.addEventListener("online", () => { flush(); pull(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });

async function init() {
  try {
    const sv = lsGet(LS.sort, "rec"); if (["rec", "price", "unit"].includes(sv)) $("sort").value = sv;
    if (!STORES[store]) store = "dia";
    const urlCode = parseCode(new URLSearchParams(location.search).get("c"));
    if (urlCode) history.replaceState(null, "", location.pathname);
    render();
    if (!REMOTE) { setSync("local"); return; }
    if (urlCode && urlCode !== code) {
      await joinCode(urlCode);
    } else {
      setSync("loading");
      await flush(); await pull();
    }
    setInterval(pull, POLL_MS);
  } catch (e) { showRecovery(e); }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
init();
