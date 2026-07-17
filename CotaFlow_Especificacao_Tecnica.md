# CotaFlow — Especificação Funcional e Técnica
### Plataforma própria de cotação de frete rodoviário

---

## 0. Contexto e Premissas

O CotaFlow é uma plataforma **própria e independente**, inspirada operacionalmente em ferramentas de mercado como o Qualp, mas construída do zero, sem integração com APIs de terceiros e sem reaproveitamento de código ou dados proprietários. O objetivo é reproduzir **comportamentos operacionais** (cálculo de frete, roteirização, tributação, geração de propostas), não replicar um produto específico.

Este documento cobre: funcionalidades, fluxos, modelagem de dados, arquitetura técnica, regras de cálculo, roadmap e backlog priorizado.

### 0.1 Decisão de escopo inicial: lançamento manual de rota/pedágio/gross

Para reduzir complexidade e custo no início, a **Fase 1 (MVP)** não vai integrar nenhuma API de roteirização. Distância, pedágio e frete Gross serão **preenchidos manualmente** pelo usuário na tela de cotação. Isso já resolve a dor principal do início (organizar cotações por cliente) sem depender de infraestrutura externa.

A estrutura de dados (seção 4) já é desenhada para que esses campos — hoje preenchidos manualmente — possam futuramente ser calculados automaticamente por uma API de roteirização (seção 6), **sem necessidade de alterar o schema do banco**. A transição futura muda apenas *quem preenche o dado* (usuário → serviço externo), não a modelagem.

---

## 1. Visão Geral das Funcionalidades

| Módulo | Descrição |
|---|---|
| Cotação de Frete | Cálculo de frete gross/net/full, tributos, seguro, pedágio |
| Roteirização | Cálculo de distância, rota, pedágios estimados |
| Fracionado | Múltiplas entregas com rateio proporcional |
| Clientes | Cadastro, histórico, condições comerciais |
| Veículos | Cadastro de tipos, eixos, capacidade |
| Propostas (PDF) | Geração de documento comercial |
| Histórico | Versionamento e evolução de preços por cliente |
| Usuários/Permissões | Controle de acesso por papel |
| ANTT | Cálculo de piso mínimo de frete |

---

## 2. Fluxo Operacional Completo

```
1. Usuário inicia nova cotação
2. Preenche origem/destino
3. Sistema calcula distância e rota (roteirização)
4. Usuário informa: produto, veículo, peso, valor NF
5. Sistema aplica:
   a. Cálculo de pedágio (por eixo/km)
   b. Cálculo de seguro (% sobre NF)
   c. Verificação de piso ANTT (se aplicável)
   d. Cálculo tributário (ICMS "por dentro")
   e. Cálculo PIS/COFINS (frete net)
6. Se fracionado: sistema divide em múltiplas entregas e ratea proporcionalmente por peso
7. Sistema apresenta resumo: Gross / Net / Full / Transit time
8. Usuário aprova e gera PDF da proposta
9. Cotação é salva no histórico do cliente
10. Cliente pode duplicar cotação anterior para nova rodada de preços
```

---

## 3. Estrutura de Telas (UX)

1. **Dashboard** — cotações recentes, atalhos, indicadores (nº cotações/mês, ticket médio)
2. **Nova Cotação** — formulário em etapas (wizard): Rota → Carga → Veículo → Tributos → Resumo
3. **Detalhe da Cotação** — visualização completa + mapa da rota + PDF
4. **Clientes** — listagem, cadastro, histórico de cotações por cliente
5. **Veículos** — cadastro de tipos de veículo (eixos, capacidade, categoria ANTT)
6. **Histórico/Comparativo** — evolução de preços por cliente/rota ao longo do tempo
7. **Configurações** — tabelas de pedágio, parâmetros tributários, templates de PDF
8. **Usuários/Permissões** — gestão de acesso (admin, comercial, operacional)

---

## 4. Modelagem de Dados — Entidades Principais

