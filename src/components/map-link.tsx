"use client";

import { MapPin } from "lucide-react";
import { useSyncExternalStore } from "react";
import { detectPlatform, mapUrl, type Platform } from "@/lib/maps";

const noop = () => () => {};

/** The location as a plain link; the phone decides which maps app opens it. */
export function MapLink({ location, className }: { location: string; className?: string }) {
  const platform = useSyncExternalStore<Platform>(
    noop,
    () => detectPlatform(navigator.userAgent),
    () => "other",
  );
  const href = mapUrl(location, platform);
  const web = href.startsWith("http");

  return (
    <a
      href={href}
      target={web ? "_blank" : undefined}
      rel={web ? "noreferrer" : undefined}
      className={`inline-flex items-baseline gap-1.5 underline decoration-line decoration-2 underline-offset-4 hover:text-ink ${className ?? ""}`}
    >
      <MapPin className="size-4 shrink-0 translate-y-0.5 text-line" aria-hidden />
      {location}
    </a>
  );
}
