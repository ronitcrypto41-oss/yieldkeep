"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useConnect, useAccount, useDisconnect } from "wagmi";
import type { Connector } from "wagmi";
import { UsdcLogo, ManagementIcon, PerformanceIcon } from "@/app/components/FeeIcons";

// Set NEXT_PUBLIC_USES_MOCK_ADAPTER=false in .env.local only when a real adapter is live.
const USES_MOCK_ADAPTER = process.env.NEXT_PUBLIC_USES_MOCK_ADAPTER !== "false";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

/* ---------------------------------------------------------------------------
   WALLET LOGOS (real brand artwork, from the open-source @web3icons/core
   package, MIT licence). They are embedded right here, so you do NOT need
   any files in public/wallets. Also included, ready to use if you want to add
   them to the WALLETS list below: okx, rainbow, safe.
--------------------------------------------------------------------------- */
const LOGO_SVGS: Record<string, string> = {
  "metamask": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#FF5C16\" d=\"m19.821 19.918-3.877-1.131-2.924 1.712h-2.04l-2.926-1.712-3.875 1.13L3 16.02l1.179-4.327L3 8.034 4.179 3.5l6.056 3.544h3.53L19.821 3.5 21 8.034l-1.179 3.658L21 16.02z\"/><path fill=\"#FF5C16\" d=\"m4.18 3.5 6.055 3.547-.24 2.434zm3.875 12.52 2.665 1.99-2.665.777zm2.452-3.286-.512-3.251-3.278 2.21h-.002v.001l.01 2.275 1.33-1.235zM19.82 3.5l-6.056 3.547.24 2.434zm-3.875 12.52-2.665 1.99 2.665.777zm1.339-4.326v-.002zl-3.279-2.21-.512 3.25h2.451l1.33 1.236z\"/><path fill=\"#E34807\" d=\"m8.054 18.787-3.875 1.13L3 16.022h5.054zm2.452-6.054.74 4.7-1.026-2.614-3.497-.85 1.33-1.236zm5.44 6.054 3.875 1.13L21 16.022h-5.055zm-2.452-6.054-.74 4.7 1.026-2.614 3.497-.85-1.331-1.236z\"/><path fill=\"#FF8D5D\" d=\"m3 16.02 1.179-4.328h2.535l.01 2.276 3.496.85 1.026 2.613-.527.576-2.665-1.989H3zm18 0-1.179-4.328h-2.535l-.01 2.276-3.496.85-1.026 2.613.527.576 2.665-1.989H21zm-7.235-8.976h-3.53l-.24 2.435 1.251 7.95h1.508l1.252-7.95z\"/><path fill=\"#661800\" d=\"M4.179 3.5 3 8.034l1.179 3.658h2.535l3.28-2.211zm5.594 10.177H8.625l-.626.6 2.222.54zM19.821 3.5 21 8.034l-1.179 3.658h-2.535l-3.28-2.211zm-5.593 10.177h1.15l.626.6-2.224.541zm-1.209 5.271.262-.94-.527-.575h-1.509l-.527.575.262.94\"/><path fill=\"#C0C4CD\" d=\"M13.02 18.948V20.5h-2.04v-1.552z\"/><path fill=\"#E7EBF6\" d=\"m8.055 18.785 2.927 1.714v-1.552l-.262-.94zm7.89 0L13.02 20.5v-1.552l.262-.94z\"/></svg>",
  "coinbase": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#0E5BFF\" d=\"M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0\"/><path fill=\"#fff\" fill-rule=\"evenodd\" d=\"M12 18.375a6.375 6.375 0 1 0 0-12.75 6.375 6.375 0 0 0 0 12.75m-.75-8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h1.5c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125z\" clip-rule=\"evenodd\"/></svg>",
  "trust": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#0500FF\" d=\"M3.9 5.6 12 3v18c-5.786-2.4-8.1-7-8.1-9.6z\"/><path fill=\"url(#trust__a)\" d=\"M20.1 5.6 12 3v18c5.786-2.4 8.1-7 8.1-9.6z\"/><defs><linearGradient id=\"trust__a\" x1=\"17.948\" x2=\"11.967\" y1=\"1.74\" y2=\"20.797\" gradientUnits=\"userSpaceOnUse\"><stop offset=\".02\" stop-color=\"#00F\"/><stop offset=\".08\" stop-color=\"#0094FF\"/><stop offset=\".16\" stop-color=\"#48FF91\"/><stop offset=\".42\" stop-color=\"#0094FF\"/><stop offset=\".68\" stop-color=\"#0038FF\"/><stop offset=\".9\" stop-color=\"#0500FF\"/></linearGradient></defs></svg>",
  "rabby": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"url(#rabby__a)\" d=\"M20.908 13.17c.707-1.644-2.788-6.235-6.127-8.148-2.105-1.482-4.298-1.279-4.742-.628-.975 1.428 3.228 2.638 6.038 4.05a3.25 3.25 0 0 0-1.508 1.39c-1.048-1.19-3.347-2.216-6.046-1.39-1.819.556-3.33 1.868-3.914 3.85a1.1 1.1 0 0 0-.464-.103c-.632 0-1.145.533-1.145 1.191s.513 1.191 1.145 1.191c.117 0 .483-.081.483-.081l5.855.044c-2.341 3.865-4.192 4.43-4.192 5.1s1.77.488 2.436.238c3.182-1.195 6.6-4.919 7.187-5.99 2.463.32 4.533.357 4.994-.715\"/><path fill=\"url(#rabby__b)\" fill-rule=\"evenodd\" d=\"M16.077 8.444c.13-.053.11-.253.074-.41-.082-.362-1.5-1.82-2.833-2.473-1.815-.89-3.152-.843-3.35-.433.37.788 2.085 1.529 3.875 2.302.764.33 1.541.666 2.234 1.014\" clip-rule=\"evenodd\"/><path fill=\"url(#rabby__c)\" fill-rule=\"evenodd\" d=\"M13.774 16.38c-.367-.145-.782-.28-1.254-.4.503-.937.609-2.322.134-3.199-.666-1.229-1.503-1.883-3.446-1.883-1.07 0-3.947.374-3.998 2.874q-.009.393.018.724l5.255.04a18.7 18.7 0 0 1-1.953 2.696c.698.186 1.273.342 1.802.486.501.136.96.26 1.44.388a22 22 0 0 0 2.002-1.726\" clip-rule=\"evenodd\"/><path fill=\"url(#rabby__d)\" d=\"M4.539 14.24c.215 1.898 1.252 2.642 3.371 2.863 2.12.22 3.335.072 4.954.225 1.352.128 2.559.845 3.006.598.403-.223.178-1.029-.361-1.546-.7-.67-1.667-1.135-3.369-1.3.34-.967.244-2.322-.282-3.06-.762-1.065-2.168-1.547-3.948-1.337-1.859.22-3.64 1.173-3.371 3.556\"/><defs><linearGradient id=\"rabby__a\" x1=\"8.311\" x2=\"20.827\" y1=\"11.714\" y2=\"15.125\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#8697FF\"/><stop offset=\"1\" stop-color=\"#ABB7FF\"/></linearGradient><linearGradient id=\"rabby__b\" x1=\"18.66\" x2=\"9.323\" y1=\"11.468\" y2=\"2.473\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#8697FF\"/><stop offset=\"1\" stop-color=\"#5156D8\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"rabby__c\" x1=\"14.023\" x2=\"5.231\" y1=\"16.707\" y2=\"11.849\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#465EED\"/><stop offset=\"1\" stop-color=\"#8697FF\" stop-opacity=\"0\"/></linearGradient><linearGradient id=\"rabby__d\" x1=\"9.054\" x2=\"15.173\" y1=\"11.617\" y2=\"19.089\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#8898FF\"/><stop offset=\".984\" stop-color=\"#6277F1\"/></linearGradient></defs></svg>",
  "phantom": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#AB9FF2\" d=\"M5.13 19.2c2.297 0 4.023-1.92 5.053-3.436a2.9 2.9 0 0 0-.195.994c0 .885.53 1.516 1.574 1.516 1.433 0 2.965-1.208 3.758-2.51a2 2 0 0 0-.083.524c0 .617.362 1.006 1.1 1.006 2.324 0 4.663-3.959 4.663-7.421C21 7.175 19.58 4.8 16.016 4.8 9.752 4.8 3 12.154 3 16.905 3 18.771 4.044 19.2 5.13 19.2m8.729-9.622c0-.671.39-1.141.96-1.141.557 0 .947.47.947 1.14 0 .672-.39 1.155-.947 1.155-.57 0-.96-.483-.96-1.154m2.979 0c0-.671.39-1.141.96-1.141.557 0 .947.47.947 1.14 0 .672-.39 1.155-.947 1.155-.57 0-.96-.483-.96-1.154\"/></svg>",
  "okx": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#000\" d=\"M3 3h6v6H3zm12 6H9v6H3v6h6v-6h6v6h6v-6h-6zm0 0V3h6v6z\"/></svg>",
  "rainbow": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"url(#rainbow__a)\" d=\"M3 7.05h1.35c6.959 0 12.6 5.641 12.6 12.6V21h2.7A1.35 1.35 0 0 0 21 19.65C21 10.454 13.546 3 4.35 3A1.35 1.35 0 0 0 3 4.35z\"/><path fill=\"url(#rainbow__b)\" d=\"M17.4 19.65H21A1.35 1.35 0 0 1 19.65 21H17.4z\"/><path fill=\"url(#rainbow__c)\" d=\"M4.35 3v3.6H3V4.35C3 3.604 3.604 3 4.35 3\"/><path fill=\"url(#rainbow__d)\" d=\"M3 6.6h1.35c7.207 0 13.05 5.843 13.05 13.05V21h-4.05v-1.35a9 9 0 0 0-9-9H3z\"/><path fill=\"url(#rainbow__e)\" d=\"M13.8 19.65h3.6V21h-3.6z\"/><path fill=\"url(#rainbow__f)\" d=\"M3 10.2V6.6h1.35v3.6z\"/><path fill=\"url(#rainbow__g)\" d=\"M3 12.45c0 .745.604 1.35 1.35 1.35a5.85 5.85 0 0 1 5.85 5.85c0 .745.604 1.35 1.35 1.35h2.25v-1.35a9.45 9.45 0 0 0-9.45-9.45H3z\"/><path fill=\"url(#rainbow__h)\" d=\"M10.2 19.65h3.6V21h-2.25a1.35 1.35 0 0 1-1.35-1.35\"/><path fill=\"url(#rainbow__i)\" d=\"M4.35 13.8A1.35 1.35 0 0 1 3 12.45V10.2h1.35z\"/><defs><radialGradient id=\"rainbow__a\" cx=\"0\" cy=\"0\" r=\"1\" gradientTransform=\"rotate(-90 12 7.65)scale(16.6499)\" gradientUnits=\"userSpaceOnUse\"><stop offset=\".77\" stop-color=\"#FF4000\"/><stop offset=\"1\" stop-color=\"#8754C9\"/></radialGradient><radialGradient id=\"rainbow__d\" cx=\"0\" cy=\"0\" r=\"1\" gradientTransform=\"rotate(-90 12 7.65)scale(13.05)\" gradientUnits=\"userSpaceOnUse\"><stop offset=\".724\" stop-color=\"#FFF700\"/><stop offset=\"1\" stop-color=\"#FF9901\"/></radialGradient><radialGradient id=\"rainbow__g\" cx=\"0\" cy=\"0\" r=\"1\" gradientTransform=\"rotate(-90 12 7.65)scale(9.44997)\" gradientUnits=\"userSpaceOnUse\"><stop offset=\".595\" stop-color=\"#0AF\"/><stop offset=\"1\" stop-color=\"#01DA40\"/></radialGradient><radialGradient id=\"rainbow__h\" cx=\"0\" cy=\"0\" r=\"1\" gradientTransform=\"matrix(3.82499 0 0 10.2 9.975 20.325)\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#0AF\"/><stop offset=\"1\" stop-color=\"#01DA40\"/></radialGradient><radialGradient id=\"rainbow__i\" cx=\"0\" cy=\"0\" r=\"1\" gradientTransform=\"matrix(0 -3.82499 72.5331 0 3.675 14.025)\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#0AF\"/><stop offset=\"1\" stop-color=\"#01DA40\"/></radialGradient><linearGradient id=\"rainbow__b\" x1=\"17.175\" x2=\"21\" y1=\"20.325\" y2=\"20.325\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#FF4000\"/><stop offset=\"1\" stop-color=\"#8754C9\"/></linearGradient><linearGradient id=\"rainbow__c\" x1=\"3.675\" x2=\"3.675\" y1=\"3\" y2=\"6.825\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#8754C9\"/><stop offset=\"1\" stop-color=\"#FF4000\"/></linearGradient><linearGradient id=\"rainbow__e\" x1=\"13.8\" x2=\"17.4\" y1=\"20.325\" y2=\"20.325\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#FFF700\"/><stop offset=\"1\" stop-color=\"#FF9901\"/></linearGradient><linearGradient id=\"rainbow__f\" x1=\"3.675\" x2=\"3.675\" y1=\"10.2\" y2=\"6.6\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#FFF700\"/><stop offset=\"1\" stop-color=\"#FF9901\"/></linearGradient></defs></svg>",
  "safe": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\" viewBox=\"0 0 24 24\"><path fill=\"#049F67\" d=\"M7.063 8.117c0-.583.472-1.055 1.055-1.055h7.76c.582 0 1.055-.472 1.055-1.055V4.055c0-.583-.473-1.055-1.055-1.055h-8.21c-.583 0-1.055.472-1.055 1.055V5.56c0 .583-.473 1.055-1.055 1.055H4.056A1.055 1.055 0 0 0 3 7.67v3.293c0 .583.475 1.031 1.058 1.031h1.951c.583 0 1.056-.472 1.056-1.055zm12.882 3.878h-1.952c-.583 0-1.055.472-1.055 1.055v2.833c0 .583-.472 1.055-1.055 1.055H8.118c-.583 0-1.055.472-1.055 1.055v1.952c0 .583.472 1.055 1.055 1.055h8.214a1.05 1.05 0 0 0 1.049-1.055v-1.566c0-.583.472-.996 1.055-.996h1.509c.582 0 1.055-.473 1.055-1.056v-3.29c0-.582-.473-1.042-1.055-1.042m-6.989-2.052h-1.874c-.61 0-1.107.496-1.107 1.107v1.874c0 .61.496 1.107 1.107 1.107h1.874c.61 0 1.107-.496 1.107-1.107V11.05c0-.61-.496-1.107-1.107-1.107\"/></svg>"
};

