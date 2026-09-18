# eSIM Marketplace Platform

## Overview
This project is a full-stack eSIM marketplace enabling customers to discover, purchase, and manage international eSIM data packages. It integrates with multiple eSIM providers (Airalo, eSIM Access, eSIM Go) for diverse package options. The platform includes customer-facing features and a comprehensive administrative dashboard, focusing on seamless global connectivity, intelligent multi-provider routing, automated price comparison, and a robust, scalable backend. The business aims for a significant market share through competitive pricing, superior UX, and advanced automation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend employs a mobile-first, responsive design with light and dark modes, using Tailwind CSS and shadcn/ui. `react-helmet-async` is used for SEO.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Vite, Wouter for routing, TanStack Query for server state.
- **Backend**: Node.js, Express.js, TypeScript, `express-session` for session-based authentication. Drizzle ORM interfaces with a Neon serverless PostgreSQL database. Authentication is OTP-based for customers and email/password for administrators. RESTful APIs handle file uploads via Multer.
- **Database**: Drizzle ORM manages the Neon PostgreSQL database. Key tables include `users`, `admins`, `destinations`, `orders`, `providers`, and `unified_packages`. UUIDs are used for primary keys.

### Feature Specifications
- **Multi-Provider Integration**: A unified abstraction layer integrates Airalo, eSIM Access, and eSIM Go via a Provider Factory. A `unified_packages` catalog aggregates offerings with automated price comparison and "best-price" tags. A Multi-Provider Sync Scheduler manages periodic package synchronization. Packages can be automatically enabled/disabled via "Auto Mode" or managed manually by an admin.
- **Admin Panel**: Provides analytics, platform settings (pricing margins, SMTP, provider configuration), full CRUD for policy pages, CSV export, KYC, management of orders, customers, eSIMs, top-ups, API documentation, and provider management.
- **Customer Features**: Includes OTP authentication, browsing and filtering eSIM packages, order placement with automatic provider routing, account management, order history, activation guides, real-time data usage, in-app top-ups, and a support ticket system.
- **eSIM Order & Management**: Supports synchronous and asynchronous order processing across providers, managed by the ProviderFactory, with background polling for status updates.
- **Notification Systems**: Integrates with Airalo's Notification API for low data/expiring eSIM alerts and includes an in-app notification system with a Customer Notifications Page and a NotificationBell component. Admins can send custom notifications.
- **Email Template Management**: Database-backed system for customizable email templates with dynamic variable replacement.
- **Currency Management System**: Tracks conversion rates, provides an Admin UI for currency management, and supports server-side price conversion.
- **Internationalization**: Multi-language support (English, Spanish, French) via a TranslationContext with fallback and parameter interpolation.
- **Enterprise Module**: B2B eSIM provisioning system for bulk orders, including multi-account management, quote generation, automated order execution, a comprehensive admin UI, and a customer portal with secure login, order tracking, and concurrency-safe eSIM distribution.

## External Dependencies

1.  **Airalo API**: eSIM provisioning, package browsing, orders, top-ups, SIM details, usage data.
2.  **eSIM Access API**: eSIM provisioning and package management.
3.  **eSIM Go API v2.5**: Comprehensive eSIM package offerings.
4.  **Stripe**: Payment processing.
5.  **SMTP Email Service**: Nodemailer for email communications.
6.  **Neon Database**: Serverless PostgreSQL database.
7.  **Google Fonts**: Inter and Plus Jakarta Sans.

---

## Project Status (Last Updated: November 2025)

### 🟢 COMPLETED FEATURES

#### Customer Module ✅
| Feature | Status |
|---------|--------|
| OTP Authentication (email) | ✅ Complete |
| Package Browsing & Filtering | ✅ Complete |
| Multi-currency Support | ✅ Complete |
| Multi-language (EN/ES/FR) | ✅ Complete |
| Stripe Payment Integration | ✅ Complete |
| Order Placement & Tracking | ✅ Complete |
| eSIM Activation (QR Codes) | ✅ Complete |
| Data Usage Tracking | ✅ Complete |
| Top-up Functionality | ✅ Complete |
| Support Tickets | ✅ Complete |
| In-App Notifications | ✅ Complete |
| Profile Management | ✅ Complete |
| KYC Submission | ✅ Complete |

#### Admin Panel ✅
| Feature | Status |
|---------|--------|
| Dashboard Analytics | ✅ Complete |
| Customer Management | ✅ Complete |
| Order Management | ✅ Complete |
| eSIM Management | ✅ Complete |
| Provider Configuration | ✅ Complete |
| Package Management | ✅ Complete |
| Email Template Management | ✅ Complete |
| Currency Rate Management | ✅ Complete |
| Policy Pages (Terms/Privacy) | ✅ Complete |
| KYC Verification | ✅ Complete |
| Top-up Management | ✅ Complete |
| Ticket Management | ✅ Complete |
| API Documentation | ✅ Complete |
| Notification History | ✅ Complete |

