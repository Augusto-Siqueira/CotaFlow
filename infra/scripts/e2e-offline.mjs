// Teste automático do modo OFFLINE do app do motorista, num Chrome de verdade
// (invisível, perfil temporário), contra o ambiente LOCAL (npm run local).
//
//   node infra/scripts/e2e-offline.mjs
//
// Requisitos: Docker com a pilha local ligada, site de PRODUÇÃO local na porta
// 3101 (next build + next start com as variáveis do infra/.env) e o Chrome
// instalado. O teste desliga e religa o site e o servidor de dados: é o "sem
// sinal" de verdade, não uma simulação do navegador.
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SITE = "http://localhost:3101";
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!CHROME) throw new Error("Chrome/Edge não encontrado.");

const env = Object.fromEntries(
  readFileSync(join(ROOT, "infra/.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const users = JSON.parse(readFileSync(join(ROOT, "infra/.local-users.json"), "utf8"));
const driver = users.motorista;

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "OK   " : "FALHA"} ${name}${cond ? "" : " " + extra}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 30000, step = 500) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() > end) return null;
    await sleep(step);
  }
}
const psql = (sql) =>
  execSync(`docker exec cotaflow-infra-db-1 psql -U supabase_admin -d postgres -At -c "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).trim();

// ---------- controle do site e do servidor de dados ----------
function stopSite() {
  execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3101 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`);
}
async function startSite() {
  const child = spawn("npx", ["next", "start", "-p", "3101"], {
    cwd: ROOT,
    shell: true,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      NEXT_PUBLIC_CAPTCHA_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: env.PUBLIC_API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
    },
  });
  child.unref();
  await waitFor(async () => (await fetch(`${SITE}/login`)).ok, 40000, 1000);
}
const gateway = (cmd) => execSync(`docker ${cmd} cotaflow-infra-gateway-1`, { stdio: "ignore" });

