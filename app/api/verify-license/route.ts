import { NextRequest, NextResponse } from "next/server";

const LEMON_SQUEEZY_API_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";

// Expected product details
const EXPECTED_STORE_ID = 467546;

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
    const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim();

    if (!apiKey) {
      console.error("[License Validation] Error: LEMONSQUEEZY_API_KEY is not configured in environment variables.");
      return NextResponse.json(
        { 
          valid: false, 
          error: "Server license validation is currently unconfigured (LEMONSQUEEZY_API_KEY missing in Vercel)." 
        },
        { status: 500 }
      );
    }

    const requestPayload = {
      license_key: licenseKey,
      instance_name: "pdf-press-web-client",
    };

    console.log("[License Validation] Sending request to Lemon Squeezy:", {
      url: LEMON_SQUEEZY_API_URL,
      licenseKey: `${licenseKey.slice(0, 4)}...${licenseKey.slice(-4)}`,
      apiKeyPrefix: apiKey.slice(0, 6) + "...",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    const response = await fetch(LEMON_SQUEEZY_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestPayload),
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
      if (data.meta?.store_id && Number(data.meta.store_id) !== EXPECTED_STORE_ID) {
        console.warn(`[License Validation] Store mismatch warning: expected ${EXPECTED_STORE_ID}, got ${data.meta.store_id}`);
      }

      return NextResponse.json({
        valid: true,
        licenseKey: data.license_key?.key || licenseKey,
        status: data.license_key?.status || "active",
        customerName: data.meta?.customer_name || null,
        customerEmail: data.meta?.customer_email || null,
        expiresAt: data.license_key?.expires_at || null,
      });
    }

    const failureReason = data.error || data.message || "License key not found or inactive.";
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
