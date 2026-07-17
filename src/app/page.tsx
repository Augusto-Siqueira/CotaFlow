import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-navy-900">
          CotaFlow
        </h1>
        <p className="mt-3 text-base text-navy-600">
          Plataforma de cotação de frete rodoviário.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Link
            href="/quotes/new"
            className="flex flex-col items-start gap-1 rounded-xl border border-brand-200 bg-brand-50 p-6 text-left shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-100"
          >
            <span className="text-base font-medium text-brand-900">
              Nova cotação
            </span>
            <span className="text-sm text-brand-700">
              Calcule Gross / Net / Full
            </span>
          </Link>
          <Link
            href="/clients"
            className="flex flex-col items-start gap-1 rounded-xl border border-navy-200 bg-white p-6 text-left shadow-sm transition-colors hover:border-navy-300 hover:bg-navy-50"
          >
            <span className="text-base font-medium text-navy-900">
              Clientes
            </span>
            <span className="text-sm text-navy-500">
              Cadastro e listagem de clientes
            </span>
          </Link>
          <Link
            href="/vehicles"
            className="flex flex-col items-start gap-1 rounded-xl border border-navy-200 bg-white p-6 text-left shadow-sm transition-colors hover:border-navy-300 hover:bg-navy-50"
          >
            <span className="text-base font-medium text-navy-900">
              Veículos
            </span>
            <span className="text-sm text-navy-500">
              Cadastro de tipos de veículo
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
