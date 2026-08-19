import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { Boxes, Search, AlertCircle } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Bins() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const warehouseParam = (user?.role === 'warehouse_admin' && user?.warehouse_code) ? user.warehouse_code : '';

  const fetchStock = async (currentPage = 1, search = '') => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_URL}/api/inventory?page=${currentPage}&limit=50`;
      if (search) {
        url += `&search=${encodeURIComponent(search)}`;
      }
      if (warehouseParam) {
        url += `&warehouse=${encodeURIComponent(warehouseParam)}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load stock.');
      }

      const flattened = [];
      for (const item of data.items || []) {
        for (const loc of item.locations || []) {
          if (warehouseParam && loc.warehouse !== warehouseParam) continue;
          if (loc.quantity > 0) {
            flattened.push({
              part_number: item.part_number,
              item_name: item.item_name,
              category: item.category,
              warehouse: loc.warehouse,
              bin_location: loc.bin_location,
              quantity: loc.quantity
            });
          }
        }
      }

      setItems(flattened);
      setTotalPages(data.pages || 1);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Error loading bins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStock(1, searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, warehouseParam]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchStock(newPage, searchTerm);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#8F2C00] to-[#1F8F00] bg-clip-text text-transparent">Bin Stock</h1>
          <p className="text-zinc-500 text-sm mt-1.5 font-medium">View all items currently stored in bins{warehouseParam ? ` for ${warehouseParam}` : ''}.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-4 rounded-xl flex items-center gap-3">
          <AlertCircle size={16} className="text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="bg-white border border-zinc-200/85 rounded-xl shadow-sm">
        <CardHeader className="border-b border-zinc-100 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Boxes size={18} className="text-indigo-600" />
              <CardTitle className="text-md font-bold text-zinc-900">Stock per Bin</CardTitle>
            </div>
            
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <Input 
                placeholder="Search part no, item name..." 
                className="pl-9 h-9 text-xs bg-zinc-50 border-zinc-200 focus-visible:ring-zinc-400 rounded-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-zinc-50/70">
                <TableRow>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Bin Location</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Part Number</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Item Name</TableHead>
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Category</TableHead>
                  {!warehouseParam && <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Warehouse</TableHead>}
                  <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center text-zinc-400">
                        <Boxes size={24} className="mb-2 opacity-50 animate-pulse" />
                        <span className="text-xs font-medium">Loading stock data...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center text-zinc-400">
                        <Search size={24} className="mb-2 opacity-50" />
                        <span className="text-xs font-medium">No items found in bins.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, idx) => (
                    <TableRow key={idx} className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors">
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] bg-white border-zinc-300 text-zinc-700 font-bold px-2 py-0.5">
                          {item.bin_location}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-bold text-zinc-900">{item.part_number}</TableCell>
                      <TableCell className="text-xs text-zinc-600 font-medium">{item.item_name}</TableCell>
                      <TableCell className="text-xs text-zinc-500">{item.category}</TableCell>
                      {!warehouseParam && <TableCell className="text-[10px] text-zinc-500">{item.warehouse}</TableCell>}
                      <TableCell className="text-xs text-right font-bold text-zinc-900">{item.quantity} pcs</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 bg-white">
              <span className="text-xs text-zinc-500 font-medium">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  Previous
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
