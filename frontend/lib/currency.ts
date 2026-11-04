// frontend/lib/currency.ts
// Prices are always paid in USDC (about 1 US dollar). So the same price works in every country,
// with no bank or card needed. To help people everywhere, the pricing page also shows an ESTIMATE in
// their own currency, using live exchange rates fetched in the browser (falls back to USD if offline).

import { useEffect, useState } from "react";

export const CURRENCIES: { code: string; label: string }[] = [
  { code: "USD", label: "US dollar" }, { code: "AED", label: "UAE dirham" }, { code: "SAR", label: "Saudi riyal" },
  { code: "QAR", label: "Qatari riyal" }, { code: "KWD", label: "Kuwaiti dinar" }, { code: "BHD", label: "Bahraini dinar" },
  { code: "OMR", label: "Omani rial" }, { code: "ILS", label: "Israeli shekel" }, { code: "TRY", label: "Turkish lira" },
  { code: "EGP", label: "Egyptian pound" }, { code: "INR", label: "Indian rupee" }, { code: "PKR", label: "Pakistani rupee" },
  { code: "BDT", label: "Bangladeshi taka" }, { code: "LKR", label: "Sri Lankan rupee" }, { code: "NPR", label: "Nepali rupee" },
  { code: "EUR", label: "Euro" }, { code: "GBP", label: "British pound" }, { code: "CHF", label: "Swiss franc" },
  { code: "SEK", label: "Swedish krona" }, { code: "NOK", label: "Norwegian krone" }, { code: "DKK", label: "Danish krone" },
  { code: "PLN", label: "Polish zloty" }, { code: "CZK", label: "Czech koruna" }, { code: "HUF", label: "Hungarian forint" },
  { code: "RON", label: "Romanian leu" }, { code: "UAH", label: "Ukrainian hryvnia" }, { code: "RUB", label: "Russian ruble" },
  { code: "KZT", label: "Kazakhstani tenge" }, { code: "GEL", label: "Georgian lari" },
  { code: "NGN", label: "Nigerian naira" }, { code: "GHS", label: "Ghanaian cedi" }, { code: "KES", label: "Kenyan shilling" },
  { code: "ZAR", label: "South African rand" }, { code: "MAD", label: "Moroccan dirham" }, { code: "TZS", label: "Tanzanian shilling" },
  { code: "CNY", label: "Chinese yuan" }, { code: "HKD", label: "Hong Kong dollar" }, { code: "JPY", label: "Japanese yen" },
  { code: "KRW", label: "South Korean won" }, { code: "TWD", label: "Taiwan dollar" }, { code: "SGD", label: "Singapore dollar" },
  { code: "MYR", label: "Malaysian ringgit" }, { code: "THB", label: "Thai baht" }, { code: "VND", label: "Vietnamese dong" },
  { code: "IDR", label: "Indonesian rupiah" }, { code: "PHP", label: "Philippine peso" },
  { code: "AUD", label: "Australian dollar" }, { code: "NZD", label: "New Zealand dollar" }, { code: "CAD", label: "Canadian dollar" },
  { code: "MXN", label: "Mexican peso" }, { code: "BRL", label: "Brazilian real" }, { code: "ARS", label: "Argentine peso" },
  { code: "CLP", label: "Chilean peso" }, { code: "COP", label: "Colombian peso" }, { code: "PEN", label: "Peruvian sol" },
];

// country (from the browser language, like "en-AE") -> currency
const BY_REGION: Record<string, string> = {
  US: "USD", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", IL: "ILS", TR: "TRY", EG: "EGP",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", GB: "GBP", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK",
  PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", UA: "UAH", RU: "RUB", KZ: "KZT", GE: "GEL", NG: "NGN", GH: "GHS",
  KE: "KES", ZA: "ZAR", MA: "MAD", TZ: "TZS", CN: "CNY", HK: "HKD", JP: "JPY", KR: "KRW", TW: "TWD", SG: "SGD",
  MY: "MYR", TH: "THB", VN: "VND", ID: "IDR", PH: "PHP", AU: "AUD", NZ: "NZD", CA: "CAD", MX: "MXN", BR: "BRL",
  AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", IE: "EUR", PT: "EUR", FI: "EUR", GR: "EUR",
};

const KEY = "yk_currency_v1";

export function guessCurrency(): string {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) return saved;
    const region = (navigator.language || "").split("-")[1]?.toUpperCase();
    return (region && BY_REGION[region]) || "USD";
  } catch {
    return "USD";
  }
}

/** { currency, setCurrency, rate, ready, format(usd) }  rate = units of currency per 1 USD. */
export function useCurrency() {
  const [currency, setCur] = useState("USD");
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    setCur(guessCurrency());
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((r) => r.json())
      .then((j) => j?.rates && setRates(j.rates))
      .catch(() => {});
  }, []);

  const setCurrency = (c: string) => {
    setCur(c);
    try {
      window.localStorage.setItem(KEY, c);
    } catch {}
  };
  const rate = currency === "USD" ? 1 : rates?.[currency];
  const format = (usd: number): string | null => {
    if (currency === "USD" || !rate) return null;
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: rate > 50 ? 0 : 2 }).format(usd * rate);
    } catch {
      return null;
    }
  };
  return { currency, setCurrency, format };
}