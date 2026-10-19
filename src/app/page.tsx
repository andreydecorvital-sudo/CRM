import { redirect } from "next/navigation"

export default function Home(){
  // One product entry point. The old marketing/mock dashboard is no longer the CRM home.
  redirect("/inbox")
}
