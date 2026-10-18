import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      richColors
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--success-soft)",
          "--success-text": "var(--success-soft-foreground)",
          "--success-border": "var(--success)",
          "--error-bg": "var(--destructive-soft)",
          "--error-text": "var(--destructive-soft-foreground)",
          "--error-border": "var(--destructive)",
          "--warning-bg": "var(--draft)",
          "--warning-text": "var(--draft-foreground)",
          "--warning-border": "var(--draft-foreground)",
          "--info-bg": "var(--secondary)",
          "--info-text": "var(--secondary-foreground)",
          "--info-border": "var(--input)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:font-sans group-[.toaster]:shadow-soft",
          description: "group-[.toast]:text-inherit",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
