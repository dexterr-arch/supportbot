export const sections: Record<string, { label: string; description: string; emoji: string }> = {
  routing: {
    label: '1. Channels & staff roles',
    description: 'Choose the panel channel, ticket folders, staff roles and private log.',
    emoji: '📍',
  },
  categories: {
    label: '2. Support & Management',
    description: 'Edit the two ticket options, descriptions, emoji and staff access.',
    emoji: '💬',
  },
  identity: {
    label: '3. Name & appearance',
    description: 'Change your brand name, accent color and interaction cooldown.',
    emoji: '🎨',
  },
  images: {
    label: '4. Banner & footer images',
    description: 'Set the images at the top and bottom of the public panel.',
    emoji: '🖼️',
  },
  panels: {
    label: '5. Panel & welcome messages',
    description: 'Edit the public instructions and messages inside new tickets.',
    emoji: '📝',
  },
  controls: {
    label: '6. Button & form wording',
    description: 'Advanced: rename ticket buttons and question labels.',
    emoji: '🔧',
  },
};
export const fields: Record<string, { label: string; description: string; max?: number }> = {
  brandName: {
    label: 'Brand / server name',
    description: 'Shown on ticket messages and transcript headings.',
    max: 80,
  },
  accentColor: {
    label: 'Accent color',
    description: 'Enter a hex color, for example #FF6B24 (orange) or #5865F2 (blue).',
    max: 7,
  },
  cooldownSeconds: {
    label: 'Click cooldown (seconds)',
    description: 'Wait between ticket actions: a whole number from 1 to 60.',
    max: 2,
  },
  supportRoleId: {
    label: 'Support team role',
    description: 'Who can see and manage Support tickets. Choose a non-admin staff role.',
  },
  managementRoleId: {
    label: 'Management team role',
    description: 'Who can see and manage Management tickets. Use a non-admin role.',
  },
  ticketCategoryId: {
    label: 'Open tickets folder',
    description: 'Discord category where new ticket channels are created.',
  },
  archiveCategoryId: {
    label: 'Closed tickets folder',
    description: 'Discord category where closed tickets remain available for staff to reopen.',
  },
  transcriptLogChannelId: {
    label: 'Private transcript log',
    description: 'Staff-only text channel for transcripts. Hide it from @everyone.',
  },
  panelChannelId: {
    label: 'Public panel channel',
    description: 'Text channel where members choose Support or Management.',
  },
  contactBannerUrl: {
    label: 'Top banner image',
    description: 'Paste a public HTTPS image URL. Leave empty to remove the banner.',
    max: 500,
  },
  footerImageUrl: {
    label: 'Bottom footer image',
    description: 'Paste a public HTTPS image URL. Leave empty to remove the footer.',
    max: 500,
  },
  'copy.contactTitle': {
    label: 'Panel title',
    description: 'The heading above the ticket dropdown, for example Contact Us.',
    max: 80,
  },
  'copy.contactIntro': {
    label: 'Panel instructions',
    description: 'Tell members when to choose Support and when to choose Management.',
    max: 800,
  },
  'copy.chooseCategory': {
    label: 'Ticket dropdown prompt',
    description: 'Text shown before someone chooses a ticket type.',
    max: 80,
  },
  'copy.welcome': {
    label: 'Ticket welcome message',
    description: 'The first instructions shown inside each new ticket.',
    max: 500,
  },
  'copy.privacy': {
    label: 'Ticket privacy note',
    description: 'Explain staff access and transcript storage to members.',
    max: 500,
  },
};
const buttons: Record<string, string> = {
  claim: 'Claim ticket',
  unclaim: 'Release claim',
  close: 'Close ticket',
  add: 'Add member',
  remove: 'Remove member',
  rename: 'Rename ticket',
  escalate: 'Send to Management',
  move: 'Move ticket',
  priority: 'Set priority',
  reopen: 'Reopen closed ticket',
  delete: 'Delete archived channel',
  transcript: 'Download transcript',
  subject: 'Subject question',
  description: 'Description question',
};
for (const [key, label] of Object.entries(buttons))
  fields['copy.' + key] = {
    label,
    description:
      'Change the displayed wording for “' + label + '”. This does not change permissions.',
    max: 80,
  };
export function fieldInfo(key: string) {
  return fields[key] ?? { label: key, description: 'Choose a value for this setting.' };
}
