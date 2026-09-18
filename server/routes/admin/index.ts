"use strict";

import { Router } from "express";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import customersRouter from "./customers";
import ordersRouter from "./orders";
import providersRouter from "./providers";
import settingsRouter from "./settings";
import platformSettingsRouter from "./platformSettings";
import vouchersRouter from "./vouchers";
import giftCardsRouter from "./giftCards";
import supportTicketsRouter from "./supportTickets";
import privacyPolicyRoutes from "./PrivacyPolicy";
import adminTerms from "./termsConditions";
import PaymentGateway from "./payment-gateways"
import priceBracketsRouter from "./priceBrackets";
import screenshotRouter from "./screenshot";

const router = Router();

router.use("/", authRouter);
router.use("/", dashboardRouter);
router.use("/customers", customersRouter);
router.use("/orders", ordersRouter);
router.use("/providers", providersRouter);
router.use("/settings", settingsRouter);
router.use("/platform-settings", platformSettingsRouter);
router.use("/", vouchersRouter);
router.use("/", giftCardsRouter);
router.use("/support-tickets", supportTicketsRouter);
router.use("/privacy-policy", privacyPolicyRoutes);
router.use("/terms-conditions", adminTerms);
router.use("/payment-gateways", PaymentGateway);
router.use("/price-brackets", priceBracketsRouter);
router.use("/screenshot", screenshotRouter);


export default router;
