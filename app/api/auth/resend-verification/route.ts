import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { authCredentials, users } from "../../../../db/schema";
import { isValidEmail, normalizeEmail } from "../../../auth-server";
import {
  canResendVerification,
  createEmailVerificationToken,
  sendVerificationEmail,
} from "../../../email-server";
import { ensureWorkflowSchema } from "../../../workflow-server";

const GENERIC_MESSAGE =
  "Si esa cuenta necesita verificación, enviaremos un nuevo enlace al correo registrado.";

export async function POST(request: Request) {
  try {
    await ensureWorkflowSchema();
    const payload = (await request.json()) as { email?: string };
    const email = normalizeEmail(payload.email ?? "");

    if (!isValidEmail(email)) {
      return Response.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const db = getDb();
    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(authCredentials)
      .innerJoin(users, eq(authCredentials.userId, users.id))
      .where(eq(authCredentials.email, email))
      .limit(1);

    if (!row || row.emailVerifiedAt !== null) {
      return Response.json({ ok: true, message: GENERIC_MESSAGE });
    }

    if (!(await canResendVerification(row.id))) {
      return Response.json({
        ok: true,
        message: "Espera un minuto antes de pedir otro enlace.",
      });
    }

    const verification = await createEmailVerificationToken(row.id);
    await sendVerificationEmail({
      request,
      email,
      name: row.name,
      token: verification.token,
    });

    return Response.json({ ok: true, message: GENERIC_MESSAGE });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo reenviar el correo de verificación.";
    return Response.json({ error: message }, { status: 500 });
  }
}
