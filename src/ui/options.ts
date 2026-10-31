/** Contextual options bar. Rebuilds on tool change, otherwise refreshes values. */

import type { Editor } from '../core/editor';
import type { ToolId } from '../types';
import { icon } from './icons';

const TOOL_NAMES: Record<ToolId, string> = {
  move: 'Move',
  select: 'Select',
  brush: 'Brush',
  eraser: 'Eraser',
  fill: 'Paint bucket',
  gradient: 'Gradient',
  shape: 'Shape',
  text: 'Text',
  eyedropper: 'Eyedropper',
  crop: 'Crop',
  hand: 'Hand',
  zoom: 'Zoom',
};

interface RangeSpec {
  label: string;
  min: number;
  max: number;
  step?: number;
  get: () => number;
  suffix?: string;
  onInput: (value: number) => void;
}

export class OptionsBar {
  private builtFor: ToolId | null = null;
  private refreshers: Array<() => void> = [];

  constructor(
    private readonly editor: Editor,
    private readonly root: HTMLElement,
  ) {
    this.editor.on('tool', () => this.update());
    this.editor.on('ui', () => this.update());
  }

  update(): void {
    if (this.builtFor !== this.editor.toolId) {
      this.build();
    } else {
      this.refreshers.forEach((refresh) => refresh());
    }
  }

  private group(label?: string): HTMLElement {
    const group = document.createElement('div');
    group.className = 'option-group';
    if (label) {
      const title = document.createElement('span');
      title.className = 'option-title';
      title.textContent = label;
      group.appendChild(title);
    }
    this.root.appendChild(group);
    return group;
  }

