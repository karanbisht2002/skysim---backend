import { storage } from "../server/storage";

async function main() {
    await storage.setSetting({
        key: "min_order_amount",
        value: "0.50",
        category: "pricing",
        description: "Minimum order amount in USD to satisfy payment gateway requirements."
    });
    console.log("Setting min_order_amount created.");
    process.exit(0);
}

main().catch(console.error);
