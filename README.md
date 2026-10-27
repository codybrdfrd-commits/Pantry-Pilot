# Pantry Pilot

Turn screenshots of recipes from social media into a meal plan, a combined grocery list, and a Kroger cart.

**Flow:** upload photos → Claude reads the recipe → plan the week → grocery list merges and scales every ingredient → match items to Kroger products at your store → add them all to your Kroger cart.

## Stack

- **Next.js 16** (App Router): mobile-friendly web UI + API routes in one app
- **Claude API** (vision): reads ingredients/steps from photos and arranges meal plans so recipes share fresh ingredients
- **Postgres**: Neon in production; a built-in embedded Postgres (PGlite) locally, so there is nothing to install
- **Vercel Blob** (private): recipe photos in production; a local folder otherwise
- **Kroger Public API**: Locations, Products, Cart
- **Password sign-in**: one shared `APP_PASSWORD`, checked on every request by `proxy.ts`

## Run it on your computer

```bash
npm install
cp .env.example .env     # fill in ANTHROPIC_API_KEY and KROGER_CLIENT_SECRET
npm run dev              # http://localhost:3001
```

Leave `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` empty: data goes to `./data`. `APP_PASSWORD` is optional locally.

## Deploy to Vercel

1. **Push to GitHub.** Create a new repo and push this folder (`.env` and `data/` are already git-ignored).
2. **Create the project.** In Vercel: *Add New → Project* → import the repo. Framework is detected as Next.js; keep the defaults.
   The project name sets your URL, e.g. `pantry-pilot` → `https://pantry-pilot.vercel.app`.
3. **Add storage.** In the project's *Storage* tab:
   - *Create Database → Neon (Postgres)* → connect to this project. This sets `DATABASE_URL`.
   - *Create → Blob* → choose **Private** access → connect to this project. This sets `BLOB_READ_WRITE_TOKEN`.
4. **Add environment variables** (*Settings → Environment Variables*):

   | Name | Value |
   |---|---|
   | `APP_PASSWORD` | a long password you'll type on your phone |
   | `ANTHROPIC_API_KEY` | your Anthropic key |
   | `KROGER_CLIENT_ID` | `pantry-pilot-bbcj78d9` |
   | `KROGER_CLIENT_SECRET` | from developer.kroger.com |
   | `KROGER_REDIRECT_URI` | `https://<your-project>.vercel.app/api/kroger/callback` |

5. **Register the redirect URI with Kroger.** On developer.kroger.com, add exactly the same `KROGER_REDIRECT_URI` to your app's redirect URIs.
6. **Redeploy** (*Deployments → ⋯ → Redeploy*) so the new variables take effect.
7. Open the site, sign in, add a recipe, then on *Groceries* pick your store and connect your Kroger account.

Tables are created automatically on the first request. There are no migrations to run.

> The app refuses to run in production without `APP_PASSWORD`, so it can't be left open by accident.
> Changing the password signs everyone out.

## How it works

| Piece | Where |
|---|---|
| Photo → recipe (forced tool call for structured JSON) | `lib/claude.ts` → `extractRecipeFromImages` |
| Phone photos shrunk before upload (Vercel caps a request at 4.5 MB) | `lib/resize.ts`, `app/page.tsx` |
| Database: Neon via postgres.js, or PGlite locally | `lib/db.ts` |
| Photos: private Vercel Blob, or `./data/uploads` locally; served via `/api/images/*` behind the password | `lib/storage.ts` |
| Meal plan: Claude assigns recipes to slots, validated, gaps filled by rotation | `lib/plan.ts` → `createPlan` |
| Grocery merge: name normalising, unit conversion (volume/weight/count), servings scaling | `lib/units.ts`, `lib/plan.ts` → `buildGroceryList` |
| Kroger OAuth (client-credentials for search, auth-code + refresh token for cart) | `lib/kroger.ts`, `app/api/kroger/*` |
| Password gate (signed HttpOnly cookie, 30 days) | `proxy.ts`, `lib/auth.ts`, `app/login` |

### API routes

- `POST /api/login` · `DELETE /api/login` — sign in / out
- `POST /api/recipes` — multipart `images` (1–10 screenshots of one recipe) + optional `note`
- `GET|PUT|DELETE /api/recipes/:id`
- `GET|POST|PATCH /api/plan` — latest plan / create / change one slot
- `GET|PATCH /api/grocery` — list for the latest plan / mark item "have at home"
- `GET /api/kroger/login` → Kroger sign-in → callback at `/api/kroger/callback` (also `/callback` and `/api/auth/kroger/callback`)
- `GET /api/kroger/locations?zip=` · `POST /api/kroger/locations` (save store)
- `GET /api/kroger/products?term=` · `POST /api/kroger/products` (remember product for an item)
- `POST /api/kroger/cart` — `{ items: [{ upc, quantity }] }` → `PUT /v1/cart/add`

## Cook from your receipt

The **Cook** tab reads a grocery receipt photo (or the bundled `public/sample-receipt.png` via
*Try a sample receipt*) into plain ingredients, ranks your saved recipes by how much you can already make,
and can suggest new recipes from what you bought. Adding a recipe to this week from there ticks the bought
ingredients off the grocery list. Matching rules live in `lib/pantry.ts` (no AI, runs in the browser).

## Known limits / next steps

- **Kroger's public Cart API only adds items.** It can't read, remove, or check out — finish on kroger.com or the Kroger app.
- **One shared account.** Everyone who knows the password shares one library and one Kroger connection. Separate accounts per person would need real user sign-up (e.g. Auth.js) plus a `user_id` column on each table.
- **Quantities to buy** default to 1 package per item; adjust in the product picker. Converting "1¾ lb chicken" into package counts is a good next step.
- **Video links** are out of scope for v1. A practical v2: fetch the post's caption/transcript and send that text through the same extraction tool.
- Kroger rate-limits Products and Locations per day — product choices are remembered so each ingredient is searched once.
