import * as React from "react";
import { cn } from "@/lib/utils";
import { type ButtonProps } from "@/components/ui/button";

interface AlertDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  onOpenChange,
  children,
}) => {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 animate-fade-in-up">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={() => onOpenChange?.(false)}
            aria-hidden="true"
          />
          <div className="relative flex items-center justify-center w-full h-full p-4">
            {children}
          </div>
        </div>
      )}
    </>
  );
};

const AlertDialogIdsContext = React.createContext<{
  titleId: string;
  descriptionId: string;
} | null>(null);

interface AlertDialogContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const AlertDialogContent = React.forwardRef<
  HTMLDivElement,
  AlertDialogContentProps
>(({ className, children, ...props }, ref) => {
  const titleId = React.useId();
  const descriptionId = React.useId();

  return (
    <AlertDialogIdsContext.Provider value={{ titleId, descriptionId }}>
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          "relative w-full max-w-lg bg-[#fafbfc]/95 dark:bg-[#13131c]/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-2xl transition-all duration-300 [&:active]:transform-none",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
      </div>
    </AlertDialogIdsContext.Provider>
  );
});
AlertDialogContent.displayName = "AlertDialogContent";

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left mb-4",
      className,
    )}
    {...props}
  />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-row justify-end gap-2 mt-4",
      className,
    )}
    {...props}
  />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  const ctx = React.useContext(AlertDialogIdsContext);
  return (
    <h2
      ref={ref}
      id={ctx?.titleId}
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
});
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const ctx = React.useContext(AlertDialogIdsContext);
  return (
    <p
      ref={ref}
      id={ctx?.descriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});
AlertDialogDescription.displayName = "AlertDialogDescription";

const AlertDialogCancel = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] border text-center justify-center inline-flex items-center",
        "bg-black/[0.04] dark:bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.08] border-black/5 dark:border-white/5",
        className
      )}
      {...props}
    />
  ),
);
AlertDialogCancel.displayName = "AlertDialogCancel";

const AlertDialogAction = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98] text-center justify-center inline-flex items-center",
        "bg-gradient-to-r from-red-500 to-rose-600 shadow-lg shadow-red-500/20 hover:shadow-xl hover:shadow-red-500/35 hover:scale-[1.02]",
        className
      )}
      {...props}
    />
  ),
);
AlertDialogAction.displayName = "AlertDialogAction";

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
};
