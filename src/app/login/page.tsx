"use client";

import { LogisticsArt } from "@/components/LogisticsArt";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <main className="flex flex-col justify-center px-6 py-12 sm:px-14">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-2 text-xl font-bold tracking-tight text-navy-900">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-500" />
            CotaFlow
          </div>
          <h1 className="mt-10 text-3xl font-semibold tracking-tight text-navy-900">
            Bem-vindo de volta
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Entre para continuar cotando.
          </p>
          <LoginForm />
        </div>
      </main>

      <aside className="relative hidden overflow-hidden bg-navy-100 lg:block">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(#91a1ca 1.2px, transparent 1.2px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="absolute -right-20 top-10 h-80 w-80 rounded-full bg-brand-300/40 blur-3xl" />

        <div className="relative flex h-full flex-col justify-center p-14">
          <h2 className="max-w-md text-4xl font-semibold leading-tight tracking-tight text-navy-900">
            Frete bem cotado, carga em movimento.
          </h2>
          <p className="mt-4 max-w-md text-base text-navy-600">
            Planeje rotas, organize cargas e mantenha a operação em movimento,
            da coleta ao destino final.
          </p>
        </div>

        <LogisticsArt className="pointer-events-none absolute bottom-0 right-0 w-full max-w-2xl text-navy-900" />
      </aside>
    </div>
  );
}
