/** App shell: menus, toolbar, color, status bar, dialogs and shortcuts. */

import { grayscale, hueSaturation, invert, levels, posterize, sepia, threshold, brightnessContrast } from '../core/adjustments';
import { Editor } from '../core/editor';
import { addNoise, blur, gaussianBlur, pixelate, sharpen } from '../core/filters';
import { selectionBounds } from '../core/selection';
import type { ToolId } from '../types';
import { openDialog } from './dialog';
import { GITHUB_ICON, icon } from './icons';
import { LayersPanel } from './layers';
import { OptionsBar } from './options';
import { CanvasView } from './view';

const REPO_URL = 'https://github.com/sheikhminds/reoo';

interface ToolButton {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: string;
  separator?: boolean;
}

const TOOLS: ToolButton[] = [
  { id: 'move', label: 'Move', shortcut: 'V', icon: 'move' },
  { id: 'select', label: 'Marquee / lasso select', shortcut: 'M', icon: 'select' },
  { id: 'brush', label: 'Brush', shortcut: 'B', icon: 'brush', separator: true },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: 'eraser' },
  { id: 'fill', label: 'Paint bucket', shortcut: 'G', icon: 'fill' },
  { id: 'gradient', label: 'Gradient', shortcut: 'Shift+G', icon: 'gradient' },
  { id: 'shape', label: 'Shape', shortcut: 'U', icon: 'shape' },
  { id: 'text', label: 'Text', shortcut: 'T', icon: 'text' },
  { id: 'eyedropper', label: 'Eyedropper', shortcut: 'I', icon: 'eyedropper', separator: true },
  { id: 'crop', label: 'Crop', shortcut: 'C', icon: 'crop' },
  { id: 'hand', label: 'Hand / pan', shortcut: 'H', icon: 'hand' },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', icon: 'zoom' },
];

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

const SHELL = `
<div class="app-shell">
  <header class="topbar">
    <div class="brand" aria-label="Reoo">
      <span class="brand-mark">R</span>
      <span class="brand-name">reoo</span>
    </div>
    <nav class="menubar" id="menubar" aria-label="Main menu"></nav>
    <div class="doc-label" id="doc-label">untitled</div>
    <div class="topbar-actions">
      <button class="icon-btn" id="btn-undo" type="button" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo', 17)}</button>
      <button class="icon-btn" id="btn-redo" type="button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon('redo', 17)}</button>
      <button class="btn btn-primary btn-small" id="btn-export" type="button">Export</button>
      <a class="icon-btn" id="btn-github" href="${REPO_URL}" target="_blank" rel="noopener" title="View on GitHub" aria-label="GitHub repository">${GITHUB_ICON}</a>
      <button class="icon-btn only-mobile" id="btn-panels" type="button" title="Layers" aria-label="Toggle layers panel">${icon('menu', 18)}</button>
    </div>
  </header>
  <div class="optionsbar" id="optionsbar"></div>
  <div class="workspace" id="workspace">
    <aside class="toolbar" id="toolbar" aria-label="Tools"></aside>
    <div class="stage" id="stage"></div>
    <aside class="sidebar" id="sidebar">
      <section class="panel color-panel">
        <header class="panel-head"><h2>Color</h2><span class="panel-hint">Alt+click picks</span></header>
        <div class="color-body" id="color-body"></div>
      </section>
      <section class="panel layers-panel" id="layers-panel"></section>
    </aside>
  </div>
  <footer class="statusbar">
    <div class="status-left">
      <span id="status-doc">1200 × 800</span>
      <span class="status-sep"></span>
      <span id="status-layers">1 layer</span>
      <span class="status-sep"></span>
      <span id="status-size">100%</span>
    </div>
    <div class="status-right">
      <span id="status-cursor" class="status-cursor">—</span>
      <span class="status-sep"></span>
      <button class="status-btn" id="zoom-out" type="button" title="Zoom out (Ctrl+-)" aria-label="Zoom out">−</button>
      <button class="status-btn zoom-value" id="zoom-reset" type="button" title="Reset to 100% (Ctrl+1)">100%</button>
      <button class="status-btn" id="zoom-in" type="button" title="Zoom in (Ctrl+=)" aria-label="Zoom in">+</button>
      <button class="status-btn" id="zoom-fit" type="button" title="Fit on screen (Ctrl+0)">Fit</button>
    </div>
  </footer>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
</div>
<input type="file" id="file-open" hidden accept="image/*,.psd,.psb,.reoo,application/json" />
<input type="file" id="file-place" hidden accept="image/*" />
`;

