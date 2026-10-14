"use client";

import { useEffect, useId, useRef, useState } from "react";
import { inputClass } from "@/components/ui";
import { mapUrl, parsePhoton, photonUrl } from "@/lib/maps";

/**
 * Location field with address suggestions as you type. Free text still works
 * (e.g. add ", Gym 2"); picking a suggestion fills in the full street address
 * so the map link on the session page lands in the right place.
 */
export function LocationInput({
  name,
  defaultValue,
  required,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(photonUrl(q), { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          setResults(parsePhoton(data));
          setActive(-1);
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const shown = open && query.trim().length >= 3 ? results : [];

  function pick(place: string) {
    setValue(place);
    setOpen(false);
    setQuery("");
  }

  return (
    <div>
      <div className="relative">
        <input
          name={name}
          value={value}
          required={required}
          maxLength={200}
          autoComplete="off"
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `${listId}-${active}` : undefined
          }
          placeholder="Search a place or address"
          className={inputClass}
          onChange={(e) => {
            setValue(e.target.value);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => clearTimeout(blurTimer.current)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => {
            if (!shown.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % shown.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i <= 0 ? shown.length - 1 : i - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(shown[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {shown.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 top-full z-20 mt-1 divide-y divide-ink/20 border-2 border-ink bg-maple shadow-[4px_4px_0_var(--ink)]"
          >
            {shown.map((place, i) => (
              <li
                key={place}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(place)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-maple-deep" : "hover:bg-maple-deep/60"}`}
              >
                {place}
              </li>
            ))}
            <li className="px-3 py-1 text-right text-[10px] text-ink-soft">
              © OpenStreetMap contributors
            </li>
          </ul>
        )}
      </div>
      {value.trim() && (
        <a
          href={mapUrl(value)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs font-semibold text-mat underline underline-offset-2"
        >
          Check on map ↗
        </a>
      )}
    </div>
  );
}
