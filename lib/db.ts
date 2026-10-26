import path from "node:path";
import type { Sql, TransactionSql } from "postgres";

/**
 * Postgres everywhere:
 * - DATABASE_URL (or POSTGRES_URL / STORAGE_URL from the Neon integration) set → real Postgres, e.g. Neon on Vercel (postgres.js).
 * - Not set → embedded Postgres (PGlite) stored in ./data/pg, for zero-setup local dev.
 * Queries use $1, $2 placeholders and return plain row objects.
 */

export type Row = Record<string, unknown>;
export type Query = <T = Row>(text: string, params?: unknown[]) => Promise<T[]>;

interface Driver {
  query: Query;
  transaction<T>(fn: (q: Query) => Promise<T>): Promise<T>;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    servings INTEGER NOT NULL DEFAULT 4,
    prep_minutes INTEGER,
    source TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    steps TEXT NOT NULL DEFAULT '[]',
    images TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS ingredients (
    id SERIAL PRIMARY KEY,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    quantity DOUBLE PRECISION,
    unit TEXT,
    note TEXT,
    category TEXT NOT NULL DEFAULT 'Other'
  );
  CREATE INDEX IF NOT EXISTS ingredients_recipe_idx ON ingredients(recipe_id);
  CREATE TABLE IF NOT EXISTS meal_plans (
    id SERIAL PRIMARY KEY,
    start_date TEXT NOT NULL,
    days INTEGER NOT NULL,
    servings INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS meal_plan_entries (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    day_index INTEGER NOT NULL,
    meal TEXT NOT NULL,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    servings INTEGER NOT NULL
  );
  -- Items the user already has at home for a given plan
  CREATE TABLE IF NOT EXISTS grocery_checks (
    plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL,
    PRIMARY KEY (plan_id, item_key)
  );
  -- Remembered Kroger product per grocery item, so it only has to be picked once
  CREATE TABLE IF NOT EXISTS product_matches (
    item_key TEXT PRIMARY KEY,
    upc TEXT NOT NULL,
    description TEXT NOT NULL,
    size TEXT,
    price DOUBLE PRECISION,
    image TEXT,
    quantity INTEGER NOT NULL DEFAULT 1
  );
  -- Single-user app: one row holds the Kroger connection and preferred store
  CREATE TABLE IF NOT EXISTS kroger_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    expires_at BIGINT,
    location_id TEXT,
    location_name TEXT
  );
  INSERT INTO kroger_auth (id) VALUES (1) ON CONFLICT DO NOTHING;
`;

async function remoteDriver(url: string): Promise<Driver> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    max: 3,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    prepare: false, // safe with Neon's pooled (pgbouncer) connection strings
    onnotice: () => {},
  });
  const run =
    (s: Sql | TransactionSql): Query =>
    async <T,>(text: string, params: unknown[] = []) =>
      (await s.unsafe(text, params as never[])) as unknown as T[];
  await sql.unsafe(SCHEMA);
  return {
    query: run(sql),
    transaction: (fn) => sql.begin((tx) => fn(run(tx))) as never,
  };
}

async function localDriver(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR || "data", "pg");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  const pg = await PGlite.create(dir);
  await pg.exec(SCHEMA);
  type Tx = { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> };
  const run =
    (s: Tx): Query =>
    async <T,>(text: string, params: unknown[] = []) =>
      (await s.query(text, params)).rows as T[];
  return {
    query: run(pg),
    transaction: (fn) => pg.transaction((tx) => fn(run(tx))),
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __driver: Promise<Driver> | undefined;
}

function driver(): Promise<Driver> {
  if (!globalThis.__driver) {
    // Neon's Vercel integration names this <PREFIX>_URL; accept the common prefixes.
    const url =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.STORAGE_URL ||
      process.env.STORAGE_POSTGRES_URL;
    globalThis.__driver = (url ? remoteDriver(url) : localDriver()).catch((err) => {
      globalThis.__driver = undefined; // retry on next request
      throw err;
    });
  }
  return globalThis.__driver;
}

export const query: Query = async (text, params) => (await driver()).query(text, params);
export const transaction = async <T,>(fn: (q: Query) => Promise<T>) => (await driver()).transaction(fn);
