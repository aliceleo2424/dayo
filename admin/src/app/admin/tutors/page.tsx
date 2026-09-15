import { redirect } from "next/navigation";

/** Legacy route — permanently unified under /admin/partners */
export default function TutorsRedirectPage() {
  redirect("/admin/partners");
}
