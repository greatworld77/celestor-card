import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, name, orderId, telegramCode, cardType } = await req.json();

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Celestor Card",
          email: "remisurgie@gmail.com",
        },
        to: [
          {
            email,
            name,
          },
        ],
        subject: "Your Celestor Card Order Details",
        htmlContent: `
          <h2>Celestor Card Order Confirmed</h2>
          <p>Hello ${name},</p>
          <p>Your order has been created successfully.</p>
          <p><b>Card Type:</b> ${cardType}</p>
          <p><b>Order ID:</b> ${orderId}</p>
          <p><b>Telegram Access Code:</b> ${telegramCode}</p>
           <p>
    Click the link below and send your Telegram code to receive your card details:
  </p>
           <p>
    <a href="https://t.me/CelestorCardbot">@CelestorCardbot</a>
  </p>
          <br/>
          <p>Celestor Card Team</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}