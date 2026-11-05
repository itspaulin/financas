"""Imports the yearly spreadsheet (one tab per month) into the database.

Dry-run by default: prints what would be imported and every row that needed a
fallback. Pass --apply to write, in a single transaction, into an empty database.

    uv run --with openpyxl --with "psycopg[binary]" scripts/import_planilha.py <xlsx> [--apply]
"""

from __future__ import annotations

import argparse
import calendar
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

import openpyxl

YEAR = 2026
MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
CONFIG_PATH = Path(__file__).with_name("import_config.json")


def load_config() -> tuple[dict[str, str], dict[str, str]]:
    """Members and account owners are personal data: they live in a git-ignored file.

    See import_config.example.json for the shape.
    """
    if not CONFIG_PATH.exists():
        sys.exit(f"Falta {CONFIG_PATH.name}: copie import_config.example.json e preencha.")
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return config["members"], {fold(k): v for k, v in config["account_owners"].items()}


NO_ACCOUNT = {"sem cartao"}
PAYMENT_METHODS = {"pix": "pix", "debito": "debito", "credito": "credito", "dinheiro": "dinheiro"}
FALLBACK_CATEGORY = "Outros"
RECURRING_START = date(YEAR + 1, 1, 1)

COL_NAME, COL_DATE, COL_CATEGORY, COL_METHOD, COL_ACCOUNT, COL_MEMBER, COL_VALUE, COL_PAID = range(2, 10)
COL_SIDE_LABEL, COL_SIDE_VALUE, COL_SIDE_GOAL = 11, 12, 13


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.strip().lower())
    return "".join(c for c in text if not unicodedata.combining(c))


MEMBERS, ACCOUNT_OWNERS = load_config()


def month_index(year: int, month: int) -> int:
    return year * 12 + month - 1


def from_index(index: int, day: int = 1) -> date:
    year, month = divmod(index, 12)
    return date(year, month + 1, min(day, calendar.monthrange(year, month + 1)[1]))


