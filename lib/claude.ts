import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, type Ingredient } from "./types";
import type { RecipeInput } from "./recipes";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in .env");
  client ??= new Anthropic();
  return client;
}

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** Ask Claude for structured output by forcing a single tool call and returning its input. */
async function callTool<T>(opts: {
  system: string;
  content: Anthropic.ContentBlockParam[];
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  maxTokens?: number;
}): Promise<T> {
  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    tools: [opts.tool as Anthropic.Tool],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.content }],
  });
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Claude did not return structured output");
  return block.input as T;
}

const recipeTool = {
  name: "save_recipe",
  description: "Save the recipe shown in the images.",
  input_schema: {
    type: "object",
    properties: {
      found: { type: "boolean", description: "False if the images do not contain a recipe." },
      title: { type: "string" },
      servings: { type: "integer", description: "Servings the amounts are written for. Estimate if not stated." },
      prep_minutes: { type: ["integer", "null"], description: "Total time in minutes, if stated or clearly implied." },
      source: { type: ["string", "null"], description: "Creator handle or site visible in the image, e.g. @someone." },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "2-5 short lowercase tags: meal type, cuisine, protein, diet (e.g. dinner, mexican, chicken, vegetarian).",
      },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Generic grocery name, singular, no brand, e.g. 'yellow onion'." },
            quantity: { type: ["number", "null"], description: "Decimal number. 1/2 -> 0.5. Null if 'to taste'." },
            unit: {
              type: ["string", "null"],
              description: "One of: tsp, tbsp, cup, fl oz, ml, l, oz, lb, g, kg, clove, can, package, bunch, pinch, slice — or null for countable items.",
            },
            note: { type: ["string", "null"], description: "Prep notes like 'diced' or 'divided'." },
            category: { type: "string", enum: CATEGORIES },
          },
          required: ["name", "quantity", "unit", "note", "category"],
        },
      },
      steps: { type: "array", items: { type: "string" }, description: "Method steps, concise." },
    },
    required: ["found", "title", "servings", "prep_minutes", "source", "tags", "ingredients", "steps"],
  },
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
      "If amounts are missing, infer sensible ones for the stated servings and keep them realistic." +
      (hint ? `\nUser note: ${hint}` : ""),
  });

  const out = await callTool<RecipeInput & { found: boolean }>({
    system:
      "You turn photos and screenshots of recipes into clean structured data for a grocery list. " +
      "Normalise ingredient names so the same item is always named the same way across recipes.",
    content,
    tool: recipeTool,
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
  const out = await callTool<{ slots: { day: number; meal: string; recipe_id: number }[] }>({
    system:
      "You plan home meals. Fill every slot using only the recipe ids provided. " +
      "Prefer recipes that share fresh ingredients so less food is wasted, avoid repeating a recipe on back-to-back days, " +
      "and match recipes to the meal (breakfast recipes for breakfast). Repeat recipes only when there are fewer recipes than slots.",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          days: req.days,
          meals_per_day: req.meals,
          preferences: req.notes || null,
          recipes: req.recipes,
        }),
      },
    ],
    tool: {
      name: "save_plan",
      description: "Save the meal plan.",
      input_schema: {
        type: "object",
        properties: {
          slots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "integer", description: "0-based day index" },
                meal: { type: "string", enum: req.meals },
                recipe_id: { type: "integer" },
              },
              required: ["day", "meal", "recipe_id"],
            },
          },
        },
        required: ["slots"],
      },
    },
  });
  return out.slots;
}