### `clients`
| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | PK |
| name | text | |
| document | text | CNPJ/CPF |
| segment | text | ramo de atividade |
| default_insurance_pct | numeric | seguro padrão negociado |
| created_at | timestamp | |

### `vehicles`
| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | PK |
| type | text | ex: Truck, Carreta, Bitrem |
| axles | int | nº de eixos |
| capacity_kg | numeric | capacidade de carga |
| antt_category | text | categoria para cálculo de piso ANTT |

### `quotes` (cotação)
| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | PK |
| client_id | uuid | FK → clients |
| origin | text | endereço/cidade |
| destination | text | endereço/cidade |
| distance_km | numeric | calculado via roteirização |
| vehicle_id | uuid | FK → vehicles |
| product | text | |
| nf_value | numeric | valor da nota fiscal |
| gross_freight | numeric | |
| toll_cost | numeric | |
| insurance_pct | numeric | |
| insurance_value | numeric | calculado |
| icms_pct | numeric | por UF |
| net_freight | numeric | calculado |
| full_freight | numeric | calculado |
| transit_time_hours | numeric | |
| free_time_hours | numeric | |
| over_time_cost | numeric | |
| status | text | rascunho / aprovada / expirada |
| created_at | timestamp | |
| version | int | para versionamento/duplicação |

### `quote_deliveries` (fracionado)
| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | PK |
| quote_id | uuid | FK → quotes |
| destination | text | |
| weight_kg | numeric | |
| freight_share_pct | numeric | calculado por rateio proporcional |
| freight_value | numeric | |

### `toll_tables`
| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | PK |
| route_segment | text | ou lat/lng dos praças |
| axle_count | int | |
| cost_per_axle | numeric | |

### `tax_rules`
| Campo | Tipo | Obs |
|---|---|---|
| id | uuid | PK |
| uf | text | estado |
| icms_pct | numeric | |
| special_rule | text | ex: "PR" (regra Paraná) |

### `users` / `roles`
Estrutura padrão RBAC: `users`, `roles`, `user_roles`, com papéis como `admin`, `comercial`, `operacional`.

**Relacionamentos-chave:**
`clients (1) — (N) quotes — (N) quote_deliveries`
`quotes (N) — (1) vehicles`
`quotes (N) — (1) tax_rules (via UF de destino)`

---

## 5. Regras de Cálculo Detalhadas

### 5.1 Frete Full (regra geral, ICMS "por dentro")
```
Full = (Gross + Pedágio + Seguro) ÷ (1 - ICMS%)
```

### 5.2 Frete Full (regra Paraná — pedágio fora da base de ICMS)
```
Full = (Gross + Seguro) ÷ (1 - ICMS%) + Pedágio
```

### 5.3 Frete Net (PIS/COFINS)
```
Net = Gross × 0,9075
```
> Observação: esse fator (0,9075) equivale a considerar ~9,25% de PIS/COFINS sobre o gross. Deve ser um **parâmetro configurável** na tabela `tax_rules`, não uma constante fixa no código — a alíquota efetiva pode mudar por regime tributário da transportadora (Lucro Real, Presumido, Simples).

### 5.4 Seguro
```
Seguro = NF_valor × seguro_pct
```
Se "seguro indefinido" for selecionado, o campo fica nulo na cotação e é preenchido posteriormente (ex: no fechamento comercial).

### 5.5 Piso Mínimo ANTT
Cálculo baseado na tabela de custos mínimos de transporte da ANTT (Resolução vigente), que considera:
- categoria do veículo (eixos)
- tipo de carga (geral, granel sólido, granel líquido, etc.)
- distância percorrida
- coeficientes de custo por km (deslocamento) + custo de viagem

```
Piso_ANTT = (CCD × distância_km) + CC
```
Onde `CCD` (Coeficiente de Custo por Deslocamento) e `CC` (Coeficiente de Custo por Viagem) vêm de tabela oficial da ANTT, parametrizável no sistema (tabela `antt_coefficients`), pois esses valores são reajustados periodicamente.

