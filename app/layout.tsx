import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={metadataBase:new URL("https://biblioteca-viva.super-degu-9654.chatgpt.site"),title:"Biblioteca viva",description:"Una biblioteca comunitaria donde cada libro se presta, se conversa y deja una huella.",icons:{icon:"/favicon.svg"},openGraph:{title:"Biblioteca viva",description:"Leer también es encontrarnos",images:["/og.png"]},twitter:{card:"summary_large_image",title:"Biblioteca viva",description:"Leer también es encontrarnos",images:["/og.png"]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
