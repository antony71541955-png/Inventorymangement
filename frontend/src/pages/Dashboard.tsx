import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { 
  AlertTriangle, 
  Boxes, 
  Warehouse, 
  Database, 
  ChevronRight,
  Loader2,
  Calendar,
  MoreHorizontal,
  Bell,
  LayoutDashboard
} from 'lucide-react';
import { InfinitySpin } from 'react-loader-spinner';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Chart from 'react-apexcharts';
import * as XLSX from 'xlsx';

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
  const [dateRange, setDateRange] = useState('6M');
  const [selectedWh, setSelectedWh] = useState('');
  const [allWarehouses, setAllWarehouses] = useState<{id: number, code: string, name: string}[]>([]);
  
  // Modal State
  const [selectedWarehouseForModal, setSelectedWarehouseForModal] = useState<string | null>(null);
  const [warehouseModalData, setWarehouseModalData] = useState<any[]>([]);
  const [loadingModalData, setLoadingModalData] = useState(false);

  useEffect(() => {
    if (!selectedWarehouseForModal) {
      setWarehouseModalData([]);
      return;
    }
    
    const fetchModalData = async () => {
      setLoadingModalData(true);
      try {
        const res = await fetch(`${API_URL}/api/reports/stock?group_by=item&warehouse=${selectedWarehouseForModal}`);
        if (res.ok) {
          const data = await res.json();
          setWarehouseModalData(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to fetch warehouse details for modal", err);
      } finally {
        setLoadingModalData(false);
      }
    };
    
    fetchModalData();
  }, [selectedWarehouseForModal]);

  const handleExportExcel = () => {
    if (!warehouseModalData.length) return;
    
    const exportData = warehouseModalData.map(item => ({
      'Part Number': item.part_number,
      'Item Name': item.item_name || '',
      'Category': item.category || '',
      'Total Quantity': item.total_quantity
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    
    XLSX.writeFile(wb, `Inventory_${selectedWarehouseForModal}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const whCode = user?.role === 'warehouse_admin' ? user?.warehouse_code : selectedWh;
        const whParam = whCode ? `?warehouse=${whCode}` : '';

        if (allWarehouses.length === 0 && user?.role !== 'warehouse_admin') {
          try {
            const whRes = await fetch(`${API_URL}/api/warehouses`);
            const whData = await whRes.json();
            setAllWarehouses(Array.isArray(whData) ? whData : []);
          } catch(e) {}
        }

        const alertsRes = await fetch(`${API_URL}/api/reports/alerts${whParam}`);
        const alertsData = await alertsRes.json();
        setLowStockAlerts(Array.isArray(alertsData.low_stock) ? alertsData.low_stock : []);
        setNegStockAlerts(Array.isArray(alertsData.negative_stock) ? alertsData.negative_stock : []);

        const distRes = await fetch(`${API_URL}/api/reports/stock?group_by=warehouse${whParam ? `&warehouse=${user?.warehouse_code || ''}` : ''}`);
        const distData = await distRes.json();
        setWhDist(Array.isArray(distData) ? distData : []);

        const stockRes = await fetch(`${API_URL}/api/reports/stock?group_by=item${whParam ? `&warehouse=${user?.warehouse_code || ''}` : ''}`);
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
  }, [selectedWh]); // Refetch when warehouse changes

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] w-full gap-4">
        <InfinitySpin width="200" color="#1F8F00" />
        <p className="text-zinc-500 text-sm font-semibold tracking-wide animate-pulse">Loading Dashboard Data...</p>
      </div>
    );
  }

  // --- CHART OPTIONS ---

  // 1. Stock Distribution by Warehouse (Bar Chart)
  const barChartOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      fontFamily: 'inherit',
      parentHeightOffset: 0,
      events: {
        dataPointSelection: (event: any, chartContext: any, config: any) => {
          const clickedWh = whDist[config.dataPointIndex]?.warehouse;
          if (clickedWh) {
            setSelectedWarehouseForModal(clickedWh);
          }
        }
      }
    },
    colors: ['#00E396', '#008FFB', '#FEB019', '#FF4560', '#775DD0'],
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: '45%',
        distributed: true,
      }
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: whDist.map(w => w.warehouse || 'Unknown'),
      labels: {
        style: { colors: '#64748b', fontSize: '12px' }
      },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      labels: {
        style: { colors: '#64748b', fontSize: '12px' },
        formatter: (val: number) => val.toLocaleString()
      }
    },
    grid: {
      borderColor: '#f1f5f9',
      strokeDashArray: 4,
      yaxis: { lines: { show: true } }
    },
    tooltip: {
      theme: 'light',
      y: { formatter: (val: number) => val.toLocaleString() + ' pcs' }
    }
  };

  const barChartSeries = [{
    name: 'Total Quantity',
    data: whDist.map(w => w.total_quantity)
  }];

  let mockData = [1200, 1900, 1500, 2200, 1800, 2700, 2400];
  let mockCats = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  if (dateRange === '1M') {
    mockData = [500, 600, 550, 700];
    mockCats = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  } else if (dateRange === '1Y') {
    mockData = [10, 15, 20, 18, 22, 28, 25, 30, 27, 35, 40, 45].map(x => x * 100);
    mockCats = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  }

  // 2. Mock Stock Movements (Area Chart) - To mimic the beautiful line graph
  const areaChartOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      fontFamily: 'inherit',
      parentHeightOffset: 0,
      sparkline: { enabled: false }
    },
    colors: ['#0ea5e9'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.05,
        stops: [0, 100]
      }
    },
    dataLabels: { enabled: false },
    stroke: {
      curve: 'smooth',
      width: 3
    },
    xaxis: {
      categories: mockCats,
      labels: { style: { colors: '#64748b', fontSize: '12px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false }
    },
    yaxis: {
      labels: {
        style: { colors: '#64748b', fontSize: '12px' }
      }
    },
    grid: {
      borderColor: '#f1f5f9',
      strokeDashArray: 4,
    },
    tooltip: { theme: 'light' }
  };

  const areaChartSeries = [{
    name: 'Stock Movements',
    data: mockData
  }];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      
      {/* HEADER ROW */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#8F2C00] to-[#1F8F00] bg-clip-text text-transparent">
            <LayoutDashboard className="text-indigo-600 inline-block mr-2" /> Dashboard Overview
          </h1>
          <p className="text-zinc-500 text-sm mt-1.5 font-medium">Welcome back, {user?.full_name || 'Olivia Williams'}. Live summary of Greens warehouse states.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          
          <div className="relative group">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <select 
              className="h-9 pl-8 pr-8 appearance-none bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 text-xs rounded-lg shadow-sm font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-400 cursor-pointer transition-colors"
              value={dateRange}
              onChange={e => setDateRange(e.target.value)}
            >
              <option value="1M">Last Month</option>
              <option value="6M">Last 6 Months</option>
              <option value="1Y">Last Year</option>
            </select>
            <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 rotate-90 pointer-events-none" />
          </div>

          {user?.role !== 'warehouse_admin' && (
            <div className="relative group">
              <Warehouse size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <select 
                className="h-9 pl-8 pr-8 appearance-none bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 text-xs rounded-lg shadow-sm font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-400 cursor-pointer transition-colors"
                value={selectedWh}
                onChange={e => setSelectedWh(e.target.value)}
              >
                <option value="">All Warehouses</option>
                {allWarehouses.map(w => (
                  <option key={w.id} value={w.code}>{w.code} - {w.name}</option>
                ))}
              </select>
              <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 rotate-90 pointer-events-none" />
            </div>
          )}

          <Button onClick={() => window.print()} className="h-9 px-4 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg shadow-sm">
            Generate Report
          </Button>
        </div>
      </div>

      {/* METRICS CARDS ROW 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-0 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="text-sm font-semibold text-zinc-500">Total SKUs</div>
              <div className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-sm flex items-center gap-1">
                ↗ 12.5%
              </div>
            </div>
            <div className="text-3xl font-bold text-zinc-900 mb-1">{metrics.totalSkus.toLocaleString()}</div>
            <div className="text-xs text-zinc-400">Unique items in catalog</div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="text-sm font-semibold text-zinc-500">Total Stock</div>
              <div className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-sm flex items-center gap-1">
                ↗ 8.2%
              </div>
            </div>
            <div className="text-3xl font-bold text-zinc-900 mb-1">{metrics.totalStock.toLocaleString()}</div>
            <div className="text-xs text-zinc-400">Total physical units</div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="text-sm font-semibold text-zinc-500">Active Warehouses</div>
              <div className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-sm flex items-center gap-1">
                Active
              </div>
            </div>
            <div className="text-3xl font-bold text-zinc-900 mb-1">{metrics.activeWarehouses}</div>
            <div className="text-xs text-zinc-400">Storage locations mapped</div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="text-sm font-semibold text-zinc-500">Alerts</div>
              <div className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-sm flex items-center gap-1">
                Action Req
              </div>
            </div>
            <div className="text-3xl font-bold text-zinc-900 mb-1">{metrics.alertsCount}</div>
            <div className="text-xs text-zinc-400">Low or negative stock</div>
          </CardContent>
        </Card>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* BAR CHART */}
        <Card className="lg:col-span-2 border-0 shadow-sm rounded-2xl bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold text-zinc-800">Stock Distribution Breakdown</CardTitle>
              <div className="text-sm text-zinc-500 mt-1">Total quantity per warehouse</div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-600">
              <MoreHorizontal size={18} />
            </Button>
          </CardHeader>
          <CardContent>
            {whDist.length === 0 ? (
               <div className="h-[280px] flex items-center justify-center text-zinc-400 text-sm">No data available</div>
            ) : (
              <div className="h-[280px] w-full">
                <Chart options={barChartOptions as any} series={barChartSeries} type="bar" height="100%" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ALERTS PANEL */}
        <Card className="border-0 shadow-sm rounded-2xl bg-white flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-zinc-800 flex items-center gap-2">
              <Bell size={18} className="text-amber-500" /> Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex flex-col">
            <div className="space-y-4 overflow-y-auto pr-2 pb-2 flex-1 max-h-[280px]">
              {negStockAlerts.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Negative stock</div>
                  <div className="space-y-2">
                    {negStockAlerts.map((neg, i) => (
                      <div key={i} className="flex flex-col p-3 rounded-xl border border-red-100 bg-red-50/50">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-xs text-red-800">{neg.part_number}</span>
                          <span className="text-xs font-bold text-red-600">{neg.quantity} pcs</span>
                        </div>
                        <span className="text-[10px] text-red-600/80">WH: {neg.warehouse} | Bin: {neg.bin_location}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2 mt-2">Low stock items</div>
                {lowStockAlerts.length === 0 ? (
                  <div className="text-xs text-zinc-500 p-3 bg-zinc-50 rounded-xl">All clear. No low stock items.</div>
                ) : (
                  <div className="space-y-2">
                    {lowStockAlerts.slice(0, 5).map((low, i) => (
                      <div key={i} className="flex justify-between items-center p-3 rounded-xl border border-zinc-100 bg-zinc-50 hover:bg-zinc-100/80 transition-colors">
                        <div>
                          <div className="font-bold text-xs text-zinc-800">{low.part_number}</div>
                          <div className="text-[10px] text-zinc-500 truncate max-w-[120px]">{low.item_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-xs text-amber-600">{low.total_quantity} pcs</div>
                          <div className="text-[10px] text-zinc-400">Min: {low.min_stock}</div>
                        </div>
                      </div>
                    ))}
                    {lowStockAlerts.length > 5 && (
                      <Link to="/reports" className="block text-center text-xs font-semibold text-indigo-600 hover:text-indigo-800 pt-2">
                        View all {lowStockAlerts.length} alerts
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FULL WIDTH AREA CHART */}
      <Card className="border-0 shadow-sm rounded-2xl bg-white mt-6">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base font-bold text-zinc-800">Stock Movements Trend (Mock)</CardTitle>
            <div className="text-sm text-zinc-500 mt-1">6-Month Historical Data</div>
          </div>
          <div className="flex gap-2">
            <Badge 
              variant="secondary" 
              className={`cursor-pointer ${dateRange === '1M' ? 'bg-teal-500 text-white hover:bg-teal-600' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
              onClick={() => setDateRange('1M')}
            >
              Last Month
            </Badge>
            <Badge 
              variant="secondary" 
              className={`cursor-pointer ${dateRange === '6M' ? 'bg-teal-500 text-white hover:bg-teal-600' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
              onClick={() => setDateRange('6M')}
            >
              Last 6 Months
            </Badge>
            <Badge 
              variant="secondary" 
              className={`cursor-pointer ${dateRange === '1Y' ? 'bg-teal-500 text-white hover:bg-teal-600' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
              onClick={() => setDateRange('1Y')}
            >
              Last Year
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <Chart options={areaChartOptions as any} series={areaChartSeries} type="area" height="100%" />
          </div>
        </CardContent>
      </Card>
      
      {/* WAREHOUSE INVENTORY MODAL */}
      <Dialog open={!!selectedWarehouseForModal} onOpenChange={(open) => !open && setSelectedWarehouseForModal(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-zinc-100 bg-zinc-50/50 flex flex-row items-center justify-between">
            <DialogTitle className="text-xl font-bold text-zinc-800">
              Inventory Detail - {selectedWarehouseForModal}
            </DialogTitle>
            <Button 
              onClick={handleExportExcel} 
              disabled={loadingModalData || warehouseModalData.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-9"
            >
              Export as Excel
            </Button>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 bg-white">
            {loadingModalData ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                <span className="text-sm text-zinc-500">Loading stock data...</span>
              </div>
            ) : warehouseModalData.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">No inventory found for this warehouse.</div>
            ) : (
              <table className="w-full text-sm text-left border border-zinc-200 rounded-lg overflow-hidden">
                <thead className="bg-zinc-50 text-zinc-600 font-semibold border-b border-zinc-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 border-r border-zinc-100">Part Number</th>
                    <th className="px-4 py-3 border-r border-zinc-100">Item Name</th>
                    <th className="px-4 py-3 border-r border-zinc-100">Category</th>
                    <th className="px-4 py-3 text-right">Total Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {warehouseModalData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50">
                      <td className="px-4 py-3 border-r border-zinc-100 font-medium text-zinc-900">{item.part_number}</td>
                      <td className="px-4 py-3 border-r border-zinc-100 text-zinc-600">{item.item_name}</td>
                      <td className="px-4 py-3 border-r border-zinc-100 text-zinc-600">{item.category || '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-zinc-900">{item.total_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
    </div>
  );
}
