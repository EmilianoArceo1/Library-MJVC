import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { books } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "../../auth-server";
import {
  isRightsStatus,
  privateNoIndexHeaders,
  rightsCanPublish,
} from "../../rights-server";
import { ensureWorkflowSchema, isModerator } from "../../workflow-server";

async function moderator(request: Request) {
  const session = await getSessionUser(request);
  if (
    !session ||
    !session.emailVerified ||
    session.approvalStatus !== "approved" ||
    !isModerator(session.role)
  ) return null;
  return session;
}

export async function GET(request: Request) {
  try {
    const session = await moderator(request);
    if (!session) {
      return Response.json({ error: "Acceso restringido." }, { status: 403 });
    }
    await ensureWorkflowSchema();

    const db = getDb();
    const rows = await db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        year: books.year,
        publicationStatus: books.publicationStatus,
        rightsStatus: books.rightsStatus,
        rightsHolder: books.rightsHolder,
        rightsSourceUrl: books.rightsSourceUrl,
        rightsPermissionBy: books.rightsPermissionBy,
        rightsNotes: books.rightsNotes,
        rightsEvidenceKey: books.rightsEvidenceKey,
        rightsVerifiedAt: books.rightsVerifiedAt,
        rightsVerifiedBy: books.rightsVerifiedBy,
        reservedInternalAccess: books.reservedInternalAccess,
        fileKey: books.fileKey,
      })
      .from(books)
      .orderBy(books.title);

    const headers = privateNoIndexHeaders("application/json; charset=utf-8");
    return Response.json({
      books: rows.map((row) => ({
        ...row,
        rightsEvidenceAvailable: Boolean(row.rightsEvidenceKey),
        hasInternalContent: Boolean(row.fileKey),
        reservedInternalAccess: Boolean(row.reservedInternalAccess),
        rightsEvidenceKey: undefined,
        fileKey: undefined,
      })),
      viewer: { role: session.role },
    }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron cargar los derechos.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionUser(request);
    if (
      !session ||
      session.role !== "admin" ||
      !session.emailVerified ||
      session.approvalStatus !== "approved"
    ) {
      return Response.json(
        { error: "Solo un administrador aprobado puede modificar derechos." },
        { status: 403 },
      );
    }
    await ensureWorkflowSchema();

    const payload = (await request.json()) as {
      id?: number;
      rightsStatus?: string;
      rightsHolder?: string;
      rightsSourceUrl?: string;
      rightsPermissionBy?: string;
      rightsNotes?: string;
      publish?: boolean;
      reservedInternalAccess?: boolean;
    };

    const id = Number(payload.id);
    const status = payload.rightsStatus?.trim() ?? "";
    const holder = payload.rightsHolder?.trim().slice(0, 180) ?? "";
    const sourceUrl = payload.rightsSourceUrl?.trim().slice(0, 1000) ?? "";
    const permissionBy = payload.rightsPermissionBy?.trim().slice(0, 180) ?? "";
    const notes = payload.rightsNotes?.trim().slice(0, 2000) ?? "";
    const requestedInternalAccess = payload.reservedInternalAccess === true;

    if (!Number.isInteger(id) || id < 1 || !isRightsStatus(status)) {
      return Response.json({ error: "Datos de derechos inválidos." }, { status: 400 });
    }
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      } catch {
        return Response.json({ error: "La URL de fuente no es válida." }, { status: 400 });
      }
    }
    if (status === "permission" && (!holder || !permissionBy)) {
      return Response.json(
        { error: "Indica titular y quién concedió el permiso." },
        { status: 400 },
      );
    }
    if (status === "rights_reserved" && !holder) {
      return Response.json(
        { error: "Para una obra con derechos reservados, indica al titular o responsable de los derechos." },
        { status: 400 },
      );
    }
    if (
      (status === "creative_commons" ||
        status === "official_source" ||
        status === "public_domain") &&
      !sourceUrl &&
      !notes
    ) {
      return Response.json(
        { error: "Añade una fuente o nota para comprobar los derechos." },
        { status: 400 },
      );
    }

    const db = getDb();
    const [current] = await db.select({ id: books.id, fileKey: books.fileKey }).from(books).where(eq(books.id, id)).limit(1);
    if (!current) return Response.json({ error: "Libro no encontrado." }, { status: 404 });

    const reservedInternalAccess =
      status === "rights_reserved" && requestedInternalAccess;
    if (status === "rights_reserved" && !sourceUrl && !reservedInternalAccess) {
      return Response.json(
        { error: "Añade el enlace legal a la fuente o activa explícitamente la lectura interna bajo decisión administrativa." },
        { status: 400 },
      );
    }
    if (reservedInternalAccess && !current.fileKey) {
      return Response.json(
        { error: "No hay contenido interno almacenado para habilitar lectura dentro de la biblioteca." },
        { status: 409 },
      );
    }

    const canPublish = rightsCanPublish(status) && payload.publish !== false;
    const [updated] = await db
      .update(books)
      .set({
        rightsStatus: status,
        rightsHolder: holder,
        rightsSourceUrl: sourceUrl,
        rightsPermissionBy: permissionBy,
        rightsNotes: notes,
        reservedInternalAccess: reservedInternalAccess ? 1 : 0,
        rightsVerifiedAt: rightsCanPublish(status) ? Date.now() : null,
        rightsVerifiedBy: rightsCanPublish(status) ? session.name : null,
        publicationStatus: canPublish ? "published" : "hidden",
      })
      .where(eq(books.id, id))
      .returning();

    const headers = privateNoIndexHeaders("application/json; charset=utf-8");
    return Response.json({
      book: {
        id: updated.id,
        title: updated.title,
        publicationStatus: updated.publicationStatus,
        rightsStatus: updated.rightsStatus,
        rightsHolder: updated.rightsHolder,
        rightsSourceUrl: updated.rightsSourceUrl,
        rightsPermissionBy: updated.rightsPermissionBy,
        rightsNotes: updated.rightsNotes,
        rightsEvidenceAvailable: Boolean(updated.rightsEvidenceKey),
        rightsVerifiedAt: updated.rightsVerifiedAt,
        rightsVerifiedBy: updated.rightsVerifiedBy,
        reservedInternalAccess: Boolean(updated.reservedInternalAccess),
        hasInternalContent: Boolean(updated.fileKey),
      },
    }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron actualizar los derechos.";
    return Response.json({ error: message }, { status: 500 });
  }
}
