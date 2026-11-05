# Finanças

App de finanças para uma casa (casal ou família), feito com Expo / React Native. Roda no iOS, no Android e na web, com um layout próprio para telas largas.

## O que faz

- **Lançamentos**: despesas e receitas por mês, com categoria, conta ou cartão, forma de pagamento (pix, débito, crédito, dinheiro) e quem gastou.
- **Lançamento por IA**: o usuário escreve uma frase como "gastei 10 reais hoje num salgado" e o app monta o lançamento. Usa Claude Haiku pela API da Anthropic ou pelo Bedrock.
- **Cartão de crédito por fatura**: cada cartão tem um dia de fechamento, e a compra entra na fatura do mês certo.
- **Parcelamentos**: compras parceladas viram um plano, com as parcelas lançadas mês a mês e a opção de quitar antecipado.
- **Recorrentes**: despesas e receitas fixas ficam em uma seção própria e são lançadas automaticamente.
- **Painel**: resumo do mês, gasto por categoria e metas por categoria.
- **Múltiplas casas**: cada casa tem seus próprios dados, e novos membros entram por código de convite. Os dados de uma casa nunca aparecem para outra.

## Tecnologias

- **App**: Expo SDK 58, React 19, React Native 0.88, Expo Router (rotas em `src/app/`), React Compiler.
- **API**: API routes do Expo Router (`src/app/api/[...path]+api.ts`), validação com Zod, autenticação própria com sessões e senha em PBKDF2.
- **Banco**: PostgreSQL na Neon (driver serverless) com Drizzle ORM e migrações em `drizzle/`.
- **IA**: SDKs `@anthropic-ai/sdk` e `@anthropic-ai/bedrock-sdk`.
- **Build e deploy**: EAS Build e EAS Hosting (perfis em `eas.json`).

## Estrutura

```
src/
  app/        rotas e telas (Expo Router), incluindo a API
  components/ componentes de interface reutilizáveis
  features/   telas e fluxos por assunto (lançamentos, painel, planos, recorrentes, ajustes)
  lib/        cliente da API, autenticação, dados e tema no app
  server/     regras de negócio, autenticação, IA e acesso ao banco
  shared/     tipos e cálculos usados pelo app e pelo servidor (datas, faturas)
  db/         schema do banco (Drizzle)
drizzle/      migrações SQL
scripts/      importação de planilha, manutenção de dados e teste de isolamento
```

## Variáveis de ambiente

| Variável | Para que serve |
| --- | --- |
| `DATABASE_URL` | Conexão com o PostgreSQL (Neon). |
| `DATABASE_URL_UNPOOLED` | Conexão direta, usada pelas migrações. |
| `ANTHROPIC_API_KEY` | Chave da API da Anthropic, usada no lançamento por IA. |
| `AWS_BEARER_TOKEN_BEDROCK`, `AWS_REGION`, `BEDROCK_MODEL_ID` | Alternativa à Anthropic, usando o Bedrock. |
| `APP_ORIGIN` | Endereço da API que os apps nativos chamam. Definido nos perfis de build em `eas.json`. |

## Scripts

- `npm run lint` e `npm run typecheck` verificam o código.
- `npm run db:generate`, `db:migrate` e `db:studio` cuidam do banco com o Drizzle Kit.
- `scripts/tenant-isolation.test.mjs` testa, contra um servidor rodando, que uma casa não enxerga os dados de outra.
- `scripts/import_planilha.py` importa uma planilha anual (uma aba por mês). Os membros e as contas ficam em `scripts/import_config.json`, que não vai para o git. O formato está em `scripts/import_config.example.json`.
