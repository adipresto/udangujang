"use client";

import { useEffect, useRef, useState } from "react";
import { loadLeaflet } from "@/lib/leaflet-loader";

// Verbatim port of reference/uua/index.html's Leaflet pin-location modal:
// openMapModal / initLeafletMap / reverseGeocode / initMapSearch / runSearch /
// centerToGPS / confirmMapPin (lines 1793-2073). Only the DOM-id manipulation
// style is swapped for React refs/state — endpoints, debounce, copy, and
// mobile-vs-desktop marker behavior are unchanged.

const DEFAULT_LAT = -6.2088;
const DEFAULT_LNG = 106.8456;

interface SearchItem {
  display_name: string;
  lat: string;
  lon: string;
}

// Minimal shape of the Leaflet globals this component touches — avoids
// pulling in @types/leaflet (not installed; Hermes owns installs).
interface LeafletLatLng {
  lat: number;
  lng: number;
}
interface LeafletMarker {
  getLatLng(): LeafletLatLng;
  setLatLng(pos: LeafletLatLng | [number, number]): void;
  setOpacity(v: number): void;
  on(evt: string, fn: (...args: unknown[]) => void): void;
}
interface LeafletMap {
  setView(pos: [number, number], zoom: number): void;
  invalidateSize(): void;
  getCenter(): LeafletLatLng;
  on(evt: string, fn: (...args: unknown[]) => void): void;
  remove(): void;
}

export interface MapPinModalProps {
  onClose: () => void;
  onConfirm: (lat: number, lng: number, pinAddress: string) => void;
}

