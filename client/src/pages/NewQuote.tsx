import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Trash2, Search } from 'lucide-react';

interface Customer {
  id: string;
  company_name: string;
  contact_name?: string;
  email?: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  base_price: number;
  category?: string;
  unit: string;
}

interface LineItem {
  product_id: string;
  product?: Product;
  quantity: number;
  unit_price: number;
  discount_percent: number;
}

export default function NewQuote() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [items, setItems] = useState<LineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersRes, productsRes] = await Promise.all([
          api.get('/customers'),
          api.get('/products?active=true'),
        ]);

        setCustomers(customersRes.data.data || []);
        setProducts(productsRes.data.data || []);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const addItem = (product: Product) => {
    setItems([
      ...items,
      {
        product_id: product.id,
        product,
        quantity: 1,
        unit_price: product.base_price,
        discount_percent: 0,
      },
    ]);
    setShowProductSearch(false);
    setProductSearch('');
  };

  const updateItem = (index: number, updates: Partial<LineItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateLineTotal = (item: LineItem) => {
    const gross = item.quantity * item.unit_price;
    const discount = gross * (item.discount_percent / 100);
    return gross - discount;
  };

  const calculateTotals = () => {
    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    );
    const discountTotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price * (item.discount_percent / 100),
      0
    );
    const afterDiscount = subtotal - discountTotal;
    const taxAmount = afterDiscount * (taxRate / 100);
    const total = afterDiscount + taxAmount;

    return { subtotal, discountTotal, taxAmount, total };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer) {
      alert('Please select a customer');
      return;
    }

    if (items.length === 0) {
      alert('Please add at least one item');
      return;
    }

    setIsSaving(true);

    try {
      // Create quote
      const quoteRes = await api.post('/quotes', {
        customer_id: selectedCustomer,
        title: title || undefined,
        notes: notes || undefined,
        tax_rate: taxRate,
      });

      const quoteId = quoteRes.data.data.id;

      // Add items
      for (const item of items) {
        await api.post(`/quotes/${quoteId}/items`, {
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent,
        });
      }

      navigate(`/quotes/${quoteId}`);
    } catch (error: any) {
      console.error('Failed to create quote:', error);
      alert(error.response?.data?.error || 'Failed to create quote');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase())
  );

  const totals = calculateTotals();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
      {/* Quote Details */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quote Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer *
            </label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="input"
              required
            >
              <option value="">Select a customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.company_name}
                  {customer.contact_name && ` - ${customer.contact_name}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quote Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="Optional title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tax Rate (%)
            </label>
            <input
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
              className="input"
              min="0"
              max="100"
              step="0.01"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input"
              rows={2}
              placeholder="Internal notes"
            />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProductSearch(!showProductSearch)}
              className="btn btn-primary flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Add Product</span>
            </button>

            {showProductSearch && (
              <div className="absolute right-0 top-full mt-2 w-96 bg-white border rounded-lg shadow-lg z-10">
                <div className="p-3 border-b">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="input pl-9 text-sm"
                      placeholder="Search products..."
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addItem(product)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0"
                    >
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">
                        {product.sku} - {formatCurrency(product.base_price)} / {product.unit}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No items added yet</p>
            <p className="text-sm mt-1">Click "Add Product" to start building your quote</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="table-header py-3 px-4">Product</th>
                  <th className="table-header py-3 px-4 w-24">Qty</th>
                  <th className="table-header py-3 px-4 w-32">Unit Price</th>
                  <th className="table-header py-3 px-4 w-24">Discount %</th>
                  <th className="table-header py-3 px-4 w-32">Line Total</th>
                  <th className="table-header py-3 px-4 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{item.product?.name}</p>
                      <p className="text-sm text-gray-500">{item.product?.sku}</p>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(index, { quantity: parseFloat(e.target.value) || 0 })
                        }
                        className="input text-sm"
                        min="1"
                        step="1"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) =>
                          updateItem(index, { unit_price: parseFloat(e.target.value) || 0 })
                        }
                        className="input text-sm"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={item.discount_percent}
                        onChange={(e) =>
                          updateItem(index, {
                            discount_percent: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="input text-sm"
                        min="0"
                        max="100"
                        step="0.1"
                      />
                    </td>
                    <td className="py-3 px-4 font-medium">
                      {formatCurrency(calculateLineTotal(item))}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        {items.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                {totals.discountTotal > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Discount:</span>
                    <span className="text-red-600">-{formatCurrency(totals.discountTotal)}</span>
                  </div>
                )}
                {taxRate > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Tax ({taxRate}%):</span>
                    <span>{formatCurrency(totals.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end space-x-4">
        <button
          type="button"
          onClick={() => navigate('/quotes')}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button type="submit" disabled={isSaving} className="btn btn-primary">
          {isSaving ? 'Creating...' : 'Create Quote'}
        </button>
      </div>
    </form>
  );
}