// ---------- Chrome por CDP ----------
const profile = mkdtempSync(join(tmpdir(), "cotaflow-e2e-"));
const port = 9333;
const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--window-size=400,900", "about:blank"], { stdio: "ignore" });
let ws;
let seq = 0;
const pending = new Map();
async function connect() {
  const list = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"), 20000);
  ws = new WebSocket(list.webSocketDebuggerUrl);
  await new Promise((res) => (ws.onopen = res));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (d) => (d.error ? reject(new Error(d.error.message)) : resolve(d.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
async function js(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "erro no script da página");
  return r.result.value;
}
async function go(url) {
  await send("Page.navigate", { url });
  await sleep(1500);
  await waitFor(() => js("document.readyState === 'complete'"), 20000, 300);
}
const text = () => js("document.body.innerText");
async function setValue(selector, value) {
  await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
async function attachPhoto(selector) {
  const jpegPath = join(profile, "odometro.jpg");
  writeFileSync(jpegPath, Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64"));
  const { root } = await send("DOM.getDocument");
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
  await send("DOM.setFileInputFiles", { nodeId, files: [jpegPath] });
}
const outboxRows = () =>
  js(`new Promise((res) => { const r = indexedDB.open('cotaflow-offline'); r.onsuccess = () => { const q = r.result.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => res(q.result.map(i => ({ id: i.id, status: i.status, reason: i.reason, photos: i.photos.length, uploaded: (i.uploaded||[]).length, plate: i.payload.plate }))); }; })`);

async function fillFuelForm({ plate, km, liters }) {
  await waitFor(() => js("!!document.getElementById('ab-placa')"), 15000);
  await setValue("#ab-placa", plate);
  await setValue("#ab-km", String(km));
  await setValue("#ab-litros", String(liters));
  await attachPhoto("input[type=file]");
  await waitFor(() => js("document.body.innerText.includes('Foto 1')"), 10000);
  await js("document.querySelector('form').requestSubmit()");
}

// ====================== roteiro ======================
try {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");

  console.log("\n== 1) Login e guardar o app no celular");
  await go(`${SITE}/login`);
  await setValue('input[type="text"]', driver.login);
  await setValue('input[type="password"]', driver.password);
  await js("document.querySelector('form').requestSubmit()");
  check("login do motorista", await waitFor(async () => (await js("location.pathname")) === "/motorista", 20000));
  const warmed = await waitFor(() => js("!!localStorage.getItem('cotaflow:warm-at')"), 90000, 1000);
  check("service worker assumiu o controle", await js("!!navigator.serviceWorker.controller"));
  check("telas do app baixadas (aquecimento)", warmed);
  const pages = await js("caches.open('cotaflow-pages-v2').then(c => c.keys()).then(k => k.map(r => new URL(r.url).pathname))");
  check("telas do motorista guardadas", ["/motorista", "/motorista/abastecimento", "/motorista/checklist", "/motorista/defeito", "/motorista/entrega"].every((p) => pages.includes(p)), JSON.stringify(pages));
  check("identidade guardada para uso offline", await js("!!localStorage.getItem('cotaflow:identity')"));
  // dados de apoio da tela de abastecimento ficam guardados depois de visitá-la com sinal
  await go(`${SITE}/motorista/abastecimento`);
  check("abastecimento carrega com sinal", await waitFor(async () => (await text()).includes("Registre cada abastecimento"), 20000));
  await sleep(2500);

  console.log("\n== 2) SEM SINAL de verdade: site e servidor de dados desligados");
  stopSite();
  gateway("stop");
  await sleep(1500);
  await go(`${SITE}/motorista`);
  const homeOffline = await waitFor(async () => (await text()).includes("O que você precisa fazer?"), 20000);
  check("tela inicial abre sem internet", homeOffline);
  check("faixa 'Sem internet' aparece", await waitFor(async () => (await text()).includes("Sem internet"), 20000));
  await go(`${SITE}/motorista/abastecimento`);
  check("tela de abastecimento abre sem internet", await waitFor(async () => (await text()).includes("Registre cada abastecimento"), 20000));
  check("ainda logado (sem ir para o login)", (await js("location.pathname")) === "/motorista/abastecimento");

  console.log("\n== 2b) Token de login VENCIDO e sem sinal (acontece 1 hora depois de abrir o app)");
  const { cookies } = await send("Network.getCookies", { urls: [SITE] });
  const authCookies = cookies.filter((c) => /auth-token/.test(c.name));
  if (authCookies.length === 1 && authCookies[0].value.startsWith("base64-")) {
    const c = authCookies[0];
    const session = JSON.parse(Buffer.from(c.value.slice(7), "base64url").toString("utf8"));
    session.expires_at = Math.floor(Date.now() / 1000) - 3600;
    await send("Network.setCookie", {
      name: c.name,
      value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      url: SITE,
      path: c.path,
      expires: c.expires,
      sameSite: c.sameSite,
    });
    await go(`${SITE}/motorista/abastecimento`);
    check(
      "com token vencido, o app continua abrindo sem ir para o login",
      await waitFor(async () => (await text()).includes("Registre cada abastecimento"), 20000),
      (await text()).slice(0, 200)
    );
    check("usa a identidade guardada (sem a tela de 'Área do motorista')", !(await text()).includes("Entre com o CPF de um motorista"));
  } else {
    check("cookie de login no formato esperado (teste do token vencido)", false, JSON.stringify(authCookies.map((c) => c.name)));
  }

  console.log("\n== 3) Lançar abastecimento com foto, sem sinal");
  const kmOff = 480000 + (Date.now() % 1000);
  await fillFuelForm({ plate: "TST1A11", km: kmOff, liters: "350,5" });
  check("avisa 'salvo no celular'", await waitFor(async () => (await text()).includes("salvo no celular"), 30000), (await text()).slice(0, 300));
  const q1 = await outboxRows();
  check("item ficou na fila com a foto", q1.length === 1 && q1[0].status === "pending" && q1[0].photos === 1, JSON.stringify(q1));

  console.log("\n== 4) Fechar e abrir o app ainda sem sinal: a fila continua");
  await go(`${SITE}/motorista`);
  await waitFor(async () => (await text()).includes("O que você precisa fazer?"), 20000);
  check("tela inicial mostra a Fila de envio", await waitFor(async () => (await text()).includes("Fila de envio"), 15000));
  check("fila ainda tem 1 item", (await outboxRows()).length === 1);

  console.log("\n== 5) O sinal volta: envio automático");
  await startSite();
  gateway("start");
  await sleep(6000);
  await go(`${SITE}/motorista`);
  await js("window.dispatchEvent(new Event('online'))");
  check("fila esvaziou sozinha", await waitFor(async () => (await outboxRows()).length === 0, 90000, 1000));
  const rows = psql(`select count(*), coalesce(max(odometer_km),0), coalesce(max(liters),0) from fuel_entries where odometer_km = ${kmOff}`);
  check("abastecimento chegou ao servidor (1 linha, km e litros certos)", rows === `1|${kmOff}|350.50`, rows);
  const photoRows = psql(`select count(*) from storage.objects where bucket_id='driver-photos' and name in (select unnest(photos) from fuel_entries where odometer_km = ${kmOff})`);
  check("a foto do odômetro chegou ao armazenamento", photoRows === "1", photoRows);
  check("hora de chegada gravada (received_at)", psql(`select received_at is not null from fuel_entries where odometer_km = ${kmOff}`) === "t");

  console.log("\n== 6) Reenvio duplicado não duplica");
  const fuelRow = psql(`select id, photos[1] from fuel_entries where odometer_km = ${kmOff}`).split("|");
  await js(`new Promise((res) => {
    const open = indexedDB.open('cotaflow-offline');
    open.onsuccess = () => {
      const db = open.result;
      const blob = new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' });
      db.transaction('outbox', 'readwrite').objectStore('outbox').put({
        id: ${JSON.stringify(fuelRow[0])}, userId: JSON.parse(localStorage.getItem('cotaflow:identity')).id, kind: 'fuel',
        createdAt: Date.now(), summary: 'Diesel · 350,5 L · TST1A11 (reenvio de teste)', driverName: 'MOT TESTE',
        payload: { id: ${JSON.stringify(fuelRow[0])}, driver_name: 'MOT TESTE', plate: 'TST1A11', fuel_type: 'diesel', fueled_at: new Date().toISOString(), location_type: 'patio', location: null, price_per_liter: null, liters: 350.5, odometer_km: ${kmOff}, full_tank: true, photos: [${JSON.stringify(fuelRow[1])}], notes: null },
        photos: [{ path: ${JSON.stringify(fuelRow[1])}, blob }], uploaded: [], status: 'pending', attempts: 0, nextAttemptAt: 0
      }).transaction.oncomplete = () => res(true);
    };
  })`);
  await js("window.dispatchEvent(new Event('online'))");
  check("reenvio do mesmo item some da fila", await waitFor(async () => (await outboxRows()).length === 0, 60000, 1000));
  check("continua só 1 linha no servidor (sem duplicar)", psql(`select count(*) from fuel_entries where odometer_km = ${kmOff}`) === "1");

  console.log("\n== 7) Item recusado pelo servidor: motorista e equipe são avisados");
  const badId = "11111111-2222-4333-8444-555555555555";
  await js(`new Promise((res) => {
    const open = indexedDB.open('cotaflow-offline');
    open.onsuccess = () => {
      const blob = new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' });
      const uid = JSON.parse(localStorage.getItem('cotaflow:identity')).id;
      open.result.transaction('outbox', 'readwrite').objectStore('outbox').put({
        id: ${JSON.stringify(badId)}, userId: uid, kind: 'fuel', createdAt: Date.now(), summary: 'Diesel · 100 L · ZZZ9Z99', driverName: 'MOT TESTE',
        payload: { id: ${JSON.stringify(badId)}, driver_name: 'MOT TESTE', plate: 'ZZZ9Z99', fuel_type: 'diesel', fueled_at: new Date().toISOString(), location_type: 'patio', location: null, price_per_liter: null, liters: 100, odometer_km: 999999, full_tank: false, photos: [uid + '/2026-10/recusado-teste.jpg'], notes: null },
        photos: [{ path: uid + '/2026-10/recusado-teste.jpg', blob }], uploaded: [], status: 'pending', attempts: 0, nextAttemptAt: 0
      }).transaction.oncomplete = () => res(true);
    };
  })`);
  await js("window.dispatchEvent(new Event('online'))");
  check("item fica marcado como recusado", await waitFor(async () => (await outboxRows()).some((r) => r.id === badId && r.status === "rejected"), 60000, 1000), JSON.stringify(await outboxRows()));
  check("motivo claro (placa fora da frota)", (await outboxRows()).find((r) => r.id === badId)?.reason?.includes("placa"), JSON.stringify(await outboxRows()));
  const issue = await waitFor(() => psql(`select kind || '|' || coalesce(resolved_at::text, 'aberto') from driver_sync_issues where id = '${badId}'`), 20000);
  check("equipe avisada (registro de ocorrência aberto)", issue === "abastecimento|aberto", String(issue));
  await go(`${SITE}/motorista`);
  check("tela mostra 'Recusado' com as opções", await waitFor(async () => (await text()).includes("Corrigir e lançar de novo"), 20000));
  await js("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Descartar').click()");
  await sleep(600);
  await js("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Descartar' && b.closest('[role=alertdialog],[role=dialog]'))?.click()");
  check("descartar remove da fila", await waitFor(async () => (await outboxRows()).length === 0, 20000));
  check("descartar fecha o aviso da equipe", await waitFor(() => psql(`select resolution from driver_sync_issues where id = '${badId}'`) === "descartado", 20000));
} catch (e) {
  console.log("ERRO no teste:", e.message);
  failures++;
} finally {
  try {
    // deixa o ambiente como estava
    if (!(await fetch(`${SITE}/login`).then((r) => r.ok).catch(() => false))) await startSite();
    execSync("docker start cotaflow-infra-gateway-1", { stdio: "ignore" });
    psql("delete from fuel_entries where odometer_km >= 480000 and plate = 'TST1A11'");
    psql("delete from driver_sync_issues where id = '11111111-2222-4333-8444-555555555555'");
  } catch {}
  chrome.kill();
  console.log(failures === 0 ? "\nTUDO CERTO" : `\n${failures} verificação(ões) falharam`);
  process.exit(failures === 0 ? 0 : 1);
}
