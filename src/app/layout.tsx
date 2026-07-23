import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CotaFlow",
  description: "Plataforma de cotação de frete rodoviário",
};

const NAV_LINKS = [
  { href: "/quotes", label: "Cotações" },
  { href: "/clients", label: "Clientes" },
  { href: "/vehicles", label: "Veículos" },
  { href: "/antt-coefficients", label: "ANTT" },
  { href: "/addresses", label: "Endereços" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-navy-50 text-navy-900">
        <header className="bg-navy-900">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-bold tracking-tight text-white"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-brand-500" />
              CotaFlow
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-navy-200">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="transition-colors hover:text-brand-400"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
