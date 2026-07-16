import { z } from "zod";

export const RELEASE_TYPES = ["coming-soon", "just-listed", "just-sold"] as const;
export const PROPERTY_TYPES = [
  "office",
  "industrial",
  "retail",
  "multifamily",
  "hospitality",
  "mixed-use",
  "medical-office",
  "senior-housing",
  "student-housing",
  "self-storage",
  "data-centers",
  "life-sciences",
  "land",
  "other",
] as const;
export const KEY_STAT_UNITS = ["units", "square feet", "keys", "acres"] as const;

export const RELEASE_TYPE_LABELS: Record<(typeof RELEASE_TYPES)[number], string> = {
  "coming-soon": "Coming Soon",
  "just-listed": "Just Listed",
  "just-sold": "Just Sold",
};

export const PROPERTY_TYPE_LABELS: Record<(typeof PROPERTY_TYPES)[number], string> = {
  office: "Office",
  industrial: "Industrial",
  retail: "Retail",
  multifamily: "Multifamily",
  hospitality: "Hospitality",
  "mixed-use": "Mixed-Use",
  "medical-office": "Medical Office",
  "senior-housing": "Senior Housing",
  "student-housing": "Student Housing",
  "self-storage": "Self Storage",
  "data-centers": "Data Centers",
  "life-sciences": "Life Sciences",
  land: "Land",
  other: "Other",
};

const nonEmpty = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max);

export const UserBriefSchema = z
  .object({
    release_type: z.enum(RELEASE_TYPES),

    // Step 1 — property
    property_name: nonEmpty(80).optional().or(z.literal("").transform(() => undefined)),
    property_address: nonEmpty(200),
    city: nonEmpty(80),
    state: z.string().trim().length(2).toUpperCase(),
    property_type: z.enum(PROPERTY_TYPES),
    key_stat_value: z.number().int().positive(),
    key_stat_unit: z.enum(KEY_STAT_UNITS),
    year_built: z
      .number()
      .int()
      .min(1700)
      .max(new Date().getFullYear() + 5)
      .optional(),
    distinguishing_fact: z
      .string()
      .trim()
      .max(300)
      .optional()
      .or(z.literal("").transform(() => undefined)),

    // Step 2 — price & transaction
    asking_price: z.number().int().positive().max(9_999_999_999).optional(),
    price_visible_in_release: z.boolean().optional(),
    buyer_name: nonEmpty(120).optional().or(z.literal("").transform(() => undefined)),
    seller_name: nonEmpty(120).optional().or(z.literal("").transform(() => undefined)),
    closing_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional()
      .or(z.literal("").transform(() => undefined)),

    // Step 3 — broker & firm
    broker_name: nonEmpty(120),
    broker_title: nonEmpty(120),
    firm_name: nonEmpty(120),
    firm_boilerplate: z
      .string()
      .trim()
      .max(800)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    media_contact_name: nonEmpty(120).optional().or(z.literal("").transform(() => undefined)),
    media_contact_email: z.string().trim().email().optional().or(z.literal("").transform(() => undefined)),
    media_contact_phone: nonEmpty(40).optional().or(z.literal("").transform(() => undefined)),

    // Step 4 — voice (primary broker quote)
    draft_quote: z.string().trim().max(600).optional().or(z.literal("").transform(() => undefined)),
    quote_angle_hint: nonEmpty(200).optional().or(z.literal("").transform(() => undefined)),

    // Step 4b — optional second quote (seller, developer, city official,
    // partner firm broker, debt/equity partner, etc.). Enabled by presence
    // of secondary_quote_name; the other fields describe that person.
    secondary_quote_name: nonEmpty(120).optional().or(z.literal("").transform(() => undefined)),
    secondary_quote_title: nonEmpty(120).optional().or(z.literal("").transform(() => undefined)),
    secondary_quote_affiliation: nonEmpty(200).optional().or(z.literal("").transform(() => undefined)),
    secondary_quote_text: z.string().trim().max(600).optional().or(z.literal("").transform(() => undefined)),
    secondary_quote_angle_hint: nonEmpty(200).optional().or(z.literal("").transform(() => undefined)),

    // Step 5 — image
    image_credit: nonEmpty(120).optional().or(z.literal("").transform(() => undefined)),
    // Image bytes come via multipart, not in this JSON — see form-spec.md
    has_image: z.boolean().optional(),
    image_orientation: z.enum(["landscape", "portrait"]).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.release_type === "coming-soon" && !val.distinguishing_fact) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["distinguishing_fact"],
        message: "Required for Coming Soon releases",
      });
    }
    if (val.release_type === "just-sold" && !val.asking_price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["asking_price"],
        message: "Sale price is required for Just Sold",
      });
    }
    // If ANY secondary_quote_* field is set, require name + title as the
    // minimum to build a valid attribution line.
    const anySecondary =
      val.secondary_quote_title ||
      val.secondary_quote_affiliation ||
      val.secondary_quote_text ||
      val.secondary_quote_angle_hint;
    if (anySecondary && !val.secondary_quote_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secondary_quote_name"],
        message: "Add the name of the person being quoted, or clear the other second-quote fields.",
      });
    }
    if (val.secondary_quote_name && !val.secondary_quote_title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secondary_quote_title"],
        message: "Add their title (e.g. 'Managing Partner', 'Seller') so we can attribute the quote.",
      });
    }
  });

export type UserBrief = z.infer<typeof UserBriefSchema>;

// What the LLM returns and the frontend renders
export const GeneratorOutputSchema = z.object({
  draft_text: z.string(),
  draft_html: z.string(),
  image_placement_note: z.string(),
  warnings: z.array(z.string()),
});

export type GeneratorOutput = z.infer<typeof GeneratorOutputSchema>;

// JSON Schema form used with the Anthropic API's output_config.format
export const GeneratorOutputJsonSchema = {
  type: "object",
  properties: {
    draft_text: { type: "string" },
    draft_html: { type: "string" },
    image_placement_note: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["draft_text", "draft_html", "image_placement_note", "warnings"],
  additionalProperties: false,
} as const;
