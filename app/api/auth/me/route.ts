import { getSessionUser } from "../../../auth-server";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request);
    return Response.json({ user });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo leer la sesión.";
    return Response.json({ error: message }, { status: 500 });
  }
}
