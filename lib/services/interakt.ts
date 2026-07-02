/**
 * Interakt WhatsApp Business API Service
 * Documentation: https://www.interakt.shop/resource-center/interakt-apis-and-webhooks-an-overview
 * Postman Reference: https://documenter.getpostman.com/view/14760594/2sA2r7zibM
 */

const DEFAULT_SECRET_KEY = "enJ2b2Y3RFRNT0EwMVdDVktCYjBPS2ZkdWllb2MwaHVEOW9rNDdrVENEODo=";

function getSecretKey(): string {
  return process.env.INTERAKT_SECRET_KEY || DEFAULT_SECRET_KEY;
}

function cleanPhoneNumber(phone: string): { countryCode: string; number: string } {
  let cleaned = phone.replace(/\D/g, "");
  let countryCode = "+91"; // Default Indian country code for Skywin

  if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  return { countryCode, number: cleaned };
}

export interface InteraktSendResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Sends a WhatsApp Template message using Interakt Public API
 * Endpoint: POST https://api.interakt.ai/v1/public/message/
 */
export async function sendWhatsAppTemplate({
  phoneNumber,
  templateName,
  bodyValues = [],
  buttonValues,
  countryCode,
}: {
  phoneNumber: string;
  templateName: string;
  bodyValues?: string[];
  buttonValues?: Record<string, string[]>;
  countryCode?: string;
}): Promise<InteraktSendResponse> {
  const phoneData = cleanPhoneNumber(phoneNumber);
  const targetCountryCode = countryCode || phoneData.countryCode;
  const targetPhone = phoneData.number;

  const payload: any = {
    countryCode: targetCountryCode,
    phoneNumber: targetPhone,
    callbackData: `msg_${Date.now()}`,
    type: "Template",
    template: {
      name: templateName,
      languageCode: "en",
      bodyValues,
    },
  };

  if (buttonValues && Object.keys(buttonValues).length > 0) {
    payload.template.buttonValues = buttonValues;
  }

  try {
    const response = await fetch("https://api.interakt.ai/v1/public/message/", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || data.result === false) {
      console.warn(`[Interakt API Warning] Failed to send template '${templateName}' to ${targetCountryCode}${targetPhone}:`, data);
      return {
        success: false,
        error: data.message || `Interakt API returned status ${response.status}`,
        data,
      };
    }

    console.log(`[Interakt API] Successfully sent template '${templateName}' to ${targetCountryCode}${targetPhone}`);
    return { success: true, data };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Network error calling Interakt API";
    console.error("[Interakt API Exception]:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Sends an OTP verification WhatsApp message using Interakt.
 * Defaults to template name 'skywin_otp', configurable via INTERAKT_OTP_TEMPLATE env var.
 */
export async function sendWhatsAppOtp(phoneNumber: string, otp: string): Promise<InteraktSendResponse> {
  const templateName = process.env.INTERAKT_OTP_TEMPLATE || "skywin_otp";
  return sendWhatsAppTemplate({
    phoneNumber,
    templateName,
    bodyValues: [otp],
    buttonValues: {
      "0": [otp], // For WhatsApp copy-code or url buttons
    },
  });
}

/**
 * Track/Add/Update a User in Interakt CRM
 * Endpoint: POST https://api.interakt.ai/v1/public/track/users/
 */
export async function trackInteraktUser({
  phoneNumber,
  traits = {},
  tags = [],
  countryCode,
}: {
  phoneNumber: string;
  traits?: Record<string, any>;
  tags?: string[];
  countryCode?: string;
}): Promise<InteraktSendResponse> {
  const phoneData = cleanPhoneNumber(phoneNumber);
  const targetCountryCode = countryCode || phoneData.countryCode;
  const targetPhone = phoneData.number;

  try {
    const response = await fetch("https://api.interakt.ai/v1/public/track/users/", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        countryCode: targetCountryCode,
        phoneNumber: targetPhone,
        traits,
        tags,
      }),
    });

    const data = await response.json();
    if (!response.ok || data.result === false) {
      return { success: false, error: data.message || `HTTP ${response.status}`, data };
    }
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error tracking user" };
  }
}

/**
 * Track an Event for an ongoing campaign or analytics in Interakt
 * Endpoint: POST https://api.interakt.ai/v1/public/track/events/
 */
export async function trackInteraktEvent({
  phoneNumber,
  event,
  traits = {},
  countryCode,
}: {
  phoneNumber: string;
  event: string;
  traits?: Record<string, any>;
  countryCode?: string;
}): Promise<InteraktSendResponse> {
  const phoneData = cleanPhoneNumber(phoneNumber);
  const targetCountryCode = countryCode || phoneData.countryCode;
  const targetPhone = phoneData.number;

  try {
    const response = await fetch("https://api.interakt.ai/v1/public/track/events/", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${getSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        countryCode: targetCountryCode,
        phoneNumber: targetPhone,
        event,
        traits,
      }),
    });

    const data = await response.json();
    if (!response.ok || data.result === false) {
      return { success: false, error: data.message || `HTTP ${response.status}`, data };
    }
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error tracking event" };
  }
}
