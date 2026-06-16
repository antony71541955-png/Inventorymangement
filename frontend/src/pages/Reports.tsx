import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { 
  User, 
  Calendar, 
  FileText
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

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

export default function Reports() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('locations');
  
  // Data states
  const [whReports, setWhReports] = useState<WarehouseReport[]>([]);
  const [binReports, setBinReports] = useState<BinReport[]>([]);
  const [deadStock, setDeadStock] = useState<DeadStockItem[]>([]);
  const [movementLogs, setMovementLogs] = useState<MovementLog[]>([]);
  
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Reports & Audit Logs</h1>
        <p className="text-zinc-500 text-sm mt-1.5">Query warehouse stock levels, discover dead stock, and audit user activity trails.</p>
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
      </Tabs>
    </div>
  );
}
