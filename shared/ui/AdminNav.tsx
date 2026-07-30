'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ClipboardList, LogOut, FileSpreadsheet, FolderTree, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react';
import { logoutAction } from '@/features/auth/api/actions';

type NavItem = { href: string; label: string; icon: typeof ClipboardList };
type NavGroup = NavItem & { children?: NavItem[] };

const NAV_ITEMS: NavGroup[] = [
  {
    href: '/admin/meter',
    label: '수용가조사',
    icon: ClipboardList,
    children: [{ href: '/admin/regions', label: '분류관리', icon: FolderTree }],
  },
  { href: '/admin/meter-excel', label: '엑셀관리자', icon: FileSpreadsheet },
];

// 모바일 상단바/하단바용 평탄화 목록 (부모-자식 구분 없이 순서대로)
const FLAT_NAV_ITEMS: NavItem[] = NAV_ITEMS.flatMap((item) => [item, ...(item.children ?? [])]);

const SIDEBAR_COOKIE = 'sidebar-collapsed';

// '/admin/meter'가 '/admin/meter-excel'까지 매칭되는 것을 방지 (정확히 일치하거나 '/'로 이어지는 하위 경로일 때만 활성)
function isNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
const footerBtnCls =
  'flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors';

function setSidebarCookie(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=31536000`;
}

export function AdminShell({
  defaultCollapsed,
  children,
}: {
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      setSidebarCookie(next);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar collapsed={collapsed} onToggle={toggle} />
      <AdminTopBar />
      <div
        className={`pt-12 md:pt-0 pb-20 md:pb-0 min-h-screen transition-[margin] duration-200 ${
          collapsed ? 'md:ml-16' : 'md:ml-52'
        }`}
      >
        <div className="p-4 md:p-8">{children}</div>
      </div>
      <AdminBottomNav />
    </div>
  );
}

function AdminSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();

  return (
    <aside
      className={`hidden md:flex ${
        collapsed ? 'w-16' : 'w-52'
      } shrink-0 border-r border-border flex-col h-full fixed left-0 top-0 z-30 bg-background transition-[width] duration-200`}
    >
      <div className={`p-4 border-b border-border flex items-center ${collapsed ? 'justify-center' : 'gap-2'}`}>
        <Link href="/admin/meter" className="flex items-center gap-2 min-w-0">
          <ClipboardList size={16} className="text-accent shrink-0" />
          {!collapsed && <span className="text-sm font-semibold text-text-primary truncate">야장관리자</span>}
        </Link>
      </div>
      <nav className="flex-1 p-2 space-y-1 text-sm overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => (
          <div key={item.href}>
            <Link
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isNavActive(pathname, item.href)
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <item.icon size={15} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
            {item.children?.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                title={collapsed ? child.label : undefined}
                className={`flex items-center gap-2 px-3 py-1.5 mt-0.5 rounded-lg text-xs transition-colors ${
                  collapsed ? 'justify-center' : 'ml-4'
                } ${
                  isNavActive(pathname, child.href)
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <child.icon size={13} className="shrink-0" />
                {!collapsed && <span className="truncate">{child.label}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="p-2 border-t border-border space-y-1">
        <button
          onClick={onToggle}
          title={collapsed ? '펼치기' : '접기'}
          className={`${footerBtnCls} ${collapsed ? 'justify-center' : ''}`}
        >
          {collapsed ? <ChevronRight size={15} className="shrink-0" /> : <ChevronLeft size={15} className="shrink-0" />}
          {!collapsed && <span>접기</span>}
        </button>
        <ThemeToggle collapsed={collapsed} />
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? '로그아웃' : undefined}
            className={`${footerBtnCls} ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut size={15} className="shrink-0" />
            {!collapsed && <span>로그아웃</span>}
          </button>
        </form>
      </div>
    </aside>
  );
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="w-full px-3 py-2" style={{ height: 34 }} />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={collapsed ? (isDark ? '라이트 모드' : '다크 모드') : undefined}
      className={`${footerBtnCls} ${collapsed ? 'justify-center' : ''}`}
    >
      {isDark ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
      {!collapsed && <span>{isDark ? '라이트 모드' : '다크 모드'}</span>}
    </button>
  );
}

function AdminTopBar() {
  const pathname = usePathname();
  const current = FLAT_NAV_ITEMS.find((i) => isNavActive(pathname, i.href));

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 h-12 bg-background border-b border-border flex items-center px-4 z-30">
      <ClipboardList size={15} className="text-accent mr-2 shrink-0" />
      <span className="text-sm font-semibold text-text-primary">
        {current?.label ?? '야장관리자'}
      </span>
    </header>
  );
}

function AdminBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border flex z-30">
      {FLAT_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
              active ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={20} />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        );
      })}
      <form action={logoutAction} className="flex-1">
        <button
          type="submit"
          className="w-full h-full flex flex-col items-center justify-center py-3 gap-1 text-text-secondary hover:text-text-primary transition-colors"
        >
          <LogOut size={20} />
          <span className="text-xs font-medium">로그아웃</span>
        </button>
      </form>
    </nav>
  );
}
