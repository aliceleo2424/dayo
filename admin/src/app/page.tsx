import { redirect } from "next/navigation";

const SITE_HOME = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dayotalk.com/";

export default function Home() {
  redirect(SITE_HOME);
}
