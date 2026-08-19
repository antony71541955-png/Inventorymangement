import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { InfinitySpin } from 'react-loader-spinner';
import { 
  Plus, 
  Search, 
  Trash2, 
  Image as ImageIcon,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
  Edit,
  Printer,
  ChevronDown,
  Upload,
  Copy,
  MoreHorizontal
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface LocationBreakdown {
  warehouse: string;
  bin_location: string;
  quantity: number;
  batch_no?: string;
  expiry?: string;
}

interface InventoryItem {
  id: number;
  part_number: string;
  item_name: string;
  description: string;
  category: string;
  unit_of_measure: string;
  image_path: string | null;
  min_stock: number;
  total_quantity: number;
  locations: LocationBreakdown[];
  item_type?: string;
  batch_no?: string;
  expiry?: string;
  selling_price?: number;
}

export default function Inventory() {
  const { user, token } = useAuth();
  
  // Data loading states
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [sortBy, setSortBy] = useState('part_number');
  const [sortDir, setSortDir] = useState('ASC');
  const [activeTab, setActiveTab] = useState('All');
  
  // Dialog state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  
  // Form input states
  const [partNumber, setPartNumber] = useState('');
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('pcs');
  const [minStock, setMinStock] = useState('10');
  const [itemType, setItemType] = useState('non food');
  const [batchNo, setBatchNo] = useState('');
  const [expiry, setExpiry] = useState('');
  const [sellingPrice, setSellingPrice] = useState('0.0');
  const [warehouse, setWarehouse] = useState('');
  const [binLocation, setBinLocation] = useState('');
  const [initialQty, setInitialQty] = useState('0');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Row selection states for location and batch dropdowns
  const [selectedLocations, setSelectedLocations] = useState<Record<string, string>>({}); // key: part_number, value: "warehouse|bin"
  const [selectedBatches, setSelectedBatches] = useState<Record<string, string>>({}); // key: part_number, value: "batch_no"

  // Dropdown helper functions and change handlers
  const getUniqueLocations = (item: InventoryItem) => {
    const locMap = new Map<string, { warehouse: string; bin_location: string }>();
    item.locations?.forEach((loc) => {
      const key = `${loc.warehouse}|${loc.bin_location}`;
      if (!locMap.has(key)) {
        locMap.set(key, { warehouse: loc.warehouse, bin_location: loc.bin_location });
      }
    });
    return Array.from(locMap.values());
  };

  const handleLocationChange = (partNumber: string, item: InventoryItem, newLoc: string) => {
    setSelectedLocations(prev => ({ ...prev, [partNumber]: newLoc }));
    
    // Pick the first batch associated with this new location
    const [wh, bin] = newLoc.split('|');
    const matches = item.locations?.filter(loc => loc.warehouse === wh && loc.bin_location === bin) || [];
    const firstBatch = matches[0]?.batch_no || '';
    setSelectedBatches(prev => ({ ...prev, [partNumber]: firstBatch }));
  };

  const handleBatchChange = (partNumber: string, newBatch: string) => {
    setSelectedBatches(prev => ({ ...prev, [partNumber]: newBatch }));
  };

  const [isEditing, setIsEditing] = useState(false);
  const [isDetailsMinimized, setIsDetailsMinimized] = useState(false);

  const handleEditClick = () => {
    if (!selectedItem) return;
    setPartNumber(selectedItem.part_number);
    setItemName(selectedItem.item_name);
    setDescription(selectedItem.description || '');
    setCategory(selectedItem.category || '');
    setUnitOfMeasure(selectedItem.unit_of_measure || 'pcs');
    setMinStock(selectedItem.min_stock.toString());
    setItemType(selectedItem.item_type || 'non food');
    setBatchNo(selectedItem.batch_no || '');
    setExpiry(selectedItem.expiry || '');
    setSellingPrice((selectedItem.selling_price || 0.0).toString());
    setWarehouse('');
    setBinLocation('');
    setInitialQty('0');
    setImageFile(null);
    setIsEditing(true);
    setIsAddModalOpen(true);
  };

  const handleAddClick = () => {
    setPartNumber('');
    setItemName('');
    setDescription('');
    setCategory('');
    setUnitOfMeasure('pcs');
    setMinStock('10');
    setItemType('non food');
    setBatchNo('');
    setExpiry('');
    setSellingPrice('0.0');
    setWarehouse('');
    setBinLocation('');
    setInitialQty('0');
    setImageFile(null);
    setIsEditing(false);
    setIsAddModalOpen(true);
  };

  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Reset file input value
    e.target.value = '';
    
    setUploadingExcel(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`${API_URL}/api/inventory/upload`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      if (!response.ok) {
        let errStr = 'Failed to upload spreadsheet.';
        try {
          const errData = await response.json();
          errStr = errData.error || errStr;
        } catch {}
        throw new Error(errStr);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported in this browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.progress !== undefined) {
                setUploadProgress(data.progress);
              }
              if (data.error) {
                throw new Error(data.error);
              }
              if (data.success) {
                // Done successfully
              }
            } catch (err: any) {
              if (err.message !== "Unexpected end of JSON input" && err.name !== "SyntaxError") {
                throw err;
              }
            }
          }
        }
      }
      
      alert('Bulk upload completed successfully!');
      fetchInventory();
    } catch (err: any) {
      alert(err.message || 'Error occurred during excel import.');
    } finally {
      setUploadingExcel(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  // Stats
  const [stats, setStats] = useState({
    totalVolume: 0,
    totalValue: 0,
    turnover: 6.82
  });

  // Master locations pool
  const [locations, setLocations] = useState<Record<string, string[]>>({});

  const fetchLocations = async () => {
    try {
      const res = await fetch(`${API_URL}/api/locations`);
      const data = await res.json();
      setLocations(data || {});
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Inventory items
  const fetchInventory = async () => {
    setLoading(true);
    try {
      const url = new URL(`${API_URL}/api/inventory`);
      url.searchParams.append('page', page.toString());
      url.searchParams.append('limit', limit.toString());
      url.searchParams.append('search', search);
      if (warehouseFilter) {
        url.searchParams.append('warehouse', warehouseFilter);
      }
      url.searchParams.append('sort_by', sortBy);
      url.searchParams.append('sort_dir', sortDir);
      
      const res = await fetch(url.toString());
      const data = await res.json();
      
      setItems(data.items || []);
      setTotal(data.total || 0);
      
      // Initialize selectedLocations and selectedBatches for newly loaded items
      const loadedItems = data.items || [];
      const newLocs: Record<string, string> = { ...selectedLocations };
      const newBatches: Record<string, string> = { ...selectedBatches };
      
      loadedItems.forEach((item: InventoryItem) => {
        const key = item.part_number;
        if (!newLocs[key] && item.locations && item.locations.length > 0) {
          const defaultLoc = `${item.locations[0].warehouse}|${item.locations[0].bin_location}`;
          newLocs[key] = defaultLoc;
          
          const defaultBatch = item.locations[0].batch_no || '';
          newBatches[key] = defaultBatch;
        }
      });
      setSelectedLocations(newLocs);
      setSelectedBatches(newBatches);
      
      // Update selected item detail breakdown in view if it is still open
      if (selectedItem) {
        const updated = (data.items as InventoryItem[]).find(i => i.part_number === selectedItem.part_number);
        if (updated) {
          setSelectedItem(updated);
        }
      }

      // Calculate stats based on full inventory load
      const fullRes = await fetch(`${API_URL}/api/reports/stock?group_by=item`);
      const fullData = await fullRes.json();
      const volume = fullData.reduce((acc: number, val: any) => acc + val.total_quantity, 0);
      setStats({
        totalVolume: volume,
        totalValue: volume * 15.5, // Mock value per item
        turnover: 6.82
      });

    } catch (e) {
      console.error("Fetch inventory failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchLocations();
  }, [page, search, warehouseFilter, sortBy, sortDir]);

  // Set default selected item once items are loaded
  useEffect(() => {
    if (items.length > 0 && !selectedItem) {
      setSelectedItem(items[0]);
    }
  }, [items]);

  // Handle Search Input Change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  // Toggle Sorting
  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortDir('ASC');
    }
    setPage(1);
  };

  // Handle Image File Select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  // Handle Submit Form (Add/Update Item)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setFormLoading(true);

    if (!partNumber.trim() || !itemName.trim()) {
      setFormError('Part Number and Item Name are mandatory fields.');
      setFormLoading(false);
      return;
    }

    if (itemType === 'food') {
      if (!batchNo.trim()) {
        setFormError('Batch No is a mandatory field for food items.');
        setFormLoading(false);
        return;
      }
      if (!expiry.trim()) {
        setFormError('Expiry Date is a mandatory field for food items.');
        setFormLoading(false);
        return;
      }
    }

    try {
      const formData = new FormData();
      formData.append('part_number', partNumber.trim());
      formData.append('item_name', itemName.trim());
      formData.append('description', description.trim());
      formData.append('category', category.trim() || 'Uncategorized');
      formData.append('unit_of_measure', unitOfMeasure);
      formData.append('min_stock', minStock);
      formData.append('item_type', itemType);
      formData.append('selling_price', sellingPrice.trim());
      
      if (itemType === 'food') {
        formData.append('batch_no', batchNo.trim());
        formData.append('expiry', expiry.trim());
      }
      
      if (warehouse.trim() && binLocation.trim() && parseInt(initialQty) > 0) {
        formData.append('warehouse', warehouse.trim());
        formData.append('bin_location', binLocation.trim());
        formData.append('quantity', initialQty);
      }

      if (imageFile) {
        formData.append('image', imageFile);
      }

      const res = await fetch(`${API_URL}/api/inventory`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save item');
      }

      setFormSuccess('Item saved successfully!');
      
      // Clear inputs
      setPartNumber('');
      setItemName('');
      setDescription('');
      setCategory('');
      setItemType('non food');
      setBatchNo('');
      setExpiry('');
      setSellingPrice('0.0');
      setWarehouse('');
      setBinLocation('');
      setInitialQty('0');
      setImageFile(null);
      
      // Re-fetch
      fetchInventory();

      // Close modal after a delay
      setTimeout(() => {
        setIsAddModalOpen(false);
        setFormSuccess(null);
      }, 1500);

    } catch (err: any) {
      setFormError(err.message || 'Error occurred');
    } finally {
      setFormLoading(false);
    }
  };

  // Handle Delete Location stock row
  const handleDeleteLocation = async (partNum: string, wh: string, bin: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to permanently delete stock for ${partNum} at ${wh} (${bin})?`);
    if (!confirmDelete) return;

    try {
      const url = new URL(`${API_URL}/api/inventory/${partNum}/location`);
      url.searchParams.append('warehouse', wh);
      url.searchParams.append('bin_location', bin);
      
      const res = await fetch(url.toString(), {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete stock location');
      }

      alert('Location stock removed successfully');
      fetchInventory();
    } catch (e: any) {
      alert(e.message || 'Failed to delete');
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  // Format Helper for large currency numbers
  const formatMillions = (num: number) => {
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(1)}K`;
    }
    return `$${num.toFixed(2)}`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#8F2C00] to-[#1F8F00] bg-clip-text text-transparent">Inventory</h1>
        <div className="flex items-center gap-2">
          <input
            type="file"
            id="bulk-excel-upload"
            accept=".xlsx, .xls"
            className="hidden"
            onChange={handleExcelUpload}
          />
          <Button 
            variant="outline" 
            className="relative overflow-hidden"
            onClick={() => document.getElementById('bulk-excel-upload')?.click()}
            disabled={uploadingExcel}
          >
            {uploadingExcel && (
              <div 
                className="absolute left-0 top-0 bottom-0 bg-indigo-100 transition-all duration-200" 
                style={{ width: `${uploadProgress}%`, zIndex: 0 }}
              />
            )}
            <div className="relative z-10 flex items-center">
              <Upload className="mr-1.5 h-4 w-4 text-zinc-500" /> 
              {uploadingExcel ? `Uploading... ${uploadProgress}%` : 'Bulk Excel Upload'}
            </div>
          </Button>
          <Button onClick={handleAddClick}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Stock Item
          </Button>
        </div>
      </div>

      {/* Mate Metrics cards row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm p-6 flex flex-col justify-center h-28">
          <span className="text-3xl font-extrabold text-zinc-900">{stats.totalVolume.toLocaleString()}</span>
          <span className="text-xs text-zinc-500 font-semibold mt-1">Total inventory volume</span>
        </Card>
        
        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm p-6 flex flex-col justify-center h-28">
          <span className="text-3xl font-extrabold text-zinc-900">{formatMillions(stats.totalValue)}</span>
          <span className="text-xs text-zinc-500 font-semibold mt-1">Inventory value</span>
        </Card>

        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm p-6 flex flex-col justify-center h-28">
          <span className="text-3xl font-extrabold text-zinc-900">{stats.turnover}</span>
          <span className="text-xs text-zinc-500 font-semibold mt-1">Inventory turnover</span>
        </Card>
      </div>

      {/* All, Active, Draft... Categories Navigation Bar */}
      <div className="flex justify-between items-center border-b border-zinc-200/80 pb-0 mb-3">
        <div className="flex gap-5 text-xs font-bold text-zinc-400 transition-colors">
          <span 
            className={`pb-3 cursor-pointer ${activeTab === 'All' ? 'text-zinc-900 border-b-2 border-zinc-900' : 'hover:text-zinc-800'}`}
            onClick={() => setActiveTab('All')}
          >All</span>
          <span 
            className={`pb-3 cursor-pointer ${activeTab === 'Food' ? 'text-zinc-900 border-b-2 border-zinc-900' : 'hover:text-zinc-800'}`}
            onClick={() => setActiveTab('Food')}
          >Food Items</span>
          <span 
            className={`pb-3 cursor-pointer ${activeTab === 'Non Food' ? 'text-zinc-900 border-b-2 border-zinc-900' : 'hover:text-zinc-800'}`}
            onClick={() => setActiveTab('Non Food')}
          >Non-Food Items</span>
        </div>
        
        <div className="flex items-center gap-2 mb-2">
          {selectedItem && (
            <Button 
              variant="outline" 
              size="xs"
              onClick={() => setIsDetailsMinimized(!isDetailsMinimized)}
            >
              {isDetailsMinimized ? (
                <><ChevronLeft size={12} className="mr-1" /> Show Product Info</>
              ) : (
                <><ChevronRight size={12} className="mr-1" /> Hide Product Info</>
              )}
            </Button>
          )}
          {/* Warehouse Filter */}
          <div className="relative w-48">
            <select
              className="w-full h-9 bg-white border border-zinc-200 text-xs text-zinc-800 rounded-md focus-visible:ring-zinc-900 px-2 outline-none cursor-pointer"
              value={warehouseFilter}
              onChange={(e) => {
                setWarehouseFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Warehouses</option>
              {Object.keys(locations).map(wh => (
                <option key={wh} value={wh}>{wh}</option>
              ))}
            </select>
          </div>
          {/* Compact Table Search Input */}
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-550" />
            <Input
              type="text"
              className="pl-8 h-9 bg-white border-zinc-200 text-xs text-zinc-800 rounded-md focus-visible:ring-zinc-900"
              placeholder="Search items"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* WMS Clean Table Card (takes 2/3 width or full width when minimized) */}
        <Card className={`lg:col-span-2 bg-white border border-zinc-200/80 rounded-xl shadow-sm overflow-hidden transition-all duration-300 ${
          isDetailsMinimized ? 'lg:col-span-3' : 'lg:col-span-2'
        }`}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-zinc-50/70 border-b border-zinc-200">
                  <TableRow className="hover:bg-zinc-50/70">
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider">Group</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider cursor-pointer" onClick={() => toggleSort('part_number')}>
                      Part Number {sortBy === 'part_number' ? (sortDir === 'ASC' ? ' ▲' : ' ▼') : ''}
                    </TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider cursor-pointer" onClick={() => toggleSort('item_name')}>
                      Item Name {sortBy === 'item_name' ? (sortDir === 'ASC' ? ' ▲' : ' ▼') : ''}
                    </TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider">Location</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider text-center">Location Stock</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider">batchNo</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider">Expiry</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider text-right" onClick={() => toggleSort('total_quantity')}>
                      Total Stock
                    </TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider text-right">Selling Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const displayedItems = items.filter(item => {
                      if (activeTab === 'All') return true;
                      if (activeTab === 'Food') return item.item_type?.toLowerCase() === 'food';
                      if (activeTab === 'Non Food') return item.item_type?.toLowerCase() === 'non food';
                      return true;
                    });

                    if (loading) {
                      return (
                        <TableRow className="border-b border-zinc-100">
                          <TableCell colSpan={9} className="py-12">
                            <div className="flex flex-col items-center justify-center gap-4">
                              <InfinitySpin width="150" color="#1F8F00" />
                              <p className="text-zinc-500 text-sm font-semibold tracking-wide animate-pulse">
                                Loading database catalog...
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    if (displayedItems.length === 0) {
                      return (
                        <TableRow className="border-b border-zinc-100">
                          <TableCell colSpan={9} className="text-center py-12 text-zinc-450 text-xs">
                            No product allocations match the current filter.
                          </TableCell>
                        </TableRow>
                      );
                    }
                    
                    return displayedItems.map((item) => {
                      const uniqueLocs = getUniqueLocations(item);
                      const activeLocKey = selectedLocations[item.part_number] || (item.locations?.[0] ? `${item.locations[0].warehouse}|${item.locations[0].bin_location}` : '');
                      const [activeWh, activeBin] = activeLocKey ? activeLocKey.split('|') : ['', ''];
                      
                      const locationStock = item.locations?.filter(l => l.warehouse === activeWh && l.bin_location === activeBin).reduce((sum, l) => sum + l.quantity, 0) || 0;
                      const locationMatches = item.locations?.filter(l => l.warehouse === activeWh && l.bin_location === activeBin) || [];
                      const activeBatchKey = selectedBatches[item.part_number] || (locationMatches[0]?.batch_no || '');
                      const activeBatchRecord = locationMatches.find(l => (l.batch_no || '') === activeBatchKey);
                      const expiryDate = activeBatchRecord?.expiry || '-';
                      
                      return (
                        <TableRow 
                          key={item.id} 
                          onClick={() => setSelectedItem(item)}
                          className={`border-b border-zinc-100/80 cursor-pointer transition-colors ${
                            selectedItem?.part_number === item.part_number ? 'bg-zinc-50 hover:bg-zinc-100/50' : 'hover:bg-zinc-50/50'
                          }`}
                        >
                          <TableCell className="text-zinc-500 text-xs font-medium">{item.category}</TableCell>
                          <TableCell className="font-semibold text-zinc-900 text-xs">{item.part_number}</TableCell>
                          <TableCell className="text-zinc-700 text-xs font-semibold max-w-[160px] truncate sm:max-w-none">{item.item_name}</TableCell>
                          <TableCell className="p-2" onClick={(e) => e.stopPropagation()}>
                            {uniqueLocs.length > 0 ? (
                              <select
                                className="p-1 h-7 rounded bg-white border border-zinc-200 text-zinc-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-zinc-950 max-w-[120px] truncate"
                                value={activeLocKey}
                                onChange={(e) => handleLocationChange(item.part_number, item, e.target.value)}
                              >
                                {uniqueLocs.map((loc) => {
                                  const key = `${loc.warehouse}|${loc.bin_location}`;
                                  return (
                                    <option key={key} value={key}>
                                      {loc.warehouse} ({loc.bin_location})
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <span className="text-zinc-450 text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-zinc-650 text-xs font-semibold text-center">
                            {locationStock}
                          </TableCell>
                          <TableCell className="p-2" onClick={(e) => e.stopPropagation()}>
                            {locationMatches.length > 0 ? (
                              <select
                                className="p-1 h-7 rounded bg-white border border-zinc-200 text-zinc-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-zinc-950 max-w-[100px] truncate"
                                value={activeBatchKey}
                                onChange={(e) => handleBatchChange(item.part_number, e.target.value)}
                              >
                                {locationMatches.map((loc, idx) => {
                                  const batchVal = loc.batch_no || '';
                                  return (
                                    <option key={idx} value={batchVal}>
                                      {batchVal || 'No Batch'}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <span className="text-zinc-450 text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-zinc-550 text-xs font-medium">
                            {expiryDate || '-'}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <span className={`font-bold ${
                              item.total_quantity < 0 ? 'text-red-500' :
                              item.total_quantity < item.min_stock ? 'text-amber-500' : 'text-zinc-900'
                            }`}>
                              {item.total_quantity} {item.unit_of_measure}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold text-zinc-900">
                            ${(item.selling_price || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-100">
              <Button 
                variant="outline" 
                size="icon-sm" 
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={14} />
              </Button>
              <span className="text-[11px] text-zinc-400 font-medium">
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
              </span>
              <Button 
                variant="outline" 
                size="icon-sm" 
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Selected Product info card drawer (takes 1/3 width, hidden when minimized) */}
        {!isDetailsMinimized && (
          <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm overflow-hidden p-6 space-y-6 transition-all duration-300">
          {selectedItem ? (
            <div className="space-y-6">
              {/* Product title */}
              <div className="space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <h2 className="text-lg font-bold text-zinc-900 leading-snug tracking-tight truncate flex-1">{selectedItem.item_name}</h2>
                  <button 
                    onClick={() => setIsDetailsMinimized(true)}
                    className="text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 p-1 rounded shrink-0 transition-colors"
                    title="Minimize panel"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Edit, Print, Duplicate Action Button Row */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button onClick={handleEditClick}>
                    <Edit size={12} className="mr-1 shrink-0" /> Edit
                  </Button>

                </div>
              </div>

              {/* Product Info Table & Image grid */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Product info</span>
                <div className="flex gap-4 justify-between items-start">
                  <div className="space-y-2.5 flex-1 text-xs">
                    <div className="grid grid-cols-2">
                      <span className="text-zinc-500">SKU</span>
                      <strong className="text-zinc-850 text-right truncate pl-2">{selectedItem.part_number}</strong>
                    </div>
                    <div className="grid grid-cols-2">
                      <span className="text-zinc-500">Price</span>
                      <strong className="text-zinc-850 text-right">$1,590.00</strong>
                    </div>
                    <div className="grid grid-cols-2">
                      <span className="text-zinc-500">Category</span>
                      <strong className="text-zinc-850 text-right truncate pl-2">{selectedItem.category}</strong>
                    </div>
                    <div className="grid grid-cols-2">
                      <span className="text-zinc-500">Item Type</span>
                      <strong className="text-zinc-850 text-right capitalize">{selectedItem.item_type || 'non food'}</strong>
                    </div>
                    {(selectedItem.item_type === 'food' || selectedItem.batch_no || selectedItem.expiry) && (
                      <>
                        <div className="grid grid-cols-2">
                          <span className="text-zinc-500">Batch No</span>
                          <strong className="text-zinc-850 text-right truncate pl-2">{selectedItem.batch_no || '-'}</strong>
                        </div>
                        <div className="grid grid-cols-2">
                          <span className="text-zinc-500">Expiry</span>
                          <strong className="text-zinc-850 text-right">{selectedItem.expiry || '-'}</strong>
                        </div>
                      </>
                    )}
                    <div className="grid grid-cols-2">
                      <span className="text-zinc-500">Stock</span>
                      <strong className="text-zinc-850 text-right">{selectedItem.total_quantity}</strong>
                    </div>
                    <div className="grid grid-cols-2">
                      <span className="text-zinc-500">Processed</span>
                      <strong className="text-zinc-850 text-right">5</strong>
                    </div>
                    <div className="grid grid-cols-2">
                      <span className="text-zinc-500">Total</span>
                      <strong className="text-zinc-850 text-right">{selectedItem.total_quantity + 5}</strong>
                    </div>
                    <div className="grid grid-cols-2 items-center">
                      <span className="text-zinc-500">Status</span>
                      <div className="text-right">
                        <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-50 text-[10px] font-bold rounded px-1.5 py-0.5">
                          Active
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Thumbnail Picture Frame */}
                  {selectedItem.image_path ? (
                    <img 
                      src={`${API_URL}/${selectedItem.image_path}`} 
                      className="w-24 h-24 rounded-lg object-cover border border-zinc-200 bg-zinc-50 shadow-sm shrink-0" 
                      alt={selectedItem.item_name}
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-lg flex items-center justify-center border border-zinc-200 bg-zinc-50 text-zinc-400 shrink-0">
                      <ImageIcon size={28} />
                    </div>
                  )}
                </div>
              </div>

              {/* Location breakdowns */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">Active Warehouses</span>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                  {selectedItem.locations.map((loc, i) => (
                    <div key={i} className="flex justify-between items-center p-2.5 bg-zinc-50 border border-zinc-205/60 rounded-lg text-xs">
                      <div className="flex items-center gap-2">
                        <MapPin size={12} className="text-zinc-500" />
                        <div>
                          <span className="font-semibold text-zinc-700">{loc.warehouse}</span>
                          <span className="text-[9px] text-zinc-500 block">Bin: {loc.bin_location}</span>
                        </div>
                      </div>
                      <span className="font-bold text-zinc-800">{loc.quantity} {selectedItem.unit_of_measure}</span>
                    </div>
                  ))}
                </div>
              </div>


            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 text-center text-zinc-400">
              <Info size={32} className="text-zinc-300 mb-3" />
              <p className="text-xs max-w-[200px] mx-auto">Select a product row to open the details info drawer.</p>
            </div>
          )}
        </Card>
        )}
      </div>

      {/* Add Item Dialog Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="bg-white border-zinc-200 text-zinc-900 max-w-2xl max-h-[95vh] overflow-y-auto p-5 rounded-xl shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-zinc-900">
              {isEditing ? `Edit Item: ${partNumber}` : 'Add New Stock Allocation'}
            </DialogTitle>
          </DialogHeader>

          {formError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg mb-4">
              <span>{formError}</span>
            </div>
          )}
          {formSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-lg mb-4">
              <span>{formSuccess}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-4">
            {/* Row 1: Part Number, Item Name, Item Type, Selling Price */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Part Number (SKU)*</label>
                <Input
                  type="text"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs h-8"
                  placeholder="e.g., P-100"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  required
                  disabled={isEditing}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-455 uppercase tracking-wider">Item Name*</label>
                <Input
                  type="text"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs h-8"
                  placeholder="e.g., Metal Bearing"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Item Type</label>
                <select
                  className="w-full p-1.5 h-8 rounded-md bg-white border border-zinc-200 text-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950"
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value)}
                >
                  <option value="non food">Non Food</option>
                  <option value="food">Food</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Selling Price ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs h-8"
                  placeholder="0.00"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                />
              </div>
            </div>

            {/* Row 2: Category, Unit of Measure, Min Stock Level, Upload Picture */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Category</label>
                <Input
                  type="text"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs h-8"
                  placeholder="e.g., Mechanical"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Unit of Measure</label>
                <Input
                  type="text"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs h-8"
                  value={unitOfMeasure}
                  onChange={(e) => setUnitOfMeasure(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Min Stock Level</label>
                <Input
                  type="number"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs h-8"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Upload Picture</label>
                <Input
                  type="file"
                  className="bg-white border-zinc-200 text-zinc-450 file:text-zinc-850 cursor-pointer text-xs h-8 p-1"
                  onChange={handleFileChange}
                  accept="image/*"
                />
              </div>
            </div>

            {/* Row 3: Description (Inline text input to minimize height) */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Description</label>
              <Input
                type="text"
                className="bg-white border-zinc-200 text-zinc-800 text-xs h-8"
                placeholder="Optional item description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Row 4 (Conditional): Food Fields (Batch No & Expiry) */}
            {itemType === 'food' && (
              <div className="grid grid-cols-2 gap-4 border border-zinc-100 bg-zinc-50/50 p-2.5 rounded-lg">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Batch No*</label>
                  <Input
                    type="text"
                    className="bg-white border-zinc-200 text-zinc-800 text-xs h-8"
                    placeholder="e.g., B-2024"
                    value={batchNo}
                    onChange={(e) => setBatchNo(e.target.value)}
                    required={itemType === 'food'}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Expiry*</label>
                  <Input
                    type="date"
                    className="bg-white border-zinc-200 text-zinc-850 text-xs h-8"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    required={itemType === 'food'}
                  />
                </div>
              </div>
            )}

            {/* Row 5: Initial Location Allocation (Optional) - Only shown when creating a new item */}
            {!isEditing && (
              <div className="border-t border-zinc-200 pt-3 space-y-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Initial Location Allocation (Optional)</span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-semibold text-zinc-400">Warehouse</label>
                    <select
                      className="w-full p-1.5 h-8.5 rounded-md bg-white border border-zinc-200 text-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      value={warehouse}
                      onChange={(e) => {
                        setWarehouse(e.target.value);
                        setBinLocation(''); // Reset bin when warehouse changes
                      }}
                    >
                      <option value="">-- Select --</option>
                      {Object.keys(locations).map(wh => (
                        <option key={wh} value={wh}>{wh}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-semibold text-zinc-400">Bin Location</label>
                    <select
                      className="w-full p-1.5 h-8.5 rounded-md bg-white border border-zinc-200 text-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      value={binLocation}
                      onChange={(e) => setBinLocation(e.target.value)}
                      disabled={!warehouse}
                    >
                      <option value="">-- Select --</option>
                      {(locations[warehouse] || []).map(bin => (
                        <option key={bin} value={bin}>{bin}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-semibold text-zinc-400">Quantity</label>
                    <Input
                      type="number"
                      className="h-8.5 bg-white border-zinc-200 text-zinc-800 text-xs"
                      value={initialQty}
                      onChange={(e) => setInitialQty(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full mt-2" disabled={formLoading}>
              {formLoading ? 'Saving...' : (isEditing ? 'Update Stock Item' : 'Save Stock Record')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
