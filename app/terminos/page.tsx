import type { Metadata } from "next";
import Link from "next/link";
import BookLogo from "../components/BookLogo";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
  title: "Términos de uso | Biblioteca Jornadas",
  description:
    "Términos de uso de la Biblioteca virtual de Jornadas de Vida Cristiana Mérida.",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link className="legal-brand" href="/">
          <BookLogo/>
          <span>
            <b>Biblioteca Jornadas</b>
            <small>MJVC Mérida</small>
          </span>
        </Link>
        <Link className="legal-back" href="/">Volver a la biblioteca</Link>
      </header>

      <article className="legal-document">
        <p className="eyebrow">CONDICIONES DEL SERVICIO</p>
        <h1>Términos de uso</h1>
        <p className="legal-updated">Última actualización: 23 de septiembre de 2026</p>

        <p className="legal-lead">
          Estos términos regulan el uso de Biblioteca Jornadas. Al crear o utilizar
          una cuenta aceptas usar la plataforma de forma responsable y de acuerdo
          con su finalidad comunitaria y formativa.
        </p>

        <section>
          <h2>1. Finalidad de la plataforma</h2>
          <p>
            Biblioteca Jornadas es una herramienta digital para organizar,
            compartir, prestar y leer materiales dentro de la comunidad de
            Jornadas de Vida Cristiana Mérida, así como facilitar conversaciones
            y actividades relacionadas con la lectura.
          </p>
        </section>

        <section>
          <h2>2. Cuentas y aprobación</h2>
          <p>
            Para utilizar funciones restringidas es necesario crear una cuenta,
            verificar el correo electrónico y, cuando corresponda, recibir la
            aprobación de una persona administradora o asesora autorizada.
          </p>
          <p>
            Cada usuario es responsable de proporcionar información correcta,
            mantener la confidencialidad de su contraseña y no prestar su cuenta a
            terceros.
          </p>
        </section>

        <section>
          <h2>3. Roles y permisos</h2>
          <p>
            La plataforma puede distinguir entre lectores, asesores y
            administradores. Cada rol cuenta con permisos distintos. Los
            administradores pueden gestionar usuarios y libros; los asesores pueden
            revisar solicitudes y propuestas de libros dentro de las atribuciones
            que la plataforma les concede.
          </p>
        </section>

        <section>
          <h2>4. Uso responsable</h2>
          <p>No está permitido:</p>
          <ul>
            <li>Usar la plataforma para acosar, insultar o perjudicar a otras personas.</li>
            <li>Intentar acceder a cuentas, datos o funciones sin autorización.</li>
            <li>Manipular estadísticas, préstamos, aprobaciones o sistemas de seguridad.</li>
            <li>Subir archivos maliciosos o contenido diseñado para afectar el servicio.</li>
            <li>
              Publicar información personal de terceros sin autorización o contenido
              que infrinja derechos ajenos.
            </li>
          </ul>
        </section>

        <section>
          <h2>5. Libros, fuentes externas y materiales enviados</h2>
          <p>
            Quien proponga o suba un material debe proporcionar información
            razonable sobre su situación de derechos. La administración puede
            aprobar, rechazar, reevaluar, ocultar o cambiar la modalidad de acceso
            de un material.
          </p>
          <p>
            Las obras clasificadas como “Derechos reservados” pueden aparecer
            únicamente como ficha bibliográfica con un enlace hacia una fuente
            externa para su lectura. Si una copia interna existe, solo una persona
            administradora puede habilitar expresamente ese acceso. La presencia
            de un libro en la plataforma no implica que Biblioteca Jornadas
            reclame propiedad intelectual ni que su clasificación constituya una
            autorización del titular.
          </p>
        </section>

        <section>
          <h2>6. Contenido de los usuarios</h2>
          <p>
            Los usuarios conservan la responsabilidad sobre lo que publican,
            incluyendo reflexiones, preguntas, respuestas y propuestas. Al
            publicarlo autorizan su visualización dentro de la comunidad y su
            almacenamiento mientras sea necesario para operar esas funciones.
          </p>
        </section>

        <section>
          <h2>7. Moderación, inspección y devoluciones</h2>
          <p>
            Administradores y asesores pueden revisar solicitudes de registro y
            propuestas de libros. Las decisiones pueden reevaluarse y el sistema
            conserva un historial de quién emitió cada dictamen para dar
            trazabilidad al proceso.
          </p>
          <p>
            Administradores y asesores pueden inspeccionar un libro sin crear un
            préstamo ni generar estadísticas de lectura. Cualquier lector puede
            devolver anticipadamente un préstamo sin responder preguntas ni
            calificarlo; en ese caso, el progreso de ese préstamo no se incluye
            en las páginas leídas.
          </p>
          <p>
            La administración puede restringir o eliminar cuentas o contenido
            cuando sea necesario para proteger la comunidad, cumplir estos términos
            o mantener la integridad de la plataforma.
          </p>
        </section>

        <section>
          <h2>8. Disponibilidad del servicio</h2>
          <p>
            La biblioteca se ofrece como una herramienta comunitaria. Puede recibir
            mantenimiento, cambios, interrupciones o modificaciones de funciones.
            No se garantiza disponibilidad permanente ni ausencia total de errores.
          </p>
        </section>

        <section>
          <h2>9. Privacidad</h2>
          <p>
            El tratamiento de datos personales se explica en nuestra{" "}
            <Link href="/privacidad">Política de privacidad</Link>, que forma parte
            de estas condiciones.
          </p>
        </section>

        <section>
          <h2>10. Cambios</h2>
          <p>
            Estos términos pueden actualizarse conforme evolucione la biblioteca.
            La versión vigente estará publicada en esta página.
          </p>
        </section>

        <section>
          <h2>11. Contacto</h2>
          <p>
            Para dudas sobre estos términos o sobre la operación de la biblioteca,
            escribe a{" "}
            <a href="mailto:biblioteca.jornadas@gmail.com">
              biblioteca.jornadas@gmail.com
            </a>.
          </p>
        </section>

        <nav className="legal-links">
          <Link href="/privacidad">Política de privacidad</Link>
          <Link href="/derechos-de-autor">Derechos de autor</Link>
          <Link href="/">Biblioteca</Link>
        </nav>
      </article>
    </main>
  );
}
