"use client";

import { useMemo, useState, type ReactNode } from "react";
import { filterRecipes, groupBySection, OTHER_SECTION, PROTEINS, SECTIONS, sectionCounts } from "@/lib/sections";
import type { Recipe } from "@/lib/types";

/**
 * Search box + section and protein chips over a recipe list, rendered as sections.
 * `renderCard` draws one recipe; the grid layout comes from `gridClass`.
 */
export default function RecipeBrowser({
  recipes,
  renderCard,
  gridClass = "library",
}: {
  recipes: Recipe[];
  renderCard: (r: Recipe) => ReactNode;
  gridClass?: string;
}) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string | null>(null);
  const [protein, setProtein] = useState<string | null>(null);

  const counts = useMemo(() => sectionCounts(recipes), [recipes]);
  const shown = useMemo(() => filterRecipes(recipes, { query, section, protein }), [recipes, query, section, protein]);
  const groups = useMemo(() => groupBySection(shown), [shown]);
  const sectionChips = [OTHER_SECTION, ...SECTIONS.map((s) => s.label)].filter((l) => counts.get(l));
  const filtering = Boolean(query.trim() || section || protein);

  return (
    <div className="stack browser">
      <div className="browser-controls">
        <label className="sr-only" htmlFor="recipe-search">Search recipes</label>
        <input
          id="recipe-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes or ingredients"
        />
        <div className="filter-row" role="group" aria-label="Section">
          <button className={`fchip${!section ? " on" : ""}`} aria-pressed={!section} onClick={() => setSection(null)}>
            All <span>{recipes.length}</span>
          </button>
          {sectionChips.map((l) => (
            <button key={l} className={`fchip${section === l ? " on" : ""}`} aria-pressed={section === l} onClick={() => setSection(section === l ? null : l)}>
              {l} <span>{counts.get(l)}</span>
            </button>
          ))}
        </div>
        <div className="filter-row" role="group" aria-label="Protein">
          {PROTEINS.map((p) => (
            <button
              key={p.label}
              className={`fchip small${protein === p.label ? " on" : ""}`}
              aria-pressed={protein === p.label}
              onClick={() => setProtein(protein === p.label ? null : p.label)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {filtering && (
        <p className="muted small" role="status">
          {shown.length} recipe{shown.length === 1 ? "" : "s"}
          {shown.length === 0 ? "." : ""}{" "}
          <button className="link-btn" onClick={() => { setQuery(""); setSection(null); setProtein(null); }}>Clear filters</button>
        </p>
      )}

      {groups.map((g) => (
        <section key={g.label} className="stack section-group" aria-label={g.label}>
          <div className="week-head">
            <h2>{g.label}</h2>
            <span className="muted small">{g.recipes.length}</span>
          </div>
          <div className={gridClass}>{g.recipes.map(renderCard)}</div>
        </section>
      ))}
    </div>
  );
}
