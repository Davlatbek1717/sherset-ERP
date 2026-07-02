'use client';

// HR module layout — wraps all /hr/* pages. The top-level (app)/layout.tsx
// already renders the SubNav based on activeModule==='hr'; this nested
// layout adds the page container without duplicating the subnav.
//
// Mounts the HR Tasks WebSocket once per app-shell mount so all child
// pages get realtime query invalidations without each opening their own
// connection.

import { useHrTasksSocket } from '@/hooks/use-hr-tasks-socket';

export default function HrLayout({ children }: { children: React.ReactNode }) {
  useHrTasksSocket();
  return <div className="px-6 py-4">{children}</div>;
}
