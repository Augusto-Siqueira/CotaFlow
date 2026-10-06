// A proposta roda num iframe com srcDoc. Nesse modo, um link interno do tipo
// href="#secao" não rola a página: o navegador tenta abrir o endereço do
// CotaFlow dentro do iframe (e a proposta "quebra"). Por isso injetamos um
// pequeno script que trata os cliques em âncoras rolando até a seção, e um
// <base target="_blank"> pra links externos abrirem em outra aba.
const HEAD_FIX =
  '<base target="_blank"><style>html{scroll-behavior:smooth;scroll-padding-top:72px}</style>';

const ANCHOR_SCRIPT = `<script>
document.addEventListener("click", function (e) {
  var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
  if (!a) return;
  var id = decodeURIComponent(a.getAttribute("href").slice(1));
  e.preventDefault();
  if (!id || id === "top") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  var el = document.getElementById(id) || document.getElementsByName(id)[0];
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
});
</script>`;

export function prepareProposalHtml(html: string): string {
  let out = html;

  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${HEAD_FIX}</head>`);
  } else {
    out = HEAD_FIX + out;
  }

  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${ANCHOR_SCRIPT}</body>`);
  } else {
    out += ANCHOR_SCRIPT;
  }

  return out;
}
