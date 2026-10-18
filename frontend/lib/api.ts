import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Me, Plan } from "./fmt";

export const BACKEND = process.env.BACKEND_URL || "http://localhost:8049";

// cache() dedupes the call between the layout and the page within one request.
export const getMe = cache(async (): Promise<Me | null> => {
  const session = (await cookies()).get("session")?.value;
  if (!session) return null;
  try {
    const r = await fetch(`${BACKEND}/api/me`, { headers: { cookie: `session=${session}` }, cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
});

export async function requireMe(next: string, admin = false): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (admin && me.role !== "admin") redirect("/dashboard");
  return me;
}

export const getPlans = (): Promise<Plan[]> =>
  fetch(`${BACKEND}/api/plans`, { cache: "no-store" }).then((r) => r.json()).catch(() => []);
