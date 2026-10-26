import { query, transaction } from "./db";
import { arrangeMealPlan } from "./claude";
import { listRecipes } from "./recipes";
import { classifyUnit, formatAmount, itemKey, type Dimension } from "./units";
import type { Category, GroceryItem, MealPlan, PlanEntry, ProductMatch } from "./types";

export interface CreatePlanInput {
  startDate: string;
  days: number;
  meals: string[];
  servings: number;
  notes: string;
  /** Limit the plan to these recipes; empty means use the whole library */
  recipeIds: number[];
}

export async function createPlan(input: CreatePlanInput): Promise<number> {
  const all = await listRecipes();
  const pool = input.recipeIds.length ? all.filter((r) => input.recipeIds.includes(r.id)) : all;
  if (pool.length === 0) throw new Error("Add a recipe before making a plan.");

  let slots: { day: number; meal: string; recipe_id: number }[] = [];
  try {
    slots = await arrangeMealPlan({
      days: input.days,
      meals: input.meals,
      notes: input.notes,
      recipes: pool.map((r) => ({
        id: r.id,
        title: r.title,
        tags: r.tags,
        mainIngredients: r.ingredients
          .filter((i) => ["Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery"].includes(i.category))
          .map((i) => i.name)
          .slice(0, 10),
      })),
    });
  } catch (err) {
    console.warn("Claude planning failed, falling back to rotation:", err);
  }

  // Validate Claude's answer and fill any gaps by simple rotation.
  const valid = new Set(pool.map((r) => r.id));
  const grid = new Map<string, number>();
  for (const s of slots) {
    if (valid.has(s.recipe_id) && s.day >= 0 && s.day < input.days && input.meals.includes(s.meal))
      grid.set(`${s.day}|${s.meal}`, s.recipe_id);
  }
  let rot = 0;
  return transaction(async (q) => {
    const [{ id: planId }] = await q<{ id: number }>(
      "INSERT INTO meal_plans (start_date, days, servings) VALUES ($1, $2, $3) RETURNING id",
      [input.startDate, input.days, input.servings],
    );
    for (let day = 0; day < input.days; day++) {
      for (const meal of input.meals) {
        const recipeId = grid.get(`${day}|${meal}`) ?? pool[rot++ % pool.length].id;
        await q(
          "INSERT INTO meal_plan_entries (plan_id, day_index, meal, recipe_id, servings) VALUES ($1, $2, $3, $4, $5)",
          [planId, day, meal, recipeId, input.servings],
        );
      }
    }
    return planId;
  });
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

export async function updateEntry(entryId: number, recipeId: number | null, servings: number) {
  await query("UPDATE meal_plan_entries SET recipe_id = $1, servings = $2 WHERE id = $3", [recipeId, servings, entryId]);
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