**Regra de negócio:** se `Gross_calculado < Piso_ANTT`, o sistema deve alertar e sugerir ajuste automático para o piso mínimo (obrigatoriedade legal).

### 5.6 Rateio Proporcional (fracionado)
Para múltiplas entregas na mesma cotação, o rateio é proporcional ao peso de cada entrega:
```
percentual_entrega_i = peso_i ÷ peso_total
valor_frete_entrega_i = Full_freight × percentual_entrega_i
```
Regra citada: "maior peso recebe maior percentual do frete" — ou seja, rateio linear simples por peso (não por peso × distância, a menos que se decida evoluir para rateio ponderado por peso e distância parcial da rota).

---

## 6. Módulo de Roteirização

**Responsabilidades:**
- Calcular distância rodoviária entre origem e destino (não linha reta)
- Estimar tempo de viagem (transit time)
- Estimar pedágios ao longo da rota
- Exibir mapa da rota

**Abordagem técnica sugerida:**
- Usar um serviço de geocoding + roteirização com dados públicos/abertos (ex: OSRM self-hosted com dados do OpenStreetMap, ou APIs de mapas com uso comercial permitido, como Google Directions API, Mapbox Directions, ou HERE Routing API — todas com camadas gratuitas/pagas conforme volume).
- Manter uma **tabela própria de pedágios** (`toll_tables`) para as rotas mais usadas pela transportadora, atualizada manualmente ou via scraping de fontes públicas (ANTT/concessionárias divulgam tarifas de pedágio publicamente) — isso evita depender 100% de terceiros para o dado mais sensível ao cálculo.
- Cache de rotas já calculadas (mesma origem/destino) para reduzir custo de API externa.

---

## 7. Estrutura do PDF (Proposta Comercial)

**Seções sugeridas:**
1. Cabeçalho com logo da transportadora + dados do cliente
2. Resumo da rota (origem → destino, distância, transit time)
3. Detalhamento de custos (Gross, Pedágio, Seguro, Tributos, Full)
4. Condições comerciais (validade da proposta, free time, prazo de pagamento)
5. Se fracionado: tabela com cada entrega e seu rateio
6. Rodapé com validade legal / observações

**Tecnicamente:** geração via **React PDF** (conforme stack sugerida), renderizando um template React para PDF no backend ou via função serverless, permitindo fácil manutenção visual (é só JSX).

---

## 8. Estrutura de Permissões e Usuários

| Papel | Permissões |
|---|---|
| Admin | Tudo: configurações, tabelas tributárias, usuários |
| Comercial | Criar/editar cotações, gerar PDF, ver clientes |
| Operacional | Visualizar cotações, sem edição de tabelas tributárias |

Implementação: RBAC simples com tabelas `roles` e `user_roles`, checagem de permissão via middleware nas rotas da API.

---

## 9. Arquitetura Técnica Recomendada

### Stack (conforme solicitado)
- **Frontend:** Next.js (React) + Tailwind CSS
- **Backend:** Next.js API Routes ou rotas server-side dedicadas (pode evoluir para serviço separado depois)
- **Banco de dados:** PostgreSQL via Supabase
- **Autenticação:** Supabase Auth (RBAC via tabelas próprias)
- **Geração de PDF:** React PDF
- **Hospedagem:** Vercel (frontend/API) + Supabase (banco/auth)

### Frontend x Backend: separar ou não?

Dado o estágio inicial e uso interno (uma transportadora, não múltiplos clientes/apps), a recomendação é:

**Começar com Next.js full-stack** (frontend + API routes no mesmo projeto).

Motivos:
- Menor complexidade operacional para uso interno
- Deploy único, mais rápido de iterar
- Supabase já cuida de boa parte da camada de dados/auth, reduzindo necessidade de um backend "pesado" separado

**Quando separar de fato:**
- Se no futuro houver um app mobile nativo consumindo a mesma lógica
- Se o volume de cálculo (roteirização, tributos) crescer a ponto de precisar de workers/filas dedicados
- Se decidir vender o CotaFlow como produto para outras transportadoras (multi-tenant)

