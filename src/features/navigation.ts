import { router } from 'expo-router';

import { draftStore } from '@/lib/data';
import type { Draft } from '@/shared/types';

import { useDesktop } from './desktop/shell';

export function useEntryActions() {
  const desktop = useDesktop();
  return {
    newExpense(draft?: Draft) {
      if (desktop) return desktop.open({ kind: 'new-expense', draft });
      if (draft) draftStore.put(draft);
      router.push('/expense/new');
    },
    newInstallment() {
      if (desktop) return desktop.open({ kind: 'new-expense', installments: true });
      router.push('/expense/new?installments=1');
    },
    newIncome(draft?: Draft) {
      if (desktop) return desktop.open({ kind: 'new-income', draft });
      if (draft) draftStore.put(draft);
      router.push('/income/new');
    },
    editExpense(id: string) {
      if (desktop) return desktop.open({ kind: 'expense', id });
      router.push(`/expense/${id}`);
    },
    editIncome(id: string) {
      if (desktop) return desktop.open({ kind: 'income', id });
      router.push(`/income/${id}`);
    },
    openPlan(id: string, title = 'Parcelamento') {
      if (desktop) return desktop.open({ kind: 'plan', id, title });
      router.push(`/installment/${id}`);
    },
  };
}