const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/* ---------------------------------------------------------------------------
   WALLETS shown in the connect list. Edit this list to add or remove wallets.
   - key: must match a key in LOGO_SVGS above
   - match: lowercase words found in the wallet's name or id (used to detect it)
--------------------------------------------------------------------------- */
type WalletDef = {
  key: string;
  name: string;
  match: string[];
  install: string;
};

const WALLETS: WalletDef[] = [
  { key: "metamask", name: "MetaMask", match: ["metamask"], install: "https://metamask.io/download/" },
  { key: "coinbase", name: "Coinbase Wallet", match: ["coinbase"], install: "https://www.coinbase.com/wallet/downloads" },
  { key: "trust", name: "Trust Wallet", match: ["trust"], install: "https://trustwallet.com/download" },
  { key: "rabby", name: "Rabby Wallet", match: ["rabby"], install: "https://rabby.io/" },
  { key: "phantom", name: "Phantom", match: ["phantom"], install: "https://phantom.com/download" },
];

/* ---------------------------------------------------------------------------
   PALETTE. Change colours here only.
   dark  = soft slate (not near-black)
   light = soft grey-white (not pure white)
--------------------------------------------------------------------------- */
const dark = {
  page: "bg-[#1F2937] text-gray-50",
  nav: "border-[#4B587A] bg-[#1F2937]/95",
  card: "bg-[#2B3648] border-[#4B587A]",
  inner: "bg-[#222C3C]",
  row: "bg-[#222C3C] border-[#4B587A] hover:border-blue-300",
  tile: "bg-[#2F3B52]",
  divider: "border-[#4B587A]",
  muted: "text-gray-200",
  subtle: "text-gray-300",
  accent: "text-blue-300",
  chip: "bg-[#3A4760] text-gray-100",
  outlineBtn: "border-gray-400 text-gray-50 hover:bg-[#3A4760]",
  iconBtn: "bg-[#3A4760] text-gray-100 hover:bg-[#4B587A]",
  assetBorder: "bg-[#2B3648] border-blue-400/60",
  notAvail: "bg-[#3A4760] text-gray-200",
  float: "bg-[#2B3648] border-gray-400 text-gray-50",
  toggle: "bg-[#2B3648] border-gray-400 text-yellow-300 hover:bg-[#3A4760]",
  stayBtn: "border-gray-400 text-gray-50 hover:bg-[#3A4760]",
  warnChip: "bg-amber-500/20 text-amber-200",
  warnText: "text-amber-300",
  green: "text-green-300",
  link: "hover:text-blue-300",
};

