import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
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
  Copy,
  MoreHorizontal,
  ChevronDown
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
}

export default function Inventory() {
  const { user } = useAuth();
  
  // Data loading states
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('part_number');
  const [sortDir, setSortDir] = useState('ASC');
  
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
  const [warehouse, setWarehouse] = useState('');
  const [binLocation, setBinLocation] = useState('');
  const [initialQty, setInitialQty] = useState('0');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

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
      url.searchParams.append('sort_by', sortBy);
      url.searchParams.append('sort_dir', sortDir);
      
      const res = await fetch(url.toString());
      const data = await res.json();
      
      setItems(data.items || []);
      setTotal(data.total || 0);
      
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
  }, [page, search, sortBy, sortDir]);

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

    try {
      const formData = new FormData();
      formData.append('part_number', partNumber.trim());
      formData.append('item_name', itemName.trim());
      formData.append('description', description.trim());
      formData.append('category', category.trim() || 'Uncategorized');
      formData.append('unit_of_measure', unitOfMeasure);
      formData.append('min_stock', minStock);
      
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
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Inventory</h1>
        <Button className="bg-zinc-950 hover:bg-zinc-900 text-white font-semibold text-xs h-9 rounded-md shadow-sm" onClick={() => setIsAddModalOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Stock Item
        </Button>
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
        <div className="flex gap-5 text-xs font-bold text-zinc-400">
          <span className="text-zinc-900 border-b-2 border-zinc-900 pb-3 cursor-pointer">All</span>
          <span className="hover:text-zinc-850 pb-3 cursor-pointer">Active</span>
          <span className="hover:text-zinc-850 pb-3 cursor-pointer">Draft</span>
          <span className="hover:text-zinc-850 pb-3 cursor-pointer">Archived</span>
          <span className="hover:text-zinc-850 pb-3 cursor-pointer">Custom</span>
          <span className="text-zinc-400 pb-3 cursor-pointer">+</span>
        </div>
        
        {/* Compact Table Search Input */}
        <div className="relative w-48 mb-2">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-550" />
          <Input
            type="text"
            className="pl-8 h-7.5 bg-white border-zinc-200 text-xs text-zinc-800 rounded-md focus-visible:ring-zinc-900"
            placeholder="Search items"
            value={search}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* WMS Clean Table Card (takes 2/3 width) */}
        <Card className="lg:col-span-2 bg-white border border-zinc-200/80 rounded-xl shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-zinc-50/70 border-b border-zinc-200">
                  <TableRow className="hover:bg-zinc-50/70">
                    <TableHead className="w-14 text-zinc-500 text-[10px] font-bold tracking-wider text-center">Pic</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider cursor-pointer" onClick={() => toggleSort('part_number')}>
                      SKU/Part Number {sortBy === 'part_number' ? (sortDir === 'ASC' ? ' ▲' : ' ▼') : ''}
                    </TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider cursor-pointer" onClick={() => toggleSort('item_name')}>
                      Product {sortBy === 'item_name' ? (sortDir === 'ASC' ? ' ▲' : ' ▼') : ''}
                    </TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider hidden sm:table-cell">Category</TableHead>
                    <TableHead className="text-zinc-500 text-[10px] font-bold tracking-wider text-right" onClick={() => toggleSort('total_quantity')}>
                      Stock
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow className="border-b border-zinc-100">
                      <TableCell colSpan={5} className="text-center py-12 text-zinc-450 text-xs">
                        Loading database catalog...
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow className="border-b border-zinc-100">
                      <TableCell colSpan={5} className="text-center py-12 text-zinc-450 text-xs">
                        No product allocations match.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => (
                      <TableRow 
                        key={item.id} 
                        onClick={() => setSelectedItem(item)}
                        className={`border-b border-zinc-100/80 cursor-pointer transition-colors ${
                          selectedItem?.part_number === item.part_number ? 'bg-zinc-50 hover:bg-zinc-100/50' : 'hover:bg-zinc-50/50'
                        }`}
                      >
                        <TableCell className="p-3 text-center">
                          {item.image_path ? (
                            <img 
                              src={`${API_URL}/${item.image_path}`} 
                              className="w-10 h-10 rounded-md object-cover border border-zinc-200/80 mx-auto" 
                              alt={item.item_name}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '';
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-md flex items-center justify-center border border-zinc-200 bg-zinc-50 text-zinc-450 mx-auto">
                              <ImageIcon size={16} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold text-zinc-900 text-xs">{item.part_number}</TableCell>
                        <TableCell className="text-zinc-700 text-xs font-semibold max-w-[160px] truncate sm:max-w-none">{item.item_name}</TableCell>
                        <TableCell className="hidden sm:table-cell text-zinc-500 text-xs font-medium">{item.category}</TableCell>
                        <TableCell className="text-right text-xs">
                          <span className={`font-bold ${
                            item.total_quantity < 0 ? 'text-red-500' :
                            item.total_quantity < item.min_stock ? 'text-amber-500' : 'text-zinc-900'
                          }`}>
                            {item.total_quantity} {item.unit_of_measure}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-100">
              <Button 
                variant="outline" 
                size="icon" 
                className="w-8 h-8 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
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
                size="icon" 
                className="w-8 h-8 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900"
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Selected Product info card drawer (takes 1/3 width) */}
        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm overflow-hidden p-6 space-y-6">
          {selectedItem ? (
            <div className="space-y-6">
              {/* Product title */}
              <div className="space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <h2 className="text-lg font-bold text-zinc-900 leading-snug tracking-tight">{selectedItem.item_name}</h2>
                  <button className="text-zinc-450 hover:text-zinc-600 shrink-0">
                    <span className="text-xs">⤢</span>
                  </button>
                </div>

                {/* Edit, Print, Duplicate Action Button Row */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button className="bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-semibold h-7.5 px-3 rounded-md shadow-sm">
                    <Edit size={12} className="mr-1 shrink-0" /> Edit
                  </Button>
                  <Button variant="outline" className="border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-[11px] font-semibold h-7.5 px-2.5 rounded-md">
                    <Printer size={12} className="mr-1 shrink-0" /> Print
                  </Button>
                  <Button variant="outline" className="border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-[11px] font-semibold h-7.5 px-2.5 rounded-md">
                    <Copy size={12} className="mr-1 shrink-0" /> Duplicate
                  </Button>
                  <Button variant="outline" size="icon" className="border-zinc-200 hover:bg-zinc-50 w-7.5 h-7.5 rounded-md">
                    <MoreHorizontal size={14} className="text-zinc-650" />
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

              {/* Sales Statistics SVG Chart Component (Matching Image styling) */}
              <div className="space-y-3 pt-4 border-t border-zinc-150">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-zinc-800">Sales statistics</span>
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500 cursor-pointer hover:text-zinc-800">
                    <span>This year</span>
                    <ChevronDown size={12} />
                  </div>
                </div>

                {/* Scalable Vector Line Chart representing sales statistics */}
                <div className="relative w-full h-32 bg-zinc-50/35 border border-zinc-100 rounded-lg p-2 flex flex-col justify-between">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 p-2 flex flex-col justify-between pointer-events-none">
                    <div className="w-full border-t border-zinc-200/50"></div>
                    <div className="w-full border-t border-zinc-200/50"></div>
                    <div className="w-full border-t border-zinc-200/50"></div>
                  </div>

                  {/* SVG Chart paths */}
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 300 90">
                    {/* Dashed Target line */}
                    <line x1="0" y1="55" x2="300" y2="55" stroke="#e4e4e7" strokeWidth="1" strokeDasharray="3,3" />
                    
                    {/* 2023 Light Grey Line */}
                    <path 
                      d="M0,70 Q25,60 50,65 T100,55 T150,68 T200,60 T250,55 T300,45" 
                      fill="none" 
                      stroke="#e4e4e7" 
                      strokeWidth="1.5" 
                    />

                    {/* 2024 Black Line */}
                    <path 
                      d="M0,50 Q25,40 50,45 T100,52 T150,75 T200,68 T250,62 T300,48" 
                      fill="none" 
                      stroke="#18181b" 
                      strokeWidth="2" 
                    />

                    {/* Reference Point vertical line */}
                    <line x1="225" y1="20" x2="225" y2="85" stroke="#18181b" strokeWidth="1" strokeDasharray="2,2" />
                    <circle cx="225" cy="65" r="3" fill="#18181b" />
                    <text x="230" y="68" fontSize="8" fontWeight="bold" fill="#18181b">30</text>

                    {/* Highlight Box Area */}
                    <rect x="180" y="20" width="30" height="65" fill="#f4f4f5" opacity="0.4" />
                  </svg>

                  {/* Months labels */}
                  <div className="flex justify-between text-[8px] text-zinc-400 font-semibold px-1 pointer-events-none">
                    <span>January</span>
                    <span>June</span>
                    <span>November</span>
                  </div>
                </div>

                {/* Chart Foot Legend */}
                <div className="flex justify-between items-center text-[10px] text-zinc-500 pt-1">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-300"></span> 2023
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-900"></span> 2024
                    </span>
                  </div>
                  
                  {/* Compare to prior toggle */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px]">Compare to prior</span>
                    <div className="w-6 h-3.5 bg-zinc-900 rounded-full p-0.5 cursor-pointer flex items-center justify-end">
                      <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                    </div>
                  </div>
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
      </div>

      {/* Add Item Dialog Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="bg-white border-zinc-200 text-zinc-900 max-w-lg p-6 rounded-xl shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-zinc-900">Add New Stock Allocation</DialogTitle>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Part Number (SKU)*</label>
                <Input
                  type="text"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs"
                  placeholder="e.g., P-100"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-455 uppercase tracking-wider">Item Name*</label>
                <Input
                  type="text"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs"
                  placeholder="e.g., Metal Bearing"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Category</label>
                <Input
                  type="text"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs"
                  placeholder="e.g., Mechanical"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Unit of Measure</label>
                <Input
                  type="text"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs"
                  value={unitOfMeasure}
                  onChange={(e) => setUnitOfMeasure(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Min Stock Level</label>
                <Input
                  type="number"
                  className="bg-white border-zinc-200 text-zinc-800 text-xs"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Upload Picture</label>
                <Input
                  type="file"
                  className="bg-white border-zinc-200 text-zinc-400 file:text-zinc-800 cursor-pointer text-xs"
                  onChange={handleFileChange}
                  accept="image/*"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Description</label>
              <textarea
                className="w-full min-h-[60px] p-3 rounded-md bg-white border border-zinc-205 text-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-800 resize-none"
                placeholder="Optional item description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="border-t border-zinc-200 pt-4 space-y-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Initial Location Allocation (Optional)</span>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold text-zinc-400">Warehouse</label>
                  <select
                    className="w-full p-2 h-8.5 rounded-md bg-white border border-zinc-200 text-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950"
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
                    className="w-full p-2 h-8.5 rounded-md bg-white border border-zinc-200 text-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950"
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

            <Button type="submit" className="w-full mt-4 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold" disabled={formLoading}>
              {formLoading ? 'Saving...' : 'Save Stock Record'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
