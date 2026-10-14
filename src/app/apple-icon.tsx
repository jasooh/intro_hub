import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Home-screen icon for iPhones: the same ball as icon.svg, as a PNG.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const svg = await readFile(join(process.cwd(), "src/app/icon.svg"), "base64");

export default function AppleIcon() {
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`data:image/svg+xml;base64,${svg}`} width={180} height={180} alt="" />,
    size,
  );
}
