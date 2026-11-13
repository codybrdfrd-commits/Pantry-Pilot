import { covers, isStaple } from "./pantry";
import { itemKey, type Dimension } from "./units";
import type { Category } from "./types";

/**
 * Trader Joe's shopping helpers: store-order aisles, packages to buy, and price estimates.
 *
 * Prices are estimates (late-2026 Trader Joe's, anchored to published prices such as chicken breast
 * $3.49/lb and 80/20 ground beef $5.49/lb). Trader Joe's has no public price list or API, and prices vary
 * by region. Edit a row to correct it.
 *
 * Row: [package price $, package size, size unit, share of a package used when a recipe gives no amount]
 *   size unit: "oz" (weight), "cup" (volume), "ct" (count, e.g. 3 pouches per box), "pkg" (one package)
 */
type Row = [number, number, "oz" | "cup" | "ct" | "pkg", number];
const PRICES: Record<string, Row> = {
  "aioli garlic mustard sauce": [3.99, 1, "cup", 0.15],
  "alfredo pasta sauce": [3.29, 2, "cup", 0.5],
  "arugula": [2.99, 4, "ct", 0.5],
  "asian style vegetable stir fry": [3.49, 18, "oz", 1],
  "asian style vegetables with stir fry sauce": [2.99, 16, "oz", 1],
  "asparagus risotto": [4.29, 16, "oz", 1],
  "asparagus spear": [3.99, 12, "oz", 1],
  "asparagus spears": [3.99, 12, "oz", 1],
  "avocado": [1.19, 1, "ct", 1],
  "baby broccoli": [3.29, 8, "oz", 1],
  "baby carrots": [1.49, 6, "cup", 0.2],
  "bacon": [6.49, 12, "ct", 0.5],
  "balsamic vinegar": [3.99, 2, "cup", 0.1],
  "bbq teriyaki chicken": [6.99, 21, "oz", 1],
  "beef birria": [9.99, 16, "oz", 1],
  "beef bool kogi": [11.99, 24, "oz", 1],
  "boneless skinless chicken breast": [3.49, 16, "oz", 1],
  "boneless skinless chicken thighs": [4.99, 16, "oz", 1],
  "boneless skinless salmon": [10.99, 16, "oz", 1],
  "boursin garlic & fine herbs cheese": [5.99, 5.2, "oz", 1],
  "braised beef roast": [11.99, 24, "oz", 1],
  "branzino fillet": [11.99, 16, "oz", 1],
  "bread crumbs": [2.49, 2, "cup", 0.5],
  "breaded chicken breast nugget": [5.99, 16, "oz", 1],
  "breaded chicken tenderloin breasts": [6.99, 1, "pkg", 1],
  "brioche bun": [4.49, 4, "ct", 1],
  "broccoli & cauliflower florets": [3.29, 12, "oz", 1],
  "broccoli floret": [2.99, 12, "oz", 1],
  "broccoli florets": [2.99, 4, "cup", 1],
  "bruschetta sauce": [3.49, 1, "pkg", 0.5],
  "buffalo style chicken dip": [4.99, 12, "oz", 1],
  "burrata": [4.99, 8, "oz", 1],
  "calabrese salame, prosciutto & capocollo trio": [5.99, 1, "pkg", 1],
  "caramelized onion dip": [3.99, 12, "oz", 0.33],
  "carne asada": [12.99, 24, "oz", 1],
  "chicken breast": [3.49, 16, "oz", 1],
  "chicken broth": [2.99, 4, "cup", 0.25],
  "chicken fried rice": [3.49, 20, "oz", 1],
  "chicken meatballs": [5.99, 12, "oz", 1],
  "chicken shawarma": [11.99, 24, "oz", 1],
  "chimichurri rice": [3.49, 16, "oz", 1],
  "chimichurri sauce": [3.99, 1, "pkg", 0.5],
  "chunky spicy guacamole": [4.29, 1, "pkg", 0.5],
  "ciabatta demi baguette": [3.49, 1, "pkg", 1],
  "ciabatta demi-baguette": [3.49, 1, "pkg", 1],
  "ciabatta roll": [3.99, 4, "ct", 1],
  "cilantro": [1.99, 1, "pkg", 0.5],
  "coconut aminos": [3.99, 1, "cup", 0.25],
  "coconut cream": [2.29, 1, "ct", 1],
  "coconut milk": [1.99, 13.5, "oz", 1],
  "coconut shrimp": [8.99, 12, "oz", 1],
  "cooked chicken breast": [6.49, 16, "oz", 1],
  "corn & cheese arepas": [4.49, 13.96, "oz", 1],
  "corn & chile salsa": [3.49, 1, "pkg", 0.4],
  "corn tortilla": [2.49, 30, "ct", 0.3],
  "cotija cheese": [3.99, 1, "pkg", 0.4],
  "country potatoes with haricots verts & wild mushrooms": [3.99, 16, "oz", 1],
  "cowboy caviar": [3.49, 13, "oz", 1],
  "creamy dill dressing": [3.49, 0.75, "cup", 0.3],
  "crumbled feta cheese": [3.99, 1.5, "cup", 0.4],
  "crunchy chili onion": [5.49, 0.75, "cup", 0.05],
  "crushed garlic cube": [2.99, 20, "ct", 0.1],
  "cucumber": [0.99, 1, "ct", 1],
  "diced & fire roasted tomatoes with green chiles": [1.79, 14.5, "oz", 1],
  "diced pancetta": [4.49, 4, "oz", 1],
  "edamame": [2.49, 3, "cup", 0.33],
  "egg": [3.99, 12, "ct", 0.17],
  "eggplant garlic spread": [3.49, 1.5, "cup", 0.5],
  "everything but the elote dip": [3.99, 1, "pkg", 0.5],
  "fig butter": [3.99, 1, "pkg", 0.2],
  "fiocchetti with pink sauce": [4.49, 16, "oz", 1],
  "fire roasted red pepper": [2.99, 1, "pkg", 0.5],
  "fire roasted red peppers": [2.99, 12, "oz", 0.5],
  "flour tortilla": [2.99, 8, "ct", 0.75],
  "focaccia bread": [4.99, 14, "oz", 1],
  "french baguette": [2.29, 1, "ct", 1],
  "french onion soup": [4.99, 20, "oz", 1],
  "fresh thyme": [2.49, 1, "pkg", 0.3],
  "frozen crushed garlic cubes": [2.99, 20, "ct", 0.1],
  "frozen petite peas": [1.79, 3, "cup", 0.5],
  "garlic herb chicken sausage": [4.99, 12, "oz", 1],
  "garlic naan": [3.99, 4, "ct", 1],
  "garlic spread dip": [3.99, 1, "pkg", 0.2],
  "general tsao stir fry sauce": [3.29, 1.3, "cup", 0.3],
  "genova pesto": [3.99, 1.4, "cup", 0.2],
  "gnocchi al gorgonzola": [3.99, 16, "oz", 1],
  "goat cheese": [3.49, 1, "pkg", 0.5],
  "gochujang": [3.49, 0.9, "cup", 0.2],
  "grape tomatoes": [2.99, 2, "cup", 0.5],
  "grass fed beef sirloin roast": [11.99, 16, "oz", 1],
  "grated parmesan cheese": [3.99, 1, "pkg", 0.2],
  "greek chickpeas": [2.99, 9.88, "oz", 1],
  "grilled lemon pepper chicken": [6.49, 12, "oz", 1],
  "ground beef": [5.49, 16, "oz", 1],
  "ground beef patty": [6.49, 4, "ct", 1],
  "ground turkey": [5.49, 16, "oz", 1],
  "handsome cut potato fries": [3.49, 32, "oz", 0.5],
  "harissa": [2.99, 0.6, "cup", 0.4],
  "heavy cream": [3.29, 2, "cup", 0.15],
  "heavy whipping cream": [3.29, 2, "cup", 0.15],
  "hoisin sauce": [2.99, 1.25, "cup", 0.15],
  "honey": [5.99, 1.5, "cup", 0.1],
  "hot & sweet jalape\u00f1os": [2.99, 1, "pkg", 0.2],
  "italian bomba hot pepper sauce": [3.99, 0.6, "cup", 0.05],
  "italian bomba sauce": [3.99, 0.6, "cup", 0.1],
  "jalape\u00f1o sauce": [3.49, 1, "pkg", 0.2],
  "just chicken": [6.49, 3, "cup", 0.5],
  "kale": [2.49, 8, "ct", 0.5],
  "kale, cashew & basil pesto": [3.99, 1, "cup", 0.25],
  "kansas city style bbq sauce": [2.99, 2, "cup", 0.1],
  "kimchi": [4.29, 2, "cup", 0.4],
  "korean style beef short ribs": [12.99, 20, "oz", 1],
  "lemon": [0.79, 1, "ct", 1],
  "lemon pepper grilled chicken": [6.49, 12, "oz", 1],
  "les petites carrots of many colors": [2.99, 16, "oz", 1],
  "lightly smoked salmon": [3.99, 5, "oz", 1],
  "lime": [0.49, 1, "ct", 1],
  "little gem lettuce": [3.49, 1, "pkg", 1],
  "mac n cheese": [3.49, 14, "oz", 1],
  "mandarin orange chicken": [5.49, 22, "oz", 1],
  "mango chutney": [3.99, 1.1, "cup", 0.4],
  "mashed potatoes": [3.99, 4, "cup", 1],
  "mexican style cheese blend": [3.99, 3, "cup", 0.4],
  "mirepoix": [2.99, 14.5, "oz", 1],
  "mozzarella cheese": [4.49, 8, "oz", 0.5],
  "mushroom medley": [3.49, 12, "oz", 1],
  "mushroom risotto": [4.29, 16, "oz", 1],
  "olive tapenade": [3.49, 7, "oz", 1],
  "organic brown rice": [3.99, 3, "ct", 1],
  "organic jasmine rice": [3.99, 3, "ct", 1],
  "orzo pasta": [1.99, 2.5, "cup", 0.5],
  "pappardelle pasta": [2.99, 16, "oz", 0.5],
  "parmesan cheese": [4.49, 1, "pkg", 0.25],
  "peanut satay sauce": [3.49, 1.1, "cup", 0.3],
  "pearled couscous": [2.49, 16, "oz", 0.5],
  "penne rigate pasta": [1.49, 16, "oz", 0.5],
  "pepperoni": [3.49, 1, "pkg", 0.5],
  "peri peri sauce": [3.49, 1, "cup", 0.1],
  "persian cucumber": [2.49, 6, "ct", 0.5],
  "pesto chicken breast": [5.49, 16, "oz", 1],
  "petite peas": [1.79, 3, "cup", 0.5],
  "pico de gallo": [3.99, 1, "pkg", 0.5],
  "pico de gallo salsa": [3.99, 1, "pkg", 0.5],
  "pineapple salsa": [3.99, 1, "pkg", 0.4],
  "pineapple tidbits": [2.99, 3, "cup", 0.33],
  "pizza crust": [3.99, 15, "oz", 1],
  "plain greek yogurt": [5.49, 3.5, "cup", 0.3],
  "pollo asado": [11.49, 24, "oz", 1],
  "pork belly": [8.99, 12, "oz", 1],
  "pork gyoza potstickers": [3.99, 21, "ct", 0.5],
  "rainbow carrots": [2.99, 16, "oz", 1],
  "raw argentinian red shrimp": [11.99, 16, "oz", 1],
  "red bell pepper": [1.29, 1, "ct", 1],
  "red onion": [1.29, 1, "ct", 0.5],
  "refried beans": [1.69, 1, "pkg", 1],
  "rigatoni pasta": [1.49, 16, "oz", 0.5],
  "roasted corn": [2.99, 3, "cup", 1],
  "roasted garlic marinara sauce": [3.49, 3, "cup", 0.2],
  "roasted potatoes with peppers & onions": [3.49, 24, "oz", 1],
  "roma tomato": [0.39, 1, "ct", 2],
  "rosatella pasta sauce": [3.29, 14.5, "oz", 1],
  "salmon fillet": [10.99, 16, "oz", 1],
  "seasoned beef kebab": [8.99, 12, "oz", 1],
  "shaved beef steak": [9.49, 16, "oz", 1],
  "shaved parmesan cheese": [4.99, 1, "pkg", 0.3],
  "shelled edamame": [2.49, 3, "cup", 0.33],
  "shredded cabbage & carrots": [1.99, 4, "cup", 0.5],
  "shredded carrots": [1.99, 4, "cup", 0.25],
  "shredded kale": [2.49, 1, "pkg", 0.5],
  "shredded mexican style cheese": [3.99, 3, "cup", 0.4],
  "shredded mozzarella cheese": [3.99, 3, "cup", 0.5],
  "shredded swiss & gruyere cheese": [4.99, 1, "pkg", 0.5],
  "shredded unexpected cheddar cheese": [4.49, 8, "oz", 1],
  "sirloin steak": [10.99, 16, "oz", 1],
  "sliced swiss cheese": [3.99, 10, "ct", 0.4],
  "sour cream": [2.49, 1, "pkg", 0.25],
  "sourdough bread": [4.49, 16, "ct", 0.25],
  "soy chorizo": [2.99, 12, "oz", 1],
  "soy sauce": [2.49, 2, "cup", 0.05],
  "soyaki": [3.99, 2.6, "cup", 0.15],
  "soyaki sauce": [3.99, 2.6, "cup", 0.15],
  "spaghetti": [1.49, 16, "oz", 0.5],
  "spicy honey": [4.99, 1, "pkg", 0.1],
  "spicy italian chicken sausage": [4.99, 5, "ct", 1],
  "spinach": [2.49, 4, "cup", 0.5],
  "spinach artichoke dip": [3.79, 1, "pkg", 1],
  "squiggly noodles": [2.99, 1, "pkg", 1],
  "sriracha": [2.99, 1, "pkg", 0.05],
  "stir fried garlicky cabbage": [3.49, 8.82, "oz", 1],
  "sun dried tomato": [3.49, 1.5, "cup", 0.3],
  "sun dried tomatoes": [3.49, 1.5, "cup", 0.3],
  "sweet apple chicken sausage": [4.99, 5, "ct", 1],
  "sweet chili sauce": [2.99, 1.25, "cup", 0.2],
  "sweet potato frites": [3.49, 15, "oz", 1],
  "sweet potato gnocchi": [3.29, 14.1, "oz", 1],
  "tabbouli": [3.99, 7, "oz", 1],
  "taiwanese green onion pancakes": [3.99, 21, "oz", 1],
  "tarte d'alsace flatbread": [5.49, 8, "oz", 1],
  "thai style red curry sauce": [2.99, 11, "oz", 1],
  "thai style yellow curry sauce": [2.99, 11, "oz", 1],
  "thai wheat noodles": [2.99, 3, "ct", 1],
  "tikka masala curry sauce": [2.99, 8.8, "oz", 1],
  "tomato & roasted red pepper soup": [3.29, 4, "cup", 1],
  "tri color bell peppers": [3.99, 1, "pkg", 1],
  "tri-color bell pepper": [3.99, 1, "pkg", 1],
  "turkey burger": [5.99, 4, "ct", 1],
  "turkey chili": [3.49, 1, "ct", 1],
  "turkey meatballs": [5.49, 16, "oz", 1],
  "tzatziki": [3.99, 12, "oz", 0.33],
  "uncured dry rubbed bacon": [6.49, 12, "ct", 0.33],
  "vegetable fried rice": [2.99, 16, "oz", 1],
  "white onion": [0.99, 1, "ct", 1],
  "zhoug sauce": [3.99, 1, "pkg", 0.3],
};

