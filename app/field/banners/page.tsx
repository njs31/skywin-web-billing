import { fieldBannersPage } from "@/lib/actions/field";
import { BannerDesk } from "./banner-desk";

export const dynamic = "force-dynamic";

/** Carousel banners on the app's Products page and category pages (admins and managers). */
export default async function FieldBannersPage() {
  const data = await fieldBannersPage();
  return <BannerDesk canEdit={data.canEdit} banners={data.banners} categories={data.categories} />;
}
