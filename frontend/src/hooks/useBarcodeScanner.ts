import { useEffect, useRef, useState, useCallback } from 'react';

interface UseBarcodeScannerProps {
  onScan: (scannedValue: string) => void;
  isActive?: boolean;
  timeThreshold?: number; // Time in ms to consider input as scan instead of typing
}

export function useBarcodeScanner({
  onScan,
  isActive = true,
  timeThreshold = 50,
}: UseBarcodeScannerProps) {
  const [scannedValue, setScannedValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Buffer and timing state for global listening fallback
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(Date.now());

  // Focus management
  const focusInput = useCallback(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive) {
      focusInput();
    }
  }, [isActive, focusInput]);

  const handleBlur = useCallback(() => {
    // If it's supposed to be active, force focus back
    // Use timeout to avoid stealing focus if user clicked another valid input inside the modal
    if (isActive) {
      setTimeout(() => focusInput(), 10);
    }
  }, [isActive, focusInput]);

  // Method 1: Explicit Input Handling (Recommended for Modals)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScannedValue(e.target.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scannedValue.trim()) {
        onScan(scannedValue.trim());
        setScannedValue(''); // Reset after scan
      }
    }
  };

  // Method 2: Global Fallback Listener (If not using explicit input)
  useEffect(() => {
    if (!isActive) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If we have an inputRef and it's focused, let handleInputKeyDown manage it
      if (inputRef.current && document.activeElement === inputRef.current) {
        return;
      }

      // Ignore if user is typing in another input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const currentTime = Date.now();
      const timeElapsed = currentTime - lastKeyTimeRef.current;

      // If time between keystrokes is too long, it's likely a human typing, reset buffer
      if (timeElapsed > timeThreshold) {
        bufferRef.current = '';
      }
      lastKeyTimeRef.current = currentTime;

      if (e.key === 'Enter') {
        if (bufferRef.current.length > 0) {
          onScan(bufferRef.current.trim());
          bufferRef.current = '';
        }
      } else if (e.key.length === 1) { // Only single characters
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isActive, onScan, timeThreshold]);

  return {
    inputRef,
    scannedValue,
    handleInputChange,
    handleInputKeyDown,
    handleBlur,
    focusInput
  };
}
