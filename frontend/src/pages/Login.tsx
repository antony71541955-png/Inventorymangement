import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, API_URL } from '../App';
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotModal, setForgotModal] = useState(false);
  
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
      setApiError(err.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 selection:bg-[#dfba73]/30 selection:text-amber-100 overflow-x-hidden font-sans">
      {/* Atmospheric Deep Botanical Green Background with Oven-Warmth Radial Amber Glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[#061a12]">
        {/* Deep layered gradient base */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#05150e] via-[#092218] to-[#040e09] opacity-95"></div>

        {/* Central hearth/oven warm ambient amber radial illumination */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-600/15 via-emerald-800/20 to-transparent blur-3xl opacity-80"></div>

        {/* Secondary emerald luster lights */}
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[100px]"></div>
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[120px]"></div>

        {/* Fine decorative artisanal botanical backdrop geometry & flour dust accents */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.035] stroke-amber-200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern height="90" id="botanical-lines" patternUnits="userSpaceOnUse" width="90">
              <path d="M45 0 Q45 45 90 45 M0 45 Q45 45 45 90" fill="none" strokeLinecap="round" strokeWidth="1.2"></path>
              <circle cx="45" cy="45" fill="currentColor" r="2"></circle>
            </pattern>
          </defs>
          <rect fill="url(#botanical-lines)" height="100%" width="100%"></rect>
        </svg>

        {/* Organic warm glowing bokeh dusting */}
        <div className="flour-particle w-32 h-32 top-1/4 left-1/5 opacity-40 blur-lg"></div>
        <div className="flour-particle w-48 h-48 bottom-1/4 right-1/4 opacity-30 blur-xl"></div>
        <div className="flour-particle w-20 h-20 top-2/3 left-1/3 opacity-25 blur-md"></div>
        <div className="flour-particle w-12 h-12 top-1/3 right-1/3 opacity-30 blur-sm"></div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-[460px] mx-auto z-10 flex flex-col items-center">
        {/* Luxury Card with Dual-layer Specular Golden Glassmorphism */}
        <div className="w-full glass-luxury-card rounded-3xl p-8 sm:p-10 relative border border-[#dfba73]/25 shadow-2xl">
          {/* Subtle Ambient Gold Glow Top Rim */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-[1px] bg-gradient-to-r from-transparent via-[#f3db9f] to-transparent opacity-80"></div>

          {/* Handcrafted Botanical Holly Leaves & Crimson Berries Emblem from Stitch */}
          <div className="flex justify-center -mt-2 mb-4">
            <div className="relative group flex items-center justify-center">
              <div className="absolute -inset-1.5 bg-[#dfba73]/15 rounded-full blur-md group-hover:bg-[#dfba73]/25 transition-all"></div>
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-b from-[#0c2e1f] to-[#061a12] border border-[#dfba73]/30 flex items-center justify-center shadow-lg shadow-black/40 overflow-hidden">
                <img 
                  src="/holly_berry_stitch.png" 
                  alt="Greens International Holly Leaves Emblem" 
                  className="w-16 h-16 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-all group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/holly_berry.png';
                  }}
                />
              </div>
            </div>
          </div>

          {/* Brand Header & Refined Typography */}
          <div className="text-center mb-7 space-y-1.5">
            <h1 className="text-2xl sm:text-[27px] font-bold tracking-tight text-white leading-snug">
              <span className="font-serif-luxury font-bold tracking-wider text-2xl sm:text-[28px] gold-gradient-text uppercase block">
                GREENS
              </span>
              <span className="block text-xs uppercase tracking-[0.38em] text-[#dfba73]/85 font-medium -mt-0.5">
                INTERNATIONAL
              </span>
            </h1>
            <p className="font-serif-luxury text-amber-100/80 italic text-base sm:text-[17px] font-normal tracking-wide pt-0.5">
              It's all about Baking...
            </p>
          </div>

          {/* Error Banner */}
          {apiError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs py-2.5 px-3.5 rounded-xl mb-4 text-center backdrop-blur-sm animate-shake">
              {apiError}
            </div>
          )}

          {/* Form Section */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Username / Email Input */}
            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-medium text-emerald-100/70 tracking-wide uppercase">
                Username / Email
              </label>
              <div className={`luxury-input flex items-center rounded-xl px-3.5 py-1 text-sm text-zinc-100 relative group ${errors.username ? 'border-red-400/60' : ''}`}>
                <span className="text-[#dfba73]/70 mr-3 flex-shrink-0">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  autoComplete="username"
                  className="w-full bg-transparent border-0 py-2.5 px-0 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-0"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errors.username) setErrors({ ...errors, username: '' });
                  }}
                />
              </div>
              {errors.username && (
                <p className="text-red-400 text-[11px] pl-1">{errors.username}</p>
              )}
            </div>

            {/* Password Input with Show/Hide Toggle */}
            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-medium text-emerald-100/70 tracking-wide uppercase">
                Password
              </label>
              <div className={`luxury-input flex items-center rounded-xl px-3.5 py-1 text-sm text-zinc-100 relative group ${errors.password ? 'border-red-400/60' : ''}`}>
                <span className="text-[#dfba73]/70 mr-3 flex-shrink-0">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="w-full bg-transparent border-0 py-2.5 px-0 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-0 tracking-wider"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors({ ...errors, password: '' });
                  }}
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  className="text-[#dfba73]/60 hover:text-[#dfba73] focus:outline-none ml-2 transition-colors cursor-pointer"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-[11px] pl-1">{errors.password}</p>
              )}
            </div>

            {/* Helper Row: Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-1 pb-1">
              <label className="flex items-center space-x-2 text-zinc-300 cursor-pointer group select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded bg-[#072015] border-[#dfba73]/40 text-[#c49a45] focus:ring-0 focus:ring-offset-0 cursor-pointer transition-colors"
                />
                <span className="group-hover:text-amber-100 transition-colors">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => setForgotModal(true)}
                className="text-[#dfba73]/85 hover:text-[#f7e2a9] hover:underline underline-offset-4 transition-colors font-medium cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>

            {/* Primary Sign-In Button with Radiant Gold Luxury Gradient */}
            <button
              type="submit"
              disabled={loading}
              className="gold-btn w-full py-3.5 px-6 rounded-xl font-semibold text-[#092218] text-sm tracking-wide flex items-center justify-center space-x-2 cursor-pointer mt-3 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#092218] border-t-transparent rounded-full animate-spin"></div>
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Bakery Portal</span>
                  <ArrowRight className="w-4 h-4 text-[#092218]" />
                </>
              )}
            </button>
          </form>

          {/* Elegant Divider with Gold Hairlines */}
          <div className="relative my-6 flex items-center justify-center">
            <div className="border-t border-[#dfba73]/20 w-full"></div>
            <span className="bg-[#0c2419] px-3 text-[11px] uppercase tracking-widest text-[#dfba73]/70 font-medium">
              Enterprise Access
            </span>
            <div className="border-t border-[#dfba73]/20 w-full"></div>
          </div>

          {/* Create Account Link */}
          <div className="pt-2 text-center text-xs text-zinc-300">
            <span>Need system access? </span>
            <Link
              to="/register"
              className="text-[#dfba73] hover:text-[#f8e5b4] font-semibold tracking-wide hover:underline underline-offset-4 ml-1 transition-colors"
            >
              Register an operator account
            </Link>
          </div>
        </div>

        {/* Refined Brand Baseline Badge / Footer */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-[#dfba73]/15 text-[11px] text-zinc-400 font-medium tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[#dfba73]/80 animate-pulse"></span>
            <span>Premium Baking Ingredients &amp; Culinary Supplies</span>
            <span className="text-[#dfba73]/40">•</span>
            <span className="text-[#dfba73]/80">Est. Greens International</span>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0b2419] border border-[#dfba73]/30 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#dfba73]/15 flex items-center justify-center text-[#dfba73]">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white font-serif-luxury">Password Reset</h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              For security, system credentials can only be reset by your warehouse or system administrator.
            </p>
            <p className="text-[11px] text-[#dfba73] bg-[#dfba73]/10 py-1.5 px-3 rounded-lg">
              Contact: support@greens-intl.com or IT Desk
            </p>
            <button
              type="button"
              onClick={() => setForgotModal(false)}
              className="gold-btn w-full py-2.5 rounded-xl font-medium text-[#092218] text-xs cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
