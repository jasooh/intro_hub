import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.appUrl();
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/sessions`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/updates`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/legal/waiver`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/legal/media-release`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
