import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface UseBlacklistReturn {
  blacklistAsin: (asin: string, reason?: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  success: string | null;
  clearMessages: () => void;
}

export function useBlacklist(): UseBlacklistReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const blacklistAsin = async (asin: string, reason?: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Authentication required');
        return false;
      }

      const response = await fetch('/api/blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          asin: asin.toUpperCase(),
          reason: reason || 'Blacklisted from deals view'
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`ASIN ${asin} blacklisted successfully`);
        return true;
      } else {
        if (response.status === 409) {
          setError('ASIN is already blacklisted');
        } else {
          setError(data.error || 'Failed to blacklist ASIN');
        }
        return false;
      }
    } catch (err) {
      console.error('Error blacklisting ASIN:', err);
      setError('Network error. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    blacklistAsin,
    isLoading,
    error,
    success,
    clearMessages
  };
}