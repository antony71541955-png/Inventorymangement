import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, API_URL } from '../App';
import { useLocation, useNavigate } from 'react-router-dom';
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
  Check,
  ScanBarcode,
  ArrowRightLeft,
  ArrowLeft,
  Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ScannerModal } from "@/components/ui/ScannerModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedInput } from "@/components/ui/ValidatedInput";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SuccessModal } from "@/components/ui/SuccessModal";
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
  options: { label: React.ReactNode; textValue: string; value: string; partNumber?: string }[];
  selectedValues: string[];
  onChange: (val: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  
  const filteredOptions = React.useMemo(() => {
    let cleanSearch = search;
    if (cleanSearch.includes(';')) cleanSearch = cleanSearch.split(';')[0];
    
    if (!cleanSearch.trim()) return options;
    const term = cleanSearch.trim().toLowerCase();
    return options.filter(opt => String(opt.textValue || '').toLowerCase().includes(term));
  }, [options, search]);

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
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search items..." 
            className="h-9 text-xs" 
            value={search}
            onValueChange={(val) => {
              console.log("Scanner input changed to:", val);
              
              // Clean QR code suffixes like ";1"
              let cleanVal = val;
              if (cleanVal.includes(';')) {
                 cleanVal = cleanVal.split(';')[0];
              }
              
              setSearch(cleanVal);
              const term = cleanVal.trim().toLowerCase();
              if (term) {
                // If it's an exact match of a part number, automatically check it!
                const exactMatch = options.find(opt => String(opt.partNumber || '').toLowerCase() === term);
                if (exactMatch) {
                  console.log("Exact match found, auto-selecting:", exactMatch.partNumber);
                  onChange(exactMatch.value);
                  setSearch('');
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                console.log("Scanner hit Enter! Current value is:", e.currentTarget.value);
                
                let cleanVal = e.currentTarget.value;
                if (cleanVal.includes(';')) {
                   cleanVal = cleanVal.split(';')[0];
                }
                
                const term = cleanVal.trim().toLowerCase();
                if (term) {
                  // Prioritize exact match on partNumber for 5-digit numbers
                  let match = options.find(opt => String(opt.partNumber || '').toLowerCase() === term);
                  
                  // Fallback to searching the full text
                  if (!match) {
                     match = options.find(opt => String(opt.textValue || '').toLowerCase().includes(term));
                  }
                  
                  if (match) {
                    console.log("Enter key matched:", match.textValue);
                    onChange(match.value);
                    setSearch('');
                    e.preventDefault();
                  }
                }
              }
            }}
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty className="text-xs py-2 text-center text-zinc-500">{emptyText}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.textValue}
                    onSelect={() => {
                      onChange(option.value);
                      setSearch(''); // Clear search after selection to allow next scan
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
  const { user, token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Data states
  const [itemsPool, setItemsPool] = useState<LocationItem[]>([]);
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // Source selection states
  const [sourceWarehouse, setSourceWarehouse] = useState<string>('');
  interface SelectedSource {
    part_number: string;
    item_name: string;
    sourceItemIndex: number;
    transferQty: string;
  }
  const [selectedSources, setSelectedSources] = useState<SelectedSource[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trNumber, setTrNumber] = useState('');
  const [trId, setTrId] = useState<number | null>(null);
  
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState(false);

  // Scanner States
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerSuccess, setScannerSuccess] = useState<string | null>(null);

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
      const url = `${API_URL}/api/inventory?limit=5000&sort_by=part_number`;
      const res = await fetch(url);
      const data = await res.json();
      
      const flattened: LocationItem[] = [];
      if (data.items) {
        data.items.forEach((item: any) => {
          // Aggregate locations by warehouse and bin to avoid duplicate rows for different batches
          const aggregated = new Map<string, any>();
          item.locations.forEach((loc: any) => {
            if (loc.quantity > 0) {
              const key = `${loc.warehouse}|${loc.bin_location}`;
              if (aggregated.has(key)) {
                aggregated.get(key)!.quantity += loc.quantity;
              } else {
                aggregated.set(key, { ...loc });
              }
            }
          });
          
          aggregated.forEach((loc) => {
            flattened.push({
              part_number: item.part_number,
              item_name: item.item_name,
              warehouse: loc.warehouse,
              bin_location: loc.bin_location,
              quantity: loc.quantity
            });
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
  const handleScan = (scannedPartNumber: string) => {
    setScannerError(null);
    setScannerSuccess(null);
    
    const matchingItems = itemsPool.map((item, index) => ({ item, index })).filter(x => x.item.part_number.toLowerCase() === scannedPartNumber.toLowerCase());
    
    if (matchingItems.length > 0) {
        const defaultOption = matchingItems.reduce((prev, current) => (prev.item.quantity > current.item.quantity) ? prev : current);
        const newIndex = defaultOption.index;
        const item = defaultOption.item;
        
        setSelectedSources(prev => {
            if (prev.find(s => s.part_number === item.part_number)) {
                return prev; // already added
            }
            
            setTimeout(() => {
                setSourceWarehouse(prevWh => prevWh ? prevWh : item.warehouse);
                setDestinations(curr => {
                    let newDestinations = [...curr];
                    const hasEmpty = newDestinations.length === 1 && newDestinations[0].sourceItemIndex === '';
                    if (hasEmpty) newDestinations = [];
                    newDestinations.push({
                        sourceItemIndex: newIndex,
                        toWarehouse: '',
                        toBin: '',
                        qtyToTransfer: '1',
                        remarks: 'Location stock transfer'
                    });
                    return newDestinations;
                });
                setScannerSuccess(`Scanned: ${scannedPartNumber} selected.`);
                setTimeout(() => setScannerSuccess(null), 3000);
            }, 0);
            
            return [...prev, {
                part_number: item.part_number,
                item_name: item.item_name,
                sourceItemIndex: newIndex,
                transferQty: '1'
            }];
        });
    } else {
        setScannerError(`Barcode scanned: ${scannedPartNumber} not found.`);
        setTimeout(() => setScannerError(null), 3000);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchLocations();
    fetchPool();
  }, []);

  useEffect(() => {
    if (user?.role === 'warehouse_admin' && user?.warehouse_code) {
      setSourceWarehouse(user.warehouse_code);
    }
  }, [user]);

  useEffect(() => {
    if (step === 1 && !trId && token) {
      const url = sourceWarehouse 
        ? `${API_URL}/api/internal-transfers/next-number?warehouse=${encodeURIComponent(sourceWarehouse)}`
        : `${API_URL}/api/internal-transfers/next-number`;
        
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.tr_number) setTrNumber(data.tr_number); })
      .catch(console.error);
    }
  }, [sourceWarehouse, step, trId, token]);


  // Pre-fill logic for picklist decisions
  useEffect(() => {
    if (itemsPool.length > 0 && location.state?.prefillItems) {
      const prefillItems = location.state.prefillItems;
      const newSelectedSources: SelectedSource[] = [];
      const newDestinations: Destination[] = [];
      
      prefillItems.forEach((prefillItem: any) => {
        const matchIndex = itemsPool.findIndex(
          p => p.part_number === prefillItem.part_number && 
               p.warehouse === prefillItem.from_warehouse && 
               p.bin_location === prefillItem.from_bin
        );
        
        if (matchIndex !== -1) {
          const item = itemsPool[matchIndex];
          if (!newSelectedSources.find(s => s.part_number === item.part_number)) {
            newSelectedSources.push({
              part_number: item.part_number,
              item_name: item.item_name,
              sourceItemIndex: matchIndex,
              transferQty: prefillItem.quantity.toString()
            });
          }
          
          newDestinations.push({
            sourceItemIndex: matchIndex,
            toWarehouse: '',
            toBin: '',
            qtyToTransfer: prefillItem.quantity.toString(),
            remarks: `Transfer for Picklist #${location.state.picklist_id || ''}${location.state.invoice_number ? ` (Inv: ${location.state.invoice_number})` : ''}`
          });
        }
      });
      
      if (newSelectedSources.length > 0) {
        setSelectedSources(newSelectedSources);
        const uniqueWarehouses = [...new Set(newSelectedSources.map(s => itemsPool[s.sourceItemIndex].warehouse))];
        if (uniqueWarehouses.length === 1) {
          setSourceWarehouse(uniqueWarehouses[0]);
        }
        setDestinations(newDestinations);
      }

      // Clear the location state so it doesn't prefill again on subsequent re-renders (e.g. after posting transfer)
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [itemsPool, location.state, navigate, location.pathname]);

  const warehouseItems = useMemo(() => {
    if (!sourceWarehouse) {
      return itemsPool.map((item, index) => ({ item, index }));
    }
    return itemsPool.map((item, index) => ({ item, index })).filter(({ item }) => item.warehouse === sourceWarehouse);
  }, [itemsPool, sourceWarehouse]);

  const handleSourceWarehouseChange = (wh: string) => {
    setSourceWarehouse(wh);
    setSelectedSources([]);
    setDestinations([{ sourceItemIndex: '', toWarehouse: '', toBin: '', qtyToTransfer: '1', remarks: 'Location stock transfer' }]);
    setError(null);
  };

  const toggleSourceItem = (part_number: string) => {
    setSelectedSources(prev => {
      const existing = prev.find(s => s.part_number === part_number);
      if (existing) {
        return prev.filter(s => s.part_number !== part_number);
      } else {
        const itemOptions = warehouseItems.filter(w => w.item.part_number === part_number);
        if (itemOptions.length === 0) return prev;
        
        const defaultOption = itemOptions.reduce((acc, current) => (acc.item.quantity > current.item.quantity) ? acc : current);
        const newIndex = defaultOption.index;
        const item = defaultOption.item;
        
        setTimeout(() => {
          setSourceWarehouse(prevWh => prevWh ? prevWh : item.warehouse);
        }, 0);
        
        return [...prev, {
          part_number: item.part_number,
          item_name: item.item_name,
          sourceItemIndex: newIndex,
          transferQty: '1'
        }];
      }
    });
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
            
            setSelectedSources(prev => {
              if (!prev.find(s => s.sourceItemIndex === value)) {
                return [...prev, {
                  part_number: selectedItem.part_number,
                  item_name: selectedItem.item_name,
                  sourceItemIndex: value as number,
                  transferQty: '1'
                }];
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

  const handleNextStep = async () => {
    if (!sourceWarehouse) {
      setError('Please select a source warehouse.');
      return;
    }
    if (selectedSources.length === 0) {
      setError('Please select at least one item to transfer.');
      return;
    }
    
    let hasErrors = false;
    for (const source of selectedSources) {
       const qty = parseInt(source.transferQty) || 0;
       const poolItem = itemsPool[source.sourceItemIndex];
       if (qty <= 0) {
          setError(`Transfer quantity for ${source.part_number} must be > 0`);
          hasErrors = true;
          break;
       }
       if (qty > poolItem.quantity) {
          setError(`Insufficient stock for ${source.part_number}. Request (${qty}) exceeds available (${poolItem.quantity}).`);
          hasErrors = true;
          break;
       }
    }
    if (hasErrors) return;

    setError(null);
    setIsSubmitting(true);
    
    try {
      const draftItems = selectedSources.map(s => {
        const item = itemsPool[s.sourceItemIndex];
        return {
          part_number: item.part_number,
          item_name: item.item_name,
          source_bin: item.bin_location,
          quantity: parseInt(s.transferQty) || 0
        };
      });
      
      const method = trId ? 'PUT' : 'POST';
      const url = trId ? `${API_URL}/api/internal-transfers/${trId}` : `${API_URL}/api/internal-transfers`;
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tr_number: trNumber,
          source_warehouse: sourceWarehouse,
          items: draftItems
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save transfer request.');
      
      if (data.id) setTrId(data.id);
      if (data.tr_number) setTrNumber(data.tr_number);
      
      const newDests = selectedSources.map(s => ({
         sourceItemIndex: s.sourceItemIndex,
         toWarehouse: '',
         toBin: '',
         qtyToTransfer: s.transferQty,
         remarks: `Transfer Request ${data.tr_number || trNumber}`
      }));
      setDestinations(newDests);
      
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const generatePDF = (currentStep: 1 | 2) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(currentStep === 1 ? 'Transfer Request Summary' : 'Transfer Summary', 14, 20);
    doc.setFontSize(11);
    doc.text(`TR Number: ${trNumber}`, 14, 30);
    doc.text(`Source Warehouse: ${sourceWarehouse}`, 14, 38);
    doc.text(`Date: ${new Date().toLocaleString()}`, 14, 46);

    const tableColumn = currentStep === 1 
      ? ["Part No.", "Description", "Source Bin", "Available Qty", "Transfer Qty"]
      : ["Part No.", "Description", "Source Bin", "Destination", "Transfer Qty"];

    const tableRows: any[] = [];
    if (currentStep === 1) {
      selectedSources.forEach(s => {
        const item = itemsPool[s.sourceItemIndex];
        tableRows.push([
          item.part_number, item.item_name, item.bin_location, item.quantity, s.transferQty
        ]);
      });
    } else {
      destinations.forEach(d => {
        const item = itemsPool[d.sourceItemIndex as number];
        tableRows.push([
          item.part_number, item.item_name, item.bin_location, `${d.toWarehouse} / ${d.toBin}`, d.qtyToTransfer
        ]);
      });
    }

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 55,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] }
    });

    doc.save(`${trNumber || 'Transfer'}_Summary.pdf`);
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

    if (selectedSources.length === 0) {
      setError('Please select at least one item to transfer.');
      setPosting(false);
      return;
    }

    // Validation
    const qtyMap: Record<number, number> = {};
    let hasErrors = false;
    const newErrors: Record<string, string> = {};
    
    for (let i = 0; i < destinations.length; i++) {
      const dest = destinations[i];
      let rowError = '';
      
      if (dest.sourceItemIndex === '') {
        rowError = 'Please select an item for this destination.';
        hasErrors = true;
      } else {
        const qty = parseInt(dest.qtyToTransfer) || 0;
        if (qty <= 0) {
          newErrors[`qty_${i}`] = `Must be > 0`;
          hasErrors = true;
        }
        
        if (!dest.toWarehouse.trim()) {
          rowError = 'Destination warehouse is mandatory.';
          hasErrors = true;
        } else if (sourceWarehouse === dest.toWarehouse.trim() && !dest.toBin.trim()) {
          rowError = 'Destination bin is mandatory for transfers within the same warehouse.';
          hasErrors = true;
        } else {
          const sourceItem = itemsPool[dest.sourceItemIndex as number];
          if (sourceItem.warehouse === dest.toWarehouse.trim() && sourceItem.bin_location === dest.toBin.trim()) {
            rowError = 'Destination location cannot be identical to the source location.';
            hasErrors = true;
          }
        }
        
        qtyMap[dest.sourceItemIndex as number] = (qtyMap[dest.sourceItemIndex as number] || 0) + qty;
      }
      
      if (rowError) {
        newErrors[`row_${i}`] = rowError;
      }
    }

    if (hasErrors) {
      setErrors(newErrors);
      setPosting(false);
      return;
    }
    setErrors({});

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
      const interWarehouseDests = destinations.filter(d => d.toWarehouse.trim() !== sourceWarehouse);
      const sameWarehouseDests = destinations.filter(d => d.toWarehouse.trim() === sourceWarehouse);
      const successMessages: string[] = [];

      // 1. Process Inter-Warehouse Transfers -> Submit to Transfer Inbox
      if (interWarehouseDests.length > 0) {
        const groupedByDest: Record<string, typeof destinations> = {};
        for (const d of interWarehouseDests) {
          const wh = d.toWarehouse.trim();
          if (!groupedByDest[wh]) groupedByDest[wh] = [];
          groupedByDest[wh].push(d);
        }

        let isFirstDest = true;
        for (const [destWh, destList] of Object.entries(groupedByDest)) {
          const itemsPayload = destList.map(dest => {
            const sourceItem = itemsPool[dest.sourceItemIndex as number];
            return {
              part_number: sourceItem.part_number,
              item_name: sourceItem.item_name,
              quantity: parseInt(dest.qtyToTransfer),
              source_bin: sourceItem.bin_location,
              target_bin: dest.toBin.trim() || undefined
            };
          });

          const currentTrId = isFirstDest ? trId : undefined;
          const currentTrNum = isFirstDest ? trNumber : undefined;
          isFirstDest = false;

          const res = await fetch(`${API_URL}/api/internal-transfers/submit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              tr_id: currentTrId,
              tr_number: currentTrNum,
              source_warehouse: sourceWarehouse,
              destination_warehouse: destWh,
              remarks: destList[0]?.remarks?.trim() || `Inter-warehouse transfer ${currentTrNum || ''}`,
              items: itemsPayload
            })
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || `Transfer request submission failed for ${destWh}`);
          }
          successMessages.push(`Transfer Request ${data.tr_number || trNumber} submitted to ${destWh} for approval in Transfer Inbox.`);
        }
      }

      // 2. Process Same-Warehouse Transfers -> Direct Journal Transfer
      if (sameWarehouseDests.length > 0) {
        const vouchers = [];
        for (const dest of sameWarehouseDests) {
          const qty = parseInt(dest.qtyToTransfer);
          const sourceItem = itemsPool[dest.sourceItemIndex as number];
          const res = await fetch(`${API_URL}/api/transfers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              part_number: sourceItem.part_number,
              from_warehouse: sourceItem.warehouse,
              from_bin: sourceItem.bin_location,
              to_warehouse: dest.toWarehouse.trim(),
              to_bin: dest.toBin.trim(),
              quantity: qty,
              remarks: dest.remarks.trim(),
              tr_number: trNumber
            })
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Transfer posting failed for a destination');
          }
          vouchers.push(data.voucher);
        }
        successMessages.push(`Journal Voucher(s) posted for same-warehouse transfer: ${vouchers.join(', ')}`);
      }

      setSuccess(successMessages.join(' '));
      
      // Reset form fields
      if (user?.role === 'warehouse_admin' && user?.warehouse_code) {
        setSourceWarehouse(user.warehouse_code);
      } else {
        setSourceWarehouse('');
      }
      setSelectedSources([]);
      setDestinations([{ sourceItemIndex: '', toWarehouse: '', toBin: '', qtyToTransfer: '1', remarks: 'Location stock transfer' }]);
      setTrId(null);
      setStep(1);

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
  
  const multiSelectItems = useMemo(() => {
    const map = new Map<string, any>();
    warehouseItems.forEach(({ item, index }) => {
       if (!map.has(item.part_number)) {
         map.set(item.part_number, { item, index });
       } else {
         if (item.quantity > map.get(item.part_number).item.quantity) {
           map.set(item.part_number, { item, index });
         }
       }
    });

    return Array.from(map.values()).map(({ item, index }) => {
      const totalBal = warehouseItems.filter(w => w.item.part_number === item.part_number).reduce((acc, curr) => acc + curr.item.quantity, 0);
      return {
        label: (
          <div className="flex flex-col">
            <span className="font-semibold">{item.part_number} <span className="font-normal text-zinc-600">- {item.item_name}</span></span>
            <span className="text-[10px] text-zinc-500">Total Bal: {totalBal} pcs</span>
          </div>
        ),
        textValue: `${item.part_number} ${item.item_name}`,
        partNumber: item.part_number,
        value: item.part_number
      };
    });
  }, [warehouseItems]);

  const selectedItemsOptions = selectedSources.map(s => {
    const item = itemsPool[s.sourceItemIndex];
    return {
      label: `${item.part_number} - ${item.item_name} (Bal: ${item.quantity}) - Bin: ${item.bin_location}`,
      value: s.sourceItemIndex
    };
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#8F2C00] to-[#1F8F00] bg-clip-text text-transparent flex items-center gap-3">
            <ArrowRightLeft className="text-[#8F2C00]" size={32} />
            Stock Transfer Journal
          </h1>
          <p className="text-zinc-500 text-sm mt-1.5">Record item movements between warehouses and bins with chronological voucher audit logs.</p>
        </div>
        <Button onClick={() => setIsScannerOpen(true)} className="gap-2 shrink-0">
          <ScanBarcode size={16} /> Scan Item
        </Button>
      </div>

      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => {
          setIsScannerOpen(false);
          setScannerError(null);
          setScannerSuccess(null);
        }}
        onScan={handleScan}
        error={scannerError}
        successMessage={scannerSuccess}
      />

      <div className="w-full">
        {/* Main Form card */}
        <Card className="w-full bg-white border border-zinc-200/80 rounded-xl shadow-sm">
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

            <SuccessModal
              isOpen={!!success}
              message={success}
              onClose={() => setSuccess(null)}
            />

            {step === 1 ? (
              <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">TR Number</label>
                  <Input 
                    readOnly 
                    value={trNumber || 'Auto-generated'} 
                    className="bg-zinc-100 border-zinc-200 text-zinc-500 cursor-not-allowed h-[38px] text-xs font-semibold" 
                  />
                </div>
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
                    selectedValues={selectedSources.map(s => s.part_number)}
                    onChange={toggleSourceItem}
                    placeholder="-- Select Items --"
                    disabled={loadingItems}
                    className="h-[38px]"
                  />
                </div>
              </div>

              {selectedSources.length > 0 && (
                <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-lg space-y-2 text-xs mt-6">
                  <div className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Selected Source Items</div>
                  <ul className="space-y-3 mt-2">
                    {selectedSources.map((source) => {
                      const item = itemsPool[source.sourceItemIndex];
                      const availableBins = warehouseItems.filter(w => w.item.part_number === source.part_number);
                      
                      return (
                        <li key={source.part_number} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3 last:border-0 last:pb-0">
                          <div className="flex-1">
                             <span className="truncate pr-4"><strong className="text-zinc-800">{item.part_number}</strong> - {item.item_name}</span>
                          </div>
                          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                             <div className="flex items-center gap-2">
                               <span className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider shrink-0">Source Bin:</span>
                               <select 
                                 className="h-8 text-xs border border-zinc-300 rounded-md w-full sm:w-32 bg-white px-2 focus:ring-1 focus:ring-zinc-900 outline-none cursor-pointer"
                                 value={source.sourceItemIndex}
                                 onChange={(e) => {
                                    const newIndex = Number(e.target.value);
                                    setSelectedSources(prev => prev.map(s => s.part_number === source.part_number ? { ...s, sourceItemIndex: newIndex } : s));
                                 }}
                               >
                                 {availableBins.map(b => (
                                   <option key={b.index} value={b.index}>{b.item.bin_location} (Bal: {b.item.quantity})</option>
                                 ))}
                               </select>
                             </div>
                             <div className="flex items-center gap-2">
                               <span className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider shrink-0">Qty:</span>
                               <input
                                 type="number"
                                 className="h-8 text-xs border border-zinc-300 rounded-md w-16 bg-white px-2 focus:ring-1 focus:ring-zinc-900 outline-none"
                                 min="1"
                                 max={item.quantity}
                                 value={source.transferQty}
                                 onChange={(e) => {
                                    setSelectedSources(prev => prev.map(s => s.part_number === source.part_number ? { ...s, transferQty: e.target.value } : s));
                                 }}
                               />
                             </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}


                <div className="flex gap-3 justify-end border-t border-zinc-100 pt-4 mt-4">
                  <Button type="button" variant="outline" onClick={() => generatePDF(1)}>
                    <Download size={16} className="mr-2" /> Download PDF
                  </Button>
                  <Button type="button" onClick={handleNextStep} disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Next Step'} <ArrowRight size={16} className="ml-2" />
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePostTransfer} className="space-y-4.5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Destination Locations Setup</label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)}>
                      Back to Step 1
                    </Button>
                  </div>

                <div className="space-y-3">
                  {destinations.map((dest, index) => (
                    <div key={index} className={`p-3.5 bg-zinc-50 border ${errors[`row_${index}`] ? 'border-red-300' : 'border-zinc-200/60'} rounded-lg relative space-y-3.5 group`}>


                      {errors[`row_${index}`] && (
                        <div className="bg-red-50 text-red-600 text-xs p-2 rounded border border-red-100 flex items-center gap-1.5">
                           <AlertCircle size={14} className="shrink-0" />
                           {errors[`row_${index}`]}
                        </div>
                      )}

                      <div className="grid grid-cols-1">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider">Transfer Item*</label>
                          <div className="h-9 px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-md text-xs text-zinc-700 flex items-center">
                            {dest.sourceItemIndex !== '' ? (() => {
                              const item = itemsPool[dest.sourceItemIndex as number];
                              return <span className="font-semibold">{item.part_number} <span className="font-normal">- {item.item_name} (Source: {item.bin_location})</span></span>;
                            })() : 'Unknown'}
                          </div>
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
                          <label className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider">
                            Bin {dest.toWarehouse && dest.toWarehouse !== sourceWarehouse ? '(Suggested in Request / Optional)' : '*'}
                          </label>
                          <SearchableSelect
                            options={(locations[dest.toWarehouse] || []).map(bin => ({ label: bin, value: bin }))}
                            value={dest.toBin}
                            onChange={(val) => updateDestination(index, 'toBin', val as string)}
                            placeholder={dest.toWarehouse && dest.toWarehouse !== sourceWarehouse ? "-- Optional Suggested Bin --" : "-- Select --"}
                            disabled={!dest.toWarehouse}
                            className="h-9"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1 col-span-1">
                          <ValidatedInput
                            label="Qty"
                            type="number"
                            className="bg-white border-zinc-200 text-zinc-800 focus-visible:ring-zinc-900 text-xs h-9"
                            min={1}
                            max={dest.sourceItemIndex !== '' ? itemsPool[dest.sourceItemIndex as number].quantity : undefined}
                            value={dest.qtyToTransfer}
                            onChange={(e) => {
                              updateDestination(index, 'qtyToTransfer', e.target.value);
                              if (errors[`qty_${index}`]) setErrors({ ...errors, [`qty_${index}`]: '' });
                            }}
                            error={errors[`qty_${index}`]}
                            required
                          />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <ValidatedInput
                            label="Remarks"
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

              <div className="flex gap-3 justify-end mt-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} className="mr-2" /> Back
                </Button>
                <Button type="button" variant="outline" onClick={() => generatePDF(2)}>
                  <Download size={16} className="mr-2" /> PDF
                </Button>
                <Button type="submit" disabled={posting}>
                  <RefreshCw size={16} className={`mr-2 ${posting ? 'animate-spin' : ''}`} />
                  <span>
                    {posting 
                      ? 'Processing...' 
                      : destinations.some(d => d.toWarehouse && d.toWarehouse !== sourceWarehouse)
                        ? 'Submit Transfer for Approval' 
                        : 'Post Transfer'}
                  </span>
                </Button>
              </div>
            </form>
            )}
          </CardContent>
        </Card>

        {/* Visual Map Pin Shortcut (takes 1/3 width) */}
        {/* <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm h-full flex flex-col justify-center min-h-[320px]">
          <CardContent className="p-6 text-center">
            {selectedSources.length > 0 ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3 justify-center">
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-xl w-28">
                    <MapPin size={22} className="text-zinc-500 mx-auto mb-2" />
                    <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">From</div>
                    <strong className="block text-xs truncate mt-1 text-zinc-800">{sourceWarehouse}</strong>
                    <span className="text-[10px] text-zinc-500">{selectedSources.length} Item(s) Selected</span>
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
        </Card> */}
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
