'use client';

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { supabase } from '@/lib/supabase';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  storefrontId: string;
  onProductAdded: () => void;
}

export default function AddProductModal({ isOpen, onClose, storefrontId, onProductAdded }: AddProductModalProps) {
  const [asin, setAsin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!asin.trim()) {
      setError('Please enter an ASIN');
      return;
    }

    // Validate ASIN format
    if (!/^[A-Z0-9]{10}$/.test(asin.trim())) {
      setError('Invalid ASIN format. Must be 10 characters (letters and numbers)');
      return;
    }

    setLoading(true);

    try {
      
      // Add product to database
      const { error: insertError } = await supabase
        .from('products')
        .insert({
          storefront_id: storefrontId,
          asin: asin.trim(),
          sync_status: 'pending'
        });

      if (insertError) {
        if (insertError.code === '23505') { // Unique constraint violation
          setError('This product is already added to this storefront');
        } else {
          setError('Failed to add product');
        }
        return;
      }

      // Trigger sync for this specific ASIN
      if (process.env.NEXT_PUBLIC_SYNC_ENABLED === 'true') {
        fetch('/api/sync/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SYNC_TOKEN}`
          },
          body: JSON.stringify({ asin: asin.trim() })
        }).catch(err => console.error('Background sync failed:', err));
      }

      // Success
      setAsin('');
      onProductAdded();
      onClose();
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                
                <div>
                  <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                    Add Product to Storefront
                  </Dialog.Title>
                  
                  <form onSubmit={handleSubmit} className="mt-4">
                    <div>
                      <label htmlFor="asin" className="block text-sm font-medium text-gray-700">
                        Product ASIN
                      </label>
                      <input
                        type="text"
                        id="asin"
                        value={asin}
                        onChange={(e) => setAsin(e.target.value.toUpperCase())}
                        placeholder="e.g., B08N5WRWNW"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        disabled={loading}
                      />
                      <p className="mt-1 text-sm text-gray-500">
                        Enter the 10-character Amazon product identifier
                      </p>
                    </div>

                    {error && (
                      <div className="mt-3 text-sm text-red-600">
                        {error}
                      </div>
                    )}

                    <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                      <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex w-full justify-center rounded-md bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:from-violet-600 hover:to-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Adding...' : 'Add Product'}
                      </button>
                      <button
                        type="button"
                        className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
                        onClick={onClose}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}