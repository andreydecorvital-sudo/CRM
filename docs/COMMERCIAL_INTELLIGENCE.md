# Commercial Intelligence

Camada determinística que transforma sinais operacionais em:

1. **Deal Health Score**
2. **Revenue Recovery Cases**
3. **Next Action Recommendations**

Ela não executa ações diretamente.

```text
Deal / conversa / proposta / tarefa muda
  ↓
Domain Event
  ↓
commercial_intelligence job
  ↓
Deal Health
  ↓
Next Action Recommendation
  ↓
Action Proposal
  ↓
Authorization
  ↓
Adapter / Verify
```

## Deal Health Score v1

O score é explicável e começa em **70 pontos**.

Cada sinal adiciona/remove pontos. O snapshot persiste:
- score;
- band;
- motivos;
- pontos por motivo;
- evidência;
- sinais brutos/derivados;
- versão do algoritmo.

Bands:

- `75–100` → `healthy`
- `55–74` → `attention`
- `35–54` → `at_risk`
- `0–34` → `critical`

### Sinais negativos

Exemplos do v1:

- sem responsável: **-20**
- sem próximo follow-up: **-12**
- follow-up atrasado: **-18 / -25**
- tarefas vencidas: até **-15**
- cliente aguardando resposta: **-15**
- SLA estourado: **-15**
- 7+ dias sem atividade: **-10**
- 14+ dias sem atividade: **-18**
- proposta enviada e não vista: **-12 / -18**
- proposta visualizada sem retomada: **-12**
- estágio acima de 1,5× da mediana: **-12**
- estágio acima de 2,5× da mediana: **-20**
- deal aberto há 60+ dias: **-8**

### Sinais positivos

- interação do cliente nos últimos 2 dias: **+6**
- follow-up próximo já agendado: **+6**
- proposta visualizada recentemente: **+8**
- estágio avançando abaixo de 75% da mediana: **+4**

## Revenue Recovery

Revenue Recovery não tenta adivinhar dinheiro recuperado.

### `pipeline_value_cents`

Valor nominal do deal.

### `exposed_value_cents`

No v1:
- deal `healthy` ou `attention`: 0 exposto;
- deal `at_risk` ou `critical`: valor integral do deal.

Portanto:

> “R$ 80 mil expostos” significa “R$ 80 mil de pipeline estão em deals classificados como risco”.

Não significa:
> “vamos recuperar R$ 80 mil”.

Probabilidade de recuperação só deve ser adicionada depois de dados históricos suficientes.

## Um caso ativo por deal

Existe no máximo:
- uma Next Action atual por deal;
- um Revenue Recovery Case ativo por deal.

Se o motivo principal mudar:
- caso anterior → `stale`;
- novo caso assume o deal.

Isso impede contar o mesmo valor duas vezes.

## Motivo principal de recuperação

Prioridade inicial:

1. owner ausente;
2. cliente aguardando/SLA;
3. follow-up/tarefa atrasada;
4. proposta parada;
5. estágio parado;
6. conversa parada;
7. múltiplos sinais.

## Next Action Engine

O engine escolhe uma recomendação determinística.

Exemplos:

### Sem owner
`task.create`
- “Definir responsável e retomar negociação”

### Cliente esperando
`task.create`
- WhatsApp
- prioridade urgente
- prazo 15 min

### Follow-up atrasado
`task.create`
- follow-up
- prioridade alta
- prazo 30 min

### Proposta não visualizada
`task.create`
- confirmar recebimento

### Proposta visualizada e parada
`task.create`
- retomar proposta

### Sem próximo passo
`deal.follow_up`
- follow-up em 24h

### Deal parado
`task.create`
- retomar negociação

## Governança

A recomendação gera **Action Proposal**.

Ela não vira tarefa/follow-up automaticamente só porque o score é alto.

Fluxo:

```text
Recommendation
  ↓
Action Proposal
  ↓
human/policy authorization
  ↓
Authorized Intent
  ↓
registered adapter
  ↓
post-read verification
```

A allowlist automática continua limitada pelo Router.

## Persistência

### `deal_health_snapshots`
Histórico de saúde.

### `deal_health_current`
View `security_invoker` com o snapshot mais recente de deals ainda abertos.

### `next_action_recommendations`
Recomendação + Proposal associada.

Estados:
- active
- proposed
- authorized
- executed
- dismissed
- stale

### `revenue_recovery_cases`
Casos de dinheiro parado.

Estados:
- open
- proposed
- authorized
- recovered
- dismissed
- stale

### `revenue_recovery_summary`
View para cockpit:
- quantidade de casos ativos;
- critical;
- at risk;
- valor de pipeline;
- valor exposto;
- última detecção.

## Lifecycle

Quando a Action Proposal é autorizada:
- Next Action → `authorized`
- Recovery Case → `authorized`

Quando o execution receipt fica `verified`:
- Next Action → `executed`
- Recovery Case volta para `open` até a saúde do deal realmente melhorar.

Isso é proposital:

> executar um follow-up não significa recuperar a receita.

Quando o deal é ganho:
- Recovery Case → `recovered`
- Next Actions pendentes → `stale`

Quando o deal é perdido:
- Recovery Case → `stale`
- Next Actions pendentes → `stale`

## Reatividade

Eventos que podem agendar recálculo:

- `deal.*`
- `proposal.*`
- `task.*`
- `message.received`
- `message.sent`

Eventos gerados pelo próprio intelligence não criam loop:

- `deal.health.*`
- `revenue.recovery.*`
- `next_action.*`

## Worker

Novo kind:

`commercial_intelligence`

O job pode receber:
- `dealId`;
- `contactId`;
- ou nenhum filtro para varredura ampla.

## Internal API

Protegida por `CRM_INTERNAL_SECRET`.

### Resumo

```
GET /api/internal/intelligence/revenue-recovery?tenantId=<uuid>
```

Retorna:
- summary;
- recovery cases;
- weakest deals;
- next actions.

### Enfileirar scan

```json
POST /api/internal/intelligence/revenue-recovery
{
  "tenantId": "...",
  "mode": "enqueue",
  "dealId": "..."
}
```

### Executar imediatamente

Uso técnico/controlado:

```json
{
  "tenantId": "...",
  "mode": "run",
  "limit": 250
}
```

## Próxima evolução

Depois de operação real:

- calibrar pesos por segmento;
- aprender win/loss patterns;
- forecast probabilístico;
- estimated recoverability baseado em histórico;
- performance por owner;
- cohort de recovery;
- experimentação de playbooks;
- modelos estatísticos/IA como camada complementar, nunca ocultando os sinais base.
