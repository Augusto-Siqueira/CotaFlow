// Versão do sistema. A cada publicação nova: soma 0,01 em APP_VERSION
// (1.00 -> 1.01 -> 1.02...) e acrescenta uma entrada NO TOPO de CHANGELOG.
export const APP_VERSION = "1.01";

export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
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
