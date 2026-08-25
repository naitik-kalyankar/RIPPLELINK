import type { ActivityLogLevel } from "@kick-manager/shared";
import { prisma } from "../../lib/db.js";

export class ActivityLogService {
  async log(message: string, level: ActivityLogLevel = "info") {
    return prisma.activityLog.create({ data: { message, level } });
  }

  async recent(limit = 50) {
    return prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }
}

export const activityLogService = new ActivityLogService();
