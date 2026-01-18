import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet default icon issues in React/Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapComponentProps {
    query?: string;
    lat?: number;
    lng?: number;
    zoom?: number;
}

// Component to handle map centering and searching
const MapController: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lng], map.getZoom());
    }, [lat, lng, map]);
    return null;
};

export const MapComponent: React.FC<MapComponentProps> = ({ query, lat: propLat, lng: propLng, zoom = 13 }) => {
    const [coords, setCoords] = useState<[number, number] | null>(
        propLat && propLng ? [propLat, propLng] : null
    );
    const [loading, setLoading] = useState(!coords);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // If we have query but no coords, or query changed, try geocoding with Nominatim (OSM)
        if (query && (!propLat || !propLng)) {
            setLoading(true);
            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.length > 0) {
                        setCoords([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
                        setError(null);
                    } else {
                        setError('Məkan tapılmadı');
                    }
                })
                .catch(() => setError('Xəritə yüklənərkən xəta baş verdi'))
                .finally(() => setLoading(false));
        } else if (propLat && propLng) {
            setCoords([propLat, propLng]);
            setLoading(false);
        }
    }, [query, propLat, propLng]);

    if (loading) {
        return (
            <div className="w-full aspect-video rounded-xl bg-bg-onyx flex items-center justify-center border border-white/5 animate-pulse">
                <div className="text-text-sub text-sm">Xəritə hazırlanır...</div>
            </div>
        );
    }

    if (error || !coords) {
        return (
            <div className="w-full aspect-video rounded-xl bg-bg-onyx flex items-center justify-center border border-white/5">
                <div className="text-text-sub text-sm">{error || 'Koordinatlar yoxdur'}</div>
            </div>
        );
    }

    return (
        <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/10 shadow-lg relative z-0">
            <MapContainer
                center={coords}
                zoom={zoom}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
            >
                {/* CartoDB Dark Matter tiles for NovEra aesthetic */}
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                <Marker position={coords}>
                    {query && <Popup>{query}</Popup>}
                </Marker>
                <MapController lat={coords[0]} lng={coords[1]} />
            </MapContainer>
        </div>
    );
};
