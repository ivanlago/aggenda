"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppNavLink({
  href,
  children,
  className = "",
  activeClassName = "bg-brand text-white shadow-sm",
  inactiveClassName = "text-slate-600 hover:bg-surface-soft hover:text-brand",
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const route = href.split("?")[0];
  const active = pathname === route || (!exact && pathname.startsWith(`${route}/`));

  return (
    <Link
      href={href}
      className={`${className} ${active ? activeClassName : inactiveClassName}`}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
