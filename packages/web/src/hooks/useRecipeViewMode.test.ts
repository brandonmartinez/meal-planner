import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRecipeViewMode } from './useRecipeViewMode';

describe('useRecipeViewMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to List when nothing is persisted', () => {
    const { result } = renderHook(() => useRecipeViewMode());
    expect(result.current.viewMode).toBe('list');
  });

  it('reads a persisted mode on mount', () => {
    window.localStorage.setItem('recipeViewMode', 'grid');
    const { result } = renderHook(() => useRecipeViewMode());
    expect(result.current.viewMode).toBe('grid');
  });

  it('falls back to List for a malformed persisted value', () => {
    window.localStorage.setItem('recipeViewMode', 'sideways');
    const { result } = renderHook(() => useRecipeViewMode());
    expect(result.current.viewMode).toBe('list');
  });

  it('persists the selected mode to localStorage', () => {
    const { result } = renderHook(() => useRecipeViewMode());

    act(() => result.current.setViewMode('grid'));

    expect(result.current.viewMode).toBe('grid');
    expect(window.localStorage.getItem('recipeViewMode')).toBe('grid');

    act(() => result.current.setViewMode('list'));

    expect(result.current.viewMode).toBe('list');
    expect(window.localStorage.getItem('recipeViewMode')).toBe('list');
  });
});
