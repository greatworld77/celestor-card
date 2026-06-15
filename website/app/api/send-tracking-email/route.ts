import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const adminEmail =
  process.env.ADMIN_EMAIL ||
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
  "grove6027@gmail.com";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export async function POST(req: Request) {
  try {
    const { email, orderId, tracking } = await req.json();

    if (!email || !orderId || !tracking) {
      return NextResponse.json(
        { error: "Missing required tracking details." },
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

    if (data.user.email !== adminEmail) {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      );
    }

    const safeEmail = escapeHtml(email);
    const safeOrderId = escapeHtml(orderId);
    const safeTracking = escapeHtml(tracking);

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
            email: safeEmail,
          },
        ],
        subject: "Your Celestor Card Tracking Number",
        htmlContent: `
          <h2>Your Celestor Card Has Shipped</h2>

          <p><strong>Order ID:</strong> ${safeOrderId}</p>

          <p><strong>Tracking Number:</strong> ${safeTracking}</p>

          <p>You can track your shipment using the tracking number above.</p>

          <p>Thank you for choosing Celestor.</p>
        `,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      return NextResponse.json(
        { error: errorText },
        { status: 500 }
      );
    }

    const result = await response.json();

    return NextResponse.json(result);
  } catch (error) {
    console.error("Tracking email failed:", error);

    return NextResponse.json(
      { error: "Failed to send tracking email." },
      { status: 500 }
    );
  }
}