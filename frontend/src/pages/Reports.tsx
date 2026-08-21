import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { 
  User, 
  Calendar, 
  FileText,
  BarChart
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Check, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface WarehouseReport {
  warehouse: string;
  total_quantity: number;
  distinct_skus: number;
}

interface BinReport {
  warehouse: string;
  bin_location: string;
  total_quantity: number;
}

interface DeadStockItem {
  part_number: string;
  item_name: string;
  category: string;
  total_quantity: number;
  reason: string;
}

interface MovementLog {
  id: number;
  voucher_number: string;
  transaction_type: string;
  part_number: string;
  item_name: string;
  quantity: number;
  from_warehouse: string | null;
  from_bin: string | null;
  to_warehouse: string | null;
  to_bin: string | null;
  user_name: string;
  remarks: string;
  timestamp: string;
}

interface Picklist {
  id: number;
  customer_name: string;
  invoice_number: string;
  status: string;
  qc_approved_by: string;
  qc_approved_at: string;
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
  qc_verified: number;
}

export default function Reports() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('locations');
  
  // Data states
  const [whReports, setWhReports] = useState<WarehouseReport[]>([]);
  const [binReports, setBinReports] = useState<BinReport[]>([]);
  const [deadStock, setDeadStock] = useState<DeadStockItem[]>([]);
  const [movementLogs, setMovementLogs] = useState<MovementLog[]>([]);
  const [qcPicklists, setQCPicklists] = useState<Picklist[]>([]);
  
  // Modal states for QC
  const [selectedQCPicklist, setSelectedQCPicklist] = useState<Picklist | null>(null);
  const [qcItems, setQcItems] = useState<PicklistItem[]>([]);
  const [qcModalOpen, setQcModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  
  // Loading states
  const [loading, setLoading] = useState(true);

  // Fetch Report Data based on Active Tab
  const fetchReportData = async (tab: string) => {
    setLoading(true);
    try {
      if (tab === 'locations') {
        const whRes = await fetch(`${API_URL}/api/reports/stock?group_by=warehouse`);
        const whData = await whRes.json();
        setWhReports(Array.isArray(whData) ? whData : []);

        const binRes = await fetch(`${API_URL}/api/reports/stock?group_by=bin`);
        const binData = await binRes.json();
        setBinReports(Array.isArray(binData) ? binData : []);
      } else if (tab === 'deadstock') {
        const deadRes = await fetch(`${API_URL}/api/reports/dead-stock`);
        const deadData = await deadRes.json();
        setDeadStock(Array.isArray(deadData) ? deadData : []);
      } else if (tab === 'movements') {
        const movRes = await fetch(`${API_URL}/api/reports/movement`);
        const movData = await movRes.json();
        setMovementLogs(Array.isArray(movData) ? movData : []);
      } else if (tab === 'qc') {
        const qcRes = await fetch(`${API_URL}/api/dispatch_picklists`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const qcData = await qcRes.json();
        setQCPicklists(Array.isArray(qcData) ? qcData.filter(p => p.status === 'QC Approved') : []);
      }
    } catch (e) {
      console.error("Fetch reports error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData(activeTab);
  }, [activeTab]);

  const handleQCRowClick = async (picklist: Picklist) => {
    setSelectedQCPicklist(picklist);
    setQcModalOpen(true);
    setModalLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/dispatch_picklists/${picklist.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setQcItems(data.items || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setModalLoading(false);
    }
  };

  const generateQCPdf = () => {
    if (!selectedQCPicklist) return;
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("QC Approval Report", 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Picklist ID: PL-${selectedQCPicklist.id.toString().padStart(4, '0')}`, 14, 32);
    doc.text(`Customer: ${selectedQCPicklist.customer_name}`, 14, 38);
    doc.text(`Invoice Number: ${selectedQCPicklist.invoice_number}`, 14, 44);
    
    doc.text(`QC Approved By: ${selectedQCPicklist.qc_approved_by}`, 120, 32);
    doc.text(`QC Approved Date: ${new Date(selectedQCPicklist.qc_approved_at).toLocaleString()}`, 120, 38);

    const tableData = qcItems.map(item => [
      item.part_number,
      item.item_name,
      item.quantity.toString(),
      item.warehouse,
      item.bin_location || '-',
      item.batch_no ? `${item.batch_no} / ${item.expiry}` : '-',
      item.qc_verified ? 'Yes' : 'No'
    ]);

    autoTable(doc, {
      startY: 52,
      head: [['Part Number', 'Item Name', 'Qty', 'WH', 'Bin', 'Batch/Exp', 'QC Verified']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9 }
    });

    doc.save(`QC_Report_PL${selectedQCPicklist.id.toString().padStart(4, '0')}.pdf`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#8F2C00] to-[#1F8F00] bg-clip-text text-transparent flex items-center gap-3">
            <BarChart className="text-[#8F2C00]" size={32} />
            Reports & Audit Logs
          </h1>
          <p className="text-zinc-500 text-sm mt-1.5">Query warehouse stock levels, discover dead stock, and audit user activity trails.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val)} className="space-y-6">
        <TabsList className="bg-zinc-100/80 border border-zinc-200/80 p-1 rounded-lg">
          <TabsTrigger value="locations" className="text-xs font-semibold text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
            Warehouse & Bins
          </TabsTrigger>
          <TabsTrigger value="deadstock" className="text-xs font-semibold text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
            Dead Stock Report
          </TabsTrigger>
          <TabsTrigger value="movements" className="text-xs font-semibold text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
            User Action Audit Trail
          </TabsTrigger>
          <TabsTrigger value="qc" className="text-xs font-semibold text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
            QC Approved List
          </TabsTrigger>
        </TabsList>

        {/* TAB: Locations */}
        <TabsContent value="locations" className="outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-md font-bold text-zinc-900">Stock Summary by Warehouse</CardTitle>
                <CardDescription className="text-xs text-zinc-500 font-medium">Aggregated stock levels</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-2">
                <div className="overflow-x-auto border-t sm:border border-zinc-200 sm:rounded-lg">
                  <Table>
                    <TableHeader className="bg-zinc-50/70">
                      <TableRow className="border-b border-zinc-200">
                        <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Warehouse</TableHead>
                        <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Distinct SKUs</TableHead>
                        <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Total Quantity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow className="border-b border-zinc-100">
                          <TableCell colSpan={3} className="text-center py-6 text-zinc-400 text-xs">Loading...</TableCell>
                        </TableRow>
                      ) : whReports.length === 0 ? (
                        <TableRow className="border-b border-zinc-100">
                          <TableCell colSpan={3} className="text-center py-6 text-zinc-500 text-xs">No warehouse records.</TableCell>
                        </TableRow>
                      ) : (
                        whReports.map((wh, i) => (
                          <TableRow key={i} className="border-b border-zinc-100/80 hover:bg-zinc-50/50">
                            <TableCell className="font-bold text-zinc-900 text-xs">{wh.warehouse}</TableCell>
                            <TableCell className="text-right text-zinc-700 text-xs font-semibold">{wh.distinct_skus}</TableCell>
                            <TableCell className="text-right font-extrabold text-zinc-950 text-xs">{wh.total_quantity}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-md font-bold text-zinc-900">Detailed Stock by Bin</CardTitle>
                <CardDescription className="text-xs text-zinc-500 font-medium">Quantities mapped directly inside bin locations</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-2">
                <div className="overflow-x-auto border-t sm:border border-zinc-200 sm:rounded-lg">
                  <Table>
                    <TableHeader className="bg-zinc-50/70">
                      <TableRow className="border-b border-zinc-200">
                        <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Warehouse</TableHead>
                        <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Bin Location</TableHead>
                        <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Total Quantity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow className="border-b border-zinc-100">
                          <TableCell colSpan={3} className="text-center py-6 text-zinc-400 text-xs">Loading...</TableCell>
                        </TableRow>
                      ) : binReports.length === 0 ? (
                        <TableRow className="border-b border-zinc-100">
                          <TableCell colSpan={3} className="text-center py-6 text-zinc-500 text-xs">No bin records.</TableCell>
                        </TableRow>
                      ) : (
                        binReports.map((bin, i) => (
                          <TableRow key={i} className="border-b border-zinc-100/80 hover:bg-zinc-50/50">
                            <TableCell className="font-bold text-zinc-900 text-xs">{bin.warehouse}</TableCell>
                            <TableCell className="font-mono text-zinc-650 text-xs">{bin.bin_location}</TableCell>
                            <TableCell className="text-right font-extrabold text-zinc-950 text-xs">{bin.total_quantity}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Dead Stock */}
        <TabsContent value="deadstock" className="outline-none">
          <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-md font-bold text-zinc-900">Dead Stock Report</CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Items holding a balance of zero, or containing stock with zero transfer or deduction movements in the past 30 days.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-2">
              <div className="overflow-x-auto border-t sm:border border-zinc-200 sm:rounded-lg">
                <Table>
                  <TableHeader className="bg-zinc-50/70">
                    <TableRow className="border-b border-zinc-200">
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Part Number</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Item Description</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Category</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Current Balance</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Flag Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow className="border-b border-zinc-100">
                        <TableCell colSpan={5} className="text-center py-8 text-zinc-400 text-xs">Analyzing movements...</TableCell>
                      </TableRow>
                    ) : deadStock.length === 0 ? (
                      <TableRow className="border-b border-zinc-100">
                        <TableCell colSpan={5} className="text-center py-8 text-zinc-550 text-xs">All items are active and moving.</TableCell>
                      </TableRow>
                    ) : (
                      deadStock.map((item, i) => (
                        <TableRow key={i} className="border-b border-zinc-100/80 hover:bg-zinc-50/50">
                          <TableCell className="font-bold text-amber-600 text-xs">{item.part_number}</TableCell>
                          <TableCell className="text-zinc-900 text-xs font-semibold">{item.item_name}</TableCell>
                          <TableCell className="text-zinc-500 text-xs">{item.category}</TableCell>
                          <TableCell className="text-right font-extrabold text-zinc-950 text-xs">{item.total_quantity} pcs</TableCell>
                          <TableCell>
                            <Badge className="bg-amber-550/10 text-amber-600 hover:bg-amber-550/10 border border-amber-500/20 text-[10px] font-bold rounded px-1.5 py-0.5">
                              {item.reason}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Audit Trail */}
        <TabsContent value="movements" className="outline-none">
          <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-md font-bold text-zinc-900">Inventory Action Logs & Audit Trail</CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                A complete history of addition, deletion, deduction, and transfer events, tagged with the operator name who authorized it.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-2">
              <div className="overflow-x-auto border-t sm:border border-zinc-200 sm:rounded-lg">
                <Table>
                  <TableHeader className="bg-zinc-50/70">
                    <TableRow className="border-b border-zinc-200">
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Voucher</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Event</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Part No</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Description</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Qty</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Source</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Destination</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Operator (User)</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Timestamp</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow className="border-b border-zinc-100">
                        <TableCell colSpan={10} className="text-center py-8 text-zinc-400 text-xs">Loading audit trail...</TableCell>
                      </TableRow>
                    ) : movementLogs.length === 0 ? (
                      <TableRow className="border-b border-zinc-100">
                        <TableCell colSpan={10} className="text-center py-8 text-zinc-500 text-xs">No audit logs recorded yet.</TableCell>
                      </TableRow>
                    ) : (
                      movementLogs.map((log) => (
                        <TableRow key={log.id} className="border-b border-zinc-100/80 hover:bg-zinc-50/50">
                          <TableCell className="font-bold text-zinc-900 text-xs">{log.voucher_number}</TableCell>
                          <TableCell>
                            <Badge className={`text-[9px] font-bold uppercase tracking-wider ${
                              log.transaction_type === 'ADDITION' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-50 rounded px-1.5 py-0.5' :
                              log.transaction_type === 'DELETION' ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-50 rounded px-1.5 py-0.5' :
                              log.transaction_type === 'DEDUCTION' ? 'bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-50 rounded px-1.5 py-0.5' :
                              'bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-100 rounded px-1.5 py-0.5'
                            }`}>
                              {log.transaction_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-bold text-zinc-900 text-xs">{log.part_number}</TableCell>
                          <TableCell className="text-zinc-700 text-xs font-semibold max-w-[120px] truncate">{log.item_name}</TableCell>
                          <TableCell className={`text-right font-extrabold text-xs ${
                            log.transaction_type === 'DEDUCTION' || log.transaction_type === 'DELETION' ? 'text-red-600' : 'text-zinc-950'
                          }`}>
                            {log.transaction_type === 'DEDUCTION' || log.transaction_type === 'DELETION' ? '-' : '+'}
                            {log.quantity}
                          </TableCell>
                          <TableCell className="text-zinc-600 text-[11px]">
                            {log.from_warehouse ? `${log.from_warehouse} (${log.from_bin})` : '—'}
                          </TableCell>
                          <TableCell className="text-zinc-600 text-[11px]">
                            {log.to_warehouse ? `${log.to_warehouse} (${log.to_bin})` : '—'}
                          </TableCell>
                          <TableCell className="text-xs font-semibold">
                            <div className="flex items-center gap-1.5">
                              <User size={12} className="text-zinc-500" />
                              <span className="text-zinc-650">{log.user_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5 text-zinc-500 whitespace-nowrap">
                              <Calendar size={12} />
                              <span>{new Date(log.timestamp).toLocaleString()}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-zinc-650 text-xs">
                            <div className="flex items-center gap-1.5 max-w-[150px] truncate">
                              <FileText size={12} className="text-zinc-400 shrink-0" />
                              <span>{log.remarks}</span>
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
        </TabsContent>
        <TabsContent value="qc" className="outline-none">
          <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-md font-bold text-zinc-900">QC Approved Picklists</CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Picklists that have passed Quality Check.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-2">
              <div className="overflow-x-auto border-t sm:border border-zinc-200 sm:rounded-lg">
                <Table>
                  <TableHeader className="bg-zinc-50/70">
                    <TableRow className="border-b border-zinc-200">
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Picklist ID</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Customer Name</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Invoice Number</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">QC Approved Date</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">QC Approved By</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow className="border-b border-zinc-100">
                        <TableCell colSpan={6} className="text-center py-8 text-zinc-400 text-xs">Loading QC records...</TableCell>
                      </TableRow>
                    ) : qcPicklists.length === 0 ? (
                      <TableRow className="border-b border-zinc-100">
                        <TableCell colSpan={6} className="text-center py-8 text-zinc-500 text-xs">No QC Approved picklists found.</TableCell>
                      </TableRow>
                    ) : (
                      qcPicklists.map((p) => (
                        <TableRow 
                          key={p.id} 
                          className="border-b border-zinc-100/80 hover:bg-zinc-50/50 cursor-pointer transition-colors"
                          onClick={() => handleQCRowClick(p)}
                        >
                          <TableCell className="font-bold text-indigo-600 text-xs">PL-{p.id.toString().padStart(4, '0')}</TableCell>
                          <TableCell className="text-zinc-900 text-xs font-semibold">{p.customer_name}</TableCell>
                          <TableCell className="text-zinc-700 text-xs">{p.invoice_number}</TableCell>
                          <TableCell className="text-xs text-zinc-600">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <Calendar size={12} />
                              <span>{new Date(p.qc_approved_at).toLocaleString()}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-semibold">
                            <div className="flex items-center gap-1.5">
                              <User size={12} className="text-zinc-500" />
                              <span className="text-zinc-650">{p.qc_approved_by}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
                              <CheckCircle size={10} className="mr-1 inline-block" />
                              {p.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* QC Details Modal */}
      <Dialog open={qcModalOpen} onOpenChange={setQcModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">QC Approval Details</DialogTitle>
            <DialogDescription>
              Viewing QC record for Picklist PL-{selectedQCPicklist?.id?.toString().padStart(4, '0')}
            </DialogDescription>
          </DialogHeader>

          {modalLoading ? (
            <div className="py-12 text-center text-zinc-500">Loading details...</div>
          ) : selectedQCPicklist && (
            <div className="space-y-6 py-4">
              <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-xs font-medium text-zinc-500 uppercase">Customer Name</span>
                  <span className="font-medium text-zinc-900">{selectedQCPicklist.customer_name}</span>
                </div>
                <div>
                  <span className="block text-xs font-medium text-zinc-500 uppercase">Invoice Number</span>
                  <span className="font-medium text-zinc-900">{selectedQCPicklist.invoice_number}</span>
                </div>
                <div>
                  <span className="block text-xs font-medium text-zinc-500 uppercase">QC Approved Date</span>
                  <span className="font-medium text-zinc-900">{new Date(selectedQCPicklist.qc_approved_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-xs font-medium text-zinc-500 uppercase">QC Approved By</span>
                  <span className="font-medium text-zinc-900">{selectedQCPicklist.qc_approved_by}</span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-zinc-900 mb-3 flex items-center justify-between">
                  <span>Verified Inventory Items</span>
                </h3>
                <div className="border border-zinc-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200">
                      <tr>
                        <th className="px-4 py-3">Part Number</th>
                        <th className="px-4 py-3">Item Name</th>
                        <th className="px-4 py-3">Location / Details</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-center">QC Verified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {qcItems.map((item) => (
                        <tr key={item.id} className="bg-white">
                          <td className="px-4 py-3 font-medium text-zinc-900">{item.part_number}</td>
                          <td className="px-4 py-3 text-zinc-600">{item.item_name}</td>
                          <td className="px-4 py-3 text-xs text-zinc-500">
                            <div>Warehouse: {item.warehouse}</div>
                            {item.bin_location && <div>Bin: {item.bin_location}</div>}
                            {item.batch_no && <div>Batch: {item.batch_no} | Exp: {item.expiry}</div>}
                          </td>
                          <td className="px-4 py-3 font-bold text-zinc-900 text-right">{item.quantity}</td>
                          <td className="px-4 py-3 text-center">
                            {item.qc_verified ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border border-green-200">
                                <Check size={12} className="mr-1" /> Yes
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border border-red-200">
                                <X size={12} className="mr-1" /> No
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="flex justify-end mt-4">
                <Button onClick={generateQCPdf} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  <Download size={16} className="mr-2" /> Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
