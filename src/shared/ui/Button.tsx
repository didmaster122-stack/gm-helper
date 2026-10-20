import { forwardRef, type ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { withShortcut } from "./withShortcut";

export type ButtonVariant = "secondary" | "primary" | "ghost" | "danger" | "destructive";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: LucideIcon;
  /** Pressed state of a toggle or the current tool. */
  active?: boolean;
  /** Keyboard shortcut shown in the tooltip, e.g. "Ctrl+Z". */
  shortcut?: string;
}

function classes(variant: ButtonVariant, size: string, active: boolean, extra?: string) {
  return [
    variant === "secondary" ? null : variant,
    size === "sm" ? "sm" : null,
    active ? "active" : null,
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    icon: Icon,
    active = false,
    shortcut,
    className,
    title,
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes(variant, size, active, className) || undefined}
      title={withShortcut(title, shortcut)}
      aria-pressed={active || undefined}
      {...rest}
    >
      {Icon && <Icon aria-hidden />}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "icon" | "children"> {
  icon: LucideIcon;
  /** Accessible name and tooltip. */
  label: string;
}

/** Square button with only an icon; the label becomes its tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = "ghost", className, shortcut, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      icon={icon}
      variant={variant}
      className={className ? `icon-only ${className}` : "icon-only"}
      title={withShortcut(label, shortcut)}
      aria-label={label}
      {...rest}
    />
  );
});
