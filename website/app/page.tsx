"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useWriteContract, usePublicClient } from "wagmi";
import { parseEther } from "viem";
import { CELESTOR_CARD_ABI } from "../lib/contracts/CelestorCardABI";

const processSteps = [
  {
    title: "Create your Celestor account",
    description:
      "Sign up with your email address, verify your email, then log in before starting a card order.",
  },
  {
    title: "Connect your wallet",
    description:
      "Use the Connect Wallet button to connect the same Sepolia wallet that will mint and own your card NFT.",
  },
  {
    title: "Choose and mint a card",
    description:
      "Select Virtual, Physical, or Free NFT Card. Paid cards require a Sepolia testnet transaction before the order is created.",
  },
  {
    title: "Check email and Telegram",
    description:
      "After a successful mint, Celestor emails your order ID and Telegram access code so you can verify your card in the bot.",
  },
];

const faqs = [
  {
    question: "How do I purchase a Celestor Card?",
    answer:
      "Create an account, connect your Sepolia wallet, choose a card type, and confirm the wallet transaction. Once the transaction is confirmed, your order is saved and your order ID is sent by email.",
  },
  {
    question: "How do I get Telegram access?",
    answer:
      "After your order is created, you receive a Telegram access code by email. Open the Celestor Telegram bot and send that code to verify your card access.",
  },
  {
    question: "How does the Celestor Card work?",
    answer:
      "Each card purchase mints an NFT to your connected wallet. The NFT token ID links your on-chain card ownership with your Celestor dashboard, order status, and Telegram verification.",
  },
  {
    question: "Can I reload or withdraw from my card?",
    answer:
      "Paid card holders can manage reload and withdrawal actions from the dashboard when those testnet functions are enabled. Free NFT cards are for access and do not include the same vault controls.",
  },
  {
    question: "What is the difference between Virtual, Physical, and Free cards?",
    answer:
      "The Virtual Card is a digital testnet card, the Physical Card includes shipping details for fulfillment tracking, and the Free NFT Card is a limited free mint with one claim per wallet.",
  },
  {
    question: "Which network should I use?",
    answer:
      "Celestor is currently built for Sepolia testnet. Make sure your wallet is connected to Sepolia and has enough testnet ETH before purchasing a paid card.",
  },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<"virtual" | "physical" | "free" | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
const [authEmail, setAuthEmail] = useState("");
const [authPassword, setAuthPassword] = useState("");
const [authMessage, setAuthMessage] = useState("");
const [userEmail, setUserEmail] = useState<string | null>(null);
const [fullName, setFullName] = useState("");
const [userName, setUserName] = useState<string | null>(null);
const [orderFullName, setOrderFullName] = useState("");
const [isCreatingOrder, setIsCreatingOrder] = useState(false);

const [totalCards, setTotalCards] = useState(0);
const [virtualCards, setVirtualCards] = useState(0);
const [physicalCards, setPhysicalCards] = useState(0);
const [orders, setOrders] = useState<any[]>([]);

const [shippingAddress, setShippingAddress] = useState("");
const [shippingCity, setShippingCity] = useState("");
const [shippingCountry, setShippingCountry] = useState("");
const [couponCode, setCouponCode] = useState("");

const { address, isConnected } = useAccount();
const { writeContractAsync } = useWriteContract();
const publicClient = usePublicClient();

const contractAddress =
  process.env.NEXT_PUBLIC_CELESTOR_CARD_CONTRACT as `0x${string}`;
useEffect(() => {
  const loadUser = async () => {
    const { data } = await supabase.auth.getUser();

    if (data.user) {
      setUserEmail(data.user.email ?? null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .single();

      setUserName(profile?.full_name ?? null);
setOrderFullName(profile?.full_name ?? "");
    }
  };

  loadUser();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (_event, session) => {
    setUserEmail(session?.user?.email ?? null);

    if (session?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .single();

      setUserName(profile?.full_name ?? null);
setOrderFullName(profile?.full_name ?? "");
    } else {
      setUserName(null);
      setOrderFullName("");
    }
  });

  return () => subscription.unsubscribe();
}, []);
useEffect(() => {
  const saveWallet = async () => {
    if (!address || !userEmail) return;

    const { data } = await supabase.auth.getUser();

    if (data.user) {
      await supabase
        .from("profiles")
        .update({
          wallet_address: address,
        })
        .eq("id", data.user.id);
    }
  };

  saveWallet();
}, [address, userEmail]);
useEffect(() => {
  const loadCardCounts = async () => {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) return;

    const { data } = await supabase
  .from("cards")
  .select("card_type, order_id, status, created_at")
  .eq("user_id", userData.user.id);

    if (!data) return;
    setOrders(data.slice(0, 3));

    setTotalCards(data.length);
    setVirtualCards(
      data.filter((c) => c.card_type === "virtual").length
    );
    setPhysicalCards(
      data.filter((c) => c.card_type === "physical").length
    );
  };

  if (userEmail) {
    loadCardCounts();
  }
}, [userEmail, selectedCard]);
const createOrder = async () => {
  if (!selectedCard || isCreatingOrder) return;

  if (!userEmail) {
    alert("Please login first.");
    setAuthOpen(true);
    return;
  }

  if (!address) {
    alert("Please connect your wallet first.");
    return;
  }

  if (selectedCard === "physical") {
    if (!orderFullName.trim()) {
      alert("Please enter the recipient full name.");
      return;
    }

    if (
      !shippingAddress.trim() ||
      !shippingCity.trim() ||
      !shippingCountry.trim()
    ) {
      alert("Please complete the shipping address, city, and country.");
      return;
    }
  }

  setIsCreatingOrder(true);

  try {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      alert("User not found.");
      return;
    }

    if (selectedCard === "free") {
      const { data: existingFreeMint } = await supabase
        .from("cards")
        .select("id")
        .eq("wallet_address", address)
        .eq("card_type", "free")
        .limit(1);

      if (existingFreeMint && existingFreeMint.length > 0) {
        alert("This wallet has already claimed the Free NFT Card.");
        return;
      }
    }

    if (selectedCard === "virtual") {
      const { count } = await supabase
        .from("cards")
        .select("*", { count: "exact", head: true })
        .eq("wallet_address", address)
        .eq("card_type", "virtual");

      if ((count ?? 0) >= 5) {
        alert("Maximum 5 Virtual Cards per wallet.");
        return;
      }
    }

    if (selectedCard === "physical") {
      const { count } = await supabase
        .from("cards")
        .select("*", { count: "exact", head: true })
        .eq("wallet_address", address)
        .eq("card_type", "physical");

      if ((count ?? 0) >= 10) {
        alert("Maximum 10 Physical Cards per wallet.");
        return;
      }
    }

    const normalizedCouponCode = couponCode.trim();
    let txHash = "";

    if (selectedCard === "free") {
      txHash = await writeContractAsync({
        address: contractAddress,
        abi: CELESTOR_CARD_ABI,
        functionName: "mintFree",
      });
    }

    if (selectedCard === "virtual") {
      txHash = await writeContractAsync({
        address: contractAddress,
        abi: CELESTOR_CARD_ABI,
        functionName: "mintVirtual",
        args: [normalizedCouponCode],
        value: parseEther("0.001"),
      });
    }

    if (selectedCard === "physical") {
      txHash = await writeContractAsync({
        address: contractAddress,
        abi: CELESTOR_CARD_ABI,
        functionName: "mintPhysical",
        args: [normalizedCouponCode],
        value: parseEther("0.01"),
      });
    }

    let tokenId = "";

    if (txHash && publicClient) {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      const transferLog = receipt.logs.find(
        (log) =>
          log.address.toLowerCase() === contractAddress.toLowerCase() &&
          log.topics[0] ===
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
      );

      if (transferLog?.topics?.[3]) {
        tokenId = BigInt(transferLog.topics[3]).toString();
      }
    }

    const orderId = `CRC-${selectedCard.toUpperCase()}-${Date.now()}`;

    const telegramCode =
      "TG-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    const { error } = await supabase.from("cards").insert({
      user_id: userData.user.id,
      wallet_address: address,
      card_type: selectedCard,
      order_id: orderId,
      telegram_code: telegramCode,
      tx_hash: txHash,
      token_id: tokenId,
      coupon_code: normalizedCouponCode,
      status: "pending",
    });

    if (error) {
      throw new Error(error.message);
    }

    if (selectedCard === "physical") {
      const { error: shippingError } = await supabase
        .from("shipping_addresses")
        .insert({
          user_id: userData.user.id,
          card_order_id: orderId,
          full_name: orderFullName.trim() || userName || "Celestor User",
          email: userEmail,
          shipping_address: shippingAddress.trim(),
          city: shippingCity.trim(),
          country: shippingCountry.trim(),
        });

      if (shippingError) {
        throw new Error(shippingError.message);
      }
    }

    const { data: sessionData } = await supabase.auth.getSession();

