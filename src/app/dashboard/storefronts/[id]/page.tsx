'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import ProductsList from '@/components/ProductsList';
import AddProductModal from '@/components/AddProductModal';
import Sidebar from '@/components/Sidebar';
import AddStorefrontModal from '@/components/AddStorefrontModal';

interface Storefront {
  id: string;
  name: string;
  seller_id: string;
  storefront_url: string;
  created_at: string;
}

export default function StorefrontDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storefrontId = params?.id as string;
  
  const [storefront, setStorefront] = useState<Storefront | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [showAddStorefrontModal, setShowAddStorefrontModal] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // Fetch storefront details
  const fetchStorefront = async () => {
    try {
      const { data, error } = await supabase
        .from('storefronts')
        .select('*')
        .eq('id', storefrontId)
        .single();

      if (error) throw error;
      setStorefront(data);

      // Get product count
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('storefront_id', storefrontId);
      
      setProductCount(count || 0);
    } catch (error) {
      console.error('Error fetching storefront:', error);
      router.push('/dashboard/storefronts');
    } finally {
      setLoading(false);
    }
  };

  // Delete storefront
  const deleteStorefront = async () => {
    if (!confirm('Are you sure you want to delete this storefront? All associated products will also be deleted.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('storefronts')
        .delete()
        .eq('id', storefrontId);

      if (error) throw error;
      router.push('/dashboard/storefronts');
    } catch (error) {
      console.error('Error deleting storefront:', error);
      alert('Failed to delete storefront');
    }
  };

  useEffect(() => {
    fetchStorefront();
  }, [storefrontId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!storefront) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Storefront not found</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar onSignOut={handleSignOut} onAddStorefront={() => setShowAddStorefrontModal(true)} />
      
      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => router.push('/dashboard/storefronts')}
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Back to Storefronts
            </button>

        <div className="bg-white shadow rounded-lg px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{storefront.name}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Seller ID: {storefront.seller_id}
              </p>
              <a
                href={storefront.storefront_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:text-indigo-500 mt-1 inline-block"
              >
                View on Amazon →
              </a>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowAddProduct(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                Add Product
              </button>
              
              <button
                onClick={deleteStorefront}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <TrashIcon className="-ml-1 mr-2 h-5 w-5" />
                Delete Storefront
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-2xl font-semibold text-gray-900">{productCount}</p>
              <p className="text-sm text-gray-500">Products</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-sm text-gray-500">Created</p>
              <p className="text-sm text-gray-900">
                {new Date(storefront.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-sm text-gray-500">Status</p>
              <p className="text-sm font-medium text-green-600">Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* Products Section */}
      <div className="bg-white shadow rounded-lg px-6 py-6">
        <ProductsList storefrontId={storefrontId} />
      </div>

          {/* Add Product Modal */}
          <AddProductModal
            isOpen={showAddProduct}
            onClose={() => setShowAddProduct(false)}
            storefrontId={storefrontId}
            onProductAdded={() => {
              fetchStorefront();
              // The ProductsList component will auto-refresh
            }}
          />
        </div>
      </div>
      
      {/* Add Storefront Modal */}
      <AddStorefrontModal
        isOpen={showAddStorefrontModal}
        onClose={() => setShowAddStorefrontModal(false)}
        onSuccess={() => {
          setShowAddStorefrontModal(false);
        }}
      />
    </div>
  );
}