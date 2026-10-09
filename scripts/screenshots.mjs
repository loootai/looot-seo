#!/usr/bin/env node
// Takes the README screenshots from a running demo server with headless Chrome.
// Uses only Node built-ins (Node 22+) and the Chrome DevTools protocol, no browser package.
//   NEXT_PUBLIC_DEMO=1 npm run build && NEXT_PUBLIC_DEMO=1 node_modules/.bin/next start -p 4633
// The three login shots need a second server without NEXT_PUBLIC_DEMO (demo mode redirects /login to /).
//   node scripts/screenshots.mjs http://localhost:4633 docs/screenshots [name-filter]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:4633";
const out = process.argv[3] ?? "docs/screenshots";
const only = process.argv[4];
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.CDP_PORT ?? 9361);
const D = { w: 1440, h: 900, mobile: false };
const M = { w: 390, h: 844, mobile: true };

const click = (text, sel = "button,a,[role=tab],[role=radio]") => `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.offsetParent !== null && e.textContent.trim().startsWith(${JSON.stringify(text)})); if (!el) return "missing: ${text}"; el.click(); return "ok"; })()`;
// Radix tabs switch on mousedown, not on click.
const press = (text) => `(() => { const el = [...document.querySelectorAll("[role=tab]")].find((e) => e.offsetParent !== null && e.textContent.trim().startsWith(${JSON.stringify(text)})); if (!el) return "missing: ${text}"; el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); return "ok"; })()`;
const key = (k) => `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)}, bubbles: true }))`;

/** name, path, viewport, steps run after load (strings are evaluated, numbers are waits in ms). */
const P = "/p/kestrel";
const SHOTS = [
  ["projects", "/", D],
  ["overview", P, D],
  ["rankings", `${P}/rankings`, D],
  ["rankings-by-date", `${P}/rankings`, D, [click("By date"), 400]],
  ["keyword-detail", `${P}/rankings?kw=kes-01`, D, [900]],
  ["quote", `${P}/rankings`, D, [click("Check rankings"), 1200]],
  ["serp", `${P}/serp/kes-01`, D],
  ["serp-index", `${P}/serp`, D],
  ["research", `${P}/research`, D],
  ["competitors", `${P}/competitors`, D],
  ["competitors-shared", `${P}/competitors`, { ...D, h: 1400 }, [press("All shared keywords"), 400]],
  ["backlinks", `${P}/backlinks`, D],
  ["costs", `${P}/costs`, D],
  ["costs-run", `${P}/costs`, { ...D, h: 1500 }, [click("", "tbody tr button[aria-expanded]"), 900]],
  ["costs-all", "/costs", D],
  ["settings", "/settings", D],
  ["palette", P, D, [`window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))`, 400]],
  ["shortcuts", P, D, [key("?"), 400]],
  ["new-project", "/?new=1", D, [600]],
  ["projects-empty", "/?state=empty", D],
  ["overview-empty", "/p/loomwork", D],
  ["rankings-loading", `${P}/rankings?state=loading`, D],
  ["rankings-error", `${P}/rankings?state=error`, D],
  ["backlinks-empty", "/p/fernhill/backlinks", D],
  ["competitors-empty", `${P}/competitors?state=empty`, D],
  ["costs-empty", "/p/loomwork/costs?state=empty", D],
  ["projects-dark", "/?theme=dark", D, [500]],
  ["overview-dark", `${P}?theme=dark`, D, [500]],
  ["rankings-dark", `${P}/rankings?theme=dark`, D, [500]],
  ["serp-dark", `${P}/serp/kes-01?theme=dark`, D, [500]],
  ["research-dark", `${P}/research?theme=dark`, D, [500]],
  ["competitors-dark", `${P}/competitors?theme=dark`, D, [500]],
  ["backlinks-dark", `${P}/backlinks?theme=dark`, D, [500]],
  ["costs-dark", `${P}/costs?theme=dark`, D, [500]],
  ["settings-dark", "/settings?theme=dark", D, [500]],
  ["m-projects", "/?theme=light", M],
  ["m-overview", P, M],
  ["m-rankings", `${P}/rankings`, M],
  ["m-quote", `${P}/rankings`, M, [click("Check rankings"), 1200]],
  ["m-serp", `${P}/serp/kes-01`, M],
  ["m-research", `${P}/research`, M],
  ["m-competitors", `${P}/competitors`, M],
  ["m-backlinks", `${P}/backlinks`, M],
  ["m-costs", `${P}/costs`, M],
  ["m-settings", "/settings", M],
  ["m-overview-dark", `${P}?theme=dark`, M, [500]],
  // This one changes the in-memory demo data, so it runs after every other demo shot.
  ["run-done", `${P}/rankings`, D, [click("Check rankings"), 1200, click("Simulate run"), 6000]],
  ["login", "/login", D],
  ["login-dark", "/login?theme=dark", D, [500]],
  ["m-login", "/login", M],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(path.join(tmpdir(), "seo-shots-"));
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const stop = () => {
  proc.kill();
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Chrome may still be writing its profile. The OS clears the temp folder later.
  }
};
process.on("exit", stop);

let ws;
for (let i = 0; i < 50 && !ws; i++) {
  await sleep(200);
  try {
    const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  } catch { ws = undefined; }
}
if (!ws) throw new Error("Chrome did not start");
let id = 0;
const waiting = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const n = ++id;
  waiting.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});

mkdirSync(out, { recursive: true });
const report = [];
for (const [name, url, vp, steps = []] of SHOTS) {
  if (only ? !name.includes(only) : name.includes("login")) continue;
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile });
  if (vp.mobile) await s("Emulation.setTouchEmulationEnabled", { enabled: true });
  await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: url.includes("theme=dark") ? "dark" : "light" }] });
  await s("Page.navigate", { url: base + url });
  await sleep(1800);
  const notes = [];
  for (const step of steps) {
    if (typeof step === "number") await sleep(step);
    else {
      const r = await s("Runtime.evaluate", { expression: step, returnByValue: true });
      if (typeof r.result.value === "string" && r.result.value.startsWith("missing")) notes.push(r.result.value);
      await sleep(250);
    }
  }
  const overflow = await s("Runtime.evaluate", { expression: "document.documentElement.scrollWidth - window.innerWidth", returnByValue: true });
  if (overflow.result.value > 0) notes.push(`page scrolls sideways by ${overflow.result.value}px`);
  if (process.env.EVAL) notes.push(JSON.stringify((await s("Runtime.evaluate", { expression: process.env.EVAL, returnByValue: true })).result.value));
  const shot = await s("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
  await send("Target.closeTarget", { targetId });
  report.push(`${name}${notes.length ? `  !! ${notes.join("; ")}` : ""}`);
}
console.log(report.join("\n"));
ws.close();
stop();
process.exit(0);
