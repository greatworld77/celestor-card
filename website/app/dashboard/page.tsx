"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { parseEther, formatEther } from "viem";
import { CELESTOR_VAULT_ABI } from "../../lib/contracts/CelestorVaultABI";
import { useWriteContract, usePublicClient } from "wagmi";

export default function Dashboard() {
  const router = useRouter();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [reloadAmount, setReloadAmount] = useState("");
const [withdrawAmount, setWithdrawAmount] = useState("");
const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
const [vaultBalances, setVaultBalances] = useState<Record<string, string>>({});
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

const vaultAddress =
  process.env.NEXT_PUBLIC_CELESTOR_VAULT_CONTRACT as `0x${string}`;

  const total = orders.length;
  const virtual = orders.filter((o) => o.card_type === "virtual").length;
  const physical = orders.filter((o) => o.card_type === "physical").length;
  const free = orders.filter((o) => o.card_type === "free").length;

  useEffect(() => {
  const loadDashboard = async () => {
    setIsCheckingAuth(true);

    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace("/");
        return;
      }

      setUserEmail(userData.user.email || "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, wallet_address")
        .eq("id", userData.user.id)
        .single();

      if (profile) {
        setUserName(profile.full_name || "");
        setWallet(profile.wallet_address || "");
      }

      const { data: cards } = await supabase
        .from("cards")
        .select(
          "id, order_id, card_type, status, telegram_code, tracking_number, tx_hash, token_id, created_at"
        )
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false });

      setOrders(cards || []);

      if (cards && publicClient) {
        const balances: Record<string, string> = {};

        for (const order of cards) {
          if (order.token_id && order.card_type !== "free") {
            const balance = await publicClient.readContract({
              address: vaultAddress,
              abi: CELESTOR_VAULT_ABI,
              functionName: "getCardBalance",
              args: [BigInt(order.token_id)],
            });

            balances[String(order.token_id)] = formatEther(balance as bigint);
          }
        }

        setVaultBalances(balances);
      }
    } catch (error) {
      console.error("Dashboard load failed:", error);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  loadDashboard();
}, [router, publicClient, vaultAddress]);

  const reloadCard = async () => {
  if (!selectedTokenId) {
    alert("Please select a card first.");
    return;
  }

  if (!reloadAmount || Number(reloadAmount) <= 0) {
    alert("Please enter a valid reload amount.");
    return;
  }

  try {
    await writeContractAsync({
      address: vaultAddress,
      abi: CELESTOR_VAULT_ABI,
      functionName: "depositToCard",
      args: [BigInt(selectedTokenId)],
      value: parseEther(reloadAmount),
    });

    alert("Reload successful");
    setReloadAmount("");
  } catch (error) {
    console.error(error);
    alert("Reload failed. Please try again.");
  }
};

const withdrawCard = async () => {
  if (!selectedTokenId) {
    alert("Please select a card first.");
    return;
  }

  if (!withdrawAmount || Number(withdrawAmount) <= 0) {
    alert("Please enter a valid withdrawal amount.");
    return;
  }

  try {
    await writeContractAsync({
      address: vaultAddress,
      abi: CELESTOR_VAULT_ABI,
      functionName: "withdrawFromCard",
      args: [BigInt(selectedTokenId), parseEther(withdrawAmount)],
    });

    alert("Withdrawal successful");
    setWithdrawAmount("");
  } catch (error) {
    console.error(error);
    alert("Withdrawal failed. Please try again.");
  }
};

if (isCheckingAuth) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-yellow-300">
          Celestor
        </p>
        <h1 className="mt-4 text-3xl font-black">Loading dashboard...</h1>
        <p className="mt-3 text-zinc-400">
          Checking your account session.
        </p>
      </div>
    </main>
  );
}

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <a href="/" className="text-sm text-yellow-300">
          ← Back to Home
        </a>

        <h1 className="mt-6 text-5xl font-black">Dashboard</h1>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-zinc-400">Total Cards</p>
            <p className="mt-2 text-4xl font-black">{total}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-zinc-400">Virtual</p>
            <p className="mt-2 text-4xl font-black">{virtual}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-zinc-400">Physical</p>
            <p className="mt-2 text-4xl font-black">{physical}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-zinc-400">Free NFT</p>
            <p className="mt-2 text-4xl font-black">{free}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-2xl font-black">Profile</h2>
            <p className="mt-4 font-bold text-yellow-300">{userName}</p>
            <p className="text-zinc-400">{userEmail}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-2xl font-black">Wallet</h2>
            <p className="mt-4 break-all text-zinc-400">
              {wallet || "Not connected"}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-6 text-2xl font-black">Orders</h2>

          {orders.length === 0 ? (
            <p className="text-zinc-500">No orders found</p>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
  const tokenId = order.token_id ? String(order.token_id) : "";
  const hasVaultControls = Boolean(tokenId && order.card_type !== "free");

  return (
    <div
      key={order.id}
      className="rounded-2xl border border-white/10 bg-black/40 p-5"
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-yellow-300">
            {order.order_id}
          </p>

          <div className="mt-3 grid gap-2 text-sm text-zinc-400">
            <p className="capitalize">
              Type: <span className="text-white">{order.card_type}</span>
            </p>

            <p className="capitalize">
              Status: <span className="text-white">{order.status}</span>
            </p>

            <p className="font-mono text-cyan-400">
              Telegram: {order.telegram_code}
            </p>

            {order.tracking_number && (
              <p className="text-green-400">
                Tracking: {order.tracking_number}
              </p>
            )}

            {tokenId && (
              <p className="text-cyan-400">
                NFT Token ID: #{tokenId}
              </p>
            )}

            {hasVaultControls && (
              <p className="text-green-400">
                Vault Balance: {vaultBalances[tokenId] || "0"} ETH
              </p>
            )}

            {order.tx_hash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${order.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit text-yellow-300 underline"
              >
                View Blockchain Transaction
              </a>
            )}
          </div>

          {hasVaultControls && (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 font-bold text-yellow-300">
                Vault Controls
              </p>

              <input
                type="number"
                min="0"
                step="0.0001"
                placeholder="Reload amount in ETH"
                value={selectedTokenId === tokenId ? reloadAmount : ""}
                onChange={(e) => {
                  setSelectedTokenId(tokenId);
                  setReloadAmount(e.target.value);
                }}
                className="mb-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white"
              />

              <button
                onClick={reloadCard}
                className="mb-3 w-full rounded-full bg-green-400 py-3 font-black text-black"
              >
                Reload Card
              </button>

              <input
                type="number"
                min="0"
                step="0.0001"
                placeholder="Withdraw amount in ETH"
                value={selectedTokenId === tokenId ? withdrawAmount : ""}
                onChange={(e) => {
                  setSelectedTokenId(tokenId);
                  setWithdrawAmount(e.target.value);
                }}
                className="mb-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white"
              />

              <button
                onClick={withdrawCard}
                className="w-full rounded-full border border-white/20 py-3 font-black"
              >
                Withdraw
              </button>
            </div>
          )}
        </div>

        <div className="shrink-0 text-sm text-zinc-500">
          {order.created_at
            ? new Date(order.created_at).toLocaleString()
            : ""}
        </div>
      </div>
    </div>
  );
})}
              
            </div>
          )}
        </div>
      </div>
    </main>
  );
}