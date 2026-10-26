import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, type Ingredient } from "./types";
import type { RecipeInput } from "./recipes";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
  client ??= new Anthropic();
  return client;
}

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/**
 * Ask Claude for JSON that matches `schema` using structured outputs
 * (output_config.format). The reply is a single text block of valid JSON.
 */
async function callJson<T>(opts: {
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    system: opts.system,
    output_config: { format: { type: "json_schema", schema: opts.schema } },
    messages: [{ role: "user", content: opts.content }],
  });
  if (msg.stop_reason === "refusal") throw new Error("Claude declined to read that image.");
  if (msg.stop_reason === "max_tokens") throw new Error("That recipe was too long to read in one go. Try fewer photos.");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Claude's reply wasn't valid JSON. Try again.");
  }
}

const nullable = (type: string) => ({ type: [type, "null"] });

const RECIPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    found: { type: "boolean", description: "False if the images do not contain a recipe." },
    title: { type: "string" },
    servings: { type: "integer", description: "Servings the amounts are written for. Estimate if not stated." },
    prep_minutes: { ...nullable("integer"), description: "Total time in minutes, if stated or clearly implied." },
    source: { ...nullable("string"), description: "Creator handle or site visible in the image, e.g. @someone." },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "2-5 short lowercase tags: meal type, cuisine, protein, diet (e.g. dinner, mexican, chicken, vegetarian).",
    },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Generic grocery name, singular, no brand, e.g. 'yellow onion'." },
          quantity: { ...nullable("number"), description: "Decimal number. 1/2 -> 0.5. Null if 'to taste'." },
          unit: {
            ...nullable("string"),
            description:
              "One of: tsp, tbsp, cup, fl oz, ml, l, oz, lb, g, kg, clove, can, package, bunch, pinch, slice — or null for countable items.",
          },
          note: { ...nullable("string"), description: "Prep notes like 'diced' or 'divided'." },
          category: { type: "string", enum: CATEGORIES },
        },
        required: ["name", "quantity", "unit", "note", "category"],
      },
    },
    steps: { type: "array", items: { type: "string" }, description: "Method steps, concise." },
  },
  required: ["found", "title", "servings", "prep_minutes", "source", "tags", "ingredients", "steps"],
};

export async function extractRecipeFromImages(
  images: { data: Buffer; mediaType: ImageMedia }[],
  hint?: string,
): Promise<RecipeInput & { found: boolean }> {
  const content: Anthropic.ContentBlockParam[] = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.data.toString("base64") },
  }));
  content.push({
    type: "text",
    text:
      `These ${images.length > 1 ? `${images.length} images are screenshots of one recipe post` : "image is a recipe post"} from social media. ` +
      "Extract the recipe. Read ingredient lists from on-screen text overlays, captions and cards. " +
      "If amounts are missing, infer sensible ones for the stated servings and keep them realistic. " +
      "If there is no recipe, set found to false and leave the lists empty." +
      (hint ? `\nUser note: ${hint}` : ""),
  });

  const out = await callJson<RecipeInput & { found: boolean }>({
    system:
      "You turn photos and screenshots of recipes into clean structured data for a grocery list. " +
      "Normalise ingredient names so the same item is always named the same way across recipes.",
    content,
    schema: RECIPE_SCHEMA,
  });
  out.ingredients = (out.ingredients ?? []).map((i: Ingredient) => ({
    ...i,
    category: (CATEGORIES as readonly string[]).includes(i.category) ? i.category : "Other",
  }));
  return out;
}

export interface PlanRequest {
  days: number;
  meals: string[];
  notes: string;
  recipes: { id: number; title: string; tags: string[]; mainIngredients: string[] }[];
}

export async function arrangeMealPlan(req: PlanRequest): Promise<{ day: number; meal: string; recipe_id: number }[]> {
  const out = await callJson<{ slots: { day: number; meal: string; recipe_id: number }[] }>({
    system:
      "You plan home meals. Fill every slot using only the recipe ids provided. " +
      "Prefer recipes that share fresh ingredients so less food is wasted, avoid repeating a recipe on back-to-back days, " +
      "and match recipes to the meal (breakfast recipes for breakfast). Repeat recipes only when there are fewer recipes than slots.",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          days: req.days,
          day_index_range: `0 to ${req.days - 1}`,
          meals_per_day: req.meals,
          preferences: req.notes || null,
          recipes: req.recipes,
        }),
      },
    ],
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        slots: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              day: { type: "integer", description: "0-based day index" },
              meal: { type: "string", enum: req.meals },
              recipe_id: { type: "integer", enum: req.recipes.map((r) => r.id) },
            },
            required: ["day", "meal", "recipe_id"],
          },
        },
      },
      required: ["slots"],
    },
  });
  return out.slots;
}
