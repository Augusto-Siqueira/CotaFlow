"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Mapa das cercas dos Locais: polígonos (importados da A52) e círculos
// (desenhados no CotaFlow). No cadastro, um clique no mapa marca o centro do
// círculo (`onPick`) e o rascunho aparece tracejado.

export interface PlaceShape {
  id: string;
  name: string;
  color: string;
  polygon: [number, number][] | null;
  center: [number, number] | null;
  radius: number | null;
  dim?: boolean;
}

export default function PlacesMapClient({
  places,
  selectedId = null,
  onSelect,
  draft = null,
  onPick,
  height = "h-full",
}: {
  places: PlaceShape[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  draft?: { center: [number, number]; radius: number } | null;
  onPick?: (lat: number, lon: number) => void;
  height?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const draftRef = useRef<L.LayerGroup | null>(null);
  const shapesRef = useRef(new Map<string, L.Path>());
  const fittedRef = useRef(false);
  const draftShownRef = useRef(false);
  // Abriu já com um centro (editar local desenhado): começa nele, sem enquadrar todas as cercas.
  const startOnDraftRef = useRef(Boolean(draft));
  const initialDraftRef = useRef(draft);
  const cbRef = useRef({ onSelect, onPick });
  useEffect(() => {
    cbRef.current = { onSelect, onPick };
  }, [onSelect, onPick]);

  useEffect(() => {
    if (!boxRef.current) return;
    const start = initialDraftRef.current;
    const map = L.map(boxRef.current, start ? { center: start.center, zoom: 16 } : { center: [-25.45, -49.3], zoom: 7 });
    if (start) draftShownRef.current = true;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    draftRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => cbRef.current.onPick?.(e.latlng.lat, e.latlng.lng));
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(boxRef.current);
    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const shapes = new Map<string, L.Path>();
    const bounds: L.LatLngExpression[] = [];
    for (const p of places) {
      const sel = p.id === selectedId;
      // No cadastro (onPick), as cercas são só referência: o clique passa para o mapa.
      const picking = Boolean(cbRef.current.onPick);
      const style = {
        interactive: !picking,
        color: p.color,
        weight: sel ? 4 : 2,
        fillOpacity: sel ? 0.35 : p.dim ? 0.05 : 0.18,
        opacity: p.dim ? 0.5 : 1,
      };
      let shape: L.Path | null = null;
      if (p.polygon && p.polygon.length >= 3) {
        shape = L.polygon(p.polygon, style);
        bounds.push(...p.polygon);
      } else if (p.center && p.radius) {
        shape = L.circle(p.center, { ...style, radius: p.radius });
        bounds.push(p.center);
      }
      if (!shape) continue;
      if (!picking) {
        shape.bindTooltip(p.name, { sticky: true });
        shape.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          cbRef.current.onSelect?.(p.id);
        });
      }
      shape.addTo(layer);
      shapes.set(p.id, shape);
    }
    shapesRef.current = shapes;
    if (!fittedRef.current && bounds.length && !startOnDraftRef.current) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 15 });
      fittedRef.current = true;
    }
  }, [places, selectedId]);

  // Escolheu na lista: enquadra a cerca.
  useEffect(() => {
    const map = mapRef.current;
    const shape = selectedId ? shapesRef.current.get(selectedId) : undefined;
    if (!map || !shape) return;
    const b = (shape as L.Polygon | L.Circle).getBounds();
    map.fitBounds(b, { padding: [40, 40], maxZoom: 17 });
  }, [selectedId]);

  // Rascunho do círculo no cadastro.
  useEffect(() => {
    const map = mapRef.current;
    const layer = draftRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!draft) return;
    L.circle(draft.center, { radius: draft.radius, color: "#047857", weight: 3, dashArray: "6 6", fillOpacity: 0.2 }).addTo(layer);
    L.circleMarker(draft.center, { radius: 4, color: "#047857", fillOpacity: 1 }).addTo(layer);
    // Primeira vez: aproxima no local; depois só acompanha se sair da tela.
    if (!draftShownRef.current) {
      map.setView(draft.center, 16, { animate: false });
      draftShownRef.current = true;
    } else if (!map.getBounds().contains(draft.center)) {
      map.setView(draft.center, Math.max(map.getZoom(), 15));
    }
  }, [draft]);

  return <div ref={boxRef} className={`relative isolate z-0 ${height} min-h-[20rem] w-full rounded-xl ${onPick ? "cursor-crosshair" : ""}`} />;
}
