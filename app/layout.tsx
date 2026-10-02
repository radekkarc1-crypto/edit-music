import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "EDIT MUSIC", description: "Create. Edit. Share." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pl"><body>{children}</body></html>}