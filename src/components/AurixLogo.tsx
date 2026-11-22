import React from "react";

export function AurixLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="18" cy="18" r="15.5" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.25" />
      <path
        d="M18 4.5C25.4558 4.5 31.5 10.5442 31.5 18C31.5 22.12 29.65 25.81 26.74 28.28"
        stroke="#FBBF24"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M18 9.5L25.2 25.5H22.1L20.4 21.5H15.6L13.9 25.5H10.8L18 9.5ZM16.65 18.9H19.35L18 15.55L16.65 18.9Z"
        fill="currentColor"
      />
      <circle cx="18" cy="18" r="1.6" fill="#34D399" />
    </svg>
  );
}
