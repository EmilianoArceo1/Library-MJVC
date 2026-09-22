import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { getSessionUser } from "../../../auth-server";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type RuntimeEnv = {
  BOOK_FILES: R2Bucket;
};

function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId")?.trim() ?? "";

    if (!userId) {
      return new Response("Usuario inválido.", { status: 400 });
    }

    const db = getDb();
    const [user] = await db
      .select({ photoKey: users.photoKey })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.photoKey) {
      return new Response("Sin foto.", { status: 404 });
    }

    const object = await runtimeEnv().BOOK_FILES.get(user.photoKey);
    if (!object) {
      return new Response("Foto no encontrada.", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=3600");
    headers.set("ETag", object.httpEtag);

    return new Response(object.body, { headers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo cargar la foto.";
    return new Response(message, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return Response.json({ error: "Inicia sesión para cambiar tu foto." }, { status: 401 });
    }

    const formData = await request.formData();
    const value = formData.get("photo");

    if (!(value instanceof File)) {
      return Response.json({ error: "Selecciona una imagen." }, { status: 400 });
    }

    const extension = ALLOWED_TYPES.get(value.type);
    if (!extension) {
      return Response.json(
        { error: "Usa una imagen JPG, PNG o WEBP." },
        { status: 400 },
      );
    }

    if (value.size <= 0 || value.size > MAX_PHOTO_BYTES) {
      return Response.json(
        { error: "La foto debe pesar menos de 4 MB." },
        { status: 400 },
      );
    }

    const db = getDb();
    const [existing] = await db
      .select({ photoKey: users.photoKey })
      .from(users)
      .where(eq(users.id, session.id))
      .limit(1);

    const key = `profile-photos/${session.id}/${crypto.randomUUID()}.${extension}`;
    const bucket = runtimeEnv().BOOK_FILES;

    await bucket.put(key, value.stream(), {
      httpMetadata: {
        contentType: value.type,
        cacheControl: "public, max-age=3600",
      },
    });

    await db
      .update(users)
      .set({ photoKey: key })
      .where(eq(users.id, session.id));

    if (existing?.photoKey && existing.photoKey !== key) {
      await bucket.delete(existing.photoKey).catch(() => undefined);
    }

    return Response.json({
      photoUrl: `/api/profile/photo?userId=${encodeURIComponent(session.id)}&v=${encodeURIComponent(key)}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo guardar la foto.";
    return Response.json({ error: message }, { status: 500 });
  }
}
