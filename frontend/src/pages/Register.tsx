import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_URL } from '../App';
import { User, Lock, FileText, Layers } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ValidatedInput } from "@/components/ui/ValidatedInput";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SuccessModal } from "@/components/ui/SuccessModal";

export default function Register() {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setSuccess(null);
    
    const newErrors: Record<string, string> = {};
    if (!fullName.trim()) newErrors.fullName = "Full Name is required";
    if (!username.trim()) newErrors.username = "Username is required";
    if (!password.trim()) newErrors.password = "Password is required";
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, full_name: fullName, role }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setSuccess('Account created successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setApiError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
      <Card className="w-full max-w-[440px] bg-zinc-900/50 border-zinc-800/80 backdrop-blur-md shadow-2xl">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 mb-4 shadow-sm">
            <Layers size={26} />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-zinc-100">Join Apex WMS</CardTitle>
          <CardDescription className="text-zinc-400 text-sm">Create your operator credentials</CardDescription>
        </CardHeader>
        <CardContent>
          {apiError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3.5 rounded-lg mb-5 flex items-start gap-2.5">
              <span>{apiError}</span>
            </div>
          )}

          <SuccessModal
            isOpen={!!success}
            message={success}
            onClose={() => setSuccess(null)}
          />

          <form onSubmit={handleSubmit} className="space-y-4.5">
            <ValidatedInput
              label="Full Name"
              type="text"
              placeholder="e.g. Antony Kuriyan"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors({ ...errors, fullName: '' });
              }}
              error={errors.fullName}
              className="bg-zinc-950 border-zinc-800 text-zinc-200 focus-visible:ring-zinc-400"
            />

            <ValidatedInput
              label="Username"
              type="text"
              placeholder="Choose username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (errors.username) setErrors({ ...errors, username: '' });
              }}
              error={errors.username}
              className="bg-zinc-950 border-zinc-800 text-zinc-200 focus-visible:ring-zinc-400"
            />

            <ValidatedInput
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors({ ...errors, password: '' });
              }}
              error={errors.password}
              className="bg-zinc-950 border-zinc-800 text-zinc-200 focus-visible:ring-zinc-400"
            />

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">User Role</label>
              <Select value={role} onValueChange={(val) => setRole(val)}>
                <SelectTrigger className="h-11 bg-zinc-950 border-zinc-800 text-zinc-200 focus:ring-zinc-400">
                  <SelectValue placeholder="Select user role" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                  <SelectItem value="operator">Operator (Data Entry)</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? 'Registering...' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-zinc-400">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
              Sign In
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
