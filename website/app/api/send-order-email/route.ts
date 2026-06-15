import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const escapeHtml = (value: string) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export async function POST(req: Request) {
  try {
    const { email, name, orderId, telegramCode, cardType } = await req.json();

    if (!email || !orderId || !telegramCode || !cardType) {
      return NextResponse.json(
        { error: "Missing required email details." },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing auth token." },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return NextResponse.json(
        { error: "Invalid auth token." },
        { status: 401 }
      );
    }

    if (data.user.email !== email) {
      return NextResponse.json(
        { error: "You can only send order emails to your own account email." },
        { status: 403 }
      );
    }

    const safeEmail = escapeHtml(email);
    const safeName = escapeHtml(name || "Celestor User");
    const safeOrderId = escapeHtml(orderId);
    const safeTelegramCode = escapeHtml(telegramCode);
    const safeCardType = escapeHtml(cardType);
    const isFreeMint = cardType === "free";

    const subject = isFreeMint
      ? "Your Celestor Free Mint + Locked Virtual Card Access"
      : "Your Celestor Card Order Details";

    const htmlContent = isFreeMint
      ? `
        <h2>Celestor Free Mint Confirmed</h2>

        <p>Hello ${safeName},</p>

        <p>Your Celestor Free Mint has been created successfully.</p>

        <p><b>Order ID:</b> ${safeOrderId}</p>
        <p><b>Card Type:</b> Free Mint + Locked Virtual Card</p>
        <p><b>Telegram Access Code:</b> ${safeTelegramCode}</p>

        <hr/>

        <h3>Your Locked Virtual Card</h3>

        <p>
          Your Free Mint includes access to a locked Celestor Virtual Card.
          To unlock it, open your dashboard and complete your first reload.
        </p>

        <p><b>Minimum Reload:</b> 0.0055 ETH</p>
        <p><b>First Reload Bonus:</b> 10% promo balance</p>

        <p>
          Example: if you reload 0.0055 ETH, your displayed card balance will include
          a 10% promo balance.
        </p>

        <p>
          Open the Telegram bot below and send your Telegram Access Code to verify your card:
        </p>

        <p>
          <a href="https://t.me/CelestorCardbot">@CelestorCardbot</a>
        </p>

        <br/>
        <p>Celestor Card Team</p>
      `
      : `
        <h2>Celestor Card Order Confirmed</h2>

        <p>Hello ${safeName},</p>

        <p>Your order has been created successfully.</p>

        <p><b>Card Type:</b> ${safeCardType}</p>
        <p><b>Order ID:</b> ${safeOrderId}</p>
        <p><b>Telegram Access Code:</b> ${safeTelegramCode}</p>

        <p>
          Click the link below and send your Telegram code to receive your card details:
        </p>

        <p>
          <a href="https://t.me/CelestorCardbot">@CelestorCardbot</a>
        </p>

        <br/>
        <p>Celestor Card Team</p>
      `;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
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
            email: safeEmail,
            name: safeName,
          },
        ],
        subject,
        htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      return NextResponse.json(
        { error: errorText },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Order email failed:", error);

    return NextResponse.json(
      { error: "Failed to send email." },
      { status: 500 }
    );
  }
}