const SHORTCUTS_HTML = `
<table class="shortcut-table">
  <tbody>
    <tr><td>V / M / L</td><td>Move / select / lasso</td></tr>
    <tr><td>B / E</td><td>Brush / eraser</td></tr>
    <tr><td>G / Shift+G</td><td>Paint bucket / gradient</td></tr>
    <tr><td>U / T</td><td>Shape / text</td></tr>
    <tr><td>I / C</td><td>Eyedropper / crop</td></tr>
    <tr><td>H / Z</td><td>Hand / zoom</td></tr>
    <tr><td>[ / ]</td><td>Brush size</td></tr>
    <tr><td>X / D</td><td>Swap / reset colors</td></tr>
    <tr><td>Space</td><td>Pan temporarily</td></tr>
    <tr><td>Ctrl+Z / Ctrl+Shift+Z</td><td>Undo / redo</td></tr>
    <tr><td>Ctrl+A / Ctrl+D</td><td>Select all / deselect</td></tr>
    <tr><td>Ctrl+C / X / V</td><td>Copy / cut / paste</td></tr>
    <tr><td>Delete</td><td>Clear selection</td></tr>
    <tr><td>Ctrl+S</td><td>Save project (.reoo)</td></tr>
    <tr><td>Ctrl+O / Ctrl+Shift+O</td><td>Open / place image</td></tr>
    <tr><td>Ctrl+E</td><td>Export image</td></tr>
    <tr><td>Ctrl+0 / Ctrl+1</td><td>Fit / 100%</td></tr>
  </tbody>
</table>
`;

export class App {
  readonly editor = new Editor();
  private view: CanvasView;
  private optionsBar: OptionsBar;
  private shell: HTMLElement;
  private toastTimer: number | null = null;
  private openMenu: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = SHELL;
    this.shell = root.querySelector('.app-shell') as HTMLElement;
    this.view = new CanvasView(this.editor, this.must<HTMLElement>('#stage'));
    this.optionsBar = new OptionsBar(this.editor, this.must<HTMLElement>('#optionsbar'));
    new LayersPanel(this.editor, this.must<HTMLElement>('#layers-panel'));

    this.buildToolbar();
    this.buildMenus();
    this.buildColorPanel();
    this.bindStatusBar();
    this.bindGlobalControls();
    this.bindKeyboard();

    this.optionsBar.update();
    this.editor.on('ui', () => this.updateStatus());
    this.editor.on('cursor', () => this.updateCursor());
    this.editor.on('new-document', () => {
      this.updateStatus();
      this.updateColorPanel();
      this.shell.classList.remove('sidebar-open');
    });
    this.editor.on('toast', () => this.showToast(this.editor.lastToast));
    this.editor.on('selection', () => this.updateStatus());