Nesse caso, a evolução natural é extrair a "engine de cotação" (cálculo de frete, tributos, roteirização) para um serviço backend independente (Node/Express, Fastify, ou mesmo uma API em Python se envolver mais processamento de dados), mantendo o Next.js como camada de frontend consumindo essa API.

---

## 10. Futuras Integrações (roadmap de dados externos)

| Necessidade | Substituto possível ao Qualp |
|---|---|
| Roteirização/distância | OSRM próprio, Google Directions, Mapbox, HERE |
| Tabela de pedágio | Dados públicos da ANTT/concessionárias, scraping próprio |
| Piso mínimo ANTT | Tabela oficial ANTT (Resolução vigente), atualização periódica manual |
| CEP/geocoding | ViaCEP (gratuito) + geocoding via Mapbox/Google |
| Emissão fiscal (futuro) | Integração com sistema de NF-e da transportadora, se aplicável |

---

## 11. Roadmap e Priorização de MVP (versão revisada — entrada manual)

### MVP (Fase 1) — essencial para operar, sem nenhuma API externa
1. Cadastro de clientes
2. Cadastro de veículos (tipo, eixos)
3. Nova cotação com campos manuais:
   - Origem / Destino (texto livre)
   - Distância (km) — manual
   - Pedágio (R$) — manual
   - Frete Gross — manual
   - Seguro (% ou valor)
4. Cálculo automático a partir da entrada manual:
   - Frete Net (PIS/COFINS)
   - Frete Full (ICMS — regra geral e regra Paraná)
5. Listagem/histórico de cotações por cliente (busca e filtro)
6. Geração de PDF da proposta comercial

> Nesta fase, os campos de distância/pedágio já existem no banco exatamente como descritos na seção 4 (`quotes.distance_km`, `quotes.toll_cost`) — só que preenchidos pelo usuário em vez de calculados. Isso evita retrabalho de schema mais adiante.

### Fase 2 — completude tributária e operacional
7. Regra especial de ICMS (Paraná e outras UFs com regras específicas)
8. Cálculo de piso mínimo ANTT com alerta (ainda com distância informada manualmente)
9. Fracionado com rateio proporcional (múltiplas entregas)
10. Duplicação de cotações e comparativo de evolução de preços por cliente

### Fase 3 — automação de roteirização
11. Integração com API de roteirização (Google Directions ou Mapbox — ver seção 6) para preencher distância/transit time automaticamente
12. Tabela própria de pedágio (por rota/segmento), reduzindo a necessidade de preenchimento manual
13. Mapa interativo da rota na tela de detalhe da cotação

### Fase 4 — maturidade e escala
14. Permissões e múltiplos usuários (RBAC completo)
15. Dashboard com indicadores comerciais (nº cotações/mês, ticket médio, taxa de conversão)

### Fase 5 — evolução futura
16. Multi-tenant (se decidir oferecer a outras transportadoras)
17. App mobile
18. Integrações fiscais

---

## 12. Backlog Técnico (itens transversais)

- [ ] Parametrizar todas as constantes tributárias (ICMS, PIS/COFINS) em tabela, nunca hardcoded
- [ ] Versionamento de cotações (permitir duplicar sem perder histórico)
- [ ] Testes automatizados das regras de cálculo (são a parte mais crítica do sistema — erro aqui = prejuízo financeiro real)
- [ ] Logs de auditoria em alterações de tabelas tributárias/pedágio
- [ ] Cache de rotas calculadas
- [ ] Validação de piso ANTT como regra bloqueante (ou pelo menos alerta forte) antes de aprovar cotação

---

## Observação Final

As regras de cálculo (ICMS, PIS/COFINS, piso ANTT) descritas aqui são **baseadas no que foi informado no prompt original** — antes de colocar em produção, vale validar com seu contador/setor fiscal se as alíquotas e fórmulas continuam vigentes, já que legislação tributária de transporte muda com frequência (reformas tributárias em curso no Brasil, por exemplo, podem impactar diretamente esses cálculos nos próximos anos).