// Everyday ingredients (used by recipes outside the cookbook).
const EVERYDAY: Record<string, Row> = {
  "yellow onion": [0.99, 1, "ct", 1], "onion": [0.99, 1, "ct", 1], "garlic": [0.69, 10, "ct", 0.3],
  "cream cheese": [2.29, 8, "oz", 1], "ricotta cheese": [3.49, 1.75, "cup", 0.5], "half-and-half": [2.49, 2, "cup", 0.5],
  "shredded cheddar cheese": [3.99, 3, "cup", 0.5], "beef broth": [2.99, 4, "cup", 0.5], "lasagna noodles": [2.99, 16, "ct", 0.5],
  "penne pasta": [1.49, 16, "oz", 0.5], "artichoke hearts": [2.79, 14, "oz", 1], "sliced mushrooms": [2.49, 8, "oz", 1],
  "marsala wine": [6.99, 3, "cup", 0.2], "ketchup": [2.49, 2, "cup", 0.1], "brown sugar": [2.99, 4, "cup", 0.1],
  "rice vinegar": [2.49, 1.5, "cup", 0.1], "mild salsa": [2.99, 2, "cup", 0.5], "salsa": [2.99, 2, "cup", 0.5],
  "lime juice": [2.99, 1.5, "cup", 0.2], "italian dressing": [3.49, 2, "cup", 0.4], "cornstarch": [2.49, 2, "cup", 0.05],
  "italian sausage": [4.99, 16, "oz", 1], "boneless pork shoulder": [4.99, 16, "oz", 1], "orange juice": [3.99, 7, "cup", 0.1],
  "marinara sauce": [3.49, 3, "cup", 1], "diced tomatoes": [1.79, 14.5, "oz", 1], "alfredo sauce": [3.29, 2, "cup", 1],
  "shell pasta": [1.49, 16, "oz", 0.75], "cavatappi pasta": [1.49, 16, "oz", 0.75], "bow tie pasta": [1.49, 16, "oz", 0.75],
  "jasmine rice": [3.99, 4.5, "cup", 0.3], "yukon gold potatoes": [3.99, 48, "oz", 1], "milk": [3.99, 16, "cup", 0.1],
  "broccolini": [2.99, 1, "pkg", 1], "shredded lettuce": [1.99, 4, "cup", 0.5], "garlic bread": [3.49, 1, "pkg", 1],
  "fresh parsley": [1.99, 1, "pkg", 0.3],
  "celery stalks": [2.49, 8, "ct", 0.5], "coleslaw mix": [1.99, 10, "oz", 1], "green onions": [1.29, 6, "ct", 0.5],
  "orange": [0.69, 1, "ct", 1], "beef chuck roast": [7.99, 16, "oz", 1], "hamburger buns": [3.49, 8, "ct", 1],
  "frozen broccoli": [1.99, 12, "oz", 1], "frozen corn": [1.99, 3.5, "cup", 0.5], "apple cider vinegar": [2.49, 2, "cup", 0.1],
  "black beans": [0.99, 15, "oz", 1], "kidney beans": [0.99, 15, "oz", 1], "crushed tomatoes": [2.29, 28, "oz", 1],
  "cream of chicken soup": [1.99, 10.5, "oz", 1], "mayonnaise": [2.99, 2, "cup", 0.1], "pepperoncini peppers": [2.99, 16, "ct", 0.5],
  "salsa verde": [2.99, 16, "oz", 1], "wild rice blend": [3.49, 2.5, "cup", 0.4], "ranch seasoning mix": [1.99, 1, "oz", 1],
  "au jus gravy mix": [1.49, 1, "oz", 1], "white rice": [3.99, 4.5, "cup", 0.3],
};
for (const [k, v] of Object.entries(EVERYDAY)) PRICES[k] ??= v;