def cents(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return round(value * 100)


@dataclass
class Row:
    tab: int
    line: int
    block: str
    description: str
    amount_cents: int
    raw_date: object
    category: str | None
    method: str | None
    account: str | None
    member: str | None
    paid: bool


@dataclass
class Expense:
    description: str
    amount_cents: int
    spent_on: date
    category: str
    method: str
    account: str | None
    member: str
    paid: bool
    plan_key: tuple | None = None
    installment: int | None = None
    # Month the expense is paid in. Defaults to the spent_on month; avulsos follow their spreadsheet tab.
    billing_month: date | None = None
    # Came from the spreadsheet's "Fixos" block.
    fixed: bool = False


@dataclass
class Plan:
    description: str
    count: int
    start_index: int
    rows: list[tuple[int, Row]] = field(default_factory=list)
    settled_on: date | None = None


@dataclass
class Report:
    notes: list[str] = field(default_factory=list)

    def add(self, row: Row | None, message: str) -> None:
        where = f"{MONTHS[row.tab - 1]}!B{row.line} ({row.description})" if row else ""
        self.notes.append(f"{where}: {message}" if where else message)


def text_or_none(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def find_line(ws, label: str, start: int = 1, column: int = COL_NAME) -> int:
    for line in range(start, ws.max_row + 1):
        value = ws.cell(line, column).value
        if isinstance(value, str) and fold(value).startswith(fold(label)):
            return line
    raise ValueError(f"{ws.title}: label {label!r} not found")


def read_block(ws, tab: int, block: str, title: str, total_label: str, report: Report) -> list[Row]:
    header = find_line(ws, "Nome", find_line(ws, title))
    total = find_line(ws, total_label, header)
    rows = []
    for line in range(header + 1, total):
        get = lambda col: ws.cell(line, col).value  # noqa: E731
        amount = cents(get(COL_VALUE))
        name = text_or_none(get(COL_NAME))
        if not amount:
            if name:
                report.add(None, f"{ws.title}!B{line} ({name}): sem valor, ignorado")
            continue
        row = Row(
            tab=tab,
            line=line,
            block=block,
            description=name or "Sem nome",
            amount_cents=amount,
            raw_date=get(COL_DATE),
            category=text_or_none(get(COL_CATEGORY)),
            method=text_or_none(get(COL_METHOD)),
            account=text_or_none(get(COL_ACCOUNT)),
            member=text_or_none(get(COL_MEMBER)),
            paid=get(COL_PAID) is True,
        )
        if not name:
            report.add(row, "sem nome, importado como 'Sem nome'")
        rows.append(row)
    return rows


def read_goals(ws, tab: int) -> dict[str, int]:
    header = find_line(ws, "Gastos por categoria", column=COL_SIDE_LABEL)
    goals = {}
    for line in range(header + 2, header + 40):
        label = text_or_none(ws.cell(line, COL_SIDE_LABEL).value)
        if not label:
            break
        goal = cents(ws.cell(line, COL_SIDE_GOAL).value)
        if goal is not None:
            goals[label] = goal
    return goals


def read_incomes(ws, tab: int) -> list[tuple[str, int]]:
    header = find_line(ws, "Entradas", column=COL_SIDE_LABEL)
    incomes = []
    for line in range(header + 1, header + 30):
        label = text_or_none(ws.cell(line, COL_SIDE_LABEL).value)
        if label and fold(label) == "total":
            break
        amount = cents(ws.cell(line, COL_SIDE_VALUE).value)
        if label and amount:
            incomes.append((label, amount))
    return incomes


def installment_of(raw: object) -> tuple[int, int] | None:
    # Excel turned "3/10" (installment/total) into the date 3 October.
    if isinstance(raw, datetime):
        return raw.day, raw.month
    if isinstance(raw, str) and (match := re.fullmatch(r"\s*(\d+)\s*/\s*(\d+)\s*", raw)):
        return int(match[1]), int(match[2])
    return None


def fixed_date(row: Row, report: Report) -> date:
    if isinstance(row.raw_date, datetime):
        result = from_index(month_index(YEAR, row.tab), row.raw_date.day)
        if (row.raw_date.year, row.raw_date.month) != (YEAR, row.tab):
            report.add(row, f"data {row.raw_date:%d/%m/%Y} trocada para {result:%d/%m/%Y} (mês da aba)")
        return result
    report.add(row, "fixo sem data, usado dia 1")
    return from_index(month_index(YEAR, row.tab))


def purchase_date(row: Row, report: Report) -> date:
    tab_index = month_index(YEAR, row.tab)
    window = range(tab_index - 2, tab_index + 1)
    if not isinstance(row.raw_date, datetime):
        result = from_index(tab_index)
        report.add(row, f"sem data, usado {result:%d/%m/%Y}")
        return result
    raw = row.raw_date.date()
    if month_index(raw.year, raw.month) in window:
        return raw
    for year in (YEAR - 1, YEAR, YEAR + 1):
        if month_index(year, raw.month) in window:
            result = from_index(month_index(year, raw.month), raw.day)
            report.add(row, f"data {raw:%d/%m/%Y} corrigida para {result:%d/%m/%Y} (ano)")
            return result
    report.add(row, f"data {raw:%d/%m/%Y} fora do mês da aba, mantida")
    return raw


class Resolver:
    def __init__(self, report: Report):
        self.report = report
        self.categories: dict[str, str] = {}
        self.accounts: dict[str, str] = {}

    def category(self, name: str | None, row: Row | None = None) -> str:
        if not name:
            if row:
                self.report.add(row, f"sem categoria, usado '{FALLBACK_CATEGORY}'")
            name = FALLBACK_CATEGORY
        return self.categories.setdefault(fold(name), name.strip())

    def account(self, name: str | None) -> str | None:
        if not name or fold(name) in NO_ACCOUNT:
            return None
        return self.accounts.setdefault(fold(name), name.strip())

    def method(self, name: str | None, account: str | None, row: Row) -> str:
        if name and fold(name) in PAYMENT_METHODS:
            return PAYMENT_METHODS[fold(name)]
        fallback = "credito" if account else "pix"
        self.report.add(row, f"forma de pagamento {name!r} desconhecida, usado {fallback}")
        return fallback

    def member(self, name: str | None, account: str | None, row: Row) -> str:
        for member in MEMBERS:
            if name and fold(name) == fold(member):
                return member
        fallback = ACCOUNT_OWNERS.get(fold(account or ""), next(iter(MEMBERS)))
        self.report.add(row, f"sem responsável, usado {fallback}")
        return fallback


def first(rows: list[Row], attr: str) -> str | None:
    return next((getattr(r, attr) for r in rows if getattr(r, attr)), None)


def build(path: Path):
    wb = openpyxl.load_workbook(path, data_only=False)
    report = Report()
    resolve = Resolver(report)
    expenses: list[Expense] = []
    plans: dict[tuple, Plan] = {}
    goals: list[tuple[str, date, int]] = []
    incomes: list[tuple[str, int, date, str | None]] = []
    recurring: list[Expense] = []
    last_goal: dict[str, int] = {}
    plain_installments: list[Row] = []

    for tab, title in enumerate(MONTHS, start=1):
        ws = wb[title]
        tab_start = from_index(month_index(YEAR, tab))

        for label, goal in read_goals(ws, tab).items():
            category = resolve.category(label)
            if last_goal.get(category) != goal:
                goals.append((category, tab_start, goal))
                last_goal[category] = goal

        for label, amount in read_incomes(ws, tab):
            member = next((m for m in MEMBERS if fold(m) in fold(label)), None)
            incomes.append((label, amount, tab_start, member))

        for row in read_block(ws, tab, "fixo", "Fixos", "Total de fixos", report):
            account = resolve.account(row.account)
            expense = Expense(
                description=row.description,
                amount_cents=row.amount_cents,
                spent_on=fixed_date(row, report),
                category=resolve.category(row.category, row),
                method=resolve.method(row.method, account, row),
                account=account,
                member=resolve.member(row.member, account, row),
                paid=row.paid,
                fixed=True,
            )
            expenses.append(expense)
            if tab == 12:
                recurring.append(expense)

        for row in read_block(ws, tab, "parcela", "Parcelamentos", "Total de parcelamentos", report):
            parsed = installment_of(row.raw_date)
            if not parsed or not 1 <= parsed[0] <= parsed[1]:
                plain_installments.append(row)
                continue
            number, count = parsed
            start = month_index(YEAR, tab) - (number - 1)
            key = (fold(row.description), count, start)
            plans.setdefault(key, Plan(row.description, count, start)).rows.append((number, row))

        for row in read_block(ws, tab, "gasto", "Gastos", "Total de gastos", report):
            account = resolve.account(row.account)
            expenses.append(
                Expense(
                    description=row.description,
                    amount_cents=row.amount_cents,
                    spent_on=purchase_date(row, report),
                    category=resolve.category(row.category, row),
                    method=resolve.method(row.method, account, row),
                    account=account,
                    member=resolve.member(row.member, account, row),
                    paid=row.paid,
                    billing_month=tab_start,
                )
            )

    for row in plain_installments:
        report.add(row, "parcela sem 'n/total', importada como gasto avulso")
        account = resolve.account(row.account)
        expenses.append(
            Expense(
                description=row.description,
                amount_cents=row.amount_cents,
                spent_on=from_index(month_index(YEAR, row.tab)),
                category=resolve.category(row.category, row),
                method=resolve.method(row.method, account, row),
                account=account,
                member=resolve.member(row.member, account, row),
                paid=row.paid,
            )
        )

    last_tab = month_index(YEAR, 12)
    future_installments = 0
    for key, plan in plans.items():
        rows = [r for _, r in plan.rows]
        account = resolve.account(first(rows, "account"))
        category = resolve.category(first(rows, "category"))
        method = resolve.method(first(rows, "method"), account, rows[0])
        member = resolve.member(first(rows, "member"), account, rows[0])
        seen = {}
        for number, row in plan.rows:
            if number in seen:
                report.add(row, f"parcela {number}/{plan.count} repetida, ignorada")
                continue
            seen[number] = row
            expenses.append(
                Expense(row.description, row.amount_cents, from_index(plan.start_index + number - 1),
                        category, method, account, member, row.paid, key, number)
            )
        amounts = [r.amount_cents for r in seen.values()]
        if max(amounts) > min(amounts) * 1.2:
            report.add(None, f"{plan.description} ({plan.count}x): valores muito diferentes entre parcelas "
                             f"({', '.join(f'R$ {a / 100:.2f}' for a in sorted(set(amounts)))}), confira")
        last_month = plan.start_index + max(seen) - 1
        if max(seen) < plan.count and last_month < last_tab:
            plan.settled_on = from_index(last_month)
            report.add(None, f"{plan.description} ({plan.count}x): quitado na parcela {max(seen)} "
                             f"em {from_index(last_month):%m/%Y}")
        elif max(seen) < plan.count:
            last_amount = seen[max(seen)].amount_cents
            for number in range(max(seen) + 1, plan.count + 1):
                expenses.append(
                    Expense(plan.description, last_amount, from_index(plan.start_index + number - 1),
                            category, method, account, member, False, key, number)
                )
                future_installments += 1
        missing = [n for n in range(min(seen), max(seen)) if n not in seen]
        if missing:
            report.add(None, f"{plan.description} ({plan.count}x): parcelas {missing} não estão na planilha")

    return {
        "report": report,
        "resolve": resolve,
        "expenses": expenses,
        "plans": plans,
        "goals": goals,
        "incomes": incomes,
        "recurring": recurring,
        "future_installments": future_installments,
    }


def summarize(data) -> None:
    expenses = data["expenses"]
    by_month = Counter()
    for e in expenses:
        by_month[e.spent_on.strftime("%Y-%m")] += e.amount_cents
    print(f"Membros: {', '.join(MEMBERS)}")
    print(f"Categorias ({len(data['resolve'].categories)}): {', '.join(sorted(data['resolve'].categories.values()))}")
    print(f"Contas ({len(data['resolve'].accounts)}): {', '.join(sorted(data['resolve'].accounts.values()))}")
    print(f"Metas (mudanças): {len(data['goals'])}")
    print(f"Entradas: {len(data['incomes'])}")
    print(f"Lançamentos: {len(expenses)} (parcelas futuras geradas: {data['future_installments']})")
    print(f"Planos de parcelamento: {len(data['plans'])}")
    for key, plan in sorted(data["plans"].items(), key=lambda kv: kv[0][2]):
        numbers = sorted({n for n, _ in plan.rows})
        print(f"  {plan.description} {plan.count}x, 1ª parcela {from_index(plan.start_index):%m/%Y}, na planilha: {numbers}")
    print(f"Fixos recorrentes a partir de {RECURRING_START:%m/%Y}: {len(data['recurring'])}")
    for r in data["recurring"]:
        print(f"  {r.description}: R$ {r.amount_cents / 100:.2f} dia {r.spent_on.day}")
    print("Total por mês (data da compra):")
    for month, total in sorted(by_month.items()):
        print(f"  {month}: R$ {total / 100:,.2f}")
    print(f"\nAjustes ({len(data['report'].notes)}):")
    for note in data["report"].notes:
        print(f"  - {note}")


def apply(data) -> None:
    import psycopg

    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL_UNPOOLED is not set")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select (select count(*) from expenses) + (select count(*) from members)")
        if cur.fetchone()[0]:
            sys.exit("Database is not empty; refusing to import twice.")

        def insert(sql: str, params: tuple) -> str:
            cur.execute(sql + " returning id", params)
            return cur.fetchone()[0]

        # Every row belongs to a household; the import creates the one the spreadsheet describes.
        hid = insert("insert into households (name) values (%s)", ("Casa",))

        member_ids = {
            name: insert("insert into members (household_id, name, email) values (%s, %s, %s)", (hid, name, email))
            for name, email in MEMBERS.items()
        }
        category_ids = {
            name: insert("insert into categories (household_id, name) values (%s, %s)", (hid, name))
            for name in data["resolve"].categories.values()
        }
        account_ids = {
            name: insert(
                "insert into accounts (household_id, name, owner_member_id) values (%s, %s, %s)",
                (hid, name, member_ids.get(ACCOUNT_OWNERS.get(fold(name), ""))),
            )
            for name in data["resolve"].accounts.values()
        }
        for category, starts_on, amount in data["goals"]:
            cur.execute(
                "insert into category_goals (household_id, category_id, starts_on, amount_cents) values (%s, %s, %s, %s)",
                (hid, category_ids[category], starts_on, amount),
            )
        for label, amount, received_on, member in data["incomes"]:
            cur.execute(
                "insert into incomes (household_id, description, amount_cents, received_on, member_id, source)"
                " values (%s, %s, %s, %s, %s, 'importado')",
                (hid, label, amount, received_on, member_ids.get(member)),
            )

        plan_ids = {}
        for key, plan in data["plans"].items():
            plan_expenses = [e for e in data["expenses"] if e.plan_key == key]
            sample = plan_expenses[0]
            missing = 0 if plan.settled_on else plan.count - len(plan_expenses)
            plan_ids[key] = insert(
                "insert into installment_plans (household_id, description, total_cents, installments_count,"
                " purchased_on, category_id, payment_method, account_id, member_id, settled_on)"
                " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    hid,
                    plan.description,
                    sum(e.amount_cents for e in plan_expenses) + sample.amount_cents * missing,
                    plan.count,
                    from_index(plan.start_index),
                    category_ids[sample.category],
                    sample.method,
                    account_ids.get(sample.account),
                    member_ids[sample.member],
                    plan.settled_on,
                ),
            )

        for e in data["expenses"]:
            cur.execute(
                "insert into expenses (household_id, description, amount_cents, spent_on, category_id,"
                " payment_method, account_id, member_id, paid, source, installment_plan_id, installment_number,"
                " billing_month) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    hid,
                    e.description,
                    e.amount_cents,
                    e.spent_on,
                    category_ids[e.category],
                    e.method,
                    account_ids.get(e.account),
                    member_ids[e.member],
                    e.paid,
                    "parcela" if e.plan_key else "importado",
                    plan_ids.get(e.plan_key),
                    e.installment,
                    e.billing_month or e.spent_on.replace(day=1),
                ),
            )

        for r in data["recurring"]:
            cur.execute(
                "insert into recurring_expenses (household_id, description, amount_cents, day_of_month,"
                " category_id, payment_method, account_id, member_id, starts_on)"
                " values (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    hid,
                    r.description,
                    r.amount_cents,
                    r.spent_on.day,
                    category_ids[r.category],
                    r.method,
                    account_ids.get(r.account),
                    member_ids[r.member],
                    RECURRING_START,
                ),
            )
    print("Importação gravada.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    data = build(args.xlsx)
    summarize(data)
    if args.apply:
        apply(data)


if __name__ == "__main__":
    main()
