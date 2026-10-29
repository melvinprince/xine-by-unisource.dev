import { z } from "zod";
import { isValidHostname } from "@/lib/bot-detection";

// Common validators
export const uuidSchema = z.string().uuid();
export const siteIdSchema = z.union([z.literal("all"), z.string().uuid()]);
export const dateStringSchema = z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date");
export const dateRangeSchema = z.object({
  from: dateStringSchema,
  to: dateStringSchema,
}).refine((d) => new Date(d.from) <= new Date(d.to), "from must be before to");

/**
 * Reduce whatever was typed into the domain field to a bare hostname:
 * trimmed, lowercased, scheme/port/path/trailing dot stripped, leading "www."
 * dropped. Returns "" when the result is not a valid hostname.
 *
 * The stored domain is compared against every collect request's Origin, so a
 * malformed value (the old regex accepted "fixingenvironment..com") silently
 * puts a heavy bot signal on all of that site's traffic.
 */
export function normalizeSiteDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";
  let host: string;
  try {
    host = new URL(raw.includes("://") ? raw : "https://" + raw).hostname;
  } catch {
    return "";
  }
  host = host.replace(/\.$/, "").replace(/^www\./, "");
  return isValidHostname(host) ? host : "";
}

const siteDomainSchema = z
  .string()
  .min(1)
  .max(512)
  .transform(normalizeSiteDomain)
  .refine((d) => d !== "", "Invalid domain: expected a hostname such as example.com");

// Site creation/update
export const createSiteSchema = z.object({
  name: z.string().min(1).max(256),
  domain: siteDomainSchema,
});

export const updateSiteSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  domain: siteDomainSchema.optional(),
  is_public: z.boolean().optional(),
  api_access_enabled: z.boolean().optional(),
});

// Goal creation
export const createGoalSchema = z.object({
  name: z.string().min(1).max(256),
  type: z.enum(["pageview", "event", "duration"]),
  condition: z.enum(["equals", "contains", "starts_with", "greater_than"]),
  target: z.string().min(1).max(2048),
});

// Funnel creation
export const createFunnelSchema = z.object({
  name: z.string().min(1).max(256),
  steps: z.array(
    z.object({
      goalId: z.string().uuid(),
      name: z.string().min(1).max(256),
    })
  ).min(2).max(20),
});

// Annotation creation
export const createAnnotationSchema = z.object({
  text: z.string().min(1).max(1024),
  date: dateStringSchema,
  category: z.string().max(100).optional(),
});

// Alert creation
export const createAlertSchema = z.object({
  siteId: z.string().uuid(),
  type: z.string().min(1).max(100),
  threshold: z.object({
    value: z.number().positive(),
    timeframe: z.string().regex(/^\d+[hmd]$/),
  }),
  channel: z.enum(["email", "webhook", "slack"]),
  channelTarget: z.string().min(1).max(512),
});

// Report creation
export const createReportSchema = z.object({
  siteId: z.string().uuid(),
  schedule: z.enum(["daily", "weekly", "monthly"]),
  recipients: z.array(z.string().email()).min(1).max(20),
});

// Site settings features
export const siteFeaturesSchema = z.object({
  web_vitals: z.boolean().optional(),
  scroll_depth: z.boolean().optional(),
  outbound_clicks: z.boolean().optional(),
  js_errors: z.boolean().optional(),
  custom_events: z.boolean().optional(),
  click_tracking: z.boolean().optional(),
  rage_clicks: z.boolean().optional(),
  file_downloads: z.boolean().optional(),
  form_abandonment: z.boolean().optional(),
}).strict(); // Reject unknown keys

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Helper: parse and return result or throw ValidationError
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ValidationError(errors);
  }
  return result.data;
}

// ============================================================
// Multi-User Auth Schemas
// ============================================================

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8, "Password must be at least 8 characters long"),
});

export const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "editor", "viewer"]),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters long"),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  token: z.string().optional(),
});
