import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SuccessModalProps {
  isOpen: boolean;
  message: string | null;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
}

export function SuccessModal({ isOpen, message, onClose, title = "Success!", children }: SuccessModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] p-6 bg-white border-emerald-100 shadow-xl rounded-xl">
        <DialogHeader className="flex flex-col items-center space-y-4 pt-4">
          <div className="bg-emerald-50 w-16 h-16 rounded-full flex items-center justify-center">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <DialogTitle className="text-xl font-bold text-zinc-900 text-center tracking-tight">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 flex flex-col items-center">
          {message && (
            <p className="text-sm text-zinc-500 text-center leading-relaxed">
              {message}
            </p>
          )}
          {children && (
            <div className="w-full mt-4 text-left">
              {children}
            </div>
          )}
        </div>
        <div className="flex justify-center mt-6">
          <Button 
            onClick={onClose}
            className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto min-w-[120px] font-semibold"
          >
            OK
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
