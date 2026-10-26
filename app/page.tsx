"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shrinkImage } from "@/lib/resize";
import type { Recipe } from "@/lib/types";

export default function RecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/recipes").then((r) => r.json()).then(setRecipes);
  }, []);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    setFiles((prev) => [...prev, ...Array.from(list).filter((f) => f.type.startsWith("image/"))].slice(0, 10));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const form = new FormData();
      const shrunk = await Promise.all(files.map((f) => shrinkImage(f)));
      const total = shrunk.reduce((n, f) => n + f.size, 0);
      if (total > 4_200_000)
        throw new Error("These photos are too large to send together. Remove a few, or use screenshots instead of camera photos.");
      for (const f of shrunk) form.append("images", f);
      if (note.trim()) form.append("note", note.trim());
      const res = await fetch("/api/recipes", { method: "POST", body: form });
      const json = (await res.json()) as { ids?: number[]; failed?: number; error?: string };
      if (!res.ok || !json.ids) throw new Error(json.error || "Couldn't read that recipe.");
      if (json.ids.length === 1 && !json.failed) {
        router.push(`/recipes/${json.ids[0]}?new=1`);
        return;
      }
      // Several recipes: stay on the library and show them.
      setRecipes(await fetch("/api/recipes").then((r) => r.json()));
      setFiles([]);
      setNote("");
      setBusy(false);
      setDone(
        `Added ${json.ids.length} recipe${json.ids.length > 1 ? "s" : ""}.` +
          (json.failed ? ` ${json.failed} couldn't be read — try those photos again on their own.` : "") +
          " Open each one to check the ingredients.",
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Recipes</h1>
        <p>Screenshot recipe posts and add them here. You can add several recipes at once, and screenshots of the same post are kept together as one recipe.</p>
      </div>

      <div
        className={`drop${dragging ? " dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      >
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
        {files.length === 0 ? (
          <div className="row" style={{ alignItems: "center" }}>
            <button className="btn btn-primary" onClick={() => input.current?.click()}>Add recipe photos</button>
            <span className="muted small">or drop screenshots here</span>
          </div>
        ) : (
          <>
            <div className="thumbs">
              {previews.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`Screenshot ${i + 1}`} />
              ))}
            </div>
            <label className="field">
              <span>Anything to add? (optional)</span>
              <input
                type="text"
                value={note}
                placeholder="e.g. double the garlic, serves 6"
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="row">
              <button className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy
                  ? files.length > 1 ? "Reading recipes… (up to a minute)" : "Reading recipe…"
                  : `Read recipes from ${files.length} photo${files.length > 1 ? "s" : ""}`}
              </button>
              <button className="btn" onClick={() => input.current?.click()} disabled={busy}>Add more</button>
              <button className="btn btn-quiet" onClick={() => setFiles([])} disabled={busy}>Clear</button>
            </div>
          </>
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
        {done && <p className="notice" role="status">{done}</p>}
      </div>

      {recipes && recipes.length === 0 && (
        <p className="muted">Your library is empty. Add your first recipe above to start planning meals.</p>
      )}
      <div className="library">
        {recipes?.map((r) => (
          <Link key={r.id} href={`/recipes/${r.id}`} className="recipe-card">
            <div className="photo">
              {r.images[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/images/${r.images[0]}`} alt="" loading="lazy" />
              )}
            </div>
            <h3>{r.title}</h3>
            <p className="muted small">
              Serves {r.servings}
              {r.prep_minutes ? `, ${r.prep_minutes} min` : ""} · {r.ingredients.length} ingredients
            </p>
            {r.tags.length > 0 && (
              <div className="tags">{r.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
