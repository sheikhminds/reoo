import type { BlendMode } from './core/document';
import type { SelectionShape } from './core/selection';

export type ToolId =
  | 'move'
  | 'select'
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'gradient'
  | 'shape'
  | 'text'
  | 'eyedropper'
  | 'crop'
  | 'hand'
  | 'zoom';

export interface BrushOptions {
  size: number;
  hardness: number;
  opacity: number;
}

export interface ToolOptions {
  brush: BrushOptions;
  eraser: BrushOptions;
  fill: { tolerance: number; contiguous: boolean };
  gradient: { type: 'linear' | 'radial'; mode: 'fg-bg' | 'fg-transparent'; reverse: boolean };
  shape: {
    kind: 'rect' | 'ellipse' | 'line';
    fill: boolean;
    stroke: boolean;
    strokeWidth: number;
    radius: number;
  };
  text: {
    fontFamily: string;
    fontSize: number;
    bold: boolean;
    italic: boolean;
    align: 'left' | 'center' | 'right';
  };
  select: { shape: 'rect' | 'ellipse' | 'lasso' };
  move: { autoSelect: boolean };
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  brush: { size: 24, hardness: 80, opacity: 100 },
  eraser: { size: 32, hardness: 70, opacity: 100 },
  fill: { tolerance: 24, contiguous: true },
  gradient: { type: 'linear', mode: 'fg-bg', reverse: false },
  shape: { kind: 'rect', fill: true, stroke: false, strokeWidth: 4, radius: 0 },
  text: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 48,
    bold: false,
    italic: false,
    align: 'left',
  },
  select: { shape: 'rect' },
  move: { autoSelect: false },
};

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface PointerInfo {
  /** Document coordinates. */
  x: number;
  y: number;
  /** Screen coordinates relative to the canvas element. */
  screenX: number;
  screenY: number;
  pressure: number;
  /** True when the event came from a stylus. */
  pen: boolean;
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
}

export interface Tool {
  readonly id: ToolId;
  cursor(): string;
  down(p: PointerInfo): void;
  move(p: PointerInfo): void;
  up(p: PointerInfo): void;
  cancel?(): void;
  /** Draw a preview in screen space. */
  drawOverlay?(ctx: CanvasRenderingContext2D): void;
  key?(e: KeyboardEvent): boolean;
}

export type { BlendMode, SelectionShape };
