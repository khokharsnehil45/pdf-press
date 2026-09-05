import { NextRequest, NextResponse } from "next/server";

const STORE_ID = "467546";
const VARIANT_ID = "2093513";
const DEFAULT_CHECKOUT_URL = `https://app.lemonsqueezy.com/checkout/buy/${VARIANT_ID}?embed=1&media=0`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    const body = await req.json().catch(() => ({}));
    const customData = body.custom || {};

    if (!apiKey) {
      // Return direct checkout link if API key is not yet set
      return NextResponse.json({
        url: DEFAULT_CHECKOUT_URL,
      });
    }

    // Call Lemon Squeezy API to create an official checkout session
    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              custom: customData,
            },
            checkout_options: {
              embed: true,
              media: false,
              logo: true,
            },
            product_options: {
              enabled_variants: [Number(VARIANT_ID)],
            },
          },
          relationships: {
            store: {
              data: {
                type: "stores",
                id: STORE_ID,
              },
            },
            variant: {
              data: {
                type: "variants",
                id: VARIANT_ID,
              },
            },
          },
        },
      }),
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data?.data?.attributes?.url) {
      return NextResponse.json({
        url: data.data.attributes.url,
      });
    }

    console.warn("Lemon Squeezy API checkout creation response not ok, falling back to direct URL:", data);
    return NextResponse.json({
      url: DEFAULT_CHECKOUT_URL,
    });
  } catch (error) {
    console.error("Error creating Lemon Squeezy checkout:", error);
    return NextResponse.json({
      url: DEFAULT_CHECKOUT_URL,
    });
  }
}
