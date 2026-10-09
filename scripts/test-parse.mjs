import assert from "node:assert/strict";
import { parseAhorramas } from "./scrape.mjs";

const html = `<div><span>(268 productos)</span>
<div class="product-tile"><div class="image-container"><div class="tile-promo-callout"><div class="badge-promo d-block d-md-none"> 2x1 </div><div class="badge-promo d-none d-md-block"> 2x1 </div></div>
<a href="/x-72468.html" class="product-pdp-link" data-gtm-layer="%7B%22id%22%3A%2272468%22%2C%22name%22%3A%22Yogur%20estilo%20griego%20Danone%20pack%204%20stracciatella%22%2C%22brand%22%3A%22DANONE%22%2C%22price%22%3A%221.79%22%7D"><img class="tile-image" src="https://www.ahorramas.com/dw/image/v2/BFNH_PRD/on/demandware.static/-/Sites-ahorramas-master/default/dw861b12d3/Assets/072468_C1C1/large/e/2/a/f/e2af15c265f802b816e80c99376fe66d4396eb26_072468_C1C1.jpg?sw=400&amp;sh=900"></a></div>
<div class="tile-body"><div class="price"><span class="sales"><span class="value" content="1.79"> 1<span class="decimal-part">,79€</span></span></span><div class="unit-price-row price"><span class="unit-price-per-unit grey"> 4,07€/KILO </span></div></div>
<h2 class="link product-name-gtm">Yogur estilo griego Danone pack 4 stracciatella</h2>
<div class="tile-promotions"><div class="tile-promo-callout red"><div class="promo-info-label"> Compra 2 unidades y paga 1! <span class="promo-date-range">(09/10/26 - 18/10/26)</span></div></div></div>
<div class="add-to-cart" data-pid="72468" data-hasunitweight="false"></div></div></div>
<div class="product-tile"><div class="image-container"><div class="tile-badge-container"><img class="badge-icon" src="/promocionado.svg"></div>
<a href="/x-23187.html" class="product-pdp-link" data-gtm-layer="%7B%22id%22%3A%2223187%22%2C%22name%22%3A%22K%C3%A9fir%20Nestl%C3%A9%20pack%206%20natural%22%2C%22brand%22%3A%22NESTLE%22%2C%22price%22%3A%223.49%22%7D"><img class="tile-image" src="https://www.ahorramas.com/dw/image/v2/BFNH_PRD/on/demandware.static/-/Sites-ahorramas-master/default/dwb4f7fcbc/Assets/023187_C1C1/large/3/c/0/e/3c0e_023187_C1C1.jpg?sw=400"></a></div>
<div class="tile-body"><div class="price"><del><span class="strike-through list"><span class="value" content="3.49"> 3,49€ </span></span></del><span class="sales"><span class="value" content="2.49"> 2,49€ </span></span>
<div class="unit-price-row price"><span class="strike-through unit-price-per-unit"><span class="unit-price-old"> 5,82€ </span></span><span class="unit-price-per-unit grey"> 4,15€/KILO </span></div></div>
<h2 class="link product-name-gtm">Kéfir Nestlé pack 6 natural</h2>
<div class="tile-promotions"><div class="tile-promo-callout red"><div class="promo-info-label"> Bajada de precio a <span class="promo-price">2.49€</span> <span class="promo-date-range">(24/09/26 - 28/10/26)</span></div></div></div>
<div class="add-to-cart" data-pid="23187" data-hasunitweight="false"></div></div></div>
<div class="product-tile"><a class="product-pdp-link" data-gtm-layer="%7B%22id%22%3A%2210282%22%2C%22name%22%3A%22Calabac%C3%ADn%22%2C%22price%22%3A%221.49%22%7D"><img class="tile-image" src="https://www.ahorramas.com/dw/image/a.jpg"></a>
<span class="sales"><span class="value" content="1.49"></span></span><span class="unit-price-per-unit grey"> 1,49€/KILO </span><h2 class="product-name-gtm">Calabacín</h2><div class="add-to-cart" data-pid="10282" data-hasunitweight="true"></div></div>
</div>`;

const { items, total } = parseAhorramas(html);
assert.equal(total, 268);
assert.equal(items.length, 3);
assert.deepEqual(items[0].d, [2, 1.79]);
assert.equal(items[0].bd, "2x1");
assert.equal(items[0].pr, "Compra 2 unidades y paga 1!");
assert.equal(items[0].pd, "09/10/26 - 18/10/26");
assert.equal(items[0].uu, "kg");
assert.equal(items[0].pu, 4.07);
assert.ok(items[0].i.startsWith("/dw/image/v2/") && !items[0].i.includes("?"));
assert.equal(items[1].p, 2.49);
assert.equal(items[1].op, 3.49);
assert.equal(items[1].pu, 4.15);
assert.equal(items[1].pr, "Bajada de precio a 2.49€");
assert.equal(items[1].d, undefined);
assert.equal(items[2].w, true);
assert.equal(items[0].w, undefined);
console.log("OK", JSON.stringify(items, null, 1));