export default function MapPinModal({ onClose, onConfirm }: MapPinModalProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const centerPinRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodeReqId = useRef(0);
  const searchReqId = useRef(0);
  const pinAddressRef = useRef("");

  const [coordsText, setCoordsText] = useState("Memuat peta…");
  const [addressState, setAddressState] = useState<{ loading: boolean; text: string }>({
    loading: false,
    text: "Seret pin untuk mendeteksi alamat…",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);

  function updateCoordsDisplay(lat: number, lng: number) {
    setCoordsText(lat.toFixed(6) + ", " + lng.toFixed(6));
    reverseGeocode(lat, lng);
  }

  function reverseGeocode(lat: number, lng: number) {
    pinAddressRef.current = "";
    setAddressState({ loading: true, text: "Mencari alamat…" });
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    const reqId = ++geocodeReqId.current;
    // Debounce ~600ms — hormati batas 1 req/detik Nominatim & hemat saat drag
    geocodeTimer.current = setTimeout(() => {
      const url =
        "https://nominatim.openstreetmap.org/reverse?format=jsonv2" +
        "&lat=" + encodeURIComponent(String(lat)) + "&lon=" + encodeURIComponent(String(lng)) +
        "&zoom=18&addressdetails=1&accept-language=id";
      fetch(url, { headers: { Accept: "application/json" } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (reqId !== geocodeReqId.current) return;
          const name = data && data.display_name;
          if (name) {
            pinAddressRef.current = name;
            setAddressState({ loading: false, text: name });
          } else {
            setAddressState({ loading: true, text: "Alamat tidak ditemukan — isi manual ya." });
          }
        })
        .catch(() => {
          if (reqId !== geocodeReqId.current) return;
          setAddressState({ loading: true, text: "Gagal memuat alamat — isi manual ya." });
        });
    }, 600);
  }

  function centerToGPS() {
    if (!navigator.geolocation) {
      setCoordsText("Browser tidak mendukung GPS.");
      return;
    }
    setCoordsText("Mendeteksi GPS…");
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        mapRef.current?.setView([lat, lng], 17);
        markerRef.current?.setLatLng({ lat, lng });
        updateCoordsDisplay(lat, lng);
        setGpsBusy(false);
      },
      (err) => {
        setCoordsText(err.code === 1 ? "Izin GPS ditolak — seret pin manual." : "GPS gagal — seret pin manual.");
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const L = (window as unknown as { L: any }).L;
        const map: LeafletMap = L.map(mapDivRef.current, { zoomControl: true, attributionControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        const icon = L.divIcon({
          html: '<div style="width:22px;height:32px;position:relative"><svg viewBox="0 0 22 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11 0C5 0 0 5 0 11c0 8 11 21 11 21S22 19 22 11C22 5 17 0 11 0z" fill="#ef4444"/><circle cx="11" cy="11" r="5" fill="white"/></svg></div>',
          className: "",
          iconSize: [22, 32],
          iconAnchor: [11, 32],
        });

        const isMobileMapUI = window.matchMedia("(max-width: 599px)").matches;
        const marker: LeafletMarker = L.marker([DEFAULT_LAT, DEFAULT_LNG], { draggable: !isMobileMapUI, icon }).addTo(map);
        map.setView([DEFAULT_LAT, DEFAULT_LNG], 14);
        updateCoordsDisplay(DEFAULT_LAT, DEFAULT_LNG);

        if (isMobileMapUI) {
          // Mobile: pin stays fixed at screen center; user pans the map underneath it.
          marker.setOpacity(0);
          centerPinRef.current?.classList.add("active");
          map.on("moveend", () => {
            const center = map.getCenter();
            marker.setLatLng(center);
            updateCoordsDisplay(center.lat, center.lng);
          });
        } else {
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            updateCoordsDisplay(pos.lat, pos.lng);
          });
          map.on("click", (e: unknown) => {
            const latlng = (e as { latlng: LeafletLatLng }).latlng;
            marker.setLatLng(latlng);
            updateCoordsDisplay(latlng.lat, latlng.lng);
          });
        }

        mapRef.current = map;
        markerRef.current = marker;

        // Always invalidate size after modal opens (avoids grey tiles)
        setTimeout(() => {
          map.invalidateSize();
          centerToGPS();
        }, 320);
      })
      .catch(() => {
        setCoordsText("Gagal memuat peta — cek koneksi internet lalu coba lagi.");
      });

    return () => {
      cancelled = true;
      if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runSearch(q: string) {
    const reqId = ++searchReqId.current;
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2" +
      "&q=" + encodeURIComponent(q) + "&limit=5&addressdetails=1&accept-language=id&countrycodes=id";
    fetch(url, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : []))
      .then((results) => {
        if (reqId !== searchReqId.current) return;
        setSearchLoading(false);
        setSearchResults(results || []);
      })
      .catch(() => {
        if (reqId !== searchReqId.current) return;
        setSearchLoading(false);
        setSearchResults([]);
      });
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchResults(null);
    runSearch(q);
  }

  function pickSearchResult(item: SearchItem) {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    mapRef.current?.setView([lat, lng], 17);
    markerRef.current?.setLatLng({ lat, lng });
    updateCoordsDisplay(lat, lng);
    setSearchQuery("");
    setSearchResults(null);
  }

  function handleConfirm() {
    if (!markerRef.current) return;
    const pos = markerRef.current.getLatLng();
    onConfirm(pos.lat, pos.lng, pinAddressRef.current);
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="map-backdrop show" onClick={handleBackdropClick}>
      <div className="map-sheet">
        <div className="map-header">
          <div>
            <div className="map-header-title">📍 Pin Lokasi</div>
            <div className="map-header-hint">Seret pin merah untuk menyesuaikan titik</div>
          </div>
          <button type="button" className="map-close" onClick={onClose} aria-label="Tutup">✕</button>
        </div>
        <div className="map-search-wrap">
          <input
            type="text"
            className="map-search-input"
            placeholder="Cari alamat, nama jalan, tempat…"
            autoComplete="off"
            inputMode="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchResults(null);
              setSearchLoading(false);
            }}
            onKeyDown={handleSearchKeyDown}
          />
          {searchLoading && <div className="map-search-spinner show" />}
          {searchResults && (
            <div className="map-search-dropdown show">
              {searchResults.length === 0 ? (
                <div className="map-search-empty">Lokasi tidak ditemukan. Coba kata kunci lain.</div>
              ) : (
                searchResults.map((item, i) => (
                  <div key={i} className="map-search-item" onClick={() => pickSearchResult(item)}>
                    {item.display_name}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div id="leaflet-map" ref={mapDivRef}>
          <div className="map-center-pin" ref={centerPinRef}>
            <svg width="22" height="32" viewBox="0 0 22 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 0C5 0 0 5 0 11c0 8 11 21 11 21S22 19 22 11C22 5 17 0 11 0z" fill="#ef4444" />
              <circle cx="11" cy="11" r="5" fill="white" />
            </svg>
          </div>
        </div>
        <div className="map-footer">
          <div className={`map-address${addressState.loading ? " loading" : ""}`}>
            {addressState.loading && <span className="map-addr-spin" />}
            {addressState.text}
          </div>
          <div className="map-coords">{coordsText}</div>
          <div className="map-actions">
            <button type="button" className="map-btn-gps" onClick={centerToGPS} disabled={gpsBusy}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              Lokasi Saya
            </button>
            <button type="button" className="map-btn-confirm" onClick={handleConfirm}>✓ Konfirmasi Titik</button>
          </div>
        </div>
      </div>
    </div>
  );
}
