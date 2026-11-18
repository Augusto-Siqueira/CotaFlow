"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Mapa da frota (Leaflet + OpenStreetMap). Cada veículo é uma etiqueta com a
// placa, na cor da situação. O mapa é criado uma vez; os marcadores são
// atualizados a cada nova leitura sem perder o zoom de quem está olhando.

export interface FleetMarker {
  id: string;
  lat: number;
  lon: number;
  label: string;
  color: string;
  title: string;
  lines: string[];
}

function plateIcon(label: string, color: string, selected: boolean) {
  const el = document.createElement("div");
  el.textContent = label;
  el.style.cssText = [
    `background:${color}`,
    "color:#fff",
    "font:700 11px/1 ui-monospace,monospace",
    "letter-spacing:.05em",
    "padding:4px 6px",
    "border-radius:5px",
    `border:2px solid ${selected ? "#111827" : "#ffffff"}`,
    "box-shadow:0 1px 4px rgba(0,0,0,.45)",
    "white-space:nowrap",
    "width:max-content",
    "transform:translate(-50%,-50%)",
    "cursor:pointer",
  ].join(";");
  return L.divIcon({ className: "", html: el, iconSize: [0, 0] });
}

function popupContent(m: FleetMarker): HTMLElement {
  const box = document.createElement("div");
  box.style.cssText = "font:13px/1.35 system-ui,sans-serif;min-width:180px;color:#111827";
  const t = document.createElement("div");
  t.style.cssText = "font-weight:700;margin-bottom:4px";
  t.textContent = m.title;
  box.appendChild(t);
  for (const line of m.lines) {
    const p = document.createElement("div");
    p.textContent = line;
    box.appendChild(p);
  }
  const a = document.createElement("a");
  a.href = `https://www.google.com/maps?q=${m.lat},${m.lon}`;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "Abrir no Google Maps";
  a.style.cssText = "display:inline-block;margin-top:6px;color:#047857;font-weight:600";
  box.appendChild(a);
  return box;
}

export default function FleetMapClient({
  markers,
  selectedId,
  onSelect,
}: {
  markers: FleetMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const byIdRef = useRef(new Map<string, L.Marker>());
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { center: [-25.4, -49.3], zoom: 6 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    // A caixa do mapa muda de tamanho (tela, menu lateral): o Leaflet precisa saber.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redesenha os marcadores a cada leitura.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const byId = new Map<string, L.Marker>();
    for (const m of markers) {
      const mk = L.marker([m.lat, m.lon], {
        icon: plateIcon(m.label, m.color, m.id === selectedId),
        zIndexOffset: m.id === selectedId ? 1000 : 0,
        title: m.title,
      })
        .bindPopup(popupContent(m))
        .on("click", () => onSelectRef.current(m.id));
      mk.addTo(layer);
      byId.set(m.id, mk);
    }
    byIdRef.current = byId;
    // Nova leitura com um veículo escolhido: o balão dele continua aberto.
    if (selectedId) byId.get(selectedId)?.openPopup();
    // Enquadra a frota só na primeira leitura; depois respeita o zoom do usuário.
    if (!fittedRef.current && markers.length > 0) {
      map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lon] as [number, number])), { padding: [40, 40], maxZoom: 12 });
      fittedRef.current = true;
    }
  }, [markers, selectedId]);

  // Escolheu na lista: centraliza e abre o balão.
  useEffect(() => {
    const map = mapRef.current;
    const mk = selectedId ? byIdRef.current.get(selectedId) : undefined;
    if (!map || !mk) return;
    map.setView(mk.getLatLng(), Math.max(map.getZoom(), 11), { animate: true });
    mk.openPopup();
  }, [selectedId]);

  return <div ref={containerRef} className="relative isolate z-0 h-full min-h-[24rem] w-full rounded-xl" />;
}
