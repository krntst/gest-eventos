# MVP FCRB Eventos - estado atual publicado

Criado em: 2026-05-08

Ultima atualizacao: 2026-05-11

## Resumo

O MVP da plataforma FCRB Eventos esta publicado na Vercel, usando Supabase como banco de dados em producao e SQLite para desenvolvimento local via `server.js`.

O objetivo desta versao e validar o fluxo principal de gestao institucional de eventos: cadastro, ficha unica, checklist, comunicacao, documentos e geracao de minutas com IA.

## Atualizacao de 2026-05-11

### Historico real e migration baseline

O MVP recebeu a primeira implementacao real da aba Historico da Ficha do Evento, conectada ao `audit_log` no SQLite local e no Supabase em producao.

Principais ajustes:

- Criada migration baseline versionada em `supabase/migrations/20260511120000_baseline_schema.sql`.
- Criado endpoint local `GET /api/events/:id/history` em `server.js`.
- Criado endpoint Vercel/Supabase `GET /api/events/:id/history` em `api/[...route].js`.
- Aba Historico da Ficha do Evento agora exibe registros reais do `audit_log`.
- Incluidos estados de carregamento, lista vazia e erro amigavel para Historico.
- Acoes relevantes invalidam o cache local do historico para recarregar dados atualizados:
  - edicao de evento;
  - criacao de item de checklist;
  - conclusao/reabertura de item de checklist;
  - salvamento de briefing de comunicacao;
  - criacao de documento;
  - geracao de minuta IA.

Validacoes executadas:

- `node --check app.js`
- `node --check server.js`
- `node --check api/[...route].js`
- `git diff --check app.js server.js api/[...route].js`
- `GET /api/events`
- `GET /api/events/:id/history`
- `GET /api/events/:id/checklist`
- `GET /api/events/:id/documents`

Observacao: o navegador integrado bloqueou `127.0.0.1:4173` por politica da sessao; por isso, a validacao local desta rodada foi feita por sintaxe e HTTP.

### Painel operacional

O MVP recebeu uma rodada de refinamento no painel operacional e foi enviado para deploy via GitHub/Vercel.

Commit publicado:

- `d388901 ajusta painel operacional e kpis reais`

Principais ajustes:

- Sidebar fixa com opcao de recolher/expandir.
- Estado da sidebar salvo em `localStorage`.
- KPIs do painel conectados a dados reais vindos da API.
- Remocao dos circulos coloridos grandes e setas decorativas dos KPIs.
- Busca e filtros do painel aplicados sobre os eventos carregados.
- Cards de eventos ajustados para melhor encaixe de texto.
- Textos longos dos cards agora usam limite controlado e mantem o conteudo completo em `title`.
- API local e API Vercel passaram a retornar contadores operacionais para o painel:
  - `noOwnerCount`
  - `documentsReviewCount`

Validacoes executadas antes do push:

- `node --check app.js`
- `node --check server.js`
- `node --check api/[...route].js`
- `GET /`
- `GET /app.js`
- `GET /api/events`

Observacao: o teste visual no navegador integrado ficou bloqueado pela politica da ferramenta para `127.0.0.1` naquela sessao, mas a validacao por HTTP e sintaxe foi concluida.

## Stack atual

- Frontend: HTML, CSS e JavaScript puro em `index.html` e `app.js`.
- Servidor local: Node HTTP server em `server.js`.
- Banco local: SQLite em `data/`.
- Deploy: Vercel.
- API em producao: rotas serverless em `api/`.
- Banco em producao: Supabase/PostgreSQL.
- IA: Gemini para geracao de minutas institucionais.

## Fluxos validados em producao

- Criar novo evento pelo modal "Novo evento".
- Recarregar a pagina e confirmar persistencia do evento.
- Abrir a ficha do evento.
- Editar dados basicos do evento.
- Criar item no checklist.
- Marcar item de checklist como concluido.
- Abrir a aba Comunicacao.
- Salvar briefing de comunicacao.
- Abrir a aba Documentos.
- Criar documento vinculado ao evento.
- Gerar minuta com IA.
- Ver minutas recentes na aba Documentos.
- Voltar ao painel geral sem quebrar a listagem.
- Carregar painel geral com KPIs operacionais derivados da API.
- Usar busca e filtros do painel sem quebrar a listagem.

