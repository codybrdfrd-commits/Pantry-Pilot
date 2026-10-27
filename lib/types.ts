export const CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Pantry",
  "Spices & Seasonings",
  "Frozen",
  "Beverages",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Ingredient {
  id?: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  category: Category;
}

/** Something you have on hand, read from a receipt or typed in. */
export interface PantryItem {
  name: string;
  category: Category;
}

export interface Recipe {
  id: number;
  title: string;
  servings: number;
  prep_minutes: number | null;
  source: string | null;
  tags: string[];
  steps: string[];
  images: string[];
  ingredients: Ingredient[];
  created_at: string;
}

export interface PlanEntry {
  id: number;
  day_index: number;
  meal: string;
  recipe_id: number | null;
  recipe_title: string | null;
  servings: number;
}

export interface MealPlan {
  id: number;
  start_date: string;
  days: number;
  servings: number;
  entries: PlanEntry[];
}

export interface GroceryItem {
  key: string;
  name: string;
  category: Category;
  /** Human-readable amounts, e.g. ["2 cups", "3"] when units can't be combined */
  amounts: string[];
  recipes: string[];
  have: boolean;
  match: ProductMatch | null;
}

export interface ProductMatch {
  upc: string;
  description: string;
  size: string | null;
  price: number | null;
  image: string | null;
  quantity: number;
}
