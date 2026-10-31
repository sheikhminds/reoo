/** Layers panel with thumbnails, visibility, locking, blend, opacity and drag reorder. */

import { BLEND_LABELS, BLEND_MODES, type Layer } from '../core/document';
import type { Editor } from '../core/editor';
import { icon } from './icons';

interface RowRefs {
  row: HTMLElement;
  eye: HTMLButtonElement;
  lock: HTMLButtonElement;
  name: HTMLElement;
  meta: HTMLElement;
  thumb: HTMLCanvasElement;
}

export class LayersPanel {
  private list: HTMLElement;
  private props: HTMLElement;
  private count: HTMLElement;
  private rows = new Map<string, RowRefs>();
  private signature = '';
  private editingId: string | null = null;
  private opacityInput: HTMLInputElement | null = null;
  private opacityOutput: HTMLOutputElement | null = null;
  private blendSelect: HTMLSelectElement | null = null;

  constructor(
    private readonly editor: Editor,
    private readonly root: HTMLElement,
  ) {
    this.root.replaceChildren();

    const head = document.createElement('header');
    head.className = 'panel-head';
    const title = document.createElement('h2');
    title.textContent = 'Layers';
    this.count = document.createElement('span');
    this.count.className = 'panel-count';
    head.append(title, this.count);

    this.props = document.createElement('div');
    this.props.className = 'layer-props';

    const scroll = document.createElement('div');
    scroll.className = 'layers-scroll';
    this.list = document.createElement('div');
    this.list.className = 'layers-list';
    this.list.setAttribute('role', 'list');
    scroll.appendChild(this.list);

    const footer = document.createElement('footer');
    footer.className = 'layer-actions';
    const actions: Array<[string, string, () => void]> = [
      ['plus', 'New layer', () => this.editor.addLayer()],
      ['copy', 'Duplicate layer', () => this.editor.duplicateLayer()],
      ['merge', 'Merge down', () => this.editor.mergeDown()],
      ['trash', 'Delete layer', () => this.editor.removeLayer()],
    ];
    for (const [name, label, action] of actions) {
      const button = document.createElement('button');
      button.className = 'icon-btn';
      button.type = 'button';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.innerHTML = icon(name, 17);
      button.addEventListener('click', action);
      footer.appendChild(button);
    }

    this.root.append(head, this.props, scroll, footer);

    this.editor.on('ui', () => this.sync());
    this.editor.on('new-document', () => {
      this.signature = '';
      this.sync();
    });
    this.sync();
  }

  private currentSignature(): string {
    return `${this.editor.doc.layers.map((layer) => layer.id).join('|')}::${this.editor.doc.activeId}`;
  }

  private sync(): void {
    const signature = this.currentSignature();
    if (signature !== this.signature) {
      this.signature = signature;
      this.rebuild();
    }
    this.refresh();
  }

  private rebuild(): void {
    this.rows.clear();
    this.list.replaceChildren();
    this.buildProps();
    this.count.textContent = String(this.editor.doc.layers.length);

    const layers = [...this.editor.doc.layers].reverse();
    for (const layer of layers) {
      this.list.appendChild(this.buildRow(layer));
    }
  }

  private buildProps(): void {
    this.props.replaceChildren();
    const layer = this.editor.doc.activeLayer;
    this.opacityInput = null;
    this.opacityOutput = null;
    this.blendSelect = null;
    if (!layer) return;

    const blendWrap = document.createElement('label');
    blendWrap.className = 'prop';
    const blendLabel = document.createElement('span');
    blendLabel.textContent = 'Blend';
    const select = document.createElement('select');
    for (const mode of BLEND_MODES) {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = BLEND_LABELS[mode];
      select.appendChild(option);
    }
    select.value = layer.blend;
    select.addEventListener('focus', () => this.editor.beginUndo());
    select.addEventListener('change', () => {
      if (this.editor.doc.activeId) this.editor.setLayerBlend(this.editor.doc.activeId, select.value as Layer['blend']);
    });
    blendWrap.append(blendLabel, select);

    const opacityWrap = document.createElement('label');
    opacityWrap.className = 'prop prop-opacity';
    const opacityLabel = document.createElement('span');
    opacityLabel.textContent = 'Opacity';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(layer.opacity * 100));
    const output = document.createElement('output');
    output.textContent = `${Math.round(layer.opacity * 100)}%`;
    input.addEventListener('pointerdown', () => this.editor.beginUndo());
    input.addEventListener('input', () => {
      output.textContent = `${input.value}%`;
      if (this.editor.doc.activeId) {
        this.editor.setLayerOpacity(this.editor.doc.activeId, Number(input.value) / 100);
      }
    });
    opacityWrap.append(opacityLabel, input, output);