const INDEX = new Map(Object.entries(PRICES).map(([name, row]) => [itemKey(name), { name, row }]));

/** Words that make a product something other than the plain ingredient ("onion" vs "crunchy chili onion"). */
const DERIVED = new Set([
  "sauce", "dip", "oil", "spread", "soup", "broth", "stock", "dressing", "juice", "powder", "seasoning", "chili", "crunchy",
  "chips", "chip", "paste", "jam", "butter", "cream", "risotto", "rice", "fried", "salsa", "pesto", "chutney", "caramelized",
  "roasted", "smoked", "dried", "pickled", "flavored", "spicy", "sweet", "garlicky", "with", "&", "sour",
]);

function lookup(name: string) {
  const exact = INDEX.get(itemKey(name));
  if (exact) return exact;
  // Otherwise a priced product that is at least as specific as the ingredient ("boneless skinless chicken thighs"
  // for "chicken thighs"), skipping products that turn it into something else, and preferring the plainest name.
  const asked = new Set(itemKey(name).split(/\s+/));
  let best: { name: string; row: Row } | null = null;
  for (const [key, v] of INDEX) {
    if (!covers(v.name, name)) continue;
    if (key.split(/\s+/).some((w) => DERIVED.has(w) && !asked.has(w))) continue;
    if (!best || key.length < itemKey(best.name).length) best = v;
  }
  return best;
}

