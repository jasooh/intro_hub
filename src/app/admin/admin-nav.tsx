"use client";

import { GroupedBoardNav } from "@/components/board-nav";
import { HOST_GROUPS } from "@/lib/host-pages";

export function AdminNav() {
  return <GroupedBoardNav groups={HOST_GROUPS} root="/admin" rootAlso={["/admin/sessions"]} />;
}
