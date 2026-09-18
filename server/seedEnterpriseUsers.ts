import { db } from "./db";
import { enterpriseUsers, enterpriseAccounts, admins } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

export async function seedEnterpriseUsers() {
  console.log("🌱 Seeding enterprise users...");

  // 1️⃣ Ensure an enterprise account exists
  const enterpriseAccount = await db.query.enterpriseAccounts.findFirst({});
  if (!enterpriseAccount) {
    console.error("❌ No enterprise account exists. Seed enterpriseAccounts first.");
    return;
  }

  // 2️⃣ Optional: use first admin as createdBy reference
  const admin = await db.query.admins.findFirst({});

  // 3️⃣ Users to seed
  const users = [
    {
      email: "owner@example.com",
      password: "Owner@123",
      role: "owner" as const,
      name: "Enterprise Owner",
    },
    {
      email: "member@example.com",
      password: "Member@123",
      role: "member" as const,
      name: "Enterprise Member",
    },
  ];

  for (const u of users) {
    const existing = await db.query.enterpriseUsers.findFirst({
      where: eq(enterpriseUsers.email, u.email),
    });

    if (existing) {
      console.log(`⏩ Skipped (already exists): ${u.email}`);
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, 12);

    await db.insert(enterpriseUsers).values({
      enterpriseAccountId: enterpriseAccount.id,
      email: u.email,
      passwordHash,
      role: u.role,
      name: u.name,
      createdBy: admin?.id ?? null,
    });

    console.log(`✓ Created enterprise user: ${u.email} (${u.role})`);
  }

  console.log("✨ Enterprise users seeded successfully!");
}
