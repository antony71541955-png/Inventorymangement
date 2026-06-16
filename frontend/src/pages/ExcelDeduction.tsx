import React, { useState, useRef } from 'react';
import { useAuth, API_URL } from '../App';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Download,
  Clock,
  Warehouse,
  Grid3X3,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface DeductedItem {
  part_number: string;
  item_name: string;
  quantity: number;
}

export default function ExcelDeduction() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('deduction');
  
  // Tab 1: Deduction states
  const [deductFile, setDeductFile] = useState<File | null>(null);
  const [deductLoading, setDeductLoading] = useState(false);
  const deductFileInputRef = useRef<HTMLInputElement>(null);
  const [deductValidationErrors, setDeductValidationErrors] = useState<string[]>([]);
  const [deductGeneralError, setDeductGeneralError] = useState<string | null>(null);
  const [deductSuccessMsg, setDeductSuccessMsg] = useState<string | null>(null);
  const [deductVoucher, setDeductVoucher] = useState<string | null>(null);
  const [deductedItems, setDeductedItems] = useState<DeductedItem[]>([]);

  // Tab 2: Reconciliation states
  const [reconFile, setReconFile] = useState<File | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const reconFileInputRef = useRef<HTMLInputElement>(null);
  const [reconValidationErrors, setReconValidationErrors] = useState<string[]>([]);
  const [reconGeneralError, setReconGeneralError] = useState<string | null>(null);
  const [reconSuccessMsg, setReconSuccessMsg] = useState<string | null>(null);
  const [reconVoucher, setReconVoucher] = useState<string | null>(null);
  const [reconItemCount, setReconItemCount] = useState<number>(0);
  const [createdWarehouses, setCreatedWarehouses] = useState<string[]>([]);
  const [createdBins, setCreatedBins] = useState<string[]>([]);

  // --- TAB 1 handlers ---
  const handleDeductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setDeductFile(e.target.files[0]);
      clearDeductResults();
    }
  };

  const clearDeductResults = () => {
    setDeductValidationErrors([]);
    setDeductGeneralError(null);
    setDeductSuccessMsg(null);
    setDeductVoucher(null);
    setDeductedItems([]);
  };

  const handleDeductUpload = async () => {
    if (!deductFile) return;
    setDeductLoading(true);
    clearDeductResults();

    const formData = new FormData();
    formData.append('file', deductFile);

    try {
      const res = await fetch(`${API_URL}/api/deductions/excel`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      
      if (res.status === 422) {
        setDeductValidationErrors(data.validation_errors || []);
      } else if (!res.ok) {
        throw new Error(data.error || 'Failed to process spreadsheet');
      } else {
        setDeductSuccessMsg(data.success || 'Spreadsheet processed successfully.');
        setDeductVoucher(data.voucher || '');
        setDeductedItems(data.deducted_items || []);
        setDeductFile(null);
      }
    } catch (e: any) {
      setDeductGeneralError(e.message || 'An error occurred while uploading.');
    } finally {
      setDeductLoading(false);
    }
  };

  const downloadDeductTemplate = () => {
    const csvContent = 'part_number,quantity\nP1001,15\nP1002,8\nP1003,25\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'daily_consumption_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- TAB 2 handlers ---
  const handleReconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setReconFile(e.target.files[0]);
      clearReconResults();
    }
  };

  const clearReconResults = () => {
    setReconValidationErrors([]);
    setReconGeneralError(null);
    setReconSuccessMsg(null);
    setReconVoucher(null);
    setReconItemCount(0);
    setCreatedWarehouses([]);
    setCreatedBins([]);
  };

  const handleReconUpload = async () => {
    if (!reconFile) return;
    setReconLoading(true);
    clearReconResults();

    const formData = new FormData();
    formData.append('file', reconFile);

    try {
      const res = await fetch(`${API_URL}/api/inventory/reconciliation`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      
      if (res.status === 422) {
        setReconValidationErrors(data.validation_errors || []);
      } else if (!res.ok) {
        throw new Error(data.error || 'Failed to process reconciliation sheet');
      } else {
        setReconSuccessMsg(data.success || 'Reconciliation completed successfully.');
        setReconVoucher(data.voucher || '');
        setReconItemCount(data.item_count || 0);
        setCreatedWarehouses(data.created_warehouses || []);
        setCreatedBins(data.created_bins || []);
        setReconFile(null);
      }
    } catch (e: any) {
      setReconGeneralError(e.message || 'An error occurred while uploading.');
    } finally {
      setReconLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 font-sans">Spreadsheet Imports</h1>
        <p className="text-zinc-500 text-sm mt-1.5 font-medium">Batch process warehouse inventory using structured Excel or CSV spreadsheet logs.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-100 border border-zinc-200 p-1 rounded-lg">
          <TabsTrigger value="deduction" className="text-xs font-semibold text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
            Daily Stock Deduction
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="text-xs font-semibold text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
            Physical Stock Reconciliation (Last Day Upload)
          </TabsTrigger>
        </TabsList>

        {/* TAB Trigger 1: DEDUCTIONS */}
        <TabsContent value="deduction" className="outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Card */}
            <Card className="bg-white border border-zinc-200 rounded-xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-zinc-900">Deduction Spreadsheet</CardTitle>
                <CardDescription className="text-xs text-zinc-500 font-medium">
                  The uploaded sheet must contain columns mapping to <strong>Part Number / SKU</strong> and <strong>Quantity</strong>. The deduction validates all rows and executes in an all-or-nothing transaction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div 
                  className="border-2 border-dashed border-zinc-200 hover:border-zinc-900 rounded-xl p-8 text-center cursor-pointer transition-colors bg-zinc-50/50 flex flex-col items-center justify-center min-h-[180px]"
                  onClick={() => deductFileInputRef.current?.click()}
                >
                  <UploadCloud size={40} className="text-zinc-400 mb-3" />
                  {deductFile ? (
                    <div>
                      <strong className="text-sm text-zinc-800 block">{deductFile.name}</strong>
                      <div className="text-[10px] text-zinc-400 mt-1">
                        {(deductFile.size / 1024).toFixed(1)} KB - Ready to process
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <strong className="text-xs text-zinc-755 block">Click to select consumption file</strong>
                      <div className="text-[10px] text-zinc-400">
                        Supports .xlsx, .xls, and .csv
                      </div>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={deductFileInputRef} 
                    style={{ display: 'none' }} 
                    accept=".xlsx,.xls,.csv"
                    onChange={handleDeductFileChange}
                  />
                </div>

                <div className="flex gap-3">
                  <Button 
                    className="flex-1 bg-[#0e121e] hover:bg-zinc-900 text-white font-semibold h-10"
                    disabled={!deductFile || deductLoading}
                    onClick={handleDeductUpload}
                  >
                    <FileSpreadsheet size={16} className="mr-2" />
                    <span>{deductLoading ? 'Processing spreadsheet...' : 'Process Deductions'}</span>
                  </Button>
                  <Button variant="outline" className="border-zinc-200 hover:bg-zinc-50 gap-1.5 text-zinc-700 h-10" onClick={downloadDeductTemplate}>
                    <Download size={16} />
                    <span>Template</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Verification report card */}
            <Card className="bg-white border border-zinc-200 rounded-xl shadow-sm flex flex-col justify-start min-h-[300px]">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-zinc-900">Verification Reports</CardTitle>
                <CardDescription className="text-xs text-zinc-500 font-medium">Real-time spreadsheet validation feed</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-start pt-2">
                {deductLoading && (
                  <div className="flex-1 flex flex-col items-center justify-center py-10">
                    <Clock size={32} className="animate-spin text-zinc-450 mb-3" />
                    <p className="text-xs text-zinc-500">Parsing rows, verifying stock balances...</p>
                  </div>
                )}

                {!deductLoading && !deductGeneralError && deductValidationErrors.length === 0 && !deductSuccessMsg && (
                  <div className="flex-1 flex flex-col items-center justify-center py-10 text-zinc-400 text-center">
                    <Info size={32} className="text-zinc-300 mb-3" />
                    <p className="text-xs leading-relaxed max-w-[200px] mx-auto">Upload a consumption file to see the validation feedback logs.</p>
                  </div>
                )}

                {deductGeneralError && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
                    <span>{deductGeneralError}</span>
                  </div>
                )}

                {/* Validation Warnings */}
                {deductValidationErrors.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2.5 p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
                      <div>
                        <strong className="font-bold">Validation Check Failed!</strong>
                        <div className="text-[10px] mt-0.5 font-medium leading-normal">
                          No stock was deducted. Please resolve the following {deductValidationErrors.length} errors and re-upload:
                        </div>
                      </div>
                    </div>
                    <div className="max-h-[180px] overflow-y-auto border border-red-100 bg-red-50/50 rounded-lg p-3 space-y-1.5 pr-1">
                      {deductValidationErrors.map((err, i) => (
                        <div key={i} className="text-[10px] text-red-650 leading-normal flex gap-2">
                          <span className="text-red-500 font-bold shrink-0">•</span>
                          <span>{err}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Success Result */}
                {deductSuccessMsg && deductVoucher && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2.5 p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold">
                      <CheckCircle size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                      <div>
                        <strong className="font-bold">{deductSuccessMsg}</strong>
                        <div className="text-[10px] mt-0.5 font-medium leading-normal">
                          Posted Voucher: <code>{deductVoucher}</code>. Action recorded under <strong>{user?.full_name}</strong>.
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block border-b border-zinc-200 pb-2">
                        Successfully Deducted Item List
                      </div>
                      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                        {deductedItems.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center p-2.5 bg-zinc-50 border border-zinc-200 rounded-md text-xs font-semibold">
                            <div>
                              <strong className="text-zinc-800">{item.part_number}</strong>
                              <span className="text-[10px] text-zinc-500 ml-2">{item.item_name}</span>
                            </div>
                            <span className="font-extrabold text-red-600">-{item.quantity} pcs</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB Trigger 2: RECONCILIATIONS */}
        <TabsContent value="reconciliation" className="outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Card */}
            <Card className="bg-white border border-zinc-200 rounded-xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-zinc-900">Inventory Reconciliation Upload</CardTitle>
                <CardDescription className="text-xs text-zinc-500 font-medium">
                  Upload the spreadsheet containing physical counts to update the WMS catalog. This automatically registers new bins/warehouses and resets stock balances to match the sheet details exactly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Format guide box */}
                <div className="bg-zinc-50/70 border border-zinc-200 rounded-lg p-4 space-y-2.5 text-xs text-zinc-650">
                  <div className="font-bold text-zinc-800 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                    <Layers size={14} className="text-indigo-600" />
                    <span>Spreadsheet Layout Guidelines</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 border-b border-zinc-200 pb-2 text-[10px] font-bold text-zinc-400 uppercase text-center">
                    <div>Col A</div>
                    <div>Col B</div>
                    <div>Col D</div>
                    <div>Col E</div>
                    <div>Col F</div>
                  </div>
                  <div className="grid grid-cols-5 gap-2 items-center text-[10px] font-mono text-center text-zinc-700">
                    <div className="bg-white border border-zinc-200 py-1.5 rounded">Part No</div>
                    <div className="bg-white border border-zinc-200 py-1.5 rounded">Description</div>
                    <div className="bg-white border border-zinc-200 py-1.5 rounded">Bin Location</div>
                    <div className="bg-white border border-zinc-200 py-1.5 rounded">Warehouse</div>
                    <div className="bg-white border border-zinc-200 py-1.5 rounded">Qty + UOM</div>
                  </div>
                  <p className="text-[10px] font-medium leading-relaxed mt-2 text-zinc-500">
                    <strong>Note:</strong> Auto-creates Warehouses from Col E (e.g. <code>WH05-Warehouse...</code> creates code <code>WH05</code>) and auto-creates Bins from Col D. Quantity format supports unit markers (e.g. <code>218.000 PKT</code>, <code>4.000 BAG</code>).
                  </p>
                </div>

                <div 
                  className="border-2 border-dashed border-zinc-200 hover:border-zinc-950 rounded-xl p-8 text-center cursor-pointer transition-colors bg-zinc-50/50 flex flex-col items-center justify-center min-h-[160px]"
                  onClick={() => reconFileInputRef.current?.click()}
                >
                  <UploadCloud size={40} className="text-zinc-400 mb-3" />
                  {reconFile ? (
                    <div>
                      <strong className="text-sm text-zinc-800 block">{reconFile.name}</strong>
                      <div className="text-[10px] text-zinc-400 mt-1">
                        {(reconFile.size / 1024).toFixed(1)} KB - Ready to process
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <strong className="text-xs text-zinc-755 block">Click to select reconciliation file</strong>
                      <div className="text-[10px] text-zinc-400">
                        Supports .xlsx, .xls, and .csv
                      </div>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={reconFileInputRef} 
                    style={{ display: 'none' }} 
                    accept=".xlsx,.xls,.csv"
                    onChange={handleReconFileChange}
                  />
                </div>

                <Button 
                  className="w-full bg-[#0e121e] hover:bg-zinc-900 text-white font-semibold h-10"
                  disabled={!reconFile || reconLoading}
                  onClick={handleReconUpload}
                >
                  <FileSpreadsheet size={16} className="mr-2" />
                  <span>{reconLoading ? 'Uploading and syncing database...' : 'Upload & Reconcile Inventory'}</span>
                </Button>
              </CardContent>
            </Card>

            {/* Reconciliation Report Result Card */}
            <Card className="bg-white border border-zinc-200 rounded-xl shadow-sm flex flex-col justify-start min-h-[300px]">
              <CardHeader>
                <CardTitle className="text-lg font-bold text-zinc-900">Reconciliation Report</CardTitle>
                <CardDescription className="text-xs text-zinc-500 font-medium">Reconciliation processing logs and metrics feed</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-start pt-2">
                {reconLoading && (
                  <div className="flex-1 flex flex-col items-center justify-center py-10">
                    <Clock size={32} className="animate-spin text-zinc-450 mb-3" />
                    <p className="text-xs text-zinc-500">Clearing tables, syncing locations, loading catalog items...</p>
                  </div>
                )}

                {!reconLoading && !reconGeneralError && reconValidationErrors.length === 0 && !reconSuccessMsg && (
                  <div className="flex-1 flex flex-col items-center justify-center py-10 text-zinc-400 text-center">
                    <Info size={32} className="text-zinc-300 mb-3" />
                    <p className="text-xs leading-relaxed max-w-[220px] mx-auto">Upload the physical inventory Excel file to run the database synchronization report.</p>
                  </div>
                )}

                {reconGeneralError && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
                    <span>{reconGeneralError}</span>
                  </div>
                )}

                {/* Validation Warnings */}
                {reconValidationErrors.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2.5 p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
                      <div>
                        <strong className="font-bold">Reconciliation Failed!</strong>
                        <div className="text-[10px] mt-0.5 font-medium leading-normal">
                          Database was not modified. Please fix these {reconValidationErrors.length} layout parsing errors and retry:
                        </div>
                      </div>
                    </div>
                    <div className="max-h-[180px] overflow-y-auto border border-red-100 bg-red-50/50 rounded-lg p-3 space-y-1.5 pr-1">
                      {reconValidationErrors.map((err, i) => (
                        <div key={i} className="text-[10px] text-red-650 leading-normal flex gap-2">
                          <span className="text-red-500 font-bold shrink-0">•</span>
                          <span>{err}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Success report summary */}
                {reconSuccessMsg && reconVoucher && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2.5 p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold">
                      <CheckCircle size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                      <div>
                        <strong className="font-bold">{reconSuccessMsg}</strong>
                        <div className="text-[10px] mt-0.5 font-medium leading-normal">
                          Posted Reconciliation Voucher: <code>{reconVoucher}</code>. Logs recorded under user profile <strong>{user?.full_name}</strong>.
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block border-b border-zinc-200 pb-2">
                        Database Synchronized Metrics
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-zinc-55 bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-center">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block tracking-wider">Item Balances</span>
                          <span className="text-md font-extrabold text-zinc-900 mt-1 block">{reconItemCount}</span>
                        </div>

                        <div className="bg-zinc-55 bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-center">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block tracking-wider">New Warehouses</span>
                          <span className="text-md font-extrabold text-indigo-700 mt-1 block">{createdWarehouses.length}</span>
                        </div>

                        <div className="bg-zinc-55 bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-center">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block tracking-wider">New Bins</span>
                          <span className="text-md font-extrabold text-indigo-700 mt-1 block">{createdBins.length}</span>
                        </div>
                      </div>

                      {/* Display names of created warehouses/bins */}
                      {createdWarehouses.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block tracking-wider">Auto-Registered Warehouses</span>
                          <div className="flex flex-wrap gap-1.5">
                            {createdWarehouses.map((wh) => (
                              <Badge key={wh} variant="outline" className="bg-indigo-50/50 text-indigo-750 border-indigo-200/50 text-[9px] font-mono font-bold rounded">
                                <Warehouse size={9} className="mr-1 inline" />
                                {wh}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {createdBins.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase block tracking-wider">Auto-Registered Bins</span>
                          <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto pr-1">
                            {createdBins.map((bin) => (
                              <Badge key={bin} variant="outline" className="bg-zinc-50 text-zinc-700 border-zinc-250 text-[9px] font-mono font-bold rounded">
                                <Grid3X3 size={9} className="mr-1 inline text-zinc-400" />
                                {bin}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
