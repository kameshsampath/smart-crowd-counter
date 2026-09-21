"use client"
import { useMemo, useState } from "react"
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet"
import { divIcon, LatLngBoundsExpression } from "leaflet"
import { Photo } from "@/lib/crowd"
import "leaflet/dist/leaflet.css"

export default function SessionMap({ photos, selectedPath, onSelect }: { photos: Photo[]; selectedPath?: string; onSelect: (path: string) => void }) {
    const [tileError, setTileError] = useState(false)
    const pins = photos.filter(photo => typeof photo.latitude === "number" && typeof photo.longitude === "number")
    const bounds = useMemo(() => pins.map(photo => [photo.latitude!, photo.longitude!]) as LatLngBoundsExpression, [photos])
    if (!pins.length) return <div className="map-empty">No GPS locations available for these photos.</div>
    return <section aria-label="Session map">
        {tileError && <p role="alert">Map tiles are unavailable. Located photos below remain selectable.</p>}
        <MapContainer key={pins.map(photo => photo.path).join("|")} bounds={bounds} boundsOptions={{ padding: [35, 35], maxZoom: 14 }} scrollWheelZoom={false} className="session-map">
            <TileLayer url="/api/tiles?z={z}&x={x}&y={y}" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' eventHandlers={{ tileerror: () => setTileError(true) }} />
            {pins.map((photo, index) => <Marker key={photo.path} position={[photo.latitude!, photo.longitude!]} title={photo.path}
                icon={divIcon({ className: `session-pin ${photo.path === selectedPath ? "active" : ""}`, html: String(index + 1), iconSize: [28, 28] })}
                eventHandlers={{ click: () => onSelect(photo.path) }}>
                <Popup><strong>Photos at this location</strong>{pins.filter(other => other.latitude === photo.latitude && other.longitude === photo.longitude).map(other => <button className="location-option" key={other.path} onClick={() => onSelect(other.path)} aria-pressed={selectedPath === other.path}>{other.path}</button>)}</Popup>
            </Marker>)}
        </MapContainer>
        <div className="location-options">{pins.map((photo, index) => <button key={photo.path} aria-pressed={photo.path === selectedPath} onClick={() => onSelect(photo.path)} title={photo.path}>{index + 1}. {photo.path}</button>)}</div>
    </section>
}