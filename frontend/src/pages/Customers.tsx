import React, { useState, useEffect, useRef } from 'react';
import { useAuth, API_URL } from '../App';
import { 
  Users, 
  Upload, 
  UserPlus, 
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Download,
  Pencil
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface CustomerItem {
  id: number;
  customer_name: string;
  cr_cash: string;
  location: string;
  salesman: string;
  created_at: string;
}

export default function Customers() {
  const { user } = useAuth();
  const [customersList, setCustomersList] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [customerName, setCustomerName] = useState('');
  const [crCash, setCrCash] = useState('CR');
  const [location, setLocation] = useState('DUBAI');
  const [salesman, setSalesman] = useState('ISAMAIL');
  
  // Bulk upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Feedback alerts
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCrCash, setEditCrCash] = useState('CR');
  const [editLocation, setEditLocation] = useState('DUBAI');
  const [editSalesman, setEditSalesman] = useState('ISAMAIL');

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/customers`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch customers.');
      }
      const data = await response.json();
      setCustomersList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/customers`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          customer_name: customerName,
          cr_cash: crCash,
          location,
          salesman
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Customer creation failed.');
      }

      setSuccess(`Customer "${customerName}" created successfully!`);
      // Reset form
      setCustomerName('');
      setCrCash('CR');
      setLocation('DUBAI');
      setSalesman('ISAMAIL');
      
      // Reload directory
      fetchCustomers();
    } catch (err: any) {
      setError(err.message || 'Something went wrong while creating the customer.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/api/customers/bulk`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Bulk upload failed.');
      }

      setSuccess(data.success || 'Bulk upload completed successfully!');
      if (data.errors && data.errors.length > 0) {
        console.warn("Some rows failed to import:", data.errors);
      }
      
      fetchCustomers();
    } catch (err: any) {
      setError(err.message || 'Failed to upload customers.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const openEditDialog = (customer: CustomerItem) => {
    setEditingCustomer(customer);
    setEditCustomerName(customer.customer_name);
    setEditCrCash(customer.cr_cash);
    setEditLocation(customer.location);
    setEditSalesman(customer.salesman);
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    
    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          customer_name: editCustomerName,
          cr_cash: editCrCash,
          location: editLocation,
          salesman: editSalesman
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Customer update failed.');
      }

      setSuccess(`Customer "${editCustomerName}" updated successfully!`);
      setIsEditDialogOpen(false);
      setEditingCustomer(null);
      fetchCustomers();
    } catch (err: any) {
      setError(err.message || 'Something went wrong while updating the customer.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 flex items-center gap-2">
          <Users className="text-indigo-600" /> Customers Management
        </h1>
        <p className="text-zinc-500 text-sm mt-1.5 font-medium">Create customers individually or upload them via Excel/CSV.</p>
      </div>

      {/* Dynamic Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-4 rounded-xl flex items-center gap-3 shadow-sm">
          <AlertCircle size={16} className="text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-250 text-emerald-700 text-xs font-semibold p-4 rounded-xl flex items-center gap-3 shadow-sm">
          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Forms Column */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Individual Creation Card */}
          <Card className="bg-white border border-zinc-200/85 rounded-xl shadow-sm">
            <CardHeader className="pb-4 border-b border-zinc-100">
              <CardTitle className="text-base font-bold text-zinc-800 flex items-center gap-2">
                <UserPlus size={18} className="text-indigo-500" />
                Individual Creation
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Add a new customer to the database.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleCreateCustomer} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Customer Name</label>
                  <Input 
                    type="text" 
                    required 
                    placeholder="e.g. ACCL International DMCC" 
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">CR / CASH</label>
                  <Select value={crCash} onValueChange={setCrCash}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CR" className="text-xs">CR</SelectItem>
                      <SelectItem value="CASH" className="text-xs">CASH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Location</label>
                  <Input 
                    type="text" 
                    required 
                    placeholder="e.g. DUBAI" 
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700">Salesman</label>
                  <Input 
                    type="text" 
                    required 
                    placeholder="e.g. ISAMAIL" 
                    value={salesman}
                    onChange={(e) => setSalesman(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                
                <Button 
                  type="submit" 
                  disabled={actionLoading} 
                  className="w-full h-9 mt-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {actionLoading ? 'Creating...' : 'Create Customer'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Bulk Upload Card */}
          <Card className="bg-white border border-zinc-200/85 rounded-xl shadow-sm">
            <CardHeader className="pb-4 border-b border-zinc-100">
              <CardTitle className="text-base font-bold text-zinc-800 flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-green-600" />
                Bulk Upload
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Upload customers from an Excel or CSV file.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Ensure your file has headers: <strong>CUSTOMER NAME</strong>, <strong>CR/CASH</strong>, <strong>LOCATION</strong>, <strong>SALESMAN</strong>.
              </p>
              
              <div className="flex items-center gap-3">
                <input 
                  type="file" 
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <Button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-9 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white flex items-center gap-2"
                >
                  {uploading ? (
                    'Uploading...'
                  ) : (
                    <>
                      <Upload size={14} /> Choose File & Upload
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Table Column */}
        <div className="lg:col-span-8">
          <Card className="bg-white border border-zinc-200/85 rounded-xl shadow-sm flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
              <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                <Users size={16} className="text-zinc-400" />
                Customer Directory
              </h3>
              <Badge variant="secondary" className="bg-zinc-200 text-zinc-700 font-bold px-2 py-0.5 text-[10px]">
                {customersList.length} total
              </Badge>
            </div>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-zinc-50 border-y border-zinc-100">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[80px] text-[10px] font-bold text-zinc-500 tracking-wider uppercase h-9">ID</TableHead>
                    <TableHead className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase h-9">Customer Name</TableHead>
                    <TableHead className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase h-9">Type</TableHead>
                    <TableHead className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase h-9">Location</TableHead>
                    <TableHead className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase h-9">Salesman</TableHead>
                    <TableHead className="w-[60px] text-[10px] font-bold text-zinc-500 tracking-wider uppercase h-9 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-xs text-zinc-500">
                        Loading customers...
                      </TableCell>
                    </TableRow>
                  ) : customersList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-xs text-zinc-500">
                        No customers found. Create one or upload a list.
                      </TableCell>
                    </TableRow>
                  ) : (
                    customersList.map((customer) => (
                      <TableRow key={customer.id} className="group hover:bg-zinc-50/80 transition-colors">
                        <TableCell className="font-mono text-[10px] text-zinc-500 py-3">#{customer.id}</TableCell>
                        <TableCell className="font-semibold text-xs text-zinc-800 py-3">
                          {customer.customer_name}
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant="outline" className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0 border ${customer.cr_cash.toUpperCase() === 'CASH' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                            {customer.cr_cash}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-600 py-3">
                          {customer.location}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-zinc-700 py-3">
                          {customer.salesman}
                        </TableCell>
                        <TableCell className="text-right py-3">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openEditDialog(customer)}
                            className="h-7 w-7 text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50"
                          >
                            <Pencil size={14} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>
      
      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-zinc-800">Edit Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700">Customer Name</label>
              <Input 
                type="text" 
                required 
                value={editCustomerName}
                onChange={(e) => setEditCustomerName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700">CR / CASH</label>
              <Select value={editCrCash} onValueChange={setEditCrCash}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CR" className="text-xs">CR</SelectItem>
                  <SelectItem value="CASH" className="text-xs">CASH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700">Location</label>
              <Input 
                type="text" 
                required 
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700">Salesman</label>
              <Input 
                type="text" 
                required 
                value={editSalesman}
                onChange={(e) => setEditSalesman(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsEditDialogOpen(false)}
                className="h-9 text-xs font-medium"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={actionLoading} 
                className="h-9 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {actionLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
