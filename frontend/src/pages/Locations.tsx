import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { 
  Plus, 
  Search, 
  MapPin, 
  AlertCircle, 
  Building2, 
  Layers,
  Check
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ValidatedInput } from "@/components/ui/ValidatedInput";
import { SuccessModal } from "@/components/ui/SuccessModal";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface Warehouse {
  id: number;
  code: string;
  name: string;
}

interface Bin {
  id: number;
  warehouse_id: number;
  code: string;
  warehouse_code: string;
}

export default function Locations() {
  const { user } = useAuth();
  
  // Data lists
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Warehouse form inputs
  const [whCode, setWhCode] = useState('');
  const [whName, setWhName] = useState('');
  
  // Bin form inputs
  const [selectedWhId, setSelectedWhId] = useState('');
  const [binCode, setBinCode] = useState('');
  
  // Directory Search
  const [searchQuery, setSearchQuery] = useState('');

  // Status feedback messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [whErrors, setWhErrors] = useState<Record<string, string>>({});
  const [binErrors, setBinErrors] = useState<Record<string, string>>({});
  const [submittingWh, setSubmittingWh] = useState(false);
  const [submittingBin, setSubmittingBin] = useState(false);

  // Fetch all warehouse masters
  const fetchWarehouses = async () => {
    try {
      const res = await fetch(`${API_URL}/api/warehouses`);
      const data = await res.json();
      setWarehouses(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Fetch warehouses failed:", e);
    }
  };

  // Fetch all bin masters
  const fetchBins = async () => {
    try {
      const res = await fetch(`${API_URL}/api/bins`);
      const data = await res.json();
      setBins(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Fetch bins failed:", e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchWarehouses(), fetchBins()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle new Warehouse submission
  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    const newErrors: Record<string, string> = {};
    if (!whCode.trim()) newErrors.whCode = "Warehouse Code is required";
    if (!whName.trim()) newErrors.whName = "Warehouse Name is required";
    
    if (Object.keys(newErrors).length > 0) {
      setWhErrors(newErrors);
      return;
    }
    
    setWhErrors({});
    setSubmittingWh(true);

    try {
      const res = await fetch(`${API_URL}/api/warehouses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: whCode.trim(),
          name: whName.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create warehouse");
      }

      setSuccess(`Warehouse '${whCode.trim().toUpperCase()}' created successfully.`);
      setWhCode('');
      setWhName('');
      await fetchWarehouses();
    } catch (err: any) {
      setError(err.message || "Error occurred");
    } finally {
      setSubmittingWh(false);
    }
  };

  // Handle new Bin submission (linked to Warehouse)
  const handleCreateBin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    const newErrors: Record<string, string> = {};
    if (!selectedWhId) newErrors.selectedWhId = "Warehouse is required";
    if (!binCode.trim()) newErrors.binCode = "Bin Code is required";
    
    if (Object.keys(newErrors).length > 0) {
      setBinErrors(newErrors);
      return;
    }
    
    setBinErrors({});
    setSubmittingBin(true);

    try {
      const res = await fetch(`${API_URL}/api/bins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse_id: parseInt(selectedWhId),
          code: binCode.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create bin");
      }

      const whCodeName = warehouses.find(w => w.id === parseInt(selectedWhId))?.code || '';
      setSuccess(`Bin '${binCode.trim().toUpperCase()}' successfully linked to Warehouse '${whCodeName}'.`);
      setBinCode('');
      await fetchBins();
    } catch (err: any) {
      setError(err.message || "Error occurred");
    } finally {
      setSubmittingBin(false);
    }
  };

  // Filter warehouses based on search query
  const filteredWarehouses = warehouses.filter(wh => 
    wh.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wh.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#8F2C00] to-[#1F8F00] bg-clip-text text-transparent">Locations Setup</h1>
          <p className="text-zinc-500 text-sm mt-1.5">Configure master warehouses, establish new storage bin coordinates, and map relationships.</p>
        </div>
      </div>

      {/* Message Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-lg flex items-start gap-2.5 max-w-4xl">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <SuccessModal
        isOpen={!!success}
        message={success}
        onClose={() => setSuccess(null)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Side Column: Forms for Creation */}
        <div className="space-y-6 lg:col-span-1">
          {/* Create Warehouse Master Card */}
          <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-md font-bold text-zinc-900 flex items-center gap-2">
                <Building2 size={16} className="text-zinc-550" />
                <span>Create Warehouse</span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                Register a new physical warehouse facility record
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateWarehouse} className="space-y-4">
                <div className="space-y-1.5">
                  <ValidatedInput 
                    label="Warehouse Code"
                    type="text" 
                    className="bg-white border-zinc-200 text-zinc-800 text-xs h-9"
                    placeholder="e.g., WH-03" 
                    value={whCode} 
                    onChange={e => {
                      setWhCode(e.target.value);
                      if (whErrors.whCode) setWhErrors({ ...whErrors, whCode: '' });
                    }}
                    error={whErrors.whCode}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <ValidatedInput 
                    label="Warehouse Name"
                    type="text" 
                    className="bg-white border-zinc-200 text-zinc-800 text-xs h-9"
                    placeholder="e.g., Dallas Storage" 
                    value={whName} 
                    onChange={e => {
                      setWhName(e.target.value);
                      if (whErrors.whName) setWhErrors({ ...whErrors, whName: '' });
                    }}
                    error={whErrors.whName}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={submittingWh}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  <span>{submittingWh ? 'Saving...' : 'Add Warehouse'}</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Create Bin Master Linked to Warehouse */}
          <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-md font-bold text-zinc-900 flex items-center gap-2">
                <MapPin size={16} className="text-zinc-550" />
                <span>Create Bin Location</span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                Define storage bin coordinate connected to a warehouse
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateBin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-zinc-500">
                    Select Warehouse <span className="text-[#E11D48]">*</span>
                  </label>
                  <select
                    className={`w-full p-2.5 h-10 rounded-md bg-white border text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${binErrors.selectedWhId ? 'border-[#E11D48] focus:ring-[#E11D48] text-[#E11D48]' : 'border-zinc-300 focus:ring-zinc-400 text-zinc-800'}`}
                    value={selectedWhId}
                    onChange={e => {
                      setSelectedWhId(e.target.value);
                      if (binErrors.selectedWhId) setBinErrors({ ...binErrors, selectedWhId: '' });
                    }}
                    required
                  >
                    <option value="">-- Choose Warehouse --</option>
                    {warehouses.map(wh => (
                      <option key={wh.id} value={wh.id}>
                        {wh.code} - {wh.name}
                      </option>
                    ))}
                  </select>
                  {binErrors.selectedWhId && <span className="text-[#E11D48] text-xs mt-1 block">{binErrors.selectedWhId}</span>}
                </div>
                <div className="space-y-1.5">
                  <ValidatedInput 
                    label="Bin Coordinate Code"
                    type="text" 
                    className="bg-white border-zinc-200 text-zinc-800 text-xs h-9"
                    placeholder="e.g., BIN-C02" 
                    value={binCode} 
                    onChange={e => {
                      setBinCode(e.target.value);
                      if (binErrors.binCode) setBinErrors({ ...binErrors, binCode: '' });
                    }}
                    error={binErrors.binCode}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={submittingBin}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  <span>{submittingBin ? 'Saving...' : 'Link Storage Bin'}</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Side Column: Directory Listing (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-white border border-zinc-200/80 rounded-xl shadow-sm overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-100">
              <div>
                <CardTitle className="text-md font-bold text-zinc-900">Warehouse Master Hierarchy</CardTitle>
                <CardDescription className="text-xs text-zinc-400">Directory mapping warehouse nodes and their connected storage bins</CardDescription>
              </div>
              <div className="relative w-full sm:w-48">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-450" />
                <input
                  type="text"
                  className="w-full pl-8 h-7.5 bg-white border border-zinc-200 text-xs text-zinc-850 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900"
                  placeholder="Search locations"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {loading ? (
                <div className="text-center py-12 text-zinc-400 text-xs">
                  Loading master data directories...
                </div>
              ) : filteredWarehouses.length === 0 ? (
                <div className="text-center py-12 text-zinc-400 text-xs">
                  No warehouses configuration records match search criteria.
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredWarehouses.map((wh) => {
                    // Filter bins linked to this warehouse id
                    const linkedBins = bins.filter(b => b.warehouse_id === wh.id);
                    
                    return (
                      <div key={wh.id} className="p-4 bg-zinc-50 border border-zinc-205/65 rounded-xl space-y-3.5">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-zinc-950 text-white flex items-center justify-center shrink-0 shadow-sm">
                              <Building2 size={15} />
                            </div>
                            <div>
                              <h3 className="font-extrabold text-sm text-zinc-900 leading-tight">{wh.code}</h3>
                              <span className="text-[10px] text-zinc-500 font-semibold block">{wh.name}</span>
                            </div>
                          </div>
                          <Badge variant="outline" className="border-zinc-200 bg-white text-zinc-650 font-bold text-[9px] rounded-md px-1.5 py-0.5">
                            {linkedBins.length} Connected Bins
                          </Badge>
                        </div>
                        
                        {/* Connected Bins List */}
                        <div className="border-t border-zinc-200/50 pt-3">
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Connected Storage Bins</span>
                          {linkedBins.length === 0 ? (
                            <span className="text-[10px] text-zinc-400 italic block pl-1">No bins defined for this warehouse. Use the form on the left to add storage zones.</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {linkedBins.map(bin => (
                                <Badge 
                                  key={bin.id} 
                                  className="bg-white border border-zinc-200 text-zinc-800 hover:bg-zinc-50/50 text-[10px] font-semibold rounded-md px-2.5 py-1 flex items-center gap-1 shrink-0"
                                >
                                  <Layers size={10} className="text-zinc-450" />
                                  <span>{bin.code}</span>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
