import type { ReactNode } from "react";

const layouts = {
  1: "@[40rem]:grid-cols-[minmax(0,1fr)_auto]",
  2: "@[28rem]:grid-cols-2 [&>button]:col-span-full @[48rem]:grid-cols-[repeat(2,minmax(0,1fr))_auto] @[48rem]:[&>button]:col-span-1",
  3: "@[36rem]:grid-cols-3 [&>button]:col-span-full @[60rem]:grid-cols-[repeat(3,minmax(0,1fr))_auto] @[60rem]:[&>button]:col-span-1",
};

/** Short settings: aligned fields followed by the primary action on wide screens. */
export function CompactSettingsRow({ fields = 1, children }: { fields?: 1 | 2 | 3; children: ReactNode }) {
  return <div className="@container col-span-full min-w-0"><div className={`grid min-w-0 items-end gap-3 ${layouts[fields]} [&>label]:min-w-0 [&>button]:w-full @[36rem]:[&>button]:w-auto @[36rem]:[&>button]:justify-self-end`}>{children}</div></div>;
}
