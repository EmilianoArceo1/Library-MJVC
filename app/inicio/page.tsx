import type { Metadata } from "next";
import Link from "next/link";
import BookLogo from "../components/BookLogo";

export const metadata: Metadata = {
  title: "Biblioteca Jornadas",
  description:
    "Biblioteca digital de Jornadas de Vida Cristiana Mérida para préstamo, lectura, comunidad y gestión de libros.",
  alternates: {
    canonical: "https://biblioteca.jornadasmerida.com/inicio",
  },
};

export default function PublicHomepage() {
  return (
    <main className="oauth-homepage">
      <header className="oauth-homepage-header">
        <div className="oauth-homepage-brand">
          <BookLogo className="oauth-homepage-mark"/>
          <div>
            <strong>Biblioteca Jornadas</strong>
            <span>Jornadas de Vida Cristiana Mérida</span>
          </div>
        </div>
        <Link href="/" className="oauth-homepage-enter">
          Entrar a la biblioteca
        </Link>
      </header>

      <section className="oauth-homepage-hero">
        <p className="eyebrow">BIBLIOTECA DIGITAL</p>
        <h1>Biblioteca Jornadas</h1>
        <p>
          Biblioteca Jornadas es la plataforma digital de Jornadas de Vida
          Cristiana Mérida para organizar la colección, solicitar préstamos,
          leer libros en línea, compartir reflexiones y gestionar propuestas de
          nuevos materiales.
        </p>
        <div className="oauth-homepage-actions">
          <Link href="/" className="primary">
            Abrir Biblioteca Jornadas
          </Link>
          <Link href="/privacidad" className="secondary">
            Política de privacidad
          </Link>
        </div>
      </section>

      <section className="oauth-homepage-grid" aria-label="Funciones principales">
        <article>
          <span>01</span>
          <h2>Préstamo y lectura</h2>
          <p>
            Los usuarios aprobados pueden tomar libros disponibles, continuar su
            lectura y conservar su progreso dentro de la plataforma.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Comunidad</h2>
          <p>
            La biblioteca incluye perfiles de lectores, estadísticas,
            reflexiones, preguntas, respuestas y conversaciones alrededor de los
            libros.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>Moderación</h2>
          <p>
            Administradores y asesores revisan solicitudes de registro y
            propuestas de libros, conservando un historial de sus decisiones.
          </p>
        </article>
      </section>

      <section className="oauth-homepage-google">
        <div>
          <p className="eyebrow">USO DE GOOGLE</p>
          <h2>¿Por qué Biblioteca Jornadas solicita acceso a Gmail?</h2>
        </div>
        <p>
          La aplicación utiliza la Gmail API exclusivamente con la cuenta
          institucional <strong>biblioteca.jornadas@gmail.com</strong> para
          enviar correos transaccionales, como enlaces de verificación de correo.
          Biblioteca Jornadas no solicita acceso a la bandeja de entrada, correos
          o contactos de sus lectores.
        </p>
      </section>

      <footer className="oauth-homepage-footer">
        <div>
          <strong>Biblioteca Jornadas</strong>
          <span>biblioteca.jornadas@gmail.com</span>
        </div>
        <nav>
          <Link href="/privacidad">Política de privacidad</Link>
          <Link href="/terminos">Términos de uso</Link>
          <a href="mailto:biblioteca.jornadas@gmail.com">Contacto</a>
        </nav>
      </footer>
    </main>
  );
}
