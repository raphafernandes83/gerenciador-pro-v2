# Gerenciador PRO — Domain + Turnstile Production Runbook

Estado: preparação somente. Este documento não autoriza compra de domínio, merge ou promoção para produção.

## Pré-condições já exigidas

- PR de infraestrutura aprovado tecnicamente e ainda controlado.
- `main` protegida com PR obrigatório, force-push e exclusão bloqueados.
- `production` protegida sem PR obrigatório, force-push e exclusão bloqueados, preservando promoção/rollback controlados.
- Apps Script oficial `2026-08-23.3` com `UrlFetchApp` funcional.
- D1, Sheets, Queue, DLQ, lotes, segurança e readiness em PASS.

## Ordem obrigatória

### 1. Escolher e registrar o domínio

- Consultar disponibilidade/preço antes da compra.
- A compra deve ter aprovação explícita do responsável antes de qualquer cobrança.
- Preferir domínio `.com` curto, internacional e alinhado à marca.
- Não registrar automaticamente a partir de CI.

### 2. Colocar o domínio na Cloudflare

- A zona deve estar ativa na mesma conta Cloudflare do Worker.
- Usar Custom Domain para o Worker de produção quando o Worker for a origem do site.
- O hostname final deve ser um FQDN HTTPS e não pode ser `workers.dev`.
- Certificado TLS deve estar válido para o hostname.

### 3. Criar Turnstile real

- Criar widget Turnstile real em modo Managed.
- Restringir os hostnames ao hostname final usado pelo formulário.
- Não reutilizar as chaves oficiais de teste do preview.
- Manter a secret key somente em segredo de runtime; nunca versionar no GitHub.

Runtime de produção precisa de:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_EXPECTED_ACTION=lead_register` (opcional, pois o Worker já usa `lead_register` como default; recomendado deixar explícito em produção)

O frontend recebe a sitekey via `/config.js`; a secret key nunca deve chegar ao navegador.

### 4. Atualizar o autorizador do Apps Script

Antes do GO final, atualizar a Script Property:

`GP_MIRROR_AUTH_URL`

para:

`https://HOSTNAME_FINAL/api/mirror/authorize`

Depois confirmar no Apps Script:

- GET `/exec` => `ok=true`, `version=2026-08-23.3`, `status=ready`.
- POST com token sintético inválido => `mirror_unauthorized`.

Não deixar a propriedade de produção apontando para a branch de preview.

### 5. Rodar Domain Readiness

Executar manualmente o workflow:

`Production domain readiness`

com:

`production_url=https://HOSTNAME_FINAL`

Ele deve provar:

- DNS público;
- TLS e hostname válidos;
- certificado com mais de 7 dias de validade restante;
- Worker `/api/health` saudável;
- headers de segurança;
- sitekey real injetada em `/config.js`;
- token Turnstile ausente bloqueado;
- token dummy bloqueado;
- origem cruzada bloqueada.

### 6. Rodar Production Readiness

Executar:

`Production readiness`

com a URL final.

GO exige simultaneamente:

- D1 limpo;
- Retry Queue 0;
- DLQ 0;
- Apps Script v3 funcional;
- proteção de branches exata;
- domínio + Turnstile real aprovados.

### 7. Integração e promoção

Somente depois dos gates acima:

1. integrar o PR de infraestrutura em `main` pelo fluxo protegido;
2. executar `Promote to production`;
3. digitar `PROMOTE` explicitamente;
4. informar a URL final;
5. promover somente o SHA aprovado de `main`.

O workflow executa smoke pós-promoção e dispara rollback automático se o smoke falhar.

## Proibições

- Não comprar domínio sem aprovação explícita de preço/nome.
- Não fazer push manual direto para `production`.
- Não versionar `TURNSTILE_SECRET_KEY`.
- Não usar chaves Turnstile de teste em produção.
- Não aceitar `workers.dev` como hostname final.
- Não deixar Apps Script de produção apontando para o Worker de preview.
- Não considerar lançamento concluído sem `Production domain readiness` + `Production readiness` em PASS.
