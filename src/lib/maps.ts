// Map links and address search for a free-text location. No API key or billing:
// links use each platform's public URL scheme, search uses Photon (OpenStreetMap).

export type Platform = "ios" | "android" | "other";

export function detectPlatform(userAgent: string): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/**
 * A link the phone hands to its maps app: iOS opens Apple Maps (or the default
 * navigation app where iOS allows one), Android's geo: lets the player pick
 * their app, everything else gets Google Maps on the web.
 */
export function mapUrl(location: string, platform: Platform = "other"): string {
  const q = encodeURIComponent(location.trim());
  switch (platform) {
    case "ios":
      return `https://maps.apple.com/?q=${q}`;
    case "android":
      return `geo:0,0?q=${q}`;
    default:
      return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
}

// Markham, to rank nearby places first.
const BIAS = { lat: 43.8561, lon: -79.337 };

export function photonUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    limit: "5",
    lang: "en",
    lat: String(BIAS.lat),
    lon: String(BIAS.lon),
  });
  return `https://photon.komoot.io/api/?${params}`;
}

type PhotonProps = {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  state?: string;
};

/** "Aaniin Community Centre, 5665 14th Avenue, Markham" from a Photon result. */
function formatPlace(p: PhotonProps): string {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const parts = [p.name, street, p.city ?? p.state].filter((x): x is string => Boolean(x));
  return [...new Set(parts)].join(", ");
}

export function parsePhoton(data: unknown): string[] {
  const features = (data as { features?: { properties?: PhotonProps }[] })?.features ?? [];
  return [...new Set(features.map((f) => formatPlace(f.properties ?? {})).filter(Boolean))];
}
