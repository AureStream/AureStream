import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";

export interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** 首页等：至少铺满主内容可视高度，超出部分交由 MainContent 滚动层滚动 */
  fillHeight?: boolean;
  title?: string;
  subtitle?: string;
}

export function PageShell({
  children,
  className,
  contentClassName,
  fillHeight,
  title,
}: PageShellProps) {
  const isMobile = useIsMobile();
  const showHeader = Boolean(title) && !isMobile;

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-4xl flex flex-col h-full min-h-0",
        isMobile && "h-auto min-h-full",
        className,
      )}
    >
      {showHeader && (
        <header className="shrink-0 space-y-1 mb-4 sm:mb-5">
          {title ? (
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              <span className="bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent">
                {title}
              </span>
            </h1>
          ) : null}
        </header>
      )}
      <div
        className={cn(
          isMobile 
            ? "flex-1 w-full"
            : cn(
                "flex-1 min-h-0 overflow-x-hidden overscroll-contain pr-2 [padding-bottom:max(2rem,env(safe-area-inset-bottom,0px)+0.75rem)] sm:[padding-bottom:max(3rem,env(safe-area-inset-bottom,0px)+0.75rem)]",
                fillHeight ? "overflow-hidden" : "overflow-y-auto [scrollbar-gutter:stable]"
              ),
          fillHeight && "flex w-full flex-col",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

