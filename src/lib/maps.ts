// Directions links for a free-text location. No API key or billing: these are
// the public URL schemes each map app documents, and phones hand them to the app.

export type MapApp = "google" | "apple" | "waze";

export const MAP_APPS: { app: MapApp; label: string }[] = [
  { app: "google", label: "Google Maps" },
  { app: "apple", label: "Apple Maps" },
  { app: "waze", label: "Waze" },
];

export function mapUrl(app: MapApp, location: string): string {
  const q = encodeURIComponent(location.trim());
  switch (app) {
    case "google":
      return `https://www.google.com/maps/search/?api=1&query=${q}`;
    case "apple":
      return `https://maps.apple.com/?q=${q}`;
    case "waze":
      return `https://waze.com/ul?q=${q}&navigate=yes`;
  }
}
