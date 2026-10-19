// Service worker mínimo do CotaFlow. Existe só para o Chrome do Android oferecer
// "Instalar app". NÃO guarda nada em cache nem funciona offline: toda requisição
// segue direto para a rede, como se ele não existisse.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
