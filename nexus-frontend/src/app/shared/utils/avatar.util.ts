const PALETTE = ['blue', 'indigo', 'pink', 'amber', 'violet', 'teal'] as const;

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) + hash + value.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function getAvatarColor(name: string): (typeof PALETTE)[number] {
  return PALETTE[hashString(name) % PALETTE.length];
}
