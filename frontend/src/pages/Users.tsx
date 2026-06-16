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
  Users as UsersIcon
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UserItem {
  id: number;
  username: string;
  full_name: string;
  role: string;
}

export default function Users() {
  const { user } = useAuth();
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  
  // Feedback alerts
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
          full_name: fullName.trim(),
          role
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'User creation failed.');
      }

      setSuccess(`User "${username}" created successfully!`);
      // Reset form
      setFullName('');
      setUsername('');
      setPassword('');
      setRole('operator');
      // Reload directory
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Something went wrong while creating the user account.');
    } finally {
      setActionLoading(false);
    }
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
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">User Management</h1>
        <p className="text-zinc-500 text-sm mt-1.5 font-medium">Create and authorize operator and admin credentials for WMS access.</p>
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
        {/* Form Column */}
        <div className="lg:col-span-4">
          <Card className="bg-white border border-zinc-200/85 rounded-xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-md font-bold text-zinc-900 flex items-center gap-2">
                <UserPlus size={16} className="text-indigo-600" />
                <span>Create User Credentials</span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 font-medium">Add authorization levels for warehouse operator profiles.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Full Name</label>
                  <Input
                    id="user-fullname-input"
                    type="text"
                    placeholder="e.g. Antony Kuriyan"
                    className="bg-zinc-50 border-zinc-200 text-zinc-900 focus-visible:ring-indigo-600"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Username</label>
                  <Input
                    id="user-username-input"
                    type="text"
                    placeholder="e.g. antonyk"
                    className="bg-zinc-50 border-zinc-200 text-zinc-900 focus-visible:ring-indigo-600"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Password</label>
                  <Input
                    id="user-password-input"
                    type="password"
                    placeholder="••••••••"
                    className="bg-zinc-50 border-zinc-200 text-zinc-900 focus-visible:ring-indigo-600"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Access Authorization Role</label>
                  <Select value={role} onValueChange={(val) => setRole(val)}>
                    <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-900 focus:ring-indigo-600">
                      <SelectValue placeholder="Select user role" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-zinc-200 text-zinc-900">
                      <SelectItem value="operator">Operator (Data Entry)</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="superadmin">Super Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  id="create-user-btn"
                  type="submit" 
                  className="w-full bg-[#0e121e] hover:bg-zinc-900 text-white font-semibold shadow-sm text-xs py-2 mt-2 h-10" 
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Creating User Profile...' : 'Create WMS Credentials'}
                </Button>
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-zinc-400 hover:text-red-600 hover:bg-red-50/50 rounded-full h-8 w-8"
                              disabled={usr.username === user?.username}
                              onClick={() => setDeleteConfirmUser(usr)}
                            >
                              <Trash2 size={14} />
                            </Button>
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
                  className="border-zinc-200 hover:bg-zinc-50 text-xs font-semibold h-9 px-4 rounded-lg"
                >
                  Cancel
                </Button>
                <Button 
                  id="confirm-delete-btn"
                  onClick={() => executeDeleteUser(deleteConfirmUser.id, deleteConfirmUser.username)}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-9 px-4 rounded-lg shadow-sm"
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