    this.props.append(blendWrap, opacityWrap);
    this.opacityInput = input;
    this.opacityOutput = output;
    this.blendSelect = select;
  }

  private buildRow(layer: Layer): HTMLElement {
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.dataset.id = layer.id;
    row.draggable = true;
    row.setAttribute('role', 'listitem');

    const eye = document.createElement('button');
    eye.className = 'layer-btn';
    eye.type = 'button';
    eye.title = 'Toggle visibility';
    eye.setAttribute('aria-label', 'Toggle visibility');
    eye.innerHTML = icon(layer.visible ? 'eye' : 'eye-off', 16);
    eye.addEventListener('click', (event) => {
      event.stopPropagation();
      this.editor.beginUndo();
      this.editor.setLayerVisibility(layer.id, !layer.visible);
    });

    const thumb = document.createElement('canvas');
    thumb.className = 'layer-thumb';
    thumb.width = 44;
    thumb.height = 34;

    const info = document.createElement('div');
    info.className = 'layer-info';
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = layer.name;
    const meta = document.createElement('span');
    meta.className = 'layer-meta';
    info.append(name, meta);

    name.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      this.startRename(layer.id, name);
    });

    const lock = document.createElement('button');
    lock.className = 'layer-btn';
    lock.type = 'button';
    lock.title = 'Lock transparency';
    lock.setAttribute('aria-label', 'Lock layer');
    lock.innerHTML = icon(layer.locked ? 'lock' : 'unlock', 15);
    lock.addEventListener('click', (event) => {
      event.stopPropagation();
      this.editor.beginUndo();
      this.editor.setLayerLocked(layer.id, !layer.locked);
    });

    row.append(eye, thumb, info, lock);
    row.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button, input')) return;
      this.editor.setActiveLayer(layer.id);
    });

    row.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', layer.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      row.classList.remove('drop-target');
      const dragged = event.dataTransfer?.getData('text/plain');
      if (!dragged || dragged === layer.id) return;
      const index = this.editor.doc.layers.findIndex((item) => item.id === layer.id);
      this.editor.moveLayer(dragged, index);
    });

    this.rows.set(layer.id, { row, eye, lock, name, meta, thumb });
    return row;
  }

  private startRename(id: string, nameEl: HTMLElement): void {
    const layer = this.editor.doc.getLayer(id);
    if (!layer || this.editingId) return;
    this.editingId = id;
    const input = document.createElement('input');
    input.className = 'layer-rename';
    input.value = layer.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      this.editingId = null;
      if (commit) {
        this.editor.beginUndo();
        this.editor.renameLayer(id, input.value);
      }
      this.signature = '';
      this.sync();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  private refresh(): void {
    const doc = this.editor.doc;
    this.count.textContent = String(doc.layers.length);
    const active = doc.activeLayer;

    if (this.opacityInput && active) {
      const value = String(Math.round(active.opacity * 100));
      if (document.activeElement !== this.opacityInput) this.opacityInput.value = value;
      if (this.opacityOutput) this.opacityOutput.textContent = `${value}%`;
    }
    if (this.blendSelect && active && document.activeElement !== this.blendSelect) {
      this.blendSelect.value = active.blend;
    }

    for (const [id, refs] of this.rows) {
      const layer = doc.getLayer(id);
      if (!layer) continue;
      refs.row.classList.toggle('active', id === doc.activeId);
      refs.row.classList.toggle('is-hidden', !layer.visible);
      refs.row.classList.toggle('is-locked', layer.locked);
      refs.eye.innerHTML = icon(layer.visible ? 'eye' : 'eye-off', 16);
      refs.lock.innerHTML = icon(layer.locked ? 'lock' : 'unlock', 15);
      if (this.editingId !== id) refs.name.textContent = layer.name;
      refs.meta.textContent = `${BLEND_LABELS[layer.blend]} · ${Math.round(layer.opacity * 100)}%`;
      this.drawThumb(refs.thumb, layer);
    }
  }

  private drawThumb(canvas: HTMLCanvasElement, layer: Layer): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, 0, width, height);
    const scale = Math.min(width / this.editor.doc.width, height / this.editor.doc.height);
    const w = this.editor.doc.width * scale;
    const h = this.editor.doc.height * scale;
    ctx.drawImage(layer.canvas, (width - w) / 2, (height - h) / 2, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  }
}
