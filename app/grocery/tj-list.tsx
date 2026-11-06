"use client";

import { useEffect, useMemo, useState } from "react";
import { TJ_AISLES } from "@/lib/tj";
import type { GroceryItem } from "@/lib/types";

const money = (n: number) => `$${n.toFixed(2)}`;
const storageKey = (planId: number) => `pp.tj.basket.${planId}`;

/** Read/write the in-store "got it" ticks. Browser-only convenience; the list still works without it. */
function loadBasket(planId: number): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey(planId)) ?? "[]"));
  } catch {
    return new Set();
  }
}
function saveBasket(planId: number, keys: Set<string>) {
  try {
    localStorage.setItem(storageKey(planId), JSON.stringify([...keys]));
  } catch {
    /* private mode etc. */
  }
}

const BASICS = "Basics: only if you're out";
const basic = (i: GroceryItem) => i.tjAisle === BASICS;

function lineText(i: GroceryItem) {
  if (basic(i)) return i.name;
  const buy = i.tj ? `${i.tj.packages} × ${i.name}${i.tj.size ? ` (${i.tj.size})` : ""}` : i.name;
  const need = i.amounts.join(" + ");
  return need && need !== "to taste" ? `${buy} — for ${need}` : buy;
}

export default function TraderJoesList({
  planId,
  items,
  onToggleHave,
}: {
  planId: number;
  items: GroceryItem[];
  onToggleHave: (item: GroceryItem) => void;
}) {
  const [basket, setBasket] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [showHome, setShowHome] = useState(false);

  useEffect(() => setBasket(loadBasket(planId)), [planId]);

  const toBuy = useMemo(() => items.filter((i) => !i.have), [items]);
  const atHome = useMemo(() => items.filter((i) => i.have), [items]);
  const aisles = useMemo(
    () =>
      TJ_AISLES.map((a) => ({
        aisle: a,
        items: toBuy.filter((i) => i.tjAisle === a).sort((x, y) => x.name.localeCompare(y.name)),
      })).filter((g) => g.items.length),
    [toBuy],
  );
  const priced = toBuy.filter((i) => i.tj && !basic(i));
  const total = priced.reduce((s, i) => s + i.tj!.total, 0);
  const unpriced = toBuy.filter((i) => !i.tj && !basic(i) && i.tjAisle !== "Spices & Seasonings");
  const got = toBuy.filter((i) => basket.has(i.key)).length;

  function toggleGot(key: string) {
    const next = new Set(basket);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setBasket(next);
    saveBasket(planId, next);
  }

  async function copyList() {
    const text = [
      `Trader Joe's list${total ? ` (about ${money(total)})` : ""}`,
      ...aisles.flatMap((g) => ["", g.aisle.toUpperCase(), ...g.items.map((i) => `☐ ${lineText(i)}`)]),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy your list:", text);
    }
  }

  return (
    <div className="grocery-layout">
      <div className="receipt tj" aria-label="Trader Joe's shopping list">
        <header>
          <strong>Trader Joe&apos;s</strong>
          <span>{toBuy.length} to buy · {got} in basket</span>
        </header>
        {toBuy.length === 0 && <p>Nothing to buy. Pick recipes on the Meal plan page.</p>}
        {aisles.map((g) => (
          <div key={g.aisle}>
            <div className="aisle">{g.aisle}</div>
            {g.items.map((i) => {
              const inBasket = basket.has(i.key);
              return (
                <div key={i.key} className={`line-item tj-line${inBasket ? " have" : ""}`}>
                  <input type="checkbox" checked={inBasket} onChange={() => toggleGot(i.key)} aria-label={`${i.name} in basket`} />
                  <div className="what">
                    {i.tj && !basic(i) ? <><strong>{i.tj.packages} ×</strong> {i.name}</> : i.name}
                    {i.tj?.size && !basic(i) && <span className="pack"> · {i.tj.size}</span>}
                    <div className="for">
                      {i.amounts.join("") === "to taste" ? "" : `Needs ${i.amounts.join(" + ")} · `}
                      {i.recipes.join(", ")}
                    </div>
                  </div>
                  <div className="qty">{i.tj && !basic(i) ? `~${money(i.tj.total)}` : ""}</div>
                  <button className="pick" onClick={() => onToggleHave(i)}>Already have it</button>
                </div>
              );
            })}
          </div>
        ))}
        <footer>
          <span>Estimated total</span>
          <strong>{total ? `≈ ${money(total)}` : "—"}</strong>
        </footer>
      </div>

      <aside className="side no-print">
        <section className="panel stack">
          <h2>Trader Joe&apos;s</h2>
          <p className="small muted">
            Trader Joe&apos;s doesn&apos;t take online orders, so take this list to the store. It&apos;s in store order: produce first,
            frozen near the end. Tick items as they go in your basket.
          </p>
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={copyList}>{copied ? "Copied" : "Copy list"}</button>
            <button className="btn" onClick={() => window.print()}>Print</button>
            {got > 0 && (
              <button className="btn btn-quiet" style={{ justifySelf: "start", paddingInline: 0 }} onClick={() => { setBasket(new Set()); saveBasket(planId, new Set()); }}>
                Untick everything
              </button>
            )}
          </div>
          <p className="small muted">
            Prices are estimates for typical Trader Joe&apos;s prices and package sizes, and vary by store.
            {unpriced.length > 0 && ` ${unpriced.length} item${unpriced.length === 1 ? " has" : "s have"} no estimate yet.`}
          </p>
          {atHome.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <button className="link-btn small" style={{ justifySelf: "start" }} onClick={() => setShowHome(!showHome)}>
                {showHome ? "Hide" : "Show"} {atHome.length} item{atHome.length === 1 ? "" : "s"} already at home
              </button>
              {showHome && (
                <ul className="home-list">
                  {atHome.map((i) => (
                    <li key={i.key}>
                      {i.name} <button className="link-btn small" onClick={() => onToggleHave(i)}>Need it</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
