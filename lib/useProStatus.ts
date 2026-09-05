"use client";

import { useState, useEffect, useCallback } from "react";
import confetti from "canvas-confetti";

const STORAGE_KEY = "pdf_press_pro_state";
const DEFAULT_CHECKOUT_URL = "https://app.lemonsqueezy.com/checkout/buy/2093513?embed=1&media=0";

export interface ProState {
  isPro: boolean;
  licenseKey: string | null;
  customerName: string | null;
  customerEmail: string | null;
  verifiedAt: number | null;
}

interface LemonSqueezyWindow extends Window {
  createLemonSqueezy?: () => void;
  LemonSqueezy?: {
    Url?: {
      Open: (url: string) => void;
      Close?: () => void;
    };
    Setup?: (options: {
      eventHandler?: (event: { event: string; data?: unknown }) => void;
    }) => void;
  };
}

export function useProStatus() {
  const [proState, setProState] = useState<ProState>({
    isPro: false,
    licenseKey: null,
    customerName: null,
    customerEmail: null,
    verifiedAt: null,
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ProState;
        if (parsed && parsed.isPro && parsed.licenseKey) {
          setProState(parsed);
        }
      }
    } catch (e) {
      console.error("Error reading Pro state from localStorage:", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Initialize Lemon Squeezy JS if available
  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as LemonSqueezyWindow;
      if (typeof win.createLemonSqueezy === "function") {
        win.createLemonSqueezy();
      }

      if (win.LemonSqueezy?.Setup) {
        win.LemonSqueezy.Setup({
          eventHandler: (event: { event: string; data?: unknown }) => {
            if (event.event === "Checkout.Success") {
              // Purchase completed through overlay
              setIsModalOpen(true);
            }
          },
        });
      }
    }
  }, []);

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#ffb703", "#fb8500", "#10b981", "#3b82f6"],
      });
    } catch (err) {
      console.warn("Confetti error:", err);
    }
  };

  const verifyLicenseKey = useCallback(
    async (rawKey: string): Promise<{ success: boolean; error?: string }> => {
      const key = rawKey.trim();
      if (!key) {
        setVerifyError("Please enter a license key.");
        return { success: false, error: "Please enter a license key." };
      }

      setIsVerifying(true);
      setVerifyError(null);

      try {
        const res = await fetch("/api/verify-license", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ licenseKey: key }),
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data?.valid === true) {
          const newState: ProState = {
            isPro: true,
            licenseKey: data.licenseKey || key,
            customerName: data.customerName || null,
            customerEmail: data.customerEmail || null,
            verifiedAt: Date.now(),
          };

          setProState(newState);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
          } catch (e) {
            console.error("Failed to save Pro state to localStorage:", e);
          }

          triggerConfetti();
          return { success: true };
        } else {
          const errorMsg =
            data?.error ||
            "The license key could not be verified. Please ensure you entered the exact key from your receipt.";
          setVerifyError(errorMsg);
          return { success: false, error: errorMsg };
        }
      } catch (err) {
        console.error("Network error during license verification:", err);
        // If the user already had a valid Pro session, don't lock them out due to offline/network glitch
        if (proState.isPro) {
          return {
            success: true,
            error: "Offline mode: Previous Pro status retained.",
          };
        }
        const errorMsg =
          "Network error: Unable to reach validation server. Please check your internet connection and try again.";
        setVerifyError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsVerifying(false);
      }
    },
    [proState.isPro]
  );

  const openCheckout = useCallback(async () => {
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => null);
      const checkoutUrl = data?.url || DEFAULT_CHECKOUT_URL;

      const win = (typeof window !== "undefined" ? window : null) as LemonSqueezyWindow | null;
      if (win?.LemonSqueezy?.Url?.Open) {
        win.LemonSqueezy.Url.Open(checkoutUrl);
      } else if (typeof window !== "undefined") {
        window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      console.warn("Failed to generate dynamic checkout URL, opening default:", err);
      if (typeof window !== "undefined") {
        window.open(DEFAULT_CHECKOUT_URL, "_blank", "noopener,noreferrer");
      }
    }
  }, []);

  const deactivatePro = useCallback(() => {
    setProState({
      isPro: false,
      licenseKey: null,
      customerName: null,
      customerEmail: null,
      verifiedAt: null,
    });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error("Failed to remove Pro state from localStorage:", e);
    }
  }, []);

  return {
    isPro: proState.isPro,
    proState,
    isLoaded,
    isVerifying,
    verifyError,
    setVerifyError,
    isModalOpen,
    setIsModalOpen,
    verifyLicenseKey,
    openCheckout,
    deactivatePro,
  };
}
