import { Spinner } from '@moysklad/ui';

/** Route-level loader — the dev cold-compile made «+ Сотрудник» look dead
 *  (13s with zero feedback, owner report 2026-07-17). */
export default function NewEmployeeLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  );
}
