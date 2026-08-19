import React, { forwardRef } from 'react';
import { cn } from "@/lib/utils";

export interface ValidatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  required?: boolean;
}

const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(
  ({ className, label, error, required, ...props }, ref) => {
    return (
      <div className="flex flex-col space-y-1.5 relative">
        <label className="block text-sm font-medium text-zinc-500">
          {label} {required && <span className="text-[#E11D48]">*</span>}
        </label>
        <div className="relative flex items-center">
          <input
            ref={ref}
            className={cn(
              "flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              error 
                ? "border-[#E11D48] focus-visible:ring-[#E11D48] pr-10" 
                : "border-zinc-300 focus-visible:ring-zinc-400",
              className
            )}
            {...props}
          />
          {error && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 group flex items-center">
              <div className="w-[18px] h-[18px] rounded-full border-[1.5px] border-[#E11D48] flex items-center justify-center text-[#E11D48] text-[11px] font-bold cursor-help bg-white pb-[1px]">
                !
              </div>
              <div className="absolute top-full right-[-8px] mt-2.5 w-max px-3 py-1.5 bg-[#E11D48] text-white text-xs font-medium rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 before:absolute before:content-[''] before:bottom-full before:right-[11px] before:border-x-[6px] before:border-x-transparent before:border-b-[6px] before:border-b-[#E11D48]">
                {error}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
ValidatedInput.displayName = "ValidatedInput";

export { ValidatedInput };
