import type { ActivityLogLevel } from "@kick-manager/shared";
import { prisma } from "../../lib/db.js";

export class ActivityLogService {
  async log(userId: string, message: string, level: ActivityLogLevel = "info") {
    return prisma.activityLog.create({ data: { userId, message, level } });
  }

  async recent(userId: string, limit = 50) {
    return prisma.activityLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  }
}

export const activityLogService = new ActivityLogService();
