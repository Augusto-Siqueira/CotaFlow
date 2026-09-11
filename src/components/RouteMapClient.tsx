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

export interface RouteMapOverride {
  coordinates: { lat: number; lng: number }[];
  distanceKm: number;
}

export default function RouteMapClient({
  waypoints,
  onRouteFound,
  onRouteGeometry,
  overrideRoute,
}: {
  waypoints: RouteMapWaypoint[];
  onRouteFound?: (distanceKm: number) => void;
  onRouteGeometry?: (coordinates: { lat: number; lng: number }[]) => void;
  // Quando presente, o mapa desenha exatamente essa geometria (vinda de um
  // provedor de pedágio automático — hoje nenhum está ativo, ver
  // src/lib/wikirota.ts) em vez de rotear ao vivo pelo OSRM público. É a
  // rota que o provedor efetivamente usou pra cobrar o pedágio, que pode
  // divergir da que o OSRM público escolheria sozinho.
  overrideRoute?: RouteMapOverride | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const routingRef = useRef<L.Routing.Control | null>(null);
  const labelsRef = useRef<string[]>([]);
  const onRouteFoundRef = useRef(onRouteFound);
  const onRouteGeometryRef = useRef(onRouteGeometry);
  const overrideRouteRef = useRef(overrideRoute);

  useEffect(() => {
    onRouteFoundRef.current = onRouteFound;
    onRouteGeometryRef.current = onRouteGeometry;
  }, [onRouteFound, onRouteGeometry]);

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

    // Router híbrido: se overrideRouteRef tiver uma geometria (de um
    // provedor de pedágio automático), devolve ela direto sem chamar rede
    // nenhuma — senão cai pro roteamento ao vivo do OSRM público, que hoje
    // é sempre o caso (nenhum provedor automático está ativo; o pedágio é
    // preenchido manualmente — ver src/lib/wikirota.ts).
    const liveRouter = L.Routing.osrmv1({
      serviceUrl: "https://router.project-osrm.org/route/v1",
    });
    const hybridRouter: L.Routing.IRouter = {
      route(routeWaypoints, callback, context, options) {
        const override = overrideRouteRef.current;
        if (override && override.coordinates.length >= 2) {
          // name/instructions vazios (não undefined) e inputWaypoints
          // presente: o Routing Machine acessa esses campos internamente
          // mesmo com o painel de itinerário escondido (show:false) — sem
          // eles, quebra com "No value provided for variable {name}"
          // (formatação do resumo) ou "Cannot read properties of undefined
          // (reading 'length')" (Line layer usa route.inputWaypoints pra
          // desenhar o trecho entre parada e rota). inputWaypoints não está
          // no tipo público IRoute, daí o cast.
          const route = {
            name: "",
            instructions: [],
            coordinates: override.coordinates.map((c) => L.latLng(c.lat, c.lng)),
            summary: {
              totalDistance: override.distanceKm * 1000,
              totalTime: 0,
            },
            inputWaypoints: routeWaypoints,
          } as L.Routing.IRoute;
          callback.call(context, undefined, [route]);
          return;
        }
        liveRouter.route(routeWaypoints, callback, context, options);
      },
    };

    routingRef.current = L.Routing.control({
      plan,
      router: hybridRouter,
      routeWhileDragging: false,
      fitSelectedRoutes: true,
      show: false,
    }).addTo(map);

    routingRef.current.on(
      "routesfound",
      (event: {
        routes: {
          summary: { totalDistance: number };
          coordinates?: { lat: number; lng: number }[];
        }[];
      }) => {
        const route = event.routes[0];
        const meters = route?.summary?.totalDistance;
        if (typeof meters === "number") {
          onRouteFoundRef.current?.(Math.round(meters / 1000));
        }
        if (route?.coordinates) {
          onRouteGeometryRef.current?.(
            route.coordinates.map((c) => ({ lat: c.lat, lng: c.lng }))
          );
        }
      }
    );

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

  // Troca entre rota ao vivo (OSRM público) e rota oficial (de um provedor
  // de pedágio automático) força um novo cálculo — setWaypoints() reaciona
  // o controle mesmo com os mesmos pontos, porque é o mesmo gatilho que o
  // efeito acima já usa.
  useEffect(() => {
    overrideRouteRef.current = overrideRoute ?? null;
    const routing = routingRef.current;
    if (!routing) return;
    routing.setWaypoints(
      waypoints.length >= 2
        ? waypoints.map((w) => L.latLng(w.lat, w.lng))
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrideRoute]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-80 w-full rounded-lg" />
      {waypoints.length < 2 && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-navy-50/90 text-center text-sm text-navy-500">
          Não foi possível localizar os pontos da rota no mapa.
        </div>
      )}
      {overrideRoute && (
        <div className="absolute left-2 top-2 rounded bg-brand-700/90 px-2 py-1 text-[11px] font-medium text-white shadow">
          Rota oficial
        </div>
      )}
    </div>
  );
}
