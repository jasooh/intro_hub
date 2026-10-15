import { describe, expect, it } from "vitest";
import { isEmptyPost, postExcerpt, sanitizePostHtml } from "@/lib/rich-text";

describe("sanitizePostHtml", () => {
  it("keeps the editor's formatting", () => {
    const html = "<h2>Gym change</h2><p><strong>Bold</strong> and <em>italic</em></p><ul><li>One</li></ul><blockquote><p>Q</p></blockquote>";
    expect(sanitizePostHtml(html)).toBe(html);
  });

  it("strips scripts, event handlers, styles and javascript: links", () => {
    const out = sanitizePostHtml(
      `<p onclick="x()" style="color:red">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">bad</a><img src=x onerror=y>`,
    );
    expect(out).toBe("<p>Hi</p>bad");
  });

  it("makes links open safely in a new tab", () => {
    expect(sanitizePostHtml(`<a href="https://example.com">site</a>`)).toBe(
      `<a href="https://example.com" rel="noopener noreferrer" target="_blank">site</a>`,
    );
  });
});

describe("postExcerpt / isEmptyPost", () => {
  it("turns HTML into a short plain-text preview", () => {
    expect(postExcerpt("<h2>Title</h2><p>Hello &amp; welcome</p>")).toBe("Title Hello & welcome");
    expect(postExcerpt(`<p>${"word ".repeat(80)}</p>`, 20)).toMatch(/…$/);
  });

  it("treats an empty editor as empty", () => {
    expect(isEmptyPost("<p></p>")).toBe(true);
    expect(isEmptyPost("<p> </p><p><br></p>")).toBe(true);
    expect(isEmptyPost("<p>Hi</p>")).toBe(false);
  });
});
