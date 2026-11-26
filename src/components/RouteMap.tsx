"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

export interface RouteMapWaypoint {
  lat: number;
  lng: number;
  label: string;
}

const RouteMapClient = dynamic(() => import("./RouteMapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 w-full items-center justify-center rounded-lg bg-navy-50 text-sm text-navy-500">
      Carregando mapa...
    </div>
  ),
});

export interface RouteMapOverride {
  coordinates: { lat: number; lng: number }[];
  distanceKm: number;
}

/** Praça de pedágio marcada no mapa (posição da nossa base de praças). */
export interface RouteMapToll {
  lat: number;
  lng: number;
  name: string;
  road: string;
  km: number | null;
  price: number;
}

export default function RouteMap({
  waypoints,
  onRouteFound,
  onRouteGeometry,
  overrideRoute,
  tolls,
  showDistance = false,
}: {
  waypoints: RouteMapWaypoint[];
  onRouteFound?: (distanceKm: number) => void;
  onRouteGeometry?: (coordinates: { lat: number; lng: number }[]) => void;
  overrideRoute?: RouteMapOverride | null;
  tolls?: RouteMapToll[] | null;
  showDistance?: boolean;
}) {
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [prevWaypoints, setPrevWaypoints] = useState(waypoints);

  if (waypoints !== prevWaypoints) {
    setPrevWaypoints(waypoints);
    setDistanceKm(null);
  }

  function handleRouteFound(km: number) {
    setDistanceKm(km);
    onRouteFound?.(km);
  }

  return (
    <div>
      <RouteMapClient
        waypoints={waypoints}
        onRouteFound={handleRouteFound}
        onRouteGeometry={onRouteGeometry}
        overrideRoute={overrideRoute}
        tolls={tolls}
      />
      {showDistance && distanceKm !== null && (
        <p className="mt-2 text-xs text-navy-500">
          Distância calculada pela rota:{" "}
          <span className="font-medium text-navy-700">{distanceKm} km</span>
        </p>
      )}
    </div>
  );
}
