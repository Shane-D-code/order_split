import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const inputClass =
  "w-full rounded-sm border-2 border-line bg-surface-2 px-3.5 py-3 text-base font-medium text-ink shadow-none outline-none transition-colors placeholder:text-muted/70 focus:border-gold disabled:opacity-50";

export function Field({
  label,
  hint,
  error,
  children,
  labelClass = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  labelClass?: string;
}) {
  return (
    <label className="block">
      <span className={`mb-1.5 block text-sm font-extrabold tracking-tight text-ink ${labelClass}`}>{label}</span>
      {children}
      {hint && !error ? (
        <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      ) : null}
      {error ? (
        <span className="mt-1.5 block text-xs font-semibold text-danger">{error}</span>
      ) : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}