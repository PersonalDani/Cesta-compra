import { load } from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";

const UA = "Mozilla/5.0 (compatible; MiCesta/1.0; lista de la compra de uso personal)";
const DELAY_MS = 1200;
const MIN_RATIO = 0.6;
const DATA_DIR = path.resolve(process.cwd(), "data");
const ONLY = process.argv.slice(2);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const round2 = v => Math.round(v * 100) / 100;
const clean = s => String(s || "").replace(/\s+/g, " ").trim();

async function get(url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9", Accept: "text/html,application/xhtml+xml" } });
      if (r.ok) return await r.text();
      last = new Error(`HTTP ${r.status} en ${url}`);
    } catch (e) { last = e; }
    await sleep(4000 * (attempt + 1));
  }
  throw last;
}

function unitOf(s, pu) {
  s = String(s || "").toLowerCase();
  if (/100\s*gr/.test(s)) return ["kg", pu * 10];
  if (/100\s*ml/.test(s)) return ["l", pu * 10];
  if (/kilo|kg/.test(s)) return ["kg", pu];
  if (/litro|\bl\b/.test(s)) return ["l", pu];
  if (/docena/.test(s)) return ["doc", pu];
  if (/lavado/.test(s)) return ["lavado", pu];
  if (/metro/.test(s)) return ["m", pu];
  return ["ud", pu];
}
function num(s) {
  const m = String(s ?? "").replace(/\s/g, "").match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}
function compact(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== "" && v !== false && !(Array.isArray(v) && !v.length)) out[k] = v;
  return out;
}

function ahorramasDeal(p, bd, pr) {
  const t = `${bd} | ${pr}`;
  let m;
  if ((m = t.match(/Compra\s+(\d+)\s+unidades?\s+y\s+paga\s+(\d+)/i))) return [+m[1], round2(p * +m[2])];
  if ((m = t.match(/Comprando\s+(\d+),?\s+la\s+unidad\s+te\s+sale\s+a\s+([\d.,]+)/i))) return [+m[1], round2(+m[1] * parseFloat(m[2].replace(",", ".")))];
  if ((m = String(bd).match(/^\s*(\d+)\s*x\s*(\d+)\s*$/i))) return [+m[1], round2(p * +m[2])];
  if ((m = t.match(/(\d+)\s*ª\s*unidad\s+al\s+(\d+)\s*%/i))) { const n = +m[1]; return [n, round2((n - 1) * p + p * (+m[2]) / 100)]; }
  if ((m = t.match(/(\d+)\s*ª\s*unidad\s+(?:a\s+)?mitad\s+de\s+precio/i))) { const n = +m[1]; return [n, round2((n - 1) * p + p / 2)]; }
  return null;
}

export function parseAhorramas(html) {
  const $ = load(html);
  const items = [];
  $(".product-tile").each((_, el) => {
    const t = $(el);
    let g = {};
    try { g = JSON.parse(decodeURIComponent(t.find("a.product-pdp-link").first().attr("data-gtm-layer") || "{}")); } catch (e) {}
    const sales = t.find(".sales .value").first().attr("content");
    const list = t.find(".strike-through.list .value").first().attr("content");
    const p = sales ? parseFloat(sales) : (g.price ? parseFloat(g.price) : null);
    const id = String(g.id || t.find("[data-pid]").first().attr("data-pid") || "");
    const n = clean(t.find(".product-name-gtm").first().text() || g.name);
    if (!id || !n || !(p > 0)) return;
    const unitTxt = clean(t.find(".unit-price-per-unit").not(".strike-through").last().text());
    const [uu, pu] = unitOf(unitTxt, num(unitTxt) || 0);
    const bd = clean(t.find(".badge-promo").first().text());
    const label = t.find(".promo-info-label").first();
    const pd = clean(label.find(".promo-date-range").text()).replace(/[()]/g, "");
    label.find(".promo-date-range").remove();
    const pr = clean(label.text());
    const src = t.find("img.tile-image").first().attr("src") || "";
    let i = "";
    try { if (src) i = new URL(src, "https://www.ahorramas.com").pathname; } catch (e) {}
    const op = list ? parseFloat(list) : null;
    const w = t.find("[data-hasunitweight]").first().attr("data-hasunitweight") === "true";
    items.push(compact({ id, n, b: clean(g.brand), p, op: op && op > p ? op : null, pu: pu ? round2(pu) : null, uu, bd, pr, pd, d: ahorramasDeal(p, bd, pr), i, w }));
  });
  const m = html.match(/\((\d+)\s*productos?\)/);
  return { items, total: m ? +m[1] : null };
}

