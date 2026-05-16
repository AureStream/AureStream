import * as React from "react";

interface MainContentProps {
  children: React.ReactNode;
}

/** 所有页面统一在本层（#root 主内容壳内的 div.relative）纵向滚动，避免 body/嵌套区域双滚动条。 */
export function MainContent({ children }: MainContentProps) {
  return (
    <div className="flex-1 min-w-0 my-3 rounded-3xl glass-rail overflow-hidden flex flex-col min-h-0 relative shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-primary/[0.06] to-transparent pointer-events-none rounded-t-3xl" />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl px-4 pt-4 sm:px-6 sm:pt-6">
        {children}
      </div>
    </div>
  );
}