## Modulos funcionais nesta versao

### Painel geral

- Lista eventos persistidos no Supabase.
- Exibe resumo operacional por evento.
- Permite abrir ficha, pendencias e edicao.
- Exibe KPIs reais calculados a partir dos eventos e dados associados:
  - eventos ativos;
  - prazos criticos em ate 7 dias;
  - pendencias sem responsavel;
  - briefings de comunicacao pendentes;
  - documentos em revisao.
- Possui busca por evento, local, area, responsavel e descricao.
- Possui filtros por status, data e area.
- Possui estados de carregamento, erro amigavel e lista vazia.
- Usa cards com texto controlado para evitar estouro visual.
- A sidebar pode ser recolhida para aumentar a area util do painel.

### Ficha do evento

- Exibe dados principais do evento.
- Organiza abas operacionais:
  - Visao geral
  - Checklist
  - Tarefas
  - Comunicacao
  - Convidados
  - Fornecedores
  - Documentos
  - Historico

### Checklist

- Lista itens vinculados ao evento.
- Permite adicionar item.
- Permite marcar/desmarcar item como concluido.
- Persiste no Supabase.

### Comunicacao

- Funciona como briefing de divulgacao.
- Permite salvar titulo, descricoes, links e canais solicitados.
- Usa `communication_requests.official_title` no banco de producao.
- O salvamento nao depende de constraint unica em `event_id`; a API procura registro existente e atualiza, ou cria um novo.

### Documentos e Minutas

- Lista documentos do evento.
- Permite criar novo documento.
- Exibe modelos documentais disponiveis.
- Exibe historico recente de minutas IA.
- Permite gerar minuta institucional com Gemini.
- A geracao de minuta nao depende do `audit_log`; o log e tratado como best effort.

## Contrato de banco validado em producao

O arquivo `supabase/schema.sql` foi alinhado ao schema real usado no deploy em 2026-05-08.

Decisoes confirmadas:

- `users` nao usa `department` nesta versao.
- `checklist_items` nao usa `updated_at` nesta versao.
- `communication_requests` usa `official_title`, nao `title`.
- `communication_requests.event_id` nao tem constraint unica nesta versao.
- `document_templates` usa `template_type` e `body`, nao `category`, `document_type` e `body_template`.
- `document_ai_drafts` usa `provider` como campo obrigatorio.
- `audit_log` usa `details`, nao `metadata`.

Complementos usados pelo painel operacional em 2026-05-11:

- `checklist_items.owner_user_id` e usado pela API para calcular `noOwnerCount`.
- `event_documents.status` e usado pela API para calcular `documentsReviewCount`.
- Os status documentais considerados em revisao no painel sao:
  - `em_revisao`
  - `aguardando_aprovacao`
  - `minuta_gerada`

## Variaveis de ambiente esperadas na Vercel

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` opcional

## Fora do escopo desta versao

- Login e perfis reais de usuario.
- Upload real de arquivos.
- Permissoes avancadas por documento.
- Envio real de e-mail ou WhatsApp.
- Editor avancado de minutas.
- Fluxo completo de aprovacao documental.
- Portal externo para convidados, fornecedores ou parceiros.

## Riscos e proximas melhorias

- Implementar autenticacao antes de ampliar teste externo.
- Criar mensagens de erro amigaveis no frontend.
- Reduzir dependencia de `alert()` para feedback operacional.
- Criar migracoes formais para evoluir o banco sem divergencia entre local e producao.
- Revisar RLS/permissoes no Supabase antes de uso com dados reais.
- Definir politica para dados pessoais de convidados e documentos sensiveis.
- Revisar responsaveis padrao do checklist para garantir que "sem responsavel" represente uma ausencia real, e nao um responsavel herdado automaticamente.
- Fazer teste visual completo do painel em producao apos cada deploy, incluindo sidebar recolhida, filtros e cards longos.

## Criterio de sucesso desta etapa

Esta versao e considerada um MVP funcional porque permite testar o ciclo central:

1. cadastrar evento;
2. acompanhar pendencias;
3. estruturar briefing de comunicacao;
4. organizar documentos;
5. gerar minuta institucional com IA;
6. persistir os dados em ambiente publicado.
7. acompanhar o painel operacional com indicadores reais.
