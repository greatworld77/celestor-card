"use client";

import EmptyState from "../../components/EmptyState";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { parseEther, formatEther } from "viem";
import { CELESTOR_VAULT_ABI } from "../../lib/contracts/CelestorVaultABI";
import { CELESTOR_LOAD_ABI } from "../../lib/contracts/CelestorLoadABI";
import { formatFullCardDetails } from "../../lib/cardInventory";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { env } from "../../lib/env";
import AppNotice, { type AppNoticeData } from "../../components/AppNotice";

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
const [reloadingTokenId, setReloadingTokenId] = useState<string | null>(null);
const [withdrawingTokenId, setWithdrawingTokenId] = useState<string | null>(null);
const [notice, setNotice] = useState<AppNoticeData | null>(null);

type LoadBalanceData = {
  realBalance: string;
  promoBalance: string;
  displayedBalance: string;
  firstReloadBonusUsed: boolean;
  unlocked: boolean;
};
const [loadBalances, setLoadBalances] = useState<Record<string, LoadBalanceData>>({});
const [freeReloadingTokenId, setFreeReloadingTokenId] = useState<string | null>(null);

const showNotice = (
  message: string,
  type: "success" | "error" | "info" = "info"
) => {
  setNotice({ type, message });
};

  const { isConnected } = useAccount();
const chainId = useChainId();
const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
const { writeContractAsync } = useWriteContract();
const publicClient = usePublicClient();

const isWrongNetwork = isConnected && chainId !== sepolia.id;

const vaultAddress = env.CELESTOR_VAULT_CONTRACT as `0x${string}`;
const loadAddress = env.CELESTOR_LOAD_CONTRACT as `0x${string}`;

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
        
        .select(`
  id,
  order_id,
  card_type,
  status,
  telegram_code,
  tracking_number,
  tx_hash,
  token_id,
  created_at,
  card_holder_name,
  card_inventory_id,
  card_inventory:card_inventory_id (
    card_number,
    cvv,
    expiry_month,
    expiry_year,
    card_type
  )
`)

        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false });

      setOrders(cards || []);

      if (cards && publicClient) {
  const balances: Record<string, string> = {};
  const freeLoadBalances: Record<string, LoadBalanceData> = {};

  for (const order of cards) {
    if (!order.token_id) continue;

    const tokenId = String(order.token_id);

    if (order.card_type === "free") {
      const loadData = await publicClient.readContract({
        address: loadAddress,
        abi: CELESTOR_LOAD_ABI,
        functionName: "getCardLoadData",
        args: [BigInt(tokenId)],
      });

      const [
        realBalance,
        promoBalance,
        displayedBalance,
        firstReloadBonusUsed,
        unlocked,
      ] = loadData as readonly [bigint, bigint, bigint, boolean, boolean];

      freeLoadBalances[tokenId] = {
        realBalance: formatEther(realBalance),
        promoBalance: formatEther(promoBalance),
        displayedBalance: formatEther(displayedBalance),
        firstReloadBonusUsed,
        unlocked,
      };
    } else {
      const balance = await publicClient.readContract({
        address: vaultAddress,
        abi: CELESTOR_VAULT_ABI,
        functionName: "getCardBalance",
        args: [BigInt(tokenId)],
      });

      balances[tokenId] = formatEther(balance as bigint);
    }
  }

  setVaultBalances(balances);
  setLoadBalances(freeLoadBalances);
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
    showNotice("Please select a card first.", "error");
    return;
  }

  if (!reloadAmount || Number(reloadAmount) <= 0) {
    showNotice("Please enter a valid reload amount.", "error");
    return;
  }

  const networkReady = await ensureSepoliaNetwork();

  if (!networkReady) {
    return;
  }

  setReloadingTokenId(selectedTokenId);

  try {
    await writeContractAsync({
      address: vaultAddress,
      abi: CELESTOR_VAULT_ABI,
      functionName: "depositToCard",
      args: [BigInt(selectedTokenId)],
      value: parseEther(reloadAmount),
    });

    showNotice("Reload successful.", "success");
    setReloadAmount("");
  } catch (error) {
    console.error(error);
    showNotice("Reload failed. Please try again.", "error");
  } finally {
    setReloadingTokenId(null);
  }
};

