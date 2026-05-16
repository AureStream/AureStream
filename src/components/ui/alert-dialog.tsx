import * as React from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";

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
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-all duration-300"
          onClick={() => onOpenChange?.(false)}
          aria-hidden="true"
        />
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200">
          {children}
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
          "relative w-full max-w-lg glass-strong !border-white/20 rounded-2xl p-6 shadow-2xl scale-in duration-200",
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
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2 mt-4",
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
  ({ className, variant = "outline", size = "default", ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size={size}
      className={className}
      {...props}
    />
  ),
);
AlertDialogCancel.displayName = "AlertDialogCancel";

const AlertDialogAction = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "destructive", size = "default", ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size={size}
      className={className}
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
