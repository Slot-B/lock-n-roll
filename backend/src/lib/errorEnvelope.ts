import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    public override message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const NotFound = (message = "Resource not found", details?: Record<string, unknown>) =>
  new ApiError(404, "NOT_FOUND", message, details);
export const InvalidParams = (message: string, details?: Record<string, unknown>) =>
  new ApiError(400, "INVALID_PARAMS", message, details);
export const Internal = (message = "Internal error", details?: Record<string, unknown>) =>
  new ApiError(500, "INTERNAL", message, details);

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | ApiError | ZodError, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details ?? {} },
      });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "INVALID_PARAMS",
          message: "Request validation failed",
          details: { issues: err.issues },
        },
      });
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status >= 500) {
      app.log.error(err);
    }
    return reply.status(status).send({
      error: {
        code: status >= 500 ? "INTERNAL" : "BAD_REQUEST",
        message: err.message,
        details: {},
      },
    });
  });
}
