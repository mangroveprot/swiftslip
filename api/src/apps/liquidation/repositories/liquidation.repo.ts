import { BaseRepository } from '../../../core/engine';

export class LiqFormRepository extends BaseRepository<'liq_forms'> {
  constructor() {
    super('liq_forms');
  }
}

/** Expense lines behind a Statement of Liquidation (`form_id` → `liq_forms.id`). */
export class LiqExpenseRepository extends BaseRepository<'liq_expenses'> {
  constructor() {
    super('liq_expenses');
  }
}
