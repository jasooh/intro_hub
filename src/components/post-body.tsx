import { sanitizePostHtml } from "@/lib/rich-text";

/** A post's rich text, sanitized again at render time. */
export function PostBody({ html, className }: { html: string; className?: string }) {
  return <div className={`prose-post ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: sanitizePostHtml(html) }} />;
}
