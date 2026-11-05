import { StatusError } from 'expo-server';
import { z } from 'zod';

type Handler<P> = (request: Request, params: P) => Promise<Response>;

export function route<P = Record<string, string>>(handler: Handler<P>): Handler<P> {
  return async (request, params) => {
    try {
      return await handler(request, params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json({ error: 'Dados inválidos', issues: error.issues }, { status: 400 });
      }
      if (error instanceof StatusError || error instanceof Response) throw error;
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
      console.error('API error', error, cause);
      return Response.json({ error: 'Erro interno, tente de novo' }, { status: 500 });
    }
  };
}

export async function body<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new StatusError(400, 'JSON inválido');
  }
  return schema.parse(json);
}

export function notFound(): never {
  throw new StatusError(404, 'Não encontrado');
}
