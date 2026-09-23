import { z } from 'zod';
import { idSchema } from './env.js';
import type { Database } from '../database/client.js';
export const optionalId = z.union([z.literal(''), idSchema]);
const image = z.union([
  z.literal(''),
  z
    .url()
    .max(500)
    .refine((v) => v.startsWith('https://'), 'Use an HTTPS image URL.'),
]);
const short = z.string().min(1).max(80);
export const categorySchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_-]{0,19}$/),
    label: z.string().min(1).max(50),
    description: z.string().min(1).max(100),
    emoji: z.string().max(60),
    roleId: optionalId,
    parentId: optionalId,
    order: z.boolean(),
  })
  .strict();
export const copySchema = z
  .object({
    orderTitle: short,
    contactTitle: short,
    orderIntro: z.string().min(1).max(800),
    contactIntro: z.string().min(1).max(800),
    contactLink: short,
    learnMore: short,
    chooseCategory: short,
    termsLabel: short,
    pricingLabel: short,
    faqLabel: short,
    welcome: z.string().max(500),
    privacy: z.string().max(500),
    claim: short,
    unclaim: short,
    close: short,
    add: short,
    remove: short,
    rename: short,
    escalate: short,
    move: short,
    priority: short,
    reopen: short,
    delete: short,
    transcript: short,
    subject: short,
    description: short,
    service: short,
    budget: short,
    deadline: short,
  })
  .strict();
export const defaults = {
  brandName: 'Support',
  accentColor: '#FF6B24',
  supportRoleId: '',
  managementRoleId: '',
  ticketCategoryId: '',
  archiveCategoryId: '',
  transcriptLogChannelId: '',
  panelChannelId: '',
  contactChannelId: '',
  orderBannerUrl: 'https://placehold.co/1200x320/FF6B24/FFFFFF.png?text=Order+Info',
  contactBannerUrl: 'https://placehold.co/1200x320/FF6B24/FFFFFF.png?text=Contact+Us',
  footerImageUrl: 'https://placehold.co/1200x64/FF6B24/FF6B24.png',
  terms: 'Placeholder terms. Ask an administrator to publish your business terms before ordering.',
  pricing: 'Placeholder pricing. Open an order ticket for a quote.',
  faq: 'How do I get help? Choose a category in the Contact panel.',
  cooldownSeconds: 3,
  categories: [
    {
      key: 'support',
      label: 'Support',
      description: 'Questions and help with existing services',
      emoji: '💬',
      roleId: '',
      parentId: '',
      order: false,
    },
    {
      key: 'management',
      label: 'Management',
      description: 'Private concerns and management requests',
      emoji: '📋',
      roleId: '',
      parentId: '',
      order: false,
    },
  ],
  copy: {
    orderTitle: 'Order Info',
    contactTitle: 'Contact Us',
    orderIntro:
      'Review our terms, pricing, and frequently asked questions before placing an order.',
    contactIntro:
      'Choose the category that best matches your request. Tell us what you need and our team will help.',
    contactLink: 'Ready to get started?',
    learnMore: 'Learn more',
    chooseCategory: 'Choose a ticket category',
    termsLabel: 'Terms of Service',
    pricingLabel: 'Pricing',
    faqLabel: 'Frequently Asked Questions',
    welcome: 'Thanks for reaching out. Please keep the details of your request in this channel.',
    privacy:
      'Ticket details and messages are accessible to authorized staff and saved in a private transcript when closed.',
    claim: 'Claim',
    unclaim: 'Unclaim',
    close: 'Close',
    add: 'Add Member',
    remove: 'Remove Member',
    rename: 'Rename',
    escalate: 'Escalate',
    move: 'Move',
    priority: 'Priority',
    reopen: 'Reopen',
    delete: 'Delete',
    transcript: 'Transcript',
    subject: 'Subject',
    description: 'Description',
    service: 'Service',
    budget: 'Budget',
    deadline: 'Deadline',
  },
};
export const settingsSchema = z
  .object({
    brandName: short,
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    supportRoleId: optionalId,
    managementRoleId: optionalId,
    ticketCategoryId: optionalId,
    archiveCategoryId: optionalId,
    transcriptLogChannelId: optionalId,
    panelChannelId: optionalId,
    contactChannelId: optionalId,
    orderBannerUrl: image,
    contactBannerUrl: image,
    footerImageUrl: image,
    terms: z.string().min(1).max(3500),
    pricing: z.string().min(1).max(3500),
    faq: z.string().min(1).max(3500),
    cooldownSeconds: z.number().int().min(1).max(60),
    categories: z
      .array(categorySchema)
      .min(1)
      .max(10)
      .refine(
        (v) => new Set(v.map((c) => c.key)).size === v.length,
        'Category keys must be unique.',
      ),
    copy: copySchema,
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export type Category = z.infer<typeof categorySchema>;
export function categoryRole(s: Settings, c: Category) {
  return c.key === 'management' ? s.managementRoleId : s.supportRoleId;
}
// Preserve stored IDs and wording while retiring commerce options from older installs.
export function supportOnlySettings(s: Settings): Settings {
  const categories = s.categories
    .filter((c) => c.key === 'support' || c.key === 'management')
    .map((c) => ({ ...c, order: false }));
  for (const c of defaults.categories)
    if (!categories.some((existing) => existing.key === c.key)) categories.push({ ...c });
  return { ...s, categories };
}
export async function getSettings(db: Database, guildId: string) {
  const row = await db.guildSettings.upsert({
    where: { guildId },
    create: { guildId, data: defaults },
    update: {},
  });
  return { settings: supportOnlySettings(settingsSchema.parse(row.data)), revision: row.revision };
}