const accessToken = sessionData.session?.access_token;

const emailResponse = await fetch("/api/send-order-email", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    email: userEmail,
    name: orderFullName.trim() || userName || "Celestor User",
    orderId,
    telegramCode,
    cardType: selectedCard,
  }),
});

if (!emailResponse.ok) {
  console.error("Order email failed:", await emailResponse.text());
}

    alert(
      `Order created successfully!\n\nOrder ID: ${orderId}\nTelegram Code: ${telegramCode}`
    );

    setSelectedCard(null);
    setShippingAddress("");
    setShippingCity("");
    setShippingCountry("");
    setCouponCode("");
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong while creating your order.";

    alert(message);
  } finally {
    setIsCreatingOrder(false);
  }
};

return (



    <main className="min-h-screen overflow-hidden text-white">
      <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-black/50 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <a href="#home" className="text-2xl font-black tracking-[0.25em]">
            CELESTOR
          </a>

          

          

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-3xl"
          >
            ☰
          </button>
        </div>

        {menuOpen && (
          <div className="absolute right-4 top-20 w-72 max-h-[80vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-4 backdrop-blur-xl shadow-2xl">
           <a className="block rounded-xl px-3 py-3 hover:bg-white/10" href="#home">
  Home
</a>

<a
  className="block rounded-xl px-3 py-3 hover:bg-white/10"
  href="/dashboard"
>
  Dashboard
</a>

<div className="my-4 border-t border-white/10" />

<p className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">
  Socials
</p>

<a
  className="block rounded-xl px-6 py-3 text-zinc-300 hover:bg-white/10"
  href="#"
>
  ├ X
</a>

<a
  className="block rounded-xl px-6 py-3 text-zinc-300 hover:bg-white/10"
  href="#"
>
  ├ Telegram
</a>

<a
  className="block rounded-xl px-6 py-3 text-zinc-300 hover:bg-white/10"
  href="#"
>
  └ Sepolia Etherscan
</a>

{userEmail ? (
  <div className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
    <div>
      <p className="text-sm text-zinc-400">Welcome</p>
      <p className="break-all text-sm font-bold text-yellow-300">
        {userName || userEmail}
      </p>
    </div>

    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-lg bg-black/40 p-2">
        <p className="text-zinc-500">Wallet</p>
        <p className="font-bold text-zinc-300">
  {isConnected && address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "Not Connected"}
</p>
      </div>
      <div className="rounded-xl bg-black/40 p-3 text-xs">
  <p className="mb-2 font-bold text-zinc-400">Recent Orders</p>

  {orders.length === 0 ? (
    <p className="text-zinc-500">No orders yet</p>
  ) : (
    <div className="space-y-2">
      {orders.map((order) => (
        <div
          key={order.order_id}
          className="rounded-lg bg-white/5 p-2"
        >
          <p className="font-bold text-yellow-300">
            {order.order_id}
          </p>

          <p className="text-zinc-400">
            {order.card_type} · {order.status}
          </p>
        </div>
      ))}
    </div>
  )}
</div>

      <div className="rounded-lg bg-black/40 p-2">
        <p className="text-zinc-500">Cards</p>
        <p className="font-bold text-zinc-300">{totalCards} Owned</p>
      </div>

      <div className="rounded-lg bg-black/40 p-2">
        <p className="text-zinc-500">Virtual</p>
        <p className="font-bold text-zinc-300">{virtualCards}</p>
      </div>

      <div className="rounded-lg bg-black/40 p-2">
        <p className="text-zinc-500">Physical</p>
        <p className="font-bold text-zinc-300">{physicalCards}</p>
      </div>
    </div>

    <div className="w-full">
  <ConnectButton />
</div>

    <button
      onClick={async () => {
        await supabase.auth.signOut();
        setUserEmail(null);
        setUserName(null);
        setMenuOpen(false);
      }}
      className="w-full rounded-full border border-white/20 py-2 text-sm font-bold"
    >
      Logout
    </button>
  </div>
) : (
  <button
    onClick={() => {
      setAuthMode("signup");
      setAuthOpen(true);
      setMenuOpen(false);
    }}
    className="mt-5 w-full rounded-full bg-white py-3 font-bold text-black"
  >
    Sign Up / Login
  </button>
)}
          </div>
        )}
      </nav>

      <section id="home" className="relative px-6 pt-36 pb-24">
        <div className="absolute left-1/2 top-28 h-72 w-72 -translate-x-1/2 rounded-full bg-yellow-500/20 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-16 md:grid-cols-2">
          <div className="relative z-10">
            <div className="mb-6 inline-flex rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.25em] text-yellow-300">
              Sepolia Testnet Launch
            </div>

            <h1 className="text-5xl font-black leading-[1.02] tracking-tight md:text-7xl">
              A premium crypto card experience.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">
              Celestor brings a luxury fintech-style card interface to Web3.
              Purchase virtual or physical card access, connect your wallet,
              and unlock your testnet dashboard through Telegram.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a
                href="#purchase"
                className="rounded-full bg-white px-8 py-4 text-center font-black text-black shadow-2xl shadow-white/10"
              >
                Purchase Card
              </a>

              <a
                href="#about"
                className="rounded-full border border-white/15 bg-white/5 px-8 py-4 text-center font-black backdrop-blur-xl"
              >
                Learn More
              </a>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
              <div className="glass rounded-2xl p-4">
                <p className="text-2xl font-black">700</p>
                <p className="text-xs text-zinc-400">Virtual</p>
              </div>
              <div className="glass rounded-2xl p-4">
                <p className="text-2xl font-black">1200</p>
                <p className="text-xs text-zinc-400">Physical</p>
              </div>
              <div className="glass rounded-2xl p-4">
                <p className="text-2xl font-black">100</p>
                <p className="text-xs text-zinc-400">Free Mint</p>
              </div>
            </div>
          </div>

          <div className="relative min-h-[460px]">
            <div className="float-black absolute left-0 top-10 w-full max-w-[430px] rounded-[2.2rem] border border-white/15 bg-gradient-to-br from-zinc-800 via-black to-zinc-950 p-8 shadow-2xl shadow-black">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">
                    Virtual
                  </p>
                  <h2 className="mt-1 text-2xl font-black">Celestor Black</h2>
                </div>
                <div className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold">
                  CRC
                </div>
              </div>

              <div className="mt-16 text-2xl font-light tracking-[0.38em]">
                CRC-V-0001
              </div>

              <div className="mt-12 grid grid-cols-2 gap-6 text-xs">
                <div>
                  <p className="text-zinc-500">CARD HOLDER</p>
                  <p className="mt-1 text-sm font-bold tracking-widest">
                    YOUR NAME
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">NETWORK</p>
                  <p className="mt-1 text-sm font-bold">SEPOLIA</p>
                </div>
              </div>
            </div>

            <div className="float-gold absolute bottom-8 right-0 w-[310px] rounded-[2rem] border border-yellow-300/40 bg-gradient-to-br from-yellow-300 via-yellow-600 to-yellow-950 p-7 text-black shadow-2xl shadow-yellow-900/20">
              <div className="flex justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-black/60">
                    Physical
                  </p>
                  <h2 className="mt-1 text-xl font-black">Celestor Gold</h2>
                </div>
                <p className="font-black">CRC</p>
              </div>

              <div className="mt-12 font-semibold tracking-[0.28em]">
                CRC-P-0001
              </div>

              <p className="mt-8 text-xs font-bold text-black/70">
                Delivery pending official announcement
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="px-6 py-24">
        <div className="mx-auto max-w-6xl rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl md:p-14">
          <h2 className="text-4xl font-black">Built for testnet card access</h2>
          <p className="mt-6 max-w-4xl text-lg leading-8 text-zinc-400">
            Celestor Card is planned as a Sepolia testnet crypto-card platform.
            Users sign up with email, verify their account, connect a wallet,
            purchase card access, and receive an order ID plus Telegram access
            code by email.
          </p>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-yellow-300">
              User Flow
            </p>
            <h2 className="mt-3 text-4xl font-black">How Celestor works</h2>
            <p className="mt-4 text-zinc-400">
              The whole process connects your email account, wallet, card NFT,
              dashboard order, and Telegram verification code.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {processSteps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
              >
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-yellow-400 font-black text-black">
                  {index + 1}
                </div>
                <h3 className="text-lg font-black">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="purchase" className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.3em] text-yellow-300">
                Card Types
              </p>
              <h2 className="mt-3 text-4xl font-black">Choose your Celestor Card</h2>
            </div>
            <p className="max-w-xl text-zinc-400">
              Mint your card NFT on Sepolia, receive your order details by email,
              then manage your card from the Celestor dashboard.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="glass rounded-[2rem] p-8">
              <h3 className="text-2xl font-black">Virtual Credit Card</h3>
              <p className="mt-2 text-zinc-400">Celestor Black · 700 supply</p>
              <p className="mt-8 text-5xl font-black">$5</p>
              <p className="mt-3 text-sm text-yellow-300">$5 bonus for first 1000 users</p>
              <button
  onClick={() => setSelectedCard("virtual")}
  className="mt-8 w-full rounded-full bg-white py-4 font-black text-black"
>
  Buy Virtual
</button>
            </div>

            <div className="rounded-[2rem] border border-yellow-400/40 bg-yellow-400 p-8 text-black shadow-2xl shadow-yellow-900/20">
              <h3 className="text-2xl font-black">Physical Credit Card</h3>
              <p className="mt-2 text-black/70">Celestor Gold · 1200 supply</p>
              <p className="mt-8 text-5xl font-black">$60</p>
              <p className="mt-3 text-sm font-bold">$15 purchase bonus</p>
              <button
  onClick={() => setSelectedCard("physical")}
  className="mt-8 w-full rounded-full bg-black py-4 font-black text-white"
>
  Buy Physical
</button>
            </div>

            <div className="glass rounded-[2rem] p-8">
              <h3 className="text-2xl font-black">Free NFT Card</h3>
              <p className="mt-2 text-zinc-400">100 supply · 1 per wallet</p>
              <p className="mt-8 text-5xl font-black">Free</p>
              <p className="mt-3 text-sm text-zinc-400">10% reload bonus later</p>
              <button
  onClick={() => setSelectedCard("free")}
  className="mt-8 w-full rounded-full border border-white/20 py-4 font-black"
>
  Mint Free
</button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <button disabled className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left text-zinc-500">
              Reload Card — Disabled
            </button>
            <button disabled className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left text-zinc-500">
              Withdrawal — Disabled
            </button>
          </div>
        </div>
      </section>

      <section id="social" className="px-6 py-20 text-center">
        <h2 className="text-4xl font-black">Social Media</h2>
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <a className="rounded-full border border-white/15 bg-white/5 px-8 py-4 font-bold" href="#">X</a>
          <a className="rounded-full border border-white/15 bg-white/5 px-8 py-4 font-bold" href="#">Telegram</a>
          <a className="rounded-full border border-white/15 bg-white/5 px-8 py-4 font-bold" href="#">Sepolia Etherscan</a>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-4xl font-black">FAQ</h2>

          {faqs.map((item) => (
            <div
              key={item.question}
              className="mb-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6"
            >
              <h3 className="font-black">{item.question}</h3>
              <p className="mt-3 leading-7 text-zinc-400">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 text-center text-sm text-zinc-500">
        © 2026 Celestor Card. Sepolia testnet project.
      </footer>
      {selectedCard && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6">
    <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950 p-8">

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-black">
          {selectedCard === "virtual" && "Virtual Card Purchase"}
          {selectedCard === "physical" && "Physical Card Purchase"}
          {selectedCard === "free" && "Free NFT Mint"}
        </h2>

        <button
          onClick={() => setSelectedCard(null)}
          className="text-2xl"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
  {userEmail ? (
    <div className="rounded-2xl border border-white/10 bg-black p-4 text-sm text-zinc-300">
      <p className="font-bold text-white">Ordering as</p>
      <p className="mt-1">{userName || "Celestor User"}</p>
      <p className="text-zinc-500">{userEmail}</p>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setAuthOpen(true)}
      className="w-full rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-left text-sm font-bold text-yellow-300"
    >
      Login or create an account before ordering.
    </button>
  )}

  {selectedCard === "physical" && (
          <>

          <input
  type="text"
  placeholder="Recipient Full Name"
  value={orderFullName}
  onChange={(e) => setOrderFullName(e.target.value)}
  className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"
/>

            <input
  type="text"
  placeholder="Shipping Address"
  value={shippingAddress}
  onChange={(e) => setShippingAddress(e.target.value)}
  className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"
/>

            <input
  type="text"
  placeholder="City"
  value={shippingCity}
  onChange={(e) => setShippingCity(e.target.value)}
  className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"
/>

            <input
  type="text"
  placeholder="Country"
  value={shippingCountry}
  onChange={(e) => setShippingCountry(e.target.value)}
  className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"
/>
          </>
        )}

        <input
  type="text"
  placeholder="Coupon Code (Optional)"
  value={couponCode}
  onChange={(e) => setCouponCode(e.target.value)}
  className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"
/>

        <button
  onClick={createOrder}
  disabled={isCreatingOrder}
  className="mt-4 w-full rounded-full bg-white py-4 font-black text-black disabled:cursor-not-allowed disabled:opacity-60"
>
  {isCreatingOrder ? "Processing..." : "Continue"}
</button>

      </div>
    </div>
  </div>
)}
{authOpen && (
  <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-6">
    <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-8 shadow-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-black">
          {authMode === "signup" ? "Create Account" : "Login"}
        </h2>

        <button onClick={() => setAuthOpen(false)} className="text-2xl">
          ✕
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 rounded-full bg-black p-1">
        <button
          type="button"
          onClick={() => setAuthMode("signup")}
          className={`rounded-full py-3 font-bold ${
            authMode === "signup" ? "bg-white text-black" : "text-zinc-400"
          }`}
        >
          Sign Up
        </button>

        <button
          type="button"
          onClick={() => setAuthMode("login")}
          className={`rounded-full py-3 font-bold ${
            authMode === "login" ? "bg-white text-black" : "text-zinc-400"
          }`}
        >
          Login
        </button>
      </div>

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setAuthMessage("");

          const form = e.currentTarget;
          const formData = new FormData(form);

          const email = String(formData.get("email") || "").trim();
          const password = String(formData.get("password") || "").trim();

          if (!email || !password) {
            setAuthMessage("Please enter both email and password.");
            return;
          }

          if (password.length < 6) {
            setAuthMessage("Password must be at least 6 characters.");
            return;
          }

          if (authMode === "signup") {
            const { data, error } = await supabase.auth.signUp({
              email,
              password,
            });

            if (error) {
  setAuthMessage(error.message);
} else {
  if (data.user) {
    await supabase.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName,
    });
  }

  setAuthMessage(
    "Account created. Please check your email to verify your account."
  );
}
          } else {
            const { error } = await supabase.auth.signInWithPassword({
              email,
              password,
            });

            if (error) {
              setAuthMessage(error.message);
            } else {
              setAuthMessage("Login successful.");
              setAuthOpen(false);
            }
          }
        }}
      >
        {authMode === "signup" && (
  <input
    type="text"
    placeholder="Full Name"
    value={fullName}
    onChange={(e) => setFullName(e.target.value)}
    className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"
  />
)}
        <input
          name="email"
          type="email"
          placeholder="Email Address"
          className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"
        />

        <input
          name="password"
          type="password"
          placeholder="Password"
          className="w-full rounded-xl border border-white/10 bg-black px-4 py-3"
        />

        <button
          type="submit"
          className="w-full rounded-full bg-white py-4 font-black text-black"
        >
          {authMode === "signup" ? "Create Account" : "Login"}
        </button>

        {authMessage && (
          <p className="text-center text-sm text-yellow-300">
            {authMessage}
          </p>
        )}

        {authMode === "signup" && (
          <p className="text-center text-sm text-zinc-500">
            Email verification will be required.
          </p>
        )}
      </form>
    </div>
  </div>
)}
    </main>
  );
}