import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, API_URL } from '../App';
import { 
  Trash2, 
  AlertTriangle, 
  ShieldAlert, 
  ShieldCheck, 
  Key, 
  Lock, 
  Eye, 
  EyeOff, 
  Database, 
  CheckCircle2, 
  RefreshCw, 
  HardDrive,
  Users,
  Boxes,
  ClipboardList,
  History,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

interface DbStats {
  items: number;
  stock_balances: number;
  stock_journal: number;
  warehouses: number;
  bins: number;
  customers: number;
  picklists: number;
  picklist_items: number;
  dispatch_picklists: number;
  dispatch_picklist_items: number;
  internal_transfer_requests: number;
  internal_transfer_request_items: number;
  notifications: number;
  users: number;
}

export default function ClearDatabase() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DbStats | null>(null);
  const [dbSizeMb, setDbSizeMb] = useState<number>(0);
  const [uploadCount, setUploadCount] = useState<number>(0);
  const [uploadSizeMb, setUploadSizeMb] = useState<number>(0);
  const [superadminInfo, setSuperadminInfo] = useState<{ username: string; full_name: string } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');

  // Password Visibility Toggles
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status and Confirmation Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    message: string;
    passwordUpdated: boolean;
    clearedSummary: Record<string, number>;
  } | null>(null);

  const fetchStats = async () => {
    setLoadingStats(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/db-stats`);
      if (!res.ok) {
        throw new Error('Failed to retrieve database statistics.');
      }
      const data = await res.json();
      setStats(data.stats);
      setDbSizeMb(data.db_size_mb || 0);
      setUploadCount(data.upload_files_count || 0);
      setUploadSizeMb(data.upload_size_mb || 0);
      if (data.superadmin) {
        setSuperadminInfo(data.superadmin);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Could not load database metrics.');
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Form validation logic
  const isPhraseValid = confirmPhrase.trim().toUpperCase() === 'CLEAR DATA';
  const isCurrentPasswordEntered = currentPassword.length > 0;
  
  // New password validation
  const isNewPasswordEntered = newPassword.length > 0;
  const isNewPasswordLengthValid = !isNewPasswordEntered || newPassword.length >= 6;
  const isNewPasswordMatching = !isNewPasswordEntered || (newPassword === confirmNewPassword);

  const canSubmit = 
    isPhraseValid && 
    isCurrentPasswordEntered && 
    isNewPasswordLengthValid && 
    isNewPasswordMatching && 
    !isSubmitting;

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isCurrentPasswordEntered) {
      setErrorMessage('Please enter your current Superadmin password.');
      return;
    }
    if (isNewPasswordEntered && newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters long.');
      return;
    }
    if (isNewPasswordEntered && newPassword !== confirmNewPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }
    if (!isPhraseValid) {
      setErrorMessage("Please type 'CLEAR DATA' into the confirmation box.");
      return;
    }

    setShowConfirmModal(true);
  };

  const handleExecuteClear = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: any = {
        current_password: currentPassword,
      };
      if (isNewPasswordEntered) {
        payload.new_password = newPassword;
      }

      const res = await fetch(`${API_URL}/api/admin/clear-database`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to clear database.');
      }

      setShowConfirmModal(false);
      setSuccessData({
        message: data.message,
        passwordUpdated: data.password_updated,
        clearedSummary: data.cleared_summary || {}
      });

      // Clear input fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setConfirmPhrase('');

      // Refresh live stats
      fetchStats();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'An error occurred during database clear.');
      setShowConfirmModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessClose = () => {
    if (successData?.passwordUpdated) {
      // Logout and force re-login with new password
      logout();
      navigate('/login');
    } else {
      setSuccessData(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-red-950/80 via-zinc-900 to-[#0e121e] border border-red-900/40 rounded-2xl p-6 md:p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="absolute right-0 top-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-semibold uppercase tracking-wider">
              <ShieldAlert size={14} className="text-red-400" />
              Superadmin Danger Zone
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              Clear Database & System Reset
            </h1>
            <p className="text-zinc-300 text-sm max-w-2xl leading-relaxed">
              Safely purge all operational data, items, stock journal history, transfers, customers, and non-admin users. 
              Your <strong className="text-emerald-400 font-semibold">Superadmin account credentials are strictly preserved</strong>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStats}
              disabled={loadingStats}
              className="bg-zinc-900/80 border-zinc-700 text-zinc-200 hover:text-white hover:bg-zinc-800 text-xs flex items-center gap-2 shadow"
            >
              <RefreshCw size={14} className={loadingStats ? "animate-spin" : ""} />
              Refresh Metrics
            </Button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-red-950/50 border border-red-800 text-red-200 px-4 py-3 rounded-xl flex items-center gap-3 text-sm shadow">
          <AlertCircle size={18} className="text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Database Live Metrics Cards */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
          <Database size={14} className="text-indigo-500" />
          Current Database Footprint
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-1">
              <Boxes size={14} className="text-indigo-600" /> Items
            </div>
            <div className="text-xl font-bold text-zinc-900">
              {loadingStats ? "..." : (stats?.items ?? 0).toLocaleString()}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-1">
              <Boxes size={14} className="text-emerald-600" /> Stock Balances
            </div>
            <div className="text-xl font-bold text-zinc-900">
              {loadingStats ? "..." : (stats?.stock_balances ?? 0).toLocaleString()}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-1">
              <History size={14} className="text-amber-600" /> Journal Logs
            </div>
            <div className="text-xl font-bold text-zinc-900">
              {loadingStats ? "..." : (stats?.stock_journal ?? 0).toLocaleString()}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-1">
              <ClipboardList size={14} className="text-blue-600" /> Picklists
            </div>
            <div className="text-xl font-bold text-zinc-900">
              {loadingStats ? "..." : ((stats?.picklists ?? 0) + (stats?.dispatch_picklists ?? 0)).toLocaleString()}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-1">
              <Users size={14} className="text-purple-600" /> Users (All)
            </div>
            <div className="text-xl font-bold text-zinc-900">
              {loadingStats ? "..." : (stats?.users ?? 0).toLocaleString()}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-1">
              <HardDrive size={14} className="text-rose-600" /> DB Size
            </div>
            <div className="text-xl font-bold text-zinc-900">
              {loadingStats ? "..." : `${dbSizeMb} MB`}
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Grid: Scope Details & Action Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Scope & Security Assurance (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Superadmin Preservation Guarantee */}
          <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5 text-emerald-800 font-bold text-sm">
                <ShieldCheck size={20} className="text-emerald-600" />
                Superadmin Preservation Guarantee
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-zinc-700">
              <p>
                When you initiate a system reset, the cleanup algorithm selectively purges operational data while leaving the 
                root Super Administrator account intact.
              </p>
              <div className="bg-white border border-emerald-200/60 rounded-lg p-3 space-y-1.5 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Superadmin Username:</span>
                  <Badge variant="outline" className="font-mono text-emerald-700 border-emerald-300 bg-emerald-50">
                    {superadminInfo?.username || user?.username || 'superadmin'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Account Full Name:</span>
                  <span className="font-semibold text-zinc-800">{superadminInfo?.full_name || user?.full_name || 'Super Administrator'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Role Authority:</span>
                  <Badge className="bg-emerald-600 text-white text-[10px]">superadmin</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reset Scope Breakdown */}
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                <Trash2 size={16} className="text-red-500" />
                Items Targeted for Deletion
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                The following tables and assets will be purged permanently:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 text-zinc-600">
                <div className="flex items-center gap-1.5 p-2 bg-zinc-50 rounded-md border border-zinc-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Master Items
                </div>
                <div className="flex items-center gap-1.5 p-2 bg-zinc-50 rounded-md border border-zinc-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Stock Balances
                </div>
                <div className="flex items-center gap-1.5 p-2 bg-zinc-50 rounded-md border border-zinc-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Stock Journal Logs
                </div>
                <div className="flex items-center gap-1.5 p-2 bg-zinc-50 rounded-md border border-zinc-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Transfer Requests
                </div>
                <div className="flex items-center gap-1.5 p-2 bg-zinc-50 rounded-md border border-zinc-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Picklists & QC
                </div>
                <div className="flex items-center gap-1.5 p-2 bg-zinc-50 rounded-md border border-zinc-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Customers Directory
                </div>
                <div className="flex items-center gap-1.5 p-2 bg-zinc-50 rounded-md border border-zinc-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Warehouses & Bins
                </div>
                <div className="flex items-center gap-1.5 p-2 bg-zinc-50 rounded-md border border-zinc-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Notifications
                </div>
                <div className="flex items-center gap-1.5 p-2 bg-zinc-50 rounded-md border border-zinc-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Other User Accounts
                </div>
                <div className="flex items-center gap-1.5 p-2 bg-zinc-50 rounded-md border border-zinc-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Uploaded Media Files
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-100 italic">
                * Primary key sequences will be reset to 1. Storage is reclaimed via SQLite VACUUM.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Execution Form (7 cols) */}
        <div className="lg:col-span-7">
          <Card className="border-red-200 shadow-md">
            <CardHeader className="border-b border-zinc-100 bg-zinc-50/50 pb-4">
              <CardTitle className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <Lock size={18} className="text-zinc-700" />
                Authorization & Superadmin Password Configuration
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Authenticate with your current credentials, optionally set a new Superadmin password, and confirm deletion.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <form onSubmit={handleOpenConfirm} className="space-y-5">
                
                {/* 1. Current Password (Mandatory) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-800 flex items-center justify-between">
                    <span>Current Superadmin Password <span className="text-red-500">*</span></span>
                    <span className="text-[11px] font-normal text-zinc-500">Required for authorization</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your current password"
                      className="pr-10 text-sm border-zinc-300 focus:border-red-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 focus:outline-none"
                    >
                      {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="border-t border-zinc-200/80 pt-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Key size={16} className="text-indigo-600" />
                    <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wide">
                      Update Superadmin Password (Optional)
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-500">
                    If you would like to change your Superadmin password as part of this reset, enter the new password below. 
                    Leave these fields blank if you want to keep your existing password.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* New Password */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-700">New Password</label>
                      <div className="relative">
                        <Input
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min 6 characters"
                          className="pr-10 text-sm border-zinc-300"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 focus:outline-none"
                        >
                          {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {isNewPasswordEntered && newPassword.length < 6 && (
                        <p className="text-[11px] text-red-500 font-medium">Must be at least 6 characters</p>
                      )}
                    </div>

                    {/* Confirm New Password */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-zinc-700">Confirm New Password</label>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="Re-type new password"
                          className="pr-10 text-sm border-zinc-300"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 focus:outline-none"
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {isNewPasswordEntered && confirmNewPassword && !isNewPasswordMatching && (
                        <p className="text-[11px] text-red-500 font-medium">Passwords do not match</p>
                      )}
                      {isNewPasswordEntered && isNewPasswordMatching && confirmNewPassword.length >= 6 && (
                        <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                          <CheckCircle2 size={12} /> Passwords match
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Confirmation Phrase */}
                <div className="border-t border-zinc-200/80 pt-5 space-y-2">
                  <label className="text-xs font-semibold text-zinc-800">
                    Type <span className="font-mono bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">CLEAR DATA</span> to confirm:
                  </label>
                  <Input
                    type="text"
                    value={confirmPhrase}
                    onChange={(e) => setConfirmPhrase(e.target.value)}
                    placeholder="Type CLEAR DATA"
                    className="text-sm font-mono tracking-wider border-zinc-300 focus:border-red-500"
                    required
                  />
                  <p className="text-[11px] text-zinc-500">
                    This step ensures no accidental data loss can occur.
                  </p>
                </div>

                {/* Submit Action Button */}
                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    className={`w-full py-3 h-12 text-sm font-bold tracking-wide rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                      canSubmit 
                        ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-red-500/25 cursor-pointer active:scale-[0.99]' 
                        : 'bg-zinc-200 text-zinc-400 cursor-not-allowed border border-zinc-300'
                    }`}
                  >
                    <Trash2 size={18} />
                    Clear All Database Data & Reset System
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-[480px] p-6 bg-white rounded-2xl shadow-2xl border-red-200">
          <DialogHeader className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>
            <DialogTitle className="text-center text-lg font-bold text-zinc-900">
              Confirm Complete Database Reset
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-zinc-600 leading-relaxed">
              Are you absolutely certain you want to purge all database records? 
              This action cannot be undone. All inventory balances, transactions, and picklists will be wiped.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 my-3 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-zinc-500">Target Environment:</span>
              <span className="font-semibold text-zinc-800">Connected Database</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Preserved Account:</span>
              <span className="font-bold text-emerald-600">{superadminInfo?.username || 'superadmin'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Password Update:</span>
              <span className={isNewPasswordEntered ? "font-bold text-blue-600" : "text-zinc-500"}>
                {isNewPasswordEntered ? "Will be updated to new password" : "Keep current password"}
              </span>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExecuteClear}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white font-bold w-full sm:w-auto flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Clearing Data...
                </>
              ) : (
                <>
                  <Trash2 size={16} />
                  Yes, Wipe Database Now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Modal */}
      {successData && (
        <Dialog open={true} onOpenChange={handleSuccessClose}>
          <DialogContent className="sm:max-w-[480px] p-6 bg-white rounded-2xl shadow-2xl border-emerald-200">
            <DialogHeader className="space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} />
              </div>
              <DialogTitle className="text-center text-lg font-bold text-zinc-900">
                Database Successfully Cleared!
              </DialogTitle>
              <DialogDescription className="text-center text-xs text-zinc-600">
                {successData.message}
              </DialogDescription>
            </DialogHeader>

            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 my-2 space-y-2 text-xs">
              <div className="font-semibold text-emerald-900 mb-1">Cleared Summary:</div>
              <div className="grid grid-cols-2 gap-2 text-zinc-700">
                <div>Items: <strong className="font-bold text-zinc-900">{successData.clearedSummary.items ?? 0}</strong></div>
                <div>Stock Balances: <strong className="font-bold text-zinc-900">{successData.clearedSummary.stock_balances ?? 0}</strong></div>
                <div>Journal Logs: <strong className="font-bold text-zinc-900">{successData.clearedSummary.stock_journal ?? 0}</strong></div>
                <div>Picklists: <strong className="font-bold text-zinc-900">{(successData.clearedSummary.picklists ?? 0) + (successData.clearedSummary.dispatch_picklists ?? 0)}</strong></div>
                <div>Customers: <strong className="font-bold text-zinc-900">{successData.clearedSummary.customers ?? 0}</strong></div>
                <div>Other Users: <strong className="font-bold text-zinc-900">{successData.clearedSummary.other_users ?? 0}</strong></div>
                <div>Uploads: <strong className="font-bold text-zinc-900">{successData.clearedSummary.uploaded_files ?? 0}</strong></div>
              </div>

              {successData.passwordUpdated && (
                <div className="mt-3 pt-3 border-t border-emerald-200 text-emerald-800 font-medium">
                  🔑 <strong>Superadmin password updated!</strong> You will be redirected to the login screen to sign in with your new credentials.
                </div>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button
                onClick={handleSuccessClose}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full"
              >
                {successData.passwordUpdated ? "Proceed to Login" : "Done"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
