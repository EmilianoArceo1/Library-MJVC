import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../db/schema";
import { getSessionUser } from "../../auth-server";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return Response.json({ error: "Inicia sesión para ver tu perfil." }, { status: 401 });
    }

    return Response.json({ user });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo cargar el perfil.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return Response.json({ error: "Inicia sesión para editar tu perfil." }, { status: 401 });
    }

    const payload = (await request.json()) as { description?: string };
    const description = (payload.description ?? "").trim();

    if (description.length > 320) {
      return Response.json(
        { error: "La descripción no puede superar 320 caracteres." },
        { status: 400 },
      );
    }

    const db = getDb();
    await db
      .update(users)
      .set({ description })
      .where(eq(users.id, session.id));

    const user = await getSessionUser(request);
    return Response.json({ user });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo guardar el perfil.";
    return Response.json({ error: message }, { status: 500 });
  }
}
