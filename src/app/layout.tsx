import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { AuthProvider } from "@/lib/auth";
import { FeedbackProvider } from "@/components/Feedback";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CotaFlow",
  description: "Plataforma de cotação de frete rodoviário",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakartaSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-navy-50 text-navy-900">
        <FeedbackProvider>
          <AuthProvider>
            <SiteHeader />
            <main className="flex flex-1 flex-col">{children}</main>
          </AuthProvider>
        </FeedbackProvider>
      </body>
    </html>
  );
}
