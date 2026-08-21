import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScanLine, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { cn } from '@/lib/utils';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedValue: string) => void;
  isProcessing?: boolean;
  error?: string | null;
  successMessage?: string | null;
  title?: string;
  description?: string;
}

export function ScannerModal({
  isOpen,
  onClose,
  onScan,
  isProcessing = false,
  error = null,
  successMessage = null,
  title = "Scan Barcode / QR Code",
  description = "Use your external scanner to scan an item ID."
}: ScannerModalProps) {
  
  const {
    inputRef,
    scannedValue,
    handleInputChange,
    handleInputKeyDown,
    handleBlur
  } = useBarcodeScanner({
    onScan: (val) => {
      if (!isProcessing) {
        onScan(val);
      }
    },
    isActive: isOpen && !isProcessing
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="sm:max-w-md overflow-hidden p-0 border-0 bg-white rounded-2xl shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-50 to-white -z-10" />
        
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-xl font-bold text-zinc-900">{title}</DialogTitle>
          <DialogDescription className="text-sm text-zinc-500">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="p-8 flex flex-col items-center justify-center min-h-[250px] relative">
          
          {/* Status Indicators */}
          <div className="absolute top-4 w-full px-8 text-center flex flex-col items-center">
            {error && (
              <div className="bg-red-50 text-red-600 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-red-100 shadow-sm animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={14} />
                <span className="font-medium">{error}</span>
              </div>
            )}
            
            {successMessage && !error && (
              <div className="bg-emerald-50 text-emerald-600 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-emerald-100 shadow-sm animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 size={14} />
                <span className="font-medium">{successMessage}</span>
              </div>
            )}
          </div>

          {/* Central Scanning Animation */}
          <div className="relative flex items-center justify-center w-32 h-32 mt-6">
            <div className={cn(
              "absolute inset-0 rounded-full border-2 transition-colors duration-500",
              isProcessing ? "border-zinc-200" : "border-emerald-100 bg-emerald-50/30",
              error ? "border-red-100 bg-red-50/30" : ""
            )} />
            
            {isProcessing ? (
              <Loader2 className="w-12 h-12 text-zinc-400 animate-spin" />
            ) : (
              <div className="relative">
                <ScanLine className={cn(
                  "w-14 h-14 transition-colors duration-300", 
                  error ? "text-red-400" : "text-emerald-500"
                )} />
                {/* Laser animation */}
                {!error && (
                  <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-[scan_2s_ease-in-out_infinite]" />
                )}
              </div>
            )}
          </div>

          <p className="mt-6 text-sm font-medium text-zinc-600">
            {isProcessing ? "Processing scan..." : "Ready to scan"}
          </p>

          {/* Visually Hidden Input for capturing the scan */}
          <input
            ref={inputRef}
            type="text"
            value={scannedValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={handleBlur}
            disabled={isProcessing}
            className="absolute opacity-0 pointer-events-none w-0 h-0"
            aria-hidden="true"
            autoComplete="off"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
