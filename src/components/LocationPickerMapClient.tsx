"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "./LocationPickerMap";

// Corrige os ícones padrão do Leaflet, que quebram sob bundlers (webpack)
// porque o CSS original resolve os PNGs por caminho relativo ao próprio CSS.
const iconRetinaUrl = new URL(
  "leaflet/dist/images/marker-icon-2x.png",
  import.meta.url
).toString();
const iconUrl = new URL(
  "leaflet/dist/images/marker-icon.png",
  import.meta.url
).toString();
const shadowUrl = new URL(
  "leaflet/dist/images/marker-shadow.png",
  import.meta.url
).toString();

L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

const BRAZIL_CENTER: L.LatLngTuple = [-14.235, -51.9253];

export default function LocationPickerMapClient({
  value,
  onChange,
}: {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // O mapa é criado uma única vez. O clique só avisa o componente pai
  // (onChange) — quem cria/move/remove o marcador é o efeito abaixo, a
  // única fonte de verdade pra evitar lógica duplicada de posicionamento.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current).setView(BRAZIL_CENTER, 4);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    return () => {
      markerRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!value) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([value.lat, value.lng]);
      return;
    }

    markerRef.current = L.marker([value.lat, value.lng], { draggable: true })
      .addTo(map)
      .on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        onChangeRef.current({ lat: pos.lat, lng: pos.lng });
      });
    map.setView([value.lat, value.lng], 15);
  }, [value]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-80 w-full rounded-lg" />
      <p className="mt-2 text-xs text-navy-500">
        Clique no mapa pra marcar o local exato, ou arraste o pino pra
        ajustar.
      </p>
    </div>
  );
}
