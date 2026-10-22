import { expect, it } from 'vitest';
import { architecturePositions, architectureRole } from '../src/architecture';

it('labels explicit folder conventions without classifying unknown source as an entry or endpoint', () => {
  expect(architectureRole('api/src/controllers/orders.ts')).toMatchObject({ lane: 'backend', column: 0 });
  expect(architectureRole('src/services/order.ts')).toMatchObject({ lane: 'backend', column: 1 });
  expect(architectureRole('api/src/connectors/sql/orders.ts')).toMatchObject({ lane: 'backend', column: 2 });
  expect(architectureRole('web/src/app/layout.tsx')).toMatchObject({ lane: 'frontend', column: 0 });
  expect(architectureRole('web/src/features/orders/api/client.ts')).toMatchObject({ lane: 'frontend', label: 'API client', column: 2 });
  expect(architectureRole('web/src/components/button.tsx')).toMatchObject({ lane: 'frontend', column: 2 });
  expect(architectureRole('shared/utils.ts')).toMatchObject({ lane: 'other', label: 'Unclassified source' });
  for (const path of ['web/src/repositories/orders.ts', 'frontend/src/database/cache.ts', 'web/src/features/orders.controller.ts']) expect(architectureRole(path).lane).toBe('frontend');
  expect(architectureRole('api/controllers/orders.test.ts')).toMatchObject({ lane: 'other', label: 'Tests / generated' });
});
it('allocates newly revealed files around existing occupied positions', () => {
  const positions = architecturePositions([{ id: 'a', path: 'api/controllers/a.ts', height: 200 }, { id: 'z', path: 'api/controllers/z.ts', height: 200 }], { z: { x: 0, y: 0 } });
  expect(positions.z).toEqual({ x: 0, y: 0 });
  expect(positions.a.y).toBeGreaterThanOrEqual(260);
});
it('orders roles left-to-right, separates frontend/backend, and keeps pins', () => {
  const files = [
    { id: 'db', path: 'api/connectors/db.ts', height: 200 },
    { id: 'entry', path: 'api/controllers/a.ts', height: 200 },
    { id: 'logic', path: 'api/services/a.ts', height: 300 },
    { id: 'page', path: 'web/pages/a.tsx', height: 200 },
    { id: 'component', path: 'web/components/a.tsx', height: 200 }
  ];
  const result = architecturePositions(files);
  expect(result.entry.x).toBeLessThan(result.logic.x);
  expect(result.logic.x).toBeLessThan(result.db.x);
  expect(result.page.y).toBeGreaterThan(result.logic.y + 300);
  expect(result.page.x).toBeLessThan(result.component.x);
  expect(architecturePositions([...files].reverse())).toEqual(result);
  expect(architecturePositions(files, { logic: { x: 55, y: 55 } }).logic).toEqual({ x: 55, y: 55 });
});