const reloadFreeCard = async (tokenId: string) => {
  if (!tokenId) {
    showNotice("Missing Free Mint token ID.", "error");
    return;
  }

  if (!reloadAmount || Number(reloadAmount) <= 0) {
    showNotice("Please enter a valid reload amount.", "error");
    return;
  }

  if (Number(reloadAmount) < 0.0055) {
    showNotice("Minimum reload for Free Mint cards is 0.0055 ETH.", "error");
    return;
  }

  const networkReady = await ensureSepoliaNetwork();

  if (!networkReady) {
    return;
  }

  setFreeReloadingTokenId(tokenId);

  try {
    await writeContractAsync({
      address: loadAddress,
      abi: CELESTOR_LOAD_ABI,
      functionName: "reload",
      args: [BigInt(tokenId)],
      value: parseEther(reloadAmount),
    });

    showNotice("Free Mint virtual card reloaded and unlocked.", "success");
    setReloadAmount("");

    if (publicClient) {
      const loadData = await publicClient.readContract({
        address: loadAddress,
        abi: CELESTOR_LOAD_ABI,
        functionName: "getCardLoadData",
        args: [BigInt(tokenId)],
      });

      const [
        realBalance,
        promoBalance,
        displayedBalance,
        firstReloadBonusUsed,
        unlocked,
      ] = loadData as readonly [bigint, bigint, bigint, boolean, boolean];

      setLoadBalances((current) => ({
        ...current,
        [tokenId]: {
          realBalance: formatEther(realBalance),
          promoBalance: formatEther(promoBalance),
          displayedBalance: formatEther(displayedBalance),
          firstReloadBonusUsed,
          unlocked,
        },
      }));
    }
  } catch (error) {
    console.error(error);
    showNotice("Free Mint card reload failed. Please try again.", "error");
  } finally {
    setFreeReloadingTokenId(null);
  }
};

const withdrawCard = async () => {
  if (!selectedTokenId) {
    showNotice("Please select a card first.", "error");
    return;
  }

  if (!withdrawAmount || Number(withdrawAmount) <= 0) {
    showNotice("Please enter a valid withdrawal amount.", "error");
    return;
  }

  const networkReady = await ensureSepoliaNetwork();

  if (!networkReady) {
    return;
  }

  setWithdrawingTokenId(selectedTokenId);

  try {
    await writeContractAsync({
      address: vaultAddress,
      abi: CELESTOR_VAULT_ABI,
      functionName: "withdrawFromCard",
      args: [BigInt(selectedTokenId), parseEther(withdrawAmount)],
    });

    showNotice("Withdrawal successful.", "success");
    setWithdrawAmount("");
  } catch (error) {
    console.error(error);
    showNotice("Withdrawal failed. Please try again.", "error");
  } finally {
    setWithdrawingTokenId(null);
  }
};

const ensureSepoliaNetwork = async () => {
  if (!isConnected) {
    showNotice("Please connect your wallet first.", "error");
    return false;
  }

  if (chainId === sepolia.id) {
    return true;
  }

  try {
    await switchChainAsync({ chainId: sepolia.id });
    showNotice("Wallet switched to Sepolia.", "success");
    return true;
  } catch (error) {
    console.error(error);
    showNotice("Please switch your wallet network to Sepolia.", "error");
    return false;
  }
};

useEffect(() => {
  if (!notice) return;

  const timer = window.setTimeout(() => {
    setNotice(null);
  }, 5000);

  return () => window.clearTimeout(timer);
}, [notice]);

const paidCardOrders = orders.filter((order) => order.card_type !== "free");
const freeMintOrders = orders.filter((order) => order.card_type === "free");

const renderOrderCard = (order: (typeof orders)[number]) => {
  const tokenId = order.token_id ? String(order.token_id) : "";
  const isFreeCard = order.card_type === "free";
  const hasVaultControls = Boolean(tokenId && !isFreeCard);
  const freeLoadData = tokenId ? loadBalances[tokenId] : null;

  const inventory = Array.isArray(order.card_inventory)
  ? order.card_inventory[0]
  : order.card_inventory;

const cardDetails = inventory
  ? formatFullCardDetails(
      inventory,
      order.card_holder_name || userName || "Celestor User",
      order.card_type
    )
  : null;

  return (
    <div
      key={order.id}
      className="rounded-2xl border border-white/10 bg-black/40 p-5"
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-yellow-300">{order.order_id}</p>

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
              <p className="text-cyan-400">NFT Token ID: #{tokenId}</p>
            )}

