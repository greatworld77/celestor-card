import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const update = await req.json();

  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim();

  if (!chatId || !text) {
    return NextResponse.json({ ok: true });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN!;

  const reply = async (message: string) => {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    });
  };

  if (text === "/start") {
    await reply(
      "Welcome to Celestor Card.\n\nSend your Telegram Access Code to verify your card access."
    );
    return NextResponse.json({ ok: true });
  }

  const { data: card } = await supabaseAdmin
  .from("cards")
  .select("*")
  .eq("telegram_code", text)
  .single();

if (!card) {
  await reply(
    "❌ Invalid Telegram Access Code.\n\nPlease check your email and try again."
  );

  return NextResponse.json({ ok: true });
}

if (card.telegram_verified) {
  await reply(
    "⚠️ This Telegram code has already been used."
  );

  return NextResponse.json({ ok: true });
}

await supabaseAdmin
  .from("cards")
  .update({
    telegram_verified: true,
    telegram_verified_at: new Date().toISOString(),
  })
  .eq("id", card.id);

await reply(
  `✅ Access Verified

Order ID: ${card.order_id}
Card Type: ${card.card_type}
Status: ${card.status}

Wallet: ${card.wallet_address}

NFT Token ID: ${card.token_id}

Transaction:
https://sepolia.etherscan.io/tx/${card.tx_hash}`
);

  return NextResponse.json({ ok: true });
}