const AHORRAMAS_TREE = [
  ["frescos", "Frescos", "carniceria:Carnicería|charcuteria:Charcutería|frutas:Frutas|verduras-y-hortalizas:Verduras y Hortalizas|pescado-y-mariscos:Pescado y Mariscos|quesos:Quesos|huevos:Huevos"],
  ["lacteos", "Lácteos", "leche:Leche|bebidas-vegetales:Bebidas vegetales|yogures-y-kefir:Yogures y kéfir|postres:Postres|mantequilla-margarina-y-nata:Mantequilla, margarina y nata|batidos-y-bebidas-frias:Batidos y bebidas frías|horchatas:Horchatas"],
  ["alimentacion", "Alimentación", "aceite-vinagre-y-sal:Aceite, Vinagre y sal|aperitivos-y-frutos-secos:Aperitivos y Frutos Secos|arroces-pastas-y-legumbres:Arroces, Pastas y Legumbres|azucar-y-edulcorantes:Azúcar y Edulcorantes|bolleria-y-reposteria:Bollería y Repostería|cacao-cafes-e-infusiones:Cacao, Cafés e Infusiones|caldos-pures-y-sopas:Caldos, purés y sopas|chocolates-golosinas-y-turrones:Chocolates, Golosinas y Turrones|conservas-de-frutas:Conservas de Frutas|conservas-de-pescado:Conservas de Pescado|conservas-vegetales:Conservas Vegetales|galletas-cereales-y-barritas:Galletas, Cereales y Barritas|gazpacho-y-salmorejo:Gazpacho y salmorejo|harina-levadura-y-preparados:Harina, Levadura y Preparados|miel-y-mermeladas:Miel y Mermeladas|panaderia:Panadería|platos-preparados:Platos Preparados|tomate-frito-salsas-y-especias:Tomate Frito, Salsas y Especias|productos-dieteticos:Productos Dietéticos|productos-ecologicos:Productos Ecológicos"],
  ["congelados", "Congelados", "pizzas-y-baguettes:Pizzas y baguettes|helados:Helados|rebozados:Rebozados|pescado-y-marisco-congelado:Pescado y Marisco Congelado|platos-preparados-congelados:Platos Preparados Congelados|reposteria-y-panaderia-congelada:Repostería y Panadería Congelada|verduras-hortalizas-y-frutas-congeladas:Verduras, Hortalizas y Frutas Congeladas|hielo:Hielo"],
  ["bebidas", "Bebidas", "refrescos:Refrescos|cerveza:Cerveza|zumos:Zumos|agua:Agua|bebidas-alcoholicas:Bebidas Alcohólicas|vinos:Vinos|cava-champagne-y-sidra:Cava, Champagne y Sidra"],
  ["limpieza", "Limpieza", "papel-y-celulosa:Papel y celulosa|detergentes-y-suavizantes:Detergentes y suavizantes|limpieza-de-hogar:Limpieza de hogar|lavavajillas:Lavavajillas|utensilios-de-limpieza:Utensilios de limpieza|ambientadores:Ambientadores|desinfectantes:Desinfectantes|cuidado-de-la-ropa:Cuidado de la ropa|productos-para-calzado:Productos para calzado|insecticidas:Insecticidas"],
  ["cuidado-personal", "Cuidado personal", "cuidado-del-cabello:Cuidado del cabello|higiene-corporal:Higiene corporal|higiene-bucal:Higiene bucal|cuidado-facial:Cuidado facial|desodorantes:Desodorantes|higiene-intima:Higiene íntima|parafarmacia:Parafarmacia|depilacion:Depilación|afeitado:Afeitado|pies-y-manos:Pies y manos|cremas-solares-y-autobronceadores:Cremas solares y autobronceadores|colonias:Colonias|maquillaje:Maquillaje"],
  ["hogar", "Hogar", "textil:Textil|menaje-de-cocina:Menaje de Cocina|jardineria-y-exterior:Jardinería y exterior|orden-y-decoracion:Orden y decoración|juguetes-y-vajilla-infantil:Juguetes y vajilla infantil|pilas:Pilas|bombillas-e-iluminacion:Bombillas e iluminación|papeleria:Papelería"],
  ["bebe", "Bebé", "alimentacion-infantil:Alimentación infantil|panales:Pañales|cuidados-del-bebe:Cuidados del bebé|puericultura:Puericultura"],
  ["mascotas", "Mascotas", "perros:Perros|gatos:Gatos|otros-animales:Otros animales"]
].map(([id, name, subs]) => ({ id, name, subs: subs.split("|").map(s => { const i = s.indexOf(":"); return { slug: s.slice(0, i), name: s.slice(i + 1) }; }) }));

