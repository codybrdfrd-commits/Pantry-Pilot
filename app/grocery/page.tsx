"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GroceryItem, ProductMatch } from "@/lib/types";

interface KrogerStatus { configured: boolean; connected: boolean; locationId: string | null; locationName: string | null }
interface Product { upc: string; description: string; brand: string | null; size: string | null; price: number | null; promo: number | null; image: string | null; inStock: boolean | null }
interface Store { locationId: string; name: string; chain: string; address: string }

const KROGER_MESSAGES: Record<string, { text: string; error?: boolean }> = {
  connected: { text: "Kroger account connected." },
  denied: { text: "Kroger sign-in was cancelled. Connect again when you're ready.", error: true },
  state: { text: "Kroger sign-in expired. Start it again from this page.", error: true },
  error: { text: "Kroger didn't accept the sign-in. Check the client ID, secret and redirect URI in .env.", error: true },
};

const money = (n: number | null) => (n == null ? "" : `$${n.toFixed(2)}`);

export default function GroceryPage() {
  const [planId, setPlanId] = useState<number | null>(null);
  const [items, setItems] = useState<GroceryItem[] | null>(null);
  const [kroger, setKroger] = useState<KrogerStatus | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [g, k] = await Promise.all([fetch("/api/grocery").then((r) => r.json()), fetch("/api/kroger/status").then((r) => r.json())]);
    setPlanId(g.planId);
    setItems(g.items);
    setKroger(k);
  }

  useEffect(() => {
    load();
    const flag = new URLSearchParams(window.location.search).get("kroger");
    if (flag && KROGER_MESSAGES[flag]) {
      setMsg(KROGER_MESSAGES[flag]);
      window.history.replaceState(null, "", "/grocery");
    }
  }, []);

  const needed = useMemo(() => items?.filter((i) => !i.have) ?? [], [items]);
  const inCart = needed.filter((i) => i.match);
  const estimate = inCart.reduce((sum, i) => sum + (i.match!.price ?? 0) * i.match!.quantity, 0);

  async function toggleHave(item: GroceryItem) {
    setItems((list) => list!.map((i) => (i.key === item.key ? { ...i, have: !i.have } : i)));
    await fetch("/api/grocery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, key: item.key, have: !item.have }),
    });
  }

  async function saveMatch(key: string, match: ProductMatch | null) {
    setItems((list) => list!.map((i) => (i.key === key ? { ...i, match } : i)));
    await fetch("/api/kroger/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(match ? { key, ...match } : { key, upc: null }),
    });
  }

  async function autoMatch() {
    const todo = needed.filter((i) => !i.match);
    for (let n = 0; n < todo.length; n++) {
      setBusy(`Matching ${n + 1} of ${todo.length}…`);
      const res = await fetch(`/api/kroger/products?term=${encodeURIComponent(todo[n].name)}`);
      if (!res.ok) { setMsg({ text: (await res.json()).error, error: true }); break; }
      const products: Product[] = await res.json();
      const best = products.find((p) => p.inStock !== false) ?? products[0];
      if (best) await saveMatch(todo[n].key, { upc: best.upc, description: best.description, size: best.size, price: best.promo ?? best.price, image: best.image, quantity: 1 });
    }
    setBusy(null);
  }

  async function sendToCart() {
    setBusy("Adding to your Kroger cart…");
    const res = await fetch("/api/kroger/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: inCart.map((i) => ({ upc: i.match!.upc, quantity: i.match!.quantity })) }),
    });
    const json = await res.json();
    setBusy(null);
    if (res.ok) setMsg({ text: `Added ${json.added} items to your Kroger cart. Review and check out on kroger.com or in the Kroger app.` });
    else {
      setMsg({ text: json.error, error: true });
      if (res.status === 401) setKroger((k) => k && { ...k, connected: false });
    }
  }

  if (!items || !kroger) return <p className="muted">Loading…</p>;

  if (!planId)
    return (
      <div className="page-head">
        <h1>Groceries</h1>
        <p>Your list is built from a meal plan. Make one first.</p>
        <p><Link className="btn btn-primary" href="/plan">Plan meals</Link></p>
      </div>
    );

  let lastCategory = "";
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Groceries</h1>
        <p>Everything your plan needs, combined across recipes. Tick off what you already have and it stays out of the cart.</p>
      </div>
      {msg && <p className={`notice${msg.error ? " error" : ""}`} role="status">{msg.text}</p>}

      <div className="grocery-layout">
        <div className="receipt" aria-label="Grocery list">
          <header>
            <strong>Shopping list</strong>
            <span>{needed.length} to buy · {items.length - needed.length} at home</span>
          </header>
          {items.length === 0 && <p>Your plan has no ingredients yet. Add recipes to its meals.</p>}
          {items.map((item) => {
            const showAisle = item.category !== lastCategory;
            lastCategory = item.category;
            return (
              <div key={item.key}>
                {showAisle && <div className="aisle">{item.category}</div>}
                <div className={`line-item${item.have ? " have" : ""}`}>
                  <input type="checkbox" checked={item.have} onChange={() => toggleHave(item)} aria-label={`Have ${item.name} at home`} />
                  <div className="what">
                    {item.name}
                    <div className="for">{item.recipes.join(", ")}</div>
                  </div>
                  <div className="qty">{item.amounts.join(" + ")}</div>
                  {!item.have && kroger.configured && (
                    <button className="pick" onClick={() => setOpenKey(openKey === item.key ? null : item.key)} aria-expanded={openKey === item.key}>
                      {item.match ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {item.match.image && <img src={item.match.image} alt="" />}
                          <span>{item.match.quantity} × {item.match.description} {item.match.size && `(${item.match.size})`} {money(item.match.price)}</span>
                        </>
                      ) : (
                        <span>Choose a Kroger product</span>
                      )}
                    </button>
                  )}
                  {openKey === item.key && (
                    <ProductPicker item={item} onPick={(m) => { saveMatch(item.key, m); setOpenKey(null); }} />
                  )}
                </div>
              </div>
            );
          })}
          <footer>
            <span>{inCart.length} of {needed.length} matched</span>
            <strong>{estimate > 0 ? `≈ ${money(estimate)}` : ""}</strong>
          </footer>
        </div>

        <aside className="side">
          <KrogerPanel
            status={kroger}
            onChange={setKroger}
            busy={busy}
            unmatched={needed.filter((i) => !i.match).length}
            ready={inCart.length}
            onAutoMatch={autoMatch}
            onSend={sendToCart}
          />
        </aside>
      </div>
    </div>
  );
}

