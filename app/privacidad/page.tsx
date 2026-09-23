import type { Metadata } from "next";
import Link from "next/link";
import BookLogo from "../components/BookLogo";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
  title: "Política de privacidad | Biblioteca Jornadas",
  description:
    "Política de privacidad de la Biblioteca virtual de Jornadas de Vida Cristiana Mérida.",
};

export default function PrivacyPage() {
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
        <p className="eyebrow">PRIVACIDAD</p>
        <h1>Política de privacidad</h1>
        <p className="legal-updated">Última actualización: 22 de septiembre de 2026</p>

        <p className="legal-lead">
          Esta política explica qué información trata la Biblioteca virtual de
          Jornadas de Vida Cristiana Mérida, para qué la utiliza y qué controles
          tienen sus usuarios.
        </p>

        <section>
          <h2>1. Responsable y contacto</h2>
          <p>
            La aplicación se identifica como <strong>Biblioteca Jornadas</strong> y
            es una herramienta digital de apoyo para la comunidad de Jornadas de
            Vida Cristiana Mérida.
          </p>
          <p>
            Para dudas de privacidad, acceso o eliminación de información puedes
            escribir a{" "}
            <a href="mailto:biblioteca.jornadas@gmail.com">
              biblioteca.jornadas@gmail.com
            </a>.
          </p>
        </section>

        <section>
          <h2>2. Información que recopilamos</h2>
          <p>Según las funciones que utilices, podemos tratar:</p>
          <ul>
            <li>
              Datos de cuenta: nombre, correo electrónico, estado de verificación,
              rol y estado de aprobación.
            </li>
            <li>
              Datos de perfil: descripción, fotografía y preferencias de
              apariencia.
            </li>
            <li>
              Datos de uso de la biblioteca: préstamos, progreso de lectura,
              calificaciones, páginas leídas y devoluciones.
            </li>
            <li>
              Contenido comunitario: publicaciones, respuestas, preguntas,
              reacciones y mensajes enviados dentro de la plataforma.
            </li>
            <li>
              Solicitudes y moderación: propuestas de libros, solicitudes de
              registro, dictámenes, historial de decisiones y nombre de la persona
              administradora o asesora que tomó cada decisión.
            </li>
            <li>
              Derechos de autor: situación declarada de cada obra, titular o
              responsable, fuentes o licencias, notas, evidencia privada de
              autorización y reclamaciones de retirada cuando existan.
            </li>
            <li>
              Datos técnicos necesarios para la sesión y seguridad, como
              identificadores de sesión y tokens temporales.
            </li>
          </ul>
          <p>
            Las contraseñas no se almacenan en texto legible. Se almacenan
            derivados criptográficos necesarios para autenticar la cuenta.
          </p>
        </section>

        <section>
          <h2>3. Para qué usamos la información</h2>
          <ul>
            <li>Crear, verificar y administrar cuentas.</li>
            <li>Gestionar préstamos, lecturas y estadísticas personales.</li>
            <li>Permitir la participación en el foro y la comunidad.</li>
            <li>
              Revisar solicitudes de registro y propuestas de libros mediante
              administradores y asesores autorizados.
            </li>
            <li>
              Enviar notificaciones relacionadas con la cuenta y avisos generales
              de la biblioteca.
            </li>
            <li>
              Revisar la base de uso de los materiales, gestionar reclamaciones de
              derechos de autor y documentar decisiones de publicación o retirada.
            </li>
            <li>Proteger la plataforma, prevenir abuso y mantener su operación.</li>
          </ul>
        </section>

        <section>
          <h2>4. Verificación de correo</h2>
          <p>
            Antes de que una solicitud de registro sea enviada a administración,
            verificamos que la persona tenga acceso al correo proporcionado. Para
            ello enviamos un enlace temporal de verificación. Hasta que ese enlace
            se confirma, la solicitud no entra a la cola de aprobación.
          </p>
        </section>

        <section>
          <h2>5. Uso de Google y Gmail API</h2>
          <p>
            Biblioteca Jornadas utiliza la Gmail API únicamente para enviar
            correos transaccionales desde la cuenta institucional de la biblioteca,
            por ejemplo enlaces de verificación de correo. La aplicación no solicita
            acceso al Gmail de los lectores, no lee sus mensajes, no consulta sus
            contactos y no accede a sus bandejas de entrada.
          </p>
          <p>
            Las credenciales de Google utilizadas por la aplicación corresponden
            exclusivamente a la cuenta institucional remitente. La información
            obtenida mediante las APIs de Google no se utiliza con fines
            publicitarios ni se vende a terceros.
          </p>
          <p>
            El uso de información recibida de las APIs de Google se limita a las
            funciones descritas en esta política y se realiza de acuerdo con las
            políticas aplicables de Google API Services y sus requisitos de uso
            limitado.
          </p>
        </section>

        <section>
          <h2>6. Servicios e infraestructura</h2>
          <p>
            La aplicación utiliza servicios de infraestructura en la nube para
            operar la biblioteca, almacenar datos de cuentas, libros, archivos y
            sesiones, y entregar el sitio a los usuarios. Estos proveedores
            procesan información únicamente en la medida necesaria para prestar
            esos servicios técnicos.
          </p>
        </section>

        <section>
          <h2>7. Visibilidad dentro de la comunidad</h2>
          <p>
            Algunos datos son visibles para otros usuarios, como nombre, foto,
            páginas leídas, lectura activa, publicaciones, preguntas, respuestas y
            reacciones. Las decisiones privadas de registro o de propuestas de
            libros se muestran únicamente a las personas autorizadas y al usuario
            afectado cuando corresponda. La evidencia privada de derechos y los
            datos de reclamaciones se limitan a las personas con permisos de revisión.
          </p>
        </section>

        <section>
          <h2>8. Conservación y eliminación</h2>
          <p>
            Conservamos la información mientras la cuenta siga activa o mientras
            sea necesaria para operar la biblioteca, mantener registros de
            moderación, seguridad y consistencia de préstamos. Un administrador
            puede eliminar una cuenta y sus datos asociados desde las herramientas
            de gestión, sujeto a la conservación mínima necesaria de registros
            administrativos o de seguridad.
          </p>
          <p>
            También puedes solicitar revisión o eliminación de tus datos escribiendo
            al correo de contacto indicado en esta política.
          </p>
        </section>

        <section>
          <h2>9. Seguridad</h2>
          <p>
            Aplicamos controles razonables como sesiones protegidas, contraseñas
            derivadas criptográficamente, permisos por rol, verificación de correo
            y tokens temporales. Ningún sistema conectado a Internet puede
            garantizar seguridad absoluta.
          </p>
        </section>

        <section>
          <h2>10. Cambios a esta política</h2>
          <p>
            Esta política puede actualizarse cuando cambien las funciones de la
            biblioteca o la forma en que se tratan los datos. La versión vigente
            estará siempre publicada en esta dirección.
          </p>
        </section>

        <div className="legal-callout">
          <b>Contacto de privacidad</b>
          <a href="mailto:biblioteca.jornadas@gmail.com">
            biblioteca.jornadas@gmail.com
          </a>
        </div>

        <nav className="legal-links">
          <Link href="/terminos">Términos de uso</Link>
          <Link href="/derechos-de-autor">Derechos de autor</Link>
          <Link href="/">Biblioteca</Link>
        </nav>
      </article>
    </main>
  );
}
