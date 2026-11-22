import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, Shield, ArrowRight, Mail, KeyRound, RotateCcw, CheckCircle2, AtSign, Check, X, Loader2 } from 'lucide-react';

interface AuthPageProps {
  onSuccess?: () => void;
}

type AuthMode = 'login' | 'signup' | 'forgot' | 'verify_otp';

export const AuthPage: React.FC<AuthPageProps> = ({ onSuccess }) => {
  const { login, signup, sendOtp, checkConnectId, resetPasswordWithOtp } = useAuth();
  
  // Navigation & Flip state
  const [mode, setMode] = useState<AuthMode>('login');
  const isFlipped = mode === 'signup' || mode === 'forgot' || mode === 'verify_otp';

  const [showPass, setShowPass] = useState(false);
  const [showConfPass, setShowConfPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ msg: string; isError?: boolean } | null>(null);

  // Login form field (Can be email or Connect ID)
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Signup fields
  const [name, setName] = useState('');
  const [connectId, setConnectId] = useState('');
  const [connectIdCheck, setConnectIdCheck] = useState<{ checking: boolean; available?: boolean; message?: string } | null>(null);
  const [email, setEmail] = useState('');
  const [signupPass, setSignupPass] = useState('');
  const [signupConf, setSignupConf] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  // OTP Verification state
  const [otp, setOtp] = useState('');
  const [otpPurpose, setOtpPurpose] = useState<'signup' | 'login' | 'reset'>('signup');
  const [resendCountdown, setResendCountdown] = useState(0);

  // Debounced check for Connect ID availability
  useEffect(() => {
    const raw = connectId.trim().replace(/^@/, '');
    if (!raw || raw.length < 3) {
      setConnectIdCheck(null);
      return;
    }

    setConnectIdCheck({ checking: true });
    const timer = setTimeout(async () => {
      const res = await checkConnectId(raw);
      setConnectIdCheck({ checking: false, available: res.available, message: res.message });
    }, 350);

    return () => clearTimeout(timer);
  }, [connectId]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  // Request OTP and switch to OTP input view
  const triggerSendOtp = async (targetEmail: string, purpose: 'signup' | 'login' | 'reset') => {
    if (!targetEmail || !targetEmail.includes('@')) {
      setNotice({ msg: 'Please enter a valid email address.', isError: true });
      return false;
    }

    setLoading(true);
    setNotice({ msg: `Sending 6-digit code via Gmail SMTP to ${targetEmail}…` });
    const res = await sendOtp(targetEmail, purpose);
    setLoading(false);

    if (res.success) {
      setOtp('');
      setOtpPurpose(purpose);
      setMode('verify_otp');
      setResendCountdown(60);
      setNotice({ 
        msg: `Verification code sent to ${targetEmail}! Please check your Inbox and Spam folder.` 
      });
      return true;
    } else {
      setNotice({ msg: res.message || 'Failed to send OTP.', isError: true });
      return false;
    }
  };

  // 1. Password Login (Accepts either Email or Connect ID)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim()) {
      setNotice({ msg: 'Please enter your Email or Connect ID.', isError: true });
      return;
    }
    if (!password) {
      setNotice({ msg: 'Please enter your password.', isError: true });
      return;
    }

    setLoading(true);
    setNotice({ msg: 'Signing in to Vertex Connect…' });
    const res = await login(loginIdentifier.trim(), password);
    setLoading(false);

    if (res.success) {
      setNotice({ msg: 'Welcome back! Entering workspace…' });
      onSuccess?.();
    } else {
      setNotice({ msg: res.message || 'Invalid credentials.', isError: true });
    }
  };

  // 2. Signup Validation & OTP Trigger
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNotice({ msg: 'Please enter your full name.', isError: true });
      return;
    }

    const cleanId = connectId.trim().replace(/^@/, '');
    if (!cleanId || cleanId.length < 3) {
      setNotice({ msg: 'Please choose a Connect ID of at least 3 characters.', isError: true });
      return;
    }
    if (connectIdCheck && !connectIdCheck.available) {
      if (signupPass) {
        setNotice({ msg: `Account @${cleanId} already exists! Signing you in with your password…` });
        setLoading(true);
        const logRes = await login(cleanId, signupPass);
        setLoading(false);
        if (logRes.success) {
          setNotice({ msg: 'Welcome back! Entering workspace…' });
          onSuccess?.();
          return;
        }
      }
      setNotice({ 
        msg: `Connect ID @${cleanId} is already registered! Click 'Already yours? Log In' or enter your password to sign in.`, 
        isError: true 
      });
      return;
    }

    if (!email || !email.includes('@')) {
      setNotice({ msg: 'Please enter a valid email address.', isError: true });
      return;
    }
    if (signupPass.length < 8) {
      setNotice({ msg: 'Password must be at least 8 characters.', isError: true });
      return;
    }
    if (signupPass !== signupConf) {
      setNotice({ msg: 'Passwords do not match.', isError: true });
      return;
    }
    if (!agreeTerms) {
      setNotice({ msg: 'Please agree to the terms to continue.', isError: true });
      return;
    }

    // Trigger OTP to Gmail
    await triggerSendOtp(email, 'signup');
  };

  // 3. Verify OTP and complete action
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length < 6) {
      setNotice({ msg: 'Please enter the 6-digit code.', isError: true });
      return;
    }

    setLoading(true);
    setNotice({ msg: 'Verifying security code…' });

    if (otpPurpose === 'signup') {
      const cleanId = connectId.trim().replace(/^@/, '');
      const res = await signup(name, cleanId, email, signupPass, otp.trim());
      setLoading(false);
      if (res.success) {
        setNotice({ msg: 'Email verified! Account created. Entering workspace…' });
        onSuccess?.();
      } else {
        setNotice({ msg: res.message || 'OTP verification failed.', isError: true });
      }
    } else if (otpPurpose === 'login') {
      const res = await login(email, undefined, otp.trim());
      setLoading(false);
      if (res.success) {
        setNotice({ msg: 'Security code verified! Redirecting…' });
        onSuccess?.();
      } else {
        setNotice({ msg: res.message || 'Invalid code.', isError: true });
      }
    } else if (otpPurpose === 'reset') {
      const res = await resetPasswordWithOtp(email, otp.trim(), signupPass);
      setLoading(false);
      if (res.success) {
        setNotice({ msg: 'Password reset successful! Please sign in.' });
        setMode('login');
      } else {
        setNotice({ msg: res.message || 'Password reset failed.', isError: true });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-radial from-[#15183b]/90 via-[#080b20]/95 to-[#050716] backdrop-blur-xl">
      <div className="w-full max-w-[880px] h-[580px] max-h-[96vh] flex flex-col md:flex-row rounded-3xl border border-white/20 bg-gradient-to-br from-[#232657]/90 to-[#141738]/95 shadow-2xl overflow-hidden text-white backdrop-blur-2xl">
        {/* Left Visual Panel */}
        <div className="hidden md:flex w-[42%] p-8 flex-col justify-between border-r border-white/10 bg-radial at-[80%_85%] from-[#7e7cff]/20 to-transparent relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#8cf4ff] via-[#8d8cff] to-[#d6a2ff] flex items-center justify-center text-[#171a42] font-black text-xl shadow-lg shadow-[#8d8cff]/30">
              V
            </div>
            <div>
              <span className="font-extrabold tracking-wider text-sm block">VERTEX CONNECT</span>
              <span className="text-[10px] text-[#9da8d2] tracking-widest block uppercase font-medium">
                Phase 2 · Messaging & Connect ID
              </span>
            </div>
          </div>

          <div className="my-auto py-6">
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight mb-3">
              Ideas move <br />
              better{' '}
              <span className="bg-gradient-to-r from-[#a9a0ff] to-[#7ce8f2] bg-clip-text text-transparent">
                together.
              </span>
            </h1>
            <p className="text-xs text-[#a3abd0] leading-relaxed max-w-[280px]">
              Claim your unique Connect ID, search teammates, connect, and collaborate with 1-to-1 messaging, attachments, and meetings.
            </p>
          </div>

          <div className="text-[11px] text-[#8f9ac4] flex items-center gap-1.5 font-medium">
            <Shield className="w-3.5 h-3.5 text-[#8ce7f2]" />
            <span>Multi-Tenant & Isolated Profiles</span>
          </div>
        </div>

        {/* Right Auth Panel with 3D Flip */}
        <div className="flex-1 p-6 md:p-8 flex items-center justify-center min-h-0 auth-stage overflow-y-auto">
          <div className={`auth-flip w-full max-w-[390px] h-full ${isFlipped ? 'flipped' : ''}`}>
            {/* FRONT: Login Form */}
            <div className={`auth-face absolute inset-0 flex flex-col justify-center ${isFlipped ? 'pointer-events-none' : ''}`}>
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-[#a69aff]">Welcome back</span>
                  <h2 className="text-2xl font-bold tracking-tight text-white mt-0.5">Sign in</h2>
                  <p className="text-xs text-[#a3abd0]">Enter your Connect ID or Email to access your workspace.</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#dce0f7] mb-1">
                    Connect ID or Email
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="@username or you@example.com"
                      className="w-full h-10 px-3.5 pl-9 rounded-xl border border-white/20 bg-white/10 text-sm text-white placeholder-[#7f89b1] focus:outline-none focus:border-[#a69aff] focus:bg-white/15 transition-all"
                    />
                    <AtSign className="w-4 h-4 text-[#8b9bff] absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#dce0f7] mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full h-10 px-3.5 pr-11 rounded-xl border border-white/20 bg-white/10 text-sm text-white placeholder-[#7f89b1] focus:outline-none focus:border-[#a69aff] focus:bg-white/15 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-2 top-2 p-1 text-[#aeb7da] hover:text-white text-xs font-semibold rounded"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#aeb6d6] pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!loginIdentifier.includes('@')) {
                        setNotice({ msg: 'Enter your email address to receive an OTP.', isError: true });
                        return;
                      }
                      triggerSendOtp(loginIdentifier, 'login');
                    }}
                    className="text-[#8df0d4] hover:underline font-semibold flex items-center gap-1"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email OTP Login</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setNotice(null);
                    }}
                    className="text-[#c0b6ff] hover:text-white font-medium hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 rounded-xl font-bold text-xs text-[#111432] bg-gradient-to-r from-[#b8adff] via-[#86e7f2] to-[#d2b4ff] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-[#86e7f2]/20 cursor-pointer disabled:opacity-70"
                >
                  <span>{loading ? 'Signing in…' : 'Continue'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {notice && (
                  <div className={`text-xs text-center py-1 font-medium ${notice.isError ? 'text-[#ff9baf]' : 'text-[#8df0d4]'}`}>
                    {notice.msg}
                  </div>
                )}

                <div className="text-xs text-center text-[#9fa9ce] pt-1">
                  New to Vertex?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setNotice(null);
                    }}
                    className="text-[#c5baff] font-bold hover:underline ml-1"
                  >
                    Create an account
                  </button>
                </div>
              </form>
            </div>

            {/* BACK: Signup / OTP / Forgot Views */}
            <div className={`auth-face back absolute inset-0 flex flex-col justify-center ${!isFlipped ? 'pointer-events-none' : ''}`}>
              {mode === 'verify_otp' ? (
                /* OTP Verification View */
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#8df0d4]/20 to-[#a69aff]/20 border border-[#8df0d4]/30 flex items-center justify-center text-[#8df0d4] mb-2">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#8df0d4]">
                      Email Verification
                    </span>
                    <h2 className="text-xl font-bold tracking-tight text-white mt-0.5">Enter 6-digit Code</h2>
                    <p className="text-xs text-[#a3abd0] leading-relaxed">
                      We sent a secure 6-digit verification code to <strong className="text-white">{email}</strong>. Please check your Inbox and Spam folder.
                    </p>
                  </div>

                  <div>
                    <input
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="• • • • • •"
                      autoFocus
                      className="w-full h-12 text-center text-2xl tracking-[10px] font-black rounded-xl border border-[#a69aff]/40 bg-white/10 text-[#8df0d4] placeholder-[#7f89b1] focus:outline-none focus:border-[#8df0d4] focus:ring-2 focus:ring-[#8df0d4]/20"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.length < 6}
                    className="w-full h-10 rounded-xl font-bold text-xs text-[#111432] bg-gradient-to-r from-[#8df0d4] via-[#86e7f2] to-[#b8adff] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-[#8df0d4]/20 cursor-pointer disabled:opacity-50"
                  >
                    <span>{loading ? 'Verifying…' : 'Verify & Enter Workspace'}</span>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center justify-between text-xs text-[#aeb6d6] pt-1">
                    <button
                      type="button"
                      disabled={resendCountdown > 0 || loading}
                      onClick={() => triggerSendOtp(email, otpPurpose)}
                      className="text-[#c0b6ff] hover:text-white font-semibold disabled:opacity-50 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : 'Resend code'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOtp('');
                        setMode(otpPurpose === 'reset' ? 'forgot' : 'signup');
                        setNotice(null);
                      }}
                      className="text-[#9fa9ce] hover:underline"
                    >
                      Back to edit
                    </button>
                  </div>

                  {notice && (
                    <div className={`text-xs text-center py-0.5 font-medium ${notice.isError ? 'text-[#ff9baf]' : 'text-[#8df0d4]'}`}>
                      {notice.msg}
                    </div>
                  )}
                </form>
              ) : mode === 'signup' ? (
                /* Signup Form with Connect ID & Real-Time Availability Check */
                <form onSubmit={handleSignupSubmit} className="space-y-2.5">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#a69aff]">Get Started</span>
                    <h2 className="text-xl font-bold tracking-tight text-white mt-0.5">Create Account</h2>
                    <p className="text-xs text-[#a3abd0]">Choose your Connect ID and sign up securely.</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#dce0f7] mb-1">Full name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Sakthi Hinata"
                      className="w-full h-8.5 px-3 rounded-xl border border-white/20 bg-white/10 text-xs text-white placeholder-[#7f89b1] focus:outline-none focus:border-[#a69aff]"
                    />
                  </div>

                  {/* Connect ID Input with Live Check */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-[#dce0f7]">
                        Connect ID (Unique Handle)
                      </label>
                      {connectIdCheck && (
                        <span className="text-[10px] font-bold flex items-center gap-1">
                          {connectIdCheck.checking ? (
                            <span className="text-[#aebfda] flex items-center gap-1">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Checking...
                            </span>
                          ) : connectIdCheck.available ? (
                            <span className="text-[#8df0d4] flex items-center gap-0.5">
                              <Check className="w-3 h-3 text-[#12a878]" /> Available
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const raw = connectId.trim().replace(/^@/, '');
                                setLoginIdentifier(raw);
                                setMode('login');
                                setNotice({ msg: `Account @${raw} found! Enter your password to log in.` });
                              }}
                              className="text-[#8cf4ff] hover:underline text-[10px] font-bold flex items-center gap-0.5 cursor-pointer bg-[#8cf4ff]/10 px-1.5 py-0.5 rounded-md border border-[#8cf4ff]/30"
                              title="Click to sign in with this account"
                            >
                              <span>Already yours? Log In →</span>
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8ce7f2]">@</span>
                      <input
                        type="text"
                        value={connectId}
                        onChange={(e) => setConnectId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        placeholder="sakthi"
                        className={`w-full h-8.5 pl-7 pr-3 rounded-xl border text-xs text-white placeholder-[#7f89b1] focus:outline-none transition-all ${
                          connectIdCheck?.available === true
                            ? 'border-[#12a878] bg-[#12a878]/10'
                            : connectIdCheck?.available === false
                            ? 'border-[#f04454] bg-[#f04454]/10'
                            : 'border-white/20 bg-white/10 focus:border-[#a69aff]'
                        }`}
                      />
                    </div>
                    <span className="text-[9px] text-[#9fa9ce] block mt-0.5">
                      Others use this ID to search, invite, and connect with you.
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#dce0f7] mb-1">Email address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full h-8.5 px-3 rounded-xl border border-white/20 bg-white/10 text-xs text-white placeholder-[#7f89b1] focus:outline-none focus:border-[#a69aff]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#dce0f7] mb-1">Password</label>
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={signupPass}
                        onChange={(e) => setSignupPass(e.target.value)}
                        placeholder="Min 8 chars"
                        className="w-full h-8.5 px-2.5 rounded-xl border border-white/20 bg-white/10 text-xs text-white placeholder-[#7f89b1] focus:outline-none focus:border-[#a69aff]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#dce0f7] mb-1">Confirm</label>
                      <input
                        type={showConfPass ? 'text' : 'password'}
                        value={signupConf}
                        onChange={(e) => setSignupConf(e.target.value)}
                        placeholder="Repeat"
                        className="w-full h-8.5 px-2.5 rounded-xl border border-white/20 bg-white/10 text-xs text-white placeholder-[#7f89b1] focus:outline-none focus:border-[#a69aff]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[#aeb6d6]">
                    <input
                      type="checkbox"
                      id="agreeTerms"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="rounded accent-[#9d8dff]"
                    />
                    <label htmlFor="agreeTerms" className="cursor-pointer text-[10px]">
                      I agree to the Terms & Privacy Policy
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || Boolean(connectIdCheck && !connectIdCheck.available)}
                    className="w-full h-9 rounded-xl font-bold text-xs text-[#111432] bg-gradient-to-r from-[#b8adff] via-[#86e7f2] to-[#d2b4ff] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50"
                  >
                    <span>{loading ? 'Sending OTP…' : 'Send Verification Code ↗'}</span>
                    <Mail className="w-3.5 h-3.5" />
                  </button>

                  {notice && (
                    <div className={`text-xs text-center py-0.5 font-medium ${notice.isError ? 'text-[#ff9baf]' : 'text-[#8df0d4]'}`}>
                      {notice.msg}
                    </div>
                  )}

                  <div className="text-xs text-center text-[#9fa9ce]">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setOtp('');
                        setMode('login');
                        setNotice(null);
                      }}
                      className="text-[#c5baff] font-bold hover:underline ml-1"
                    >
                      Sign in
                    </button>
                  </div>
                </form>
              ) : (
                /* Forgot Password Form */
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    triggerSendOtp(email, 'reset');
                  }}
                  className="space-y-4"
                >
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#a69aff]">Account Recovery</span>
                    <h2 className="text-xl font-bold tracking-tight text-white mt-0.5">Reset password</h2>
                    <p className="text-xs text-[#a3abd0]">We'll send an OTP to your email to reset your password.</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#dce0f7] mb-1">Email address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full h-10 px-3.5 rounded-xl border border-white/20 bg-white/10 text-sm text-white placeholder-[#7f89b1] focus:outline-none focus:border-[#a69aff]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-10 rounded-xl font-bold text-xs text-[#111432] bg-gradient-to-r from-[#b8adff] via-[#86e7f2] to-[#d2b4ff] hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                  >
                    <span>{loading ? 'Sending code…' : 'Send reset code'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  {notice && (
                    <div className={`text-xs text-center py-1 font-medium ${notice.isError ? 'text-[#ff9baf]' : 'text-[#8df0d4]'}`}>
                      {notice.msg}
                    </div>
                  )}

                  <div className="text-xs text-center text-[#9fa9ce]">
                    Remembered it?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setOtp('');
                        setMode('login');
                        setNotice(null);
                      }}
                      className="text-[#c5baff] font-bold hover:underline ml-1"
                    >
                      Back to sign in
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
