"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Recipes" },
  { href: "/plan", label: "Meal plan" },
  { href: "/grocery", label: "Groceries" },
  { href: "/cook", label: "Cook" },
];

export default function Nav() {
  const path = usePathname();
  if (path === "/login") return null;

  async function signOut() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }

  return (
    <>
      <nav className="nav" aria-label="Main">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" || path.startsWith("/recipes") : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <button className="btn btn-quiet signout" onClick={signOut}>Sign out</button>
    </>
  );
}
