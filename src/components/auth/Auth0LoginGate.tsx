'use client';

/* eslint-disable @next/next/no-html-link-for-pages */
import Image from 'next/image';
import React from 'react';

interface Auth0LoginGateProps {
  type?: 'unauthenticated' | 'ineligible';
  userEmail?: string;
  errorMessage?: string;
}

export function Auth0LoginGate({ type = 'unauthenticated', userEmail, errorMessage }: Auth0LoginGateProps) {
  const isUnauthenticated = type === 'unauthenticated';

  return (
    <div className="light min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-900 p-4 sm:p-6 relative overflow-hidden select-none">
      {/* Soft Light Background Glow Orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-100/70 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-100/70 rounded-full blur-3xl pointer-events-none" />

      {/* Main Glassmorphism Light Card */}
      <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/60 z-10 flex flex-col items-center text-center space-y-6 transition-all">
        {/* Brand Badge Icon */}
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 flex items-center justify-center shadow-lg shadow-slate-200/60">
          {isUnauthenticated ? (
            <Image
              src="/img/favorlogo-black-on-transparent.png"
              alt="Favor Church logo"
              width={40}
              height={40}
              className="h-10 w-10"
              priority
            />
          ) : (
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {isUnauthenticated ? 'Favor Runsheet Studio' : 'Access Restricted'}
          </h1>
          <p className="text-sm font-medium text-slate-600 leading-relaxed">
            {isUnauthenticated
              ? 'Sign in with your rock account to access service runsheets and live production tools.'
              : 'This account does not have permissions to access this website.'}
          </p>
        </div>

        {/* Notice Box for Ineligible State */}
        {!isUnauthenticated && (
          <div className="w-full bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 text-left text-xs text-amber-900 space-y-1.5">
            {userEmail && (
              <div>
                <span className="font-bold text-amber-900">Signed in as: </span>
                <span className="text-blue-700 font-mono">{userEmail}</span>
              </div>
            )}
            <p className="text-amber-800">
              {errorMessage || 'Your identity does not match any active Rock RMS volunteer or staff profile.'}
            </p>
          </div>
        )}

        {/* Primary Actions */}
        <div className="w-full space-y-3 pt-2">
          {isUnauthenticated ? (
            <a
              href="/api/auth/login"
              className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm py-3.5 px-4 shadow-md shadow-blue-500/20 transition-all duration-150 cursor-pointer"
            >
              <span>Log In</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              <a
                href="/api/auth/login"
                className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-3 px-4 shadow-md transition-all"
              >
                Switch Account
              </a>
              <a
                href="/api/auth/logout"
                className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm py-2.5 px-4 transition-all"
              >
                Log Out
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-[11px] font-medium text-slate-400 pt-2 border-t border-slate-100 w-full">
          Favor Tech • Backed Rock RMS
        </div>
      </div>
    </div>
  );
}
