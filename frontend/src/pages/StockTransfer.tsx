import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { 
  RefreshCw, 
  MapPin, 
  ArrowRight, 
  Calendar, 
  User, 
  FileText,
  AlertCircle
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";

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

export default function StockTransfer() {
  const { user } = useAuth();
  
  // Data states
  const [itemsPool, setItemsPool] = useState<LocationItem[]>([]);
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // Selected item location index
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  
  // Destination form states
  const [toWarehouse, setToWarehouse] = useState('');
  const [toBin, setToBin] = useState('');
  const [qtyToTransfer, setQtyToTransfer] = useState('1');
  const [remarks, setRemarks] = useState('Location stock transfer');
  
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

  useEffect(() => {
    fetchPool();
    fetchHistory();
    fetchLocations();
  }, []);

  const handlePostTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setPosting(true);

    if (selectedIndex === -1) {
      setError('Please select an item allocation to transfer.');
      setPosting(false);
      return;
    }

    const selectedItem = itemsPool[selectedIndex];
    const qty = parseInt(qtyToTransfer);

    if (qty <= 0) {
      setError('Transfer quantity must be greater than 0.');
      setPosting(false);
      return;
    }

    if (qty > selectedItem.quantity) {
      setError(`Insufficient stock. Maximum available is ${selectedItem.quantity} pcs.`);
      setPosting(false);
      return;
    }

    if (!toWarehouse.trim() || !toBin.trim()) {
      setError('Destination warehouse and bin locations are mandatory.');
      setPosting(false);
      return;
    }

    if (selectedItem.warehouse === toWarehouse.trim() && selectedItem.bin_location === toBin.trim()) {
      setError('Destination location cannot be identical to the source location.');
      setPosting(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          part_number: selectedItem.part_number,
          from_warehouse: selectedItem.warehouse,
          from_bin: selectedItem.bin_location,
          to_warehouse: toWarehouse.trim(),
          to_bin: toBin.trim(),
          quantity: qty,
          remarks: remarks.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Transfer posting failed');
      }

      setSuccess(`Journal Voucher posted successfully: ${data.voucher}`);
      
      // Reset form fields
      setSelectedIndex(-1);
      setToWarehouse('');
      setToBin('');
      setQtyToTransfer('1');
      setRemarks('Location stock transfer');

      // Refresh data
      fetchPool();
      fetchHistory();
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setPosting(false);
    }
  };

  const selectedItem = selectedIndex !== -1 ? itemsPool[selectedIndex] : null;

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
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Select Item & Allocation Source*</label>
                <select
                  className="w-full p-2.5 rounded-md bg-white border border-zinc-200 text-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  value={selectedIndex}
                  onChange={(e) => {
                    setSelectedIndex(parseInt(e.target.value));
                    setError(null);
                  }}
                >
                  <option value={-1}>-- Select Available Stock Bin --</option>
                  {loadingItems ? (
                    <option disabled>Loading allocations...</option>
                  ) : (
                    itemsPool.map((item, idx) => (
                      <option key={idx} value={idx}>
                        {item.part_number} - {item.item_name} | {item.warehouse} ({item.bin_location}) | Bal: {item.quantity}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {selectedItem && (
                <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-lg space-y-2 text-xs">
                  <div className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Source Details</div>
                  <div className="flex justify-between">
                    <span className="text-zinc-650">Warehouse: <strong className="text-zinc-800">{selectedItem.warehouse}</strong></span>
                    <span className="text-zinc-650">Bin: <strong className="text-zinc-800">{selectedItem.bin_location}</strong></span>
                    <span className="text-zinc-950 font-bold">Balance: {selectedItem.quantity} pcs</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Destination Warehouse*</label>
                  <select
                    className="w-full p-2.5 h-10 rounded-md bg-white border border-zinc-200 text-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    value={toWarehouse}
                    onChange={(e) => {
                      setToWarehouse(e.target.value);
                      setToBin(''); // Reset bin when warehouse changes
                    }}
                    required
                  >
                    <option value="">-- Select Warehouse --</option>
                    {Object.keys(locations).map((wh) => (
                      <option key={wh} value={wh}>{wh}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Destination Bin*</label>
                  <select
                    className="w-full p-2.5 h-10 rounded-md bg-white border border-zinc-200 text-zinc-800 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    value={toBin}
                    onChange={(e) => setToBin(e.target.value)}
                    required
                    disabled={!toWarehouse}
                  >
                    <option value="">-- Select Bin --</option>
                    {(locations[toWarehouse] || []).map((bin) => (
                      <option key={bin} value={bin}>{bin}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5 col-span-1">
                  <label className="text-[10px] font-bold text-zinc-455 uppercase tracking-wider">Quantity to Transfer*</label>
                  <Input
                    type="number"
                    className="bg-white border-zinc-200 text-zinc-800 focus-visible:ring-zinc-900 text-xs h-10"
                    min={1}
                    max={selectedItem ? selectedItem.quantity : undefined}
                    value={qtyToTransfer}
                    onChange={(e) => setQtyToTransfer(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider">Remarks</label>
                  <Input
                    type="text"
                    className="bg-white border-zinc-200 text-zinc-800 focus-visible:ring-zinc-900 text-xs h-10"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
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
            {selectedItem ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3 justify-center">
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-xl w-28">
                    <MapPin size={22} className="text-zinc-500 mx-auto mb-2" />
                    <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">From</div>
                    <strong className="block text-xs truncate mt-1 text-zinc-800">{selectedItem.warehouse}</strong>
                    <span className="text-[10px] text-zinc-500">Bin: {selectedItem.bin_location}</span>
                  </div>
                  <ArrowRight size={20} className="text-zinc-400" />
                  <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-xl w-28">
                    <MapPin size={22} className="text-zinc-500 mx-auto mb-2" />
                    <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">To</div>
                    <strong className="block text-xs truncate mt-1 text-zinc-800">{toWarehouse || '?'}</strong>
                    <span className="text-[10px] text-zinc-500">Bin: {toBin || '?'}</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Transferring {qtyToTransfer} pcs</h3>
                  <p className="text-xs text-zinc-555 mt-1">Item: <strong>{selectedItem.part_number}</strong> ({selectedItem.item_name})</p>
                </div>
              </div>
            ) : (
              <div className="text-zinc-400 space-y-3">
                <RefreshCw size={40} className="mx-auto text-zinc-300" />
                <p className="text-xs leading-relaxed max-w-[200px] mx-auto">Select a source item allocation to show the movement visualizer</p>
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