export const TJ_AISLES = [
  "Produce", "Bread & Bakery", "Fridge: dips, sauces & fresh", "Cheese", "Meat & Seafood", "Dairy & Eggs",
  "Frozen", "Pantry", "Spices & Seasonings", "Drinks", "Other", "Basics: only if you're out",
] as const;
export type TjAisle = (typeof TJ_AISLES)[number];

const FRIDGE = /\b(dip|tzatziki|guacamole|pico de gallo|hummus|salsa|pesto|chimichurri|zhoug|kimchi|tabbouli|tapenade|dressing|cowboy caviar|soy chorizo|tortilla|gnocchi al|burrata|fresh pasta|fiocchetti)\b/;
const CHEESE = /\b(cheese|burrata|feta|mozzarella|parmesan|cotija|boursin|gruyere|swiss|cheddar)\b/;

/** Where an item sits in a typical Trader Joe's, walking the store in order. */
export function tjAisle(name: string, category: Category): TjAisle {
  const n = name.toLowerCase();
  if (isStaple({ name, category }) || /\b(olive|vegetable|canola|avocado|sesame) oil\b|cooking spray|^butter$/.test(n))
    return "Basics: only if you're out";
  if (/\b(tinned|canned|lightly smoked salmon)\b/.test(n)) return "Pantry";
  if (category === "Frozen") return "Frozen";
  if (CHEESE.test(n)) return "Cheese";
  if (FRIDGE.test(n)) return "Fridge: dips, sauces & fresh";
  switch (category) {
    case "Produce": return "Produce";
    case "Bakery": return "Bread & Bakery";
    case "Meat & Seafood": return "Meat & Seafood";
    case "Dairy & Eggs": return "Dairy & Eggs";
    case "Pantry": return "Pantry";
    case "Spices & Seasonings": return "Spices & Seasonings";
    case "Beverages": return "Drinks";
    default: return "Other";
  }
}

