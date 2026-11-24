"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { shrinkImage } from "@/lib/resize";
import { formatQty } from "@/lib/units";
import { OTHER_SECTION, SECTIONS, sectionOf, withSection } from "@/lib/sections";
import { CATEGORIES, type Category, type Ingredient, type Recipe } from "@/lib/types";

export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isNew = useSearchParams().get("new") === "1";
  const [r, setR] = useState<Recipe | null>(null);
  const [saving, setSaving] = useState(false);
  // New recipes open in edit mode so you can check what was read; saved ones open as a clean recipe card.
  const [editing, setEditing] = useState(isNew);
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
    if (res.ok) { setR(json); setMsg({ text: "Changes saved." }); setEditing(false); }
    else setMsg({ text: json.error, error: true });
  }

  async function remove() {
    if (!confirm(`Delete “${r!.title}”? It will also be removed from meal plans.`)) return;
    await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    router.push("/");
  }

  const source = r.source &&
    (/^https?:\/\//.test(r.source) ? (
      <p className="muted">
        From{" "}
        <a href={r.source} target="_blank" rel="noreferrer">
          {new URL(r.source).hostname.replace(/^www\./, "")}
        </a>
      </p>
    ) : (
      <p className="muted">From {r.source}</p>
    ));

  const photos = (
    <Photos
      recipeId={r.id}
      title={r.title}
      images={r.images}
      onChange={(images) => setR((cur) => (cur ? { ...cur, images } : cur))}
    />
  );

  if (!editing) {
    const meta = [
      `Serves ${r.servings}`,
      r.prep_minutes ? `${r.prep_minutes} min prep` : null,
      sectionOf(r) !== OTHER_SECTION ? sectionOf(r) : null,
    ].filter(Boolean);
    return (
      <div className="stack recipe-view">
        <div className="page-head">
          <h1>{r.title}</h1>
          <p className="recipe-meta">{meta.join(" · ")}</p>
          {source}
        </div>

        {msg && <p className={`notice${msg.error ? " error" : ""}`} role="status">{msg.text}</p>}

        {photos}

        <section className="panel stack">
          <h2>Ingredients</h2>
          <ul className="ing-list">
            {r.ingredients.map((ing, i) => (
              <li key={ing.id ?? i}>
                <span className="ing-amt">
                  {ing.quantity != null ? formatQty(ing.quantity) : ""}
                  {ing.unit ? ` ${plural(ing.unit, ing.quantity)}` : ""}
                </span>
                <span>
                  {ing.name}
                  {ing.note && <span className="muted">, {ing.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {r.steps.length > 0 && (
          <section className="panel stack">
            <h2>Method</h2>
            <ol className="step-list">
              {r.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </section>
        )}

        <div className="row">
          <button className="btn" onClick={() => { setMsg(null); setEditing(true); }}>Edit recipe</button>
        </div>
      </div>
    );
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
        {source}
      </div>

      {msg && <p className={`notice${msg.error ? " error" : ""}`} role="status">{msg.text}</p>}

      {photos}

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
        <label className="field">
          <span>Section</span>
          <select value={sectionOf(r)} onChange={(e) => setR({ ...r, tags: withSection(r.tags, e.target.value) })}>
            {[OTHER_SECTION, ...SECTIONS.map((x) => x.label)].map((l) => <option key={l}>{l}</option>)}
          </select>
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
              inputMode="decimal"
              className="amt"
              placeholder="amt"
              aria-label="Amount"
              value={ing.quantity ?? ""}
              onChange={(e) => setIng(i, { quantity: e.target.value ? Number(e.target.value) : null })}
            />
            <input type="text" className="unit" aria-label="Unit" placeholder="unit" value={ing.unit ?? ""} onChange={(e) => setIng(i, { unit: e.target.value || null })} />
            <input type="text" className="name" aria-label="Ingredient" placeholder="ingredient" value={ing.name} onChange={(e) => setIng(i, { name: e.target.value })} />
            <input type="text" aria-label="Note" className="note" placeholder="note (optional)" value={ing.note ?? ""} onChange={(e) => setIng(i, { note: e.target.value || null })} />
            <select className="aisle" aria-label="Aisle" value={ing.category} onChange={(e) => setIng(i, { category: e.target.value as Category })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button
              className="icon-btn x"
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
        <button className="btn" onClick={() => { setEditing(false); setMsg(null); fetch(`/api/recipes/${id}`).then(async (res) => res.ok && setR(await res.json())); }}>Cancel</button>
        <button className="btn btn-quiet" onClick={remove}>Delete recipe</button>
      </div>
    </div>
  );
}

/** Recipe photos: add from camera or library, make one the cover, or remove. Changes save right away. */
function Photos({
  recipeId,
  title,
  images,
  onChange,
}: {
  recipeId: number;
  title: string;
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(files: File[]) {
    if (files.length === 0) return;
    setBusy(files.length > 1 ? "Adding photos…" : "Adding photo…");
    setError(null);
    try {
      const form = new FormData();
      for (const f of await Promise.all(files.slice(0, 6).map((f) => shrinkImage(f)))) form.append("images", f);
      const res = await fetch(`/api/recipes/${recipeId}/photos`, { method: "POST", body: form });
      const json = (await res.json()) as { images?: string[]; error?: string };
      if (!res.ok || !json.images) throw new Error(json.error || "Couldn't add that photo.");
      onChange(json.images);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function update(next: string[]) {
    setError(null);
    const res = await fetch(`/api/recipes/${recipeId}/photos`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: next }),
    });
    const json = (await res.json()) as { images?: string[]; error?: string };
    if (res.ok && json.images) onChange(json.images);
    else setError(json.error || "Couldn't update the photos.");
  }

  return (
    <section className="photos" aria-label="Photos">
      <div className="photo-strip">
        {images.map((img, i) => (
          <figure key={img} className={i === 0 ? "cover" : ""}>
            <a href={`/api/images/${img}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/images/${img}`} alt={i === 0 ? `${title} (cover photo)` : `${title}, photo ${i + 1}`} />
            </a>
            <figcaption>
              {i === 0 ? (
                <span className="cover-label">Cover</span>
              ) : (
                <button className="link-btn small" onClick={() => update([img, ...images.filter((x) => x !== img)])}>Make cover</button>
              )}
              <button
                className="link-btn small remove"
                onClick={() => { if (confirm("Remove this photo?")) update(images.filter((x) => x !== img)); }}
              >
                Remove
              </button>
            </figcaption>
          </figure>
        ))}
        <label className={`add-photo${busy ? " busy" : ""}`}>
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={!!busy}
            onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; add(f); }}
          />
          <span aria-hidden="true">+</span>
          {busy ?? (images.length ? "Add photo" : "Add a photo")}
        </label>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
    </section>
  );
}

/** "2 clove" → "2 cloves"; abbreviations (oz, lb, tbsp…) stay as they are. */
function plural(unit: string, qty: number | null): string {
  if (qty == null || qty <= 1.06 || /(s|oz|lb|tsp|tbsp|g|kg|ml|l|qt|pt)$/i.test(unit)) return unit;
  return /(ch|sh|x)$/.test(unit) ? `${unit}es` : `${unit}s`;
}
