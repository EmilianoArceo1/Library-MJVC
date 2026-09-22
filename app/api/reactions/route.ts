import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { reactions } from "../../../db/schema";
import { getSessionUser } from "../../auth-server";

type ReactionTargetType = "post" | "profile";

function reactionKey(
  targetType: ReactionTargetType,
  targetId: string,
  emoji: string,
): string {
  return `${targetType}:${targetId}:${emoji}`;
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

export async function GET(request: Request) {
  try {
    const db = getDb();
    const identity = await getSessionUser(request);
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

      if (identity && row.userId === identity.id) {
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
    const identity = await getSessionUser(request);
    if (!identity) {
      return Response.json(
        { error: "Inicia sesión para reaccionar." },
        { status: 401 },
      );
    }
    if (identity.approvalStatus !== "approved") {
      return Response.json(
        { error: "Tu cuenta debe estar aprobada para reaccionar." },
        { status: 403 },
      );
    }

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
