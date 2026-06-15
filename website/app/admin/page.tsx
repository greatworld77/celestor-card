"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

import { useAccount, useChainId, useSwitchChain, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { CELESTOR_CARD_ABI } from "../../lib/contracts/CelestorCardABI";
import { env } from "../../lib/env";
import AppNotice, { type AppNoticeData } from "../../components/AppNotice";

export default function AdminPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [shippingOrders, setShippingOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
const [statusFilter, setStatusFilter] = useState("all");
  const [allowed, setAllowed] = useState(false);
const [loading, setLoading] = useState(true);
const [couponInput, setCouponInput] = useState("");
const [discountInput, setDiscountInput] = useState("");
const [couponActive, setCouponActive] = useState(true);
const { isConnected } = useAccount();
const chainId = useChainId();
const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
const { writeContractAsync } = useWriteContract();

const isWrongNetwork = isConnected && chainId !== sepolia.id;
const [coupons, setCoupons] = useState<any[]>([]);
const [notice, setNotice] = useState<AppNoticeData | null>(null);

const showNotice = (
  message: string,
  type: "success" | "error" | "info" = "info"
) => {
  setNotice({ type, message });
};

const contractAddress = env.CELESTOR_CARD_CONTRACT as `0x${string}`;
const adminEmail = env.ADMIN_EMAIL;

  const updateOrderStatus = async (id: string, status: string) => {
  const { error } = await supabase
    .from("cards")
    .update({ status })
    .eq("id", id);

  if (error) {
    showNotice(error.message, "error");
    return;
  }

  setOrders((current) =>
    current.map((order) =>
      order.id === id ? { ...order, status } : order
    )
  );
};
const updateTracking = async (id: string, tracking: string) => {
  const normalizedTracking = tracking.trim();

  const { error } = await supabase
    .from("cards")
    .update({ tracking_number: normalizedTracking })
    .eq("id", id);

  if (error) {
    showNotice(error.message, "error");
    return;
  }

  const order = orders.find((o) => o.id === id);

  if (order && normalizedTracking) {
    const { data: shipping } = await supabase
      .from("shipping_addresses")
      .select("email")
      .eq("card_order_id", order.order_id)
      .single();

    if (shipping?.email) {
      const { data: sessionData } = await supabase.auth.getSession();

const accessToken = sessionData.session?.access_token;

const trackingResponse = await fetch("/api/send-tracking-email", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    email: shipping.email,
    orderId: order.order_id,
    tracking: normalizedTracking,
  }),
});

if (!trackingResponse.ok) {
  console.error("Tracking email failed:", await trackingResponse.text());
}
    }
  }

  setOrders((current) =>
    current.map((order) =>
      order.id === id
        ? { ...order, tracking_number: normalizedTracking }
        : order
    )
  );

  showNotice("Tracking updated successfully.", "success");
};

const saveCoupon = async () => {
  if (!couponInput || !discountInput) {
    showNotice("Enter coupon code and discount.", "error");
    return;
  }

  const discountBps = Math.floor(Number(discountInput) * 100);

  if (discountBps < 0 || discountBps > 10000) {
    showNotice("Discount must be between 0 and 100.", "error");
    return;
  }

  const networkReady = await ensureSepoliaNetwork();

if (!networkReady) {
  return;
}

  await writeContractAsync({
    address: contractAddress,
    abi: CELESTOR_CARD_ABI,
    functionName: "setCoupon",
    args: [couponInput, BigInt(discountBps), couponActive],
  });

  await supabase.from("coupons").upsert({
  code: couponInput,
  discount_percent: Number(discountInput),
  active: couponActive,
});
setCoupons((prev) => [
  {
    id: Date.now(),
    code: couponInput,
    discount_percent: Number(discountInput),
    active: couponActive,
  },
  ...prev,
]);

  showNotice("Coupon updated successfully.", "success");
};

