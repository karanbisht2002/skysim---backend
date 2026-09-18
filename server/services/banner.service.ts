
import { banners, unifiedPackages } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "../db";

export class BannerService {
  static async create(data: any) {
    const [result] = await db
      .insert(banners)
      .values(data)
      .returning();
    return result;
  }

  static async getAll() {
    return await db
      .select()
      .from(banners)
      .orderBy(banners.position);
  }


  static async getAllB() {
  return await db
    .select({
      id: banners.id,
      title: banners.title,
      imageUrl: banners.imageUrl,
      isActive: banners.isActive,
      position: banners.position,
      packageId: banners.packageId,
      packageSlug: unifiedPackages.slug,  // slug join se
      providerPackageId: unifiedPackages.providerPackageId
    })
    .from(banners)
    .leftJoin(unifiedPackages, eq(banners.packageId, unifiedPackages.id))
    .orderBy(banners.position);
}



  static async getById(id: string) {
    const [result] = await db
      .select()
      .from(banners)
      .where(eq(banners.id, id));

    return result;
  }

  static async update(id: string, data: any) {
    const [result] = await db
      .update(banners)
      .set(data)
      .where(eq(banners.id, id))
      .returning();

    return result;
  }

  static async delete(id: string) {
    const [result] = await db
      .delete(banners)
      .where(eq(banners.id, id))
      .returning();

    return result;
  }
}
