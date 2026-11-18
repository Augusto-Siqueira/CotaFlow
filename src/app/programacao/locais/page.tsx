"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";
import { Modal } from "@/components/Modal";
import type { PlaceShape } from "@/components/PlacesMapClient";

// Locais com cerca (geofence): carregamento, entrega, oficinas, pátios.
// As cercas da A52 são importadas (polígonos); as que faltam, como as oficinas,
// são desenhadas aqui como círculo (centro + raio). Base para o CotaFlow sugerir
// a mudança de status pela posição do caminhão.

const PlacesMapClient = dynamic(() => import("@/components/PlacesMapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[20rem] items-center justify-center rounded-xl bg-navy-50 text-sm text-navy-500">
      Carregando mapa...
    </div>
  ),
});

const KINDS = [
  { value: "cliente", label: "Cliente", plural: "Clientes", color: "#2563eb" },
  { value: "oficina", label: "Oficina", plural: "Oficinas", color: "#dc2626" },
  { value: "patio", label: "Pátio", plural: "Pátios", color: "#7c3aed" },
  { value: "posto", label: "Posto", plural: "Postos", color: "#d97706" },
  { value: "outro", label: "Outro", plural: "Outros", color: "#475569" },
] as const;
type Kind = (typeof KINDS)[number]["value"];
const kindInfo = (k: string) => KINDS.find((x) => x.value === k) ?? KINDS[4];

interface Place {
  id: string;
  name: string;
  kind: Kind;
  city: string | null;
  uf: string | null;
  polygon: [number, number][] | null;
  center_lat: number | null;
  center_lon: number | null;
  radius_m: number | null;
  source: "manual" | "a52";
  a52_name: string | null;
  workshop_id: string | null;
  active: boolean;
  notes: string | null;
}

interface Workshop {
  id: string;
  name: string;
}

const fieldCls =
  "w-full rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1 block text-sm font-medium text-navy-700";

function shapeOf(p: Place, dim = false): PlaceShape {
  return {
    id: p.id,
    name: p.name,
    color: kindInfo(p.kind).color,
    polygon: p.polygon,
    center: p.center_lat != null && p.center_lon != null ? [p.center_lat, p.center_lon] : null,
    radius: p.radius_m,
    dim: dim || !p.active,
  };
}

