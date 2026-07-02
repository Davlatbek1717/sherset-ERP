import { SettingsSidebar } from '@/components/settings-sidebar';

/**
 * Two-column layout for every page under /settings — fixed-width left
 * rail with grouped admin links + main content. Mirrors moysklad.uz's
 * settings shell so the sub-tab navigation stays visible while the user
 * jumps between admin domains.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[calc(100vh-3rem)]">
      <SettingsSidebar />
      <div className="min-w-0 flex-1 overflow-x-hidden">{children}</div>
    </div>
  );
}
