import React from 'react';

interface LexLogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function LexLogo({ className = '', showWordmark = true, size = 'md' }: LexLogoProps) {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Escudo / Balanza estilizada jurídica con acentos dorados (Stitch Oficial) */}
      <svg
        className={`${iconSizes[size]} shrink-0`}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="LexPlantillas Escudo Jurídico"
      >
        <rect width="32" height="32" rx="6" fill="#78001e" />
        <path
          d="M16 6 L26 11 V18 C26 23.5 21.8 28.5 16 30 C10.2 28.5 6 23.5 6 18 V11 Z"
          fill="none"
          stroke="#D4AF37"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M16 11 V23" stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M11 14 H21" stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M11 14 L8.5 19 H13.5 Z" fill="#D4AF37" opacity="0.85" />
        <path d="M21 14 L18.5 19 H23.5 Z" fill="#D4AF37" opacity="0.85" />
      </svg>

      {showWordmark && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center tracking-tight">
            <span className="font-headline-sm text-[16px] font-bold text-primary">LEX</span>
            <span className="font-label-lg text-[15px] font-semibold text-on-surface ml-1">PLANTILLAS</span>
          </div>
          <div className="h-[1.5px] w-full bg-[#D4AF37] my-0.5" />
          <span className="font-label-sm text-[7.5px] font-semibold text-[#584142] tracking-[1.2px] uppercase">
            SISTEMA JURÍDICO MEXICANO
          </span>
        </div>
      )}
    </div>
  );
}

export default LexLogo;
