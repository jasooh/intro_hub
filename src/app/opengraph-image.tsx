import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

// Share preview (iMessage, Instagram DMs, WhatsApp...): the home page hero as a card.
export const alt = `${SITE.club}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));
const [display, score, body] = await Promise.all([
  font("BigShoulders-Black.ttf"),
  font("Doto-Black.ttf"),
  font("AtkinsonHyperlegibleNext-Regular.ttf"),
]);

export default function Image() {
  const c = SITE.colors;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: c.maple }}>
        <div style={{ height: 10, background: c.line }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "48px 72px 56px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: "Big Shoulders", fontSize: 28, letterSpacing: 7, color: c.line }}>
              {SITE.tagline.toUpperCase()}
            </div>
            <div style={{ fontFamily: "Big Shoulders", fontSize: 40, color: c.ink, display: "flex" }}>
              INTRO<span style={{ color: c.line }}>/</span>HUB
            </div>
          </div>
          <div
            style={{
              fontFamily: "Big Shoulders",
              fontSize: 176,
              lineHeight: 0.82,
              color: c.ink,
              marginTop: 36,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>INTRO 2</span>
            <span style={{ display: "flex" }}>
              VOLLEY<span style={{ color: c.line }}>BALL</span>
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontFamily: "Atkinson", fontSize: 30, color: "#5b4f45" }}>{SITE.location}</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                background: c.board,
                padding: "14px 26px",
                boxShadow: `8px 8px 0 ${c.line}`,
              }}
            >
              <div style={{ fontFamily: "Doto", fontSize: 52, color: c.led, letterSpacing: 3 }}>SIGN UP</div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Big Shoulders", data: display, weight: 900 },
        { name: "Doto", data: score, weight: 900 },
        { name: "Atkinson", data: body, weight: 400 },
      ],
    },
  );
}
