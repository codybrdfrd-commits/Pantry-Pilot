import { itemKey } from "./units";
import type { Ingredient } from "./types";

/**
 * Matching what's on hand (from a receipt) against recipe ingredients. Pure functions, safe in the browser.
 *
 * An item on hand covers a recipe ingredient when their last word (the "head": chicken *breast*, ground
 * *beef*) is the same and every other word of the ingredient also appears in the item, apart from harmless
 * descriptors like "yellow" or "boneless". So "boneless chicken breasts" covers "chicken breast" and "onion"
 * covers "yellow onion", but "onion" doesn't cover "green onion", "cream" doesn't cover "sour cream",
 * and "lime juice" doesn't cover "lime".
 */

/** Things nearly every kitchen has; never counted as missing. */
const STAPLES = new Set(
  [
    "salt", "kosher salt", "sea salt", "table salt", "pepper", "black pepper", "ground black pepper", "water", "ice",
    "oil", "olive oil", "extra virgin olive oil", "vegetable oil", "canola oil", "cooking spray", "nonstick cooking spray",
    "sugar", "granulated sugar", "flour", "all purpose flour", "all-purpose flour", "baking soda", "baking powder",
  ].map(itemKey),
);

const words = (key: string) => key.split(/[\s-]+/).filter(Boolean);

/** Descriptors a recipe may add that don't change what you'd buy. */
const SOFT = new Set([
  "yellow", "white", "whole", "raw", "fresh", "boneless", "skinless", "lean", "extra", "virgin", "plain", "organic",
  "ripe", "unsalted", "salted", "regular", "baby", "hass", "russet", "ground", "large", "medium", "small",
]);

/** Does an item you have (`onHand`) cover a recipe ingredient? */
export function covers(onHand: string, ingredient: string): boolean {
  const kh = itemKey(onHand);
  const ki = itemKey(ingredient);
  if (kh === ki) return true;
  const wh = words(kh);
  const wi = words(ki);
  if (wh.length === 0 || wi.length === 0 || wh[wh.length - 1] !== wi[wi.length - 1]) return false;
  const have = new Set(wh);
  return wi.every((w, i) => have.has(w) || (i < wi.length - 1 && SOFT.has(w)));
}

export const isStaple = (ing: Pick<Ingredient, "name" | "category">) =>
  ing.category === "Spices & Seasonings" || STAPLES.has(itemKey(ing.name));

export interface RecipeCoverage {
  /** Ingredients you have (by recipe ingredient name) */
  have: string[];
  /** Ingredients still needed */
  need: string[];
  /** Grocery-list keys of the ingredients you have, for ticking them off */
  haveKeys: string[];
  /** have / (have + need), ignoring staples */
  score: number;
}

export function coverage(ingredients: Pick<Ingredient, "name" | "category">[], onHand: string[]): RecipeCoverage {
  const have: string[] = [];
  const need: string[] = [];
  const haveKeys: string[] = [];
  for (const ing of ingredients) {
    if (isStaple(ing)) continue;
    if (onHand.some((h) => covers(h, ing.name))) {
      have.push(ing.name);
      haveKeys.push(itemKey(ing.name));
    } else {
      need.push(ing.name);
    }
  }
  const total = have.length + need.length;
  return { have, need, haveKeys, score: total ? have.length / total : 0 };
}