    this.updateStatus();
    this.updateColorPanel();
    setTimeout(() => this.showToast('Drop an image, or press File → Open to begin.'), 900);
  }

  private must<T extends Element>(selector: string): T {
    const element = this.root.querySelector(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element as T;
  }

  // ---- toolbar ------------------------------------------------------------

  private buildToolbar(): void {
    const toolbar = this.must<HTMLElement>('#toolbar');
    for (const tool of TOOLS) {
      if (tool.separator) {
        const divider = document.createElement('div');
        divider.className = 'tool-divider';
        toolbar.appendChild(divider);
      }
      const button = document.createElement('button');
      button.className = 'tool-btn';
      button.type = 'button';
      button.dataset.tool = tool.id;
      button.title = `${tool.label} (${tool.shortcut})`;
      button.setAttribute('aria-label', tool.label);
      button.innerHTML = icon(tool.icon, 21);
      button.addEventListener('click', () => this.selectTool(tool.id));
      toolbar.appendChild(button);
    }
    this.markActiveTool();
    this.editor.on('tool', () => this.markActiveTool());
  }

  private markActiveTool(): void {
    const toolbar = this.must<HTMLElement>('#toolbar');
    toolbar.querySelectorAll<HTMLElement>('.tool-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.tool === this.editor.toolId);
    });
  }

  private selectTool(id: ToolId): void {
    this.editor.setTool(id);
    this.shell.classList.remove('sidebar-open');
  }

  // ---- menus --------------------------------------------------------------

  private buildMenus(): void {
    const nav = this.must<HTMLElement>('#menubar');
    const menus: Menu[] = [
      {
        label: 'File',
        items: [
          { label: 'New document…', shortcut: 'Ctrl+Alt+N', action: () => this.newDocumentDialog() },
          { label: 'Open image or project…', shortcut: 'Ctrl+O', action: () => this.pickFile('open') },
          { label: 'Place image as layer…', shortcut: 'Ctrl+Shift+O', action: () => this.pickFile('place') },
          { separator: true },
          { label: 'Save project (.reoo)', shortcut: 'Ctrl+S', action: () => this.editor.saveProject() },
          { label: 'Export image…', shortcut: 'Ctrl+E', action: () => this.exportDialog() },
          { label: 'Export PSD', action: () => this.exportPsd() },
        ],
      },
      {
        label: 'Edit',
        items: [
          { label: 'Undo', shortcut: 'Ctrl+Z', action: () => this.editor.undo() },
          { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => this.editor.redo() },
          { separator: true },
          { label: 'Cut', shortcut: 'Ctrl+X', action: () => this.editor.cutSelection() },
          { label: 'Copy', shortcut: 'Ctrl+C', action: () => this.editor.copySelection() },
          { label: 'Paste', shortcut: 'Ctrl+V', action: () => this.editor.paste() },
          { separator: true },
          { label: 'Select all', shortcut: 'Ctrl+A', action: () => this.editor.selectAll() },
          { label: 'Deselect', shortcut: 'Ctrl+D', action: () => this.editor.clearSelection() },
          { label: 'Delete selection', shortcut: 'Delete', action: () => this.editor.deleteSelection() },
        ],
      },
      {
        label: 'Image',
        items: [
          { label: 'Resize image…', action: () => this.resizeDialog() },
          { label: 'Crop to selection', action: () => this.cropToSelection() },
          { separator: true },
          { label: 'Flatten image', action: () => this.editor.flattenImage() },
        ],
      },
      {
        label: 'Layer',
        items: [
          { label: 'New layer', shortcut: 'Ctrl+Shift+N', action: () => this.editor.addLayer() },
          { label: 'Duplicate layer', shortcut: 'Ctrl+J', action: () => this.editor.duplicateLayer() },
          { label: 'Delete layer', action: () => this.editor.removeLayer() },
          { label: 'Merge down', action: () => this.editor.mergeDown() },
        ],
      },
      {
        label: 'Select',
        items: [
          { label: 'All', shortcut: 'Ctrl+A', action: () => this.editor.selectAll() },
          { label: 'Deselect', shortcut: 'Ctrl+D', action: () => this.editor.clearSelection() },
          { separator: true },
          { label: 'Rectangle marquee', action: () => this.useSelectShape('rect') },
          { label: 'Ellipse marquee', action: () => this.useSelectShape('ellipse') },
          { label: 'Lasso', action: () => this.useSelectShape('lasso') },
        ],
      },
      {
        label: 'Filter',
        items: [
          { label: 'Blur…', action: () => this.blurDialog() },
          { label: 'Gaussian blur…', action: () => this.gaussianDialog() },
          { label: 'Sharpen…', action: () => this.sharpenDialog() },
          { label: 'Pixelate…', action: () => this.pixelateDialog() },
          { label: 'Add noise…', action: () => this.noiseDialog() },
          { separator: true },
          { label: 'Brightness / Contrast…', action: () => this.brightnessDialog() },
          { label: 'Hue / Saturation…', action: () => this.hueDialog() },
          { label: 'Levels…', action: () => this.levelsDialog() },
          { label: 'Grayscale', action: () => this.editor.applyPixelOp('Grayscale', (data) => grayscale(data)) },
          { label: 'Invert', action: () => this.editor.applyPixelOp('Inverted', (data) => invert(data)) },
          { label: 'Sepia', action: () => this.editor.applyPixelOp('Sepia', (data) => sepia(data)) },
          { label: 'Threshold…', action: () => this.thresholdDialog() },
          { label: 'Posterize…', action: () => this.posterizeDialog() },
        ],
      },
      {
        label: 'View',
        items: [
          { label: 'Zoom in', shortcut: 'Ctrl+=', action: () => this.editor.zoomBy(1.25) },
          { label: 'Zoom out', shortcut: 'Ctrl+-', action: () => this.editor.zoomBy(0.8) },
          { label: '100%', shortcut: 'Ctrl+1', action: () => this.editor.setZoom(1) },
          { label: 'Fit on screen', shortcut: 'Ctrl+0', action: () => this.editor.zoomToFit() },
        ],
      },
      {
        label: 'Help',
        items: [
          { label: 'Keyboard shortcuts', shortcut: '?', action: () => this.shortcutsDialog() },
          { label: 'Source code', action: () => window.open(REPO_URL, '_blank', 'noopener') },
          { label: 'About Reoo', action: () => this.aboutDialog() },
        ],
      },
    ];

    for (const menu of menus) {
      const wrapper = document.createElement('div');
      wrapper.className = 'menu';
      const trigger = document.createElement('button');
      trigger.className = 'menu-trigger';
      trigger.type = 'button';
      trigger.textContent = menu.label;
      trigger.setAttribute('aria-haspopup', 'true');
      const dropdown = document.createElement('div');
      dropdown.className = 'menu-dropdown';
      for (const item of menu.items) {
        if (item.separator) {
          const separator = document.createElement('div');
          separator.className = 'menu-separator';
          dropdown.appendChild(separator);
          continue;
        }
        const button = document.createElement('button');
        button.className = 'menu-item';
        button.type = 'button';
        const label = document.createElement('span');
        label.textContent = item.label ?? '';
        button.appendChild(label);
        if (item.shortcut) {
          const shortcut = document.createElement('kbd');
          shortcut.textContent = item.shortcut;
          button.appendChild(shortcut);
        }
        button.addEventListener('click', () => {
          this.closeMenus();
          item.action?.();
        });
        dropdown.appendChild(button);
      }
      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        this.closeMenus();
        if (!isOpen) {
          wrapper.classList.add('open');
          this.openMenu = wrapper;
        }
      });
      wrapper.append(trigger, dropdown);
      nav.appendChild(wrapper);
    }

    document.addEventListener('pointerdown', (event) => {
      if (this.openMenu && !this.openMenu.contains(event.target as Node)) this.closeMenus();
    });
  }

  private closeMenus(): void {
    this.openMenu?.classList.remove('open');
    this.openMenu = null;
  }

  // ---- color --------------------------------------------------------------

  private buildColorPanel(): void {
    const body = this.must<HTMLElement>('#color-body');
    body.innerHTML = `
      <label class="color-row">
        <span class="color-label">Foreground</span>
        <input type="color" id="color-primary" aria-label="Foreground color" />
        <code id="hex-primary">#111827</code>
      </label>
      <label class="color-row">
        <span class="color-label">Background</span>
        <input type="color" id="color-secondary" aria-label="Background color" />
        <code id="hex-secondary">#ffffff</code>
      </label>
      <div class="color-actions">
        <button class="btn btn-ghost btn-small" id="color-swap" type="button">${icon('undo', 14)}<span>Swap</span></button>
        <button class="btn btn-ghost btn-small" id="color-reset" type="button">${icon('settings', 14)}<span>Reset</span></button>
      </div>
    `;
    const primary = this.must<HTMLInputElement>('#color-primary');
    const secondary = this.must<HTMLInputElement>('#color-secondary');
    primary.addEventListener('input', () => {
      this.editor.setPrimary(primary.value);
      this.updateColorPanel();
    });
    secondary.addEventListener('input', () => {
      this.editor.setSecondary(secondary.value);
      this.updateColorPanel();
    });
    this.must<HTMLButtonElement>('#color-swap').addEventListener('click', () => {
      this.editor.swapColors();
      this.updateColorPanel();
    });
    this.must<HTMLButtonElement>('#color-reset').addEventListener('click', () => {
      this.editor.resetColors();
      this.updateColorPanel();
    });
  }

  private updateColorPanel(): void {
    const primary = this.must<HTMLInputElement>('#color-primary');
    const secondary = this.must<HTMLInputElement>('#color-secondary');
    if (document.activeElement !== primary) primary.value = this.editor.primary;
    if (document.activeElement !== secondary) secondary.value = this.editor.secondary;
    this.must<HTMLElement>('#hex-primary').textContent = this.editor.primary.toUpperCase();
    this.must<HTMLElement>('#hex-secondary').textContent = this.editor.secondary.toUpperCase();
  }

  // ---- status bar ---------------------------------------------------------

  private bindStatusBar(): void {
    this.must<HTMLButtonElement>('#zoom-in').addEventListener('click', () => this.editor.zoomBy(1.25));
    this.must<HTMLButtonElement>('#zoom-out').addEventListener('click', () => this.editor.zoomBy(0.8));
    this.must<HTMLButtonElement>('#zoom-fit').addEventListener('click', () => this.editor.zoomToFit());
    this.must<HTMLButtonElement>('#zoom-reset').addEventListener('click', () => this.editor.setZoom(1));
    this.editor.on('ui', () => this.updateColorPanel());
  }

  private updateStatus(): void {
    const editor = this.editor;
    this.must<HTMLElement>('#status-doc').textContent = `${editor.doc.width} × ${editor.doc.height}`;
    const count = editor.doc.layers.length;
    this.must<HTMLElement>('#status-layers').textContent = `${count} layer${count === 1 ? '' : 's'}`;
    this.must<HTMLElement>('#status-size').textContent = `${editor.history.undoDepth} undo`;
    this.must<HTMLElement>('#zoom-reset').textContent = `${Math.round(editor.view.zoom * 100)}%`;
    this.must<HTMLElement>('#doc-label').textContent = editor.name + (editor.modified ? ' •' : '');
    document.title = `${editor.name}${editor.modified ? ' •' : ''} — Reoo`;
    this.must<HTMLButtonElement>('#btn-undo').disabled = !editor.history.canUndo;
    this.must<HTMLButtonElement>('#btn-redo').disabled = !editor.history.canRedo;
  }

  private updateCursor(): void {
    const cursor = this.editor.cursor;
    const text = this.must<HTMLElement>('#status-cursor');
    if (!cursor.inside) {
      text.textContent = '—';
      return;
    }
    text.textContent = `${Math.floor(cursor.x)}, ${Math.floor(cursor.y)} px`;
  }

  // ---- dialogs ------------------------------------------------------------

  private newDocumentDialog(): void {
    openDialog({
      title: 'New document',
      description: 'Create a blank canvas. You can add images as layers afterwards.',
      fields: [
        { key: 'width', label: 'Width', type: 'number', value: 1200, min: 1, max: 12000, suffix: 'px' },
        { key: 'height', label: 'Height', type: 'number', value: 800, min: 1, max: 12000, suffix: 'px' },
        { key: 'color', label: 'Background', type: 'color', value: '#ffffff' },
        { key: 'transparent', label: 'Transparent', type: 'checkbox', value: false },
      ],
      submitLabel: 'Create',
      onSubmit: (values) => {
        const width = Math.max(1, Math.min(12000, Number(values.width)));
        const height = Math.max(1, Math.min(12000, Number(values.height)));
        this.editor.newDocument(
          width,
          height,
          values.transparent ? 'transparent' : String(values.color),
        );
      },
    });
  }

  private resizeDialog(): void {
    openDialog({
      title: 'Resize image',
      description: 'Scales the whole document, including every layer.',
      fields: [
        {
          key: 'width',
          label: 'Width',
          type: 'number',
          value: this.editor.doc.width,
          min: 1,
          max: 12000,
          suffix: 'px',
        },
        {
          key: 'height',
          label: 'Height',
          type: 'number',
          value: this.editor.doc.height,
          min: 1,
          max: 12000,
          suffix: 'px',
        },
      ],
      submitLabel: 'Resize',
      onSubmit: (values) => {
        this.editor.resizeImage(Number(values.width), Number(values.height));
      },
    });
  }

  private exportDialog(): void {
    openDialog({
      title: 'Export image',
      description: 'Export a flattened copy of the document.',
      fields: [
        {
          key: 'format',
          label: 'Format',
          type: 'select',
          value: 'png',
          options: [
            { label: 'PNG (transparency)', value: 'png' },
            { label: 'JPEG (white background)', value: 'jpeg' },
            { label: 'WebP', value: 'webp' },
          ],
        },
        { key: 'quality', label: 'Quality', type: 'range', value: 92, min: 1, max: 100, suffix: '%' },
        { key: 'scale', label: 'Scale', type: 'range', value: 100, min: 10, max: 400, step: 5, suffix: '%' },
      ],
      submitLabel: 'Export',
      onSubmit: (values) => {
        const format = String(values.format) as 'png' | 'jpeg' | 'webp';
        void this.editor.exportImage(format, Number(values.quality) / 100, Number(values.scale) / 100);
      },
    });
  }

  private exportPsd(): void {
    this.editor.toast('Encoding PSD…');
    this.editor.exportPsd().catch((error: unknown) => {
      this.editor.toast(error instanceof Error ? error.message : 'PSD export failed');
    });
  }

  private useSelectShape(shape: 'rect' | 'ellipse' | 'lasso'): void {
    this.editor.options.select.shape = shape;
    if (this.editor.toolId === 'select') this.editor.emit('tool');
    else this.editor.setTool('select');
  }

  private cropToSelection(): void {
    if (!this.editor.selection) {
      this.editor.toast('Make a selection first');
      return;
    }
    const bounds = selectionBounds(this.editor.selection);
    this.editor.cropDocument(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  private blurDialog(): void {
    openDialog({
      title: 'Blur',
      fields: [{ key: 'radius', label: 'Radius', type: 'range', value: 4, min: 1, max: 60, suffix: 'px' }],
      submitLabel: 'Apply',
      onSubmit: (values) => {
        const radius = Number(values.radius);
        this.editor.applyPixelOp('Blurred', (data) => blur(data, this.editor.doc.width, this.editor.doc.height, radius));
      },
    });
  }

  private gaussianDialog(): void {
    openDialog({
      title: 'Gaussian blur',
      fields: [{ key: 'radius', label: 'Radius', type: 'range', value: 6, min: 1, max: 100, suffix: 'px' }],
      submitLabel: 'Apply',
      onSubmit: (values) => {
        const radius = Number(values.radius);
        this.editor.applyPixelOp('Gaussian blur', (data) => gaussianBlur(data, this.editor.doc.width, this.editor.doc.height, radius));
      },
    });
  }

  private sharpenDialog(): void {
    openDialog({
      title: 'Sharpen',
      fields: [{ key: 'amount', label: 'Amount', type: 'range', value: 60, min: 0, max: 200, suffix: '%' }],
      submitLabel: 'Apply',
      onSubmit: (values) => {
        const amount = Number(values.amount);
        this.editor.applyPixelOp('Sharpened', (data) => sharpen(data, this.editor.doc.width, this.editor.doc.height, amount));
      },
    });
  }

  private pixelateDialog(): void {
    openDialog({
      title: 'Pixelate',
      fields: [{ key: 'block', label: 'Cell size', type: 'range', value: 10, min: 2, max: 100, suffix: 'px' }],
      submitLabel: 'Apply',
      onSubmit: (values) => {
        const block = Number(values.block);
        this.editor.applyPixelOp('Pixelated', (data) => pixelate(data, this.editor.doc.width, this.editor.doc.height, block));
      },
    });
  }

  private noiseDialog(): void {
    openDialog({
      title: 'Add noise',
      fields: [
        { key: 'amount', label: 'Amount', type: 'range', value: 24, min: 0, max: 100, suffix: '%' },
        { key: 'monochrome', label: 'Monochrome', type: 'checkbox', value: true },
      ],
      submitLabel: 'Apply',
      onSubmit: (values) => {
        const amount = Number(values.amount);
        this.editor.applyPixelOp('Added noise', (data) =>
          addNoise(data, amount, 1337, values.monochrome === true),
        );
      },
    });
  }

  private brightnessDialog(): void {
    openDialog({
      title: 'Brightness / Contrast',
      fields: [
        { key: 'brightness', label: 'Brightness', type: 'range', value: 0, min: -100, max: 100 },
        { key: 'contrast', label: 'Contrast', type: 'range', value: 0, min: -100, max: 100 },
      ],
      submitLabel: 'Apply',
      onSubmit: (values) => {
        const brightness = Number(values.brightness);
        const contrast = Number(values.contrast);
        this.editor.applyPixelOp('Adjusted brightness', (data) => brightnessContrast(data, brightness, contrast));
      },
    });
  }

  private hueDialog(): void {
    openDialog({
      title: 'Hue / Saturation',
      fields: [
        { key: 'hue', label: 'Hue', type: 'range', value: 0, min: -180, max: 180, suffix: '°' },
        { key: 'saturation', label: 'Saturation', type: 'range', value: 0, min: -100, max: 100 },
        { key: 'lightness', label: 'Lightness', type: 'range', value: 0, min: -100, max: 100 },
      ],
      submitLabel: 'Apply',
      onSubmit: (values) => {
        const hue = Number(values.hue);
        const saturation = Number(values.saturation);
        const lightness = Number(values.lightness);
        this.editor.applyPixelOp('Hue / saturation', (data) => hueSaturation(data, hue, saturation, lightness));
      },
    });
  }

  private levelsDialog(): void {
    openDialog({
      title: 'Levels',
      fields: [
        { key: 'black', label: 'Black point', type: 'range', value: 0, min: 0, max: 254 },
        { key: 'white', label: 'White point', type: 'range', value: 255, min: 1, max: 255 },
        { key: 'gamma', label: 'Gamma', type: 'range', value: 1, min: 0.1, max: 3, step: 0.05 },
      ],
      submitLabel: 'Apply',
      onSubmit: (values) => {
        const black = Number(values.black);
        const white = Number(values.white);
        const gamma = Number(values.gamma);
        this.editor.applyPixelOp('Levels', (data) => levels(data, black, white, gamma));
      },
    });
  }

  private thresholdDialog(): void {
    openDialog({
      title: 'Threshold',
      fields: [{ key: 'level', label: 'Level', type: 'range', value: 128, min: 0, max: 255 }],
      submitLabel: 'Apply',
      onSubmit: (values) => {
        const level = Number(values.level);
        this.editor.applyPixelOp('Threshold', (data) => threshold(data, level));
      },
    });
  }

  private posterizeDialog(): void {
    openDialog({
      title: 'Posterize',
      fields: [{ key: 'levels', label: 'Levels', type: 'range', value: 6, min: 2, max: 32 }],
      submitLabel: 'Apply',
      onSubmit: (values) => {
        const count = Number(values.levels);
        this.editor.applyPixelOp('Posterized', (data) => posterize(data, count));
      },
    });
  }

  private shortcutsDialog(): void {
    openDialog({ title: 'Keyboard shortcuts', html: SHORTCUTS_HTML });
  }

  private aboutDialog(): void {
    openDialog({
      title: 'About Reoo',
      html: `
        <p><strong>Reoo</strong> is a free, open-source graphics editor that runs entirely in your browser.
        No uploads, no account, no install.</p>
        <ul class="about-list">
          <li>Raster layers, blend modes and opacity</li>
          <li>Brush, eraser, bucket, gradients, shapes and text</li>
          <li>Rectangle, ellipse and lasso selections</li>
          <li>Adjustments, filters and crop</li>
          <li>PNG / JPEG / WebP export, layered PSD import and export</li>
          <li>Native <code>.reoo</code> project files</li>
        </ul>
        <p>MIT licensed. Built by an autonomous AI agent — every commit is public.</p>
        <p class="about-links">
          <a href="${REPO_URL}" target="_blank" rel="noopener">Source code</a>
          <a href="https://github.com/sponsors/sheikhminds" target="_blank" rel="noopener">Sponsor</a>
          <a href="${REPO_URL}/issues" target="_blank" rel="noopener">Report a bug</a>
        </p>
        <p class="about-muted">Version 0.1.0</p>
      `,
    });
  }

  // ---- global controls ----------------------------------------------------

  private bindGlobalControls(): void {
    this.must<HTMLButtonElement>('#btn-undo').addEventListener('click', () => this.editor.undo());
    this.must<HTMLButtonElement>('#btn-redo').addEventListener('click', () => this.editor.redo());
    this.must<HTMLButtonElement>('#btn-export').addEventListener('click', () => this.exportDialog());
    this.must<HTMLButtonElement>('#btn-panels').addEventListener('click', () => {
      this.shell.classList.toggle('sidebar-open');
    });

    const openInput = this.must<HTMLInputElement>('#file-open');
    openInput.addEventListener('change', () => {
      const file = openInput.files?.[0];
      if (file) void this.editor.openFile(file);
      openInput.value = '';
    });
    const placeInput = this.must<HTMLInputElement>('#file-place');
    placeInput.addEventListener('change', () => {
      const file = placeInput.files?.[0];
      if (file) void this.editor.placeImage(file);
      placeInput.value = '';
    });

    this.fileInputs = { open: openInput, place: placeInput };

    document.addEventListener('reoo:shortcuts', () => this.shortcutsDialog());

    window.addEventListener('beforeunload', (event) => {
      if (!this.editor.modified) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  private fileInputs: { open: HTMLInputElement; place: HTMLInputElement } | null = null;

  private pickFile(kind: 'open' | 'place'): void {
    const input = kind === 'open' ? this.fileInputs?.open : this.fileInputs?.place;
    input?.click();
  }

  // ---- keyboard -----------------------------------------------------------

  private bindKeyboard(): void {
    window.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, select') || target.isContentEditable)) return;
      if (document.body.classList.contains('modal-open')) return;
      const key = event.key;
      const lower = key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (key === 'Escape') {
        this.closeMenus();
        this.view.cancelActiveTool?.();
        this.editor.clearSelection();
        return;
      }

      if (mod) {
        const handled = this.handleModifierShortcut(event, lower);
        if (handled) event.preventDefault();
        return;
      }

      if (key === '?' || (key === '/' && event.shiftKey)) {
        event.preventDefault();
        this.shortcutsDialog();
        return;
      }

      if (key === 'Delete' || key === 'Backspace') {
        event.preventDefault();
        this.editor.deleteSelection();
        return;
      }

      if (key.startsWith('Arrow') && this.editor.toolId === 'move') {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
        const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
        this.editor.nudge(dx, dy);
        return;
      }

      if (key === '[' || key === ']') {
        event.preventDefault();
        const target2 = this.editor.toolId === 'eraser' ? this.editor.options.eraser : this.editor.options.brush;
        const delta = Math.max(1, Math.round(target2.size * 0.12));
        target2.size = Math.max(1, Math.min(500, target2.size + (key === ']' ? delta : -delta)));
        this.editor.emit('tool');
        return;
      }

      switch (lower) {
        case 'v':
          this.activateTool('move');
          break;
        case 'm':
          this.useSelectShape('rect');
          break;
        case 'l':
          this.useSelectShape('lasso');
          break;
        case 'b':
          this.activateTool('brush');
          break;
        case 'e':
          this.activateTool('eraser');
          break;
        case 'g':
          this.activateTool(event.shiftKey ? 'gradient' : 'fill');
          break;
        case 'u':
          this.activateTool('shape');
          break;
        case 't':
          this.activateTool('text');
          break;
        case 'i':
          this.activateTool('eyedropper');
          break;
        case 'c':
          this.activateTool('crop');
          break;
        case 'h':
          this.activateTool('hand');
          break;
        case 'z':
          this.activateTool('zoom');
          break;
        case 'x':
          this.editor.swapColors();
          this.updateColorPanel();
          break;
        case 'd':
          this.editor.resetColors();
          this.updateColorPanel();
          break;
        default:
          break;
      }
    });
  }

  private handleModifierShortcut(event: KeyboardEvent, key: string): boolean {
    switch (key) {
      case 'z':
        if (event.shiftKey) this.editor.redo();
        else this.editor.undo();
        return true;
      case 'y':
        this.editor.redo();
        return true;
      case 's':
        this.editor.saveProject();
        return true;
      case 'o':
        this.pickFile(event.shiftKey ? 'place' : 'open');
        return true;
      case 'n':
        if (event.shiftKey) this.editor.addLayer();
        else this.newDocumentDialog();
        return true;
      case 'e':
        this.exportDialog();
        return true;
      case 'a':
        this.editor.selectAll();
        return true;
      case 'd':
        this.editor.clearSelection();
        return true;
      case 'c':
        this.editor.copySelection();
        return true;
      case 'x':
        this.editor.cutSelection();
        return true;
      case 'v':
        this.editor.paste();
        return true;
      case 'j':
        this.editor.duplicateLayer();
        return true;
      case '0':
        this.editor.zoomToFit();
        return true;
      case '1':
        this.editor.setZoom(1);
        return true;
      case '=':
      case '+':
        this.editor.zoomBy(1.25);
        return true;
      case '-':
        this.editor.zoomBy(0.8);
        return true;
      default:
        return false;
    }
  }

  private activateTool(id: ToolId): void {
    this.editor.setTool(id);
    this.shell.classList.remove('sidebar-open');
  }

  private showToast(message: string): void {
    if (!message) return;
    const toast = this.must<HTMLElement>('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
  }
}