const light = {
  page: "bg-[#E9EDF3] text-slate-800",
  nav: "border-slate-300 bg-[#E9EDF3]/95",
  card: "bg-[#F5F7FA] border-slate-300",
  inner: "bg-[#E1E6EE]",
  row: "bg-[#E1E6EE] border-slate-300 hover:border-blue-600",
  tile: "bg-white",
  divider: "border-slate-300",
  muted: "text-slate-700",
  subtle: "text-slate-600",
  accent: "text-blue-700",
  chip: "bg-slate-200 text-slate-700",
  outlineBtn: "border-slate-400 text-slate-800 hover:bg-slate-200",
  iconBtn: "bg-slate-200 text-slate-700 hover:bg-slate-300",
  assetBorder: "bg-[#F5F7FA] border-blue-600/60",
  notAvail: "bg-slate-200 text-slate-600",
  float: "bg-[#F5F7FA] border-slate-300 text-slate-800",
  toggle: "bg-[#F5F7FA] border-slate-300 text-blue-700 hover:bg-slate-200",
  stayBtn: "border-slate-400 text-slate-700 hover:bg-slate-200",
  warnChip: "bg-amber-100 text-amber-900",
  warnText: "text-amber-800",
  green: "text-green-700",
  link: "hover:text-blue-700",
};

