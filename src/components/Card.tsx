import React, { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  className?: string;
}>;

export function Card({ children, className = '' }: Props) {
  return (
    <div className={`bg-white rounded-[22px] border border-[#DDE8EE] card-shadow ${className}`}>
      {children}
    </div>
  );
}
