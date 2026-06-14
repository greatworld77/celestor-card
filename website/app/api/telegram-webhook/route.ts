import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DASHBOARD_URL = "https://celestor-card.vercel.app/dashboard";

export async function POST(req: Request) {
  const update = await req.json();
  const botToken = process.env.TELEGRAM_BOT_TOKEN!;

  const sendMessage = async (
    chatId: number,
    message: string,
    keyboard?: any
  ) => {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        reply_markup: keyboard,
      }),
    });
  };

  const callback = update.callback_query;

  if (callback) {
    const data = callback.data;
    const chatId = callback.message.chat.id;

    if (data === "reload") {
      await sendMessage(chatId, "⬆️ Reload Your Card", {
        inline_keyboard: [
          [
            {
              text: "Open Dashboard",
              url: DASHBOARD_URL,
            },
          ],
        ],
      });
    }

    if (data === "withdraw") {
      await sendMessage(chatId, "💸 Withdraw From Card", {
        inline_keyboard: [
          [
            {
              text: "Open Dashboard",
              url: DASHBOARD_URL,
            },
          ],
        ],
      });
    }

    if (data === "my_card") {
      await sendMessage(
        chatId,
        "💳 Send your Telegram Access Code again to view your verified card details."
      );
    }

    if (data === "balance") {
      await sendMessage(
        chatId,
        "💰 Balance checking from Telegram is coming next. For now, open your dashboard.",
        {
          inline_keyboard: [
            [
              {
                text: "Open Dashboard",
                url: DASHBOARD_URL,
              },
            ],
          ],
        }
      );
    }

    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim();

  if (!chatId || !text) {
    return NextResponse.json({ ok: true });
  }

  const reply = async (message: string, keyboard?: any) => {
    await sendMessage(chatId, message, keyboard);
  };

  if (text === "/start") {
    await reply(
      `💳 Celestor Digital Card

Card ID: ************
Status: ********
Plan: ********
Product: virtual / physical

Click below to manage your card.`,
      {
        inline_keyboard: [
          [
            { text: "💳 My Card", callback_data: "my_card" },
            { text: "💰 Balance", callback_data: "balance" },
          ],
          [
            { text: "⬆️ Reload", callback_data: "reload" },
            { text: "💸 Withdraw", callback_data: "withdraw" },
          ],
        ],
      }
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
    await reply("⚠️ This Telegram code has already been used.");

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