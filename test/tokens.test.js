import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Contrast regression test for the shared design tokens.
 *
 * This exists because `--text-faint` shipped at 3.64:1 on dark and 3.23:1 on
 * light — both below WCAG AA for body text — and nobody noticed until it was
 * measured. Eyeballing a colour is not a check; this is.
 *
 * Rule: any token whose name starts with `--text` must reach 4.5:1 against every
 * surface it can sit on. Non-text decoration belongs in `--line`, which is
 * deliberately not covered here.
 */

const css = readFileSync(new URL("../assets/tokens.css", import.meta.url), "utf8");

/** Split the file into the base (:root, dark) and the [data-theme="light"] block. */
function blocks(source) {
  const lightAt = source.indexOf('[data-theme="light"]');
  assert.ok(lightAt > 0, "tokens.css must define a [data-theme=\"light\"] block");
  return {
    dark: source.slice(0, lightAt),
    light: source.slice(lightAt),
  };
}

function tokens(source) {
  const found = new Map();
  for (const [, name, value] of source.matchAll(/(--[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    found.set(name, value.toLowerCase());
  }
  return found;
}

function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const { dark, light } = blocks(css);

for (const [theme, block] of Object.entries({ dark, light })) {
  const set = tokens(block);
  const surfaces = [...set.entries()]
    .filter(([name]) => name.startsWith("--bg") || name.startsWith("--surface"))
    .filter(([, value]) => !value.endsWith("e6")) // veils are translucent overlays
    .map(([name, value]) => ({ name, value }));

  const textTokens = [...set.entries()].filter(([name]) => name.startsWith("--text"));

  test(`${theme}: every --text token meets WCAG AA (4.5:1) on every surface`, () => {
    assert.ok(textTokens.length >= 3, `${theme} theme should define text tokens`);
    assert.ok(surfaces.length >= 2, `${theme} theme should define at least two surfaces`);

    const failures = [];
    for (const [textName, textValue] of textTokens) {
      for (const surface of surfaces) {
        const value = ratio(textValue, surface.value);
        if (value < 4.5) {
          failures.push(`${textName} ${textValue} on ${surface.name} ${surface.value} = ${value.toFixed(2)}:1`);
        }
      }
    }
    assert.deepEqual(failures, [], `contrast failures:\n  ${failures.join("\n  ")}`);
  });
}

test("the two apps share one token file", () => {
  // A drift check: if this repo's copy is edited without the sibling app, the
  // numbers diverge and the products stop looking like one body of work.
  assert.ok(css.includes("--accent") && css.includes("--surface-sunken"));
});
