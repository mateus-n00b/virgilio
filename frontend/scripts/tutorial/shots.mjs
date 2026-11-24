// Prints do tutorial: entra como a usuária fictícia, marca os pontos numerados e fotografa.
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = "http://localhost:3123";
const OUT = process.argv[2] ?? new URL("./out", import.meta.url).pathname;
const ONLY = process.argv[3];
const seed = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url)));

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 920, height: 900 }, deviceScaleFactor: 2, locale: "pt-BR", colorScheme: "light", timezoneId: "America/Fortaleza" });

async function page(path, { login = true, a11y } = {}) {
  const p = await ctx.newPage();
  await p.goto(BASE + "/ajuda");
  await p.evaluate(
    ([t, a]) => {
      if (t) localStorage.setItem("virgilio.token", t);
      else localStorage.removeItem("virgilio.token");
      if (a) localStorage.setItem("virgilio.a11y", JSON.stringify(a));
      else localStorage.removeItem("virgilio.a11y");
    },
    [login ? seed.lucia : null, a11y ?? null],
  );
  await p.goto(BASE + path);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(400);
  return p;
}

/** Bolinhas numeradas ao lado dos elementos (mesma numeração do texto do tutorial). */
async function mark(p, locators) {
  for (const [i, loc] of locators.entries()) {
    const above = loc.above === true;
    const el = (loc.loc ?? loc).first();
    await el.waitFor({ timeout: 8000 });
    await el.evaluate((node, [n, above]) => {
      const box = node.getBoundingClientRect();
      const r = document.createRange();
      r.selectNodeContents(node);
      const t = r.getBoundingClientRect();
      const text = t.width > 0 ? t : box;
      let x, y;
      if (above) { x = box.left + box.width * 0.15 - 17; y = box.top + box.height * 0.15 - 17; }
      else if (box.left - 44 >= 4) { x = box.left - 44; y = box.top + Math.min(box.height / 2, 20) - 17; }
      else { x = text.right + 10; y = text.top + text.height / 2 - 17; }
      const d = document.createElement("div");
      d.textContent = String(n);
      Object.assign(d.style, {
        position: "absolute", left: `${x + scrollX}px`, top: `${y + scrollY}px`, width: "34px", height: "34px", borderRadius: "50%",
        background: "#a8741a", color: "#fff", font: "800 18px/34px Inter, system-ui, sans-serif", textAlign: "center",
        boxShadow: "0 0 0 3px #fff, 0 4px 12px rgba(0,0,0,.35)", zIndex: 9999, pointerEvents: "none",
      });
      document.body.appendChild(d);
    }, [i + 1, above]);
  }
}

async function shot(p, name, top, height) {
  const y = typeof top === "number" ? top : (await top.first().boundingBox()).y + (await p.evaluate(() => scrollY)) - 16;
  await p.evaluate(() => scrollTo(0, 0));
  await p.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: Math.max(0, y), width: 920, height }, fullPage: true });
  console.log("ok", name);
  await p.close();
}

const jobs = {
  async entrar() {
    const p = await page("/entrar?criar=1", { login: false });
    await mark(p, [p.locator("form label").first(), p.locator("form button.btn").first()]);
    await shot(p, "entrar", 0, 760);
  },
  async "prova-de-vida"() {
    const p = await page("/");
    await mark(p, [
      { loc: p.locator("button.checkin"), above: true },
      p.locator("label", { hasText: "Compartilhar minha localização atual" }),
      p.locator(".when"),
      p.getByRole("button", { name: /Pedir ajuda/ }),
    ]);
    await shot(p, "prova-de-vida", 0, 900);
  },
  async virgilios() {
    const p = await page("/virgilios");
    await mark(p, [p.getByRole("button", { name: "Gerar link de convite" }), p.getByRole("heading", { name: /cadastre a pessoa/ }), p.getByText("Convite pendente").first()]);
    await shot(p, "virgilios", 0, 1200);
  },
  async instrucoes() {
    const p = await page("/instrucoes");
    await mark(p, [p.locator("label[for=i-title]"), p.getByRole("button", { name: "Adicionar" })]);
    await shot(p, "instrucoes", 0, 1290);
  },
  async protegidos() {
    const p = await page("/protegidos");
    await mark(p, [p.locator("a.person h3").first()]);
    await shot(p, "protegidos", 0, 400);
  },
  async alerta() {
    const p = await page(`/protegidos/${seed.antonio_token}`);
    await mark(p, [
      p.getByRole("heading", { name: /não dá sinal de vida/ }),
      p.getByRole("heading", { name: /^Contato de/ }),
      p.getByRole("heading", { name: /^Instruções de/ }),
    ]);
    await shot(p, "alerta", 0, 1300);
  },
  async conta() {
    const p = await page("/conta");
    await mark(p, [p.locator("label[for=interval]"), p.locator("label[for=grace]"), p.getByText("Pausa", { exact: true })]);
    await shot(p, "conta", p.getByRole("heading", { name: "Ciclo de prova de vida" }), 760);
  },
  async leitura() {
    const p = await page("/", { a11y: { text: "grande", contrast: false } });
    await p.locator(".a11y-btn").click();
    await p.waitForTimeout(200);
    await mark(p, [p.locator(".a11y-btn"), p.locator(".a11y-sizes"), p.locator(".a11y-contrast")]);
    await shot(p, "leitura", 0, 640);
  },
};

for (const [name, fn] of Object.entries(jobs)) if (!ONLY || ONLY.split(",").includes(name)) await fn();
await browser.close();
