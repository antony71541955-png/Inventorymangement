import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Package,
  ArrowRight,
  Clock,
  X
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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
  id: number;
  part_number: string;
  item_name: string;
  warehouse: string;
  bin_location: string;
  required_quantity: number;
}

export default function Notifications() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [picklistData, setPicklistData] = useState<Picklist | null>(null);
  const [loadingPicklist, setLoadingPicklist] = useState(false);
  
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
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
      setIsRejecting(false);
      setRejectionReason("");
      
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

  const handleDecision = async (decision: 'possible' | 'not_possible') => {
    if (decision === 'not_possible' && !rejectionReason.trim()) {
      alert("Please enter a reason.");
      return;
    }
    
    if (!picklistData) return;
    
    setSubmittingDecision(true);
    try {
      const res = await fetch(`${API_URL}/api/picklists/${picklistData.id}/decision`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ decision, reason: rejectionReason })
      });
      
      if (res.ok) {
        setSelectedNotification(null);
        if (decision === 'possible') {
          // Navigate to stock transfer with pre-filled items
          navigate('/transfer', { 
            state: { 
              prefillItems: picklistData.items.map(item => ({
                part_number: item.part_number,
                item_name: item.item_name,
                from_warehouse: item.warehouse,
                from_bin: item.bin_location,
                quantity: item.required_quantity
              })),
              picklist_id: picklistData.id
            } 
          });
        } else {
          // Just close modal if rejected
          alert("Decision submitted successfully.");
        }
      } else {
        alert("Failed to submit decision.");
      }
    } catch (err) {
      alert("An error occurred while submitting decision.");
    } finally {
      setSubmittingDecision(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Notifications</h1>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
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
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {picklistData.transfer_status || 'Pending Transfer Decision'}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                      <Package size={16} className="text-zinc-500" />
                      Requested Items
                    </h3>
                    <div className="border border-zinc-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-zinc-500 bg-zinc-50 border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-2 font-medium">Part Number</th>
                            <th className="px-4 py-2 font-medium">From Warehouse</th>
                            <th className="px-4 py-2 font-medium">From Bin</th>
                            <th className="px-4 py-2 font-medium text-right">Required Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {picklistData.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-zinc-50">
                              <td className="px-4 py-2 font-medium text-zinc-900">{item.part_number}</td>
                              <td className="px-4 py-2 text-zinc-600">{item.warehouse}</td>
                              <td className="px-4 py-2 text-zinc-600">{item.bin_location}</td>
                              <td className="px-4 py-2 font-semibold text-zinc-900 text-right">{item.required_quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  {picklistData.transfer_status && picklistData.transfer_status !== 'Pending Transfer Decision' ? (
                    <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 text-center text-sm text-zinc-600">
                      A decision has already been made for this picklist: <strong>{picklistData.transfer_status}</strong>
                    </div>
                  ) : isRejecting ? (
                    <div className="space-y-3 bg-red-50 p-4 rounded-lg border border-red-100">
                      <label className="block text-sm font-medium text-red-900">Reason for Rejection *</label>
                      <textarea 
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="w-full rounded-md border-red-200 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm p-3"
                        rows={3}
                        placeholder="Please explain why the transfer is not possible..."
                        required
                      ></textarea>
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          className="bg-white"
                          onClick={() => { setIsRejecting(false); setRejectionReason(""); }}
                        >
                          Cancel
                        </Button>
                        <Button 
                          variant="destructive"
                          onClick={() => handleDecision('not_possible')}
                          disabled={submittingDecision || !rejectionReason.trim()}
                        >
                          {submittingDecision ? 'Submitting...' : 'Submit Decision'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3 pt-2">
                      <Button 
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleDecision('possible')}
                        disabled={submittingDecision}
                      >
                        <CheckCircle size={16} className="mr-2" />
                        Transfer Possible
                      </Button>
                      <Button 
                        variant="destructive" 
                        className="flex-1"
                        onClick={() => setIsRejecting(true)}
                        disabled={submittingDecision}
                      >
                        <XCircle size={16} className="mr-2" />
                        Transfer Not Possible
                      </Button>
                    </div>
                  )}
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
