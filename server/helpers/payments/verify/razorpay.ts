import crypto from "crypto";
import Razorpay from "razorpay";



export async function verifyRazorpay(body: any, gateway: any) {
  const r = body.razorpay ?? body;

  // 🔁 Accept BOTH formats
  const orderId =
    r.razorpay_order_id || r.orderId;

  const paymentId =
    r.razorpay_payment_id || r.paymentId;

  const signature =
    r.razorpay_signature || r.signature;

  if (!orderId || !paymentId || !signature) {
    return {
      success: false,
      message: 'Missing Razorpay parameters',
      debug: { orderId, paymentId, signature },
    };
  }

  // 🔐 Verify signature
  const generatedSignature = crypto
    .createHmac('sha256', gateway.secretKey)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (generatedSignature !== signature) {
    return {
      success: false,
      message: 'Invalid Razorpay signature',
    };
  }

  // 🔥 Fetch order metadata
  const razorpay = new Razorpay({
    key_id: gateway.publicKey,
    key_secret: gateway.secretKey,
  });

  const order = await razorpay.orders.fetch(orderId);

  return {
    success: true,
    provider: 'razorpay',
    orderId,
    paymentId,
    amount: order.amount,
    currency: order.currency,
    metadata: order.notes,
  };
}



export async function verifyRazorpayiii(body: any) {
  const r = body.razorpay ?? body;

  const { orderId, paymentId, signature } = r;

  if (!orderId || !paymentId || !signature) {
    return { success: false, message: "Missing Razorpay parameters" };
  }

  // 🔐 Signature verification
  const generatedSignature = crypto
    .createHmac("sha256", 'hpTDDnSy1m7DpHaDk97FiI0V')
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  if (generatedSignature !== signature) {
    return { success: false, message: "Invalid Razorpay signature" };
  }

  // 🔥 Fetch order to read NOTES (metadata)
  const razorpay = new Razorpay({
    key_id: 'rzp_test_0NJvxM1fXQpvlr',
    key_secret: 'hpTDDnSy1m7DpHaDk97FiI0V',
  });

  const order = await razorpay.orders.fetch(orderId);

  if (!order?.notes?.type) {
    return { success: false, message: "Razorpay metadata missing" };
  }

  return {
    success: true,
    provider: "razorpay",
    paymentId,
    amount: order.amount,
    currency: order.currency,
    metadata: order.notes,
  };
}

export default verifyRazorpay;




// export async function verifyRazorpay(body: any) {
//   const r = body.razorpay;

//   const generatedSignature = crypto
//     .createHmac("sha256", 'hpTDDnSy1m7DpHaDk97FiI0V')
//     .update(`${r.orderId}|${r.paymentId}`)
//     .digest("hex");

//   if (generatedSignature !== r.signature) {
//     return { success: false, message: "Invalid Razorpay signature" };
//   }

//   return {
//     success: true,
//     provider: "razorpay",
//     referenceId: r.paymentId,
//     metadata: { orderId: r.orderId },
//   };
// }


// export default verifyRazorpay;
