import { env } from "cloudflare:workers";

export const RIGHTS_STATUSES = [
  "own_work",
  "public_domain",
  "creative_commons",
  "permission",
  "rights_reserved",
  "official_source",
  "review",
] as const;

export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export type RightsForm = {
  status: RightsStatus;
  holder: string;
  sourceUrl: string;
  permissionBy: string;
  notes: string;
};

export function isRightsStatus(value: string): value is RightsStatus {
  return RIGHTS_STATUSES.includes(value as RightsStatus);
}

function clean(value: FormDataEntryValue | null, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function readRightsForm(formData: FormData): RightsForm {
  const statusRaw = clean(formData.get("rightsStatus"), 40);
  if (!isRightsStatus(statusRaw)) {
    throw new Error("Selecciona una situación de derechos válida.");
  }

  const holder = clean(formData.get("rightsHolder"), 180);
  const sourceUrl = clean(formData.get("rightsSourceUrl"), 1000);
  const permissionBy = clean(formData.get("rightsPermissionBy"), 180);
  const notes = clean(formData.get("rightsNotes"), 2000);

  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error();
      }
    } catch {
      throw new Error("La URL de la fuente o licencia no es válida.");
    }
  }

  if (statusRaw === "permission" && (!holder || !permissionBy)) {
    throw new Error(
      "Para publicar con permiso del titular, indica al titular y quién concedió el permiso.",
    );
  }

  if (statusRaw === "rights_reserved" && !holder) {
    throw new Error(
      "Para una obra con derechos reservados, indica al titular o responsable de los derechos.",
    );
  }
  if (statusRaw === "rights_reserved" && !sourceUrl) {
    throw new Error(
      "Para una obra con derechos reservados, añade el enlace legal a la fuente donde debe leerse.",
    );
  }

  if (
    (statusRaw === "creative_commons" ||
      statusRaw === "official_source" ||
      statusRaw === "public_domain") &&
    !sourceUrl &&
    !notes
  ) {
    throw new Error(
      "Añade una fuente o una nota que permita comprobar la situación de derechos.",
    );
  }

  return { status: statusRaw, holder, sourceUrl, permissionBy, notes };
}

export function rightsCanPublish(status: RightsStatus): boolean {
  return status !== "review";
}

export const RIGHTS_LABELS: Record<RightsStatus, string> = {
  own_work: "Obra propia",
  public_domain: "Dominio público",
  creative_commons: "Creative Commons",
  permission: "Permiso del titular",
  rights_reserved: "Derechos reservados",
  official_source: "Fuente oficial con permiso",
  review: "Situación por revisar",
};

const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
const EVIDENCE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

type RuntimeEnv = { BOOK_FILES: R2Bucket };

function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export async function storeRightsEvidence(input: {
  formData: FormData;
  uploadedBy: string;
  subject: "book" | "request";
}): Promise<string | null> {
  const evidence = input.formData.get("rightsEvidence");
  if (!(evidence instanceof File) || evidence.size <= 0) return null;
  if (evidence.size > EVIDENCE_MAX_BYTES) {
    throw new Error("La evidencia de derechos debe pesar menos de 10 MB.");
  }
  if (!EVIDENCE_TYPES.has(evidence.type)) {
    throw new Error("La evidencia debe ser PDF, TXT, JPG, PNG o WEBP.");
  }

  const key = `rights-evidence/${input.subject}/${crypto.randomUUID()}`;
  await runtimeEnv().BOOK_FILES.put(key, evidence.stream(), {
    httpMetadata: {
      contentType: evidence.type || "application/octet-stream",
      cacheControl: "private, no-store",
      contentDisposition: `attachment; filename="${evidence.name.replace(/"/g, "")}"`,
    },
    customMetadata: {
      originalName: evidence.name,
      uploadedBy: input.uploadedBy,
      purpose: "copyright-rights-evidence",
    },
  });
  return key;
}

export async function deleteRightsEvidence(key?: string | null) {
  if (!key) return;
  await runtimeEnv().BOOK_FILES.delete(key).catch(() => undefined);
}

export function privateNoIndexHeaders(contentType?: string | null): Headers {
  const headers = new Headers();
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return headers;
}
