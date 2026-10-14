"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";
import { formatPhoneAsTyped } from "@/lib/input";

/** Formats as you type: "4165550100" -> "(416) 555-0100". Numbers starting with "+" (other than +1) are left international. */
export function PhoneInput({ name, defaultValue, required }: { name: string; defaultValue?: string; required?: boolean }) {
  const [value, setValue] = useState(() => formatPhoneAsTyped(defaultValue ?? ""));

  return (
    <input
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      required={required}
      maxLength={20}
      placeholder="(416) 555-0100"
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        // Let backspace remove the formatting characters instead of fighting the user.
        const deleting = next.length < value.length;
        setValue(deleting ? next : formatPhoneAsTyped(next));
      }}
      onBlur={() => setValue((v) => (v ? formatPhoneAsTyped(v) : v))}
      className={inputClass}
    />
  );
}
