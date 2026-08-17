import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, API_URL } from '../App';
import { useLocation } from 'react-router-dom';
import { 
  RefreshCw, 
  MapPin, 
  ArrowRight, 
  Calendar, 
  User, 
  FileText,
  AlertCircle,
  Plus,
  Trash2,
  ChevronDown,
  Check
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface LocationItem {
  part_number: string;
  item_name: string;
  warehouse: string;
  bin_location: string;
  quantity: number;
}

interface TransferRecord {
  id: number;
  voucher_number: string;
  part_number: string;
  item_name: string;
  from_warehouse: string;
  from_bin: string;
  to_warehouse: string;
  to_bin: string;
  quantity: number;
  user_name: string;
  remarks: string;
  timestamp: string;
}

function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  emptyText = "No results found.",
  className,
  disabled = false
}: {
  options: { label: string; value: string | number }[];
  value: string | number;
  onChange: (val: string | number) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal text-xs bg-white border-zinc-200 px-3", className)}
          disabled={disabled}
        >
          <span className="truncate pr-2">
            {selectedOption ? selectedOption.label : <span className="text-zinc-500">{placeholder}</span>}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
          <CommandInput placeholder="Search..." className="h-9 text-xs" />
          <CommandList className="max-h-[200px]">
            <CommandEmpty className="text-xs py-2 text-center text-zinc-500">{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="text-xs cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SearchableMultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder = "Select...",
  emptyText = "No results found.",
  disabled = false,
  className
}: {
  options: { label: React.ReactNode; textValue: string; value: number }[];
  selectedValues: number[];
  onChange: (val: number) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal text-xs bg-white border-zinc-200 px-3", className)}
          disabled={disabled}
        >
          {selectedValues.length > 0 
            ? `${selectedValues.length} item(s) selected` 
            : <span className="text-zinc-500">{placeholder}</span>}
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
          <CommandInput placeholder="Search items..." className="h-9 text-xs" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty className="text-xs py-2 text-center text-zinc-500">{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.textValue}
                    onSelect={() => {
                      onChange(option.value);
                    }}
                    className="text-xs py-2 cursor-pointer"
                  >
                    <div className={cn("mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border", isSelected ? "bg-zinc-900 border-zinc-900 text-white" : "border-zinc-300 opacity-50")}>
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div>{option.label}</div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function StockTransfer() {
  const { user } = useAuth();
  const location = useLocation();
  
  // Data states
  const [itemsPool, setItemsPool] = useState<LocationItem[]>([]);
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // Source selection states
  const [sourceWarehouse, setSourceWarehouse] = useState<string>('');
  const [selectedSourceItems, setSelectedSourceItems] = useState<number[]>([]);
  
  // Destination form states
  interface Destination {
    sourceItemIndex: number | '';
    toWarehouse: string;
    toBin: string;
    qtyToTransfer: string;
    remarks: string;
  }
  const [destinations, setDestinations] = useState<Destination[]>([
    { sourceItemIndex: '', toWarehouse: '', toBin: '', qtyToTransfer: '1', remarks: 'Location stock transfer' }
  ]);
  
  // Status states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

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

  // Fetch all stock rows to populate the transfer pool
  const fetchPool = async () => {
    setLoadingItems(true);
    try {
      const res = await fetch(`${API_URL}/api/inventory?limit=1000&sort_by=part_number`);
      const data = await res.json();
      
      const flattened: LocationItem[] = [];
      if (data.items) {
        data.items.forEach((item: any) => {
          item.locations.forEach((loc: any) => {
            if (loc.quantity > 0) {
              flattened.push({
                part_number: item.part_number,
                item_name: item.item_name,
                warehouse: loc.warehouse,
                bin_location: loc.bin_location,
                quantity: loc.quantity
              });
            }
          });
        });
      }
      setItemsPool(flattened);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingItems(false);
    }
  };

  // Fetch transfer logs history
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_URL}/api/transfers`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Barcode Scanner Integration
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 100) {
        barcodeBuffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 0) {
          const scannedPartNumber = barcodeBuffer.trim();
          
          let foundAny = false;
          let addedCount = 0;
          let newWarehouse = '';
          
          setSelectedSourceItems(prev => {
            const newSelected = [...prev];
            itemsPool.forEach((item, index) => {
              if (item.part_number.toLowerCase() === scannedPartNumber.toLowerCase()) {
                foundAny = true;
                if (!newSelected.includes(index)) {
                  newSelected.push(index);
                  addedCount++;
                  if (!newWarehouse) newWarehouse = item.warehouse;
                }
              }
            });
            
            setTimeout(() => {
              if (addedCount > 0) {
                if (newWarehouse) {
                  // Only auto-set if it's empty. Since we can't reliably read sourceWarehouse here without making it a dependency, 
                  // we will just unconditionally set it using functional state update if it was empty.
                  setSourceWarehouse(prevWh => prevWh ? prevWh : newWarehouse);
                }
                setSuccess(`Barcode scanned: ${scannedPartNumber} selected.`);
                setTimeout(() => setSuccess(null), 3000);
              } else if (!foundAny) {
                setError(`Barcode scanned: ${scannedPartNumber} not found in inventory.`);
                setTimeout(() => setError(null), 3000);
              }
            }, 0);

            return newSelected;
          });

          barcodeBuffer = '';
        }
      } else if (e.key.length === 1) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [itemsPool]);

  useEffect(() => {
    fetchPool();
    fetchHistory();
    fetchLocations();
  }, []);

  useEffect(() => {
    if (user?.role === 'warehouse_admin' && user?.warehouse_code) {
      setSourceWarehouse(user.warehouse_code);
    }
  }, [user]);

  // Pre-fill logic for picklist decisions
  useEffect(() => {
    if (itemsPool.length > 0 && location.state?.prefillItems) {
      const prefillItems = location.state.prefillItems;
      const newSelectedSourceItems: number[] = [];
      const newDestinations: Destination[] = [];
      
      prefillItems.forEach((prefillItem: any) => {
        // Find matching item in pool
        const matchIndex = itemsPool.findIndex(
          p => p.part_number === prefillItem.part_number && 
               p.warehouse === prefillItem.from_warehouse && 
               p.bin_location === prefillItem.from_bin
        );
        
        if (matchIndex !== -1) {
          newSelectedSourceItems.push(matchIndex);
          newDestinations.push({
            sourceItemIndex: matchIndex,
            toWarehouse: '',
            toBin: '',
            qtyToTransfer: prefillItem.quantity.toString(),
            remarks: `Transfer for Picklist #${location.state.picklist_id || ''}`
          });
        }
      });
      
      if (newSelectedSourceItems.length > 0) {
        setSelectedSourceItems(newSelectedSourceItems);
        // Only set source warehouse if they all share the same source warehouse
        const uniqueWarehouses = [...new Set(newSelectedSourceItems.map(i => itemsPool[i].warehouse))];
        if (uniqueWarehouses.length === 1) {
          setSourceWarehouse(uniqueWarehouses[0]);
        }
        setDestinations(newDestinations);
      }
    }
  }, [itemsPool, location.state]);

  const warehouseItems = useMemo(() => {
    if (!sourceWarehouse) {
      return itemsPool.map((item, index) => ({ item, index }));
    }
    return itemsPool.map((item, index) => ({ item, index })).filter(({ item }) => item.warehouse === sourceWarehouse);
  }, [itemsPool, sourceWarehouse]);

  const handleSourceWarehouseChange = (wh: string) => {
    setSourceWarehouse(wh);
    setSelectedSourceItems([]);
    setDestinations([{ sourceItemIndex: '', toWarehouse: '', toBin: '', qtyToTransfer: '1', remarks: 'Location stock transfer' }]);
    setError(null);
  };

  const toggleSourceItem = (index: number) => {
    const item = itemsPool[index];
    setSourceWarehouse(prev => prev ? prev : item.warehouse);
    
    setSelectedSourceItems(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else {
        return [...prev, index];
      }
    });
    setDestinations(prev => prev.map(d => 
      d.sourceItemIndex === index ? { ...d, sourceItemIndex: '' } : d
    ));
    setError(null);
  };

  const updateDestination = (index: number, field: keyof Destination, value: string | number) => {
    const newDestinations = [...destinations];
    newDestinations[index] = { ...newDestinations[index], [field]: value };
    if (field === 'toWarehouse') {
        newDestinations[index].toBin = '';
    }
    if (field === 'sourceItemIndex' && value !== '') {
        const selectedItem = itemsPool[value as number];
        if (selectedItem) {
            newDestinations[index].toWarehouse = selectedItem.warehouse;
            
            // Auto-add to selected source items if not already there so validation passes
            setSelectedSourceItems(prev => {
              if (!prev.includes(value as number)) {
                return [...prev, value as number];
              }
              return prev;
            });
        }
    }
    setDestinations(newDestinations);
  };

  const addDestination = () => {
    setDestinations([...destinations, { sourceItemIndex: '', toWarehouse: '', toBin: '', qtyToTransfer: '1', remarks: 'Location stock transfer' }]);
  };

  const removeDestination = (index: number) => {
    if (destinations.length > 1) {
      const newDestinations = destinations.filter((_, i) => i !== index);
      setDestinations(newDestinations);
    }
  };

  const handlePostTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setPosting(true);

    if (!sourceWarehouse) {
      setError('Please select a source warehouse.');
      setPosting(false);
      return;
    }

    if (selectedSourceItems.length === 0) {
      setError('Please select at least one item to transfer.');
      setPosting(false);
      return;
    }

    // Validation
    const qtyMap: Record<number, number> = {};
    
    for (let i = 0; i < destinations.length; i++) {
      const dest = destinations[i];
      
      if (dest.sourceItemIndex === '') {
        setError(`Please select an item for destination row ${i + 1}.`);
        setPosting(false);
        return;
      }
      
      const qty = parseInt(dest.qtyToTransfer) || 0;
      if (qty <= 0) {
        setError(`Transfer quantity must be greater than 0 for destination ${i + 1}.`);
        setPosting(false);
        return;
      }
      if (!dest.toWarehouse.trim() || !dest.toBin.trim()) {
        setError(`Destination warehouse and bin are mandatory for destination ${i + 1}.`);
        setPosting(false);
        return;
      }
      
      const sourceItem = itemsPool[dest.sourceItemIndex as number];
      if (sourceItem.warehouse === dest.toWarehouse.trim() && sourceItem.bin_location === dest.toBin.trim()) {
        setError(`Destination location cannot be identical to the source location for destination ${i + 1}.`);
        setPosting(false);
        return;
      }
      
      qtyMap[dest.sourceItemIndex as number] = (qtyMap[dest.sourceItemIndex as number] || 0) + qty;
    }

    for (const [indexStr, totalQty] of Object.entries(qtyMap)) {
      const idx = parseInt(indexStr);
      const sourceItem = itemsPool[idx];
      if (totalQty > sourceItem.quantity) {
        setError(`Insufficient stock for ${sourceItem.part_number}. Total transfer quantity (${totalQty}) exceeds available (${sourceItem.quantity} pcs).`);
        setPosting(false);
        return;
      }
    }

    try {
      const vouchers = [];
      for (const dest of destinations) {
        const qty = parseInt(dest.qtyToTransfer);
        const sourceItem = itemsPool[dest.sourceItemIndex as number];
        const res = await fetch(`${API_URL}/api/transfers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            part_number: sourceItem.part_number,
            from_warehouse: sourceItem.warehouse,
            from_bin: sourceItem.bin_location,
            to_warehouse: dest.toWarehouse.trim(),
            to_bin: dest.toBin.trim(),
            quantity: qty,
            remarks: dest.remarks.trim()
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Transfer posting failed for a destination');
        }
        vouchers.push(data.voucher);
      }

      setSuccess(`Journal Voucher(s) posted successfully: ${vouchers.join(', ')}`);
      
      // Reset form fields
      setSourceWarehouse('');
      setSelectedSourceItems([]);
      setDestinations([{ sourceItemIndex: '', toWarehouse: '', toBin: '', qtyToTransfer: '1', remarks: 'Location stock transfer' }]);

      // Refresh data
      fetchPool();
      fetchHistory();
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setPosting(false);
    }
  };

  // Compute options for dropdowns
  const warehouseOptions = Object.keys(locations).map(wh => ({ label: wh, value: wh }));
  
  const multiSelectItems = warehouseItems.map(({ item, index }) => ({
    label: (
      <div className="flex flex-col">
        <span className="font-semibold">{item.part_number} <span className="font-normal text-zinc-600">- {item.item_name}</span></span>
        <span className="text-[10px] text-zinc-500">Bin: {item.bin_location} | Bal: {item.quantity}</span>
      </div>
    ),
    textValue: `${item.part_number} ${item.item_name} ${item.bin_location}`, // searchable text
    value: index
  }));

  const selectedItemsOptions = selectedSourceItems.map(idx => {
    const item = itemsPool[idx];
    return {
      label: `${item.part_number} - ${item.item_name} (Bal: ${item.quantity}) - Bin: ${item.bin_location}`,
      value: idx
    };
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Stock Transfer Journal</h1>
        <p className="text-zinc-500 text-sm mt-1.5">Record item movements between warehouses and bins with chronological voucher audit logs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Post Transfer card (takes 2/3 width) */}
        <Card className="lg:col-span-2 bg-white border border-zinc-200/80 rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-zinc-900">Record New Transfer</CardTitle>
            <CardDescription className="text-xs text-zinc-500">Post transaction to journal logs and update stock locations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-550/10 border border-red-500/20 text-red-750 text-xs p-3.5 rounded-lg flex items-start gap-2.5">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs p-3.5 rounded-lg">
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handlePostTransfer} className="space-y-4.5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Source Warehouse*</label>
                  <SearchableSelect
                    options={warehouseOptions}
                    value={sourceWarehouse}
                    onChange={(val) => handleSourceWarehouseChange(val as string)}
                    placeholder="-- Select Source Warehouse --"
                    className="h-[38px]"
                    disabled={user?.role === 'warehouse_admin'}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Select Items*</label>
                  <SearchableMultiSelect
                    options={multiSelectItems}
                    selectedValues={selectedSourceItems}
                    onChange={toggleSourceItem}
                    placeholder="-- Select Items --"
                    disabled={loadingItems}
                    className="h-[38px]"
                  />
                </div>
              </div>

              {selectedSourceItems.length > 0 && (
                <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-lg space-y-2 text-xs">
                  <div className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Selected Source Items</div>
                  <ul className="space-y-1 mt-2">
                    {selectedSourceItems.map(index => {
                      const item = itemsPool[index];
                      return (
                        <li key={index} className="flex justify-between items-center text-zinc-650 border-b border-zinc-100 pb-1.5 pt-1.5 last:border-0 last:pb-0">
                          <span className="truncate pr-4"><strong className="text-zinc-800">{item.part_number}</strong> - {item.item_name}</span>
                          <span className="text-[10px] whitespace-nowrap shrink-0">Bin: <strong className="text-zinc-800">{item.bin_location}</strong> | Bal: <strong className="text-zinc-950">{item.quantity} pcs</strong></span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="space-y-4 border-t border-zinc-100 pt-4 mt-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Destination Locations</label>
                  <Button type="button" variant="outline" size="sm" onClick={addDestination} className="h-7 text-xs bg-white text-zinc-700 hover:text-zinc-900 border-zinc-200">
                    <Plus size={14} className="mr-1" /> Add Location
                  </Button>
                </div>

                <div className="space-y-3">
                  {destinations.map((dest, index) => (
                    <div key={index} className="p-3.5 bg-zinc-50 border border-zinc-200/60 rounded-lg relative space-y-3.5 group">
                      {destinations.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => removeDestination(index)}
                          className="absolute -right-2 -top-2 bg-white hover:bg-red-50 text-red-500 rounded-full p-1 border border-zinc-200 hover:border-red-200 shadow-sm transition-colors z-10 opacity-0 group-hover:opacity-100"
                          title="Remove location"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}

                      <div className="grid grid-cols-1">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider">Transfer Item*</label>
                          <SearchableSelect
                            options={selectedItemsOptions}
                            value={dest.sourceItemIndex}
                            onChange={(val) => updateDestination(index, 'sourceItemIndex', val)}
                            placeholder="-- Select Item --"
                            className="h-9"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider">Warehouse*</label>
                          <SearchableSelect
                            options={warehouseOptions}
                            value={dest.toWarehouse}
                            onChange={(val) => updateDestination(index, 'toWarehouse', val as string)}
                            placeholder="-- Select --"
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider">Bin*</label>
                          <SearchableSelect
                            options={(locations[dest.toWarehouse] || []).map(bin => ({ label: bin, value: bin }))}
                            value={dest.toBin}
                            onChange={(val) => updateDestination(index, 'toBin', val as string)}
                            placeholder="-- Select --"
                            disabled={!dest.toWarehouse}
                            className="h-9"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1 col-span-1">
                          <label className="text-[9px] font-bold text-zinc-455 uppercase tracking-wider">Qty*</label>
                          <Input
                            type="number"
                            className="bg-white border-zinc-200 text-zinc-800 focus-visible:ring-zinc-900 text-xs h-9"
                            min={1}
                            max={dest.sourceItemIndex !== '' ? itemsPool[dest.sourceItemIndex as number].quantity : undefined}
                            value={dest.qtyToTransfer}
                            onChange={(e) => updateDestination(index, 'qtyToTransfer', e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <label className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider">Remarks</label>
                          <Input
                            type="text"
                            className="bg-white border-zinc-200 text-zinc-800 focus-visible:ring-zinc-900 text-xs h-9"
                            value={dest.remarks}
                            onChange={(e) => updateDestination(index, 'remarks', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full mt-2 bg-zinc-950 hover:bg-zinc-900 text-white font-semibold" disabled={posting}>
                <RefreshCw size={16} className={`mr-2 ${posting ? 'animate-spin' : ''}`} />
                <span>{posting ? 'Posting Voucher...' : 'Post Transfer Journal'}</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Visual Map Pin Shortcut (takes 1/3 width) */}
        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm h-full flex flex-col justify-center min-h-[320px]">
          <CardContent className="p-6 text-center">
            {selectedSourceItems.length > 0 ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3 justify-center">
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-xl w-28">
                    <MapPin size={22} className="text-zinc-500 mx-auto mb-2" />
                    <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">From</div>
                    <strong className="block text-xs truncate mt-1 text-zinc-800">{sourceWarehouse}</strong>
                    <span className="text-[10px] text-zinc-500">{selectedSourceItems.length} Item(s) Selected</span>
                  </div>
                  <ArrowRight size={20} className="text-zinc-400" />
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-xl w-28">
                    <MapPin size={22} className="text-zinc-500 mx-auto mb-2" />
                    <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">To</div>
                    {destinations.length === 1 ? (
                      <>
                        <strong className="block text-xs truncate mt-1 text-zinc-800">{destinations[0].toWarehouse || '?'}</strong>
                        <span className="text-[10px] text-zinc-500">Bin: {destinations[0].toBin || '?'}</span>
                      </>
                    ) : (
                      <>
                        <strong className="block text-xs truncate mt-1 text-zinc-800">{destinations.length} Locations</strong>
                        <span className="text-[10px] text-zinc-500">Multiple Bins</span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">
                    Transferring {destinations.reduce((sum, dest) => sum + (parseInt(dest.qtyToTransfer) || 0), 0)} pcs total
                  </h3>
                </div>
              </div>
            ) : (
              <div className="text-zinc-400 space-y-3">
                <RefreshCw size={40} className="mx-auto text-zinc-300" />
                <p className="text-xs leading-relaxed max-w-[200px] mx-auto">Select source items to show the movement visualizer</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transfer History Log Table */}
      <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-zinc-900">Journal History Log</CardTitle>
          <CardDescription className="text-xs text-zinc-500">Complete audit trail of all location transfers</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-2">
          <div className="overflow-x-auto border-t sm:border border-zinc-200 sm:rounded-lg">
            <Table>
              <TableHeader className="bg-zinc-50/70">
                <TableRow className="border-b border-zinc-200">
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Voucher No</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Part No</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Item Name</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">From Location</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">To Location</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Qty</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">User Action</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Timestamp</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingHistory ? (
                  <TableRow className="border-b border-zinc-100">
                    <TableCell colSpan={9} className="text-center py-8 text-zinc-400 text-xs">
                      Loading transfer history logs...
                    </TableCell>
                  </TableRow>
                ) : history.length === 0 ? (
                  <TableRow className="border-b border-zinc-100">
                    <TableCell colSpan={9} className="text-center py-8 text-zinc-400 text-xs">
                      No transfer journal records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((record) => (
                    <TableRow key={record.id} className="border-b border-zinc-100/80 hover:bg-zinc-50/50">
                      <TableCell className="font-bold text-zinc-900 text-xs">{record.voucher_number}</TableCell>
                      <TableCell className="font-bold text-zinc-900 text-xs">{record.part_number}</TableCell>
                      <TableCell className="text-zinc-700 text-xs font-semibold max-w-[120px] truncate">{record.item_name}</TableCell>
                      <TableCell className="text-xs">
                        <span className="text-zinc-700 font-semibold">{record.from_warehouse}</span>
                        <span className="text-[10px] block text-zinc-500">Bin: {record.from_bin}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="text-zinc-700 font-semibold">{record.to_warehouse}</span>
                        <span className="text-[10px] block text-zinc-500">Bin: {record.to_bin}</span>
                      </TableCell>
                      <TableCell className="text-right font-extrabold text-zinc-950 text-xs">{record.quantity}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-zinc-500" />
                          <span className="text-zinc-650">{record.user_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5 text-zinc-500 whitespace-nowrap">
                          <Calendar size={12} />
                          <span>{new Date(record.timestamp).toLocaleString()}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-650">
                        <div className="flex items-center gap-1.5 max-w-[150px] truncate">
                          <FileText size={12} className="shrink-0 text-zinc-400" />
                          <span>{record.remarks}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
