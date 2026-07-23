"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

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

export default function RouteMap({
  waypoints,
  onRouteFound,
  showDistance = false,
}: {
  waypoints: RouteMapWaypoint[];
  onRouteFound?: (distanceKm: number) => void;
  showDistance?: boolean;
}) {
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  useEffect(() => {
    setDistanceKm(null);
  }, [waypoints]);

  function handleRouteFound(km: number) {
    setDistanceKm(km);
    onRouteFound?.(km);
  }

  return (
    <div>
      <RouteMapClient waypoints={waypoints} onRouteFound={handleRouteFound} />
      {showDistance && distanceKm !== null && (
        <p className="mt-2 text-xs text-navy-500">
          Distância calculada pela rota:{" "}
          <span className="font-medium text-navy-700">{distanceKm} km</span>
        </p>
      )}
    </div>
  );
}
