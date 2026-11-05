import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { StatusError } from 'expo-server';
import { z } from 'zod';

import { isIsoDate, today } from '@/shared/dates';
import type { Draft, Lookups, PaymentMethod } from '@/shared/types';

// Anthropic API (Claude Haiku 5.5) when ANTHROPIC_API_KEY is set; otherwise the Bedrock API key
// already used by the prospeccao project, whose AWS account only has Claude Haiku 4.5.
function getClient() {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 20_000 }),
      model: 'claude-haiku-5-5',
      effort: { effort: 'low' as const },
    };
  }
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
    return {
      client: new AnthropicBedrock({
        apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
        awsRegion: process.env.AWS_REGION ?? 'us-east-1',
        maxRetries: 1,
        timeout: 20_000,
      }),
      model: process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      effort: {},
    };
  }
  throw new StatusError(503, 'IA não configurada (falta ANTHROPIC_API_KEY ou AWS_BEARER_TOKEN_BEDROCK)');
}

const SYSTEM = `Você transforma frases curtas em português sobre dinheiro em um lançamento estruturado de um app de finanças de uma casa (casal ou família).

Regras:
- kind: "income" quando a pessoa recebeu dinheiro (salário, pix recebido, venda); senão "expense".
- description: nome curto e limpo do item, com inicial maiúscula (ex.: "Salgado", "Uber", "Mercado").
- amount_cents: o valor em centavos exatamente como aparece na frase. "10 reais" = 1000, "R$ 47,90" = 4790, "10x de 439,90" = 43990.
- amount_is_installment: true quando o valor citado é o de cada parcela ("10x de 439,90"); false quando é o total ("2000 em 10x") ou à vista.
- installments: número de parcelas quando a compra for parcelada ("em 10x", "parcelei em 3"); senão null.
- date: data no formato AAAA-MM-DD. Interprete "hoje", "ontem", "anteontem", dias da semana e "dia 11" (mês atual, ou o anterior se ainda não chegou) a partir da data de hoje informada. Sem data na frase, use hoje.
- category, account, member, payment_method: escolha somente entre as opções listadas. Se não der para deduzir, use null. Não invente.
- Cartão de crédito citado ("no nubank", "no crédito") implica payment_method "credito", salvo se a frase disser pix ou débito.
- member é quem gastou ou recebeu. "do Luiz", "da Manu", "eu" (= quem está escrevendo) indicam a pessoa.`;

function buildSchema(lookups: Lookups) {
  const names = (items: { name: string }[]) => {
    const unique = [...new Set(items.map((i) => i.name))];
    return unique.length ? z.enum(unique as [string, ...string[]]).nullable() : z.null();
  };
  return z.object({
    kind: z.enum(['expense', 'income']),
    description: z.string(),
    amount_cents: z.number().int().nullable(),
    amount_is_installment: z.boolean(),
    installments: z.number().int().nullable(),
    date: z.string(),
    category: names(lookups.categories.filter((c) => !c.archived)),
    payment_method: z.enum(['pix', 'debito', 'credito', 'dinheiro']).nullable(),
    account: names(lookups.accounts.filter((a) => !a.archived)),
    member: names(lookups.members),
  });
}

function weekday(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export async function parseEntry(text: string, lookups: Lookups): Promise<Draft> {
  const { client, model, effort } = getClient();
  const now = today();
  const activeCategories = lookups.categories.filter((c) => !c.archived);
  const activeAccounts = lookups.accounts.filter((a) => !a.archived);
  const context = [
    `Hoje: ${now} (${weekday(now)})`,
    `Quem está escrevendo: ${lookups.me.name}`,
    `Pessoas: ${lookups.members.map((m) => m.name).join(', ')}`,
    `Categorias: ${activeCategories.map((c) => c.name).join(', ')}`,
    `Cartões/contas: ${activeAccounts
      .map((a) => {
        const owner = lookups.members.find((m) => m.id === a.ownerMemberId)?.name;
        return owner ? `${a.name} (de ${owner})` : a.name;
      })
      .join(', ')}`,
  ].join('\n');

  let response;
  try {
    response = await client.messages.parse({
      model,
      max_tokens: 2048,
      output_config: { ...effort, format: zodOutputFormat(buildSchema(lookups)) },
      system: SYSTEM,
      messages: [{ role: 'user', content: `${context}\n\nFrase: ${text}` }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new StatusError(429, 'IA ocupada, tente de novo em instantes');
    if (error instanceof Anthropic.APIError) throw new StatusError(502, 'A IA não respondeu, tente de novo');
    throw error;
  }

  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new StatusError(422, 'Não entendi, tente escrever de outro jeito');
  }
  const out = response.parsed_output;
  const byName = <T extends { id: string; name: string }>(items: T[], name: string | null) =>
    name ? (items.find((i) => i.name === name)?.id ?? null) : null;

  const accountId = byName(activeAccounts, out.account);
  let paymentMethod: PaymentMethod | null = out.payment_method;
  if (!paymentMethod && accountId) paymentMethod = 'credito';

  const installments = out.installments && out.installments > 1 ? Math.min(out.installments, 120) : null;
  const amount = out.amount_cents && out.amount_cents > 0 ? out.amount_cents : null;
  const total = amount && installments && out.amount_is_installment ? amount * installments : amount;

  return {
    kind: out.kind,
    description: out.description.trim() || text.trim().slice(0, 60),
    amountCents: total,
    date: isIsoDate(out.date) ? out.date : now,
    categoryId: byName(activeCategories, out.category),
    paymentMethod,
    accountId,
    memberId: byName(lookups.members, out.member) ?? lookups.me.id,
    installments,
    rawText: text,
  };
}
