'use client';
import { useState, useEffect, useCallback } from 'react';
import { LawyerProfile, DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';

export function useLawyerProfile() {
  const [profile, setProfile] = useState<LawyerProfile>({ ...DEFAULT_LAWYER_PROFILE });
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workspace/lawyer-profile');
      const data = await res.json();
      if (data?.ok && data.profile) {
        setProfile({ ...DEFAULT_LAWYER_PROFILE, ...data.profile });
        setIsDefault(Boolean(data.isDefault));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  return { profile, isDefault, loading, refresh, setProfile, setIsDefault };
}
