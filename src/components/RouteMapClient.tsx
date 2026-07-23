"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-routing-machine";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import type { RouteMapWaypoint } from "./RouteMap";

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

export default function RouteMapClient({
  waypoints,
  onRouteFound,
}: {
  waypoints: RouteMapWaypoint[];
  onRouteFound?: (distanceKm: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const routingRef = useRef<L.Routing.Control | null>(null);
  const labelsRef = useRef<string[]>([]);
  const onRouteFoundRef = useRef(onRouteFound);

  useEffect(() => {
    onRouteFoundRef.current = onRouteFound;
  }, [onRouteFound]);

  // O mapa e o controle de rotas são criados uma única vez. Waypoints são
  // atualizados via setWaypoints() no efeito abaixo — destruir/recriar o mapa
  // a cada mudança causava uma race condition com a requisição OSRM em
  // andamento (erro "_leaflet_pos" ao remover o mapa antes da resposta).
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);

    const plan = new L.Routing.Plan([], {
      addWaypoints: false,
      draggableWaypoints: false,
      createMarker: (i, waypoint) =>
        L.marker(waypoint.latLng).bindPopup(labelsRef.current[i] ?? ""),
    });

    routingRef.current = L.Routing.control({
      plan,
      router: L.Routing.osrmv1({
        serviceUrl: "https://router.project-osrm.org/route/v1",
      }),
      routeWhileDragging: false,
      fitSelectedRoutes: true,
      show: false,
    }).addTo(map);

    routingRef.current.on("routesfound", (event: { routes: { summary: { totalDistance: number } }[] }) => {
      const meters = event.routes[0]?.summary?.totalDistance;
      if (typeof meters === "number") {
        onRouteFoundRef.current?.(Math.round(meters / 1000));
      }
    });

    return () => {
      routingRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const routing = routingRef.current;
    if (!routing) return;

    labelsRef.current = waypoints.map((w) => w.label);
    routing.setWaypoints(
      waypoints.length >= 2
        ? waypoints.map((w) => L.latLng(w.lat, w.lng))
        : []
    );
  }, [waypoints]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-80 w-full rounded-lg" />
      {waypoints.length < 2 && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-navy-50/90 text-center text-sm text-navy-500">
          Não foi possível localizar os pontos da rota no mapa.
        </div>
      )}
    </div>
  );
}
