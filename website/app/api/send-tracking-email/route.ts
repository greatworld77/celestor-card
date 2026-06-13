import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, orderId, tracking } = await req.json();

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY!,
      },
      body: JSON.stringify({
        sender: {
          name: "Celestor",
          email: "remisurgie@gmail.com",
        },
        to: [
          {
            email,
          },
        ],
        subject: "Your Celestor Card Tracking Number",
        htmlContent: `
          <h2>Your Celestor Card Has Shipped</h2>

          <p><strong>Order ID:</strong> ${orderId}</p>

          <p><strong>Tracking Number:</strong> ${tracking}</p>

          <p>You can track your shipment using the tracking number above.</p>

          <p>Thank you for choosing Celestor.</p>
        `,
      }),
    });

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send tracking email" },
      { status: 500 }
    );
  }
}