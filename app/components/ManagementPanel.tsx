"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

type RegistrationRequest = {
  id: number;
  userId: string;
  name: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: number;
  updatedAt: number;
  lastDecisionBy?: string | null;
  lastDecisionAt?: number | null;
  role?: string | null;
  approvalStatus?: string | null;
};

type BookRequest = {
  id: number;
  userId: string;
  requesterName: string;
  requesterEmail: string;
  title: string;
  author: string;
  year: number;
  pages: number;
  synopsis: string;
  type: string;
  copies: number;
  originalName: string;
  status: "pending" | "approved" | "rejected";
  createdBookId?: number | null;
  requestedAt: number;
  updatedAt: number;
  lastDecisionBy?: string | null;
  lastDecisionAt?: number | null;
  rightsStatus?: "own_work" | "public_domain" | "creative_commons" | "permission" | "official_source" | "review";
  rightsHolder?: string;
  rightsSourceUrl?: string;
  rightsPermissionBy?: string;
  rightsNotes?: string;
  rightsEvidenceAvailable?: boolean | number;
};

type DecisionRecord = {
  id: number;
  requestType: "registration" | "book";
  requestId: string;
  decision: "approved" | "rejected";
  actorId: string;
  actorName: string;
  message: string;
  createdAt: number;
};

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  description: string;
  role: "reader" | "advisor" | "admin";
  approvalStatus: "pending" | "approved" | "rejected";
  emailVerified: boolean | number;
  pagesRead: number;
};

type RightsBook = {
  id: number;
  title: string;
  author: string;
  year: number;
  publicationStatus: "published" | "hidden";
  rightsStatus: "own_work" | "public_domain" | "creative_commons" | "permission" | "official_source" | "review";
  rightsHolder: string;
  rightsSourceUrl: string;
  rightsPermissionBy: string;
  rightsNotes: string;
  rightsEvidenceAvailable: boolean;
  rightsVerifiedAt?: number | null;
  rightsVerifiedBy?: string | null;
};

type CopyrightReport = {
  id: number;
  bookId: number;
  bookTitle: string | null;
  bookAuthor: string | null;
  reporterName: string;
  reporterEmail: string;
  claimantName: string;
  claimantEmail: string;
  relationship: string;
  evidenceUrl: string;
  details: string;
  status: "pending" | "reviewing" | "resolved" | "dismissed";
  resolutionNote: string;
  resolvedBy?: string | null;
  createdAt: number;
  updatedAt: number;
};

const RIGHTS_OPTIONS = [
  ["own_work", "Obra propia"],
  ["public_domain", "Dominio público"],
  ["creative_commons", "Creative Commons"],
  ["permission", "Permiso del titular"],
  ["official_source", "Fuente oficial con permiso"],
  ["review", "Situación por revisar"],
] as const;
const rightsLabel = (status?: string) =>
  RIGHTS_OPTIONS.find(([value]) => value === status)?.[1] ?? "Por revisar";

type Tab = "pending" | "history" | "rights" | "users" | "broadcast";

const statusLabel = (status: string) =>
  status === "approved" ? "Aprobada" : status === "rejected" ? "Rechazada" : "Pendiente";

const roleLabel = (role: string) =>
  role === "admin" ? "Administrador" : role === "advisor" ? "Asesor" : "Lector";

