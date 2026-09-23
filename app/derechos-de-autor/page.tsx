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
        <p className="legal-updated">Última actualización: 22 de septiembre de 2026</p>

        <p className="legal-lead">
          Biblioteca Jornadas busca alojar únicamente obras propias, materiales
          de dominio público, contenidos con licencia compatible, fuentes
          oficiales que autoricen la reproducción o materiales para los que
          exista permiso suficiente del titular.
        </p>

        <section>
          <h2>1. Revisión previa</h2>
          <p>
            Cada libro debe registrar su situación de derechos antes de
            publicarse. Los materiales marcados como “Situación por revisar” se
            mantienen ocultos y no pueden aprobarse para lectura hasta que una
            persona administradora o asesora revise la información disponible.
            La categoría “Derechos reservados” identifica una obra protegida y,
            por sí sola, no constituye autorización para reproducirla o ponerla
            a disposición; para publicarla debe registrarse una base de uso
            suficiente, como permiso del titular.
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
          <h2>6. Acceso técnico al contenido</h2>
          <p>
            Los archivos de lectura no se publican mediante enlaces directos del
            almacenamiento. Se entregan mediante la aplicación únicamente a
            usuarios autorizados y, salvo accesos administrativos, requieren un
            préstamo activo. Las respuestas de contenido se sirven con
            instrucciones técnicas de no indexación y sin caché pública.
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
