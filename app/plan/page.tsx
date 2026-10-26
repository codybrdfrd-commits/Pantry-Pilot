"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MealPlan, Recipe } from "@/lib/types";

const MEALS = ["Breakfast", "Lunch", "Dinner"];

function dayName(start: string, offset: number) {
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

export default function PlanPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [days, setDays] = useState(7);
  const [servings, setServings] = useState(2);
  const [meals, setMeals] = useState<string[]>(["Dinner"]);
  const [notes, setNotes] = useState("");
  const [only, setOnly] = useState<number[]>([]);

  useEffect(() => {
    Promise.all([fetch("/api/recipes").then((r) => r.json()), fetch("/api/plan").then((r) => r.json())]).then(
      ([rs, p]) => {
        setRecipes(rs);
        setPlan(p);
        setShowForm(!p);
        setLoaded(true);
      },
    );
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, days, servings, meals, notes, recipeIds: only }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    setPlan(json);
    setShowForm(false);
  }

  async function updateSlot(entryId: number, recipeId: number | null, slotServings: number) {
    setPlan((p) =>
      p && {
        ...p,
        entries: p.entries.map((e) =>
          e.id === entryId
            ? { ...e, recipe_id: recipeId, servings: slotServings, recipe_title: recipes.find((r) => r.id === recipeId)?.title ?? null }
            : e,
        ),
      },
    );
    await fetch("/api/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, recipeId, servings: slotServings }),
    });
  }

  if (!loaded) return <p className="muted">Loading…</p>;

  if (recipes.length === 0)
    return (
      <div className="page-head">
        <h1>Meal plan</h1>
        <p>Add a few recipes first, then come back to plan the week.</p>
        <p><Link className="btn btn-primary" href="/">Add recipes</Link></p>
      </div>
    );

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Meal plan</h1>
        <p>Plans favor recipes that share fresh ingredients, so less food goes to waste. Swap any meal or change how many it serves.</p>
      </div>

      {showForm ? (
        <section className="panel stack">
          <h2>{plan ? "Make a new plan" : "Plan your meals"}</h2>
          <div className="row">
            <label className="field"><span>Starting</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="field"><span>Days</span>
              <input type="number" min={1} max={14} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </label>
            <label className="field"><span>People</span>
              <input type="number" min={1} max={20} value={servings} onChange={(e) => setServings(Number(e.target.value))} />
            </label>
          </div>
          <fieldset className="field" style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 6 }}>Meals to plan</legend>
            <div className="checks">
              {MEALS.map((m) => (
                <label key={m} className="chip">
                  <input
                    type="checkbox"
                    checked={meals.includes(m)}
                    onChange={(e) => setMeals(e.target.checked ? MEALS.filter((x) => x === m || meals.includes(x)) : meals.filter((x) => x !== m))}
                  />
                  {m}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field"><span>Preferences (optional)</span>
            <input type="text" value={notes} placeholder="e.g. meatless Monday, quick meals on weeknights" onChange={(e) => setNotes(e.target.value)} />
          </label>
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>
              Choose recipes {only.length ? `(${only.length} picked)` : "(all by default)"}
            </summary>
            <div className="checks" style={{ marginTop: 10 }}>
              {recipes.map((r) => (
                <label key={r.id} className="chip">
                  <input
                    type="checkbox"
                    checked={only.includes(r.id)}
                    onChange={(e) => setOnly(e.target.checked ? [...only, r.id] : only.filter((x) => x !== r.id))}
                  />
                  {r.title}
                </label>
              ))}
            </div>
          </details>
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="row">
            <button className="btn btn-primary" onClick={generate} disabled={busy || meals.length === 0}>
              {busy ? "Planning…" : "Make plan"}
            </button>
            {plan && <button className="btn btn-quiet" onClick={() => setShowForm(false)}>Cancel</button>}
          </div>
        </section>
      ) : (
        <div className="row">
          <Link className="btn btn-primary" href="/grocery">Build grocery list</Link>
          <button className="btn" onClick={() => setShowForm(true)}>Make a new plan</button>
        </div>
      )}

      {plan && (
        <div className="week">
          {Array.from({ length: plan.days }, (_, day) => {
            const { weekday, date } = dayName(plan.start_date, day);
            return (
              <div className="day" key={day}>
                <div className="day-label">{weekday}<small>{date}</small></div>
                <div>
                  {plan.entries.filter((e) => e.day_index === day).map((e) => (
                    <div className="slot" key={e.id}>
                      <span className="meal">{e.meal}</span>
                      <select
                        aria-label={`${weekday} ${e.meal}`}
                        value={e.recipe_id ?? ""}
                        onChange={(ev) => updateSlot(e.id, ev.target.value ? Number(ev.target.value) : null, e.servings)}
                      >
                        <option value="">Nothing planned</option>
                        {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                      </select>
                      <input
                        type="number"
                        min={1}
                        aria-label={`Servings for ${weekday} ${e.meal}`}
                        title="Servings"
                        value={e.servings}
                        onChange={(ev) => updateSlot(e.id, e.recipe_id, Math.max(1, Number(ev.target.value)))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
