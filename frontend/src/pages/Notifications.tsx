import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  CheckCircle, 
  XCircle, 
  Package,
  X
} from 'lucide-react';
import { Button } from "@/components/ui/button";

interface Notification {
  id: number;
  title: string;
  message: string;
  related_entity_type: string;
  related_entity_id: number;
  is_read: boolean;
  created_at: string;
}

interface Picklist {
  id: number;
  customer_name: string;
  status: string;
  transfer_status: string;
  items: PicklistItem[];
}

interface PicklistItem {
  item_id: number;
  part_number: string;
  item_name: string;
  warehouse: string;
  bin_location: string;
  required_quantity: number;
  transfer_status?: string;
  transfer_rejection_reason?: string;
  actual_warehouse?: string;
  actual_bin_location?: string;
}

export default function Notifications() {
  const { token } = useAuth();
  const navigate = useNavigate();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [picklistData, setPicklistData] = useState<Picklist | null>(null);
  const [loadingPicklist, setLoadingPicklist] = useState(false);
  
  const [decisionItemId, setDecisionItemId] = useState<number | null>(null);
  const [decisionType, setDecisionType] = useState<'possible' | 'not_possible' | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actualWarehouse, setActualWarehouse] = useState("");
  const [actualBin, setActualBin] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      } else {
        setError("Failed to load notifications");
      }
    } catch (err) {
      setError("An error occurred while loading notifications");
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.is_read) {
      markAsRead(notif.id);
    }
    
    if (notif.related_entity_type === 'picklist') {
      setSelectedNotification(notif);
      setLoadingPicklist(true);
      setPicklistData(null);
      resetDecisionState();
      
      try {
        const res = await fetch(`${API_URL}/api/picklists/${notif.related_entity_id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setPicklistData(data);
        }
      } catch (err) {
        console.error("Failed to load picklist", err);
      } finally {
        setLoadingPicklist(false);
      }
    }
  };

  const resetDecisionState = () => {
    setDecisionItemId(null);
    setDecisionType(null);
    setRejectionReason("");
    setActualWarehouse("");
    setActualBin("");
  };

  const handleOpenDecision = (item: PicklistItem, type: 'possible' | 'not_possible') => {
    setDecisionItemId(item.item_id);
    setDecisionType(type);
    if (type === 'possible') {
      setActualWarehouse(item.warehouse);
      setActualBin(item.bin_location);
    } else {
      setRejectionReason("");
    }
  };

  const submitItemDecision = async () => {
    if (decisionType === 'not_possible' && !rejectionReason.trim()) {
      alert("Please enter a reason.");
      return;
    }
    if (decisionType === 'possible' && (!actualWarehouse.trim() || !actualBin.trim())) {
      alert("Please provide the actual warehouse and bin location.");
      return;
    }
    
    if (!picklistData || !decisionItemId) return;
    
    setSubmittingDecision(true);
    try {
      const res = await fetch(`${API_URL}/api/picklists/${picklistData.id}/items/${decisionItemId}/decision`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          decision: decisionType, 
          reason: rejectionReason,
          actual_warehouse: actualWarehouse,
          actual_bin_location: actualBin
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // Update local picklist state
        setPicklistData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            transfer_status: data.overall_status,
            items: prev.items.map(item => {
              if (item.item_id === decisionItemId) {
                return {
                  ...item,
                  transfer_status: data.status,
                  transfer_rejection_reason: decisionType === 'not_possible' ? rejectionReason : undefined,
                  actual_warehouse: decisionType === 'possible' ? actualWarehouse : undefined,
                  actual_bin_location: decisionType === 'possible' ? actualBin : undefined
                };
              }
              return item;
            })
          };
        });
        
        resetDecisionState();
      } else {
        alert("Failed to submit decision.");
      }
    } catch (err) {
      alert("An error occurred while submitting decision.");
    } finally {
      setSubmittingDecision(false);
    }
  };

  const proceedToStockTransfer = () => {
    if (!picklistData) return;
    
    // Find all possible items
    const possibleItems = picklistData.items.filter(item => item.transfer_status === 'Possible');
    
    if (possibleItems.length === 0) {
      alert("No items were approved for transfer.");
      return;
    }
    
    // Navigate to stock transfer with pre-filled items
    navigate('/transfer', { 
      state: { 
        prefillItems: possibleItems.map(item => ({
          part_number: item.part_number,
          item_name: item.item_name,
          from_warehouse: item.actual_warehouse || item.warehouse,
          from_bin: item.actual_bin_location || item.bin_location,
          quantity: item.required_quantity
        })),
        picklist_id: picklistData.id
      } 
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#8F2C00] to-[#1F8F00] bg-clip-text text-transparent">Notifications</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage your pending alerts and requests</p>
        </div>
      </div>

      <div className="flex-1 bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-red-500">
            {error}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <Bell size={48} className="text-zinc-200 mb-4" />
            <h3 className="text-lg font-medium text-zinc-900">No notifications</h3>
            <p className="text-sm text-zinc-500 mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 overflow-y-auto">
            {notifications.map(notif => (
              <div 
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-4 hover:bg-zinc-50 cursor-pointer transition-colors flex items-start gap-4 ${notif.is_read ? 'opacity-70' : 'bg-indigo-50/30'}`}
              >
                <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${notif.is_read ? 'bg-zinc-100 text-zinc-500' : 'bg-indigo-100 text-indigo-600'}`}>
                  <Bell size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`text-sm font-medium truncate ${notif.is_read ? 'text-zinc-700' : 'text-zinc-900'}`}>
                      {notif.title}
                    </h4>
                    <span className="text-xs text-zinc-500 whitespace-nowrap">
                      {new Date(notif.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 mt-1">{notif.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decision Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <h2 className="text-lg font-semibold text-zinc-900">Stock Transfer Request</h2>
              <button 
                onClick={() => setSelectedNotification(null)}
                className="text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {loadingPicklist ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : picklistData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Picklist ID</p>
                      <p className="font-semibold text-zinc-900">#{picklistData.id}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Customer</p>
                      <p className="font-semibold text-zinc-900">{picklistData.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Current Transfer Status</p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        picklistData.transfer_status === 'Transfer Decisions Made' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {picklistData.transfer_status || 'Pending Transfer Decision'}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                        <Package size={16} className="text-zinc-500" />
                        Requested Items
                      </h3>
                      {picklistData.items.some(i => i.transfer_status === 'Possible') && (
                        <Button onClick={proceedToStockTransfer}>
                          Proceed to Stock Transfer
                        </Button>
                      )}
                    </div>
                    <div className="border border-zinc-200 rounded-lg overflow-x-auto">
                      <table className="w-full min-w-[800px] text-sm text-left">
                        <thead className="text-xs text-zinc-500 bg-zinc-50 border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-3 font-medium">Part Number</th>
                            <th className="px-4 py-3 font-medium">Requested Location</th>
                            <th className="px-4 py-3 font-medium text-right">Qty</th>
                            <th className="px-4 py-3 font-medium text-center">Status</th>
                            <th className="px-4 py-3 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {picklistData.items.map((item) => (
                            <React.Fragment key={item.item_id}>
                              <tr className="hover:bg-zinc-50/50">
                                <td className="px-4 py-3 font-medium text-zinc-900">
                                  {item.part_number}
                                  <div className="text-xs text-zinc-500 font-normal">{item.item_name}</div>
                                </td>
                                <td className="px-4 py-3 text-zinc-600">
                                  {item.warehouse} / {item.bin_location}
                                </td>
                                <td className="px-4 py-3 font-semibold text-zinc-900 text-right">{item.required_quantity}</td>
                                <td className="px-4 py-3 text-center">
                                  {item.transfer_status === 'Possible' ? (
                                    <div className="flex flex-col items-center">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                                        Possible
                                      </span>
                                      {(item.actual_warehouse !== item.warehouse || item.actual_bin_location !== item.bin_location) && (
                                        <span className="text-[10px] text-zinc-500 mt-1">
                                          from {item.actual_warehouse}/{item.actual_bin_location}
                                        </span>
                                      )}
                                    </div>
                                  ) : item.transfer_status === 'Not Possible' ? (
                                    <div className="flex flex-col items-center">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                                        Not Possible
                                      </span>
                                      <span className="text-[10px] text-zinc-500 mt-1 max-w-[120px] truncate" title={item.transfer_rejection_reason}>
                                        {item.transfer_rejection_reason}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                                      Pending
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button 
                                      size="xs"
                                      variant="outline"
                                      onClick={() => handleOpenDecision(item, 'possible')}
                                      disabled={decisionItemId === item.item_id}
                                    >
                                      <CheckCircle size={14} className="mr-1" /> Yes
                                    </Button>
                                    <Button 
                                      size="xs"
                                      variant="destructive"
                                      onClick={() => handleOpenDecision(item, 'not_possible')}
                                      disabled={decisionItemId === item.item_id}
                                    >
                                      <XCircle size={14} className="mr-1" /> No
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                              
                              {/* Decision Inline Form */}
                              {decisionItemId === item.item_id && (
                                <tr className="bg-blue-50/50">
                                  <td colSpan={5} className="px-4 py-4 border-b border-blue-100">
                                    <div className="flex items-start gap-4">
                                      <div className="flex-1">
                                        {decisionType === 'possible' ? (
                                          <div className="flex gap-4">
                                            <div className="flex-1 space-y-1 text-left">
                                              <label className="text-xs font-medium text-zinc-700">Actual Source Warehouse</label>
                                              <input 
                                                type="text" 
                                                value={actualWarehouse}
                                                onChange={e => setActualWarehouse(e.target.value)}
                                                className="w-full text-sm rounded border-zinc-300 p-2"
                                              />
                                            </div>
                                            <div className="flex-1 space-y-1 text-left">
                                              <label className="text-xs font-medium text-zinc-700">Actual Source Bin</label>
                                              <input 
                                                type="text" 
                                                value={actualBin}
                                                onChange={e => setActualBin(e.target.value)}
                                                className="w-full text-sm rounded border-zinc-300 p-2"
                                              />
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="space-y-1 text-left">
                                            <label className="text-xs font-medium text-red-700">Reason for Rejection *</label>
                                            <input 
                                              type="text" 
                                              value={rejectionReason}
                                              onChange={e => setRejectionReason(e.target.value)}
                                              placeholder="Why is this transfer not possible?"
                                              className="w-full text-sm rounded border-red-200 focus:border-red-500 focus:ring-red-500 p-2"
                                            />
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-end gap-2 self-end">
                                        <Button variant="outline" onClick={resetDecisionState}>
                                          Cancel
                                        </Button>
                                        <Button onClick={submitItemDecision} disabled={submittingDecision}>
                                          {submittingDecision ? 'Saving...' : 'Save Decision'}
                                        </Button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  Failed to load picklist data.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
