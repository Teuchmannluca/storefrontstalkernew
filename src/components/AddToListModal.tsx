'use client';

import { useState, useEffect, Fragment } from 'react';
import { Transition, Dialog, Listbox } from '@headlessui/react';
import { XMarkIcon, CheckIcon, ChevronUpDownIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useAddToList } from '@/hooks/useAddToList';

interface AddToListItem {
  asin: string;
  product_name: string;
  product_image?: string;
  uk_price: number;
  source_marketplace: string;
  source_price_gbp: number;
  profit: number;
  roi: number;
  profit_margin: number;
  sales_per_month?: number;
  storefront_name?: string;
}

interface AddToListModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: AddToListItem[];
  onSuccess?: () => void;
}

export function AddToListModal({ isOpen, onClose, items, onSuccess }: AddToListModalProps) {
  const {
    asinLists,
    loadingAsinLists,
    addingToList,
    error,
    success,
    fetchAsinLists,
    addItemsToList,
    createListAndAddItems,
    clearMessages
  } = useAddToList();

  const [selectedList, setSelectedList] = useState<any>(null);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchAsinLists();
      clearMessages();
      setSelectedList(null);
      setShowCreateNew(false);
      setNewListName('');
      setNewListDescription('');
    }
  }, [isOpen, fetchAsinLists, clearMessages]);

  useEffect(() => {
    if (success && onSuccess) {
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    }
  }, [success, onSuccess, onClose]);

  const handleAddToList = async () => {
    if (!items.length) return;

    const itemsWithFrom = items.map(item => ({
      ...item,
      added_from: 'asin_checker' as const
    }));

    if (showCreateNew) {
      if (!newListName.trim()) {
        return;
      }
      await createListAndAddItems(
        newListName.trim(),
        newListDescription.trim() || null,
        itemsWithFrom
      );
    } else if (selectedList) {
      await addItemsToList(selectedList.id, itemsWithFrom);
    }
  };

  const handleClose = () => {
    clearMessages();
    onClose();
  };

  const isFormValid = showCreateNew ? newListName.trim().length > 0 : selectedList !== null;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Add to ASIN List
                  </Dialog.Title>
                  <button
                    onClick={handleClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-gray-600">
                    Adding {items.length} ASIN{items.length !== 1 ? 's' : ''} to your ASIN list
                  </p>
                  {items.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      {items.slice(0, 3).map((item, index) => (
                        <div key={item.asin} className="text-xs text-gray-500 truncate">
                          • {item.product_name}
                        </div>
                      ))}
                      {items.length > 3 && (
                        <div className="text-xs text-gray-500">
                          + {items.length - 3} more items...
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckIcon className="w-5 h-5 text-green-600" />
                      <p className="text-sm text-green-700">{success}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setShowCreateNew(false)}
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        !showCreateNew 
                          ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                          : 'text-gray-600 hover:text-gray-800 border border-gray-300'
                      }`}
                    >
                      Existing List
                    </button>
                    <button
                      onClick={() => setShowCreateNew(true)}
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1 ${
                        showCreateNew 
                          ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                          : 'text-gray-600 hover:text-gray-800 border border-gray-300'
                      }`}
                    >
                      <PlusIcon className="w-4 h-4" />
                      Create New
                    </button>
                  </div>

                  {!showCreateNew ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select List
                      </label>
                      {loadingAsinLists ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        </div>
                      ) : (
                        <Listbox value={selectedList} onChange={setSelectedList}>
                          <div className="relative">
                            <Listbox.Button className="relative w-full cursor-default rounded-lg bg-white py-2 pl-3 pr-10 text-left shadow-sm border border-gray-300 focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm">
                              <span className="block truncate">
                                {selectedList ? selectedList.name : 'Select a list...'}
                              </span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronUpDownIcon
                                  className="h-5 w-5 text-gray-400"
                                  aria-hidden="true"
                                />
                              </span>
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                                {asinLists.length === 0 ? (
                                  <div className="px-4 py-2 text-gray-500 text-center">
                                    No lists found. Create a new one!
                                  </div>
                                ) : (
                                  asinLists.map((list) => (
                                    <Listbox.Option
                                      key={list.id}
                                      className={({ active }) =>
                                        `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                          active ? 'bg-amber-100 text-amber-900' : 'text-gray-900'
                                        }`
                                      }
                                      value={list}
                                    >
                                      {({ selected }) => (
                                        <>
                                          <div>
                                            <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                              {list.name || list.id || 'Unnamed List'}
                                              {list.is_favorite && ' ⭐'}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                              {list.asins?.length || 0} ASINs • Created: {new Date(list.created_at).toLocaleDateString()}
                                            </span>
                                          </div>
                                          {selected ? (
                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-amber-600">
                                              <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                            </span>
                                          ) : null}
                                        </>
                                      )}
                                    </Listbox.Option>
                                  ))
                                )}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          List Name *
                        </label>
                        <input
                          type="text"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          placeholder="Enter list name..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          maxLength={255}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description (optional)
                        </label>
                        <textarea
                          value={newListDescription}
                          onChange={(e) => setNewListDescription(e.target.value)}
                          placeholder="Enter description..."
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={addingToList}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddToList}
                    disabled={!isFormValid || addingToList || items.length === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {addingToList && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    )}
                    {showCreateNew ? 'Create & Add' : 'Add to List'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}