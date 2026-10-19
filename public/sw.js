// Service worker do CotaFlow: deixa o app do motorista ABRIR sem internet.
//
// O que ele guarda no celular:
//   - arquivos do app (/_next/static, ícones, fontes): guardados na primeira vez
//     e reaproveitados (nunca mudam, o nome muda a cada versão);
//   - a última versão das telas /motorista/* e /login: tenta a rede primeiro e só
//     usa a cópia se a rede falhar ou demorar demais.
// O que ele NUNCA guarda: chamadas ao servidor de dados (outro endereço), /api e
// nada de outras áreas. As telas são montadas no celular com os dados de apoio
// guardados em outro lugar (IndexedDB), não aqui.

const VERSION = "v2";
const STATIC_CACHE = `cotaflow-static-${VERSION}`;
const PAGES_CACHE = `cotaflow-pages-${VERSION}`;
const NETWORK_TIMEOUT_MS = 5000;
const MAX_STATIC_ENTRIES = 400;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGES_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith("cotaflow-") && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

function isPagePath(path) {
  return path === "/login" || path === "/motorista" || path.startsWith("/motorista/");
}

function isStaticPath(path) {
  return (
    path.startsWith("/_next/static/") ||
    path === "/manifest.webmanifest" ||
    /^\/(icon-\d+|apple-icon|logo)\.(png|svg)$/.test(path) ||
    path === "/favicon.ico"
  );
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200) {
    cache.put(request, res.clone()).then(() => trim(cache, MAX_STATIC_ENTRIES));
  }
  return res;
}

async function networkFirstPage(request, url) {
  const cache = await caches.open(PAGES_CACHE);
  const key = new Request(url.origin + url.pathname); // a cópia vale para qualquer ?parâmetro
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)),
    ]);
    // Só guarda tela de verdade: resposta redirecionada (ex.: para o login) não serve de cópia.
    if (res.ok && res.status === 200 && !res.redirected) cache.put(key, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(key)) || (request.mode === "navigate" ? await cache.match(url.origin + "/motorista") : null);
    if (hit) return hit;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Sem internet</title>" +
        "<body style='font-family:sans-serif;padding:2rem;text-align:center'><h1>Sem internet</h1>" +
        "<p>Abra o aplicativo uma vez com sinal para ele ficar disponível sem internet.</p></body>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // servidor de dados e fotos: sempre pela rede

  // Navegação interna do Next (RSC): sem rede ela falha e o próprio Next recarrega a página inteira,
  // que cai no caso de tela abaixo.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (isStaticPath(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isPagePath(url.pathname)) {
    event.respondWith(networkFirstPage(request, url));
  }
});
