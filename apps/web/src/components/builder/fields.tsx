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

export interface GridItemValue {
  title: string;
  description: string;
}

/** Editor for the Challenges/Benefits numbered-grid items: a short bold title plus a
 * one-to-two sentence description each. A plain string (an already-persisted deck's old
 * shape, from before this became a title+description pair) is normalized to {title: "",
 * description: <the string>} the moment it's edited here, upgrading that item in place. */
export function GridItemListEditor({
  label,
  items,
  onChange,
  addLabel,
  hint,
}: {
  label: string;
  items: (GridItemValue | string)[];
  onChange: (items: (GridItemValue | string)[]) => void;
  addLabel?: string;
  hint?: string;
}) {
  const normalized = items.map((it) => (typeof it === "string" ? { title: "", description: it } : it));
  return (
    <Field label={label} hint={hint}>
      {normalized.map((item, i) => (
        <div className="builder-subcard" key={i}>
          <div className="builder-subcard-head">
            <span>ITEM {i + 1}</span>
            <MiniBtn danger title="Remove" onClick={() => onChange(items.filter((_, xi) => xi !== i))}>
              ✕
            </MiniBtn>
          </div>
          <TextField
            label="Title"
            value={item.title}
            onChange={(v) => onChange(normalized.map((x, xi) => (xi === i ? { ...x, title: v } : x)))}
          />
          <TextAreaField
            label="Description"
            value={item.description}
            onChange={(v) => onChange(normalized.map((x, xi) => (xi === i ? { ...x, description: v } : x)))}
          />
        </div>
      ))}
      <MiniBtn onClick={() => onChange([...normalized, { title: "", description: "" }])}>＋ {addLabel || "Add item"}</MiniBtn>
    </Field>
  );
}

export interface FocusAreaValue {
  primary: string;
  secondary?: string;
}

/** Editor for the About slide's right-panel grid tiles — a bold primary phrase plus an
 * optional accent-colored secondary phrase (e.g. primary "Amazon DSPs", secondary "& AFPs"). */
export function FocusAreaListEditor({
  label,
  items,
  onChange,
  addLabel,
  hint,
}: {
  label: string;
  items: FocusAreaValue[];
  onChange: (items: FocusAreaValue[]) => void;
  addLabel?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {items.map((item, i) => (
        <div className="builder-list-row" key={i}>
          <input
            type="text"
            style={{ flex: 1, minWidth: 0 }}
            value={item.primary}
            placeholder="e.g. Amazon DSPs"
            onChange={(e) => onChange(items.map((x, xi) => (xi === i ? { ...x, primary: e.target.value } : x)))}
          />
          <input
            type="text"
            style={{ flex: 1, minWidth: 0 }}
            value={item.secondary || ""}
            placeholder="e.g. & AFPs (optional, accent color)"
            onChange={(e) => onChange(items.map((x, xi) => (xi === i ? { ...x, secondary: e.target.value } : x)))}
          />
          <MiniBtn danger title="Remove" onClick={() => onChange(items.filter((_, xi) => xi !== i))}>
            ✕
          </MiniBtn>
        </div>
      ))}
      <MiniBtn onClick={() => onChange([...items, { primary: "" }])}>＋ {addLabel || "Add"}</MiniBtn>
    </Field>
  );
}
