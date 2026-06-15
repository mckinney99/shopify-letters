import { json } from "@remix-run/node";
import prisma from "../db.server";

// Unauthenticated health check used by the ECS task and ALB target group.
export const loader = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ status: "ok" });
  } catch {
    return json({ status: "error" }, { status: 500 });
  }
};
