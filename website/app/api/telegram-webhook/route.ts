import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, formatEther, http } from "viem";
import { sepolia } from "viem/chains";
import { CELESTOR_VAULT_ABI } from "../../../lib/contracts/CelestorVaultABI";
import { CELESTOR_LOAD_ABI } from "../../../lib/contracts/CelestorLoadABI";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://celestor-card.vercel.app";

const DASHBOARD_URL = `${SITE_URL}/dashboard`;

const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const vaultAddress = process.env
  .NEXT_PUBLIC_CELESTOR_VAULT_CONTRACT as `0x${string}`;

  const loadAddress = process.env
  .NEXT_PUBLIC_CELESTOR_LOAD_CONTRACT as `0x${string}`;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

export async function POST(req: Request) {
  try {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const incomingSecret = req.headers.get(
        "x-telegram-bot-api-secret-token"
      );

      if (incomingSecret !== TELEGRAM_WEBHOOK_SECRET) {
        return NextResponse.json(
          { error: "Invalid Telegram webhook secret." },
          { status: 401 }
        );
      }
    }

    const update = await req.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN!;

    const sendMessage = async (
      chatId: number,
      message: string,
      keyboard?: unknown
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
          disable_web_page_preview: true,
        }),
      });
    };

    const answerCallbackQuery = async (
      callbackQueryId: string,
      message?: string
    ) => {
      await fetch(
        `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            callback_query_id: callbackQueryId,
            text: message,
            show_alert: false,
          }),
        }
      );
    };

    const dashboardKeyboard = {
      inline_keyboard: [[{ text: "Open Dashboard", url: DASHBOARD_URL }]],
    };

    const callback = update.callback_query;

    if (callback) {
      const data = callback.data;
      const chatId = callback.message.chat.id;

      if (data === "reload") {
        await answerCallbackQuery(callback.id);

        await sendMessage(
          chatId,
          "⬆️ Reload your Celestor Card from the dashboard.",
          dashboardKeyboard
        );

        return NextResponse.json({ ok: true });
      }

      if (data === "withdraw") {
        await answerCallbackQuery(callback.id);

        await sendMessage(
          chatId,
          "💸 Withdraw from your Celestor Card from the dashboard.",
          dashboardKeyboard
        );

        return NextResponse.json({ ok: true });
      }

      if (data === "my_card") {
        await answerCallbackQuery(callback.id);

        const { data: cards } = await supabaseAdmin
          .from("cards")
          .select(
            "order_id, card_type, status, token_id, wallet_address, tx_hash"
          )
          .eq("telegram_chat_id", String(chatId))
          .eq("telegram_verified", true)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!cards || cards.length === 0) {
          await sendMessage(
            chatId,
            "💳 No verified Celestor card found for this Telegram chat.\n\nSend your Telegram Access Code from your order email to verify your card."
          );

          return NextResponse.json({ ok: true });
        }

        const cardLines = cards
          .map(
            (card, index) => `Card ${index + 1}
Order ID: ${card.order_id}
Type: ${card.card_type}
Status: ${card.status}
NFT Token ID: ${card.token_id || "Pending"}
Wallet: ${card.wallet_address}`
          )
          .join("\n\n");

        await sendMessage(chatId, `💳 Your Celestor Cards\n\n${cardLines}`, {
          inline_keyboard: [
            [
              { text: "💰 Balance", callback_data: "balance" },
              { text: "Open Dashboard", url: DASHBOARD_URL },
            ],
          ],
        });

        return NextResponse.json({ ok: true });
      }

      if (data === "balance") {
        await answerCallbackQuery(callback.id, "Checking balance...");

        if (!vaultAddress) {
          await sendMessage(
            chatId,
            "❌ Vault contract address is missing. Please contact Celestor support."
          );

          return NextResponse.json({ ok: true });
        }

        const { data: cards, error } = await supabaseAdmin
          .from("cards")
          .select("order_id, card_type, status, token_id")
          .eq("telegram_chat_id", String(chatId))
          .eq("telegram_verified", true)
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) {
          console.error("Telegram balance query failed:", error);

          await sendMessage(
            chatId,
            "❌ Could not load your verified cards. Please try again."
          );

          return NextResponse.json({ ok: true });
        }

        if (!cards || cards.length === 0) {
          await sendMessage(
            chatId,
            "💰 No verified card found for this Telegram chat.\n\nSend your Telegram Access Code first, then tap Balance again."
          );

          return NextResponse.json({ ok: true });
        }

        const balanceLines = await Promise.all(
  cards.map(async (card, index) => {
    if (!card.token_id) {
      return `Card ${index + 1}
Order ID: ${card.order_id}
Type: ${card.card_type}
Status: ${card.status}
NFT Token ID: Pending
Balance: Pending`;
    }

    try {
      if (card.card_type === "free") {
        const loadData = await publicClient.readContract({
          address: loadAddress,
          abi: CELESTOR_LOAD_ABI,
          functionName: "getCardLoadData",
          args: [BigInt(card.token_id)],
        });

        const [
          realBalance,
          promoBalance,
          displayedBalance,
          firstReloadBonusUsed,
          unlocked,
        ] = loadData as readonly [bigint, bigint, bigint, boolean, boolean];

        return `Card ${index + 1}
Order ID: ${card.order_id}
Type: Free Mint Virtual Card
Status: ${unlocked ? "Unlocked" : "Locked"}
NFT Token ID: #${card.token_id}
Displayed Balance: ${formatEther(displayedBalance)} ETH
Promo Bonus: ${formatEther(promoBalance)} ETH
Real Reloaded Balance: ${formatEther(realBalance)} ETH
First Reload Bonus: ${firstReloadBonusUsed ? "Used" : "Available"}`;
      }

      const rawBalance = await publicClient.readContract({
        address: vaultAddress,
        abi: CELESTOR_VAULT_ABI,
        functionName: "getCardBalance",
        args: [BigInt(card.token_id)],
      });

      return `Card ${index + 1}
Order ID: ${card.order_id}
Type: ${card.card_type}
Status: ${card.status}
NFT Token ID: #${card.token_id}
Balance: ${formatEther(rawBalance as bigint)} ETH`;
    } catch (error) {
      console.error("Balance read failed:", error);

      return `Card ${index + 1}
Order ID: ${card.order_id}
Type: ${card.card_type}
NFT Token ID: #${card.token_id}
Balance: Could not read balance`;
    }
  })
);

        await sendMessage(
          chatId,
          `💰 Celestor Card Balance\n\n${balanceLines.join("\n\n")}`,
          dashboardKeyboard
        );

        return NextResponse.json({ ok: true });
      }

      await answerCallbackQuery(callback.id);

      return NextResponse.json({ ok: true });
    }

    const chatId = update.message?.chat?.id;
    const text = update.message?.text?.trim();

    if (!chatId || !text) {
      return NextResponse.json({ ok: true });
    }

    const reply = async (message: string, keyboard?: unknown) => {
      await sendMessage(chatId, message, keyboard);
    };

    if (text === "/start") {
      await reply(
        `💳 Celestor Card

Welcome to Celestor.

To verify your card, paste the Telegram Access Code that was sent to your order email.

Example:
TG-ABC12345`,
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
            [{ text: "Open Dashboard", url: DASHBOARD_URL }],
          ],
        }
      );

      return NextResponse.json({ ok: true });
    }

    const normalizedCode = text.toUpperCase();

    const { data: card } = await supabaseAdmin
      .from("cards")
      .select("*")
      .eq("telegram_code", normalizedCode)
      .maybeSingle();

    if (!card) {
      await reply(
        "❌ Invalid Telegram Access Code.\n\nPlease check your order email and try again."
      );

      return NextResponse.json({ ok: true });
    }

    if (card.telegram_verified) {
      await supabaseAdmin
        .from("cards")
        .update({
          telegram_chat_id: String(chatId),
        })
        .eq("id", card.id);

      await reply(
        `⚠️ This Telegram code has already been used.

Order ID: ${card.order_id}
Card Type: ${card.card_type}
Status: ${card.status}`,
        {
          inline_keyboard: [
            [
              { text: "💰 Balance", callback_data: "balance" },
              { text: "Open Dashboard", url: DASHBOARD_URL },
            ],
          ],
        }
      );

      return NextResponse.json({ ok: true });
    }

    await supabaseAdmin
      .from("cards")
      .update({
        telegram_verified: true,
        telegram_verified_at: new Date().toISOString(),
        telegram_chat_id: String(chatId),
      })
      .eq("id", card.id);

    await reply(
      `✅ Access Verified

Order ID: ${card.order_id}
Card Type: ${card.card_type}
Status: ${card.status}

Wallet:
${card.wallet_address}

NFT Token ID:
${card.token_id || "Pending"}

Transaction:
https://sepolia.etherscan.io/tx/${card.tx_hash}`,
      {
        inline_keyboard: [
          [
            { text: "💰 Balance", callback_data: "balance" },
            { text: "Open Dashboard", url: DASHBOARD_URL },
          ],
        ],
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed:", error);

    return NextResponse.json(
      { error: "Telegram webhook failed." },
      { status: 500 }
    );
  }
}