export interface TjEstimate {
  packages: number;
  /** e.g. "16 oz", "pack of 3"; empty when one package is just "1" */
  size: string;
  unitPrice: number;
  total: number;
  /** salt, oil and other basics: usually already at home */
  staple: boolean;
}

const PACKAGE_UNITS = new Set(["package", "bag", "can", "jar", "bunch", "box", "pouch", "tin", "container"]);

/** Packages to buy and estimated cost for one grocery line (amounts already summed across recipes). */
export function tjEstimate(
  name: string,
  category: Category,
  totals: { dim: Dimension; unit: string; base: number }[],
): TjEstimate | null {
  const found = lookup(name);
  const staple = isStaple({ name, category });
  if (!found) return null;
  const [price, size, su, noneShare] = found.row;
  let share = 0;
  let measured = false;
  for (const t of totals) {
    let part: number | null = null;
    if (t.dim === "weight" && su === "oz") part = t.base / 28.3495 / size;
    else if (t.dim === "volume" && su === "cup") part = t.base / 48 / size;
    else if (t.dim === "count" && PACKAGE_UNITS.has(t.unit)) part = su === "ct" ? t.base / size : t.base;
    else if (t.dim === "count" && su === "ct") part = t.base / size;
    else if (t.dim === "count" && (su === "pkg" || su === "oz") && t.base <= 4) part = t.base; // "1" or "2" packages
    if (part != null) { share += part; measured = true; }
  }
  if (!measured) share = noneShare;
  const packages = Math.max(1, Math.ceil(share - 0.08));
  const sizeLabel =
    itemKey(found.name) === "garlic" ? "head" : su === "oz" ? `${+size.toFixed(2)} oz` : su === "ct" && size > 1 ? `pack of ${size}` : "";
  return { packages, size: sizeLabel, unitPrice: price, total: Math.round(packages * price * 100) / 100, staple };
}
