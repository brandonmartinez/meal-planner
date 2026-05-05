import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Family } from '@meal-planner/shared';

const STORAGE_KEY = 'meal-planner-selected-family';

export function useFamily() {
  const { user } = useAuth();
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });

  const memberships = user?.memberships ?? [];

  // Resolve the active familyId
  const familyId = (() => {
    if (selectedFamilyId && memberships.some(m => m.familyId === selectedFamilyId)) {
      return selectedFamilyId;
    }
    return memberships[0]?.familyId ?? null;
  })();

  const family: Family | null = memberships.find(m => m.familyId === familyId)?.family ?? null;

  const families: Family[] = memberships.map(m => m.family);

  const switchFamily = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setSelectedFamilyId(id);
  }, []);

  useEffect(() => {
    if (familyId && familyId !== selectedFamilyId) {
      localStorage.setItem(STORAGE_KEY, familyId);
      setSelectedFamilyId(familyId);
    }
  }, [familyId, selectedFamilyId]);

  return { familyId, family, families, switchFamily, hasFamilies: families.length > 0 };
}
