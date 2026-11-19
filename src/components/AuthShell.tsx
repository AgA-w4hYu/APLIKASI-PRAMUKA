import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { navFor } from "@/lib/nav";
import type { SessionUser } from "@/lib/auth";
import { getTheme } from "@/lib/theme";
import { themeCss } from "@/lib/themeTokens";

export function AuthShell({
  user,
  active,
  children,
  teamName,
}: {
  user: SessionUser;
  active: string;
  children: ReactNode;
  teamName?: string | null;
}) {
  return (
    <Shell
      nav={navFor(user)}
      active={active}
      roleName={user.roleName}
      userName={user.name}
      theme={themeCss(getTheme(user.role))}
      teamName={teamName}
    >
      {children}
    </Shell>
  );
}
