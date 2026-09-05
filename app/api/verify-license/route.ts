import { NextRequest, NextResponse } from "next/server";

const LEMON_SQUEEZY_API_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";

// Expected product details
const EXPECTED_STORE_ID = 467546;
const EXPECTED_PRODUCT_ID = 1340039;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawKey = body.licenseKey || body.license_key || body.key;

    if (!rawKey || typeof rawKey !== "string" || !rawKey.trim()) {
      return NextResponse.json(
        { valid: false, error: "Please enter your Lemon Squeezy license key." },
        { status: 400 }
      );
    }

    const licenseKey = rawKey.trim();

    const formBody = new URLSearchParams();
    formBody.append("license_key", licenseKey);

    console.log("[License Validation] Validating license key with Lemon Squeezy:", {
      url: LEMON_SQUEEZY_API_URL,
      licenseKey: `${licenseKey.slice(0, 8)}...${licenseKey.slice(-4)}`,
    });

    // Public Lemon Squeezy license endpoint — uses form-urlencoded without Bearer header
    const response = await fetch(LEMON_SQUEEZY_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });

    const data = await response.json().catch(() => null);

    console.log("[License Validation] Lemon Squeezy API Response:", {
      status: response.status,
      ok: response.ok,
      data: data,
    });

    if (!response.ok || !data) {
      const errorMsg = 
        data?.error || 
        data?.message || 
        data?.errors?.[0]?.detail || 
        `Lemon Squeezy API returned status ${response.status}`;
      
      return NextResponse.json(
        { 
          valid: false, 
          error: errorMsg,
          rawStatus: response.status,
          rawResponse: data,
        },
        { status: response.status >= 500 ? 502 : 400 }
      );
    }

    if (data.valid === true) {
      // Validate store / product metadata if available
      if (data.meta?.store_id && Number(data.meta.store_id) !== EXPECTED_STORE_ID) {
        console.warn(`[License Validation] Store mismatch: expected ${EXPECTED_STORE_ID}, got ${data.meta.store_id}`);
      }

      return NextResponse.json({
        valid: true,
        licenseKey: data.license_key?.key || licenseKey,
        status: data.license_key?.status || "active",
        customerName: data.meta?.customer_name || null,
        customerEmail: data.meta?.customer_email || null,
        productName: data.meta?.product_name || "PDF-Press Pro",
        expiresAt: data.license_key?.expires_at || null,
      });
    }

    const failureReason = data.error || data.message || "License key is invalid or not found.";
    console.warn("[License Validation] License invalid/not found:", failureReason);

    return NextResponse.json({
      valid: false,
      error: failureReason,
      rawResponse: data,
    });
  } catch (error: unknown) {
    console.error("[License Validation] Unexpected exception:", error);
    return NextResponse.json(
      { 
        valid: false, 
        error: "Network error validating license key. Please check your connection and try again." 
      },
      { status: 500 }
    );
  }
}
