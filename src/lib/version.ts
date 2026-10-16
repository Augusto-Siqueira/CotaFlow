// Versão do sistema. A cada publicação nova: soma 0,01 em APP_VERSION
// (1.00 -> 1.01 -> 1.02...) e acrescenta uma entrada NO TOPO de CHANGELOG.
export const APP_VERSION = "1.09";

export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.09",
    date: "2026-10-16",
    notes: [
      "Programação: bloco de notas do dia, um texto livre por data, compartilhado pela equipe e salvo automaticamente.",
      "Observações da carga em tópicos (botão Observações, amarelo quando há anotação): cada uma com origem (equipe ou motorista) e data/hora, com editar e excluir. O motorista vê só as observações que ele mesmo mandou.",
      "App do motorista: observação opcional junto com o comprovante de entrega, que entra como tópico nas observações da carga.",
      "App do motorista: no relato de defeito, campo de placa com sugestões da frota (placas da carga do dia primeiro).",
      "Programação: tela mais larga (padrão para as telas de lista), destinos e motoristas sem quebra de linha, status Lavando removido, e o Voltar de uma cotação aberta pela Programação retorna ao mesmo dia.",
      "Cidades: busca e validação ignoram acentos e maiúsculas, duplicadas removidas; origem e destino da Programação só aceitam cidades cadastradas.",
      "Botão Voltar no lugar das setas em todas as telas.",
    ],
  },
  {
    version: "1.08",
    date: "2026-10-15",
    notes: [
      "Comprovante de entrega no app do motorista: para cada destino da carga, ele lança nome do cliente, nota fiscal, CTE, peso da NF e peso descarregado (em kg) e envia a foto do canhoto e do ticket de pesagem (obrigatória).",
      "Programação: cada destino é clicável e abre o comprovante enviado, com os dados, a diferença de peso e as fotos; destinos com comprovante ficam marcados com ✓. Quem edita a programação pode apagar um comprovante lançado errado.",
      "Comprovante: botão Enviar por e-mail copia o texto (dados e Link da imagem clicáveis, válidos por 7 dias) e abre um e-mail novo no Outlook na web com assunto no padrão CANHOTO CTE (número do CTE); basta colar no corpo.",
      "Quando uma carga recebe o comprovante de todos os destinos, o status muda sozinho para Entrega Concluída e a Programação mostra o alerta Encerrar MDF-e até o programador marcar como encerrado.",
      "Acesso dos motoristas: login com o CPF e senha inicial fixa (6 primeiros dígitos do CPF), sem troca obrigatória.",
    ],
  },
  {
    version: "1.07",
    date: "2026-10-17",
    notes: [
      "App do motorista (instalável no Android e no iPhone): login com CPF, troca de senha no primeiro acesso e tela com as cargas do dia.",
      "Check-list diário digital, com itens editáveis pela Manutenção, foto sorteada em 2 itens, hora e posição; cada problema marcado vira um defeito na triagem da manutenção.",
      "Relato de defeito pelo motorista, com categoria, gravidade e fotos, direto na triagem.",
      "Tela própria de Check-lists dentro de Manutenção: o check-list é obrigatório todo dia para todo motorista com acesso ao app (tenha ou não carga), com alerta de quem não fez hoje, aderência, ranking por motorista e histórico com detalhe, fotos e local; sinaliza check-list feito rápido demais.",
      "Manutenção: fotos nos defeitos.",
      "Segurança: o perfil motorista só vê as próprias cargas, relatos e check-lists; cotações, preços, clientes e CPFs ficam fechados para ele.",
    ],
  },
  {
    version: "1.06",
    date: "2026-10-16",
    notes: [
      "Manutenção: defeitos relatados com triagem (Triagem, Agendada, Em oficina, Concluída), com categoria, gravidade (Pode rodar, Atenção, Parado) e meta de 4h na triagem.",
      "Do defeito agendado, a placa dá entrada na oficina com os dados já preenchidos; ao liberar a placa, o defeito conclui sozinho.",
      "Dashboard de manutenção: disponibilidade da frota (meta 95%), reincidência de defeitos em 30 dias e ranking de defeitos por categoria.",
      "Programação: placa com defeito Parado fica bloqueada para iniciar viagem; Atenção e Pode rodar geram alerta amarelo na linha da carga e na faixa de manutenção.",
    ],
  },
  {
    version: "1.05",
    date: "2026-10-15",
    notes: [
      "Nova área de Manutenção (perfil próprio): lança a entrada da placa na oficina, com data e hora (pode ser retroativa), oficina, tipo de serviço (preventiva ou corretiva), serviço, previsão de saída, quilometragem, custo e observações, e libera a placa quando ela sai.",
      "Dashboard de manutenção: histórico por período, placa, oficina e tipo; tempo parado por placa; ranking de oficinas; custo e placas em manutenção agora.",
      "Programação integrada: carga com placa em manutenção fica em vermelho com alerta; Lavando, Carregando e Carregado em Viagem ficam bloqueados até a placa ser liberada. Ao lançar a entrada, o sistema avisa quais cargas programadas usam a placa.",
    ],
  },
  {
    version: "1.04",
    date: "2026-10-14",
    notes: [
      "Novo Dashboard da programação: filtra por período e cliente, mostra as cargas por status (clique num status para ver só aquelas cargas), total de toneladas, cargas por dia e cargas atrasadas.",
      "Programação: bloqueio de placas com viagem em aberto (só Programado é liberado; Lavando, Carregando e Carregado em Viagem exigem a viagem anterior concluída).",
      "Programação: vários destinos por carregamento, exibidos como Diversos; sugestão de cidades em Origem e Destino com navegação pelo teclado.",
      "Programação: os status do topo são clicáveis e filtram a lista; peso passa a ser guardado só em toneladas (número).",
      "Cidades: a tabela de cidades guarda só Cidade/UF.",
      "Login e troca de senha com verificação anti-robô (Cloudflare Turnstile).",
      "Botões de Editar e Excluir animados no modo escuro; cursor de mão em tudo que é clicável.",
    ],
  },
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
      "Novo seletor de data na programação, com setas em bloco único (componente reutilizável).",
      "Troca de senha mais segura: pede a senha atual e encerra as outras sessões abertas depois da troca.",
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