{cardDetails && (
  <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-200">
    <p className="font-bold text-white">Card Details</p>

    <p className="mt-2">
      Card Number:{" "}
      <span className="font-mono text-yellow-300">
        {cardDetails.cardNumber}
      </span>
    </p>

    <p>
      CVV:{" "}
      <span className="font-mono text-yellow-300">
        {cardDetails.cvv}
      </span>
    </p>

    <p>
      Card Holder Name:{" "}
      <span className="text-white">{cardDetails.holderName}</span>
    </p>

    <p>
      Type: <span className="text-white">{cardDetails.type}</span>
    </p>
  </div>
)}

            {isFreeCard && tokenId && (
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
                <p className="font-bold">
                  Free Mint Virtual Card:{" "}
                  {freeLoadData?.unlocked ? "Unlocked" : "Locked"}
                </p>

                <p className="mt-2">
                  Displayed Balance: {freeLoadData?.displayedBalance || "0"} ETH
                </p>

                <p>
                  First Reload Bonus:{" "}
                  {freeLoadData?.firstReloadBonusUsed ? "Used" : "Available"}
                </p>

                <p className="mt-2 text-cyan-200/80">
                  Reload at least 0.0055 ETH to unlock this card. Your first
                  reload includes a 10% promo balance.
                </p>
              </div>
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

          {isFreeCard && tokenId && (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 font-bold text-yellow-300">
                Free Mint Reload
              </p>

              <input
                type="number"
                min="0.0055"
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
                onClick={() => reloadFreeCard(tokenId)}
                disabled={
                  freeReloadingTokenId === tokenId ||
                  isWrongNetwork ||
                  isSwitchingChain
                }
                className="w-full rounded-full bg-cyan-300 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {freeReloadingTokenId === tokenId
                  ? "Reloading..."
                  : isWrongNetwork
                  ? "Switch to Sepolia"
                  : freeLoadData?.unlocked
                  ? "Reload Free Mint Card"
                  : "Reload & Unlock Card"}
              </button>
            </div>
          )}

          {hasVaultControls && (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 font-bold text-yellow-300">Vault Controls</p>

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
                disabled={
                  reloadingTokenId === tokenId ||
                  isWrongNetwork ||
                  isSwitchingChain
                }
                className="mb-3 w-full rounded-full bg-green-400 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reloadingTokenId === tokenId
                  ? "Reloading..."
                  : isWrongNetwork
                  ? "Switch to Sepolia"
                  : "Reload Card"}
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
                disabled={
                  withdrawingTokenId === tokenId ||
                  isWrongNetwork ||
                  isSwitchingChain
                }
                className="w-full rounded-full border border-white/20 py-3 font-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {withdrawingTokenId === tokenId
                  ? "Withdrawing..."
                  : isWrongNetwork
                  ? "Switch to Sepolia"
                  : "Withdraw"}
              </button>
            </div>
          )}
        </div>

        <div className="shrink-0 text-sm text-zinc-500">
          {order.created_at ? new Date(order.created_at).toLocaleString() : ""}
        </div>
      </div>
    </div>
  );
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
    <AppNotice notice={notice} onClose={() => setNotice(null)} />

{isWrongNetwork && (
  <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-bold text-red-100">Wrong wallet network</p>
        <p className="mt-1">
          Reload and withdrawal actions require Sepolia testnet.
        </p>
      </div>

      <button
        type="button"
        onClick={ensureSepoliaNetwork}
        disabled={isSwitchingChain}
        className="rounded-full bg-red-300 px-4 py-2 font-black text-black disabled:opacity-60"
      >
        {isSwitchingChain ? "Switching..." : "Switch to Sepolia"}
      </button>
    </div>
  </div>
)}

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
    <EmptyState
      title="No cards yet"
      message="You have not created a Celestor card order yet. Choose a Virtual, Physical, or Free NFT Card from the homepage to get started."
      actionHref="/#purchase"
      actionLabel="Choose a Card"
    />
  ) : (
    <div className="space-y-8">
      {paidCardOrders.length > 0 && (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-yellow-300">
                Paid Cards
              </p>

              <h3 className="mt-2 text-2xl font-black">
                Virtual & Physical Cards
              </h3>

              <p className="mt-2 text-sm text-zinc-400">
                These cards use the main Celestor vault balance system.
              </p>
            </div>

            <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300">
              {paidCardOrders.length} card
              {paidCardOrders.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {paidCardOrders.map(renderOrderCard)}
          </div>
        </section>
      )}

      {freeMintOrders.length > 0 && (
        <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-300">
                Free Mint
              </p>

              <h3 className="mt-2 text-2xl font-black">
                Locked Virtual Cards
              </h3>

              <p className="mt-2 text-sm text-zinc-400">
                Free Mint cards unlock after the first reload and use Celestor Load.
              </p>
            </div>

            <span className="rounded-full border border-cyan-400/20 px-4 py-2 text-sm text-cyan-100">
              {freeMintOrders.length} card
              {freeMintOrders.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {freeMintOrders.map(renderOrderCard)}
          </div>
        </section>
      )}
    </div>
  )}
</div>
      </div>
    </main>
  );
}