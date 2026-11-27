import React from 'react';

export function CitySilhouette({ opacity = 0.32 }: { opacity?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ opacity }}>
      <div className="absolute left-0 right-0 bottom-[18px] h-[2px] bg-[#1B6F8F]" />
      <div className="absolute bottom-[20px] left-[18px] w-[46px] h-[34px] bg-[#1B6F8F] rounded-t-[5px]" />
      <div className="absolute bottom-[20px] left-[60px] w-[34px] h-[48px] bg-[#1B6F8F] rounded-t-[5px]" />
      <div className="absolute bottom-[20px] left-[92px] w-[56px] h-[28px] bg-[#1B6F8F] rounded-t-[5px]" />
      <div className="absolute bottom-[24px] left-[42px] w-[13px] h-[62px] bg-[#1B6F8F] rounded-t-[7px]" />
      <div className="absolute bottom-[20px] left-[10px] w-[8px] h-[42px] bg-brand rounded-t-[12px]" />
      <div className="absolute bottom-[20px] left-[142px] w-[8px] h-[36px] bg-brand rounded-t-[12px]" />
      <div className="absolute top-[15px] left-[112px] w-[34px] h-[34px] rounded-full bg-[#F4B942]" />
    </div>
  );
}

export function HillDecoration() {
  return (
    <div className="pointer-events-none relative w-[120px] h-[92px] overflow-hidden shrink-0">
      <div className="absolute left-[32px] top-[6px] w-[48px] h-[48px] rounded-full bg-[#FFF0B7]" />
      <div className="absolute w-[120px] h-[70px] rounded-[60px] bg-[#BFE5E0] -bottom-[28px] left-[20px] -rotate-8" />
      <div className="absolute w-[126px] h-[74px] rounded-[63px] bg-[#7EC6BB] -bottom-[42px] -left-[20px] rotate-8" />
      <div className="absolute w-[10px] h-[84px] bg-[#F5E7C9] -bottom-[12px] left-[58px] rounded-[12px] rotate-16" />
      <div className="absolute w-[2px] h-[28px] bg-[#14536C] top-[17px] left-[78px]" />
      <div className="absolute w-[20px] h-[12px] bg-[#E8796C] top-[17px] left-[80px] rounded-r-[6px]" />
    </div>
  );
}
