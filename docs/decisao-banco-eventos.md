# Decisao de banco de dados para eventos cadastrados

## Escolha

Para o MVP local, a escolha inicial e SQLite.

Motivos:

- roda localmente sem servidor, conta ou rede;
- ja esta disponivel no macOS;
- permite validar rapidamente o modelo de eventos cadastrados;
- usa SQL padrao o suficiente para migrar depois para PostgreSQL/Supabase;
- reduz atrito enquanto ainda nao ha aplicacao backend definida.

## Quando migrar

Migrar para PostgreSQL/Supabase quando o MVP precisar de:

- varios usuarios usando ao mesmo tempo;
- autenticacao integrada com regras por perfil;
- storage seguro de arquivos;
- backups gerenciados;
- Row Level Security;
- ambiente compartilhado de homologacao/producao.

## Modelo habilitado agora

O banco local cobre o nucleo da Fase 1:

- usuarios e perfis;
- eventos cadastrados;
- equipe do evento;
- checklist operacional/documental;
- tarefas e responsaveis;
- convidados;
- demandas de comunicacao;
- fornecedores;
- modelos de documentos;
- uso de modelos por evento;
- historico/auditoria minima.

## Arquivos

- `db/schema.sql`: estrutura do banco.
- `db/seed.sql`: dados locais de exemplo.
- `db/test.sql`: teste local de criacao, vinculos e consultas.
- `Makefile`: comandos para inicializar, testar e consultar o banco.

## Comandos

```sh
make db-init
make db-test
make db-events
make app
```

Com o servidor local ativo, abra `http://127.0.0.1:4173`. Os eventos criados pelo formulario do `index.html` sao salvos em `data/fluxodc.sqlite`.
