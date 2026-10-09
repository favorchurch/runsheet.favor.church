'use client';

/* eslint-disable @next/next/no-html-link-for-pages */
import Image from 'next/image';
import React from 'react';

interface Auth0LoginGateProps {
  type?: 'unauthenticated' | 'ineligible' | 'resolution-failed' | 'volunteer-landing';
  userEmail?: string;
  errorMessage?: string;
  title?: string;
}

export function Auth0LoginGate({ type = 'unauthenticated', userEmail, errorMessage, title }: Auth0LoginGateProps) {
  const isUnauthenticated = type === 'unauthenticated';
  const isResolutionFailed = type === 'resolution-failed';
  const isVolunteerLanding = type === 'volunteer-landing';
  const isIneligible = type === 'ineligible' || (!isUnauthenticated && !isResolutionFailed && !isVolunteerLanding);

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
          ) : isResolutionFailed ? (
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : isVolunteerLanding ? (
            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {title ||
              (isUnauthenticated
                ? 'Favor Runsheet Platform'
                : isResolutionFailed
                ? "We couldn't verify your access right now"
                : isVolunteerLanding
                ? 'Volunteer Portal'
                : 'Access Restricted')}
          </h1>
          <p className="text-sm font-medium text-slate-600 leading-relaxed">
            {isUnauthenticated
              ? 'Access Favor Church service runsheets with your Rock account!'
              : isResolutionFailed
              ? 'Please try again.'
              : isVolunteerLanding
              ? 'Welcome to Favor Church service runsheets!'
              : 'This account does not have permissions to access this website.'}
          </p>
        </div>

        {/* Notice Box for Non-Unauthenticated States */}
        {isResolutionFailed && (
          <div className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-left text-xs text-slate-700 space-y-1.5">
            {userEmail && (
              <div>
                <span className="font-bold text-slate-900">Signed in as: </span>
                <span className="text-blue-700 font-mono">{userEmail}</span>
              </div>
            )}
            <p className="text-slate-600">
              {errorMessage || 'A temporary error occurred while checking permissions. Reloading the page may resolve this.'}
            </p>
          </div>
        )}

        {isVolunteerLanding && (
          <div className="w-full bg-blue-50/80 border border-blue-200/80 rounded-xl p-3.5 text-left text-xs text-blue-900 space-y-1.5">
            {userEmail && (
              <div>
                <span className="font-bold text-blue-950">Signed in as: </span>
                <span className="text-blue-700 font-mono">{userEmail}</span>
              </div>
            )}
            <p className="text-blue-800 leading-relaxed">
              Runsheets will appear here once you are rostered for an upcoming service.
            </p>
          </div>
        )}

        {isIneligible && !isUnauthenticated && (
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
              <span>Login via Rock</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          ) : isResolutionFailed ? (
            <div className="flex flex-col gap-2 w-full">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.reload();
                  }
                }}
                className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm py-3 px-4 shadow-md transition-all cursor-pointer"
              >
                <span>Try Again</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <a
                href="/api/auth/logout"
                className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm py-2.5 px-4 transition-all"
              >
                Log Out
              </a>
            </div>
          ) : isVolunteerLanding ? (
            <div className="flex flex-col gap-2 w-full">
              <a
                href="/api/auth/logout"
                className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm py-2.5 px-4 transition-all"
              >
                Log Out
              </a>
            </div>
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
          Favor Tech 𐄁 Rock RMS
        </div>
      </div>
    </div>
  );
}
