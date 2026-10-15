"use client";

import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui";

/** Downloads the JSON backup, then refreshes so the page sees Reset is unlocked. */
export function BackupLink() {
  const router = useRouter();
  return (
    <a href="/dev-tools/backup" download className={buttonClass("secondary")} onClick={() => setTimeout(() => router.refresh(), 2000)}>
      Download backup
    </a>
  );
}
