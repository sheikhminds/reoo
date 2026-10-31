/**
 * Snapshot-based undo history with a bounded number of steps.
 * Each tool decides when a snapshot is taken (usually on pointer down) so a
 * whole brush stroke becomes a single undo step.
 */

export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private readonly limit: number;

  constructor(limit = 20) {
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  /** Record a state that existed *before* the next change. */
  push(before: T): void {
    this.undoStack.push(before);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Returns the previous state, storing `current` for redo. */
  undo(current: T): T | null {
    const previous = this.undoStack.pop();
    if (previous === undefined) return null;
    this.redoStack.push(current);
    return previous;
  }

  /** Returns the next state, storing `current` for undo. */
  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
