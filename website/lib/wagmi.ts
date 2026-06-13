import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { mainnet, sepolia, base, baseSepolia } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Celestor Card",
  projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!,
  chains: [mainnet, sepolia, base, baseSepolia],
  wallets: [
    {
      groupName: "Recommended",
      wallets: [
        rainbowWallet,
        metaMaskWallet,
        coinbaseWallet,
        walletConnectWallet,
      ],
    },
  ],
  ssr: true,
});