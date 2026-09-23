import type { Metadata } from "next";
import Link from "next/link";
import BookLogo from "../components/BookLogo";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
  title: "Derechos de autor | Biblioteca Jornadas",
  description:
    "Política de recepción, revisión y retirada de materiales por cuestiones de derechos de autor en Biblioteca Jornadas.",
};

export default function CopyrightPage() {
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
        <p className="eyebrow">DERECHOS DE AUTOR</p>
        <h1>Política de materiales y retirada</h1>
        <p className="legal-updated">Última actualización: 23 de septiembre de 2026</p>

        <p className="legal-lead">
          Biblioteca Jornadas distingue entre materiales que pueden leerse dentro
          de la plataforma y obras con derechos reservados que se muestran como
          referencia bibliográfica y remiten a una fuente externa para su lectura.
          La clasificación interna no sustituye una autorización del titular.
        </p>

        <section>
          <h2>1. Revisión previa y obras con derechos reservados</h2>
          <p>
            Cada libro debe registrar su situación de derechos antes de
            publicarse. Los materiales marcados como “Situación por revisar” se
            mantienen ocultos hasta que una persona administradora o asesora
            revise la información disponible.
          </p>
          <p>
            Cuando una obra se clasifica como “Derechos reservados”, la modalidad
            ordinaria consiste en mostrar su ficha en el estante y dirigir al
            usuario mediante un enlace hacia una fuente externa legítima donde
            pueda consultarla. Esa modalidad no aloja ni entrega la obra desde la
            biblioteca y no suma páginas leídas.
          </p>
          <p>
            Si existe una copia interna, únicamente una persona administradora
            puede habilitar expresamente su lectura dentro de Biblioteca Jornadas.
            Esa decisión queda separada de la clasificación de derechos y no
            significa que la plataforma declare que existe autorización jurídica.
            Las lecturas internas de obras con derechos reservados tampoco suman
            páginas a las estadísticas.
          </p>
        </section>

        <section>
          <h2>2. Evidencia y trazabilidad</h2>
          <p>
            La plataforma puede conservar, de forma privada, datos como titular,
            fuente, licencia, persona que concedió permiso, notas y evidencia
            documental. Esa información se utiliza para tomar decisiones de
            publicación y no se expone como archivo público.
          </p>
        </section>

        <section>
          <h2>3. Reclamaciones</h2>
          <p>
            Si consideras que un material alojado infringe derechos tuyos o de
            una persona a la que representas, puedes utilizar el botón
            “Reportar problema de derechos” en la ficha del libro o escribir a{" "}
            <a href="mailto:biblioteca.jornadas@gmail.com">
              biblioteca.jornadas@gmail.com
            </a>.
          </p>
          <p>
            Para poder revisar la reclamación, incluye el título afectado, tu
            nombre y correo, la relación que tienes con la obra, una explicación
            concreta y, cuando exista, una fuente o evidencia que permita
            comprobar la titularidad o autorización.
          </p>
        </section>

        <section>
          <h2>4. Retirada preventiva</h2>
          <p>
            La administración puede ocultar inmediatamente un material mientras
            se revisa una reclamación. Durante ese periodo el contenido deja de
            estar disponible para nuevos préstamos y no se entrega a buscadores.
          </p>
        </section>

        <section>
          <h2>5. Resolución</h2>
          <p>
            Tras revisar la información, la administración puede mantener el
            material oculto, restaurarlo si existe base suficiente para su uso,
            solicitar información adicional o retirarlo de forma definitiva.
            Las decisiones internas quedan registradas para mantener
            trazabilidad.
          </p>
        </section>

        <section>
          <h2>6. Acceso técnico, inspección y lectura externa</h2>
          <p>
            Los archivos de lectura interna no se publican mediante enlaces
            directos del almacenamiento. Se entregan mediante la aplicación a
            usuarios autorizados y, en el uso ordinario, requieren un préstamo
            activo. Las respuestas de contenido se sirven con instrucciones
            técnicas de no indexación y sin caché pública.
          </p>
          <p>
            Administradores y asesores pueden usar un modo de inspección que no
            crea un préstamo, no registra progreso, no solicita preguntas ni
            calificación y no suma páginas leídas. En las obras con derechos
            reservados cuya modalidad sea externa, la aplicación abre la fuente
            indicada en lugar de entregar una copia interna.
          </p>
        </section>

        <div className="legal-callout">
          <b>Contacto para derechos de autor</b>
          <a href="mailto:biblioteca.jornadas@gmail.com">
            biblioteca.jornadas@gmail.com
          </a>
        </div>

        <nav className="legal-links">
          <Link href="/privacidad">Política de privacidad</Link>
          <Link href="/terminos">Términos de uso</Link>
          <Link href="/">Biblioteca</Link>
        </nav>
      </article>
    </main>
  );
}
