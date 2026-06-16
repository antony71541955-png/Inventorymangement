import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { 
  User, 
  Calendar, 
  FileText, 
  Search,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
  MinusCircle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MovementLog {
  id: number;
  voucher_number: string;
  transaction_type: string;
  part_number: string;
  item_name: string | null;
  quantity: number;
  from_warehouse: string | null;
  from_bin: string | null;
  to_warehouse: string | null;
  to_bin: string | null;
  user_name: string;
  remarks: string;
  timestamp: string;
}

export default function AuditLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<MovementLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'creation' | 'updation' | 'deletion'>('all');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/reports/movement`);
      if (!response.ok) {
        throw new Error('Failed to fetch action audit trail.');
      }
      const data = await response.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Helper to categorize log action type
  const getCategorizedType = (type: string): 'creation' | 'updation' | 'deletion' => {
    const uppercaseType = type.toUpperCase();
    if (uppercaseType === 'ADDITION' || uppercaseType === 'CREATION') {
      return 'creation';
    } else if (uppercaseType === 'TRANSFER' || uppercaseType === 'UPDATION') {
      return 'updation';
    } else {
      return 'deletion'; // DELETION, DEDUCTION
    }
  };

  // Filter & Search logic
  const filteredLogs = logs.filter((log) => {
    const catType = getCategorizedType(log.transaction_type);
    
    // Type Filter match
    if (typeFilter !== 'all' && catType !== typeFilter) {
      return false;
    }
    
    // Search match
    const searchLower = search.toLowerCase();
    return (
      log.voucher_number.toLowerCase().includes(searchLower) ||
      log.part_number.toLowerCase().includes(searchLower) ||
      (log.item_name || '').toLowerCase().includes(searchLower) ||
      log.user_name.toLowerCase().includes(searchLower) ||
      log.remarks.toLowerCase().includes(searchLower)
    );
  });

  // Calculate metrics
  const creationCount = logs.filter(l => getCategorizedType(l.transaction_type) === 'creation').length;
  const updationCount = logs.filter(l => getCategorizedType(l.transaction_type) === 'updation').length;
  const deletionCount = logs.filter(l => getCategorizedType(l.transaction_type) === 'deletion').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Database Audit Logs</h1>
          <p className="text-zinc-500 text-sm mt-1.5 font-medium">Trace all creations, modifications, transfers, and removals made by users.</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchLogs} 
          className="border-zinc-250 hover:bg-zinc-50 text-xs font-semibold flex items-center gap-1.5 h-9 shrink-0 self-start sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Audit Logs</span>
        </Button>
      </div>

      {/* Audit Logs Summary KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total CRUD Actions</p>
              <h3 className="text-2xl font-extrabold text-zinc-950 mt-1">{logs.length}</h3>
            </div>
            <div className="h-10 w-10 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
              <FileText size={18} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Creations (Green)</p>
              <h3 className="text-2xl font-extrabold text-emerald-650 mt-1">{creationCount}</h3>
            </div>
            <div className="h-10 w-10 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
              <PlusCircle size={18} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Updations (Yellow)</p>
              <h3 className="text-2xl font-extrabold text-amber-650 mt-1">{updationCount}</h3>
            </div>
            <div className="h-10 w-10 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-center text-amber-600">
              <RefreshCw size={18} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Deletions & Deductions (Red)</p>
              <h3 className="text-2xl font-extrabold text-red-650 mt-1">{deletionCount}</h3>
            </div>
            <div className="h-10 w-10 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-600">
              <MinusCircle size={18} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Options Card */}
      <Card className="bg-white border border-zinc-250/80 rounded-xl shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
            <button 
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                typeFilter === 'all' 
                  ? 'bg-zinc-900 border-zinc-950 text-white' 
                  : 'bg-white border-zinc-200 text-zinc-650 hover:bg-zinc-50'
              }`}
            >
              All Actions
            </button>
            <button 
              onClick={() => setTypeFilter('creation')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
                typeFilter === 'creation' 
                  ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm' 
                  : 'bg-white border-zinc-200 text-emerald-700 hover:bg-emerald-50/40'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${typeFilter === 'creation' ? 'bg-white' : 'bg-emerald-500'}`}></span>
              Creations
            </button>
            <button 
              onClick={() => setTypeFilter('updation')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
                typeFilter === 'updation' 
                  ? 'bg-amber-500 border-amber-600 text-white shadow-sm' 
                  : 'bg-white border-zinc-200 text-amber-700 hover:bg-amber-50/40'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${typeFilter === 'updation' ? 'bg-white' : 'bg-amber-500'}`}></span>
              Updations
            </button>
            <button 
              onClick={() => setTypeFilter('deletion')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
                typeFilter === 'deletion' 
                  ? 'bg-red-600 border-red-700 text-white shadow-sm' 
                  : 'bg-white border-zinc-200 text-red-700 hover:bg-red-50/40'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${typeFilter === 'deletion' ? 'bg-white' : 'bg-red-500'}`}></span>
              Deletions
            </button>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input 
              id="audit-search-input"
              type="text" 
              placeholder="Search user, voucher, SKU..." 
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="pl-9 bg-zinc-50 border-zinc-200 text-zinc-900 focus-visible:ring-indigo-600 h-9 text-xs rounded-lg"
            />
          </div>
        </CardContent>
      </Card>

      {/* Logs Table Card */}
      <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto sm:rounded-xl">
            <Table>
              <TableHeader className="bg-zinc-50/70 border-b border-zinc-200">
                <TableRow>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider py-4">Timestamp</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider py-4">Voucher</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider py-4">Operation (CRUD)</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider py-4">Target SKU</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider py-4 text-right">Qty</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider py-4">Source</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider py-4">Destination</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider py-4">User (Operator)</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider py-4">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-zinc-400 text-xs font-semibold">Loading data operations trail...</TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-zinc-500 text-xs font-semibold">No audit logs found matching the filter.</TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => {
                    const catType = getCategorizedType(log.transaction_type);
                    return (
                      <TableRow key={log.id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                        <TableCell className="text-xs text-zinc-500 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={12} className="text-zinc-400 shrink-0" />
                            <span>{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-zinc-700 font-bold text-xs py-3.5 whitespace-nowrap">
                          {log.voucher_number}
                        </TableCell>
                        <TableCell className="py-3.5">
                          {catType === 'creation' ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 text-[9px] font-bold tracking-wider rounded uppercase px-2 py-0.5 whitespace-nowrap">
                              Creation
                            </Badge>
                          ) : catType === 'updation' ? (
                            <Badge className="bg-amber-50 text-amber-700 border border-amber-250 hover:bg-amber-50 text-[9px] font-bold tracking-wider rounded uppercase px-2 py-0.5 whitespace-nowrap">
                              Updation
                            </Badge>
                          ) : (
                            <Badge className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-50 text-[9px] font-bold tracking-wider rounded uppercase px-2 py-0.5 whitespace-nowrap">
                              Deletion
                            </Badge>
                          )}
                          <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider block mt-0.5 pl-0.5">
                            {log.transaction_type}
                          </span>
                        </TableCell>
                        <TableCell className="py-3.5">
                          <div className="flex flex-col max-w-[130px]">
                            <span className="font-extrabold text-zinc-900 text-xs truncate">{log.part_number}</span>
                            {log.item_name && (
                              <span className="text-[10px] text-zinc-450 truncate mt-0.5">{log.item_name}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-extrabold text-xs py-3.5 ${
                          catType === 'deletion' ? 'text-red-600' : catType === 'creation' ? 'text-emerald-600' : 'text-zinc-800'
                        }`}>
                          {catType === 'deletion' ? '-' : catType === 'creation' ? '+' : ''}
                          {log.quantity}
                        </TableCell>
                        <TableCell className="text-zinc-650 text-[11px] py-3.5">
                          {log.from_warehouse ? `${log.from_warehouse} (${log.from_bin})` : '—'}
                        </TableCell>
                        <TableCell className="text-zinc-650 text-[11px] py-3.5">
                          {log.to_warehouse ? `${log.to_warehouse} (${log.to_bin})` : '—'}
                        </TableCell>
                        <TableCell className="py-3.5 text-xs font-semibold">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <User size={12} className="text-zinc-400" />
                            <span className="text-zinc-700">{log.user_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-zinc-650 text-xs py-3.5">
                          <div className="flex items-center gap-1.5 max-w-[180px]">
                            <FileText size={12} className="text-zinc-400 shrink-0" />
                            <span className="truncate" title={log.remarks}>{log.remarks}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