export default function ManagementPanel({
  role,
  onCatalogChanged,
}: {
  role: "admin" | "advisor";
  onCatalogChanged?: () => void;
}) {
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<Tab>("pending");
  const [registrations, setRegistrations] = useState<RegistrationRequest[]>([]);
  const [bookRequests, setBookRequests] = useState<BookRequest[]>([]);
  const [history, setHistory] = useState<DecisionRecord[]>([]);
  const [rightsBooks, setRightsBooks] = useState<RightsBook[]>([]);
  const [copyrightReports, setCopyrightReports] = useState<CopyrightReport[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editingRights, setEditingRights] = useState<RightsBook | null>(null);
  const [editingRequestRights, setEditingRequestRights] = useState<BookRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/moderation", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudieron cargar las solicitudes");
      setRegistrations(Array.isArray(payload.registrations) ? payload.registrations : []);
      setBookRequests(Array.isArray(payload.bookRequests) ? payload.bookRequests : []);
      setHistory(Array.isArray(payload.history) ? payload.history : []);

      const [rightsResponse, reportsResponse] = await Promise.all([
        fetch("/api/rights", { cache: "no-store" }),
        fetch("/api/copyright-reports", { cache: "no-store" }),
      ]);
      const rightsPayload = await rightsResponse.json();
      const reportsPayload = await reportsResponse.json();
      if (!rightsResponse.ok) throw new Error(rightsPayload.error || "No se pudieron cargar los derechos");
      if (!reportsResponse.ok) throw new Error(reportsPayload.error || "No se pudieron cargar los reportes");
      setRightsBooks(Array.isArray(rightsPayload.books) ? rightsPayload.books : []);
      setCopyrightReports(Array.isArray(reportsPayload.reports) ? reportsPayload.reports : []);

      if (isAdmin) {
        const usersResponse = await fetch("/api/admin/users", { cache: "no-store" });
        const usersPayload = await usersResponse.json();
        if (!usersResponse.ok) throw new Error(usersPayload.error || "No se pudieron cargar los usuarios");
        setUsers(Array.isArray(usersPayload.users) ? usersPayload.users : []);
        setCurrentUserId(String(usersPayload.currentUserId || ""));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo cargar la gestión.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [isAdmin]);

  const pendingRegistrations = useMemo(
    () => registrations.filter((request) => request.status === "pending"),
    [registrations],
  );
  const pendingBooks = useMemo(
    () => bookRequests.filter((request) => request.status === "pending"),
    [bookRequests],
  );

  const subjectForDecision = (record: DecisionRecord) => {
    if (record.requestType === "registration") {
      const request = registrations.find((item) => String(item.id) === String(record.requestId));
      return request ? `Registro de ${request.name}` : `Registro #${record.requestId}`;
    }
    const request = bookRequests.find((item) => String(item.id) === String(record.requestId));
    return request ? `Libro “${request.title}”` : `Libro #${record.requestId}`;
  };

  const currentStatusForDecision = (record: DecisionRecord) => {
    if (record.requestType === "registration") {
      return registrations.find((item) => String(item.id) === String(record.requestId))?.status;
    }
    return bookRequests.find((item) => String(item.id) === String(record.requestId))?.status;
  };

  const decide = async (
    type: "registration" | "book",
    id: number,
    decision: "approved" | "rejected",
    subject: string,
  ) => {
    const promptResult = window.prompt(
      `${decision === "approved" ? "Aprobar" : "Rechazar"} ${subject}.\n\nMensaje para el usuario (opcional):`,
      "",
    );
    if (promptResult === null) return;
    const message = promptResult.trim();
    const key = `${type}:${id}:${decision}`;
    setBusyKey(key);
    try {
      const response = await fetch("/api/moderation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, decision, message }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo guardar el dictamen");
      setNotice(`${subject}: decisión guardada por ${payload.actor}.`);
      await load();
      onCatalogChanged?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar la decisión.");
    } finally {
      setBusyKey("");
    }
  };

  const saveRequestRights = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRequestRights) return;
    const form = new FormData(event.currentTarget);
    setBusyKey(`request-rights:${editingRequestRights.id}`);
    try {
      const response = await fetch("/api/rights/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRequestRights.id,
          rightsStatus: String(form.get("rightsStatus") || "review"),
          rightsHolder: String(form.get("rightsHolder") || ""),
          rightsSourceUrl: String(form.get("rightsSourceUrl") || ""),
          rightsPermissionBy: String(form.get("rightsPermissionBy") || ""),
          rightsNotes: String(form.get("rightsNotes") || ""),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudieron revisar los derechos");
      setEditingRequestRights(null);
      setNotice(`Derechos de la propuesta “${editingRequestRights.title}” revisados por ${payload.rights.reviewedBy}.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudieron revisar los derechos de la propuesta.");
    } finally {
      setBusyKey("");
    }
  };

  const saveRights = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRights || !isAdmin) return;
    const form = new FormData(event.currentTarget);
    setBusyKey(`rights:${editingRights.id}`);
    try {
      const response = await fetch("/api/rights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRights.id,
          rightsStatus: String(form.get("rightsStatus") || "review"),
          rightsHolder: String(form.get("rightsHolder") || ""),
          rightsSourceUrl: String(form.get("rightsSourceUrl") || ""),
          rightsPermissionBy: String(form.get("rightsPermissionBy") || ""),
          rightsNotes: String(form.get("rightsNotes") || ""),
          publish: form.get("publish") === "on",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudieron actualizar los derechos");
      setEditingRights(null);
      setNotice(`Derechos de “${editingRights.title}” actualizados.`);
      await load();
      onCatalogChanged?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudieron actualizar los derechos.");
    } finally {
      setBusyKey("");
    }
  };

  const actOnCopyrightReport = async (
    report: CopyrightReport,
    action: "hide" | "resolve" | "dismiss" | "restore" | "reopen",
  ) => {
    if (!isAdmin) return;
    const promptResult = window.prompt(
      `Acción: ${action} · ${report.bookTitle || "libro"}\n\nNota de resolución (opcional):`,
      report.resolutionNote || "",
    );
    if (promptResult === null) return;
    setBusyKey(`copyright:${report.id}:${action}`);
    try {
      const response = await fetch("/api/copyright-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: report.id,
          action,
          resolutionNote: promptResult.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo actualizar el reporte");
      setNotice(`Reporte de “${report.bookTitle || "libro"}” actualizado por ${payload.actor}.`);
      await load();
      onCatalogChanged?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo actualizar el reporte.");
    } finally {
      setBusyKey("");
    }
  };

  const saveUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;
    const form = new FormData(event.currentTarget);
    setBusyKey(`user:${editingUser.id}`);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingUser.id,
          name: String(form.get("name") || ""),
          email: String(form.get("email") || ""),
          description: String(form.get("description") || ""),
          role: String(form.get("role") || "reader"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo actualizar el usuario");
      setEditingUser(null);
      setNotice("Usuario actualizado.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo actualizar el usuario.");
    } finally {
      setBusyKey("");
    }
  };

  const deleteUser = async (user: ManagedUser) => {
    if (!window.confirm(`¿Eliminar definitivamente a ${user.name}? Se borrarán su sesión, préstamos, publicaciones y datos personales.`)) return;
    setBusyKey(`delete:${user.id}`);
    try {
      const response = await fetch(`/api/admin/users?id=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo eliminar el usuario");
      setNotice(`${user.name} fue eliminado de la base de datos.`);
      await load();
      onCatalogChanged?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo eliminar el usuario.");
    } finally {
      setBusyKey("");
    }
  };

  const broadcast = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusyKey("broadcast");
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") || ""),
          body: String(data.get("body") || ""),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo enviar el aviso");
      form.reset();
      setNotice("Aviso enviado a toda la comunidad.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo enviar el aviso.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <section className="page management-page">
      <div className="management-hero">
        <div>
          <p className="eyebrow">CENTRO DE GESTIÓN</p>
          <h1>{isAdmin ? "Administrar la biblioteca" : "Mesa de asesoría"}</h1>
          <p>
            Revisa registros, propuestas de libros y el historial completo de dictámenes.
            Cada decisión conserva quién la tomó.
          </p>
        </div>
        <button className="secondary" type="button" onClick={load} disabled={loading}>
          Actualizar
        </button>
      </div>

      {notice && <div className="management-notice">{notice}</div>}

      <div className="management-tabs">
        <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>
          Pendientes
          <span>{pendingRegistrations.length + pendingBooks.length}</span>
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          Historial
        </button>
        <button className={tab === "rights" ? "active" : ""} onClick={() => setTab("rights")}>
          Derechos
          <span>{rightsBooks.filter((book) => book.rightsStatus === "review").length + copyrightReports.filter((report) => report.status === "pending" || report.status === "reviewing").length}</span>
        </button>
        {isAdmin && (
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
            Usuarios
          </button>
        )}
        {isAdmin && (
          <button className={tab === "broadcast" ? "active" : ""} onClick={() => setTab("broadcast")}>
            Aviso general
          </button>
        )}
      </div>

      {loading ? (
        <p className="empty-note">Cargando centro de gestión…</p>
      ) : tab === "pending" ? (
        <div className="management-columns">
          <div className="management-column">
            <div className="management-column-title">
              <p className="eyebrow">NUEVOS USUARIOS</p>
              <h2>Registros por revisar</h2>
            </div>
            {pendingRegistrations.length === 0 ? (
              <p className="empty-note">No hay registros pendientes.</p>
            ) : (
              pendingRegistrations.map((request) => (
                <article className="request-card" key={`registration-${request.id}`}>
                  <div className="request-card-head">
                    <div>
                      <b>{request.name}</b>
                      <span>{request.email}</span>
                    </div>
                    <span className="request-status pending">Pendiente</span>
                  </div>
                  <small>
                    Solicitado {new Date(request.requestedAt).toLocaleString("es-MX")}
                  </small>
                  <div className="request-actions">
                    <button
                      className="primary"
                      disabled={Boolean(busyKey)}
                      onClick={() => decide("registration", request.id, "approved", `el registro de ${request.name}`)}
                    >
                      Aprobar
                    </button>
                    <button
                      className="secondary danger"
                      disabled={Boolean(busyKey)}
                      onClick={() => decide("registration", request.id, "rejected", `el registro de ${request.name}`)}
                    >
                      Rechazar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="management-column">
            <div className="management-column-title">
              <p className="eyebrow">NUEVOS LIBROS</p>
              <h2>Propuestas por revisar</h2>
            </div>
            {pendingBooks.length === 0 ? (
              <p className="empty-note">No hay propuestas pendientes.</p>
            ) : (
              pendingBooks.map((request) => (
                <article className="request-card book-request-card" key={`book-${request.id}`}>
                  <div className="request-card-head">
                    <div>
                      <b>{request.title}</b>
                      <span>{request.author} · {request.year}</span>
                    </div>
                    <span className="request-status pending">Pendiente</span>
                  </div>
                  <p>{request.synopsis}</p>
                  <div className="request-facts">
                    <span>{request.pages} páginas</span>
                    <span>{request.copies} ejemplar{request.copies === 1 ? "" : "es"}</span>
                    <span>{request.type}</span>
                    <span>{rightsLabel(request.rightsStatus)}</span>
                  </div>
                  <div className="request-rights-detail">
                    {request.rightsHolder && <span>Titular: {request.rightsHolder}</span>}
                    {request.rightsSourceUrl && <a href={request.rightsSourceUrl} target="_blank" rel="noreferrer">Fuente/licencia ↗</a>}
                    {request.rightsPermissionBy && <span>Permiso: {request.rightsPermissionBy}</span>}
                    {request.rightsNotes && <p>{request.rightsNotes}</p>}
                    {request.rightsEvidenceAvailable && <a href={`/api/rights/evidence?requestId=${request.id}`} target="_blank" rel="noreferrer">Ver evidencia privada ↗</a>}
                    {request.rightsStatus === "review" && <b className="rights-warning">No puede aprobarse hasta resolver los derechos.</b>}
                  </div>
                  <small>
                    Propuesto por {request.requesterName} · {request.originalName}
                  </small>
                  <div className="request-actions">
                    <button
                      className="secondary"
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => setEditingRequestRights(request)}
                    >
                      Revisar derechos
                    </button>
                    <button
                      className="primary"
                      disabled={Boolean(busyKey) || request.rightsStatus === "review"}
                      onClick={() => decide("book", request.id, "approved", `“${request.title}”`)}
                    >
                      Aprobar
                    </button>
                    <button
                      className="secondary danger"
                      disabled={Boolean(busyKey)}
                      onClick={() => decide("book", request.id, "rejected", `“${request.title}”`)}
                    >
                      Rechazar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      ) : tab === "history" ? (
        <div className="history-layout">
          <div className="history-feed">
            {history.length === 0 ? (
              <p className="empty-note">Todavía no hay dictámenes registrados.</p>
            ) : (
              history.map((record) => (
                <article className="history-card" key={record.id}>
                  <span className={`history-decision ${record.decision}`}>
                    {record.decision === "approved" ? "Aprobó" : "Rechazó"}
                  </span>
                  <div>
                    <b>{subjectForDecision(record)}</b>
                    <p>
                      <strong>{record.actorName}</strong> tomó esta decisión
                      {record.message ? `: “${record.message}”` : "."}
                    </p>
                    <small>{new Date(record.createdAt).toLocaleString("es-MX")}</small>
                  </div>
                  <div className="history-reevaluate">
                    <button
                      type="button"
                      onClick={() => {
                        const currentStatus = currentStatusForDecision(record);
                        decide(
                          record.requestType,
                          Number(record.requestId),
                          currentStatus === "approved" ? "rejected" : "approved",
                          subjectForDecision(record),
                        );
                      }}
                    >
                      Reevaluar
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      ) : tab === "rights" ? (
        <div className="rights-management-layout">
          <section className="rights-management-section">
            <div className="management-column-title">
              <p className="eyebrow">CONTROL DE DERECHOS</p>
              <h2>Materiales de la biblioteca</h2>
            </div>
            <div className="rights-books-grid">
              {rightsBooks.length === 0 ? (
                <p className="empty-note">No hay libros registrados.</p>
              ) : (
                rightsBooks.map((book) => (
                  <article className="rights-book-card" key={book.id}>
                    <div className="request-card-head">
                      <div>
                        <b>{book.title}</b>
                        <span>{book.author} · {book.year}</span>
                      </div>
                      <span className={`request-status ${book.publicationStatus === "published" ? "approved" : "pending"}`}>
                        {book.publicationStatus === "published" ? "Publicado" : "Oculto"}
                      </span>
                    </div>
                    <div className="rights-summary">
                      <b>{rightsLabel(book.rightsStatus)}</b>
                      {book.rightsHolder && <span>Titular: {book.rightsHolder}</span>}
                      {book.rightsVerifiedBy && (
                        <span>
                          Revisado por {book.rightsVerifiedBy}
                          {book.rightsVerifiedAt ? ` · ${new Date(book.rightsVerifiedAt).toLocaleDateString("es-MX")}` : ""}
                        </span>
                      )}
                    </div>
                    {book.rightsSourceUrl && (
                      <a href={book.rightsSourceUrl} target="_blank" rel="noreferrer">
                        Ver fuente o licencia ↗
                      </a>
                    )}
                    {book.rightsNotes && <p>{book.rightsNotes}</p>}
                    <div className="request-actions">
                      {book.rightsEvidenceAvailable && (
                        <a
                          className="secondary evidence-link"
                          href={`/api/rights/evidence?bookId=${book.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver evidencia
                        </a>
                      )}
                      {isAdmin && (
                        <button className="secondary" type="button" onClick={() => setEditingRights(book)}>
                          Revisar derechos
                        </button>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rights-management-section">
            <div className="management-column-title">
              <p className="eyebrow">RECLAMACIONES</p>
              <h2>Posibles problemas de derechos de autor</h2>
            </div>
            <div className="copyright-report-list">
              {copyrightReports.length === 0 ? (
                <p className="empty-note">No hay reclamaciones registradas.</p>
              ) : (
                copyrightReports.map((report) => (
                  <article className="copyright-report-card" key={report.id}>
                    <div className="request-card-head">
                      <div>
                        <b>{report.bookTitle || `Libro #${report.bookId}`}</b>
                        <span>{report.bookAuthor || "Autor no disponible"}</span>
                      </div>
                      <span className={`copyright-status ${report.status}`}>{report.status}</span>
                    </div>
                    <div className="copyright-report-meta">
                      <span>Reclamante: <b>{report.claimantName}</b> · {report.claimantEmail}</span>
                      <span>Relación: {report.relationship}</span>
                      <span>Enviado por: {report.reporterName} · {report.reporterEmail}</span>
                      <span>{new Date(report.createdAt).toLocaleString("es-MX")}</span>
                    </div>
                    <p>{report.details}</p>
                    {report.evidenceUrl && (
                      <a href={report.evidenceUrl} target="_blank" rel="noreferrer">Ver evidencia externa ↗</a>
                    )}
                    {report.resolutionNote && (
                      <div className="copyright-resolution">
                        <b>Última resolución</b>
                        <span>{report.resolutionNote}</span>
                        {report.resolvedBy && <small>Por {report.resolvedBy}</small>}
                      </div>
                    )}
                    {isAdmin && (
                      <div className="request-actions copyright-actions">
                        <button className="secondary danger" type="button" disabled={Boolean(busyKey)} onClick={() => actOnCopyrightReport(report, "hide")}>Ocultar libro</button>
                        <button className="secondary" type="button" disabled={Boolean(busyKey)} onClick={() => actOnCopyrightReport(report, "resolve")}>Marcar resuelto</button>
                        <button className="secondary" type="button" disabled={Boolean(busyKey)} onClick={() => actOnCopyrightReport(report, "restore")}>Restaurar libro</button>
                        <button className="secondary" type="button" disabled={Boolean(busyKey)} onClick={() => actOnCopyrightReport(report, "dismiss")}>Descartar reporte</button>
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : tab === "users" && isAdmin ? (
        <div className="users-admin-list">
          {users.map((user) => (
            <article className="managed-user-card" key={user.id}>
              <div className="managed-user-main">
                <div>
                  <b>{user.name}</b>
                  <span>{user.email}</span>
                </div>
                <div className="managed-user-badges">
                  <span>{roleLabel(user.role)}</span>
                  <span className={`request-status ${user.approvalStatus}`}>
                    {statusLabel(user.approvalStatus)}
                  </span>
                  <span className={`email-verification-badge ${user.emailVerified ? "verified" : "unverified"}`}>
                    {user.emailVerified ? "Correo verificado" : "Correo sin verificar"}
                  </span>
                </div>
              </div>
              <p>{user.pagesRead.toLocaleString("es-MX")} páginas leídas</p>
              <div className="request-actions">
                <button className="secondary" type="button" onClick={() => setEditingUser(user)}>
                  Editar
                </button>
                <button
                  className="secondary danger"
                  type="button"
                  disabled={user.id === currentUserId || Boolean(busyKey)}
                  onClick={() => deleteUser(user)}
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : tab === "broadcast" && isAdmin ? (
        <form className="broadcast-form" onSubmit={broadcast}>
          <p className="eyebrow">AVISO A TODA LA COMUNIDAD</p>
          <h2>Enviar una notificación general</h2>
          <p>Este mensaje aparecerá en el apartado de notificaciones de todos los usuarios.</p>
          <label>
            Título
            <input name="title" required maxLength={120} placeholder="Ej. Jornada de mantenimiento" />
          </label>
          <label>
            Mensaje
            <textarea name="body" required maxLength={1200} placeholder="Escribe el aviso…" />
          </label>
          <button className="primary" disabled={busyKey === "broadcast"}>
            {busyKey === "broadcast" ? "Enviando…" : "Enviar a todos"}
          </button>
        </form>
      ) : null}

      {editingRequestRights && (
        <div className="modal-back" onClick={() => setEditingRequestRights(null)}>
          <form className="profile-modal rights-admin-modal" onSubmit={saveRequestRights} onClick={(event) => event.stopPropagation()}>
            <button className="close" type="button" onClick={() => setEditingRequestRights(null)}>×</button>
            <p className="eyebrow">REVISAR PROPUESTA</p>
            <h2>{editingRequestRights.title}</h2>
            <p className="rights-modal-subtitle">
              Propuesta de {editingRequestRights.requesterName} · {editingRequestRights.author}
            </p>
            <label>
              Situación
              <select name="rightsStatus" defaultValue={editingRequestRights.rightsStatus || "review"}>
                {RIGHTS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Titular o responsable
              <input name="rightsHolder" maxLength={180} defaultValue={editingRequestRights.rightsHolder || ""} placeholder="Autor, editorial, institución…" />
            </label>
            <label>
              Fuente o licencia
              <input name="rightsSourceUrl" type="url" maxLength={1000} defaultValue={editingRequestRights.rightsSourceUrl || ""} placeholder="https://…" />
            </label>
            <label>
              Quién concedió el permiso
              <input name="rightsPermissionBy" maxLength={180} defaultValue={editingRequestRights.rightsPermissionBy || ""} placeholder="Nombre y cargo, si aplica" />
            </label>
            <label>
              Notas de derechos
              <textarea name="rightsNotes" maxLength={2000} defaultValue={editingRequestRights.rightsNotes || ""} placeholder="Licencia, fecha, alcance del permiso, fundamento de dominio público…" />
            </label>
            {editingRequestRights.rightsEvidenceAvailable && (
              <a className="evidence-link rights-modal-evidence" href={`/api/rights/evidence?requestId=${editingRequestRights.id}`} target="_blank" rel="noreferrer">
                Abrir evidencia privada ↗
              </a>
            )}
            <small className="rights-modal-help">
              Si queda “Situación por revisar”, la propuesta no podrá aprobarse. Esta revisión no cambia por sí sola el dictamen de la solicitud.
            </small>
            <button className="primary wide" disabled={Boolean(busyKey)}>
              {busyKey.startsWith("request-rights:") ? "Guardando…" : "Guardar revisión"}
            </button>
          </form>
        </div>
      )}

      {editingRights && isAdmin && (
        <div className="modal-back" onClick={() => setEditingRights(null)}>
          <form className="profile-modal rights-admin-modal" onSubmit={saveRights} onClick={(event) => event.stopPropagation()}>
            <button className="close" type="button" onClick={() => setEditingRights(null)}>×</button>
            <p className="eyebrow">REVISAR DERECHOS</p>
            <h2>{editingRights.title}</h2>
            <p className="rights-modal-subtitle">{editingRights.author} · {editingRights.year}</p>
            <label>
              Situación
              <select name="rightsStatus" defaultValue={editingRights.rightsStatus}>
                {RIGHTS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Titular o responsable
              <input name="rightsHolder" maxLength={180} defaultValue={editingRights.rightsHolder || ""} placeholder="Autor, editorial, institución…" />
            </label>
            <label>
              Fuente o licencia
              <input name="rightsSourceUrl" type="url" maxLength={1000} defaultValue={editingRights.rightsSourceUrl || ""} placeholder="https://…" />
            </label>
            <label>
              Quién concedió el permiso
              <input name="rightsPermissionBy" maxLength={180} defaultValue={editingRights.rightsPermissionBy || ""} placeholder="Nombre y cargo, si aplica" />
            </label>
            <label>
              Notas de derechos
              <textarea name="rightsNotes" maxLength={2000} defaultValue={editingRights.rightsNotes || ""} placeholder="Licencia, fecha, alcance del permiso, fundamento de dominio público…" />
            </label>
            {editingRights.rightsEvidenceAvailable && (
              <a className="evidence-link rights-modal-evidence" href={`/api/rights/evidence?bookId=${editingRights.id}`} target="_blank" rel="noreferrer">
                Abrir evidencia privada ↗
              </a>
            )}
            <label className="rights-publish-check">
              <input type="checkbox" name="publish" defaultChecked={editingRights.publicationStatus === "published"} />
              <span>Publicar el libro si la situación de derechos permite hacerlo</span>
            </label>
            <small className="rights-modal-help">Si eliges “Situación por revisar”, el servidor mantendrá el libro oculto aunque marques publicar.</small>
            <button className="primary wide" disabled={Boolean(busyKey)}>
              {busyKey.startsWith("rights:") ? "Guardando…" : "Guardar revisión"}
            </button>
          </form>
        </div>
      )}

      {editingUser && isAdmin && (
        <div className="modal-back" onClick={() => setEditingUser(null)}>
          <form className="profile-modal user-admin-modal" onSubmit={saveUser} onClick={(event) => event.stopPropagation()}>
            <button className="close" type="button" onClick={() => setEditingUser(null)}>×</button>
            <p className="eyebrow">GESTIONAR USUARIO</p>
            <h2>{editingUser.name}</h2>
            <label>
              Nombre
              <input name="name" required maxLength={80} defaultValue={editingUser.name} />
            </label>
            <label>
              Correo
              <input name="email" type="email" required maxLength={254} defaultValue={editingUser.email} />
            </label>
            <label>
              Rol
              <select name="role" defaultValue={editingUser.role}>
                <option value="reader">Lector</option>
                <option value="advisor">Asesor</option>
                <option value="admin">Administrador</option>
              </select>
              <small>Los asesores pueden dictaminar registros y libros, pero no editar ni eliminar usuarios o libros.</small>
            </label>
            <label>
              Sobre mí
              <textarea name="description" maxLength={320} defaultValue={editingUser.description || ""} />
            </label>
            <div className="stats">
              <span><b>{editingUser.pagesRead.toLocaleString("es-MX")}</b> páginas leídas</span>
              <span><b>{statusLabel(editingUser.approvalStatus)}</b> estado</span>
            </div>
            <button className="primary wide" disabled={Boolean(busyKey)}>
              Guardar usuario
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
