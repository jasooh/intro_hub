"use client";

import { MapPin } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MAP_APPS, mapUrl } from "@/lib/maps";

/** The location as a tappable link that asks which map app to open it in. */
export function MapLink({ location, className }: { location: string; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-baseline gap-1.5 text-left underline decoration-line decoration-2 underline-offset-4 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-line ${className ?? ""}`}
      >
        <MapPin className="size-4 shrink-0 translate-y-0.5 text-line" aria-hidden />
        {location}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-none border-2 p-1.5 shadow-[4px_4px_0_var(--ink)]">
        <DropdownMenuLabel className="font-display text-xs font-bold tracking-[0.15em] uppercase">Open in</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MAP_APPS.map(({ app, label }) => (
          <DropdownMenuItem key={app} asChild>
            <a href={mapUrl(app, location)} target="_blank" rel="noreferrer">
              {label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
