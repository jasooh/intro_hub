import sanitizeHtml from "sanitize-html";

// Host posts are written in a rich text editor and stored as HTML. Only this
// small set of tags survives, on save and again before rendering or emailing.

const SAFE_HREF = /^(https?:|mailto:)/i;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "u", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "a"],
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["https", "http", "mailto"],
  transformTags: {
    b: "strong",
    i: "em",
    // Safe links open in a new tab; anything else (javascript:, data:, no href) becomes plain text.
    a: (_tag, attribs): sanitizeHtml.Tag =>
      SAFE_HREF.test(attribs.href ?? "")
        ? { tagName: "a", attribs: { href: attribs.href, rel: "noopener noreferrer", target: "_blank" } }
        : { tagName: "span", attribs: {} },
  },
};

export function sanitizePostHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** Plain-text preview of a post body. */
export function postExcerpt(html: string, max = 160): string {
  const text = sanitizeHtml(html.replace(/<\/(p|h2|h3|li|blockquote)>/g, " "), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** True when the editor produced nothing but empty paragraphs. */
export function isEmptyPost(html: string): boolean {
  return postExcerpt(html, 10_000).length === 0;
}
