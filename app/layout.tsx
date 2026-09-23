import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={metadataBase:new URL("https://biblioteca.jornadasmerida.com"),title:"Biblioteca Jornadas",description:"Consulta, préstamo y lectura de la colección de MJVC Mérida.",icons:{icon:"/favicon.svg"},openGraph:{title:"Biblioteca Jornadas",description:"Colección, préstamo y lectura en un solo lugar",images:["/og.png"]},twitter:{card:"summary_large_image",title:"Biblioteca Jornadas",description:"Colección, préstamo y lectura en un solo lugar",images:["/og.png"]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
