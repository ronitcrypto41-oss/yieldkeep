// frontend/app/components/TestnetBanner.tsx

export const USES_MOCK_ADAPTER = true;

export default function TestnetBanner() {
  return (
    <div role="status" className="testnet-banner">
      <strong>Testnet demo: unaudited, no real funds.</strong>
      {USES_MOCK_ADAPTER &&
        " Yield shown is simulated by a mock adapter, not real Aave."}
    </div>
  );
}