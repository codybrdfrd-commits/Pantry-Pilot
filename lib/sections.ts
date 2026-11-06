import type { Recipe } from "./types";

/**
 * Library sections come from tags: a recipe tagged "one pan" sits in One Pan, and so on.
 * Recipes without a section tag sit in "My recipes". Safe to use in the browser.
 */
export const SECTIONS = [
  { tag: "15 minutes or less", label: "15 Minutes or Less" },
  { tag: "30 minute meals", label: "30 Minute Meals" },
  { tag: "one pan", label: "One Pan" },
  { tag: "sheet pan", label: "Sheet Pan" },
] as const;
export const OTHER_SECTION = "My recipes";
export const SECTION_TAGS = new Set<string>(SECTIONS.map((s) => s.tag));

export function sectionOf(r: Pick<Recipe, "tags">): string {
  const tags = r.tags.map((t) => t.toLowerCase());
  return SECTIONS.find((s) => tags.includes(s.tag))?.label ?? OTHER_SECTION;
}

/** Replace a recipe's section tag (or remove it for "My recipes"). */
export function withSection(tags: string[], label: string): string[] {
  const rest = tags.filter((t) => !SECTION_TAGS.has(t.toLowerCase()));
  const section = SECTIONS.find((s) => s.label === label);
  return section ? [section.tag, ...rest] : rest;
}

export const PROTEINS: { label: string; words: string[] }[] = [
  { label: "Chicken", words: ["chicken"] },
  { label: "Beef", words: ["beef", "steak", "sirloin", "short rib", "carne asada", "birria", "bool kogi"] },
  { label: "Turkey", words: ["turkey"] },
  { label: "Pork", words: ["pork", "bacon", "pancetta", "salame", "prosciutto", "chorizo", "pepperoni"] },
  { label: "Seafood", words: ["salmon", "shrimp", "fish", "seafood", "branzino", "tuna", "cod"] },
  { label: "Vegetarian", words: ["vegetarian", "vegan"] },
];

function matchesProtein(r: Recipe, label: string): boolean {
  const p = PROTEINS.find((x) => x.label === label);
  if (!p) return true;
  const hay = `${r.tags.join(" ")} ${r.title}`.toLowerCase();
  // Soy chorizo is vegetarian, not pork.
  if (label === "Pork" && /soy chorizo/.test(hay) && !/bacon|pork|pancetta/.test(hay)) return false;
  return p.words.some((w) => hay.includes(w));
}

export interface RecipeFilter {
  query: string;
  section: string | null;
  protein: string | null;
}

export function filterRecipes(recipes: Recipe[], f: RecipeFilter): Recipe[] {
  const q = f.query.trim().toLowerCase();
  return recipes.filter(
    (r) =>
      (!f.section || sectionOf(r) === f.section) &&
      (!f.protein || matchesProtein(r, f.protein)) &&
      (!q ||
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q))),
  );
}

/** Group recipes by section in book order, "My recipes" first so your own additions are easy to find. */
export function groupBySection(recipes: Recipe[]): { label: string; recipes: Recipe[] }[] {
  const order = [OTHER_SECTION, ...SECTIONS.map((s) => s.label)];
  const groups = new Map<string, Recipe[]>(order.map((l) => [l, []]));
  for (const r of recipes) groups.get(sectionOf(r))!.push(r);
  // Book sections read in the order they were added (book order); your own recipes stay newest first.
  for (const [label, list] of groups) if (label !== OTHER_SECTION) list.sort((a, b) => a.id - b.id);
  return order.map((label) => ({ label, recipes: groups.get(label)! })).filter((g) => g.recipes.length > 0);
}

export function sectionCounts(recipes: Recipe[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of recipes) m.set(sectionOf(r), (m.get(sectionOf(r)) ?? 0) + 1);
  return m;
}
