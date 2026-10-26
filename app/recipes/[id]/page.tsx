"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, type Category, type Ingredient, type Recipe } from "@/lib/types";

export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isNew = useSearchParams().get("new") === "1";
  const [r, setR] = useState<Recipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(
    isNew ? { text: "Recipe added. Check the ingredients — amounts read from photos can be off." } : null,
  );

  useEffect(() => {
    fetch(`/api/recipes/${id}`).then(async (res) => (res.ok ? setR(await res.json()) : router.replace("/")));
  }, [id, router]);

  if (!r) return <p className="muted">Loading…</p>;

  const setIng = (i: number, patch: Partial<Ingredient>) =>
    setR({ ...r, ingredients: r.ingredients.map((ing, j) => (j === i ? { ...ing, ...patch } : ing)) });

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/recipes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...r, steps: r!.steps.map((s) => s.trim()).filter(Boolean) }),
    });
    const json = await res.json();
    setSaving(false);
    if (res.ok) { setR(json); setMsg({ text: "Changes saved." }); }
    else setMsg({ text: json.error, error: true });
  }

  async function remove() {
    if (!confirm(`Delete “${r!.title}”? It will also be removed from meal plans.`)) return;
    await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    router.push("/");
  }

  return (
    <div className="stack">
      <div className="page-head">
        <input
          type="text"
          aria-label="Recipe title"
          value={r.title}
          onChange={(e) => setR({ ...r, title: e.target.value })}
          style={{ font: "700 clamp(1.6rem,5vw,2.4rem)/1.1 var(--display)", border: "none", padding: 0, background: "transparent" }}
        />
        {r.source && <p className="muted">From {r.source}</p>}
      </div>

      {msg && <p className={`notice${msg.error ? " error" : ""}`} role="status">{msg.text}</p>}

      {r.images.length > 0 && (
        <div className="thumbs">
          {r.images.map((img) => (
            <a key={img} href={`/api/images/${img}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/images/${img}`} alt="Original screenshot" />
            </a>
          ))}
        </div>
      )}

      <div className="row">
        <label className="field">
          <span>Serves</span>
          <input type="number" min={1} value={r.servings} onChange={(e) => setR({ ...r, servings: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Minutes</span>
          <input
            type="number"
            min={0}
            value={r.prep_minutes ?? ""}
            onChange={(e) => setR({ ...r, prep_minutes: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label className="field" style={{ flexBasis: 260 }}>
          <span>Tags</span>
          <input
            type="text"
            value={r.tags.join(", ")}
            onChange={(e) => setR({ ...r, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
          />
        </label>
      </div>

      <section className="panel stack">
        <h2>Ingredients</h2>
        {r.ingredients.map((ing, i) => (
          <div className="ing-row" key={ing.id ?? `new-${i}`}>
            <input
              type="number"
              step="any"
              aria-label="Amount"
              value={ing.quantity ?? ""}
              onChange={(e) => setIng(i, { quantity: e.target.value ? Number(e.target.value) : null })}
            />
            <input type="text" aria-label="Unit" placeholder="unit" value={ing.unit ?? ""} onChange={(e) => setIng(i, { unit: e.target.value || null })} />
            <input type="text" aria-label="Ingredient" value={ing.name} onChange={(e) => setIng(i, { name: e.target.value })} />
            <input type="text" aria-label="Note" className="note" placeholder="note" value={ing.note ?? ""} onChange={(e) => setIng(i, { note: e.target.value || null })} />
            <select aria-label="Aisle" value={ing.category} onChange={(e) => setIng(i, { category: e.target.value as Category })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button
              className="icon-btn"
              aria-label={`Remove ${ing.name}`}
              onClick={() => setR({ ...r, ingredients: r.ingredients.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </div>
        ))}
        <div>
          <button
            className="btn"
            onClick={() =>
              setR({ ...r, ingredients: [...r.ingredients, { name: "", quantity: null, unit: null, note: null, category: "Other" }] })
            }
          >
            Add ingredient
          </button>
        </div>
      </section>

      <section className="panel stack">
        <h2>Method</h2>
        <label className="field">
          <span className="muted small">One step per line</span>
          <textarea
            rows={Math.max(5, r.steps.length + 1)}
            value={r.steps.join("\n")}
            onChange={(e) => setR({ ...r, steps: e.target.value.split("\n") })}
          />
        </label>
      </section>

      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        <button className="btn btn-quiet" onClick={remove}>Delete recipe</button>
      </div>
    </div>
  );
}
