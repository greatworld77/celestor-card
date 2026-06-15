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

type CardRecord = {
  id: string;
  user_id: string;
  order_id: string;
  card_type: "virtual" | "physical" | "free" | string;
  status: string;
  telegram_code: string;
  token_id: string | null;
  wallet_address: string;
  tx_hash: string | null;
  created_at: string;
};

const getNumericHash = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1000000000;
  }

  return String(Math.abs(hash)).padStart(9, "0");
};

const getDemoCardDetails = (card: CardRecord, holderName: string) => {
  const seed = `${card.order_id}-${card.token_id || ""}-${
    card.wallet_address || ""
  }`;

  const hash = getNumericHash(seed);

  const cardNumber = `9090 90${hash.slice(0, 2)} ${hash.slice(
    2,
    6
  )} ${hash.slice(5, 9)}`;

  const cvv = hash.slice(0, 3);

  const typeLabel =
    card.card_type === "free"
      ? "Free Mint Virtual"
      : card.card_type === "physical"
      ? "Physical"
      : "Virtual";

  return `💳 Celestor Card Details

Card Number: ${cardNumber}
CVV: ${cvv}
Card Holder Name: ${holderName || "Celestor User"}
Type: ${typeLabel}

Order ID: ${card.order_id}
NFT Token ID: ${card.token_id || "Pending"}
Status: ${card.status}`;
};

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

    const mainKeyboard = {
      inline_keyboard: [
        [
          { text: "💳 My Cards", callback_data: "my_cards" },
          { text: "💰 Balance", callback_data: "balance" },
        ],
        [
          { text: "⬆️ Reload", callback_data: "reload" },
          { text: "💸 Withdraw", callback_data: "withdraw" },
        ],
        [{ text: "Open Dashboard", url: DASHBOARD_URL }],
      ],
    };

    const cardTypeKeyboard = {
      inline_keyboard: [
        [
          { text: "Virtual", callback_data: "cards_virtual" },
          { text: "Physical", callback_data: "cards_physical" },
        ],
        [{ text: "Free Mint Card", callback_data: "cards_free" }],
        [{ text: "Open Dashboard", url: DASHBOARD_URL }],
      ],
    };

    const dashboardKeyboard = {
      inline_keyboard: [
        [{ text: "Open Dashboard", url: DASHBOARD_URL }],
        [{ text: "💳 My Cards", callback_data: "my_cards" }],
      ],
    };

    const getHolderName = async (card: CardRecord) => {
      if (card.card_type === "physical") {
        const { data: shipping } = await supabaseAdmin
          .from("shipping_addresses")
          .select("full_name")
          .eq("card_order_id", card.order_id)
          .maybeSingle();

        if (shipping?.full_name) {
          return shipping.full_name;
        }
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", card.user_id)
        .maybeSingle();

      return profile?.full_name || "Celestor User";
    };

    const getVerifiedCardsForChat = async (
      chatId: number,
      cardType?: "virtual" | "physical" | "free"
    ) => {
      let query = supabaseAdmin
        .from("cards")
        .select(
          "id, user_id, order_id, card_type, status, telegram_code, token_id, wallet_address, tx_hash, created_at"
        )
        .eq("telegram_chat_id", String(chatId))
        .eq("telegram_verified", true)
        .order("created_at", { ascending: false })
        .limit(20);

      if (cardType) {
        query = query.eq("card_type", cardType);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Card lookup failed:", error);
        return [] as CardRecord[];
      }

      return (data || []) as CardRecord[];
    };

    const sendCardList = async (
      chatId: number,
      cards: CardRecord[],
      emptyMessage: string
    ) => {
      if (cards.length === 0) {
        await sendMessage(chatId, emptyMessage, cardTypeKeyboard);
        return;
      }

      const cardMessages = await Promise.all(
        cards.map(async (card) => {
          const holderName = await getHolderName(card);
          return getDemoCardDetails(card, holderName);
        })
      );

      await sendMessage(
        chatId,
        cardMessages.join("\n\n────────────\n\n"),
        mainKeyboard
      );
    };

    const callback = update.callback_query;

    if (callback) {
      const data = callback.data;
      const chatId = callback.message?.chat?.id;

      if (!chatId) {
        await answerCallbackQuery(callback.id);
        return NextResponse.json({ ok: true });
      }

      if (data === "reload") {
        await answerCallbackQuery(callback.id);

        await sendMessage(
          chatId,
          "⬆️ Reload is available from your Celestor dashboard.",
          dashboardKeyboard
        );

        return NextResponse.json({ ok: true });
      }

      if (data === "withdraw") {
        await answerCallbackQuery(callback.id);

        await sendMessage(
          chatId,
          "💸 Withdraw controls are available from your Celestor dashboard when enabled for your card.",
          dashboardKeyboard
        );

        return NextResponse.json({ ok: true });
      }

      if (data === "my_cards" || data === "my_card") {
        await answerCallbackQuery(callback.id);

        await sendMessage(
          chatId,
          "Choose which Celestor card type you want to view:",
          cardTypeKeyboard
        );

        return NextResponse.json({ ok: true });
      }

      if (data === "cards_virtual") {
        await answerCallbackQuery(callback.id);

        const cards = await getVerifiedCardsForChat(chatId, "virtual");

        await sendCardList(
          chatId,
          cards,
          "No verified Virtual Cards found for this Telegram chat."
        );

        return NextResponse.json({ ok: true });
      }

      if (data === "cards_physical") {
        await answerCallbackQuery(callback.id);

        const cards = await getVerifiedCardsForChat(chatId, "physical");

        await sendCardList(
          chatId,
          cards,
          "No verified Physical Cards found for this Telegram chat."
        );

        return NextResponse.json({ ok: true });
      }

      if (data === "cards_free") {
        await answerCallbackQuery(callback.id);

        const cards = await getVerifiedCardsForChat(chatId, "free");

        await sendCardList(
          chatId,
          cards,
          "No verified Free Mint Card found for this Telegram chat."
        );

        return NextResponse.json({ ok: true });
      }

      if (data === "balance") {
        await answerCallbackQuery(callback.id, "Checking balance...");

        if (!vaultAddress || !loadAddress) {
          await sendMessage(
            chatId,
            "❌ Balance contracts are not fully configured. Please contact Celestor support."
          );

          return NextResponse.json({ ok: true });
        }

        const cards = await getVerifiedCardsForChat(chatId);

        if (cards.length === 0) {
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
                ] = loadData as readonly [
                  bigint,
                  bigint,
                  bigint,
                  boolean,
                  boolean
                ];

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
          mainKeyboard
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
        "Welcome to Celestor Card.\n\nSend your Telegram Access Code to verify your card access."
      );

      return NextResponse.json({ ok: true });
    }

    const normalizedCode = text.toUpperCase();

    const { data: matchingCards, error: codeError } = await supabaseAdmin
      .from("cards")
      .select(
        "id, user_id, order_id, card_type, status, telegram_code, token_id, wallet_address, tx_hash, created_at"
      )
      .eq("telegram_code", normalizedCode)
      .order("created_at", { ascending: false })
      .limit(50);

    if (codeError) {
      console.error("Telegram code lookup failed:", codeError);

      await reply(
        "❌ Could not verify this Telegram Access Code. Please try again."
      );

      return NextResponse.json({ ok: true });
    }

    if (!matchingCards || matchingCards.length === 0) {
      await reply(
        "❌ Invalid Telegram Access Code.\n\nPlease check your order email and try again."
      );

      return NextResponse.json({ ok: true });
    }

    const primaryCard = matchingCards[0] as CardRecord;
    const walletAddress = primaryCard.wallet_address;

    const { error: verifyError } = await supabaseAdmin
      .from("cards")
      .update({
        telegram_verified: true,
        telegram_verified_at: new Date().toISOString(),
        telegram_chat_id: String(chatId),
      })
      .eq("wallet_address", walletAddress);

    if (verifyError) {
      console.error("Telegram verification update failed:", verifyError);

      await reply(
        "❌ Could not link this Telegram chat to your wallet. Please try again."
      );

      return NextResponse.json({ ok: true });
    }

    const holderName = await getHolderName(primaryCard);
    const verifiedCardMessage = getDemoCardDetails(primaryCard, holderName);

    await reply(
      `✅ Access Verified

${verifiedCardMessage}`,
      mainKeyboard
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