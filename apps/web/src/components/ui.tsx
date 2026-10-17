'use client';

import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { AlertCircle, Check, ChevronRight, LoaderCircle, Plus, X, type LucideIcon } from 'lucide-react';
import { errorMessage, labels } from '@/lib/api';

export function Button({
  children,
  onClick,
  variant = 'primary',
  icon: Icon,
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: LucideIcon;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {retry && <button onClick={retry}>Reintentar</button>}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={24} className="spin" />
      <span>Cargando información…</span>
    </div>
  );
}
export function Badge({ value, children }: { value?: string; children?: ReactNode }) {
  return (
    <span className={`badge badge-${(value || '').toLowerCase()}`}>
      {children || labels[value || ''] || value}
    </span>
  );
}
export function Empty({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? 'compact' : ''}`}>
      <div className="empty-icon">
        <Icon size={28} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  children,
  action,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ChevronRight size={15} />
    </button>
  );
}
export function Success({ children }: { children: ReactNode }) {
  return (
    <div className="success-box" role="status">
      <Check size={18} />
      {children}
    </div>
  );
}

export type FieldDef = {
  name: string;
  label: string;
  type?:
    'text' | 'email' | 'password' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'select' | 'checkbox';
  required?: boolean;
  options?: string[] | { value: string; label: string }[];
  defaultValue?: string | number | boolean | null;
  hint?: string;
  min?: number | string;
  max?: number | string;
  step?: string;
  full?: boolean;
  placeholder?: string;
  minLength?: number;
  inputMode?: 'decimal' | 'text';
};
export function DataForm({
  fields,
  onSubmit,
  submitLabel = 'Guardar',
  onCancel,
  clearOptional = false,
}: {
  fields: FieldDef[];
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  submitLabel?: string;
  onCancel?: () => void;
  clearOptional?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const data: Record<string, unknown> = {};
    fields.forEach((field) => {
      const value = form.get(field.name);
      if (field.type === 'checkbox') data[field.name] = value === 'on';
      else if (field.type === 'number' && value !== '' && value !== null) data[field.name] = Number(value);
      else if (typeof value === 'string' && value !== '')
        data[field.name] = field.type === 'password' ? value : value.trim();
      else if (
        clearOptional &&
        !field.required &&
        field.defaultValue !== undefined &&
        field.defaultValue !== null &&
        field.defaultValue !== ''
      )
        data[field.name] = null;
    });
    try {
      await onSubmit(data);
      setDirty(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} onChange={() => setDirty(true)} className="data-form">
      {error && <ErrorBox message={error} />}
      <div className="form-grid">
        {fields.map((field) => (
          <div
            className={`field ${field.full || field.type === 'textarea' ? 'field-full' : ''}`}
            key={field.name}
          >
            {field.type === 'checkbox' ? (
              <label className="checkbox-label">
                <input type="checkbox" name={field.name} defaultChecked={!!field.defaultValue} />
                {field.label}
              </label>
            ) : (
              <>
                <label htmlFor={`field-${field.name}`}>
                  {field.label}
                  {field.required && (
                    <span className="required" aria-hidden="true">
                      {' '}
                      *
                    </span>
                  )}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={`field-${field.name}`}
                    name={field.name}
                    defaultValue={String(field.defaultValue || '')}
                    rows={3}
                    maxLength={5000}
                    required={field.required}
                    placeholder={field.placeholder}
                  />
                ) : field.type === 'select' ? (
                  <select
                    id={`field-${field.name}`}
                    name={field.name}
                    defaultValue={String(field.defaultValue || '')}
                    required={field.required}
                  >
                    {!field.required && <option value="">Sin especificar</option>}
                    {field.options?.map((option) => {
                      const value = typeof option === 'string' ? option : option.value;
                      return (
                        <option key={value} value={value}>
                          {typeof option === 'string' ? labels[value] || value : option.label}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <input
                    id={`field-${field.name}`}
                    name={field.name}
                    type={field.type || 'text'}
                    inputMode={field.inputMode}
                    defaultValue={field.defaultValue == null ? '' : String(field.defaultValue)}
                    required={field.required}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    minLength={field.minLength}
                    maxLength={field.type === 'password' ? 128 : 500}
                    placeholder={field.placeholder}
                    autoComplete={field.type === 'password' ? 'new-password' : 'off'}
                  />
                )}
              </>
            )}
            {field.hint && <small>{field.hint}</small>}
          </div>
        ))}
      </div>
      <div className="form-actions">
        {onCancel && (
          <Button
            variant="secondary"
            onClick={() => {
              if (!dirty || window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?')) onCancel();
            }}
            disabled={busy}
          >
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={busy} icon={busy ? LoaderCircle : undefined}>
          {busy ? 'Guardando…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  confirmClose = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  confirmClose?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const modal = ref.current;
    const initial = modal?.querySelector<HTMLElement>('input, select, textarea, button');
    initial?.focus();
    const key = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        (!confirmClose || window.confirm('¿Cerrar este formulario? Los cambios sin guardar se perderán.'))
      )
        closeRef.current();
      if (event.key === 'Tab') {
        const items = modal?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
        );
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [confirmClose]);
  return (
    <div className="modal-backdrop">
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <div className="modal-heading">
          <div>
            <div className="eyebrow">VALKYR MANAGER</div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-button"
            aria-label={confirmClose ? 'Cerrar formulario' : 'Cerrar'}
            onClick={() => {
              if (
                !confirmClose ||
                window.confirm('¿Cerrar este formulario? Los cambios sin guardar se perderán.')
              )
                onClose();
            }}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button icon={Plus} onClick={onClick}>
      {children}
    </Button>
  );
}
