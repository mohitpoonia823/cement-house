'use client'

import { useState } from 'react'
import type { InputHTMLAttributes, ChangeEvent, FocusEvent } from 'react'

/**
 * Drop-in replacement for `<input type="number">`.
 *
 * Three things a bare number input gets wrong for data entry:
 *
 * 1. A field showing `0` keeps it when you type — you get `023` instead of
 *    `23`, because the caret lands after the existing digit. Forms that ran the
 *    value through `Number()` hid this; forms that stored the raw string did
 *    not. Normalising here fixes both consistently.
 * 2. A pre-filled `0` has to be cleared before entering a real value, so a
 *    zero renders as an empty field with `0` as the placeholder instead.
 * 3. `type="number"` alone does not reliably raise a numeric keypad on Android.
 *
 * Everything else passes straight through, so this stays a drop-in swap.
 */
type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Render a real `0` instead of blanking it — for fields where zero is a
   *  deliberate reading rather than "nothing entered yet". */
  showZero?: boolean
}

/**
 * `023` → `23`, `00` → `0`, `-007` → `-7`.
 * A zero directly before a decimal point is meaningful (`0.5`) and is kept,
 * as is a lone `0` — the user may genuinely mean zero.
 */
export function stripLeadingZeros(raw: string): string {
  return raw.replace(/^(-?)0+(?=\d)/, '$1')
}

export function NumberInput({
  onChange,
  onFocus,
  onBlur,
  value,
  placeholder = '0',
  showZero = false,
  ...rest
}: NumberInputProps) {
  const [focused, setFocused] = useState(false)

  // Blank a zero only while the field is unfocused. Hiding it during typing
  // would break entering decimals: "0.5" passes through a moment where the
  // value is exactly 0, and blanking there would swallow the leading digit.
  const isZero = value === 0 || value === '0'
  const displayValue = !showZero && !focused && isZero ? '' : value

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const normalized = stripLeadingZeros(event.target.value)
    // Rewrite before delegating so the parent's handler — whether it stores the
    // raw string or wraps it in Number() — sees the cleaned value.
    if (normalized !== event.target.value) event.target.value = normalized
    onChange?.(event)
  }

  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      onFocus={(event: FocusEvent<HTMLInputElement>) => {
        setFocused(true)
        onFocus?.(event)
      }}
      onBlur={(event: FocusEvent<HTMLInputElement>) => {
        setFocused(false)
        onBlur?.(event)
      }}
    />
  )
}
