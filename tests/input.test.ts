import { describe, expect, it } from "vitest";
import { cleanName, cleanNameList, cleanText, formatPhoneAsTyped, normalizePhone } from "@/lib/input";
import { mapUrl } from "@/lib/maps";

describe("normalizePhone", () => {
  it.each([
    ["416-555-0100", "(416) 555-0100"],
    ["4165550100", "(416) 555-0100"],
    ["(416) 555 0100", "(416) 555-0100"],
    ["+1 416 555 0100", "(416) 555-0100"],
    ["1-416-555-0100", "(416) 555-0100"],
    ["  647.555.0199 ", "(647) 555-0199"],
    ["+44 20 7123 4567", "+442071234567"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizePhone(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "555-0100", "41655501001234", "(016) 555-0100", "(416) 055-0100", "+44 12", "call me"])(
    "rejects %j",
    (raw) => {
      expect(normalizePhone(raw).ok).toBe(false);
    },
  );
});

describe("formatPhoneAsTyped", () => {
  it.each([
    ["", ""],
    ["4", "(4"],
    ["416", "(416"],
    ["4165", "(416) 5"],
    ["416555", "(416) 555"],
    ["4165550", "(416) 555-0"],
    ["4165550100", "(416) 555-0100"],
    ["41655501009999", "(416) 555-0100"],
    ["+1 416 555 0100", "(416) 555-0100"],
    ["+44 20", "+4420"],
  ])("%j -> %j", (raw, expected) => {
    expect(formatPhoneAsTyped(raw)).toBe(expected);
  });

  it("re-formatting an already formatted value is stable", () => {
    expect(formatPhoneAsTyped("(416) 555-0100")).toBe("(416) 555-0100");
  });
});

describe("cleanText", () => {
  it("tidies spaces and blank lines but keeps line breaks", () => {
    expect(cleanText("  hello   world \r\n\r\n\r\n\n second\tline  ")).toBe("hello world\n\nsecond line");
  });
});

describe("cleanName", () => {
  it.each([
    ["  jane   doe ", "jane doe"],
    ["José Álvarez", "José Álvarez"],
    ["Mary-Kate O'Neil", "Mary-Kate O'Neil"],
    ["Dr. Kim", "Dr. Kim"],
  ])("accepts %j", (raw, expected) => {
    expect(cleanName(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "   ", "J4ne", "<script>", "-dash", "jane@doe"])("rejects %j", (raw) => {
    expect(cleanName(raw).ok).toBe(false);
  });
});

describe("cleanNameList", () => {
  it("splits, trims, de-duplicates case-insensitively and caps the list", () => {
    expect(cleanNameList(" JANE DOE , jane doe; J  Doe\nJane D,,")).toEqual(["JANE DOE", "J Doe", "Jane D"]);
    expect(cleanNameList("a,b,c,d,e,f,g")).toHaveLength(5);
  });
});

describe("mapUrl", () => {
  it("encodes the location for each app", () => {
    const loc = "Aaniin Community Centre, 5665 14th Ave, Markham";
    expect(mapUrl("google", loc)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Aaniin%20Community%20Centre%2C%205665%2014th%20Ave%2C%20Markham",
    );
    expect(mapUrl("apple", loc)).toMatch(/^https:\/\/maps\.apple\.com\/\?q=Aaniin%20/);
    expect(mapUrl("waze", loc)).toMatch(/^https:\/\/waze\.com\/ul\?q=Aaniin%20.*&navigate=yes$/);
  });
});
