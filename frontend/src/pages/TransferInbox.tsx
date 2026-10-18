import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { useNavigate } from 'react-router-dom';
import { 
  Inbox, 
  ArrowRightLeft, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Filter, 
  ArrowRight, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw,
  Warehouse,
  Boxes,
  Calendar,
  User,
  Eye,
  Check
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface TransferItem {
  id: number;
  part_number: string;
  item_name: string;
  quantity: number;
  source_bin: string;
  target_bin?: string;
  accepted_bin?: string;
}

interface TransferRecord {
  id: number;
  tr_number: string;
  source_warehouse: string;
  destination_warehouse: string;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  remarks?: string;
  status: 'Pending Approval' | 'Accepted' | 'Rejected' | 'Draft' | string;
  created_at: string;
  updated_at: string;
  total_items: number;
  total_quantity: number;
  items?: TransferItem[];
}

export default function TransferInbox() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState({
    pending_incoming: 0,
    total_incoming: 0,
    total_outgoing: 0
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const fetchWarehouses = async () => {
    try {
      const res = await fetch(`${API_URL}/api/warehouses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWarehouses(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchInbox = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_URL}/api/transfer-inbox?type=${activeTab}`;
      if (statusFilter && statusFilter !== 'ALL') {
        url += `&status=${encodeURIComponent(statusFilter)}`;
      }
      if (warehouseFilter) {
        url += `&warehouse=${encodeURIComponent(warehouseFilter)}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to load transfer requests');
      }

      const data = await res.json();
      setTransfers(data.transfers || []);
      if (data.counts) {
        setCounts(data.counts);
      }
    } catch (e: any) {
      setError(e.message || 'Error fetching transfers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
  }, [token]);

  useEffect(() => {
    fetchInbox();
  }, [activeTab, statusFilter, warehouseFilter, token]);

  const filteredTransfers = transfers.filter(t => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const tr = (t.tr_number || '').toLowerCase();
    const src = (t.source_warehouse || '').toLowerCase();
    const dest = (t.destination_warehouse || '').toLowerCase();
    const creator = (t.created_by || '').toLowerCase();
    const itemsMatch = t.items?.some(i => 
      i.part_number.toLowerCase().includes(term) || i.item_name.toLowerCase().includes(term)
    );
    return tr.includes(term) || src.includes(term) || dest.includes(term) || creator.includes(term) || itemsMatch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending Approval':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending Approval
          </span>
        );
      case 'Accepted':
      case 'Completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <CheckCircle2 size={12} />
            Accepted
          </span>
        );
      case 'Rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
            <XCircle size={12} />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Inbox size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Transfer Inbox</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Review and approve incoming stock transfer requests between warehouses
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchInbox}
            disabled={loading}
            className="text-xs h-9 bg-white gap-2"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            Refresh
          </Button>

          <Button 
            size="sm" 
            onClick={() => navigate('/transfer')}
            className="text-xs h-9 bg-zinc-900 hover:bg-zinc-800 text-white gap-2"
          >
            <ArrowRightLeft size={14} />
            New Stock Transfer
          </Button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white border-zinc-200/80 shadow-sm relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Pending Approvals</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock size={16} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-900">{counts.pending_incoming}</span>
              {counts.pending_incoming > 0 && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                  Action Required
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Awaiting acceptance in your warehouse</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-zinc-200/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Total Incoming</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <ArrowDownLeft size={16} />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-zinc-900">{counts.total_incoming}</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Transfers directed to your warehouse</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-zinc-200/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Total Outgoing</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <ArrowUpRight size={16} />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-zinc-900">{counts.total_outgoing}</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Transfers initiated from your warehouse</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-zinc-200/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">My Warehouse</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Warehouse size={16} />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-lg font-bold text-zinc-900 truncate block">
                {user?.warehouse_code || 'All Warehouses (Admin)'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">{user?.role?.replace('_', ' ') || 'User'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs and Controls */}
      <Card className="bg-white border-zinc-200/80 shadow-sm">
        <CardHeader className="pb-3 border-b border-zinc-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-1.5 bg-zinc-100/80 p-1 rounded-lg w-fit">
              <button
                onClick={() => setActiveTab('incoming')}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all",
                  activeTab === 'incoming'
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800"
                )}
              >
                <ArrowDownLeft size={14} className={activeTab === 'incoming' ? "text-indigo-600" : ""} />
                <span>Incoming Transfers</span>
                {counts.pending_incoming > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                    {counts.pending_incoming}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('outgoing')}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all",
                  activeTab === 'outgoing'
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800"
                )}
              >
                <ArrowUpRight size={14} className={activeTab === 'outgoing' ? "text-purple-600" : ""} />
                <span>Outgoing Transfers</span>
              </button>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px]">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                <Input
                  placeholder="Search TR#, item, warehouse..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8.5 h-9 text-xs bg-zinc-50/50 border-zinc-200 focus:bg-white"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 rounded-md text-xs border border-zinc-200 bg-white text-zinc-700 outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="Pending Approval">Pending Approval</option>
                <option value="Accepted">Accepted</option>
                <option value="Rejected">Rejected</option>
              </select>

              {/* Warehouse selector (for superadmin or multi-warehouse) */}
              {user?.role === 'superadmin' && (
                <select
                  value={warehouseFilter}
                  onChange={(e) => setWarehouseFilter(e.target.value)}
                  className="h-9 px-3 rounded-md text-xs border border-zinc-200 bg-white text-zinc-700 outline-none focus:ring-1 focus:ring-zinc-900 cursor-pointer"
                >
                  <option value="">All Warehouses</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.code}>{w.code} - {w.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {error && (
            <div className="p-4 m-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <XCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
              <RefreshCw size={24} className="animate-spin text-indigo-600" />
              <p className="text-xs font-medium">Loading transfer requests...</p>
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3">
                <Inbox size={22} />
              </div>
              <h3 className="text-sm font-semibold text-zinc-800">No transfer requests found</h3>
              <p className="text-xs text-zinc-500 max-w-sm mt-1">
                {activeTab === 'incoming' 
                  ? 'There are currently no incoming transfer requests requiring your attention.'
                  : 'You have not submitted any outgoing transfer requests yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/60 hover:bg-zinc-50/60 border-b border-zinc-200/80">
                    <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3 pl-6">TR Number</TableHead>
                    <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3">Route</TableHead>
                    <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3">Items & Qty</TableHead>
                    <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3">Initiated By</TableHead>
                    <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3">Date</TableHead>
                    <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3">Status</TableHead>
                    <TableHead className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-3 text-right pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransfers.map((transfer) => {
                    const isPending = transfer.status === 'Pending Approval';
                    const canApprove = activeTab === 'incoming' && isPending;

                    return (
                      <TableRow 
                        key={transfer.id}
                        className={cn(
                          "hover:bg-zinc-50/80 transition-colors border-b border-zinc-100 cursor-pointer",
                          isPending && activeTab === 'incoming' && "bg-amber-50/20"
                        )}
                        onClick={() => navigate(`/transfer-approval/${transfer.id}`)}
                      >
                        <TableCell className="py-3.5 pl-6 font-semibold text-xs text-zinc-900">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                              {transfer.tr_number}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="py-3.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                              {transfer.source_warehouse}
                            </span>
                            <ArrowRight size={13} className="text-zinc-400" />
                            <span className="font-bold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-200">
                              {transfer.destination_warehouse}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="py-3.5 text-xs text-zinc-700">
                          <div className="flex flex-col">
                            <span className="font-semibold text-zinc-800">
                              {transfer.total_items} {transfer.total_items === 1 ? 'item' : 'items'}
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {transfer.total_quantity} pcs total
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="py-3.5 text-xs text-zinc-600">
                          <div className="flex items-center gap-1.5">
                            <User size={13} className="text-zinc-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{transfer.created_by || 'Unknown'}</span>
                          </div>
                        </TableCell>

                        <TableCell className="py-3.5 text-xs text-zinc-500">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-zinc-400 shrink-0" />
                            <span>
                              {transfer.created_at ? new Date(transfer.created_at).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="py-3.5">
                          {getStatusBadge(transfer.status)}
                        </TableCell>

                        <TableCell className="py-3.5 pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                          {canApprove ? (
                            <Button
                              size="sm"
                              onClick={() => navigate(`/transfer-approval/${transfer.id}`)}
                              className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-sm"
                            >
                              <span>Review & Approve</span>
                              <ArrowRight size={13} />
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/transfer-approval/${transfer.id}`)}
                              className="text-xs h-8 text-zinc-700 hover:text-zinc-900 border-zinc-200 gap-1.5"
                            >
                              <Eye size={13} />
                              <span>Details</span>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
