"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  GHOST_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const variantClass: Record<ButtonVariant, string> = {
  primary: PRIMARY_BUTTON_CLASS,
  secondary: SECONDARY_BUTTON_CLASS,
  ghost: GHOST_BUTTON_CLASS,
};

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children?: ReactNode;
}) {
  const merged = [variantClass[variant], className].filter(Boolean).join(" ");
  return (
    <button className={merged} {...props}>
      {children}
    </button>
  );
}
