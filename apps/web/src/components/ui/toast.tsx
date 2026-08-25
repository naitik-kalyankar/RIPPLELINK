import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const iconByVariant: Record<NonNullable<ToastOptions["variant"]>, React.ReactNode> = {
  default: null,
  success: <CheckCircle2 className="h-4 w-4 text-success" />,
  destructive: <XCircle className="h-4 w-4 text-destructive" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((options: ToastOptions) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, ...options }]);
  }, []);

  const remove = (id: string) => setItems((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4500}>
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            className={cn(
              "pointer-events-auto grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lg data-[state=open]:animate-slide-up data-[swipe=end]:animate-fade-in"
            )}
            onOpenChange={(open) => {
              if (!open) remove(item.id);
            }}
          >
            <div className="pt-0.5">{item.variant && iconByVariant[item.variant]}</div>
            <div className="grid gap-1">
              <ToastPrimitive.Title className="text-sm font-semibold">{item.title}</ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="text-sm text-muted-foreground">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="rounded-sm text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-6 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
