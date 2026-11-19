import { AuthShell } from "@/components/AuthShell";
import { ThemeEditor } from "@/components/ThemeEditor";
import { PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { getAllThemes } from "@/lib/theme";

export default async function ThemePage() {
  const user = await pageUser("tema.ubah");
  const themes = getAllThemes();

  return (
    <AuthShell user={user} active="/admin/tema">
      <PageHeader
        eyebrow="Tampilan"
        title="Tema warna per role"
        description="Palet Rustic Earthy: 60% Birch Tree, 30% warna role, 10% aksen Cabin Logs atau Evergreen."
      />
      <ThemeEditor themes={themes} />
    </AuthShell>
  );
}
