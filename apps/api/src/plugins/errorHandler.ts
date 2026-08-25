import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ClippingApiError } from "../services/clipping/index.js";
import { AlreadyLinkedError, ReelNotFoundError } from "../services/submissions/SubmissionService.js";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({ error: "validation_error", message: "Invalid request.", issues: error.issues });
      return;
    }
    if (error instanceof AlreadyLinkedError) {
      reply.status(409).send({ error: "already_linked", message: error.message });
      return;
    }
    if (error instanceof ReelNotFoundError) {
      reply.status(404).send({ error: "not_found", message: error.message });
      return;
    }
    if (error instanceof ClippingApiError) {
      const statusByReason: Record<string, number> = {
        timeout: 504,
        rate_limit: 429,
        duplicate: 409,
        auth: 401,
        unavailable: 502,
        malformed: 502,
        network: 502,
        unknown: 500,
      };
      reply
        .status(statusByReason[error.reason] ?? 500)
        .send({ error: `clipping_${error.reason}`, message: error.message });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        reply.status(409).send({ error: "conflict", message: "A record with this value already exists." });
        return;
      }
      if (error.code === "P2025") {
        reply.status(404).send({ error: "not_found", message: "Record not found." });
        return;
      }
    }

    app.log.error(error);
    reply.status(500).send({ error: "internal_error", message: "Something went wrong." });
  });
}
