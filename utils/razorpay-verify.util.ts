import crypto from "crypto";

/**
 * Verifies a Razorpay checkout signature: HMAC-SHA256("order_id|payment_id", key_secret).
 * Returns false when the secret is not configured, the fields are missing, or the signature does not match.
 */
export function verifyRazorpaySignature(orderId: any, paymentId: any, signature: any): boolean {
  const secret = process.env.RAZORPAY_PASSWORD;
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const given = Buffer.from(String(signature));
  const want = Buffer.from(expected);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
