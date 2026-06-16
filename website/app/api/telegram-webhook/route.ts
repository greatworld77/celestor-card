import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, formatEther, http } from "viem";
import { sepolia } from "viem/chains";
import { CELESTOR_VAULT_ABI } from "../../../lib/contracts/CelestorVaultABI";
import { CELESTOR_LOAD_ABI } from "../../../lib/contracts/CelestorLoadABI";
import {
  CardInventoryRecord,
  formatMaskedCardDetails,
} from "../../../lib/cardInventory";

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
  telegram_active?: boolean;
  card_holder_name?: string | null;
  card_inventory_id?: string | null;
  card_inventory?: CardInventoryRecord | CardInventoryRecord[] | null;
};

const CARD_SELECT = `
  id,
  user_id,
  order_id,
  card_type,
  status,
  telegram_code,
  token_id,
  wallet_address,
  tx_hash,
  created_at,
  telegram_active,
  card_holder_name,
  card_inventory_id,
  card_inventory:card_inventory_id (
    card_number,
    cvv,
    expiry_month,
    expiry_year,
    card_type
  )
`;

const getInventory = (card: CardRecord) => {
  if (Array.isArray(card.card_inventory)) {
    return card.card_inventory[0] || null;
  }

  return card.card_inventory || null;
};

const formatTelegramCardDetails = (
  card: CardRecord,
  holderName: string,
  inventory: CardInventoryRecord
) => {
  const details = formatMaskedCardDetails(
    inventory,
    holderName,
    card.card_type
  );

  return `Card Number : ${details.cardNumber}

CVV : ${details.cvv}

Card Holder Name : ${details.holderName}

Type : ${details.type}`;
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
        [{ text: "Free Card", callback_data: "cards_free" }],
        [{ text: "Open Dashboard", url: DASHBOARD_URL }],
      ],
    };

    const dashboardKeyboard = {
      inline_keyboard: [
        [{ text: "Open Dashboard", url: DASHBOARD_URL }],
        [{ text: "💳 My Cards", callback_data: "my_cards" }],
      ],
    };

    const getCardByOrderId = async (orderId: string) => {
      const { data, error } = await supabaseAdmin
        .from("cards")
        .select(CARD_SELECT)
        .eq("order_id", orderId)
        .maybeSingle();

      if (error) {
        console.error("Card order lookup failed:", error);
        return null;
      }

      return data as CardRecord | null;
    };

    const assignInventoryToOrder = async (orderId: string) => {
      const { error } = await supabaseAdmin.rpc(
        "assign_card_inventory_to_order",
        {
          p_order_id: orderId,
        }
      );

      if (error) {
        console.error("Card inventory assignment failed:", error);
        return false;
      }

      return true;
    };

    const ensureCardInventory = async (card: CardRecord) => {
      if (getInventory(card)) {
        return card;
      }

      const assigned = await assignInventoryToOrder(card.order_id);

      if (!assigned) {
        return card;
      }

      return (await getCardByOrderId(card.order_id)) || card;
    };

    const getHolderName = async (card: CardRecord) => {
      if (card.card_holder_name) {
        return card.card_holder_name;
      }

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
        .select(CARD_SELECT)
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
          const assignedCard = await ensureCardInventory(card);
          const inventory = getInventory(assignedCard);

          if (!inventory) {
            return null;
          }

          const holderName = await getHolderName(assignedCard);

          return formatTelegramCardDetails(
            assignedCard,
            holderName,
            inventory
          );
        })
      );

      const visibleMessages = cardMessages.filter(Boolean);

      if (visibleMessages.length === 0) {
        await sendMessage(
          chatId,
          "Card details are not available. Please contact support.",
          dashboardKeyboard
        );

        return;
      }

      await sendMessage(
        chatId,
        visibleMessages.join("\n\n────────────\n\n"),
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
          "No verified Free Card found for this Telegram chat."
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

        const { data: activeCards, error: activeCardsError } =
          await supabaseAdmin
            .from("cards")
            .select(CARD_SELECT)
            .eq("telegram_chat_id", String(chatId))
            .eq("telegram_verified", true)
            .eq("telegram_active", true)
            .order("created_at", { ascending: false })
            .limit(10);

        if (activeCardsError) {
          console.error("Active card lookup failed:", activeCardsError);

          await sendMessage(
            chatId,
            "❌ Could not load your active card. Please try again."
          );

          return NextResponse.json({ ok: true });
        }

        const cards = (activeCards || []) as CardRecord[];

        if (cards.length === 0) {
          await sendMessage(
            chatId,
            "💰 No active card found for this Telegram chat.\n\nSend your Telegram Access Code first, then tap Balance again."
          );

          return NextResponse.json({ ok: true });
        }

        const balanceLines = await Promise.all(
          cards.map(async (card, index) => {
            if (!card.token_id) {
              return `Card ${index + 1}
Type: ${card.card_type === "free" ? "Free" : card.card_type}
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
Type: Free
Status: ${unlocked ? "Unlocked" : "Locked"}
Balance: ${formatEther(displayedBalance)} ETH
Promo Balance: ${formatEther(promoBalance)} ETH
Reloaded Balance: ${formatEther(realBalance)} ETH
First Reload Bonus: ${firstReloadBonusUsed ? "Used" : "Available"}`;
              }

              const rawBalance = await publicClient.readContract({
                address: vaultAddress,
                abi: CELESTOR_VAULT_ABI,
                functionName: "getCardBalance",
                args: [BigInt(card.token_id)],
              });

              return `Card ${index + 1}
Type: ${card.card_type === "physical" ? "Physical" : "Virtual"}
Balance: ${formatEther(rawBalance as bigint)} ETH`;
            } catch (error) {
              console.error("Balance read failed:", error);

              return `Card ${index + 1}
Type: ${card.card_type}
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
      .select(CARD_SELECT)
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

    await assignInventoryToOrder(primaryCard.order_id);

    await supabaseAdmin
      .from("cards")
      .update({
        telegram_active: false,
      })
      .eq("telegram_chat_id", String(chatId));

    const { error: verifyError } = await supabaseAdmin
      .from("cards")
      .update({
        telegram_verified: true,
        telegram_verified_at: new Date().toISOString(),
        telegram_chat_id: String(chatId),
        telegram_active: true,
      })
      .eq("id", primaryCard.id);

    if (verifyError) {
      console.error("Telegram verification update failed:", verifyError);

      await reply(
        "❌ Could not link this Telegram chat to your card. Please try again."
      );

      return NextResponse.json({ ok: true });
    }

    const verifiedCard =
      (await getCardByOrderId(primaryCard.order_id)) || primaryCard;

    const assignedCard = await ensureCardInventory(verifiedCard);
    const inventory = getInventory(assignedCard);

    await reply("✅ Access Verified");

    if (!inventory) {
      await reply(
        "Card details are not available. Please contact support.",
        dashboardKeyboard
      );

      return NextResponse.json({ ok: true });
    }

    const holderName = await getHolderName(assignedCard);
    const cardDetailsMessage = formatTelegramCardDetails(
      assignedCard,
      holderName,
      inventory
    );

    await reply(cardDetailsMessage, mainKeyboard);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed:", error);

    return NextResponse.json(
      { error: "Telegram webhook failed." },
      { status: 500 }
    );
  }
}