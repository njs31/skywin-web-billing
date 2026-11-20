import { seedFieldCatalogIfEmpty } from "../lib/queries/field-catalog";

async function main() {
  const result = await seedFieldCatalogIfEmpty();
  console.log(result.seeded ? "Seeded SkyWin Field catalog." : "Field catalog already present.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
