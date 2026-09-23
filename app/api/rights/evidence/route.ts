import { env } from "cloudflare:workers";
import { getSessionUser } from "../../../auth-server";
import { privateNoIndexHeaders } from "../../../rights-server";
import { ensureWorkflowSchema, isModerator } from "../../../workflow-server";

type RuntimeEnv = { BOOK_FILES: R2Bucket };
function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export async function GET(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (
      !session ||
      !session.emailVerified ||
      session.approvalStatus !== "approved" ||
      !isModerator(session.role)
    ) {
      return new Response("Acceso restringido.", {
        status: 403,
        headers: privateNoIndexHeaders("text/plain; charset=utf-8"),
      });
    }

    await ensureWorkflowSchema();
    const url = new URL(request.url);
    const bookId = Number(url.searchParams.get("bookId"));
    const requestId = Number(url.searchParams.get("requestId"));

    let key: string | null = null;
    if (Number.isInteger(bookId) && bookId > 0) {
      const row = await env.DB.prepare(
        "SELECT rights_evidence_key AS evidenceKey FROM books WHERE id = ? LIMIT 1",
      )
        .bind(bookId)
        .first<{ evidenceKey: string | null }>();
      key = row?.evidenceKey ?? null;
    } else if (Number.isInteger(requestId) && requestId > 0) {
      const row = await env.DB.prepare(
        "SELECT rights_evidence_key AS evidenceKey FROM book_upload_requests WHERE id = ? LIMIT 1",
      )
        .bind(requestId)
        .first<{ evidenceKey: string | null }>();
      key = row?.evidenceKey ?? null;
    } else {
      return new Response("Referencia inválida.", {
        status: 400,
        headers: privateNoIndexHeaders("text/plain; charset=utf-8"),
      });
    }

    if (!key) {
      return new Response("No hay evidencia adjunta.", {
        status: 404,
        headers: privateNoIndexHeaders("text/plain; charset=utf-8"),
      });
    }

    const object = await runtimeEnv().BOOK_FILES.get(key);
    if (!object) {
      return new Response("La evidencia ya no está disponible.", {
        status: 404,
        headers: privateNoIndexHeaders("text/plain; charset=utf-8"),
      });
    }

    const headers = privateNoIndexHeaders();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Content-Disposition", object.httpMetadata?.contentDisposition || "attachment");
    return new Response(object.body, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo abrir la evidencia.";
    return new Response(message, {
      status: 500,
      headers: privateNoIndexHeaders("text/plain; charset=utf-8"),
    });
  }
}
