import React, { useState, useEffect } from 'react';
import { useAuth, API_URL } from '../App';
import { 
  UserPlus, 
  Trash2, 
  Shield, 
  UserCheck, 
  UserCog,
  AlertCircle,
  CheckCircle2,
  Users as UsersIcon,
  Edit2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ValidatedInput } from "@/components/ui/ValidatedInput";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SuccessModal } from "@/components/ui/SuccessModal";

interface UserItem {
  id: number;
  username: string;
  full_name: string;
  role: string;
  warehouse_code?: string;
  menu_access?: string[];
}

const AVAILABLE_MENUS = [
  { path: '/', name: 'Dashboard' },
  { path: '/inventory', name: 'Inventory' },
  { path: '/transfer', name: 'Stock Transfer' },
  { path: '/deduction', name: 'Excel Deduction' },
  { path: '/reports', name: 'Reports & Logs' },
  { path: '/locations', name: 'Locations Setup' },
  { path: '/customers', name: 'Customers' },
  { path: '/transfer-request', name: 'Transfer Request' },
  { path: '/picklist', name: 'Picklist' },
  { path: '/users', name: 'User Management' },
  { path: '/audit-logs', name: 'Audit Logs' },
  { path: '/notifications', name: 'Notifications' },
  { path: '/bins', name: 'Bins' },
];