  private range(parent: HTMLElement, spec: RangeSpec): void {
    const wrap = document.createElement('label');
    wrap.className = 'option range-option';
    const label = document.createElement('span');
    label.className = 'option-label';
    label.textContent = spec.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step ?? 1);
    input.value = String(spec.get());
    const output = document.createElement('output');
    output.textContent = `${spec.get()}${spec.suffix ?? ''}`;
    input.addEventListener('input', () => {
      const value = Number(input.value);
      output.textContent = `${value}${spec.suffix ?? ''}`;
      spec.onInput(value);
    });
    wrap.append(label, input, output);
    parent.appendChild(wrap);
    this.refreshers.push(() => {
      const value = String(spec.get());
      if (input.value !== value && document.activeElement !== input) {
        input.value = value;
        output.textContent = `${spec.get()}${spec.suffix ?? ''}`;
      }
    });
  }

  private checkbox(parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void): void {
    const wrap = document.createElement('label');
    wrap.className = 'option checkbox-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = get();
    input.addEventListener('change', () => set(input.checked));
    const text = document.createElement('span');
    text.textContent = label;
    wrap.append(input, text);
    parent.appendChild(wrap);
    this.refreshers.push(() => {
      input.checked = get();
    });
  }

  private select(
    parent: HTMLElement,
    label: string,
    values: Array<{ label: string; value: string }>,
    get: () => string,
    set: (value: string) => void,
  ): void {
    const wrap = document.createElement('label');
    wrap.className = 'option select-option';
    const text = document.createElement('span');
    text.className = 'option-label';
    text.textContent = label;
    const select = document.createElement('select');
    for (const item of values) {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    }
    select.value = get();
    select.addEventListener('change', () => set(select.value));
    wrap.append(text, select);
    parent.appendChild(wrap);
    this.refreshers.push(() => {
      select.value = get();
    });
  }

  private toggle(
    parent: HTMLElement,
    label: string,
    get: () => boolean,
    set: (value: boolean) => void,
  ): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option-toggle';
    button.textContent = label;
    button.classList.toggle('active', get());
    button.addEventListener('click', () => {
      set(!get());
      button.classList.toggle('active', get());
    });
    parent.appendChild(button);
    this.refreshers.push(() => button.classList.toggle('active', get()));
  }

  private hint(parent: HTMLElement, text: string): void {
    const span = document.createElement('span');
    span.className = 'option-hint';
    span.textContent = text;
    parent.appendChild(span);
  }

  private build(): void {
    this.root.replaceChildren();
    this.refreshers = [];
    this.builtFor = this.editor.toolId;
    const editor = this.editor;
    const options = editor.options;

    const title = document.createElement('span');
    title.className = 'tool-name';
    title.textContent = TOOL_NAMES[editor.toolId];
    this.root.appendChild(title);

    switch (editor.toolId) {
      case 'brush':
      case 'eraser': {
        const group = this.group();
        const target = editor.toolId === 'brush' ? options.brush : options.eraser;
        this.range(group, {
          label: 'Size',
          min: 1,
          max: 500,
          get: () => target.size,
          suffix: ' px',
          onInput: (value) => {
            target.size = value;
            editor.emit('tool');
          },
        });
        this.range(group, {
          label: 'Hardness',
          min: 0,
          max: 100,
          get: () => target.hardness,
          suffix: '%',
          onInput: (value) => {
            target.hardness = value;
            editor.emit('tool');
          },
        });
        this.range(group, {
          label: 'Opacity',
          min: 1,
          max: 100,
          get: () => target.opacity,
          suffix: '%',
          onInput: (value) => {
            target.opacity = value;
            editor.emit('tool');
          },
        });
        break;
      }
      case 'select': {
        const group = this.group();
        this.select(
          group,
          'Shape',
          [
            { label: 'Rectangle', value: 'rect' },
            { label: 'Ellipse', value: 'ellipse' },
            { label: 'Lasso', value: 'lasso' },
          ],
          () => options.select.shape,
          (value) => {
            options.select.shape = value as 'rect' | 'ellipse' | 'lasso';
            editor.emit('tool');
          },
        );
        const clear = document.createElement('button');
        clear.className = 'option-button';
        clear.type = 'button';
        clear.textContent = 'Deselect';
        clear.disabled = !editor.hasSelection;
        clear.addEventListener('click', () => editor.clearSelection());
        group.appendChild(clear);
        this.refreshers.push(() => {
          clear.disabled = !editor.hasSelection;
        });
        this.hint(group, 'Shift constrains to a square. Esc clears.');
        break;
      }
      case 'fill': {
        const group = this.group();
        this.range(group, {
          label: 'Tolerance',
          min: 0,
          max: 255,
          get: () => options.fill.tolerance,
          onInput: (value) => {
            options.fill.tolerance = value;
          },
        });
        this.checkbox(
          group,
          'Contiguous',
          () => options.fill.contiguous,
          (value) => {
            options.fill.contiguous = value;
            editor.emit('tool');
          },
        );
        break;
      }
      case 'gradient': {
        const group = this.group();
        this.select(
          group,
          'Type',
          [
            { label: 'Linear', value: 'linear' },
            { label: 'Radial', value: 'radial' },
          ],
          () => options.gradient.type,
          (value) => {
            options.gradient.type = value as 'linear' | 'radial';
            editor.emit('tool');
          },
        );
        this.select(
          group,
          'Colors',
          [
            { label: 'Foreground → Background', value: 'fg-bg' },
            { label: 'Foreground → Transparent', value: 'fg-transparent' },
          ],
          () => options.gradient.mode,
          (value) => {
            options.gradient.mode = value as 'fg-bg' | 'fg-transparent';
            editor.emit('tool');
          },
        );
        this.checkbox(
          group,
          'Reverse',
          () => options.gradient.reverse,
          (value) => {
            options.gradient.reverse = value;
            editor.emit('tool');
          },
        );
        break;
      }
      case 'shape': {
        const group = this.group();
        this.select(
          group,
          'Shape',
          [
            { label: 'Rectangle', value: 'rect' },
            { label: 'Ellipse', value: 'ellipse' },
            { label: 'Line', value: 'line' },
          ],
          () => options.shape.kind,
          (value) => {
            options.shape.kind = value as 'rect' | 'ellipse' | 'line';
            editor.emit('tool');
          },
        );
        this.checkbox(
          group,
          'Fill',
          () => options.shape.fill,
          (value) => {
            options.shape.fill = value;
            editor.emit('tool');
          },
        );
        this.checkbox(
          group,
          'Stroke',
          () => options.shape.stroke,
          (value) => {
            options.shape.stroke = value;
            editor.emit('tool');
          },
        );
        this.range(group, {
          label: 'Stroke',
          min: 1,
          max: 100,
          get: () => options.shape.strokeWidth,
          suffix: ' px',
          onInput: (value) => {
            options.shape.strokeWidth = value;
          },
        });
        this.range(group, {
          label: 'Radius',
          min: 0,
          max: 200,
          get: () => options.shape.radius,
          suffix: ' px',
          onInput: (value) => {
            options.shape.radius = value;
          },
        });
        break;
      }
      case 'text': {
        const group = this.group();
        this.select(
          group,
          'Font',
          [
            { label: 'System Sans', value: 'system-ui, sans-serif' },
            { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
            { label: 'Georgia', value: 'Georgia, serif' },
            { label: 'Times', value: '"Times New Roman", serif' },
            { label: 'Monospace', value: 'ui-monospace, monospace' },
            { label: 'Courier', value: '"Courier New", monospace' },
            { label: 'Impact', value: 'Impact, sans-serif' },
          ],
          () => options.text.fontFamily,
          (value) => {
            options.text.fontFamily = value;
            editor.emit('tool');
          },
        );
        this.range(group, {
          label: 'Size',
          min: 4,
          max: 400,
          get: () => options.text.fontSize,
          suffix: ' px',
          onInput: (value) => {
            options.text.fontSize = value;
          },
        });
        this.toggle(
          group,
          'Bold',
          () => options.text.bold,
          (value) => {
            options.text.bold = value;
            editor.emit('tool');
          },
        );
        this.toggle(
          group,
          'Italic',
          () => options.text.italic,
          (value) => {
            options.text.italic = value;
            editor.emit('tool');
          },
        );
        this.select(
          group,
          'Align',
          [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ],
          () => options.text.align,
          (value) => {
            options.text.align = value as 'left' | 'center' | 'right';
            editor.emit('tool');
          },
        );
        this.hint(group, 'Click the canvas, type, then Ctrl+Enter or click away.');
        break;
      }
      case 'move': {
        const group = this.group();
        this.checkbox(
          group,
          'Auto-select layer',
          () => options.move.autoSelect,
          (value) => {
            options.move.autoSelect = value;
            editor.emit('tool');
          },
        );
        this.hint(group, 'Arrow keys nudge the active layer by 1 px (Shift: 10 px).');
        break;
      }
      case 'crop': {
        const group = this.group();
        this.hint(group, 'Drag to set the crop area — it is applied when you release. Ctrl+Z undoes it.');
        break;
      }
      case 'zoom': {
        const group = this.group();
        this.hint(group, 'Click to zoom in, Alt+click to zoom out. Ctrl+scroll also zooms.');
        break;
      }
      case 'hand': {
        const group = this.group();
        this.hint(group, 'Drag to pan. Hold Space with any tool to pan temporarily.');
        break;
      }
      case 'eyedropper': {
        const group = this.group();
        this.hint(group, 'Click to pick a color. Alt+click sets the background color.');
        break;
      }
    }

    // Right-aligned quick actions.
    const spacer = document.createElement('div');
    spacer.className = 'option-spacer';
    this.root.appendChild(spacer);
    const shortcuts = document.createElement('button');
    shortcuts.className = 'option-button ghost';
    shortcuts.type = 'button';
    shortcuts.innerHTML = `${icon('keyboard', 15)}<span>Shortcuts</span>`;
    shortcuts.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('reoo:shortcuts'));
    });
    this.root.appendChild(shortcuts);
  }
}
