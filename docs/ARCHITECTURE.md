# MIRA CRM — arquitetura inicial

## Princípios

- SaaS multiempresa desde o banco.
- WhatsApp é provider-neutral; WAHA é só o primeiro adapter.
- MIRA nunca é dona do dado: conversa, lead e auditoria vivem no domínio CRM.
- IA inicia em `assist`; `auto` só é habilitado por tenant e por política.
- Toda mensagem recebida é idempotente por conversa + external_id.
- Nenhum segredo de provider entra em tabela em texto puro; `secret_ref` aponta para secret manager/env.

## Fluxo

WhatsApp provider -> webhook normalizado -> ingestão idempotente -> contato/conversa -> classificação MIRA -> CRM -> resposta assistida/automática -> auditoria.

## Fase 1

1. Multi-tenant + auth.
2. Inbox WhatsApp.
3. CRM Kanban e filtros.
4. WAHA conectado por empresa.
5. MIRA em modo assistido.
6. Handoff humano.
7. Follow-up manual/assistido.

## Fase 2

- resposta automática por política;
- templates e playbooks por segmento;
- agenda/tarefas;
- métricas de conversão;
- Meta Cloud API/BSP;
- cobrança por plano/uso.

## Afiliados

O módulo de afiliados deve ser produto separado na UI, reutilizando tenants, usuários, filas, automações e auditoria. Não misturar contatos de CRM com audiência de campanhas sem consentimento/base legal apropriada.
