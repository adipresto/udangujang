// Verbatim port of reference/uua/index.html's loadLeaflet() (lines
// 1793-1810) — lazy-loads Leaflet JS+CSS from the same CDN, singleton
// promise so repeated opens of the map modal don't re-fetch. Client-only.

let leafletPromise: Promise<void> | null = null;

export function loadLeaflet(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("loadLeaflet: no window"));
  if ((window as unknown as { L?: unknown }).L) return Promise.resolve();
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);

    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.async = true;
    js.onload = () => resolve();
    js.onerror = () => {
      leafletPromise = null;
      reject(new Error("Gagal memuat peta"));
    };
    document.head.appendChild(js);
  });
  return leafletPromise;
}
