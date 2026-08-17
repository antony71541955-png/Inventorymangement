import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Check, X, AlertCircle, Edit, Calendar, Package } from 'lucide-react';
import { API_URL, useAuth } from '../App';

interface Customer {
  id: number;
  customer_name: string;
}

interface InventoryLocation {
  warehouse: string;
  bin_location: string;
  quantity: number;
  batch_no: string;
  expiry: string;
}

interface InventoryItem {
  id: number;
  part_number: string;
  item_name: string;
  total_quantity: number;
  locations?: InventoryLocation[];
}

interface PicklistData {
  id: number;
  customer_id: number;
  customer_name: string;
  status: string;
  created_at: string;
}

type TabMode = 'CREATE' | 'MANAGE';

export default function Picklist() {
  const { token } = useAuth();
  
  const [activeTab, setActiveTab] = useState<TabMode>('CREATE');
  
  // Picklists list
  const [picklists, setPicklists] = useState<PicklistData[]>([]);
  const [loadingPicklists, setLoadingPicklists] = useState(false);
  const [editingPicklistId, setEditingPicklistId] = useState<number | null>(null);

  // Customers State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  // Inventory Search State
  const [inventorySearch, setInventorySearch] = useState('');
  const [searchResults, setSearchResults] = useState<InventoryItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Selected Inventories State
  const [selectedInventories, setSelectedInventories] = useState<InventoryItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  
  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomers();
    searchInventories('');
  }, []);

  useEffect(() => {
    if (activeTab === 'MANAGE' && !editingPicklistId) {
      fetchPicklists();
    }
  }, [activeTab, editingPicklistId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      searchInventories(inventorySearch);
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [inventorySearch]);

  const fetchPicklists = async () => {
    setLoadingPicklists(true);
    try {
      const res = await fetch(`${API_URL}/api/picklists`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPicklists(data);
      }
    } catch (err) {
      console.error("Failed to fetch picklists", err);
    } finally {
      setLoadingPicklists(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error("Failed to fetch customers", err);
    }
  };

  const searchInventories = async (term: string) => {
    setIsSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/inventory?search=${encodeURIComponent(term)}&limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.items || []);
      }
    } catch (err) {
      console.error("Failed to search inventories", err);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchInventoryLocations = async (part_number: string) => {
    try {
      const res = await fetch(`${API_URL}/api/inventory/${encodeURIComponent(part_number)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.locations || [];
      }
    } catch (err) {
      console.error("Failed to fetch locations", err);
    }
    return [];
  };

  const handleSelectInventory = async (item: InventoryItem) => {
    if (selectedInventories.find(i => i.part_number === item.part_number)) return;
    const locations = await fetchInventoryLocations(item.part_number);
    const itemWithLocations = { ...item, locations };
    setSelectedInventories(prev => [...prev, itemWithLocations]);
  };

  const handleRemoveInventory = (part_number: string) => {
    setSelectedInventories(prev => prev.filter(i => i.part_number !== part_number));
    const newQuantities = { ...quantities };
    Object.keys(newQuantities).forEach(key => {
      if (key.startsWith(`${part_number}|`)) {
        delete newQuantities[key];
      }
    });
    setQuantities(newQuantities);
  };

  const handleQuantityChange = (part_number: string, warehouse: string, bin_location: string, value: string, max: number) => {
    let val = parseInt(value, 10);
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;
    if (val > max) val = max;
    
    const key = `${part_number}|${warehouse}|${bin_location}`;
    setQuantities(prev => ({ ...prev, [key]: val }));
  };

  const getInventoryTotal = (part_number: string) => {
    return Object.entries(quantities)
      .filter(([key]) => key.startsWith(`${part_number}|`))
      .reduce((sum, [_, qty]) => sum + qty, 0);
  };

  const getOverallTotal = () => {
    return Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  };

  const filteredCustomers = customers.filter(c => 
    c.customer_name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const resetForm = () => {
    setSelectedCustomer(null);
    setSelectedInventories([]);
    setQuantities({});
    setCustomerSearch('');
    setSubmitError(null);
    setSubmitSuccess(null);
    setEditingPicklistId(null);
  };

  const handleEditPicklist = async (picklist: PicklistData) => {
    resetForm();
    setActiveTab('CREATE');
    setEditingPicklistId(picklist.id);
    
    // Set Customer
    const cust = customers.find(c => c.id === picklist.customer_id);
    if (cust) setSelectedCustomer(cust);
    else setSelectedCustomer({ id: picklist.customer_id, customer_name: picklist.customer_name });
    
    try {
      const res = await fetch(`${API_URL}/api/picklists/${picklist.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        
        // Group items by part_number
        const itemsMap = new Map<string, InventoryItem>();
        const qtyMap: Record<string, number> = {};
        
        for (const pi of data.items) {
          if (!itemsMap.has(pi.part_number)) {
            itemsMap.set(pi.part_number, {
              id: pi.item_id, // Note: this is pi.id, but good enough for unique key
              part_number: pi.part_number,
              item_name: pi.item_name,
              total_quantity: 0,
              locations: []
            });
          }
          const key = `${pi.part_number}|${pi.warehouse}|${pi.bin_location}`;
          qtyMap[key] = pi.required_quantity;
        }
        
        // Now fetch full locations for these items
        const newSelectedInventories: InventoryItem[] = [];
        for (const [part_number, itemData] of Array.from(itemsMap.entries())) {
          const locations = await fetchInventoryLocations(part_number);
          newSelectedInventories.push({
            ...itemData,
            locations
          });
        }
        
        setSelectedInventories(newSelectedInventories);
        setQuantities(qtyMap);
      }
    } catch (err) {
      console.error("Failed to load picklist details", err);
      setSubmitError("Failed to load picklist details.");
    }
  };

  const handleDeletePicklist = async (id: number) => {
    if (!confirm("Are you sure you want to delete this picklist?")) return;
    
    try {
      const res = await fetch(`${API_URL}/api/picklists/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchPicklists();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete picklist");
      }
    } catch (err) {
      alert("Failed to delete picklist");
    }
  };

  const handleSubmit = async () => {
    if (!selectedCustomer) {
      setSubmitError("Please select a customer.");
      return;
    }
    
    const itemsPayload: any[] = [];
    selectedInventories.forEach(inv => {
      inv.locations?.forEach(loc => {
        const key = `${inv.part_number}|${loc.warehouse}|${loc.bin_location}`;
        const qty = quantities[key] || 0;
        if (qty > 0) {
          itemsPayload.push({
            part_number: inv.part_number,
            warehouse: loc.warehouse,
            bin_location: loc.bin_location,
            required_quantity: qty
          });
        }
      });
    });

    if (itemsPayload.length === 0) {
      setSubmitError("Please enter required quantities for at least one inventory item.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const url = editingPicklistId 
      ? `${API_URL}/api/picklists/${editingPicklistId}` 
      : `${API_URL}/api/picklists`;
    const method = editingPicklistId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          items: itemsPayload
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save picklist");
      }
      
      setSubmitSuccess(editingPicklistId ? "Picklist updated successfully!" : "Picklist created successfully!");
      if (editingPicklistId) {
         setTimeout(() => {
           setActiveTab('MANAGE');
           resetForm();
         }, 1500);
      } else {
        resetForm();
      }
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Picklists</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage and create picklists for customers.</p>
        </div>
      </div>

      <div className="flex bg-zinc-100 p-1 rounded-lg w-max">
        <button
          onClick={() => { setActiveTab('CREATE'); if(!editingPicklistId) resetForm(); }}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
            activeTab === 'CREATE' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          {editingPicklistId ? 'Edit Picklist' : 'Create Picklist'}
        </button>
        <button
          onClick={() => { setActiveTab('MANAGE'); resetForm(); }}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
            activeTab === 'MANAGE' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Manage Picklists
        </button>
      </div>

      {activeTab === 'MANAGE' && (
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
          <div className="p-0">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-500 bg-zinc-50 uppercase border-b border-zinc-100">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date Created</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingPicklists ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">Loading picklists...</td>
                  </tr>
                ) : picklists.length > 0 ? (
                  picklists.map(pl => (
                    <tr key={pl.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50">
                      <td className="px-6 py-4 font-medium text-zinc-900">#{pl.id}</td>
                      <td className="px-6 py-4 text-zinc-700">{pl.customer_name}</td>
                      <td className="px-6 py-4">
                        <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-full">
                          {pl.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-500 flex items-center gap-1.5">
                        <Calendar size={14} />
                        {new Date(pl.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleEditPicklist(pl)}
                          className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-1.5 rounded mr-2"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeletePicklist(pl.id)}
                          className="text-red-600 hover:text-red-900 bg-red-50 p-1.5 rounded"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-zinc-500 flex flex-col items-center justify-center">
                      <Package size={48} className="text-zinc-300 mb-3" />
                      <p>No picklists found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'CREATE' && (
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-800">
              {editingPicklistId ? `Editing Picklist #${editingPicklistId}` : '1. Select Customer'}
            </h2>
            {editingPicklistId && (
              <button 
                onClick={() => { setActiveTab('MANAGE'); resetForm(); }}
                className="text-zinc-400 hover:text-zinc-600 p-1"
              >
                <X size={20} />
              </button>
            )}
          </div>
          <div className="p-6 border-b border-zinc-100">
            <div className="relative max-w-md">
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <div className="flex items-center gap-2 text-indigo-700 font-medium">
                    <Check size={18} />
                    {selectedCustomer.customer_name}
                  </div>
                  {!editingPicklistId && (
                    <button 
                      onClick={() => setSelectedCustomer(null)}
                      className="text-indigo-400 hover:text-indigo-600 p-1"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search customer..."
                    className="w-full pl-10 pr-4 py-2.5 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                  />
                  {showCustomerDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map(c => (
                          <div 
                            key={c.id} 
                            className="px-4 py-2.5 hover:bg-zinc-50 cursor-pointer text-sm text-zinc-700"
                            onClick={() => {
                              setSelectedCustomer(c);
                              setShowCustomerDropdown(false);
                              setCustomerSearch('');
                            }}
                          >
                            {c.customer_name}
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-zinc-500">No customers found.</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="p-6 bg-zinc-50/50">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4">2. Select Inventories</h2>
            
            <div className="relative max-w-xl mb-6">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search inventory by part number or name..."
                  className="w-full pl-10 pr-4 py-2.5 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                />
              </div>
              
              <div className="mt-2 bg-white border border-zinc-200 rounded-lg shadow-sm max-h-64 overflow-y-auto">
                {isSearching ? (
                  <div className="px-4 py-3 text-sm text-zinc-500">Searching...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map(item => (
                    <div 
                      key={item.id} 
                      className="px-4 py-3 hover:bg-zinc-50 cursor-pointer border-b border-zinc-100 last:border-0 flex items-center justify-between group"
                      onClick={() => handleSelectInventory(item)}
                    >
                      <div>
                        <div className="text-sm font-medium text-zinc-800">{item.part_number}</div>
                        <div className="text-xs text-zinc-500">{item.item_name}</div>
                      </div>
                      <button className="text-indigo-600 bg-indigo-50 px-2 py-1 rounded text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Select
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-zinc-500">No inventory found.</div>
                )}
              </div>
            </div>

            {selectedInventories.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Selected Inventories</h3>
                
                {selectedInventories.map(item => (
                  <div key={item.id} className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-zinc-900 flex items-center gap-2">
                          {item.part_number}
                          <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-medium">
                            Total Qty: {getInventoryTotal(item.part_number)}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500">{item.item_name}</div>
                      </div>
                      <button 
                        onClick={() => handleRemoveInventory(item.part_number)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                        title="Remove Inventory"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <div className="p-0">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-zinc-500 bg-zinc-50 uppercase border-b border-zinc-100">
                          <tr>
                            <th className="px-4 py-3">Warehouse</th>
                            <th className="px-4 py-3">Bin</th>
                            <th className="px-4 py-3">Available</th>
                            <th className="px-4 py-3 w-40">Required Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.locations && item.locations.length > 0 ? (
                            item.locations.map((loc, idx) => {
                              const key = `${item.part_number}|${loc.warehouse}|${loc.bin_location}`;
                              const val = quantities[key] === 0 ? '' : (quantities[key] || '');
                              return (
                                <tr key={idx} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50 transition-colors">
                                  <td className="px-4 py-3 font-medium text-zinc-700">{loc.warehouse}</td>
                                  <td className="px-4 py-3 text-zinc-600">{loc.bin_location}</td>
                                  <td className="px-4 py-3 text-emerald-600 font-semibold">{loc.quantity}</td>
                                  <td className="px-4 py-3">
                                    <input 
                                      type="number" 
                                      min="0"
                                      max={loc.quantity}
                                      value={val}
                                      onChange={(e) => handleQuantityChange(item.part_number, loc.warehouse, loc.bin_location, e.target.value, loc.quantity)}
                                      className="w-full px-3 py-1.5 border border-zinc-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      placeholder="0"
                                    />
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="px-4 py-4 text-center text-zinc-500 text-sm">
                                No stock available in any bins.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="p-6 bg-white border-t border-zinc-100 flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-600">
              Overall Selected Quantity: <span className="text-lg font-bold text-indigo-600 ml-1">{getOverallTotal()}</span>
            </div>
            
            <div className="flex items-center gap-4">
              {submitError && (
                <div className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded-md">
                  <AlertCircle size={14} />
                  {submitError}
                </div>
              )}
              {submitSuccess && (
                <div className="flex items-center gap-1.5 text-sm text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-md">
                  <Check size={14} />
                  {submitSuccess}
                </div>
              )}
              
              <button 
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedCustomer || selectedInventories.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
              >
                {isSubmitting ? 'Saving...' : (editingPicklistId ? 'Save Changes' : 'Submit Picklist')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
