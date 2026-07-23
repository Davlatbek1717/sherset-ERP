import { Spinner } from '@moysklad/ui';

/** Route-level loader (see new/loading.tsx — cold-compile feedback). */
export default function EmployeeCardLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  );
}
