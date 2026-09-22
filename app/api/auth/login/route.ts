import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { authCredentials, users } from "../../../../db/schema";
import {
  createSession,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
  type SessionUser,
} from "../../../auth-server";
import { ensureWorkflowSchema } from "../../../workflow-server";

export async function POST(request: Request) {
  try {
    await ensureWorkflowSchema();
    const payload = (await request.json()) as {
      email?: string;
      password?: string;
    };

    const email = normalizeEmail(payload.email ?? "");
    const password = payload.password ?? "";

    if (!isValidEmail(email) || !password) {
      return Response.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 },
      );
    }

    const db = getDb();
    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        approvalStatus: users.approvalStatus,
        email: authCredentials.email,
        description: users.description,
        pagesRead: users.pagesRead,
        photoKey: users.photoKey,
        passwordHash: authCredentials.passwordHash,
        passwordSalt: authCredentials.passwordSalt,
      })
      .from(authCredentials)
      .innerJoin(users, eq(authCredentials.userId, users.id))
      .where(eq(authCredentials.email, email))
      .limit(1);

    if (
      !row ||
      !(await verifyPassword(password, row.passwordHash, row.passwordSalt))
    ) {
      return Response.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 },
      );
    }

    const user: SessionUser = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as "reader" | "advisor" | "admin",
      approvalStatus: row.approvalStatus as "pending" | "approved" | "rejected",
      description: row.description,
      pagesRead: row.pagesRead,
      photoUrl: row.photoKey
        ? `/api/profile/photo?userId=${encodeURIComponent(row.id)}&v=${encodeURIComponent(row.photoKey)}`
        : null,
    };

    const cookie = await createSession(request, user.id);
    return Response.json(
      { user },
      {
        headers: { "Set-Cookie": cookie },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo iniciar sesión.";
    return Response.json({ error: message }, { status: 500 });
  }
}
