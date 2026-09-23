import { env } from "cloudflare:workers";
import { getSessionUser } from "../../auth-server";
import { createNotification, ensureWorkflowSchema } from "../../workflow-server";
import { deleteRightsEvidence, readRightsForm, storeRightsEvidence } from "../../rights-server";

const MAX_BOOK_BYTES = 25 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 18 * 1024 * 1024;
const ALLOWED_BOOK_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["text/plain", "txt"],
]);

type RuntimeEnv = { BOOK_FILES: R2Bucket };

function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveInteger(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${field} debe ser un número entero mayor que cero.`);
  }
  return parsed;
}

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  let rightsEvidenceKey: string | null = null;

  try {
    const session = await getSessionUser(request);
    if (!session) {
      return Response.json(
        { error: "Inicia sesión para proponer un libro." },
        { status: 401 },
      );
    }
    if (!session.emailVerified || session.approvalStatus !== "approved") {
      return Response.json(
        { error: "Tu cuenta debe estar aprobada antes de proponer libros." },
        { status: 403 },
      );
    }

    await ensureWorkflowSchema();
    const formData = await request.formData();
    const title = readText(formData, "title");
    const author = readText(formData, "author");
    const type = readText(formData, "type");
    const synopsis = readText(formData, "synopsis");
    const year = parsePositiveInteger(readText(formData, "year"), "El año");
    const pages = parsePositiveInteger(
      readText(formData, "pages"),
      "El número de páginas",
    );
    const copies = parsePositiveInteger(
      readText(formData, "copies"),
      "Los ejemplares",
    );
    const file = formData.get("file");
    const contentPackage = readText(formData, "contentPackage");
    const rights = readRightsForm(formData);

    if (!title || title.length > 180 || !author || author.length > 140) {
      return Response.json(
        { error: "Revisa el título y el autor." },
        { status: 400 },
      );
    }
    if (!type || type.length > 60 || !synopsis || synopsis.length > 3000) {
      return Response.json(
        { error: "Revisa el tipo y la sinopsis." },
        { status: 400 },
      );
    }
    if (year < 1 || year > new Date().getFullYear() + 1) {
      return Response.json({ error: "El año no es válido." }, { status: 400 });
    }
    if (pages > 20_000 || copies > 1_000) {
      return Response.json(
        { error: "Revisa el número de páginas o ejemplares." },
        { status: 400 },
      );
    }
    const hasFile = file instanceof File && file.size > 0;
    if (!hasFile && rights.status !== "rights_reserved") {
      return Response.json(
        { error: "Selecciona un archivo PDF o TXT." },
        { status: 400 },
      );
    }

    let contentType = "";
    if (hasFile) {
      const uploadedFile = file as File;
      const fallbackType = uploadedFile.name.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : uploadedFile.name.toLowerCase().endsWith(".txt")
          ? "text/plain"
          : "";
      contentType = ALLOWED_BOOK_TYPES.has(uploadedFile.type)
        ? uploadedFile.type
        : fallbackType;
      const extension = ALLOWED_BOOK_TYPES.get(contentType);
      if (!extension) {
        return Response.json(
          { error: "Solo se permiten archivos PDF o TXT." },
          { status: 400 },
        );
      }
      if (uploadedFile.size > MAX_BOOK_BYTES) {
        return Response.json(
          { error: "El archivo debe pesar menos de 25 MB." },
          { status: 400 },
        );
      }
    }

    if (hasFile) {
      if (!contentPackage) {
        return Response.json(
          { error: "Espera a que termine la reconstrucción del documento." },
          { status: 400 },
        );
      }
      if (new TextEncoder().encode(contentPackage).byteLength > MAX_PACKAGE_BYTES) {
        return Response.json(
          { error: "La versión reconstruida del libro es demasiado grande." },
          { status: 400 },
        );
      }

      let parsedPackage: unknown;
      try {
        parsedPackage = JSON.parse(contentPackage);
      } catch {
        return Response.json(
          { error: "El contenido reconstruido del libro no es válido." },
          { status: 400 },
        );
      }
      if (
        !parsedPackage ||
        typeof parsedPackage !== "object" ||
        !Array.isArray((parsedPackage as { pages?: unknown[] }).pages) ||
        (parsedPackage as { pages: unknown[] }).pages.length !== pages
      ) {
        return Response.json(
          { error: "La cantidad de páginas reconstruidas no coincide." },
          { status: 400 },
        );
      }
    }

    rightsEvidenceKey = await storeRightsEvidence({ formData, uploadedBy: session.id, subject: "request" });

    const safeTitle =
      title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70)
        .toLowerCase() || "libro";

    if (hasFile) {
      const uploadedFile = file as File;
      uploadedKey = `book-requests/${crypto.randomUUID()}-${safeTitle}.mjvc.json`;
      await runtimeEnv().BOOK_FILES.put(uploadedKey, contentPackage, {
        httpMetadata: {
          contentType: "application/vnd.mjvc.book+json; charset=utf-8",
          cacheControl: "private, no-store, max-age=0",
        },
        customMetadata: {
          originalName: uploadedFile.name,
          originalType: contentType,
          uploadedBy: session.id,
          title,
          reconstruction: "v1",
          request: "true",
        },
      });
    }

    const now = Date.now();
    const result = await env.DB.prepare(
      `INSERT INTO book_upload_requests
        (user_id, requester_name, requester_email, title, author, year, pages,
         synopsis, type, copies, file_key, original_name, status, requested_at, updated_at,
         rights_status, rights_holder, rights_source_url, rights_permission_by, rights_notes, rights_evidence_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
      .bind(
        session.id,
        session.name,
        session.email,
        title,
        author,
        year,
        pages,
        synopsis,
        type,
        copies,
        uploadedKey ?? "",
        hasFile ? (file as File).name : "Sin archivo interno",
        now,
        now,
        rights.status,
        rights.holder,
        rights.sourceUrl,
        rights.permissionBy,
        rights.notes,
        rightsEvidenceKey,
      )
      .first<{ id: number }>();

    await createNotification({
      userId: session.id,
      title: `Propuesta “${title}” enviada`,
      body:
        "La propuesta quedó pendiente de revisión. Aquí recibirás la decisión y el nombre de quien la tome.",
      kind: "book-request",
    });

    return Response.json(
      {
        request: { id: result?.id, title, status: "pending" },
        message:
          "Tu propuesta fue enviada a administración. Recibirás una notificación cuando se tome una decisión.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedKey) {
      await runtimeEnv().BOOK_FILES.delete(uploadedKey).catch(() => undefined);
    }
    await deleteRightsEvidence(rightsEvidenceKey);
    const message =
      error instanceof Error ? error.message : "No se pudo enviar la propuesta.";
    return Response.json({ error: message }, { status: 500 });
  }
}