function ProductPicker({ item, onPick }: { item: GroceryItem; onPick: (m: ProductMatch | null) => void }) {
  const [term, setTerm] = useState(item.name);
  const [results, setResults] = useState<Product[] | null>(null);
  const [qty, setQty] = useState(item.match?.quantity ?? 1);
  const [error, setError] = useState<string | null>(null);

  async function search(t: string) {
    setResults(null);
    setError(null);
    const res = await fetch(`/api/kroger/products?term=${encodeURIComponent(t)}`);
    const json = await res.json();
    if (res.ok) setResults(json);
    else setError(json.error);
  }
  useEffect(() => { search(item.name); }, [item.name]);

  return (
    <div className="picker">
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); search(term); }}>
        <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search Kroger products" style={{ flex: 1 }} />
        <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} aria-label="Quantity" style={{ width: 70 }} />
      </form>
      {error && <p className="small" role="alert">{error}</p>}
      {!results && !error && <p className="small">Searching…</p>}
      {results?.length === 0 && <p className="small">No products found. Try a simpler name.</p>}
      {results?.map((p) => (
        <button
          key={p.upc}
          className="product"
          onClick={() => onPick({ upc: p.upc, description: p.description, size: p.size, price: p.promo ?? p.price, image: p.image, quantity: qty })}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image ? <img src={p.image} alt="" /> : <span />}
          <span>
            {p.description}
            <span className="small" style={{ display: "block", color: "#6a6f68" }}>
              {[p.size, p.inStock === false ? "Out of stock" : null].filter(Boolean).join(" — ")}
            </span>
          </span>
          <span className="price">{money(p.promo ?? p.price)}</span>
        </button>
      ))}
      {item.match && <button className="btn btn-quiet" onClick={() => onPick(null)}>Remove product</button>}
    </div>
  );
}

