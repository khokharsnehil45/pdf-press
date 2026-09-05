"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Crown, 
  X, 
  CheckCircle2, 
  Zap, 
  ShieldCheck, 
  Sparkles, 
  RefreshCw, 
  KeyRound, 
  ExternalLink,
  AlertCircle
} from "lucide-react";
import { ProState } from "@/lib/useProStatus";

interface ProModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPro: boolean;
  proState: ProState;
  onOpenCheckout: () => void;
  onVerifyKey: (key: string) => Promise<{ success: boolean; error?: string }>;
  isVerifying: boolean;
  verifyError: string | null;
  onClearError: () => void;
  theme: "dark" | "light";
}

export const ProModal: React.FC<ProModalProps> = ({
  isOpen,
  onClose,
  isPro,
  proState,
  onOpenCheckout,
  onVerifyKey,
  isVerifying,
  verifyError,
  onClearError,
  theme,
}) => {
  const [keyInput, setKeyInput] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input when modal opens if not Pro
  useEffect(() => {
    if (isOpen && !isPro) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, isPro]);

  if (!isOpen) return null;

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSuccessMessage(null);
    onClearError();

    // Read directly from state or input ref to guarantee fresh value on paste/autofill
    const rawVal = keyInput || inputRef.current?.value || "";
    const cleanKey = rawVal.trim().replace(/^["']|["']$/g, "");

    if (!cleanKey) {
      return;
    }

    const result = await onVerifyKey(cleanKey);
    if (result.success) {
      setSuccessMessage("PDF-PRESS Pro successfully activated! Batch processing unlocked.");
      setKeyInput("");
      setTimeout(() => {
        onClose();
        setSuccessMessage(null);
      }, 2000);
    }
  };

  const textPrimary = theme === "dark" ? "text-neutral-100" : "text-neutral-900";
  const textSecondary = theme === "dark" ? "text-neutral-400" : "text-neutral-700";
  const textMuted = theme === "dark" ? "text-neutral-500" : "text-neutral-600";
  const bgCard = theme === "dark" ? "bg-[#181816] border-[#383733]" : "bg-white border-[#d4d2c7]";
  const bgInput = theme === "dark" ? "bg-[#121210] border-[#383733] text-neutral-100" : "bg-neutral-50 border-neutral-300 text-neutral-900";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs font-mono">
      <div 
        className={`w-full max-w-lg border-2 shadow-2xl overflow-hidden transition-all ${bgCard}`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          theme === "dark" ? "bg-[#141412] border-[#383733]" : "bg-[#f8f7f2] border-[#d4d2c7]"
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-amber-500 text-black flex items-center justify-center font-black text-xs shadow">
              <Crown className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className={`font-black text-xs sm:text-sm tracking-wider uppercase ${textPrimary}`}>
                {isPro ? "PDF-PRESS PRO // ACTIVE" : "UPGRADE TO PDF-PRESS PRO"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1 border transition cursor-pointer ${
              theme === "dark" ? "border-[#383733] hover:border-neutral-500 text-neutral-400 hover:text-neutral-200" : "border-neutral-300 hover:border-neutral-900 text-neutral-700"
            }`}
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[80vh] overflow-y-auto">
          
          {isPro ? (
            /* Active Pro Details */
            <div className="space-y-4">
              <div className={`p-4 border border-emerald-500/30 ${
                theme === "dark" ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-50 text-emerald-900"
              } space-y-2`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span className="font-bold text-xs sm:text-sm">LIFETIME PRO UNLOCKED</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Your device is licensed for unlimited batch processing and all high-throughput compression features.
                </p>
                {proState.licenseKey && (
                  <div className="pt-2 text-[10px] font-mono">
                    <span className="text-neutral-500">License: </span>
                    <span className="font-bold tracking-wider">
                      {proState.licenseKey.slice(0, 8)}...{proState.licenseKey.slice(-4)}
                    </span>
                  </div>
                )}
                {proState.customerEmail && (
                  <div className="text-[10px] font-mono">
                    <span className="text-neutral-500">Account: </span>
                    <span className="font-bold">{proState.customerEmail}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition cursor-pointer shadow"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Unlocked Features & Checkout Flow */
            <>
              <div className="space-y-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black px-1.5 py-0.5 bg-amber-500 text-black uppercase">
                    ONE-TIME PAYMENT
                  </span>
                  <span className={`text-[10px] ${textMuted}`}>• NO SUBSCRIPTIONS</span>
                </div>
                <h3 className={`text-sm sm:text-base font-black uppercase tracking-wide pt-1 ${textPrimary}`}>
                  Unlock Batch PDF Compression
                </h3>
                <p className={`text-[11px] leading-relaxed ${textSecondary}`}>
                  Single-file compression is always 100% free. Upgrade to Pro for high-speed multi-document batch workflows.
                </p>
              </div>

              {/* Feature Highlights */}
              <div className="grid grid-cols-1 gap-2 pt-1">
                {[
                  {
                    icon: Zap,
                    title: "Unlimited Batch Processing",
                    desc: "Queue dozens or hundreds of PDFs and compress them all with one click.",
                  },
                  {
                    icon: ShieldCheck,
                    title: "100% Private & Offline Client-Side",
                    desc: "Your files never leave your computer or touch any external server.",
                  },
                  {
                    icon: Sparkles,
                    title: "Lifetime License & Updates",
                    desc: "Pay once via Lemon Squeezy, keep forever on this browser.",
                  },
                ].map((feat, idx) => (
                  <div 
                    key={idx} 
                    className={`p-2.5 sm:p-3 border flex items-start gap-2.5 ${
                      theme === "dark" ? "border-[#2e2d2a] bg-[#141412]" : "border-neutral-200 bg-neutral-50"
                    }`}
                  >
                    <feat.icon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <div className={`text-xs font-bold uppercase ${textPrimary}`}>{feat.title}</div>
                      <div className={`text-[10px] leading-snug ${textSecondary}`}>{feat.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Primary Checkout CTA */}
              <div className="pt-2 space-y-2">
                <button
                  onClick={onOpenCheckout}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-amber-500/10"
                >
                  <Crown className="w-4 h-4" />
                  <span>Get Lifetime Pro License</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <p className={`text-[9px] text-center ${textMuted}`}>
                  Secure checkout processed by Lemon Squeezy. Instant key delivery.
                </p>
              </div>

              {/* License Key Activation Section */}
              <div className={`pt-3 border-t ${theme === "dark" ? "border-[#2e2d2a]" : "border-neutral-200"} space-y-2.5`}>
                <div className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${textPrimary}`}>
                    Already have a key? Restore Purchase
                  </span>
                </div>

                <form onSubmit={handleVerify} className="flex gap-1.5">
                  <input
                    ref={inputRef}
                    type="text"
                    value={keyInput}
                    onChange={(e) => {
                      setKeyInput(e.target.value);
                      if (verifyError) onClearError();
                    }}
                    onInput={(e) => {
                      const val = (e.target as HTMLInputElement).value;
                      setKeyInput(val);
                      if (verifyError) onClearError();
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData?.getData("text");
                      if (pasted) {
                        setKeyInput(pasted);
                        if (verifyError) onClearError();
                      }
                    }}
                    placeholder="Paste Lemon Squeezy License Key"
                    className={`flex-1 px-3 py-1.5 text-xs font-mono border focus:outline-hidden focus:border-amber-500 ${bgInput}`}
                    disabled={isVerifying}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                  />
                  <button
                    type="submit"
                    disabled={isVerifying || !keyInput.trim()}
                    className={`px-3 py-1.5 border text-xs font-bold uppercase tracking-wider flex items-center gap-1 transition cursor-pointer ${
                      isVerifying || !keyInput.trim()
                        ? "bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed"
                        : theme === "dark"
                          ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border-neutral-600"
                          : "bg-neutral-200 hover:bg-neutral-300 text-neutral-900 border-neutral-400"
                    }`}
                  >
                    {isVerifying && <RefreshCw className="w-3 h-3 animate-spin" />}
                    <span>{isVerifying ? "Checking..." : "Activate"}</span>
                  </button>
                </form>

                {/* Error Banner */}
                {verifyError && (
                  <div className={`p-2.5 border text-[10px] font-mono flex items-start gap-2 ${
                    theme === "dark" ? "bg-rose-500/10 border-rose-500/40 text-rose-300" : "bg-rose-50 border-rose-300 text-rose-800"
                  }`}>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                    <div className="leading-snug">{verifyError}</div>
                  </div>
                )}

                {/* Success Banner */}
                {successMessage && (
                  <div className={`p-2.5 border text-[10px] font-mono flex items-start gap-2 ${
                    theme === "dark" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : "bg-emerald-50 border-emerald-300 text-emerald-800"
                  }`}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="leading-snug">{successMessage}</div>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
