# Simulation & Eval Lab

Laboratório determinístico para validar regras críticas do CRM sem depender de banco real.

## Objetivo

Antes de ligar Supabase/tenant real, conseguir provar:

- Deal Health;
- Revenue Recovery;
- Next Action;
- Event Router;
- regressões após mudar pesos/regras.

O Lab não persiste e não executa writes.

```text
Scenario / payload
  ↓
Simulation Engine
  ├─ Deal Health
  ├─ Revenue Recovery Assessment
  ├─ Next Action Recommendation
  └─ Router Policy
  ↓
Golden expectations
  ↓
Vitest / CI
```

## Golden scenarios

Arquivo:

`src/lib/server/intelligence/scenarios.ts`

Cenários iniciais:

- `healthy_momentum`
- `customer_waiting_sla`
- `proposal_stalled`
- `owner_missing`

Cada cenário possui:
- input completo;
- resultado esperado;
- execução real;
- status passed/failed.

A ideia é aumentar essa suíte sempre que surgir incidente real.

## Pure simulation

`src/lib/server/intelligence/simulator.ts`

### Deal

Executa:
1. Deal Health;
2. fingerprint;
3. Revenue Recovery Assessment;
4. Next Action.

Sem banco.

### Router

Recebe event types e devolve a policy determinística:
- capability owners;
- severity;
- wake mode;
- policy key.

## Internal API

Protegida por `CRM_INTERNAL_SECRET`.

### Rodar golden suite

```
GET /api/internal/intelligence/simulate
```

ou:

```json
POST /api/internal/intelligence/simulate
{
  "kind": "suite"
}
```

### Simular deal arbitrário

```json
{
  "kind": "deal",
  "deal": {
    "...": "DealHealthInput completo"
  }
}
```

### Simular Router

```json
{
  "kind": "router",
  "events": [
    "deal.won",
    "revenue.recovery.detected",
    "next_action.proposed"
  ]
}
```

## CI

`npm test` roda Vitest.

O gate do projeto passa a ser:

```text
typecheck
→ lint
→ unit/domain tests
→ migration security check
→ next build
```

## Regra de regressão

Mudança de peso/regra que altera um golden scenario exige uma das duas coisas:

1. corrigir a implementação porque houve regressão;
2. alterar explicitamente a expectativa do cenário e documentar o motivo.

Nunca “consertar o teste” sem justificar a mudança de comportamento.

## Revenue Recovery

A classificação de recovery usada pelo runtime e pelo Lab é a mesma função pura:

`assessRevenueRecovery()`

Isso evita ter uma regra para simulação e outra para produção.

## Próxima evolução

Quando existirem dados reais:

- importar incidentes reais anonimizados como golden cases;
- replay de domain events históricos;
- comparação v1 vs v2 do Deal Health;
- calibration report;
- evals de IA separados das regras determinísticas;
- shadow mode antes de trocar algoritmo em produção.