/* Reveal on scroll: slow fade and slide. Works in both directions:
   scrolling down, sections rise in from below; scrolling up, they
   settle in from above. They hide again when they leave the screen,
   so the effect repeats every time. */
const ScrollReveal = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const [state, setState] = useState<"below" | "visible" | "above">("below");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState("visible");
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setState("visible");
        else setState(entry.boundingClientRect.top < 0 ? "above" : "below");
      },
      { threshold: 0.08, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hidden = state === "above" ? "opacity-0 -translate-y-10" : "opacity-0 translate-y-10";

  return (
    <div
      ref={ref}
      style={{ transitionDelay: state === "visible" ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-1000 ease-out motion-reduce:transition-none ${
        state === "visible" ? "opacity-100 translate-y-0" : hidden
      }`}
    >
      {children}
    </div>
  );
};

const AaveIcon = ({ id, className }: { id: string; className?: string }) => (
  <svg className={className} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2EBAC6" />
        <stop offset="100%" stopColor="#B6509E" />
      </linearGradient>
    </defs>
    <circle cx="128" cy="128" r="128" fill={`url(#${id})`} />
    <path d="M126.5 64C119.5 64 115 68.5 111.5 77.5L73.5 175.5C70.5 183.5 72.5 188.5 77.5 188.5C81.5 188.5 84 186 86.5 179.5L95.5 155.5H157.5L166.5 179.5C169 186 171.5 188.5 175.5 188.5C180.5 188.5 182.5 183.5 179.5 175.5L141.5 77.5C138 68.5 133.5 64 126.5 64ZM102.5 134.5L126.5 74.5L150.5 134.5H102.5Z" fill="white" />
  </svg>
);

/* Wallet logo tile. Tries each source in order and falls back to the first
   letter of the wallet name only if every source fails. */
const WalletLogo = ({
  sources,
  name,
  tile,
}: {
  sources: (string | undefined)[];
  name: string;
  tile: string;
}) => {
  const list = sources.filter((s): s is string => Boolean(s));
  const [idx, setIdx] = useState(0);

  return (
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-none ${tile}`}>
      {idx >= list.length ? (
        <span className="font-bold text-blue-500">{name.charAt(0)}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={list[idx]}
          alt={`${name} logo`}
          width={32}
          height={32}
          className="w-8 h-8 object-contain"
          onError={() => setIdx(idx + 1)}
        />
      )}
    </div>
  );
};

const FAQS = [
  { q: "Who built YieldKeep?", a: "YieldKeep is built and maintained by an independent developer. It is an experimental project." },
  {
    q: "Where does the yield come from?",
    a: USES_MOCK_ADAPTER
      ? "On this deployment the yield is simulated by a mock adapter. It is not paid by Aave and says nothing about real returns."
      : "Yield comes from USDC supplied to the Aave V3 lending market. It varies and is not guaranteed.",
  },
  { q: "What is the YieldKeep fee?", a: "A 10% performance fee on yield and a 0% management fee, as set in the contract. Check the Fees card in the app before depositing." },
  { q: "Is YieldKeep custodial?", a: "No. You hold vault shares and sign every deposit and withdrawal from your own wallet." },
  { q: "Can I withdraw my treasury assets?", a: "Withdrawals depend on available liquidity in Aave V3 and can be delayed. The app supports full withdrawal only today." },
  { q: "Is it audited?", a: "No. The contracts have not been audited by a third party." },
  { q: "What assets are supported?", a: "USDC only, on Base Sepolia. Other assets may be considered later." },
  { q: "Where is it not offered?", a: "YieldKeep is not offered to US persons or in restricted jurisdictions. You are responsible for following the laws that apply to you." },
];

export default function LandingPage() {
  const router = useRouter();

  const { isConnected, address, connector: activeConnector } = useAccount();
  const { disconnect } = useDisconnect();
  const { connectAsync, connectors } = useConnect();

  const [isDark, setIsDark] = useState(true);

  // Shared theme: same storage key as the app, so Light/Dark carries over to the dashboard.
  useEffect(() => {
    try {
      if (localStorage.getItem("yieldkeep-theme") === "light") setIsDark(false);
    } catch {}
  }, []);
  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    try { localStorage.setItem("yieldkeep-theme", next ? "dark" : "light"); } catch {}
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  };
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showWalletList, setShowWalletList] = useState(false);
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const c = isDark ? dark : light;
  const isConnecting = pendingWallet !== null;

  // Smooth anchor scrolling for the nav links
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "smooth";
    return () => {
      root.style.scrollBehavior = previous;
    };
  }, []);

  // Close the wallet list with the Escape key
  useEffect(() => {
    if (!showWalletList) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowWalletList(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showWalletList]);

  /* Find the connector (installed wallet) that matches a wallet in WALLETS */
  const findConnector = (def: WalletDef): Connector | undefined => {
    const matches = connectors.filter((x) =>
      def.match.some((m) => x.name.toLowerCase().includes(m) || x.id.toLowerCase().includes(m))
    );
    return matches.find((x) => x.icon) ?? matches[0];
  };

  const walletRows = WALLETS.map((def) => {
    const conn = findConnector(def);
    return { def, conn, installed: Boolean(conn) };
  });

  // Any other wallet found in the browser (Brave, OKX, and so on)
  const otherWallets = connectors.filter(
    (x) =>
      Boolean(x.icon) &&
      !WALLETS.some((def) => def.match.some((m) => x.name.toLowerCase().includes(m) || x.id.toLowerCase().includes(m)))
  );

  /* Connect flow:
     1. User clicks Connect Wallet and picks a wallet
     2. ONLY that wallet opens its confirmation popup
     3. After confirming, a small box offers "Stay here" or "Go to Dashboard" */
  const connectWith = async (connector: Connector, label: string) => {
    if (isConnecting) return;

    setConnectError(null);
    setShowWalletList(false); // close the list straight away, nothing stays dimmed
    setPendingWallet(label);

    try {
      const provider = (await connector.getProvider()) as Eip1193 | undefined;
      if (!provider) throw new Error(`${label} was not detected in this browser.`);

      // Ask this wallet for account permission so its confirmation popup opens.
      // Some wallets do not support this call; that is fine, we just connect.
      try {
        await provider.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (permErr) {
        const code = (permErr as { code?: number })?.code;
        if (code === 4001 || code === -32002) throw permErr;
      }

      await connectAsync({ connector });
      setShowSuccessModal(true);
    } catch (err) {
      console.error("Wallet connect failed:", err);
      const code = (err as { code?: number })?.code;
      const msg = (err as { message?: string })?.message;
      if (code === 4001) {
        setConnectError(`The request was rejected in ${label}.`);
      } else if (code === -32002) {
        setConnectError(`A ${label} request is already open. Open the ${label} extension and finish or reject it.`);
      } else {
        setConnectError(`Could not connect${msg ? `: ${msg.slice(0, 120)}` : "."}`);
      }
    } finally {
      setPendingWallet(null);
    }
  };

  const handleConnectClick = () => {
    if (isConnected) {
      router.push("/dashboard");
    } else {
      setConnectError(null);
      setShowWalletList(true);
    }
  };

  const handleStayHere = () => setShowSuccessModal(false);
  const handleGoToDashboard = () => {
    setShowSuccessModal(false);
    router.push("/dashboard");
  };

  const connectingLabel = pendingWallet ? `Confirm in ${pendingWallet}...` : "Connect Wallet";

  return (
    <div className={`min-h-screen font-sans selection:bg-blue-500/30 transition-colors duration-300 ${c.page}`}>

      {/* NAVBAR */}
      <nav className={`flex justify-between items-center px-8 md:px-16 py-5 border-b sticky top-0 backdrop-blur-md z-40 transition-colors duration-300 ${c.nav}`}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push("/")}>
          <Image
            src={isDark ? "/logo-dark.png" : "/logo-light.png"}
            alt="YieldKeep"
            width={160}
            height={36}
            className="object-contain max-h-9 w-auto"
            unoptimized
          />
        </div>
        <div className={`hidden md:flex gap-8 text-sm font-medium ${c.muted}`}>
          <a href="#how-it-works" className={c.link}>How It Works</a>
          <a href="#security" className={c.link}>Security</a>
          <a href="#assets" className={c.link}>Assets</a>
          <a href="#earn" className={c.link}>Earn</a>
          <a href="#faq" className={c.link}>FAQ</a>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <button onClick={handleGoToDashboard} className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors bg-blue-600 hover:bg-blue-700 text-white">
                Go to Dashboard <span>→</span>
              </button>
              <button onClick={() => disconnect()} title="Disconnect Wallet" aria-label="Disconnect wallet" className={`px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${c.iconBtn}`}>
                ✕
              </button>
            </>
          ) : (
            <button
              onClick={handleConnectClick}
              disabled={isConnecting}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
            >
              {connectingLabel} <span>→</span>
            </button>
          )}
        </div>
      </nav>

      <main className="w-full px-8 md:px-16 lg:px-24 py-16 space-y-32">
        {/* HERO */}
        <ScrollReveal>
          <section className="grid lg:grid-cols-2 gap-16 items-center max-w-[1400px] mx-auto">
            <div>
              <p className={`${c.accent} text-xs font-bold tracking-widest mb-4 uppercase`}>DAO Treasury Infrastructure</p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-6">
                A USDC treasury vault<br />for DAOs, <span className={c.accent}>verifiable onchain.</span>
              </h1>
              <p className={`text-sm md:text-base mb-8 max-w-lg leading-relaxed ${c.muted}`}>
                A non-custodial vault that deposits USDC into Aave V3 through an adapter. Built for treasury contributors who need safety, transparency and reporting.
              </p>
              <div className="flex flex-wrap gap-4 mb-8">
                <button
                  onClick={handleConnectClick}
                  disabled={isConnecting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-60"
                >
                  {isConnected ? "Go to Dashboard →" : isConnecting ? connectingLabel : "Connect Wallet →"}
                </button>
                <a href="#security" className={`border px-6 py-2.5 rounded-lg font-semibold text-sm ${c.outlineBtn}`}>
                  Read the risks →
                </a>
              </div>
              <div className={`flex flex-wrap gap-6 text-xs font-medium ${c.subtle}`}>
                <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Non-custodial</span>
                <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Aave V3 via adapter</span>
                <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Base Sepolia</span>
              </div>
            </div>

            <div className={`border rounded-2xl p-8 shadow-xl ${c.card}`}>
              <div className={`flex justify-between items-center mb-6 border-b pb-4 ${c.divider}`}>
                <span className={`text-xs font-bold ${c.accent}`}>VAULT SUMMARY</span>
                {USES_MOCK_ADAPTER && (
                  <span className={`text-[11px] font-bold px-2 py-1 rounded ${c.warnChip}`}>MOCK ADAPTER</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div><p className={`text-xs mb-1 ${c.subtle}`}>Total vault assets</p><p className="text-xl font-bold tabular-nums">—</p></div>
                <div>
                  <p className={`text-xs mb-1 ${c.subtle}`}>Share price {USES_MOCK_ADAPTER && <span className={`${c.warnText} font-bold`}>SIMULATED</span>}</p>
                  <p className="text-xl font-bold tabular-nums">—</p>
                </div>
                <div>
                  <p className={`text-xs mb-1 ${c.subtle}`}>Rate at last read {USES_MOCK_ADAPTER && <span className={`${c.warnText} font-bold`}>SIMULATED</span>}</p>
                  <p className="text-xl font-bold tabular-nums">—</p>
                </div>
              </div>
              <ul className={`space-y-3 text-sm ${c.muted}`}>
                <li className="flex items-center gap-3"><span className={`${c.green} text-sm`}>●</span> Non-custodial vault architecture</li>
                <li className="flex items-center gap-3"><span className={`${c.accent} text-sm`}>●</span> USDC supplied to Aave V3 through an adapter</li>
                <li className="flex items-center gap-3"><span className={`${isDark ? "text-purple-300" : "text-purple-700"} text-sm`}>●</span> Live values are read from the contracts inside the app</li>
              </ul>
            </div>
          </section>
        </ScrollReveal>

        {/* STATS BAR */}
        <ScrollReveal delay={100}>
          <section className={`grid grid-cols-2 md:grid-cols-4 gap-6 border-y py-8 max-w-[1400px] mx-auto ${c.divider}`}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${c.chip}`}><UsdcLogo className="w-8 h-8" /></div>
              <div><p className={`text-[11px] uppercase tracking-wider ${c.subtle}`}>Supported asset</p><p className="font-bold text-sm">USDC</p></div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${c.chip}`}><ManagementIcon className="w-8 h-8" /></div>
              <div><p className={`text-[11px] uppercase tracking-wider ${c.subtle}`}>Management fee</p><p className="font-bold text-sm">0%</p></div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${c.chip}`}><PerformanceIcon className="w-8 h-8" /></div>
              <div><p className={`text-[11px] uppercase tracking-wider ${c.subtle}`}>Performance fee</p><p className="font-bold text-sm">10%</p></div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${c.chip}`}>
                <AaveIcon id="aaveGradientStats" className="w-8 h-8" />
              </div>
              <div><p className={`text-[11px] uppercase tracking-wider ${c.subtle}`}>Strategy</p><p className="font-bold text-sm">Aave V3</p></div>
            </div>
          </section>
        </ScrollReveal>

        {/* HOW IT WORKS */}
        <ScrollReveal>
          <section id="how-it-works" className="max-w-[1400px] mx-auto scroll-mt-28">
            <p className={`${c.accent} text-xs font-bold tracking-widest mb-2 uppercase`}>How it works</p>
            <h2 className="text-2xl md:text-3xl font-bold mb-8">Three steps, all onchain.</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { n: "1", t: "Deposit USDC", d: "Approve and deposit USDC from your treasury wallet. You receive vault shares that represent your claim." },
                { n: "2", t: "Vault supplies to Aave V3", d: "The vault passes USDC to a separate adapter contract, which supplies it to the Aave V3 USDC market." },
                { n: "3", t: "Withdraw", d: "Redeem your shares for USDC. Withdrawals depend on available Aave liquidity and can be delayed." },
              ].map((s) => (
                <div key={s.n} className={`border rounded-2xl p-6 ${c.card}`}>
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-bold mb-4 ${c.divider} ${c.muted}`}>{s.n}</div>
                  <h3 className="font-bold mb-2">{s.t}</h3>
                  <p className={`text-sm leading-relaxed ${c.muted}`}>{s.d}</p>
                </div>
              ))}
            </div>
          </section>
        </ScrollReveal>

        {/* SECURITY AND RISKS */}
        <ScrollReveal>
          <section id="security" className="max-w-[1400px] mx-auto scroll-mt-28">
            <p className={`${c.accent} text-xs font-bold tracking-widest mb-2 uppercase`}>Security and risks</p>
            <h2 className="text-2xl md:text-3xl font-bold mb-8">What is true today.</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className={`border rounded-2xl p-6 ${c.card}`}>
                <h3 className="font-bold mb-4">Facts</h3>
                <ul className={`space-y-3 text-sm ${c.muted}`}>
                  <li>Non-custodial: you hold vault shares and sign every transaction.</li>
                  <li>Adapter boundary: all Aave interaction sits in a separate adapter contract.</li>
                  <li>Contract addresses and BaseScan links are listed on the app dashboard.</li>
                  <li><strong>Not audited.</strong> No third-party audit has been performed.</li>
                </ul>
              </div>
              <div className={`border rounded-2xl p-6 ${c.card}`}>
                <h3 className="font-bold mb-4">Risks</h3>
                <ul className={`space-y-3 text-sm ${c.muted}`}>
                  <li>Smart contract and adapter bugs, including in unaudited code.</li>
                  <li>Aave V3 protocol, oracle and governance risk.</li>
                  <li>USDC issuer and depeg risk.</li>
                  <li>Withdrawal liquidity: redemptions can be delayed.</li>
                  <li>Testnet limits: simulated yield, no real funds, not representative of mainnet.</li>
                </ul>
              </div>
            </div>
          </section>
        </ScrollReveal>

        {/* ASSETS */}
        <ScrollReveal>
          <section id="assets" className="max-w-[1400px] mx-auto scroll-mt-28">
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-8">
              <div><p className={`${c.accent} text-xs font-bold tracking-widest mb-2 uppercase`}>Supported Assets</p><h2 className="text-2xl md:text-3xl font-bold">USDC only today.</h2></div>
              <p className={`text-sm max-w-xs md:text-right ${c.muted}`}>Other assets may be considered later. None are available now.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              <div className={`border p-6 rounded-2xl relative ${c.assetBorder}`}>
                <span className={`absolute top-6 right-6 text-xs font-bold px-3 py-1 rounded ${isDark ? "bg-green-500/20 text-green-300" : "bg-green-100 text-green-800"}`}>Available</span>
                <svg className="w-10 h-10 mb-4" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#2775CA"/><path d="M20.5 19.5C20.5 17.5 19.5 16.5 16.5 16C14.5 15.5 13.5 15 13.5 14C13.5 13 14 12.5 15 12.5C16.5 12.5 17 13 17 14H19C19 12 17.5 11 15.5 11V9H14.5V11C12.5 11 11 12 11 14C11 16 12 17 15 17.5C17 18 18 18.5 18 19.5C18 20.5 17.5 21.5 16 21.5C14 21.5 13.5 20.5 13.5 19.5H11.5C11.5 21.5 12.5 23 14.5 23V25H15.5V23C17.5 23 20.5 22 20.5 19.5Z" fill="white"/></svg>
                <h3 className="font-bold text-lg mb-1">USDC</h3><p className={`text-xs ${c.subtle}`}>USD Coin</p>
              </div>
              <div className={`border p-6 rounded-2xl relative opacity-80 ${c.card}`}>
                <span className={`absolute top-6 right-6 text-xs px-3 py-1 rounded ${c.notAvail}`}>Not available</span>
                <svg className="w-10 h-10 mb-4" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#627EEA"/><path d="M16.498 4V13.085L23.95 16.548L16.498 4Z" fill="white" fillOpacity="0.602"/><path d="M16.498 4L9.04599 16.548L16.498 13.085V4Z" fill="white"/><path d="M16.498 21.968V27.996L23.955 17.623L16.498 21.968Z" fill="white" fillOpacity="0.602"/><path d="M16.498 27.996V21.967L9.04599 17.623L16.498 27.996Z" fill="white"/><path d="M16.498 20.529L23.95 16.548L16.498 13.085V20.529Z" fill="white" fillOpacity="0.2"/><path d="M9.04599 16.548L16.498 20.529V13.085L9.04599 16.548Z" fill="white" fillOpacity="0.602"/></svg>
                <h3 className="font-bold text-lg mb-1">ETH</h3><p className={`text-xs ${c.subtle}`}>Ethereum</p>
              </div>
              <div className={`border p-6 rounded-2xl relative opacity-80 ${c.card}`}>
                <span className={`absolute top-6 right-6 text-xs px-3 py-1 rounded ${c.notAvail}`}>Not available</span>
                <svg className="w-10 h-10 mb-4" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="#F7931A"/><path fillRule="evenodd" clipRule="evenodd" d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z" fill="white"/></svg>
                <h3 className="font-bold text-lg mb-1">WBTC</h3><p className={`text-xs ${c.subtle}`}>Wrapped Bitcoin</p>
              </div>
            </div>
          </section>
        </ScrollReveal>

        {/* EARN SECTION */}
        <ScrollReveal>
          <section id="earn" className="max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-16 items-center scroll-mt-28">
            <div>
              <p className={`${c.accent} text-xs font-bold tracking-widest mb-3 uppercase`}>YieldKeep Vault</p>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Deposit USDC into the vault.</h2>
              <p className={`text-sm mb-8 leading-relaxed ${c.muted}`}>
                Deposited USDC is routed through an adapter into Aave V3. Rates change over time and are shown as the rate at last read, never as a forecast.
              </p>
              <div className="space-y-4 mb-8">
                {[
                  { k: "green", t: "Non-custodial architecture", d: "You hold vault shares and keep control of your deposits." },
                  { k: "blue", t: "Aave V3 via adapter", d: "The Aave integration is isolated in a separate contract." },
                  { k: "purple", t: "Onchain accounting", d: "Deposits, withdrawals and harvests are emitted as events you can verify." },
                ].map((i) => (
                  <div key={i.t} className="flex items-start gap-3">
                    <div
                      className={`mt-1 p-1 rounded-full ${
                        i.k === "green"
                          ? isDark ? "bg-green-500/20 text-green-300" : "bg-green-100 text-green-700"
                          : i.k === "blue"
                          ? isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"
                          : isDark ? "bg-purple-500/20 text-purple-300" : "bg-purple-100 text-purple-700"
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div><h4 className="font-semibold text-sm">{i.t}</h4><p className={`text-xs ${c.subtle}`}>{i.d}</p></div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`border rounded-2xl p-8 shadow-lg ${c.card}`}>
              <h3 className={`font-bold text-lg mb-6 border-b pb-4 flex items-center justify-between ${c.divider}`}>
                Integrations
                <AaveIcon id="aaveGradientBox" className="w-8 h-8" />
              </h3>
              <div className="space-y-4">
                <div className={`p-4 rounded-xl flex items-center justify-between ${c.inner}`}>
                  <div className="flex items-center gap-3">
                    <AaveIcon id="aaveGradient2" className="w-8 h-8" />
                    <div><p className="font-semibold text-sm">Aave V3</p><p className={`text-[11px] ${c.subtle}`}>Lending market</p></div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${USES_MOCK_ADAPTER ? c.warnChip : isDark ? "bg-green-500/20 text-green-300" : "bg-green-100 text-green-800"}`}>
                    {USES_MOCK_ADAPTER ? "Simulated" : "Active"}
                  </span>
                </div>
                <div className={`p-4 rounded-xl flex items-center justify-between ${c.inner}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#0052FF] flex items-center justify-center"><svg className="w-5 h-5" viewBox="0 0 1280 1280" fill="none"><path d="M640 240c-220.914 0-400 179.086-400 400s179.086 400 400 400 400-179.086 400-400-179.086-400-400-400zm0 640c-132.548 0-240-107.452-240-240s107.452-240 240-240 240 107.452 240 240-107.452 240-240 240z" fill="#fff"/></svg></div>
                    <div><p className="font-semibold text-sm">Base Sepolia</p><p className={`text-[11px] ${c.subtle}`}>Network</p></div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${isDark ? "bg-blue-500/20 text-blue-200" : "bg-blue-100 text-blue-800"}`}>Testnet</span>
                </div>
              </div>
            </div>
          </section>
        </ScrollReveal>

        {/* FAQ */}
        <ScrollReveal>
          <section id="faq" className="max-w-[1400px] mx-auto w-full pb-10 scroll-mt-28">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-3">Common questions.</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6 items-start">
              {FAQS.map((faq, i) => (
                <div key={faq.q} className={`border rounded-xl overflow-hidden ${c.card}`}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                    className="w-full text-left p-5 flex justify-between items-center"
                  >
                    <span className="font-semibold text-sm">{faq.q}</span>
                    <span className={`text-lg transition-transform duration-300 ${openFaq === i ? "rotate-45" : ""} ${c.subtle}`}>+</span>
                  </button>
                  <div className={`px-5 overflow-hidden transition-all duration-500 ease-out ${openFaq === i ? "max-h-56 pb-5" : "max-h-0"}`}>
                    <p className={`text-sm leading-relaxed ${c.muted}`}>{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </ScrollReveal>
      </main>

      {/* FOOTER */}
      <footer className={`border-t py-10 px-8 md:px-16 ${c.divider}`}>
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
              <Image src={isDark ? "/logo-dark.png" : "/logo-light.png"} alt="YieldKeep" width={140} height={30} className="object-contain max-h-8 w-auto" unoptimized />
              <span className={`text-xs md:border-l md:pl-4 ${c.subtle} ${c.divider}`}>© 2026 YieldKeep.</span>
            </div>
            <div className={`flex gap-6 text-xs font-medium ${c.muted}`}>
              <a href="#how-it-works" className={c.link}>How It Works</a>
              <a href="#security" className={c.link}>Security</a>
              <a href="#assets" className={c.link}>Assets</a>
              <a href="#faq" className={c.link}>FAQ</a>
            </div>
            <div className={`flex gap-5 ${c.muted}`}>
              <a href="https://x.com/Web3Ronit" target="_blank" rel="noreferrer" aria-label="X" className={`${c.link} transition-colors`}><svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
              <a href="https://www.linkedin.com/in/ronit-mishra-464837354/" target="_blank" rel="noreferrer" aria-label="LinkedIn" className={`${c.link} transition-colors`}><svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>
              <a href="https://github.com/ronitcrypto41-oss" target="_blank" rel="noreferrer" aria-label="GitHub" className={`${c.link} transition-colors`}><svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg></a>
            </div>
          </div>
          <p className={`mt-8 max-w-3xl text-xs leading-relaxed ${c.subtle}`}>
            YieldKeep is experimental, unaudited software running on a testnet.
            {USES_MOCK_ADAPTER ? " Yield and share price on this deployment are simulated by a mock adapter." : ""}{" "}
            Using DeFi protocols carries a risk of total loss. Nothing on this site is financial, legal or tax advice. Rates shown are the rate at last read, not a forecast. Not offered to US persons or in restricted jurisdictions.
          </p>
        </div>
      </footer>

      {/* WALLET LIST */}
      {showWalletList && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
          onClick={() => setShowWalletList(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Connect a wallet"
            className={`border rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto ${c.float}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-lg font-bold">Connect a wallet</h2>
              <button onClick={() => setShowWalletList(false)} aria-label="Close" className={`text-xl ${c.subtle} ${c.link}`}>✕</button>
            </div>
            <p className={`text-xs mb-5 ${c.subtle}`}>Choose your wallet. Only that wallet will ask you to confirm.</p>

            <div className="space-y-3">
              {walletRows.map(({ def, conn, installed }) =>
                installed && conn ? (
                  <button
                    key={def.key}
                    onClick={() => connectWith(conn, def.name)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${c.row}`}
                  >
                    <div className="flex items-center gap-3">
                      <WalletLogo sources={[svgUri(LOGO_SVGS[def.key]), conn.icon]} name={def.name} tile={c.tile} />
                      <span className="font-semibold text-sm">{def.name}</span>
                    </div>
                    <span className={`text-xs font-medium ${c.green}`}>Detected</span>
                  </button>
                ) : (
                  <a
                    key={def.key}
                    href={def.install}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${c.row}`}
                  >
                    <div className="flex items-center gap-3">
                      <WalletLogo sources={[svgUri(LOGO_SVGS[def.key])]} name={def.name} tile={c.tile} />
                      <span className="font-semibold text-sm">{def.name}</span>
                    </div>
                    <span className={`text-xs font-medium ${c.accent}`}>Install ↗</span>
                  </a>
                )
              )}
            </div>

            {otherWallets.length > 0 && (
              <>
                <p className={`text-xs font-semibold uppercase tracking-wider mt-6 mb-3 ${c.subtle}`}>Other installed wallets</p>
                <div className="space-y-3">
                  {otherWallets.map((w) => (
                    <button
                      key={w.uid}
                      onClick={() => connectWith(w, w.name)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${c.row}`}
                    >
                      <div className="flex items-center gap-3">
                        <WalletLogo sources={[w.icon]} name={w.name} tile={c.tile} />
                        <span className="font-semibold text-sm">{w.name}</span>
                      </div>
                      <span className={`text-xs font-medium ${c.green}`}>Detected</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className={`mt-5 text-xs leading-relaxed ${c.subtle}`}>
              Connecting only shares your public address. Every transaction needs your confirmation. Just installed a wallet? Refresh this page. On mobile, open this site inside your wallet app&apos;s built-in browser.
            </p>
          </div>
        </div>
      )}

      {/* SMALL "WALLET CONNECTED" BOX (no dark overlay) */}
      {showSuccessModal && isConnected && (
        <div
          role="dialog"
          aria-label="Wallet connected"
          className={`fixed top-24 right-6 z-50 w-80 max-w-[calc(100vw-3rem)] rounded-2xl border p-5 shadow-2xl ${c.float}`}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-none ${isDark ? "bg-green-500/20" : "bg-green-100"}`}><span className={`${c.green} text-lg`}>✓</span></div>
            <div className="min-w-0">
              <p className="font-bold text-sm">Connected{activeConnector ? ` with ${activeConnector.name}` : ""}</p>
              <p className={`text-xs tabular-nums ${c.muted}`}>{address?.slice(0, 6)}...{address?.slice(-4)}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleGoToDashboard} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold text-sm">
              Go to Dashboard
            </button>
            <button onClick={handleStayHere} className={`flex-1 border py-2.5 rounded-lg font-medium text-sm ${c.stayBtn}`}>
              Stay here
            </button>
          </div>
        </div>
      )}

      {/* CONNECT ERROR MESSAGE */}
      {connectError && (
        <div
          role="alert"
          className={`fixed bottom-8 right-8 z-50 max-w-xs rounded-lg border px-4 py-3 text-sm shadow-lg ${c.float}`}
        >
          {connectError}
          <button onClick={() => setConnectError(null)} className={`ml-3 ${c.subtle} ${c.link}`} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* THEME TOGGLE */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className={`fixed bottom-8 left-8 p-3.5 rounded-full shadow-lg border z-50 flex items-center justify-center transition-all ${c.toggle}`}
      >
        {isDark ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
        )}
      </button>
    </div>
  );
}

/* END OF FILE */