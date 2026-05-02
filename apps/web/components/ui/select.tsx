"use client";

import { Children, type ReactNode, isValidElement } from "react";
import { MODAL_INPUT_CLASS } from "../../lib/design-system";

export type SelectItemProps = {
  value: string;
  children: ReactNode;
  disabled?: boolean;
};

/** Marker: props read by `<Select>`; does not render DOM. */
export function SelectTrigger(props: { className?: string; children?: never }): null {
  void props;
  return null;
}

/** Groups `<SelectItem>` children for the parent `<Select>`. */
export function SelectContent({ children }: { children: ReactNode }): null {
  void children;
  return null;
}

export function SelectItem(_props: SelectItemProps): null {
  return null;
}

function collectItems(node: ReactNode): SelectItemProps[] {
  const out: SelectItemProps[] = [];
  Children.forEach(node, (ch) => {
    if (!isValidElement(ch)) return;
    if (ch.type === SelectItem) {
      const p = ch.props as SelectItemProps;
      out.push({
        value: p.value,
        children: p.children,
        disabled: p.disabled,
      });
    }
  });
  return out;
}

export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
};

/**
 * Design-system select: native `<select>` + compound API (`SelectTrigger`, `SelectContent`, `SelectItem`).
 * Styling: DESIGN.md — `rounded-[2px]`, `text-[13px]`, border `#D5DADF`.
 */
export function Select({
  value,
  onValueChange,
  children,
  disabled = false,
  className = "",
  name,
  id,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: SelectProps) {
  let triggerClass = "";
  let items: SelectItemProps[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === SelectTrigger) {
      triggerClass = (child.props as { className?: string }).className ?? "";
    } else if (child.type === SelectContent) {
      items = collectItems((child.props as { children?: ReactNode }).children);
    }
  });

  const selectClass = [MODAL_INPUT_CLASS, triggerClass, className].filter(Boolean).join(" ");

  return (
    <select
      id={id}
      name={name}
      className={selectClass}
      value={value}
      disabled={disabled}
      aria-invalid={ariaInvalid === true || ariaInvalid === "true" ? true : undefined}
      aria-label={ariaLabel}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {items.map((it) => (
        <option key={it.value} value={it.value} disabled={it.disabled}>
          {typeof it.children === "string" || typeof it.children === "number"
            ? it.children
            : String(it.value)}
        </option>
      ))}
    </select>
  );
}
