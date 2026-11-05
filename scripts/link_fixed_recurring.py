"""One-off: links imported "Fixos" rows to their recurring template, so the app lists them as recurring.

The importer only created templates from the last tab and left the earlier months unlinked. A row is
linked to the template with the same description, category, account and member, or else to the
only template with that description. At most one row per
template and month is linked (the table allows one); extras stay as plain expenses.

Dry-run by default; pass --apply to write, in a single transaction.

    uv run --with openpyxl --with "psycopg[binary]" scripts/link_fixed_recurring.py <xlsx> [--apply]
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import import_planilha as importer  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    import psycopg

    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL_UNPOOLED is not set")

    fixed = Counter()
    for e in importer.build(args.xlsx)["expenses"]:
        if e.fixed:
            fixed[(e.description, e.amount_cents, e.spent_on, e.category, e.account, e.member)] += 1

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(
            "select r.id, r.description, c.name, a.name, m.name from recurring_expenses r"
            " join categories c on c.id = r.category_id left join accounts a on a.id = r.account_id"
            " join members m on m.id = r.member_id"
        )
        rows = cur.fetchall()
        templates = {(d, c, a, m): id_ for id_, d, c, a, m in rows}
        by_description: dict = {}
        for id_, d, *_ in rows:
            by_description.setdefault(importer.fold(d), set()).add(id_)

        cur.execute(
            "select e.id, e.description, e.amount_cents, e.spent_on, c.name, a.name, m.name, e.billing_month"
            " from expenses e join categories c on c.id = e.category_id left join accounts a on a.id = e.account_id"
            " join members m on m.id = e.member_id"
            " where e.source = 'importado' and e.recurring_expense_id is null and e.deleted_at is null"
            " order by e.spent_on, e.created_at"
        )
        taken, links, unmatched, skipped = set(), [], Counter(), 0
        for id_, desc, amount, spent_on, category, account, member, billing in cur.fetchall():
            if not fixed.get((desc, amount, spent_on, category, account, member)):
                continue
            template = templates.get((desc, category, account, member))
            if not template and len(same := by_description.get(importer.fold(desc), ())) == 1:
                template = next(iter(same))
            if not template:
                unmatched[f"{desc} ({billing:%Y-%m})"] += 1
                continue
            month = spent_on.replace(day=1)
            if (template, month) in taken:
                skipped += 1
                continue
            taken.add((template, month))
            links.append((template, month, id_))

        print(f"Fixos a vincular: {len(links)} (repetidos no mesmo mês, mantidos avulsos: {skipped})")
        print(f"Fixos sem modelo recorrente (ficam avulsos): {sum(unmatched.values())}")
        for desc, count in unmatched.most_common():
            print(f"  {desc}: {count}")

        if not args.apply:
            conn.rollback()
            print("\nDry-run: nada foi gravado. Use --apply para gravar.")
            return
        for template, month, id_ in links:
            cur.execute(
                "update expenses set recurring_expense_id = %s, recurrence_month = %s where id = %s",
                (template, month, id_),
            )
    print("Gravado.")


if __name__ == "__main__":
    main()
