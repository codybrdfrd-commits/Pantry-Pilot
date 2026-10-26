import { query, transaction } from "./db";
import { listRecipes } from "./recipes";
import { classifyUnit, formatAmount, itemKey, type Dimension } from "./units";
import type { Category, GroceryItem, MealPlan, PlanEntry, ProductMatch } from "./types";

export const DEFAULT_SERVINGS = 4;

/**
 * A plan is simply "the recipes I'm making this week", each with its own servings.
 * Entries keep day_index as their order in the list; meal is always "Meal".
 */
async function createEmptyPlan(): Promise<number> {
  const [{ id }] = await query<{ id: number }>(
    "INSERT INTO meal_plans (start_date, days, servings) VALUES ($1, 0, $2) RETURNING id",
    [new Date().toISOString().slice(0, 10), DEFAULT_SERVINGS],
  );
  return id;
}

/** The current plan, created on first use. */
export async function currentPlan(): Promise<MealPlan> {
  const plan = await getPlan();
  if (plan) return plan;
  return (await getPlan(await createEmptyPlan()))!;
}

/** Replace the plan's recipes. Keeps the plan id, so "already have it" ticks survive edits. */
export async function setPlanItems(planId: number, items: { recipeId: number; servings: number }[]) {
  await transaction(async (q) => {
    await q("DELETE FROM meal_plan_entries WHERE plan_id = $1", [planId]);
    for (let i = 0; i < items.length; i++) {
      await q(
        "INSERT INTO meal_plan_entries (plan_id, day_index, meal, recipe_id, servings) VALUES ($1, $2, 'Meal', $3, $4)",
        [planId, i, items[i].recipeId, items[i].servings],
      );
    }
    await q("UPDATE meal_plans SET days = $1 WHERE id = $2", [items.length, planId]);
  });
}

/** Start a fresh week: new empty plan, so ticks and choices start clean. */
export async function startNewPlan(): Promise<MealPlan> {
  return (await getPlan(await createEmptyPlan()))!;
}

export async function getPlan(id?: number): Promise<MealPlan | null> {
  const [plan] = id
    ? await query<Omit<MealPlan, "entries">>("SELECT id, start_date, days, servings FROM meal_plans WHERE id = $1", [id])
    : await query<Omit<MealPlan, "entries">>("SELECT id, start_date, days, servings FROM meal_plans ORDER BY id DESC LIMIT 1");
  if (!plan) return null;
  const entries = await query<PlanEntry>(
    `SELECT e.id, e.day_index, e.meal, e.recipe_id, e.servings, r.title AS recipe_title
     FROM meal_plan_entries e LEFT JOIN recipes r ON r.id = e.recipe_id
     WHERE e.plan_id = $1 ORDER BY e.day_index, e.id`,
    [plan.id],
  );
  return { ...plan, entries };
}

const CATEGORY_ORDER: Category[] = [
  "Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Frozen", "Pantry", "Spices & Seasonings", "Beverages", "Other",
];

/** Merge every ingredient in the plan, scaled to each slot's servings. */
export async function buildGroceryList(planId: number): Promise<GroceryItem[]> {
  const plan = await getPlan(planId);
  if (!plan) return [];
  const recipes = new Map((await listRecipes()).map((r) => [r.id, r]));

  type Acc = {
    name: string;
    category: Category;
    totals: Map<string, { dim: Dimension; unit: string; base: number }>;
    recipes: Set<string>;
    toTaste: boolean;
  };
  const items = new Map<string, Acc>();

  for (const entry of plan.entries) {
    const recipe = entry.recipe_id ? recipes.get(entry.recipe_id) : undefined;
    if (!recipe) continue;
    const scale = entry.servings / (recipe.servings || 1);
    for (const ing of recipe.ingredients) {
      const key = itemKey(ing.name);
      let acc = items.get(key);
      if (!acc) {
        acc = { name: ing.name, category: ing.category, totals: new Map(), recipes: new Set(), toTaste: false };
        items.set(key, acc);
      }
      acc.recipes.add(recipe.title);
      if (ing.quantity == null) {
        acc.toTaste = true;
        continue;
      }
      const { dim, unit, factor } = classifyUnit(ing.unit);
      const bucket = `${dim}|${unit}`;
      const t = acc.totals.get(bucket) ?? { dim, unit, base: 0 };
      t.base += ing.quantity * factor * scale;
      acc.totals.set(bucket, t);
    }
  }

  const checks = await query<{ item_key: string }>("SELECT item_key FROM grocery_checks WHERE plan_id = $1", [planId]);
  const matchRows = await query<ProductMatch & { item_key: string }>("SELECT * FROM product_matches");
  const have = new Set(checks.map((r) => r.item_key));
  const matches = new Map(matchRows.map((m) => [m.item_key, m]));

  const list: GroceryItem[] = [...items.entries()].map(([key, acc]) => {
    const amounts = [...acc.totals.values()].map((t) => formatAmount(t.dim, t.unit, t.base));
    if (amounts.length === 0 && acc.toTaste) amounts.push("to taste");
    const m = matches.get(key);
    return {
      key,
      name: acc.name,
      category: acc.category,
      amounts,
      recipes: [...acc.recipes],
      have: have.has(key),
      match: m
        ? { upc: m.upc, description: m.description, size: m.size, price: m.price, image: m.image, quantity: m.quantity }
        : null,
    };
  });

  return list.sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name),
  );
}

export async function setHave(planId: number, key: string, have: boolean) {
  if (have)
    await query("INSERT INTO grocery_checks (plan_id, item_key) VALUES ($1, $2) ON CONFLICT DO NOTHING", [planId, key]);
  else await query("DELETE FROM grocery_checks WHERE plan_id = $1 AND item_key = $2", [planId, key]);
}
