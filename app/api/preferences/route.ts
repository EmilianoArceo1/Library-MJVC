import { env } from "cloudflare:workers";
import { getSessionUser } from "../../auth-server";

type Theme = "light" | "dark";

async function ensurePreferencesTable() {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY NOT NULL,
      theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ).run();
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return Response.json(
        { error: "Inicia sesión para cargar tus preferencias." },
        { status: 401 },
      );
    }

    await ensurePreferencesTable();
    const row = await env.DB.prepare(
      "SELECT theme FROM user_preferences WHERE user_id = ? LIMIT 1",
    )
      .bind(user.id)
      .first<{ theme: Theme }>();

    return Response.json({ theme: row?.theme === "dark" ? "dark" : "light" });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las preferencias.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return Response.json(
        { error: "Inicia sesión para guardar tus preferencias." },
        { status: 401 },
      );
    }

    const payload = (await request.json()) as { theme?: Theme };
    const theme = payload.theme;

    if (theme !== "light" && theme !== "dark") {
      return Response.json(
        { error: "El tema debe ser claro u oscuro." },
        { status: 400 },
      );
    }

    await ensurePreferencesTable();
    await env.DB.prepare(
      `INSERT INTO user_preferences (user_id, theme)
       VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme`,
    )
      .bind(user.id, theme)
      .run();

    return Response.json({ theme });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron guardar las preferencias.";
    return Response.json({ error: message }, { status: 500 });
  }
}
