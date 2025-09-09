import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface AsinList {
  id: string;
  name: string;
  description: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  asins: string[];
}

interface AddToListItem {
  asin: string;
  product_name?: string;
  product_image?: string;
  uk_price?: number;
  source_marketplace?: string;
  source_price_gbp?: number;
  profit?: number;
  roi?: number;
  profit_margin?: number;
  sales_per_month?: number;
  storefront_name?: string;
  added_from?: 'recent_scans' | 'asin_checker';
}

interface UseAddToListReturn {
  asinLists: AsinList[];
  loadingAsinLists: boolean;
  addingToList: boolean;
  error: string | null;
  success: string | null;
  fetchAsinLists: () => Promise<void>;
  addItemsToList: (listId: string, items: AddToListItem[]) => Promise<boolean>;
  createListAndAddItems: (listName: string, description: string | null, items: AddToListItem[]) => Promise<boolean>;
  clearMessages: () => void;
}

export function useAddToList(): UseAddToListReturn {
  const [asinLists, setAsinLists] = useState<AsinList[]>([]);
  const [loadingAsinLists, setLoadingAsinLists] = useState(false);
  const [addingToList, setAddingToList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const fetchAsinLists = useCallback(async (): Promise<void> => {
    setLoadingAsinLists(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Authentication required');
        return;
      }

      const response = await fetch('/api/asin-lists', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setAsinLists(data.lists || []);
      } else {
        setError(data.error || 'Failed to fetch ASIN lists');
      }
    } catch (err) {
      console.error('Error fetching ASIN lists:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoadingAsinLists(false);
    }
  }, []);

  const addItemsToList = useCallback(async (listId: string, items: AddToListItem[]): Promise<boolean> => {
    setAddingToList(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Authentication required');
        return false;
      }

      // Extract ASINs from items
      const asins = items.map(item => item.asin);

      const response = await fetch('/api/asin-lists/add-asins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          listIds: [listId],
          asins
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || `Successfully added ${data.totalAdded || asins.length} ASIN(s) to list`);
        return true;
      } else {
        setError(data.error || 'Failed to add ASINs to list');
        return false;
      }
    } catch (err) {
      console.error('Error adding ASINs to list:', err);
      setError('Network error. Please try again.');
      return false;
    } finally {
      setAddingToList(false);
    }
  }, []);

  const createListAndAddItems = useCallback(async (listName: string, description: string | null, items: AddToListItem[]): Promise<boolean> => {
    setAddingToList(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Authentication required');
        return false;
      }

      // Extract ASINs from items
      const asins = items.map(item => item.asin);

      const response = await fetch('/api/asin-lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: listName,
          description,
          asins
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`Created new list "${listName}" and added ${asins.length} ASIN(s)`);
        // Refresh the ASIN lists to include the new list
        await fetchAsinLists();
        return true;
      } else {
        setError(data.error || 'Failed to create list and add ASINs');
        return false;
      }
    } catch (err) {
      console.error('Error creating list and adding ASINs:', err);
      setError('Network error. Please try again.');
      return false;
    } finally {
      setAddingToList(false);
    }
  }, [fetchAsinLists]);

  return {
    asinLists,
    loadingAsinLists,
    addingToList,
    error,
    success,
    fetchAsinLists,
    addItemsToList,
    createListAndAddItems,
    clearMessages
  };
}