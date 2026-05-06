import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = {
  title: 'PMO-IA Studio',
  description: 'Le copilote IA des Chefs de Projet — PMBOK 7',
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>
}
