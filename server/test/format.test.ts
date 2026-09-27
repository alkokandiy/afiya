import { describe, expect, it } from "vitest";
import { escapeHtml, formatCustomer, formatLocation } from "../src/format.js";

describe("format", () => {
  it("escapes HTML in user input", () => {
    expect(escapeHtml("<b>Ali & _Vali_*</b>")).toBe("&lt;b&gt;Ali &amp; _Vali_*&lt;/b&gt;");
  });

  it("formats GPS locations instead of printing [object Object]", () => {
    const text = formatLocation({ kind: "geo", latitude: 40.47271, longitude: 70.994328 });
    expect(text).toContain("GPS (40.47271, 70.99433)");
    expect(text).toContain("https://maps.google.com/?q=40.47271%2C70.994328");
    expect(text).not.toContain("[object Object]");
  });

  it("formats text addresses with a maps link", () => {
    expect(formatLocation({ kind: "text", address: "Qo'qon <markaz>" })).toBe(
      `Qo'qon &lt;markaz&gt; — <a href="https://maps.google.com/?q=Qo'qon%20%3Cmarkaz%3E">xaritada</a>`,
    );
  });

  it("escapes every customer field", () => {
    const text = formatCustomer({ name: "<i>x</i>", phone: "+998", location: { kind: "text", address: "a&b" } });
    expect(text).toContain("&lt;i&gt;x&lt;/i&gt;");
    expect(text).toContain("a&amp;b");
  });
});