async function scrapeAhorramas() {
  const base = "https://www.ahorramas.com";
  const cats = [];
  for (const c of AHORRAMAS_TREE) {
    const subs = [];
    for (const s of c.subs) {
      const seen = new Map();
      for (let start = 0, k = 0; k < 10; k++, start += 500) {
        const html = await get(`${base}/${c.id}/${s.slug}/?start=${start}&sz=500`);
        const { items, total } = parseAhorramas(html);
        for (const it of items) if (!seen.has(it.id)) seen.set(it.id, it);
        await sleep(DELAY_MS);
        if (items.length < 500 || (total && seen.size >= total)) break;
      }
      const items = [...seen.values()];
      console.log(`ahorramas · ${c.name} > ${s.name}: ${items.length}`);
      if (items.length) subs.push({ id: `${c.id}-${s.slug}`, name: s.name, items });
    }
    if (subs.length) cats.push({ id: c.id, name: c.name, subs });
  }
  return { store: "ahorramas", name: "Ahorramas", site: base, wflag: true, cats };
}

function diaState(html) {
  const m = html.match(/<script[^>]*id="vike_pageContext"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]).INITIAL_STATE || null; } catch (e) { return null; }
}
function diaItem(i) {
  const pr = i.prices || {};
  const p = +pr.price;
  if (!i.object_id || !i.display_name || !(p > 0)) return null;
  const promo = (i.promotions || [])[0];
  let bd = "", desc = "", d = null, m;
  if (promo) {
    desc = clean(promo.description);
    if ((m = desc.match(/(\d)\s*ª\s*U(?:D|NIDAD)\.?\s*AL\s*(\d+)\s*%/i))) { const n = +m[1], pct = +m[2]; d = [n, round2((n - 1) * p + p * (1 - pct / 100))]; bd = `${n}ª ud -${pct}%`; }
    else if ((m = desc.match(/\b(\d)\s*X\s*(\d)\b/i))) { const a = +m[1], b = +m[2]; if (a > b) { d = [a, round2(b * p)]; bd = `${a}x${b}`; } }
    if (promo.only_club_dia && bd) bd += " Club";
  }
  const st = +pr.strikethrough_price;
  const [uu, pu] = unitOf(pr.measure_unit, +pr.price_per_unit || 0);
  let img = "";
  try { if (i.image) img = new URL(i.image, "https://www.dia.es").pathname; } catch (e) {}
  return compact({ id: String(i.object_id), n: clean(i.display_name), b: clean(i.brand), p, op: st > p ? st : null, pu: pu ? round2(pu) : null, uu, bd, pr: desc, d, club: !!pr.is_club_price, i: img });
}

async function scrapeDia() {
  const base = "https://www.dia.es";
  const first = diaState(await get(`${base}/charcuteria-y-quesos/c/L101`));
  if (!first) throw new Error("Dia: no se encontró el estado de la página");
  const tree = first.header.categoriesData.categories
    .filter(c => !["L124", "L128"].includes(c.id))
    .map(c => ({ id: c.id, name: c.name, subs: (c.children || []).filter(s => s.id !== c.id && !/^todo/i.test(s.name)) }));
  const cats = [];
  for (const c of tree) {
    const subs = [];
    for (const s of c.subs) {
      const seen = new Map();
      let pages = 1;
      for (let pg = 1; pg <= pages && pg <= 15; pg++) {
        const st = diaState(await get(pg === 1 ? base + s.link : `${base}${s.link}?page=${pg}`));
        await sleep(DELAY_MS);
        if (!st) break;
        for (const raw of st.l2?.plp_items || []) { const it = diaItem(raw); if (it && !seen.has(it.id)) seen.set(it.id, it); }
        pages = st.pagination?.pagination?.total_pages || 1;
      }
      const items = [...seen.values()];
      console.log(`dia · ${c.name} > ${s.name}: ${items.length}`);
      if (items.length) subs.push({ id: s.id, name: s.name, items });
    }
    if (subs.length) cats.push({ id: c.id, name: c.name, subs });
  }
  return { store: "dia", name: "Dia", site: base, cats };
}

async function previousCount(store) {
  try { return JSON.parse(await fs.readFile(path.join(DATA_DIR, `${store}.json`), "utf8")).products || 0; } catch (e) { return 0; }
}

async function run(store, fn) {
  const out = await fn();
  const ids = new Set();
  for (const c of out.cats) for (const s of c.subs) for (const it of s.items) ids.add(it.id);
  const prev = await previousCount(store);
  if (prev && ids.size < prev * MIN_RATIO) throw new Error(`${store}: solo ${ids.size} productos frente a ${prev} anteriores; no se sobrescribe`);
  const data = { store: out.store, name: out.name, site: out.site, ...(out.wflag ? { wflag: true } : {}), updated: new Date().toISOString().slice(0, 10), products: ids.size, cats: out.cats };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, `${store}.json`), JSON.stringify(data));
  console.log(`${store}: ${ids.size} productos guardados`);
}

async function main() {
  const jobs = { dia: scrapeDia, ahorramas: scrapeAhorramas };
  let failed = 0;
  for (const [store, fn] of Object.entries(jobs)) {
    if (ONLY.length && !ONLY.includes(store)) continue;
    try { await run(store, fn); }
    catch (e) { failed++; console.error(`ERROR ${store}: ${e.message}`); }
  }
  if (failed) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
