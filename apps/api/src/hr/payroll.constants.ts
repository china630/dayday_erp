/**
 * Порог для BullMQ: при N сотрудников / листов сверх порога — асинхронно.
 * `0` — всегда очередь (API не блокируется расчётом ЗП).
 */
export const PAYROLL_ENTITY_ASYNC_THRESHOLD = 0;
