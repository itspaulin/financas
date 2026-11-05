import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { StatusError } from 'expo-server';

import { categories, householdInvites, households, members, sessions } from '@/db/schema';
import type { Member } from '@/shared/types';

import { getDb } from './db';
import { hashPassword, verifyPassword } from './password';

const SESSION_DAYS = 90;
const INVITE_DAYS = 7;
// Unambiguous characters only (no 0/O, 1/I/L), since people type this code by hand.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const STARTER_CATEGORIES = ['Mercado', 'Moradia', 'Transporte', 'Alimentação', 'Saúde', 'Lazer', 'Educação', 'Outros'];

// The signed-in person plus the household (tenant) every query must be scoped to.
export type Me = Member & { householdId: string };

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

function normalizeInviteCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

async function startSession(member: Member): Promise<{ token: string; member: Member }> {
  const token = randomToken();
  await getDb().insert(sessions).values({
    memberId: member.id,
    tokenHash: await sha256(token),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  return { token, member };
}

export async function login(email: string, password: string): Promise<{ token: string; member: Member }> {
  const [member] = await getDb()
    .select()
    .from(members)
    .where(eq(sql`lower(${members.email})`, email.trim().toLowerCase()));
  if (!member?.passwordHash || !(await verifyPassword(password, member.passwordHash))) {
    throw new StatusError(401, 'E-mail ou senha incorretos');
  }
  return startSession({ id: member.id, name: member.name, email: member.email });
}

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  householdName?: string;
  inviteCode?: string;
};

// With an invite code the person joins that household; without one they start a new household.
export async function register(input: RegisterInput): Promise<{ token: string; member: Member }> {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const [existing] = await db.select({ id: members.id }).from(members).where(eq(sql`lower(${members.email})`, email));
  if (existing) throw new StatusError(409, 'Já existe uma conta com esse e-mail');
  const passwordHash = await hashPassword(input.password);
  const memberId = crypto.randomUUID();

  if (input.inviteCode) {
    // Burning the invite first, atomically, keeps one code from being used twice.
    const [invite] = await db
      .update(householdInvites)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(householdInvites.codeHash, await sha256(normalizeInviteCode(input.inviteCode))),
          isNull(householdInvites.usedAt),
          gt(householdInvites.expiresAt, new Date()),
        ),
      )
      .returning({ id: householdInvites.id, householdId: householdInvites.householdId });
    if (!invite) throw new StatusError(400, 'Convite inválido ou expirado');
    try {
      await db.insert(members).values({ id: memberId, householdId: invite.householdId, name, email, passwordHash });
    } catch (error) {
      await db.update(householdInvites).set({ usedAt: null }).where(eq(householdInvites.id, invite.id));
      if (String(error).includes('members_email_unique')) throw new StatusError(409, 'Já existe uma conta com esse e-mail');
      throw error;
    }
  } else {
    const householdId = crypto.randomUUID();
    try {
      await db.batch([
        db.insert(households).values({ id: householdId, name: input.householdName?.trim() || `Casa de ${name}` }),
        db.insert(members).values({ id: memberId, householdId, name, email, passwordHash }),
        db.insert(categories).values(STARTER_CATEGORIES.map((category) => ({ householdId, name: category }))),
      ]);
    } catch (error) {
      if (String(error).includes('members_email_unique')) throw new StatusError(409, 'Já existe uma conta com esse e-mail');
      throw error;
    }
  }
  return startSession({ id: memberId, name, email });
}

export async function logout(request: Request): Promise<void> {
  const token = bearer(request);
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token)));
}

export async function requireMember(request: Request): Promise<Me> {
  const token = bearer(request);
  if (!token) throw new StatusError(401, 'Faça login');
  const [row] = await getDb()
    .select({ id: members.id, name: members.name, email: members.email, householdId: members.householdId })
    .from(sessions)
    .innerJoin(members, eq(members.id, sessions.memberId))
    .where(and(eq(sessions.tokenHash, await sha256(token)), gt(sessions.expiresAt, new Date())));
  if (!row) throw new StatusError(401, 'Sessão expirada, faça login de novo');
  return row;
}

export async function createInvite(me: Me): Promise<{ code: string; expiresAt: string }> {
  const code = randomInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await getDb().insert(householdInvites).values({
    householdId: me.householdId,
    codeHash: await sha256(code),
    createdByMemberId: me.id,
    expiresAt,
  });
  return { code, expiresAt: expiresAt.toISOString() };
}

// Deletes the person's data. A household whose only member leaves is erased with everything in it;
// otherwise the person is anonymised, since the household's entries still point at them.
export async function deleteAccount(me: Me, password: string): Promise<void> {
  const db = getDb();
  const [member] = await db.select().from(members).where(eq(members.id, me.id));
  if (!member?.passwordHash || !(await verifyPassword(password, member.passwordHash))) {
    throw new StatusError(403, 'Senha incorreta');
  }
  const others = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.householdId, me.householdId), sql`${members.id} <> ${me.id}`, sql`${members.passwordHash} is not null`));
  if (!others.length) {
    await db.delete(households).where(eq(households.id, me.householdId));
    return;
  }
  await db.batch([
    db.delete(sessions).where(eq(sessions.memberId, me.id)),
    db
      .update(members)
      .set({ name: 'Ex-membro', email: `removido-${me.id}@removido.invalid`, passwordHash: null, authUserId: null })
      .where(eq(members.id, me.id)),
  ]);
}
