import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ValidatedInput } from "@/components/ui/ValidatedInput";
import { SuccessModal } from "@/components/ui/SuccessModal";
import { Search, Loader2, ClipboardCheck } from 'lucide-react';

interface Picklist {
  id: number;
  customer_id: number;
  customer_name: string;
  invoice_number: string;
  status: string;
  created_at: string;
}

interface PicklistItem {
  id: number;
  part_number: string;
  item_name: string;
  quantity: number;
  warehouse: string;
  bin_location: string;
  batch_no: string;
  expiry: string;
}

export default function QualityCheck() {
  const { token, user } = useAuth();
  const [picklists, setPicklists] = useState<Picklist[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal State
  const [selectedPicklist, setSelectedPicklist] = useState<Picklist | null>(null);
  const [picklistItems, setPicklistItems] = useState<PicklistItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // QC Verification State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [verifiedItems, setVerifiedItems] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    fetchPicklists();
  }, [token]);

  const fetchPicklists = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/dispatch_picklists`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Only show 'Created' status picklists (pending QC)
        setPicklists(data.filter((p: Picklist) => p.status === 'Created'));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = async (picklist: Picklist) => {
    setSelectedPicklist(picklist);
    setInvoiceNumber(picklist.invoice_number || '');
    setVerifiedItems(new Set());
    setErrors({});
    setIsModalOpen(true);
    setModalLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/dispatch_picklists/${picklist.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPicklistItems(data.items || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleItem = (itemId: number) => {
    setVerifiedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleQCApprove = async () => {
    const newErrors: Record<string, string> = {};
    if (!invoiceNumber.trim()) {
      newErrors.invoiceNumber = "Invoice Number is required";
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (verifiedItems.size !== picklistItems.length) {
      alert("Please confirm all items before approving.");
      return;
    }

    if (!selectedPicklist) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/dispatch_picklists/${selectedPicklist.id}/qc_approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          invoice_number: invoiceNumber.trim()
        })
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        setShowSuccessModal(true);
        fetchPicklists();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to approve QC.");
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred while approving QC.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleString('en-GB', { month: 'short' });
    const year = d.getFullYear();
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();
    return `${day}-${month}-${year} ${time}`;
  };

  const filteredPicklists = picklists.filter(p => 
    p.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.invoice_number && p.invoice_number.toLowerCase().includes(search.toLowerCase()))
  );

  const allItemsVerified = picklistItems.length > 0 && verifiedItems.size === picklistItems.length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#8F2C00] to-[#1F8F00] bg-clip-text text-transparent flex items-center gap-3">
          <ClipboardCheck className="text-[#8F2C00]" size={32} />
          Quality Check
        </h1>
        <p className="text-zinc-500 text-sm mt-1">Verify picklist items and approve for dispatch.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
          <div>
            <CardTitle className="text-lg">Created Picklists</CardTitle>
            <p className="text-xs text-zinc-500 mt-1">Select a picklist to perform QC.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input 
              type="text"
              placeholder="Search by customer or invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-zinc-50">
                <TableRow>
                  <TableHead className="font-semibold text-zinc-900">Picklist ID</TableHead>
                  <TableHead className="font-semibold text-zinc-900">Customer</TableHead>
                  <TableHead className="font-semibold text-zinc-900">Invoice #</TableHead>
                  <TableHead className="font-semibold text-zinc-900">Created At</TableHead>
                  <TableHead className="font-semibold text-zinc-900 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                      Loading picklists...
                    </TableCell>
                  </TableRow>
                ) : filteredPicklists.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                      No created picklists pending QC found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPicklists.map(p => (
                    <TableRow 
                      key={p.id} 
                      className="cursor-pointer hover:bg-zinc-50 transition-colors"
                      onClick={() => handleRowClick(p)}
                    >
                      <TableCell className="font-medium text-indigo-600">PL-{p.id.toString().padStart(4, '0')}</TableCell>
                      <TableCell>{p.customer_name}</TableCell>
                      <TableCell>{p.invoice_number}</TableCell>
                      <TableCell>{formatDateTime(p.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleRowClick(p); }}>
                          Perform QC
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Quality Check Verification</DialogTitle>
            <DialogDescription>
              Verify items for Picklist PL-{selectedPicklist?.id?.toString().padStart(4, '0')} - {selectedPicklist?.customer_name}
            </DialogDescription>
          </DialogHeader>

          {modalLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-zinc-400" size={32} />
            </div>
          ) : (
            <div className="space-y-6 py-4">
              <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 uppercase mb-1">Customer Name</label>
                  <div className="font-medium text-zinc-900">{selectedPicklist?.customer_name}</div>
                </div>
                <div>
                  <ValidatedInput
                    label="Invoice Number *"
                    value={invoiceNumber}
                    onChange={(e) => { setInvoiceNumber(e.target.value); setErrors({}); }}
                    error={errors.invoiceNumber}
                    placeholder="Enter invoice number..."
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-zinc-900 mb-3 flex items-center justify-between">
                  <span>Inventory Items Verification</span>
                  <span className="text-xs font-normal text-zinc-500 bg-zinc-100 px-2 py-1 rounded-full">
                    {verifiedItems.size} / {picklistItems.length} Verified
                  </span>
                </h3>
                
                <div className="border border-zinc-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200">
                      <tr>
                        <th className="px-4 py-3 w-12 text-center">Verify</th>
                        <th className="px-4 py-3">Part Number</th>
                        <th className="px-4 py-3">Item Name</th>
                        <th className="px-4 py-3">Location / Details</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {picklistItems.map((item) => (
                        <tr key={item.id} className={verifiedItems.has(item.id) ? "bg-green-50/50" : "bg-white"}>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={verifiedItems.has(item.id)}
                              onChange={() => handleToggleItem(item.id)}
                              className="w-4 h-4 text-indigo-600 rounded border-zinc-300 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-900">{item.part_number}</td>
                          <td className="px-4 py-3 text-zinc-600">{item.item_name}</td>
                          <td className="px-4 py-3 text-xs text-zinc-500">
                            <div>Warehouse: {item.warehouse}</div>
                            {item.bin_location && <div>Bin: {item.bin_location}</div>}
                            {item.batch_no && <div>Batch: {item.batch_no} | Exp: {item.expiry}</div>}
                          </td>
                          <td className="px-4 py-3 font-bold text-zinc-900 text-right">{item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-zinc-100 pt-4">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white" 
              onClick={handleQCApprove} 
              disabled={isSubmitting || modalLoading || !allItemsVerified || !invoiceNumber.trim()}
            >
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving...</> : 'QC Approved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SuccessModal 
        isOpen={showSuccessModal} 
        onClose={() => setShowSuccessModal(false)} 
        message="Quality Check Approved successfully!" 
      />
    </div>
  );
}
