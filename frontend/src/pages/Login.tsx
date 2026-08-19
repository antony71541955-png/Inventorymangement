import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, API_URL } from '../App';
import { Button } from "@/components/ui/button";
import { ValidatedInput } from "@/components/ui/ValidatedInput";

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const { login, token } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (token) {
      navigate('/');
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    
    const newErrors: Record<string, string> = {};
    if (!username.trim()) newErrors.username = "Username is required";
    if (!password.trim()) newErrors.password = "Password is required";
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      login(data.token, data.user);
      navigate('/');
    } catch (err: any) {
      setApiError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#133e2c] p-6 font-sans relative">
      {/* Decorative gradient overlay to match image depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1b4332] to-[#0e3725] pointer-events-none opacity-80" />
      
      <div className="w-full max-w-[400px] bg-[#103022] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] rounded-2xl p-8 relative mt-12 z-10 border border-white/5">
        
        {/* Holly Berry Image */}
        <div className="absolute -top-14 left-1/2 transform -translate-x-1/2">
           <img 
              src="/holly_berry.png" 
              alt="Holly Berry Decoration" 
              className="w-24 h-24 object-contain drop-shadow-md"
           />
        </div>

        {/* Text headers */}
        <div className="text-center mt-6 mb-8 space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-wide text-white uppercase" style={{ fontFamily: 'Arial, sans-serif' }}>
            Greens International
          </h1>
          <p className="text-zinc-200 italic text-lg" style={{ fontFamily: 'Georgia, serif' }}>
            It's all about Baking...
          </p>
        </div>

        {apiError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-4 text-center">
            {apiError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
           <ValidatedInput 
              label=""
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (errors.username) setErrors({ ...errors, username: '' });
              }}
              error={errors.username}
              autoComplete="off"
              className="w-full bg-white text-zinc-900 border-0 rounded-md px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#8f1a2e] transition-all"
           />
           <ValidatedInput 
              label=""
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors({ ...errors, password: '' });
              }}
              error={errors.password}
              autoComplete="off"
              className="w-full bg-white text-zinc-900 border-0 rounded-md px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#8f1a2e] transition-all"
           />

           <Button 
              type="submit" 
              disabled={loading}
              className="w-full mt-2"
           >
             {loading ? 'Authenticating...' : 'Sign In'}
           </Button>
        </form>
        
        {/* Links */}
        <div className="flex justify-between items-center mt-6 text-xs text-zinc-300 font-medium px-1">
           <button type="button" className="hover:text-white transition-colors cursor-pointer">Forgot Password?</button>
           <button type="button" className="hover:text-white transition-colors cursor-pointer">Create Account</button>
        </div>
      </div>
    </div>
  );
}
