import { cookies } from 'next/headers';
import { AdminShell } from '@/shared/ui/AdminNav';

export const metadata = {
  title: { default: '야장관리자', template: '%s | 야장관리자' },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get('sidebar-collapsed')?.value === '1';

  return <AdminShell defaultCollapsed={defaultCollapsed}>{children}</AdminShell>;
}
