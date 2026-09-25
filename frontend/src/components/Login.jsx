import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import api from '../api';
import { C, FONT_HEAD, FONT_BODY } from '../config';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'otp'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const afterAuth = (data) => {
    localStorage.setItem('automat_token', data.token);
    localStorage.setItem('automat_user', JSON.stringify(data.user));
    onLogin(data.user);
  };

  const submitSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      afterAuth(data);
    } catch (err) {
      const payload = err.response?.data;
      if (payload?.requiresVerification) {
        // Account exists but the email OTP was never completed — send them
        // straight to the OTP screen instead of a dead-end error.
        setMode('otp');
        setOtp('');
        setInfo('Please verify your email with the OTP sent to your inbox before signing in.');
      } else {
        setError(payload?.error || 'Could not reach the server. Is the API running?');
      }
    } finally {
      setLoading(false);
    }
  };

  const submitSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      // Note: there is no "role" field here on purpose. Every self-signup
      // becomes a read-only Viewer — the backend hardcodes this and ignores
      // any role a client might try to send. Privileged roles (HR, Plant
      // Head, Electricity/Plant Operations, etc.) can only be created by an
      // Administrator, from inside the app, under User Management.
      await api.post('/auth/register', { name, email, password });
      setMode('otp');
      setOtp('');
      setInfo(`We've sent a 6-digit OTP to ${email}. Enter it below to verify your email.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reach the server. Is the API running?');
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await api.post('/auth/verify-otp', { email, otp });
      // Email is verified and the account is already Active —
      // there is no administrator-approval step. Log straight in.
      try {
        const { data } = await api.post('/auth/login', { email, password });
        afterAuth(data);
        return;
      } catch (loginErr) {
        setMode('signin');
        setInfo('Email verified! You can now sign in.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await api.post('/auth/resend-otp', { email });
      setInfo(`A new OTP has been sent to ${email}.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: FONT_BODY }} className="flex items-center justify-center px-4">
      <form onSubmit={mode === 'signin' ? submitSignIn : mode === 'signup' ? submitSignUp : submitOtp} style={{ background: C.card, border: `1px solid ${C.line}`, width: 380 }} className="p-7 rounded shadow-sm">
        <div
  className="flex items-center justify-center px-3 py-4 border-b"
  style={{ borderColor: C.line }}
>
  <img
    src="/automat.png"
    alt="AUTOMAT"
    className="object-contain"
    style={{
      width: 175,
      height: 100,
      objectFit: "contain",
    }}
  />
</div>

        {mode !== 'otp' && (
          <div className="flex mb-5 rounded overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="flex-1 py-1.5 text-sm"
              style={{ background: mode === 'signin' ? C.steelTint : 'transparent', color: mode === 'signin' ? C.steel : C.ink2 }}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="flex-1 py-1.5 text-sm"
              style={{ background: mode === 'signup' ? C.steelTint : 'transparent', color: mode === 'signup' ? C.steel : C.ink2 }}
            >
              Sign up
            </button>
          </div>
        )}

        {mode === 'signup' && (
          <>
            <label style={{ color: C.ink2, fontSize: 12 }}>Full name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Full Name"
              className="w-full mt-1 mb-4 px-3 py-2 rounded text-sm"
              style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}
            />
          </>
        )}

        {mode === 'otp' && (
          <div style={{ color: C.ink2, fontSize: 12.5 }} className="mb-4">
            Enter the 6-digit code sent to <strong style={{ color: C.ink }}>{email}</strong>.
          </div>
        )}

        {mode !== 'otp' && (
          <>
            <label style={{ color: C.ink2, fontSize: 12 }}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@automat.com"
              className="w-full mt-1 mb-4 px-3 py-2 rounded text-sm"
              style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}
            />
            <label style={{ color: C.ink2, fontSize: 12 }}>Password</label>
            <div className="relative mt-1 mb-5">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                className="w-full px-3 py-2 pr-9 rounded text-sm"
                style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: C.ink2 }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </>
        )}

        {mode === 'otp' && (
          <>
            <label style={{ color: C.ink2, fontSize: 12 }}>OTP Code</label>
            <input
              required
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              autoFocus
              className="w-full mt-1 mb-5 px-3 py-2 rounded text-sm tracking-[6px] text-center"
              style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink }}
            />
          </>
        )}

        {error && (
          <div className="flex items-start gap-1.5 mb-4" style={{ color: C.rust, fontSize: 12 }}>
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {info && !error && (
          <div className="flex items-start gap-1.5 mb-4" style={{ color: C.moss, fontSize: 12 }}>
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span>{info}</span>
          </div>
        )}

        <button type="submit" disabled={loading} className="w-full py-2.5 rounded text-sm font-medium" style={{ background: C.steel, color: '#fff' }}>
          {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Verify OTP'}
        </button>

        {mode === 'otp' && (
          <div style={{ color: C.ink2, fontSize: 11.5 }} className="mt-4 flex items-center justify-between">
            <button type="button" onClick={() => switchMode('signin')} style={{ color: C.ink2 }}>Back to sign in</button>
            <button type="button" onClick={resendOtp} disabled={loading} style={{ color: C.steel }}>Resend OTP</button>
          </div>
        )}

        {mode !== 'otp' && (
          <div style={{ color: C.ink2, fontSize: 11 }} className="mt-4">
            {mode === 'signin'
              ? 'No account? Use Sign up above — verify your email with an OTP and you\'re in.'
              : 'New accounts get read-only Viewer access right after email verification — no approval needed.'}
          </div>
        )}
      </form>
    </div>
  );
}
