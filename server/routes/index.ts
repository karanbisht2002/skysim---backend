"use strict";

import type { Express } from "express";
import { Router } from "express";

import authRouter from "./auth";
import destinationsRouter from "./destinations";
import regionsRouter from "./regions";
import packagesRouter from "./packages";
import unifiedPackagesRouter from "./unifiedPackages";
import ordersRouter from "./orders";
import ticketsRouter from "./tickets";
import notificationsRouter from "./notifications";
import customerRouter from "./customer";
import adminRouter from "./admin";
import paymentRouter from "./payments";
import contactRouter from "./contact";

export function registerModularRoutes(app: Express): void {
  app.use("/api/auth", authRouter);
  app.use("/api/destinations", destinationsRouter);
  app.use("/api/regions", regionsRouter);
  app.use("/api/packages", packagesRouter);
  app.use("/api/unified-packages", unifiedPackagesRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/customer", customerRouter);
  app.use("/api/contact", contactRouter);
  app.use("/api/payments", paymentRouter);
  app.use("/api/admin", adminRouter);

}

export { authRouter, destinationsRouter, regionsRouter, packagesRouter, contactRouter };