#### Enterprise B2B Module ✅
| Feature | Status |
|---------|--------|
| Admin: Account Creation | ✅ Complete |
| Admin: Quote Generation | ✅ Complete |
| Admin: Bulk Order Execution | ✅ Complete |
| Portal: Bcrypt Login | ✅ Complete |
| Portal: Dashboard | ✅ Complete |
| Portal: Quote Acceptance | ✅ Complete |
| Portal: Order Tracking | ✅ Complete |
| Portal: eSIM Distribution (Concurrency-Safe) | ✅ Complete |
| Portal: CSV Export | ✅ Complete |
| Session Audit Logging | ✅ Complete |

#### Provider Integration ✅
| Provider | Status | Details |
|----------|--------|---------|
| Airalo | ✅ Full | Orders, Usage, Top-ups, Webhooks |
| eSIM Access | ✅ Full | Orders, Usage, Top-ups |
| eSIM Go | ✅ Full | Orders, Usage, Top-ups |
| Unified Abstraction Layer | ✅ Complete | ProviderFactory routing |
| Auto-Sync Scheduler | ✅ Running | Price comparison active |
| Best-Price Tagging | ✅ Complete | 2934/3700 packages tagged |

#### Technical Infrastructure ✅
| Component | Status |
|-----------|--------|
| PostgreSQL Database (Neon) | ✅ Running |
| Drizzle ORM | ✅ Complete |
| Session-based Auth | ✅ Complete |
| Email System (Nodemailer) | ✅ Complete |
| Stripe Payments | ✅ Configured |
| Responsive UI (Light/Dark) | ✅ Complete |
| SEO Meta Tags | ✅ Complete |
| Comprehensive Documentation | ✅ Complete |

---

### 🟡 PARTIALLY COMPLETE / NEEDS VERIFICATION

| Feature | Status | Notes |
|---------|--------|-------|
| Gift Cards | 🟡 UI Exists | Backend may need completion |
| Referral Program | 🟡 UI Exists | Need to verify full functionality |
| Blog System | 🟡 UI Exists | Content management needs testing |
| Email Marketing | 🟡 UI Exists | Campaign functionality needs testing |
| Reviews System | 🟡 UI Exists | Customer review flow needs verification |
| Custom eSIM Orders | 🟡 UI Exists | Admin custom order flow needs testing |

---

### 🔴 POTENTIAL ENHANCEMENTS / NOT IMPLEMENTED

| Feature | Effort | Value |
|---------|--------|-------|
| Integration Tests (Concurrency) | Medium | High - Per architect recommendation |
| Real-time WebSocket Notifications | Medium | Medium |
| Mobile App (React Native) | High | High |
| Affiliate/Partner Program | Medium | Medium |
| Advanced Analytics Dashboard | Medium | Medium |
| Automated Refund Processing | Low | Medium |
| SMS OTP (in addition to email) | Low | Low |
| Two-Factor Auth for Customers | Medium | Medium |
| Webhook Integration (eSIM Access/Go) | Medium | Medium |

---

### 📊 SYSTEM HEALTH METRICS

**Package Catalog:**
- Total Packages Synced: ~3,700
- Best-Price Packages Tagged: ~2,934 (79%)
- Providers Active: Airalo, eSIM Access, eSIM Go

**Background Jobs:**
- Order Retry Scheduler: ✅ Running
- Pending Order Checker: ✅ Running
- Package Sync Scheduler: ✅ Running

---

### 📚 DOCUMENTATION SUITE (Consolidated)

Located in `/docs/` directory:
| Document | Purpose |
|----------|---------|
| **DEVELOPER_GUIDE.md** | Architecture, database schema, deployment, security, performance, and code style |
| **FEATURES_GUIDE.md** | Customer module, Enterprise B2B module, eSIM management, and testing checklists |
| **API_REFERENCE.md** | Complete API endpoint documentation |

Additional reference:
| File | Purpose |
|------|---------|
| `design_guidelines.md` | UI/UX guidelines (Saily-inspired premium design system) |
| `replit.md` | Project overview and status (this file) |

---

### 🎯 RECOMMENDED NEXT STEPS

**1. Quick Wins (Easy)**
- Test gift cards, referrals, blog features
- Verify eSIM Go sync is working properly
- Add sample blog content

**2. Important (Medium Effort)**
- Add integration tests for concurrency (409 handling)
- Test end-to-end order flow with real provider APIs
- Complete email marketing campaigns

**3. Future Enhancements (Higher Effort)**
- Mobile app
- Advanced analytics
- Partner/affiliate program