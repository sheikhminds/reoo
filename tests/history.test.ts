import { describe, expect, it } from 'vitest';
import { History } from '../src/core/history';

describe('History', () => {
  it('starts empty', () => {
    const history = new History<number>();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo(1)).toBeNull();
    expect(history.redo(1)).toBeNull();
  });

  it('undoes and redoes snapshots', () => {
    const history = new History<string>();
    history.push('a');
    history.push('b');
    expect(history.canUndo).toBe(true);
    expect(history.undo('c')).toBe('b');
    expect(history.undo('b')).toBe('a');
    expect(history.canRedo).toBe(true);
    expect(history.redo('a')).toBe('b');
    expect(history.redo('b')).toBe('c');
  });

  it('clears redo when new work is pushed', () => {
    const history = new History<string>();
    history.push('a');
    history.undo('b');
    expect(history.canRedo).toBe(true);
    history.push('x');
    expect(history.canRedo).toBe(false);
  });

  it('bounds the stack', () => {
    const history = new History<number>(3);
    for (let i = 0; i < 10; i++) history.push(i);
    expect(history.undoDepth).toBe(3);
    expect(history.undo(100)).toBe(9);
    expect(history.undo(9)).toBe(8);
    expect(history.undo(8)).toBe(7);
    expect(history.undo(7)).toBeNull();
  });
});
