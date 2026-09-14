'use client';
import { useState, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { LegalWorkspaceMode } from '../page';

export function useMachotesNavigation(defaultTab: LegalWorkspaceMode = 'universal') {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as LegalWorkspaceMode) || defaultTab;
  const [activeTab, setActiveTab] = useState<LegalWorkspaceMode>(initialTab);

  const switchTab = useCallback((mode: LegalWorkspaceMode) => {
    setActiveTab(mode);
    try {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', mode);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    } catch {}
  }, [router, pathname, searchParams]);

  return { activeTab, switchTab, setActiveTab };
}
