# SLA em horário comercial

## Calendários

Cada tenant possui um calendário comercial padrão. Departamentos podem usar o calendário padrão ou apontar para um calendário específico.

O calendário define:

- timezone IANA, por exemplo `America/Sao_Paulo`
- agenda semanal por ISO weekday (1 = segunda, 7 = domingo)
- feriados
- exceções de horário parcial

## Exemplo de agenda

```json
{
  "1": [{"start":"09:00","end":"18:00"}],
  "2": [{"start":"09:00","end":"18:00"}],
  "3": [{"start":"09:00","end":"18:00"}],
  "4": [{"start":"09:00","end":"18:00"}],
  "5": [{"start":"09:00","end":"18:00"}],
  "6": [],
  "7": []
}
```

## Cálculo

`private.add_business_minutes` soma minutos apenas dentro das janelas úteis.

Exemplo: um SLA de 60 minutos criado sexta às 17:30, em agenda 09:00–18:00 e fim de semana fechado, vence segunda às 09:30.

Feriado de dia inteiro remove toda a janela. Feriado parcial pode fornecer intervalos substitutos.

## Conversas

`private.set_conversation_sla` usa:

1. calendário específico do departamento;
2. calendário padrão do tenant;
3. relógio corrido somente se não houver calendário.

Assim o SLA não pune equipe por madrugada, domingo ou feriado configurado.

## Segurança

Timezones são validados contra `pg_timezone_names`. Um calendário sem janela útil por 400 dias dispara erro em vez de entrar em loop infinito.
