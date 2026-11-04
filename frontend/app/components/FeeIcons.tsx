// frontend/app/components/FeeIcons.tsx
// Logos for the landing "stats bar": USDC, Management fee, Performance fee.
// USDC is the standard USDC mark (owned by Circle; shown as the asset used, no endorsement implied).
// The two fee icons are original drawings.

import React from "react";

export function UsdcLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-label="USDC">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.5 19.5C20.5 17.5 19.5 16.5 16.5 16C14.5 15.5 13.5 15 13.5 14C13.5 13 14 12.5 15 12.5C16.5 12.5 17 13 17 14H19C19 12 17.5 11 15.5 11V9H14.5V11C12.5 11 11 12 11 14C11 16 12 17 15 17.5C17 18 18 18.5 18 19.5C18 20.5 17.5 21.5 16 21.5C14 21.5 13.5 20.5 13.5 19.5H11.5C11.5 21.5 12.5 23 14.5 23V25H15.5V23C17.5 23 20.5 22 20.5 19.5Z"
        fill="white"
      />
    </svg>
  );
}

/* Management fee: briefcase on an indigo disc */
export function ManagementIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-label="Management fee">
      <circle cx="16" cy="16" r="16" fill="#6366F1" />
      <rect x="8" y="12" width="16" height="11" rx="2" stroke="#fff" strokeWidth="1.8" />
      <path d="M12.5 12V10.5A1.5 1.5 0 0 1 14 9h4a1.5 1.5 0 0 1 1.5 1.5V12" stroke="#fff" strokeWidth="1.8" />
      <path d="M8 17.5h16" stroke="#fff" strokeWidth="1.8" />
    </svg>
  );
}

/* Performance fee: rising chart on a green disc */
export function PerformanceIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-label="Performance fee">
      <circle cx="16" cy="16" r="16" fill="#16A34A" />
      <path d="M8.5 21.5l5-5 3.5 3.5 6.5-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 13h4v4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}