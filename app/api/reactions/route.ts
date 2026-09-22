import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { reactions, users } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type ReactionTargetType = "post" | "profile";

function reactionKey(
  targetType: ReactionTargetType,
  targetId: string,
  emoji: string,
): string {
  return `${targetType}:${targetId}:${emoji}`;
}

async function getReactionIdentity() {
  const authenticated = await getChatGPTUser();

  return {
    id: authenticated?.userId ?? "demo-amelia",
    name:
      authenticated?.fullName ??
      authenticated?.displayName ??
      "Amelia",
  };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Error inesperado";
  const detail =
    error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : "";
  const combined = `${message}\n${detail}`;

  if (combined.includes("no such table")) {
    return "La tabla de reacciones no está disponible en D1.";
  }

  return message;
}

export async function GET() {
  try {
    const db = getDb();
    const identity = await getReactionIdentity();
    const rows = await db.select().from(reactions);

    const counts: Record<string, number> = {};
    const mine: Array<{
      targetType: ReactionTargetType;
      targetId: string;
      emoji: string;
    }> = [];

    for (const row of rows) {
      const targetType = row.targetType as ReactionTargetType;
      const key = reactionKey(targetType, row.targetId, row.emoji);
      counts[key] = (counts[key] ?? 0) + 1;

      if (row.userId === identity.id) {
        mine.push({
          targetType,
          targetId: row.targetId,
          emoji: row.emoji,
        });
      }
    }

    return Response.json({ counts, mine });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      targetType?: string;
      targetId?: string | number;
      emoji?: string;
    };

    const targetType = payload.targetType;
    const targetId = String(payload.targetId ?? "").trim();
    const emoji = payload.emoji?.trim() ?? "";

    if (targetType !== "post" && targetType !== "profile") {
      return Response.json(
        { error: "Tipo de reacción inválido." },
        { status: 400 },
      );
    }

    if (!targetId || targetId.length > 160) {
      return Response.json(
        { error: "Objetivo de reacción inválido." },
        { status: 400 },
      );
    }

    if (!emoji || emoji.length > 16) {
      return Response.json(
        { error: "Reacción inválida." },
        { status: 400 },
      );
    }

    const db = getDb();
    const identity = await getReactionIdentity();

    await db
      .insert(users)
      .values({
        id: identity.id,
        name: identity.name,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { name: identity.name },
      });

    const match = and(
      eq(reactions.userId, identity.id),
      eq(reactions.targetType, targetType),
      eq(reactions.targetId, targetId),
      eq(reactions.emoji, emoji),
    );

    const existing = await db
      .select({ id: reactions.id })
      .from(reactions)
      .where(match)
      .limit(1);

    let active: boolean;

    if (existing.length > 0) {
      await db.delete(reactions).where(match);
      active = false;
    } else {
      await db.insert(reactions).values({
        userId: identity.id,
        targetType,
        targetId,
        emoji,
      });
      active = true;
    }

    const currentRows = await db
      .select({ id: reactions.id })
      .from(reactions)
      .where(
        and(
          eq(reactions.targetType, targetType),
          eq(reactions.targetId, targetId),
          eq(reactions.emoji, emoji),
        ),
      );

    return Response.json({
      active,
      count: currentRows.length,
      key: reactionKey(targetType, targetId, emoji),
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
