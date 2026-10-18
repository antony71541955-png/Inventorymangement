import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, API_URL } from '../App';
import { 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Boxes, 
  Warehouse, 
  User, 
  Calendar, 
  AlertCircle, 
  Layers, 
  Check, 
  RefreshCw,
  Plus,
  ArrowRight
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { SuccessModal } from "@/components/ui/SuccessModal";
import { cn } from "@/lib/utils";
import { Textarea } from '@/components/ui/textarea';

interface TransferItem {
  id: number;
  request_id: number;
  part_number: string;
  item_name: string;
  quantity: number;
  source_bin: string;
  target_bin?: string;
  accepted_bin?: string;
  batch_no?: string;
  expiry?: string;
}

interface TransferData {
  id: number;
  tr_number: string;
  source_warehouse: string;
  destination_warehouse: string;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  remarks?: string;
  status: string;
  created_at: string;
  updated_at: string;
  total_items: number;
  total_quantity: number;
  items: TransferItem[];
  available_bins: string[];
}

export default function TransferApproval() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [transfer, setTransfer] = useState<TransferData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Allocation mapping: item.id -> selected bin
  const [selectedBins, setSelectedBins] = useState<Record<number, string>>({});
  const [acceptanceRemarks, setAcceptanceRemarks] = useState('');
  
  // Custom bin input per row if user wants to add a new bin
  const [customBinInputs, setCustomBinInputs] = useState<Record<number, string>>({});
  const [showCustomBin, setShowCustomBin] = useState<Record<number, boolean>>({});

  // Submission state
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchTransferDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/internal-transfers/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Transfer request not found or access denied');
      }
      const data: TransferData = await res.json();
      setTransfer(data);

      // Auto-populate bins for items
      const initialBins: Record<number, string> = {};
      data.items.forEach(item => {
        // If already accepted, use accepted_bin
        if (item.accepted_bin) {
          initialBins[item.id] = item.accepted_bin;
        } 
        // If already mentioned in that request, auto populate it!
        else if (item.target_bin) {
          initialBins[item.id] = item.target_bin;
        } 
        // Fallback to first available bin if exists, or empty
        else if (data.available_bins && data.available_bins.length > 0) {
          initialBins[item.id] = data.available_bins[0];
        } else {
          initialBins[item.id] = '';
        }
      });
      setSelectedBins(initialBins);

    } catch (e: any) {
      setError(e.message || 'Failed to load transfer');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchTransferDetails();
    }
  }, [id, token]);

  const handleBinChange = (itemId: number, bin: string) => {
    setSelectedBins(prev => ({ ...prev, [itemId]: bin }));
  };

  const handleAcceptTransfer = async () => {
    if (!transfer) return;

    // Validation: Ensure all items have a chosen bin
    for (const item of transfer.items) {
      const chosenBin = selectedBins[item.id];
      if (!chosenBin || !chosenBin.trim()) {
        setError(`Please assign a destination bin for item: ${item.part_number} (${item.item_name})`);
        return;
      }
    }

    setError(null);
    setIsAccepting(true);

    try {
      const payload = {
        items: transfer.items.map(item => ({
          id: item.id,
          accepted_bin: selectedBins[item.id].trim().toUpperCase()
        })),
        remarks: acceptanceRemarks.trim()
      };

      const res = await fetch(`${API_URL}/api/internal-transfers/${id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to accept transfer');
      }

      setSuccessMessage(
        `Transfer ${transfer.tr_number} accepted successfully! Stock has been allocated to ${transfer.destination_warehouse} bins.`
      );
      
      // Refresh transfer data
      fetchTransferDetails();

    } catch (e: any) {
      setError(e.message || 'Error accepting transfer');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleRejectTransfer = async () => {
    if (!transfer) return;
    setIsRejecting(true);
    try {
      const res = await fetch(`${API_URL}/api/internal-transfers/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: rejectReason.trim() || 'Declined by warehouse admin' })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reject transfer');
      }

      setShowRejectModal(false);
      setSuccessMessage(`Transfer ${transfer.tr_number} has been rejected. Stock returned to ${transfer.source_warehouse}.`);
      fetchTransferDetails();
    } catch (e: any) {
      setError(e.message || 'Error rejecting transfer');
    } finally {
      setIsRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw size={28} className="animate-spin text-indigo-600" />
        <p className="text-sm font-medium text-zinc-500">Loading transfer details...</p>
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
          <AlertCircle size={24} />
        </div>
        <h2 className="text-lg font-bold text-zinc-900">Transfer Request Not Found</h2>
        <p className="text-xs text-zinc-500 mt-1">{error || "The requested transfer ID doesn't exist or was removed."}</p>
        <Button onClick={() => navigate('/transfer-inbox')} className="mt-4 text-xs">
          Back to Transfer Inbox
        </Button>
      </div>
    );
  }

  const isPending = transfer.status === 'Pending Approval';
  const isAccepted = transfer.status === 'Accepted';
  const isRejected = transfer.status === 'Rejected';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/transfer-inbox')}
            className="text-xs text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 gap-1.5 h-8 px-2.5"
          >
            <ArrowLeft size={14} />
            <span>Transfer Inbox</span>
          </Button>
          <span className="text-zinc-300">/</span>
          <span className="text-xs font-semibold text-zinc-800 font-mono">{transfer.tr_number}</span>
        </div>

        <div className="flex items-center gap-2">
          {isPending && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Pending Approval
            </span>
          )}
          {isAccepted && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <CheckCircle2 size={14} />
              Transfer Accepted & Allocated
            </span>
          )}
          {isRejected && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
              <XCircle size={14} />
              Transfer Rejected
            </span>
          )}
        </div>
      </div>

      <SuccessModal
        isOpen={!!successMessage}
        message={successMessage || ''}
        onClose={() => setSuccessMessage(null)}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-lg flex items-start gap-2.5">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Accepted State Banner */}
      {isAccepted && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-950">Transfer Completed & Stock Allocated</h3>
              <p className="text-xs text-emerald-700 mt-0.5">
                Approved by <strong>{transfer.approved_by || 'Admin'}</strong> on{' '}
                {transfer.approved_at ? new Date(transfer.approved_at).toLocaleString() : 'N/A'}. All items have been stored into your warehouse bins.
              </p>
            </div>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => navigate('/inventory')}
            className="text-xs bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100/50 shrink-0"
          >
            View in Inventory
          </Button>
        </div>
      )}

      {/* Transfer Information Card */}
      <Card className="bg-white border-zinc-200/80 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-zinc-900 to-indigo-950 text-white p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-300">Stock Transfer Request</span>
              <h2 className="text-2xl font-bold tracking-tight text-white mt-1">{transfer.tr_number}</h2>
              <p className="text-xs text-zinc-300 mt-1">
                Requested on {transfer.created_at ? new Date(transfer.created_at).toLocaleString() : 'N/A'}
              </p>
            </div>

            {/* Warehouse Movement Visualization */}
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/15">
              <div className="flex flex-col text-right">
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">Source Warehouse</span>
                <span className="text-sm font-bold text-white">{transfer.source_warehouse}</span>
              </div>

              <div className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <ArrowRight size={14} />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-indigo-300 uppercase font-semibold">Destination Warehouse</span>
                <span className="text-sm font-bold text-indigo-200">{transfer.destination_warehouse}</span>
              </div>
            </div>
          </div>
        </div>

        <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-zinc-50/50 border-b border-zinc-100">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Initiated By</span>
            <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-zinc-800">
              <User size={13} className="text-zinc-500" />
              <span>{transfer.created_by || 'Unknown'}</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Total Items</span>
            <span className="text-xs font-semibold text-zinc-800 mt-1 block">
              {transfer.items?.length || transfer.total_items} items ({transfer.total_quantity} pcs)
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Destination Bins Count</span>
            <span className="text-xs font-semibold text-zinc-800 mt-1 block">
              {transfer.available_bins?.length || 0} bins in {transfer.destination_warehouse}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Remarks / Notes</span>
            <span className="text-xs text-zinc-600 mt-1 block italic truncate" title={transfer.remarks}>
              {transfer.remarks || 'No notes provided'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Transferred Items and Destination Bin Allocation */}
      <Card className="bg-white border-zinc-200/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <Boxes size={18} className="text-indigo-600" />
                <span>Transferred Items & Bin Allocation</span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 mt-1">
                {isPending 
                  ? "Select the destination bin in your warehouse for each corresponding item below before accepting the transfer."
                  : "List of items transferred and their allocated bins in your warehouse."}
              </CardDescription>
            </div>

            {isPending && (
              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200/60 flex items-center gap-1.5">
                <Clock size={13} />
                Requires Bin Allocation
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-50 hover:bg-zinc-50 border-b border-zinc-200/80">
                  <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3 pl-6">#</TableHead>
                  <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3">Part Number & Item</TableHead>
                  <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3">Source Bin</TableHead>
                  <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3">Transfer Qty</TableHead>
                  <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3 pr-6 min-w-[280px]">
                    Destination Bin in {transfer.destination_warehouse}*
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfer.items?.map((item, idx) => {
                  const currentBin = selectedBins[item.id] || '';
                  const wasAutoPopulated = !!item.target_bin;
                  const isCustomMode = showCustomBin[item.id];

                  return (
                    <TableRow key={item.id} className="hover:bg-zinc-50/50 border-b border-zinc-100">
                      <TableCell className="py-4 pl-6 text-xs text-zinc-400 font-mono">
                        {idx + 1}
                      </TableCell>

                      <TableCell className="py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-xs text-zinc-900">{item.part_number}</span>
                          <span className="text-xs text-zinc-500 mt-0.5">{item.item_name}</span>
                          {(item.batch_no || item.expiry) && (
                            <span className="text-[10px] text-zinc-400 mt-0.5 font-mono">
                              Batch: {item.batch_no || 'N/A'} • Exp: {item.expiry || 'N/A'}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-4">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-700">
                          <span className="font-mono bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded text-[11px]">
                            {item.source_bin || 'MAIN'}
                          </span>
                          <span className="text-[10px] text-zinc-400">({transfer.source_warehouse})</span>
                        </div>
                      </TableCell>

                      <TableCell className="py-4">
                        <span className="font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md">
                          {item.quantity} pcs
                        </span>
                      </TableCell>

                      <TableCell className="py-4 pr-6">
                        {isPending ? (
                          <div className="space-y-1.5">
                            {!isCustomMode ? (
                              <div className="flex items-center gap-2">
                                <select
                                  value={currentBin}
                                  onChange={(e) => {
                                    if (e.target.value === '__NEW_BIN__') {
                                      setShowCustomBin(prev => ({ ...prev, [item.id]: true }));
                                    } else {
                                      handleBinChange(item.id, e.target.value);
                                    }
                                  }}
                                  className={cn(
                                    "h-9 px-3 text-xs rounded-md border w-full bg-white outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer font-medium",
                                    currentBin 
                                      ? "border-zinc-300 text-zinc-900" 
                                      : "border-amber-300 bg-amber-50/30 text-zinc-500"
                                  )}
                                >
                                  <option value="">-- Select Destination Bin --</option>
                                  {/* If a bin was mentioned in the request and not in available_bins, show it at top */}
                                  {item.target_bin && !transfer.available_bins.includes(item.target_bin) && (
                                    <option value={item.target_bin}>
                                      {item.target_bin} (Suggested in Request)
                                    </option>
                                  )}

                                  {transfer.available_bins?.map(bin => (
                                    <option key={bin} value={bin}>
                                      {bin} {item.target_bin === bin ? '(Mentioned in Request)' : ''}
                                    </option>
                                  ))}
                                  <option value="__NEW_BIN__">+ Enter new bin...</option>
                                </select>

                                <button
                                  type="button"
                                  onClick={() => setShowCustomBin(prev => ({ ...prev, [item.id]: true }))}
                                  title="Enter Custom Bin"
                                  className="h-9 px-2 text-zinc-500 hover:text-zinc-900 border border-zinc-200 rounded-md hover:bg-zinc-100 shrink-0"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="Type new bin code..."
                                  value={currentBin}
                                  onChange={(e) => handleBinChange(item.id, e.target.value.toUpperCase())}
                                  className="h-9 text-xs uppercase font-mono bg-white"
                                  autoFocus
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowCustomBin(prev => ({ ...prev, [item.id]: false }))}
                                  className="text-xs h-9 px-2 text-zinc-500"
                                >
                                  Cancel
                                </Button>
                              </div>
                            )}

                            {wasAutoPopulated && currentBin === item.target_bin && (
                              <span className="text-[10px] text-indigo-600 font-medium block">
                                ✓ Auto-populated from transfer request (can be changed)
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                              {item.accepted_bin || item.target_bin || 'MAIN'}
                            </span>
                            <Check size={14} className="text-emerald-600" />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Bottom Actions Section */}
          {isPending && (
            <div className="p-6 bg-zinc-50/70 border-t border-zinc-200 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="flex-1 max-w-lg">
                <label className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block mb-1.5">
                  Acceptance Remarks (Optional)
                </label>
                <Input
                  placeholder="e.g. Received goods in perfect condition, placed into rack A"
                  value={acceptanceRemarks}
                  onChange={(e) => setAcceptanceRemarks(e.target.value)}
                  className="h-9 text-xs bg-white border-zinc-200"
                />
              </div>

              <div className="flex items-center gap-3 self-end md:self-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRejectModal(true)}
                  disabled={isAccepting || isRejecting}
                  className="text-xs h-10 px-4 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                >
                  <XCircle size={15} className="mr-1.5" />
                  Reject Transfer
                </Button>

                <Button
                  type="button"
                  onClick={handleAcceptTransfer}
                  disabled={isAccepting || isRejecting}
                  className="text-xs h-10 px-6 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 gap-2 transition-all"
                >
                  {isAccepting ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Allocating Stock...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Accept Transfer</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-md w-full bg-white shadow-xl animate-in fade-in-50">
            <CardHeader>
              <CardTitle className="text-base font-bold text-zinc-900 flex items-center gap-2 text-rose-600">
                <XCircle size={18} />
                <span>Reject Transfer Request</span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Are you sure you want to decline this transfer? The deducted stock will be returned back to {transfer.source_warehouse}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Reason for Rejection*
                </label>
                <Textarea
                  placeholder="e.g. Inadequate storage space, wrong item specs, damaged goods..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="text-xs min-h-[80px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRejectModal(false)}
                  disabled={isRejecting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleRejectTransfer}
                  disabled={isRejecting}
                  className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {isRejecting ? 'Rejecting...' : 'Confirm Reject'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
