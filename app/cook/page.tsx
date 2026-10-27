"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { coverage } from "@/lib/pantry";
import { shrinkImage } from "@/lib/resize";
import { itemKey } from "@/lib/units";
import type { Ingredient, MealPlan, PantryItem, Recipe } from "@/lib/types";

const DEFAULT_SERVINGS = 4;

interface Idea {
  title: string;
  why: string;
  servings: number;
  prep_minutes: number | null;
  tags: string[];
  source: string | null;
  ingredients: Ingredient[];
  steps: string[];
}

type Notice = { text: string; error?: boolean } | null;

/** Add a recipe to this week (4 servings) and tick off the ingredients you just bought. */
async function addToWeek(recipeId: number, haveKeys: string[]) {
  const plan: MealPlan = await fetch("/api/plan").then((r) => r.json());
  const seen = new Set<number>();
  const items = plan.entries
    .filter((e) => e.recipe_id != null && !seen.has(e.recipe_id) && (seen.add(e.recipe_id), true))
    .map((e) => ({ recipeId: e.recipe_id!, servings: e.servings }));
  if (!seen.has(recipeId)) items.push({ recipeId, servings: DEFAULT_SERVINGS });
  const res = await fetch("/api/plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
  if (!res.ok) throw new Error("Couldn't add it to this week.");
  if (haveKeys.length) {
    await fetch("/api/grocery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan.id, keys: haveKeys, have: true }),
    });
  }
}

const boughtNote = (n: number) =>
  n ? ` ${n} thing${n === 1 ? "" : "s"} you bought ${n === 1 ? "is" : "are"} ticked off your grocery list.` : "";

