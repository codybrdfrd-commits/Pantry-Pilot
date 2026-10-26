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
        <p>Add recipe screenshots or paste links. You can add several recipes at once, and screenshots of the same post are kept together as one recipe.</p>
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

      <LinkImport
        onAdded={async (ids, openIt) => {
          if (openIt) return router.push(`/recipes/${ids[0]}?new=1`);
          setRecipes(await fetch("/api/recipes").then((r) => r.json()));
        }}
      />

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

function LinkImport({ onAdded }: { onAdded: (ids: number[], openIt: boolean) => void | Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const urls = text.split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (urls.length === 0) return setError("Paste a link that starts with https://");
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/recipes/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const json = (await res.json()) as { ids?: number[]; failures?: { url: string; reason: string }[]; error?: string };
      if (!res.ok || !json.ids) throw new Error(json.error || "Couldn't read those links.");
      const failures = json.failures ?? [];
      // Keep only the links that failed in the box, so they're easy to retry or screenshot.
      setText(failures.map((f) => f.url).join("\n"));
      setResult(
        `Added ${json.ids.length} recipe${json.ids.length > 1 ? "s" : ""}.` +
          (failures.length ? ` ${failures.length} link${failures.length > 1 ? "s" : ""} couldn't be read: ${failures[0].reason}` : ""),
      );
      // One clean result opens that recipe; otherwise stay here so the summary stays visible.
      await onAdded(json.ids, json.ids.length === 1 && failures.length === 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={submit} style={{ gap: 12 }}>
      <label className="field">
        <span>Or paste recipe links</span>
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://www.tiktok.com/@cook/video/…  — one per line, up to 10"
          style={{ minHeight: 64 }}
        />
      </label>
      <p className="muted small">
        Works best with recipe websites. TikTok, YouTube and Instagram work when the recipe is written in the caption.
      </p>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy || urls.length === 0}>
          {busy
            ? "Reading links… (up to a minute)"
            : urls.length > 1 ? `Read recipes from ${urls.length} links` : "Read recipe from link"}
        </button>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {result && <p className="notice" role="status">{result}</p>}
    </form>
  );
}
