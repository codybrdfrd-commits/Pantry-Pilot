import { NextResponse } from "next/server";
import { deleteRecipe, getRecipe, updateRecipe, type RecipeInput } from "@/lib/recipes";
import { blobAuthFrom, deleteImages } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const recipe = await getRecipe(Number((await params).id));
  return recipe ? NextResponse.json(recipe) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  if (!(await getRecipe(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as RecipeInput;
  if (!body.title?.trim()) return NextResponse.json({ error: "Give the recipe a title." }, { status: 400 });
  await updateRecipe(id, body);
  return NextResponse.json(await getRecipe(id));
}

export async function DELETE(req: Request, { params }: Ctx) {
  const images = await deleteRecipe(Number((await params).id));
  await deleteImages(images, blobAuthFrom(req));
  return NextResponse.json({ ok: true });
}
