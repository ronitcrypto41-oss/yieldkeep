const fs = require('fs');
const path = require('path');

const pairs = [
  { file: 'AaveYieldAdapter.json', name: 'AAVE_YIELD_ADAPTER_ABI' },
  { file: 'DAOTreasuryYieldManagerV2.json', name: 'DAO_TREASURY_YIELD_MANAGER_V2_ABI' },
];

const abiDir = path.join(__dirname, 'frontend', 'abis');
const outDir = path.join(__dirname, 'frontend', 'abis');

for (const { file, name } of pairs) {
  const json = JSON.parse(fs.readFileSync(path.join(abiDir, file), 'utf8'));
  const content = `// Auto-generated from out/${file}\n// Do not edit manually.\n\nexport const ${name} = ${JSON.stringify(json.abi, null, 2)} as const;\n`;
  const outPath = path.join(outDir, file.replace('.json', '.ts'));
  fs.writeFileSync(outPath, content);
  console.log(`✅ Wrote ${outPath}`);
}