import {
  clearSessionCookie,
  destroySession,
} from "../../../auth-server";

export async function POST(request: Request) {
  try {
    await destroySession(request);
    return Response.json(
      { ok: true },
      {
        headers: { "Set-Cookie": clearSessionCookie(request) },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo cerrar la sesión.";
    return Response.json({ error: message }, { status: 500 });
  }
}