export default function CookPage() {
  const [pantry, setPantry] = useState<PantryItem[] | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [weekIds, setWeekIds] = useState<Set<number>>(new Set());
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [newItem, setNewItem] = useState("");
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [saved, setSaved] = useState<Record<number, { id: number; inWeek: boolean }>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/pantry").then((r) => r.json()),
      fetch("/api/recipes").then((r) => r.json()),
      fetch("/api/plan").then((r) => r.json()),
    ]).then(([p, rs, plan]: [{ items: PantryItem[] }, Recipe[], MealPlan]) => {
      setPantry(p.items);
      setRecipes(rs);
      setWeekIds(new Set(plan.entries.flatMap((e) => (e.recipe_id ? [e.recipe_id] : []))));
    });
  }, []);

  function savePantry(next: PantryItem[]) {
    setPantry(next);
    fetch("/api/pantry", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: next }) });
  }

  function mergeItems(add: PantryItem[]) {
    const current = pantry ?? [];
    const keys = new Set(current.map((i) => itemKey(i.name)));
    const fresh = add.filter((i) => {
      const k = itemKey(i.name);
      return !keys.has(k) && (keys.add(k), true);
    });
    savePantry([...current, ...fresh]);
    return fresh.length;
  }

  async function scan(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/")).slice(0, 4);
    if (images.length === 0) return;
    setReading(true);
    setNotice(null);
    try {
      const form = new FormData();
      for (const f of await Promise.all(images.map((f) => shrinkImage(f)))) form.append("images", f);
      const res = await fetch("/api/receipt", { method: "POST", body: form });
      const json = (await res.json()) as { items?: PantryItem[]; store?: string | null; error?: string };
      if (!res.ok || !json.items) throw new Error(json.error || "Couldn't read that receipt.");
      const added = mergeItems(json.items);
      setIdeas(null);
      setNotice({
        text:
          `Read ${json.items.length} item${json.items.length === 1 ? "" : "s"}${json.store ? ` from ${json.store}` : ""}` +
          (added < json.items.length ? ` (${json.items.length - added} already on your list)` : "") +
          ". Remove anything that's wrong.",
      });
    } catch (err) {
      setNotice({ text: (err as Error).message, error: true });
    } finally {
      setReading(false);
    }
  }

  // ⌘V / Ctrl+V a receipt photo anywhere on the page.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      scan(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  async function pasteFromClipboard() {
    try {
      const files: File[] = [];
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) files.push(new File([await item.getType(type)], `receipt-${Date.now()}.png`, { type }));
      }
      if (files.length) scan(files);
      else setNotice({ text: "There's no image on your clipboard. Copy a photo of the receipt first.", error: true });
    } catch {
      setNotice({ text: "Your browser didn't allow pasting. Use Scan a receipt instead.", error: true });
    }
  }

  const onHand = useMemo(() => (pantry ?? []).map((i) => i.name), [pantry]);

  const matches = useMemo(
    () =>
      recipes
        .map((r) => ({ recipe: r, cov: coverage(r.ingredients, onHand) }))
        .filter((m) => m.cov.have.length > 0)
        .sort((a, b) => b.cov.score - a.cov.score || a.cov.need.length - b.cov.need.length),
    [recipes, onHand],
  );

  async function addMatch(r: Recipe, haveKeys: string[]) {
    try {
      await addToWeek(r.id, haveKeys);
      setWeekIds((s) => new Set(s).add(r.id));
      setNotice({ text: `Added ${r.title} to this week.${boughtNote(haveKeys.length)}` });
    } catch (err) {
      setNotice({ text: (err as Error).message, error: true });
    }
  }

  async function getIdeas() {
    setIdeasBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/receipt/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: onHand }),
      });
      const json = (await res.json()) as { ideas?: Idea[]; error?: string };
      if (!res.ok || !json.ideas) throw new Error(json.error || "Couldn't come up with ideas.");
      setIdeas(json.ideas);
      setSaved({});
    } catch (err) {
      setNotice({ text: (err as Error).message, error: true });
    } finally {
      setIdeasBusy(false);
    }
  }

  async function saveIdea(index: number, alsoAddToWeek: boolean) {
    const idea = ideas![index];
    try {
      let id = saved[index]?.id;
      if (!id) {
        const res = await fetch("/api/recipes/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(idea),
        });
        const json = (await res.json()) as { id?: number; error?: string };
        if (!res.ok || !json.id) throw new Error(json.error || "Couldn't save that recipe.");
        id = json.id;
        setRecipes(await fetch("/api/recipes").then((r) => r.json()));
      }
      const haveKeys = coverage(idea.ingredients, onHand).haveKeys;
      if (alsoAddToWeek) {
        await addToWeek(id, haveKeys);
        setWeekIds((s) => new Set(s).add(id!));
      }
      setSaved((s) => ({ ...s, [index]: { id: id!, inWeek: alsoAddToWeek || Boolean(s[index]?.inWeek) } }));
      setNotice({
        text: alsoAddToWeek
          ? `Saved ${idea.title} and added it to this week.${boughtNote(haveKeys.length)}`
          : `Saved ${idea.title} to your recipes.`,
      });
    } catch (err) {
      setNotice({ text: (err as Error).message, error: true });
    }
  }

  if (!pantry) return <p className="muted">Loading…</p>;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Cook from your receipt</h1>
        <p>Snap your grocery receipt to see which of your recipes you can make, and get new ideas that use what you bought.</p>
      </div>

      <section className="panel stack" aria-label="Your groceries">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { scan(Array.from(e.target.files ?? [])); e.target.value = ""; }}
        />
        <div className="week-head">
          <h2>Your groceries</h2>
          {pantry.length > 0 && <span className="muted small">{pantry.length} item{pantry.length === 1 ? "" : "s"}</span>}
        </div>

        {pantry.length === 0 && !reading && (
          <p className="muted">Take a photo of the whole receipt. A long receipt can be up to 4 photos.</p>
        )}

        {pantry.length > 0 && (
          <ul className="pantry-chips" aria-label="Groceries on hand">
            {pantry.map((item) => (
              <li key={item.name}>
                {item.name}
                <button aria-label={`Remove ${item.name}`} onClick={() => savePantry(pantry.filter((i) => i.name !== item.name))}>×</button>
              </li>
            ))}
          </ul>
        )}

        {pantry.length > 0 && (
          <form
            className="add-item"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newItem.trim().toLowerCase();
              if (name) mergeItems([{ name, category: "Other" }]);
              setNewItem("");
            }}
          >
            <label className="sr-only" htmlFor="add-grocery">Add a grocery</label>
            <input id="add-grocery" type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add something else, e.g. eggs" />
            <button className="btn" type="submit" disabled={!newItem.trim()}>Add</button>
          </form>
        )}

        <div className="row">
          <button className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={reading}>
            {reading ? "Reading receipt…" : pantry.length ? "Scan another receipt" : "Scan a receipt"}
          </button>
          <button className="btn" onClick={pasteFromClipboard} disabled={reading}>Paste</button>
          {pantry.length > 0 && (
            <button
              className="btn btn-quiet"
              disabled={reading}
              onClick={() => { if (confirm("Clear your grocery list on this page?")) { savePantry([]); setIdeas(null); } }}
            >
              Clear list
            </button>
          )}
        </div>
        {notice && <p className={`notice${notice.error ? " error" : ""}`} role="status">{notice.text}</p>}
      </section>

      {pantry.length > 0 && (
        <section className="stack" aria-label="From your recipes">
          <h2>From your recipes</h2>
          {matches.length === 0 ? (
            <p className="muted">None of your saved recipes use these groceries yet. Try the new ideas below.</p>
          ) : (
            <ul className="match-list panel">
              {matches.map(({ recipe: r, cov }) => {
                const inWeek = weekIds.has(r.id);
                return (
                  <li key={r.id}>
                    <div className="thumb">
                      {r.images[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/images/${r.images[0]}`} alt="" />
                      )}
                    </div>
                    <div>
                      <Link href={`/recipes/${r.id}`} className="title">{r.title}</Link>
                      <p className="small">
                        <strong>You have {cov.have.length} of {cov.have.length + cov.need.length}</strong>
                        <span className="muted">{cov.need.length ? ` · Need ${cov.need.join(", ")}` : " · Nothing else to buy"}</span>
                      </p>
                    </div>
                    <button className={`btn${inWeek ? "" : " btn-primary"}`} disabled={inWeek} onClick={() => addMatch(r, cov.haveKeys)}>
                      {inWeek ? "In this week" : "Add to this week"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {pantry.length > 1 && (
        <section className="stack" aria-label="New ideas">
          <div className="week-head">
            <h2>New ideas</h2>
            {ideas && (
              <button className="btn btn-quiet" onClick={getIdeas} disabled={ideasBusy}>{ideasBusy ? "Thinking…" : "Suggest different ideas"}</button>
            )}
          </div>
          {!ideas && (
            <div className="panel stack" style={{ gap: 12 }}>
              <p className="muted">Get recipe ideas built mostly from these groceries, plus basics you probably have.</p>
              <div>
                <button className="btn btn-primary" onClick={getIdeas} disabled={ideasBusy}>
                  {ideasBusy ? "Coming up with ideas… (up to a minute)" : "Suggest recipes"}
                </button>
              </div>
            </div>
          )}
          {ideas && (
            <div className="idea-grid">
              {ideas.map((idea, i) => {
                const cov = coverage(idea.ingredients, onHand);
                const haveSet = new Set(cov.have);
                const done = saved[i];
                return (
                  <article key={`${idea.title}-${i}`} className="panel idea">
                    <h3>{idea.title}</h3>
                    <p className="muted small">
                      {[idea.prep_minutes ? `${idea.prep_minutes} min` : null, `serves ${idea.servings}`, `${cov.have.length} of ${cov.have.length + cov.need.length} on hand`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p>{idea.why}</p>
                    <ul className="ing-chips" aria-label="Ingredients">
                      {idea.ingredients.map((ing, j) => (
                        <li key={j} className={haveSet.has(ing.name) ? "have" : ""}>
                          {haveSet.has(ing.name) ? "✓ " : ""}
                          {ing.name}
                        </li>
                      ))}
                    </ul>
                    <details>
                      <summary>Steps</summary>
                      <ol>{idea.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>
                    </details>
                    <div className="row">
                      {done?.inWeek ? (
                        <span className="btn" aria-disabled="true">In this week</span>
                      ) : (
                        <button className="btn btn-primary" onClick={() => saveIdea(i, true)}>Save &amp; add to this week</button>
                      )}
                      {done ? (
                        <Link className="btn btn-quiet" href={`/recipes/${done.id}`}>Open recipe</Link>
                      ) : (
                        <button className="btn" onClick={() => saveIdea(i, false)}>Save</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
