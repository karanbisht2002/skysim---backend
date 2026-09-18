import axios from "axios";

/* ===============================
   VERIFY FLUTTERWAVE PAYMENT
================================ */
export async function verifyFlutterwave(body: any, gateway: any) {
  // body.transaction_id is provided by flutterwave via callback query or frontend
  const transactionId = body?.transaction_id || body?.flutterwave?.transaction_id;

  if (!transactionId) {
    return {
      success: false,
      message: "Flutterwave transaction ID missing",
    };
  }

  if (!gateway?.secretKey) {
    return {
      success: false,
      message: "Flutterwave secret key not configured",
    };
  }

  try {
    const { data } = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        headers: {
          Authorization: `Bearer ${gateway.secretKey}`,
        },
      }
    );

    const trx = data?.data;

    if (!trx || data.status !== "success" || trx.status !== "successful") {
      return {
        success: false,
        message: "Flutterwave payment verification failed",
      };
    }

    return {
      success: true,
      provider: "flutterwave",
      referenceId: trx.tx_ref,
      paymentId: trx.id.toString(),
      amount: trx.amount,
      currency: trx.currency,
      metadata: {
        email: trx.customer?.email,
        ...trx.meta,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.response?.data?.message || error.message || "Flutterwave verification failed",
    };
  }
}

export default verifyFlutterwave;
