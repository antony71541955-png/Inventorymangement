import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { 
  AlertTriangle, 
  Boxes, 
  Warehouse, 
  Database, 
  ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StockAlert {
  part_number: string;
  item_name: string;
  min_stock: number;
  total_quantity: number;
}

interface NegAlert {
  part_number: string;
  warehouse: string;
  bin_location: string;
  quantity: number;
}

interface WarehouseDist {
  warehouse: string;
  total_quantity: number;
  distinct_skus: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState({
    totalSkus: 0,
    totalStock: 0,
    activeWarehouses: 0,
    alertsCount: 0
  });
  const [lowStockAlerts, setLowStockAlerts] = useState<StockAlert[]>([]);
  const [negStockAlerts, setNegStockAlerts] = useState<NegAlert[]>([]);
  const [whDist, setWhDist] = useState<WarehouseDist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const alertsRes = await fetch(`${API_URL}/api/reports/alerts`);
        const alertsData = await alertsRes.json();
        setLowStockAlerts(Array.isArray(alertsData.low_stock) ? alertsData.low_stock : []);
        setNegStockAlerts(Array.isArray(alertsData.negative_stock) ? alertsData.negative_stock : []);

        const distRes = await fetch(`${API_URL}/api/reports/stock?group_by=warehouse`);
        const distData = await distRes.json();
        setWhDist(Array.isArray(distData) ? distData : []);

        const stockRes = await fetch(`${API_URL}/api/reports/stock?group_by=item`);
        const stockData = await stockRes.json();
        
        const totalQty = Array.isArray(stockData) ? stockData.reduce((acc: number, item: any) => acc + item.total_quantity, 0) : 0;
        const uniqueWhs = Array.isArray(distData) ? distData.length : 0;

        setMetrics({
          totalSkus: Array.isArray(stockData) ? stockData.length : 0,
          totalStock: totalQty,
          activeWarehouses: uniqueWhs,
          alertsCount: (Array.isArray(alertsData.low_stock) ? alertsData.low_stock.length : 0) + (Array.isArray(alertsData.negative_stock) ? alertsData.negative_stock.length : 0)
        });

      } catch (e) {
        console.error("Dashboard fetch error:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-zinc-500 animate-pulse text-sm">Loading WMS insights...</p>
      </div>
    );
  }

  const maxWhQty = Math.max(...whDist.map(w => w.total_quantity), 1);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1.5">Welcome back, {user?.full_name || 'Olivia Williams'}. Live summary of WMS warehouse states.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm hover:shadow transition-shadow">
          <CardContent className="p-5 flex items-center gap-4.5">
            <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-zinc-100 text-zinc-800 shrink-0">
              <Boxes size={20} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Catalog SKUs</span>
              <span className="text-2xl font-black text-zinc-900 mt-0.5 truncate">{metrics.totalSkus.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm hover:shadow transition-shadow">
          <CardContent className="p-5 flex items-center gap-4.5">
            <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-zinc-100 text-zinc-800 shrink-0">
              <Database size={20} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Total Stock</span>
              <span className="text-2xl font-black text-zinc-900 mt-0.5 truncate">{metrics.totalStock.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm hover:shadow transition-shadow">
          <CardContent className="p-5 flex items-center gap-4.5">
            <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-zinc-100 text-zinc-800 shrink-0">
              <Warehouse size={20} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Active WHs</span>
              <span className="text-2xl font-black text-zinc-900 mt-0.5 truncate">{metrics.activeWarehouses}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm hover:shadow transition-shadow">
          <CardContent className="p-5 flex items-center gap-4.5">
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${
              metrics.alertsCount > 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'
            }`}>
              <AlertTriangle size={20} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider">Alert flags</span>
              <span className={`text-2xl font-black mt-0.5 truncate ${
                metrics.alertsCount > 0 ? 'text-red-500' : 'text-emerald-500'
              }`}>{metrics.alertsCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WH Distribution graph */}
        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-md font-bold text-zinc-900">Stock Distribution by Warehouse</CardTitle>
            <CardDescription className="text-xs text-zinc-400">Total item balance counts mapped to each warehouse</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {whDist.length === 0 ? (
              <div className="flex items-center justify-center min-h-[140px] text-zinc-400 text-xs">
                No active warehouse allocations mapped yet.
              </div>
            ) : (
              <div className="space-y-4">
                {whDist.map((wh) => {
                  const percentage = (wh.total_quantity / maxWhQty) * 100;
                  return (
                    <div key={wh.warehouse} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-zinc-700">{wh.warehouse}</span>
                        <span className="text-zinc-500 font-bold">
                          {wh.total_quantity.toLocaleString()} pcs ({wh.distinct_skus} SKUs)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/20">
                        <div 
                          className="h-full bg-zinc-900 rounded-full"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts card */}
        <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-md font-bold text-zinc-900">Inventory Warnings</CardTitle>
            <CardDescription className="text-xs text-zinc-400">Item quantity exceptions and low balances</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {negStockAlerts.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest block">Negative stock</span>
                {negStockAlerts.map((neg, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs leading-normal">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <div>
                      <strong>{neg.part_number}</strong> holds negative quantity <code>{neg.quantity}</code> at Wh: {neg.warehouse} / Bin: {neg.bin_location}.
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block">Low stock items</span>
              {lowStockAlerts.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700 text-xs">
                  <span>All items are safely above minimum thresholds.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {lowStockAlerts.slice(0, 5).map((low, i) => (
                    <div key={i} className="flex justify-between items-center p-3 rounded-lg border border-zinc-100 bg-zinc-50/50 text-zinc-700">
                      <div>
                        <div className="font-bold text-xs text-zinc-900">{low.part_number}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-[180px]">{low.item_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-xs text-amber-600">{low.total_quantity} pcs</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">Min: {low.min_stock}</div>
                      </div>
                    </div>
                  ))}
                  {lowStockAlerts.length > 5 && (
                    <Link to="/reports" className="flex items-center justify-center gap-1 text-xs font-semibold text-zinc-900 hover:text-zinc-700 transition-colors pt-2">
                      View all {lowStockAlerts.length} alerts <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
