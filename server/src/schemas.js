import { z } from 'zod';
import { CONDITIONS, INDUSTRIES, RELATIONS } from './engine/defaults.js';

const LINES = ['retail', 'sme'];
export const lineEnum = z.enum(LINES);
const tier = z.coerce.number().int().min(1).max(3);
const phone = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number');
const optionalEmail = z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined));

export const registerSchema = z.object({
  orgName: z.string().trim().min(2).max(120),
  orgType: z.enum(['insurer', 'broker', 'corporate_agent', 'tpa']),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  lines: z.array(lineEnum).min(1, 'Choose at least one kind of insurance'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(200),
});

export const preferencesSchema = z.object({
  lines: z.array(lineEnum).min(1, 'Choose at least one kind of insurance').optional(),
  preferences: z.object({
    defaultLine: lineEnum.optional(),
    defaultSumInsured: z.number().int().positive().optional(),
    defaultCityTier: tier.optional(),
    defaultCoverType: z.enum(['individual', 'floater']).optional(),
    favoriteProductIds: z.array(z.string().uuid()).max(50).optional(),
    theme: z.enum(['system', 'light', 'dark']).optional(),
    dashboardRangeDays: z.number().int().min(7).max(730).optional(),
  }).optional(),
});

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(['admin', 'underwriter', 'agent']),
  lines: z.array(lineEnum).min(1),
});

export const updateUserSchema = z.object({
  role: z.enum(['admin', 'underwriter', 'agent']).optional(),
  lines: z.array(lineEnum).min(1).optional(),
  active: z.boolean().optional(),
});

const declarationSchema = z.object({
  heightCm: z.coerce.number().min(30).max(250).optional(),
  weightKg: z.coerce.number().min(2).max(300).optional(),
  smoker: z.boolean().default(false),
  conditions: z.array(z.enum(CONDITIONS.map((c) => c.code))).default([]),
  hospitalisedLast3Years: z.boolean().default(false),
  onMedication: z.boolean().default(false),
}).default({});

const memberSchema = z.object({
  name: z.string().trim().min(1).max(100),
  relation: z.enum(RELATIONS),
  age: z.coerce.number().int().min(0).max(120),
  gender: z.enum(['male', 'female', 'other']),
  declaration: declarationSchema,
});

export const retailQuoteSchema = z.object({
  productId: z.string().uuid(),
  coverType: z.enum(['individual', 'floater']),
  sumInsured: z.coerce.number().int().positive(),
  cityTier: tier,
  copayPct: z.coerce.number().int().min(0).max(50).default(0),
  riders: z.array(z.string().max(20)).max(20).default([]),
  members: z.array(memberSchema).min(1).max(10),
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    email: optionalEmail,
    phone,
    pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN').optional().or(z.literal('').transform(() => undefined)),
    aadhaarLast4: z.string().regex(/^\d{4}$/, 'Last 4 digits only').optional().or(z.literal('').transform(() => undefined)),
    city: z.string().trim().min(2).max(80),
    pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
    address: z.string().trim().max(300).optional(),
    nomineeName: z.string().trim().min(2).max(100),
    nomineeRelation: z.string().trim().min(2).max(40),
  }),
});

export const retailPreviewSchema = retailQuoteSchema.omit({ customer: true }).extend({
  members: z.array(memberSchema.omit({ declaration: true }).extend({ name: z.string().max(100).default('Member') })).min(1).max(10),
});

const censusRow = z.object({
  employeeId: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(100),
  relation: z.enum(RELATIONS),
  age: z.coerce.number().int().min(0).max(120),
  gender: z.enum(['male', 'female', 'other']),
  category: z.string().trim().min(1).max(20),
});

export const smeQuoteSchema = z.object({
  productId: z.string().uuid(),
  company: z.object({
    name: z.string().trim().min(2).max(150),
    gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Invalid GSTIN').optional().or(z.literal('').transform(() => undefined)),
    industry: z.enum(Object.keys(INDUSTRIES)),
    city: z.string().trim().min(2).max(80),
    pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
    contactName: z.string().trim().min(2).max(100),
    contactEmail: optionalEmail,
    contactPhone: phone,
  }),
  cityTier: tier,
  categories: z.record(z.string().min(1).max(20), z.object({
    label: z.string().max(60).optional(),
    sumInsured: z.coerce.number().int().positive(),
  })),
  options: z.array(z.string().max(20)).max(20).default([]),
  census: z.array(censusRow).min(1).max(5000),
});

export const decisionSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  notes: z.string().trim().min(3, 'Add a short note for the audit trail').max(2000),
  memberLoadings: z.array(z.coerce.number().min(0).max(300)).optional(),
  loadingPct: z.coerce.number().min(0).max(300).optional(),
  exclusions: z.array(z.string().trim().max(200)).max(20).optional(),
});

export const issueSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment: z.object({
    method: z.enum(['upi', 'card', 'netbanking', 'neft', 'cheque']),
    reference: z.string().trim().max(100).optional(),
  }),
});

export const productCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, 'Use 2-20 letters, digits or dashes'),
  line: lineEnum,
});

export const productUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  config: z.record(z.any()).optional(),
});

export const settingsSchema = z.object({
  gst: z.object({ retail: z.number().min(0).max(28), sme: z.number().min(0).max(28) }).partial().optional(),
  underwriting: z.record(z.any()).optional(),
  workflow: z.object({
    quoteValidityDays: z.number().int().min(1).max(180),
    agentsCanIssue: z.boolean(),
    requirePaymentReference: z.boolean(),
  }).partial().optional(),
});
