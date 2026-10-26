"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MealPlan, Recipe } from "@/lib/types";

const DEFAULT_SERVINGS = 4;

type Item = { recipeId: number; servings: number };

export default function PlanPage() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveSeq = useRef(0);

  useEffect(() => {
    Promise.all([fetch("/api/recipes").then((r) => r.json()), fetch("/api/plan").then((r) => r.json())]).then(
      ([rs, plan]: [Recipe[], MealPlan]) => {
        setRecipes(rs);
        // Older day-by-day plans can list a recipe several times; show each recipe once.
        const seen = new Set<number>();
        setItems(
          plan.entries
            .filter((e) => e.recipe_id != null && rs.some((r) => r.id === e.recipe_id))
            .filter((e) => !seen.has(e.recipe_id!) && (seen.add(e.recipe_id!), true))
            .map((e) => ({ recipeId: e.recipe_id!, servings: e.servings })),
        );
      },
    );
  }, []);

  // Save the whole list after every change; only the latest save's result matters.
  function update(next: Item[]) {
    setItems(next);
    const seq = ++saveSeq.current;
    fetch("/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: next }),
    })
      .then((r) => {
        if (seq === saveSeq.current) setSaveError(r.ok ? null : "Couldn't save your changes. Check your connection.");
      })
      .catch(() => seq === saveSeq.current && setSaveError("Couldn't save your changes. Check your connection."));
  }

  const toggle = (id: number) =>
    update(items.some((i) => i.recipeId === id) ? items.filter((i) => i.recipeId !== id) : [...items, { recipeId: id, servings: DEFAULT_SERVINGS }]);
  const setServings = (id: number, servings: number) =>
    update(items.map((i) => (i.recipeId === id ? { ...i, servings: Math.min(Math.max(servings, 1), 30) } : i)));

  async function startOver() {
    if (items.length && !confirm("Start a new week? This clears your picked recipes and grocery ticks.")) return;
    await fetch("/api/plan", { method: "POST" });
    saveSeq.current++;
    setItems([]);
  }

  if (!recipes) return <p className="muted">Loading…</p>;

  if (recipes.length === 0)
    return (
      <div className="page-head">
        <h1>Meal plan</h1>
        <p>Add a few recipes first, then come back and pick what you're making.</p>
        <p><Link className="btn btn-primary" href="/">Add recipes</Link></p>
      </div>
    );

  const byId = new Map(recipes.map((r) => [r.id, r]));
  const picked = new Set(items.map((i) => i.recipeId));

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Meal plan</h1>
        <p>Tap the recipes you're making. Each starts at {DEFAULT_SERVINGS} servings, and you can change that below.</p>
      </div>

      <section className="panel stack week" aria-label="This week">
        <div className="week-head">
          <h2>This week</h2>
          <span className="muted small">{items.length} recipe{items.length === 1 ? "" : "s"}</span>
        </div>

        {items.length === 0 ? (
          <p className="muted">Nothing picked yet. Tap recipes below to add them.</p>
        ) : (
          <ul className="week-list">
            {items.map((item) => {
              const r = byId.get(item.recipeId)!;
              return (
                <li key={item.recipeId}>
                  <div className="thumb">
                    {r.images[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/images/${r.images[0]}`} alt="" />
                    )}
                  </div>
                  <Link href={`/recipes/${r.id}`} className="title">{r.title}</Link>
                  <div className="stepper" role="group" aria-label={`Servings for ${r.title}`}>
                    <button onClick={() => setServings(r.id, item.servings - 1)} disabled={item.servings <= 1} aria-label="Fewer servings">−</button>
                    <span aria-live="polite"><strong>{item.servings}</strong> <span className="muted small">servings</span></span>
                    <button onClick={() => setServings(r.id, item.servings + 1)} aria-label="More servings">+</button>
                  </div>
                  <button className="icon-btn" onClick={() => toggle(r.id)} aria-label={`Remove ${r.title}`}>×</button>
                </li>
              );
            })}
          </ul>
        )}

        {saveError && <p className="notice error" role="alert">{saveError}</p>}

        <div className="row">
          {items.length > 0 ? (
            <Link className="btn btn-primary" href="/grocery">Build grocery list</Link>
          ) : (
            <span className="btn btn-primary" aria-disabled="true" style={{ opacity: 0.55 }}>Build grocery list</span>
          )}
          {items.length > 0 && <button className="btn btn-quiet" onClick={startOver}>Start a new week</button>}
        </div>
      </section>

      <section className="stack" aria-label="Your recipes">
        <h2>Your recipes</h2>
        <div className="library pick-grid">
          {recipes.map((r) => {
            const on = picked.has(r.id);
            return (
              <button key={r.id} className={`recipe-card pick${on ? " on" : ""}`} onClick={() => toggle(r.id)} aria-pressed={on}>
                <div className="photo">
                  {r.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/images/${r.images[0]}`} alt="" loading="lazy" />
                  )}
                  <span className="badge">{on ? "✓ Added" : "+ Add"}</span>
                </div>
                <h3>{r.title}</h3>
                <p className="muted small">
                  {r.prep_minutes ? `${r.prep_minutes} min · ` : ""}
                  {r.ingredients.length} ingredient{r.ingredients.length === 1 ? "" : "s"}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
