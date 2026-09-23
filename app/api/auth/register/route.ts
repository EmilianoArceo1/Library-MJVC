import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { authCredentials, users } from "../../../../db/schema";
import {
  createPasswordRecord,
  createSession,
  isValidEmail,
  normalizeEmail,
  type SessionUser,
} from "../../../auth-server";
import { ensureWorkflowSchema } from "../../../workflow-server";
import {
  createEmailVerificationToken,
  deleteEmailVerificationTokens,
  sendVerificationEmail,
} from "../../../email-server";

const ADMIN_USER_ID = "emiliano-admin";

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

export async function POST(request: Request) {
  try {
    await ensureWorkflowSchema();
    const payload = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
      adminCode?: string;
    };

    const name = payload.name?.trim() ?? "";
    const email = normalizeEmail(payload.email ?? "");
    const password = payload.password ?? "";
    const adminCode = payload.adminCode?.trim() ?? "";

    if (name.length < 2 || name.length > 80) {
      return Response.json(
        { error: "El nombre debe tener entre 2 y 80 caracteres." },
        { status: 400 },
      );
    }

    if (!isValidEmail(email) || email.length > 254) {
      return Response.json(
        { error: "Escribe un correo electrónico válido." },
        { status: 400 },
      );
    }

    if (password.length < 8 || password.length > 128) {
      return Response.json(
        { error: "La contraseña debe tener entre 8 y 128 caracteres." },
        { status: 400 },
      );
    }

    const db = getDb();
    const [existingEmail] = await db
      .select({ userId: authCredentials.userId })
      .from(authCredentials)
      .where(eq(authCredentials.email, email))
      .limit(1);

    if (existingEmail) {
      return Response.json(
        { error: "Ya existe una cuenta con ese correo." },
        { status: 409 },
      );
    }

    const passwordRecord = await createPasswordRecord(password);
    let user: SessionUser;

    if (adminCode) {
      const runtimeEnv = env as unknown as { ADMIN_SETUP_TOKEN?: string };
      const configuredCode = runtimeEnv.ADMIN_SETUP_TOKEN ?? "";

      if (!configuredCode) {
        return Response.json(
          {
            error:
              "El código de administrador aún no está configurado en Cloudflare.",
          },
          { status: 503 },
        );
      }

      if (!safeEqual(adminCode, configuredCode)) {
        return Response.json(
          { error: "El código de administrador no es correcto." },
          { status: 403 },
        );
      }

      const [admin] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, ADMIN_USER_ID))
        .limit(1);

      if (!admin) {
        return Response.json(
          {
            error:
              "No existe el usuario administrador inicial. Vuelve a crear emiliano-admin en D1.",
          },
          { status: 409 },
        );
      }

      const [claimed] = await db
        .select({ userId: authCredentials.userId })
        .from(authCredentials)
        .where(eq(authCredentials.userId, ADMIN_USER_ID))
        .limit(1);

      if (claimed) {
        return Response.json(
          { error: "La cuenta de administrador inicial ya fue configurada." },
          { status: 409 },
        );
      }

      await db.batch([
        db
          .update(users)
          .set({ name, role: "admin", approvalStatus: "approved", emailVerifiedAt: Date.now() })
          .where(eq(users.id, ADMIN_USER_ID)),
        db.insert(authCredentials).values({
          userId: ADMIN_USER_ID,
          email,
          passwordHash: passwordRecord.passwordHash,
          passwordSalt: passwordRecord.passwordSalt,
        }),
      ]);

      user = {
        id: ADMIN_USER_ID,
        name,
        email,
        role: "admin",
        approvalStatus: "approved",
        emailVerified: true,
        description: "",
        pagesRead: 0,
        photoUrl: null,
      };
    } else {
      const userId = crypto.randomUUID();

      await db.batch([
        db.insert(users).values({
          id: userId,
          name,
          role: "reader",
          approvalStatus: "pending",
          emailVerifiedAt: null,
        }),
        db.insert(authCredentials).values({
          userId,
          email,
          passwordHash: passwordRecord.passwordHash,
          passwordSalt: passwordRecord.passwordSalt,
        }),
      ]);

      try {
        const verification = await createEmailVerificationToken(userId);
        await sendVerificationEmail({
          request,
          email,
          name,
          token: verification.token,
        });
      } catch (error) {
        await deleteEmailVerificationTokens(userId).catch(() => undefined);
        await db.delete(authCredentials).where(eq(authCredentials.userId, userId)).catch(() => undefined);
        await db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
        throw error;
      }

      user = {
        id: userId,
        name,
        email,
        role: "reader",
        approvalStatus: "pending",
        emailVerified: false,
        description: "",
        pagesRead: 0,
        photoUrl: null,
      };
    }

    const cookie = await createSession(request, user.id);
    return Response.json(
      {
        user,
        emailVerificationPending: !user.emailVerified,
        pending: user.emailVerified && user.approvalStatus === "pending",
        message: !user.emailVerified
          ? "Te enviamos un correo de verificación. Tu solicitud llegará al administrador y a los asesores después de confirmar ese enlace."
          : user.approvalStatus === "pending"
            ? "Tu solicitud fue enviada al administrador para revisión."
            : "Cuenta configurada correctamente.",
      },
      {
        status: 201,
        headers: { "Set-Cookie": cookie },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo crear la cuenta.";
    return Response.json({ error: message }, { status: 500 });
  }
}
