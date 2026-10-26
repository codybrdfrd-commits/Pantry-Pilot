import { query, transaction, type Query } from "./db";
import type { Ingredient, Recipe } from "./types";

interface RecipeRow {
  id: number;
  title: string;
  servings: number;
  prep_minutes: number | null;
  source: string | null;
  tags: string;
  steps: string;
  images: string;
  created_at: Date | string;
}

function hydrate(row: RecipeRow, ingredients: Ingredient[]): Recipe {
  return {
    ...row,
    created_at: new Date(row.created_at).toISOString(),
    tags: JSON.parse(row.tags),
    steps: JSON.parse(row.steps),
    images: JSON.parse(row.images),
    ingredients,
  };
}

const ING_COLS = "id, recipe_id, name, quantity, unit, note, category";

export async function listRecipes(): Promise<Recipe[]> {
  const rows = await query<RecipeRow>("SELECT * FROM recipes ORDER BY created_at DESC, id DESC");
  const ings = await query<Ingredient & { recipe_id: number }>(
    `SELECT ${ING_COLS} FROM ingredients ORDER BY recipe_id, position`,
  );
  const byRecipe = new Map<number, Ingredient[]>();
  for (const { recipe_id, ...ing } of ings) {
    if (!byRecipe.has(recipe_id)) byRecipe.set(recipe_id, []);
    byRecipe.get(recipe_id)!.push(ing);
  }
  return rows.map((r) => hydrate(r, byRecipe.get(r.id) ?? []));
}

export async function getRecipe(id: number): Promise<Recipe | null> {
  if (!Number.isInteger(id)) return null;
  const [row] = await query<RecipeRow>("SELECT * FROM recipes WHERE id = $1", [id]);
  if (!row) return null;
  const ings = await query<Ingredient>(
    "SELECT id, name, quantity, unit, note, category FROM ingredients WHERE recipe_id = $1 ORDER BY position",
    [id],
  );
  return hydrate(row, ings);
}

export interface RecipeInput {
  title: string;
  servings: number;
  prep_minutes: number | null;
  source: string | null;
  tags: string[];
  steps: string[];
  images?: string[];
  ingredients: Ingredient[];
}

async function writeIngredients(q: Query, recipeId: number, ingredients: Ingredient[]) {
  await q("DELETE FROM ingredients WHERE recipe_id = $1", [recipeId]);
  const list = ingredients.filter((i) => i.name?.trim());
  for (let pos = 0; pos < list.length; pos++) {
    const i = list[pos];
    await q(
      "INSERT INTO ingredients (recipe_id, position, name, quantity, unit, note, category) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [recipeId, pos, i.name.trim(), i.quantity ?? null, i.unit || null, i.note || null, i.category || "Other"],
    );
  }
}

export function createRecipe(input: RecipeInput): Promise<number> {
  return transaction(async (q) => {
    const [{ id }] = await q<{ id: number }>(
      `INSERT INTO recipes (title, servings, prep_minutes, source, tags, steps, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        input.title,
        input.servings || 4,
        input.prep_minutes,
        input.source,
        JSON.stringify(input.tags ?? []),
        JSON.stringify(input.steps ?? []),
        JSON.stringify(input.images ?? []),
      ],
    );
    await writeIngredients(q, id, input.ingredients);
    return id;
  });
}

export function updateRecipe(id: number, input: RecipeInput): Promise<void> {
  return transaction(async (q) => {
    await q(
      "UPDATE recipes SET title = $1, servings = $2, prep_minutes = $3, source = $4, tags = $5, steps = $6 WHERE id = $7",
      [
        input.title,
        input.servings || 4,
        input.prep_minutes,
        input.source,
        JSON.stringify(input.tags ?? []),
        JSON.stringify(input.steps ?? []),
        id,
      ],
    );
    await writeIngredients(q, id, input.ingredients ?? []);
  });
}

/** Returns the recipe's image names so the caller can delete the files */
export async function deleteRecipe(id: number): Promise<string[]> {
  const rows = await query<{ images: string }>("DELETE FROM recipes WHERE id = $1 RETURNING images", [id]);
  return rows[0] ? JSON.parse(rows[0].images) : [];
}
