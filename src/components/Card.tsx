import React, { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  className?: string;
}>;

export function Card({ children, className = '' }: Props) {
  return (
    <div className={`bg-surface rounded-[var(--radius-card)] border border-line ${className}`}>
      {children}
    </div>
  );
}
