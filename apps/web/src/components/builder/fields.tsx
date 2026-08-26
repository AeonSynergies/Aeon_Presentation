import * as React from "react";

// Small shared form primitives for the Deck Builder wizard, styled with the same
// q-block/q-label/q-hint classes the Discovery Notes panel uses so the builder reads as
// part of the existing design system rather than a separate app.

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="q-block">
      <div className="q-label">{label}</div>
      {children}
      {hint && <div className="q-hint">{hint}</div>}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input type="text" value={value} placeholder={placeholder || ""} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea value={value} placeholder={placeholder || ""} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div className="builder-field-row">{children}</div>;
}

export function MiniBtn({
  onClick,
  children,
  danger,
  disabled,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button type="button" className={`mini-btn${danger ? " mini-btn-danger" : ""}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

/** Editor for a plain string list (bullets, dashboards, challenge items…). */
export function StringListEditor({
  label,
  items,
  onChange,
  placeholder,
  addLabel,
  hint,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {items.map((item, i) => (
        <div className="builder-list-row" key={i}>
          <input
            type="text"
            value={item}
            placeholder={placeholder || ""}
            onChange={(e) => onChange(items.map((x, xi) => (xi === i ? e.target.value : x)))}
          />
          <MiniBtn danger title="Remove" onClick={() => onChange(items.filter((_, xi) => xi !== i))}>
            ✕
          </MiniBtn>
        </div>
      ))}
      <MiniBtn onClick={() => onChange([...items, ""])}>＋ {addLabel || "Add"}</MiniBtn>
    </Field>
  );
}
