// "Estou conseguindo falar com o servidor?" O navigator.onLine sozinho engana:
// em estrada o celular fica "conectado" sem sinal de verdade. Por isso a tela
// também considera o resultado das últimas chamadas (qualquer tela ou a fila
// avisam por aqui).

let reachable = true;
const subs = new Set<() => void>();

export function setReachable(value: boolean) {
  if (reachable === value) return;
  reachable = value;
  subs.forEach((fn) => fn());
}

export function isReachable(): boolean {
  return reachable;
}

export function subscribeReachable(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
