import type { ReactNode } from 'react'
import { category } from '../lib/aqi'
import { CATEGORY_CLASS } from './categoryStyles'

export function AqiBadge({ value, prefix }: { value: number; prefix?: string }) {
  const c = category(value)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${CATEGORY_CLASS[c.id]}`}
    >
      {prefix ? `${prefix} ` : ''}
      {value} · {c.label}
    </span>
  )
}

export function Card({
  children,
  className = '',
  labelledBy,
}: {
  children: ReactNode
  className?: string
  labelledBy?: string
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={`rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5 ${className}`}
    >
      {children}
    </section>
  )
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-bold text-brand">
      {children}
    </h2>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm text-muted">{children}</p>
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  const look =
    variant === 'primary'
      ? 'bg-brand text-card hover:opacity-90 disabled:opacity-60'
      : 'border border-line bg-card text-brand hover:bg-brandSoft disabled:opacity-60'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${look} ${className}`}
    >
      {children}
    </button>
  )
}

export function Alert({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'error' }) {
  const cls = tone === 'error' ? 'border-veryPoor bg-veryPoorSoft text-veryPoor' : 'border-warn bg-warnSoft text-warn'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>
      {children}
    </div>
  )
}

export const inputCls = 'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink'
