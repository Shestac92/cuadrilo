const AVATAR_COLORS = ['blue', 'teal', 'grape', 'orange', 'cyan', 'pink', 'indigo', 'lime'];

/** A student as a circle: a colour that is always the same for that login. */
export function avatarStyle(login: string) {
  let hash = 0;
  for (const char of login) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return {
    background: `var(--mantine-color-${color}-light)`,
    color: `var(--mantine-color-${color}-light-color)`,
  };
}

/** The first two letters of the login. */
export const avatarInitials = (login: string) => {
  const letters = [...login.trim()].slice(0, 2).join('');
  return letters.charAt(0).toLocaleUpperCase() + letters.slice(1);
};
