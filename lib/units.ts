/**
 * Ingredient name + unit normalisation so "2 tbsp olive oil" and "1/4 cup Olive Oil"
 * merge into one grocery line.
 */

const VOLUME_TSP: Record<string, number> = {
  tsp: 1, teaspoon: 1, teaspoons: 1, t: 1,
  tbsp: 3, tablespoon: 3, tablespoons: 3, tbs: 3, T: 3,
  cup: 48, cups: 48, c: 48,
  "fl oz": 6, "fluid ounce": 6, "fluid ounces": 6,
  ml: 0.202884, milliliter: 0.202884, milliliters: 0.202884,
  l: 202.884, liter: 202.884, liters: 202.884,
  pint: 96, pints: 96, quart: 192, quarts: 192, gallon: 768,
};

const WEIGHT_G: Record<string, number> = {
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};

const COUNT_ALIASES: Record<string, string> = {
  cloves: "clove", cans: "can", packages: "package", pkg: "package", bunches: "bunch",
  slices: "slice", pinches: "pinch", heads: "head", sprigs: "sprig", stalks: "stalk",
  pieces: "piece", jars: "jar", bags: "bag", boxes: "box", dashes: "dash",
};

export type Dimension = "volume" | "weight" | "count";

export function classifyUnit(raw: string | null): { dim: Dimension; unit: string; factor: number } {
  const u = (raw ?? "").trim();
  if (!u) return { dim: "count", unit: "", factor: 1 };
  if (u in VOLUME_TSP) return { dim: "volume", unit: "tsp", factor: VOLUME_TSP[u] };
  const lower = u.toLowerCase().replace(/\.$/, "");
  if (lower in VOLUME_TSP) return { dim: "volume", unit: "tsp", factor: VOLUME_TSP[lower] };
  if (lower in WEIGHT_G) return { dim: "weight", unit: "g", factor: WEIGHT_G[lower] };
  return { dim: "count", unit: COUNT_ALIASES[lower] ?? lower, factor: 1 };
}

const IRREGULAR: Record<string, string> = {
  tomatoes: "tomato", potatoes: "potato", leaves: "leaf", loaves: "loaf",
  berries: "berry", cherries: "cherry", chilies: "chili", chillies: "chili",
};
const KEEP_PLURAL = new Set(["peas", "oats", "greens", "noodles", "chickpeas", "lentils", "beans", "molasses", "hummus", "couscous", "asparagus", "swiss"]);

/** Stable key for merging: lowercase, no punctuation, last word singularised. */
export function itemKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\b(fresh|large|medium|small|chopped|diced|minced|sliced|optional)\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return name.toLowerCase().trim();
  const last = words[words.length - 1];
  let singular = last;
  if (IRREGULAR[last]) singular = IRREGULAR[last];
  else if (KEEP_PLURAL.has(last)) singular = last;
  else if (/ies$/.test(last)) singular = last.replace(/ies$/, "y");
  else if (/(ches|shes|xes)$/.test(last)) singular = last.replace(/es$/, "");
  else if (/[^s]s$/.test(last)) singular = last.slice(0, -1);
  words[words.length - 1] = singular;
  return words.join(" ");
}

const FRACTIONS: [number, string][] = [
  [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"],
];

export function formatQty(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if (frac < 0.06) return String(whole || (n > 0 ? "<⅛" : "0"));
  if (frac > 0.94) return String(whole + 1);
  const [, glyph] = FRACTIONS.reduce((best, cur) => (Math.abs(cur[0] - frac) < Math.abs(best[0] - frac) ? cur : best));
  return whole ? `${whole} ${glyph}` : glyph;
}

/** Turn a merged base amount back into a kitchen-friendly string. */
export function formatAmount(dim: Dimension, unit: string, base: number): string {
  if (dim === "volume") {
    if (base >= 12) return `${formatQty(base / 48)} cup${base / 48 > 1.06 ? "s" : ""}`;
    if (base >= 3) return `${formatQty(base / 3)} tbsp`;
    return `${formatQty(base)} tsp`;
  }
  if (dim === "weight") {
    if (base >= 453.592) return `${formatQty(base / 453.592)} lb`;
    return `${formatQty(base / 28.3495)} oz`;
  }
  if (!unit) return formatQty(base);
  return `${formatQty(base)} ${unit}${base > 1.06 && !/(s|sh|ch)$/.test(unit) ? (/(x)$/.test(unit) ? "es" : "s") : ""}`;
}
