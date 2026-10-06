// Versão do sistema. A cada publicação nova: soma 0,01 em APP_VERSION
// (1.00 -> 1.01 -> 1.02...) e acrescenta uma entrada NO TOPO de CHANGELOG.
export const APP_VERSION = "1.03";

export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.03",
    date: "2026-10-07",
    notes: [
      "Menu lateral: abre pelos 3 tracinhos, com grupos que se expandem (Comercial, Programação, Cadastros, Tabelas de frete) e a página atual destacada.",
      "Modo escuro: botão de sol/lua no topo, segue o tema do computador na primeira visita e lembra a sua escolha.",
      "Botões de ação (Detalhes, PDF, Editar, Excluir...) com visual de botão em todas as listas.",
      "Listas de cotações, lotes, clientes, veículos, ICMS e ANTT padronizadas em tabela no computador e cartões no celular.",
      "Acessibilidade: foco visível no teclado, janelas que prendem o foco e devolvem ao fechar, campos com rótulos ligados e cores com mais contraste.",
      "Botão da página inicial e item do menu renomeados (Nova cotação, Cotações em Lote).",
    ],
  },
  {
    version: "1.02",
    date: "2026-10-06",
    notes: [
      "Nova aba Propostas Comerciais: guarda o HTML das propostas e gera um link próprio para enviar ao cliente.",
      "O cliente abre o link sem login e só lê; o link pode ser desativado ou ter validade.",
      "Confirmação de leitura: mostra quantas vezes a proposta foi aberta, a primeira e a última visualização.",
      "Só o perfil Comercial gerencia as propostas.",
      "Menu interno da proposta (links de seção) funciona sem quebrar o link e sem contar como nova visualização.",
      "Novo status Entrega Concluída na programação de carregamento.",
      "Lista de cotações paginada (50 por página) e busca na lista de clientes.",
      "Avisos e confirmações do próprio sistema no lugar das janelas do navegador, e aviso quando a sessão expira.",
      "Seletores com busca para cliente, placas e motorista na programação, e botão Novo Embarque.",
      "Impressão da programação do dia e troca de senha pelo cabeçalho.",
      "Carregamento mais rápido: lista de municípios em cache e verificação de login sem ida ao banco.",
    ],
  },
  {
    version: "1.01",
    date: "2026-10-05",
    notes: [
      "Novo módulo Programação: agenda de carregamentos por dia, agrupada por cliente, com carga, peso, placa, motorista, horário e status.",
      "Status do carregamento: Programado, Lavando, Carregando e Carregado em Viagem.",
      "Vínculo opcional com uma cotação e lançamento de dias futuros.",
      "Novo perfil Logística, que altera a programação e continua só lendo o resto.",
      "Origem, destino e placa do semi-reboque na programação, com colunas que só aparecem quando preenchidas.",
      "Cadastro de frota (cavalos, semi-reboques, trucks e bitrucks) e de motoristas, com apelido.",
      "Clientes com Razão Social e Nome Fantasia, edição e exclusão, e lista com rolagem.",
      "Programação só aceita cliente, placas e motorista cadastrados.",
      "Na lista da programação, as colunas de placa passam a se chamar Cavalo e Carreta.",
      "Duplicar dia na programação: copia as cargas escolhidas para outra data, sem apagar o que já estiver lançado nela.",
      "Na programação só é possível vincular cotações vigentes.",
    ],
  },
  {
    version: "1.00",
    date: "2026-10-05",
    notes: [
      "Login com perfis: Comercial (altera tudo) e Logística (somente leitura).",
      "Cotações com Revisão 00/01/02, status vigente/obsoleta e exclusão individual ou em lote.",
      "Layout de PDF por cliente (padrão e Kemin) e número de cotação do cliente.",
      "Nova página inicial e nova tela de login.",
      "Campos de valor em reais com máscara automática.",
    ],
  },
];
