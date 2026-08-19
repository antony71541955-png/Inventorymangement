import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Check, X, FileText, Download, CheckCircle, Package, ArrowRight } from 'lucide-react';
import { API_URL, useAuth } from '../App';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

const getBase64ImageFromURL = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (error) => reject(error);
    img.src = url;
  });
};

interface PicklistData {
  id: number;
  customer_id: number;
  customer_name: string;
  status: string;
  created_at: string;
}

interface TransferRequest {
  id: number;
  customer_id: number;
  customer_name: string;
  status: string;
  created_at: string;
}

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

interface SelectedItem {
  id: string; // unique internal id
  part_number: string;
  item_name: string;
  category: string;
  quantity: number;
  isLocked: boolean; // if imported from approved request
  locations: InventoryLocation[]; // available DIS locations
  
  // User selections
  selectedLocationIndex: number;
}

type TabMode = 'LIST' | 'CREATE' | 'APPROVED';

export default function Picklist() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<TabMode>('LIST');
  
  // Data lists
  const [picklists, setPicklists] = useState<PicklistData[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<TransferRequest[]>([]);
  
  // Form State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  const [inventorySearch, setInventorySearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  useEffect(() => {
    fetchCustomers();
    if (activeTab === 'LIST') fetchPicklists();
    if (activeTab === 'APPROVED') fetchApprovedRequests();
  }, [activeTab]);

  const fetchPicklists = async () => {
    try {
      const res = await fetch(`${API_URL}/api/dispatch_picklists`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setPicklists(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchApprovedRequests = async () => {
    try {
      const res = await fetch(`${API_URL}/api/picklists`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setApprovedRequests(data.filter((d: any) => d.status === 'Approved'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setCustomers(await res.json());
    } catch (e) {
      console.error(e);
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
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const delay = setTimeout(() => searchInventories(inventorySearch), 300);
    return () => clearTimeout(delay);
  }, [inventorySearch]);

  const handleSelectInventory = async (item: any) => {
    try {
      const res = await fetch(`${API_URL}/api/inventory/${encodeURIComponent(item.part_number)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const disLocations = (data.locations || []).filter((l: any) => l.warehouse === 'DIS');
        
        setSelectedItems(prev => [...prev, {
          id: Math.random().toString(36).substring(7),
          part_number: item.part_number,
          item_name: item.item_name,
          category: item.category || '',
          quantity: 1,
          isLocked: false,
          locations: disLocations,
          selectedLocationIndex: 0
        }]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportApprovedRequest = async (request: TransferRequest) => {
    try {
      // Find customer
      const cust = customers.find(c => c.id === request.customer_id);
      if (cust) setSelectedCustomer(cust);
      
      const res = await fetch(`${API_URL}/api/picklists/${request.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const importedItems: SelectedItem[] = [];
        
        for (const pi of data.items) {
          // fetch inventory details to get DIS locations
          const invRes = await fetch(`${API_URL}/api/inventory/${encodeURIComponent(pi.part_number)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (invRes.ok) {
            const invData = await invRes.json();
            const disLocations = (invData.locations || []).filter((l: any) => l.warehouse === 'DIS');
            
            importedItems.push({
              id: Math.random().toString(36).substring(7),
              part_number: pi.part_number,
              item_name: pi.item_name,
              category: invData.category || '',
              quantity: pi.required_quantity,
              isLocked: true,
              locations: disLocations,
              selectedLocationIndex: 0
            });
          }
        }
        
        setSelectedItems(importedItems);
        setActiveTab('CREATE');
      }
    } catch (e) {
      console.error(e);
      alert("Failed to import approved request.");
    }
  };

  const handleCreatePicklist = async () => {
    if (!selectedCustomer) return alert("Please select a customer.");
    if (selectedItems.length === 0) return alert("Please select at least one item.");
    
    // Validate
    for (const item of selectedItems) {
      if (item.quantity <= 0) return alert(`Invalid quantity for ${item.part_number}`);
      if (item.locations.length > 0 && item.selectedLocationIndex < 0) {
        return alert(`Please select a valid Batch/Expiry/Bin for ${item.part_number}`);
      }
    }

    setIsSubmitting(true);
    
    const payload = {
      customer_id: selectedCustomer.id,
      items: selectedItems.map(item => {
        const loc = item.locations[item.selectedLocationIndex];
        return {
          part_number: item.part_number,
          warehouse: 'DIS',
          bin_location: loc ? loc.bin_location : '',
          batch_no: loc ? loc.batch_no : '',
          expiry: loc ? loc.expiry : '',
          quantity: item.quantity
        };
      })
    };

    try {
      const res = await fetch(`${API_URL}/api/dispatch_picklists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert("Picklist created successfully!");
        setSelectedCustomer(null);
        setSelectedItems([]);
        setActiveTab('LIST');
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create picklist.");
      }
    } catch (e) {
      alert("Error saving picklist.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadPDF = async (picklistId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/dispatch_picklists/${picklistId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch data");
      const data = await res.json();
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      
      // Top Green Bar
      doc.setFillColor(0, 139, 56);
      doc.rect(0, 0, pageWidth, 6, 'F');
      
      // Load and add logo
      try {
        const logoBase64 = await getBase64ImageFromURL(logo);
        // Add logo (x, y, w, h)
        doc.addImage(logoBase64, 'PNG', 14, 12, 35, 12);
      } catch (err) {
        console.error("Failed to load logo for PDF", err);
      }
      
      // Right Side Header (Picklist NO, Date)
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
      doc.text("PICKLIST NO :", pageWidth - 45, 18, { align: 'right' });
      doc.text("Date :", pageWidth - 45, 24, { align: 'right' });
      
      doc.setFont('helvetica', 'normal');
      doc.text(`PL-${data.id.toString().padStart(3, '0')}`, pageWidth - 14, 18, { align: 'right' });
      doc.text(new Date(data.created_at).toLocaleDateString(), pageWidth - 14, 24, { align: 'right' });
      
      // Left Side Details (Customer)
      doc.setFont('helvetica', 'bold');
      doc.text("Customer", 14, 34);
      doc.setFont('helvetica', 'normal');
      doc.text(data.customer_name, 14, 40);
      if (data.status) {
        doc.text(`Status: ${data.status}`, 14, 45);
      }
      
      // Table
      const tableData = data.items.map((item: any, index: number) => [
        (index + 1).toString(),
        item.item_name || item.part_number,
        item.warehouse || '-',
        item.bin_location || '-',
        item.batch_no || '-',
        item.expiry || '-',
        item.quantity.toString()
      ]);
      
      autoTable(doc, {
        startY: 52,
        head: [['Sl.', 'Description', 'Warehouse', 'Bin', 'Batch No.', 'Expiry', 'Qty']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [235, 241, 130], textColor: [26, 145, 68] },
        styles: { fontSize: 9 }
      });
      
      const finalY = (doc as any).lastAutoTable.finalY || 55;
      const totalQty = data.items.reduce((sum: number, item: any) => sum + item.quantity, 0);
      
      // Total Section
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text("Total Items", pageWidth - 50, finalY + 12, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(data.items.length.toString(), pageWidth - 16, finalY + 12, { align: 'right' });
      
      // Total Quantity banner (matches "Balance Due" style)
      doc.setFillColor(0, 139, 56);
      doc.roundedRect(pageWidth - 85, finalY + 16, 71, 8, 3, 3, 'F');
      doc.setFillColor(235, 241, 130);
      doc.rect(pageWidth - 45, finalY + 16, 31, 8, 'F'); // cover right side of rounded rect for split color
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text("Total Dispatched", pageWidth - 48, finalY + 21.5, { align: 'right' });
      
      doc.setTextColor(0, 139, 56);
      doc.text(totalQty.toString(), pageWidth - 16, finalY + 21.5, { align: 'right' });
      
      // Signature Area
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(150, 150, 150);
      doc.line(pageWidth - 65, finalY + 55, pageWidth - 15, finalY + 55);
      doc.text("Authorized Signatory", pageWidth - 40, finalY + 60, { align: 'center' });
      
      // Bottom Green Bar
      doc.setFillColor(0, 139, 56);
      doc.rect(0, pageHeight - 6, pageWidth, 6, 'F');
      
      doc.save(`Picklist_${data.id}.pdf`);
      
    } catch (e) {
      console.error(e);
      alert("Failed to generate PDF.");
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.customer_name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
           <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#8F2C00] to-[#1F8F00] bg-clip-text text-transparent">
            Picklist
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Manage and create picklists for dispatch.</p>
        </div>
      </div>

      <div className="flex bg-zinc-100 p-1 rounded-lg w-max">
        <button
          onClick={() => setActiveTab('LIST')}
          className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all", activeTab === 'LIST' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}
        >
          List Picklist
        </button>
        <button
          onClick={() => setActiveTab('CREATE')}
          className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all", activeTab === 'CREATE' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}
        >
          Create New Picklist
        </button>
        <button
          onClick={() => setActiveTab('APPROVED')}
          className={cn("px-4 py-1.5 text-sm font-medium rounded-md transition-all", activeTab === 'APPROVED' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}
        >
          Approved Requests
        </button>
      </div>

      {activeTab === 'LIST' && (
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-500 bg-zinc-50 uppercase border-b border-zinc-100">
              <tr>
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Created Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {picklists.map(pl => (
                <tr key={pl.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50">
                  <td className="px-6 py-4 font-medium text-zinc-900">#{pl.id}</td>
                  <td className="px-6 py-4">{pl.customer_name}</td>
                  <td className="px-6 py-4">
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full">
                      {pl.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">{new Date(pl.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => downloadPDF(pl.id)}
                    >
                      <Download size={14} className="mr-1" /> PDF
                    </Button>
                  </td>
                </tr>
              ))}
              {picklists.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    No picklists found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'APPROVED' && (
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-zinc-500 bg-zinc-50 uppercase border-b border-zinc-100">
              <tr>
                <th className="px-6 py-4">Request ID</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {approvedRequests.map(req => (
                <tr key={req.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50">
                  <td className="px-6 py-4 font-medium text-zinc-900">#{req.id}</td>
                  <td className="px-6 py-4">{req.customer_name}</td>
                  <td className="px-6 py-4">
                    <span className="bg-emerald-100 text-emerald-800 text-xs font-medium px-2.5 py-1 rounded-full flex w-fit items-center gap-1">
                      <CheckCircle size={12} /> {req.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">{new Date(req.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <Button 
                      onClick={() => handleImportApprovedRequest(req)}
                    >
                      Create Picklist <ArrowRight size={14} className="ml-1.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {approvedRequests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    No approved transfer requests available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'CREATE' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-zinc-200">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4">Customer Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Customer</label>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg">
                    <div className="flex items-center gap-2 text-indigo-700 font-medium text-sm">
                      <Check size={16} />
                      {selectedCustomer.customer_name}
                    </div>
                    <button onClick={() => setSelectedCustomer(null)} className="text-indigo-400 hover:text-indigo-600">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search customer..."
                      className="w-full pl-9 pr-4 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-400"
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                      onFocus={() => setShowCustomerDropdown(true)}
                    />
                    {showCustomerDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredCustomers.map(c => (
                          <div 
                            key={c.id} 
                            className="px-4 py-2 hover:bg-zinc-50 cursor-pointer text-sm"
                            onClick={() => { setSelectedCustomer(c); setShowCustomerDropdown(false); setCustomerSearch(''); }}
                          >
                            {c.customer_name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Warehouse</label>
                <input 
                  type="text" 
                  value="DIS" 
                  disabled 
                  className="w-full px-4 py-2 bg-zinc-100 border border-zinc-200 rounded-lg text-sm text-zinc-500 font-medium cursor-not-allowed"
                />
                <p className="text-xs text-zinc-400 mt-1">Defaulted to DIS warehouse (read-only)</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-zinc-200">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4">Inventory Selection (DIS Warehouse Only)</h2>
            <div className="relative mb-6">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search inventory to add..."
                className="w-full pl-9 pr-4 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-400"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
              />
              {inventorySearch && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map(item => (
                    <div 
                      key={item.id} 
                      className="px-4 py-2.5 hover:bg-zinc-50 cursor-pointer text-sm border-b border-zinc-100 flex justify-between items-center"
                      onClick={() => { handleSelectInventory(item); setInventorySearch(''); }}
                    >
                      <div>
                        <div className="font-medium text-zinc-800">{item.part_number}</div>
                        <div className="text-xs text-zinc-500">{item.item_name}</div>
                      </div>
                      <Plus size={16} className="text-indigo-600" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedItems.length > 0 && (
              <table className="w-full text-sm text-left border border-zinc-200 rounded-lg overflow-hidden">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-3">Part No.</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Batch / Expiry (DIS)</th>
                    <th className="px-4 py-3 w-32">Quantity</th>
                    <th className="px-4 py-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {selectedItems.map((item, idx) => (
                    <tr key={item.id} className="bg-white">
                      <td className="px-4 py-3 font-medium text-zinc-900">
                        {item.part_number}
                        <div className="text-xs text-zinc-500 font-normal">{item.item_name}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{item.category}</td>
                      <td className="px-4 py-3">
                        {item.locations.length > 0 ? (
                          <select
                            className="w-full border border-zinc-300 rounded-md py-1.5 px-2 text-sm"
                            value={item.selectedLocationIndex}
                            onChange={(e) => {
                              const newItems = [...selectedItems];
                              newItems[idx].selectedLocationIndex = parseInt(e.target.value);
                              setSelectedItems(newItems);
                            }}
                          >
                            {item.locations.map((loc, lIdx) => (
                              <option key={lIdx} value={lIdx}>
                                {item.category.toLowerCase() === 'food' 
                                  ? `Batch: ${loc.batch_no || 'N/A'} | Exp: ${loc.expiry || 'N/A'} (Qty: ${loc.quantity})`
                                  : `Bin: ${loc.bin_location} (Qty: ${loc.quantity})`
                                }
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-red-500 text-xs">No stock in DIS warehouse</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input 
                          type="number"
                          min="1"
                          value={item.quantity}
                          disabled={item.isLocked}
                          onChange={(e) => {
                            const newItems = [...selectedItems];
                            newItems[idx].quantity = parseInt(e.target.value) || 0;
                            setSelectedItems(newItems);
                          }}
                          className={cn(
                            "w-full border rounded-md py-1.5 px-3 text-sm",
                            item.isLocked ? "bg-zinc-100 border-zinc-200 text-zinc-500 cursor-not-allowed" : "border-zinc-300 focus:ring-zinc-400"
                          )}
                        />
                        {item.isLocked && <p className="text-[10px] text-zinc-400 mt-1">Approved Qty (Locked)</p>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button 
                          onClick={() => setSelectedItems(prev => prev.filter(i => i.id !== item.id))}
                          className="text-red-500 hover:text-red-700 p-1 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            {selectedItems.length > 0 && (
              <div className="mt-6 flex justify-end">
                <Button
                  onClick={handleCreatePicklist}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Create Picklist Document'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
