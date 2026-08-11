import type { HTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cx } from './cx';
import { useUid } from './hooks';

export interface GlassFieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  label?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Forwarded to the inner control — the composer needs Enter-to-send. */
  onKeyDown?: HTMLAttributes<HTMLElement>['onKeyDown'];
  autoFocus?: boolean;
  inputMode?: 'text' | 'search' | 'url' | 'email' | 'numeric';
}

/**
 * A sunken glass trough. The inner control is 16px so iOS never zooms the
 * viewport on focus, and the whole box clears the 44px touch floor.
 *
 * The ref forwards to the actual input/textarea, which is what a composer
 * needs in order to refocus after sending.
 */
export const GlassField = forwardRef<HTMLInputElement & HTMLTextAreaElement, GlassFieldProps>(
  function GlassField(
    {
      value,
      onChange,
      placeholder,
      multiline = false,
      rows = 3,
      label,
      icon,
      disabled = false,
      className,
      onKeyDown,
      autoFocus,
      inputMode,
      ...rest
    },
    ref,
  ) {
    const uid = useUid('on-field');

    const shared = {
      id: uid,
      className: 'on-field__input',
      value,
      placeholder,
      disabled,
      onKeyDown,
      autoFocus,
      inputMode,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    };

    return (
      <div className={cx('on-field', className)} {...rest}>
        {label != null ? (
          <label className="on-field__label" htmlFor={uid}>
            {label}
          </label>
        ) : null}
        <div className="on-field__box">
          {icon ? (
            <span className="on-field__icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {multiline ? (
            <textarea ref={ref} rows={rows} {...shared} />
          ) : (
            <input ref={ref} type="text" {...shared} />
          )}
        </div>
      </div>
    );
  },
);
