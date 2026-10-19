import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { RoleRedirect } from "@/components/RoleRedirect";
import { AuthProvider } from "@/lib/auth";
import { FeedbackProvider } from "@/components/Feedback";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CotaFlow",
  description: "Plataforma de cotação de frete rodoviário",
  appleWebApp: { capable: true, title: "CotaFlow", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#181848" };

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
        <RegisterServiceWorker />
        <FeedbackProvider>
          <AuthProvider>
            <SiteHeader />
            <RoleRedirect />
            <main className="flex flex-1 flex-col">{children}</main>
          </AuthProvider>
        </FeedbackProvider>
      </body>
    </html>
  );
}
