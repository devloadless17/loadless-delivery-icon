'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

/** Beirut — the default map center for a Lebanon-only platform. */
export const DEFAULT_CENTER: [number, number] = [33.8938, 35.5018];

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Branded pin — a divIcon so no image assets are needed. */
const pin = L.divIcon({
  className: '',
  html: `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 1C8.7 1 2 7.7 2 16c0 10.5 12.2 24.2 14.2 26.4a1.1 1.1 0 0 0 1.6 0C19.8 40.2 32 26.5 32 16 32 7.7 25.3 1 17 1Z"
      fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
    <circle cx="17" cy="16" r="6" fill="#ffffff"/>
    <circle cx="17" cy="16" r="3" fill="#ea580c"/>
  </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 42],
});

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo(position);
  }, [map, position]);
  return null;
}

export function LeafletPicker({
  value,
  onChange,
  className,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (value: { lat: number; lng: number }) => void;
  className?: string;
}) {
  const position: [number, number] | null = value ? [value.lat, value.lng] : null;
  return (
    <MapContainer
      center={position ?? DEFAULT_CENTER}
      zoom={position ? 16 : 12}
      className={className}
      style={{ minHeight: 240 }}
      attributionControl={false}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      <ClickHandler onPick={(lat, lng) => onChange({ lat, lng })} />
      <Recenter position={position} />
      {position && (
        <Marker
          position={position}
          icon={pin}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onChange({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}

export function LeafletView({
  position,
  className,
}: {
  position: { lat: number; lng: number };
  className?: string;
}) {
  return (
    <MapContainer
      center={[position.lat, position.lng]}
      zoom={16}
      className={className}
      style={{ minHeight: 200 }}
      attributionControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      zoomControl={false}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      <Marker position={[position.lat, position.lng]} icon={pin} />
    </MapContainer>
  );
}
