import { useSession } from "@tanstack/react-start/server";
import { createHash } from "node:crypto";

import type { Role } from "@/lib/dtr-shared";

export type AppSession = { role?: Role; label?: string };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "swiftslip-session",
    maxAge: 60 * 60 * 12,
    cookie: {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export async function appSession() {
  return useSession<AppSession>(sessionConfig());
}

export function hashPassword(password: string) {
  return createHash("sha256").update(password, "utf8").digest("hex");
}

export async function currentRole(): Promise<{ role: Role; label: string } | null> {
  const session = await appSession();
  if (!session.data.role) return null;
  return { role: session.data.role, label: session.data.label ?? "" };
}

export async function requireSignedIn() {
  const who = await currentRole();
  if (!who) throw new Error("Please sign in first.");
  return who;
}

export async function requireAdmin() {
  const who = await requireSignedIn();
  if (who.role !== "admin") throw new Error("Only an administrator can do this.");
  return who;
}
