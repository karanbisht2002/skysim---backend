import cron from "node-cron";
import { getAdminMessaging } from "server/config/firebase-admin";
import { providerFactory } from "server/providers/provider-factory";
import { storage } from "server/storage";

const USAGE_THRESHOLDS = [10, 80, 90, 95];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const startLowDataUsageCron = () => {
    // ⏰ Runs every hour
    cron.schedule("0 * * * *", async () => {
        console.log("⏳ Running Low Data Usage Cron...");

        try {
            const orders = await storage.getAllOrdersByStatus("completed"); // all completed orders

            for (const order of orders) {
                try {
                    const user = await storage.getUserById(order.userId);
                    if (!user?.notifyLowData || !user?.fcmToken) continue;

                    const providerService = await providerFactory.getServiceById(
                        order.providerId
                    );

                    const usage = await providerService.getUsageData(order.iccid);
                    if (!usage?.percentageUsed) continue;

                    const now = Date.now();
                    const lastTime = user.lastLowDataNotifiedAt
                        ? new Date(user.lastLowDataNotifiedAt).getTime()
                        : 0;

                    const canNotifyTime = !lastTime || now - lastTime > ONE_DAY_MS;

                    // find highest crossed threshold
                    const crossedLevel = USAGE_THRESHOLDS
                        .filter(level => usage.percentageUsed >= level)
                        .sort((a, b) => b - a)[0];

                    const alreadyNotifiedLevel = user.lastLowDataLevel ?? 0;

                    if (
                        crossedLevel &&
                        (
                            crossedLevel > alreadyNotifiedLevel ||
                            (crossedLevel === alreadyNotifiedLevel && canNotifyTime)
                        )
                    ) {
                        const payload = {
                            notification: {
                                title: "⚠️ Low Data Alert",
                                body: `You've used ${crossedLevel}% of your eSIM data. Top up to stay connected.`,
                            },
                            data: {
                                type: "low_data",
                                level: crossedLevel.toString(),
                                iccid: order.iccid,
                            },
                            token: user.fcmToken,
                        };

                        const messaging = await getAdminMessaging();
                        await messaging.send(payload);

                        await storage.updateUser(user.id, {
                            lastLowDataNotifiedAt: new Date(),
                            lastLowDataLevel: crossedLevel,
                        });

                        console.log(
                            `📱 Notification sent → User: ${user.id}, ICCID: ${order.iccid}, Level: ${crossedLevel}%`
                        );
                    }
                } catch (orderError) {
                    console.error(
                        `❌ Error processing order ${order.id}:`,
                        orderError
                    );
                }
            }
        } catch (err) {
            console.error("❌ Low Data Usage Cron Failed:", err);
        }
    });
};
