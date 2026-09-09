import { redirect } from "next/navigation";

// /admin lands on the Harga tab (the first UDMC-5 admin tab).
export default function AdminIndexPage() {
  redirect("/admin/harga");
}