const ensureSepoliaNetwork = async () => {
  if (!isConnected) {
    showNotice("Please connect your admin wallet first.", "error");
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

  useEffect(() => {
    const loadOrders = async () => {
      const { data: userData } = await supabase.auth.getUser();

if (userData.user?.email !== adminEmail) {
  setAllowed(false);
  setLoading(false);
  return;
}

setAllowed(true);
      const { data } = await supabase
        .from("cards")
        .select("*")
        .order("created_at", { ascending: false });

      setOrders(data || []);
      const { data: shippingData } = await supabase
  .from("shipping_addresses")
  .select("*")
  .order("created_at", { ascending: false });

setShippingOrders(shippingData || []);
const { data: usersData } = await supabase
  .from("profiles")
  .select("*")
  .order("created_at", { ascending: false });

setUsers(usersData || []);

setUsers(usersData || []);
const loadCoupons = async () => {
  const { data } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  setCoupons(data || []);
};

loadCoupons();

      setLoading(false);
    };

    loadOrders();
  }, []);
const filteredOrders = orders.filter((order) => {
  const matchesSearch =
    !search ||
    order.order_id?.toLowerCase().includes(search.toLowerCase()) ||
    order.wallet_address?.toLowerCase().includes(search.toLowerCase()) ||
    order.telegram_code?.toLowerCase().includes(search.toLowerCase());

  const matchesStatus =
    statusFilter === "all" ||
    order.status === statusFilter;

  return matchesSearch && matchesStatus;
});

  if (loading) {
  return <main className="min-h-screen bg-black p-6 text-white">Loading...</main>;
}

if (!allowed) {
  return (
    <main className="min-h-screen bg-black p-6 text-white">
      Access denied. Admin only.
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
        <p className="font-bold text-red-100">Wrong admin wallet network</p>
        <p className="mt-1">
          Coupon contract updates require Sepolia testnet.
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

      <div className="mx-auto max-w-7xl">
        <a href="/" className="text-sm text-yellow-300">
          ← Back to Home
        </a>

        <h1 className="mt-6 text-5xl font-black">Admin Panel</h1>
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
  <h2 className="mb-4 text-2xl font-black">Coupon Manager</h2>

  <div className="grid gap-4 md:grid-cols-4">
    <input
      type="text"
      placeholder="Coupon Code e.g. SAVE50"
      value={couponInput}
      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
      className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white"
    />

    <input
      type="number"
      placeholder="Discount % e.g. 50"
      value={discountInput}
      onChange={(e) => setDiscountInput(e.target.value)}
      className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white"
    />

    <select
      value={couponActive ? "active" : "inactive"}
      onChange={(e) => setCouponActive(e.target.value === "active")}
      className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white"
    >
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>

    <button
      onClick={saveCoupon}
      className="rounded-xl bg-yellow-400 px-4 py-3 font-black text-black"
    >
      Save Coupon
    </button>
  </div>
</div>

        <div className="mt-8 grid gap-4 md:grid-cols-7">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-zinc-400">Total Orders</p>
            <p className="mt-2 text-4xl font-black">{orders.length}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-zinc-400">Virtual</p>
            <p className="mt-2 text-4xl font-black">
              {orders.filter((o) => o.card_type === "virtual").length}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-zinc-400">Physical</p>
            <p className="mt-2 text-4xl font-black">
              {orders.filter((o) => o.card_type === "physical").length}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
  <p className="text-zinc-400">Shipping Orders</p>
  <p className="mt-2 text-4xl font-black">
    {shippingOrders.length}
  </p>
</div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-zinc-400">Free</p>
            <p className="mt-2 text-4xl font-black">
              {orders.filter((o) => o.card_type === "free").length}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
  <p className="text-zinc-400">Telegram Verified</p>
  <p className="mt-2 text-4xl font-black">
    {orders.filter((o) => o.telegram_verified).length}
  </p>
</div>

<div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
  <p className="text-zinc-400">Coupons Used</p>
  <p className="mt-2 text-4xl font-black">
    {orders.filter((o) => o.coupon_code).length}
  </p>
</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
  <p className="text-zinc-400">Shipped</p>
  <p className="mt-2 text-4xl font-black">
    {
      orders.filter(
        (o) => o.card_type === "physical" && o.status === "shipped"
      ).length
    }
  </p>
</div>
<div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
  <p className="text-zinc-400">Users</p>
  <p className="mt-2 text-4xl font-black">
    {users.length}
  </p>
</div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="mb-6 text-2xl font-black">All Orders</h2>

          <div className="mb-6 flex flex-col gap-3 md:flex-row">
  <input
    type="text"
    placeholder="Search Order ID, Wallet, Telegram..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="flex-1 rounded-xl border border-white/10 bg-black px-4 py-3 text-white"
  />

  <select
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
    className="rounded-xl border border-white/10 bg-black px-4 py-3 text-white"
  >
    <option value="all">All Statuses</option>
    <option value="pending">Pending</option>
    <option value="approved">Approved</option>
    <option value="processing">Processing</option>
    <option value="shipped">Shipped</option>
    <option value="completed">Completed</option>
    <option value="cancelled">Cancelled</option>
  </select>
</div>

          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-white/10 bg-black/40 p-5"
              >
                <p className="font-bold text-yellow-300">{order.order_id}</p>
                <p className="capitalize text-zinc-400">
                  Type: {order.card_type}
                </p>
                <p className="capitalize text-zinc-500">
                  Status: {order.status}
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
  <select
    value={order.status}
    onChange={(e) => updateOrderStatus(order.id, e.target.value)}
    className="rounded-xl border border-white/10 bg-black px-4 py-2 text-white"
  >
    <option value="pending">Pending</option>
    <option value="approved">Approved</option>
    <option value="processing">Processing</option>
    <option value="shipped">Shipped</option>
    <option value="completed">Completed</option>
    <option value="cancelled">Cancelled</option>
  </select>

  <input
    type="text"
    placeholder="Tracking Number"
    value={order.tracking_number || ""}
    onChange={(e) =>
      setOrders((current) =>
        current.map((o) =>
          o.id === order.id
            ? { ...o, tracking_number: e.target.value }
            : o
        )
      )
    }
    onBlur={(e) => updateTracking(order.id, e.target.value)}
    className="rounded-xl border border-white/10 bg-black px-4 py-2 text-white"
  />
</div>
                <p className="break-all text-sm text-zinc-500">
                  Wallet: {order.wallet_address}
                </p>
                <p className="font-mono text-sm text-cyan-400">
                  Telegram: {order.telegram_code}
                </p>
                <p className="text-sm text-green-400">
  Tracking: {order.tracking_number || "Not Assigned"}
</p>
               
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
  <h2 className="mb-6 text-2xl font-black">
    Physical Shipping Orders
  </h2>

  {shippingOrders.length === 0 ? (
    <p className="text-zinc-500">No shipping orders found.</p>
  ) : (
    <div className="space-y-4">
      {shippingOrders.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-white/10 bg-black/40 p-5"
        >
          <p className="font-bold text-yellow-300">
            {item.card_order_id}
          </p>

          <p>Name: {item.full_name}</p>

          <p>Email: {item.email}</p>

          <p>
            Address: {item.shipping_address}
          </p>

          <p>
            {item.city}, {item.country}
          </p>
        </div>
      ))}
    </div>
  )}
</div>
<div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
  <h2 className="mb-6 text-2xl font-black">
    Registered Users
  </h2>

  {users.length === 0 ? (
    <p className="text-zinc-500">
      No users found.
    </p>
  ) : (
    <div className="space-y-4">
      {users.map((user) => (
        <div
          key={user.id}
          className="rounded-2xl border border-white/10 bg-black/40 p-5"
        >
          <p className="font-bold text-yellow-300">
            {user.full_name || "No Name"}
          </p>

          <p className="text-zinc-400">
            {user.email || "No Email"}
          </p>

          <p className="break-all text-zinc-500">
            Wallet: {user.wallet_address || "Not Connected"}
          </p>
        </div>
      ))}
    </div>
  )}
</div>
      </div>
    </main>
  );
}