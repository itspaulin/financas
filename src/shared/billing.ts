import { addMonths, daysInMonth, monthOf, monthStart } from './dates';
import type { PaymentMethod } from './types';

// A credit purchase counts in the month its invoice closes. A purchase on the closing day
// itself already goes to the next invoice. Any other payment method counts in the purchase month.
export function billingMonth(spentOn: string, method: PaymentMethod, closingDay: number | null): string {
  const month = monthOf(spentOn);
  if (method !== 'credito' || !closingDay) return monthStart(month);
  const closes = Math.min(closingDay, daysInMonth(month));
  return monthStart(Number(spentOn.slice(8)) >= closes ? addMonths(month, 1) : month);
}
