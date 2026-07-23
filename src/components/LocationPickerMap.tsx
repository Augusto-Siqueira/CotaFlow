"use client";

import dynamic from "next/dynamic";

export interface LatLng {
  lat: number;
  lng: number;
}

const LocationPickerMapClient = dynamic(
  () => import("./LocationPickerMapClient"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 w-full items-center justify-center rounded-lg bg-navy-50 text-sm text-navy-500">
        Carregando mapa...
      </div>
    ),
  }
);

export default function LocationPickerMap({
  value,
  onChange,
}: {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
}) {
  return <LocationPickerMapClient value={value} onChange={onChange} />;
}
