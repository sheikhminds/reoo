/** Accessible, dependency-free modal dialogs built from a small field schema. */

import { icon } from './icons';

export type DialogValue = string | number | boolean;

export interface DialogField {
  key: string;
  label: string;
  type: 'number' | 'range' | 'text' | 'checkbox' | 'select' | 'color';
  value: DialogValue;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
  suffix?: string;
  hint?: string;
}

export interface DialogOptions {
  title: string;
  description?: string;
  fields?: DialogField[];
  submitLabel?: string;
  /** Label for the secondary button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Trusted static HTML shown above the fields (or instead of them). */
  html?: string;
  onSubmit?: (values: Record<string, DialogValue>) => void;
  /**
   * Called when the secondary button is used. Escape and backdrop clicks only
   * dismiss the dialog, so a destructive "discard" is never triggered by habit.
   */
  onCancel?: () => void;
}

let openCount = 0;

function fieldElement(field: DialogField): { row: HTMLElement; input: HTMLInputElement | HTMLSelectElement } {
  const row = document.createElement('label');
  row.className = `field field-${field.type}`;

  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = field.label;
  row.appendChild(label);

  const wrap = document.createElement('span');
  wrap.className = 'field-control';

  if (field.type === 'select') {
    const select = document.createElement('select');
    for (const option of field.options ?? []) {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      select.appendChild(opt);
    }
    select.value = String(field.value);
    wrap.appendChild(select);
    if (field.hint) {
      const hint = document.createElement('small');
      hint.textContent = field.hint;
      wrap.appendChild(hint);
    }
    row.appendChild(wrap);
    return { row, input: select };
  }

  if (field.type === 'checkbox') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = field.value === true;
    wrap.appendChild(input);
    if (field.hint) {
      const hint = document.createElement('small');
      hint.textContent = field.hint;
      wrap.appendChild(hint);
    }
    row.appendChild(wrap);
    return { row, input };
  }

  if (field.type === 'range') {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(field.min ?? 0);
    input.max = String(field.max ?? 100);
    input.step = String(field.step ?? 1);
    input.value = String(field.value);
    const value = document.createElement('output');
    value.textContent = `${field.value}${field.suffix ?? ''}`;
    input.addEventListener('input', () => {
      value.textContent = `${input.value}${field.suffix ?? ''}`;
    });
    wrap.appendChild(input);
    wrap.appendChild(value);
    row.appendChild(wrap);
    return { row, input };
  }

  const input = document.createElement('input');
  input.type = field.type === 'number' ? 'number' : field.type;
  if (field.type === 'number') {
    input.min = String(field.min ?? 0);
    input.max = String(field.max ?? 100_000);
    input.step = String(field.step ?? 1);
  }
  input.value = String(field.value);
  if (field.type === 'number' || field.type === 'text') {
    wrap.appendChild(input);
    if (field.suffix) {
      const suffix = document.createElement('span');
      suffix.className = 'field-suffix';
      suffix.textContent = field.suffix;
      wrap.appendChild(suffix);
    }
  } else {
    wrap.classList.add('field-control-color');
    wrap.appendChild(input);
  }
  if (field.hint) {
    const hint = document.createElement('small');
    hint.textContent = field.hint;
    wrap.appendChild(hint);
  }
  row.appendChild(wrap);
  return { row, input };
}

export function openDialog(options: DialogOptions): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  openCount++;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', options.title);

  const header = document.createElement('header');
  header.className = 'modal-head';
  const title = document.createElement('h2');
  title.textContent = options.title;
  header.appendChild(title);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'icon-btn';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = icon('close', 16);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const body = document.createElement('div');
  body.className = 'modal-body';
  if (options.description) {
    const description = document.createElement('p');
    description.className = 'modal-desc';
    description.textContent = options.description;
    body.appendChild(description);
  }
  if (options.html) {
    const html = document.createElement('div');
    html.className = 'modal-html';
    html.innerHTML = options.html;
    body.appendChild(html);
  }

  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  if (options.fields && options.fields.length > 0) {
    // Fields branch renders a real form with Cancel / Submit.
    const form = document.createElement('form');
    form.className = 'dialog-form';
    for (const field of options.fields) {
      const { row, input } = fieldElement(field);
      inputs.set(field.key, input);
      form.appendChild(row);
    }
    body.appendChild(form);
    modal.appendChild(body);

    const footer = document.createElement('footer');
    footer.className = 'modal-foot';
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.type = 'button';
    cancel.textContent = options.cancelLabel ?? 'Cancel';
    cancel.addEventListener('click', () => {
      close();
      options.onCancel?.();
    });
    const submit = document.createElement('button');
    submit.className = 'btn btn-primary';
    submit.type = 'submit';
    submit.textContent = options.submitLabel ?? 'Apply';
    submit.addEventListener('click', () => {
      form.requestSubmit();
    });
    footer.appendChild(cancel);
    footer.appendChild(submit);
    modal.appendChild(footer);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values: Record<string, DialogValue> = {};
      for (const field of options.fields ?? []) {
        const input = inputs.get(field.key);
        if (!input) continue;
        if (input instanceof HTMLInputElement && input.type === 'checkbox') {
          values[field.key] = input.checked;
        } else if (input instanceof HTMLInputElement && (input.type === 'number' || input.type === 'range')) {
          values[field.key] = Number(input.value);
        } else {
          values[field.key] = input.value;
        }
      }
      close();
      options.onSubmit?.(values);
    });
  } else {
    modal.appendChild(body);
    const footer = document.createElement('footer');
    footer.className = 'modal-foot';
    if (options.onSubmit) {
      const cancel = document.createElement('button');
      cancel.className = 'btn';
      cancel.type = 'button';
      cancel.textContent = options.cancelLabel ?? 'Cancel';
      cancel.addEventListener('click', () => {
        closeDialog();
        options.onCancel?.();
      });
      const submit = document.createElement('button');
      submit.className = 'btn btn-primary';
      submit.type = 'button';
      submit.textContent = options.submitLabel ?? 'Continue';
      submit.addEventListener('click', () => {
        closeDialog();
        options.onSubmit?.({});
      });
      footer.appendChild(cancel);
      footer.appendChild(submit);
    } else {
      const close = document.createElement('button');
      close.className = 'btn btn-primary';
      close.type = 'button';
      close.textContent = 'Close';
      close.addEventListener('click', () => closeDialog());
      footer.appendChild(close);
    }
    modal.appendChild(footer);
  }

  const close = () => closeDialog();

  function closeDialog(): void {
    if (!overlay.isConnected) return;
    overlay.remove();
    openCount--;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPointerDownCapture);
    if (openCount === 0) document.body.classList.remove('modal-open');
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
    } else if (event.key === 'Tab') {
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href]',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function onPointerDownCapture(event: PointerEvent): void {
    if (event.target === overlay) closeDialog();
  }

  closeBtn.addEventListener('click', () => closeDialog());
  document.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointerDownCapture);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    const focusable = modal.querySelector<HTMLElement>('input, select, button.btn-primary');
    focusable?.focus();
  });
}

export function confirmDialog(
  title: string,
  description: string,
  onConfirm: () => void,
  confirmLabel = 'Continue',
): void {
  openDialog({
    title,
    description,
    fields: [],
    submitLabel: confirmLabel,
    onSubmit: onConfirm,
  });
}
