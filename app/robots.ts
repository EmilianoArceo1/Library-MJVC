import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/inicio", "/privacidad", "/terminos", "/derechos-de-autor", "/favicon.svg"],
        disallow: ["/api/", "/lector", "/gestion", "/notificaciones"],
      },
    ],
    host: "https://biblioteca.jornadasmerida.com",
  };
}
