import { redirect } from "next/navigation";
import { pageUser } from "@/lib/pageGuard";

/** Addendum 5.1: juri tidak memiliki layar daftar tim. */
export default async function JuriContestPage() {
  await pageUser("nilai.kirim");
  redirect("/juri");
}
