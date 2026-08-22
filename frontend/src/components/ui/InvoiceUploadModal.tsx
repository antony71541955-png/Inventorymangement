import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Upload, FileText, X, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';

export interface UploadedInvoiceItem {
  id: string;
  part_number: string;
  quantity: number;
  status: 'PENDING' | 'AVAILABLE' | 'TRANSFER_REQUIRED' | 'PART_NOT_FOUND' | 'INVALID';
  message?: string;
  available_in_dis?: number;
}

export interface UploadedInvoiceData {
  invoice_number: string;
  party: string;
  date: string;
  items: UploadedInvoiceItem[];
}

interface InvoiceUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProcess: (data: UploadedInvoiceData) => Promise<void>;
  customers: { id: number; customer_name: string }[];
  existingInvoices: string[];
  inventory: any[]; // List of all inventory items and their locations to check DIS stock
}

export function InvoiceUploadModal({
  isOpen,
  onClose,
  onProcess,
  customers,
  existingInvoices,
  inventory
}: InvoiceUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<UploadedInvoiceData | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setParsedData(null);
    setGlobalError(null);
    setIsParsing(false);
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const parseFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setGlobalError(null);
    setParsedData(null);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      let invoiceNumber = '';
      let party = '';
      let date = '';
      let itemsStartIndex = -1;
      let partNoColIdx = -1;
      let qtyColIdx = -1;

      // Scan rows to find metadata and table headers
      for (let i = 0; i < json.length; i++) {
        const row = json[i];
        if (!row) continue;

        for (let j = 0; j < row.length; j++) {
          const cellStr = String(row[j] || '').trim();
          
          if (cellStr.toLowerCase().includes('invoice no.')) {
            // value is usually in the next cell
            invoiceNumber = String(row[j+1] || '').trim();
          } else if (cellStr.toLowerCase() === 'dated') {
            date = String(row[j+1] || '').trim();
          } else if (cellStr.toLowerCase().includes('party')) {
             // In excel it might be "Party :" in one cell and ":CUSTOMER" in next
             let partyVal = String(row[j+1] || '').trim();
             if (partyVal.startsWith(':')) partyVal = partyVal.substring(1).trim();
             if (partyVal) party = partyVal;
          }

          if (cellStr.toLowerCase() === 'part no.' || cellStr.toLowerCase() === 'part no') {
            itemsStartIndex = i + 1; // items start next row
            partNoColIdx = j;
            
            // look for quantity col in this header row
            for (let k = j + 1; k < row.length; k++) {
              if (String(row[k] || '').trim().toLowerCase() === 'quantity') {
                qtyColIdx = k;
                break;
              }
            }
          }
        }
      }

      if (!invoiceNumber) throw new Error("Could not find 'Invoice No.' in the uploaded file.");
      if (!party) throw new Error("Could not find 'Party' in the uploaded file.");
      if (itemsStartIndex === -1 || partNoColIdx === -1 || qtyColIdx === -1) {
        throw new Error("Could not find 'Part No.' and 'Quantity' table headers.");
      }

      // Check if invoice already exists
      if (existingInvoices.includes(invoiceNumber)) {
        throw new Error(`Invoice number '${invoiceNumber}' already exists in the system.`);
      }

      // Validate Party (case-insensitive loose match)
      const matchedCustomer = customers.find(c => 
        c.customer_name.toLowerCase().replace(/\s+/g, '') === party.toLowerCase().replace(/\s+/g, '') ||
        c.customer_name.toLowerCase().includes(party.toLowerCase()) ||
        party.toLowerCase().includes(c.customer_name.toLowerCase())
      );

      if (!matchedCustomer) {
        throw new Error(`Customer/Party '${party}' does not exist in the system.`);
      }

      const parsedItems: UploadedInvoiceItem[] = [];
      const seenParts = new Set<string>();

      for (let i = itemsStartIndex; i < json.length; i++) {
        const row = json[i];
        if (!row || row.length === 0) continue;
        
        const partNo = String(row[partNoColIdx] || '').trim();
        let qtyStr = String(row[qtyColIdx] || '').trim();
        
        // Remove units like "PCS"
        qtyStr = qtyStr.replace(/[^0-9.]/g, '');
        const quantity = parseFloat(qtyStr);

        if (!partNo) continue; // might be a sub-row or empty row

        if (seenParts.has(partNo)) {
          throw new Error(`Duplicate part number '${partNo}' found in the uploaded file.`);
        }
        seenParts.add(partNo);

        if (isNaN(quantity) || quantity <= 0) {
          parsedItems.push({
            id: Math.random().toString(36).substring(7),
            part_number: partNo,
            quantity: 0,
            status: 'INVALID',
            message: 'Invalid quantity'
          });
          continue;
        }

        // Validate against inventory
        const invItem = inventory.find(inv => inv.part_number === partNo);
        if (!invItem) {
          parsedItems.push({
            id: Math.random().toString(36).substring(7),
            part_number: partNo,
            quantity,
            status: 'PART_NOT_FOUND',
            message: 'Part not in inventory'
          });
          continue;
        }

        // Check DIS stock and other stock
        let disStock = 0;
        let totalOtherStock = 0;
        let otherWarehouses: string[] = [];
        
        if (invItem.locations) {
          const disLocations = invItem.locations.filter((l: any) => l.warehouse === 'DIS');
          disStock = disLocations.reduce((sum: number, loc: any) => sum + loc.quantity, 0);
          
          const otherLocs = invItem.locations.filter((l: any) => l.warehouse !== 'DIS' && l.quantity > 0);
          totalOtherStock = otherLocs.reduce((sum: number, loc: any) => sum + loc.quantity, 0);
          otherWarehouses = Array.from(new Set(otherLocs.map((l: any) => l.warehouse)));
        }

        if (disStock >= quantity) {
          parsedItems.push({
            id: Math.random().toString(36).substring(7),
            part_number: partNo,
            quantity,
            status: 'AVAILABLE',
            message: 'Available in DIS',
            available_in_dis: disStock
          });
        } else if (disStock + totalOtherStock < quantity) {
          parsedItems.push({
            id: Math.random().toString(36).substring(7),
            part_number: partNo,
            quantity,
            status: 'INVALID',
            message: `Insufficient stock globally. Only ${disStock + totalOtherStock} available.`,
            available_in_dis: disStock
          });
        } else {
          const availabilityStr = `Stock in: ${otherWarehouses.join(', ')}`;
            
          parsedItems.push({
            id: Math.random().toString(36).substring(7),
            part_number: partNo,
            quantity,
            status: 'TRANSFER_REQUIRED',
            message: `Requires transfer (${disStock} in DIS). ${availabilityStr}`,
            available_in_dis: disStock
          });
        }
      }

      if (parsedItems.length === 0) {
        throw new Error("No valid items found in the file.");
      }

      setParsedData({
        invoice_number: invoiceNumber,
        party: matchedCustomer.customer_name, // use the matched system name
        date,
        items: parsedItems
      });

    } catch (err: any) {
      setGlobalError(err.message || "Failed to parse file.");
    } finally {
      setIsParsing(false);
    }
  };

  const hasBlockingErrors = parsedData?.items.some(
    i => i.status === 'PART_NOT_FOUND' || i.status === 'INVALID'
  ) || !!globalError;

  const handleSubmit = async () => {
    if (!parsedData || hasBlockingErrors) return;
    setIsProcessing(true);
    try {
      await onProcess(parsedData);
      handleClose();
    } catch (err: any) {
      setGlobalError(err.message || "Failed to process invoice.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden p-0 bg-zinc-50/50">
        <DialogHeader className="px-6 pt-6 pb-4 bg-white border-b border-zinc-200 shrink-0">
          <DialogTitle className="text-xl font-bold text-zinc-900">Upload Invoice</DialogTitle>
          <DialogDescription className="text-sm text-zinc-500">
            Upload an Excel or CSV invoice file to automatically generate Picklists and Transfer Requests.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!file && (
            <div className="border-2 border-dashed border-zinc-300 rounded-xl p-12 flex flex-col items-center justify-center bg-white hover:bg-zinc-50 transition-colors cursor-pointer"
                 onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-12 h-12 text-zinc-400 mb-4" />
              <p className="text-sm font-medium text-zinc-700">Click to upload CSV or Excel file</p>
              <p className="text-xs text-zinc-500 mt-1">Supports .csv, .xlsx, .xls</p>
              <input
                type="file"
                className="hidden"
                accept=".csv, .xlsx, .xls"
                ref={fileInputRef}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) parseFile(f);
                }}
              />
            </div>
          )}

          {isParsing && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
              <p className="text-sm font-medium text-zinc-600">Parsing file...</p>
            </div>
          )}

          {globalError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-red-900">Upload Error</p>
                <p className="text-xs text-red-700">{globalError}</p>
              </div>
              <Button variant="outline" size="sm" className="ml-auto bg-white" onClick={resetState}>
                Try Again
              </Button>
            </div>
          )}

          {parsedData && !globalError && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="grid grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Invoice No</p>
                  <p className="font-bold text-zinc-900 mt-1">{parsedData.invoice_number}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Customer / Party</p>
                  <p className="font-bold text-zinc-900 mt-1">{parsedData.party}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Date</p>
                  <p className="font-bold text-zinc-900 mt-1">{parsedData.date || 'N/A'}</p>
                </div>
              </div>

              {hasBlockingErrors && (
                 <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                   <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                   <div className="space-y-1">
                     <p className="text-sm font-bold text-amber-900">Validation Errors Found</p>
                     <p className="text-xs text-amber-700">Please fix the errors below (e.g., missing parts) and re-upload the invoice, or setup the missing items in the system first.</p>
                   </div>
                 </div>
              )}

              <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-500 bg-zinc-50 uppercase border-b border-zinc-100">
                    <tr>
                      <th className="px-4 py-3">Part No.</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {parsedData.items.map((item) => (
                      <tr key={item.id} className="hover:bg-zinc-50/50">
                        <td className="px-4 py-3 font-medium text-zinc-900">{item.part_number}</td>
                        <td className="px-4 py-3 text-right font-bold text-zinc-700">{item.quantity}</td>
                        <td className="px-4 py-3">
                          {item.status === 'AVAILABLE' && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                              <CheckCircle2 size={12} /> OK
                            </span>
                          )}
                          {item.status === 'TRANSFER_REQUIRED' && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[11px] font-semibold">
                              <RefreshCw size={12} /> TRANSFER
                            </span>
                          )}
                          {(item.status === 'PART_NOT_FOUND' || item.status === 'INVALID') && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 text-red-700 text-[11px] font-semibold">
                              <X size={12} /> ERROR
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-600">
                          {item.message}
                          {item.status === 'PART_NOT_FOUND' && (
                            <a href="/stock-item-setup" target="_blank" className="ml-2 text-indigo-600 hover:underline">Setup Item ↗</a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 bg-white border-t border-zinc-200 shrink-0 flex items-center justify-between">
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <div className="flex gap-2">
            {file && <Button variant="outline" onClick={resetState}>Change File</Button>}
            <Button 
              onClick={handleSubmit} 
              disabled={!parsedData || hasBlockingErrors || isProcessing}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isProcessing ? 'Processing...' : 'Create Picklist & Transfers'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
