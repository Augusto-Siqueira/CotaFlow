import Link from "next/link";
import { APP_VERSION, CHANGELOG } from "@/lib/version";

export const metadata = { title: "Versões — CotaFlow" };

export default function VersionPage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <Link href="/" className="text-sm text-navy-500 hover:text-navy-700">
        ← Início
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-900">
        Versões do sistema
      </h1>
      <p className="mt-1 text-sm text-navy-500">
        Versão atual: <span className="font-medium text-navy-800">{APP_VERSION}</span>
      </p>

      <ol className="mt-8 flex flex-col gap-4">
        {CHANGELOG.map((entry) => (
          <li
            key={entry.version}
            className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-navy-900">
                Versão {entry.version}
              </h2>
              <span className="text-xs text-navy-500">
                {entry.date.split("-").reverse().join("/")}
              </span>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-navy-700">
              {entry.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
