import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ink' | 'secondary' | 'ghost' | 'danger';
  size?: 'normal' | 'small';
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'normal',
  block,
  loading,
  icon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: Props) {
  const cls = [
    'btn',
    variant === 'primary' && 'btn-primary',
    variant === 'ink' && 'btn-ink',
    variant === 'ghost' && 'btn-ghost',
    variant === 'danger' && 'btn-danger',
    size === 'small' && 'btn-small',
    block && 'btn-block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {icon}
      {loading ? 'Working…' : children}
    </button>
  );
}

type IconProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode };

/** Icon-only button: always has an aria-label and a tooltip. */
export function IconButton({ label, children, className, type = 'button', ...rest }: IconProps) {
  return (
    <button type={type} className={['icon-btn', className].filter(Boolean).join(' ')} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
