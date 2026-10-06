<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Regra de projeto: cursor do mouse

- `cursor: pointer` só em elementos com ação: links (`a[href]`), botões, selects, checkbox/radio e seus `label`, abas, acordeões (`summary`) e qualquer elemento com `onClick` (ícone, foto, "x" de fechar). A regra base está em `src/app/globals.css`.
- Elemento não-nativo clicável (`div`, `span`, `img` com `onClick`): usar `<button>` quando possível; se não der, adicionar `role="button"` (já coberto) ou a classe `cursor-pointer`.
- NÃO usar pointer em textos (`h1`, `p`, `span`), inputs de texto/`textarea` (cursor de texto), nem cards estáticos. Card inteiro só tem pointer se for um link.
- Desabilitado (`disabled`, `aria-disabled`): `cursor-not-allowed`.
<!-- END:nextjs-agent-rules -->
