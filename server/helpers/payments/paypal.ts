import axios from "axios";

async function getPaypalAccessToken({
  clientId,
  secretKey,
  mode = "sandbox",
}: {
  clientId: string;
  secretKey: string;
  mode?: string;
}) {
  const base =
    mode === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  const { data } = await axios.post(
    `${base}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      auth: {
        username: clientId,
        password: secretKey,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return data.access_token;
}

export async function initPaypalPayment({
  clientId,
  secretKey,
  mode = "sandbox",
  amount,
  currency,
  packageId,
  quantity,
  email,
  phone,
  guestAccessToken,
  userId,
  metadata
}: {
  clientId: string;
  secretKey: string;
  mode?: string;
  amount: number;
  currency: string;
  packageId: string;
  quantity: number;
  email?: string;
  phone?: string;
  guestAccessToken?: string;
  userId?: string;
  metadata?: any;
}) {
  const accessToken = await getPaypalAccessToken({ clientId, secretKey, mode });
  const base = mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

  /* 🔥 CONSTRUCT METADATA (Aggressive compression for 127 char limit) */
  const metadataMap: Record<string, string> = {
    type: 'T',
    userId: 'U',
    guestEmail: 'E',
    amount: 'A',
    recipientEmail: 'R',
    recipientName: 'N',
    message: 'M',
    currency: 'C',
    packageId: 'P',
    quantity: 'Q',
    guestPhone: 'H',
    guestAccessToken: 'S',
    promoCode: 'pc',
    promoType: 'pt',
    promoDiscount: 'pd',
    voucherId: 'vi',
    giftCardId: 'gi',
    referralCredits: 'rc',
    existingOrderId: 'O',
    iccid: 'I',
    topupId: 'D'
  };

  const metadataValues: any = {
    type: metadata?.type === 'gift_card' ? 'gc' : (metadata?.type || (userId ? "pkg" : "gst")),
    packageId: packageId || metadata?.packageId || "",
    quantity: (quantity || 1).toString(),
    guestEmail: email || metadata?.guestEmail || "",
    guestPhone: phone || metadata?.phone || "",
    guestAccessToken: guestAccessToken || metadata?.guestAccessToken || "",
    userId: userId || metadata?.userId || "",
  };

  // Add gift card specific fields if present
  if (metadata?.type === 'gift_card' || metadataValues.type === 'gc') {
    metadataValues.amount = metadata.amount?.toString();
    metadataValues.recipientEmail = metadata.recipientEmail || "";
    metadataValues.recipientName = metadata.recipientName || "";
    metadataValues.message = metadata.message || "";
    metadataValues.currency = metadata.currency || currency;
  }

  // Also include any other metadata passed
  if (metadata && typeof metadata === 'object') {
    for (const key in metadata) {
      if (!(key in metadataValues)) {
        metadataValues[key] = metadata[key];
      }
    }
  }

  // Compact UUID to URL-safe base64 to save 10+ chars per UUID
  const compactId = (id: any) => {
    if (typeof id === 'string') {
      const clean = id.replace(/-/g, '').trim();
      if (clean.length === 32) {
        return Buffer.from(clean, 'hex').toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
      }
      return clean;
    }
    return id;
  };

  // Compress keys and remove empty values
  let compressed: any = {};
  for (const key in metadataValues) {
    let value = metadataValues[key];
    if (value !== null && value !== undefined && value !== "") {
      const shortKey = metadataMap[key] || key;
      // Compact UUIDs for specific keys
      if (['U', 'P', 'O', 'D', 'vi', 'gi', 'S'].includes(shortKey)) {
        value = compactId(value);
      }
      compressed[shortKey] = value;
    }
  }

  let customId = JSON.stringify(compressed);

  // If still too long, truncate non-critical strings (message, recipientName)
  if (customId.length > 127) {
    // 1. Truncate optional strings
    if (compressed.M) {
      compressed.M = compressed.M.substring(0, 10);
      customId = JSON.stringify(compressed);
    }

    if (customId.length > 127 && compressed.N) {
      compressed.N = compressed.N.substring(0, 10);
      customId = JSON.stringify(compressed);
    }

    // 2. If userId 'U' is present, 'E' (email) is optional and can be deleted
    if (customId.length > 127 && compressed.U && compressed.E) {
      delete compressed.E;
      customId = JSON.stringify(compressed);
    }

    // 3. Remove optional fields until it fits
    const optionalKeys = ['M', 'N', 'H', 'S', 'pc', 'pt', 'pd', 'vi', 'gi', 'rc'];
    for (const key of optionalKeys) {
      if (customId.length <= 127) break;
      if (key in compressed) {
        delete compressed[key];
        customId = JSON.stringify(compressed);
      }
    }

    // 4. Aggressive truncation of remaining strings (email for guest checkout)
    if (customId.length > 127 && compressed.E) {
      const originalE = compressed.E;
      delete compressed.E;
      const baseLength = JSON.stringify(compressed).length;
      // JSON overhead for E: `"E":"",` is 6 chars
      const remainingBudget = 127 - baseLength - 6;
      if (remainingBudget > 5) {
        compressed.E = originalE.substring(0, remainingBudget - 2) + "..";
      }
      customId = JSON.stringify(compressed);
    }

    if (customId.length > 127 && compressed.R) {
      const originalR = compressed.R;
      delete compressed.R;
      const baseLength = JSON.stringify(compressed).length;
      const remainingBudget = 127 - baseLength - 6;
      if (remainingBudget > 5) {
        compressed.R = originalR.substring(0, remainingBudget - 2) + "..";
      }
      customId = JSON.stringify(compressed);
    }

    // 5. Absolute last resort: keep only critical keys
    if (customId.length > 127) {
      const criticalKeys = ['T', 'P', 'Q'];
      for (const key in compressed) {
        if (!criticalKeys.includes(key)) {
          delete compressed[key];
        }
      }
      customId = JSON.stringify(compressed);
    }

    if (customId.length > 127) {
      console.warn('[PayPal] CRITICAL: Metadata still over 127 chars even after extreme compression.', customId);
    }
  }

  // Use axios to call PayPal REST API v2
  const { data: order } = await axios.post(
    `${base}/v2/checkout/orders`,
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
            breakdown: {
              item_total: {
                currency_code: currency,
                value: amount.toFixed(2),
              },
            },
          },
          items: [
            {
              name: `${quantity}x eSIM Package: ${packageId}`.substring(0, 127),
              quantity: "1",
              unit_amount: {
                currency_code: currency,
                value: amount.toFixed(2),
              },
              category: "DIGITAL_GOODS",
            },
          ],
          custom_id: customId,
        },
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        brand_name: "eSIM",
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return {
    provider: "paypal",
    orderId: order.id,
  };
}