function KrogerPanel(props: {
  status: KrogerStatus;
  onChange: (s: KrogerStatus) => void;
  busy: string | null;
  unmatched: number;
  ready: number;
  onAutoMatch: () => void;
  onSend: () => void;
}) {
  const { status } = props;
  const [zip, setZip] = useState("");
  const [stores, setStores] = useState<Store[] | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [changingStore, setChangingStore] = useState(!status.locationId);

  async function findStores(e: React.FormEvent) {
    e.preventDefault();
    setStoreError(null);
    const res = await fetch(`/api/kroger/locations?zip=${zip}`);
    const json = await res.json();
    if (res.ok) setStores(json);
    else setStoreError(json.error);
  }

  async function pickStore(s: Store) {
    const name = `${s.name} — ${s.address}`;
    await fetch("/api/kroger/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: s.locationId, name }),
    });
    props.onChange({ ...status, locationId: s.locationId, locationName: name });
    setChangingStore(false);
    setStores(null);
  }

  if (!status.configured)
    return (
      <section className="panel stack">
        <h2>Kroger</h2>
        <p className="small">Add your Kroger client ID and secret to <code>.env</code> to price items and send them to your cart.</p>
      </section>
    );

  return (
    <section className="panel stack">
      <h2>Kroger</h2>

      <div className="stack" style={{ gap: 8 }}>
        <h3>Store</h3>
        {status.locationName && !changingStore ? (
          <>
            <p className="small">{status.locationName}</p>
            <button className="btn btn-quiet" style={{ justifySelf: "start", paddingInline: 0 }} onClick={() => setChangingStore(true)}>Change store</button>
          </>
        ) : (
          <>
            <form className="row" style={{ gap: 8 }} onSubmit={findStores}>
              <input type="text" inputMode="numeric" placeholder="ZIP code" value={zip} onChange={(e) => setZip(e.target.value)} style={{ flex: 1 }} aria-label="ZIP code" />
              <button className="btn" type="submit">Find stores</button>
            </form>
            {storeError && <p className="small" role="alert">{storeError}</p>}
            {stores?.length === 0 && <p className="small">No Kroger-family stores within 15 miles.</p>}
            <div className="store-list">
              {stores?.map((s) => (
                <button key={s.locationId} className="btn" onClick={() => pickStore(s)}>
                  <span>{s.name}<span className="small muted" style={{ display: "block", fontWeight: 400 }}>{s.address}</span></span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3>Products</h3>
        <p className="small muted">
          {props.unmatched === 0 ? "Every item has a product." : `${props.unmatched} items still need a product. Your choices are remembered for next time.`}
        </p>
        {props.unmatched > 0 && (
          <button className="btn" onClick={props.onAutoMatch} disabled={!!props.busy || !status.locationId}>
            Match remaining items
          </button>
        )}
        {!status.locationId && <p className="small muted">Pick a store first for local prices and stock.</p>}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3>Cart</h3>
        {status.connected ? (
          <>
            <button className="btn btn-primary" onClick={props.onSend} disabled={!!props.busy || props.ready === 0}>
              Add {props.ready} items to Kroger cart
            </button>
            <button
              className="btn btn-quiet"
              style={{ justifySelf: "start", paddingInline: 0 }}
              onClick={async () => { await fetch("/api/kroger/status", { method: "DELETE" }); props.onChange({ ...status, connected: false }); }}
            >
              Disconnect Kroger account
            </button>
          </>
        ) : (
          <>
            <p className="small muted">Sign in to Kroger once so items can be added to your cart.</p>
            <a className="btn btn-primary" href="/api/kroger/login">Connect Kroger account</a>
          </>
        )}
        {props.busy && <p className="small" role="status">{props.busy}</p>}
      </div>
    </section>
  );
}
