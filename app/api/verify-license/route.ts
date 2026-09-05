import { NextRequest, NextResponse } from "next/server";

const LEMON_SQUEEZY_API_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";

// Expected product details
const EXPECTED_STORE_ID = 467546;
const EXPECTED_PRODUCT_ID = 1340039;
const EXPECTED_VARIANT_ID = 2093513;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawKey = body.licenseKey || body.key;

    if (!rawKey || typeof rawKey !== "string" || !rawKey.trim()) {
      return NextResponse.json(
        { valid: false, error: "Please provide a valid license key." },
        { status: 400 }
      );
    }

    const licenseKey = rawKey.trim();
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;

    if (!apiKey) {
      console.error("LEMONSQUEEZY_API_KEY is not configured in environment variables.");
      return NextResponse.json(
        { 
          valid: false, 
          error: "Server license validation is currently unconfigured (LEMONSQUEEZY_API_KEY missing)." 
        },
        { status: 500 }
      );
    }

    // Call Lemon Squeezy license validation endpoint
    const params = new URLSearchParams({
      key: licenseKey,
      instance_name: "pdf-press-web-client",
    });

    const response = await fetch(LEMON_SQUEEZY_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${apiKey}`,
      },
      body: params.toString(),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      const errorMsg = data?.error || data?.message || "Could not validate license key with Lemon Squeezy.";
      return NextResponse.json(
        { valid: false, error: errorMsg },
        { status: response.status >= 500 ? 502 : 400 }
      );
    }

    if (data.valid === true) {
      // Validate store/product if present in metadata
      if (data.meta?.store_id && Number(data.meta.store_id) !== EXPECTED_STORE_ID) {
        console.warn(`License store mismatch: expected ${EXPECTED_STORE_ID}, got ${data.meta.store_id}`);
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

    return NextResponse.json({
      valid: false,
      error: data.error || "The license key provided is invalid or expired. Please check your purchase receipt.",
    });
  } catch (error: unknown) {
    console.error("License validation unexpected error:", error);
    return NextResponse.json(
      { valid: false, error: "Network error validating license key. Please check your connection and try again." },
      { status: 500 }
    );
  }
}