export default function Users() {
  const { user } = useAuth();
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [warehouseCode, setWarehouseCode] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [menuAccess, setMenuAccess] = useState<string[]>(AVAILABLE_MENUS.map(m => m.path));
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserItem | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) {
        throw new Error('Failed to fetch user catalog.');
      }
      const data = await response.json();
      setUsersList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to load user directory.');
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await fetch(`${API_URL}/api/warehouses`);
      if (response.ok) {
        const data = await response.json();
        setWarehouses(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to fetch warehouses', e);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchWarehouses();
  }, []);

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    const newErrors: Record<string, string> = {};
    if (!fullName.trim()) newErrors.fullName = "Full Name is required";
    if (!username.trim()) newErrors.username = "Username is required";
    if (!editingUserId && !password) newErrors.password = "Password is required";
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    setActionLoading(true);

    try {
      const url = editingUserId ? `${API_URL}/api/users/${editingUserId}` : `${API_URL}/api/auth/register`;
      const method = editingUserId ? 'PUT' : 'POST';
      
      const payload: any = {
        username: username.trim().toLowerCase(),
        full_name: fullName.trim(),
        role,
        warehouse_code: role === 'warehouse_admin' ? warehouseCode : undefined,
        menu_access: menuAccess
      };
      
      if (password) {
        payload.password = password;
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || (editingUserId ? 'User update failed.' : 'User creation failed.'));
      }

      setSuccess(`User "${username}" ${editingUserId ? 'updated' : 'created'} successfully!`);
      cancelEdit();
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Something went wrong while processing the user account.');
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleEditUserClick = (usr: UserItem) => {
    setEditingUserId(usr.id);
    setFullName(usr.full_name);
    setUsername(usr.username);
    setPassword(''); // don't show password, leave blank if not changing
    setRole(usr.role);
    setWarehouseCode(usr.warehouse_code || '');
    // Ensure valid JSON parsing or fallback if menu_access is stringified
    try {
      if (typeof usr.menu_access === 'string') {
        setMenuAccess(JSON.parse(usr.menu_access));
      } else if (Array.isArray(usr.menu_access)) {
        setMenuAccess(usr.menu_access);
      } else {
        setMenuAccess([]);
      }
    } catch {
      setMenuAccess([]);
    }
    setError(null);
    setSuccess(null);
    setErrors({});
  };
  
  const cancelEdit = () => {
    setEditingUserId(null);
    setFullName('');
    setUsername('');
    setPassword('');
    setRole('operator');
    setWarehouseCode('');
    setMenuAccess(AVAILABLE_MENUS.map(m => m.path));
    setErrors({});
  };

  const executeDeleteUser = async (userId: number, uName: string) => {
    setError(null);
    setSuccess(null);
    setDeleteConfirmUser(null);

    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user.');
      }

      setSuccess(`User "${uName}" deleted successfully.`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Something went wrong while deleting user.');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#8F2C00] to-[#1F8F00] bg-clip-text text-transparent flex items-center gap-3">
            <UserCog className="text-[#8F2C00]" size={32} />
            User Management
          </h1>
          <p className="text-zinc-500 text-sm mt-1.5 font-medium">Create and authorize operator and admin credentials for WMS access.</p>
        </div>
      </div>

      {/* Dynamic Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-4 rounded-xl flex items-center gap-3 shadow-sm">
          <AlertCircle size={16} className="text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <SuccessModal
        isOpen={!!success}
        message={success}
        onClose={() => setSuccess(null)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Column */}
        <div className="lg:col-span-4">
          <Card className="bg-white border border-zinc-200/85 rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-md font-bold text-zinc-900 flex items-center gap-2">
                {editingUserId ? (
                  <Edit2 size={16} className="text-indigo-600" />
                ) : (
                  <UserPlus size={16} className="text-indigo-600" />
                )}
                <span>{editingUserId ? 'Edit User Credentials' : 'Create User Credentials'}</span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 font-medium">
                {editingUserId ? 'Update the authorization and profile of the selected user.' : 'Add authorization levels for warehouse operator profiles.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitUser} className="space-y-4">
                <div className="space-y-1.5">
                  <ValidatedInput
                    id="user-fullname-input"
                    label="Full Name"
                    type="text"
                    placeholder="e.g. John Doe"
                    className="bg-zinc-50 border-zinc-200 text-zinc-900 focus-visible:ring-zinc-400"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (errors.fullName) setErrors({ ...errors, fullName: '' });
                    }}
                    error={errors.fullName}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <ValidatedInput
                    id="user-username-input"
                    label="Username"
                    type="text"
                    placeholder="e.g. johndoe"
                    className="bg-zinc-50 border-zinc-200 text-zinc-900 focus-visible:ring-zinc-400"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (errors.username) setErrors({ ...errors, username: '' });
                    }}
                    error={errors.username}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <ValidatedInput
                    id="user-password-input"
                    label="Password"
                    type="password"
                    placeholder={editingUserId ? "•••••••• (Leave blank to keep current)" : "••••••••"}
                    className="bg-zinc-50 border-zinc-200 text-zinc-900 focus-visible:ring-zinc-400"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors({ ...errors, password: '' });
                    }}
                    error={errors.password}
                    required={!editingUserId}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Access Authorization Role</label>
                  <Select value={role} onValueChange={(val) => setRole(val)}>
                    <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-zinc-400">
                      <SelectValue placeholder="Select user role" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-zinc-200 text-zinc-900">
                      <SelectItem value="operator">Operator (Data Entry)</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="superadmin">Super Administrator</SelectItem>
                      <SelectItem value="warehouse_admin">Warehouse Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {role === 'warehouse_admin' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Assign Warehouse</label>
                    <Select value={warehouseCode} onValueChange={(val) => setWarehouseCode(val)}>
                      <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-zinc-400">
                        <SelectValue placeholder="Select warehouse" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-zinc-200 text-zinc-900">
                        {warehouses.map(wh => (
                          <SelectItem key={wh.code} value={wh.code}>{wh.name} ({wh.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Custom Menu Access</label>
                  <p className="text-[10px] text-zinc-500 mb-2">Select which modules this user can access in the sidebar.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_MENUS.map(menu => {
                      const isChecked = menuAccess.includes(menu.path);
                      return (
                        <label key={menu.path} className="flex items-center space-x-3 text-xs text-zinc-700 cursor-pointer">
                          <div className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full">
                            <input 
                              type="checkbox" 
                              className="sr-only"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setMenuAccess([...menuAccess, menu.path]);
                                } else {
                                  setMenuAccess(menuAccess.filter(p => p !== menu.path));
                                }
                              }}
                            />
                            <div className={`h-5 w-9 rounded-full transition-colors ${isChecked ? 'bg-emerald-500' : 'bg-zinc-200'}`} />
                            <div className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isChecked ? 'translate-x-4' : 'translate-x-0'}`} />
                          </div>
                          <span className="font-medium">{menu.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 mt-2">
                  <Button 
                    id="create-user-btn"
                    type="submit" 
                    className="flex-1" 
                    disabled={actionLoading}
                  >
                    {actionLoading ? (editingUserId ? 'Updating...' : 'Creating...') : (editingUserId ? 'Update Profile' : 'Create WMS Credentials')}
                  </Button>
                  
                  {editingUserId && (
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={actionLoading}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Directory Column */}
        <div className="lg:col-span-8">
          <Card className="bg-white border border-zinc-200/85 rounded-xl shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-md font-bold text-zinc-900 flex items-center gap-2">
                  <UsersIcon size={16} className="text-zinc-500" />
                  <span>Authorized User Directory</span>
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500 font-medium">Currently active profiles with system database permissions.</CardDescription>
              </div>
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50 text-[10px] font-bold rounded-full px-2 py-0.5">
                {usersList.length} Accounts
              </Badge>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-2">
              <div className="overflow-x-auto border-t sm:border border-zinc-200 sm:rounded-lg">
                <Table>
                  <TableHeader className="bg-zinc-50/70">
                    <TableRow className="border-b border-zinc-200">
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Full Name</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Username</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Security Level</TableHead>
                      <TableHead className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow className="border-b border-zinc-100">
                        <TableCell colSpan={4} className="text-center py-8 text-zinc-400 text-xs">Querying database directory...</TableCell>
                      </TableRow>
                    ) : usersList.length === 0 ? (
                      <TableRow className="border-b border-zinc-100">
                        <TableCell colSpan={4} className="text-center py-8 text-zinc-500 text-xs">No active users cataloged.</TableCell>
                      </TableRow>
                    ) : (
                      usersList.map((usr) => (
                        <TableRow key={usr.id} className="border-b border-zinc-100/80 hover:bg-zinc-50/50">
                          <TableCell className="font-bold text-zinc-900 text-xs">{usr.full_name}</TableCell>
                          <TableCell className="text-zinc-650 font-mono text-xs">{usr.username}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {usr.role === 'superadmin' ? (
                                <Badge className="bg-red-50 text-red-700 border border-red-100 hover:bg-red-50 text-[9px] font-bold tracking-wider rounded uppercase px-1.5 py-0.5">
                                  <Shield size={10} className="mr-1 inline shrink-0" />
                                  Superadmin
                                </Badge>
                              ) : usr.role === 'admin' ? (
                                <Badge className="bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-50 text-[9px] font-bold tracking-wider rounded uppercase px-1.5 py-0.5">
                                  <UserCog size={10} className="mr-1 inline shrink-0" />
                                  Admin
                                </Badge>
                              ) : (
                                <Badge className="bg-zinc-100 text-zinc-650 border border-zinc-200 hover:bg-zinc-100 text-[9px] font-bold tracking-wider rounded uppercase px-1.5 py-0.5">
                                  <UserCheck size={10} className="mr-1 inline shrink-0" />
                                  Operator
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-full h-8 w-8"
                                disabled={usr.username === user?.username}
                                onClick={() => handleEditUserClick(usr)}
                              >
                                <Edit2 size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-zinc-400 hover:text-red-600 hover:bg-red-50/50 rounded-full h-8 w-8"
                                disabled={usr.username === user?.username}
                                onClick={() => setDeleteConfirmUser(usr)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 bg-zinc-950/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-[400px] bg-white border border-zinc-200 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-md font-bold text-red-650 flex items-center gap-2">
                <AlertCircle size={18} className="text-red-500" />
                <span>Confirm User Deletion</span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 font-medium mt-1">
                This will permanently remove the user credentials from the system.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-zinc-750 font-medium leading-relaxed">
                Are you sure you want to delete the user profile for <strong className="text-zinc-900 font-bold">{deleteConfirmUser.full_name} ({deleteConfirmUser.username})</strong>? This operator will immediately lose access to the system.
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button 
                  id="cancel-delete-btn"
                  variant="outline" 
                  onClick={() => setDeleteConfirmUser(null)}
                >
                  Cancel
                </Button>
                <Button 
                  id="confirm-delete-btn"
                  variant="destructive"
                  onClick={() => executeDeleteUser(deleteConfirmUser.id, deleteConfirmUser.username)}
                >
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
