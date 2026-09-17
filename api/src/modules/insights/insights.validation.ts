import { z } from "zod";

export const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "month must be YYYY-MM-01"),
});
