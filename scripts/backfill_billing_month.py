"""One-off: sets expenses.billing_month and the card closing days on the existing database.

Run after migration 0003. Imported expenses take the spreadsheet tab they came from (the importer
kept the purchase date, so a 12/10 card purchase listed under November showed up in October).
Everything else follows the credit-card closing rule, using the closing days seeded below.

Dry-run by default; pass --apply to write, in a single transaction.

    uv run --with openpyxl --with "psycopg[binary]" scripts/backfill_billing_month.py <xlsx> [--apply]
"""

from __future__ import annotations

import argparse
import calendar
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import import_planilha as importer  # noqa: E402

# Cards that close; other cards stay without a closing day (still editable in Ajustes).
CLOSING_DAYS = {
    importer.fold(k): v
    for k, v in json.loads(importer.CONFIG_PATH.read_text(encoding="utf-8")).get("closing_days", {}).items()
}


def billing_month(spent_on: date, method: str, closing_day: int | None) -> date:
    """Mirror of src/shared/billing.ts."""
    first = spent_on.replace(day=1)
    if method != "credito" or not closing_day:
        return first
    closes = min(closing_day, calendar.monthrange(spent_on.year, spent_on.month)[1])
    if spent_on.day < closes:
        return first
    return importer.from_index(importer.month_index(spent_on.year, spent_on.month) + 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    import psycopg

    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL_UNPOOLED is not set")

    sheet = defaultdict(set)
    for e in importer.build(args.xlsx)["expenses"]:
        key = (e.description, e.amount_cents, e.spent_on, e.category, e.account, e.member, e.installment)
        sheet[key].add(e.billing_month or e.spent_on.replace(day=1))

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(
            "select count(*) from information_schema.columns where table_name = 'expenses' and column_name = 'billing_month'"
        )
        if not cur.fetchone()[0]:
            if args.apply:
                sys.exit("Migration 0003 not applied yet; run `npm run db:migrate` first.")
            # Preview against the migrated shape; rolled back below, so nothing is written.
            migration = (Path(__file__).parent.parent / "drizzle" / "0003_billing_month.sql").read_text()
            for statement in migration.split("--> statement-breakpoint"):
                cur.execute(statement)
        cur.execute("select id, name, closing_day from accounts")
        accounts = {row[0]: (row[1], row[2]) for row in cur.fetchall()}
        closing = {
            id_: CLOSING_DAYS.get(importer.fold(name), current) for id_, (name, current) in accounts.items()
        }
        seeded = [(id_, accounts[id_][0], day) for id_, day in closing.items() if day != accounts[id_][1]]

        cur.execute(
            "select e.id, e.description, e.amount_cents, e.spent_on, c.name, a.name, m.name, e.installment_number,"
            " e.payment_method, e.account_id, e.source, e.billing_month"
            " from expenses e join categories c on c.id = e.category_id"
            " left join accounts a on a.id = e.account_id join members m on m.id = e.member_id"
            " where e.deleted_at is null"
        )
        updates: dict = {}
        moves: Counter = Counter()
        unmatched = ambiguous = 0
        for (id_, desc, amount, spent_on, category, account, member, number, method, account_id, source, current) in cur.fetchall():
            if source in ("importado", "parcela"):
                months = sheet.get((desc, amount, spent_on, category, account, member, number))
                if not months:
                    unmatched += 1
                    continue
                if len(months) > 1:
                    ambiguous += 1
                    continue
                target = next(iter(months))
            else:
                target = billing_month(spent_on, method, closing.get(account_id))
            if target != current:
                updates[id_] = target
                moves[(source, f"{spent_on:%Y-%m}", f"{target:%Y-%m}")] += 1

        print(f"Dias de fechamento a definir: {[(name, day) for _, name, day in seeded] or 'nenhum'}")
        print(f"Lançamentos a mudar de mês: {len(updates)} (importados sem par na planilha: {unmatched}, ambíguos: {ambiguous})")
        for (source, spent, target), count in sorted(moves.items()):
            print(f"  {source:10} {spent} -> {target}: {count}")

        if not args.apply:
            conn.rollback()
            print("\nDry-run: nada foi gravado. Use --apply para gravar.")
            return
        for id_, name, day in seeded:
            cur.execute("update accounts set closing_day = %s where id = %s", (day, id_))
        for id_, target in updates.items():
            cur.execute("update expenses set billing_month = %s where id = %s", (target, id_))
    print("Gravado.")


if __name__ == "__main__":
    main()
