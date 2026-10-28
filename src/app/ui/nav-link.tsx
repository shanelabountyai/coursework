'use client';
// The one client piece of the nav: layouts do not re-render on navigation, so the active page needs usePathname.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return <Link href={href} aria-current={active ? 'page' : undefined}>{children}</Link>;
}