export default function LocaisPage() {
  const { canEditSchedule, canEditMaintenance } = useAuth();
  const canEdit = canEditSchedule || canEditMaintenance;
  const { toastSuccess, toastError } = useFeedback();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"" | Kind>("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Place | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const [pl, ws] = await Promise.all([
      supabase.from("geo_places").select("*").order("name"),
      supabase.from("maintenance_workshops").select("id, name").order("name"),
    ]);
    if (pl.error) setError(pl.error.message);
    setPlaces((pl.data ?? []) as Place[]);
    setWorkshops((ws.data ?? []) as Workshop[]);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function importA52() {
    setImporting(true);
    try {
      const res = await fetch("/api/locais/importar-a52", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { inserted?: number; updated?: number; withoutFence?: number; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      toastSuccess(
        `Cercas da A52 importadas: ${body?.inserted ?? 0} novas, ${body?.updated ?? 0} atualizadas` +
          (body?.withoutFence ? ` (${body.withoutFence} endereços da A52 sem cerca ou com localização inválida ficaram de fora).` : ".")
      );
      await load();
    } catch (e) {
      toastError(`Não foi possível importar: ${e instanceof Error ? e.message : "erro"}`);
    }
    setImporting(false);
  }

  const all = useMemo(() => places ?? [], [places]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of all) if (p.active || showInactive) c[p.kind] = (c[p.kind] ?? 0) + 1;
    return c;
  }, [all, showInactive]);
  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      all.filter(
        (p) =>
          (showInactive || p.active) &&
          (!kind || p.kind === kind) &&
          (!q || `${p.name} ${p.city ?? ""} ${p.a52_name ?? ""}`.toLowerCase().includes(q))
      ),
    [all, showInactive, kind, q]
  );
  const shapes = useMemo(() => shown.map((p) => shapeOf(p)), [shown]);
  const workshopName = (id: string | null) => workshops.find((w) => w.id === id)?.name ?? null;

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">Locais</h1>
          <p className="mt-1 max-w-3xl text-sm text-navy-500">
            Cercas no mapa dos locais de carregamento, entrega e oficinas. Com elas o CotaFlow vai sugerir a mudança de
            status quando o caminhão entrar ou sair do local.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={importA52}
              disabled={importing}
              className={`${buttonClasses("secondary", "md")} disabled:cursor-not-allowed`}
            >
              {importing ? "Importando..." : "Importar cercas da A52"}
            </button>
            <button type="button" onClick={() => setEditing("new")} className={buttonClasses("primary", "md")}>
              Novo local
            </button>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Erro ao carregar: {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            aria-pressed={kind === k.value}
            onClick={() => setKind(kind === k.value ? "" : k.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-navy-700 transition ${
              kind === k.value ? "border-brand-600 ring-2 ring-brand-600" : kind ? "border-navy-200 opacity-60 hover:opacity-100" : "border-navy-200"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: k.color }} aria-hidden="true" />
            {k.plural}: {counts[k.value] ?? 0}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-navy-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inativos
        </label>
        <label className="ml-auto w-full sm:w-64">
          <span className="sr-only">Buscar local ou cidade</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar local ou cidade"
            className={fieldCls}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 lg:h-[72vh] lg:grid-cols-[24rem_1fr]">
        <section aria-label="Lista de locais" className="flex min-h-0 flex-col rounded-xl border border-navy-200 bg-white p-3 max-lg:order-2">
          <h2 className="mb-2 text-sm font-semibold text-navy-900">
            Locais <span className="font-normal text-navy-500">({shown.length})</span>
          </h2>
          {places === null ? (
            <p className="py-6 text-center text-sm text-navy-500">Carregando...</p>
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-navy-500">
              {all.length === 0 ? "Nenhum local ainda. Importe as cercas da A52 ou cadastre um novo." : "Nenhum local com esse filtro."}
            </p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 max-lg:max-h-[28rem]">
              {shown.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                    selected === p.id ? "border-brand-500 ring-1 ring-brand-500" : "border-navy-200"
                  } ${p.active ? "" : "opacity-60"}`}
                >
                  <button type="button" onClick={() => setSelected(p.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: kindInfo(p.kind).color }} aria-hidden="true" />
                      <span className="truncate text-sm font-medium text-navy-900">{p.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-navy-500">
                      {kindInfo(p.kind).label}
                      {p.city ? ` · ${p.city}${p.uf ? `/${p.uf}` : ""}` : ""}
                      {p.workshop_id ? ` · ${workshopName(p.workshop_id) ?? "oficina"}` : ""}
                      {` · ${p.source === "a52" ? "cerca da A52" : "desenhado aqui"}${p.radius_m ? ` (raio ${p.radius_m} m)` : ""}`}
                      {p.active ? "" : " · inativo"}
                    </span>
                  </button>
                  {canEdit && (
                    <button type="button" onClick={() => setEditing(p)} className={buttonClasses("soft", "sm")}>
                      Editar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="h-[60vh] min-h-0 lg:h-full">
          <PlacesMapClient places={shapes} selectedId={selected} onSelect={setSelected} />
        </div>
      </div>

      {editing && (
        <PlaceForm
          place={editing === "new" ? null : editing}
          workshops={workshops}
          others={all}
          onClose={() => setEditing(null)}
          onSaved={async (id) => {
            setEditing(null);
            await load();
            if (id) setSelected(id);
          }}
        />
      )}
    </div>
  );
}

function parseCoords(s: string): [number, number] | null {
  const m = s.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(",", "."));
  const lon = Number(m[2].replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
}

function PlaceForm({
  place,
  workshops,
  others,
  onClose,
  onSaved,
}: {
  place: Place | null;
  workshops: Workshop[];
  others: Place[];
  onClose: () => void;
  onSaved: (id: string | null) => void;
}) {
  const { toastSuccess, toastError, confirm } = useFeedback();
  // Cerca da A52: o desenho vem de lá (a próxima importação desfaria a edição).
  const locked = place?.source === "a52";
  const [name, setName] = useState(place?.name ?? "");
  const [kind, setKind] = useState<Kind>(place?.kind ?? "oficina");
  const [workshopId, setWorkshopId] = useState(place?.workshop_id ?? "");
  const [active, setActive] = useState(place?.active ?? true);
  const [notes, setNotes] = useState(place?.notes ?? "");
  const [city, setCity] = useState(place?.city ?? "");
  const [center, setCenter] = useState<[number, number] | null>(
    place?.center_lat != null && place?.center_lon != null && !locked ? [place.center_lat, place.center_lon] : null
  );
  const [radius, setRadius] = useState(place?.radius_m ?? 200);
  const [coords, setCoords] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Oficinas que já têm local (fora esta).
  const takenWorkshops = new Set(others.filter((o) => o.workshop_id && o.id !== place?.id).map((o) => o.workshop_id));
  // No mapa do formulário: a cerca deste local (se for da A52) e as vizinhas, apagadas.
  const shapes = useMemo(
    () => others.filter((o) => o.active && o.id !== place?.id).map((o) => shapeOf(o, true)).concat(place && locked ? [shapeOf(place)] : []),
    [others, place, locked]
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setFormError("Informe o nome do local.");
    if (!locked && !center) return setFormError("Clique no mapa no centro do local (ou cole as coordenadas).");
    if (!locked && (radius < 30 || radius > 2000)) return setFormError("O raio deve ficar entre 30 e 2000 metros.");
    if (kind === "oficina" && !workshopId) return setFormError("Escolha a oficina deste local.");
    setSaving(true);
    setFormError(null);
    const row = {
      name: name.trim(),
      kind,
      workshop_id: kind === "oficina" ? workshopId : null,
      active,
      notes: notes.trim() || null,
      city: city.trim() || null,
      ...(locked ? {} : { center_lat: center![0], center_lon: center![1], radius_m: Math.round(radius), polygon: null }),
    };
    const res = place
      ? await supabase.from("geo_places").update(row).eq("id", place.id).select("id").maybeSingle()
      : await supabase.from("geo_places").insert({ ...row, source: "manual" }).select("id").maybeSingle();
    setSaving(false);
    if (res.error) {
      setFormError(
        res.error.code === "23505" ? "Essa oficina já tem um local cadastrado." : `Não foi possível salvar: ${res.error.message}`
      );
      return;
    }
    toastSuccess(place ? "Local atualizado." : "Local cadastrado.");
    onSaved((res.data as { id: string } | null)?.id ?? null);
  }

  async function remove() {
    if (!place) return;
    if (!(await confirm(`Excluir o local "${place.name}"?`, { confirmLabel: "Excluir" }))) return;
    const { error } = await supabase.from("geo_places").delete().eq("id", place.id);
    if (error) return toastError(`Não foi possível excluir: ${error.message}`);
    toastSuccess("Local excluído.");
    onSaved(null);
  }

  return (
    <Modal onClose={onClose} labelledBy="place-form-title" className="max-w-4xl">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="place-form-title" className="text-base font-semibold text-navy-900">
            {place ? "Editar local" : "Novo local"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded px-2 text-lg leading-none text-navy-500 hover:bg-navy-100">
            ×
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
          <div className="space-y-3 text-sm">
            <div>
              <label className={labelCls} htmlFor="pl-name">Nome</label>
              <input id="pl-name" className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} />
              {place?.a52_name && place.a52_name !== name && (
                <p className="mt-1 text-[11px] text-navy-500">Na A52: {place.a52_name}</p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="pl-kind">Tipo</label>
              <select id="pl-kind" className={fieldCls} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
            {kind === "oficina" && (
              <div>
                <label className={labelCls} htmlFor="pl-ws">Oficina</label>
                <select id="pl-ws" className={fieldCls} value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
                  <option value="">Escolha...</option>
                  {workshops.map((w) => (
                    <option key={w.id} value={w.id} disabled={takenWorkshops.has(w.id)}>
                      {w.name}
                      {takenWorkshops.has(w.id) ? " (já tem local)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls} htmlFor="pl-city">Cidade</label>
              <input id="pl-city" className={fieldCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex: Araucária" />
            </div>
            {locked ? (
              <p className="rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-600">
                Cerca importada da A52 (
                {place!.polygon && place!.polygon.length >= 3 ? `polígono de ${place!.polygon.length} pontos` : `círculo de ${place!.radius_m} m`}
                ). Para mudar o desenho, ajuste na A52 e importe de novo.
              </p>
            ) : (
              <>
                <div>
                  <label className={labelCls} htmlFor="pl-radius">Raio da cerca (metros)</label>
                  <input
                    id="pl-radius"
                    type="number"
                    min={30}
                    max={2000}
                    step={10}
                    className={fieldCls}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pl-coords">Coordenadas do centro</label>
                  <input
                    id="pl-coords"
                    className={fieldCls}
                    value={coords}
                    onChange={(e) => {
                      setCoords(e.target.value);
                      const c = parseCoords(e.target.value);
                      if (c) setCenter(c);
                    }}
                    placeholder="Cole do Google Maps: -25.53, -49.31"
                  />
                  <p className="mt-1 text-[11px] text-navy-500">
                    Ou clique no mapa no meio do pátio do local.
                    {center ? ` Centro: ${center[0].toFixed(5)}, ${center[1].toFixed(5)}` : ""}
                  </p>
                </div>
              </>
            )}
            <label className="flex items-center gap-2 text-sm text-navy-700">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Ativo (usado nas sugestões de status)
            </label>
            <div>
              <label className={labelCls} htmlFor="pl-notes">Observação</label>
              <textarea id="pl-notes" rows={2} className={fieldCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="h-[24rem] md:h-auto md:min-h-[26rem]">
            <PlacesMapClient
              places={shapes}
              selectedId={place && locked ? place.id : null}
              draft={!locked && center ? { center, radius: Math.max(30, Math.min(2000, radius || 30)) } : null}
              onPick={locked ? undefined : (lat, lon) => setCenter([lat, lon])}
            />
          </div>
        </div>
        {formError && (
          <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            {place?.source === "manual" && (
              <button type="button" onClick={remove} className={buttonClasses("danger", "md")}>
                Excluir
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonClasses("secondary", "md")}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className={`${buttonClasses("primary", "md")} disabled:cursor-not-allowed`}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
