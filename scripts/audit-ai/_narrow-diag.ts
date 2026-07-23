export {};
import { applyStampedConfig } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const { hasBarSignal } = await import("../../src/lib/audit-gate-v2");
  const probes = [
    "Quoters must be determined to be responsible according to the standards of FAR Part 9 to be eligible for",
    "Quoters must be determined to be   according to the standards of   to be eligible for",
    "Quoters must be",
    "to be eligible for",
    "eligible",
    "shall furnish a bid guarantee of 20 percent of the bid price",
    "a bid guarantee",
    "bid guarantee",
    "Bid Guarantee (Bond): A bid guarantee (minimum of 20% of proposal) is required IAW FAR 28.",
    "the offeror must be a small business manufacturer or obtain an SBA nonmanufacturer waiver",
    "The Government will evaluate the quoter's Past Performance to determine acceptability of the quote in",
    "the quoter's   to determine acceptability of the quote in",
  ];
  for (const p of probes) console.log(`${String(hasBarSignal(p)).padEnd(6)} "${p.slice(0,88)}"`);
})();
